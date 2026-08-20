-- 101: POS material rides on the transport, and a box arrives on its own day
--
-- Two things Danique named on 2026-08-19, both of which the load could not
-- express because they were only ever asked of an ORDER.
--
-- 1. POS material.
--    "stel we hebben een transport waar we het niet linken aan een order, dan
--     moeten we nogsteeds POS materiaal kunnen selecteren om mee te sturen."
--    Until now a stand or a box of wobblers was a EUR 0 line on an order, which
--    is why it reached the packing list at all. A transport with no order on it
--    therefore had nowhere to put one — and a stock transfer to our own
--    warehouse is exactly the load that carries display material.
--
-- 2. Arrival, per box.
--    "zo hebben we 3 colli verscheept 3 weken geleden en 1 colli hebben we na
--     20 dagen ontvangen de andere pas na 23 dagen en de andere is nog steeds
--     zoek."
--    `transports.arrived_at` is ONE moment for a whole load, so it can only say
--    "it got there" — a lie while one box is still at sea and another is gone.
--    ETD and ETA are what we expected; ATA is what happened, and it happens per
--    colli.
--
-- The per-box date lives inside `colli_contents`, next to the box it describes,
-- rather than in a table of its own: a colli has no id, it IS its position in
-- that array, and a second table keyed on an array index is a gap waiting to
-- happen. `transports.arrived_at` stays exactly as it is — the moment the load
-- was signed in — so nothing that reads it changes meaning.

begin;

alter table public.transports
  add column if not exists pos_items jsonb not null default '[]'::jsonb;

comment on column public.transports.pos_items is
  'POS material travelling on this transport, independent of any order: [{"sku","name","qty"}]. Printed on the packing list beside the POS material that rides along on the orders. A transport with no orders can still carry it.';

comment on column public.transports.colli_contents is
  'One entry per package on this transport: [{"items":[{"sku","name","qty"}],"weight_kg","length_cm","width_cm","height_cm","for_order_id","ata","ata_note"}]. Array length = number of colli. for_order_id is which order the box was packed for — for our own screens only, NEVER printed on a document or encoded in a QR. ata is the day THAT box actually arrived (null = still out); boxes of one load arrive on different days and some never do.';

commit;
