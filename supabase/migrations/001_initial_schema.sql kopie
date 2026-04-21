-- ============================================================
-- SPika CRM — Initial Schema
-- ============================================================

-- Enable UUID generation
create extension if not exists "pgcrypto";

-- ============================================================
-- ENUMS
-- ============================================================
create type user_role as enum ('admin', 'sales');
create type customer_category as enum ('wholesale', 'horeca', 'dtf', 'other');
create type customer_status as enum ('active', 'inactive');
create type preferred_communication as enum ('whatsapp', 'email', 'phone');
create type lead_stage as enum ('new', 'contacted', 'quoted', 'won', 'lost');
create type quote_status as enum ('draft', 'sent', 'accepted', 'declined', 'expired');
create type order_status as enum ('processing', 'out_for_delivery', 'delivered', 'invoice_ready', 'invoice_blocked');
create type pod_type as enum ('signature', 'photo');

-- ============================================================
-- TABLES
-- ============================================================

-- 4.1 users (mirrors auth.users, extended with app fields)
create table public.users (
  id          uuid primary key references auth.users(id) on delete cascade,
  email       text unique not null,
  role        user_role not null default 'sales',
  name        text not null default '',
  phone       text not null default '',
  created_at  timestamptz not null default now()
);

-- 4.2 customers
create table public.customers (
  id                       uuid primary key default gen_random_uuid(),
  company_name             text not null,
  customer_category        customer_category not null default 'other',
  contact_person           text not null default '',
  phone                    text not null default '',
  whatsapp                 text not null default '',
  email                    text not null default '',
  billing_address          jsonb not null default '{}',
  delivery_address         jsonb not null default '{}',
  delivery_days            text[] not null default '{}',
  delivery_time_window     text not null default '',
  ob_form_required         boolean not null default false,
  packing_slip_required    boolean not null default false,
  discount_agreement       text not null default '',
  track_table_bottles      boolean not null default false,
  preferred_communication  preferred_communication not null default 'whatsapp',
  language                 text not null default 'English',
  internal_notes           text not null default '',
  quickbooks_customer_id   text not null default '',
  status                   customer_status not null default 'active',
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now()
);

-- 4.3 leads
create table public.leads (
  id           uuid primary key default gen_random_uuid(),
  customer_id  uuid not null references public.customers(id) on delete cascade,
  stage        lead_stage not null default 'new',
  category     customer_category not null default 'other',
  assigned_to  uuid not null references public.users(id),
  notes        text not null default '',
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

-- Quote number sequence helper
create sequence if not exists quote_seq;
create sequence if not exists order_seq;

-- 4.4 quotes
create table public.quotes (
  id            uuid primary key default gen_random_uuid(),
  lead_id       uuid references public.leads(id) on delete set null,
  customer_id   uuid not null references public.customers(id) on delete cascade,
  quote_number  text unique not null,
  items         jsonb not null default '[]',
  subtotal      numeric(12,2) not null default 0,
  tax           numeric(12,2) not null default 0,
  total         numeric(12,2) not null default 0,
  status        quote_status not null default 'draft',
  template_used text not null default '',
  valid_until   date,
  created_by    uuid not null references public.users(id),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- 4.5 orders
create table public.orders (
  id              uuid primary key default gen_random_uuid(),
  quote_id        uuid references public.quotes(id) on delete set null,
  customer_id     uuid not null references public.customers(id) on delete cascade,
  order_number    text unique not null,
  items           jsonb not null default '[]',
  total           numeric(12,2) not null default 0,
  assigned_to     uuid not null references public.users(id),
  status          order_status not null default 'processing',
  delivery_notes  text not null default '',
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- 4.6 deliveries
create table public.deliveries (
  id                      uuid primary key default gen_random_uuid(),
  order_id                uuid unique not null references public.orders(id) on delete cascade,
  delivery_started_at     timestamptz,
  gps_location            jsonb,
  table_bottles_returned  int not null default 0,
  table_bottles_notes     text not null default '',
  pod_type                pod_type,
  pod_file_url            text,
  delivered_at            timestamptz,
  notes                   text not null default '',
  created_at              timestamptz not null default now()
);

-- Quote templates
create table public.quote_templates (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  category    customer_category not null,
  items       jsonb not null default '[]',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- ============================================================
-- FUNCTIONS & TRIGGERS
-- ============================================================

-- Auto-update updated_at
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger set_updated_at_customers
  before update on public.customers
  for each row execute function public.set_updated_at();

create trigger set_updated_at_leads
  before update on public.leads
  for each row execute function public.set_updated_at();

create trigger set_updated_at_quotes
  before update on public.quotes
  for each row execute function public.set_updated_at();

create trigger set_updated_at_orders
  before update on public.orders
  for each row execute function public.set_updated_at();

create trigger set_updated_at_quote_templates
  before update on public.quote_templates
  for each row execute function public.set_updated_at();

-- Generate quote number: Q-YYYY-####
create or replace function public.generate_quote_number()
returns text language plpgsql as $$
declare
  year_str text := to_char(now(), 'YYYY');
  seq_val  int;
begin
  seq_val := nextval('quote_seq');
  return 'Q-' || year_str || '-' || lpad(seq_val::text, 4, '0');
end;
$$;

-- Generate order number: O-YYYY-####
create or replace function public.generate_order_number()
returns text language plpgsql as $$
declare
  year_str text := to_char(now(), 'YYYY');
  seq_val  int;
begin
  seq_val := nextval('order_seq');
  return 'O-' || year_str || '-' || lpad(seq_val::text, 4, '0');
end;
$$;

-- Auto-set quote_number on insert
create or replace function public.before_insert_quote()
returns trigger language plpgsql as $$
begin
  if new.quote_number is null or new.quote_number = '' then
    new.quote_number := public.generate_quote_number();
  end if;
  return new;
end;
$$;

create trigger before_insert_quote
  before insert on public.quotes
  for each row execute function public.before_insert_quote();

-- Auto-set order_number on insert
create or replace function public.before_insert_order()
returns trigger language plpgsql as $$
begin
  if new.order_number is null or new.order_number = '' then
    new.order_number := public.generate_order_number();
  end if;
  return new;
end;
$$;

create trigger before_insert_order
  before insert on public.orders
  for each row execute function public.before_insert_order();

-- Auto-advance order to invoice_ready when POD complete
create or replace function public.after_delivery_update()
returns trigger language plpgsql as $$
begin
  if new.pod_file_url is not null and new.delivered_at is not null then
    update public.orders
    set status = 'invoice_ready', updated_at = now()
    where id = new.order_id
      and status not in ('invoice_ready', 'invoice_blocked');
  end if;
  return new;
end;
$$;

create trigger after_delivery_update
  after insert or update on public.deliveries
  for each row execute function public.after_delivery_update();

-- Mirror auth user into public.users on sign-up
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer as $$
begin
  insert into public.users (id, email, name, role)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'name', ''),
    coalesce((new.raw_user_meta_data->>'role')::user_role, 'sales')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ============================================================
-- VIEW: v_dashboard_kpis
-- ============================================================
create or replace view public.v_dashboard_kpis as
select
  (select count(*) from public.leads where stage = 'new')        as leads_new,
  (select count(*) from public.leads where stage = 'contacted')  as leads_contacted,
  (select count(*) from public.leads where stage = 'quoted')     as leads_quoted,
  (select count(*) from public.leads where stage = 'won')        as leads_won,
  (select count(*) from public.leads where stage = 'lost')       as leads_lost,
  (select count(*) from public.quotes
   where status = 'sent'
     and created_at >= date_trunc('week', now()))                  as quotes_sent_this_week,
  (select count(*) from public.orders where status = 'processing')         as orders_processing,
  (select count(*) from public.orders where status = 'out_for_delivery')   as orders_out_for_delivery,
  (select count(*) from public.deliveries
   where delivered_at::date = current_date)                       as deliveries_today,
  (select count(*) from public.orders o
   left join public.deliveries d on d.order_id = o.id
   where o.status = 'delivered'
     and (d.pod_file_url is null or d.id is null))                as deliveries_missing_pod,
  (select count(*) from public.orders where status = 'invoice_ready')      as orders_invoice_ready,
  (select count(*) from public.orders where status = 'invoice_blocked')    as orders_invoice_blocked;

-- ============================================================
-- STORAGE BUCKET
-- ============================================================
insert into storage.buckets (id, name, public)
values ('pod-files', 'pod-files', false)
on conflict (id) do nothing;

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================
alter table public.users enable row level security;
alter table public.customers enable row level security;
alter table public.leads enable row level security;
alter table public.quotes enable row level security;
alter table public.orders enable row level security;
alter table public.deliveries enable row level security;
alter table public.quote_templates enable row level security;

-- Helper: get current user's role
create or replace function public.current_user_role()
returns user_role language sql security definer stable as $$
  select role from public.users where id = auth.uid();
$$;

-- users policies
create policy "users: read own row"
  on public.users for select
  using (id = auth.uid());

create policy "users: admin read all"
  on public.users for select
  using (public.current_user_role() = 'admin');

create policy "users: admin insert"
  on public.users for insert
  with check (public.current_user_role() = 'admin');

create policy "users: admin update"
  on public.users for update
  using (public.current_user_role() = 'admin');

-- customers policies
create policy "customers: authenticated read"
  on public.customers for select
  using (auth.uid() is not null);

create policy "customers: authenticated insert"
  on public.customers for insert
  with check (auth.uid() is not null);

create policy "customers: authenticated update"
  on public.customers for update
  using (auth.uid() is not null);

create policy "customers: admin delete"
  on public.customers for delete
  using (public.current_user_role() = 'admin');

-- leads policies
create policy "leads: authenticated read"
  on public.leads for select
  using (auth.uid() is not null);

create policy "leads: authenticated insert"
  on public.leads for insert
  with check (auth.uid() is not null);

create policy "leads: authenticated update"
  on public.leads for update
  using (auth.uid() is not null);

create policy "leads: admin delete"
  on public.leads for delete
  using (public.current_user_role() = 'admin');

-- quotes policies
create policy "quotes: authenticated read"
  on public.quotes for select
  using (auth.uid() is not null);

create policy "quotes: authenticated insert"
  on public.quotes for insert
  with check (auth.uid() is not null);

create policy "quotes: sales update own or admin"
  on public.quotes for update
  using (
    public.current_user_role() = 'admin'
    or created_by = auth.uid()
  );

create policy "quotes: admin delete"
  on public.quotes for delete
  using (public.current_user_role() = 'admin');

-- orders policies
create policy "orders: authenticated read"
  on public.orders for select
  using (auth.uid() is not null);

create policy "orders: authenticated insert"
  on public.orders for insert
  with check (auth.uid() is not null);

create policy "orders: authenticated update"
  on public.orders for update
  using (auth.uid() is not null);

create policy "orders: admin delete"
  on public.orders for delete
  using (public.current_user_role() = 'admin');

-- deliveries policies
create policy "deliveries: authenticated read"
  on public.deliveries for select
  using (auth.uid() is not null);

create policy "deliveries: authenticated insert"
  on public.deliveries for insert
  with check (auth.uid() is not null);

create policy "deliveries: authenticated update"
  on public.deliveries for update
  using (auth.uid() is not null);

-- quote_templates policies
create policy "templates: authenticated read"
  on public.quote_templates for select
  using (auth.uid() is not null);

create policy "templates: admin write"
  on public.quote_templates for all
  using (public.current_user_role() = 'admin');

-- Storage policies for pod-files
create policy "pod-files: authenticated upload"
  on storage.objects for insert
  with check (bucket_id = 'pod-files' and auth.uid() is not null);

create policy "pod-files: read own uploads"
  on storage.objects for select
  using (
    bucket_id = 'pod-files'
    and (
      public.current_user_role() = 'admin'
      or owner = auth.uid()
    )
  );

-- ============================================================
-- SEED DATA: Quote Templates
-- ============================================================
insert into public.quote_templates (name, category, items) values
('Wholesale Standard', 'wholesale', '[
  {"sku":"SPK-001","name":"SPika Original Hot Sauce 150ml","unit_price":4.50},
  {"sku":"SPK-002","name":"SPika Mango Habanero 150ml","unit_price":4.75},
  {"sku":"SPK-003","name":"SPika Ghost Pepper 150ml","unit_price":5.00},
  {"sku":"SPK-010","name":"SPika Display Stand (12-bottle)","unit_price":0.00}
]'),
('HORECA Standard', 'horeca', '[
  {"sku":"SPK-001","name":"SPika Original Hot Sauce 150ml","unit_price":5.25},
  {"sku":"SPK-002","name":"SPika Mango Habanero 150ml","unit_price":5.50},
  {"sku":"SPK-003","name":"SPika Ghost Pepper 150ml","unit_price":5.75},
  {"sku":"SPK-004","name":"SPika Table Bottle 60ml","unit_price":3.50}
]'),
('DTF Standard', 'dtf', '[
  {"sku":"SPK-001","name":"SPika Original Hot Sauce 150ml","unit_price":6.00},
  {"sku":"SPK-002","name":"SPika Mango Habanero 150ml","unit_price":6.25},
  {"sku":"SPK-003","name":"SPika Ghost Pepper 150ml","unit_price":6.50}
]');
