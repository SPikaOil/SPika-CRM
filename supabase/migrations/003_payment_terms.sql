-- 003_payment_terms.sql
-- Add per-customer payment term (days until invoice due)

ALTER TABLE customers ADD COLUMN IF NOT EXISTS payment_term_days integer NOT NULL DEFAULT 7;
