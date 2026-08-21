-- 110: what arrives at a warehouse becomes a batch of its own.
--
-- Her correction, 2026-08-20: "een productiepartij is anders dan een warehouse
-- partij, ze moeten wel op de achtergrond gekoppeld zijn aan elkaar maar het
-- zijn zeker NIET dezelfde partijen." And the day after: "transport word
-- ingeslagen op een inslagpartij warehouse x."
--
-- Until now the goods receipt booked the PRODUCTION batch onto the warehouse,
-- so SPGE22 stood in two places at once and cost two different amounts — the
-- freight, the local costs and the storage of the leg to Rotterdam land on the
-- bottles that arrived, not on the ones still on Curacao. One batch cannot
-- carry two cost prices.
--
-- So an arrival makes its own batch, pointing back at the one it came from.
-- Numbered parent-transport-warehouse, her order of 2026-08-20: "draai het om,
-- SPGE22-20260722-NBC". The parent stays visible in the number itself, which is
-- what makes a recall answerable from a bottle in a shop.
--
-- `code` is the short name that goes in that number. It starts as the warehouse
-- name so nothing has to be filled in before this works; shorten NBC010 to NBC
-- on the warehouse card whenever you like.

begin;

alter table public.batches
  -- The production batch this one came out of. RESTRICT: a parent that has
  -- children somewhere in the world cannot be deleted out from under them.
  add column if not exists parent_batch_id uuid references public.batches(id) on delete restrict,
  -- Where this batch lives. NULL = Curaçao, as everywhere else. A production
  -- batch is filled on Curaçao and keeps NULL; an intake batch names its
  -- warehouse.
  add column if not exists location_id uuid references public.transport_locations(id) on delete restrict,
  -- The transport that brought it in. Null for a production batch, and for an
  -- intake batch that came from a handover rather than a transport.
  add column if not exists transport_id uuid references public.transports(id) on delete set null;

comment on column public.batches.parent_batch_id is
  'The production batch this intake batch came out of. NULL for a production batch itself.';
comment on column public.batches.location_id is
  'Where this batch lives. NULL = Curacao.';

create index if not exists batches_parent_idx   on public.batches (parent_batch_id);
create index if not exists batches_location_idx on public.batches (location_id);

-- One intake batch per parent, per transport, per place. A second colli of the
-- same load carrying the same product is the SAME arrival of the same goods —
-- without this it would open a second batch and split the shelf in two.
create unique index if not exists batches_intake_unique
  on public.batches (parent_batch_id, transport_id, location_id)
  where parent_batch_id is not null and transport_id is not null;

alter table public.transport_locations
  add column if not exists code text;

comment on column public.transport_locations.code is
  'Short name used in intake batch numbers, e.g. NBC in SPGE22-20260722-NBC.';

update public.transport_locations set code = name where code is null or code = '';

commit;
