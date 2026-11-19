export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

const ADP_CLIENT_ID     = process.env.ADP_CLIENT_ID!;
const ADP_CLIENT_SECRET = process.env.ADP_CLIENT_SECRET!;
const ADP_REDIRECT_URI  = process.env.ADP_REDIRECT_URI!;
const ADP_SANDBOX       = process.env.ADP_SANDBOX === "true";

const TOKEN_URL = "https://accounts.adp.com/auth/oauth/v2/token";
const API_BASE  = ADP_SANDBOX
  ? "https://api.adp.com"   // ADP uses same domain; sandbox scoped by credentials
  : "https://api.adp.com";

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

  // Validate CSRF state
  const { data: stateRow } = await supabase
    .from("oauth_states").select("*").eq("state", state ?? "").eq("user_id", user.id).single();
  if (!stateRow) {
    return NextResponse.redirect(new URL("/settings/integrations?error=invalid_state", req.url));
  }
  await supabase.from("oauth_states").delete().eq("state", state ?? "");

  // Exchange code for tokens
  const tokenRes = await fetch(TOKEN_URL, {
    method: "POST",
    headers: {
      "Content-Type":  "application/x-www-form-urlencoded",
      "Authorization": "Basic " + Buffer.from(`${ADP_CLIENT_ID}:${ADP_CLIENT_SECRET}`).toString("base64"),
    },
    body: new URLSearchParams({
      grant_type:   "authorization_code",
      code:          code ?? "",
      redirect_uri:  ADP_REDIRECT_URI,
    }),
  });

  if (!tokenRes.ok) {
    const msg = await tokenRes.text();
    return NextResponse.redirect(
      new URL(`/settings/integrations?error=${encodeURIComponent("ADP token error: " + msg.slice(0, 100))}`, req.url)
    );
  }

  const tokenData = await tokenRes.json() as {
    access_token:  string;
    refresh_token: string;
    expires_in:    number;
  };

  const expiresAt = new Date(Date.now() + tokenData.expires_in * 1000).toISOString();

  // Fetch company code from ADP /core/v1/organization-departments
  let companyCode = "";
  try {
    const orgRes = await fetch(`${API_BASE}/core/v1/organization-departments`, {
      headers: { Authorization: `Bearer ${tokenData.access_token}` },
    });
    if (orgRes.ok) {
      const orgData = await orgRes.json() as { organizationDepartments?: { companyCode?: { codeValue?: string } }[] };
      companyCode = orgData.organizationDepartments?.[0]?.companyCode?.codeValue ?? "";
    }
  } catch { /* non-fatal */ }

  const locationId = stateRow.location_id;

  // Upsert into adp_connections
  const { error: upsertErr } = await supabase.from("adp_connections").upsert({
    user_id:          user.id,
    location_id:      locationId,
    access_token:     tokenData.access_token,
    refresh_token:    tokenData.refresh_token,
    token_expires_at: expiresAt,
    company_code:     companyCode,
    status:           "connected",
    needs_reconnect:  false,
    consecutive_errors: 0,
    connected_at:     new Date().toISOString(),
  }, { onConflict: "location_id,user_id" });

  if (upsertErr) {
    return NextResponse.redirect(
      new URL(`/settings/integrations?error=${encodeURIComponent("DB error: " + upsertErr.message)}`, req.url)
    );
  }

  return NextResponse.redirect(
    new URL(`/settings/integrations?success=adp`, req.url)
  );
}
