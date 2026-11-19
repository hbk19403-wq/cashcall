import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// ── Clover Demo Sync ────────────────────────────────────────────────────────
// Generates realistic daily sales data as if pulled from a real Clover merchant.
// Used for client demos — shows exactly what auto-sync looks like with real credentials.

function rand(min: number, max: number) {
  return Math.round((Math.random() * (max - min) + min) * 100) / 100;
}

function generateDayData(date: Date) {
  const dow = date.getDay(); // 0=Sun, 5=Fri, 6=Sat
  const isWeekend = dow === 0 || dow === 5 || dow === 6;

  // Realistic NYC casual-dining numbers
  const base      = isWeekend ? 4200 : 2800;
  const variance  = isWeekend ? 800  : 600;
  const total     = rand(base - variance, base + variance);

  const cashPct   = rand(0.12, 0.18);
  const uberPct   = rand(0.08, 0.14);
  const grubPct   = rand(0.05, 0.10);
  const doorPct   = rand(0.04, 0.09);
  const catPct    = isWeekend ? rand(0.05, 0.12) : 0;

  const cash_sales       = Math.round(total * cashPct * 100) / 100;
  const uber_eats_gross  = Math.round(total * uberPct * 100) / 100;
  const grubhub_gross    = Math.round(total * grubPct * 100) / 100;
  const doordash_gross   = Math.round(total * doorPct * 100) / 100;
  const catering_sales   = Math.round(total * catPct * 100) / 100;
  const pos_sales        = Math.round(
    (total - cash_sales - uber_eats_gross - grubhub_gross - doordash_gross - catering_sales) * 100
  ) / 100;

  const cash_tips        = Math.round(cash_sales * rand(0.16, 0.22) * 100) / 100;

  return { cash_sales, pos_sales, uber_eats_gross, grubhub_gross, doordash_gross, catering_sales, cash_tips };
}

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { location_id, days = 7 } = await req.json() as { location_id: string; days?: number };

  // Verify ownership
  const { data: loc } = await supabase.from("locations").select("id,name")
    .eq("id", location_id).eq("user_id", user.id).maybeSingle();
  if (!loc) return NextResponse.json({ error: "Location not found" }, { status: 404 });

  // Check demo connection exists
  const { data: conn } = await supabase.from("pos_connections")
    .select("id").eq("location_id", location_id).eq("provider", "clover").maybeSingle();
  if (!conn) return NextResponse.json({ error: "No Clover connection for this location" }, { status: 400 });

  const rows: object[] = [];
  const today = new Date();

  for (let i = 1; i <= days; i++) {
    const date = new Date(today);
    date.setDate(date.getDate() - i);
    const dateStr = date.toISOString().slice(0, 10);
    const sales = generateDayData(date);

    rows.push({
      location_id,
      sale_date:         dateStr,
      cash_sales:        sales.cash_sales,
      pos_sales:         sales.pos_sales,
      uber_eats_gross:   sales.uber_eats_gross,
      grubhub_gross:     sales.grubhub_gross,
      doordash_gross:    sales.doordash_gross,
      catering_sales:    sales.catering_sales,
      cash_tips:         sales.cash_tips,
      aggregator_commission: Math.round((sales.uber_eats_gross + sales.grubhub_gross + sales.doordash_gross) * 0.27 * 100) / 100,
    });
  }

  // Upsert all rows
  const { error } = await supabase.from("daily_sales").upsert(rows, {
    onConflict: "location_id,sale_date",
  });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Update last_synced
  await supabase.from("pos_connections").update({
    last_synced: new Date().toISOString(),
    sync_status: "idle",
    sync_error: null,
  }).eq("id", conn.id);

  // Log the sync
  const typedRows = rows as unknown as Record<string, unknown>[];
  await supabase.from("pos_sync_log").insert(
    typedRows.map((r) => ({
      location_id,
      provider: "clover",
      sync_date: r.sale_date as string,
      rows_upserted: 1,
      error: null,
    }))
  );

  const totalSales = typedRows.reduce((s: number, r) => {
    return s + (r.cash_sales as number) + (r.pos_sales as number) +
      (r.uber_eats_gross as number) + (r.grubhub_gross as number) +
      (r.doordash_gross as number) + (r.catering_sales as number);
  }, 0);

  return NextResponse.json({
    ok: true,
    days_synced: rows.length,
    rows_upserted: rows.length,
    total_sales: Math.round(totalSales * 100) / 100,
    message: `✓ Synced ${rows.length} days from Clover — $${Math.round(totalSales).toLocaleString()} total sales`,
  });
}
