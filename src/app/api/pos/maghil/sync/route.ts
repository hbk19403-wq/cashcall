export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Maghil Partner Reporting API
// POST https://maghil-partner-reporting-gateway-681142215919.us-east1.run.app/v1/stores/{STORE_ID}/reports
// Header: x-api-key: {API_KEY}
// Body:   { "startDate": "YYYY-MM-DD", "endDate": "YYYY-MM-DD" }  (max 30-day range)

const MAGHIL_BASE = "https://maghil-partner-reporting-gateway-681142215919.us-east1.run.app";

interface MaghilReport {
  // Various possible field names from the Maghil API
  totalSales?:      number;
  total_sales?:     number;
  netSales?:        number;
  net_sales?:       number;
  grossSales?:      number;
  gross_sales?:     number;
  cashSales?:       number;
  cash_sales?:      number;
  cardSales?:       number;
  card_sales?:      number;
  creditCardSales?: number;
  tips?:            number;
  totalTips?:       number;
  total_tips?:      number;
  // Date-keyed breakdown: { "YYYY-MM-DD": { ... } }
  dailyBreakdown?:  Record<string, MaghilReport>;
  daily?:           Record<string, MaghilReport>;
  data?:            MaghilReport | MaghilReport[] | unknown;
  report?:          MaghilReport;
  reports?:         MaghilReport[];
  summary?:         MaghilReport;
}

function extractSalesFromReport(raw: MaghilReport): {
  pos_sales: number;
  cash_sales: number;
  cash_tips: number;
} {
  // Unwrap common envelope wrappers
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const r: MaghilReport = (raw?.report ?? raw?.summary ?? (Array.isArray(raw?.data) ? (raw?.data as any[])[0] : raw?.data) ?? raw) as MaghilReport;

  const totalSales =
    r.totalSales ?? r.total_sales ?? r.netSales ?? r.net_sales ??
    r.grossSales ?? r.gross_sales ?? 0;

  const cash = r.cashSales ?? r.cash_sales ?? 0;
  const card = r.cardSales ?? r.card_sales ?? r.creditCardSales ?? 0;
  const tips = r.tips ?? r.totalTips ?? r.total_tips ?? 0;

  // If we have a cash/card split use it; otherwise put everything in pos_sales
  if (cash > 0 || card > 0) {
    return { pos_sales: card, cash_sales: cash, cash_tips: tips };
  }
  return { pos_sales: totalSales, cash_sales: 0, cash_tips: tips };
}

async function fetchMaghilDailySales(
  storeId: string,
  apiKey: string,
  startDate: string,
  endDate: string
): Promise<Record<string, { pos_sales: number; cash_sales: number; cash_tips: number }>> {
  const res = await fetch(
    `${MAGHIL_BASE}/v1/stores/${storeId}/reports`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": apiKey },
      body: JSON.stringify({ startDate, endDate }),
    }
  );

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Maghil API ${res.status}: ${body.slice(0, 300)}`);
  }

  const json = await res.json() as MaghilReport;

  // Try to get a per-day breakdown first
  const breakdown: Record<string, MaghilReport> =
    json.dailyBreakdown ?? json.daily ?? {};

  if (Object.keys(breakdown).length > 0) {
    const result: Record<string, { pos_sales: number; cash_sales: number; cash_tips: number }> = {};
    for (const [date, dayData] of Object.entries(breakdown)) {
      result[date] = extractSalesFromReport(dayData);
    }
    return result;
  }

  // Single-range summary — assign to each date in the range
  const sales = extractSalesFromReport(json);
  const result: Record<string, { pos_sales: number; cash_sales: number; cash_tips: number }> = {};
  const start = new Date(startDate + "T12:00:00");
  const end   = new Date(endDate   + "T12:00:00");
  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    const dateStr = d.toISOString().slice(0, 10);
    // Distribute total evenly across days (best effort when API returns aggregate only)
    const days = Math.round((end.getTime() - start.getTime()) / 86400000) + 1;
    result[dateStr] = {
      pos_sales:   parseFloat((sales.pos_sales  / days).toFixed(2)),
      cash_sales:  parseFloat((sales.cash_sales / days).toFixed(2)),
      cash_tips:   parseFloat((sales.cash_tips  / days).toFixed(2)),
    };
  }
  return result;
}

// ── Route handlers ────────────────────────────────────────────────────────────
export async function GET(req: NextRequest)  { return syncHandler(req, null); }
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  return syncHandler(req, body);
}

async function syncHandler(req: NextRequest, body: Record<string, string> | null) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const isCron = req.headers.get("x-vercel-cron") === "1";
  if (!user && !isCron) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const params = req.nextUrl.searchParams;
  const locationId   = params.get("location_id") ?? body?.location_id;
  const daysBack     = parseInt(params.get("days") ?? body?.days ?? "7", 10);
  const specificDate = params.get("date") ?? body?.date;

  let locationIds: string[] = [];

  if (locationId) {
    if (user) {
      const { data: owned } = await supabase.from("locations").select("id")
        .eq("id", locationId).eq("user_id", user.id).maybeSingle();
      if (!owned) return NextResponse.json({ error: "Location not found" }, { status: 404 });
    }
    locationIds = [locationId];
  } else if (isCron) {
    const { data: conns } = await supabase.from("pos_connections").select("location_id").eq("provider", "maghil");
    locationIds = (conns ?? []).map(c => c.location_id);
  } else {
    return NextResponse.json({ error: "location_id required" }, { status: 400 });
  }

  let totalRows = 0;
  const errors: string[] = [];

  for (const locId of locationIds) {
    const { data: conn } = await supabase
      .from("pos_connections").select("*")
      .eq("location_id", locId).eq("provider", "maghil").single();

    if (!conn) { errors.push(`${locId}: no Maghil connection`); continue; }

    await supabase.from("pos_connections").update({ sync_status: "syncing" }).eq("id", conn.id);

    try {
      // Build date range (max 30 days per Maghil API limit)
      let startDate: string;
      let endDate: string;

      if (specificDate) {
        startDate = specificDate;
        endDate   = specificDate;
      } else {
        const days = Math.min(daysBack, 30);
        endDate   = new Date().toISOString().slice(0, 10);
        startDate = new Date(Date.now() - (days - 1) * 86400000).toISOString().slice(0, 10);
      }

      const storeId = conn.merchant_id;
      const apiKey  = conn.access_token;

      const salesByDate = await fetchMaghilDailySales(storeId, apiKey, startDate, endDate);

      for (const [dateStr, sales] of Object.entries(salesByDate)) {
        const { error: upsertErr } = await supabase.from("daily_sales").upsert({
          location_id:          locId,
          sale_date:            dateStr,
          pos_sales:            sales.pos_sales,
          cash_sales:           sales.cash_sales,
          cash_tips:            sales.cash_tips,
          uber_eats_gross:      0,
          grubhub_gross:        0,
          doordash_gross:       0,
          catering_sales:       0,
          safe_cash_balance:    null,
          aggregator_commission: 0,
        }, { onConflict: "location_id,sale_date" });

        await supabase.from("pos_sync_log").insert({
          location_id:    locId,
          provider:       "maghil",
          sync_date:      dateStr,
          rows_upserted:  upsertErr ? 0 : 1,
          error:          upsertErr?.message ?? null,
        });

        if (!upsertErr) totalRows++;
      }

      await supabase.from("pos_connections").update({
        sync_status: "idle",
        sync_error:  null,
        last_synced: new Date().toISOString(),
      }).eq("id", conn.id);

    } catch (e) {
      const errMsg = e instanceof Error ? e.message : "Unknown error";
      errors.push(`${locId}: ${errMsg}`);
      await supabase.from("pos_connections").update({
        sync_status: "error",
        sync_error:  errMsg,
      }).eq("id", conn.id);
      await supabase.from("pos_sync_log").insert({
        location_id:   locId,
        provider:      "maghil",
        sync_date:     new Date().toISOString().slice(0, 10),
        rows_upserted: 0,
        error:         errMsg.slice(0, 500),
      });
    }
  }

  return NextResponse.json({
    ok: errors.length === 0,
    rows_upserted: totalRows,
    errors: errors.length ? errors : undefined,
  });
}
