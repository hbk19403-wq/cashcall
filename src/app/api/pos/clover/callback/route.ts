export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

const CLOVER_APP_ID     = process.env.CLOVER_APP_ID!;
const CLOVER_APP_SECRET = process.env.CLOVER_APP_SECRET!;
const CLOVER_SANDBOX    = process.env.CLOVER_SANDBOX === "true";
const API_BASE          = CLOVER_SANDBOX
  ? "https://apisandbox.dev.clover.com"
  : "https://api.clover.com";

export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    // Clover App Market install: user isn't logged in yet. Store the code in a pending param
    // and redirect to /clover with instructions to log in first.
    const code = req.nextUrl.searchParams.get("code");
    const merchantId = req.nextUrl.searchParams.get("merchant_id");
    return NextResponse.redirect(
      new URL(`/clover?pending=1&mid=${encodeURIComponent(merchantId ?? "")}&hint=login`, req.url)
    );
  }

  const code       = req.nextUrl.searchParams.get("code");
  const state      = req.nextUrl.searchParams.get("state");
  const merchantId = req.nextUrl.searchParams.get("merchant_id"); // Clover sends merchant_id in callback
  const employeeId = req.nextUrl.searchParams.get("employee_id");
  const error      = req.nextUrl.searchParams.get("error");

  if (error) {
    return NextResponse.redirect(new URL(`/settings/integrations?error=${encodeURIComponent(error)}`, req.url));
  }

  // Validate CSRF state
  const { data: stateRow } = await supabase
    .from("oauth_states").select("*").eq("state", state ?? "").eq("user_id", user.id).single();
  if (!stateRow) {
    return NextResponse.redirect(new URL("/settings/integrations?error=invalid_state", req.url));
  }
  await supabase.from("oauth_states").delete().eq("state", state ?? "");

  // Exchange code for access token
  const tokenRes = await fetch(
    `${API_BASE}/oauth/token?client_id=${CLOVER_APP_ID}&client_secret=${CLOVER_APP_SECRET}&code=${code}`,
    { method: "GET" }
  );

  if (!tokenRes.ok) {
    const msg = await tokenRes.text();
    return NextResponse.redirect(new URL(`/settings/integrations?error=${encodeURIComponent("Clover token error: " + msg.slice(0, 100))}`, req.url));
  }
  const tokenData = await tokenRes.json() as { access_token?: string; token_type?: string };
  const accessToken = tokenData.access_token;

  if (!accessToken) {
    return NextResponse.redirect(new URL("/settings/integrations?error=no_token", req.url));
  }

  // Fetch merchant name for display
  let merchantName = "Clover Merchant";
  try {
    const mRes = await fetch(`${API_BASE}/v3/merchants/${merchantId}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (mRes.ok) {
      const m = await mRes.json() as { name?: string };
      merchantName = m.name ?? merchantName;
    }
  } catch { /* non-fatal */ }

  const locationId = stateRow.location_id;

  // Upsert into pos_connections
  const upsertData = {
    user_id:             user.id,
    location_id:         locationId,
    provider:            "clover",
    oauth_access_token:  accessToken,
    oauth_merchant_id:   merchantId ?? "",
    oauth_employee_id:   employeeId ?? "",
    // api_token is used by the existing sync route — set it to the OAuth token
    api_token:           accessToken,
    client_id:           merchantId ?? "",
    status:              "connected",
    connected_at:        new Date().toISOString(),
  };

  if (locationId) {
    await supabase.from("pos_connections")
      .upsert(upsertData, { onConflict: "location_id,provider" });
  } else {
    await supabase.from("pos_connections").insert(upsertData);
  }

  // Redirect destination: App Market install → /clover/success; settings flow → settings/integrations
  let extra: { source?: string } = {};
  try { extra = JSON.parse(stateRow.extra ?? "{}"); } catch { /* ok */ }
  const dest = extra.source === "app_market"
    ? `/clover/success?merchant=${encodeURIComponent(merchantName)}`
    : `/settings/integrations?success=clover&merchant=${encodeURIComponent(merchantName)}`;
  return NextResponse.redirect(new URL(dest, req.url));
}
