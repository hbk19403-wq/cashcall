import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// QuickBooks Online Payroll OAuth 2.0
// Docs: https://developer.intuit.com/app/developer/qbo/docs/develop/authentication-and-authorization/oauth-2.0
// Scopes needed: com.intuit.quickbooks.payroll.timetracking (or full payroll scope)

const QB_CLIENT_ID    = process.env.QB_CLIENT_ID!;
const QB_REDIRECT_URI = process.env.QB_REDIRECT_URI!;
const QB_AUTH_URL     = "https://appcenter.intuit.com/connect/oauth2";
// Payroll scope — request both accounting + payroll
const QB_SCOPES       = "com.intuit.quickbooks.accounting openid profile email phone address";

export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.redirect(new URL("/login", req.url));

  const locationId = req.nextUrl.searchParams.get("location_id") ?? "";

  const state = crypto.randomUUID();
  await supabase.from("oauth_states").insert({
    state,
    user_id: user.id,
    location_id: locationId || null,
    provider: "quickbooks",
  });

  const params = new URLSearchParams({
    client_id:     QB_CLIENT_ID,
    scope:         QB_SCOPES,
    redirect_uri:  QB_REDIRECT_URI,
    response_type: "code",
    access_type:   "offline",
    state,
  });

  return NextResponse.redirect(`${QB_AUTH_URL}?${params}`);
}
