-- 057: consignment is settled per period, not at delivery
--
-- From the SPika x La Bandera agreement, 6 Aug - 27 Sep 2026:
--
--   Art 2.3  "De factuurdatum is niet de afleverdatum." The consignment note is
--            dated the day the goods leave Curacao, and doubles as the delivery
--            document. Migration 048 stamps invoice_date from the delivery for
--            EVERY order — which would overwrite that date and contradict the
--            contract. Consignment orders are exempted below. The house rule
--            stands unchanged for every other order.
--
--   Art 9.1  The consignment note is NOT payable on delivery. It states the
--            value of the stock. Payment follows the reported sales only.
--   Art 9.2  Sold quantities are invoiced per reporting period.
--
-- Hence a fourth order type. A consignment invoice is a real, payable invoice
-- that hangs off the consignment note it settles. It must NOT count as revenue:
-- Danique's rule is that revenue counts from the moment the consignment order
-- is created, so counting the period invoices as well would book the same
-- bottles twice.
--
-- Closing the contract (art 4.3, 4.4, 12.5, 12.7) is a credit note over what
-- comes back — that machinery already exists since migration 052.

begin;

-- ── 1. Consignment keeps its own invoice date ────────────────────────────────
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
  --
  -- NOT for consignment. There the invoice date is the shipping date from
  -- Curacao and the contract says in so many words that it is not the delivery
  -- date. Overwriting it here would put the app at odds with the signed
  -- agreement.
  if new.delivered_at is not null
     and (tg_op = 'INSERT' or old.delivered_at is distinct from new.delivered_at)
  then
    update public.orders
    set invoice_date = (new.delivered_at at time zone 'America/Curacao')::date,
        updated_at = now()
    where id = new.order_id
      and coalesce(is_consignment, false) = false;
  end if;

  return new;
end;
$$;

-- ── 2. A consignment invoice settles part of a consignment note ──────────────
alter table public.orders drop constraint if exists orders_order_type_check;
alter table public.orders add  constraint orders_order_type_check
  check (order_type in ('normal', 'free_bottle_service', 'credit_note', 'consignment_invoice'));

alter table public.orders
  add column if not exists consignment_of uuid references public.orders(id);

create index if not exists orders_consignment_of_idx on public.orders (consignment_of);

comment on column public.orders.consignment_of is
  'For order_type = consignment_invoice: the consignment note this invoices a period of. Null for every other order.';

-- A consignment invoice must name its parent, and nothing else may.
alter table public.orders drop constraint if exists orders_consignment_of_requires_type;
alter table public.orders add constraint orders_consignment_of_requires_type
  check (
    (order_type = 'consignment_invoice' and consignment_of is not null)
    or (order_type <> 'consignment_invoice' and consignment_of is null)
  );

-- ── 3. Closing a contract ────────────────────────────────────────────────────
-- The term ends, the remaining bottles are dealt with, the note is closed.
alter table public.orders
  add column if not exists consignment_closed_at timestamptz;

comment on column public.orders.consignment_closed_at is
  'Set when the consignment contract has been settled: remainder returned, taken over, written off or charged.';

commit;
