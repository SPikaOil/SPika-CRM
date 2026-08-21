-- 111: the short code in a batch number is the first three letters.
--
-- Her rule, 2026-08-21: "ja korte code, pak altijd de eerste 3 letters van
-- desbetreffende warehouse."
--
-- Migration 110 started every code off as the full name so nothing had to be
-- filled in before intake batches worked. That gave SPGE22-20260722-NBC010
-- where she wrote SPGE22-20260722-NBC. Three letters it is, and the field stays
-- editable for the day two warehouses start with the same three.

begin;

update public.transport_locations
   set code = upper(left(name, 3))
 where code is null or code = '' or code = name;

commit;
