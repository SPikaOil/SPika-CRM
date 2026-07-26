-- 049: give the generated reports a bucket of their own
--
-- The period reports (PDF, workbook, flat CSV and the complete database backup)
-- were being written to pod-files/reports/. That bucket also holds every signed
-- invoice, and its read policy allows the object's owner as well as admins —
-- which is right for delivery proof but far too wide for a file containing the
-- entire customer base.
--
-- crm-reports gets NO policies at all. Without a policy, RLS denies every
-- authenticated and anonymous request, so only the service-role key can read or
-- write here — and the only thing holding that key is the report route, which
-- checks for an admin session or the cron secret before it does anything.

insert into storage.buckets (id, name, public)
values ('crm-reports', 'crm-reports', false)
on conflict (id) do nothing;
