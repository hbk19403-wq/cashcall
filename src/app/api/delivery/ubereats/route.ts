export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createClient as createServiceClient } from "@supabase/supabase-js";

// ── Uber Eats Orders API ──────────────────────────────────────────────────────
// https://developer.uber.com/docs/eats/guides/order-integration
const UBER_API = "https://api.uber.com/v2/eats";

interface UberOrder {
  id: string;
  created_at: string;         // epoch ms as string
  cart: { subtotal: { total_price: number } };   // cents
  payment: { charges: { total: number } };
  restaurant_fee: number;     // cents (commission/service fee)
  status: string;
}

async function fetchUberOrders(
  accessToken: string,
  storeId: string,
  startMs: number,
  endMs: number
): Promise<UberOrder[]> {
  const url = `${UBER_API}/stores/${storeId}/orders?` +
    new URLSearchParams({
      start_time: String(Math.floor(startMs / 1000)),
      end_time:   String(Math.floor(endMs   / 1000)),
      status:     "completed",
      limit:      "200",
    });

  const res = await fetch(url, {
    headers: {
      "Authorization": `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Uber Eats API ${res.status}: ${body.slice(0, 300)}`);
  }

  const json = await res.json() as { orders?: UberOrder[] };
  return json.orders ?? [];
}

function groupByDate(orders: UberOrder[]): Record<string, { gross: number; commission: number }> {
  const byDate: Record<string, { gross: number; commission: number }> = {};
  for (const o of orders) {
    const date = new Date(Number(o.created_at)).toISOString().slice(0, 10);
    if (!byDate[date]) byDate[date] = { gross: 0, commission: 0 };
    byDate[date].gross      += (o.cart?.subtotal?.total_price ?? 0) / 100;
    byDate[date].commission += (o.restaurant_fee ?? 0)              / 100;
  }
  return byDate;
}

// ── POST /api/delivery/ubereats ───────────────────────────────────────────────
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
    .eq("provider", "ubereats")
    .single();

  let byDate: Record<string, { gross: number; commission: number }>;

  if (demo || !conn?.api_key) {
    byDate = generateDemoData(start_date, end_date);
  } else {
    try {
      const startMs = new Date(start_date).getTime();
      const endMs   = new Date(end_date).getTime() + 86400000 - 1;
      const orders = await fetchUberOrders(conn.api_key, conn.store_id, startMs, endMs);
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
        uber_eats_gross: gross,
        aggregator_commission: (existing.aggregator_commission ?? 0) + commission,
      }).eq("id", existing.id);
    } else {
      await db.from("daily_sales").insert({
        location_id, delivery_date: date,
        uber_eats_gross: gross, aggregator_commission: commission,
        cash_sales: 0, pos_sales: 0, grubhub_gross: 0,
        doordash_gross: 0, catering_sales: 0, cash_tips: 0,
      });
    }
    upserted++;
  }

  await db.from("delivery_connections")
    .upsert({ location_id, provider: "ubereats", last_synced: new Date().toISOString() }, { onConflict: "location_id,provider" });

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
    .eq("provider", "ubereats")
    .single();

  return NextResponse.json({ connected: !!data?.store_id, last_synced: data?.last_synced ?? null });
}

function generateDemoData(start: string, end: string) {
  const byDate: Record<string, { gross: number; commission: number }> = {};
  const cur = new Date(start);
  while (cur <= new Date(end)) {
    const dateStr = cur.toISOString().slice(0, 10);
    const isWeekend = cur.getDay() === 0 || cur.getDay() === 6;
    const baseGross = isWeekend ? 280 + Math.random() * 160 : 160 + Math.random() * 100;
    byDate[dateStr] = {
      gross: Math.round(baseGross * 100) / 100,
      commission: Math.round(baseGross * (0.27 + Math.random() * 0.06) * 100) / 100,
    };
    cur.setDate(cur.getDate() + 1);
  }
  return byDate;
}
