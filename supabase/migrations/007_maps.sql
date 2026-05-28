-- Custom maps
create table if not exists maps (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  description text,
  markers     jsonb not null default '[]',
  created_by  uuid references auth.users(id),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

alter table maps enable row level security;

-- All authenticated users can read and create/edit maps
create policy "maps_select" on maps
  for select to authenticated using (true);

create policy "maps_insert" on maps
  for insert to authenticated with check (true);

create policy "maps_update" on maps
  for update to authenticated using (true);

create policy "maps_delete" on maps
  for delete to authenticated
  using (
    created_by = auth.uid() or
    exists (select 1 from profiles where id = auth.uid() and role = 'admin')
  );
