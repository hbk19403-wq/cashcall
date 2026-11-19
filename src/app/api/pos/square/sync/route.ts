export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// ── Square POS API helpers ────────────────────────────────────────────────────
// Docs: https://developer.squareup.com/docs/orders-api/list-orders

const SQUARE_API = "https://connect.squareup.com/v2";
const SQUARE_SANDBOX = "https://connect.squareupsandbox.com/v2";

interface SquareMoney { amount: number; currency: string; } // amount in cents
interface SquareTender { type: string; amount_money?: SquareMoney; tip_money?: SquareMoney; }
interface SquareOrder {
  id: string;
  location_id: string;
  state: string;
  created_at: string;
  tenders?: SquareTender[];
  total_money?: SquareMoney;
}
interface SquareOrdersResponse { orders?: SquareOrder[]; cursor?: string; }

async function squareFetch(baseUrl: string, token: string, path: string, method = "GET", body?: unknown): Promise<unknown> {
  const res = await fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      "Square-Version": "2024-01-17",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`Square API ${res.status}: ${txt.slice(0, 200)}`);
  }
  return res.json();
}

function squareTenderToColumn(type: string): string {
  const t = (type ?? "").toUpperCase();
  if (t === "CASH") return "cash_sales";
  if (t === "CARD" || t === "CARD_ON_FILE" || t === "SQUARE_GIFT_CARD") return "pos_sales";
  if (t.includes("UBER")) return "uber_eats_gross";
  if (t.includes("GRUB") || t.includes("GRUBHUB")) return "grubhub_gross";
  if (t.includes("DOOR") || t.includes("DOORDASH")) return "doordash_gross";
  return "pos_sales";
}

async function fetchSquareDailySales(
  baseUrl: string,
  locationId: string, // Square location ID = merchant_id field
  token: string,
  date: Date
): Promise<Partial<{ cash_sales: number; pos_sales: number; uber_eats_gross: number; grubhub_gross: number; doordash_gross: number; cash_tips: number }>> {
  const dayStart = new Date(date); dayStart.setHours(0, 0, 0, 0);
  const dayEnd   = new Date(date); dayEnd.setHours(23, 59, 59, 999);

  // Square Orders API (search) — POST /v2/orders/search
  let cursor: string | undefined;
  const orders: SquareOrder[] = [];
  do {
    const body: Record<string, unknown> = {
      location_ids: [locationId],
      query: {
        filter: {
          date_time_filter: { created_at: { start_at: dayStart.toISOString(), end_at: dayEnd.toISOString() } },
          state_filter: { states: ["COMPLETED"] },
        },
      },
      limit: 500,
    };
    if (cursor) body.cursor = cursor;
    const resp = await squareFetch(baseUrl, token, "/orders/search", "POST", body) as SquareOrdersResponse;
    orders.push(...(resp.orders ?? []));
    cursor = resp.cursor;
  } while (cursor);

  const totals: Record<string, number> = { cash_sales: 0, pos_sales: 0, uber_eats_gross: 0, grubhub_gross: 0, doordash_gross: 0, cash_tips: 0 };

  for (const order of orders) {
    for (const tender of (order.tenders ?? [])) {
      const col = squareTenderToColumn(tender.type);
      const amount = (tender.amount_money?.amount ?? 0) / 100;
      const tip    = (tender.tip_money?.amount   ?? 0) / 100;
      totals[col] = (totals[col] ?? 0) + amount;
      if (col === "cash_sales") totals.cash_tips += tip;
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
    const { data: locs } = await supabase.from("pos_connections").select("location_id").eq("provider", "square");
    locationIds = (locs ?? []).map(l => l.location_id);
  } else {
    return NextResponse.json({ error: "location_id required" }, { status: 400 });
  }

  let totalRows = 0;
  const errors: string[] = [];

  for (const locId of locationIds) {
    const { data: conn } = await supabase
      .from("pos_connections").select("*")
      .eq("location_id", locId).eq("provider", "square").single();

    if (!conn) { errors.push(`${locId}: no Square connection`); continue; }

    const baseUrl = conn.environment === "sandbox" ? SQUARE_SANDBOX : SQUARE_API;
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
        const sales = await fetchSquareDailySales(baseUrl, conn.merchant_id, conn.access_token, date);

        const { error: upsertErr } = await supabase.from("daily_sales").upsert({
          location_id: locId, sale_date: dateStr,
          cash_sales: sales.cash_sales ?? 0,
          pos_sales: sales.pos_sales ?? 0,
          uber_eats_gross: sales.uber_eats_gross ?? 0,
          grubhub_gross: sales.grubhub_gross ?? 0,
          doordash_gross: sales.doordash_gross ?? 0,
          cash_tips: sales.cash_tips ?? 0,
          catering_sales: 0, safe_cash_balance: null, aggregator_commission: 0,
        }, { onConflict: "location_id,sale_date" });

        await supabase.from("pos_sync_log").insert({
          location_id: locId, provider: "square", sync_date: dateStr,
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
        location_id: locId, provider: "square", sync_date: new Date().toISOString().slice(0, 10),
        rows_upserted: 0, error: errMsg.slice(0, 500),
      });
    }
  }

  return NextResponse.json({ ok: errors.length === 0, rows_upserted: totalRows, errors: errors.length ? errors : undefined });
}
