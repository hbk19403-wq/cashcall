import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Clover OAuth 2.0
// Sandbox: https://apisandbox.dev.clover.com/oauth/authorize
// Production: https://www.clover.com/oauth/authorize
// Docs: https://docs.clover.com/docs/oauth-flows-in-clover

const CLOVER_APP_ID      = process.env.CLOVER_APP_ID!;
const CLOVER_REDIRECT_URI = process.env.CLOVER_REDIRECT_URI!;
const CLOVER_SANDBOX     = process.env.CLOVER_SANDBOX === "true";
const AUTH_BASE          = CLOVER_SANDBOX
  ? "https://apisandbox.dev.clover.com/oauth/authorize"
  : "https://www.clover.com/oauth/authorize";

export async function GET(req: NextRequest) {
  if (!CLOVER_APP_ID) {
    // Clover not yet configured — redirect back with an error message
    return NextResponse.redirect(
      new URL("/settings/integrations?error=clover_not_configured", req.url)
    );
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.redirect(new URL("/login", req.url));

  const locationId = req.nextUrl.searchParams.get("location_id") ?? "";
  // source=app_market → redirect to /clover/success after OAuth; otherwise → settings/integrations
  const source = req.nextUrl.searchParams.get("source") ?? "";

  // Store CSRF state
  const state = crypto.randomUUID();
  await supabase.from("oauth_states").insert({
    state,
    user_id: user.id,
    location_id: locationId || null,
    provider: "clover",
    extra: source ? JSON.stringify({ source }) : null,
  });

  // Clover OAuth uses "client_id" which is the App ID
  const params = new URLSearchParams({
    client_id:    CLOVER_APP_ID,
    redirect_uri: CLOVER_REDIRECT_URI,
    state,
    // Clover v2 flow — just app ID + redirect + state
  });

  return NextResponse.redirect(`${AUTH_BASE}?${params}`);
}
