-- A reseller asking us to SEND physical POS material.
--
-- NOT RUN YET. Runs after 072, which this references.
--
-- POS material is free for resellers. Her rule: it goes out with their next
-- order and it SHOWS on the invoice as a zero line, so the shop has proof it
-- was included. That costs nothing elsewhere — revenue reads orders.total, and
-- the stock page only counts OIL_SKUS, so a `pos-…` line moves neither.
--
-- Why its own table and not a task or an order line straight away: a request is
-- raised long before there is an order to hang it on. It has to be able to sit
-- and wait.

begin;

create table if not exists public.pos_requests (
  id             uuid primary key default gen_random_uuid(),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),

  customer_id    uuid not null references public.customers(id) on delete cascade,
  asset_id       uuid not null references public.marketing_assets(id) on delete cascade,
  qty            integer not null default 1 check (qty > 0),
  note           text,

  -- open -> planned (on an order) -> sent (that order was delivered)
  -- declined carries a reason the reseller can read.
  status         text not null default 'open'
                 check (status in ('open', 'planned', 'sent', 'declined')),
  decline_reason text,
  order_id       uuid references public.orders(id) on delete set null,

  requested_by   uuid references public.users(id) on delete set null,
  handled_by     uuid references public.users(id) on delete set null,
  handled_at     timestamptz
);

create index if not exists pos_requests_open_idx
  on public.pos_requests (status, customer_id, created_at desc);

-- A declined request without a reason is a dead end for the reseller.
alter table public.pos_requests drop constraint if exists pos_requests_declined_needs_reason;
alter table public.pos_requests
  add constraint pos_requests_declined_needs_reason
  check (status <> 'declined' or coalesce(btrim(decline_reason), '') <> '');

-- Stamp who asked, so the portal insert cannot claim to be someone else.
create or replace function public.stamp_pos_request()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.requested_by := coalesce(new.requested_by, auth.uid());
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists stamp_pos_request_trg on public.pos_requests;
create trigger stamp_pos_request_trg
  before insert or update on public.pos_requests
  for each row execute function public.stamp_pos_request();

alter table public.pos_requests enable row level security;

drop policy if exists "pos requests: read staff or own"   on public.pos_requests;
drop policy if exists "pos requests: insert own customer" on public.pos_requests;
drop policy if exists "pos requests: update staff"        on public.pos_requests;
drop policy if exists "pos requests: delete staff"        on public.pos_requests;

-- Staff see everything; a reseller sees only their own company's requests.
create policy "pos requests: read staff or own"
  on public.pos_requests for select
  using (public.is_staff() or customer_id = public.current_user_customer_id());

-- A customer may ask, but only for their OWN company.
create policy "pos requests: insert own customer"
  on public.pos_requests for insert
  with check (public.is_staff() or customer_id = public.current_user_customer_id());

-- Granting and declining is staff work: it puts a line on an order.
create policy "pos requests: update staff" on public.pos_requests for update using (public.is_staff());
create policy "pos requests: delete staff" on public.pos_requests for delete using (public.is_staff());

-- When the order that carries the material is delivered, the request is done.
-- Done in the database because delivery can be completed from several screens,
-- and a request that stays "planned" forever would be chased twice.
create or replace function public.close_pos_requests_on_delivery()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status = 'delivered' and coalesce(old.status, '') <> 'delivered' then
    update public.pos_requests
       set status = 'sent', updated_at = now()
     where order_id = new.id
       and status = 'planned';
  end if;
  return new;
end;
$$;

drop trigger if exists close_pos_requests_on_delivery_trg on public.orders;
create trigger close_pos_requests_on_delivery_trg
  after update of status on public.orders
  for each row execute function public.close_pos_requests_on_delivery();

commit;
