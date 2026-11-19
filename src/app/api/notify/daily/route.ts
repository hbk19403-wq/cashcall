export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

function createServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  return createClient(url, key);
}

// ── Helpers ──────────────────────────────────────────────────────────────────
const fmtUSD = (n: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n);
const fmtPct = (n: number) => n.toFixed(1) + "%";

function yesterday(): string {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return d.toISOString().slice(0, 10); // YYYY-MM-DD
}

function formatDigestSMS(data: LocationDigest): string {
  const lines = [
    `⚡ CashCall Daily Brief — ${data.locationName}`,
    `📅 ${new Date(data.date + "T00:00:00").toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}`,
    ``,
    `Revenue: ${fmtUSD(data.revenue)}`,
    `Food Cost: ${fmtPct(data.foodPct)}${data.foodPct > 30 ? " ⚠" : " ✓"}`,
    `Labor: ${fmtPct(data.laborPct)}${data.laborPct > 32 ? " ⚠" : " ✓"}`,
    `Prime Cost: ${fmtPct(data.primeCost)}${data.primeCost > 58 ? " ⚠" : " ✓"}`,
    `Est. Net Cash: ${data.estNetCash >= 0 ? "+" : ""}${fmtUSD(data.estNetCash)}`,
  ];

  if (data.alerts.length > 0) {
    lines.push(``, `Alerts:`);
    data.alerts.forEach(a => lines.push(`• ${a}`));
  }

  lines.push(``, `cashcall.io · Reply STOP to unsubscribe`);
  return lines.join("\n");
}

function formatDigestEmail(data: LocationDigest): { subject: string; html: string } {
  const dateStr = new Date(data.date + "T00:00:00").toLocaleDateString("en-US", {
    weekday: "long", month: "long", day: "numeric", year: "numeric"
  });

  const pcColor = data.primeCost > 65 ? "#ef4444" : data.primeCost > 58 ? "#f97316" : "#00d4a8";
  const pcBg = data.primeCost > 65 ? "#fef2f2" : data.primeCost > 58 ? "#fff7ed" : "#ecfdf5";
  const pcStatus = data.primeCost > 65 ? "⚠ CRITICAL" : data.primeCost > 58 ? "⚠ WARNING" : "✓ HEALTHY";

  const subject = `☕ CashCall: ${data.locationName} — ${dateStr} | Prime Cost ${fmtPct(data.primeCost)}`;

  const html = `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#060b18;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <div style="max-width:560px;margin:0 auto;padding:24px 16px;">

    <!-- Header -->
    <div style="text-align:center;margin-bottom:24px;">
      <span style="color:#00d4a8;font-size:24px;font-weight:900;letter-spacing:-0.02em;">⚡ CashCall</span>
      <p style="color:#6b7280;font-size:12px;margin:4px 0 0;">Daily Brief · ${dateStr}</p>
    </div>

    <!-- Location -->
    <div style="background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.08);border-radius:16px;padding:20px;margin-bottom:16px;">
      <p style="color:#9ca3af;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.1em;margin:0 0 4px;">Location</p>
      <p style="color:#ffffff;font-size:18px;font-weight:700;margin:0;">${data.locationName}</p>
    </div>

    <!-- Prime Cost Hero -->
    <div style="background:${pcBg};border:1px solid ${pcColor}30;border-radius:16px;padding:24px;margin-bottom:16px;text-align:center;">
      <p style="color:${pcColor};font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.12em;margin:0 0 8px;">Prime Cost (Food + Labor)</p>
      <p style="color:${pcColor};font-size:52px;font-weight:900;margin:0;line-height:1;">${fmtPct(data.primeCost)}</p>
      <p style="color:${pcColor};font-size:13px;font-weight:700;margin:8px 0 0;">${pcStatus}</p>
      <p style="color:#6b7280;font-size:11px;margin:8px 0 0;">Food ${fmtPct(data.foodPct)} + Labor ${fmtPct(data.laborPct)} · Target ≤58%</p>
    </div>

    <!-- Metrics Grid -->
    <table style="width:100%;border-collapse:collapse;margin-bottom:16px;">
      <tr>
        <td style="width:50%;padding-right:8px;">
          <div style="background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.08);border-radius:12px;padding:16px;">
            <p style="color:#9ca3af;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;margin:0 0 4px;">Yesterday's Revenue</p>
            <p style="color:#00d4a8;font-size:22px;font-weight:900;margin:0;">${fmtUSD(data.revenue)}</p>
          </div>
        </td>
        <td style="width:50%;padding-left:8px;">
          <div style="background:${data.estNetCash >= 0 ? "rgba(0,212,168,0.08)" : "rgba(239,68,68,0.08)"};border:1px solid ${data.estNetCash >= 0 ? "rgba(0,212,168,0.2)" : "rgba(239,68,68,0.2)"};border-radius:12px;padding:16px;">
            <p style="color:#9ca3af;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;margin:0 0 4px;">Est. Net Cash</p>
            <p style="color:${data.estNetCash >= 0 ? "#00d4a8" : "#f87171"};font-size:22px;font-weight:900;margin:0;">${data.estNetCash >= 0 ? "+" : ""}${fmtUSD(data.estNetCash)}</p>
          </div>
        </td>
      </tr>
    </table>

    <!-- Cost Breakdown -->
    <div style="background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.08);border-radius:12px;padding:16px;margin-bottom:16px;">
      <p style="color:#9ca3af;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;margin:0 0 12px;">Cost Breakdown</p>
      ${[
        ["Food Cost", data.foodPct, 30],
        ["Labor Cost", data.laborPct, 32],
        ["Prime Cost", data.primeCost, 58],
      ].map(([label, value, target]) => {
        const v = value as number;
        const t = target as number;
        const over = v > t;
        const color = over ? "#f97316" : "#00d4a8";
        return `<div style="display:flex;justify-content:space-between;align-items:center;padding:6px 0;border-bottom:1px solid rgba(255,255,255,0.05);">
          <span style="color:#d1d5db;font-size:13px;">${label}</span>
          <span style="color:${color};font-weight:700;font-size:13px;">${fmtPct(v)}${over ? " ⚠" : " ✓"}</span>
        </div>`;
      }).join("")}
    </div>

    ${data.alerts.length > 0 ? `
    <!-- Alerts -->
    <div style="background:rgba(239,68,68,0.08);border:1px solid rgba(239,68,68,0.25);border-radius:12px;padding:16px;margin-bottom:16px;">
      <p style="color:#f87171;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;margin:0 0 8px;">⚠ Action Items</p>
      ${data.alerts.map(a => `<p style="color:#fca5a5;font-size:13px;margin:4px 0;">• ${a}</p>`).join("")}
    </div>
    ` : `
    <!-- All Clear -->
    <div style="background:rgba(0,212,168,0.06);border:1px solid rgba(0,212,168,0.2);border-radius:12px;padding:14px;margin-bottom:16px;text-align:center;">
      <p style="color:#00d4a8;font-size:13px;font-weight:600;margin:0;">✓ All margins within target — great day!</p>
    </div>
    `}

    <!-- CTA -->
    <div style="text-align:center;margin-bottom:24px;">
      <a href="https://cashcall.io/dashboard" style="display:inline-block;background:#00d4a8;color:#060b18;font-weight:700;font-size:14px;padding:14px 32px;border-radius:12px;text-decoration:none;">
        Open Full Dashboard →
      </a>
    </div>

    <!-- Footer -->
    <div style="text-align:center;border-top:1px solid rgba(255,255,255,0.06);padding-top:16px;">
      <p style="color:#374151;font-size:11px;margin:0 0 4px;">⚡ CashCall · Restaurant Financial OS</p>
      <p style="color:#374151;font-size:11px;margin:0;">AES-256 encrypted · <a href="https://cashcall.io/settings/notifications" style="color:#4b5563;">Unsubscribe</a></p>
    </div>
  </div>
</body>
</html>`;

  return { subject, html };
}

// ── Types ────────────────────────────────────────────────────────────────────
interface LocationDigest {
  locationId: string;
  locationName: string;
  date: string;
  revenue: number;
  foodPct: number;
  laborPct: number;
  primeCost: number;
  estNetCash: number;
  alerts: string[];
}

// ── Route handler ────────────────────────────────────────────────────────────
export async function GET(req: Request) {
  // Security check — only Vercel cron or admin
  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // ?dry_run=1 computes every digest and reports what would be sent, without sending.
  // With dry_run, ?user_id=<id> previews one user who has not set up notifications yet.
  const url = new URL(req.url);
  const dryRun = url.searchParams.get("dry_run") === "1";
  const previewUser = dryRun ? url.searchParams.get("user_id") : null;

  const supabase = createServiceClient();
  const date = yesterday();
  const monthStart = date.slice(0, 7) + "-01"; // YYYY-MM-01

  const nv = (v: unknown) => parseFloat(String(v ?? 0)) || 0;

  try {
    // Get all users with notification prefs set (correct table: notification_prefs)
    // Only users who switched the daily digest on and gave an email or WhatsApp number.
    const { data: savedPrefs, error: prefsErr } = await supabase
      .from("notification_prefs")
      .select("user_id, digest_email, whatsapp_number, whatsapp_provider")
      .eq("digest_enabled", true)
      .or("digest_email.not.is.null,whatsapp_number.not.is.null");
    if (prefsErr) throw new Error(`notification_prefs: ${prefsErr.message}`);

    const prefs = previewUser
      ? [{ user_id: previewUser, digest_email: "(preview)", whatsapp_number: null, whatsapp_provider: null }]
      : savedPrefs;

    if (!prefs?.length) {
      return NextResponse.json({ message: "No users with notifications configured", sent: 0 });
    }

    const results: { user: string; sent: string[]; error?: string }[] = [];

    for (const pref of prefs) {
      if (!pref.digest_email && !pref.whatsapp_number) continue;

      try {
        // Get this user's locations
        const { data: locations } = await supabase
          .from("locations")
          .select("id,name")
          .eq("user_id", pref.user_id)
          .eq("app", "cashcall")
          .order("name");

        const locIds = (locations ?? []).map((l: { id: string }) => l.id);
        if (!locIds.length) continue;

        // Process each location
        for (const loc of (locations ?? [])) {
          try {
            // Yesterday's sales (correct columns)
            const { data: ydaySales } = await supabase
              .from("daily_sales")
              .select("cash_sales,pos_sales,liquor_sales,uber_eats_gross,grubhub_gross,doordash_gross,catering_sales,aggregator_commission")
              .eq("location_id", loc.id)
              .eq("sale_date", date);

            const revenue = (ydaySales ?? []).reduce((s, r) => {
              const aggNet = (nv(r.uber_eats_gross) + nv(r.grubhub_gross) + nv(r.doordash_gross)) - nv(r.aggregator_commission);
              return s + nv(r.cash_sales) + nv(r.pos_sales) + nv(r.liquor_sales) + aggNet + nv(r.catering_sales);
            }, 0);

            // Month-to-date sales
            const { data: mtdSales } = await supabase
              .from("daily_sales")
              .select("cash_sales,pos_sales,liquor_sales,uber_eats_gross,grubhub_gross,doordash_gross,catering_sales,aggregator_commission")
              .eq("location_id", loc.id)
              .gte("sale_date", monthStart)
              .lte("sale_date", date);

            const monthRevenue = (mtdSales ?? []).reduce((s, r) => {
              const aggNet = (nv(r.uber_eats_gross) + nv(r.grubhub_gross) + nv(r.doordash_gross)) - nv(r.aggregator_commission);
              return s + nv(r.cash_sales) + nv(r.pos_sales) + nv(r.liquor_sales) + aggNet + nv(r.catering_sales);
            }, 0);

            // Month-to-date food cost (correct table: food_deliveries)
            const { data: foodRows } = await supabase
              .from("food_deliveries")
              .select("amount")
              .eq("location_id", loc.id)
              .gte("delivery_date", monthStart)
              .lte("delivery_date", date);
            const monthFoodCost = (foodRows ?? []).reduce((s, r) => s + nv(r.amount), 0);

            // Month-to-date labor (FOH hourly + salaried + BOH + disbursements)
            const [hourlyRes, salariedRes, bohRes, disbRes] = await Promise.all([
              supabase.from("foh_hourly_hours")
                .select("hours_worked,overtime_hours,foh_hourly_staff!inner(hourly_rate,location_id)")
                .eq("foh_hourly_staff.location_id", loc.id)
                .gte("work_date", monthStart).lte("work_date", date),
              supabase.from("foh_salaried_staff").select("monthly_salary").eq("location_id", loc.id).eq("active", true),
              supabase.from("boh_staff").select("pay_rate").eq("location_id", loc.id).eq("active", true).eq("pay_type", "salary"),
              supabase.from("salary_disbursements").select("amount").eq("location_id", loc.id)
                .gte("disbursed_on", monthStart).lte("disbursed_on", date),
            ]);

            const hourlyLabor = ((hourlyRes.data ?? []) as any[]).reduce((s, r) => {
              const rate = nv(r.foh_hourly_staff?.hourly_rate);
              return s + nv(r.hours_worked) * rate + nv(r.overtime_hours) * rate * 1.5;
            }, 0);
            const now = new Date();
            const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
            const daysPassed = now.getDate();
            const salariedLabor = (salariedRes.data ?? []).reduce((s, r: {monthly_salary:number}) => s + nv(r.monthly_salary) * daysPassed / daysInMonth, 0);
            const bohLabor = (bohRes.data ?? []).reduce((s, r: {pay_rate:number}) => s + nv(r.pay_rate) * daysPassed / daysInMonth, 0);
            const disbLabor = (disbRes.data ?? []).reduce((s, r: {amount:number}) => s + nv(r.amount), 0);
            // Same rule as the dashboard (lib/fetchPL.ts): recorded payroll disbursements replace the
            // salaried and back-of-house estimates, so the same wages are not counted twice.
            const monthLabor = hourlyLabor + (disbLabor > 0 ? disbLabor : salariedLabor + bohLabor);

            const foodPct = monthRevenue > 0 ? (monthFoodCost / monthRevenue) * 100 : 0;
            const laborPct = monthRevenue > 0 ? (monthLabor / monthRevenue) * 100 : 0;
            const primeCost = foodPct + laborPct;
            const estNetCash = revenue - (revenue * (foodPct + laborPct + 15) / 100);

            const alerts: string[] = [];
            if (foodPct > 30) alerts.push(`Food cost at ${fmtPct(foodPct)} — over 30% target`);
            if (laborPct > 32) alerts.push(`Labor at ${fmtPct(laborPct)} — check overtime`);
            if (primeCost > 65) alerts.push(`Prime cost CRITICAL at ${fmtPct(primeCost)} — immediate action needed`);
            else if (primeCost > 58) alerts.push(`Prime cost elevated at ${fmtPct(primeCost)} — over 58% target`);
            if (revenue === 0) alerts.push("No sales entered for yesterday — data may be missing");

            const digest: LocationDigest = {
              locationId: loc.id, locationName: loc.name, date,
              revenue, foodPct, laborPct, primeCost, estNetCash, alerts,
            };

            const sent: string[] = [];

            if (dryRun) {
              sent.push(`dry run: ${loc.name} ${date}, revenue ${fmtUSD(revenue)}, food ${fmtPct(foodPct)}, labor ${fmtPct(laborPct)}, alerts ${alerts.length}`);
              results.push({ user: pref.user_id, sent });
              continue;
            }

            // Send email via Resend
            if (pref.digest_email) {
              const { subject, html } = formatDigestEmail(digest);
              const res = await fetch("https://api.resend.com/emails", {
                method: "POST",
                headers: { "Content-Type": "application/json", "Authorization": `Bearer ${process.env.RESEND_API_KEY}` },
                body: JSON.stringify({ from: "CashCall <briefs@cashcall.io>", to: [pref.digest_email], subject, html }),
              });
              if (res.ok) sent.push(`email:${pref.digest_email}`);
            }

            // Send WhatsApp/SMS via Twilio
            if (pref.whatsapp_number) {
              const accountSid = process.env.TWILIO_ACCOUNT_SID;
              const authToken = process.env.TWILIO_AUTH_TOKEN;
              const fromNumber = process.env.TWILIO_FROM_NUMBER;
              if (accountSid && authToken && fromNumber) {
                const smsBody = formatDigestSMS(digest);
                const msgBody = new URLSearchParams({ To: pref.whatsapp_number, From: fromNumber, Body: smsBody });
                const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`, {
                  method: "POST",
                  headers: {
                    "Content-Type": "application/x-www-form-urlencoded",
                    "Authorization": "Basic " + Buffer.from(`${accountSid}:${authToken}`).toString("base64"),
                  },
                  body: msgBody.toString(),
                });
                if (res.ok) sent.push(`whatsapp:${pref.whatsapp_number}`);
              }
            }

            results.push({ user: pref.user_id, sent });
          } catch (err) {
            results.push({ user: pref.user_id, sent: [], error: String(err) });
          }
        }
      } catch (err) {
        results.push({ user: pref.user_id, sent: [], error: String(err) });
      }
    }

    return NextResponse.json({ date, processed: results.length, results });
  } catch (err) {
    console.error("Daily digest error:", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
