-- 065: bottles can leave a warehouse again
--
-- Migration 064 let a transport be booked IN at a warehouse. Nothing could take
-- it out again: picking a batch on an order always deducted from Curaçao, and
-- the Shopify week did the same. So ticking "stays here as stock" quietly built
-- a warehouse full of bottles that had already been delivered — Danique spotted
-- this on 2026-08-14 walking through the La Bandera route.
--
-- 'warehouse_out' is its own reason on purpose. Reusing 'order' with a location
-- would put two 'order' rows on the same line, and every document that reads the
-- batch numbers back from those rows would print the batch twice.
--
-- The full round trip for a load that is stored:
--   order          -qty  Curaçao    batch chosen on the order
--   received       +qty  warehouse  signed in at the other end
--   warehouse_out  -qty  warehouse  handed to the customer, or sold on Shopify
-- Net: gone from Curaçao, nothing left at the warehouse. Which is the truth.

begin;

alter table public.stock_movements
  drop constraint if exists stock_movements_reason_check;

alter table public.stock_movements
  add constraint stock_movements_reason_check check (reason in (
    'filled',         -- bottled and allocated to the batch
    'transport_out',  -- left Curaçao on a transport
    'received',       -- signed for at a warehouse
    'order',          -- picked for a B2B order
    'warehouse_out',  -- left a warehouse: to the customer, or sold on Shopify
    'shopify',        -- Shopify sales, entered per week
    'handover',       -- given to a sales member
    'return',         -- came back
    'adjustment'      -- breakage, loss, correction
  ));

commit;
