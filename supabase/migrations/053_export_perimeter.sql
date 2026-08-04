-- 053: close the export perimeter
--
-- SECURITY FIX. exports and export_documents have carried
-- "for all to authenticated using (true)" since migration 002, and they are the
-- two tables migration 050 missed when it put portal customers outside the
-- staff perimeter. Any portal login could read, change and delete every export
-- of every customer, and the uploaded customs documents were served from public
-- storage URLs (getPublicUrl, no signature).
--
-- Verified before writing this: nothing under src/app/portal queries exports or
-- export_documents, so staff-only cannot break a portal page.
--
-- Both tables are emptied and replaced by `transports` in migration 054, but
-- they are locked down here first: 054 leaves them in place, and an empty table
-- with a wide-open policy is still a wide-open policy.
--
-- The export-documents BUCKET stays in use — migration 054's transport
-- documents are stored in it — so making it private and giving staff a real
-- policy is not throw-away work.
--
-- Same conventions as 050: each policy name carries the command it covers
-- (a name must be unique per TABLE, not per command — otherwise 42710), old
-- names are dropped first so this is re-runnable, and it sits in a transaction.

begin;

drop policy if exists "exports_all"                    on public.exports;
drop policy if exists "exports: staff only"            on public.exports;
drop policy if exists "export_documents_all"           on public.export_documents;
drop policy if exists "export_documents: staff only"   on public.export_documents;

create policy "exports: staff only"
  on public.exports for all
  to authenticated
  using (public.is_staff())
  with check (public.is_staff());

create policy "export_documents: staff only"
  on public.export_documents for all
  to authenticated
  using (public.is_staff())
  with check (public.is_staff());

-- ── Take the uploaded documents off public storage ───────────────────────────
-- The bucket was created by hand in the dashboard and appears in no migration,
-- so it is created here if it is missing and forced private either way.
-- Staff need select on the objects because the app now hands out a 10-minute
-- signed URL instead of a permanent public one.
insert into storage.buckets (id, name, public)
values ('export-documents', 'export-documents', false)
on conflict (id) do update set public = false;

drop policy if exists "export-documents: staff read"   on storage.objects;
drop policy if exists "export-documents: staff upload" on storage.objects;

create policy "export-documents: staff read"
  on storage.objects for select
  to authenticated
  using (bucket_id = 'export-documents' and public.is_staff());

create policy "export-documents: staff upload"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'export-documents' and public.is_staff());

commit;
