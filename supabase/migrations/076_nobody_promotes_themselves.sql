-- SECURITY FIX. Run this one first.
--
-- Found on 2026-08-16 while checking whether a team member could switch off a
-- required second factor. They could — and far worse.
--
-- Signed in as the Marketing test account (no admin rights), a plain REST call
-- against its OWN row succeeded:
--
--   PATCH /rest/v1/users?id=eq.<self>   {"role":"admin"}        -> 200 OK
--   PATCH /rest/v1/users?id=eq.<self>   {"is_active":true}      -> 200 OK
--   PATCH /rest/v1/users?id=eq.<self>   {"customer_id":"..."}   -> 200 OK
--
-- So ANY signed-in account — a sales member, a marketing member, a portal
-- CUSTOMER — could make itself an administrator from a browser console. It also
-- meant a deactivated account could switch itself back on, and that requiring
-- two-step verification would have been pointless: the flag sits on this table.
--
-- The migrations never allowed this: 001 defines update as admin-only. The
-- permissive rule was added by hand in the dashboard at some point and lives
-- nowhere in this repo. That is why this drops EVERY policy on the table by
-- name and rebuilds the intended four, instead of dropping one it can guess.
--
-- Nothing in the app writes to public.users from the browser: every write goes
-- through a server route on the service-role key, which bypasses RLS. Closing
-- this breaks nothing — verified against /api/ping, the admin user routes, the
-- portal invite, onboarding and access-request routes.

begin;

do $$
declare pol record;
begin
  for pol in
    select policyname from pg_policies
    where schemaname = 'public' and tablename = 'users'
  loop
    execute format('drop policy if exists %I on public.users', pol.policyname);
  end loop;
end $$;

alter table public.users enable row level security;

-- You may read your own row — the app needs it to know who you are.
create policy "users: read own row"
  on public.users for select
  using (id = auth.uid());

-- An admin may read everyone, for the Team page.
create policy "users: admin read all"
  on public.users for select
  using (public.current_user_role() = 'admin');

-- Creating, changing and removing accounts is admin work only. Server routes
-- use the service-role key and are not affected by any of this.
create policy "users: admin insert"
  on public.users for insert
  with check (public.current_user_role() = 'admin');

create policy "users: admin update"
  on public.users for update
  using (public.current_user_role() = 'admin');

create policy "users: admin delete"
  on public.users for delete
  using (public.current_user_role() = 'admin');

commit;
