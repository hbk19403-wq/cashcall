-- ============================================================
-- CashCall New Features Migration
-- Run in: Supabase SQL Editor (CashCall project)
-- ============================================================

-- 1. Add location_type to locations table
ALTER TABLE locations
  ADD COLUMN IF NOT EXISTS location_type text NOT NULL DEFAULT 'restaurant';

-- Allowed values: 'restaurant' | 'bar_restaurant'
-- Default to 'restaurant' for all existing locations

-- 2. menu_items table
CREATE TABLE IF NOT EXISTS menu_items (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  location_id     uuid NOT NULL REFERENCES locations(id) ON DELETE CASCADE,
  user_id         uuid,
  name            text NOT NULL,
  food_cost       numeric(10,2) NOT NULL DEFAULT 0,
  cook_time_minutes int NOT NULL DEFAULT 0,
  selling_price   numeric(10,2) NOT NULL DEFAULT 0,
  is_popular      boolean NOT NULL DEFAULT false,
  created_at      timestamptz DEFAULT now(),
  updated_at      timestamptz DEFAULT now()
);

-- RLS for menu_items
ALTER TABLE menu_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "menu_items: owner access" ON menu_items
  FOR ALL TO authenticated
  USING (
    location_id IN (
      SELECT id FROM locations WHERE user_id = auth.uid()
    )
    OR user_id = auth.uid()
  )
  WITH CHECK (
    location_id IN (
      SELECT id FROM locations WHERE user_id = auth.uid()
    )
  );

-- 3. liquor_bottles table (bottle catalog per location)
CREATE TABLE IF NOT EXISTS liquor_bottles (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  location_id     uuid NOT NULL REFERENCES locations(id) ON DELETE CASCADE,
  user_id         uuid,
  spirit_type     text NOT NULL,
  brand           text NOT NULL,
  bottle_size_ml  int NOT NULL DEFAULT 750,
  pour_size_oz    numeric(4,2) NOT NULL DEFAULT 1.5,
  cost_per_bottle numeric(10,2) NOT NULL DEFAULT 0,
  par_level       int NOT NULL DEFAULT 2,
  current_stock   int NOT NULL DEFAULT 0,
  created_at      timestamptz DEFAULT now(),
  updated_at      timestamptz DEFAULT now()
);

ALTER TABLE liquor_bottles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "liquor_bottles: owner access" ON liquor_bottles
  FOR ALL TO authenticated
  USING (
    location_id IN (SELECT id FROM locations WHERE user_id = auth.uid())
    OR user_id = auth.uid()
  )
  WITH CHECK (
    location_id IN (SELECT id FROM locations WHERE user_id = auth.uid())
  );

-- 4. liquor_transactions table (purchases and stock counts)
CREATE TABLE IF NOT EXISTS liquor_transactions (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  location_id      uuid NOT NULL REFERENCES locations(id) ON DELETE CASCADE,
  user_id          uuid,
  bottle_id        uuid REFERENCES liquor_bottles(id) ON DELETE CASCADE,
  transaction_type text NOT NULL CHECK (transaction_type IN ('purchase', 'count')),
  quantity         int NOT NULL,
  cost_per_unit    numeric(10,2) NOT NULL DEFAULT 0,
  transaction_date date NOT NULL DEFAULT CURRENT_DATE,
  notes            text,
  created_at       timestamptz DEFAULT now()
);

ALTER TABLE liquor_transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "liquor_transactions: owner access" ON liquor_transactions
  FOR ALL TO authenticated
  USING (
    location_id IN (SELECT id FROM locations WHERE user_id = auth.uid())
    OR user_id = auth.uid()
  )
  WITH CHECK (
    location_id IN (SELECT id FROM locations WHERE user_id = auth.uid())
  );

-- 5. Add liquor columns to location_budgets if they don't exist
ALTER TABLE location_budgets
  ADD COLUMN IF NOT EXISTS liquor_pct_target numeric(5,2) DEFAULT 20,
  ADD COLUMN IF NOT EXISTS liquor_budget      numeric(12,2) DEFAULT 0;

-- ============================================================
-- Indexes for performance
-- ============================================================
CREATE INDEX IF NOT EXISTS menu_items_location_id_idx ON menu_items(location_id);
CREATE INDEX IF NOT EXISTS liquor_bottles_location_id_idx ON liquor_bottles(location_id);
CREATE INDEX IF NOT EXISTS liquor_transactions_location_id_idx ON liquor_transactions(location_id);
CREATE INDEX IF NOT EXISTS liquor_transactions_bottle_id_idx ON liquor_transactions(bottle_id);
CREATE INDEX IF NOT EXISTS liquor_transactions_date_idx ON liquor_transactions(transaction_date);
