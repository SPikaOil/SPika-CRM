-- 063: a handover comes out of a batch, and the stock says so
--
-- Danique's flow, 2026-08-14: a batch number is TYPED in exactly one place —
-- when the batch is created at Stock. Everywhere after that it is CHOSEN: on a
-- handover, and per product on an order. The system then counts down until the
-- batch is empty, and that count has to match the shelf.
--
-- Migration 055 already added handover_batches.batch_id. It is repeated here
-- with `if not exists` so this file is safe to run on its own.
--
-- What is new is the link back: a handover writes negative movements, and if the
-- handover is removed those bottles have to go back onto the batch. Without a
-- reference there is no way to find them again, and stock silently drifts.

begin;

alter table public.handover_batches
  add column if not exists batch_id uuid references public.batches(id);

comment on column public.handover_batches.batch_id is
  'The batch these bottles came off. Chosen from Stock, never typed. The old free-text batch_number is kept only for rows from before batches were real records.';

alter table public.stock_movements
  add column if not exists handover_batch_id uuid
    references public.handover_batches(id) on delete cascade;

comment on column public.stock_movements.handover_batch_id is
  'The handover that took these bottles off the batch. On delete cascade: removing a handover puts its bottles back, because the handover never happened.';

create index if not exists stock_movements_handover_idx
  on public.stock_movements (handover_batch_id);

commit;
