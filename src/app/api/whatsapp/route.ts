export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createClient as createServiceClient } from "@supabase/supabase-js";

// ── PUT: Inbound WhatsApp reply handler (Twilio webhook) ──────────────────────
// Handles:  STOP  → pause digest for the sender's number
//           INVOICE → reply with their email ingest address
//           RESUME / START → re-enable digest
export async function PUT(req: NextRequest) {
  // Twilio sends form-encoded body for inbound messages
  const text = await req.text();
  const params = new URLSearchParams(text);
  const from    = params.get("From") ?? params.get("from") ?? "";
  const body    = (params.get("Body") ?? params.get("body") ?? "").trim().toUpperCase();

  // Normalise: strip "whatsapp:" prefix and non-digits for lookup
  const phone = from.replace(/^whatsapp:/i, "").replace(/\D/g, "");
  if (!phone) return new NextResponse("OK", { status: 200 });

  const db = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );

  // Look up pref row by normalised phone number
  const { data: pref } = await db
    .from("notification_prefs")
    .select("user_id, whatsapp_number, whatsapp_provider, digest_enabled")
    .or(`whatsapp_number.eq.${phone},whatsapp_number.eq.+${phone},whatsapp_number.eq.${from}`)
    .maybeSingle();

  const twimlReply = (msg: string) =>
    new NextResponse(
      `<?xml version="1.0" encoding="UTF-8"?><Response><Message>${msg}</Message></Response>`,
      { status: 200, headers: { "Content-Type": "text/xml" } }
    );

  if (!pref) {
    // Unknown number — ignore silently (Twilio expects 200)
    return new NextResponse("OK", { status: 200 });
  }

  if (body === "STOP" || body === "PAUSE") {
    await db.from("notification_prefs")
      .update({ digest_enabled: false })
      .eq("user_id", pref.user_id);
    return twimlReply("⚡ CashCall digest paused. Reply START to resume anytime.");
  }

  if (body === "START" || body === "RESUME" || body === "UNSTOP") {
    await db.from("notification_prefs")
      .update({ digest_enabled: true })
      .eq("user_id", pref.user_id);
    return twimlReply("⚡ CashCall digest resumed. You'll get your brief every morning.");
  }

  if (body === "INVOICE" || body === "INVOICES") {
    // Fetch their primary location's email ingest address
    const { data: emailAddr } = await db
      .from("invoice_email_addresses")
      .select("email_slug, locations!inner(user_id)")
      .eq("locations.user_id", pref.user_id)
      .maybeSingle();

    const ingestEmail = emailAddr?.email_slug
      ? `${emailAddr.email_slug}@invoices.cashcall.io`
      : "ingest@cashcall.io";

    return twimlReply(
      `📧 Forward your invoice to:\n${ingestEmail}\n\nCashCall will auto-process it and add it to tonight's digest. 🧾`
    );
  }

  // Unrecognised reply — send help
  return twimlReply(
    "⚡ CashCall commands:\nINVOICE — get your email ingest address\nSTOP — pause digest\nSTART — resume digest"
  );
}

/** Send via Twilio WhatsApp */
async function sendViaTwilio(to: string, body: string) {
  const accountSid = process.env.TWILIO_ACCOUNT_SID!;
  const authToken  = process.env.TWILIO_AUTH_TOKEN!;
  const from       = process.env.TWILIO_WHATSAPP_FROM!;

  const toFormatted = to.startsWith("whatsapp:") ? to : `whatsapp:${to}`;
  const res = await fetch(
    `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`,
    {
      method: "POST",
      headers: {
        Authorization: "Basic " + Buffer.from(`${accountSid}:${authToken}`).toString("base64"),
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({ To: toFormatted, From: from, Body: body }).toString(),
    }
  );
  const data = await res.json();
  if (!res.ok) throw new Error(data.message ?? "Twilio error");
  return data.sid;
}

/** Send via Meta WhatsApp Business API */
async function sendViaMeta(to: string, body: string) {
  const token   = process.env.META_WHATSAPP_TOKEN!;
  const phoneId = process.env.META_WHATSAPP_PHONE_ID!;

  const phone = to.replace(/\D/g, "");
  const res = await fetch(
    `https://graph.facebook.com/v18.0/${phoneId}/messages`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to: phone,
        type: "text",
        text: { body },
      }),
    }
  );
  const data = await res.json();
  if (!res.ok) throw new Error(JSON.stringify(data.error ?? data));
  return data.messages?.[0]?.id;
}

/** Send email digest via Resend */
async function sendViaEmail(to: string, digestText: string, date: string) {
  const key = process.env.RESEND_API_KEY;
  if (!key) throw new Error("RESEND_API_KEY not configured");

  // Convert markdown-ish digest to clean HTML
  const lines = digestText.split("\n");
  const htmlLines = lines.map(line => {
    // Bold: *text* → <strong>text</strong>
    line = line.replace(/\*([^*]+)\*/g, "<strong>$1</strong>");
    // Emoji lines
    if (line.trim() === "") return "<br/>";
    return `<p style="margin:4px 0;font-size:15px;color:#1a1a1a;">${line}</p>`;
  }).join("\n");

  const html = `<!DOCTYPE html>
<html>
<body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#f4f4f5;margin:0;padding:24px;">
  <div style="max-width:520px;margin:auto;background:white;border-radius:16px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08);">
    <div style="background:linear-gradient(135deg,#00c49a,#00a07a);padding:24px 28px;">
      <div style="font-size:22px;font-weight:700;color:white;letter-spacing:-0.5px;">⚡ CashCall</div>
      <div style="font-size:13px;color:rgba(255,255,255,0.85);margin-top:4px;">Daily Digest · ${date}</div>
    </div>
    <div style="padding:24px 28px;">
      ${htmlLines}
    </div>
    <div style="padding:16px 28px;border-top:1px solid #f0f0f0;background:#fafafa;">
      <p style="margin:0;font-size:12px;color:#999;">
        Manage digest settings at <a href="https://cashcall.io/settings/notifications" style="color:#00c49a;">cashcall.io/settings/notifications</a>
      </p>
    </div>
  </div>
</body>
</html>`;

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: "CashCall <ingest@cashcall.io>",
      reply_to: "ingest@cashcall.io",
      to,
      subject: `⚡ CashCall Daily Brief — ${date}`,
      html,
    }),
  });

  const data = await res.json();
  if (!res.ok) throw new Error(data.message ?? JSON.stringify(data));
  return data.id;
}

/** POST: Send a single message (manual) */
export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { to, message, provider } = await req.json();
    if (!to || !message) return NextResponse.json({ error: "to and message required" }, { status: 400 });

    let msgId: string;
    if (provider === "email") {
      msgId = await sendViaEmail(to, message, new Date().toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" }));
    } else if (provider === "meta") {
      msgId = await sendViaMeta(to, message);
    } else {
      msgId = await sendViaTwilio(to, message);
    }

    return NextResponse.json({ success: true, msgId });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Send failed";
    console.error("Digest send error:", err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

/** GET: Cron — generate + send the daily digest to every user who switched it on.
 *  ?dry_run=1 builds the digests and reports what would be sent, without sending.
 *  With dry_run, ?user_id=<id> previews one user who has not set up notifications yet. */
export async function GET(req: NextRequest) {
  // Vercel cron sends: Authorization: Bearer <CRON_SECRET>
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const dryRun = req.nextUrl.searchParams.get("dry_run") === "1";
  const previewUser = dryRun ? req.nextUrl.searchParams.get("user_id") : null;

  // A cron has no login session, so read preferences with the service role.
  const db = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );
  const dateLabel = new Date().toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });

  const { data: savedPrefs, error: prefsErr } = await db
    .from("notification_prefs")
    .select("user_id, digest_email, whatsapp_number, whatsapp_provider, digest_enabled")
    .eq("digest_enabled", true);
  if (prefsErr) return NextResponse.json({ error: `notification_prefs: ${prefsErr.message}` }, { status: 500 });

  const prefs = previewUser
    ? [{ user_id: previewUser, digest_email: "(preview)", whatsapp_number: null as string | null, whatsapp_provider: null as string | null }]
    : (savedPrefs ?? []);

  const results: Array<{ user_id: string; status: string; error?: string; preview?: string }> = [];
  for (const pref of prefs) {
    try {
      // Generate digest text from this same deployment
      const digestRes = await fetch(
        `${req.nextUrl.origin}/api/digest?user_id=${pref.user_id}`,
        { headers: { "x-cron-key": secret } }
      );
      if (!digestRes.ok) throw new Error(`digest request failed (${digestRes.status})`);
      const { digest } = await digestRes.json();
      if (!digest) throw new Error("Empty digest");

      if (dryRun) {
        results.push({ user_id: pref.user_id, status: "dry run", preview: String(digest).slice(0, 240) });
        continue;
      }

      // Each channel is tried on its own, so a WhatsApp failure does not hide a delivered email.
      const sent: string[] = [];
      const failed: string[] = [];

      if (pref.digest_email) {
        try { await sendViaEmail(pref.digest_email, digest, dateLabel); sent.push("email"); }
        catch (e) { failed.push(`email: ${String(e)}`); }
      }

      if (pref.whatsapp_number) {
        try {
          if (pref.whatsapp_provider === "meta") {
            await sendViaMeta(pref.whatsapp_number, digest); sent.push("whatsapp");
          } else if (process.env.TWILIO_ACCOUNT_SID) {
            await sendViaTwilio(pref.whatsapp_number, digest); sent.push("whatsapp");
          } else {
            failed.push("whatsapp: no WhatsApp provider configured");
          }
        } catch (e) { failed.push(`whatsapp: ${String(e)}`); }
      }

      results.push({
        user_id: pref.user_id,
        status: sent.length ? `sent (${sent.join(", ")})` : failed.length ? "failed" : "skipped — no channel",
        error: failed.length ? failed.join("; ") : undefined,
      });
    } catch (e) {
      results.push({ user_id: pref.user_id, status: "failed", error: String(e) });
    }
  }

  return NextResponse.json({ processed: results.length, results });
}
