-- 093: who works at which warehouse.
--
-- NOT RUN YET.
--
-- Her decision, 2026-08-16: an admin says in Settings which team members work
-- at which warehouse. They each get their own login, and they all see the same
-- thing when they open the Warehouse tab — their own place, and only that.
--
-- This does NOT replace transport_locations.user_id from 066. That is the one
-- person in CHARGE: the name a transport is signed in against, guarded by a
-- trigger that refuses anyone who is not a warehouse member. Being in charge
-- and working there are different facts, and a place can have four of the
-- second and none of the first.
--
-- Curaçao is location_id NULL here as it is everywhere else, so somebody can
-- work at Curaçao without it having to become a row in a table that is
-- otherwise a list of foreign addresses. That costs a nullable column in a key,
-- so the uniqueness is two partial indexes rather than a primary key over both
-- — Postgres does not consider two NULLs equal, and without this the same
-- person could be added to Curaçao any number of times.

begin;

create table if not exists public.warehouse_members (
  id          uuid primary key default gen_random_uuid(),
  created_at  timestamptz not null default now(),

  user_id     uuid not null references public.users(id) on delete cascade,
  -- NULL = Curaçao.
  location_id uuid references public.transport_locations(id) on delete cascade,

  created_by  uuid references public.users(id) on delete set null
);

comment on table public.warehouse_members is
  'Which team members work at which warehouse. location_id NULL = Curacao. Separate from transport_locations.user_id, which is the single person in charge.';

create unique index if not exists warehouse_members_unique
  on public.warehouse_members (user_id, location_id)
  where location_id is not null;

create unique index if not exists warehouse_members_unique_home
  on public.warehouse_members (user_id)
  where location_id is null;

create index if not exists warehouse_members_location_idx
  on public.warehouse_members (location_id);

alter table public.warehouse_members enable row level security;

-- ── Who may see and change this ───────────────────────────────────────────
--
-- Everyone on the team may READ it: the Warehouse tab has to know which places
-- to show you, and that answer is about you. Only an admin may change it —
-- deciding who has access to which stock is exactly the kind of thing that
-- belongs on one desk. It follows team.manage, the permission that already
-- means "decide what people can do".

select public.reset_policies('warehouse_members');
create policy "warehouse members: read" on public.warehouse_members for select
  using (public.is_team());
create policy "warehouse members: write" on public.warehouse_members for all
  using (public.has_perm('team.manage')) with check (public.has_perm('team.manage'));

commit;
