-- 048: the delivery date IS the invoice date — enforced instead of implied
--
-- House rule: an order delivered on 2 July is invoiced 2 July, no matter when
-- it was created or planned. Until now that rule only lived in comments:
-- orders.invoice_date was never filled at delivery, so everything silently fell
-- back to planned_date (the PLANNED day) and "mark as paid" overwrote
-- invoice_date with the PAYMENT date.
--
-- Four changes, in this order (the order matters — step 2 reads what step 4
-- overwrites, and step 5 needs the column from step 1 to exist):
--   1. paid_date column, so a payment date stops squatting in invoice_date
--   2. rescue the payment dates already written into invoice_date
--   3. stamp invoice_date from the delivery date, for every path, forever
--   4. backfill the 46 historical orders so the data is explicit
--   5. rebuild the sales-date view with the real delivery date as fallback

-- ── 1. Payment date gets its own column ──────────────────────────────────────
alter table public.orders add column if not exists paid_date date;

comment on column public.orders.paid_date is
  'Date the payment was received. Never the invoice date — see invoice_date.';
comment on column public.orders.invoice_date is
  'Invoice date = the delivery date (house rule), stamped by after_delivery_update().';

-- ── 2. Rescue payment dates that were written into invoice_date ──────────────
-- "Mark as paid" used to write the payment date into invoice_date. Move those
-- values across BEFORE step 4 overwrites invoice_date with the delivery date.
update public.orders
set paid_date = invoice_date
where status = 'paid'
  and paid_date is null
  and invoice_date is not null;

-- ── 3. Stamp the invoice date from the delivery ──────────────────────────────
-- Replaces the function from migration 001; the trigger itself already exists
-- (after insert or update on deliveries) so it does not need recreating.
--
-- Doing this in the database rather than in the delivery screen means every
-- path lands on the same rule: the online flow, the offline queue syncing hours
-- later, and any manual correction in the Supabase editor.
create or replace function public.after_delivery_update()
returns trigger language plpgsql as $$
begin
  -- Unchanged from 001: advance the order once proof of delivery is in.
  if new.pod_file_url is not null and new.delivered_at is not null then
    update public.orders
    set status = 'invoice_ready', updated_at = now()
    where id = new.order_id
      and status not in ('invoice_ready', 'invoice_blocked');
  end if;

  -- The delivery moment decides the invoice date. Curacao local time, because
  -- a delivery at 21:00 local is 01:00 UTC the next day and would otherwise be
  -- invoiced a day late.
  --
  -- Guarded on delivered_at actually changing, so editing something unrelated
  -- on the delivery (returned bottles, notes) never resets an invoice_date that
  -- an admin deliberately corrected afterwards.
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

-- ── 4. Backfill history ──────────────────────────────────────────────────────
-- Makes the existing orders explicit instead of dependent on fallbacks.
-- Measured before running (26-07-2026): 46 delivered orders, 6 of which carried
-- a date that differs from the actual delivery. One of those crosses a month
-- boundary and moves XCG 313.20 from May to June 2026 — order C-2026-72001,
-- whose invoice_date had been set by hand to five days BEFORE the delivery.
update public.orders o
set invoice_date = d.delivery_date,
    updated_at   = now()
from (
  select order_id,
         max((delivered_at at time zone 'America/Curacao')::date) as delivery_date
  from public.deliveries
  where delivered_at is not null
  group by order_id
) d
where d.order_id = o.id
  and o.invoice_date is distinct from d.delivery_date;

-- ── 5. Sales-date view: fall back to the REAL delivery date ─────────────────
-- Was: coalesce(invoice_date, planned_date, created_at) — the comment claimed
-- "delivery date" but planned_date is the planned day. deliveries.delivered_at
-- now sits in the chain where that comment always said it did.
--
-- Dropped rather than replaced: paid_date from step 1 changes what o.* expands
-- to, and create-or-replace cannot change a view's column list.
drop view if exists public.orders_with_sales_date;

create view public.orders_with_sales_date
with (security_invoker = on) as
select
  o.*,
  coalesce(
    o.invoice_date,
    (d.delivered_at at time zone 'America/Curacao')::date,
    o.planned_date,
    (o.created_at at time zone 'America/Curacao')::date
  ) as sales_date
from public.orders o
left join lateral (
  select dd.delivered_at
  from public.deliveries dd
  where dd.order_id = o.id
    and dd.delivered_at is not null
  order by dd.delivered_at desc
  limit 1
) d on true;

grant select on public.orders_with_sales_date to authenticated;
