-- 108: a batch holds ONE product, and a movement cannot contradict it.
--
-- Her rule, 2026-08-21: "let wel, 1 partij kan maar 1 product item zijn, je
-- kunt niet 1 partij hebben met 2 verschillende producten erin."
--
-- Until now `batches` did not know its product at all — the products came from
-- the movements hanging off it, and the create form let you put quantities of
-- several products on one batch number in one go. That makes a batch number
-- meaningless on paper: SPGE22 could be 50ml and 100ml at once, so quoting it
-- on a defect report says nothing about which bottles are meant. Art. 2.5 of
-- the consignment agreement asks a customer to do exactly that.
--
-- It also blocks the intake batch we are about to build. An intake batch is
-- numbered SPGE22-20260722-NBC and stands for one product at one warehouse; it
-- cannot inherit a parent that is two products.
--
-- The table is EMPTY today (checked 2026-08-21: zero batches, zero movements),
-- so nothing has to be converted. The guard below still refuses to make the
-- column NOT NULL if a row without a product ever exists, because a migration
-- that silently fails halfway is worse than one that stops.

begin;

alter table public.batches
  add column if not exists sku text references public.products(sku);

comment on column public.batches.sku is
  'The one product this batch holds. A batch is one product, always.';

do $$
begin
  if not exists (select 1 from public.batches where sku is null) then
    alter table public.batches alter column sku set not null;
  else
    raise notice 'batches.sku left nullable: % row(s) still have no product',
      (select count(*) from public.batches where sku is null);
  end if;
end $$;

-- ── A movement cannot put another product on the batch ───────────────────────
--
-- The column alone is only a label. Without this, code could still book 100ml
-- onto a 50ml batch and the batch would hold two products again through the
-- back door — which is exactly how it worked before today.
create or replace function public.guard_movement_matches_batch()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare batch_sku text;
begin
  select sku into batch_sku from public.batches where id = new.batch_id;
  if batch_sku is not null and new.sku is distinct from batch_sku then
    raise exception 'Batch % holds %, so % cannot be booked on it',
      (select batch_number from public.batches where id = new.batch_id),
      batch_sku, new.sku
      using errcode = '23514';
  end if;
  return new;
end $$;

comment on function public.guard_movement_matches_batch() is
  'One batch is one product: refuses a stock movement whose sku is not the batch sku.';

drop trigger if exists stock_movements_match_batch on public.stock_movements;
create trigger stock_movements_match_batch
  before insert or update on public.stock_movements
  for each row execute function public.guard_movement_matches_batch();

commit;
