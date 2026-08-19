-- 091: a note on a transport that the packing list actually prints.
--
-- NOT RUN YET.
--
-- Her note, 2026-08-16: sending extra labels and stickers with a shipment, just
-- in case, and there is nowhere to say so on the paperwork.
--
-- transports.notes already exists and she has already used it — checked on
-- 20260801, which reads:
--
--   "Back Order Fenix (cavalier drama shipment cover)"
--
-- Which is exactly why that field cannot be the one that gets printed. It is
-- labelled "Internal notes" on the screen, it has been used as internal notes,
-- and turning it into a customer-facing line would put that sentence on a
-- document going to the Netherlands.
--
-- So: a second field. The internal one stays internal, this one goes on the
-- packing list under the goods, where "3 extra label sheets enclosed" belongs.

begin;

alter table public.transports
  add column if not exists notes_on_documents text not null default '';

comment on column public.transports.notes_on_documents is
  'Printed on the packing list, under the goods. For things the receiver must read. Keep anything internal in notes.';

comment on column public.transports.notes is
  'INTERNAL. Never printed on a document — see notes_on_documents for that.';

commit;
