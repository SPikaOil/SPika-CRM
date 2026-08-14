-- 062: a consignment contract runs for a fixed period
--
-- The SPika x La Bandera agreement runs from 6 August to 27 September 2026
-- (art. 12.1). That period drives real obligations with real deadlines:
--
--   Art 12.4  Within 7 days of the end, the customer reports the sales not yet
--             reported and the closing stock.
--   Art 12.5  We collect the remaining stock and the displays within 14 days.
--   Art 4.4   Whatever is missing at the end counts as sold and is payable.
--
-- None of that can be watched for if the app does not know when the contract
-- ends. Both dates are optional: a consignment without an agreed end simply
-- shows no countdown.

begin;

alter table public.orders
  add column if not exists consignment_start date,
  add column if not exists consignment_end   date;

comment on column public.orders.consignment_start is
  'First day of the consignment term (art. 12.1). Null = no term agreed.';
comment on column public.orders.consignment_end is
  'Last day of the consignment term. Drives the closing report and collection deadlines.';

-- An end before a start is a typo, and one that would produce a negative
-- countdown everywhere it is shown.
alter table public.orders drop constraint if exists orders_consignment_term_order;
alter table public.orders add constraint orders_consignment_term_order
  check (
    consignment_start is null
    or consignment_end is null
    or consignment_end >= consignment_start
  );

commit;
