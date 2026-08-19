-- 099: a reseller asks for something from the CATALOGUE.
--
-- Her GO of 2026-08-19 on the point I raised: the portal's "We need this"
-- button read marketing_assets.is_physical, while everything we actually ship
-- lives in pos_items (088). Two lists of physical things, neither aware of the
-- other, and measured today the mismatch was total:
--
--   marketing assets flagged physical .... 0
--   items in the catalogue ............... 6
--   registered at resellers .............. 19 rows
--
-- So a reseller saw no request button at all, and the six stands we do hold
-- could not be asked for. One list from now on, and it is the catalogue —
-- because that is the list of things that exist in a warehouse.
--
-- asset_id stays and becomes nullable rather than being dropped: the two
-- requests made through the old route were cleaned out today, but the column is
-- how a request that came from a print file is still readable, and a wobbler
-- legitimately points at both (pos_items.asset_id, 088).
--
-- Exactly one of the two must be set. Neither means a request for nothing;
-- both would mean two different things asked for on one row.

begin;

alter table public.pos_requests
  add column if not exists pos_item_id uuid references public.pos_items(id) on delete cascade;

alter table public.pos_requests
  alter column asset_id drop not null;

alter table public.pos_requests
  drop constraint if exists pos_requests_one_subject;

alter table public.pos_requests
  add constraint pos_requests_one_subject
  check (num_nonnulls(asset_id, pos_item_id) = 1);

create index if not exists pos_requests_pos_item_idx
  on public.pos_requests (pos_item_id);

comment on column public.pos_requests.pos_item_id is
  'What was asked for, from the catalogue (pos_items). This is the route the portal uses since 2026-08-19.';
comment on column public.pos_requests.asset_id is
  'What was asked for, when it came from a marketing asset. The older route — kept readable, no longer offered. Exactly one of asset_id / pos_item_id is set.';

commit;
