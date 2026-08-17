-- 084: portal_invited_at was written to a column that does not exist.
--
-- NOT RUN YET.
--
-- Found while tracing who had removed a portal login. The invite route writes
-- the moment an invite goes out:
--
--   admin.from('customers').update({ portal_invited_at: new Date()... })
--
-- and the revoke route clears it again. Neither checks the result, and the
-- column is not there — migration 018 declares it but was never applied to this
-- database. So both writes fail silently, and Portal Management never shows
-- "Invited [date]" next to a customer no matter how often you send one.
--
-- Third time today the same shape turned up: a screen reading something that
-- was never created. The other two were `profiles` (a table that does not
-- exist, on portal Support) and customers.assigned_to (fixed in 080).
--
-- 018 is left alone rather than re-run: it belongs to a migration that has
-- already been marked as applied, and repeating it would say something untrue
-- about the history. This adds the column where it should have been.

begin;

alter table public.customers
  add column if not exists portal_invited_at timestamptz;

comment on column public.customers.portal_invited_at is
  'When a portal invite was last sent. Cleared when access is revoked. Shown on Portal Management.';

commit;
