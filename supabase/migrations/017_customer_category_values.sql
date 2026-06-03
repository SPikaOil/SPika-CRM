-- Add missing customer_category enum values
ALTER TYPE customer_category ADD VALUE IF NOT EXISTS 'supermarket';
ALTER TYPE customer_category ADD VALUE IF NOT EXISTS 'shops';
ALTER TYPE customer_category ADD VALUE IF NOT EXISTS 'b2c';
