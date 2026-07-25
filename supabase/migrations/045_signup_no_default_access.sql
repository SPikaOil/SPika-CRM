-- 045: a new auth account must never grant internal access
--
-- SECURITY FIX. handle_new_user() (migration 001) defaulted every new auth user
-- to role 'sales' — an INTERNAL team role. Combined with the public
-- self-registration page added later, that meant anyone who signed up received
-- a staff account, and the "authenticated read" policies let them read the whole
-- customer base. A bot did exactly that on 2026-07-25.
--
-- New accounts now default to 'prospect', which grants nothing. An admin raises
-- the role deliberately (portal approval sets 'customer'; the Team page creates
-- staff with an explicit role), which is what the app already assumed.
--
-- Explicit roles passed by admin tooling still win, but 'admin' and 'sales' can
-- never be self-assigned through signup metadata — that path is the hole we are
-- closing, so those two values are ignored when they arrive from a signup.
--
-- IMPORTANT: verified on 2026-07-25 that the live database only has 'admin',
-- 'sales' and 'customer' — migration 031 was never applied there, so 'prospect'
-- does NOT exist. Without this ALTER, every new account (including legitimate
-- Team-page staff and portal invites) would fail on an unknown enum value.
-- Postgres will not let a value be added and used in the same transaction, so
-- run this statement on its own before the rest of the file.

alter type user_role add value if not exists 'prospect';

-- search_path is set explicitly and NEW is read inside the body: a trigger that
-- raises makes Supabase reject the whole signup with an opaque "Database error
-- creating new user", which is exactly what happened on the first attempt.
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

  -- Never honour a self-assigned privileged role from signup metadata
  if requested is null or requested in ('admin', 'sales', 'manager', 'staff') then
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

-- Clean up accounts that already slipped through. Real staff are always created
-- via the Team page, which calls createUser with email_confirm: true — so an
-- unconfirmed 'sales' account can only have come from self-signup. Verified on
-- 2026-07-25: every genuine account (Danique, Djamy, Kyle, info@vantyze) is
-- confirmed; only the bot signup is not.
update public.users u
set role = 'prospect', is_active = false
where u.role = 'sales'
  and u.customer_id is null
  and exists (
    select 1 from auth.users a
    where a.id = u.id
      and a.email_confirmed_at is null
  );

-- Second layer. The read policies say "any logged-in user", so a 'prospect'
-- could still read the customer base even with no role granted. Exclude that one
-- role rather than restructuring the policies — admin/sales/staff/customer keep
-- exactly the access they have today, so nothing that works today can break.
create or replace function public.is_pending_account()
returns boolean language sql security definer stable as $$
  select coalesce(public.current_user_role(), 'prospect') = 'prospect';
$$;

drop policy if exists "customers: authenticated read" on public.customers;
create policy "customers: authenticated read"
  on public.customers for select
  using (auth.uid() is not null and not public.is_pending_account());

drop policy if exists "orders: authenticated read" on public.orders;
create policy "orders: authenticated read"
  on public.orders for select
  using (auth.uid() is not null and not public.is_pending_account());

drop policy if exists "quotes: authenticated read" on public.quotes;
create policy "quotes: authenticated read"
  on public.quotes for select
  using (auth.uid() is not null and not public.is_pending_account());

drop policy if exists "leads: authenticated read" on public.leads;
create policy "leads: authenticated read"
  on public.leads for select
  using (auth.uid() is not null and not public.is_pending_account());

drop policy if exists "deliveries: authenticated read" on public.deliveries;
create policy "deliveries: authenticated read"
  on public.deliveries for select
  using (auth.uid() is not null and not public.is_pending_account());

-- Writing is staff-only; a pending account must never insert or update anything.
drop policy if exists "customers: authenticated insert" on public.customers;
create policy "customers: authenticated insert"
  on public.customers for insert
  with check (auth.uid() is not null and not public.is_pending_account());

drop policy if exists "customers: authenticated update" on public.customers;
create policy "customers: authenticated update"
  on public.customers for update
  using (auth.uid() is not null and not public.is_pending_account());

drop policy if exists "orders: authenticated insert" on public.orders;
create policy "orders: authenticated insert"
  on public.orders for insert
  with check (auth.uid() is not null and not public.is_pending_account());

drop policy if exists "orders: authenticated update" on public.orders;
create policy "orders: authenticated update"
  on public.orders for update
  using (auth.uid() is not null and not public.is_pending_account());
