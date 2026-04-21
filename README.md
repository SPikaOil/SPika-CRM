# SPika CRM

Production CRM for **SPika Hot Sauce** — managing sales leads, quotes, orders, deliveries, Proof-of-Delivery (POD), and invoice readiness.

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | Next.js 16 (App Router) + TypeScript + Tailwind CSS + shadcn/ui |
| Backend / DB / Auth | Supabase (PostgreSQL + Auth + Storage + Realtime) |
| Data fetching | TanStack Query (React Query) |
| Forms | react-hook-form + zod |
| Offline queue | IndexedDB via `idb` |
| Deployment | Vercel (frontend) + Supabase (backend) |

## Setup

### Prerequisites

- Node.js 20+
- A Supabase project ([supabase.com](https://supabase.com))
- Vercel account for deployment

### 1. Install dependencies

```bash
cd spika-crm
npm install
```

### 2. Environment variables

Copy `.env.example` to `.env.local` and fill in your values:

```bash
cp .env.example .env.local
```

```env
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
```

### 3. Apply the database migration

Open your Supabase project dashboard → **SQL Editor** → paste the full contents of `supabase/migrations/001_initial_schema.sql` and click **Run**.

Or with the Supabase CLI:

```bash
npx supabase login          # requires a Personal Access Token from app.supabase.com/account/tokens
npx supabase link --project-ref YOUR_PROJECT_REF
npx supabase db push
```

### 4. Create your first admin user

In the Supabase dashboard → **Authentication** → **Users** → **Invite user**.

After sign-up, set the role to `admin` via SQL Editor:

```sql
UPDATE public.users SET role = 'admin' WHERE email = 'your@email.com';
```

### 5. Run locally

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Deploying to Vercel

1. Push the repo to GitHub
2. Import the project in [Vercel](https://vercel.com)
3. Add the three environment variables in the Vercel project settings
4. Deploy — Vercel detects Next.js automatically

## User Roles

| Role | Permissions |
|---|---|
| `admin` | Full access: settings, pricing, user management, QuickBooks export |
| `sales` | Customers, leads, quotes (template-only pricing), orders, deliveries/POD |

Roles are enforced via Row Level Security in the database — not just in the UI.

## Modules

| Route | Description |
|---|---|
| `/dashboard` | Realtime KPI cards — leads pipeline, orders, deliveries, POD alerts |
| `/customers` | Customer list with search/filter, detail view, edit form |
| `/leads` | Kanban pipeline (New → Contacted → Quoted → Won → Lost) + list view |
| `/quotes` | Quote builder from templates, status tracking |
| `/orders` | Order list with status filter, detail + timeline |
| `/delivery/[orderId]` | Mobile delivery flow: GPS → table bottles → POD → complete |
| `/settings` | Admin-only: templates, user invites, QuickBooks CSV export |

## Delivery Flow (offline-capable)

1. **Start Delivery** — captures GPS coordinates + timestamp, sets order to `out_for_delivery`
2. **Table Bottles** (optional, per customer setting) — record returned bottles
3. **POD** — choose Signature (canvas pad) or Photo (native camera)
4. **Complete** — uploads POD to Supabase Storage, auto-marks order as `invoice_ready`

When offline, the POD is saved to IndexedDB and synced automatically when connectivity returns.

## Roadmap (v1 out of scope)

- **Phase 2:** QuickBooks Online API sync (v1 is CSV export only)
- **Phase 3:** WhatsApp Business API automation
- **Phase 4:** Inventory + product catalog management

## Known Limitations

- Kanban stage changes are via dropdown (no drag-and-drop in v1)
- QuickBooks export is CSV only — no direct API integration in v1
- PDF quote export route is available but the preview/download UI page is a roadmap item
