-- Add `extra` column to oauth_states for storing arbitrary JSON metadata
-- (e.g. { "source": "app_market" } for Clover App Market installs)
ALTER TABLE oauth_states
  ADD COLUMN IF NOT EXISTS extra text;
