CREATE TABLE IF NOT EXISTS access_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz DEFAULT now(),
  name text NOT NULL,
  email text NOT NULL,
  company_name text NOT NULL,
  phone text,
  message text,
  status text NOT NULL DEFAULT 'pending',
  reviewed_by uuid REFERENCES users(id),
  reviewed_at timestamptz,
  review_notes text
);

ALTER TABLE access_requests ENABLE ROW LEVEL SECURITY;

-- Admins can do everything
CREATE POLICY "Admins manage access requests"
  ON access_requests FOR ALL
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin')
  );

-- Anyone (including unauthenticated) can insert a request
CREATE POLICY "Anyone can submit access request"
  ON access_requests FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);
