-- 052: credit notes
--
-- A credit note corrects an invoice that has already gone out. It is created
-- FROM the order it corrects, so the link between the two is never in doubt,
-- and it carries none of the delivery machinery: no planned date, no assignee,
-- no delivery record, no signature, no proof photo.
--
-- THE ONE DECISION EVERYTHING ELSE FOLLOWS FROM: a credit note is stored with a
-- NEGATIVE total and NEGATIVE item quantities. That is what makes every sum
-- already in the application come out right without touching it:
--   * revenue on the dashboard, the monthly report and the period report goes
--     DOWN by the credited amount
--   * the bottle count on the stock page goes DOWN by the credited bottles
--     (stock/page.tsx adds up items[].qty and would otherwise count returned
--     bottles as extra sales)
--   * the customer's own totals in the portal come out right
-- Storing it positive and special-casing every sum would mean finding all of
-- them, forever, including the ones written next year.
--
-- Status is 'paid', deliberately:
--   * revenue counts status in (delivered, invoice_ready, invoice_blocked,
--     paid), so the credit lands in revenue — which is the whole point
--   * the overdue chase counts only invoice_ready and invoice_blocked, so a
--     credit note is never chased for payment. There is nothing to collect.
--
-- Numbering is CR + the invoice number (CR729134), assigned by the app.

begin;

-- ── The link to the invoice being corrected ────────────────────────────────
alter table public.orders
  add column if not exists credit_note_of uuid references public.orders(id) on delete restrict;

comment on column public.orders.credit_note_of is
  'The invoice this credit note corrects. Null on ordinary orders. ON DELETE RESTRICT: an invoice with a credit note against it cannot be removed out from under it.';

create index if not exists orders_credit_note_of_idx on public.orders (credit_note_of);

-- ── order_type gains a third value ─────────────────────────────────────────
-- Stored as text with a check constraint (there is no enum on this column), so
-- widening it is a constraint swap, not a type change.
alter table public.orders drop constraint if exists orders_order_type_check;
alter table public.orders add  constraint orders_order_type_check
  check (order_type in ('normal', 'free_bottle_service', 'credit_note'));

-- ── A credit note must actually be a credit ────────────────────────────────
alter table public.orders drop constraint if exists orders_credit_note_shape_check;
alter table public.orders add  constraint orders_credit_note_shape_check check (
  case
    when order_type = 'credit_note' then credit_note_of is not null and total <= 0
    else credit_note_of is null
  end
);

-- ── Currency and rate come from the INVOICE, not from the customer ─────────
-- Replaces the function from 051. Crediting La Bandera today against a July
-- invoice has to use July's rate, otherwise the credit does not cancel the
-- charge. The invoice date is the day the credit note is raised — a credit note
-- has no delivery, so nothing else can supply one, and accounting-wise it
-- belongs to the period it is issued in, not the period of the original sale.
create or replace function public.stamp_order_currency()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  parent record;
  cust_currency text;
begin
  if tg_op = 'INSERT' and new.credit_note_of is not null then
    select o.currency, o.fx_rate into parent
    from public.orders o where o.id = new.credit_note_of;

    new.currency := coalesce(parent.currency, 'XCG');
    new.fx_rate  := coalesce(parent.fx_rate, 1);
    new.invoice_date := coalesce(new.invoice_date, (now() at time zone 'America/Curacao')::date);
    return new;
  end if;

  if tg_op = 'INSERT' then
    select c.currency into cust_currency from public.customers c where c.id = new.customer_id;
    new.currency := coalesce(cust_currency, 'XCG');
  end if;

  -- A credit note keeps the rate it was created with, whatever happens to its
  -- invoice_date later.
  if new.credit_note_of is null then
    new.fx_rate := public.fx_rate_for(new.currency, new.invoice_date);
  end if;

  return new;
end;
$$;

-- ── The delivery trigger must leave credit notes alone ─────────────────────
-- after_delivery_update() stamps invoice_date from a delivery. A credit note
-- has no delivery row, so it can never fire for one — this is belt and braces
-- against a future path that creates one by accident.
create or replace function public.after_delivery_update()
returns trigger language plpgsql as $$
begin
  if new.pod_file_url is not null and new.delivered_at is not null then
    update public.orders
    set status = 'invoice_ready', updated_at = now()
    where id = new.order_id
      and status not in ('invoice_ready', 'invoice_blocked')
      and order_type <> 'credit_note';
  end if;

  if new.delivered_at is not null
     and (tg_op = 'INSERT' or old.delivered_at is distinct from new.delivered_at)
  then
    update public.orders
    set invoice_date = (new.delivered_at at time zone 'America/Curacao')::date,
        updated_at = now()
    where id = new.order_id
      and order_type <> 'credit_note';
  end if;

  return new;
end;
$$;

commit;
