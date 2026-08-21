-- 109: which warehouses may serve a customer.
--
-- Her decision, 2026-08-21. First she asked for an area per warehouse, then
-- turned it round herself: "beter denk ik is om optie in klantinfo te hebben om
-- meerdere warehouses te kunnen kiezen voor een klant, dan zou je ENKEL als
-- Admin of Manager een order aanmaken en kunnen kiezen vanuit welke warehouse
-- deze order zal gaan... In settings is niet handig om dit te doen, makkelijker
-- via klantinfo linken aan een warehouse en dan is automatisch die gelinkte ook
-- het levergebied van desbetreffende warehouse."
--
-- So there is no area table and no country matching. A warehouse's area IS the
-- customers ticked to it, which means it can never drift out of step with
-- reality: you set it where you already are when the fact changes.
--
-- Several per customer on purpose. La Bandera is served from NBC010 today and
-- could be shipped straight from Curacao tomorrow; ticking both means the order
-- decides, not a change to the customer.
--
-- Curacao is location_id NULL here, as it is everywhere else in this app. It is
-- a warehouse like any other: Canarbo on Bonaire is an export customer with no
-- warehouse in between, so it is simply ticked to Curacao.

begin;

create table if not exists public.customer_warehouses (
  id          uuid primary key default gen_random_uuid(),
  created_at  timestamptz not null default now(),

  customer_id uuid not null references public.customers(id) on delete cascade,
  -- NULL = Curaçao.
  location_id uuid references public.transport_locations(id) on delete cascade,

  created_by  uuid references public.users(id) on delete set null
);

comment on table public.customer_warehouses is
  'Which warehouses may serve this customer. location_id NULL = Curacao. The customers ticked to a warehouse ARE its delivery area.';

-- Two partial indexes rather than one key over both columns: Postgres does not
-- consider two NULLs equal, so without the second one a customer could be
-- ticked to Curacao any number of times. Same shape as warehouse_members (093).
create unique index if not exists customer_warehouses_unique
  on public.customer_warehouses (customer_id, location_id)
  where location_id is not null;

create unique index if not exists customer_warehouses_unique_home
  on public.customer_warehouses (customer_id)
  where location_id is null;

create index if not exists customer_warehouses_location_idx
  on public.customer_warehouses (location_id);

alter table public.customer_warehouses enable row level security;

-- Everyone on the team may READ it: the order screen has to know which
-- warehouses to offer, and the warehouse tab has to know which customers are
-- its own. Admin, manager and anyone who may edit a customer may change it —
-- it is set on the customer card, so it follows the same right as the rest of
-- that card.
select public.reset_policies('customer_warehouses');
create policy "customer warehouses: read" on public.customer_warehouses for select
  using (public.is_team());
create policy "customer warehouses: write" on public.customer_warehouses for all
  using (public.has_perm('customers.edit') or public.is_staff())
  with check (public.has_perm('customers.edit') or public.is_staff());

-- ── Where every existing customer is served from ─────────────────────────────
--
-- By rule, not by name. Curacao and Bonaire are served straight off the island
-- (Canarbo is an export customer with no warehouse in between, her words), and
-- a customer with no country at all is local — the same reading isExportCustomer
-- has used since 2026-08-15. Dutch customers are served from the warehouse that
-- stands in the Netherlands.
--
-- A customer that can be served from BOTH is one tick away on the customer card,
-- which is exactly the flexibility this table is for.
insert into public.customer_warehouses (customer_id, location_id)
select c.id, null
from public.customers c
where coalesce(c.billing_address->>'country', '') !~* '^(netherlands|the netherlands|nederland|holland)$'
on conflict do nothing;

insert into public.customer_warehouses (customer_id, location_id)
select c.id, l.id
from public.customers c
join public.transport_locations l
  on l.country ~* '^(netherlands|the netherlands|nederland|holland)$'
where c.billing_address->>'country' ~* '^(netherlands|the netherlands|nederland|holland)$'
on conflict do nothing;

commit;
