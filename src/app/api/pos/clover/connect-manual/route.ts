import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { checkCloverCredentialShape, cloverVerifyError } from "@/lib/cloverCredentials";

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

  // 1. Shape check — catches a MID or an API token pasted into the Merchant ID box
  const shapeError = checkCloverCredentialShape(merchant_id, api_token);
  if (shapeError) return NextResponse.json({ error: shapeError }, { status: 400 });

  // 2. Verify the pair against Clover. Credentials are never saved unverified.
  let merchantName = loc.name ?? "Clover Merchant";
  let verifyStatus: number;
  try {
    const verifyRes = await fetch(`${CLOVER_API}/v3/merchants/${encodeURIComponent(merchant_id.trim())}`, {
      headers: { Authorization: `Bearer ${api_token.trim()}` },
      signal: AbortSignal.timeout(10_000),
      cache: "no-store",
    });
    verifyStatus = verifyRes.status;
    if (verifyRes.ok) {
      const merchant = await verifyRes.json().catch(() => ({})) as { name?: string };
      merchantName = merchant.name ?? merchantName;
    }
  } catch {
    return NextResponse.json(
      { error: "Clover did not respond in time. Nothing was saved. Try again in a few minutes." },
      { status: 502 },
    );
  }
  const verifyError = cloverVerifyError(verifyStatus);
  if (verifyError) {
    return NextResponse.json({ error: verifyError }, { status: verifyStatus === 429 || verifyStatus >= 500 ? 502 : 400 });
  }

  // Upsert into pos_connections
  // merchant_id + access_token are NOT NULL — must always be set
  const { error: dbErr } = await supabase.from("pos_connections").upsert({
    user_id:            user.id,
    location_id:        location_id,
    provider:           "clover",
    merchant_id:        merchant_id.trim(),       // NOT NULL — primary ID column
    access_token:       api_token.trim(),         // NOT NULL — primary token column
    api_token:          api_token.trim(),         // also populate alias column
    oauth_access_token: api_token.trim(),         // sync route reads any of these
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
