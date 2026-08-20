-- 106: a warehouse says when it is running low
--
-- Danique, 2026-08-20: "voorraad die onder een grens zakt — dan moet er iets bij
-- vanuit Curaçao."
--
-- There was no grens to fall below. `safety_stock_months` (migration 040) is one
-- number for the whole company and it is about MONTHS OF COVER on Curaçao,
-- worked out from how fast bottles leave there. A warehouse abroad has its own
-- rhythm, its own shipping time, and no sales history of its own to derive one
-- from — so a shared figure would either cry wolf or say nothing at all.
--
-- A plain number per place instead, set by an admin who knows what that
-- warehouse needs to have standing. Null means nobody has said, and nothing is
-- reported: a threshold guessed by the app is a threshold nobody trusts.

begin;

alter table public.transport_locations
  add column if not exists min_bottles integer;

comment on column public.transport_locations.min_bottles is
  'Tell us when this warehouse drops below this many bottles in total. Null = no threshold set, so nothing is reported. Set per place because a warehouse three weeks from Curacao needs a different floor than one two days away.';

commit;
