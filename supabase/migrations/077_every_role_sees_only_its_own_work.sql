-- Row-level security driven by the PERMISSIONS SCREEN, not by hardcoded roles.
--
-- NOT RUN YET.
--
-- Measured on 2026-08-16 by signing in as each role and counting what came
-- back. The Permissions screen governed the SCREENS only; underneath, nearly
-- every table was open to any signed-in account:
--
--   role        tasks  price_presets  monthly_targets  customers  orders
--   sales         372            10                3         26      73
--   manager       372            10                3         26      73
--   warehouse     372            10                3          0       0
--   marketing     372            10                3          0       0
--   customer      372            10                3          1       7
--
-- A portal customer could read 372 internal tasks with customer names and notes
-- in them, and every price category — what other resellers pay. Warehouse and
-- marketing could too, and could create tasks, leads, quotes and sales
-- documents.
--
-- Cause: those tables carried a policy on "authenticated", and the tables that
-- DID check a role used public.is_staff(), which knows only admin, manager and
-- sales. Warehouse and marketing fall outside it, so for them the app fell back
-- to the permissive rules.
--
-- Her requirement, 2026-08-16: these must stay adjustable from the Permissions
-- screen. So the policies below ask public.has_perm(...) — which reads the same
-- role_permissions table that screen writes — instead of naming roles. Tick a
-- box there and the database follows immediately.
--
-- Server routes run on the service-role key and bypass all of this, so only
-- what the BROWSER reads matters. That was mapped per screen before writing.

begin;

-- ── Who may do what ───────────────────────────────────────────────────────

-- The bridge between the Permissions screen and the database.
-- Admin is always true and is not stored, exactly as the app treats it — so a
-- box unticked by accident can never lock the owner out of her own CRM.
create or replace function public.has_perm(perm text)
returns boolean language sql security definer stable as $$
  select coalesce(public.current_user_role()::text, '') = 'admin'
      or exists (
           select 1 from public.role_permissions rp
           where rp.role = coalesce(public.current_user_role()::text, '')
             and perm = any(rp.permissions)
         );
$$;

create or replace function public.role_is(roles text[])
returns boolean language sql security definer stable as $$
  select coalesce(public.current_user_role()::text, '') = any(roles);
$$;

-- Any internal role at all — for the few things every team member needs.
create or replace function public.is_team()
returns boolean language sql security definer stable as $$
  select public.role_is(array['admin', 'manager', 'sales', 'warehouse', 'marketing', 'staff']);
$$;

-- Rebuild a table's policies from scratch. Dropping by name is the only way to
-- be sure: some permissive rules were added by hand in the dashboard and exist
-- nowhere in this repo, so their names cannot be guessed.
create or replace function public.reset_policies(tbl text)
returns void language plpgsql as $$
declare pol record;
begin
  for pol in select policyname from pg_policies where schemaname = 'public' and tablename = tbl
  loop
    execute format('drop policy if exists %I on public.%I', pol.policyname, tbl);
  end loop;
  execute format('alter table public.%I enable row level security', tbl);
end $$;

-- ── The new switches, with her defaults ───────────────────────────────────
--
--   permission            manager  sales  warehouse  marketing
--   products.edit            .       .        .          .
--   storelocator.edit        x       .        .          .
--   carriers.edit            x       .        .          .
--   prices.edit              x       .        .          .
--   targets.view / edit      x       .        .          .
--   customers.edit           x       .        .          .
--   customernames.view       x       x        .          x
--
-- Admin is absent from the whole table on purpose: it always holds everything,
-- and it is the only role that may hand any of this out.
--
-- Adding, never replacing: whatever an admin already ticked on the Permissions
-- screen survives this migration. Rows are created if a role has none yet,
-- because a missing row reads as "no permissions at all".

insert into public.role_permissions (role, permissions) values
  ('manager', '{}'), ('sales', '{}'), ('warehouse', '{}'), ('marketing', '{}')
on conflict (role) do nothing;

update public.role_permissions
   set permissions = array(select distinct unnest(permissions || array[
         'storelocator.edit', 'carriers.edit', 'prices.edit',
         'customers.edit', 'targets.view', 'targets.edit', 'customernames.view'
       ])),
       updated_at = now()
 where role = 'manager';

update public.role_permissions
   set permissions = array(select distinct unnest(permissions || array['customernames.view'])),
       updated_at = now()
 where role = 'sales';

update public.role_permissions
   set permissions = array(select distinct unnest(permissions || array[
         'products.view', 'storelocator.view', 'customernames.view'
       ])),
       updated_at = now()
 where role = 'marketing';

-- ── Internal work ─────────────────────────────────────────────────────────

-- Tasks carry customer names and internal notes. Whoever the task is assigned
-- to keeps their own, whatever their role.
select public.reset_policies('tasks');
create policy "tasks: read"   on public.tasks for select using (public.has_perm('tasks.view') or assigned_to = auth.uid());
create policy "tasks: insert" on public.tasks for insert with check (public.has_perm('tasks.view'));
create policy "tasks: update" on public.tasks for update using (public.has_perm('tasks.view') or assigned_to = auth.uid());
create policy "tasks: delete" on public.tasks for delete using (public.has_perm('tasks.view'));

select public.reset_policies('leads');
create policy "leads: all" on public.leads for all
  using (public.has_perm('leads.view')) with check (public.has_perm('leads.view'));

select public.reset_policies('quotes');
create policy "quotes: all" on public.quotes for all
  using (public.has_perm('quotations.view')) with check (public.has_perm('quotations.view'));

-- Templates were admin-write since 001 and nobody asked to change that, so
-- write stays exactly where it was. Only the READ side narrows: it used to be
-- any signed-in account, portal customers included.
select public.reset_policies('quote_templates');
create policy "quote templates: read"  on public.quote_templates for select using (public.has_perm('quotations.view'));
create policy "quote templates: admin" on public.quote_templates for all
  using (public.role_is(array['admin'])) with check (public.role_is(array['admin']));

select public.reset_policies('sales_documents');
create policy "sales docs: all" on public.sales_documents for all
  using (public.has_perm('salesdocs.view')) with check (public.has_perm('salesdocs.view'));

select public.reset_policies('sales_document_folders');
create policy "sales folders: all" on public.sales_document_folders for all
  using (public.has_perm('salesdocs.view')) with check (public.has_perm('salesdocs.view'));

-- ── Customers: admin and manager change them, the rest of staff reads ─────
-- A customer keeps update on their OWN row: that is how the OB form gets
-- signed from the portal. Removing it breaks signing.
select public.reset_policies('customers');
create policy "customers: read staff or own" on public.customers for select
  using (public.is_staff() or id = public.current_user_customer_id());
create policy "customers: insert with permission" on public.customers for insert
  with check (public.has_perm('customers.edit'));
create policy "customers: update with permission or own" on public.customers for update
  using (public.has_perm('customers.edit') or id = public.current_user_customer_id());
create policy "customers: delete with permission" on public.customers for delete
  using (public.has_perm('customers.delete'));

-- Names only. Row-level security cannot hide a COLUMN, so this is a view over
-- the handful of fields that carry no commercial information.
-- Deliberately NOT security_invoker: the point is to reach past the rule above,
-- which keeps marketing out of the customers table. The check lives in here.
--
-- City and country are not columns — the address is one jsonb blob with the
-- keys street/city/state/zip/country, which is how report-snapshot.ts already
-- reads them. Pulled out here so the list stays flat and readable.
create or replace view public.customer_names as
  select
    id,
    company_name,
    customer_number,
    billing_address->>'city'    as city,
    billing_address->>'country' as country,
    is_lead,
    status
  from public.customers
  where public.has_perm('customernames.view');

comment on view public.customer_names is
  'Names only — no orders, no prices, no turnover. Read-only by construction.';

revoke all on public.customer_names from anon;
grant select on public.customer_names to authenticated;

-- ── Money: prices and targets ─────────────────────────────────────────────
-- Sales keeps READ on price presets — an order line needs a price. Changing
-- the price list is a different act.
select public.reset_policies('price_presets');
create policy "prices: read"   on public.price_presets for select using (public.is_staff());
create policy "prices: insert" on public.price_presets for insert with check (public.has_perm('prices.edit'));
create policy "prices: update" on public.price_presets for update using (public.has_perm('prices.edit'));
create policy "prices: delete" on public.price_presets for delete using (public.has_perm('prices.edit'));

select public.reset_policies('monthly_targets');
create policy "targets: read"   on public.monthly_targets for select using (public.has_perm('targets.view'));
create policy "targets: insert" on public.monthly_targets for insert with check (public.has_perm('targets.edit'));
create policy "targets: update" on public.monthly_targets for update using (public.has_perm('targets.edit'));
create policy "targets: delete" on public.monthly_targets for delete using (public.has_perm('targets.edit'));

select public.reset_policies('monthly_revenue_targets');
create policy "revenue targets: read"   on public.monthly_revenue_targets for select using (public.has_perm('targets.view'));
create policy "revenue targets: insert" on public.monthly_revenue_targets for insert with check (public.has_perm('targets.edit'));
create policy "revenue targets: update" on public.monthly_revenue_targets for update using (public.has_perm('targets.edit'));
create policy "revenue targets: delete" on public.monthly_revenue_targets for delete using (public.has_perm('targets.edit'));

-- ── Warehouse work ────────────────────────────────────────────────────────

select public.reset_policies('batches');
create policy "batches: all" on public.batches for all
  using (public.has_perm('warehouse.view') or public.is_staff())
  with check (public.has_perm('warehouse.receive') or public.is_staff());

-- batch_stock is a VIEW, not a table — it cannot carry policies of its own.
-- Worse, without security_invoker a view runs with ITS OWNER's rights and
-- ignores the policies on the tables underneath, so locking stock_movements
-- down while leaving this open would have changed nothing: the same numbers
-- were still readable straight through the view. This makes it obey whoever is
-- actually asking.
alter view public.batch_stock set (security_invoker = on);

select public.reset_policies('stock_movements');
create policy "stock moves: all" on public.stock_movements for all
  using (public.has_perm('warehouse.view') or public.is_staff())
  with check (public.has_perm('warehouse.receive') or public.is_staff());

select public.reset_policies('oil_stock');
create policy "oil stock: all" on public.oil_stock for all
  using (public.has_perm('stock.view') or public.is_staff())
  with check (public.has_perm('stock.view') or public.is_staff());

select public.reset_policies('handover_batches');
create policy "handover: all" on public.handover_batches for all
  using (public.has_perm('warehouse.view') or public.is_staff())
  with check (public.has_perm('warehouse.view') or public.is_staff());

select public.reset_policies('transports');
create policy "transports: all" on public.transports for all
  using (public.has_perm('warehouse.view') or public.is_staff())
  with check (public.has_perm('warehouse.view') or public.is_staff());

select public.reset_policies('transport_documents');
create policy "transport docs: all" on public.transport_documents for all
  using (public.has_perm('warehouse.view') or public.is_staff())
  with check (public.has_perm('warehouse.view') or public.is_staff());

select public.reset_policies('transport_locations');
create policy "transport locations: all" on public.transport_locations for all
  using (public.has_perm('warehouse.view') or public.is_staff())
  with check (public.has_perm('warehouse.view') or public.is_staff());

-- Carriers: warehouse and staff look them up, admin and manager change them.
select public.reset_policies('carriers');
create policy "carriers: read"   on public.carriers for select using (public.is_team());
create policy "carriers: insert" on public.carriers for insert with check (public.has_perm('carriers.edit'));
create policy "carriers: update" on public.carriers for update using (public.has_perm('carriers.edit'));
create policy "carriers: delete" on public.carriers for delete using (public.has_perm('carriers.edit'));

-- ── Reference data ────────────────────────────────────────────────────────

select public.reset_policies('store_locations');
create policy "stores: read"   on public.store_locations for select using (public.has_perm('storelocator.view'));
create policy "stores: insert" on public.store_locations for insert with check (public.has_perm('storelocator.edit'));
create policy "stores: update" on public.store_locations for update using (public.has_perm('storelocator.edit'));
create policy "stores: delete" on public.store_locations for delete using (public.has_perm('storelocator.edit'));

-- Products stay readable for everyone signed in: the portal catalogue needs
-- them and so does marketing. Prices live on price_presets, not here.
select public.reset_policies('products');
create policy "products: read"   on public.products for select using (auth.uid() is not null);
create policy "products: insert" on public.products for insert with check (public.has_perm('products.edit'));
create policy "products: update" on public.products for update using (public.has_perm('products.edit'));
create policy "products: delete" on public.products for delete using (public.has_perm('products.edit'));

-- ── Settings ──────────────────────────────────────────────────────────────

-- The portal invoice screen reads this for our address and tax ids. A customer
-- was getting zero rows, so their invoice view was missing our details — this
-- is as much a fix as a lock.
select public.reset_policies('company_settings');
create policy "company: everyone read" on public.company_settings for select using (auth.uid() is not null);
create policy "company: settings write" on public.company_settings for insert with check (public.has_perm('settings.view'));
create policy "company: settings edit"  on public.company_settings for update using (public.has_perm('settings.view'));

select public.reset_policies('app_settings');
create policy "app settings: team read" on public.app_settings for select using (public.is_team());
create policy "app settings: write" on public.app_settings for insert with check (public.has_perm('settings.view'));
create policy "app settings: edit"  on public.app_settings for update using (public.has_perm('settings.view'));

select public.reset_policies('email_templates');
create policy "email templates: all" on public.email_templates for all
  using (public.has_perm('settings.view')) with check (public.has_perm('settings.view'));

select public.reset_policies('fx_rates');
create policy "fx: team read" on public.fx_rates for select using (public.is_team());
create policy "fx: staff write" on public.fx_rates for insert with check (public.is_staff());
create policy "fx: staff edit"  on public.fx_rates for update using (public.is_staff());

-- Everyone signed in reads this one — the app loads it to decide what to
-- render, for every role including a portal customer. Only an admin may change
-- it, and that is NOT a permission: it is the thing permissions are made of.
select public.reset_policies('role_permissions');
create policy "permissions: everyone read" on public.role_permissions for select using (auth.uid() is not null);
create policy "permissions: admin write"  on public.role_permissions for insert with check (public.role_is(array['admin']));
create policy "permissions: admin edit"   on public.role_permissions for update using (public.role_is(array['admin']));
create policy "permissions: admin delete" on public.role_permissions for delete using (public.role_is(array['admin']));

-- ── The last way round ────────────────────────────────────────────────────
-- The dashboard counters are a view over leads, quotes, orders and deliveries,
-- and like batch_stock it was reading past the policies on those tables — a
-- portal customer could count our leads and our open orders. security_invoker
-- is the wrong fix here: it would drop the counters to zero for any team member
-- whose role does not hold leads.view, and nobody asked for the dashboard to
-- change. So the view keeps its own rights and simply returns nothing to
-- someone who is not on the team. Team members see exactly what they see today.
create or replace view public.v_dashboard_kpis as
select
  (select count(*) from public.leads where stage = 'new')        as leads_new,
  (select count(*) from public.leads where stage = 'contacted')  as leads_contacted,
  (select count(*) from public.leads where stage = 'quoted')     as leads_quoted,
  (select count(*) from public.leads where stage = 'won')        as leads_won,
  (select count(*) from public.leads where stage = 'lost')       as leads_lost,
  (select count(*) from public.quotes
   where status = 'sent'
     and created_at >= date_trunc('week', now()))                  as quotes_sent_this_week,
  (select count(*) from public.orders where status = 'processing')         as orders_processing,
  (select count(*) from public.orders where status = 'out_for_delivery')   as orders_out_for_delivery,
  (select count(*) from public.deliveries
   where delivered_at::date = current_date)                       as deliveries_today,
  (select count(*) from public.orders o
   left join public.deliveries d on d.order_id = o.id
   where o.status = 'delivered'
     and (d.pod_file_url is null or d.id is null))                as deliveries_missing_pod,
  (select count(*) from public.orders where status = 'invoice_ready')      as orders_invoice_ready,
  (select count(*) from public.orders where status = 'invoice_blocked')    as orders_invoice_blocked
where public.is_team();

revoke all on public.v_dashboard_kpis from anon;
grant select on public.v_dashboard_kpis to authenticated;

commit;
