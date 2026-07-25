-- 046: manager role + configurable permissions
--
-- Roles stop being hardcoded capability sets. An admin decides per role which
-- permissions it holds, on the Permissions screen. Admin is deliberately NOT
-- stored here: it always holds everything, so the owner can never tick herself
-- out of her own system.

alter type user_role add value if not exists 'manager';

create table if not exists public.role_permissions (
  role        text primary key,
  permissions text[] not null default '{}',
  updated_at  timestamptz not null default now()
);

alter table public.role_permissions enable row level security;

-- Everyone signed in may READ the matrix — the app needs it to decide what to
-- render. Only an admin may change it.
drop policy if exists "role_permissions: authenticated read" on public.role_permissions;
create policy "role_permissions: authenticated read"
  on public.role_permissions for select
  using (auth.uid() is not null);

drop policy if exists "role_permissions: admin write" on public.role_permissions;
create policy "role_permissions: admin write"
  on public.role_permissions for all
  using (public.current_user_role() = 'admin')
  with check (public.current_user_role() = 'admin');

-- Seed with what the app does TODAY, so switching to permissions changes no
-- behaviour until an admin edits the matrix.
insert into public.role_permissions (role, permissions) values
  ('manager', array[
    'prices.view','reports.view','audit.view',
    'customers.view','customers.edit','leads.view',
    'orders.view','orders.create','orders.approve','orders.edit_items','quotations.view',
    'deliveries.own','deliveries.all',
    'products.view','stock.view','salesdocs.view','tasks.view','storelocator.view'
  ]),
  ('sales', array[
    'orders.create',
    'deliveries.own'
  ])
on conflict (role) do nothing;

-- Server-side counterpart of can(). Admin always true; other roles look their
-- permissions up. Used by RLS policies so the matrix is enforced by the
-- database, not just hidden in the interface.
create or replace function public.has_permission(perm text)
returns boolean language sql security definer stable as $$
  select case
    when public.current_user_role() = 'admin' then true
    else coalesce(
      (select perm = any(permissions)
       from public.role_permissions
       where role = public.current_user_role()),
      false
    )
  end;
$$;
