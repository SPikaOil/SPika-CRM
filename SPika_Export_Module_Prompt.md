# SPika CRM — Export Module Implementation Prompt

## Context & Background

You are working on the **SPika CRM** — a production CRM for SPika Hot Sauce (Mils Inc.), built with:
- **Next.js 16** (App Router) + TypeScript + Tailwind CSS + shadcn/ui
- **Supabase** (PostgreSQL + Auth + Storage)
- **TanStack Query** (React Query) for all data fetching
- **@react-pdf/renderer** for PDF generation (already used for quotations, delivery notes, OB forms)
- **react-hook-form + zod** for forms

Existing modules: Dashboard, Customers, Quotations, Delivery Notes, Orders, Tasks, Agenda, Team, Settings.

The company ships hot sauce internationally from **Curaçao** to destinations including **Bonaire** and the **Netherlands**. Before every export, SPika must prepare a document package and physically drop it off at customs. Customs then takes over from there. The CRM needs to generate that document package automatically.

---

## What to Build: Export Module

### The Real-World Workflow

1. An order is ready to ship internationally
2. SPika creates an Export record in the CRM (linked to an existing order)
3. The CRM auto-fills and generates a **pre-customs document package** containing 3 PDFs:
   - **Commercial Invoice** — official record of the shipment (value, contents, sender, receiver)
   - **Packing List** — physical breakdown (boxes, contents, weights)
   - **Carrier Bill of Lading** — carrier-specific transport document (e.g. Don Andres N.V. for Bonaire route)
4. SPika prints the package, drops goods + paperwork at customs
5. Customs processes everything and returns official documents
6. SPika uploads received documents to the export record
7. Export is marked as delivered when confirmed

---

## Step 1: Database Migration

Create `supabase/migrations/002_export_module.sql`:

```sql
-- Carriers lookup table
CREATE TABLE public.carriers (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text NOT NULL,
  route       text NOT NULL,        -- e.g. "Curaçao → Bonaire"
  bol_template text NOT NULL,       -- e.g. "don_andres" | "generic"
  contact     text,
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- Seed carriers
INSERT INTO public.carriers (name, route, bol_template, contact) VALUES
  ('Don Andres N.V.', 'Curaçao → Bonaire', 'don_andres', '+599 717-8764'),
  ('DHL Express',     'Curaçao → Netherlands', 'generic',    NULL),
  ('Other / Manual',  'Custom route',         'generic',    NULL);

-- Main exports table
CREATE TABLE public.exports (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id            uuid REFERENCES public.orders(id) ON DELETE SET NULL,
  export_number       text UNIQUE NOT NULL,   -- e.g. EXP-2026-001
  destination_country text NOT NULL,          -- e.g. "Bonaire", "Netherlands"
  carrier_id          uuid REFERENCES public.carriers(id) ON DELETE SET NULL,
  export_date         date NOT NULL DEFAULT CURRENT_DATE,
  status              text NOT NULL DEFAULT 'draft'
                        CHECK (status IN ('draft','ready','submitted','cleared','delivered')),
  notes               text,
  created_by          uuid REFERENCES public.users(id) ON DELETE SET NULL,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

-- Documents received back from customs / broker
CREATE TABLE public.export_documents (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  export_id     uuid NOT NULL REFERENCES public.exports(id) ON DELETE CASCADE,
  document_type text NOT NULL CHECK (document_type IN (
    'customs_clearance',
    'health_certificate',
    'certificate_of_origin',
    'eur1',
    'import_declaration',
    'other'
  )),
  label         text,           -- custom label for 'other' type
  file_url      text NOT NULL,  -- Supabase Storage URL
  received_date date NOT NULL DEFAULT CURRENT_DATE,
  notes         text,
  uploaded_by   uuid REFERENCES public.users(id) ON DELETE SET NULL,
  created_at    timestamptz NOT NULL DEFAULT now()
);

-- Add CRIB number to customers table
ALTER TABLE public.customers
  ADD COLUMN IF NOT EXISTS crib_number text;

-- Add company CRIB to settings (if a settings/config table exists, add it there;
-- otherwise add to a new company_settings table or handle in app settings UI)

-- RLS Policies
ALTER TABLE public.carriers          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.exports           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.export_documents  ENABLE ROW LEVEL SECURITY;

-- Carriers: readable by all authenticated users
CREATE POLICY "carriers_read" ON public.carriers
  FOR SELECT TO authenticated USING (true);

-- Exports: admin full access, sales read-only
CREATE POLICY "exports_admin" ON public.exports
  FOR ALL TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'admin')
  );
CREATE POLICY "exports_sales_read" ON public.exports
  FOR SELECT TO authenticated
  USING (true);

-- Export documents: same pattern
CREATE POLICY "export_docs_admin" ON public.export_documents
  FOR ALL TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'admin')
  );
CREATE POLICY "export_docs_sales_read" ON public.export_documents
  FOR SELECT TO authenticated USING (true);

-- Updated_at trigger for exports
CREATE OR REPLACE FUNCTION update_exports_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;
CREATE TRIGGER exports_updated_at
  BEFORE UPDATE ON public.exports
  FOR EACH ROW EXECUTE FUNCTION update_exports_updated_at();
```

---

## Step 2: TypeScript Types

Add to `src/types/index.ts`:

```typescript
export type ExportStatus = 'draft' | 'ready' | 'submitted' | 'cleared' | 'delivered'

export type ExportDocumentType =
  | 'customs_clearance'
  | 'health_certificate'
  | 'certificate_of_origin'
  | 'eur1'
  | 'import_declaration'
  | 'other'

export interface Carrier {
  id: string
  name: string
  route: string
  bol_template: 'don_andres' | 'generic'
  contact: string | null
  created_at: string
}

export interface Export {
  id: string
  order_id: string | null
  export_number: string
  destination_country: string
  carrier_id: string | null
  export_date: string
  status: ExportStatus
  notes: string | null
  created_by: string | null
  created_at: string
  updated_at: string
  order?: Order
  carrier?: Carrier
  documents?: ExportDocument[]
  created_by_user?: User
}

export interface ExportDocument {
  id: string
  export_id: string
  document_type: ExportDocumentType
  label: string | null
  file_url: string
  received_date: string
  notes: string | null
  uploaded_by: string | null
  created_at: string
  uploaded_by_user?: User
}
```

Also add `crib_number?: string` to the existing `Customer` interface.

---

## Step 3: Data Hook

Create `src/hooks/use-exports.ts` following the exact same pattern as `use-orders.ts` and `use-customers.ts`. It should:

- `useExports()` — fetch all exports with joined `order`, `carrier`, `documents`
- `useExport(id)` — fetch single export with all joins
- `useCarriers()` — fetch all carriers
- `useCreateExport(data)` — insert new export, auto-generate export_number as `EXP-{YEAR}-{padded sequential number}`
- `useUpdateExportStatus(id, status)` — update status field
- `useDeleteExport(id)` — delete export
- `useUploadExportDocument(exportId, file, documentType, label?, notes?)` — upload file to Supabase Storage bucket `export-documents/{exportId}/{filename}`, then insert row in export_documents
- `useDeleteExportDocument(id)` — delete document record + storage file

---

## Step 4: Export PDF Components

Create three PDF components under `src/components/pdf/exports/`:

### 4a. `commercial-invoice-pdf.tsx`

A professional A4 commercial invoice. Use the exact same styling pattern as `quotation-pdf.tsx` (same RED #CC0000, same fonts, same SPika banner header).

**Fields to populate:**
- Header: SPika banner + "COMMERCIAL INVOICE" title
- Shipper (From): Mils Inc. / SPika Oil, Kaya Gilberto F. Croes 4, Willemstad, Curaçao, hello@spikaoil.nl, CRIB: [from settings]
- Consignee (To): customer.company_name, customer.contact_person, customer.delivery_address (full), customer.crib_number if set
- Invoice details meta row: Invoice #, Date, Order #, Destination Country
- Items table: product name, SKU, qty, unit price (XCG), line total (XCG) — pulled from order.items
- Totals: Subtotal, Total
- Footer note: "This commercial invoice is issued for customs purposes."

### 4b. `packing-list-pdf.tsx`

A4 document with same header/styling.

**Fields:**
- Shipper + Consignee (same as commercial invoice)
- Export # and Date meta
- Shipment summary table:
  - Each order item as a row: Product Name, SKU, Qty (units), Boxes/Cartons (qty ÷ 12, rounded up — SPika bottles come in 12-packs), Weight per box (use 5kg as default)
  - Total cartons, Total weight
- Notes field
- Footer: "Packing list for customs purposes only."

### 4c. `don-andres-bol-pdf.tsx`

Recreate the Don Andres N.V. Bill of Lading form as a fillable-style PDF. Match the layout of the physical form closely. This is a carrier form, so styling should be clean/functional — no SPika branding needed.

**Sections:**

**Header:**
- "Don Andres N.V." (large bold)
- "BILL OF LADING CURAÇAO–BONAIRE" (bold, centered, underlined)

**Sender section:**
- DATUM / TIJD ONTVANGST: [export_date] / _____ (time left blank for manual fill)
- ONTVANGEN VAN: Mils Inc. / SPika Oil
- ID #: [leave blank — personal ID, filled manually] / TEL: +5999 738-7538
- ADDRES: Kaya Gilberto F. Croes 4, Willemstad, Curaçao
- CRIB NUMMER: [company CRIB from settings] — printed in red

**Receiver section:**
- BESTEMD VOOR: [customer.company_name + customer.contact_person]
- TEL / ADDRES: [customer.phone] / [customer.delivery_address formatted]
- CRIB NUMMER: [customer.crib_number if available, otherwise blank line] — printed in red

**Cargo section:**
- AANTAL COLLI/KRTN: [total carton count from order]
- INHOUD COLLI/KRTN: [product names joined, e.g. "SPika Hot Sauce - Assorted"]

**Signature section:**
- NAAM WERKNEMER DON ANDRES NV: _____________ (blank line)
- HANDTEKENING DON ANDRES NV: _____________ (blank line)

**BONAIRE delivery confirmation section** (bottom, with "BONAIRE" header underlined):
- NAAM WERKNEMER DON ANDRES N.V.: _____________
- DATUM ONTVANGST: _____________
- HANDTEKENING KLANT VOOR ONTVANGST: _____________

**Conditions (small text, red for the first bullet):**
- "Goederen die niet goed verpakt zijn en/of breekbare materialen worden verscheept op eigen risico van de verscheper."
- "In geval van schade moet deze aangemeld worden bij ontvangst, na ontvangst wordt geen schade meer geaccepteerd."

**Footer contact info (small):**
- Kaya Industria # 14 – Tel.: (599) 717-8764/717-6990 – Fax: (599) 717-8082 – Caribisch Nederland – Kralendijk, Bonaire
- Groot Davelaar Kavel 137 – Tel.: (599-9) 738-7538/736-5311 – Fax: (599-9) 737-2766 – Willemstad, Curaçao

---

## Step 5: Pages

### 5a. `/exports` — List page (`src/app/(app)/exports/page.tsx`)

Admin-only page. Layout consistent with `/orders/page.tsx`.

- Page header: "Exports" title + "New Export" button (admin only)
- Status filter tabs: All / Draft / Ready / Submitted / Cleared / Delivered
- Table columns: Export #, Destination, Carrier, Order #, Export Date, Status badge, Actions
- Status badge colors: draft=gray, ready=blue, submitted=amber, cleared=green, delivered=emerald
- Row click → navigates to `/exports/[id]`
- Empty state with a box/package icon and "No exports yet" message

### 5b. `/exports/new` — New export form (`src/app/(app)/exports/new/page.tsx`)

Form fields:
- **Order** (select from orders with status `paid` or `invoice_ready` — these are ready to ship). Show order number + customer name.
- **Destination Country** (text input, pre-fills from order's customer delivery_address.country if available)
- **Carrier** (select from carriers table — shows name + route)
- **Export Date** (date picker, defaults to today)
- **Notes** (textarea, optional)

On submit → creates export record → redirects to `/exports/[id]`

### 5c. `/exports/[id]` — Export detail page (`src/app/(app)/exports/[id]/page.tsx`)

Three-section layout:

**Section 1 — Export header card:**
- Export number, status badge, destination, export date
- Linked order number (clickable link to `/orders/[id]`)
- Linked customer name
- Carrier name + route
- Status update dropdown (admin only): move through draft → ready → submitted → cleared → delivered
- Notes

**Section 2 — Document Package (Generate & Download):**
Card with title "Pre-Customs Document Package". Three document rows:
1. Commercial Invoice — "Generate PDF" button
2. Packing List — "Generate PDF" button
3. Bill of Lading ([carrier name]) — "Generate PDF" button

Each "Generate PDF" button uses the same `download-pdf.ts` pattern already in the codebase to trigger the @react-pdf/renderer download.

Also add a **"Download All (ZIP)"** button that generates all three PDFs and packages them as a ZIP using `jszip`. Install jszip if not present.

**Section 3 — Received Documents (from customs):**
Card with title "Documents Received from Customs". Upload area:
- Document type selector (enum dropdown)
- Label field (shown only when type = "other")
- File upload (PDF only, max 10MB)
- Optional notes
- "Upload Document" button

Below the upload form: a list of all uploaded documents showing type, received date, notes, and a download link. Admins can delete documents.

---

## Step 6: Navigation Updates

### `src/components/layout/sidebar.tsx`
Add to `allNavItems` array (after Orders, before Tasks), admin-only:
```typescript
{ href: '/exports', label: 'Exports', icon: PackageCheck, adminOnly: true },
```
Import `PackageCheck` from lucide-react.

### `src/components/layout/bottom-nav.tsx`
Add `{ href: '/exports', label: 'Exports', icon: PackageCheck }` to `adminMoreItems` array.

---

## Step 7: Settings Update

In `src/app/(app)/settings/page.tsx`, add a **"Company Export Settings"** section with:
- **SPika CRIB Number** — text input, stored in a `company_settings` table (or localStorage as fallback if the table doesn't exist yet). This CRIB number is used in all generated PDFs as the sender's CRIB.

---

## Step 8: Customer Form Update

In `src/app/(app)/customers/_components/customer-form.tsx`, add a **CRIB Number** field:
- Label: "CRIB Number"
- Input: text, optional
- Hint: "Required for export Bill of Lading documents"
- Place it near the VAT number and COC number fields

---

## Step 9: Orders Page — "Create Export" Shortcut

On `/orders/[id]/page.tsx`, for orders with status `paid` or `invoice_ready`, add a button in the action area:
- **"Create Export"** button → navigates to `/exports/new?orderId=[id]`
- On the new export form, if `orderId` is present as a query param, pre-select that order and lock the field (show it as read-only)

---

## Important Implementation Notes

1. **PDF generation** — follow the exact same pattern as `download-pdf.ts` and existing PDF components. Use `@react-pdf/renderer` consistently. Do NOT use jsPDF or any other library.

2. **File storage** — use Supabase Storage bucket `export-documents`. Create this bucket if it doesn't exist. Path: `export-documents/{export_id}/{document_type}_{timestamp}.pdf`

3. **Export number generation** — query the max existing export number for the current year and increment. Format: `EXP-2026-001`, `EXP-2026-002`, etc.

4. **Company CRIB** — SPika's CRIB number is not hardcoded. It should be configurable in Settings so the client can enter it once.

5. **Carton calculation** — SPika bottles ship in 12-packs. For the packing list and Don Andres BoL, calculate cartons as `Math.ceil(totalQty / 12)`. Use 5kg per carton as the default weight estimate.

6. **Currency** — all monetary values use XCG (Antillean guilder), consistent with the rest of the CRM.

7. **Don Andres BoL** — this is only generated when carrier.bol_template === 'don_andres'. For other carriers, generate a generic Bill of Lading template instead.

8. **Existing patterns to follow** — study `use-orders.ts` for the data hook pattern, `quotation-pdf.tsx` for PDF styling, and `orders/[id]/page.tsx` for the detail page layout. Stay fully consistent with the existing codebase style.
