-- 090: retire the "POS material" category from the downloads.
--
-- NOT RUN YET.
--
-- Her note, 2026-08-16: the POS material tab under Downloads can go.
--
-- It was there since 072, described as "We print and ship it — wobblers, table
-- tents, displays", which is exactly what the Physical POS catalogue is for
-- now. Keeping both means two places to look for the same thing, and the one
-- under Downloads is the wrong one: those rows need a Drive file, and the
-- object they describe arrives in a box.
--
-- Any asset still filed under it is moved to 'prints' rather than left behind.
-- Both grids build their sections by filtering ASSET_CATEGORIES against what
-- exists, so an asset whose category is no longer in that list renders in no
-- section at all — it would not error, it would just quietly stop appearing.
-- 'prints' because what remains in that category IS a print file: artwork for
-- something we have printed.
--
-- One row here today: "TEST — Wobbler (mag weg)". It stays until she says so —
-- this migration moves it, it does not clean up after her.

begin;

update public.marketing_assets
   set category = 'prints',
       updated_at = now()
 where category = 'pos';

commit;
