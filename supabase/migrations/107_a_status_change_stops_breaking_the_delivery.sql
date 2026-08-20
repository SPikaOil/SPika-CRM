-- 107: an order status can be changed again
--
-- Since migration 073 went in on 2026-08-15, NOT ONE delivery has been able to
-- complete. Danique signed for order 729148 on the evening of 2026-08-20, the
-- signature uploaded, the signed invoice was generated and stored, the mail went
-- out and the screen showed a green tick — and the database recorded none of it.
-- The order stayed on `processing`.
--
-- The cause is one expression in close_pos_requests_on_delivery():
--
--     if new.status = 'delivered' and coalesce(old.status, '') <> 'delivered'
--
-- `status` is the enum `order_status`, and '' is not one of its values. Postgres
-- has to coerce that empty string to the enum to evaluate the coalesce, and that
-- coercion fails:
--
--     invalid input value for enum order_status: ""
--
-- The trigger is `after update of status`, so it fires on every status change,
-- raises, and rolls the whole update back — the order status, and with it the
-- delivery row that was being written in the same breath.
--
-- `is distinct from` says the same thing without needing a stand-in for NULL,
-- which is what coalesce was there for in the first place. Nothing else about
-- the trigger changes: a POS request is still closed the moment the order that
-- carries the material is delivered.

begin;

create or replace function public.close_pos_requests_on_delivery()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status = 'delivered' and old.status is distinct from 'delivered' then
    update public.pos_requests
       set status = 'sent', updated_at = now()
     where order_id = new.id
       and status = 'planned';
  end if;
  return new;
end;
$$;

commit;
