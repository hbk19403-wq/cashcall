export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createHmac } from "crypto";

// ── Toast Real-Time Webhook Listener ─────────────────────────────────────────
// Receives clock-in/clock-out events from Toast POS
// Docs: https://doc.toasttab.com/openapi/webhooks/
//
// Architecture: Part 1 of Real-Time Labor Sync Pipeline
// Events processed: CLOCK_IN, CLOCK_OUT, SHIFT_REVISED
//
// Webhook delivery: Toast sends POST with HMAC-SHA256 signature in
//   Toast-Webhook-Signature header = "t=<timestamp>,v1=<hmac>"
// ─────────────────────────────────────────────────────────────────────────────

export const maxDuration = 30;

function verifyToastSignature(rawBody: string, signatureHeader: string | null, secret: string): boolean {
  if (!signatureHeader) return false;
  // Format: "t=<timestamp>,v1=<hmac>"
  const parts = Object.fromEntries(signatureHeader.split(",").map(p => p.split("=")));
  const timestamp = parts["t"];
  const v1        = parts["v1"];
  if (!timestamp || !v1) return false;

  // Replay protection: reject if older than 5 minutes
  const age = Date.now() / 1000 - parseInt(timestamp, 10);
  if (age > 300) return false;

  const payload  = `${timestamp}.${rawBody}`;
  const expected = createHmac("sha256", secret).update(payload).digest("hex");
  return expected === v1;
}

interface ToastClockEvent {
  eventType: "CLOCK_IN" | "CLOCK_OUT" | "SHIFT_REVISED";
  restaurantGuid: string;
  eventOccurredAt: string; // ISO
  shift?: {
    guid: string;
    employee?: { guid: string; externalId?: string; firstName?: string; lastName?: string };
    jobReference?: { guid: string; title?: string };
    inDate?: string;
    outDate?: string;
    hoursWorked?: number;
    overtimeMinutes?: number;
    declaredCashTips?: number;
    wages?: { hourlyWage?: number; regularHours?: number; overtimeHours?: number };
  };
}

export async function POST(req: NextRequest) {
  const webhookSecret = process.env.TOAST_WEBHOOK_SECRET;

  // If secret is configured, enforce HMAC verification
  if (webhookSecret) {
    const rawBody = await req.text();
    const sig     = req.headers.get("toast-webhook-signature");
    if (!verifyToastSignature(rawBody, sig, webhookSecret)) {
      return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
    }
    // Re-parse after consuming stream
    let events: ToastClockEvent[];
    try {
      events = JSON.parse(rawBody);
    } catch {
      return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }
    return processEvents(events);
  }

  // No secret configured — parse normally (dev mode)
  let events: ToastClockEvent[];
  try {
    const body = await req.json();
    events = Array.isArray(body) ? body : [body];
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  return processEvents(events);
}

async function processEvents(events: ToastClockEvent[]) {
  const db = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );

  const processed: string[] = [];
  const errors: string[]    = [];

  for (const event of events) {
    if (!["CLOCK_IN", "CLOCK_OUT", "SHIFT_REVISED"].includes(event.eventType)) continue;
    if (!event.shift) continue;

    const shift = event.shift;
    const restaurantGuid = event.restaurantGuid;

    // Look up which CashCall location this restaurant maps to
    const { data: posConn } = await db.from("pos_connections")
      .select("location_id")
      .eq("pos_type", "toast")
      .eq("restaurant_guid", restaurantGuid)
      .maybeSingle();

    if (!posConn) {
      errors.push(`No pos_connection for Toast restaurant ${restaurantGuid}`);
      continue;
    }

    const locationId = posConn.location_id;

    // Normalize labor event into CashCall's hourly hours schema
    const shiftDate = (shift.inDate ?? event.eventOccurredAt ?? "").slice(0, 10);
    if (!shiftDate) continue;

    const hoursWorked   = shift.hoursWorked ?? shift.wages?.regularHours ?? 0;
    const overtimeHours = ((shift.overtimeMinutes ?? 0) / 60) || (shift.wages?.overtimeHours ?? 0);
    const hourlyRate    = shift.wages?.hourlyWage ?? 0;
    const employeeName  = [shift.employee?.firstName, shift.employee?.lastName].filter(Boolean).join(" ") || "Unknown";
    const jobTitle      = shift.jobReference?.title ?? "Team Member";
    const externalId    = shift.employee?.externalId ?? shift.employee?.guid ?? shift.guid;

    if (event.eventType === "CLOCK_IN") {
      // On clock-in, upsert a stub row to track the open shift
      await db.from("pos_labor_events").upsert({
        location_id: locationId,
        external_shift_id: shift.guid,
        employee_name: employeeName,
        job_title: jobTitle,
        clock_in_at: shift.inDate ?? event.eventOccurredAt,
        clock_out_at: null,
        hours_worked: 0,
        overtime_hours: 0,
        hourly_rate: hourlyRate,
        source: "toast_webhook",
        work_date: shiftDate,
      }, { onConflict: "location_id,external_shift_id" });
      processed.push(`clock_in:${externalId}`);
    } else {
      // CLOCK_OUT or SHIFT_REVISED — write completed shift
      await db.from("pos_labor_events").upsert({
        location_id: locationId,
        external_shift_id: shift.guid,
        employee_name: employeeName,
        job_title: jobTitle,
        clock_in_at: shift.inDate ?? null,
        clock_out_at: shift.outDate ?? event.eventOccurredAt,
        hours_worked: hoursWorked,
        overtime_hours: overtimeHours,
        hourly_rate: hourlyRate,
        source: "toast_webhook",
        work_date: shiftDate,
      }, { onConflict: "location_id,external_shift_id" });

      // Detect overtime leakage (spec: flag shifts where overtime pushed labor past threshold)
      if (overtimeHours > 0) {
        const overtimeCost = overtimeHours * hourlyRate * 1.5;
        if (overtimeCost > 25) {
          // Insert alert for the morning digest
          await db.from("labor_alerts").upsert({
            location_id: locationId,
            alert_date: shiftDate,
            alert_type: "overtime_leakage",
            employee_name: employeeName,
            job_title: jobTitle,
            overtime_hours: overtimeHours,
            overtime_cost: overtimeCost,
            source: "toast_webhook",
          }, { onConflict: "location_id,external_shift_id,alert_type" }).then(() => {}); // non-fatal
        }
      }

      processed.push(`clock_out:${externalId} (${hoursWorked.toFixed(2)}h + ${overtimeHours.toFixed(2)}h OT)`);
    }
  }

  return NextResponse.json({ ok: true, processed, errors });
}
