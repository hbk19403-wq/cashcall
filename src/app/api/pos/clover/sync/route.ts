export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createClient as createServiceClient } from "@supabase/supabase-js";

// ── Clover API helpers ────────────────────────────────────────────────────────

const CLOVER_API = {
  production: "https://api.clover.com",
  sandbox:    "https://apisandbox.dev.clover.com",
};

interface CloverOrder {
  id: string;
  createdTime: number;    // ms since epoch
  total: number;          // cents
  paymentState: string;   // PAID | OPEN | REFUNDED
  state: string;
}

interface CloverPayment {
  id: string;
  order: { id: string };
  amount: number;         // cents
  tipAmount: number;
  tender: { label: string; labelKey: string };
  createdTime: number;
}

async function cloverFetch(
  baseUrl: string,
  merchantId: string,
  token: string,
  path: string
): Promise<unknown> {
  const res = await fetch(`${baseUrl}/v3/merchants/${merchantId}${path}`, {
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Clover API ${res.status}: ${body.slice(0, 200)}`);
  }
  return res.json();
}

// Map Clover tender labels → our daily_sales columns
function tenderToColumn(labelKey: string): string {
  const k = (labelKey ?? "").toLowerCase();
  if (k.includes("cash"))          return "cash_sales";
  if (k.includes("credit") || k.includes("card") || k.includes("debit")) return "pos_sales";
  if (k.includes("uber"))          return "uber_eats_gross";
  if (k.includes("grub"))         return "grubhub_gross";
  if (k.includes("door"))         return "doordash_gross";
  if (k.includes("catering"))     return "catering_sales";
  return "pos_sales"; // default everything else to POS
}

// Aggregate Clover payments for one date into daily_sales row shape
async function fetchDailySales(
  baseUrl: string,
  merchantId: string,
  token: string,
  date: Date
): Promise<Partial<{
  cash_sales: number; pos_sales: number;
  uber_eats_gross: number; grubhub_gross: number; doordash_gross: number;
  catering_sales: number; cash_tips: number; safe_cash_balance: number;
}>> {
  const dayStart = new Date(date);
  dayStart.setHours(0, 0, 0, 0);
  const dayEnd   = new Date(date);
  dayEnd.setHours(23, 59, 59, 999);

  const from = dayStart.getTime();
  const to   = dayEnd.getTime();

  // Fetch PAID orders for the day
  const ordersRes = await cloverFetch(
    baseUrl, merchantId, token,
    `/orders?filter=createdTime>=${from}&filter=createdTime<=${to}&filter=paymentState=PAID&expand=payments&limit=500`
  ) as { elements?: CloverOrder[] };

  const orders = ordersRes.elements ?? [];

  const totals: Record<string, number> = {
    cash_sales: 0, pos_sales: 0,
    uber_eats_gross: 0, grubhub_gross: 0, doordash_gross: 0,
    catering_sales: 0, cash_tips: 0,
  };

  for (const order of orders) {
    // Fetch payments for order to get tender breakdown
    const pymtRes = await cloverFetch(
      baseUrl, merchantId, token,
      `/orders/${order.id}/payments?limit=50`
    ) as { elements?: CloverPayment[] };

    for (const p of (pymtRes.elements ?? [])) {
      const col = tenderToColumn(p.tender?.labelKey ?? p.tender?.label ?? "");
      totals[col] = (totals[col] ?? 0) + p.amount / 100;
      if (col === "cash_sales") {
        totals.cash_tips = (totals.cash_tips ?? 0) + (p.tipAmount ?? 0) / 100;
      }
    }
  }

  return totals;
}

// ── Route handlers ────────────────────────────────────────────────────────────

// GET /api/pos/clover/sync?location_id=X&days=7
// POST /api/pos/clover/sync  body: { location_id, date }  (cron usage)
export async function GET(req: NextRequest) {
  return syncHandler(req, null);
}
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  return syncHandler(req, body);
}

async function syncHandler(req: NextRequest, body: Record<string, string> | null) {
  const session = await createClient();

  // Auth check: a signed-in user, or the cron secret. (A plain "x-vercel-cron" header is not
  // proof of anything: any caller can set it.)
  const { data: { user } } = await session.auth.getUser();
  const secret = process.env.CRON_SECRET;
  const isCron = !!secret && (
    req.headers.get("authorization") === `Bearer ${secret}` ||
    req.headers.get("x-cron-key") === secret
  );
  if (!user && !isCron) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // A cron has no login session, so it reads and writes with the service role.
  const supabase = isCron && !user
    ? createServiceClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } })
    : session;

  const params     = req.nextUrl.searchParams;
  const locationId = params.get("location_id") ?? body?.location_id;
  const daysBack   = parseInt(params.get("days") ?? body?.days ?? "1", 10);
  const specificDate = params.get("date") ?? body?.date; // YYYY-MM-DD

  // Determine which locations to sync
  let locationIds: string[] = [];
  if (locationId) {
    // Verify ownership when called by an authenticated user
    if (user) {
      const { data: owned } = await supabase.from("locations").select("id")
        .eq("id", locationId).eq("user_id", user.id).maybeSingle();
      if (!owned) return NextResponse.json({ error: "Location not found" }, { status: 404 });
    }
    locationIds = [locationId];
  } else if (isCron) {
    // Sync ALL connected locations
    const { data: locs } = await supabase.from("pos_connections").select("location_id");
    locationIds = (locs ?? []).map(l => l.location_id);
  } else {
    return NextResponse.json({ error: "location_id required" }, { status: 400 });
  }

  // ?dry_run=1 reports which locations would be synced, without calling Clover or writing anything.
  if (req.nextUrl.searchParams.get("dry_run") === "1") {
    return NextResponse.json({ dry_run: true, locations: locationIds.length, days: daysBack });
  }

  let totalRows = 0;
  const errors: string[] = [];

  for (const locId of locationIds) {
    const { data: conn } = await supabase
      .from("pos_connections")
      .select("*")
      .eq("location_id", locId)
      .eq("provider", "clover")
      .single();

    if (!conn) { errors.push(`${locId}: no Clover connection`); continue; }

    // ── Circuit breaker: skip connections flagged as needing reconnect ──
    if (conn.needs_reconnect) {
      errors.push(`${locId}: Clover token expired — operator must reconnect`);
      continue;
    }

    // Use sandbox if env var set OR if stored environment says sandbox
    const useSandbox = process.env.CLOVER_SANDBOX === "true" || conn.environment === "sandbox";
    const baseUrl = useSandbox ? CLOVER_API.sandbox : CLOVER_API.production;

    // Mark as syncing
    await supabase.from("pos_connections").update({ sync_status: "syncing" }).eq("id", conn.id);

    try {
      // Dates to sync
      const dates: Date[] = [];
      if (specificDate) {
        dates.push(new Date(specificDate + "T12:00:00"));
      } else {
        for (let i = 0; i < daysBack; i++) {
          const d = new Date();
          d.setDate(d.getDate() - i);
          dates.push(d);
        }
      }

      // Support both old (client_id/api_token) and new OAuth columns
      const merchantId = conn.oauth_merchant_id || conn.client_id || conn.merchant_id;
      const apiToken   = conn.oauth_access_token || conn.api_token || conn.access_token;

      for (const date of dates) {
        const dateStr = date.toISOString().slice(0, 10);
        const sales = await fetchDailySales(baseUrl, merchantId, apiToken, date);

        // Upsert into daily_sales
        const { error: upsertErr } = await supabase.from("daily_sales").upsert({
          location_id:       locId,
          sale_date:         dateStr,
          cash_sales:        sales.cash_sales        ?? 0,
          pos_sales:         sales.pos_sales         ?? 0,
          uber_eats_gross:   sales.uber_eats_gross   ?? 0,
          grubhub_gross:     sales.grubhub_gross     ?? 0,
          doordash_gross:    sales.doordash_gross     ?? 0,
          catering_sales:    sales.catering_sales    ?? 0,
          cash_tips:         sales.cash_tips         ?? 0,
          safe_cash_balance: null,
          aggregator_commission: 0,
        }, { onConflict: "location_id,sale_date" });

        // Log the sync (best-effort)
        try {
          await supabase.from("pos_sync_log").insert({
            location_id:   locId,
            provider:      "clover",
            sync_date:     dateStr,
            rows_upserted: upsertErr ? 0 : 1,
            error:         upsertErr?.message ?? null,
          });
        } catch { /* ignore if table missing */ }

        if (!upsertErr) totalRows++;
      }

      await supabase.from("pos_connections").update({
        sync_status: "idle",
        sync_error: null,
        last_synced: new Date().toISOString(),
      }).eq("id", conn.id);

    } catch (e) {
      const errMsg = e instanceof Error ? e.message : "Unknown error";
      errors.push(`${locId}: ${errMsg}`);

      // 401 = token expired/revoked → open the circuit breaker immediately
      const is401 = errMsg.includes("401");
      await supabase.from("pos_connections").update({
        sync_status:        "error",
        sync_error:         errMsg,
        consecutive_errors: (conn.consecutive_errors ?? 0) + 1,
        last_error_at:      new Date().toISOString(),
        ...(is401 ? { needs_reconnect: true } : {}),
      }).eq("id", conn.id);
      await supabase.from("pos_sync_log").insert({
        location_id: locId, provider: "clover", sync_date: new Date().toISOString().slice(0, 10),
        rows_upserted: 0, error: errMsg.slice(0, 500),
      });
    }
  }

  return NextResponse.json({
    ok: errors.length === 0,
    rows_upserted: totalRows,
    errors: errors.length ? errors : undefined,
  });
}
