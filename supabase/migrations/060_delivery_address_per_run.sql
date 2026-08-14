-- 060: a run can go to a different address
--
-- The delivery address lives on the customer, which is right for the usual
-- case. But a single run can go somewhere else — a second location, an event,
-- a warehouse — and that is a property of THAT run, not a change to the
-- customer's own address.
--
-- Empty means the customer's own delivery address, which is how every delivery
-- made before today behaves.

begin;

alter table public.deliveries
  add column if not exists delivery_address jsonb;

comment on column public.deliveries.delivery_address is
  'Where this run was delivered, when it differs from the customer address. Null = the customer''s own delivery address.';

commit;
