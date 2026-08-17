-- 083: two-step verification is mandatory for the team, not offered to it.
--
-- NOT RUN YET.
--
-- Her decision, 2026-08-16: "niemand mag dat vrijwillig aanzetten, dat is
-- verplicht voor iedereen en enkel admin zou desnoods dat kunnen bepalen."
--
-- 075 gave an admin the switch. It never turned it on. Measured today:
--
--   account                      role       mfa_required   authenticator
--   artisanspikaoil@gmail.com    admin      false          YES
--   d.wassink@icloud.com         sales      false          no
--   hello@spikaoil.nl            admin      false          no
--   info@vantyze.com             sales      false          no
--   kyle-bouman@outlook.com      sales      false          no
--   marketing-test@example.com   marketing  false          no
--
-- The owner set hers up by hand. Nobody else has one, because nobody was ever
-- required to. The flag existed and sat at false on every row.
--
-- Requiring it on today's rows is the easy half. The half that keeps it true is
-- the trigger: a role decides this, not whoever happens to write the row. Five
-- places create accounts — the admin team screen, two portal invite routes, the
-- onboarding route and the access-request approval — and relying on each of
-- them to remember a flag is how it drifts. It is derived instead:
--
--   internal role  →  required
--   customer, prospect  →  not required
--
-- Portal accounts get the 12-character password rule and nothing more. A
-- reseller is not going to carry an authenticator for us.
--
-- Nothing locks anyone out. Someone required but not yet enrolled is sent to
-- /security to set it up, checked against the live factor list, so switching it
-- off later frees them immediately. An admin can still clear the flag for one
-- person from the Team screen; the trigger only fires on insert.

begin;

alter table public.users
  alter column mfa_required set default true;

comment on column public.users.mfa_required is
  'Two-step verification is required on this account. Derived from the role on insert by require_two_step_for_team(); an admin may override it afterwards from the Team screen. Enforced in the app against the live factor list.';

create or replace function public.require_two_step_for_team()
returns trigger language plpgsql as $$
begin
  new.mfa_required := new.role::text not in ('customer', 'prospect');
  return new;
end $$;

comment on function public.require_two_step_for_team is
  'Two-step follows the role at creation, so no account-creating route has to remember it.';

drop trigger if exists users_require_two_step on public.users;
create trigger users_require_two_step
  before insert on public.users
  for each row execute function public.require_two_step_for_team();

-- Today's rows. Inactive accounts included on purpose: one that is switched
-- back on must not come back without it.
update public.users
   set mfa_required = (role::text not in ('customer', 'prospect'));

commit;
