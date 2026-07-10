-- 039: human-readable customer numbers (S-0001, S-0002, …)
-- Existing customers are numbered by creation date; new customers get the
-- next number automatically via a trigger.

alter table public.customers
  add column if not exists customer_number text unique;

-- Backfill existing customers in creation order
with numbered as (
  select id, row_number() over (order by created_at) as rn
  from public.customers
  where customer_number is null
)
update public.customers c
set customer_number = 'S-' || lpad(n.rn::text, 4, '0')
from numbered n
where c.id = n.id;

-- Sequence continues where the backfill ended
create sequence if not exists public.customer_number_seq;
select setval(
  'public.customer_number_seq',
  greatest(
    1,
    coalesce((
      select max(substring(customer_number from 3)::int)
      from public.customers
      where customer_number ~ '^S-[0-9]+$'
    ), 1)
  )
);

-- Auto-assign on insert
create or replace function public.assign_customer_number()
returns trigger
language plpgsql
security definer
as $$
begin
  if new.customer_number is null then
    new.customer_number := 'S-' || lpad(nextval('public.customer_number_seq')::text, 4, '0');
  end if;
  return new;
end
$$;

drop trigger if exists trg_assign_customer_number on public.customers;
create trigger trg_assign_customer_number
  before insert on public.customers
  for each row execute function public.assign_customer_number();
