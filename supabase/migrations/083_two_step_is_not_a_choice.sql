-- 083: WITHDRAWN. Two-step stays a per-person decision.
--
-- This migration originally forced two-step verification on for every internal
-- account and flipped the column default to true, on the reading that "verplicht
-- voor iedereen" meant the app should decide.
--
-- It was never run, and that is just as well: she corrected it on 2026-08-19 —
-- "2fa hebben we volgens mij nooit doorgevoerd als harde regel (...) Admin
-- bepaalt wie dat wel MOET."
--
-- Which is what migration 075 already built: mfa_required per user, switched on
-- from the Team screen by an admin and nobody else. Measured before rewriting
-- this file — every row still reads false, so nothing was forced on anyone and
-- there is nothing to undo.
--
-- Left in place rather than deleted so the number keeps its meaning in the
-- history, and so nobody rebuilding this database from 001 upwards silently
-- gets a rule she decided against. It does nothing on purpose.

begin;

comment on column public.users.mfa_required is
  'Two-step verification is required on this account. An admin decides this per person from the Team screen (075). Deliberately NOT on by default — her decision, 2026-08-19.';

commit;
