import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createClient as createServiceClient } from "@supabase/supabase-js";

/**
 * POST /api/delivery/manual
 * Manual monthly delivery sales entry — no API key needed.
 * Body: { location_id, provider, month (YYYY-MM), gross_sales, commission_pct }
 * Net = gross_sales × (1 - commission_pct / 100)
 * Stored as a single upserted row in delivery_monthly_sales.
 */
export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json() as {
    location_id: string;
    provider: "doordash" | "ubereats" | "grubhub" | string;
    month: string;          // YYYY-MM
    gross_sales: number;
    commission_pct: number; // e.g. 27.5 for 27.5%
  };

  const { location_id, provider, month, gross_sales, commission_pct } = body;

  if (!location_id || !provider || !month || gross_sales == null || commission_pct == null) {
    return NextResponse.json(
      { error: "location_id, provider, month, gross_sales, commission_pct are required" },
      { status: 400 }
    );
  }
  if (!/^\d{4}-\d{2}$/.test(month)) {
    return NextResponse.json({ error: "month must be YYYY-MM" }, { status: 400 });
  }

  // Verify location ownership
  const { data: loc } = await supabase
    .from("locations")
    .select("id")
    .eq("id", location_id)
    .eq("user_id", user.id)
    .single();
  if (!loc) return NextResponse.json({ error: "Location not found" }, { status: 404 });

  const net_sales = Math.round(gross_sales * (1 - commission_pct / 100) * 100) / 100;
  const commission_amount = Math.round((gross_sales - net_sales) * 100) / 100;

  const db = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );

  // Upsert into delivery_monthly_sales (create if not exists via migration)
  const { error } = await db.from("delivery_monthly_sales").upsert({
    location_id,
    provider,
    month,                       // YYYY-MM
    gross_sales,
    commission_pct,
    commission_amount,
    net_sales,
    entry_type: "manual",
    updated_at: new Date().toISOString(),
  }, { onConflict: "location_id,provider,month" });

  if (error) {
    // Table may not exist yet — return helpful error
    if (error.code === "42P01") {
      return NextResponse.json(
        { error: "delivery_monthly_sales table not found — run the migration first." },
        { status: 500 }
      );
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, net_sales, commission_amount });
}

/**
 * GET /api/delivery/manual?location_id=...&month=YYYY-MM
 * Fetch saved manual entries for a location/month.
 */
export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const locationId = req.nextUrl.searchParams.get("location_id");
  const month      = req.nextUrl.searchParams.get("month");

  if (!locationId) return NextResponse.json({ error: "location_id required" }, { status: 400 });

  const { data: loc } = await supabase
    .from("locations")
    .select("id")
    .eq("id", locationId)
    .eq("user_id", user.id)
    .single();
  if (!loc) return NextResponse.json({ error: "Location not found" }, { status: 404 });

  const db = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );

  let query = db.from("delivery_monthly_sales")
    .select("provider, month, gross_sales, commission_pct, commission_amount, net_sales, updated_at")
    .eq("location_id", locationId)
    .order("month", { ascending: false });

  if (month) query = query.eq("month", month);

  const { data, error } = await query;
  if (error) return NextResponse.json({ data: [] });

  return NextResponse.json({ data: data ?? [] });
}
