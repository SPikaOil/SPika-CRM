-- Track which products are active/sold to each customer
-- Empty array = legacy customer, all products shown (backward compatible)
ALTER TABLE customers
  ADD COLUMN IF NOT EXISTS active_products text[] NOT NULL DEFAULT '{}';
