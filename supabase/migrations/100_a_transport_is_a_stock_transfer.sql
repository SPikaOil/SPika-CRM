-- 100: a transport is a stock transfer, not an order
--
-- Danique, 2026-08-19, correcting the model this app was built on:
--   "orders zijn niet leidend... is voorraad overdracht... voor orders is
--    inslag en transport naar een warehouse een tussenstuk... daarna worden
--    orders pas weer opgepakt"
--
-- Until now the order was the ledger. `orders.transport_id` is ONE column, so
-- an order could sit on exactly one transport, and the packing hung on the
-- order as well. That breaks on the most ordinary thing that happens: a load
-- goes missing, the goods are sent again, and then part of the first load turns
-- up after all. Whose bottles are those? Under the old model the question has
-- no answer. Under hers it does not need one — they are bottles on a shelf in a
-- warehouse, and which boat brought them stopped mattering the moment they were
-- signed in.
--
-- So:
--   transport   moves stock from Curaçao to a warehouse. That is all it does.
--   inslag      counts what arrived and makes it a partij on that shelf.
--   uitslag     is where an order is picked up again, and only there can an
--               order be called finished.
--
-- Two things follow, and they are what this migration does.
--
-- 1. Which orders a transport is MEANT for becomes a reference list, many to
--    many, with no quantities on it. No quantities, because the transport does
--    not owe the order anything — it carries stock. An order can therefore
--    appear on two transports, which is exactly what a re-send is.
--
-- 2. The colli move from the order to the TRANSPORT. Her decision of the same
--    day: packed per product, and the warehouse repacks over there — "van grote
--    omdozen naar afhankelijk van de order verpakkingen (webshop orders of B2B
--    orders)". Each box may still name the order it was packed for, and that is
--    for our own eyes: it is NEVER printed, on no document and in no QR, the
--    same rule that took the reseller name off the label on 2026-08-19.
--
-- Deliberately NOT done here:
--   * `orders.transport_id` is left in place and still written, as the most
--     recent transport an order was put on. Uitslag still reads it
--     (bookOffWarehouse) and that is untangled in its own step, not in the
--     migration that would leave the warehouse unable to book anything off.
--   * `orders.colli_contents` is left in place with its data. It is copied, not
--     moved, so this migration can be reasoned about after the fact.

begin;

-- ── Which orders is this transport meant for ─────────────────────────────────
create table if not exists public.transport_orders (
  id           uuid primary key default gen_random_uuid(),
  transport_id uuid not null references public.transports(id) on delete cascade,
  order_id     uuid not null references public.orders(id)     on delete cascade,
  created_at   timestamptz not null default now(),
  unique (transport_id, order_id)
);

comment on table public.transport_orders is
  'Which orders a transport is meant for, and how much of each one travels on it. An order may appear on several transports, which is what a re-send after a lost load is.';

create index if not exists transport_orders_transport_idx on public.transport_orders (transport_id);
create index if not exists transport_orders_order_idx     on public.transport_orders (order_id);

-- ── How much of that order is on THIS transport ──────────────────────────────
-- Danique, 2026-08-19: "per order die we in het transport selecteren, dienen we
-- zelf aan te geven hoeveel items mee zijn. Is niet altijd de hele order."
--
-- It has to be said rather than worked out. Deriving it from the boxes only
-- answers it once somebody has packed them, and the quantity is decided long
-- before the packing — it is what you agree to send on this run. Deriving it
-- from the order is the old lie that put 130 bottles on a bill of lading for a
-- container holding 43.
--
-- Filled with the WHOLE order when the order is put on a transport, because
-- that is the ordinary case and nobody should have to retype it. Cut it down by
-- hand for a part shipment.
alter table public.transport_orders
  add column if not exists items jsonb not null default '[]'::jsonb;

comment on column public.transport_orders.items is
  'What of this order travels on this transport: [{"sku","name","qty"}]. Set to the whole order when it is added, edited by hand for a part shipment. NOT derived from the packing — the quantity is agreed before anything is boxed.';

-- ── The packing belongs to the load ──────────────────────────────────────────
alter table public.transports
  add column if not exists colli_contents jsonb not null default '[]'::jsonb;

comment on column public.transports.colli_contents is
  'One entry per package on this transport: [{"items":[{"sku","name","qty"}],"weight_kg","length_cm","width_cm","height_cm","for_order_id"}]. Array length = number of colli. for_order_id is which order the box was packed for — for our own screens only, NEVER printed on a document or encoded in a QR.';

-- ── Carry over what is already there ─────────────────────────────────────────
-- Every order that sits on a transport today becomes a reference row.
-- The quantity starts as the whole order, which is what the old single column
-- meant: the order was on the transport, all of it.
insert into public.transport_orders (transport_id, order_id, items)
select o.transport_id, o.id, coalesce(o.items, '[]'::jsonb)
from public.orders o
where o.transport_id is not null
on conflict (transport_id, order_id) do nothing;

-- Re-running is safe, and rows made before this column existed are filled in.
update public.transport_orders tro
set items = coalesce(o.items, '[]'::jsonb)
from public.orders o
where o.id = tro.order_id
  and tro.items = '[]'::jsonb;

-- And its packing moves up to the transport, each box remembering the order it
-- was packed for. Only for transports that have no packing of their own yet, so
-- running this twice cannot double the boxes.
update public.transports t
set colli_contents = coalesce((
  select jsonb_agg(c || jsonb_build_object('for_order_id', o.id) order by o.created_at, c_index)
  from public.orders o
  cross join lateral jsonb_array_elements(o.colli_contents) with ordinality as x(c, c_index)
  where o.transport_id = t.id
    and jsonb_array_length(o.colli_contents) > 0
), '[]'::jsonb)
where t.colli_contents = '[]'::jsonb;

-- ── Row-Level Security ───────────────────────────────────────────────────────
-- The same perimeter as `transports` itself (054), plus the warehouse exception
-- from 067: somebody who signs a transport in at their own location has to be
-- able to see what it is meant for.
alter table public.transport_orders enable row level security;

drop policy if exists "transport_orders: staff manage"        on public.transport_orders;
drop policy if exists "transport_orders: warehouse own reads" on public.transport_orders;

create policy "transport_orders: staff manage"
  on public.transport_orders for all
  to authenticated
  using (public.is_staff())
  with check (public.is_staff());

create policy "transport_orders: warehouse own reads"
  on public.transport_orders for select
  to authenticated
  using (
    public.is_staff()
    or exists (
      select 1
      from public.transports tr
      join public.transport_locations l on l.id = tr.location_id
      where tr.id = transport_orders.transport_id
        and l.user_id = auth.uid()
    )
  );

commit;
