-- 097: one product, two HS codes.
--
-- Her instruction of 2026-08-19: "Er zijn namelijk 2 verschillende HS codes voor
-- een zelfde item. Namelijk eentje voor Europa en eentje voor USA. Die
-- verschillen. (...) dat facturen de HS code pakken adhv land waar het heengaat."
--
-- The same bottle is classified differently by the two customs authorities, so
-- the code is not a property of the product alone — it is a property of the
-- product AND where it is going. Two columns rather than one, and the commercial
-- invoice picks by the destination of the transport.
--
-- Which one is picked: US for a transport going to the United States, EU for
-- everything else. Stated here because it is a decision and not a fact — she
-- named two codes, so there are two, and every other destination we ship to
-- today (Netherlands, Germany, Belgium, Bonaire, Aruba, Sint Maarten) is served
-- by the European classification. A third market means a third column and this
-- comment is where to start.
--
-- Empty prints empty. A product with no code for the destination leaves the
-- cell blank on the invoice — her rule of today: what is not filled in stays
-- empty, and the column stays because it does get filled in.

begin;

alter table public.products
  add column if not exists hs_code_eu text,
  add column if not exists hs_code_us text;

comment on column public.products.hs_code_eu is
  'HS / customs tariff code used for shipments to Europe. Printed on the commercial invoice when the transport is not going to the United States.';
comment on column public.products.hs_code_us is
  'HS / customs tariff code used for shipments to the United States. Printed on the commercial invoice when the transport is going there.';

commit;
