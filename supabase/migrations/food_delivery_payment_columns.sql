-- Add payment tracking columns to food_deliveries
-- These are used by VendorTab for invoice payment status tracking

ALTER TABLE food_deliveries
  ADD COLUMN IF NOT EXISTS payment_status text NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS paid_on date,
  ADD COLUMN IF NOT EXISTS payment_method text,
  ADD COLUMN IF NOT EXISTS cheque_number text;

ALTER TABLE food_deliveries
  DROP CONSTRAINT IF EXISTS food_deliveries_payment_status_check;
ALTER TABLE food_deliveries
  ADD CONSTRAINT food_deliveries_payment_status_check
  CHECK (payment_status IN ('pending', 'paid', 'partial'));
