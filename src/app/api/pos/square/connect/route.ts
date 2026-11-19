import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Square OAuth 2.0
// Sandbox:    https://connect.squareupsandbox.com/oauth2/authorize
// Production: https://connect.squareup.com/oauth2/authorize
// Docs: https://developer.squareup.com/docs/oauth-api/overview

const SQUARE_APP_ID      = process.env.SQUARE_APP_ID!;
const SQUARE_REDIRECT_URI = process.env.SQUARE_REDIRECT_URI!;
const SQUARE_SANDBOX     = process.env.SQUARE_SANDBOX === "true";
const AUTH_BASE          = SQUARE_SANDBOX
  ? "https://connect.squareupsandbox.com/oauth2/authorize"
  : "https://connect.squareup.com/oauth2/authorize";

export async function GET(req: NextRequest) {
  if (!SQUARE_APP_ID) {
    return NextResponse.redirect(
      new URL("/settings/integrations?error=square_not_configured", req.url)
    );
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.redirect(new URL("/login", req.url));

  const locationId = req.nextUrl.searchParams.get("location_id") ?? "";

  // Store CSRF state
  const state = crypto.randomUUID();
  await supabase.from("oauth_states").insert({
    state,
    user_id: user.id,
    location_id: locationId || null,
    provider: "square",
    extra: null,
  });

  const params = new URLSearchParams({
    client_id:    SQUARE_APP_ID,
    redirect_uri: SQUARE_REDIRECT_URI,
    response_type: "code",
    scope: "MERCHANT_PROFILE_READ ORDERS_READ PAYMENTS_READ",
    state,
    session: "false", // skip Square account selector if already signed in
  });

  return NextResponse.redirect(`${AUTH_BASE}?${params}`);
}
