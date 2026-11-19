-- Task #124: Add OAuth token columns to payroll_connections + pos_connections
-- Run in: https://supabase.com/dashboard/project/lhwepylnuurjbarkfugo/sql/new

-- payroll_connections: add token columns used by Gusto + QuickBooks OAuth callbacks
ALTER TABLE payroll_connections
  ADD COLUMN IF NOT EXISTS access_token        text,
  ADD COLUMN IF NOT EXISTS refresh_token       text,
  ADD COLUMN IF NOT EXISTS token_expires_at    timestamptz,
  ADD COLUMN IF NOT EXISTS user_id             uuid,
  ADD COLUMN IF NOT EXISTS provider_company_id text,
  ADD COLUMN IF NOT EXISTS provider_name       text,
  ADD COLUMN IF NOT EXISTS employee_count      int,
  ADD COLUMN IF NOT EXISTS status              text DEFAULT 'connected',
  ADD COLUMN IF NOT EXISTS connected_at        timestamptz;

-- pos_connections: add Clover OAuth columns (table already has merchant_id + access_token)
ALTER TABLE pos_connections
  ADD COLUMN IF NOT EXISTS oauth_access_token  text,
  ADD COLUMN IF NOT EXISTS oauth_merchant_id   text,
  ADD COLUMN IF NOT EXISTS oauth_employee_id   text,
  ADD COLUMN IF NOT EXISTS api_token           text,
  ADD COLUMN IF NOT EXISTS client_id           text,
  ADD COLUMN IF NOT EXISTS user_id             uuid,
  ADD COLUMN IF NOT EXISTS status              text DEFAULT 'connected',
  ADD COLUMN IF NOT EXISTS connected_at        timestamptz;
