ALTER TABLE customers
  ADD COLUMN IF NOT EXISTS display_as text,
  ADD COLUMN IF NOT EXISTS shops_sold_at text,
  ADD COLUMN IF NOT EXISTS storelocator boolean NOT NULL DEFAULT false;
