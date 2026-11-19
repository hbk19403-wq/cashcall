import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createClient as createServiceClient } from "@supabase/supabase-js";

// GET /api/team/accept?token=<token>
// If logged in → claim the invite → redirect to /dashboard
// If not logged in → redirect to /login?redirect=/api/team/accept?token=<token>
export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("token");
  if (!token) {
    return NextResponse.redirect(new URL("/login?error=invalid_invite", req.url));
  }

  const admin = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  // Look up the invitation
  const { data: invite, error: invErr } = await admin
    .from("team_invitations")
    .select("*")
    .eq("token", token)
    .eq("status", "pending")
    .single();

  if (invErr || !invite) {
    return NextResponse.redirect(new URL("/login?error=invite_not_found", req.url));
  }
  if (new Date(invite.expires_at) < new Date()) {
    return NextResponse.redirect(new URL("/login?error=invite_expired", req.url));
  }

  // Check if user is logged in
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    // Redirect to login with the token, so they can log in and come back
    const loginUrl = new URL("/login", req.url);
    loginUrl.searchParams.set("invite", token);
    return NextResponse.redirect(loginUrl);
  }

  // User is logged in — create or update their profile
  const { data: existingProfile } = await admin
    .from("user_profiles")
    .select("user_id, role")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!existingProfile) {
    // New user — create profile with invited role
    await admin.from("user_profiles").insert({
      user_id: user.id,
      username: user.email?.split("@")[0] ?? "team",
      role: invite.role,
      location_id: invite.location_id ?? null,
    });
  }
  // If they already have a profile, don't override (they may already be an owner elsewhere)

  // Mark the invitation as accepted
  await admin
    .from("team_invitations")
    .update({ status: "accepted", accepted_by: user.id, accepted_at: new Date().toISOString() })
    .eq("id", invite.id);

  return NextResponse.redirect(new URL("/dashboard?invite=accepted", req.url));
}
