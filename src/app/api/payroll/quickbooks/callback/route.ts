export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

const QB_CLIENT_ID     = process.env.QB_CLIENT_ID!;
const QB_CLIENT_SECRET = process.env.QB_CLIENT_SECRET!;
const QB_REDIRECT_URI  = process.env.QB_REDIRECT_URI!;
const QB_TOKEN_URL     = "https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer";
const QB_API_BASE      = "https://quickbooks.api.intuit.com";

export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.redirect(new URL("/login", req.url));

  const code      = req.nextUrl.searchParams.get("code");
  const state     = req.nextUrl.searchParams.get("state");
  const realmId   = req.nextUrl.searchParams.get("realmId"); // QB company ID
  const error     = req.nextUrl.searchParams.get("error");

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

  // Exchange code for tokens (Basic auth with client_id:client_secret)
  const credentials = Buffer.from(`${QB_CLIENT_ID}:${QB_CLIENT_SECRET}`).toString("base64");
  const tokenRes = await fetch(QB_TOKEN_URL, {
    method: "POST",
    headers: {
      "Content-Type":  "application/x-www-form-urlencoded",
      "Authorization": `Basic ${credentials}`,
      "Accept":        "application/json",
    },
    body: new URLSearchParams({
      grant_type:   "authorization_code",
      code:         code ?? "",
      redirect_uri: QB_REDIRECT_URI,
    }),
  });

  if (!tokenRes.ok) {
    const msg = await tokenRes.text();
    return NextResponse.redirect(new URL(`/settings/integrations?error=${encodeURIComponent("QB token error: " + msg.slice(0, 100))}`, req.url));
  }
  const tokens = await tokenRes.json() as {
    access_token: string; refresh_token: string; expires_in: number; x_refresh_token_expires_in?: number;
  };

  // Fetch company info
  let companyName = "QuickBooks Company";
  try {
    const compRes = await fetch(
      `${QB_API_BASE}/v3/company/${realmId}/companyinfo/${realmId}?minorversion=65`,
      {
        headers: {
          Authorization: `Bearer ${tokens.access_token}`,
          Accept: "application/json",
        },
      }
    );
    if (compRes.ok) {
      const compData = await compRes.json() as { CompanyInfo?: { CompanyName?: string } };
      companyName = compData.CompanyInfo?.CompanyName ?? companyName;
    }
  } catch { /* non-fatal */ }

  const expiresAt = new Date(Date.now() + (tokens.expires_in ?? 3600) * 1000).toISOString();
  const locationId = stateRow.location_id;

  const upsertData = {
    user_id:             user.id,
    location_id:         locationId,
    provider:            "quickbooks",
    access_token:        tokens.access_token,
    refresh_token:       tokens.refresh_token,
    token_expires_at:    expiresAt,
    provider_company_id: realmId ?? "",
    provider_name:       companyName,
    status:              "connected",
    connected_at:        new Date().toISOString(),
  };

  if (locationId) {
    await supabase.from("payroll_connections")
      .upsert(upsertData, { onConflict: "location_id,provider" });
  } else {
    await supabase.from("payroll_connections").insert(upsertData);
  }

  return NextResponse.redirect(new URL("/settings/integrations?success=quickbooks", req.url));
}
