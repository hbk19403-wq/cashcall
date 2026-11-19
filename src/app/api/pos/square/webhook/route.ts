export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createHmac } from "crypto";

// ── Square Real-Time Webhook Listener ────────────────────────────────────────
// Receives labor shift events from Square Team Management
// Docs: https://developer.squareup.com/docs/webhooks/overview
//
// Square signs webhooks with HMAC-SHA256 in X-Square-Hmacsha256-Signature header
// Signature = base64( HMAC-SHA256(webhook_signature_key, notification_url + body) )
// ─────────────────────────────────────────────────────────────────────────────

export const maxDuration = 30;

function verifySquareSignature(rawBody: string, sigHeader: string | null, sigKey: string, notifUrl: string): boolean {
  if (!sigHeader) return false;
  const payload  = notifUrl + rawBody;
  const expected = createHmac("sha256", sigKey).update(payload).digest("base64");
  return expected === sigHeader;
}

interface SquareLaborEvent {
  merchant_id: string;
  location_id?: string; // Square location GUID (not CashCall location id)
  type: string; // "labor.shift.created" | "labor.shift.updated" | "labor.shift.deleted"
  event_id: string;
  created_at: string;
  data?: {
    type?: string;
    id?: string;
    object?: {
      shift?: SquareShift;
    };
  };
}

interface SquareShift {
  id: string;
  location_id: string;
  employee_id?: string;
  team_member_id?: string;
  job_id?: string;
  start_at?: string; // ISO
  end_at?: string | null;
  status?: "OPEN" | "CLOSED";
  wage?: {
    title?: string;
    hourly_rate?: { amount?: number; currency?: string }; // amount in cents
  };
  declared_cash_tip_money?: { amount?: number };
  total_break_time_minutes?: number;
}

function squareMoney(cents?: number): number {
  return (cents ?? 0) / 100;
}

export async function POST(req: NextRequest) {
  const sigKey = process.env.SQUARE_WEBHOOK_SIGNATURE_KEY;

  let rawBody: string;
  try {
    rawBody = await req.text();
  } catch {
    return NextResponse.json({ error: "Cannot read body" }, { status: 400 });
  }

  if (sigKey) {
    const sig        = req.headers.get("x-square-hmacsha256-signature");
    const notifUrl   = process.env.SQUARE_WEBHOOK_NOTIFICATION_URL ?? `https://cashcall.io/api/pos/square/webhook`;
    if (!verifySquareSignature(rawBody, sig, sigKey, notifUrl)) {
      return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
    }
  }

  let event: SquareLaborEvent;
  try {
    event = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  // Only handle labor shift events
  if (!event.type?.startsWith("labor.shift.")) {
    return NextResponse.json({ ok: true, skipped: event.type });
  }

  const shift = event.data?.object?.shift;
  if (!shift) return NextResponse.json({ ok: true, skipped: "no shift payload" });

  const db = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );

  // Map Square location GUID → CashCall location_id
  const squareLocationId = shift.location_id ?? event.location_id ?? "";
  const { data: posConn } = await db.from("pos_connections")
    .select("location_id")
    .eq("pos_type", "square")
    .eq("square_location_id", squareLocationId)
    .maybeSingle();

  if (!posConn) {
    return NextResponse.json({ ok: true, skipped: `no pos_connection for Square location ${squareLocationId}` });
  }

  const locationId   = posConn.location_id;
  const shiftDate    = (shift.start_at ?? "").slice(0, 10);
  const hourlyRate   = squareMoney(shift.wage?.hourly_rate?.amount);
  const jobTitle     = shift.wage?.title ?? "Team Member";
  const teamMemberId = shift.team_member_id ?? shift.employee_id ?? shift.id;

  // Compute hours worked
  let hoursWorked   = 0;
  let overtimeHours = 0;
  if (shift.status === "CLOSED" && shift.start_at && shift.end_at) {
    const ms = new Date(shift.end_at).getTime() - new Date(shift.start_at).getTime();
    const breakMin = shift.total_break_time_minutes ?? 0;
    hoursWorked    = Math.max(0, ms / 3_600_000 - breakMin / 60);
    overtimeHours  = Math.max(0, hoursWorked - 8); // daily OT threshold
  }

  if (event.type === "labor.shift.deleted") {
    await db.from("pos_labor_events")
      .delete()
      .eq("location_id", locationId)
      .eq("external_shift_id", shift.id);
    return NextResponse.json({ ok: true, deleted: shift.id });
  }

  await db.from("pos_labor_events").upsert({
    location_id: locationId,
    external_shift_id: shift.id,
    employee_name: teamMemberId, // Square doesn't send names in shift payload — use ID
    job_title: jobTitle,
    clock_in_at: shift.start_at ?? null,
    clock_out_at: shift.end_at ?? null,
    hours_worked: hoursWorked,
    overtime_hours: overtimeHours,
    hourly_rate: hourlyRate,
    source: "square_webhook",
    work_date: shiftDate,
  }, { onConflict: "location_id,external_shift_id" });

  // Overtime leakage alert (spec: flag shifts where OT pushed cost past threshold)
  if (overtimeHours > 0 && hourlyRate > 0) {
    const overtimeCost = overtimeHours * hourlyRate * 1.5;
    if (overtimeCost > 25) {
      await db.from("labor_alerts").upsert({
        location_id: locationId,
        alert_date: shiftDate,
        alert_type: "overtime_leakage",
        employee_name: teamMemberId,
        job_title: jobTitle,
        overtime_hours: overtimeHours,
        overtime_cost: overtimeCost,
        source: "square_webhook",
      }, { onConflict: "location_id,external_shift_id,alert_type" }).then(() => {});
    }
  }

  return NextResponse.json({ ok: true, shift: shift.id, status: shift.status, hoursWorked });
}
