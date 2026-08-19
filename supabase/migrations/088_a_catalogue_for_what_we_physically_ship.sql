-- 088: a catalogue for the POS material we ship, and a register per reseller.
--
-- NOT RUN YET.
--
-- Her decision, 2026-08-16: "POS is idd iets wat wij fysiek aanleveren, de rest
-- met links naar drive zijn zaken die men kan downloaden voor gebruik."
--
-- That sentence is the whole design. A marketing asset is a FILE somebody
-- downloads; a POS item is a THING we put in a box. They meet when a wobbler
-- has a print file, and then one points at the other — but neither can stand in
-- for the other.
--
-- Which is why the catalogue is its own table and not a category of assets. She
-- spotted it first: marketing_assets.file_ref is NOT NULL and the form refuses
-- anything that is not a valid Drive link, so a bottle rack with no artwork
-- cannot be an asset at all. Putting the racks in there would have meant six
-- invented Drive links — "dan loopt de app scheef", exactly.
--
-- POS is the umbrella term, checked rather than assumed: displays, shelf
-- talkers, wobblers, posters, danglers, price strips. A stand is one kind of
-- display, not a separate world. Hence one catalogue with a kind on each row.
--
-- ── What moves ────────────────────────────────────────────────────────────
--
-- customers.spika_stands holds real data, measured before writing this:
--
--   14 of 26 customers, 21 rows, 28 racks
--   10× 8-bottle, 9× 12-bottle, 7× 4-bottle, 2× 24-bottle
--
-- All of it moves into the register below. The column STAYS — same treatment as
-- customers.is_international: keep it, stop reading it, mark it deprecated. A
-- migration that also deletes its own source leaves nothing to check against.
--
-- Bottle capacity is deliberately not carried over. Her words: the name of the
-- stand already says it.

begin;

-- ── The catalogue: what we have to give out ───────────────────────────────

create table if not exists public.pos_items (
  id           uuid primary key default gen_random_uuid(),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),

  name         text not null,
  kind         text not null default 'display'
               check (kind in ('display', 'shelf_talker', 'wobbler', 'poster', 'dangler', 'other')),
  -- Stable, so a €0 order line keeps the same sku when the name is reworded.
  -- posOrderLine() derived it from a title until now, which meant renaming an
  -- item silently produced a different sku on the next order.
  sku          text unique,
  -- The print file, when there is one. A rack has none; a wobbler does.
  asset_id     uuid references public.marketing_assets(id) on delete set null,
  -- Off when the print run is out. A count would be better and belongs here,
  -- not on the customer or the order — but she has not asked for stock and this
  -- is not the migration to invent it in.
  is_available boolean not null default true,
  notes        text not null default '',
  sort_order   integer not null default 0
);

comment on table public.pos_items is
  'Physical point-of-sale material we ship: displays, shelf talkers, wobblers, posters. A file to download is a marketing_asset, not one of these.';

alter table public.pos_items enable row level security;

-- ── The register: what a given reseller has or is getting ─────────────────

create table if not exists public.customer_pos_items (
  id           uuid primary key default gen_random_uuid(),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),

  customer_id  uuid not null references public.customers(id) on delete cascade,
  pos_item_id  uuid not null references public.pos_items(id) on delete cascade,
  qty          integer not null default 1 check (qty > 0),
  -- When it went out. Null for the rows carried over from spika_stands, which
  -- never recorded a date.
  since        date,
  notes        text not null default '',

  unique (customer_id, pos_item_id)
);

comment on table public.customer_pos_items is
  'What this reseller has standing in their shop. Feeds the picker on an order and on a delivery run.';

create index if not exists customer_pos_items_customer_idx on public.customer_pos_items (customer_id);

alter table public.customer_pos_items enable row level security;

-- ── Seed: the six stands ──────────────────────────────────────────────────
-- All six, including 10-double and 16-double which no customer has today. Her
-- decision: they exist, they have simply not gone out yet.

insert into public.pos_items (sku, name, kind, sort_order) values
  ('stand-4-single',  'SPika stand — 4 bottles (one side)',        'display', 10),
  ('stand-8-single',  'SPika stand — 8 bottles (one side)',        'display', 20),
  ('stand-10-double', 'SPika stand — 10 bottles (two sides)',      'display', 30),
  ('stand-12-single', 'SPika stand — 12 bottles (one side)',       'display', 40),
  ('stand-16-double', 'SPika stand — 16 bottles (two sides)',      'display', 50),
  ('stand-24-single', 'SPika stand — 24 bottles (one side)',       'display', 60)
on conflict (sku) do nothing;

-- ── Carry the 28 racks across ─────────────────────────────────────────────

insert into public.customer_pos_items (customer_id, pos_item_id, qty, notes)
select c.id,
       p.id,
       greatest(coalesce((s ->> 'qty')::int, 1), 1),
       'Carried over from SPika Stands'
from public.customers c
cross join lateral jsonb_array_elements(coalesce(c.spika_stands, '[]'::jsonb)) as s
join public.pos_items p on p.sku = 'stand-' || (s ->> 'type')
on conflict (customer_id, pos_item_id) do update
  set qty = excluded.qty, updated_at = now();

comment on column public.customers.spika_stands is
  'DEPRECATED since 088. Read customer_pos_items instead. Kept so the carry-over stays checkable and nothing that still reads it breaks.';

-- ── Who may do what ───────────────────────────────────────────────────────
--
-- The catalogue is marketing material, so it follows marketing.manage — the
-- same right that governs the screen it lives on.
--
-- The register is part of the customer record, so it follows customers.edit,
-- and a reseller may read their own: the portal shows them what they have.

select public.reset_policies('pos_items');
create policy "pos items: read" on public.pos_items for select
  using (auth.uid() is not null);
create policy "pos items: insert" on public.pos_items for insert
  with check (public.can_manage_marketing());
create policy "pos items: update" on public.pos_items for update
  using (public.can_manage_marketing());
create policy "pos items: delete" on public.pos_items for delete
  using (public.can_manage_marketing());

select public.reset_policies('customer_pos_items');
create policy "customer pos: read" on public.customer_pos_items for select
  using (public.is_staff() or customer_id = public.current_user_customer_id());
create policy "customer pos: insert" on public.customer_pos_items for insert
  with check (public.has_perm('customers.edit'));
create policy "customer pos: update" on public.customer_pos_items for update
  using (public.has_perm('customers.edit'));
create policy "customer pos: delete" on public.customer_pos_items for delete
  using (public.has_perm('customers.edit'));

commit;
