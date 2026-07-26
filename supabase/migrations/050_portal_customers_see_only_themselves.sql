-- 050: a portal customer is an outsider, not a colleague
--
-- SECURITY FIX. Migration 045 tightened the read policies during the bot
-- incident, but only by excluding the 'prospect' role — its own comment says
-- "admin/sales/staff/customer keep exactly the access they have today". That
-- deliberately left the customer role inside the staff perimeter, so any portal
-- login could read the entire customer base (51 columns: agreed prices,
-- discounts, internal notes, tax numbers) and update any order.
--
-- Portal users authenticate with a real Supabase session, so RLS was the only
-- boundary between one customer and the next — and it wasn't one.
--
-- Two roles, two rules:
--   staff (admin/manager/sales) see and change everything;
--   a customer sees and changes only rows belonging to their own company.
--
-- Verified before writing this: every portal query is already scoped with
-- .eq('customer_id', profile.customer_id) or .eq('id', profile.customer_id), so
-- narrowing the policy cannot break a page. Two portal writes do need to keep
-- working and are allowed for by name: cancelling an order (a direct update on
-- their own order row) and signing the OB form (a direct update on their own
-- customer row).
--
-- Roles are compared as text on purpose. The live enum has never had 'manager'
-- or 'staff' (see migration 045); casting to text keeps this working either way.
--
-- Policy names carry the command they cover — "customers: read …", "customers:
-- update …" — because a policy name must be unique per TABLE, not per command.
-- Naming the select and update policy alike fails with 42710.
--
-- Wrapped in a transaction so a mistake leaves the old policies in place rather
-- than half a perimeter. Both the old and the new names are dropped first, so
-- this can be re-run safely after a failed attempt.

begin;

create or replace function public.is_staff()
returns boolean language sql security definer stable as $$
  select coalesce(public.current_user_role()::text, 'prospect')
         in ('admin', 'manager', 'sales', 'staff');
$$;

-- Null for staff and for a pending account. Every comparison below is therefore
-- false for them, which is what keeps a prospect out without a second check.
create or replace function public.current_user_customer_id()
returns uuid language sql security definer stable as $$
  select customer_id from public.users where id = auth.uid();
$$;

-- ── customers ───────────────────────────────────────────────────────────────
drop policy if exists "customers: authenticated read" on public.customers;
drop policy if exists "customers: staff all, customer own row" on public.customers;
drop policy if exists "customers: read staff or own" on public.customers;
create policy "customers: read staff or own"
  on public.customers for select
  using (public.is_staff() or id = public.current_user_customer_id());

drop policy if exists "customers: authenticated insert" on public.customers;
drop policy if exists "customers: staff insert" on public.customers;
drop policy if exists "customers: insert staff only" on public.customers;
create policy "customers: insert staff only"
  on public.customers for insert
  with check (public.is_staff());

-- A customer updates their own row when they sign the OB form.
drop policy if exists "customers: authenticated update" on public.customers;
drop policy if exists "customers: update staff or own" on public.customers;
create policy "customers: update staff or own"
  on public.customers for update
  using (public.is_staff() or id = public.current_user_customer_id());

-- ── orders ──────────────────────────────────────────────────────────────────
drop policy if exists "orders: authenticated read" on public.orders;
drop policy if exists "orders: staff all, customer own orders" on public.orders;
drop policy if exists "orders: read staff or own" on public.orders;
create policy "orders: read staff or own"
  on public.orders for select
  using (public.is_staff() or customer_id = public.current_user_customer_id());

-- Portal order requests are inserted straight from the browser. Scoping the
-- check is what stops a customer filing an order in someone else's name.
drop policy if exists "orders: authenticated insert" on public.orders;
drop policy if exists "orders: insert staff or own" on public.orders;
create policy "orders: insert staff or own"
  on public.orders for insert
  with check (public.is_staff() or customer_id = public.current_user_customer_id());

-- A customer cancels their own order from the portal (status -> invoice_blocked).
drop policy if exists "orders: authenticated update" on public.orders;
drop policy if exists "orders: update staff or own" on public.orders;
create policy "orders: update staff or own"
  on public.orders for update
  using (public.is_staff() or customer_id = public.current_user_customer_id());

-- ── staff-only tables ───────────────────────────────────────────────────────
-- The portal never reads these; leaving them open to a customer gave away the
-- pipeline, every delivery signature and every quote.
drop policy if exists "quotes: authenticated read" on public.quotes;
drop policy if exists "quotes: staff read" on public.quotes;
drop policy if exists "quotes: read staff" on public.quotes;
create policy "quotes: read staff"
  on public.quotes for select
  using (public.is_staff());

drop policy if exists "leads: authenticated read" on public.leads;
drop policy if exists "leads: staff read" on public.leads;
drop policy if exists "leads: read staff" on public.leads;
create policy "leads: read staff"
  on public.leads for select
  using (public.is_staff());

drop policy if exists "deliveries: authenticated read" on public.deliveries;
drop policy if exists "deliveries: staff read" on public.deliveries;
drop policy if exists "deliveries: read staff" on public.deliveries;
create policy "deliveries: read staff"
  on public.deliveries for select
  using (public.is_staff());

drop policy if exists "deliveries: authenticated insert" on public.deliveries;
drop policy if exists "deliveries: staff insert" on public.deliveries;
drop policy if exists "deliveries: insert staff" on public.deliveries;
create policy "deliveries: insert staff"
  on public.deliveries for insert
  with check (public.is_staff());

drop policy if exists "deliveries: authenticated update" on public.deliveries;
drop policy if exists "deliveries: staff update" on public.deliveries;
drop policy if exists "deliveries: update staff" on public.deliveries;
create policy "deliveries: update staff"
  on public.deliveries for update
  using (public.is_staff());

commit;
