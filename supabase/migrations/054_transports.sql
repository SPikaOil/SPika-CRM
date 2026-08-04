-- 054: the order is leading, the transport number is the transport
--
-- Replaces the export module's shadow record. Until now an "export" was a
-- second copy of an order — its own customer, currency, items, quantities and
-- THT, typed in again next to the order that already held them. That is why a
-- EUR customer could be stamped XCG, why a destination came from the carrier's
-- route instead of the customer, and why nothing linked the two.
--
-- The rule, stated by Danique 2026-08-03:
--   "een export is een order en een order kan een export zijn"
--
-- So there is no export record. There is a TRANSPORT, identified by a transport
-- number, and orders hang on it. A transport can carry several orders — not
-- always, but it can. Everything about the journey — carrier, where it is
-- going, ETD, ETA and what the freight cost — belongs to the transport, because
-- three orders in one container leave on the same boat and the freight is paid
-- once.
--
-- Her word is "transport", never "shipment"/"zending". The tables are named
-- accordingly so the database reads the way she talks about it.
--
-- Nothing here touches orders themselves: an export order is created exactly
-- like any other order and only afterwards appears under Export.
--
-- The old `exports` and `export_documents` tables are deliberately left in
-- place, empty. Dropping them is a separate step once the new flow has been
-- used for real.

begin;

-- ── Where a transport can be delivered ───────────────────────────────────────
-- A transport goes to the customer, or to one of our own warehouse locations.
-- Those locations are a real list with a real address, because the address is
-- what ends up on the shipping label.
create table if not exists public.transport_locations (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  street     text not null default '',
  zip        text not null default '',
  city       text not null default '',
  country    text not null default '',
  created_at timestamptz not null default now()
);

comment on table public.transport_locations is
  'Our own warehouse / drop addresses. Picked instead of the customer address when a transport does not go straight to the customer.';

-- ── Transports ───────────────────────────────────────────────────────────────
do $$ begin
  create type transport_status as enum ('draft', 'ready', 'submitted', 'cleared', 'delivered');
exception when duplicate_object then null;
end $$;

create table if not exists public.transports (
  id               uuid primary key default gen_random_uuid(),
  -- YEARMONTH + counter, e.g. 20260701 for the first transport of July 2026.
  transport_number text unique not null,
  carrier_id       uuid references public.carriers(id),
  -- 'customer' = the customer's own delivery address;
  -- 'warehouse' = the transport_locations row named below.
  ship_to          text not null default 'customer'
                     check (ship_to in ('customer', 'warehouse')),
  location_id      uuid references public.transport_locations(id),
  destination      text not null default '',
  etd              date,
  eta              date,
  -- Weighed as one load, so it is filled in on the transport, not per order.
  total_weight_kg  numeric,
  freight_cost     numeric,
  other_costs      numeric,
  notes            text not null default '',
  status           transport_status not null default 'draft',
  created_by       uuid references public.users(id),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

comment on column public.transports.transport_number is
  'YYYYMM + counter, e.g. 20260701. Assigned on creation; a transport can carry several orders.';
comment on column public.transports.etd is 'Estimated departure. Filled in by hand, may be left empty.';
comment on column public.transports.eta is 'Estimated arrival. Filled in by hand, may be left empty.';
comment on column public.transports.total_weight_kg is
  'Total gross weight of the whole transport in kg, entered by hand.';
comment on column public.transports.freight_cost is
  'Freight for the whole transport. Null means not filled in, which is not the same as 0.';
comment on column public.transports.other_costs is
  'Any further cost for the whole transport. Null means not filled in, which is not the same as 0.';

-- A warehouse transport must say WHICH warehouse; a customer transport must not
-- name one. Enforced here so a half-filled transport cannot reach a label.
alter table public.transports drop constraint if exists transports_location_matches_ship_to;
alter table public.transports add constraint transports_location_matches_ship_to
  check (
    (ship_to = 'warehouse' and location_id is not null)
    or (ship_to = 'customer' and location_id is null)
  );

-- ── Orders hang on a transport ───────────────────────────────────────────────
alter table public.orders
  add column if not exists transport_id uuid references public.transports(id) on delete set null;

-- Colli is per ORDER, and a colli is not just a count: it is a package with
-- contents. One entry per package, in packing order, each holding the items and
-- quantities inside it:
--   [{"items":[{"sku":"...","name":"...","qty":3}],"weight_kg":12.5}, {"items":[]}]
-- The number of colli is therefore the length of the array — one source of
-- truth, so a count can never disagree with the packing detail. The transport's
-- total colli is the sum across its orders, and that is what goes in the QR
-- code on the shipping label (e.g. 20260701-3colli).
alter table public.orders
  add column if not exists colli_contents jsonb not null default '[]'::jsonb;

create index if not exists orders_transport_id_idx on public.orders (transport_id);

comment on column public.orders.transport_id is
  'The transport this order travels in. Null = not on a transport number yet.';
comment on column public.orders.colli_contents is
  'One entry per package: [{"items":[{"sku","name","qty"}],"weight_kg":12.5}]. Array length = number of colli. Empty array = not packed yet.';

-- ── Documents received back for a transport ──────────────────────────────────
-- Stamped bills of lading, customs releases and so on. Replaces
-- export_documents, which hung on the export record that no longer exists.
-- file_url holds the STORAGE PATH, never a public URL: these are customs papers
-- and are served through a short-lived signed URL.
create table if not exists public.transport_documents (
  id            uuid primary key default gen_random_uuid(),
  transport_id  uuid not null references public.transports(id) on delete cascade,
  document_type text not null default 'received_doc',
  file_url      text not null,
  file_name     text not null,
  uploaded_at   timestamptz not null default now()
);

create index if not exists transport_documents_transport_id_idx
  on public.transport_documents (transport_id);

-- ── Transport number: YYYYMM + counter, per month ────────────────────────────
-- Done in the database, not the browser, so two people creating a transport in
-- the same minute cannot land on the same number.
create or replace function public.next_transport_number(on_date date default current_date)
returns text language sql stable as $$
  select to_char(on_date, 'YYYYMM') ||
         lpad((
           coalesce(max(substring(t.transport_number from 7)::int), 0) + 1
         )::text, 2, '0')
  from public.transports t
  where t.transport_number like to_char(on_date, 'YYYYMM') || '%'
    and substring(t.transport_number from 7) ~ '^[0-9]+$';
$$;

-- ── Row-Level Security ───────────────────────────────────────────────────────
-- Staff only, same perimeter as orders (migration 050). Nothing under
-- src/app/portal touches transports, so this cannot break a portal page.
alter table public.transports          enable row level security;
alter table public.transport_locations enable row level security;
alter table public.transport_documents enable row level security;

drop policy if exists "transports: staff only"          on public.transports;
drop policy if exists "transport_locations: staff only" on public.transport_locations;
drop policy if exists "transport_documents: staff only" on public.transport_documents;

create policy "transport_documents: staff only"
  on public.transport_documents for all
  to authenticated
  using (public.is_staff())
  with check (public.is_staff());

create policy "transports: staff only"
  on public.transports for all
  to authenticated
  using (public.is_staff())
  with check (public.is_staff());

create policy "transport_locations: staff only"
  on public.transport_locations for all
  to authenticated
  using (public.is_staff())
  with check (public.is_staff());

-- ── Carriers become manageable from Settings ─────────────────────────────────
-- Migration 002 gave carriers a read policy and nothing else, so the app could
-- never add or change one — the only three that exist were inserted by 002
-- itself. Admins manage them under Settings now; everyone else reads.
-- B/L, not BOL. "BOL" is US road-freight shorthand; in shipping the document is
-- abbreviated B/L, and the template this column picks prints "BILL OF LADING"
-- as its title. Migration 002 named it wrong and it stayed wrong for a year.
-- Migration 002 itself is left untouched — it is history, not a place to edit.
do $$ begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'carriers' and column_name = 'bol_template'
  ) then
    alter table public.carriers rename column bol_template to bl_template;
  end if;
end $$;

drop policy if exists "carriers_read"          on public.carriers;
drop policy if exists "carriers: staff read"   on public.carriers;
drop policy if exists "carriers: admin manage" on public.carriers;

create policy "carriers: staff read"
  on public.carriers for select
  to authenticated
  using (true);

create policy "carriers: admin manage"
  on public.carriers for all
  to authenticated
  using (public.current_user_role()::text = 'admin')
  with check (public.current_user_role()::text = 'admin');

-- ── Clear out the old export records ─────────────────────────────────────────
-- All five were drafts on test customers, and two of them had no order at all,
-- which is exactly what the new rule forbids. Danique: "allemaal weggooien".
delete from public.export_documents;
delete from public.exports;

commit;
