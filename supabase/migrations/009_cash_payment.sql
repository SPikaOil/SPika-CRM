-- Add payment_type to orders: 'invoice' (default) or 'cash'
ALTER TABLE orders ADD COLUMN IF NOT EXISTS payment_type text NOT NULL DEFAULT 'invoice';
