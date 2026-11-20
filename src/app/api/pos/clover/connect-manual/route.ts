import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

const CLOVER_API = process.env.CLOVER_SANDBOX === "true"
  ? "https://apisandbox.dev.clover.com"
  : "https://api.clover.com";

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json() as { location_id?: string; merchant_id?: string; api_token?: string };
  const { location_id, merchant_id, api_token } = body;

  if (!location_id || !merchant_id?.trim() || !api_token?.trim()) {
    return NextResponse.json({ error: "location_id, merchant_id, and api_token are required" }, { status: 400 });
  }

  // Verify location belongs to this user
  const { data: loc } = await supabase.from("locations").select("id,name")
    .eq("id", location_id).eq("user_id", user.id).maybeSingle();
  if (!loc) return NextResponse.json({ error: "Location not found" }, { status: 404 });

  // Try to validate the token against Clover's merchant endpoint (best-effort — some tokens
  // restrict this call but still work for payments, so we save regardless)
  let merchantName = loc.name ?? "Clover Merchant";
  try {
    const verifyRes = await fetch(`${CLOVER_API}/v3/merchants/${merchant_id.trim()}`, {
      headers: { Authorization: `Bearer ${api_token.trim()}` },
    });
    if (verifyRes.ok) {
      const merchant = await verifyRes.json() as { name?: string };
      merchantName = merchant.name ?? merchantName;
    }
    // If 401/404 we still save — sync will catch it and set needs_reconnect
  } catch { /* network error — save anyway */ }

  // Upsert into pos_connections
  const { error: dbErr } = await supabase.from("pos_connections").upsert({
    user_id:            user.id,
    location_id:        location_id,
    provider:           "clover",
    api_token:          api_token.trim(),
    oauth_access_token: api_token.trim(),   // sync route reads either column
    oauth_merchant_id:  merchant_id.trim(),
    client_id:          merchant_id.trim(),
    status:             "connected",
    environment:        process.env.CLOVER_SANDBOX === "true" ? "sandbox" : "production",
    connected_at:       new Date().toISOString(),
    needs_reconnect:    false,
    sync_status:        "idle",
    sync_error:         null,
    consecutive_errors: 0,
  }, { onConflict: "location_id,provider" });

  if (dbErr) return NextResponse.json({ error: dbErr.message }, { status: 500 });

  return NextResponse.json({ ok: true, merchant_name: merchantName });
}
