-- Allow customer_category to be any text, not just enum values
-- This lets new categories created in the UI be assigned to customers
ALTER TABLE customers
  ALTER COLUMN customer_category TYPE text
  USING customer_category::text;
