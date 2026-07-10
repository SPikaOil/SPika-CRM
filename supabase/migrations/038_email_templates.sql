-- 038: editable payment reminder e-mail templates (Settings)
-- Overrides for the built-in texts in src/lib/reminder-templates.ts;
-- rows exist only for templates the admin actually customized.

create table if not exists public.email_templates (
  key        text primary key,          -- 'first' | 'second' | 'final'
  subject    text not null,
  body       text not null,
  updated_at timestamptz not null default now()
);

alter table public.email_templates enable row level security;

drop policy if exists "staff can read email templates" on public.email_templates;
create policy "staff can read email templates" on public.email_templates
  for select to authenticated using (true);

drop policy if exists "admins manage email templates" on public.email_templates;
create policy "admins manage email templates" on public.email_templates
  for all to authenticated
  using (exists (select 1 from public.users u where u.id = auth.uid() and u.role = 'admin'))
  with check (exists (select 1 from public.users u where u.id = auth.uid() and u.role = 'admin'));
