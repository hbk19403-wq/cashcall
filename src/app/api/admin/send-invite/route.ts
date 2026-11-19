export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createClient as createServiceClient } from "@supabase/supabase-js";

const ADMIN_EMAILS = ["hbk19403@gmail.com", "testcashcall@cashcall.io"];

function generateKey(length = 16) {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  return Array.from({ length }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
}

export async function POST(req: NextRequest) {
  // ── Auth check ──────────────────────────────────────────────────────────────
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || !ADMIN_EMAILS.includes(user.email ?? "")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  const { email, label, existingKey } = await req.json();
  if (!email || !email.includes("@")) {
    return NextResponse.json({ error: "Valid email required" }, { status: 400 });
  }

  // ── Service-role client ──────────────────────────────────────────────────────
  const admin = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  // ── Create or reuse invite key ───────────────────────────────────────────────
  let inviteKey = existingKey as string | undefined;
  let inviteId: string | undefined;

  if (!inviteKey) {
    inviteKey = generateKey();
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
    const { data: inv, error: invErr } = await admin
      .from("trial_invites")
      .insert({ key: inviteKey, label: label || email, email, expires_at: expiresAt })
      .select("id")
      .single();
    if (invErr) return NextResponse.json({ error: invErr.message }, { status: 500 });
    inviteId = inv.id;
  } else {
    // Update email on existing invite if different
    await admin.from("trial_invites").update({ email }).eq("key", existingKey);
  }

  const inviteUrl = `https://cashcall.io/trial?key=${inviteKey}`;

  // ── Resend API key check ─────────────────────────────────────────────────────
  const resendKey = process.env.RESEND_API_KEY;
  if (!resendKey) {
    return NextResponse.json({ error: "Email service not configured (RESEND_API_KEY missing)" }, { status: 500 });
  }

  // ── Build email HTML ─────────────────────────────────────────────────────────
  const recipientName = label || email.split("@")[0];

  const html = `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Your CashCall Invite</title></head>
<body style="margin:0;padding:0;background:#0a0e1a;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">

  <div style="max-width:620px;margin:32px auto;background:#0f1524;border-radius:24px;overflow:hidden;box-shadow:0 20px 60px rgba(0,0,0,0.5);border:1px solid rgba(255,255,255,0.07);">

    <!-- Header -->
    <div style="background:linear-gradient(135deg,#060b18 0%,#0d1a2e 60%,#0a1628 100%);padding:40px 44px 32px;border-bottom:1px solid rgba(0,212,168,0.15);">
      <div style="margin-bottom:20px;">
        <span style="font-size:28px;font-weight:900;color:#00d4a8;letter-spacing:-1px;">⚡ CashCall</span>
      </div>
      <h1 style="margin:0 0 8px;font-size:26px;font-weight:800;color:#ffffff;line-height:1.25;letter-spacing:-0.3px;">
        Stop guessing. Start knowing<br>exactly where your money goes.
      </h1>
      <p style="margin:12px 0 0;font-size:15px;color:rgba(255,255,255,0.5);line-height:1.6;">
        Hi <strong style="color:rgba(255,255,255,0.8);">${recipientName}</strong> — you've been personally invited to CashCall,<br>
        the financial operating system built for restaurant owners.
      </p>
    </div>

    <!-- Pain section -->
    <div style="padding:32px 44px 0;background:#0f1524;">
      <p style="margin:0 0 6px;font-size:11px;font-weight:700;color:#e8b84b;letter-spacing:1.5px;text-transform:uppercase;">THE REAL PROBLEM</p>
      <h2 style="margin:0 0 20px;font-size:20px;font-weight:700;color:#ffffff;line-height:1.35;">
        Most restaurant owners find out they're losing money<br>when it's already too late.
      </h2>
      <div style="display:grid;gap:10px;margin-bottom:0;">
        ${[
          ["❌", "You finish a busy Saturday and have no idea if you made or lost money"],
          ["❌", "Your food cost crept up 4% last month — you didn't notice until the bank statement"],
          ["❌", "You're paying your POS, payroll, and accounting software — and still entering numbers by hand"],
          ["❌", "One vendor quietly raised chicken prices 18% — you're still buying at the old rate"],
          ["❌", "You know something's bleeding margin but you can't pinpoint exactly where"],
        ].map(([icon, text]) => `
        <div style="display:flex;gap:12px;align-items:flex-start;padding:10px 14px;background:rgba(255,59,48,0.07);border-radius:10px;border-left:3px solid rgba(255,59,48,0.4);">
          <span style="font-size:14px;margin-top:1px;flex-shrink:0;">${icon}</span>
          <span style="font-size:13px;color:rgba(255,255,255,0.65);line-height:1.55;">${text}</span>
        </div>`).join("")}
      </div>
    </div>

    <!-- Divider with label -->
    <div style="padding:28px 44px;text-align:center;">
      <div style="height:1px;background:linear-gradient(90deg,transparent,rgba(0,212,168,0.3),transparent);margin-bottom:20px;"></div>
      <span style="font-size:11px;font-weight:700;color:#00d4a8;letter-spacing:2px;text-transform:uppercase;">CashCall fixes all of this</span>
      <div style="height:1px;background:linear-gradient(90deg,transparent,rgba(0,212,168,0.3),transparent);margin-top:20px;"></div>
    </div>

    <!-- Features grid -->
    <div style="padding:0 44px 32px;">

      <!-- Feature 1: Daily WhatsApp Snapshot -->
      <div style="background:rgba(0,212,168,0.06);border:1px solid rgba(0,212,168,0.15);border-radius:16px;padding:20px 22px;margin-bottom:14px;">
        <div style="display:flex;align-items:center;gap:10px;margin-bottom:10px;">
          <span style="font-size:22px;">📲</span>
          <strong style="font-size:15px;color:#00d4a8;">Daily WhatsApp Snapshot — every morning, without lifting a finger</strong>
        </div>
        <p style="margin:0 0 10px;font-size:13px;color:rgba(255,255,255,0.6);line-height:1.6;">
          Before your first coffee, CashCall sends you a WhatsApp message with yesterday's complete financial picture:
        </p>
        <div style="background:rgba(0,0,0,0.3);border-radius:10px;padding:14px 16px;font-size:12.5px;color:rgba(255,255,255,0.8);line-height:1.8;font-family:monospace;">
          📊 <strong>The Corner Table — Yesterday</strong><br>
          💰 Sales: $4,820 &nbsp;&nbsp; 🎯 Target: $4,500 ✅<br>
          🍖 Food Cost: $1,446 (30.0%) — On track<br>
          👥 Labor: $1,012 (21.0%) — On track<br>
          ⚡ Prime Cost: 51.0% — ✅ Healthy<br>
          🏢 Infra &amp; Overheads: $680 (14.1%)<br>
          <strong style="color:#00d4a8;">💵 Net Profit: $682 (14.1%)</strong><br>
          <span style="color:rgba(255,255,255,0.4);font-size:11px;">📌 Beef tenderloin up 12% vs last month — review order</span>
        </div>
      </div>

      <!-- Feature 2: Price Tracker -->
      <div style="background:rgba(232,184,75,0.06);border:1px solid rgba(232,184,75,0.15);border-radius:16px;padding:20px 22px;margin-bottom:14px;">
        <div style="display:flex;align-items:center;gap:10px;margin-bottom:10px;">
          <span style="font-size:22px;">📈</span>
          <strong style="font-size:15px;color:#e8b84b;">Price Intelligence — catch vendor price hikes before they bleed you dry</strong>
        </div>
        <p style="margin:0;font-size:13px;color:rgba(255,255,255,0.6);line-height:1.6;">
          Every invoice you scan is automatically compared against this month, 3-month average, and market benchmarks from Sysco, US Foods &amp; Restaurant Depot. CashCall flags spikes the moment they appear — so you negotiate before you absorb the cost.
        </p>
        <div style="margin-top:12px;display:grid;gap:6px;">
          ${[
            ["Chicken Breast", "$3.42/lb", "$3.10/lb", "▲ +10.3%", "#ff9500"],
            ["Roma Tomatoes", "$1.88/lb", "$2.20/lb", "▼ −14.5%", "#00d4a8"],
            ["Beef Tenderloin", "$18.90/lb", "$16.40/lb", "▲ +15.2%", "#ff3b30"],
          ].map(([item, current, market, diff, color]) => `
          <div style="display:flex;justify-content:space-between;align-items:center;background:rgba(0,0,0,0.25);border-radius:8px;padding:8px 12px;">
            <span style="font-size:12px;color:rgba(255,255,255,0.7);">${item}</span>
            <div style="display:flex;gap:16px;align-items:center;">
              <span style="font-size:12px;color:rgba(255,255,255,0.5);">You: <strong style="color:rgba(255,255,255,0.85);">${current}</strong></span>
              <span style="font-size:12px;color:rgba(255,255,255,0.5);">Market: ${market}</span>
              <span style="font-size:11px;font-weight:700;color:${color};">${diff}</span>
            </div>
          </div>`).join("")}
        </div>
      </div>

      <!-- Feature 3: POS + Payroll -->
      <div style="background:rgba(100,120,255,0.06);border:1px solid rgba(100,120,255,0.15);border-radius:16px;padding:20px 22px;margin-bottom:14px;">
        <div style="display:flex;align-items:center;gap:10px;margin-bottom:10px;">
          <span style="font-size:22px;">🔌</span>
          <strong style="font-size:15px;color:#8b9dff;">Zero Manual Entry — your POS and payroll talk directly to CashCall</strong>
        </div>
        <p style="margin:0 0 12px;font-size:13px;color:rgba(255,255,255,0.6);line-height:1.6;">
          Connect once, then forget about it. Sales pull automatically from your POS. Labor costs pull directly from your payroll system. Your numbers are always current — no spreadsheets, no double-entry, no end-of-month panic.
        </p>
        <div style="display:flex;flex-wrap:wrap;gap:8px;">
          ${["Toast", "Clover", "Square", "Gusto", "ADP", "QuickBooks Payroll"].map(s =>
            `<span style="background:rgba(139,157,255,0.15);border:1px solid rgba(139,157,255,0.25);border-radius:20px;padding:5px 13px;font-size:12px;font-weight:600;color:#8b9dff;">${s}</span>`
          ).join("")}
        </div>
        <p style="margin:12px 0 0;font-size:12px;color:rgba(255,255,255,0.4);">+ AI Invoice Scanner — photograph any vendor bill and it auto-categorizes in seconds.</p>
      </div>

      <!-- Feature 4: Financial Dashboard -->
      <div style="background:rgba(0,180,120,0.06);border:1px solid rgba(0,180,120,0.15);border-radius:16px;padding:20px 22px;margin-bottom:14px;">
        <div style="display:flex;align-items:center;gap:10px;margin-bottom:10px;">
          <span style="font-size:22px;">📊</span>
          <strong style="font-size:15px;color:#00c878;">Full Financial Dashboard — your entire restaurant in one screen</strong>
        </div>
        <div style="display:grid;gap:6px;">
          ${[
            ["Prime Cost Monitor", "Real-time food % + labor % with daily, weekly, monthly breakdowns"],
            ["Cash Position", "Exactly how much you made or lost — updated every night"],
            ["6-Month Analytics", "Revenue trends, margin evolution, quarterly comparisons"],
            ["Budgeting & Forecasting", "Set monthly targets, track variance, project next month based on prior data"],
            ["Multi-Location View", "All your restaurants on one leaderboard — see who's winning, who needs attention"],
          ].map(([title, desc]) => `
          <div style="display:flex;gap:10px;align-items:flex-start;padding:8px 0;border-bottom:1px solid rgba(255,255,255,0.05);">
            <span style="color:#00c878;font-size:13px;margin-top:2px;flex-shrink:0;">✓</span>
            <div>
              <span style="font-size:13px;font-weight:600;color:rgba(255,255,255,0.85);">${title}</span>
              <span style="font-size:12px;color:rgba(255,255,255,0.4);"> — ${desc}</span>
            </div>
          </div>`).join("")}
        </div>
      </div>

      <!-- Feature 5: Bleeding Detection -->
      <div style="background:rgba(255,59,48,0.06);border:1px solid rgba(255,59,48,0.2);border-radius:16px;padding:20px 22px;margin-bottom:14px;">
        <div style="display:flex;align-items:center;gap:10px;margin-bottom:10px;">
          <span style="font-size:22px;">🩺</span>
          <strong style="font-size:15px;color:#ff6b60;">Margin Bleeding Detection — CashCall tells you exactly where you're losing</strong>
        </div>
        <p style="margin:0;font-size:13px;color:rgba(255,255,255,0.6);line-height:1.6;">
          Not just <em>"your food cost is high."</em> CashCall pinpoints the exact hole:
          which category spiked, which vendor raised prices, which shift ran over on labor,
          which location is dragging the portfolio. You get a clear diagnosis — not a spreadsheet to interpret.
        </p>
      </div>

    </div>

    <!-- CTA -->
    <div style="padding:8px 44px 36px;text-align:center;">
      <!-- Trial notice -->
      <div style="background:rgba(232,184,75,0.1);border:1px solid rgba(232,184,75,0.25);border-radius:12px;padding:14px 18px;margin-bottom:24px;text-align:left;">
        <p style="margin:0;font-size:13px;color:rgba(232,184,75,0.9);line-height:1.6;">
          ⏰ <strong>30-day free trial</strong> — full access, no credit card required.
          Everything you set up is yours to keep. After 30 days, reach out to continue. <em>All your data is preserved.</em>
        </p>
      </div>
      <a href="${inviteUrl}"
        style="display:inline-block;background:linear-gradient(135deg,#00d4a8,#00b890);color:#030f0b;padding:18px 48px;border-radius:14px;font-size:18px;font-weight:900;text-decoration:none;letter-spacing:-0.2px;box-shadow:0 8px 32px rgba(0,212,168,0.35);">
        Start My Free Trial →
      </a>
      <p style="margin:14px 0 0;font-size:12px;color:rgba(255,255,255,0.25);">
        Or copy: <a href="${inviteUrl}" style="color:rgba(0,212,168,0.7);">${inviteUrl}</a>
      </p>
    </div>

    <!-- How to start -->
    <div style="padding:0 44px 32px;">
      <div style="height:1px;background:rgba(255,255,255,0.06);margin-bottom:28px;"></div>
      <p style="margin:0 0 16px;font-size:11px;font-weight:700;color:rgba(255,255,255,0.3);letter-spacing:1.5px;text-transform:uppercase;">Getting Started</p>
      <table style="width:100%;border-collapse:collapse;">
        ${[
          ["1", "Click the invite link", "Takes you to cashcall.io/trial — your invite key is pre-loaded."],
          ["2", "Create your account", "Sign up with this email address. Confirm via the link we send you."],
          ["3", "Add your restaurant", "Name, location, and you're in. Takes 60 seconds."],
          ["4", "Connect your tools", "Link your POS and payroll once. CashCall does the rest automatically."],
        ].map(([n, title, desc]) => `
        <tr>
          <td style="width:36px;vertical-align:top;padding:0 14px 18px 0;">
            <div style="width:28px;height:28px;background:rgba(0,212,168,0.15);border:1px solid rgba(0,212,168,0.3);border-radius:50%;text-align:center;line-height:28px;font-size:13px;font-weight:800;color:#00d4a8;">${n}</div>
          </td>
          <td style="padding-bottom:18px;vertical-align:top;">
            <strong style="font-size:14px;color:rgba(255,255,255,0.85);">${title}</strong>
            <p style="margin:4px 0 0;font-size:13px;color:rgba(255,255,255,0.4);line-height:1.5;">${desc}</p>
          </td>
        </tr>`).join("")}
      </table>
    </div>

    <!-- Security -->
    <div style="padding:0 44px 32px;">
      <div style="background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.07);border-radius:14px;padding:20px 22px;">
        <p style="margin:0 0 10px;font-size:13px;font-weight:700;color:rgba(255,255,255,0.6);">🔐 Your data is encrypted, isolated, and never sold.</p>
        <p style="margin:0;font-size:12.5px;color:rgba(255,255,255,0.35);line-height:1.7;">
          AES-256 encryption at rest and in transit · Row-level security (each account is a separate vault) ·
          SOC 2-grade infrastructure (Supabase) · Invite-only access · No third-party data sharing, ever.
          Your invite key <strong style="color:rgba(255,255,255,0.5);">${inviteKey}</strong> is unique to you.
        </p>
      </div>
    </div>

    <!-- Footer -->
    <div style="padding:18px 44px 28px;border-top:1px solid rgba(255,255,255,0.05);">
      <p style="margin:0;font-size:11.5px;color:rgba(255,255,255,0.2);line-height:1.8;">
        Invite key: <strong style="color:rgba(255,255,255,0.35);">${inviteKey}</strong> · Expires in 30 days · Questions? Reply to this email.<br>
        <a href="https://cashcall.io/security" style="color:rgba(0,212,168,0.5);text-decoration:none;">Privacy &amp; Security</a> &nbsp;·&nbsp;
        <a href="https://cashcall.io" style="color:rgba(0,212,168,0.5);text-decoration:none;">cashcall.io</a>
      </p>
    </div>

  </div>

</body>
</html>`;

  // ── Send via Resend (with 15s timeout) ──────────────────────────────────────
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${resendKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: "CashCall <digest@cashcall.io>",   // verified sender
        to: email,
        subject: `⚡ ${recipientName}, your CashCall invite is ready — know your numbers before service tomorrow`,
        html,
      }),
    });

    clearTimeout(timeout);

    if (!res.ok) {
      const errBody = await res.json().catch(() => ({}));
      console.error("[send-invite] Resend error:", errBody);
      return NextResponse.json(
        { error: errBody.message || `Email delivery failed (${res.status})` },
        { status: 500 }
      );
    }

    const resData = await res.json();
    console.log("[send-invite] Sent to", email, "id:", resData.id);

    return NextResponse.json({ ok: true, key: inviteKey, inviteId });

  } catch (err: unknown) {
    clearTimeout(timeout);
    const msg = err instanceof Error
      ? (err.name === "AbortError" ? "Email service timed out. Try again." : err.message)
      : "Unexpected error";
    console.error("[send-invite] fetch error:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
