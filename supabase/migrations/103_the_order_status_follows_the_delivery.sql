-- 103: the order status follows the delivery, so nobody has to write it
--
-- Danique, 2026-08-20, on what a warehouse member may do: "hij kan aangeven
-- minder te leveren dan dat de order aangeeft, maar dan zou hij wel moeten
-- aangeven waarom." And: he may receive a transport and hand out an order for
-- his warehouse, nothing else.
--
-- Delivering less is not an order edit. It is what happened at the uitslag, the
-- mirror of the goods receipt: the order keeps saying 50, the delivery says 40,
-- and the difference is a fact with a reason attached rather than a quietly
-- rewritten order.
--
-- Which means the ORDER STATUS has to move by itself. after_delivery_update()
-- has stamped the invoice date from the delivery since migration 048; it now
-- also decides delivered versus partly_delivered. A trigger runs as its owner,
-- so the person handing the goods over never needs write rights on orders — and
-- every path lands on the same rule: the online flow, the offline queue syncing
-- hours later, and a correction typed straight into Supabase.
--
-- Deliberately NOT here: taking order UPDATE away from the warehouse role. The
-- delivery screen still advances an order directly in three places, so closing
-- that door before those move would leave a warehouse member unable to hand
-- anything over. It goes in with the uitslag rebuild, in one step with them.

begin;

create or replace function public.after_delivery_update()
returns trigger language plpgsql as $$
declare
  ordered   numeric;
  delivered numeric;
  full_run  boolean;
begin
  -- ── How much of the order has actually gone out, over ALL its runs ────────
  -- deliveries.items empty means the whole order (migration 058), so one such
  -- run settles it no matter what the numbers elsewhere say.
  select exists (
    select 1 from public.deliveries d
    where d.order_id = new.order_id
      and d.delivered_at is not null
      and coalesce(jsonb_array_length(d.items), 0) = 0
  ) into full_run;

  select coalesce(sum((i->>'qty')::numeric), 0)
    into ordered
  from public.orders o, jsonb_array_elements(coalesce(o.items, '[]'::jsonb)) i
  where o.id = new.order_id
    and coalesce((i->>'qty')::numeric, 0) > 0;

  select coalesce(sum((i->>'qty')::numeric), 0)
    into delivered
  from public.deliveries d, jsonb_array_elements(coalesce(d.items, '[]'::jsonb)) i
  where d.order_id = new.order_id
    and d.delivered_at is not null
    and coalesce((i->>'qty')::numeric, 0) > 0;

  -- ── Proof of delivery advances the order ─────────────────────────────────
  -- Unchanged from 001 and 048 for a complete run. What is new is the middle
  -- case: something went out, but not everything. That order is not ready to
  -- invoice and it is not untouched either, and `partly_delivered` has existed
  -- since migration 058 to say exactly that.
  if new.pod_file_url is not null and new.delivered_at is not null then
    if full_run or ordered = 0 or delivered >= ordered then
      update public.orders
      set status = 'invoice_ready', updated_at = now()
      where id = new.order_id
        and status not in ('invoice_ready', 'invoice_blocked');
    else
      update public.orders
      set status = 'partly_delivered', updated_at = now()
      where id = new.order_id
        and status not in ('invoice_ready', 'invoice_blocked', 'paid');
    end if;
  end if;

  -- ── The delivery moment decides the invoice date (048, unchanged) ─────────
  -- Curacao local time, because a delivery at 21:00 local is 01:00 UTC the next
  -- day and would otherwise be invoiced a day late. Guarded on delivered_at
  -- actually changing, so editing something unrelated on the delivery never
  -- resets an invoice_date an admin deliberately corrected.
  if new.delivered_at is not null
     and (tg_op = 'INSERT' or old.delivered_at is distinct from new.delivered_at)
  then
    update public.orders
    set invoice_date = (new.delivered_at at time zone 'America/Curacao')::date,
        updated_at = now()
    where id = new.order_id;
  end if;

  return new;
end;
$$;

commit;
