-- Add THT (Tenminste Houdbaar Tot / best-before) date to exports
ALTER TABLE exports
  ADD COLUMN IF NOT EXISTS tht_date date;
