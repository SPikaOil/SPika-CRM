-- Real (actual) volume in ml — internal production use only
ALTER TABLE products ADD COLUMN IF NOT EXISTS real_volume_ml numeric(8,2);
