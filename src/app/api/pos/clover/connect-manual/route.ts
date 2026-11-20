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

  // Validate the token by calling Clover's merchant endpoint
  let merchantName = "Clover Merchant";
  const verifyRes = await fetch(`${CLOVER_API}/v3/merchants/${merchant_id.trim()}`, {
    headers: { Authorization: `Bearer ${api_token.trim()}` },
  });

  if (!verifyRes.ok) {
    const body = await verifyRes.text();
    if (verifyRes.status === 401) {
      return NextResponse.json({ error: "Invalid API token — check your Clover API token and try again" }, { status: 400 });
    }
    if (verifyRes.status === 404) {
      return NextResponse.json({ error: "Merchant ID not found — check your Clover Merchant ID and try again" }, { status: 400 });
    }
    return NextResponse.json({ error: `Clover API error: ${verifyRes.status} ${body.slice(0, 100)}` }, { status: 400 });
  }

  const merchant = await verifyRes.json() as { name?: string; id?: string };
  merchantName = merchant.name ?? merchantName;

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
