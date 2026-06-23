-- Add currency field to orders (default XCG = Antillean Guilder)
ALTER TABLE orders ADD COLUMN IF NOT EXISTS currency text NOT NULL DEFAULT 'XCG';
