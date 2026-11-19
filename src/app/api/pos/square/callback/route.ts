export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

const SQUARE_APP_ID      = process.env.SQUARE_APP_ID!;
const SQUARE_APP_SECRET  = process.env.SQUARE_APP_SECRET!;
const SQUARE_REDIRECT_URI = process.env.SQUARE_REDIRECT_URI!;
const SQUARE_SANDBOX     = process.env.SQUARE_SANDBOX === "true";
const TOKEN_URL          = SQUARE_SANDBOX
  ? "https://connect.squareupsandbox.com/oauth2/token"
  : "https://connect.squareup.com/oauth2/token";
const API_BASE           = SQUARE_SANDBOX
  ? "https://connect.squareupsandbox.com/v2"
  : "https://connect.squareup.com/v2";

export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.redirect(new URL("/login", req.url));

  const code  = req.nextUrl.searchParams.get("code");
  const state = req.nextUrl.searchParams.get("state");
  const error = req.nextUrl.searchParams.get("error");

  if (error) {
    return NextResponse.redirect(
      new URL(`/settings/integrations?error=${encodeURIComponent(error)}`, req.url)
    );
  }

  if (!code || !state) {
    return NextResponse.redirect(new URL("/settings/integrations?error=missing_params", req.url));
  }

  // Validate CSRF state
  const { data: stateRow } = await supabase
    .from("oauth_states").select("*").eq("state", state).eq("user_id", user.id).single();
  if (!stateRow) {
    return NextResponse.redirect(new URL("/settings/integrations?error=invalid_state", req.url));
  }
  await supabase.from("oauth_states").delete().eq("state", state);

  // Exchange code for access token
  const tokenRes = await fetch(TOKEN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      "Square-Version": "2024-01-17",
    },
    body: JSON.stringify({
      client_id:     SQUARE_APP_ID,
      client_secret: SQUARE_APP_SECRET,
      redirect_uri:  SQUARE_REDIRECT_URI,
      grant_type:    "authorization_code",
      code,
    }),
  });

  if (!tokenRes.ok) {
    const msg = await tokenRes.text();
    return NextResponse.redirect(
      new URL(`/settings/integrations?error=${encodeURIComponent("Square token error: " + msg.slice(0, 100))}`, req.url)
    );
  }

  const tokenData = await tokenRes.json() as {
    access_token?: string;
    refresh_token?: string;
    merchant_id?: string;
    expires_at?: string;
  };

  const accessToken  = tokenData.access_token;
  const refreshToken = tokenData.refresh_token;
  const merchantId   = tokenData.merchant_id;

  if (!accessToken) {
    return NextResponse.redirect(new URL("/settings/integrations?error=no_token", req.url));
  }

  // Fetch merchant name for display
  let merchantName = "Square Merchant";
  try {
    const mRes = await fetch(`${API_BASE}/merchants/${merchantId}`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Square-Version": "2024-01-17",
      },
    });
    if (mRes.ok) {
      const m = await mRes.json() as { merchant?: { business_name?: string; country?: string } };
      merchantName = m.merchant?.business_name ?? merchantName;
    }
  } catch { /* non-fatal */ }

  const locationId = stateRow.location_id;

  // Upsert into pos_connections
  const upsertData = {
    user_id:            user.id,
    location_id:        locationId,
    provider:           "square",
    access_token:       accessToken,
    refresh_token:      refreshToken ?? null,
    merchant_id:        merchantId ?? "",
    oauth_access_token: accessToken,
    oauth_merchant_id:  merchantId ?? "",
    api_token:          accessToken,         // used by existing sync route
    client_id:          merchantId ?? "",
    environment:        SQUARE_SANDBOX ? "sandbox" : "production",
    status:             "connected",
    connected_at:       new Date().toISOString(),
  };

  if (locationId) {
    await supabase.from("pos_connections")
      .upsert(upsertData, { onConflict: "location_id,provider" });
  } else {
    await supabase.from("pos_connections").insert(upsertData);
  }

  return NextResponse.redirect(
    new URL(`/settings/integrations?success=square&merchant=${encodeURIComponent(merchantName)}`, req.url)
  );
}
