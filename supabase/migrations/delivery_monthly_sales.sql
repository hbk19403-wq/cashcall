-- delivery_monthly_sales: manual monthly delivery platform entry
-- Tracks gross sales, commission %, and net per platform per month per location
-- Net = gross × (1 − commission_pct / 100)

CREATE TABLE IF NOT EXISTS delivery_monthly_sales (
  id               uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  location_id      uuid NOT NULL REFERENCES locations(id) ON DELETE CASCADE,
  provider         text NOT NULL,          -- doordash | ubereats | grubhub | other
  month            text NOT NULL,          -- YYYY-MM
  gross_sales      numeric(12,2) NOT NULL DEFAULT 0,
  commission_pct   numeric(5,2)  NOT NULL DEFAULT 0,  -- e.g. 27.5
  commission_amount numeric(12,2) NOT NULL DEFAULT 0,
  net_sales        numeric(12,2) NOT NULL DEFAULT 0,
  entry_type       text NOT NULL DEFAULT 'manual',    -- manual | api_sync
  updated_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (location_id, provider, month)
);

-- Index for fetching by location + month
CREATE INDEX IF NOT EXISTS idx_delivery_monthly_sales_loc_month
  ON delivery_monthly_sales (location_id, month);

-- RLS
ALTER TABLE delivery_monthly_sales ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own delivery_monthly_sales"
  ON delivery_monthly_sales
  FOR ALL
  USING (
    location_id IN (
      SELECT id FROM locations WHERE user_id = auth.uid() AND app = 'cashcall'
    )
  );
