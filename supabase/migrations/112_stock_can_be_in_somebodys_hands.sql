-- 112: stock can sit with a PERSON, not only at a place.
--
-- Her question, 2026-08-21: "als ik aan djamy op 21 aug 50 flessen geef en hij
-- begint met orders te leveren, dat de app bijhoudt hoeveel flessen hij nog over
-- heeft."
--
-- Today it does not, and in two different ways — both worse than "not tracked".
-- Signing a handover books what was counted onto the warehouse the receiver is
-- ticked at, so Djamy (ticked at Curaçao) hands the bottles straight back to
-- Curaçao and the island count never moves. And somebody ticked nowhere books
-- NOTHING at all: the bottles come off the sending place and land nowhere.
-- Fifty bottles leave the books.
--
-- The gap is that stock has a place but no holder. A movement said where, never
-- in whose hands, so a person could not hold anything.
--
-- With this, a team member is a stock location like any other and every rule we
-- already have works for them unchanged: their own batch out of the parent, the
-- same numbering, FIFO, recall, the lot. One rule, no special case that can
-- drift — which is exactly what she was worried about.

begin;

alter table public.stock_movements
  add column if not exists holder_id uuid references public.users(id) on delete restrict;

comment on column public.stock_movements.holder_id is
  'Who is holding these bottles. NULL = the place itself holds them.';

create index if not exists stock_movements_holder_idx
  on public.stock_movements (holder_id);

alter table public.batches
  add column if not exists holder_id uuid references public.users(id) on delete restrict,
  -- The handover that created this batch, the way transport_id is for a load.
  add column if not exists handover_batch_id uuid references public.handover_batches(id) on delete set null;

comment on column public.batches.holder_id is
  'The person this batch belongs to. NULL = it belongs to a place.';

create index if not exists batches_holder_idx on public.batches (holder_id);

-- One intake batch per parent per handover, the same rule a transport has.
create unique index if not exists batches_intake_handover_unique
  on public.batches (parent_batch_id, handover_batch_id)
  where parent_batch_id is not null and handover_batch_id is not null;

-- ── The stock view learns the holder ─────────────────────────────────────────
--
-- holder_id is APPENDED. CREATE OR REPLACE cannot rename or reorder the columns
-- a view already has, so putting it beside location_id where it belongs would
-- fail — and a drop-and-create would take the security_invoker setting with it.
create or replace view public.batch_stock as
  select
    m.batch_id,
    b.batch_number,
    b.tht_date,
    m.sku,
    p.name as product_name,
    m.location_id,
    sum(m.qty)::int as qty,
    m.holder_id
  from public.stock_movements m
  join public.batches  b on b.id  = m.batch_id
  join public.products p on p.sku = m.sku
  group by m.batch_id, b.batch_number, b.tht_date, m.sku, p.name, m.location_id, m.holder_id
  having sum(m.qty) <> 0;

comment on view public.batch_stock is
  'Current stock per batch, product, location and holder. location_id NULL = Curacao; holder_id NULL = the place itself holds it.';

alter view public.batch_stock set (security_invoker = on);

-- ── A movement cannot contradict its batch ───────────────────────────────────
--
-- Extends the product check from 108 to the holder. Djamy''s batch holds Djamy''s
-- bottles; booking somebody else''s movement onto it would put two people''s
-- stock behind one number, which is the same mistake as two products on one
-- batch.
create or replace function public.guard_movement_matches_batch()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare b record;
begin
  select sku, holder_id, batch_number into b from public.batches where id = new.batch_id;
  if b.sku is not null and new.sku is distinct from b.sku then
    raise exception 'Batch % holds %, so % cannot be booked on it',
      b.batch_number, b.sku, new.sku
      using errcode = '23514';
  end if;
  if new.holder_id is distinct from b.holder_id then
    raise exception 'Batch % belongs to somebody else — book it on their own batch',
      b.batch_number
      using errcode = '23514';
  end if;
  return new;
end $$;

comment on function public.guard_movement_matches_batch() is
  'One batch is one product in one pair of hands: refuses a movement whose sku or holder is not the batch''s.';

commit;
