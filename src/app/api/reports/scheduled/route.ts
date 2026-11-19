export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createClient as createServiceClient } from "@supabase/supabase-js";
import { fetchPLSummary } from "@/lib/fetchPL";

// ── POST /api/reports/scheduled ───────────────────────────────────────────────
// Triggered by Vercel cron or manually. Sends P&L report for each user
// whose report_schedule matches the current cadence (weekly/monthly).
//
// Also callable directly by an authenticated user to get their own report.

// Sends through Resend's HTTP API directly (same approach as /api/trial/request), so no SDK dependency.
async function sendEmail(msg: { from: string; to: string[]; subject: string; html: string }) {
  const key = process.env.RESEND_API_KEY;
  if (!key) throw new Error("RESEND_API_KEY not configured");
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify(msg),
  });
  if (!res.ok) throw new Error(`Email send failed (${res.status}): ${(await res.text()).slice(0, 200)}`);
}

function daysAgo(n: number) {
  const d = new Date(); d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

function fmt(n: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n);
}

function pct(n: number) { return `${(n * 100).toFixed(1)}%`; }


function buildEmailHtml(locationName: string, period: string, metrics: {
  revenue: number; foodCost: number; laborCost: number; primeCost: number;
  primeRatio: number; foodRatio: number; laborRatio: number; netProfit: number;
  netMargin: number; deliveryGross: number; deliveryCommission: number;
}) {
  const teal   = "#00d4a8";
  const dark   = "#060b18";
  const indigo = "#818cf8";

  const statusColor = metrics.primeRatio < 0.65 ? "#10b981" : metrics.primeRatio < 0.72 ? "#f59e0b" : "#ef4444";
  const statusLabel = metrics.primeRatio < 0.65 ? "✓ Healthy" : metrics.primeRatio < 0.72 ? "⚠ Watch" : "⚑ Action Needed";

  return `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head>
<body style="background:#0f172a;font-family:sans-serif;padding:0;margin:0;">
  <div style="max-width:600px;margin:0 auto;padding:24px 16px;">
    <div style="background:#060b18;border-radius:12px;overflow:hidden;border:1px solid #1e293b;">

      <!-- Header -->
      <div style="background:linear-gradient(135deg,#060b18,#0d1f2d);padding:28px 28px 20px;border-bottom:1px solid #1e293b;">
        <div style="display:flex;align-items:center;gap:12px;margin-bottom:4px;">
          <span style="font-size:22px;font-weight:800;color:${teal};letter-spacing:-0.5px;">CASHCALL</span>
          <span style="font-size:12px;color:#64748b;background:#1e293b;padding:3px 10px;border-radius:20px;">P&amp;L REPORT</span>
        </div>
        <h2 style="color:#f1f5f9;font-size:18px;margin:8px 0 2px;">${locationName}</h2>
        <p style="color:#64748b;font-size:13px;margin:0;">${period}</p>
      </div>

      <!-- Prime Cost Hero -->
      <div style="padding:24px 28px;border-bottom:1px solid #1e293b;text-align:center;">
        <div style="font-size:13px;color:#94a3b8;margin-bottom:4px;text-transform:uppercase;letter-spacing:1px;">Prime Cost Ratio</div>
        <div style="font-size:48px;font-weight:800;color:${statusColor};line-height:1;">${pct(metrics.primeRatio)}</div>
        <div style="font-size:13px;color:${statusColor};margin-top:4px;font-weight:600;">${statusLabel}</div>
        <div style="font-size:12px;color:#64748b;margin-top:4px;">Target: &lt;65% · Industry avg: 60-65%</div>
      </div>

      <!-- Key Metrics Grid -->
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:1px;background:#1e293b;border-top:1px solid #1e293b;border-bottom:1px solid #1e293b;">
        ${[
          ["Net Sales", fmt(metrics.revenue), ""],
          ["After Food & Labor", fmt(metrics.netProfit), pct(metrics.netMargin)],
          ["Food Cost", fmt(metrics.foodCost), pct(metrics.foodRatio)],
          ["Labor Cost", fmt(metrics.laborCost), pct(metrics.laborRatio)],
        ].map(([label, value, sub]) => `
          <div style="background:#060b18;padding:16px 20px;">
            <div style="font-size:11px;color:#64748b;text-transform:uppercase;letter-spacing:0.5px;">${label}</div>
            <div style="font-size:22px;font-weight:700;color:#f1f5f9;margin-top:2px;">${value}</div>
            ${sub ? `<div style="font-size:12px;color:${indigo};">${sub}</div>` : ""}
          </div>
        `).join("")}
      </div>

      ${metrics.deliveryGross > 0 ? `
      <!-- Delivery Summary -->
      <div style="padding:20px 28px;border-bottom:1px solid #1e293b;">
        <div style="font-size:12px;color:#64748b;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:12px;">Delivery Platforms</div>
        <div style="display:flex;justify-content:space-between;align-items:center;background:#0d1f2d;padding:12px 16px;border-radius:8px;">
          <div>
            <div style="color:#f1f5f9;font-size:16px;font-weight:700;">${fmt(metrics.deliveryGross)}</div>
            <div style="color:#94a3b8;font-size:12px;">Gross delivery sales</div>
          </div>
          <div style="text-align:right;">
            <div style="color:#ef4444;font-size:16px;font-weight:700;">-${fmt(metrics.deliveryCommission)}</div>
            <div style="color:#94a3b8;font-size:12px;">${pct(metrics.deliveryCommission / metrics.deliveryGross)} commission</div>
          </div>
          <div style="text-align:right;">
            <div style="color:${teal};font-size:16px;font-weight:700;">${fmt(metrics.deliveryGross - metrics.deliveryCommission)}</div>
            <div style="color:#94a3b8;font-size:12px;">Net to restaurant</div>
          </div>
        </div>
      </div>` : ""}

      <!-- Footer -->
      <div style="padding:20px 28px;text-align:center;">
        <p style="color:#475569;font-size:12px;margin:0;">
          Generated by CashCall · <a href="https://cashcall.io/dashboard" style="color:${teal};text-decoration:none;">View full dashboard →</a>
        </p>
      </div>
    </div>
  </div>
</body>
</html>`;
}

export async function POST(req: NextRequest) {
  // Allow cron calls or authenticated user calls
  const secret = process.env.CRON_SECRET;
  const isCron = !!secret && (
    req.headers.get("x-cron-key") === secret ||
    req.headers.get("authorization") === `Bearer ${secret}`
  );

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!isCron && !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // dry_run: compute everything and report what would be sent, without sending any email.
  const { schedule_type = "auto", location_id, user_id: bodyUserId, dry_run = false } =
    (await req.json().catch(() => ({}))) as { schedule_type?: string; location_id?: string; user_id?: string; dry_run?: boolean };

  const db = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );

  // Build list of users to process
  let userIds: string[] = [];

  if (isCron) {
    // Auto mode: find users with today's report due
    const today = new Date();
    const dayOfWeek  = today.getDay(); // 0=Sun
    const dayOfMonth = today.getDate();

    const { data: prefs } = await db.from("notification_prefs").select("user_id, report_schedule, report_day, report_email").neq("report_schedule", "off");
    for (const p of prefs ?? []) {
      if (p.report_schedule === "weekly"  && p.report_day === dayOfWeek)  userIds.push(p.user_id);
      if (p.report_schedule === "monthly" && p.report_day === dayOfMonth) userIds.push(p.user_id);
    }
    if (bodyUserId) userIds = [bodyUserId]; // allow targeting a specific user via cron
  } else {
    userIds = [user!.id];
  }

  const sent: string[] = [];
  const errors: string[] = [];

  for (const uid of userIds) {
    try {
      // Get user email
      const { data: prefs } = await db.from("notification_prefs")
        .select("report_email, report_schedule")
        .eq("user_id", uid)
        .maybeSingle();

      // Report address if one was set, otherwise the address the user signs in with.
      let toEmail: string | null | undefined = prefs?.report_email;
      if (!toEmail) {
        const { data: account } = await db.auth.admin.getUserById(uid);
        toEmail = account?.user?.email;
      }
      if (!toEmail) continue;

      // Date range
      const isWeekly = prefs?.report_schedule === "weekly" || schedule_type === "weekly";
      const daysBack = isWeekly ? 7 : 30;
      const start = daysAgo(daysBack);
      const end   = daysAgo(0);
      const periodLabel = isWeekly
        ? `Week of ${start} – ${end}`
        : `Month: ${new Date().toLocaleDateString("en-US", { month: "long", year: "numeric" })}`;

      // Get locations (optionally filtered)
      const locQuery = db.from("locations").select("id,name").eq("user_id", uid).eq("app", "cashcall");
      if (location_id) locQuery.eq("id", location_id);
      const { data: locations } = await locQuery;
      if (!locations?.length) continue;

      for (const loc of locations) {
        // Same tables and definitions as the dashboard (see lib/fetchPL.ts).
        const [salesRes, foodRes, hoursRes] = await Promise.all([
          db.from("daily_sales")
            .select("sale_date,cash_sales,pos_sales,uber_eats_gross,grubhub_gross,doordash_gross,catering_sales,cash_tips,aggregator_commission")
            .eq("location_id", loc.id).gte("sale_date", start).lte("sale_date", end),
          db.from("food_deliveries")
            .select("delivery_date,amount")
            .eq("location_id", loc.id).gte("delivery_date", start).lte("delivery_date", end),
          db.from("foh_hourly_hours")
            .select("work_date,hours_worked,overtime_hours,foh_hourly_staff!inner(hourly_rate,location_id)")
            .eq("foh_hourly_staff.location_id", loc.id).gte("work_date", start).lte("work_date", end),
        ]);
        const dataErr = salesRes.error ?? foodRes.error ?? hoursRes.error;
        if (dataErr) throw new Error(`${loc.name}: ${dataErr.message}`);

        const n = (v: unknown) => parseFloat(String(v ?? 0)) || 0;
        const sales = (salesRes.data ?? []) as Record<string, unknown>[];

        const deliveryGross      = sales.reduce((s, r) => s + n(r.uber_eats_gross) + n(r.grubhub_gross) + n(r.doordash_gross), 0);
        const deliveryCommission = sales.reduce((s, r) => s + n(r.aggregator_commission), 0);
        // Net sales, as on the dashboard: gross plus cash tips, less delivery commission.
        const revenue = sales.reduce((s, r) =>
          s + n(r.cash_sales) + n(r.pos_sales) + n(r.catering_sales) + n(r.cash_tips), 0) + deliveryGross - deliveryCommission;

        const foodCost = (foodRes.data ?? []).reduce((s, r) => s + n(r.amount), 0);

        // Labor = hourly hours worked in the period (overtime at 1.5x) plus salaried, back-of-house
        // and payroll-tax costs prorated from this month's totals.
        const laborHourly = ((hoursRes.data ?? []) as any[]).reduce((s, r) => { // eslint-disable-line @typescript-eslint/no-explicit-any
          const rate = n(r.foh_hourly_staff?.hourly_rate);
          return s + n(r.hours_worked) * rate + n(r.overtime_hours) * rate * 1.5;
        }, 0);
        const now = new Date();
        const monthStart  = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString().slice(0, 10);
        const daysInMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0)).getUTCDate();
        const monthly = await fetchPLSummary(db, loc.id, monthStart);
        const monthlyFixed = monthly.foh_salaried_cost + monthly.boh_cost + monthly.payroll_taxes;
        const laborCost = laborHourly + monthlyFixed * Math.min(1, daysBack / daysInMonth);

        // Nothing recorded for the period: a report of zeros would read as "healthy", so skip it.
        if (revenue === 0 && foodCost === 0) {
          sent.push(`[skipped, no data] ${loc.name}`);
          continue;
        }

        const primeCost = foodCost + laborCost;
        const netProfit = revenue - primeCost; // what is left after food and labor, before overhead

        const metrics = {
          revenue, foodCost, laborCost, primeCost, netProfit,
          primeRatio:  revenue > 0 ? primeCost  / revenue : 0,
          foodRatio:   revenue > 0 ? foodCost   / revenue : 0,
          laborRatio:  revenue > 0 ? laborCost  / revenue : 0,
          netMargin:   revenue > 0 ? netProfit  / revenue : 0,
          deliveryGross, deliveryCommission,
        };

        const html = buildEmailHtml(loc.name, periodLabel, metrics);

        if (dry_run) {
          sent.push(`[dry run] ${loc.name} → ${toEmail}: ${periodLabel}, net sales ${fmt(revenue)}, food ${fmt(foodCost)}, labor ${fmt(laborCost)}`);
          continue;
        }

        await sendEmail({
          from:    "CashCall Reports <reports@cashcall.io>",
          to:      [toEmail],
          subject: `${loc.name} · ${isWeekly ? "Weekly" : "Monthly"} P&L Report`,
          html,
        });

        sent.push(`${loc.name} → ${toEmail}`);
      }
    } catch (err) {
      errors.push(`${uid}: ${(err as Error).message}`);
    }
  }

  return NextResponse.json({ ok: true, sent, errors: errors.length ? errors : undefined });
}

// GET — Vercel cron (Authorization: Bearer CRON_SECRET) or a signed-in user
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const isCron = !!secret && req.headers.get("authorization") === `Bearer ${secret}`;

  if (isCron) {
    // Auto mode: POST works out which users have a report due today.
    return POST(new NextRequest(req.url, {
      method: "POST",
      headers: req.headers,
      body: JSON.stringify({ schedule_type: "auto", dry_run: req.nextUrl.searchParams.get("dry_run") === "1" }),
    }));
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const schedule_type = req.nextUrl.searchParams.get("type") ?? "weekly";
  const location_id   = req.nextUrl.searchParams.get("location_id") ?? undefined;

  return POST(new NextRequest(req.url, {
    method: "POST",
    headers: req.headers,
    body: JSON.stringify({ schedule_type, location_id }),
  }));
}
