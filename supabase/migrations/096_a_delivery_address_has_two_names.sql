-- 096: a delivery address has two names, and only one of them is printed.
--
-- Her correction of 2026-08-19, on top of 095:
--
--   "WEL naam op pakbon, maar we hebben Displayname en naam, zodat wij bijv
--    kunnen zeggen Warehouse NL 1, maar dat DAT niet op pakbon komt. Wel een
--    naam bijv NBC of gewoon naam van persoon."
--
-- So:
--
--   label  DISPLAY NAME. How we recognise the address in the app — "Warehouse
--          NL 1", "DPD Rotterdam". Ours, internal, never on a document.
--   name   The name the goods are addressed to at that door — "NBC", or simply
--          a person. THIS is what goes on the packing list, above the street.
--
-- 095 had only `label` and printed the bare street, which is a delivery address
-- with nobody's name on it. A carrier needs a name at the door.
--
-- Left empty, nothing is printed above the street — that stays honest rather
-- than falling back to the warehouse's own display name, which is exactly the
-- thing she does not want on the paper.

begin;

alter table public.warehouse_delivery_addresses
  add column if not exists name text not null default '';

comment on column public.warehouse_delivery_addresses.name is
  'The name the goods are addressed to at this door, e.g. "NBC" or a person. PRINTED on the packing list above the street. Not the same as `label`, which is our own display name and is never printed.';

comment on column public.warehouse_delivery_addresses.label is
  'DISPLAY NAME — in-app only, e.g. "Warehouse NL 1" or "DPD Rotterdam". How we pick this address out of a list. NEVER printed on a packing list or any other document. Her instruction, 2026-08-19. The printed name is `name`.';

commit;
