export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// ── ADP OAuth 2.0 Connect ─────────────────────────────────────────────────────
// ADP uses OAuth 2.0 Authorization Code flow with PKCE.
// Docs: https://developers.adp.com/articles/guide/auth-process-data-conn-auth-code
//
// Required env vars:
//   ADP_CLIENT_ID        — from ADP Developer Portal
//   ADP_CLIENT_SECRET    — from ADP Developer Portal
//   ADP_REDIRECT_URI     — https://cashcall.io/api/payroll/adp/callback
//   ADP_SANDBOX          — "true" for sandbox, unset for production
// ─────────────────────────────────────────────────────────────────────────────

const ADP_CLIENT_ID    = process.env.ADP_CLIENT_ID!;
const ADP_REDIRECT_URI = process.env.ADP_REDIRECT_URI!;
const ADP_SANDBOX      = process.env.ADP_SANDBOX === "true";

const AUTH_BASE = ADP_SANDBOX
  ? "https://accounts.adp.com/auth/oauth/v2/authorize"  // sandbox and production share the same OAuth server
  : "https://accounts.adp.com/auth/oauth/v2/authorize";

export async function GET(req: NextRequest) {
  if (!ADP_CLIENT_ID) {
    return NextResponse.redirect(
      new URL("/settings/integrations?error=adp_not_configured", req.url)
    );
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.redirect(new URL("/login", req.url));

  const locationId = req.nextUrl.searchParams.get("location_id") ?? "";

  // Store CSRF state in oauth_states
  const state = crypto.randomUUID();
  await supabase.from("oauth_states").insert({
    state,
    user_id: user.id,
    location_id: locationId || null,
    provider: "adp",
    extra: null,
  });

  const params = new URLSearchParams({
    client_id:     ADP_CLIENT_ID,
    redirect_uri:  ADP_REDIRECT_URI,
    response_type: "code",
    scope:         "openid profile hr-data-payroll-output payroll-output",
    state,
  });

  return NextResponse.redirect(`${AUTH_BASE}?${params}`);
}
