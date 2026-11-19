/**
 * GET /api/prime-cost-anomaly?location_id=&weeks=8
 *
 * Sliding-window statistical anomaly engine for prime cost + SKU price drift.
 *
 * Returns:
 *  - Weekly prime cost Z-scores (flag when |Z| > 1.5)
 *  - Per-category food cost drift (flag when week > rolling avg + 15%)
 *  - SKU-level price drift within THIS location (Z-score over 8 weeks)
 *  - Cross-location SKU price comparison (same user's locations, same week)
 *
 * Anomaly severity:
 *   "critical" — Z > 2.5 or delta > 30%
 *   "warning"  — Z > 1.5 or delta > 15%
 *   "info"     — Notable but within acceptable range
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

const DEFAULT_WEEKS = 8;
const ZSCORE_WARNING = 1.5;
const ZSCORE_CRITICAL = 2.5;
const DRIFT_WARNING_PCT = 0.15;    // 15% above rolling avg
const DRIFT_CRITICAL_PCT = 0.30;   // 30% above rolling avg
const MIN_DATA_POINTS = 3;         // minimum weeks needed to compute Z-score

type Severity = "critical" | "warning" | "info";

interface Anomaly {
  type: string;
  severity: Severity;
  message: string;
  suggested_action: string;
  evidence: Record<string, unknown>;
  week?: string;
  sku?: string;
}

interface WeeklyMetrics {
  week_start: string;
  food_cost: number;
  net_sales: number;
  food_pct: number;
  by_category: Record<string, number>;
}

interface SkuWeeklyPrice {
  item_name: string;
  canonical_name: string | null;
  week_start: string;
  avg_unit_price: number;
  total_spend: number;
  location_id: string;
}

// ── Math helpers ──────────────────────────────────────────────────────────────

function mean(values: number[]): number {
  if (!values.length) return 0;
  return values.reduce((s, v) => s + v, 0) / values.length;
}

function stddev(values: number[], mu?: number): number {
  if (values.length < 2) return 0;
  const m = mu ?? mean(values);
  const variance = values.reduce((s, v) => s + Math.pow(v - m, 2), 0) / (values.length - 1);
  return Math.sqrt(variance);
}

function zScore(value: number, mu: number, sigma: number): number {
  if (sigma === 0) return 0;
  return (value - mu) / sigma;
}

function severity(z: number): Severity {
  const absZ = Math.abs(z);
  if (absZ >= ZSCORE_CRITICAL) return "critical";
  if (absZ >= ZSCORE_WARNING) return "warning";
  return "info";
}

// ── Date helpers ──────────────────────────────────────────────────────────────

function weekStart(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00Z");
  const day = d.getUTCDay(); // 0 = Sunday
  const diff = d.getUTCDate() - day + (day === 0 ? -6 : 1); // Monday
  const monday = new Date(d);
  monday.setUTCDate(diff);
  return monday.toISOString().slice(0, 10);
}

function weeksAgo(n: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - n * 7);
  return d.toISOString().slice(0, 10);
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const locationId = searchParams.get("location_id");
  const weeks = Math.min(parseInt(searchParams.get("weeks") ?? String(DEFAULT_WEEKS), 10), 26);

  if (!locationId) {
    return NextResponse.json({ error: "location_id is required" }, { status: 400 });
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // ── Verify this location belongs to the authenticated user ─────────────────
  const { data: locationCheck } = await supabase
    .from("locations")
    .select("id, name")
    .eq("id", locationId)
    .single();

  if (!locationCheck) {
    return NextResponse.json({ error: "Location not found" }, { status: 404 });
  }

  const since = weeksAgo(weeks);

  // ── 1. Load food deliveries for this location ──────────────────────────────
  const { data: deliveries, error: deliveryErr } = await supabase
    .from("food_deliveries")
    .select("delivery_date, category, amount")
    .eq("location_id", locationId)
    .gte("delivery_date", since)
    .order("delivery_date", { ascending: true });

  if (deliveryErr) {
    return NextResponse.json({ error: deliveryErr.message }, { status: 500 });
  }

  // ── 2. Load daily sales for this location ──────────────────────────────────
  const { data: sales } = await supabase
    .from("daily_sales")
    .select("sale_date, cash_sales, pos_sales, uber_eats_gross, grubhub_gross, doordash_gross, catering_sales")
    .eq("location_id", locationId)
    .gte("sale_date", since)
    .order("sale_date", { ascending: true });

  // ── 3. Aggregate by week ───────────────────────────────────────────────────
  const weekMap = new Map<string, WeeklyMetrics>();

  for (const d of deliveries ?? []) {
    const ws = weekStart(d.delivery_date);
    if (!weekMap.has(ws)) {
      weekMap.set(ws, { week_start: ws, food_cost: 0, net_sales: 0, food_pct: 0, by_category: {} });
    }
    const w = weekMap.get(ws)!;
    w.food_cost += d.amount ?? 0;
    w.by_category[d.category] = (w.by_category[d.category] ?? 0) + (d.amount ?? 0);
  }

  for (const s of sales ?? []) {
    const ws = weekStart(s.sale_date);
    if (!weekMap.has(ws)) {
      weekMap.set(ws, { week_start: ws, food_cost: 0, net_sales: 0, food_pct: 0, by_category: {} });
    }
    const w = weekMap.get(ws)!;
    const gross =
      (s.cash_sales ?? 0) +
      (s.pos_sales ?? 0) +
      (s.uber_eats_gross ?? 0) * 0.75 + // approximate net after ~25% commission
      (s.grubhub_gross ?? 0) * 0.75 +
      (s.doordash_gross ?? 0) * 0.75 +
      (s.catering_sales ?? 0);
    w.net_sales += gross;
  }

  const weeklyData = Array.from(weekMap.values()).sort((a, b) =>
    a.week_start.localeCompare(b.week_start)
  );

  // Compute food_pct per week
  for (const w of weeklyData) {
    w.food_pct = w.net_sales > 0 ? (w.food_cost / w.net_sales) * 100 : 0;
  }

  // ── 4. Z-score anomaly detection on food cost % ────────────────────────────
  const anomalies: Anomaly[] = [];

  if (weeklyData.length >= MIN_DATA_POINTS) {
    const pcts = weeklyData.map(w => w.food_pct);
    const mu = mean(pcts);
    const sigma = stddev(pcts, mu);

    for (const w of weeklyData) {
      if (w.food_pct === 0) continue;
      const z = zScore(w.food_pct, mu, sigma);
      const sev = severity(z);

      if (Math.abs(z) >= ZSCORE_WARNING) {
        const direction = z > 0 ? "above" : "below";
        anomalies.push({
          type: "prime_cost_spike",
          severity: sev,
          week: w.week_start,
          message: `Food cost was ${w.food_pct.toFixed(1)}% — ${Math.abs(z).toFixed(1)}σ ${direction} your ${weeks}-week average of ${mu.toFixed(1)}%`,
          suggested_action: z > 0
            ? "Review invoices for that week — look for a large unplanned delivery, a price spike, or waste events."
            : "Great week — check for missing invoices that may show up later.",
          evidence: {
            week: w.week_start,
            food_cost: w.food_cost,
            net_sales: w.net_sales,
            food_pct: w.food_pct,
            baseline_mean: mu,
            baseline_sigma: sigma,
            z_score: z,
          },
        });
      }
    }

    // ── 5. Per-category drift detection ──────────────────────────────────────
    const allCategories = Array.from(new Set(weeklyData.flatMap(w => Object.keys(w.by_category))));

    for (const cat of allCategories) {
      const catSpends = weeklyData
        .filter(w => w.by_category[cat] !== undefined)
        .map(w => ({ week: w.week_start, spend: w.by_category[cat] }));

      if (catSpends.length < MIN_DATA_POINTS) continue;

      const catValues = catSpends.map(c => c.spend);
      const catMu = mean(catValues);
      const catSigma = stddev(catValues, catMu);

      const latest = catSpends[catSpends.length - 1];
      const z = zScore(latest.spend, catMu, catSigma);
      const pctDrift = catMu > 0 ? (latest.spend - catMu) / catMu : 0;

      if (Math.abs(pctDrift) >= DRIFT_WARNING_PCT && Math.abs(z) >= ZSCORE_WARNING) {
        const driftPct = (pctDrift * 100).toFixed(1);
        const dirWord = pctDrift > 0 ? "up" : "down";
        const sev: Severity = Math.abs(pctDrift) >= DRIFT_CRITICAL_PCT ? "critical" : "warning";
        anomalies.push({
          type: "category_spend_drift",
          severity: sev,
          week: latest.week,
          message: `${cat} spend ${dirWord} ${Math.abs(parseFloat(driftPct))}% vs ${weeks}-week average ($${latest.spend.toFixed(0)} vs avg $${catMu.toFixed(0)})`,
          suggested_action: pctDrift > 0
            ? `Check ${cat.toLowerCase()} invoices for the week of ${latest.week} — a price hike or over-ordering may be the cause.`
            : `${cat} spend dropped — verify no invoices are missing.`,
          evidence: {
            category: cat,
            week: latest.week,
            spend: latest.spend,
            baseline_mean: catMu,
            pct_drift: pctDrift,
            z_score: z,
          },
        });
      }
    }
  }

  // ── 6. SKU-level price drift within this location ─────────────────────────
  const { data: lineItems } = await supabase
    .from("invoice_line_items")
    .select(`
      name,
      canonical_name,
      unit_price,
      food_deliveries!inner(delivery_date, location_id)
    `)
    .eq("food_deliveries.location_id", locationId)
    .gte("food_deliveries.delivery_date", since)
    .not("unit_price", "is", null)
    .gt("unit_price", 0);

  if (lineItems && lineItems.length > 0) {
    // Group by item name, aggregate weekly average price
    type LineItemRow = {
      name: string;
      canonical_name: string | null;
      unit_price: number;
      food_deliveries: { delivery_date: string; location_id: string } | { delivery_date: string; location_id: string }[];
    };

    const skuWeeks = new Map<string, SkuWeeklyPrice[]>();

    for (const li of lineItems as LineItemRow[]) {
      const delivery = Array.isArray(li.food_deliveries) ? li.food_deliveries[0] : li.food_deliveries;
      if (!delivery) continue;
      const ws = weekStart(delivery.delivery_date);
      const key = li.name.trim().toUpperCase();

      if (!skuWeeks.has(key)) skuWeeks.set(key, []);
      const existing = skuWeeks.get(key)!.find(s => s.week_start === ws);
      if (existing) {
        // Online mean update
        const n = (existing.total_spend / existing.avg_unit_price) + 1;
        existing.avg_unit_price = (existing.avg_unit_price * (n - 1) + li.unit_price) / n;
        existing.total_spend += li.unit_price;
      } else {
        skuWeeks.get(key)!.push({
          item_name: li.name,
          canonical_name: li.canonical_name,
          week_start: ws,
          avg_unit_price: li.unit_price,
          total_spend: li.unit_price,
          location_id: locationId,
        });
      }
    }

    for (const [, prices] of Array.from(skuWeeks.entries())) {
      if (prices.length < MIN_DATA_POINTS) continue;
      const sorted = prices.sort((a, b) => a.week_start.localeCompare(b.week_start));
      const values = sorted.map(p => p.avg_unit_price);
      const mu = mean(values.slice(0, -1)); // baseline = all but latest
      const sigma = stddev(values.slice(0, -1), mu);
      const latest = sorted[sorted.length - 1];
      const z = zScore(latest.avg_unit_price, mu, sigma);
      const pctDrift = mu > 0 ? (latest.avg_unit_price - mu) / mu : 0;

      if (Math.abs(pctDrift) >= DRIFT_WARNING_PCT && Math.abs(z) >= ZSCORE_WARNING) {
        const displayName = latest.canonical_name || latest.item_name;
        const driftPct = (pctDrift * 100).toFixed(1);
        const dirWord = pctDrift > 0 ? "up" : "down";
        const sev: Severity = Math.abs(pctDrift) >= DRIFT_CRITICAL_PCT ? "critical" : "warning";
        anomalies.push({
          type: "sku_price_drift",
          severity: sev,
          week: latest.week_start,
          sku: latest.item_name,
          message: `${displayName}: price ${dirWord} ${Math.abs(parseFloat(driftPct))}% last week ($${latest.avg_unit_price.toFixed(2)} vs avg $${mu.toFixed(2)})`,
          suggested_action: pctDrift > 0
            ? `Ask your rep to justify the ${Math.abs(parseFloat(driftPct))}% price increase on ${displayName}. If it's a temporary shortage, check with alternate suppliers.`
            : `Price dropped on ${displayName} — lock in a contract or buy forward if possible.`,
          evidence: {
            sku: latest.item_name,
            canonical_name: latest.canonical_name,
            week: latest.week_start,
            current_price: latest.avg_unit_price,
            baseline_avg: mu,
            pct_drift: pctDrift,
            z_score: z,
            weeks_in_baseline: sorted.length - 1,
          },
        });
      }
    }
  }

  // ── 7. Cross-location SKU price comparison (same user's locations) ─────────
  const { data: userLocations } = await supabase
    .from("locations")
    .select("id, name, code");

  const otherLocations = (userLocations ?? []).filter(l => l.id !== locationId);

  if (otherLocations.length > 0) {
    // Get this week's price data for all locations
    const thisWeekStart = weekStart(new Date().toISOString().slice(0, 10));

    const { data: crossLocationItems } = await supabase
      .from("invoice_line_items")
      .select(`
        name,
        canonical_name,
        unit_price,
        food_deliveries!inner(delivery_date, location_id)
      `)
      .in("food_deliveries.location_id", [locationId, ...otherLocations.map(l => l.id)])
      .gte("food_deliveries.delivery_date", thisWeekStart)
      .not("unit_price", "is", null)
      .gt("unit_price", 0);

    if (crossLocationItems && crossLocationItems.length > 0) {
      type CrossItem = {
        name: string;
        canonical_name: string | null;
        unit_price: number;
        food_deliveries: { delivery_date: string; location_id: string } | { delivery_date: string; location_id: string }[];
      };

      // Group by normalized item name → location → avg price
      const skuByLocation = new Map<string, Map<string, { prices: number[]; canonical_name: string | null }>>();

      for (const li of crossLocationItems as CrossItem[]) {
        const delivery = Array.isArray(li.food_deliveries) ? li.food_deliveries[0] : li.food_deliveries;
        if (!delivery) continue;
        const skuKey = li.name.trim().toUpperCase();
        const locId = delivery.location_id;

        if (!skuByLocation.has(skuKey)) skuByLocation.set(skuKey, new Map());
        const locMap = skuByLocation.get(skuKey)!;
        if (!locMap.has(locId)) locMap.set(locId, { prices: [], canonical_name: li.canonical_name });
        locMap.get(locId)!.prices.push(li.unit_price);
      }

      for (const [skuKey, locMap] of Array.from(skuByLocation.entries())) {
        if (locMap.size < 2) continue; // Need at least 2 locations to compare

        // Compute avg price per location
        const locPrices = Array.from(locMap.entries()).map((entry: [string, { prices: number[]; canonical_name: string | null }]) => ({
          location_id: entry[0],
          location_name: (userLocations ?? []).find(l => l.id === entry[0])?.name ?? entry[0],
          avg_price: mean(entry[1].prices),
          canonical_name: entry[1].canonical_name,
        }));

        const thisLocEntry = locPrices.find(l => l.location_id === locationId);
        if (!thisLocEntry) continue;

        type LocPrice = { location_id: string; location_name: string; avg_price: number; canonical_name: string | null };
        const allPrices = (locPrices as LocPrice[]).map(l => l.avg_price);
        const networkMean = mean(allPrices);
        const networkSigma = stddev(allPrices, networkMean);
        const z = zScore(thisLocEntry.avg_price, networkMean, networkSigma);

        // Only flag if this location is paying notably MORE than others
        if (z >= ZSCORE_WARNING) {
          const lowestLoc = (locPrices as LocPrice[]).reduce((best, cur) => cur.avg_price < best.avg_price ? cur : best);
          const overpayPct = ((thisLocEntry.avg_price - lowestLoc.avg_price) / lowestLoc.avg_price * 100).toFixed(1);
          const displayName = thisLocEntry.canonical_name || skuKey;

          anomalies.push({
            type: "cross_location_price_gap",
            severity: z >= ZSCORE_CRITICAL ? "critical" : "warning",
            week: thisWeekStart,
            sku: skuKey,
            message: `${displayName}: ${locationCheck.name} pays $${thisLocEntry.avg_price.toFixed(2)}/unit vs $${lowestLoc.avg_price.toFixed(2)} at ${lowestLoc.location_name} — ${overpayPct}% more`,
            suggested_action: `Call your Sysco/US Foods rep to price-match ${locationCheck.name} to the rate ${lowestLoc.location_name} is getting. Same operator, same item — no reason for different pricing.`,
            evidence: {
              sku: skuKey,
              canonical_name: thisLocEntry.canonical_name,
              this_location: { id: locationId, name: locationCheck.name, price: thisLocEntry.avg_price },
              all_locations: locPrices,
              network_mean: networkMean,
              z_score: z,
            },
          });
        }
      }
    }
  }

  // ── Sort: critical first, then warning, then info; newest first within severity ──
  const severityOrder: Record<Severity, number> = { critical: 0, warning: 1, info: 2 };
  anomalies.sort((a, b) => {
    const sevDiff = severityOrder[a.severity] - severityOrder[b.severity];
    if (sevDiff !== 0) return sevDiff;
    return (b.week ?? "").localeCompare(a.week ?? "");
  });

  return NextResponse.json({
    location_id: locationId,
    location_name: locationCheck.name,
    analysis_weeks: weeks,
    since,
    weekly_data: weeklyData,
    anomalies,
    summary: {
      total: anomalies.length,
      critical: anomalies.filter(a => a.severity === "critical").length,
      warning: anomalies.filter(a => a.severity === "warning").length,
      info: anomalies.filter(a => a.severity === "info").length,
    },
  });
}
