-- 089: photos of the POS material, so people can see what they are getting.
--
-- NOT RUN YET.
--
-- Her note, 2026-08-16: a catalogue entry that only says "SPika stand — 12
-- bottles (one side)" tells you nothing about what turns up in the box. A
-- reseller asking for a display, and whoever packs it, both want to look at it.
--
-- Drive file ids, same as everything else here. Nothing new to learn: paste the
-- share link, parseDriveId() pulls the id out, driveThumbnail() renders it off
-- Google's CDN. An array because one photo of a rack is rarely enough — folded,
-- built, and standing in a shop are three different pictures.
--
-- Deliberately NOT the same field as asset_id. That one points at the PRINT
-- FILE — the artwork we send to the printer. This is a photograph of the
-- finished object. A wobbler has both and they are not interchangeable.
--
-- Same Drive caveat as 085, and here it does not matter: a photo of a shelf
-- display is not confidential, and it is meant to be looked at.

begin;

alter table public.pos_items
  add column if not exists photos text[] not null default '{}';

comment on column public.pos_items.photos is
  'Google Drive file ids showing what the item looks like. First one is used as the thumbnail. Not the print file — that is asset_id.';

commit;
