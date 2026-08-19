-- 094: a contact person for whoever receives the transport.
--
-- Her decision, 2026-08-19: a packing list carries what is in the load and who
-- receives it — name, address, and "t.a.v." a person. That person is not fixed
-- to the warehouse: it can be somebody else every time, so it belongs on the
-- transport rather than on transport_locations.
--
-- The order number comes OFF the document. Which orders are in the load stays in
-- the system, where the warehouse can look it up; a carrier and a customs
-- officer have no business with it, the same way prices have none.

begin;

alter table public.transports
  add column if not exists receiver_contact text not null default '';

comment on column public.transports.receiver_contact is
  'Attn. — the person the load is addressed to at the receiving end. Printed on the packing list. Can differ per transport, which is why it is not on transport_locations.';

commit;
