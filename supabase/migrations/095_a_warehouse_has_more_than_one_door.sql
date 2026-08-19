-- 095: a warehouse has one physical address and several delivery addresses.
--
-- Her instruction of 2026-08-19: because of DPD and the other carriers, part of
-- a load is dropped somewhere else and the warehouse person collects it there.
-- That drop-off is not the warehouse, it is not a customer, and it changes per
-- transport — so it is its own row, hung off the warehouse it belongs to.
--
-- What goes where:
--
--   transport_locations           the warehouse: display name + ONE physical address
--   warehouse_delivery_addresses  the doors it actually receives at, several per warehouse
--   transports.delivery_address_id  which door THIS load goes to; null = the warehouse itself
--
-- On the packing list only the DELIVERY address is printed — her answer, 2026-08-19,
-- "alleen delivery adress op pakbon". Not the warehouse name and not the label
-- below: `label` exists so a human can pick "DPD Rotterdam" out of a list inside
-- the app, and it must never reach a document. The comment on the column says so
-- and the packing list does not read it.
--
-- Attn. matters most exactly here, because the drop-off is usually not the
-- warehouse: the address carries a default, and the transport may overwrite it
-- (transports.receiver_contact, migration 094).

begin;

create table if not exists public.warehouse_delivery_addresses (
  id uuid primary key default gen_random_uuid(),
  location_id uuid not null references public.transport_locations(id) on delete cascade,
  -- IN-APP ONLY. Never printed on a document. Her instruction, 2026-08-19.
  label text not null default '',
  street text not null default '',
  zip text not null default '',
  city text not null default '',
  country text not null default '',
  -- The person expected at this door. A transport may name someone else.
  receiver_contact text not null default '',
  created_at timestamptz not null default now()
);

comment on table public.warehouse_delivery_addresses is
  'Where a warehouse actually receives goods. One warehouse has one physical address and can have several of these, because carriers like DPD drop part of a load elsewhere and the warehouse collects it there.';
comment on column public.warehouse_delivery_addresses.label is
  'IN-APP ONLY — a name to recognise this address by when picking it, e.g. "DPD Rotterdam". NEVER printed on a packing list or any other document. Her instruction, 2026-08-19.';
comment on column public.warehouse_delivery_addresses.receiver_contact is
  'Default Attn. for this address. transports.receiver_contact overrides it for one load.';

create index if not exists warehouse_delivery_addresses_location_idx
  on public.warehouse_delivery_addresses(location_id);

alter table public.transports
  add column if not exists delivery_address_id uuid
    references public.warehouse_delivery_addresses(id) on delete set null;

comment on column public.transports.delivery_address_id is
  'Which door of the warehouse this load is delivered to. Null = the warehouse''s own physical address. Only this address is printed on the packing list.';

-- Rights.
--
--   read   everyone on the team, plus anyone holding warehouse.view
--   write  settings.view only — today the admin, and whoever she ticks
--
-- Deliberately tighter than transport_locations, which since 077 lets anyone
-- with warehouse.view rewrite a warehouse address. These are the addresses a
-- customs document is printed from; a warehouse member reads the door they
-- collect from, they do not get to invent one. settings.view is the write gate
-- because that is the pattern 077 already uses for everything kept in Settings
-- — there is no settings.edit, checked against lib/permissions.ts before
-- writing this.
alter table public.warehouse_delivery_addresses enable row level security;

select public.reset_policies('warehouse_delivery_addresses');

create policy "warehouse delivery addresses: read"
  on public.warehouse_delivery_addresses for select
  using (public.has_perm('warehouse.view') or public.is_team());

create policy "warehouse delivery addresses: insert"
  on public.warehouse_delivery_addresses for insert
  with check (public.has_perm('settings.view'));

create policy "warehouse delivery addresses: update"
  on public.warehouse_delivery_addresses for update
  using (public.has_perm('settings.view'))
  with check (public.has_perm('settings.view'));

create policy "warehouse delivery addresses: delete"
  on public.warehouse_delivery_addresses for delete
  using (public.has_perm('settings.view'));

commit;
