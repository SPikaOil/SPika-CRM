-- A Marketing team role.
--
-- NOT RUN YET. Run this BEFORE 072, or at least before creating a Marketing
-- user — the Team page cannot save a role the enum does not know.
--
-- Her rule: only Admin adds or changes marketing assets, plus one team member
-- with a Marketing role. Everyone else, no.
--
-- What this role does NOT get: customers, orders, prices, deliveries, reports.
-- That is not a hidden menu item — `public.is_staff()` deliberately does not
-- include 'marketing', so the policies from migration 050 refuse those tables
-- outright. Publishing rights live in `public.can_manage_marketing()` (072).

-- Outside the transaction: Postgres refuses a new enum value that is used in
-- the same transaction it was added in. Migration 055 added 'warehouse' the
-- same way.
alter type user_role add value if not exists 'marketing';

begin;

-- Close a self-registration hole while we are here.
--
-- The guard refused 'admin', 'sales', 'manager' and 'staff', but NOT
-- 'warehouse' — so anyone signing up could have asked for a role that signs
-- goods in. 'marketing' would have had the same gap. The list is now every
-- internal role, so the only way in is an admin creating the account on the
-- Team page.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  requested text;
  final_role public.user_role;
begin
  requested := new.raw_user_meta_data ->> 'role';

  if requested is null
     or requested in ('admin', 'sales', 'manager', 'staff', 'warehouse', 'marketing') then
    final_role := 'prospect';
  else
    begin
      final_role := requested::public.user_role;
    exception when others then
      final_role := 'prospect';
    end;
  end if;

  insert into public.users (id, email, name, role)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'name', ''),
    final_role
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

-- Seed the row so the Marketing column on the Permissions screen shows its two
-- ticks straight away. The app also falls back to the defaults for a role with
-- no row, so this is belt and braces — but without it the screen would show an
-- empty column while the role actually works, which reads as broken.
insert into public.role_permissions (role, permissions)
values ('marketing', array['marketing.view', 'marketing.manage'])
on conflict (role) do nothing;

commit;
