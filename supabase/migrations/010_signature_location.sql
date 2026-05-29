-- Store GPS location at the moment the customer signs
ALTER TABLE deliveries ADD COLUMN IF NOT EXISTS signature_location jsonb;
