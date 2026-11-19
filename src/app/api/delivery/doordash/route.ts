export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createClient as createServiceClient } from "@supabase/supabase-js";

// ── DoorDash Marketplace API ──────────────────────────────────────────────────
// https://developer.doordash.com/en-US/docs/marketplace/order_api/
const DOORDASH_API = "https://openapi.doordash.com/marketplace/v1";

interface DDOrder {
  id: string;
  created_at: string;         // ISO
  subtotal: number;           // cents
  consumer_fee: number;       // cents (commission)
  status: string;             // completed | cancelled | pending
}

async function fetchDoorDashOrders(
  apiKey: string,
  storeId: string,
  startDate: string,  // YYYY-MM-DD
  endDate: string
): Promise<DDOrder[]> {
  const url = `${DOORDASH_API}/stores/${storeId}/orders?` +
    new URLSearchParams({
      created_at_min: `${startDate}T00:00:00Z`,
      created_at_max: `${endDate}T23:59:59Z`,
      status: "completed",
      limit: "200",
    });

  const res = await fetch(url, {
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`DoorDash API ${res.status}: ${body.slice(0, 300)}`);
  }

  const json = await res.json() as { orders?: DDOrder[] };
  return json.orders ?? [];
}

function groupByDate(orders: DDOrder[]): Record<string, { gross: number; commission: number }> {
  const byDate: Record<string, { gross: number; commission: number }> = {};
  for (const o of orders) {
    const date = o.created_at.slice(0, 10); // YYYY-MM-DD
    if (!byDate[date]) byDate[date] = { gross: 0, commission: 0 };
    byDate[date].gross      += o.subtotal      / 100;
    byDate[date].commission += o.consumer_fee  / 100;
  }
  return byDate;
}

// ── POST /api/delivery/doordash ───────────────────────────────────────────────
export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { location_id, start_date, end_date, demo = false } =
    await req.json() as {
      location_id: string;
      start_date: string;
      end_date: string;
      demo?: boolean;
    };

  if (!location_id) return NextResponse.json({ error: "location_id required" }, { status: 400 });

  // Verify location belongs to user
  const { data: loc } = await supabase.from("locations")
    .select("id,name").eq("id", location_id).eq("user_id", user.id).single();
  if (!loc) return NextResponse.json({ error: "Location not found" }, { status: 404 });

  const db = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );

  // Pull credentials from delivery_connections
  const { data: conn } = await db
    .from("delivery_connections")
    .select("api_key, store_id, provider")
    .eq("location_id", location_id)
    .eq("provider", "doordash")
    .single();

  let byDate: Record<string, { gross: number; commission: number }>;

  if (demo || !conn?.api_key) {
    // ── Demo / sandbox mode — generate realistic fake data ──────────────────
    byDate = generateDemoData(start_date, end_date);
  } else {
    // ── Live DoorDash API ────────────────────────────────────────────────────
    try {
      const orders = await fetchDoorDashOrders(conn.api_key, conn.store_id, start_date, end_date);
      byDate = groupByDate(orders);
    } catch (err) {
      return NextResponse.json({ error: (err as Error).message }, { status: 502 });
    }
  }

  // ── Upsert into daily_sales ───────────────────────────────────────────────
  const rows = Object.entries(byDate).map(([date, { gross, commission }]) => ({
    location_id,
    delivery_date: date,
    doordash_gross: gross,
    aggregator_commission: commission, // cumulative; handled by merge below
  }));

  let upserted = 0;
  for (const row of rows) {
    // Merge: preserve existing values for other columns
    const { data: existing } = await db
      .from("daily_sales")
      .select("id, aggregator_commission")
      .eq("location_id", location_id)
      .eq("delivery_date", row.delivery_date)
      .single();

    if (existing) {
      await db.from("daily_sales").update({
        doordash_gross: row.doordash_gross,
        aggregator_commission: (existing.aggregator_commission ?? 0) + row.aggregator_commission,
      }).eq("id", existing.id);
    } else {
      await db.from("daily_sales").insert({
        ...row,
        cash_sales: 0, pos_sales: 0, uber_eats_gross: 0,
        grubhub_gross: 0, catering_sales: 0, cash_tips: 0,
      });
    }
    upserted++;
  }

  // Update last_synced
  await db.from("delivery_connections")
    .upsert({ location_id, provider: "doordash", last_synced: new Date().toISOString() }, { onConflict: "location_id,provider" });

  return NextResponse.json({ ok: true, days_synced: upserted, demo: !conn?.api_key });
}

// ── GET — return connection status ────────────────────────────────────────────
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
    .select("provider, last_synced, store_id")
    .eq("location_id", locationId)
    .eq("provider", "doordash")
    .single();

  return NextResponse.json({ connected: !!data?.store_id, last_synced: data?.last_synced ?? null });
}

// ── Demo data generator ───────────────────────────────────────────────────────
function generateDemoData(start: string, end: string) {
  const byDate: Record<string, { gross: number; commission: number }> = {};
  const cur = new Date(start);
  const endD = new Date(end);
  while (cur <= endD) {
    const dateStr = cur.toISOString().slice(0, 10);
    const isWeekend = cur.getDay() === 0 || cur.getDay() === 6;
    const baseGross = isWeekend
      ? 320 + Math.random() * 180
      : 180 + Math.random() * 120;
    const commission = baseGross * (0.25 + Math.random() * 0.05); // 25–30%
    byDate[dateStr] = {
      gross: Math.round(baseGross * 100) / 100,
      commission: Math.round(commission * 100) / 100,
    };
    cur.setDate(cur.getDate() + 1);
  }
  return byDate;
}
