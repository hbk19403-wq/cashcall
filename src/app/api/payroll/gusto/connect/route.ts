import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Gusto OAuth 2.0 – Production: https://api.gusto.com
// Sandbox:  https://api.gusto-demo.com
// Docs:     https://docs.gusto.com/embedded-payroll/docs/oauth

const GUSTO_CLIENT_ID     = process.env.GUSTO_CLIENT_ID!;
const GUSTO_REDIRECT_URI  = process.env.GUSTO_REDIRECT_URI!;   // e.g. https://cashcall.io/api/payroll/gusto/callback
const GUSTO_SANDBOX       = process.env.GUSTO_SANDBOX === "true";
const AUTH_BASE           = GUSTO_SANDBOX
  ? "https://api.gusto-demo.com/oauth/authorize"
  : "https://api.gusto.com/oauth/authorize";

export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.redirect(new URL("/login", req.url));

  const locationId = req.nextUrl.searchParams.get("location_id") ?? "";

  // Create CSRF state
  const state = crypto.randomUUID();
  await supabase.from("oauth_states").insert({
    state,
    user_id: user.id,
    location_id: locationId || null,
    provider: "gusto",
  });

  const params = new URLSearchParams({
    response_type: "code",
    client_id:     GUSTO_CLIENT_ID,
    redirect_uri:  GUSTO_REDIRECT_URI,
    state,
  });

  return NextResponse.redirect(`${AUTH_BASE}?${params}`);
}
