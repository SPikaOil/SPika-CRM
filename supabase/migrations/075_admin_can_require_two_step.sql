-- Let an admin REQUIRE two-step verification per team member.
--
-- NOT RUN YET.
--
-- Offering it was not enough: whether the CRM is protected then depends on
-- whether each person happens to bother. This flag lets the owner decide, and
-- the app blocks that person from doing anything else until they have set it up.
--
-- It does NOT lock anyone out. Someone with the flag and no authenticator yet
-- is sent to the setup screen, not to a dead end.

begin;

alter table public.users
  add column if not exists mfa_required boolean not null default false;

comment on column public.users.mfa_required is
  'Admin requires two-step verification on this account. Enforced in the app: the user is redirected to the setup screen until a verified factor exists.';

commit;
