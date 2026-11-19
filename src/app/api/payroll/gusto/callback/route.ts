export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

const GUSTO_CLIENT_ID     = process.env.GUSTO_CLIENT_ID!;
const GUSTO_CLIENT_SECRET = process.env.GUSTO_CLIENT_SECRET!;
const GUSTO_REDIRECT_URI  = process.env.GUSTO_REDIRECT_URI!;
const GUSTO_SANDBOX       = process.env.GUSTO_SANDBOX === "true";
const TOKEN_URL           = GUSTO_SANDBOX
  ? "https://api.gusto-demo.com/oauth/token"
  : "https://api.gusto.com/oauth/token";
const API_BASE            = GUSTO_SANDBOX
  ? "https://api.gusto-demo.com"
  : "https://api.gusto.com";

export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.redirect(new URL("/login", req.url));

  const code  = req.nextUrl.searchParams.get("code");
  const state = req.nextUrl.searchParams.get("state");
  const error = req.nextUrl.searchParams.get("error");

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

  // Exchange code for tokens
  const tokenRes = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type:    "authorization_code",
      code:          code ?? "",
      client_id:     GUSTO_CLIENT_ID,
      client_secret: GUSTO_CLIENT_SECRET,
      redirect_uri:  GUSTO_REDIRECT_URI,
    }),
  });
  if (!tokenRes.ok) {
    const msg = await tokenRes.text();
    return NextResponse.redirect(new URL(`/settings/integrations?error=${encodeURIComponent("Token exchange failed: " + msg.slice(0, 100))}`, req.url));
  }
  const tokens = await tokenRes.json() as {
    access_token: string; refresh_token: string; expires_in: number;
  };

  // Fetch company info from Gusto
  const meRes = await fetch(`${API_BASE}/v1/me`, {
    headers: { Authorization: `Bearer ${tokens.access_token}` },
  });
  const me = meRes.ok ? await meRes.json() as { roles?: { payroll_admin?: { companies?: { id: number; name: string; employees_count?: number }[] } } } : {};
  const company = me?.roles?.payroll_admin?.companies?.[0];

  const expiresAt = new Date(Date.now() + (tokens.expires_in ?? 3600) * 1000).toISOString();
  const locationId = stateRow.location_id;

  // Store in payroll_connections (upsert per user+provider, or per location if provided)
  const upsertData = {
    user_id:             user.id,
    location_id:         locationId,
    provider:            "gusto",
    access_token:        tokens.access_token,
    refresh_token:       tokens.refresh_token,
    token_expires_at:    expiresAt,
    provider_company_id: String(company?.id ?? ""),
    provider_name:       company?.name ?? "Gusto",
    employee_count:      company?.employees_count ?? null,
    status:              "connected",
    connected_at:        new Date().toISOString(),
  };

  if (locationId) {
    await supabase.from("payroll_connections")
      .upsert(upsertData, { onConflict: "location_id,provider" });
  } else {
    // No specific location — store at user level (location_id null)
    await supabase.from("payroll_connections").insert(upsertData);
  }

  return NextResponse.redirect(new URL("/settings/integrations?success=gusto", req.url));
}
