-- 005_export_standalone.sql
-- Allow exports to be created standalone (no order required)

ALTER TABLE exports ADD COLUMN IF NOT EXISTS customer_id uuid REFERENCES customers(id);
ALTER TABLE exports ADD COLUMN IF NOT EXISTS items jsonb NOT NULL DEFAULT '[]';
ALTER TABLE exports ALTER COLUMN order_id DROP NOT NULL;
