-- Add exchange rate columns to company_settings
-- Rates are expressed as: how many XCG equals 1 unit of the foreign currency
-- e.g. rate_eur = 2.00 means 1 EUR = 2.00 XCG
ALTER TABLE company_settings
  ADD COLUMN IF NOT EXISTS rate_usd numeric(10,4) NOT NULL DEFAULT 1.79,
  ADD COLUMN IF NOT EXISTS rate_eur numeric(10,4) NOT NULL DEFAULT 2.00;
