export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";

const ADMIN_EMAIL = "hbk19403@gmail.com";

export async function POST(req: NextRequest) {
  try {
    const { name, email, restaurantName, locations, attribution } = await req.json();

    if (!email || !email.includes("@")) {
      return NextResponse.json({ error: "Valid email address required." }, { status: 400 });
    }

    const resendKey = process.env.RESEND_API_KEY;
    if (!resendKey) {
      console.error("[trial/request] RESEND_API_KEY not configured");
      return NextResponse.json({ error: "Email service not configured." }, { status: 500 });
    }

    const displayName = name || email.split("@")[0];
    const restaurant = restaurantName || "Not specified";
    const loc = locations || "1";
    const requestedAt = new Date().toLocaleString("en-US", { timeZone: "America/New_York", dateStyle: "medium", timeStyle: "short" });

    // ── Save to access_requests table ───────────────────────────────────────────
    try {
      const { createClient: createServiceClient } = await import("@supabase/supabase-js");
      const admin = createServiceClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!
      );
      const lead = {
        name: displayName,
        email,
        restaurant_name: restaurant,
        locations: loc,
        status: "pending",
      };
      // Where the lead came from (UTM tags captured on arrival). Optional and length-capped.
      const a = attribution && typeof attribution === "object" ? (attribution as Record<string, unknown>) : {};
      const cap = (v: unknown, max: number) => (typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null);
      const source = {
        utm_source: cap(a.utm_source, 120),
        utm_medium: cap(a.utm_medium, 120),
        utm_campaign: cap(a.utm_campaign, 120),
        utm_content: cap(a.utm_content, 120),
        referrer: cap(a.referrer, 300),
        landing_path: cap(a.landing_path, 120),
      };
      const { error: withSourceErr } = await admin.from("access_requests").insert({ ...lead, ...source });
      if (withSourceErr) {
        // Source columns may not exist yet: never lose the lead over it.
        const { error: plainErr } = await admin.from("access_requests").insert(lead);
        if (plainErr) console.error("[trial/request] DB insert failed:", plainErr.message);
      }
    } catch (dbErr) {
      // Non-fatal — email still goes out
      console.error("[trial/request] DB insert failed:", dbErr);
    }

    // ── Email to admin ──────────────────────────────────────────────────────────
    const adminHtml = `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><title>New Trial Access Request</title></head>
<body style="margin:0;padding:0;background:#0a0e1a;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <div style="max-width:560px;margin:32px auto;background:#0f1524;border-radius:20px;overflow:hidden;border:1px solid rgba(0,212,168,0.2);">
    <div style="background:rgba(0,212,168,0.08);padding:28px 36px;border-bottom:1px solid rgba(0,212,168,0.15);">
      <p style="margin:0 0 6px;font-size:11px;font-weight:700;color:#00d4a8;letter-spacing:1.5px;text-transform:uppercase;">New Request</p>
      <h1 style="margin:0;font-size:22px;font-weight:800;color:#ffffff;">Trial Access Request</h1>
      <p style="margin:8px 0 0;font-size:13px;color:rgba(255,255,255,0.4);">${requestedAt} ET</p>
    </div>
    <div style="padding:28px 36px;">
      <table style="width:100%;border-collapse:collapse;">
        ${[
          ["Name", displayName],
          ["Email", email],
          ["Restaurant", restaurant],
          ["Locations", loc],
        ].map(([label, value]) => `
        <tr>
          <td style="padding:10px 0;border-bottom:1px solid rgba(255,255,255,0.06);width:120px;">
            <span style="font-size:12px;font-weight:600;color:rgba(255,255,255,0.4);text-transform:uppercase;letter-spacing:0.5px;">${label}</span>
          </td>
          <td style="padding:10px 0;border-bottom:1px solid rgba(255,255,255,0.06);">
            <span style="font-size:14px;color:#ffffff;">${value}</span>
          </td>
        </tr>`).join("")}
      </table>
      <div style="margin-top:24px;text-align:center;">
        <a href="https://cashcall.io/admin/clients"
          style="display:inline-block;background:linear-gradient(135deg,#00d4a8,#00b890);color:#030f0b;padding:14px 32px;border-radius:12px;font-size:14px;font-weight:800;text-decoration:none;">
          Send Invite from Admin →
        </a>
      </div>
    </div>
  </div>
</body>
</html>`;

    // ── Confirmation email to requester ─────────────────────────────────────────
    const requesterHtml = `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><title>We got your request!</title></head>
<body style="margin:0;padding:0;background:#0a0e1a;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <div style="max-width:580px;margin:32px auto;background:#0f1524;border-radius:24px;overflow:hidden;border:1px solid rgba(255,255,255,0.07);">
    <div style="background:linear-gradient(135deg,#060b18,#0d1a2e);padding:40px 44px 32px;border-bottom:1px solid rgba(0,212,168,0.12);">
      <p style="margin:0 0 16px;font-size:28px;font-weight:900;color:#00d4a8;letter-spacing:-1px;">⚡ CashCall</p>
      <h1 style="margin:0 0 10px;font-size:24px;font-weight:800;color:#ffffff;line-height:1.25;">We got your request, ${displayName}!</h1>
      <p style="margin:0;font-size:15px;color:rgba(255,255,255,0.5);line-height:1.6;">You'll receive a personal invite link within <strong style="color:rgba(255,255,255,0.75);">24 hours</strong>.</p>
    </div>
    <div style="padding:32px 44px;">
      <div style="background:rgba(0,212,168,0.06);border:1px solid rgba(0,212,168,0.15);border-radius:14px;padding:18px 20px;margin-bottom:24px;">
        <p style="margin:0;font-size:13px;color:rgba(255,255,255,0.6);line-height:1.7;">
          ⏰ <strong style="color:#00d4a8;">Why invite-only?</strong> We personally onboard every restaurant owner to make sure you see real results in your first week. No generic setup — you'll talk to someone who understands your numbers.
        </p>
      </div>
      <p style="margin:0 0 16px;font-size:13px;font-weight:600;color:rgba(255,255,255,0.4);text-transform:uppercase;letter-spacing:1px;">While you wait</p>
      <div style="space-y:10px;">
        <a href="https://cashcall.io/sandbox" style="display:block;padding:14px 18px;margin-bottom:10px;background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.08);border-radius:12px;text-decoration:none;">
          <span style="font-size:15px;font-weight:700;color:#00d4a8;">⚡ Try the Live Sandbox</span>
          <p style="margin:4px 0 0;font-size:12px;color:rgba(255,255,255,0.4);">See a real restaurant dashboard — prime cost, invoice alerts, P&amp;L — no login needed.</p>
        </a>
        <a href="https://cashcall.io" style="display:block;padding:14px 18px;background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.08);border-radius:12px;text-decoration:none;">
          <span style="font-size:15px;font-weight:700;color:rgba(255,255,255,0.8);">📊 Learn How CashCall Works</span>
          <p style="margin:4px 0 0;font-size:12px;color:rgba(255,255,255,0.4);">ROI calculator, features, and how much margin you're losing today.</p>
        </a>
      </div>
    </div>
    <div style="padding:20px 44px 28px;border-top:1px solid rgba(255,255,255,0.05);">
      <p style="margin:0;font-size:12px;color:rgba(255,255,255,0.2);line-height:1.8;">
        Questions? Reply to this email or reach us at <a href="mailto:hello@cashcall.io" style="color:rgba(0,212,168,0.6);text-decoration:none;">hello@cashcall.io</a><br>
        <a href="https://cashcall.io" style="color:rgba(0,212,168,0.5);text-decoration:none;">cashcall.io</a> · © 2026 CashCall.io by SSV Group
      </p>
    </div>
  </div>
</body>
</html>`;

    // Send both emails concurrently
    const [adminRes, requesterRes] = await Promise.all([
      fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${resendKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          from: "CashCall <contact@cashcall.io>",
          to: ADMIN_EMAIL,
          reply_to: email,
          subject: `🚀 New trial request: ${displayName} — ${restaurant} (${loc} location${loc === "1" ? "" : "s"})`,
          html: adminHtml,
        }),
      }),
      fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${resendKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          from: "CashCall <contact@cashcall.io>",
          to: email,
          reply_to: "contact@cashcall.io",
          subject: `⚡ ${displayName}, we got your CashCall request — invite coming within 24 hours`,
          html: requesterHtml,
        }),
      }),
    ]);

    if (!adminRes.ok) {
      const err = await adminRes.json().catch(() => ({}));
      console.error("[trial/request] Admin email failed:", err);
    }
    if (!requesterRes.ok) {
      const err = await requesterRes.json().catch(() => ({}));
      console.error("[trial/request] Requester email failed:", err);
    }

    // Return success even if one email failed — request is received
    return NextResponse.json({ ok: true });

  } catch (err: unknown) {
    console.error("[trial/request] Error:", err);
    return NextResponse.json({ error: "Something went wrong. Please email hello@cashcall.io" }, { status: 500 });
  }
}
