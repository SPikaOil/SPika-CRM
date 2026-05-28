-- 004_international_customer.sql
-- Flag customers as international for export eligibility

ALTER TABLE customers ADD COLUMN IF NOT EXISTS is_international boolean NOT NULL DEFAULT false;
