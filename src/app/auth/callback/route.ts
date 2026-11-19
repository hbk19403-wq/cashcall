import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * GET /auth/callback
 *
 * Supabase PKCE email confirmation handler.
 * Supabase redirects here after the user clicks their confirmation / magic-link email.
 * We exchange the one-time `code` for a session, then send the user to the dashboard.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  // `next` lets callers pass a custom redirect — default to /dashboard
  const next = searchParams.get("next") ?? "/dashboard";

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);

    if (!error) {
      // Successful confirmation — send to dashboard (or wherever `next` says)
      const redirectUrl = new URL(next, origin);
      return NextResponse.redirect(redirectUrl);
    }

    // Code exchange failed (expired, already used, etc.)
    console.error("[auth/callback] exchangeCodeForSession error:", error.message);
    return NextResponse.redirect(
      new URL(`/login?error=${encodeURIComponent("Confirmation link expired or already used. Please sign in or request a new link.")}`, origin)
    );
  }

  // No code present — just redirect to login
  return NextResponse.redirect(new URL("/login", origin));
}
