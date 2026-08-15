-- 071: the old export tables go
--
-- `exports` and `export_documents` were replaced by `transports` in migration
-- 054. Migration 053 had already locked them down after finding them wide open
-- to every portal login since migration 002. Since then they have been carrying
-- nothing: as of 2026-08-15 no screen, no hook and no helper touches them.
--
-- The last three references were removed in the same commit as this migration:
--   src/hooks/use-exports.ts        deleted — 247 lines, zero imports
--   getNextExportNumber()           deleted — handed out NL20260501 numbers;
--                                   transports get theirs from the database
--   Export / ExportDocument types   deleted — described a table nobody reads
--
-- One live reference remained and is the reason this is a separate step:
-- exports.customer_id has a foreign key with no ON DELETE, so a row in there
-- BLOCKS deleting the customer it points at. That is how it surfaced — a
-- customer clean-up hit a table nobody knew was still holding anything.
--
-- RUN THE COUNT FIRST. If either number is not zero, look at what is in there
-- before dropping it: this is the only copy.
--
--   select
--     (select count(*) from public.exports)          as exports,
--     (select count(*) from public.export_documents) as export_documents;
--
-- Uploaded customs files are NOT touched by this. They live in the
-- export-documents storage bucket, which migration 054's transport documents
-- still use. Only the database rows pointing at them go.

begin;

drop table if exists public.export_documents;
drop table if exists public.exports;

commit;
