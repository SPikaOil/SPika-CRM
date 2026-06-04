-- Add currency field to exports table
ALTER TABLE exports ADD COLUMN IF NOT EXISTS currency text NOT NULL DEFAULT 'XCG';
