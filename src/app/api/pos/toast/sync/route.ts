export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// ── Toast POS API helpers ─────────────────────────────────────────────────────
// Docs: https://doc.toasttab.com/openapi/authentication/

const TOAST_API = "https://ws-api.toasttab.com";

interface ToastOrder {
  guid: string;
  openedDate: string; // ISO
  closedDate?: string;
  checks: ToastCheck[];
}
interface ToastCheck {
  guid: string;
  payments: ToastPayment[];
}
interface ToastPayment {
  guid: string;
  amount: number; // dollars (not cents)
  tipAmount: number;
  type: string; // CREDIT | CASH | GIFT_CARD | HOUSE_ACCOUNT
}

async function toastFetch(restaurantGuid: string, token: string, path: string): Promise<unknown> {
  const res = await fetch(`${TOAST_API}${path}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      "Toast-Restaurant-External-ID": restaurantGuid,
      "Content-Type": "application/json",
    },
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Toast API ${res.status}: ${body.slice(0, 200)}`);
  }
  return res.json();
}

function toastTenderToColumn(type: string): string {
  const t = (type ?? "").toUpperCase();
  if (t === "CASH") return "cash_sales";
  if (t === "CREDIT" || t === "DEBIT") return "pos_sales";
  if (t.includes("GIFT")) return "pos_sales";
  return "pos_sales";
}

async function fetchToastDailySales(
  restaurantGuid: string,
  token: string,
  date: Date
): Promise<Partial<{ cash_sales: number; pos_sales: number; cash_tips: number }>> {
  const dateStr = date.toISOString().slice(0, 10);
  // Toast orders endpoint: /orders/v2/ordersBulk?startDate=YYYY-MM-DD&endDate=YYYY-MM-DD
  const orders = await toastFetch(
    restaurantGuid, token,
    `/orders/v2/ordersBulk?startDate=${dateStr}&endDate=${dateStr}&includeVoid=false`
  ) as ToastOrder[];

  const totals: Record<string, number> = { cash_sales: 0, pos_sales: 0, cash_tips: 0 };
  for (const order of (Array.isArray(orders) ? orders : [])) {
    for (const check of (order.checks ?? [])) {
      for (const payment of (check.payments ?? [])) {
        const col = toastTenderToColumn(payment.type);
        totals[col] = (totals[col] ?? 0) + (payment.amount ?? 0);
        if (col === "cash_sales") totals.cash_tips += (payment.tipAmount ?? 0);
      }
    }
  }
  return totals;
}

// ── Route handlers ────────────────────────────────────────────────────────────
export async function GET(req: NextRequest) { return syncHandler(req, null); }
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
  const locationId = params.get("location_id") ?? body?.location_id;
  const daysBack = parseInt(params.get("days") ?? body?.days ?? "1", 10);
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
    const { data: locs } = await supabase.from("pos_connections").select("location_id").eq("provider", "toast");
    locationIds = (locs ?? []).map(l => l.location_id);
  } else {
    return NextResponse.json({ error: "location_id required" }, { status: 400 });
  }

  let totalRows = 0;
  const errors: string[] = [];

  for (const locId of locationIds) {
    const { data: conn } = await supabase
      .from("pos_connections").select("*")
      .eq("location_id", locId).eq("provider", "toast").single();

    if (!conn) { errors.push(`${locId}: no Toast connection`); continue; }

    await supabase.from("pos_connections").update({ sync_status: "syncing" }).eq("id", conn.id);

    try {
      const dates: Date[] = [];
      if (specificDate) {
        dates.push(new Date(specificDate + "T12:00:00"));
      } else {
        for (let i = 0; i < daysBack; i++) {
          const d = new Date(); d.setDate(d.getDate() - i); dates.push(d);
        }
      }

      for (const date of dates) {
        const dateStr = date.toISOString().slice(0, 10);
        const sales = await fetchToastDailySales(conn.merchant_id, conn.access_token, date);

        const { error: upsertErr } = await supabase.from("daily_sales").upsert({
          location_id: locId,
          sale_date: dateStr,
          cash_sales: sales.cash_sales ?? 0,
          pos_sales: sales.pos_sales ?? 0,
          cash_tips: sales.cash_tips ?? 0,
          uber_eats_gross: 0, grubhub_gross: 0, doordash_gross: 0,
          catering_sales: 0, safe_cash_balance: null, aggregator_commission: 0,
        }, { onConflict: "location_id,sale_date" });

        await supabase.from("pos_sync_log").insert({
          location_id: locId, provider: "toast", sync_date: dateStr,
          rows_upserted: upsertErr ? 0 : 1, error: upsertErr?.message ?? null,
        });

        if (!upsertErr) totalRows++;
      }

      await supabase.from("pos_connections").update({
        sync_status: "idle", sync_error: null, last_synced: new Date().toISOString(),
      }).eq("id", conn.id);

    } catch (e) {
      const errMsg = e instanceof Error ? e.message : "Unknown error";
      errors.push(`${locId}: ${errMsg}`);
      await supabase.from("pos_connections").update({ sync_status: "error", sync_error: errMsg }).eq("id", conn.id);
      await supabase.from("pos_sync_log").insert({
        location_id: locId, provider: "toast", sync_date: new Date().toISOString().slice(0, 10),
        rows_upserted: 0, error: errMsg.slice(0, 500),
      });
    }
  }

  return NextResponse.json({ ok: errors.length === 0, rows_upserted: totalRows, errors: errors.length ? errors : undefined });
}
