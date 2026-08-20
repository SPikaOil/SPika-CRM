-- 105: a run is prepared before it is driven
--
-- Danique, 2026-08-20: "er zou hier een tussenstap moeten zijn waar je de
-- deellevering klaarzet en iemand assigned."
--
-- She is right, and it explains the other thing she noticed an hour earlier —
-- that there is no packing slip to print before you drive. There was nothing to
-- print because the run did not exist yet: `deliveries` got its row at the
-- moment somebody signed, so up to that instant a delivery was a screen full of
-- typing and nothing else. Whoever was going to drive it could not see it
-- either, and the assignee chosen in that screen was only written down on the
-- way out.
--
-- So a delivery row is created EARLY, empty of proof:
--   items         what goes out on this run — not the whole order
--   assigned_to   who takes it (the column has existed since 059)
--   planned_date  which day
--   delivered_at  NULL — this is what "prepared, not driven" means
--
-- No status column. A run with no delivered_at is prepared; with one it
-- happened. A second flag would only be a second thing to keep in step.
--
-- ── And the order stops being written by hand ────────────────────────────────
-- Her point 1 of 2026-08-20: `orders.update` was granted by `orders.view`, and
-- the warehouse role holds that — so a warehouse member could change any order
-- in the system, quantities and all. It is now staff, or the portal customer on
-- their own order.
--
-- That is only safe because migration 103 moved the order status onto a trigger
-- fired by the delivery. Nobody handing goods over has to touch an order any
-- more: they write the delivery, and the order follows.

begin;

-- ── When the run is planned for ─────────────────────────────────────────────
alter table public.deliveries
  add column if not exists planned_date date;

comment on column public.deliveries.planned_date is
  'The day this run is meant to go out. Null = no date agreed yet. Per RUN, because an order delivered in three parts has three days.';

alter table public.deliveries
  add column if not exists prepared_by uuid references public.users(id) on delete set null;

comment on column public.deliveries.prepared_by is
  'Who put this run together. Different from assigned_to, who drives it.';

-- The one question the assignee asks: what is waiting for me?
create index if not exists deliveries_open_assignee_idx
  on public.deliveries (assigned_to)
  where delivered_at is null;

-- ── Orders are read by the warehouse, never written ─────────────────────────
-- Replaces the update policy from 079, which used orders.view.
drop policy if exists "orders: update" on public.orders;
create policy "orders: update" on public.orders for update
  using (
    public.is_staff()
    or customer_id = public.current_user_customer_id()
  );

commit;
