export const dynamic = "force-dynamic";

/**
 * POST /api/notify/price-spike
 * Called after invoice line items are saved.
 * Checks if any new item price is >10% above its 3-month average.
 * If spikes found, fires WhatsApp/email alert immediately.
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

const SPIKE_THRESHOLD_PCT = 10; // alert if >10% above historical avg

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { food_delivery_id, location_id } = await req.json() as {
    food_delivery_id: string;
    location_id: string;
  };

  if (!food_delivery_id || !location_id) {
    return NextResponse.json({ error: "food_delivery_id and location_id required" }, { status: 400 });
  }

  // Verify this delivery belongs to the authenticated user
  const { data: delivery } = await supabase
    .from("food_deliveries")
    .select("id, vendor, delivery_date")
    .eq("id", food_delivery_id)
    .eq("location_id", location_id)
    .single();

  if (!delivery) return NextResponse.json({ error: "Delivery not found" }, { status: 404 });

  // Get the new line items
  const { data: newItems } = await supabase
    .from("invoice_line_items")
    .select("name, unit_price")
    .eq("food_delivery_id", food_delivery_id)
    .not("unit_price", "is", null);

  if (!newItems?.length) return NextResponse.json({ spikes: [], sent: false });

  // Get 3-month historical averages for the same location
  const threeMonthsAgo = new Date();
  threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);
  const cutoff = threeMonthsAgo.toISOString().slice(0, 10);

  const { data: histDeliveries } = await supabase
    .from("food_deliveries")
    .select("id")
    .eq("location_id", location_id)
    .gte("delivery_date", cutoff)
    .neq("id", food_delivery_id); // exclude current delivery

  const histIds = (histDeliveries ?? []).map(d => d.id);

  const histMap: Record<string, number[]> = {};
  if (histIds.length) {
    const { data: histItems } = await supabase
      .from("invoice_line_items")
      .select("name, unit_price")
      .in("food_delivery_id", histIds)
      .not("unit_price", "is", null);

    for (const h of (histItems ?? [])) {
      const key = h.name.toLowerCase().trim();
      (histMap[key] ??= []).push(Number(h.unit_price));
    }
  }

  // Identify spikes
  const spikes: { name: string; currentPrice: number; avgPrice: number; pct: number }[] = [];
  for (const item of newItems) {
    const key = item.name.toLowerCase().trim();
    const hist = histMap[key];
    if (!hist?.length) continue; // no history = first time seen, no alert
    const avg = hist.reduce((s, v) => s + v, 0) / hist.length;
    const pct = ((Number(item.unit_price) - avg) / avg) * 100;
    if (pct >= SPIKE_THRESHOLD_PCT) {
      spikes.push({ name: item.name, currentPrice: Number(item.unit_price), avgPrice: avg, pct });
    }
  }

  if (!spikes.length) return NextResponse.json({ spikes: [], sent: false });

  // Get location name
  const { data: loc } = await supabase
    .from("locations")
    .select("name")
    .eq("id", location_id)
    .single();

  const locationName = loc?.name ?? location_id;

  // Get user's notification prefs
  const { data: prefs } = await supabase
    .from("notification_prefs")
    .select("digest_email, whatsapp_number, whatsapp_provider")
    .eq("user_id", user.id)
    .single();

  if (!prefs?.digest_email && !prefs?.whatsapp_number) {
    return NextResponse.json({ spikes, sent: false, reason: "No notification channel configured" });
  }

  // Build alert message
  const spikeLines = spikes
    .sort((a, b) => b.pct - a.pct)
    .map(s => `• ${s.name}: $${s.currentPrice.toFixed(2)} vs avg $${s.avgPrice.toFixed(2)} (▲${s.pct.toFixed(1)}%)`)
    .join("\n");

  const messageText = `🚨 Price Spike Alert — ${locationName}\n\nFrom ${delivery.vendor} invoice (${delivery.delivery_date}):\n\n${spikeLines}\n\nReview at cashcall.io`;

  const sent: string[] = [];

  // Send WhatsApp/SMS
  if (prefs.whatsapp_number && process.env.TWILIO_ACCOUNT_SID) {
    const twilioAuth = Buffer.from(
      `${process.env.TWILIO_ACCOUNT_SID}:${process.env.TWILIO_AUTH_TOKEN}`
    ).toString("base64");
    const res = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${process.env.TWILIO_ACCOUNT_SID}/Messages.json`,
      {
        method: "POST",
        headers: {
          Authorization: `Basic ${twilioAuth}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({
          To: prefs.whatsapp_number,
          From: process.env.TWILIO_FROM_NUMBER ?? "",
          Body: messageText,
        }),
      }
    );
    if (res.ok) sent.push(`whatsapp:${prefs.whatsapp_number}`);
  }

  // Send email
  if (prefs.digest_email && process.env.RESEND_API_KEY) {
    const htmlLines = spikes
      .sort((a, b) => b.pct - a.pct)
      .map(s => `<tr>
        <td style="padding:8px 12px;border-bottom:1px solid #1f2937;color:#f9fafb;">${s.name}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #1f2937;color:#f87171;font-weight:600;">$${s.currentPrice.toFixed(2)}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #1f2937;color:#9ca3af;">$${s.avgPrice.toFixed(2)}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #1f2937;color:#fb923c;font-weight:700;">▲${s.pct.toFixed(1)}%</td>
      </tr>`)
      .join("");

    const html = `<!DOCTYPE html>
<html>
<body style="margin:0;padding:0;background:#060b18;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <div style="max-width:520px;margin:0 auto;padding:24px 16px;">
    <div style="text-align:center;margin-bottom:20px;">
      <span style="color:#f87171;font-size:22px;font-weight:900;">🚨 Price Spike Alert</span>
      <p style="color:#9ca3af;font-size:12px;margin:4px 0 0;">${locationName} · ${delivery.vendor} · ${delivery.delivery_date}</p>
    </div>
    <div style="background:#0f172a;border:1px solid rgba(248,113,113,0.3);border-radius:16px;overflow:hidden;margin-bottom:16px;">
      <table style="width:100%;border-collapse:collapse;">
        <thead>
          <tr style="background:rgba(248,113,113,0.1);">
            <th style="padding:8px 12px;text-align:left;color:#9ca3af;font-size:11px;font-weight:600;text-transform:uppercase;">Item</th>
            <th style="padding:8px 12px;text-align:left;color:#9ca3af;font-size:11px;font-weight:600;text-transform:uppercase;">New Price</th>
            <th style="padding:8px 12px;text-align:left;color:#9ca3af;font-size:11px;font-weight:600;text-transform:uppercase;">3M Avg</th>
            <th style="padding:8px 12px;text-align:left;color:#9ca3af;font-size:11px;font-weight:600;text-transform:uppercase;">Change</th>
          </tr>
        </thead>
        <tbody>${htmlLines}</tbody>
      </table>
    </div>
    <div style="text-align:center;">
      <a href="https://cashcall.io/location/${location_id}/food" style="display:inline-block;background:#ef4444;color:white;font-weight:700;font-size:13px;padding:12px 24px;border-radius:10px;text-decoration:none;">
        Review Food Costs →
      </a>
    </div>
    <p style="color:#374151;font-size:11px;text-align:center;margin-top:16px;">⚡ CashCall · <a href="https://cashcall.io/settings/notifications" style="color:#4b5563;">Manage alerts</a></p>
  </div>
</body>
</html>`;

    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      },
      body: JSON.stringify({
        from: "CashCall <alerts@cashcall.io>",
        to: [prefs.digest_email],
        subject: `🚨 ${spikes.length} price spike${spikes.length > 1 ? "s" : ""} detected — ${locationName}`,
        html,
      }),
    });
    if (res.ok) sent.push(`email:${prefs.digest_email}`);
  }

  return NextResponse.json({ spikes, sent, sentCount: sent.length });
}
