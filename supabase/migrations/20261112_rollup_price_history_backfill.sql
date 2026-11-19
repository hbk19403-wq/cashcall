-- rollup_price_history: summarise EVERY completed month before pruning.
--
-- The previous version summarised only last month, then deleted raw line items older than the
-- cutoff. Any month that was never summarised (for example, months before the cron first ran)
-- would have been deleted without ever reaching price_history_monthly. This version summarises
-- all completed months that still have raw rows, so nothing is pruned unsummarised.
-- Re-running is safe: the upsert recomputes each month from the raw rows that exist.

CREATE OR REPLACE FUNCTION public.rollup_price_history(p_cutoff_months integer DEFAULT 6)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_current_month text;
  v_cutoff_date   date;
  v_rows_inserted int;
BEGIN
  v_current_month := to_char(date_trunc('month', now()), 'YYYY-MM');
  v_cutoff_date   := (date_trunc('month', now()) - (p_cutoff_months || ' months')::interval)::date;

  INSERT INTO price_history_monthly (
    item_id, location_id, month, avg_price, min_price, max_price, total_spend, order_count, computed_at
  )
  SELECT
    ili.item_id, fd.location_id,
    to_char(fd.delivery_date::date, 'YYYY-MM') AS month,
    round(avg(ili.unit_price)::numeric, 4),
    round(min(ili.unit_price)::numeric, 4),
    round(max(ili.unit_price)::numeric, 4),
    round(sum(ili.unit_price * COALESCE(ili.qty, 1))::numeric, 2),
    count(*)::int,
    now()
  FROM invoice_line_items ili
  JOIN food_deliveries fd ON fd.id = ili.food_delivery_id
  WHERE ili.item_id IS NOT NULL AND ili.unit_price IS NOT NULL AND ili.unit_price > 0
    AND to_char(fd.delivery_date::date, 'YYYY-MM') < v_current_month   -- every completed month
  GROUP BY ili.item_id, fd.location_id, month
  ON CONFLICT (item_id, location_id, month) DO UPDATE SET
    avg_price = EXCLUDED.avg_price, min_price = EXCLUDED.min_price,
    max_price = EXCLUDED.max_price, total_spend = EXCLUDED.total_spend,
    order_count = EXCLUDED.order_count, computed_at = now();

  GET DIAGNOSTICS v_rows_inserted = ROW_COUNT;

  -- Prune raw rows older than the cutoff. They were summarised by the statement above.
  DELETE FROM invoice_line_items ili
  USING food_deliveries fd
  WHERE ili.food_delivery_id = fd.id
    AND fd.delivery_date < v_cutoff_date
    AND ili.item_id IS NOT NULL;

  RETURN v_rows_inserted;
END;
$function$;
