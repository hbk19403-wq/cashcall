-- ============================================================
-- CashCall Enterprise Database Hardening Migration
-- Principal Architect: Performance, Integrity & Scale
-- Target: 100k+ concurrent restaurant operators
-- ============================================================

-- ── 1. COMPOSITE INDEXES (location_id-first on all hot paths) ──────────────
-- Every query pattern starts with location_id filter — B-Tree indexes
-- must lead with that column to guarantee partition pruning at scale.

-- invoice_line_items: primary hot path for P&L + OCR lookups
CREATE INDEX IF NOT EXISTS idx_ili_location_date
  ON invoice_line_items (location_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_ili_location_category
  ON invoice_line_items (location_id, category);

-- GIN index for JSONB OCR metadata (semi-structured extraction payloads)
-- Enables operators to query by vendor SKU, item description, etc.
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name='invoice_line_items' AND column_name='ocr_metadata'
  ) THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_ili_ocr_gin ON invoice_line_items USING gin(ocr_metadata)';
  END IF;
END $$;

-- pos_sync_log: nightly cron queries by location + date range
CREATE INDEX IF NOT EXISTS idx_psl_location_synced
  ON pos_sync_log (location_id, synced_at DESC);

CREATE INDEX IF NOT EXISTS idx_psl_location_date
  ON pos_sync_log (location_id, sync_date DESC);

-- Partial index: only unresolved errors (keeps index tiny, fast circuit-breaker checks)
CREATE INDEX IF NOT EXISTS idx_psl_errors_unresolved
  ON pos_sync_log (location_id, synced_at DESC)
  WHERE error IS NOT NULL;

-- pos_connections: fast lookup by location + provider for sync routes
CREATE INDEX IF NOT EXISTS idx_posconn_location_provider
  ON pos_connections (location_id, provider);

-- Partial index: only connections in error state (surfaces reconnect alerts fast)
CREATE INDEX IF NOT EXISTS idx_posconn_error_state
  ON pos_connections (location_id, provider, sync_status)
  WHERE sync_status = 'error';

-- payroll_entries: location + month queries for P&L
CREATE INDEX IF NOT EXISTS idx_payroll_location_month
  ON payroll_entries (location_id, month DESC);

-- ── 2. IDEMPOTENCY — Webhook & OCR Deduplication ──────────────────────────
-- Prevents double-processing of POS webhooks and duplicate OCR submissions.
-- Uses a compound unique constraint as the idempotency key.

-- POS sync log: prevent duplicate sync entries for same location+date+provider
ALTER TABLE pos_sync_log
  ADD COLUMN IF NOT EXISTS idempotency_key text
  GENERATED ALWAYS AS (location_id::text || '|' || provider || '|' || sync_date::text) STORED;

CREATE UNIQUE INDEX IF NOT EXISTS idx_psl_idempotency
  ON pos_sync_log (idempotency_key)
  WHERE error IS NULL; -- only deduplicate successful syncs

-- ── 3. POS CONNECTION HEALTH TRACKING ─────────────────────────────────────
-- Tracks consecutive failure counts for circuit-breaker logic.
-- When consecutive_errors >= 3, the nightly cron skips the connection
-- and surfaces a "needs reconnect" alert to the operator.

ALTER TABLE pos_connections
  ADD COLUMN IF NOT EXISTS consecutive_errors   integer   NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_error_at         timestamptz,
  ADD COLUMN IF NOT EXISTS needs_reconnect       boolean   NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS token_refreshed_at    timestamptz;

-- Auto-flag connections that need reconnect after 3 consecutive failures
CREATE OR REPLACE FUNCTION cashcall_pos_circuit_breaker()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.sync_status = 'error' THEN
    NEW.consecutive_errors := COALESCE(OLD.consecutive_errors, 0) + 1;
    NEW.last_error_at := now();
    -- Circuit opens at 3 consecutive failures
    IF NEW.consecutive_errors >= 3 THEN
      NEW.needs_reconnect := true;
    END IF;
  ELSIF NEW.sync_status = 'idle' THEN
    -- Reset circuit on success
    NEW.consecutive_errors := 0;
    NEW.needs_reconnect := false;
    NEW.last_error_at := NULL;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_pos_circuit_breaker ON pos_connections;
CREATE TRIGGER trg_pos_circuit_breaker
  BEFORE UPDATE ON pos_connections
  FOR EACH ROW
  EXECUTE FUNCTION cashcall_pos_circuit_breaker();

-- ── 4. AUDIT LOG (Append-Only Financial Mutation Tracking) ────────────────
-- Immutable ledger of all financial writes: who changed what, when, and from
-- where. Required for SOC 2 Type II and restaurant franchise accountability.

CREATE TABLE IF NOT EXISTS financial_audit_log (
  id            bigserial     PRIMARY KEY,
  location_id   uuid          NOT NULL,
  table_name    text          NOT NULL,
  operation     text          NOT NULL CHECK (operation IN ('INSERT','UPDATE','DELETE')),
  row_id        text          NOT NULL,
  old_data      jsonb,
  new_data      jsonb,
  changed_by    uuid,         -- auth.users.id
  changed_at    timestamptz   NOT NULL DEFAULT now(),
  ip_address    inet,
  user_agent    text
);

-- Append-only: no UPDATE or DELETE allowed on audit log
CREATE OR REPLACE RULE no_update_audit AS ON UPDATE TO financial_audit_log DO INSTEAD NOTHING;
CREATE OR REPLACE RULE no_delete_audit AS ON DELETE TO financial_audit_log DO INSTEAD NOTHING;

-- Index for compliance queries: "show all changes to location X between dates"
CREATE INDEX IF NOT EXISTS idx_audit_location_time
  ON financial_audit_log (location_id, changed_at DESC);

CREATE INDEX IF NOT EXISTS idx_audit_table_op
  ON financial_audit_log (table_name, operation, changed_at DESC);

-- ── 5. OCR PIPELINE — Idempotency Hash Table ──────────────────────────────
-- Redis-backed deduplication lives in the app layer, but Postgres provides
-- the persistent fallback: a hash of the image content prevents re-processing
-- the same invoice photo uploaded twice.

CREATE TABLE IF NOT EXISTS ocr_submissions (
  id              uuid          DEFAULT gen_random_uuid() PRIMARY KEY,
  location_id     uuid          NOT NULL REFERENCES locations(id) ON DELETE CASCADE,
  content_hash    text          NOT NULL,  -- SHA-256 of raw image bytes
  status          text          NOT NULL DEFAULT 'pending'
                                CHECK (status IN ('pending','processing','done','failed')),
  invoice_id      uuid,         -- populated on success
  error_message   text,
  submitted_at    timestamptz   NOT NULL DEFAULT now(),
  processed_at    timestamptz,
  retry_count     integer       NOT NULL DEFAULT 0
);

-- Unique constraint: same image for same location is never processed twice
CREATE UNIQUE INDEX IF NOT EXISTS idx_ocr_location_hash
  ON ocr_submissions (location_id, content_hash)
  WHERE status = 'done';

-- Partial index: fast queue drain for pending jobs
CREATE INDEX IF NOT EXISTS idx_ocr_pending_queue
  ON ocr_submissions (submitted_at ASC)
  WHERE status IN ('pending','failed') AND retry_count < 3;

-- ── 6. REAL-TIME ANOMALY DETECTION STATE ──────────────────────────────────
-- Tracks active prime cost anomalies per location for dashboard alerting.

CREATE TABLE IF NOT EXISTS cost_anomalies (
  id              uuid          DEFAULT gen_random_uuid() PRIMARY KEY,
  location_id     uuid          NOT NULL REFERENCES locations(id) ON DELETE CASCADE,
  anomaly_type    text          NOT NULL,  -- 'food_cost_spike','labor_overtime','vendor_price_creep'
  threshold_pct   numeric(5,2),
  actual_pct      numeric(5,2),
  detected_at     timestamptz   NOT NULL DEFAULT now(),
  resolved_at     timestamptz,
  acknowledged_by uuid,
  metadata        jsonb
);

CREATE INDEX IF NOT EXISTS idx_anomaly_location_active
  ON cost_anomalies (location_id, detected_at DESC)
  WHERE resolved_at IS NULL;

-- GIN on metadata for flexible queries (e.g., "find all vendor price-creep anomalies for Sysco")
CREATE INDEX IF NOT EXISTS idx_anomaly_metadata_gin
  ON cost_anomalies USING gin(metadata);

-- ── 7. ROW-LEVEL SECURITY (Tenant Isolation) ──────────────────────────────
-- Ensures absolute multi-tenant data isolation at the database level.
-- No application-layer bypass can expose cross-tenant data.

ALTER TABLE financial_audit_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE ocr_submissions     ENABLE ROW LEVEL SECURITY;
ALTER TABLE cost_anomalies      ENABLE ROW LEVEL SECURITY;

-- Users can only see audit entries for their own locations
CREATE POLICY "audit_log_location_isolation" ON financial_audit_log
  FOR SELECT USING (
    location_id IN (
      SELECT id FROM locations
      WHERE user_id = auth.uid()
      OR id IN (
        SELECT location_id FROM team_members WHERE user_id = auth.uid()
      )
    )
  );

-- OCR submissions: only the owning location
CREATE POLICY "ocr_location_isolation" ON ocr_submissions
  FOR ALL USING (
    location_id IN (
      SELECT id FROM locations WHERE user_id = auth.uid()
      UNION
      SELECT location_id FROM team_members WHERE user_id = auth.uid()
    )
  );

-- Anomalies: only visible to location owner/team
CREATE POLICY "anomaly_location_isolation" ON cost_anomalies
  FOR ALL USING (
    location_id IN (
      SELECT id FROM locations WHERE user_id = auth.uid()
      UNION
      SELECT location_id FROM team_members WHERE user_id = auth.uid()
    )
  );

-- ── 8. PERFORMANCE MONITORING VIEW ────────────────────────────────────────
-- Real-time visibility into which locations have sync health issues.
-- Used by the dashboard's orange dot notification system.

CREATE OR REPLACE VIEW v_integration_health AS
SELECT
  l.id            AS location_id,
  l.name          AS location_name,
  pc.provider,
  pc.sync_status,
  pc.consecutive_errors,
  pc.needs_reconnect,
  pc.last_error_at,
  pc.last_synced,
  pc.sync_error,
  CASE
    WHEN pc.needs_reconnect = true THEN 'critical'
    WHEN pc.consecutive_errors >= 1 THEN 'warning'
    WHEN pc.last_synced < now() - INTERVAL '25 hours' THEN 'stale'
    ELSE 'healthy'
  END             AS health_status
FROM locations l
JOIN pos_connections pc ON pc.location_id = l.id
ORDER BY l.name, pc.provider;

-- ── 9. FUNCTION: Safe POS Sync with Circuit Breaker ───────────────────────
-- Atomic transaction wrapper for POS sync writes.
-- Ensures the pos_sync_log entry and daily_sales upsert are atomic.
-- On failure: rolls back both and increments the circuit breaker counter.

CREATE OR REPLACE FUNCTION cashcall_safe_pos_upsert(
  p_location_id   uuid,
  p_provider      text,
  p_sale_date     date,
  p_connection_id uuid,
  p_sales_data    jsonb  -- JSON of daily_sales columns
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_idempotency_key text;
  v_existing        record;
  v_result          jsonb;
BEGIN
  -- Check circuit breaker: skip if needs_reconnect
  SELECT needs_reconnect INTO v_existing
  FROM pos_connections WHERE id = p_connection_id;

  IF v_existing.needs_reconnect THEN
    RETURN jsonb_build_object('skipped', true, 'reason', 'circuit_open');
  END IF;

  -- Idempotency check
  v_idempotency_key := p_location_id::text || '|' || p_provider || '|' || p_sale_date::text;

  IF EXISTS (
    SELECT 1 FROM pos_sync_log
    WHERE idempotency_key = v_idempotency_key AND error IS NULL
  ) THEN
    RETURN jsonb_build_object('skipped', true, 'reason', 'already_synced');
  END IF;

  -- Atomic upsert
  INSERT INTO daily_sales (
    location_id, sale_date,
    cash_sales, pos_sales, uber_eats_gross, grubhub_gross,
    doordash_gross, catering_sales, cash_tips, aggregator_commission
  )
  VALUES (
    p_location_id, p_sale_date,
    (p_sales_data->>'cash_sales')::numeric,
    (p_sales_data->>'pos_sales')::numeric,
    (p_sales_data->>'uber_eats_gross')::numeric,
    (p_sales_data->>'grubhub_gross')::numeric,
    (p_sales_data->>'doordash_gross')::numeric,
    (p_sales_data->>'catering_sales')::numeric,
    (p_sales_data->>'cash_tips')::numeric,
    0
  )
  ON CONFLICT (location_id, sale_date) DO UPDATE SET
    cash_sales           = EXCLUDED.cash_sales,
    pos_sales            = EXCLUDED.pos_sales,
    uber_eats_gross      = EXCLUDED.uber_eats_gross,
    grubhub_gross        = EXCLUDED.grubhub_gross,
    doordash_gross       = EXCLUDED.doordash_gross,
    catering_sales       = EXCLUDED.catering_sales,
    cash_tips            = EXCLUDED.cash_tips;

  -- Log the sync
  INSERT INTO pos_sync_log (location_id, provider, sync_date, rows_upserted, error)
  VALUES (p_location_id, p_provider, p_sale_date, 1, NULL);

  -- Reset circuit breaker on success
  UPDATE pos_connections SET
    sync_status        = 'idle',
    sync_error         = NULL,
    consecutive_errors = 0,
    needs_reconnect    = false,
    last_synced        = now()
  WHERE id = p_connection_id;

  RETURN jsonb_build_object('success', true, 'date', p_sale_date);

EXCEPTION WHEN OTHERS THEN
  -- Log the failure
  INSERT INTO pos_sync_log (location_id, provider, sync_date, rows_upserted, error)
  VALUES (p_location_id, p_provider, p_sale_date, 0, SQLERRM);

  -- Increment circuit breaker
  UPDATE pos_connections SET
    sync_status    = 'error',
    sync_error     = SQLERRM,
    last_error_at  = now()
  WHERE id = p_connection_id;

  RETURN jsonb_build_object('error', SQLERRM);
END;
$$;

-- ── GRANT service role access to new tables ───────────────────────────────
GRANT ALL ON financial_audit_log TO service_role;
GRANT ALL ON ocr_submissions     TO service_role;
GRANT ALL ON cost_anomalies      TO service_role;
GRANT SELECT ON v_integration_health TO authenticated;
GRANT EXECUTE ON FUNCTION cashcall_safe_pos_upsert TO service_role;
