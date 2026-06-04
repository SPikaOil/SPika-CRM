-- Add last_seen_at tracking columns
ALTER TABLE users ADD COLUMN IF NOT EXISTS last_seen_at timestamptz;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS last_seen_at timestamptz;
