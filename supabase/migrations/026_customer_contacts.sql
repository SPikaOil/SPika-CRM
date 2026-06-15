-- Add customer_role to users table for multi-user per customer support
-- 'owner'  = can invite/remove contacts, full access
-- 'member' = can view and order, cannot manage contacts

ALTER TABLE users ADD COLUMN IF NOT EXISTS customer_role text NOT NULL DEFAULT 'owner';

-- All existing customer users become owners
UPDATE users SET customer_role = 'owner' WHERE role = 'customer';
