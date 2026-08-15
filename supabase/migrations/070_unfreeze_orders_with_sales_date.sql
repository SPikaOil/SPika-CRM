-- 070: the sales-date view stops going stale
--
-- A view built on `o.*` freezes the column list of the moment it was created.
-- orders_with_sales_date was last built in migration 048, and eleven columns
-- have been added to orders since:
--
--   051  currency, fx_rate
--   052  credit_note_of
--   054  transport_id, colli_contents
--   056  cash_invoice
--   057  consignment_of, consignment_closed_at
--   062  consignment_start, consignment_end
--
-- None of them exist as far as the view is concerned. Ask for one and PostgREST
-- answers 400, which in this app means a revenue figure quietly becomes zero
-- instead of shouting. It has already happened twice: there are two comments in
-- the source telling the next person to read from the orders TABLE instead,
-- one for fx_rate and one for order_type.
--
-- Two things happen here.
--
-- 1. The view is rebuilt, so it carries every column orders has today.
--
-- 2. A SECOND view is added that can never go stale: sales_dates holds only the
--    order id and its sales date. Adding a column to orders cannot change it,
--    because it does not select any. Anything that only needs to filter by month
--    can join that instead of reading the wide view, and then this whole problem
--    stops existing for that query.
--
-- Rule for whoever adds the next column to orders: rebuild the wide view in the
-- same migration, or move the caller onto sales_dates.

begin;

-- ── The wide view, rebuilt ───────────────────────────────────────────────────
-- Dropped rather than replaced: create-or-replace cannot change a view's column
-- list, which is the very thing that needs changing.
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

comment on view public.orders_with_sales_date is
  'Orders plus the month a sale belongs to. Built on o.*, so it FREEZES the column list of the moment it was created — rebuild it in the same migration that adds a column to orders, or the new column is invisible here and asking for it returns 400. Queries that only need the date should use sales_dates instead, which cannot go stale.';

-- ── The narrow view, which cannot go stale ───────────────────────────────────
create or replace view public.sales_dates
with (security_invoker = on) as
select
  o.id as order_id,
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

comment on view public.sales_dates is
  'Which month an order counts in, and nothing else. Two columns, neither of them o.*, so adding a column to orders can never make this go out of date. Join it to orders instead of reading the wide view.';

grant select on public.orders_with_sales_date to authenticated;
grant select on public.sales_dates            to authenticated;

commit;
