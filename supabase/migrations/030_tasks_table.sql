-- Ensure tasks table exists with correct structure and FK constraints
-- (table may have been created manually without FKs, causing PostgREST joins to fail)

create table if not exists public.tasks (
  id           uuid primary key default gen_random_uuid(),
  customer_id  uuid references public.customers(id) on delete cascade,
  assigned_to  uuid references public.users(id) on delete set null,
  title        text not null,
  description  text not null default '',
  frequency    text not null default 'once',
  due_date     date,
  completed_at timestamptz,
  created_by   uuid not null references public.users(id),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

-- Add FK constraints if the table already existed without them
do $$
begin
  if not exists (
    select 1 from information_schema.table_constraints
    where table_name = 'tasks' and constraint_name = 'tasks_customer_id_fkey'
  ) then
    alter table public.tasks
      add constraint tasks_customer_id_fkey
      foreign key (customer_id) references public.customers(id) on delete cascade;
  end if;

  if not exists (
    select 1 from information_schema.table_constraints
    where table_name = 'tasks' and constraint_name = 'tasks_assigned_to_fkey'
  ) then
    alter table public.tasks
      add constraint tasks_assigned_to_fkey
      foreign key (assigned_to) references public.users(id) on delete set null;
  end if;

  if not exists (
    select 1 from information_schema.table_constraints
    where table_name = 'tasks' and constraint_name = 'tasks_created_by_fkey'
  ) then
    alter table public.tasks
      add constraint tasks_created_by_fkey
      foreign key (created_by) references public.users(id);
  end if;
end $$;

-- Enable RLS (idempotent)
alter table public.tasks enable row level security;

-- Drop old broad policy if it exists, replace with proper ones
drop policy if exists "Authenticated users can manage tasks" on public.tasks;

create policy if not exists "tasks: authenticated read"
  on public.tasks for select
  using (auth.uid() is not null);

create policy if not exists "tasks: authenticated insert"
  on public.tasks for insert
  with check (auth.uid() is not null);

create policy if not exists "tasks: authenticated update"
  on public.tasks for update
  using (auth.uid() is not null);

create policy if not exists "tasks: admin delete"
  on public.tasks for delete
  using (public.current_user_role() = 'admin');

-- updated_at trigger
create or replace function public.set_tasks_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_updated_at_tasks on public.tasks;
create trigger set_updated_at_tasks
  before update on public.tasks
  for each row execute function public.set_tasks_updated_at();
