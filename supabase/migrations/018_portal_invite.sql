-- Track when a customer was invited to the portal
ALTER TABLE customers
  ADD COLUMN IF NOT EXISTS portal_invited_at timestamptz;
