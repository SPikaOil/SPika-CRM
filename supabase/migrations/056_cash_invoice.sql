-- 056: print an order as a cash sale
--
-- Two customers want the invoice to read "Cash Payment" instead of their own
-- company details. This changes ONLY what is printed: the order keeps its
-- customer_id, so revenue, history, the payment chase, the reports and the
-- customer page all behave exactly as before.
--
-- Deliberately a separate flag and not the existing `payment_type = 'cash'`.
-- Those are different questions: payment_type says HOW the order is paid, this
-- says WHAT the paper shows. An order can be paid in cash while the invoice
-- still names the buyer, and the other way round.

begin;

alter table public.orders
  add column if not exists cash_invoice boolean not null default false;

comment on column public.orders.cash_invoice is
  'Print the invoice and delivery note as "Cash Payment" instead of the customer''s company details. Does not change who the order belongs to.';

commit;
