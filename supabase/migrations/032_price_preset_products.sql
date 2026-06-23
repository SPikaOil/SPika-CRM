-- Add products array to price_presets to track which SKUs apply per category
ALTER TABLE price_presets ADD COLUMN IF NOT EXISTS products text[] NOT NULL DEFAULT '{}';
