export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createClient as createServiceClient } from "@supabase/supabase-js";

// ── 7shifts API ───────────────────────────────────────────────────────────────
// https://developers.7shifts.com/reference/getting-started
const SEVEN_SHIFTS_API = "https://api.7shifts.com/v2";

interface SevenShiftsShift {
  id: number;
  user_id: number;
  role_id: number;
  start: string;   // ISO
  end:   string;   // ISO
  hours: number;
  close: boolean;  // true = completed
  status: string;  // published | draft | deleted
}

interface SevenShiftsTimesheet {
  id: number;
  user_id: number;
  role_id: number;
  shift_date: string; // YYYY-MM-DD
  clocked_in: string;
  clocked_out: string;
  hours_worked: number;
  wages: number;      // total wages for this punch
}

interface SevenShiftsRole {
  id: number;
  name: string;
  wage: number; // hourly
  station_type: "foh" | "boh" | "unknown";
}

async function sevenFetch(apiKey: string, path: string): Promise<unknown> {
  const res = await fetch(`${SEVEN_SHIFTS_API}${path}`, {
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`7shifts API ${res.status}: ${body.slice(0, 300)}`);
  }
  return res.json();
}

async function getLocationId(apiKey: string, locationCode: string): Promise<number | null> {
  const res = await sevenFetch(apiKey, "/locations") as { data?: Array<{ id: number; name: string }> };
  const locs = res?.data ?? [];
  // Match by name or external code
  const match = locs.find(l =>
    l.name.toLowerCase().includes(locationCode.toLowerCase()) ||
    String(l.id) === locationCode
  );
  return match?.id ?? null;
}

// ── POST /api/labor/sevenShifts — sync scheduled vs actual hours ──────────────
export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { location_id, start_date, end_date, demo = false } =
    await req.json() as { location_id: string; start_date: string; end_date: string; demo?: boolean };

  if (!location_id) return NextResponse.json({ error: "location_id required" }, { status: 400 });

  const { data: loc } = await supabase.from("locations")
    .select("id,name").eq("id", location_id).eq("user_id", user.id).single();
  if (!loc) return NextResponse.json({ error: "Location not found" }, { status: 404 });

  const db = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );

  const { data: conn } = await db
    .from("labor_scheduler_connections")
    .select("api_key, location_code")
    .eq("location_id", location_id)
    .eq("provider", "7shifts")
    .single();

  // ── Demo mode ─────────────────────────────────────────────────────────────
  if (demo || !conn?.api_key) {
    const demoData = generateDemoLaborData(start_date, end_date);
    await upsertLaborInsights(db, location_id, demoData);
    return NextResponse.json({ ok: true, demo: true, ...demoData.summary });
  }

  // ── Live 7shifts API ───────────────────────────────────────────────────────
  try {
    const sevenShiftsLocationId = await getLocationId(conn.api_key, conn.location_code);
    if (!sevenShiftsLocationId) {
      return NextResponse.json({ error: "Location not found in 7shifts. Check your Location ID." }, { status: 400 });
    }

    // Fetch timesheets (actual clocked hours)
    const tsRes = await sevenFetch(conn.api_key,
      `/timesheets?location_id=${sevenShiftsLocationId}&from=${start_date}&to=${end_date}&limit=500`
    ) as { data?: SevenShiftsTimesheet[] };
    const timesheets = tsRes?.data ?? [];

    // Fetch scheduled shifts
    const shiftRes = await sevenFetch(conn.api_key,
      `/shifts?location_id=${sevenShiftsLocationId}&start_date=${start_date}&end_date=${end_date}&limit=500`
    ) as { data?: SevenShiftsShift[] };
    const shifts = shiftRes?.data ?? [];

    // Fetch roles for FOH/BOH classification
    const roleRes = await sevenFetch(conn.api_key,
      `/roles?location_id=${sevenShiftsLocationId}`
    ) as { data?: SevenShiftsRole[] };
    const roleMap = new Map((roleRes?.data ?? []).map(r => [r.id, r]));

    // Aggregate by day
    const byDate: Record<string, {
      scheduled_hours: number; actual_hours: number;
      scheduled_labor_cost: number; actual_labor_cost: number;
      foh_hours: number; boh_hours: number;
    }> = {};

    for (const ts of timesheets) {
      const date = ts.shift_date;
      if (!byDate[date]) byDate[date] = { scheduled_hours: 0, actual_hours: 0, scheduled_labor_cost: 0, actual_labor_cost: 0, foh_hours: 0, boh_hours: 0 };
      byDate[date].actual_hours      += ts.hours_worked;
      byDate[date].actual_labor_cost += ts.wages;
      const role = roleMap.get(ts.role_id);
      if (role?.station_type === "foh") byDate[date].foh_hours += ts.hours_worked;
      else                              byDate[date].boh_hours += ts.hours_worked;
    }

    for (const sh of shifts) {
      if (sh.status === "deleted") continue;
      const date = sh.start.slice(0, 10);
      if (!byDate[date]) byDate[date] = { scheduled_hours: 0, actual_hours: 0, scheduled_labor_cost: 0, actual_labor_cost: 0, foh_hours: 0, boh_hours: 0 };
      byDate[date].scheduled_hours      += sh.hours;
      const role = roleMap.get(sh.role_id);
      byDate[date].scheduled_labor_cost += sh.hours * (role?.wage ?? 15);
    }

    const daysData = { byDate, summary: computeSummary(byDate) };
    await upsertLaborInsights(db, location_id, daysData);

    await db.from("labor_scheduler_connections")
      .update({ last_synced: new Date().toISOString(), sync_status: "ok", sync_error: null })
      .eq("location_id", location_id).eq("provider", "7shifts");

    return NextResponse.json({ ok: true, demo: false, ...daysData.summary });
  } catch (err) {
    await db.from("labor_scheduler_connections")
      .update({ sync_status: "error", sync_error: (err as Error).message })
      .eq("location_id", location_id).eq("provider", "7shifts");

    return NextResponse.json({ error: (err as Error).message }, { status: 502 });
  }
}

// ── GET — connection status ───────────────────────────────────────────────────
export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const locationId = req.nextUrl.searchParams.get("location_id");
  if (!locationId) return NextResponse.json({ error: "location_id required" }, { status: 400 });

  const db = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );
  const { data } = await db.from("labor_scheduler_connections")
    .select("last_synced, sync_status, sync_error, location_code")
    .eq("location_id", locationId).eq("provider", "7shifts").single();

  return NextResponse.json({
    connected:   !!data?.location_code,
    last_synced: data?.last_synced ?? null,
    status:      data?.sync_status ?? null,
    error:       data?.sync_error  ?? null,
  });
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function computeSummary(byDate: Record<string, { scheduled_hours: number; actual_hours: number; scheduled_labor_cost: number; actual_labor_cost: number }>) {
  let totalScheduledHours = 0, totalActualHours = 0;
  let totalScheduledCost  = 0, totalActualCost  = 0;
  for (const d of Object.values(byDate)) {
    totalScheduledHours += d.scheduled_hours;
    totalActualHours    += d.actual_hours;
    totalScheduledCost  += d.scheduled_labor_cost;
    totalActualCost     += d.actual_labor_cost;
  }
  return { totalScheduledHours, totalActualHours, totalScheduledCost, totalActualCost, days: Object.keys(byDate).length };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function upsertLaborInsights(
  db: any,
  locationId: string,
  data: {
    byDate: Record<string, { scheduled_hours: number; actual_hours: number; scheduled_labor_cost: number; actual_labor_cost: number; foh_hours?: number; boh_hours?: number }>;
    summary: ReturnType<typeof computeSummary>;
  }
) {
  // Store daily schedule vs actual as JSONB in a new column on labor_data
  // For each week, upsert the 7shifts summary
  const rows = Object.entries(data.byDate).map(([date, d]) => ({
    location_id:    locationId,
    pay_period_start: date,
    scheduled_hours: d.scheduled_hours,
    actual_hours:    d.actual_hours,
    scheduled_labor_cost: d.scheduled_labor_cost,
    foh_hours: d.foh_hours ?? 0,
    boh_hours: d.boh_hours ?? 0,
    source: "7shifts",
  }));

  // Store in a lightweight snapshot table
  if (rows.length) {
    await db.from("labor_schedule_snapshots").upsert(rows, { onConflict: "location_id,pay_period_start" }).select();
  }
}

// ── Demo data ─────────────────────────────────────────────────────────────────
function generateDemoLaborData(start: string, end: string) {
  const byDate: Record<string, { scheduled_hours: number; actual_hours: number; scheduled_labor_cost: number; actual_labor_cost: number; foh_hours: number; boh_hours: number }> = {};
  const cur = new Date(start);
  while (cur <= new Date(end)) {
    const date = cur.toISOString().slice(0, 10);
    const isWeekend = cur.getDay() === 0 || cur.getDay() === 6;
    const baseHours = isWeekend ? 48 + Math.random() * 16 : 36 + Math.random() * 12;
    const variance = (Math.random() - 0.4) * 4; // slight over-schedule bias
    const actualHours = Math.max(0, baseHours + variance);
    byDate[date] = {
      scheduled_hours: Math.round(baseHours * 10) / 10,
      actual_hours:    Math.round(actualHours * 10) / 10,
      scheduled_labor_cost: Math.round(baseHours   * 16.5 * 100) / 100,
      actual_labor_cost:    Math.round(actualHours * 16.5 * 100) / 100,
      foh_hours: Math.round(actualHours * 0.55 * 10) / 10,
      boh_hours: Math.round(actualHours * 0.45 * 10) / 10,
    };
    cur.setDate(cur.getDate() + 1);
  }
  return { byDate, summary: computeSummary(byDate) };
}
