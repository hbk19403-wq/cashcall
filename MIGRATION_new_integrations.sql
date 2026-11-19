-- ============================================================
-- CashCall: New Integrations Migration
-- Features: delivery_connections + labor_scheduler_connections
--           + notification_prefs report scheduling columns
-- ============================================================

-- ── 1. delivery_connections ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS delivery_connections (
  id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  location_id     UUID NOT NULL REFERENCES locations(id) ON DELETE CASCADE,
  provider        TEXT NOT NULL CHECK (provider IN ('doordash', 'ubereats', 'grubhub')),
  api_key         TEXT,                -- encrypted at rest by Supabase Vault (optional)
  store_id        TEXT,                -- merchant/restaurant ID on the platform
  connected_at    TIMESTAMPTZ DEFAULT NOW(),
  last_synced     TIMESTAMPTZ,
  sync_status     TEXT DEFAULT 'pending' CHECK (sync_status IN ('pending','ok','error')),
  sync_error      TEXT,
  UNIQUE(location_id, provider)
);

ALTER TABLE delivery_connections ENABLE ROW LEVEL SECURITY;

-- Users can only see their own locations' connections
CREATE POLICY "delivery_connections_select" ON delivery_connections
  FOR SELECT USING (
    location_id IN (
      SELECT id FROM locations WHERE user_id = (SELECT auth.uid())
    )
  );

CREATE POLICY "delivery_connections_insert" ON delivery_connections
  FOR INSERT WITH CHECK (
    location_id IN (
      SELECT id FROM locations WHERE user_id = (SELECT auth.uid())
    )
  );

CREATE POLICY "delivery_connections_update" ON delivery_connections
  FOR UPDATE USING (
    location_id IN (
      SELECT id FROM locations WHERE user_id = (SELECT auth.uid())
    )
  );

CREATE POLICY "delivery_connections_delete" ON delivery_connections
  FOR DELETE USING (
    location_id IN (
      SELECT id FROM locations WHERE user_id = (SELECT auth.uid())
    )
  );

-- ── 2. labor_scheduler_connections ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS labor_scheduler_connections (
  id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  location_id     UUID NOT NULL REFERENCES locations(id) ON DELETE CASCADE,
  provider        TEXT NOT NULL CHECK (provider IN ('7shifts', 'hotschedules', 'homebase', 'deputy')),
  api_key         TEXT,
  location_code   TEXT,                -- provider-specific location/store ID
  connected_at    TIMESTAMPTZ DEFAULT NOW(),
  last_synced     TIMESTAMPTZ,
  sync_status     TEXT DEFAULT 'pending' CHECK (sync_status IN ('pending','ok','error')),
  sync_error      TEXT,
  UNIQUE(location_id, provider)
);

ALTER TABLE labor_scheduler_connections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "labor_sched_select" ON labor_scheduler_connections
  FOR SELECT USING (
    location_id IN (
      SELECT id FROM locations WHERE user_id = (SELECT auth.uid())
    )
  );

CREATE POLICY "labor_sched_insert" ON labor_scheduler_connections
  FOR INSERT WITH CHECK (
    location_id IN (
      SELECT id FROM locations WHERE user_id = (SELECT auth.uid())
    )
  );

CREATE POLICY "labor_sched_update" ON labor_scheduler_connections
  FOR UPDATE USING (
    location_id IN (
      SELECT id FROM locations WHERE user_id = (SELECT auth.uid())
    )
  );

CREATE POLICY "labor_sched_delete" ON labor_scheduler_connections
  FOR DELETE USING (
    location_id IN (
      SELECT id FROM locations WHERE user_id = (SELECT auth.uid())
    )
  );

-- ── 3. notification_prefs — add report scheduling columns ────────────────────
ALTER TABLE notification_prefs
  ADD COLUMN IF NOT EXISTS report_schedule  TEXT DEFAULT 'off'
    CHECK (report_schedule IN ('off', 'weekly', 'monthly')),
  ADD COLUMN IF NOT EXISTS report_day       INTEGER DEFAULT 1,  -- 1=Mon for weekly; 1=1st for monthly
  ADD COLUMN IF NOT EXISTS report_format    TEXT DEFAULT 'email'
    CHECK (report_format IN ('email', 'whatsapp', 'both')),
  ADD COLUMN IF NOT EXISTS report_email     TEXT;               -- defaults to digest_email if null

-- ── 4. invoice_email_addresses — unique inbound email per location ────────────
CREATE TABLE IF NOT EXISTS invoice_email_addresses (
  id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  location_id UUID NOT NULL REFERENCES locations(id) ON DELETE CASCADE UNIQUE,
  email_slug  TEXT NOT NULL UNIQUE,   -- e.g. "loc-cc01-a3f9" → loc-cc01-a3f9@invoices.cashcall.io
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE invoice_email_addresses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "invoice_email_select" ON invoice_email_addresses
  FOR SELECT USING (
    location_id IN (
      SELECT id FROM locations WHERE user_id = (SELECT auth.uid())
    )
  );

CREATE POLICY "invoice_email_insert" ON invoice_email_addresses
  FOR INSERT WITH CHECK (
    location_id IN (
      SELECT id FROM locations WHERE user_id = (SELECT auth.uid())
    )
  );

-- Grant service role full access for inbound email webhook
GRANT ALL ON delivery_connections TO service_role;
GRANT ALL ON labor_scheduler_connections TO service_role;
GRANT ALL ON invoice_email_addresses TO service_role;

-- ── 5. labor_schedule_snapshots — daily 7shifts scheduled vs actual ──────────
CREATE TABLE IF NOT EXISTS labor_schedule_snapshots (
  id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  location_id     UUID NOT NULL REFERENCES locations(id) ON DELETE CASCADE,
  pay_period_start DATE NOT NULL,
  scheduled_hours  NUMERIC(8,2) DEFAULT 0,
  actual_hours     NUMERIC(8,2) DEFAULT 0,
  scheduled_labor_cost NUMERIC(10,2) DEFAULT 0,
  actual_labor_cost    NUMERIC(10,2) DEFAULT 0,
  foh_hours        NUMERIC(8,2) DEFAULT 0,
  boh_hours        NUMERIC(8,2) DEFAULT 0,
  source           TEXT DEFAULT '7shifts',
  created_at       TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(location_id, pay_period_start)
);

ALTER TABLE labor_schedule_snapshots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "labor_snap_select" ON labor_schedule_snapshots
  FOR SELECT USING (
    location_id IN (SELECT id FROM locations WHERE user_id = (SELECT auth.uid()))
  );

GRANT ALL ON labor_schedule_snapshots TO service_role;
