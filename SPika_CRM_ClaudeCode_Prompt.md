# Claude Code Prompt — SPika CRM (Production Build)

> Paste everything below this line into Claude Code as the initial project instruction. It is structured so Claude Code can execute it sequentially, commit per milestone, and verify each module before moving on.

---

## 1. Role & Mission

You are a senior full-stack engineer. Build **SPika CRM**, a production-ready web application for **SPika**, a hot sauce company. The app manages sales, orders, deliveries, Proof-of-Delivery (POD), table-bottle control, and invoice readiness. It is used by the owner and two sales/delivery interns — the same people who sell AND deliver AND check table bottles.

Build this as a **real deployable app**, not a demo. No mock data in production paths. No placeholder screens. Every module must be functional end-to-end before moving to the next one.

Language of the entire app (UI, code comments, commit messages, docs): **English**.

---

## 2. Tech Stack (non-negotiable)

- **Frontend:** Next.js 14 (App Router) + TypeScript + Tailwind CSS + shadcn/ui
- **Backend / DB / Auth / Storage / Realtime:** Supabase (PostgreSQL)
- **State/Data:** Supabase JS client + TanStack Query (React Query) for caching
- **Forms:** react-hook-form + zod validation
- **PDF generation:** @react-pdf/renderer (quotes + packing slips)
- **Maps / GPS:** browser Geolocation API (no third-party map provider required for v1)
- **Deployment target:** Vercel (frontend) + Supabase (backend)
- **PWA:** installable, offline-capable for the delivery flow (service worker + IndexedDB queue for POD uploads when offline)
- **Design:** mobile-first, responsive up to desktop, dark mode toggle, clean modern UI

---

## 3. Users & Roles

| Role | Count | Permissions |
|---|---|---|
| **Owner / Admin** | 1 | Full access: settings, pricing, customer rules, orders, POD review, QuickBooks prep, user management |
| **Sales / Delivery Member** | 2 | Leads, edit customers, create quotes (from templates only, no custom pricing), process orders, upload POD, add customer notes. **No access** to settings, pricing rules, or QuickBooks prep. |

Auth: Supabase Auth with email/password + magic links. Enforce roles via **Row Level Security (RLS)** in Postgres — not just in the UI.

---

## 4. Database Schema

Create these tables exactly. Add `updated_at` with triggers where missing. All IDs are `uuid` (`gen_random_uuid()`). All timestamps are `timestamptz`.

### 4.1 `users`
`id`, `email (unique)`, `role (enum: admin | sales)`, `name`, `phone`, `created_at`

### 4.2 `customers`
`id`, `company_name`, `customer_category (enum: wholesale | horeca | dtf | other)`, `contact_person`, `phone`, `whatsapp`, `email`, `billing_address (jsonb)`, `delivery_address (jsonb)`, `delivery_days (text[])` (Mon–Sun), `delivery_time_window (text)` e.g. `"09:00-17:00"`, `ob_form_required (bool)`, `packing_slip_required (bool)`, `discount_agreement (text)`, `track_table_bottles (bool)`, `preferred_communication (enum: whatsapp | email | phone)`, `language (text default 'English')`, `internal_notes (text)`, `quickbooks_customer_id (text)`, `status (enum: active | inactive)`, `created_at`, `updated_at`

### 4.3 `leads`
`id`, `customer_id (fk)`, `stage (enum: new | contacted | quoted | won | lost)`, `category (enum: wholesale | horeca | dtf)`, `assigned_to (fk users)`, `notes`, `created_at`, `updated_at`

### 4.4 `quotes`
`id`, `lead_id (fk nullable)`, `customer_id (fk)`, `quote_number (unique, auto-generated: Q-YYYY-####)`, `items (jsonb: array of {sku, name, qty, unit_price, line_total})`, `subtotal`, `tax`, `total`, `status (enum: draft | sent | accepted | declined | expired)`, `template_used (text)`, `valid_until (date)`, `created_by (fk users)`, `created_at`, `updated_at`

### 4.5 `orders`
`id`, `quote_id (fk nullable)`, `customer_id (fk)`, `order_number (unique, auto: O-YYYY-####)`, `items (jsonb)`, `total`, `assigned_to (fk users)`, `status (enum: processing | out_for_delivery | delivered | invoice_ready | invoice_blocked)`, `delivery_notes`, `created_at`, `updated_at`

### 4.6 `deliveries`
`id`, `order_id (fk unique)`, `delivery_started_at`, `gps_location (jsonb: {lat, lng, accuracy})`, `table_bottles_returned (int)`, `table_bottles_notes (text)`, `pod_type (enum: signature | photo)`, `pod_file_url (text)`, `delivered_at`, `notes`, `created_at`

### 4.7 Views / functions (helpers)
- `v_dashboard_kpis` — materialized or regular view powering the dashboard
- Trigger: when `deliveries.pod_file_url IS NOT NULL` AND `deliveries.delivered_at IS NOT NULL`, auto-update `orders.status = 'invoice_ready'`
- Function: `generate_quote_number()` and `generate_order_number()` using a sequence per year

### 4.8 RLS policies (mandatory)
- Everyone authenticated can read their own `users` row
- `admin` can do everything
- `sales` can: read all customers/leads/quotes/orders; create/update leads, quotes (only from templates), customer notes, deliveries/POD; **cannot** modify pricing rules, templates, or `users`
- Storage bucket `pod-files`: only authenticated users can upload; only admin + the sales user who uploaded can read

---

## 5. Modules & Screens (build in this order)

### 5.1 `/dashboard` — realtime KPIs
Cards + charts, subscribed via Supabase Realtime. Show:
- Leads by stage (New, Contacted, Quoted, Won, Lost)
- Quotes sent this week
- Orders in processing
- Orders out for delivery
- Deliveries completed today
- Deliveries **missing POD** (highlight red)
- Invoice-ready orders
- Invoice-blocked orders
- Sales by category (Wholesale / HORECA / DTF) — bar chart
- Sales by team member — bar chart

### 5.2 `/customers`
List with search + category filter. Detail card shows every field from schema 4.2 plus order/quote history. "New customer" form with zod validation.

### 5.3 `/leads`
Kanban-style view per stage + list view toggle. Filters by category + assigned user. Stage changes via drag or dropdown. Converting a `won` lead offers "Create quote".

### 5.4 `/quotes`
List + quote builder. Template selector (Wholesale / HORECA / DTF). Sales members can only pick items + quantities from the template catalog; prices come from the template. Admin can override. PDF preview + print + email to customer. Status tracking.

### 5.5 `/orders`
List with status filter. Order detail with items, assigned delivery person, status timeline, and a large **"Start Delivery"** button that deep-links to `/delivery/[orderId]` on mobile.

### 5.6 `/delivery/[orderId]` — **mobile-first delivery card**
This is the most critical screen. One flow for everyone, no variations.

1. **Start Delivery** button → captures GPS (lat/lng/accuracy) + timestamp, sets order status to `out_for_delivery`.
2. **Table bottles check** (only if `customer.track_table_bottles = true`): number returned + optional notes.
3. **POD capture** — choose one, not both:
   - **Signature** — canvas signature pad, saved as PNG to Supabase storage
   - **Photo** — native camera via `<input type="file" accept="image/*" capture="environment">`
4. **Delivery Complete** → writes `delivered_at`, `pod_file_url`, triggers order status to `invoice_ready`.
5. Must work **offline**: queue the POD + metadata in IndexedDB and sync when connection returns.

### 5.7 `/settings` (admin only)
- Customer rules (default delivery windows, default flags)
- Quote templates CRUD (Wholesale / HORECA / DTF) with item catalog + pricing
- User management (invite, role assignment, deactivate)
- QuickBooks prep: export invoice-ready orders as CSV mapped to QuickBooks customer IDs

---

## 6. Business Rules (enforce in DB + UI)

1. POD is **mandatory** for every delivery. No exceptions, no override.
2. Order → `invoice_ready` **only if** `deliveries.delivered_at IS NOT NULL` AND `deliveries.pod_file_url IS NOT NULL`.
3. Sales members cannot modify quote pricing outside templates (enforce via RLS + UI).
4. Sales members have zero access to `/settings` and QuickBooks prep.
5. Every delivery automatically logs GPS + timestamp — no manual entry.
6. Table-bottle returns are a separate field on `deliveries`, not mixed into notes.
7. Only one POD type per delivery (signature XOR photo).

---

## 7. UI/UX Requirements

- Mobile-first: the delivery flow must be thumb-operable with one hand.
- iPad/iPhone/Android tablets all supported.
- Dark mode toggle persisted per user.
- Toast notifications for every mutation (success/error).
- Empty states and loading skeletons everywhere — no blank screens.
- Every destructive action requires confirmation.
- Forms: inline validation, disable submit while pending, show server errors clearly.

---

## 8. Execution Plan (follow this order, commit after each step)

1. **Bootstrap:** `npx create-next-app@latest` (TS, App Router, Tailwind, src dir). Install shadcn/ui, Supabase JS, TanStack Query, react-hook-form, zod, @react-pdf/renderer. Configure ESLint + Prettier.
2. **Supabase project:** create schema from section 4 as a SQL migration file under `supabase/migrations/`. Add seed data for templates + one admin user.
3. **Auth:** email/password + magic link, middleware-protected routes, session handling, role claim loaded into a React context.
4. **Layout shell:** responsive sidebar (desktop) / bottom nav (mobile), dark mode toggle, user menu.
5. **Customers module** — build first, everything depends on it.
6. **Leads module** (Kanban + list).
7. **Quote templates + quote builder + PDF export.**
8. **Orders module + status timeline.**
9. **Delivery flow** — including offline queue + GPS + POD upload.
10. **Dashboard with realtime subscriptions.**
11. **Settings (admin)** — templates, users, QuickBooks CSV export.
12. **RLS hardening** — write tests that try to break permissions with the sales role.
13. **PWA config** — manifest, service worker, install prompt.
14. **Deployment:** Vercel config, env var docs, Supabase migration commands, README with setup steps.

**After every step:** run the app, verify the feature works on mobile viewport (375×812 minimum), commit with a conventional message (`feat(customers): …`), and continue.

---

## 9. Out of Scope for v1 (mention in README as roadmap)

- Phase 2: QuickBooks Online API sync (v1 is CSV export only)
- Phase 3: WhatsApp Business API automation
- Phase 4: Inventory + product catalog management

---

## 10. Deliverables (what "done" looks like)

1. Git repo with clean commit history, `main` branch deployable as-is.
2. `supabase/migrations/` folder with full schema + RLS policies.
3. All seven modules functional end-to-end on both mobile and desktop.
4. Working auth with roles enforced in DB.
5. Realtime dashboard.
6. Mobile POD flow working online **and** offline.
7. PDF export for quotes and packing slips.
8. `README.md` with: setup, env vars (`.env.example`), migration commands, deploy steps for Vercel + Supabase, known limitations, roadmap.
9. Basic test coverage: Playwright smoke test for login → create customer → create quote → create order → deliver → invoice-ready.

---

## 11. How to start

1. Confirm you have: a new empty folder, Node 20+, Supabase CLI, a Supabase project (URL + anon key + service role key).
2. Ask me for the env vars if they are not provided.
3. Execute step 1 of the Execution Plan, show me the commit, then proceed to step 2.

**Begin now with step 1.** Do not skip ahead. Do not generate all files at once. Build it like a real engineer: one module, verified, committed, next.
