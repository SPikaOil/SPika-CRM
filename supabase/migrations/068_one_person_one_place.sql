-- 068: one person, one place — and sales staff hold stock too
--
-- Two corrections to migration 066, both found by Danique on 2026-08-14 walking
-- through a warehouse-to-warehouse move.
--
-- 1. A HANDOVER DERIVES ITS DESTINATION FROM THE PERSON. You pick Jan, and the
--    app knows the bottles are going to Rotterdam — there is deliberately no
--    separate destination field, because a field you can set independently is a
--    field you can set wrong. That only holds if a person is tied to exactly one
--    place. Nothing stopped Jan from being linked to Rotterdam AND Antwerp, and
--    then "where is this going" has no answer. Hence the unique index.
--
-- 2. SALES STAFF HOLD STOCK AS WELL. 066 allowed only the warehouse role, which
--    was the right instinct — "het moet niet kunnen dat ik gewoon who ever kan
--    invullen, want anders ben je de controle kwijt uit deze app". But a sales
--    member driving around the Netherlands with bottles in the boot is holding
--    stock just as much as a warehouse is, and a user has one role, so making
--    them 'warehouse' would strip their sales rights.
--
--    So the gate widens by exactly one role and no further. Customers, prospects
--    and portal logins stay out, which is what the rule was protecting.

begin;

-- One person, one place. Partial, so any number of unmanned addresses may exist.
create unique index if not exists transport_locations_one_per_user
  on public.transport_locations (user_id)
  where user_id is not null;

create or replace function public.guard_location_is_warehouse_member()
returns trigger language plpgsql security definer as $$
declare
  their_role text;
begin
  if new.user_id is null then
    return new;
  end if;

  select role::text into their_role from public.users where id = new.user_id;

  -- Whoever may physically hold our bottles. Nobody else, ever.
  if their_role is null or their_role not in ('warehouse', 'sales') then
    raise exception
      'Only a warehouse or sales member can be put in charge of a location (this user is %)',
      coalesce(their_role, 'unknown');
  end if;

  return new;
end;
$$;

comment on function public.guard_location_is_warehouse_member() is
  'A location may only be handed to somebody who actually holds stock: a warehouse member or a sales member. The screen offers no one else either, but a screen can be worked around and this cannot.';

commit;
