CREATE TABLE IF NOT EXISTS products (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  sku text UNIQUE NOT NULL,
  name text NOT NULL,
  default_price numeric(10,2) NOT NULL DEFAULT 0,
  weight_g numeric(8,2),
  bottles_per_carton integer DEFAULT 12,
  box_height_cm numeric(8,2),
  box_length_cm numeric(8,2),
  box_width_cm numeric(8,2),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

INSERT INTO products (sku, name, default_price) VALUES
  ('oil-100ml',             'SPika Oil - 100ml',                         19.50),
  ('oil-50ml',              'SPika Oil - 50ml',                          14.50),
  ('oil-30ml-table',        'SPika Oil - 30ml (Table Version)',           11.50),
  ('oil-30ml-table-return', 'SPika Oil - 30ml (Table version) - returned', 0.00),
  ('spika2go-5ml',          'SPika2Go - 5ml',                             6.00),
  ('spika2go-3ml',          'SPika2Go - 3ml',                             5.00),
  ('spika2go-5ml-sample',   'SPika2Go - 5ml (Free Samples)',              0.00),
  ('oil-30ml-table-sample', 'SPika Oil - 30ml (Table Samples)',           0.00)
ON CONFLICT (sku) DO NOTHING;
