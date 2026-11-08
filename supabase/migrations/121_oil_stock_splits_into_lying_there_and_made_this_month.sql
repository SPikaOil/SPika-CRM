-- 121: olie per maand is twee getallen, niet één
--
-- Haar instructie van 03-11-2026: "ik wil 3 getallen per maand zien, namelijk
-- in stock, produced en total. Total is in stock plus produced (we hebben
-- altijd voorraad liggen van voorgaande maanden en dan nog olie die we de
-- maand ervoor hebben geproduceerd)".
--
-- `litres` blijft dus staan voor wat het altijd was: wat er al lag. Hier komt
-- alleen bij wat die maand gemaakt is. Het totaal wordt NIET opgeslagen — dat
-- is een optelsom, en een opgeslagen optelsom is een tweede waarheid die kan
-- gaan afwijken van de twee getallen eronder.
--
-- Bewust NULL en geen 0 als standaard: van de maanden van vóór vandaag weten we
-- niet wat er geproduceerd is, en een 0 zou beweren dat er niets gemaakt is.
-- Leeg betekent "niet ingevuld", nul betekent "niets geproduceerd".

begin;

alter table public.oil_stock
  add column if not exists produced_litres numeric;

comment on column public.oil_stock.litres is
  'Liters olie die al lagen aan het begin van deze maand. Niet het totaal.';

comment on column public.oil_stock.produced_litres is
  'Liters olie die deze maand geproduceerd zijn. NULL = niet ingevuld, 0 = er is niets gemaakt. Het totaal is litres + produced_litres en wordt nergens opgeslagen.';

-- Een negatief aantal liter bestaat niet.
alter table public.oil_stock
  drop constraint if exists oil_stock_produced_litres_not_negative;
alter table public.oil_stock
  add constraint oil_stock_produced_litres_not_negative
  check (produced_litres is null or produced_litres >= 0);

commit;

-- Controle: de kolom staat erop en de bestaande maanden zijn ongemoeid
select month, litres, produced_litres,
       coalesce(litres, 0) + coalesce(produced_litres, 0) as totaal
  from public.oil_stock
 order by month desc;
