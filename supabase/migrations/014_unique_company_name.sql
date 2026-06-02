-- Prevent duplicate customer names (case-insensitive)
CREATE UNIQUE INDEX IF NOT EXISTS customers_company_name_unique
  ON customers (lower(trim(company_name)));
