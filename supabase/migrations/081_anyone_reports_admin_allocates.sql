-- 081: anyone on the team may raise work. Only the admin hands it out.
--
-- NOT RUN YET.
--
-- Her decisions, 2026-08-16:
--   "men mag wel een taak aanmaken, maar toch admin gaat die na en alloceert
--    die desnoods aan een persoon"
--   "Sales en warehouse hoeven ook niets toe te wijzen, enkel manager en admin"
--   "zoals bij taken, kan maken, admin alloceert voor nu, echter zet dit stukje
--    erbij bij permissions, zodat ik dat later wel kan toevoegen als punt van
--    een manager"
--
-- So raising work and handing it out become two different acts:
--
--   raising a task    →  tasks.create   (every internal role)
--   raising an order  →  orders.create  (unchanged)
--   putting a name on it  →  work.assign
--
-- work.assign is seeded to NOBODY. Admin holds it because admin holds
-- everything, and the switch sits on the Permissions screen so a manager can be
-- given it the day she decides to. That is the whole point of routing this
-- through permissions instead of naming a role.
--
-- Row-level security cannot gate a single COLUMN — it decides per row, not per
-- field. A policy that lets sales write an order lets them write its
-- assigned_to as well. So the column is guarded by a trigger, the only tool
-- that sees what actually changed.

begin;

-- ── Raising work: everyone. Handing it out: nobody yet ────────────────────

update public.role_permissions
   set permissions = array(select distinct unnest(permissions || array['tasks.create'])),
       updated_at = now()
 where role in ('manager', 'sales', 'warehouse', 'marketing');

-- work.assign is deliberately not seeded. Tick it for manager on the
-- Permissions screen when the moment comes; the database follows immediately.

-- ── The guard on tasks and orders ─────────────────────────────────────────

create or replace function public.guard_assignment()
returns trigger language plpgsql security definer as $$
begin
  if tg_op = 'INSERT' then
    if new.assigned_to is not null and not public.has_perm('work.assign') then
      raise exception 'Only an admin can assign this to someone. Leave it unassigned and it will be allocated.'
        using errcode = '42501';
    end if;
  elsif new.assigned_to is distinct from old.assigned_to
        and not public.has_perm('work.assign') then
    raise exception 'Only an admin can change who this is assigned to'
      using errcode = '42501';
  end if;
  return new;
end $$;

comment on function public.guard_assignment is
  'Column-level guard on assigned_to. RLS works per row and cannot do this.';

drop trigger if exists tasks_guard_assignment on public.tasks;
create trigger tasks_guard_assignment
  before insert or update on public.tasks
  for each row execute function public.guard_assignment();

drop trigger if exists orders_guard_assignment on public.orders;
create trigger orders_guard_assignment
  before insert or update on public.orders
  for each row execute function public.guard_assignment();

-- ── The guard on delivery runs ────────────────────────────────────────────
--
-- A delivery run is different from a task or an order: it is a RECORD of who
-- carried the goods, written by the person standing at the door. Two names are
-- therefore always allowed, even without work.assign:
--
--   - the one the admin already put on the order (the run inherits it)
--   - yourself (someone covering for a colleague must be able to say so)
--
-- Anything else is handing work to another person, and that needs the
-- permission. Without this carve-out the delivery flow would refuse its own
-- insert, because the run copies orders.assigned_to on the way in.
create or replace function public.guard_delivery_assignment()
returns trigger language plpgsql security definer as $$
declare order_assignee uuid;
begin
  if public.has_perm('work.assign') then return new; end if;
  if new.assigned_to is null or new.assigned_to = auth.uid() then return new; end if;

  select assigned_to into order_assignee from public.orders where id = new.order_id;
  if new.assigned_to is distinct from order_assignee then
    raise exception 'Only an admin can put someone else on this delivery'
      using errcode = '42501';
  end if;
  return new;
end $$;

drop trigger if exists deliveries_guard_assignment on public.deliveries;
create trigger deliveries_guard_assignment
  before insert or update on public.deliveries
  for each row execute function public.guard_delivery_assignment();

-- ── Tasks: who may raise one, who may see it back ─────────────────────────
--
-- created_by is in the read rule on purpose. Without it someone could raise a
-- task and then not see it — tasks.view is not theirs, and assigned_to is empty
-- until an admin fills it in. They would be reporting into a void.
select public.reset_policies('tasks');
create policy "tasks: read" on public.tasks for select
  using (public.has_perm('tasks.view') or assigned_to = auth.uid() or created_by = auth.uid());
create policy "tasks: insert" on public.tasks for insert
  with check (public.has_perm('tasks.create') or public.has_perm('tasks.view'));
create policy "tasks: update" on public.tasks for update
  using (public.has_perm('tasks.view') or assigned_to = auth.uid());
create policy "tasks: delete" on public.tasks for delete
  using (public.has_perm('tasks.view'));

commit;
