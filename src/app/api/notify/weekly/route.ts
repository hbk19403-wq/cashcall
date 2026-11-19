export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createClient as createServiceClient } from "@supabase/supabase-js";

const TARGETS = { food: 28, labor: 30, infra: 19, gross: 22 };

async function sendEmail(to: string, subject: string, html: string) {
  const key = process.env.RESEND_API_KEY;
  if (!key) return { error: "RESEND_API_KEY not set" };
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
    body: JSON.stringify({
      from: "CashCall <briefs@cashcall.io>",
      to,
      subject,
      html,
    }),
  });
  return res.json();
}

function buildEmailHtml(locationName: string, alerts: string[], outliers: string[]): string {
  const alertRows = alerts.map(a => `<li style="margin:4px 0;color:#b91c1c;">${a}</li>`).join("");
  const outlierRows = outliers.map(o => `<li style="margin:4px 0;color:#92400e;">${o}</li>`).join("");
  return `
<!DOCTYPE html>
<html>
<body style="font-family:sans-serif;max-width:600px;margin:auto;padding:24px;background:#f9fafb;">
  <div style="background:white;border-radius:16px;padding:24px;border:1px solid #e5e7eb;">
    <h2 style="color:#111827;margin-top:0;">📊 Weekly Cost Alert — ${locationName}</h2>
    <p style="color:#6b7280;font-size:14px;">This is your weekly cost monitoring report from CashCall.</p>

    ${alerts.length > 0 ? `
    <div style="background:#fef2f2;border:1px solid #fecaca;border-radius:12px;padding:16px;margin:16px 0;">
      <h3 style="color:#b91c1c;margin-top:0;">⚠️ Margin Alerts</h3>
      <ul style="margin:0;padding-left:20px;">${alertRows}</ul>
    </div>` : `
    <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:12px;padding:16px;margin:16px 0;">
      <p style="color:#166534;margin:0;">✅ All margins within target for this week.</p>
    </div>`}

    ${outliers.length > 0 ? `
    <div style="background:#fffbeb;border:1px solid #fde68a;border-radius:12px;padding:16px;margin:16px 0;">
      <h3 style="color:#92400e;margin-top:0;">📈 Price Increases</h3>
      <ul style="margin:0;padding-left:20px;">${outlierRows}</ul>
    </div>` : ""}

    <div style="margin-top:24px;padding-top:16px;border-top:1px solid #e5e7eb;">
      <p style="color:#9ca3af;font-size:12px;margin:0;">
        Targets: Food ≤${TARGETS.food}% · Labor ≤${TARGETS.labor}% · Infra ≤${TARGETS.infra}% · Net ≥${TARGETS.gross}%<br/>
        <a href="https://cashcall.io/analytics" style="color:#00d4a8;">View full analytics →</a>
      </p>
    </div>
  </div>
</body>
</html>`;
}

export async function POST(req: Request) {
  // Security: require CRON_SECRET header (cron jobs) or authenticated user
  const authHeader = (req as Request & { headers: Headers }).headers.get("authorization");
  const cronKey = (req as Request & { headers: Headers }).headers.get("x-cron-key");
  const secret = process.env.CRON_SECRET;
  const isValidCron = !!secret && (authHeader === `Bearer ${secret}` || cronKey === secret);

  const session = await createClient();
  const { data: { user } } = await session.auth.getUser();

  if (!user && !isValidCron) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // A cron has no login session, so it reads with the service role; a signed-in user reads as themselves.
  const supabase = isValidCron && !user
    ? createServiceClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } })
    : session;

  // ?dry_run=1 works out every alert and reports what would be sent, without sending.
  const dryRun = new URL(req.url).searchParams.get("dry_run") === "1";

  try {
    const now = new Date();
    const monthDate = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
    const nextDate = new Date(now.getFullYear(), now.getMonth() + 1, 1).toISOString().slice(0, 10);
    // Weekly window: last 7 days
    const weekAgo = new Date(now); weekAgo.setDate(weekAgo.getDate() - 7);
    const weekAgoStr = weekAgo.toISOString().slice(0, 10);

    // Load users with notification prefs (correct table: notification_prefs)
    const { data: settings, error: settingsErr } = await supabase
      .from("notification_prefs")
      .select("user_id, digest_email, whatsapp_number")
      .eq("digest_enabled", true)
      .or("digest_email.not.is.null,whatsapp_number.not.is.null");
    if (settingsErr) throw new Error(`notification_prefs: ${settingsErr.message}`);
    if (!settings?.length) return NextResponse.json({ message: "No notification settings configured." });

    const results: string[] = [];

    for (const s of settings) {
      if (!s.digest_email && !s.whatsapp_number) continue;

      // Get this user's locations
      const { data: userLocs } = await supabase
        .from("locations")
        .select("id,name")
        .eq("user_id", s.user_id)
        .eq("app", "cashcall")
        .order("name");

      for (const loc of (userLocs ?? [])) {
      const locationName = loc.name;
      const s_location_id = loc.id;

      // Alert thresholds are set per location; fall back to the defaults when none are saved.
      const { data: thresholds } = await supabase.from("location_notification_settings")
        .select("notify_food_pct_threshold,notify_price_increase_pct")
        .eq("location_id", s_location_id).maybeSingle();
      const foodThreshold  = Number(thresholds?.notify_food_pct_threshold ?? TARGETS.food);
      const priceThreshold = Number(thresholds?.notify_price_increase_pct ?? 10);

      // Get food cost for this month so far
      const { data: food } = await supabase.from("food_deliveries")
        .select("amount").eq("location_id", s_location_id)
        .gte("delivery_date", monthDate).lt("delivery_date", nextDate);
      const foodCost = (food ?? []).reduce((sum, r) => sum + Number(r.amount), 0);

      // Get sales for this month (correct columns)
      const { data: sales } = await supabase.from("daily_sales")
        .select("cash_sales,pos_sales,liquor_sales,uber_eats_gross,grubhub_gross,doordash_gross,catering_sales,aggregator_commission")
        .eq("location_id", s_location_id)
        .gte("sale_date", monthDate).lt("sale_date", nextDate);
      const totalSales = (sales ?? []).reduce((sum, r) => {
        const aggNet = (Number(r.uber_eats_gross||0) + Number(r.grubhub_gross||0) + Number(r.doordash_gross||0)) - Number(r.aggregator_commission||0);
        return sum + Number(r.cash_sales||0) + Number(r.pos_sales||0) + Number(r.liquor_sales||0) + aggNet + Number(r.catering_sales||0);
      }, 0);

      const foodPct = totalSales > 0 ? (foodCost / totalSales) * 100 : 0;

      // Price outliers from last 7 days
      const { data: recentDeliveries } = await supabase.from("food_deliveries")
        .select("id,vendor").eq("location_id", s_location_id)
        .gte("delivery_date", weekAgoStr);
      const recentIds = (recentDeliveries ?? []).map(d => d.id);
      const vendorMap = Object.fromEntries((recentDeliveries ?? []).map(d => [d.id, d.vendor]));

      const recentItems: { name: string; unit_price: number; food_delivery_id: string }[] = [];
      if (recentIds.length) {
        const { data: items } = await supabase.from("invoice_line_items")
          .select("name,unit_price,food_delivery_id").in("food_delivery_id", recentIds)
          .not("unit_price", "is", null);
        recentItems.push(...(items ?? []) as any);
      }

      // Historical averages (last 6 months, excluding current month)
      const sixAgo = new Date(now); sixAgo.setMonth(sixAgo.getMonth() - 6);
      const { data: histDeliveries } = await supabase.from("food_deliveries")
        .select("id").eq("location_id", s_location_id)
        .gte("delivery_date", sixAgo.toISOString().slice(0, 10))
        .lt("delivery_date", monthDate);
      const histIds = (histDeliveries ?? []).map(d => d.id);

      const histMap: Record<string, number[]> = {};
      if (histIds.length) {
        const { data: histItems } = await supabase.from("invoice_line_items")
          .select("name,unit_price").in("food_delivery_id", histIds).not("unit_price", "is", null);
        for (const h of (histItems ?? [])) {
          const key = h.name.toLowerCase().trim();
          (histMap[key] ??= []).push(Number(h.unit_price));
        }
      }

      const priceOutliers: string[] = [];
      for (const item of recentItems) {
        if (!item.unit_price) continue;
        const key = item.name.toLowerCase().trim();
        const hist = histMap[key];
        if (!hist?.length) continue;
        const avg = hist.reduce((sv, v) => sv + v, 0) / hist.length;
        const pct = ((Number(item.unit_price) - avg) / avg) * 100;
        if (pct >= priceThreshold) {
          priceOutliers.push(
            `${item.name}: $${Number(item.unit_price).toFixed(2)}/unit (avg $${avg.toFixed(2)}, ▲${pct.toFixed(1)}%) from ${vendorMap[item.food_delivery_id] ?? "vendor"}`
          );
        }
      }

      // Build margin alerts
      const alerts: string[] = [];
      if (foodPct > foodThreshold) {
        alerts.push(`Food cost: ${foodPct.toFixed(1)}% (target ≤${foodThreshold}%) — $${foodCost.toFixed(0)} on $${totalSales.toFixed(0)} sales`);
      }

      if (!alerts.length && !priceOutliers.length) {
        results.push(`${locationName}: No alerts.`);
        continue;
      }

      if (dryRun) {
        results.push(`[dry run] ${locationName}: ${alerts.length} margin alert(s), ${priceOutliers.length} price increase(s)`);
        continue;
      }

      // Send email (correct field: digest_email)
      if (s.digest_email) {
        const subject = `[CashCall Alert] ${locationName} — ${alerts.length} cost alert${alerts.length !== 1 ? "s" : ""} this week`;
        await sendEmail(s.digest_email, subject, buildEmailHtml(locationName, alerts, priceOutliers));
        results.push(`${locationName}: Email sent to ${s.digest_email}`);
      }

      // WhatsApp/SMS via Twilio (correct field: whatsapp_number)
      if (s.whatsapp_number && process.env.TWILIO_ACCOUNT_SID) {
        const twilioAuth = Buffer.from(`${process.env.TWILIO_ACCOUNT_SID}:${process.env.TWILIO_AUTH_TOKEN}`).toString("base64");
        const msgLines = [
          `[CashCall] ${locationName} cost alert:`,
          ...alerts.map(a => `• ${a}`),
          ...priceOutliers.slice(0, 3).map(o => `• ${o}`),
        ].join("\n");
        await fetch(`https://api.twilio.com/2010-04-01/Accounts/${process.env.TWILIO_ACCOUNT_SID}/Messages.json`, {
          method: "POST",
          headers: { Authorization: `Basic ${twilioAuth}`, "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({ To: s.whatsapp_number, From: process.env.TWILIO_FROM_NUMBER ?? "", Body: msgLines }),
        });
        results.push(`${locationName}: WhatsApp sent to ${s.whatsapp_number}`);
      }
      } // end for loc
    }

    return NextResponse.json({ message: results.join(" · ") || "Done.", sent: results.length });
  } catch (e) {
    console.error("[notify/weekly]", e);
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

// GET — Vercel cron calls with GET and the cron secret, which runs the weekly alert.
// Without the secret this is only a health check.
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.get("authorization") === `Bearer ${secret}`) return POST(req);
  return NextResponse.json({ ok: true, message: "Weekly notify endpoint ready. POST to trigger." });
}
