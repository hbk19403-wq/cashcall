export const dynamic = "force-dynamic";

/**
 * /api/cron/rollup-prices
 * -----------------------
 * Monthly rollup: aggregates invoice_line_items into price_history_monthly,
 * then prunes raw line items older than 6 months (they live in the rollup now).
 *
 * Trigger via Vercel Cron (vercel.json) on the 1st of each month at 2am UTC,
 * or call manually: POST /api/cron/rollup-prices
 * Protected by CRON_SECRET env var.
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export async function POST(req: NextRequest) {
  // Simple secret check — set CRON_SECRET in Vercel env
  // Vercel cron sends "Authorization: Bearer <CRON_SECRET>"; x-cron-key / x-cron-secret also accepted.
  const expected = process.env.CRON_SECRET;
  const bearer = req.headers.get("authorization");
  const given = bearer?.startsWith("Bearer ") ? bearer.slice(7)
    : (req.headers.get("x-cron-key") ?? req.headers.get("x-cron-secret"));
  if (!expected || given !== expected) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // ?dry_run=1 confirms access without rolling up or pruning anything.
  if (req.nextUrl.searchParams.get("dry_run") === "1") {
    return NextResponse.json({ ok: true, dry_run: true });
  }

  const supabaseUrl  = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const serviceKey   = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  if (!supabaseUrl || !serviceKey) {
    return NextResponse.json({ error: "Missing Supabase env vars" }, { status: 500 });
  }

  const supabase = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false },
  });

  const { data, error } = await supabase.rpc("rollup_price_history", {
    p_cutoff_months: 6,
  });

  if (error) {
    console.error("[rollup-prices] RPC error:", error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  console.log(`[rollup-prices] Rolled up ${data} rows into price_history_monthly`);
  return NextResponse.json({ ok: true, rows_inserted: data });
}

// Also allow GET for Vercel Cron (Vercel sends GET for cron jobs)
export async function GET(req: NextRequest) {
  return POST(req);
}
