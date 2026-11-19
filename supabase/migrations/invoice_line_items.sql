-- Run this in your Supabase SQL editor

-- 1. Line items per invoice
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

-- 2. Location notification settings (email + phone per location)
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

-- 3. Enable RLS
ALTER TABLE invoice_line_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE location_notification_settings ENABLE ROW LEVEL SECURITY;

-- 4. Policies (same authenticated-read pattern as other tables)
CREATE POLICY "authenticated read invoice_line_items"
  ON invoice_line_items FOR SELECT TO authenticated USING (true);
CREATE POLICY "authenticated write invoice_line_items"
  ON invoice_line_items FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "authenticated delete invoice_line_items"
  ON invoice_line_items FOR DELETE TO authenticated USING (true);

CREATE POLICY "authenticated read notification_settings"
  ON location_notification_settings FOR ALL TO authenticated USING (true) WITH CHECK (true);
