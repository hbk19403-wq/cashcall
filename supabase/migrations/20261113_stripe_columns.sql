-- Add Stripe billing columns to client_subscriptions
ALTER TABLE client_subscriptions
  ADD COLUMN IF NOT EXISTS stripe_customer_id      text,
  ADD COLUMN IF NOT EXISTS stripe_subscription_id  text,
  ADD COLUMN IF NOT EXISTS plan                    text DEFAULT 'starter';

CREATE INDEX IF NOT EXISTS idx_client_subscriptions_stripe_customer
  ON client_subscriptions (stripe_customer_id)
  WHERE stripe_customer_id IS NOT NULL;
