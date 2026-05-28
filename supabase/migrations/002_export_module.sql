-- 002_export_module.sql
-- Export Module: carriers, exports, export_documents + CRIB on customers

-- ── CRIB number on customers ──────────────────────────────────────────────────
ALTER TABLE customers ADD COLUMN IF NOT EXISTS crib_number text DEFAULT '';

-- ── Carriers ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS carriers (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text NOT NULL,
  route       text NOT NULL DEFAULT '',
  bol_template text NOT NULL DEFAULT 'generic', -- 'don_andres' | 'generic'
  created_at  timestamptz DEFAULT now()
);

INSERT INTO carriers (id, name, route, bol_template) VALUES
  ('00000000-0000-0000-0000-000000000010', 'Don Andres N.V.',  'Curaçao → Bonaire',      'don_andres'),
  ('00000000-0000-0000-0000-000000000011', 'DHL Express',      'Curaçao → Netherlands',  'generic'),
  ('00000000-0000-0000-0000-000000000012', 'Other / Manual',   '',                        'generic')
ON CONFLICT (id) DO NOTHING;

-- ── Export status enum ────────────────────────────────────────────────────────
DO $$ BEGIN
  CREATE TYPE export_status AS ENUM ('draft', 'ready', 'submitted', 'cleared', 'delivered');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

-- ── Export number sequence ────────────────────────────────────────────────────
CREATE SEQUENCE IF NOT EXISTS export_seq START 1;

-- ── Exports ───────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS exports (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  export_number  text UNIQUE,
  order_id       uuid REFERENCES orders(id) ON DELETE SET NULL,
  carrier_id     uuid REFERENCES carriers(id),
  destination    text NOT NULL DEFAULT '',
  export_date    date,
  notes          text DEFAULT '',
  status         export_status NOT NULL DEFAULT 'draft',
  created_by     uuid REFERENCES users(id),
  created_at     timestamptz DEFAULT now(),
  updated_at     timestamptz DEFAULT now()
);

-- Auto-generate export number on insert
CREATE OR REPLACE FUNCTION generate_export_number()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.export_number IS NULL THEN
    NEW.export_number := 'EXP-' || EXTRACT(YEAR FROM now())::text
                         || '-' || LPAD(nextval('export_seq')::text, 3, '0');
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS set_export_number ON exports;
CREATE TRIGGER set_export_number
  BEFORE INSERT ON exports
  FOR EACH ROW EXECUTE FUNCTION generate_export_number();

-- ── Export documents ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS export_documents (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  export_id      uuid REFERENCES exports(id) ON DELETE CASCADE NOT NULL,
  document_type  text NOT NULL,
  -- 'commercial_invoice' | 'packing_list' | 'bill_of_lading' | 'received_doc'
  file_url       text NOT NULL,
  file_name      text NOT NULL,
  uploaded_at    timestamptz DEFAULT now()
);

-- ── Row-Level Security ────────────────────────────────────────────────────────
ALTER TABLE carriers         ENABLE ROW LEVEL SECURITY;
ALTER TABLE exports          ENABLE ROW LEVEL SECURITY;
ALTER TABLE export_documents ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "carriers_read"         ON carriers;
DROP POLICY IF EXISTS "exports_all"           ON exports;
DROP POLICY IF EXISTS "export_documents_all"  ON export_documents;

CREATE POLICY "carriers_read"        ON carriers         FOR SELECT TO authenticated USING (true);
CREATE POLICY "exports_all"          ON exports          FOR ALL    TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "export_documents_all" ON export_documents FOR ALL    TO authenticated USING (true) WITH CHECK (true);
