-- ============================================================
-- HBK Portal — POS Connections + Budget Tables
-- Run in: https://supabase.com/dashboard/project/nlhisfbcrbkalxtxmsbn/sql/new
-- ============================================================

-- 1. POS Connections (one row per location per provider)
CREATE TABLE IF NOT EXISTS pos_connections (
  id            uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  location_id   uuid REFERENCES locations(id) ON DELETE CASCADE NOT NULL,
  provider      text NOT NULL DEFAULT 'clover',   -- 'clover' | 'toast' | 'square'
  merchant_id   text NOT NULL,                    -- Clover: mId from dashboard
  access_token  text NOT NULL,                    -- Clover: API token (keep secret)
  environment   text NOT NULL DEFAULT 'production', -- 'production' | 'sandbox'
  last_synced   timestamptz,
  sync_status   text DEFAULT 'idle',              -- 'idle' | 'syncing' | 'error'
  sync_error    text,
  created_at    timestamptz DEFAULT now(),
  updated_at    timestamptz DEFAULT now(),
  UNIQUE(location_id, provider)
);

ALTER TABLE pos_connections ENABLE ROW LEVEL SECURITY;
CREATE POLICY "owner read pos_connections"
  ON pos_connections FOR SELECT TO authenticated USING (true);
CREATE POLICY "owner write pos_connections"
  ON pos_connections FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- 2. Location Budgets (monthly targets per location)
CREATE TABLE IF NOT EXISTS location_budgets (
  id                  uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  location_id         uuid REFERENCES locations(id) ON DELETE CASCADE NOT NULL,
  month               date NOT NULL,              -- first day of month: 2026-10-01
  -- Revenue target
  sales_target        numeric DEFAULT 0,
  -- Cost % targets (override global defaults)
  food_pct_target     numeric DEFAULT 28,
  labor_pct_target    numeric DEFAULT 30,
  infra_pct_target    numeric DEFAULT 19,
  prime_cost_target   numeric DEFAULT 58,
  net_profit_target   numeric DEFAULT 22,
  -- Absolute cost budgets
  food_budget         numeric DEFAULT 0,
  labor_budget        numeric DEFAULT 0,
  infra_budget        numeric DEFAULT 0,
  -- Notes
  notes               text,
  created_at          timestamptz DEFAULT now(),
  updated_at          timestamptz DEFAULT now(),
  UNIQUE(location_id, month)
);

ALTER TABLE location_budgets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "owner all location_budgets"
  ON location_budgets FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- 3. POS sync log (audit trail of every sync)
CREATE TABLE IF NOT EXISTS pos_sync_log (
  id            uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  location_id   uuid REFERENCES locations(id) ON DELETE CASCADE,
  provider      text,
  sync_date     date,
  rows_upserted int DEFAULT 0,
  error         text,
  synced_at     timestamptz DEFAULT now()
);

ALTER TABLE pos_sync_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "owner read pos_sync_log"
  ON pos_sync_log FOR SELECT TO authenticated USING (true);
CREATE POLICY "service write pos_sync_log"
  ON pos_sync_log FOR INSERT TO authenticated WITH CHECK (true);

-- 4. Verify
SELECT tablename, policyname FROM pg_policies
WHERE tablename IN ('pos_connections','location_budgets','pos_sync_log')
ORDER BY tablename;
