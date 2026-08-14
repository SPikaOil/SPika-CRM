-- 058: an order can be delivered in parts
--
-- deliveries.order_id has been UNIQUE since migration 001, so an order could
-- have exactly one delivery. That is why the delivery screen upserts on
-- order_id: a second delivery would have been rejected, so it overwrote the
-- first instead. A consignment contract of 130 units that goes out in three
-- runs had nowhere to record runs two and three.
--
-- Danique, 2026-08-14: "wat er geleverd is, is geleverd." A delivery is never
-- edited afterwards. Something wrong with a batch is a separate report, not a
-- correction of a signed document.
--
-- The status list gains partly_delivered: an order sits there while some but
-- not all of it has arrived. It is also where `paid` and `pending_approval`
-- finally get written down. Both have been in use for months — there are paid
-- orders and portal orders in the database — but no migration ever added them,
-- so rebuilding this database from 001 upwards would produce a schema the app
-- breaks on immediately. `if not exists` makes these no-ops on the live
-- database and correct everywhere else.

-- Outside the transaction on purpose: PostgreSQL will not let a new enum value
-- be USED in the same transaction that adds it.
alter type order_status add value if not exists 'pending_approval';
alter type order_status add value if not exists 'paid';
alter type order_status add value if not exists 'partly_delivered';

begin;

-- ── One order, many deliveries ───────────────────────────────────────────────
alter table public.deliveries drop constraint if exists deliveries_order_id_key;

create index if not exists deliveries_order_id_idx on public.deliveries (order_id);

-- ── What went out in this run ────────────────────────────────────────────────
-- Same shape as orders.items: [{"sku","name","qty",...}]. Empty means the whole
-- order, which is how every delivery made before today behaves.
alter table public.deliveries
  add column if not exists items jsonb not null default '[]'::jsonb;

comment on column public.deliveries.items is
  'The lines handed over in this run. Empty = the whole order (every delivery from before migration 058).';

-- ── The FIRST delivery sets the invoice date ─────────────────────────────────
-- House rule 048 stamps invoice_date from the delivery. With several deliveries
-- per order that would move the invoice date forward on every run, quietly
-- shifting an order into a later month each time. The first delivery decides;
-- later runs leave it alone. Consignment stays exempt (057): there the invoice
-- date is the shipping date from Curacao, and the contract says in so many
-- words that it is not the delivery date.
--
-- The status is no longer forced to 'delivered' here either. A run that covers
-- part of an order leaves it partly delivered, and the app decides which of the
-- two it is — the trigger cannot see what was in the box.
create or replace function public.after_delivery_update()
returns trigger language plpgsql as $$
begin
  if new.pod_file_url is not null and new.delivered_at is not null then
    update public.orders
    set status = 'invoice_ready', updated_at = now()
    where id = new.order_id
      and status not in ('invoice_ready', 'invoice_blocked', 'paid', 'partly_delivered');
  end if;

  if new.delivered_at is not null
     and (tg_op = 'INSERT' or old.delivered_at is distinct from new.delivered_at)
  then
    update public.orders
    set invoice_date = (new.delivered_at at time zone 'America/Curacao')::date,
        updated_at = now()
    where id = new.order_id
      and coalesce(is_consignment, false) = false
      -- Only when there is nothing there yet: the first run decides the month,
      -- and an invoice date an admin corrected by hand is never overwritten.
      and invoice_date is null;
  end if;

  return new;
end;
$$;

commit;
