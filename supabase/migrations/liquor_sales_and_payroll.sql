-- ============================================================
-- HBK Portal — Liquor Sales + Payroll tables
-- Run this in: https://supabase.com/dashboard/project/nlhisfbcrbkalxtxmsbn/sql/new
-- ============================================================

-- 1. Add liquor_sales column to daily_sales (if not already present)
ALTER TABLE daily_sales ADD COLUMN IF NOT EXISTS liquor_sales numeric DEFAULT 0;

-- 2. Create payroll_entries table
CREATE TABLE IF NOT EXISTS payroll_entries (
  id              uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  location_id     uuid REFERENCES locations(id) ON DELETE CASCADE NOT NULL,
  period_start    date NOT NULL,
  period_end      date NOT NULL,
  pay_date        date NOT NULL,
  gross_wages     numeric NOT NULL DEFAULT 0,
  employer_taxes  numeric NOT NULL DEFAULT 0,   -- FICA employer share, FUTA, SUTA
  net_wages       numeric NOT NULL DEFAULT 0,
  employee_count  integer DEFAULT 0,
  source          text DEFAULT 'manual',        -- 'manual' | 'adp' | 'intuit'
  source_ref      text,                         -- ADP check/batch #, Intuit payroll ID
  notes           text,
  created_at      timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_payroll_location ON payroll_entries(location_id, period_start);

ALTER TABLE payroll_entries ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'payroll_entries'
  ) THEN
    EXECUTE 'CREATE POLICY "authenticated all payroll_entries"
      ON payroll_entries FOR ALL TO authenticated USING (true) WITH CHECK (true)';
  END IF;
END $$;

-- 3. Create payroll_line_items table (per-employee breakdown)
CREATE TABLE IF NOT EXISTS payroll_line_items (
  id                uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  payroll_entry_id  uuid REFERENCES payroll_entries(id) ON DELETE CASCADE NOT NULL,
  employee_name     text NOT NULL,
  employee_id       text,
  role              text,
  hours_regular     numeric DEFAULT 0,
  hours_overtime    numeric DEFAULT 0,
  rate              numeric DEFAULT 0,
  gross_wages       numeric DEFAULT 0,
  net_wages         numeric DEFAULT 0,
  created_at        timestamptz DEFAULT now()
);

ALTER TABLE payroll_line_items ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'payroll_line_items'
  ) THEN
    EXECUTE 'CREATE POLICY "authenticated all payroll_line_items"
      ON payroll_line_items FOR ALL TO authenticated USING (true) WITH CHECK (true)';
  END IF;
END $$;
