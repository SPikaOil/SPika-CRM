-- 102: a warehouse member sees its own work, and only that
--
-- Danique, 2026-08-20, on who may do a goods receipt: "het zou moeten zijn:
-- Admin en Warehouse teamleden." Going through it showed the database was
-- already close and one table of mine was the exception.
--
-- 1. `transport_orders` (migration 100) was written staff-only for writes and
--    readable only by the ONE person in charge of a location. Every other
--    transport table went to `warehouse.view or is_staff()` in migration 077,
--    so this one alone kept a warehouse member from seeing which orders a load
--    they are receiving is even meant for.
--
-- 2. An order a warehouse member may see is an order coming to THEIR warehouse.
--    Her words: "enkel de orders die gealloceerd zijn aan desbetreffende
--    warehouse." Staff keep seeing everything; a portal customer keeps seeing
--    their own. Everyone else now has to be a member of the place the load is
--    heading for.
--
-- Deliberately NOT here: taking order WRITES away from the warehouse role. That
-- belongs with the uitslag rebuild, because the delivery screen still advances
-- an order directly and closing the door before the replacement exists would
-- leave a warehouse member unable to hand anything over.

begin;

-- ── transport_orders, in step with every other transport table ───────────────
drop policy if exists "transport_orders: staff manage"        on public.transport_orders;
drop policy if exists "transport_orders: warehouse own reads" on public.transport_orders;

create policy "transport_orders: warehouse or staff"
  on public.transport_orders for all
  to authenticated
  using (public.has_perm('warehouse.view') or public.is_staff())
  with check (public.has_perm('warehouse.view') or public.is_staff());

-- ── Is this order coming to a warehouse I work at? ──────────────────────────
-- Security definer so the check itself can read the join tables — the caller
-- must not need rights on them to be judged by them.
--
-- Tied to ship_to = 'warehouse' on purpose. A transport that goes straight to
-- the customer has no location, and matching a NULL location against a member
-- of Curacao (also NULL) would hand that member every direct shipment we make.
create or replace function public.order_is_for_my_warehouse(p_order uuid)
returns boolean language sql security definer stable as $$
  select exists (
    select 1
    from public.transport_orders tro
    join public.transports tr        on tr.id = tro.transport_id
    join public.warehouse_members wm on wm.location_id = tr.location_id
    where tro.order_id = p_order
      and tr.ship_to = 'warehouse'
      and wm.user_id = auth.uid()
  );
$$;

comment on function public.order_is_for_my_warehouse(uuid) is
  'True when the order travels on a transport to a warehouse the signed-in user is a member of. Used to narrow orders.view for the warehouse role.';

-- ── Orders: staff see all, a warehouse member sees its own warehouse ─────────
-- Replaces the read policy from 079. Insert, update and delete are untouched.
drop policy if exists "orders: read" on public.orders;
create policy "orders: read" on public.orders for select
  using (
    (
      public.has_perm('orders.view')
      and (public.is_staff() or public.order_is_for_my_warehouse(id))
    )
    or customer_id = public.current_user_customer_id()
  );

commit;
