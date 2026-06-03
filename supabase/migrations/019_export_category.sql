-- Add 'export' value to the customer_category enum
ALTER TYPE customer_category ADD VALUE IF NOT EXISTS 'export';
