-- 055: batches, VVP and stock that knows where it is
--
-- A BATCH is the thread through the whole business, stated by Danique
-- 2026-08-03: it starts at Stock when bottles are filled and allocated to it
-- (SPGE22, 500x 50ml), it is chosen on an order, it travels on a transport, it
-- is signed for by the customer or received into the warehouse, and afterwards
-- you can see which orders ran under it. One batch, one meaning, everywhere.
--
-- Not to be confused with a PRODUCTION run: that is only how many litres of oil
-- were made in a month, it has no number and it already lives in `oil_stock`.
--
-- Stock is kept as MOVEMENTS, not as a running total. Bottles are filled,
-- shipped, received, sold, handed over, broken and returned — and every one of
-- those has to be traceable back to a batch and a place, because that is what
-- makes a recall possible and a margin honest. A single quantity column would
-- have to be patched by every one of those flows and would drift on the first
-- mistake.
--
-- WHERE something is: location_id points at a warehouse in transport_locations.
-- NULL means Curaçao — home, where the bottles are filled. That convention is
-- used everywhere below.

-- Outside the transaction on purpose: PostgreSQL will not let a new enum value
-- be USED in the same transaction that adds it. Every policy below therefore
-- compares the role as text, never as the enum literal.
alter type user_role add value if not exists 'warehouse';

begin;

-- ── VVP per product ──────────────────────────────────────────────────────────
-- The cost price a bottle is carried at. Fixed for a period, changed by an
-- admin under Products, and the basis for the warehouse value and the margin.
alter table public.products add column if not exists vvp numeric(10,2);

comment on column public.products.vvp is
  'Cost price (verrekenprijs) per bottle. Admin-only. Null = not set yet, which is not the same as 0.';

-- Only an admin may touch the VVP. Enforced in the database, not just hidden in
-- the screen, because this number decides every margin figure in the app.
create or replace function public.guard_product_vvp()
returns trigger language plpgsql security definer as $$
begin
  if new.vvp is distinct from old.vvp
     and coalesce(public.current_user_role()::text, '') <> 'admin' then
    raise exception 'Only an admin may change the VVP';
  end if;
  return new;
end;
$$;

drop trigger if exists products_guard_vvp on public.products;
create trigger products_guard_vvp
  before update on public.products
  for each row execute function public.guard_product_vvp();

-- ── Batches ──────────────────────────────────────────────────────────────────
create table if not exists public.batches (
  id           uuid primary key default gen_random_uuid(),
  -- Entered by hand, e.g. 'SPGE22'. Unique so it can be referred to on paper.
  batch_number text not null unique,
  -- Bottled at the same moment, so the best-before is a property of the batch.
  -- Month + year only, like every other THT in this app — the day is pinned.
  tht_date     date,
  notes        text not null default '',
  created_by   uuid references public.users(id),
  created_at   timestamptz not null default now()
);

comment on table public.batches is
  'A batch of filled bottles. Created at Stock, chosen on an order, follows the goods to the warehouse or the customer.';

-- ── Orders are NOT tied to one batch ─────────────────────────────────────────
-- There is deliberately no orders.batch_id. An order can be picked from two
-- batches when one runs out mid-pick, and a single box can hold bottles from
-- both — Danique, 2026-08-14. A column on the order would force a lie.
--
-- The link already exists where it belongs: in stock_movements. Picking for an
-- order writes one row per batch, so "50x 100ml" can honestly read as 30 from
-- SPGE22 and 20 from SPGE23. Which batches an order carries is therefore a
-- question you ask the movements, and that is also where the documents read
-- their batch numbers from.

-- ── Handover comes out of a batch too ────────────────────────────────────────
-- Migration 040 gave handover_batches a free-text batch_number. It becomes a
-- real reference: no batch, no handover — you cannot hand out bottles that were
-- never filled. The old text column is left alone so existing rows keep their
-- history.
alter table public.handover_batches
  add column if not exists batch_id uuid references public.batches(id);

-- ── Stock movements ──────────────────────────────────────────────────────────
create table if not exists public.stock_movements (
  id           uuid primary key default gen_random_uuid(),
  batch_id     uuid not null references public.batches(id) on delete restrict,
  sku          text not null references public.products(sku),
  -- Positive puts bottles in, negative takes them out. Never zero.
  qty          integer not null check (qty <> 0),
  -- NULL = Curaçao. Anything else is a warehouse from transport_locations.
  location_id  uuid references public.transport_locations(id),
  reason       text not null check (reason in (
                 'filled',        -- bottled and allocated to the batch
                 'transport_out', -- left Curaçao on a transport
                 'received',      -- signed for at a warehouse
                 'order',         -- picked for a B2B order
                 'shopify',       -- weekly Shopify deduction
                 'handover',      -- given to a sales member
                 'return',        -- came back
                 'adjustment'     -- breakage, loss, correction
               )),
  order_id     uuid references public.orders(id) on delete set null,
  transport_id uuid references public.transports(id) on delete set null,
  note         text not null default '',
  created_by   uuid references public.users(id),
  created_at   timestamptz not null default now()
);

create index if not exists stock_movements_batch_idx    on public.stock_movements (batch_id);
create index if not exists stock_movements_location_idx on public.stock_movements (location_id);
create index if not exists stock_movements_sku_idx      on public.stock_movements (sku);

comment on table public.stock_movements is
  'Every bottle in and out, per batch and per place. Stock is the sum of these, never a stored total.';

-- What is where, right now. A view so no screen has to add it up itself.
create or replace view public.batch_stock as
  select
    m.batch_id,
    b.batch_number,
    b.tht_date,
    m.sku,
    p.name as product_name,
    m.location_id,
    sum(m.qty)::int as qty
  from public.stock_movements m
  join public.batches  b on b.id  = m.batch_id
  join public.products p on p.sku = m.sku
  group by m.batch_id, b.batch_number, b.tht_date, m.sku, p.name, m.location_id
  having sum(m.qty) <> 0;

comment on view public.batch_stock is
  'Current stock per batch, product and location. location_id NULL = Curaçao.';

-- ── Row-Level Security ───────────────────────────────────────────────────────
-- Staff and warehouse read; warehouse writes movements because that is their
-- job. Batches themselves are created at Stock by staff.
alter table public.batches         enable row level security;
alter table public.stock_movements enable row level security;

drop policy if exists "batches: staff read"           on public.batches;
drop policy if exists "batches: staff manage"         on public.batches;
drop policy if exists "stock_movements: read"         on public.stock_movements;
drop policy if exists "stock_movements: write"        on public.stock_movements;

create policy "batches: staff read"
  on public.batches for select
  to authenticated
  using (public.is_staff() or public.current_user_role()::text = 'warehouse');

create policy "batches: staff manage"
  on public.batches for all
  to authenticated
  using (public.is_staff())
  with check (public.is_staff());

create policy "stock_movements: read"
  on public.stock_movements for select
  to authenticated
  using (public.is_staff() or public.current_user_role()::text = 'warehouse');

create policy "stock_movements: write"
  on public.stock_movements for all
  to authenticated
  using (public.is_staff() or public.current_user_role()::text = 'warehouse')
  with check (public.is_staff() or public.current_user_role()::text = 'warehouse');

commit;
