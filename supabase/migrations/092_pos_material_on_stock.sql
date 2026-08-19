-- 092: POS material gets a stock of its own, per location.
--
-- NOT RUN YET.
--
-- Her requirement, 2026-08-16: "Ook de standjes moeten we bijhouden en inslaan
-- op locaties voor uitslag daarna naar klant."
--
-- Why not stock_movements. That table has two NOT NULL columns a stand cannot
-- satisfy:
--
--   batch_id  references batches(id)   — a rack has no production batch
--   sku       references products(sku) — a rack is not a product
--
-- Same shape then, own table. Plus in, minus out, location_id NULL meaning
-- Curaçao — identical to how bottles work, so nobody has to learn a second
-- mental model. The difference is the key: pos_item_id instead of sku+batch.
--
-- The reasons are the bottle list minus the ones that cannot happen to a
-- display (nothing is bottled, nothing goes out via Shopify) plus the one that
-- matters here: to_customer, which is a stand leaving for a reseller.
--
-- What this makes possible, end to end:
--
--   200 wobblers arrive from China at a warehouse   →  received
--   they sit there                                  →  pos_stock shows where
--   three travel to La Bandera                      →  to_customer
--   the reseller register goes up, the stock down
--
-- And pos_items.is_available stops being a hand-flipped switch and becomes a
-- number anyone can check. The flag stays: "we have them but do not offer them"
-- is a real state, and stock cannot express it.

begin;

create table if not exists public.pos_movements (
  id           uuid primary key default gen_random_uuid(),
  created_at   timestamptz not null default now(),

  pos_item_id  uuid not null references public.pos_items(id) on delete restrict,
  -- Positive puts material in, negative takes it out. Never zero, same rule as
  -- stock_movements: a movement of nothing is not a movement.
  qty          integer not null check (qty <> 0),
  -- NULL = Curaçao. Anything else is a warehouse from transport_locations —
  -- the same locations the bottles use, so a shipment carrying both lands in
  -- one place.
  location_id  uuid references public.transport_locations(id),

  reason       text not null check (reason in (
                 'received',      -- signed in at a location
                 'transport_out', -- left on a transport
                 'to_customer',   -- handed to a reseller
                 'return',        -- came back
                 'adjustment'     -- damaged, lost, miscounted
               )),

  -- What it belonged to, when it belonged to something.
  order_id     uuid references public.orders(id) on delete set null,
  transport_id uuid references public.transports(id) on delete set null,
  customer_id  uuid references public.customers(id) on delete set null,

  note         text not null default '',
  created_by   uuid references public.users(id)
);

comment on table public.pos_movements is
  'Every display, wobbler and shelf talker in and out, per location. Stock is the sum of these, never a stored total — same rule as stock_movements.';

create index if not exists pos_movements_item_idx     on public.pos_movements (pos_item_id);
create index if not exists pos_movements_location_idx on public.pos_movements (location_id);
create index if not exists pos_movements_customer_idx on public.pos_movements (customer_id);

alter table public.pos_movements enable row level security;

-- ── What is where, right now ──────────────────────────────────────────────
-- security_invoker on purpose. batch_stock in 055 was left without it and read
-- straight past every policy underneath until 077 caught it; this one obeys
-- whoever is asking from the start.
create or replace view public.pos_stock
with (security_invoker = on) as
  select
    m.pos_item_id,
    p.name        as item_name,
    p.kind        as item_kind,
    m.location_id,
    sum(m.qty)::int as qty
  from public.pos_movements m
  join public.pos_items p on p.id = m.pos_item_id
  group by m.pos_item_id, p.name, p.kind, m.location_id
  having sum(m.qty) <> 0;

comment on view public.pos_stock is
  'Current POS stock per item and location. location_id NULL = Curaçao.';

revoke all on public.pos_stock from anon;
grant select on public.pos_stock to authenticated;

-- ── Who may do what ───────────────────────────────────────────────────────
--
-- The same rights as the bottles, because it is the same act: whoever signs a
-- transport in signs the displays in with it, and whoever runs a delivery hands
-- one over. No new permission — a stand is not a different kind of work.

select public.reset_policies('pos_movements');
create policy "pos movements: read" on public.pos_movements for select
  using (public.has_perm('warehouse.view') or public.has_perm('stock.view') or public.is_staff());
create policy "pos movements: insert" on public.pos_movements for insert
  with check (public.has_perm('warehouse.receive') or public.has_perm('deliveries.own') or public.is_staff());
create policy "pos movements: update" on public.pos_movements for update
  using (public.has_perm('warehouse.receive') or public.is_staff());
create policy "pos movements: delete" on public.pos_movements for delete
  using (public.has_perm('warehouse.receive') or public.is_staff());

commit;
