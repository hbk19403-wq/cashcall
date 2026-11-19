export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createClient as createServiceClient } from "@supabase/supabase-js";
import { randomBytes } from "crypto";

const ADMIN_EMAILS = ["hbk19403@gmail.com", "testcashcall@cashcall.io"];

export async function POST(req: NextRequest) {
  // 1. Auth check
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || !ADMIN_EMAILS.includes(user.email ?? "")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  const { requestId, note } = await req.json();
  if (!requestId) return NextResponse.json({ error: "requestId required" }, { status: 400 });

  const admin = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  // 2. Fetch the access request
  const { data: request, error: fetchErr } = await admin
    .from("access_requests")
    .select("*")
    .eq("id", requestId)
    .single();

  if (fetchErr || !request) {
    return NextResponse.json({ error: "Request not found" }, { status: 404 });
  }
  if (request.status !== "pending") {
    return NextResponse.json({ error: "Request already reviewed" }, { status: 400 });
  }

  // 3. Generate invite key
  const key = randomBytes(12).toString("hex");
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + 30); // 30-day trial

  // 4. Insert into trial_invites
  const { error: inviteErr } = await admin.from("trial_invites").insert({
    key,
    label: `${request.restaurant_name || request.name || request.email} — Access Request`,
    email: request.email,
    expires_at: expiresAt.toISOString(),
  });

  if (inviteErr) {
    return NextResponse.json({ error: inviteErr.message }, { status: 500 });
  }

  // 5. Mark request as approved
  await admin
    .from("access_requests")
    .update({ status: "approved", reviewed_at: new Date().toISOString(), invite_key: key, notes: note ?? null })
    .eq("id", requestId);

  // 6. Send invite email to the requester
  const resendKey = process.env.RESEND_API_KEY;
  const displayName = request.name || request.email.split("@")[0];
  const restaurant = request.restaurant_name || "your restaurant";
  const acceptUrl = `https://cashcall.io/trial?key=${key}`;

  if (resendKey) {
    const html = `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><title>Your CashCall Invite</title></head>
<body style="margin:0;padding:0;background:#0a0e1a;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <div style="max-width:580px;margin:32px auto;background:#0f1524;border-radius:24px;overflow:hidden;border:1px solid rgba(0,212,168,0.2);">
    <div style="background:linear-gradient(135deg,#060b18,#0d1a2e);padding:40px 44px 32px;border-bottom:1px solid rgba(0,212,168,0.12);">
      <p style="margin:0 0 16px;font-size:28px;font-weight:900;color:#00d4a8;letter-spacing:-1px;">⚡ CashCall</p>
      <h1 style="margin:0 0 10px;font-size:24px;font-weight:800;color:#ffffff;line-height:1.25;">You're in, ${displayName}! 🎉</h1>
      <p style="margin:0;font-size:15px;color:rgba(255,255,255,0.5);line-height:1.6;">Your CashCall trial access for <strong style="color:rgba(255,255,255,0.8);">${restaurant}</strong> is ready.</p>
    </div>
    <div style="padding:32px 44px;">
      <p style="margin:0 0 24px;font-size:14px;color:rgba(255,255,255,0.55);line-height:1.7;">
        Click the button below to activate your account. Your invite link is valid for 30 days.
      </p>
      <div style="text-align:center;margin-bottom:28px;">
        <a href="${acceptUrl}"
          style="display:inline-block;background:linear-gradient(135deg,#00d4a8,#00b890);color:#030f0b;padding:16px 40px;border-radius:14px;font-size:16px;font-weight:900;text-decoration:none;letter-spacing:-0.2px;">
          Activate My CashCall →
        </a>
      </div>
      <div style="background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.08);border-radius:12px;padding:16px 18px;margin-bottom:24px;">
        <p style="margin:0 0 4px;font-size:11px;font-weight:600;color:rgba(255,255,255,0.3);text-transform:uppercase;letter-spacing:1px;">Your private invite link</p>
        <p style="margin:0;font-size:12px;color:#00d4a8;word-break:break-all;">${acceptUrl}</p>
      </div>
      <div style="background:rgba(0,212,168,0.06);border:1px solid rgba(0,212,168,0.15);border-radius:12px;padding:16px 18px;">
        <p style="margin:0;font-size:13px;color:rgba(255,255,255,0.55);line-height:1.7;">
          🚀 <strong style="color:#00d4a8;">What's next?</strong> Set up your first location, connect your POS, and see your prime cost in under 10 minutes. Reply to this email if you need any help getting started.
        </p>
      </div>
    </div>
    <div style="padding:20px 44px 28px;border-top:1px solid rgba(255,255,255,0.05);">
      <p style="margin:0;font-size:12px;color:rgba(255,255,255,0.2);line-height:1.8;">
        Questions? Reply or email <a href="mailto:contact@cashcall.io" style="color:rgba(0,212,168,0.6);text-decoration:none;">contact@cashcall.io</a><br>
        <a href="https://cashcall.io" style="color:rgba(0,212,168,0.5);text-decoration:none;">cashcall.io</a> · © 2026 CashCall.io
      </p>
    </div>
  </div>
</body>
</html>`;

    await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${resendKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: "CashCall <contact@cashcall.io>",
        to: request.email,
        reply_to: "contact@cashcall.io",
        subject: `⚡ ${displayName}, your CashCall invite is ready — activate now`,
        html,
      }),
    });
  }

  return NextResponse.json({ ok: true, key, acceptUrl });
}
