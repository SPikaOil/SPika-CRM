-- 047: the last admin can never be removed
--
-- Only an admin may change roles or deactivate accounts, so demoting or
-- switching off the final admin leaves a system nobody can administer — and
-- nobody who could undo it. The API already refuses this, but the API is not
-- the only way rows get written (service key, SQL editor, a future script), so
-- the rule belongs in the database where nothing can route around it.

create or replace function public.protect_last_admin()
returns trigger language plpgsql as $$
declare
  remaining int;
begin
  -- Only care when an active admin stops being an active admin
  if old.role = 'admin' and old.is_active
     and (new.role <> 'admin' or new.is_active = false) then

    select count(*) into remaining
    from public.users
    where role = 'admin' and is_active and id <> old.id;

    if remaining = 0 then
      raise exception
        'Refusing to remove the last admin (%). Promote another admin first.', old.email
        using errcode = 'check_violation';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_protect_last_admin on public.users;
create trigger trg_protect_last_admin
  before update on public.users
  for each row execute function public.protect_last_admin();

-- Deleting the row is the other way to lose your last admin.
create or replace function public.protect_last_admin_delete()
returns trigger language plpgsql as $$
declare
  remaining int;
begin
  if old.role = 'admin' and old.is_active then
    select count(*) into remaining
    from public.users
    where role = 'admin' and is_active and id <> old.id;

    if remaining = 0 then
      raise exception
        'Refusing to delete the last admin (%). Promote another admin first.', old.email
        using errcode = 'check_violation';
    end if;
  end if;

  return old;
end;
$$;

drop trigger if exists trg_protect_last_admin_delete on public.users;
create trigger trg_protect_last_admin_delete
  before delete on public.users
  for each row execute function public.protect_last_admin_delete();
