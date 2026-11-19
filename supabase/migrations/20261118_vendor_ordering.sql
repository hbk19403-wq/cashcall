-- ── Vendor Ordering & Payments — Layer 1 MVP ─────────────────────────────────
-- Tables: vendor_contacts, order_drafts, order_draft_items
-- ─────────────────────────────────────────────────────────────────────────────

-- ── vendor_contacts ───────────────────────────────────────────────────────────
-- Stores the restaurant owner's vendor rep contacts for each location.
-- Used to send reorder emails in Layer 1.
CREATE TABLE IF NOT EXISTS vendor_contacts (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  location_id     UUID NOT NULL REFERENCES locations(id) ON DELETE CASCADE,
  vendor_name     TEXT NOT NULL,          -- e.g. "Sysco", "US Foods", "PFG", "GFS"
  rep_name        TEXT,
  rep_email       TEXT NOT NULL,
  account_number  TEXT,                   -- owner's account # with that vendor
  notes           TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (location_id, vendor_name)
);

CREATE INDEX IF NOT EXISTS vendor_contacts_location_idx
  ON vendor_contacts (location_id);

-- RLS: owners can read/write their own locations' contacts
ALTER TABLE vendor_contacts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "owner can manage vendor contacts"
  ON vendor_contacts
  USING (
    location_id IN (
      SELECT id FROM locations WHERE user_id = auth.uid()
    )
  )
  WITH CHECK (
    location_id IN (
      SELECT id FROM locations WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "service role full access on vendor_contacts"
  ON vendor_contacts
  USING (auth.role() = 'service_role');

-- ── order_drafts ──────────────────────────────────────────────────────────────
-- A single vendor order (may contain multiple line items).
-- status: draft → submitted → confirmed | cancelled
CREATE TABLE IF NOT EXISTS order_drafts (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  location_id     UUID NOT NULL REFERENCES locations(id) ON DELETE CASCADE,
  vendor_name     TEXT NOT NULL,
  vendor_contact_id UUID REFERENCES vendor_contacts(id),
  status          TEXT NOT NULL DEFAULT 'draft'
                  CHECK (status IN ('draft', 'submitted', 'confirmed', 'cancelled')),
  submitted_at    TIMESTAMPTZ,
  notes           TEXT,
  -- Submission details
  submission_method TEXT DEFAULT 'email' CHECK (submission_method IN ('email', 'pdf', 'api')),
  email_message_id  TEXT,                -- Resend message ID after submission
  -- Source: which invoice triggered this reorder
  source_food_delivery_id UUID,          -- the food_delivery that was reordered from
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS order_drafts_location_idx
  ON order_drafts (location_id, created_at DESC);

CREATE INDEX IF NOT EXISTS order_drafts_status_idx
  ON order_drafts (status)
  WHERE status IN ('draft', 'submitted');

ALTER TABLE order_drafts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "owner can manage order drafts"
  ON order_drafts
  USING (
    location_id IN (
      SELECT id FROM locations WHERE user_id = auth.uid()
    )
  )
  WITH CHECK (
    location_id IN (
      SELECT id FROM locations WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "service role full access on order_drafts"
  ON order_drafts
  USING (auth.role() = 'service_role');

-- ── order_draft_items ─────────────────────────────────────────────────────────
-- Line items for an order draft.
CREATE TABLE IF NOT EXISTS order_draft_items (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_draft_id  UUID NOT NULL REFERENCES order_drafts(id) ON DELETE CASCADE,
  -- Item details (populated from invoice_line_items OCR data)
  item_name       TEXT NOT NULL,          -- canonical_name or name from OCR
  item_code       TEXT,                   -- vendor's product code
  pack_size       TEXT,
  brand           TEXT,
  quantity        NUMERIC NOT NULL DEFAULT 1,
  unit            TEXT,
  last_unit_price NUMERIC,                -- last price paid, for reference
  notes           TEXT,
  -- Source tracing
  source_line_item_id UUID,              -- invoice_line_items.id this was cloned from
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS order_draft_items_draft_idx
  ON order_draft_items (order_draft_id);

ALTER TABLE order_draft_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "owner can manage order draft items"
  ON order_draft_items
  USING (
    order_draft_id IN (
      SELECT od.id FROM order_drafts od
      JOIN locations l ON l.id = od.location_id
      WHERE l.user_id = auth.uid()
    )
  )
  WITH CHECK (
    order_draft_id IN (
      SELECT od.id FROM order_drafts od
      JOIN locations l ON l.id = od.location_id
      WHERE l.user_id = auth.uid()
    )
  );

CREATE POLICY "service role full access on order_draft_items"
  ON order_draft_items
  USING (auth.role() = 'service_role');

-- ── updated_at trigger ────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS vendor_contacts_updated_at ON vendor_contacts;
CREATE TRIGGER vendor_contacts_updated_at
  BEFORE UPDATE ON vendor_contacts
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS order_drafts_updated_at ON order_drafts;
CREATE TRIGGER order_drafts_updated_at
  BEFORE UPDATE ON order_drafts
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

COMMENT ON TABLE vendor_contacts IS 'Vendor rep contacts per location — used for Layer 1 email order submission';
COMMENT ON TABLE order_drafts IS 'Vendor reorder drafts staged from invoice history (Layer 1 MVP)';
COMMENT ON TABLE order_draft_items IS 'Line items for a vendor order draft';
