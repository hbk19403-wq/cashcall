export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createClient as createServiceClient } from "@supabase/supabase-js";

// ── Grubhub Restaurant API ────────────────────────────────────────────────────
// https://developer.grubhub.com/
const GRUBHUB_API = "https://api.grubhub.com/restaurant/v1";

interface GHOrder {
  orderID: string;
  timePlaced: string;         // ISO
  orderValue: number;         // cents
  restaurantCommission: number; // cents
  orderStatus: string;
}

async function fetchGrubhubOrders(
  apiKey: string,
  restaurantId: string,
  startDate: string,
  endDate: string
): Promise<GHOrder[]> {
  const url = `${GRUBHUB_API}/restaurants/${restaurantId}/orders?` +
    new URLSearchParams({
      startDate,
      endDate,
      status: "PICKED_UP",
      pageSize: "200",
    });

  const res = await fetch(url, {
    headers: {
      "Authorization": `token ${apiKey}`,
      "Content-Type": "application/json",
    },
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Grubhub API ${res.status}: ${body.slice(0, 300)}`);
  }

  const json = await res.json() as { orders?: GHOrder[] };
  return json.orders ?? [];
}

function groupByDate(orders: GHOrder[]): Record<string, { gross: number; commission: number }> {
  const byDate: Record<string, { gross: number; commission: number }> = {};
  for (const o of orders) {
    const date = o.timePlaced.slice(0, 10);
    if (!byDate[date]) byDate[date] = { gross: 0, commission: 0 };
    byDate[date].gross      += o.orderValue          / 100;
    byDate[date].commission += o.restaurantCommission / 100;
  }
  return byDate;
}

// ── POST /api/delivery/grubhub ────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { location_id, start_date, end_date, demo = false } =
    await req.json() as { location_id: string; start_date: string; end_date: string; demo?: boolean };

  if (!location_id) return NextResponse.json({ error: "location_id required" }, { status: 400 });

  const { data: loc } = await supabase.from("locations")
    .select("id").eq("id", location_id).eq("user_id", user.id).single();
  if (!loc) return NextResponse.json({ error: "Location not found" }, { status: 404 });

  const db = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );

  const { data: conn } = await db
    .from("delivery_connections")
    .select("api_key, store_id")
    .eq("location_id", location_id)
    .eq("provider", "grubhub")
    .single();

  let byDate: Record<string, { gross: number; commission: number }>;

  if (demo || !conn?.api_key) {
    byDate = generateDemoData(start_date, end_date);
  } else {
    try {
      const orders = await fetchGrubhubOrders(conn.api_key, conn.store_id, start_date, end_date);
      byDate = groupByDate(orders);
    } catch (err) {
      return NextResponse.json({ error: (err as Error).message }, { status: 502 });
    }
  }

  let upserted = 0;
  for (const [date, { gross, commission }] of Object.entries(byDate)) {
    const { data: existing } = await db
      .from("daily_sales")
      .select("id, aggregator_commission")
      .eq("location_id", location_id)
      .eq("delivery_date", date)
      .single();

    if (existing) {
      await db.from("daily_sales").update({
        grubhub_gross: gross,
        aggregator_commission: (existing.aggregator_commission ?? 0) + commission,
      }).eq("id", existing.id);
    } else {
      await db.from("daily_sales").insert({
        location_id, delivery_date: date,
        grubhub_gross: gross, aggregator_commission: commission,
        cash_sales: 0, pos_sales: 0, uber_eats_gross: 0,
        doordash_gross: 0, catering_sales: 0, cash_tips: 0,
      });
    }
    upserted++;
  }

  await db.from("delivery_connections")
    .upsert({ location_id, provider: "grubhub", last_synced: new Date().toISOString() }, { onConflict: "location_id,provider" });

  return NextResponse.json({ ok: true, days_synced: upserted, demo: !conn?.api_key });
}

export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const locationId = req.nextUrl.searchParams.get("location_id");
  if (!locationId) return NextResponse.json({ error: "location_id required" }, { status: 400 });

  const db = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );
  const { data } = await db.from("delivery_connections")
    .select("last_synced, store_id")
    .eq("location_id", locationId)
    .eq("provider", "grubhub")
    .single();

  return NextResponse.json({ connected: !!data?.store_id, last_synced: data?.last_synced ?? null });
}

function generateDemoData(start: string, end: string) {
  const byDate: Record<string, { gross: number; commission: number }> = {};
  const cur = new Date(start);
  while (cur <= new Date(end)) {
    const dateStr = cur.toISOString().slice(0, 10);
    const isWeekend = cur.getDay() === 0 || cur.getDay() === 6;
    const baseGross = isWeekend ? 180 + Math.random() * 100 : 100 + Math.random() * 60;
    byDate[dateStr] = {
      gross: Math.round(baseGross * 100) / 100,
      commission: Math.round(baseGross * (0.22 + Math.random() * 0.05) * 100) / 100,
    };
    cur.setDate(cur.getDate() + 1);
  }
  return byDate;
}
