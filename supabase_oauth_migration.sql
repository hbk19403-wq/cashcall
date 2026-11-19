-- ── OAuth token columns for payroll_connections ──────────────────────────────
ALTER TABLE payroll_connections
  ADD COLUMN IF NOT EXISTS access_token       text,
  ADD COLUMN IF NOT EXISTS refresh_token      text,
  ADD COLUMN IF NOT EXISTS token_expires_at   timestamptz,
  ADD COLUMN IF NOT EXISTS provider_company_id text,
  ADD COLUMN IF NOT EXISTS provider_name       text,
  ADD COLUMN IF NOT EXISTS employee_count      int,
  ADD COLUMN IF NOT EXISTS last_synced         timestamptz,
  ADD COLUMN IF NOT EXISTS sync_error          text;

-- ── OAuth token columns for pos_connections ───────────────────────────────────
ALTER TABLE pos_connections
  ADD COLUMN IF NOT EXISTS oauth_access_token  text,
  ADD COLUMN IF NOT EXISTS oauth_refresh_token text,
  ADD COLUMN IF NOT EXISTS oauth_expires_at    timestamptz,
  ADD COLUMN IF NOT EXISTS oauth_merchant_id   text,
  ADD COLUMN IF NOT EXISTS oauth_employee_id   text;

-- ── OAuth state table (CSRF protection for OAuth flows) ───────────────────────
CREATE TABLE IF NOT EXISTS oauth_states (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  state       text UNIQUE NOT NULL,
  user_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  location_id uuid,
  provider    text NOT NULL,
  created_at  timestamptz DEFAULT now()
);
-- States expire after 10 minutes
CREATE INDEX IF NOT EXISTS oauth_states_created ON oauth_states(created_at);

-- Enable RLS
ALTER TABLE oauth_states ENABLE ROW LEVEL SECURITY;
CREATE POLICY IF NOT EXISTS "users own their oauth states"
  ON oauth_states FOR ALL USING (user_id = auth.uid());

-- ── Unique constraint for salary_disbursements upsert ─────────────────────────
-- Allows payroll sync routes to upsert without duplicating
ALTER TABLE salary_disbursements
  DROP CONSTRAINT IF EXISTS salary_disbursements_unique_entry;
ALTER TABLE salary_disbursements
  ADD CONSTRAINT salary_disbursements_unique_entry
  UNIQUE (location_id, disbursed_on, employee);

-- ── user_id column on payroll_connections (needed for OAuth callback) ─────────
ALTER TABLE payroll_connections
  ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE;
