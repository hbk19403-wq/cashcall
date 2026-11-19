-- Migration: Add broadliner OCR fields to invoice_line_items
-- These columns support the v2.0 broadliner OCR pipeline:
--   canonical_name  — decoded, human-readable item name (e.g. "Fresh Boneless Skinless Chicken Breast")
--   item_code       — distributor's product code (e.g. Sysco 7-digit code)
--   brand           — brand name when explicitly on invoice (e.g. "Sysco Classic", "Monarch")
--   pack_size       — pack configuration (e.g. "4/1 GAL", "1/40 LB", "6/5 LB")
--   is_catch_weight — true if item sold by actual weight (qty × case-weight varies)
--   is_credit       — true if this is a return or credit line (negative total)
--   is_fee          — true if this is a surcharge/fee, not a food item
--   ocr_confidence  — AI confidence for this line: "high" | "medium" | "low"

ALTER TABLE invoice_line_items
  ADD COLUMN IF NOT EXISTS canonical_name  TEXT,
  ADD COLUMN IF NOT EXISTS item_code       TEXT,
  ADD COLUMN IF NOT EXISTS brand           TEXT,
  ADD COLUMN IF NOT EXISTS pack_size       TEXT,
  ADD COLUMN IF NOT EXISTS is_catch_weight BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS is_credit       BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS is_fee          BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS ocr_confidence  TEXT CHECK (ocr_confidence IN ('high', 'medium', 'low'));

-- Index for fast canonical name lookups (used by price drift queries)
CREATE INDEX IF NOT EXISTS idx_invoice_line_items_canonical_name
  ON invoice_line_items (canonical_name)
  WHERE canonical_name IS NOT NULL;

-- Index for item_code lookups (distributor deduplication)
CREATE INDEX IF NOT EXISTS idx_invoice_line_items_item_code
  ON invoice_line_items (item_code)
  WHERE item_code IS NOT NULL;

-- Index for filtering out fees and credits in cost calculations
CREATE INDEX IF NOT EXISTS idx_invoice_line_items_is_fee
  ON invoice_line_items (is_fee)
  WHERE is_fee = TRUE;

-- Comment the table for documentation
COMMENT ON COLUMN invoice_line_items.canonical_name  IS 'Decoded human-readable item name from broadliner OCR abbreviation expansion';
COMMENT ON COLUMN invoice_line_items.item_code       IS 'Distributor product code (Sysco 7-digit, US Foods 6-digit, GFS letter-prefix, etc.)';
COMMENT ON COLUMN invoice_line_items.brand           IS 'Brand name as printed on invoice (e.g. Sysco Classic, Monarch, Affinity)';
COMMENT ON COLUMN invoice_line_items.pack_size       IS 'Pack configuration as printed (e.g. 4/1 GAL, 1/40 LB, 6/5 LB)';
COMMENT ON COLUMN invoice_line_items.is_catch_weight IS 'True if item is sold by actual weight — case weight varies (most proteins, fresh fish)';
COMMENT ON COLUMN invoice_line_items.is_credit       IS 'True if this is a return, credit, or negative line item';
COMMENT ON COLUMN invoice_line_items.is_fee          IS 'True if this is a fee/surcharge (fuel adjustment, delivery fee) — not a food item';
COMMENT ON COLUMN invoice_line_items.ocr_confidence  IS 'AI confidence for this line: high | medium | low';
