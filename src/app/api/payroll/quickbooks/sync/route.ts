export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

const QB_CLIENT_ID     = process.env.QB_CLIENT_ID!;
const QB_CLIENT_SECRET = process.env.QB_CLIENT_SECRET!;
const QB_TOKEN_URL     = "https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer";
const QB_API_BASE      = "https://quickbooks.api.intuit.com";

async function refreshQBToken(conn: Record<string, string>, supabase: Awaited<ReturnType<typeof createClient>>) {
  const credentials = Buffer.from(`${QB_CLIENT_ID}:${QB_CLIENT_SECRET}`).toString("base64");
  const res = await fetch(QB_TOKEN_URL, {
    method: "POST",
    headers: {
      "Content-Type":  "application/x-www-form-urlencoded",
      "Authorization": `Basic ${credentials}`,
    },
    body: new URLSearchParams({ grant_type: "refresh_token", refresh_token: conn.refresh_token }),
  });
  if (!res.ok) throw new Error("QB token refresh failed");
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

  const { data: conn } = await supabase
    .from("payroll_connections")
    .select("*")
    .eq("location_id", location_id)
    .eq("provider", "quickbooks")
    .single();

  if (!conn?.access_token) {
    return NextResponse.json({ error: "QuickBooks not connected for this location" }, { status: 400 });
  }

  let token = conn.access_token;
  if (conn.token_expires_at && new Date(conn.token_expires_at) < new Date()) {
    token = await refreshQBToken(conn, supabase);
  }

  try {
    const realmId = conn.provider_company_id;
    if (!realmId) throw new Error("No QB company (realmId) stored — reconnect QuickBooks");

    // QBO REST API: query payroll items / employee pay stubs
    // We use the JournalEntry or PayrollItem query to extract payroll expenses
    const startDate = new Date();
    startDate.setMonth(startDate.getMonth() - months_back);
    const start = startDate.toISOString().slice(0, 10);
    const end   = new Date().toISOString().slice(0, 10);

    // Query payroll journal entries (Payroll Liabilities / Payroll Expenses)
    const query = encodeURIComponent(
      `SELECT * FROM JournalEntry WHERE TxnDate >= '${start}' AND TxnDate <= '${end}' MAXRESULTS 200`
    );
    const jeRes = await fetch(
      `${QB_API_BASE}/v3/company/${realmId}/query?query=${query}&minorversion=65`,
      {
        headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
      }
    );

    if (!jeRes.ok) throw new Error(`QB API ${jeRes.status}: ${(await jeRes.text()).slice(0, 200)}`);
    const jeData = await jeRes.json() as {
      QueryResponse?: {
        JournalEntry?: {
          TxnDate?: string;
          TotalAmt?: number;
          Line?: { JournalEntryLineDetail?: { PostingType?: string; AccountRef?: { name?: string } }; Amount?: number }[];
          DocNumber?: string;
        }[];
      }
    };

    const entries = jeData.QueryResponse?.JournalEntry ?? [];

    // Filter to entries that look like payroll (account name contains "payroll" or "salary" or "wages")
    const rows: { location_id: string; disbursed_on: string; employee: string; amount: number; notes: string }[] = [];

    for (const je of entries) {
      for (const line of (je.Line ?? [])) {
        const acctName = (line.JournalEntryLineDetail?.AccountRef?.name ?? "").toLowerCase();
        const isPayroll = acctName.includes("payroll") || acctName.includes("salary") || acctName.includes("wage");
        if (isPayroll && (line.Amount ?? 0) > 0) {
          rows.push({
            location_id,
            disbursed_on: je.TxnDate ?? new Date().toISOString().slice(0, 10),
            employee:     line.JournalEntryLineDetail?.AccountRef?.name ?? "QuickBooks Payroll",
            amount:       line.Amount ?? 0,
            notes:        `QB Journal Entry #${je.DocNumber ?? je.TxnDate}`,
          });
        }
      }
    }

    if (rows.length) {
      for (const row of rows) {
        await supabase.from("salary_disbursements").upsert(row, {
          onConflict: "location_id,disbursed_on,employee",
          ignoreDuplicates: false,
        });
      }
    }

    await supabase.from("payroll_connections").update({
      last_synced: new Date().toISOString(),
      sync_error: null,
    }).eq("id", conn.id);

    return NextResponse.json({
      ok: true,
      synced: rows.length,
      message: `Synced ${rows.length} payroll entr${rows.length !== 1 ? "ies" : "y"} from QuickBooks`,
    });

  } catch (err) {
    const msg = err instanceof Error ? err.message : "QuickBooks sync failed";
    await supabase.from("payroll_connections").update({ sync_error: msg }).eq("id", conn.id);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
