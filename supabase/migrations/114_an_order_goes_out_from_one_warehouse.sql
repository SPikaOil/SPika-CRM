-- 114: an order says which warehouse it goes out from.
--
-- Her decision, 2026-08-21: "stel dat ik een order dan invoer en ik zet hem op
-- NBC, dan moet ik wel zien of NBC dan voorraad heeft, want anders kan ik meteen
-- een andere warehouse kiezen." And who may choose: "ENKEL als Admin of Manager
-- een order aanmaken en kunnen kiezen vanuit welke warehouse deze order zal
-- gaan, dan krijg je enkel de warehouse opties te zien die je in klantinfo hebt
-- aangevinkt."
--
-- Until now the app worked out which warehouse an order belonged to by looking
-- at the transports it travelled on. That answers a different question — where
-- the goods went — and it has no answer at all for a local order that never
-- travels. It is also the wrong way round: the warehouse serves the customer,
-- the transport is just how stock got there.
--
-- NULL is Curaçao, as everywhere else in this app. A customer ticked only to
-- Curaçao therefore needs nothing set, which is 24 of the 26.

begin;

alter table public.orders
  add column if not exists warehouse_id uuid references public.transport_locations(id) on delete restrict;

comment on column public.orders.warehouse_id is
  'The warehouse this order is delivered from. NULL = Curacao. Chosen from the warehouses ticked on the customer.';

create index if not exists orders_warehouse_idx on public.orders (warehouse_id);

commit;
