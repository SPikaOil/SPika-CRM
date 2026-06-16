-- Add self-registration fields to access_requests
ALTER TABLE access_requests
  ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS country text,
  ADD COLUMN IF NOT EXISTS onboarding_data jsonb,
  ADD COLUMN IF NOT EXISTS onboarding_completed_at timestamptz;

-- Users can view their own request
CREATE POLICY "Users can view own access request"
  ON access_requests FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

-- Prospects can update their own pending request
CREATE POLICY "Prospects can update own pending request"
  ON access_requests FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid() AND status = 'pending')
  WITH CHECK (user_id = auth.uid());

-- Authenticated users can insert their own request
CREATE POLICY "Authenticated can insert own request"
  ON access_requests FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());
