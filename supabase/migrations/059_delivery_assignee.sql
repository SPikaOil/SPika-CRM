-- 059: who ran this delivery
--
-- An order already carries assigned_to, but with several runs per order that is
-- no longer enough: the first 50 units can go out with one person and the rest
-- with another. The run itself has to say who took it.
--
-- `notes` was already on the table since migration 001 and now gets a purpose:
-- what the driver wants to record about THIS run.

begin;

alter table public.deliveries
  add column if not exists assigned_to uuid references public.users(id);

create index if not exists deliveries_assigned_to_idx on public.deliveries (assigned_to);

comment on column public.deliveries.assigned_to is
  'Who ran this delivery. Per run, because an order can go out in parts with different people.';
comment on column public.deliveries.notes is
  'Remarks about this run specifically — not about the order as a whole.';

commit;
