-- 098: a colli has a size, and it goes on the packing list.
--
-- Her instruction of 2026-08-19: "namelijk afmeting per colli. En deze info moet
-- ook op pakbon komen te staan. Zodat je per Colli het gewicht kan zien in app
-- maar ook op de pakbon."
--
-- colli_contents is jsonb and carries no constraint, so this migration changes
-- no structure — but the column comment IS the specification of that shape, and
-- a shape that is not written down is a shape the next person guesses at. Three
-- new keys, all optional:
--
--   length_cm, width_cm, height_cm   the outside of THIS box
--
-- Deliberately per colli and NOT the carton spec on products. A product's
-- box_length/width/height is what a full carton measures; a colli is whatever
-- actually got packed, which is a half-full carton as often as a full one, and
-- a carrier charges by what is on the pallet.

begin;

comment on column public.orders.colli_contents is
  'One entry per package: [{"items":[{"sku","name","qty"}],"weight_kg":12.5,"length_cm":40,"width_cm":30,"height_cm":25}]. weight_kg is the PACKAGING only — the bottles are added from products.weight_g (097). The three _cm keys are the outside of that one box; all four are optional. Array length = number of colli. Empty array = not packed yet.';

commit;
