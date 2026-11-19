-- ============================================================
-- HBK Portal — RLS + Table fixes
-- Run this in: https://supabase.com/dashboard/project/nlhisfbcrbkalxtxmsbn/sql/new
-- ============================================================

-- 1. food_deliveries — ensure INSERT + UPDATE + DELETE policies exist
--    (SELECT likely already works since list loads; this adds the missing write policies)

DO $$ BEGIN
  -- INSERT
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'food_deliveries' AND cmd = 'INSERT'
  ) THEN
    EXECUTE 'CREATE POLICY "authenticated insert food_deliveries"
      ON food_deliveries FOR INSERT TO authenticated WITH CHECK (true)';
  END IF;

  -- UPDATE (needed for .select() after .insert())
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'food_deliveries' AND cmd = 'UPDATE'
  ) THEN
    EXECUTE 'CREATE POLICY "authenticated update food_deliveries"
      ON food_deliveries FOR UPDATE TO authenticated USING (true) WITH CHECK (true)';
  END IF;

  -- DELETE
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'food_deliveries' AND cmd = 'DELETE'
  ) THEN
    EXECUTE 'CREATE POLICY "authenticated delete food_deliveries"
      ON food_deliveries FOR DELETE TO authenticated USING (true)';
  END IF;
END $$;

-- 2. invoice_line_items — create table if not already done
CREATE TABLE IF NOT EXISTS invoice_line_items (
  id                uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  food_delivery_id  uuid REFERENCES food_deliveries(id) ON DELETE CASCADE NOT NULL,
  name              text NOT NULL,
  qty               numeric,
  unit              text,
  unit_price        numeric,
  total             numeric,
  category          text,
  created_at        timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_ili_delivery ON invoice_line_items(food_delivery_id);
CREATE INDEX IF NOT EXISTS idx_ili_name ON invoice_line_items(lower(name));

-- 3. invoice_line_items RLS
ALTER TABLE invoice_line_items ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'invoice_line_items' AND cmd = 'SELECT'
  ) THEN
    EXECUTE 'CREATE POLICY "authenticated read invoice_line_items"
      ON invoice_line_items FOR SELECT TO authenticated USING (true)';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'invoice_line_items' AND cmd = 'INSERT'
  ) THEN
    EXECUTE 'CREATE POLICY "authenticated write invoice_line_items"
      ON invoice_line_items FOR INSERT TO authenticated WITH CHECK (true)';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'invoice_line_items' AND cmd = 'DELETE'
  ) THEN
    EXECUTE 'CREATE POLICY "authenticated delete invoice_line_items"
      ON invoice_line_items FOR DELETE TO authenticated USING (true)';
  END IF;
END $$;

-- 4. location_notification_settings — create if not done
CREATE TABLE IF NOT EXISTS location_notification_settings (
  id           uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  location_id  uuid REFERENCES locations(id) ON DELETE CASCADE NOT NULL UNIQUE,
  email        text,
  phone        text,
  notify_food_pct_threshold  numeric DEFAULT 28,
  notify_labor_pct_threshold numeric DEFAULT 30,
  notify_price_increase_pct  numeric DEFAULT 10,
  updated_at   timestamptz DEFAULT now()
);

ALTER TABLE location_notification_settings ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'location_notification_settings'
  ) THEN
    EXECUTE 'CREATE POLICY "authenticated all notification_settings"
      ON location_notification_settings FOR ALL TO authenticated USING (true) WITH CHECK (true)';
  END IF;
END $$;

-- 5. Verify — show current policies for these tables
SELECT tablename, policyname, cmd, roles
FROM pg_policies
WHERE tablename IN ('food_deliveries', 'invoice_line_items', 'location_notification_settings')
ORDER BY tablename, cmd;
