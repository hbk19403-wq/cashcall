-- Add email digest support to notification_prefs
ALTER TABLE notification_prefs
  ADD COLUMN IF NOT EXISTS digest_email TEXT;

-- Index for cron queries
CREATE INDEX IF NOT EXISTS idx_notification_prefs_digest_email
  ON notification_prefs (digest_email)
  WHERE digest_email IS NOT NULL AND digest_enabled = true;
