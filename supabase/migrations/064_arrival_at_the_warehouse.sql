-- 064: signing a transport in at the warehouse
--
-- Danique, 2026-08-14, asked whether a warehouse holds stock or only forwards
-- it: "allebei komt voor". So it is a choice per transport, not a rule.
--
--   stores_at_warehouse = true   the bottles stay there and are shipped onward
--                                later, so they are booked IN at that location
--                                ('received') and the batch can be seen sitting
--                                there instead of on Curaçao.
--   stores_at_warehouse = false  the warehouse only forwards a load that is
--                                already sold. Nothing is booked: the bottles
--                                left Curaçao when the batch was picked on the
--                                order, and adding them to a warehouse would
--                                invent stock that is never taken off again.
--
-- There is deliberately NO 'left Curaçao' booking on departure. Picking the
-- batch on the order already took those bottles off the shelf; booking them out
-- again would count the same bottles twice.

begin;

alter table public.transports
  add column if not exists stores_at_warehouse boolean not null default false;

comment on column public.transports.stores_at_warehouse is
  'True when the load stays at the warehouse as stock. False when the warehouse only forwards it. Decides whether arrival books the bottles in.';

alter table public.transports
  add column if not exists arrived_at timestamptz;

comment on column public.transports.arrived_at is
  'When the warehouse signed the load in. Null = not arrived yet.';

commit;
