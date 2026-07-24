-- 042: consignment sales
-- A customer can be flagged as a consignment customer: goods are delivered but
-- only paid once the customer has sold them, and SPika keeps ownership until
-- then. New orders inherit the flag from their customer at creation time, so
-- historical orders keep their true type even after an admin later converts the
-- customer to a normal (paying) customer. Consignment orders are excluded from
-- the overdue / te-betalen chase, but still count towards monthly revenue.

alter table public.customers
  add column if not exists is_consignment boolean not null default false;

alter table public.orders
  add column if not exists is_consignment boolean not null default false;

-- Stamp every new order with the customer's current consignment flag on insert.
-- This runs for all creation paths (CRM + portal), so nothing has to remember to
-- set it. It intentionally always reads from the customer: consignment is a
-- customer-level decision, and stamping freezes the value onto the order.
create or replace function public.stamp_order_consignment()
returns trigger
language plpgsql
security definer
as $$
begin
  new.is_consignment := coalesce(
    (select is_consignment from public.customers where id = new.customer_id),
    false
  );
  return new;
end
$$;

drop trigger if exists trg_stamp_order_consignment on public.orders;
create trigger trg_stamp_order_consignment
  before insert on public.orders
  for each row execute function public.stamp_order_consignment();
