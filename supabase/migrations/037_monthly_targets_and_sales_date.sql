-- 037: shared monthly bottle targets + invoice-date-led sales month

-- 1. Per-month bottle target, stored centrally so every device sees the same
--    value (previously localStorage: each phone/desktop had its own target)
create table if not exists public.monthly_targets (
  month         text primary key,          -- 'YYYY-MM'
  bottle_target int not null check (bottle_target > 0),
  updated_at    timestamptz not null default now()
);

alter table public.monthly_targets enable row level security;

drop policy if exists "staff can read targets" on public.monthly_targets;
create policy "staff can read targets" on public.monthly_targets
  for select to authenticated using (true);

drop policy if exists "admins manage targets" on public.monthly_targets;
create policy "admins manage targets" on public.monthly_targets
  for all to authenticated
  using (exists (select 1 from public.users u where u.id = auth.uid() and u.role = 'admin'))
  with check (exists (select 1 from public.users u where u.id = auth.uid() and u.role = 'admin'));

-- 2. Sales-date view: the invoice date decides which month a sale belongs to.
--    Fallback: delivery date, then creation date (in Curaçao local time).
--    Read-only view — changes nothing about the underlying data.
create or replace view public.orders_with_sales_date
with (security_invoker = on) as
select
  o.*,
  coalesce(
    o.invoice_date,
    o.planned_date,
    (o.created_at at time zone 'America/Curacao')::date
  ) as sales_date
from public.orders o;
