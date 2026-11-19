export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createClient as createServiceClient } from "@supabase/supabase-js";

// ── Board-spec digest format (T+24 playbook) ─────────────────────────────────
// ⚡ CashCall Daily Brief — [Restaurant Name]
//
// 📊 Prime Cost: 32.4% (+2.1% vs last week)
// 🔴 Price Creep Alert: Chicken Breast jumped +$0.47/lb = -$340 this month
// ✅ 3 invoices processed automatically
// 📸 2 items need your review
//
// Reply INVOICE to send tonight's invoices
// Reply STOP to pause

function daysAgo(n: number) {
  const d = new Date(); d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

function fmt(n: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n);
}

function fmtPrice(n: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);
}

type SalesRow = {
  location_id: string;
  cash_sales: number;
  pos_sales: number;
  liquor_sales: number;
  uber_eats_gross: number;
  grubhub_gross: number;
  doordash_gross: number;
  catering_sales: number;
  cash_tips: number;
  aggregator_commission: number;
};

const nv = (v: unknown) => parseFloat(String(v ?? 0)) || 0;

function rowTotal(r: SalesRow): number {
  const aggregatorNet = (nv(r.uber_eats_gross) + nv(r.grubhub_gross) + nv(r.doordash_gross)) - nv(r.aggregator_commission);
  return nv(r.cash_sales) + nv(r.pos_sales) + nv(r.liquor_sales) + aggregatorNet + nv(r.catering_sales);
}

export async function GET(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    const cronKey = req.headers.get("x-cron-key");
    const isCron = cronKey && cronKey === process.env.CRON_SECRET;

    const userId = user?.id ?? (isCron ? req.nextUrl.searchParams.get("user_id") : null);
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const db = isCron && !user
      ? createServiceClient(
          process.env.NEXT_PUBLIC_SUPABASE_URL!,
          process.env.SUPABASE_SERVICE_ROLE_KEY!,
          { auth: { persistSession: false } }
        )
      : supabase;

    // ── Date windows ──────────────────────────────────────────────────────────
    const yesterday   = daysAgo(1);
    const d7ago       = daysAgo(7);
    const d8ago       = daysAgo(8);
    const d14ago      = daysAgo(14);
    const d30ago      = daysAgo(30);

    // ── Locations ─────────────────────────────────────────────────────────────
    const { data: locations } = await db.from("locations").select("id,name").eq("user_id", userId).order("name");
    const locIds = (locations ?? []).map((l: { id: string }) => l.id);

    if (locIds.length === 0) {
      return NextResponse.json({ digest: "No locations set up yet." });
    }

    const locMap: Record<string, string> = {};
    for (const l of locations ?? []) locMap[l.id] = l.name;
    const primaryLocName = (locations ?? [])[0]?.name ?? "Your Restaurant";

    // ── Sales: this week vs last week (7-day windows) ─────────────────────────
    const [thisWeekSales, lastWeekSales] = await Promise.all([
      db.from("daily_sales")
        .select("location_id,cash_sales,pos_sales,liquor_sales,uber_eats_gross,grubhub_gross,doordash_gross,catering_sales,cash_tips,aggregator_commission")
        .in("location_id", locIds)
        .gte("sale_date", d7ago)
        .lte("sale_date", yesterday),
      db.from("daily_sales")
        .select("location_id,cash_sales,pos_sales,liquor_sales,uber_eats_gross,grubhub_gross,doordash_gross,catering_sales,cash_tips,aggregator_commission")
        .in("location_id", locIds)
        .gte("sale_date", d14ago)
        .lte("sale_date", d8ago),
    ]);

    // ── Food cost: this week vs last week ─────────────────────────────────────
    const [thisWeekFood, lastWeekFood] = await Promise.all([
      db.from("food_deliveries").select("amount").in("location_id", locIds).gte("delivery_date", d7ago).lte("delivery_date", yesterday),
      db.from("food_deliveries").select("amount").in("location_id", locIds).gte("delivery_date", d14ago).lte("delivery_date", d8ago),
    ]);

    // ── Labor: 30-day (same calculation as dashboard) ─────────────────────────
    const [hourlyHoursRes, salariedRes, bohRes, disbRes] = await Promise.all([
      db.from("foh_hourly_hours")
        .select("hours_worked,overtime_hours,foh_hourly_staff!inner(hourly_rate,location_id)")
        .in("foh_hourly_staff.location_id", locIds)
        .gte("work_date", d30ago),
      db.from("foh_salaried_staff").select("monthly_salary").in("location_id", locIds).eq("active", true),
      db.from("boh_staff").select("pay_rate").in("location_id", locIds).eq("active", true).eq("pay_type", "salary"),
      db.from("salary_disbursements").select("amount").in("location_id", locIds).gte("disbursed_on", d30ago),
    ]);

    // ── Totals ────────────────────────────────────────────────────────────────
    const thisWeekSalesTotal = ((thisWeekSales.data ?? []) as SalesRow[]).reduce((s, r) => s + rowTotal(r), 0);
    const lastWeekSalesTotal = ((lastWeekSales.data ?? []) as SalesRow[]).reduce((s, r) => s + rowTotal(r), 0);

    const thisWeekFoodTotal = ((thisWeekFood.data ?? []) as { amount: number }[]).reduce((s, r) => s + nv(r.amount), 0);
    const lastWeekFoodTotal = ((lastWeekFood.data ?? []) as { amount: number }[]).reduce((s, r) => s + nv(r.amount), 0);

    const hourlyLaborCost = ((hourlyHoursRes.data ?? []) as any[]).reduce((s, r) => {
      const rate = nv(r.foh_hourly_staff?.hourly_rate);
      return s + nv(r.hours_worked) * rate + nv(r.overtime_hours) * rate * 1.5;
    }, 0);
    const salariedCost = (salariedRes.data ?? []).reduce((s, r: { monthly_salary: number }) => s + nv(r.monthly_salary), 0);
    const bohCost      = (bohRes.data ?? []).reduce((s, r: { pay_rate: number }) => s + nv(r.pay_rate), 0);
    const disbCost     = (disbRes.data ?? []).reduce((s, r: { amount: number }) => s + nv(r.amount), 0);
    // Prorate 30-day labor to 7-day windows
    const laborPerDay  = (hourlyLaborCost + (disbCost > 0 ? disbCost : salariedCost + bohCost)) / 30;
    const thisWeekLabor = laborPerDay * 7;
    const lastWeekLabor = laborPerDay * 7; // same rate both weeks

    // Prime cost %
    const thisWeekPC = thisWeekSalesTotal > 0 ? (thisWeekFoodTotal + thisWeekLabor) / thisWeekSalesTotal * 100 : null;
    const lastWeekPC = lastWeekSalesTotal > 0 ? (lastWeekFoodTotal + lastWeekLabor) / lastWeekSalesTotal * 100 : null;
    const pcDelta    = (thisWeekPC !== null && lastWeekPC !== null) ? thisWeekPC - lastWeekPC : null;

    // ── Price creep detection — 90-day moving average baseline ─────────────────
    // Architecture spec: trigger at >2% unit price increase vs 90-day vendor rolling avg
    const d90ago = daysAgo(90);

    // Phase A: Get this week's deliveries (most recent purchases)
    const { data: thisWeekLines } = await db.from("invoice_line_items")
      .select("canonical_name,unit,unit_price,qty,food_deliveries!inner(location_id,delivery_date,vendor)")
      .in("food_deliveries.location_id", locIds)
      .gte("food_deliveries.delivery_date", d7ago)
      .lte("food_deliveries.delivery_date", yesterday)
      .eq("is_credit", false)
      .eq("is_fee", false)
      .not("canonical_name", "is", null)
      .gt("unit_price", 0);

    // Phase B: 90-day baseline — prefer vendor_price_history if populated, else inline
    // Try vendor_price_history first (populated by rollup_price_history SQL function)
    const { data: priceHistory } = await db.from("vendor_price_history")
      .select("item_name,vendor_name,unit_price,recorded_date,location_id")
      .in("location_id", locIds)
      .gte("recorded_date", d90ago)
      .lte("recorded_date", d7ago); // exclude current week from baseline

    // Build 90-day baseline map: item_name+vendor → { prices[], avgPrice, vendor }
    type BaselineStat = { prices: number[]; avgPrice: number; vendor: string };
    const baselineMap = new Map<string, BaselineStat>();

    if (priceHistory && priceHistory.length > 0) {
      for (const row of priceHistory as any[]) {
        const key = String(row.item_name ?? "").toLowerCase().trim();
        if (!key) continue;
        if (!baselineMap.has(key)) baselineMap.set(key, { prices: [], avgPrice: 0, vendor: row.vendor_name ?? "" });
        baselineMap.get(key)!.prices.push(nv(row.unit_price));
      }
    } else {
      // Fallback: compute baseline from invoice_line_items directly
      const { data: baselineLines } = await db.from("invoice_line_items")
        .select("canonical_name,unit_price,food_deliveries!inner(location_id,delivery_date,vendor)")
        .in("food_deliveries.location_id", locIds)
        .gte("food_deliveries.delivery_date", d90ago)
        .lte("food_deliveries.delivery_date", d7ago)
        .eq("is_credit", false)
        .eq("is_fee", false)
        .not("canonical_name", "is", null)
        .gt("unit_price", 0);

      for (const row of (baselineLines ?? []) as any[]) {
        const key = String(row.canonical_name ?? "").toLowerCase().trim();
        if (!key) continue;
        if (!baselineMap.has(key)) baselineMap.set(key, { prices: [], avgPrice: 0, vendor: row.food_deliveries?.vendor ?? "" });
        baselineMap.get(key)!.prices.push(nv(row.unit_price));
      }
    }

    // Compute avg for baseline map
    for (const stat of Array.from(baselineMap.values())) {
      stat.avgPrice = stat.prices.reduce((a, b) => a + b, 0) / stat.prices.length;
    }

    // Build this-week map: canonical_name → { prices[], qtys[], unit, vendor }
    type CurrentStat = { prices: number[]; qtys: number[]; unit: string; vendor: string };
    const currentMap = new Map<string, CurrentStat>();
    for (const row of (thisWeekLines ?? []) as any[]) {
      const key = String(row.canonical_name ?? "").toLowerCase().trim();
      if (!key) continue;
      if (!currentMap.has(key)) currentMap.set(key, { prices: [], qtys: [], unit: row.unit ?? "", vendor: row.food_deliveries?.vendor ?? "" });
      const e = currentMap.get(key)!;
      e.prices.push(nv(row.unit_price));
      e.qtys.push(nv(row.qty));
    }

    // Anomaly detection: flag items with >2% price increase vs 90-day baseline
    type CreepAlert = { name: string; vendor: string; diff: number; pct: number; monthlyImpact: number; unit: string; baseline: number; current: number };
    const creepAlerts: CreepAlert[] = [];

    for (const [key, cur] of Array.from(currentMap.entries())) {
      const baseline = baselineMap.get(key);
      if (!baseline || baseline.prices.length < 2) continue; // need at least 2 data points

      const curAvg      = cur.prices.reduce((a, b) => a + b, 0) / cur.prices.length;
      const baselineAvg = baseline.avgPrice;
      const diff        = curAvg - baselineAvg;
      if (diff <= 0) continue;

      const pct = (diff / baselineAvg) * 100;
      if (pct < 2) continue; // spec: only flag >2% increases

      const avgQty      = cur.qtys.reduce((a, b) => a + b, 0) / cur.qtys.length;
      const monthlyImpact = avgQty * 4.3 * diff;

      creepAlerts.push({
        name: key,
        vendor: cur.vendor || baseline.vendor,
        diff,
        pct,
        monthlyImpact,
        unit: cur.unit,
        baseline: baselineAvg,
        current: curAvg,
      });
    }

    // Sort by monthly impact descending, take top alert
    creepAlerts.sort((a, b) => b.monthlyImpact - a.monthlyImpact);
    const biggestCreep = creepAlerts[0] ?? null;

    // ── SPLH (Sales-per-Labor-Hour) + overtime leakage ────────────────────────
    // Spec: Labor Cost %, Overtime Leakage, SPLH
    const { data: posLaborYday } = await db.from("pos_labor_events")
      .select("hours_worked,overtime_hours,hourly_rate,overtime_cost")
      .in("location_id", locIds)
      .eq("work_date", yesterday);

    const totalHoursYday  = ((posLaborYday ?? []) as any[]).reduce((s, r) => s + nv(r.hours_worked), 0);
    const totalOTCostYday = ((posLaborYday ?? []) as any[]).reduce((s, r) => s + nv(r.overtime_cost), 0);

    // SPLH = yesterday's total sales ÷ total labor hours
    const ydaySalesForSplh = await (async () => {
      const { data: ydRows } = await db.from("daily_sales")
        .select("cash_sales,pos_sales,liquor_sales,uber_eats_gross,grubhub_gross,doordash_gross,catering_sales,aggregator_commission")
        .in("location_id", locIds)
        .eq("sale_date", yesterday);
      return ((ydRows ?? []) as SalesRow[]).reduce((s, r) => s + rowTotal(r), 0);
    })();

    const splh = (totalHoursYday > 0 && ydaySalesForSplh > 0)
      ? ydaySalesForSplh / totalHoursYday
      : null;

    // ── Yesterday's invoices processed ───────────────────────────────────────
    const { count: invoiceCount } = await db.from("food_deliveries")
      .select("*", { count: "exact", head: true })
      .in("location_id", locIds)
      .eq("delivery_date", yesterday);

    // ── Low-confidence OCR items (need review) ────────────────────────────────
    const { count: lowConfCount } = await db.from("invoice_line_items")
      .select("*, food_deliveries!inner(location_id,delivery_date)", { count: "exact", head: true })
      .in("food_deliveries.location_id", locIds)
      .eq("food_deliveries.delivery_date", yesterday)
      .eq("ocr_confidence", "low");

    // ── Build structured digest (board-spec format) ───────────────────────────
    const dateLabel = new Date(yesterday).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });

    let pcLine = "📊 Prime Cost: data pending";
    if (thisWeekPC !== null) {
      const deltaStr = pcDelta !== null
        ? ` (${pcDelta >= 0 ? "+" : ""}${pcDelta.toFixed(1)}% vs last week)`
        : "";
      const pcEmoji  = thisWeekPC < 60 ? "🟢" : thisWeekPC < 68 ? "🟡" : "🔴";
      pcLine = `${pcEmoji} Prime Cost: ${thisWeekPC.toFixed(1)}%${deltaStr}`;
    }

    // Spec: "⚠️ CashCall Margin Alert: [vendor] just delivered [item] at $X/lb—up Y% ($Z more per case)
    //        vs. your 90-day average. Estimated monthly impact: +$M."
    let creepLine = "";
    if (biggestCreep && biggestCreep.pct >= 2) {
      const itemDisplay = biggestCreep.name.length > 30
        ? biggestCreep.name.slice(0, 30) + "…"
        : biggestCreep.name;
      const vendorDisplay = biggestCreep.vendor || "Your supplier";
      const unitLabel = biggestCreep.unit || "unit";
      const pctStr = biggestCreep.pct.toFixed(1);
      const dollarVariance = fmtPrice(biggestCreep.diff);
      const monthlyStr = fmt(biggestCreep.monthlyImpact);
      creepLine = `⚠️ CashCall Margin Alert: ${vendorDisplay} just delivered ${itemDisplay} at ${fmtPrice(biggestCreep.current)}/${unitLabel}—up *${pctStr}%* (${dollarVariance} more per ${unitLabel}) vs. your 90-day average.\nEstimated monthly impact: +${monthlyStr}.\n👉 cashcall.io — view price history and adjust menu pricing`;
    }

    const autoProcessed = (invoiceCount ?? 0);
    const needsReview   = (lowConfCount ?? 0);

    const digestLines: string[] = [
      `⚡ CashCall Daily Brief — ${primaryLocName}`,
      `📅 ${dateLabel}`,
      "",
      pcLine,
    ];

    if (creepLine) digestLines.push(creepLine);

    // SPLH line (only if real-time labor data available)
    if (splh !== null) {
      const splhEmoji = splh >= 150 ? "🟢" : splh >= 100 ? "🟡" : "🔴";
      digestLines.push(`${splhEmoji} SPLH: ${fmt(splh)}/hr`);
    }

    // Overtime leakage alert
    if (totalOTCostYday > 25) {
      digestLines.push(`⚠️ OT Leakage: ${fmt(totalOTCostYday)} in overtime yesterday`);
    }

    if (autoProcessed > 0) {
      digestLines.push(`✅ ${autoProcessed} invoice${autoProcessed !== 1 ? "s" : ""} processed automatically`);
    }
    if (needsReview > 0) {
      digestLines.push(`📸 ${needsReview} item${needsReview !== 1 ? "s" : ""} need${needsReview === 1 ? "s" : ""} your review`);
    }

    // Per-location breakdown (only if multi-location)
    if (locIds.length > 1) {
      const ydayRows = await db.from("daily_sales")
        .select("location_id,cash_sales,pos_sales,liquor_sales,uber_eats_gross,grubhub_gross,doordash_gross,catering_sales,cash_tips,aggregator_commission")
        .in("location_id", locIds)
        .eq("sale_date", yesterday);
      const ydayByLoc: Record<string, number> = {};
      for (const r of (ydayRows.data ?? []) as SalesRow[]) ydayByLoc[r.location_id] = rowTotal(r);
      const hasYdaySales = Object.values(ydayByLoc).some(v => v > 0);
      if (hasYdaySales) {
        digestLines.push("");
        digestLines.push("*Yesterday's Sales:*");
        for (const id of locIds) {
          const v = ydayByLoc[id] ?? 0;
          if (v > 0) digestLines.push(`  ${locMap[id]}: ${fmt(v)}`);
        }
      }
    }

    digestLines.push("");
    digestLines.push("Reply INVOICE to send tonight's invoices");
    digestLines.push("Reply STOP to pause");

    const digest = digestLines.join("\n");

    return NextResponse.json({
      digest,
      data: {
        yesterday,
        thisWeekSalesTotal,
        lastWeekSalesTotal,
        thisWeekPC,
        lastWeekPC,
        pcDelta,
        biggestCreep,
        creepAlerts: creepAlerts.slice(0, 5), // top 5 alerts
        autoProcessed,
        needsReview,
      },
    });
  } catch (err) {
    console.error("Digest error:", err);
    return NextResponse.json({ error: "Failed to generate digest" }, { status: 500 });
  }
}
