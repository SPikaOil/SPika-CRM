-- Add discounts column to price_presets
ALTER TABLE price_presets
  ADD COLUMN IF NOT EXISTS discounts jsonb NOT NULL DEFAULT '{}';
