-- Price presets per customer category
-- One row per category; prices is a jsonb map of sku -> price
CREATE TABLE IF NOT EXISTS price_presets (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  category    text NOT NULL UNIQUE,  -- matches customer_category enum values
  label       text NOT NULL,
  prices      jsonb NOT NULL DEFAULT '{}',
  updated_at  timestamptz NOT NULL DEFAULT now()
);

-- Seed default presets for every category (do nothing if already exists)
INSERT INTO price_presets (category, label, prices) VALUES
  ('wholesale',  'Wholesale (B2B)',  '{}'),
  ('horeca',     'HORECA (B2B)',     '{}'),
  ('supermarket','Supermarket (B2B)','{}'),
  ('shops',      'Shops (B2B)',      '{}'),
  ('dtf',        'DTF (B2B)',        '{}'),
  ('other',      'Other (B2B)',      '{}'),
  ('b2c',        'B2C (Individual)', '{}')
ON CONFLICT (category) DO NOTHING;

-- Allow admins and sales to read; only admins write
ALTER TABLE price_presets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "authenticated can read price_presets"
  ON price_presets FOR SELECT
  TO authenticated USING (true);

CREATE POLICY "admin can write price_presets"
  ON price_presets FOR ALL
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin')
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin')
  );
