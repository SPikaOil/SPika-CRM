-- 066: a warehouse location belongs to somebody
--
-- Until now transport_locations was an ADDRESS and nothing more: name, street,
-- zip, city, country. So "the stock at Jan in Rotterdam" could not exist — there
-- was no Jan, only a street. Nobody could sign a transport in, nobody could be
-- given an order, and nobody could be shown only their own goods.
--
-- Danique, 2026-08-14: "zou bij warehouse enkel een warehouse medewerker moeten
-- kunnen uitkiezen (...) het moet niet kunnen dat ik gewoon who ever kan
-- invullen, want anders ben je de controle kwijt uit deze app."
--
-- So the link is guarded in the DATABASE, not only greyed out in a dropdown. A
-- screen can be worked around; a trigger cannot.
--
-- A location may still have nobody: an unmanned drop address, or a warehouse
-- whose member has not been created yet. What it may never have is somebody who
-- is not a warehouse member.

begin;

alter table public.transport_locations
  add column if not exists user_id uuid references public.users(id) on delete set null;

comment on column public.transport_locations.user_id is
  'The warehouse member responsible for this place. Only a user with role warehouse may be linked — enforced by the trigger below. Null = an unmanned address.';

create index if not exists transport_locations_user_idx
  on public.transport_locations (user_id);

create or replace function public.guard_location_is_warehouse_member()
returns trigger language plpgsql security definer as $$
declare
  their_role text;
begin
  if new.user_id is null then
    return new;
  end if;

  select role::text into their_role from public.users where id = new.user_id;

  if their_role is distinct from 'warehouse' then
    raise exception
      'Only a warehouse member can be put in charge of a location (this user is %)',
      coalesce(their_role, 'unknown');
  end if;

  return new;
end;
$$;

drop trigger if exists transport_locations_guard_member on public.transport_locations;
create trigger transport_locations_guard_member
  before insert or update on public.transport_locations
  for each row execute function public.guard_location_is_warehouse_member();

-- A warehouse member reads the places and the goods. They write nothing here:
-- who is in charge of which location is an admin decision.
drop policy if exists "transport_locations: warehouse read" on public.transport_locations;
create policy "transport_locations: warehouse read"
  on public.transport_locations for select
  to authenticated
  using (public.is_staff() or public.current_user_role()::text = 'warehouse');

commit;
