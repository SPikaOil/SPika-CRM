-- 041: store locator pins (one customer can have several physical locations)

create table if not exists public.store_locations (
  id           uuid primary key default gen_random_uuid(),
  customer_id  uuid references public.customers(id) on delete set null,
  name         text not null,               -- display name on the map pin
  address      text not null default '',
  lat          double precision not null,
  lng          double precision not null,
  category     text not null default '',    -- e.g. supermarket, restaurant, hotel
  link_url     text not null default '',    -- optional website / Google Maps link
  active       boolean not null default true, -- show on the public locator
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index if not exists store_locations_active_idx on public.store_locations (active);

alter table public.store_locations enable row level security;

-- Public (anon) can read only active pins — this is what the website map fetches
drop policy if exists "public read active locations" on public.store_locations;
create policy "public read active locations" on public.store_locations
  for select to anon using (active = true);

-- Staff can read everything
drop policy if exists "staff read locations" on public.store_locations;
create policy "staff read locations" on public.store_locations
  for select to authenticated using (true);

-- Admins manage
drop policy if exists "admin manage locations" on public.store_locations;
create policy "admin manage locations" on public.store_locations
  for all to authenticated
  using (exists (select 1 from public.users u where u.id = auth.uid() and u.role = 'admin'))
  with check (exists (select 1 from public.users u where u.id = auth.uid() and u.role = 'admin'));
