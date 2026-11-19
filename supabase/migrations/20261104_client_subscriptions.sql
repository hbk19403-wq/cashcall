-- Task #150: Create client_subscriptions table
-- Run in: https://supabase.com/dashboard/project/lhwepylnuurjbarkfugo/sql/new

CREATE TABLE IF NOT EXISTS client_subscriptions (
  id                      uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  email                   text NOT NULL,
  user_id                 uuid,
  status                  text NOT NULL DEFAULT 'trial',
  monthly_amount          numeric DEFAULT 0,
  notes                   text,
  subscription_starts_at  timestamptz,
  subscription_ends_at    timestamptz,
  payment_method          text,
  trial_expires_at        timestamptz,
  created_at              timestamptz DEFAULT now(),
  updated_at              timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_client_subscriptions_email
  ON client_subscriptions(email);

CREATE INDEX IF NOT EXISTS idx_client_subscriptions_user_id
  ON client_subscriptions(user_id);

ALTER TABLE client_subscriptions ENABLE ROW LEVEL SECURITY;

-- Only service role can read/write (middleware uses service role key)
CREATE POLICY "service role only" ON client_subscriptions
  USING (false);
