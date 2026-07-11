-- 040: revenue targets, monthly oil stock, safety-stock setting, handover batches

-- 1. Monthly revenue target (mirrors monthly_targets for bottles)
create table if not exists public.monthly_revenue_targets (
  month          text primary key,          -- 'YYYY-MM'
  revenue_target numeric not null check (revenue_target >= 0),
  updated_at     timestamptz not null default now()
);

-- 2. Ready-to-bottle oil stock, one snapshot per month (current total litres)
create table if not exists public.oil_stock (
  month       text primary key,             -- 'YYYY-MM'
  litres      numeric not null check (litres >= 0),
  note        text not null default '',
  updated_at  timestamptz not null default now()
);

-- 3. App-wide settings (safety stock months, editable formula input)
create table if not exists public.app_settings (
  key         text primary key,
  value       text not null,
  updated_at  timestamptz not null default now()
);
insert into public.app_settings (key, value)
  values ('safety_stock_months', '6')
  on conflict (key) do nothing;

-- 4. Handover batches: bottles handed to a sales member for delivery
create table if not exists public.handover_batches (
  id            uuid primary key default gen_random_uuid(),
  member_id     uuid not null references public.users(id),
  items         jsonb not null default '[]',   -- [{ sku, name, qty }]
  notes         text not null default '',
  signature_url text,
  signer_name   text,
  signed_at     timestamptz,
  created_by    uuid not null references public.users(id),
  created_at    timestamptz not null default now()
);

-- ── RLS: all admin-managed, staff can read ──────────────────────────
do $$
declare t text;
begin
  foreach t in array array[
    'monthly_revenue_targets', 'oil_stock', 'app_settings', 'handover_batches'
  ] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "staff read %1$s" on public.%1$s', t);
    execute format(
      'create policy "staff read %1$s" on public.%1$s for select to authenticated using (true)', t);
    execute format('drop policy if exists "admin manage %1$s" on public.%1$s', t);
    execute format(
      'create policy "admin manage %1$s" on public.%1$s for all to authenticated '
      'using (exists (select 1 from public.users u where u.id = auth.uid() and u.role = ''admin'')) '
      'with check (exists (select 1 from public.users u where u.id = auth.uid() and u.role = ''admin''))', t);
  end loop;
end $$;
