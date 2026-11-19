export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createClient as createServiceClient } from "@supabase/supabase-js";

function generateToken(len = 32) {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";
  return Array.from({ length: len }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
}

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Only owners can invite
  const { data: profile } = await supabase
    .from("user_profiles")
    .select("role")
    .eq("user_id", user.id)
    .single();
  if (profile?.role !== "owner")
    return NextResponse.json({ error: "Only owners can invite team members" }, { status: 403 });

  const { email, role, location_id, name } = await req.json();
  if (!email || !email.includes("@"))
    return NextResponse.json({ error: "Valid email required" }, { status: 400 });
  if (!["manager", "staff"].includes(role))
    return NextResponse.json({ error: "Role must be manager or staff" }, { status: 400 });

  const admin = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const token = generateToken();
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

  // Insert into team_invitations table
  const { error: insertErr } = await admin
    .from("team_invitations")
    .insert({
      invited_by: user.id,
      email,
      role,
      location_id: location_id || null,
      token,
      expires_at: expiresAt,
      status: "pending",
    });
  if (insertErr) return NextResponse.json({ error: insertErr.message }, { status: 500 });

  const acceptUrl = `${req.nextUrl.origin}/api/team/accept?token=${token}`;

  // Send email via Resend
  const resendKey = process.env.RESEND_API_KEY;
  if (!resendKey) {
    // Return success with the URL so the owner can share it manually
    return NextResponse.json({ ok: true, acceptUrl, manual: true });
  }

  const recipientName = name || email.split("@")[0];
  const html = `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><title>You're invited to CashCall</title></head>
<body style="margin:0;padding:0;background:#0a0e1a;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
<div style="max-width:560px;margin:32px auto;background:#0f1524;border-radius:20px;overflow:hidden;border:1px solid rgba(255,255,255,0.07);">
  <div style="background:linear-gradient(135deg,#060b18,#0d1a2e);padding:36px 40px 28px;border-bottom:1px solid rgba(0,212,168,0.15);">
    <div style="margin-bottom:16px;"><span style="font-size:24px;font-weight:900;color:#00d4a8;">⚡ CashCall</span></div>
    <h1 style="margin:0 0 8px;font-size:22px;font-weight:800;color:#fff;">You've been invited to join the team</h1>
    <p style="margin:0;font-size:14px;color:rgba(255,255,255,0.5);">
      Hi <strong style="color:rgba(255,255,255,0.8);">${recipientName}</strong> — you have a <strong style="color:#00d4a8;">${role}</strong> invitation waiting for you on CashCall.
    </p>
  </div>
  <div style="padding:32px 40px;">
    <p style="margin:0 0 24px;font-size:14px;color:rgba(255,255,255,0.6);line-height:1.6;">
      Click the button below to accept your invitation. You'll be asked to create an account (or log in if you already have one), and then you'll have access to the restaurant dashboard.
    </p>
    <div style="text-align:center;">
      <a href="${acceptUrl}" style="display:inline-block;background:linear-gradient(135deg,#00d4a8,#00b890);color:#030f0b;padding:16px 40px;border-radius:12px;font-size:16px;font-weight:900;text-decoration:none;">
        Accept Invitation →
      </a>
      <p style="margin:14px 0 0;font-size:12px;color:rgba(255,255,255,0.25);">
        Or copy: <a href="${acceptUrl}" style="color:rgba(0,212,168,0.7);">${acceptUrl}</a>
      </p>
    </div>
    <div style="margin-top:24px;padding:14px 18px;background:rgba(255,255,255,0.04);border-radius:10px;border:1px solid rgba(255,255,255,0.07);">
      <p style="margin:0;font-size:12px;color:rgba(255,255,255,0.35);line-height:1.7;">
        This invitation expires in 7 days. If you weren't expecting this, you can safely ignore it.
      </p>
    </div>
  </div>
  <div style="padding:16px 40px 24px;border-top:1px solid rgba(255,255,255,0.05);">
    <p style="margin:0;font-size:11px;color:rgba(255,255,255,0.2);">
      <a href="https://cashcall.io" style="color:rgba(0,212,168,0.5);text-decoration:none;">cashcall.io</a>
    </p>
  </div>
</div>
</body>
</html>`;

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${resendKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: "CashCall <digest@cashcall.io>",
        to: email,
        subject: `⚡ You've been invited to join CashCall as ${role}`,
        html,
      }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      return NextResponse.json({ ok: true, acceptUrl, emailError: err.message || "Email failed" });
    }
  } catch {
    return NextResponse.json({ ok: true, acceptUrl, emailError: "Email delivery failed" });
  }

  return NextResponse.json({ ok: true, acceptUrl });
}

export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await supabase
    .from("user_profiles")
    .select("role")
    .eq("user_id", user.id)
    .single();
  if (profile?.role !== "owner")
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const admin = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const { data, error } = await admin
    .from("team_invitations")
    .select("id,email,role,location_id,status,expires_at,created_at")
    .eq("invited_by", user.id)
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ invitations: data });
}

export async function DELETE(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await req.json();
  const admin = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const { error } = await admin
    .from("team_invitations")
    .delete()
    .eq("id", id)
    .eq("invited_by", user.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
