-- Add bottle refill interval to customers
-- How many weeks between expected bottle refills for this customer
ALTER TABLE customers
  ADD COLUMN IF NOT EXISTS table_bottle_interval_weeks integer;
