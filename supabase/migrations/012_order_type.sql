-- Add order_type to distinguish normal orders from free bottle service orders
ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS order_type text NOT NULL DEFAULT 'normal'
    CHECK (order_type IN ('normal', 'free_bottle_service'));
