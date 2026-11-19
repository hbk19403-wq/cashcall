export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

const GUSTO_CLIENT_ID     = process.env.GUSTO_CLIENT_ID!;
const GUSTO_CLIENT_SECRET = process.env.GUSTO_CLIENT_SECRET!;
const GUSTO_SANDBOX       = process.env.GUSTO_SANDBOX === "true";
const API_BASE            = GUSTO_SANDBOX ? "https://api.gusto-demo.com" : "https://api.gusto.com";
const TOKEN_URL           = GUSTO_SANDBOX ? "https://api.gusto-demo.com/oauth/token" : "https://api.gusto.com/oauth/token";

async function gustoFetch(token: string, path: string) {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
  });
  if (!res.ok) throw new Error(`Gusto ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return res.json();
}

async function refreshToken(conn: Record<string, string>, supabase: Awaited<ReturnType<typeof createClient>>) {
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type:    "refresh_token",
      refresh_token: conn.refresh_token,
      client_id:     GUSTO_CLIENT_ID,
      client_secret: GUSTO_CLIENT_SECRET,
    }),
  });
  if (!res.ok) throw new Error("Token refresh failed");
  const t = await res.json() as { access_token: string; refresh_token: string; expires_in: number };
  const expiresAt = new Date(Date.now() + t.expires_in * 1000).toISOString();
  await supabase.from("payroll_connections").update({
    access_token:     t.access_token,
    refresh_token:    t.refresh_token,
    token_expires_at: expiresAt,
  }).eq("id", conn.id);
  return t.access_token;
}

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { location_id, months_back = 3 } = await req.json() as { location_id: string; months_back?: number };

  // Get connection
  const { data: conn } = await supabase
    .from("payroll_connections")
    .select("*")
    .eq("location_id", location_id)
    .eq("provider", "gusto")
    .single();

  if (!conn?.access_token) {
    return NextResponse.json({ error: "Gusto not connected for this location" }, { status: 400 });
  }

  // Refresh token if expired
  let token = conn.access_token;
  if (conn.token_expires_at && new Date(conn.token_expires_at) < new Date()) {
    token = await refreshToken(conn, supabase);
  }

  try {
    // Get company ID
    const companyId = conn.provider_company_id;
    if (!companyId) throw new Error("No company ID stored — reconnect Gusto");

    // Fetch payroll runs
    const startDate = new Date();
    startDate.setMonth(startDate.getMonth() - months_back);
    const start = startDate.toISOString().slice(0, 10);
    const end   = new Date().toISOString().slice(0, 10);

    // Gusto: list processed payrolls
    const payrollsData = await gustoFetch(token,
      `/v1/companies/${companyId}/payrolls?processed=true&start_date=${start}&end_date=${end}`
    ) as { payrolls?: GustoPayroll[] } | GustoPayroll[];

    const payrolls: GustoPayroll[] = Array.isArray(payrollsData)
      ? payrollsData
      : (payrollsData as { payrolls?: GustoPayroll[] }).payrolls ?? [];

    interface GustoPayroll {
      payroll_uuid?: string;
      pay_period?: { start_date?: string; end_date?: string };
      processed_date?: string;
      check_date?: string;
      totals?: {
        gross_pay?: string;
        net_pay?: string;
        employee_taxes?: string;
        employer_taxes?: string;
        benefits?: string;
      };
      employee_compensations?: {
        employee_uuid?: string;
        fixed_compensations?: { amount?: string }[];
        hourly_compensations?: { hours?: string; compensation_multiplier?: number; amount?: string }[];
        employee_taxes?: { amount?: string }[];
        net_pay?: string;
        gross_pay?: string;
        employee?: { first_name?: string; last_name?: string };
      }[];
    }

    const rows = payrolls.map(p => ({
      location_id,
      disbursed_on: p.check_date ?? p.processed_date ?? new Date().toISOString().slice(0, 10),
      employee:     `Gusto payroll — ${p.employee_compensations?.length ?? 0} employees`,
      amount:       parseFloat(p.totals?.gross_pay ?? "0"),
      notes:        `Pay period ${p.pay_period?.start_date} to ${p.pay_period?.end_date} · Net: $${parseFloat(p.totals?.net_pay ?? "0").toFixed(2)}`,
    })).filter(r => r.amount > 0);

    if (rows.length) {
      // Upsert based on location_id + disbursed_on (won't duplicate)
      for (const row of rows) {
        await supabase.from("salary_disbursements").upsert(row, {
          onConflict: "location_id,disbursed_on,employee",
          ignoreDuplicates: false,
        });
      }
    }

    // Update last_synced
    await supabase.from("payroll_connections").update({
      last_synced: new Date().toISOString(),
      sync_error: null,
    }).eq("id", conn.id);

    return NextResponse.json({
      ok: true,
      synced: rows.length,
      payrolls: rows.length,
      message: `Synced ${rows.length} payroll run${rows.length !== 1 ? "s" : ""} from Gusto`,
    });

  } catch (err) {
    const msg = err instanceof Error ? err.message : "Gusto sync failed";
    await supabase.from("payroll_connections").update({ sync_error: msg }).eq("id", conn.id);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
