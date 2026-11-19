export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createClient as createServiceClient } from "@supabase/supabase-js";
import { createHash } from "crypto";

// ── ADP Payroll & Labor Sync ──────────────────────────────────────────────────
// Fetches daily timecards from ADP and normalizes them into labor_entries.
//
// Key design decisions:
//   • Business-date mapping: shifts that cross midnight are attributed to the
//     business day defined by the restaurant's configured "close of business"
//     hour (default 03:00 local time). A shift clocking out at 02:30 AM still
//     belongs to the previous calendar day.
//   • Idempotency: each row in labor_entries is keyed by
//     (location_id, business_date, source_provider). Concurrent syncs are safe.
//   • Open shifts: shifts with no outTime are recorded with open_shifts++.
//     They are re-fetched on the next sync and reconciled once closed.
//   • Retro adjustments: ADP sends an updatedDateTime on revised timecards.
//     We detect these and increment retro_adjustments so dashboards can flag
//     "this day's labor was revised."
//   • Token refresh: ADP access tokens expire in 1 hour. We refresh proactively
//     if token_expires_at is within 5 minutes of expiry.
//   • Circuit breaker: 3 consecutive 401s set needs_reconnect = true.
// ─────────────────────────────────────────────────────────────────────────────

const API_BASE = "https://api.adp.com";

// Employer tax burden estimate — 7.65% FICA + 0.6% FUTA + ~2% SUTA avg
const EMPLOYER_TAX_RATE = 0.1065;

interface ADPTimecard {
  timecardID:        { idValue: string };
  worker:            { associateOID: string; workerDates?: { originalHireDate?: string } };
  timeCardsEntry?:   ADPTimecardEntry[];
  payPeriod?:        { startDate: string; endDate: string };
  status?:           { codeValue: string };
  creationDateTime?: string;
  lastUpdateDateTime?: string;
}

interface ADPTimecardEntry {
  entryDate:        string;         // YYYY-MM-DD
  timePairs?:       ADPTimePair[];
  laborAllocations?: ADPLaborAllocation[];
}

interface ADPTimePair {
  id:               string;
  entryDate:        string;
  startDateTime?:   string;        // ISO 8601
  endDateTime?:     string;        // ISO 8601 or null = open shift
  punchTypeCode?:   { codeValue: string };
  actualHours?:     number;        // decimal hours
  payRateCode?:     { codeValue: string };
  itemID?:          string;
}

interface ADPLaborAllocation {
  allocationCode:   { codeValue: string };
  actualHours:      number;
  regularHours:     number;
  overtimeHours:    number;
  doubletimeHours?: number;
  basePayRate?:     number;         // hourly rate
  regularPay?:      number;
  overtimePay?:     number;
  tippedWages?:     number;
}

// Determine the business date for a shift punch.
// Punches between midnight and closeHour (default 3AM) belong to the previous day.
function businessDate(isoDatetime: string | undefined, locationTz: string, closeHour = 3): string {
  if (!isoDatetime) return new Date().toISOString().slice(0, 10);
  try {
    const dt = new Date(isoDatetime);
    // Convert to restaurant local time
    const localStr = dt.toLocaleString("en-US", { timeZone: locationTz });
    const local = new Date(localStr);
    if (local.getHours() < closeHour) {
      // Before close-of-business hour → belongs to previous calendar day
      local.setDate(local.getDate() - 1);
    }
    return local.toISOString().slice(0, 10);
  } catch {
    return isoDatetime.slice(0, 10);
  }
}

function idempotencyKey(locationId: string, date: string, provider: string): string {
  return createHash("sha256").update(`${provider}:${locationId}:${date}`).digest("hex").slice(0, 32);
}

async function refreshTokenIfNeeded(
  supabase: ReturnType<typeof createServiceClient>,
  conn: { id: string; access_token: string; refresh_token: string; token_expires_at: string }
): Promise<string> {
  const expiresAt = new Date(conn.token_expires_at).getTime();
  const fiveMinutes = 5 * 60 * 1000;
  if (Date.now() + fiveMinutes < expiresAt) {
    return conn.access_token; // still valid
  }

  const ADP_CLIENT_ID     = process.env.ADP_CLIENT_ID!;
  const ADP_CLIENT_SECRET = process.env.ADP_CLIENT_SECRET!;

  const res = await fetch("https://accounts.adp.com/auth/oauth/v2/token", {
    method: "POST",
    headers: {
      "Content-Type":  "application/x-www-form-urlencoded",
      "Authorization": "Basic " + Buffer.from(`${ADP_CLIENT_ID}:${ADP_CLIENT_SECRET}`).toString("base64"),
    },
    body: new URLSearchParams({
      grant_type:    "refresh_token",
      refresh_token:  conn.refresh_token,
    }),
  });

  if (!res.ok) throw new Error(`ADP token refresh failed: ${res.status}`);

  const data = await res.json() as { access_token: string; refresh_token: string; expires_in: number };
  const newExpiry = new Date(Date.now() + data.expires_in * 1000).toISOString();

  // Persist refreshed token
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (supabase as any).from("adp_connections").update({
    access_token:     data.access_token,
    refresh_token:    data.refresh_token,
    token_expires_at: newExpiry,
    token_refreshed_at: new Date().toISOString(),
  }).eq("id", conn.id);

  return data.access_token;
}

// Fetch timecards for a date range from ADP
async function fetchTimecards(
  token: string,
  companyCode: string,
  startDate: string,
  endDate: string
): Promise<ADPTimecard[]> {
  const url = `${API_BASE}/time/v2/workers/time-cards?$filter=timeCards/payPeriod/startDate ge '${startDate}' and timeCards/payPeriod/endDate le '${endDate}'`;
  const res = await fetch(url, {
    headers: {
      Authorization:   `Bearer ${token}`,
      "X-Company-Code": companyCode,
      Accept:           "application/json;masked=false",
    },
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`ADP API ${res.status}: ${body.slice(0, 300)}`);
  }

  const data = await res.json() as { timeCards?: ADPTimecard[] };
  return data.timeCards ?? [];
}

// Aggregate timecards into per-day labor totals
function aggregateByDate(
  timecards: ADPTimecard[],
  locationTz: string,
  closeHour: number
): Map<string, {
  regularHours: number; overtimeHours: number; doubletimeHours: number;
  regularWages: number; overtimeWages: number; tippedWages: number;
  totalShifts: number;  openShifts: number;    retroAdjustments: number;
}> {
  const days = new Map<string, ReturnType<typeof aggregateByDate> extends Map<string, infer V> ? V : never>();

  for (const card of timecards) {
    const isRetro = card.lastUpdateDateTime && card.creationDateTime &&
                    card.lastUpdateDateTime !== card.creationDateTime;

    for (const entry of (card.timeCardsEntry ?? [])) {
      for (const pair of (entry.timePairs ?? [])) {
        const bDate = businessDate(pair.startDateTime, locationTz, closeHour);
        if (!days.has(bDate)) {
          days.set(bDate, {
            regularHours: 0, overtimeHours: 0, doubletimeHours: 0,
            regularWages: 0, overtimeWages: 0, tippedWages: 0,
            totalShifts: 0, openShifts: 0, retroAdjustments: 0,
          });
        }
        const day = days.get(bDate)!;
        day.totalShifts++;
        if (isRetro) day.retroAdjustments++;
        if (!pair.endDateTime) day.openShifts++;  // open shift (no clock-out yet)
      }

      for (const alloc of (entry.laborAllocations ?? [])) {
        const bDate = entry.entryDate; // labor allocations use calendar date
        if (!days.has(bDate)) {
          days.set(bDate, {
            regularHours: 0, overtimeHours: 0, doubletimeHours: 0,
            regularWages: 0, overtimeWages: 0, tippedWages: 0,
            totalShifts: 0, openShifts: 0, retroAdjustments: 0,
          });
        }
        const day = days.get(bDate)!;
        day.regularHours   += alloc.regularHours   ?? 0;
        day.overtimeHours  += alloc.overtimeHours  ?? 0;
        day.doubletimeHours += alloc.doubletimeHours ?? 0;
        day.regularWages   += alloc.regularPay     ?? 0;
        day.overtimeWages  += alloc.overtimePay    ?? 0;
        day.tippedWages    += alloc.tippedWages    ?? 0;
      }
    }
  }

  return days;
}

// ── Route handlers ────────────────────────────────────────────────────────────
export async function GET(req: NextRequest) { return syncHandler(req, null); }
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  return syncHandler(req, body);
}

async function syncHandler(req: NextRequest, body: Record<string, string> | null) {
  const session = await createClient();
  const { data: { user } } = await session.auth.getUser();
  const secret = process.env.CRON_SECRET;
  const isCron = !!secret && (
    req.headers.get("authorization") === `Bearer ${secret}` ||
    req.headers.get("x-cron-key") === secret
  );
  if (!user && !isCron) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = isCron && !user
    ? createServiceClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!,
        { auth: { persistSession: false } }
      )
    : session;

  const params     = req.nextUrl.searchParams;
  const locationId = params.get("location_id") ?? body?.location_id;
  const daysBack   = parseInt(params.get("days") ?? body?.days ?? "7", 10);
  const specificDate = params.get("date") ?? body?.date;
  const closeHour  = parseInt(params.get("close_hour") ?? "3", 10);

  // Resolve location IDs to sync
  let locationIds: string[] = [];
  if (locationId) {
    if (user) {
      const { data: owned } = await supabase.from("locations").select("id")
        .eq("id", locationId).eq("user_id", user.id).maybeSingle();
      if (!owned) return NextResponse.json({ error: "Location not found" }, { status: 404 });
    }
    locationIds = [locationId];
  } else if (isCron) {
    const { data: conns } = await supabase.from("adp_connections")
      .select("location_id").eq("status", "connected").eq("needs_reconnect", false);
    locationIds = (conns ?? []).map((c: { location_id: string }) => c.location_id);
  } else {
    return NextResponse.json({ error: "location_id required" }, { status: 400 });
  }

  let totalRows = 0;
  const errors: string[] = [];

  for (const locId of locationIds) {
    // Fetch ADP connection
    const { data: conn } = await supabase.from("adp_connections").select("*")
      .eq("location_id", locId).eq("status", "connected").single();
    if (!conn) { errors.push(`${locId}: no ADP connection`); continue; }
    if (conn.needs_reconnect) { errors.push(`${locId}: ADP token expired — operator must reconnect`); continue; }

    // Fetch restaurant timezone
    const { data: loc } = await supabase.from("locations").select("timezone,state").eq("id", locId).single();
    const tz = (loc as { timezone?: string; state?: string } | null)?.timezone ?? "America/New_York";

    try {
      // Refresh token if needed
      const token = await refreshTokenIfNeeded(supabase as unknown as ReturnType<typeof createServiceClient>, conn);

      // Calculate date range
      const endDate   = specificDate ?? new Date().toISOString().slice(0, 10);
      const startD    = new Date(endDate);
      startD.setDate(startD.getDate() - (specificDate ? 0 : daysBack - 1));
      const startDate = startD.toISOString().slice(0, 10);

      const timecards = await fetchTimecards(token, conn.company_code ?? "", startDate, endDate);
      const byDate    = aggregateByDate(timecards, tz, closeHour);

      for (const [date, agg] of Array.from(byDate.entries())) {
        const employerTaxes = (agg.regularWages + agg.overtimeWages) * EMPLOYER_TAX_RATE;
        const iKey = idempotencyKey(locId, date, "adp");

        const { error: upsertErr } = await supabase.from("labor_entries").upsert({
          location_id:        locId,
          business_date:      date,
          timezone:           tz,
          source_provider:    "adp",
          regular_hours:      agg.regularHours,
          overtime_hours:     agg.overtimeHours,
          doubletime_hours:   agg.doubletimeHours,
          regular_wages:      agg.regularWages,
          overtime_wages:     agg.overtimeWages,
          tipped_wages:       agg.tippedWages,
          employer_taxes:     employerTaxes,
          benefits_burden:    0, // enriched from benefits feeds separately
          total_shifts:       agg.totalShifts,
          open_shifts:        agg.openShifts,
          retro_adjustments:  agg.retroAdjustments,
          idempotency_key:    iKey,
        }, { onConflict: "location_id,business_date,source_provider" });

        if (!upsertErr) totalRows++;
        else errors.push(`${locId}/${date}: ${upsertErr.message}`);
      }

      await supabase.from("adp_connections").update({
        consecutive_errors: 0,
        last_synced: new Date().toISOString(),
        sync_error: null,
      }).eq("id", conn.id);

    } catch (e) {
      const errMsg = e instanceof Error ? e.message : "Unknown error";
      errors.push(`${locId}: ${errMsg}`);

      const is401 = errMsg.includes("401");
      const newErrors = (conn.consecutive_errors ?? 0) + 1;

      await supabase.from("adp_connections").update({
        sync_error:         errMsg,
        consecutive_errors: newErrors,
        last_error_at:      new Date().toISOString(),
        ...(is401 && newErrors >= 3 ? { needs_reconnect: true } : {}),
      }).eq("id", conn.id);

      // Route catastrophic payload failures to DLQ
      await supabase.from("pos_dlq").insert({
        provider:        "adp",
        location_id:     locId,
        event_type:      "batch_pull",
        raw_payload:     { error: errMsg, locationId: locId },
        error_code:      is401 ? "AUTH_401" : "SYNC_ERROR",
        error_detail:    errMsg,
        retry_count:     0,
        next_retry_at:   new Date(Date.now() + 5 * 60 * 1000).toISOString(), // retry in 5 min
      }).then(() => { /* DLQ insert failure is non-fatal */ }, () => { /* ignore */ });
    }
  }

  return NextResponse.json({
    ok: errors.length === 0,
    rows_upserted: totalRows,
    errors: errors.length ? errors : undefined,
  });
}
