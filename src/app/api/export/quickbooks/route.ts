export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createClient as createServiceClient } from "@supabase/supabase-js";

// ── POST /api/export/quickbooks ───────────────────────────────────────────────
// Push CashCall P&L data to QuickBooks Online as Journal Entries.
// Requires an active payroll_connections row for 'quickbooks' with an
// OAuth access_token and provider_company_id (realmId).
//
// Journal Entry structure:
//   CREDIT  Revenue (Undeposited Funds / Sales of Product Income)
//   DEBIT   Food Cost (Cost of Goods Sold)
//   DEBIT   Labor (Payroll Expense)
//   DEBIT   Infrastructure (Operating Expenses)
//   CREDIT  Net Profit — remainder goes to Retained Earnings / Owners Equity

const QB_API_BASE  = "https://quickbooks.api.intuit.com";
const QB_TOKEN_URL = "https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer";

interface QBAccount {
  Id: string;
  Name: string;
  AccountType: string;
  AccountSubType?: string;
}

type Supabase = Awaited<ReturnType<typeof createClient>>;

async function refreshQBToken(conn: Record<string, string>, db: Supabase) {
  const creds = Buffer.from(`${process.env.QB_CLIENT_ID}:${process.env.QB_CLIENT_SECRET}`).toString("base64");
  const res = await fetch(QB_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", "Authorization": `Basic ${creds}` },
    body: new URLSearchParams({ grant_type: "refresh_token", refresh_token: conn.refresh_token }),
  });
  if (!res.ok) throw new Error("QB token refresh failed");
  const t = await res.json() as { access_token: string; refresh_token: string; expires_in: number };
  await db.from("payroll_connections").update({
    access_token:     t.access_token,
    refresh_token:    t.refresh_token,
    token_expires_at: new Date(Date.now() + t.expires_in * 1000).toISOString(),
  }).eq("id", conn.id);
  return t.access_token;
}

async function qbQuery(realmId: string, token: string, query: string): Promise<unknown> {
  const res = await fetch(
    `${QB_API_BASE}/v3/company/${realmId}/query?query=${encodeURIComponent(query)}&minorversion=65`,
    { headers: { "Authorization": `Bearer ${token}`, "Accept": "application/json" } }
  );
  if (!res.ok) throw new Error(`QB API ${res.status}`);
  return res.json();
}

async function qbCreate(realmId: string, token: string, entity: string, body: object): Promise<unknown> {
  const res = await fetch(
    `${QB_API_BASE}/v3/company/${realmId}/${entity.toLowerCase()}?minorversion=65`,
    {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${token}`,
        "Content-Type": "application/json",
        "Accept": "application/json",
      },
      body: JSON.stringify(body),
    }
  );
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`QB ${entity} create failed ${res.status}: ${err.slice(0, 300)}`);
  }
  return res.json();
}

// Find or create a QB account by name + type
async function findAccount(realmId: string, token: string, name: string, type: string, subType: string): Promise<string> {
  const res = await qbQuery(realmId, token,
    `SELECT Id FROM Account WHERE Name = '${name.replace(/'/g, "\\'")}' AND AccountType = '${type}'`
  ) as { QueryResponse?: { Account?: QBAccount[] } };

  const existing = res?.QueryResponse?.Account?.[0];
  if (existing) return existing.Id;

  // Create the account
  const created = await qbCreate(realmId, token, "Account", {
    Name: name, AccountType: type, AccountSubType: subType,
  }) as { Account?: { Id: string } };

  return created?.Account?.Id ?? "1";
}

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { location_id, start_date, end_date } =
    await req.json() as { location_id: string; start_date: string; end_date: string };

  if (!location_id || !start_date || !end_date) {
    return NextResponse.json({ error: "location_id, start_date, end_date required" }, { status: 400 });
  }

  // Verify location ownership
  const { data: loc } = await supabase.from("locations")
    .select("id,name").eq("id", location_id).eq("user_id", user.id).single();
  if (!loc) return NextResponse.json({ error: "Location not found" }, { status: 404 });

  const db = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );

  // Get QB connection
  const { data: conn } = await db.from("payroll_connections")
    .select("*").eq("location_id", location_id).eq("provider", "quickbooks").single();

  if (!conn?.access_token) {
    return NextResponse.json({ error: "QuickBooks not connected. Connect QuickBooks in Settings → Integrations first." }, { status: 400 });
  }

  let token = conn.access_token as string;
  if (conn.token_expires_at && new Date(conn.token_expires_at as string) < new Date()) {
    token = await refreshQBToken(conn as Record<string, string>, supabase);
  }

  const realmId = conn.provider_company_id as string;
  if (!realmId) return NextResponse.json({ error: "No QB company ID stored — reconnect QuickBooks" }, { status: 400 });

  // ── Pull CashCall P&L data ─────────────────────────────────────────────────
  const { data: sales } = await db.from("daily_sales").select("*")
    .eq("location_id", location_id)
    .gte("delivery_date", start_date)
    .lte("delivery_date", end_date);

  const { data: food } = await db.from("food_data").select("*")
    .eq("location_id", location_id)
    .gte("week_start", start_date)
    .lte("week_start", end_date);

  const { data: labor } = await db.from("labor_data").select("*")
    .eq("location_id", location_id)
    .gte("pay_period_start", start_date)
    .lte("pay_period_start", end_date);

  const { data: infra } = await db.from("infrastructure_costs").select("*")
    .eq("location_id", location_id)
    .gte("month", start_date.slice(0, 7))
    .lte("month", end_date.slice(0, 7));

  const n = (v: number | undefined | null) => v ?? 0;

  const totalRevenue = (sales ?? []).reduce((s, r) =>
    s + n(r.cash_sales) + n(r.pos_sales) + n(r.uber_eats_gross) + n(r.grubhub_gross) + n(r.doordash_gross) + n(r.catering_sales), 0);

  const totalFoodCost  = (food  ?? []).reduce((s, r) => s + n(r.total_food_cost), 0);
  const totalLaborCost = (labor ?? []).reduce((s, r) => s + n(r.total_labor_cost), 0);
  const totalInfra     = (infra ?? []).reduce((s, r) =>
    s + n(r.rent) + n(r.utilities) + n(r.insurance) + n(r.repairs) + n(r.other), 0);

  const netProfit = totalRevenue - totalFoodCost - totalLaborCost - totalInfra;

  if (totalRevenue === 0) {
    return NextResponse.json({ error: "No revenue data found for this period" }, { status: 400 });
  }

  // ── Ensure QB accounts exist ───────────────────────────────────────────────
  const [revenueAcctId, foodAcctId, laborAcctId, infraAcctId, retainedAcctId] = await Promise.all([
    findAccount(realmId, token, "CashCall Sales Revenue",          "Income",   "SalesOfProductIncome"),
    findAccount(realmId, token, "CashCall Food Cost (COGS)",       "Cost of Goods Sold", "SuppliesMaterialsCogs"),
    findAccount(realmId, token, "CashCall Labor Expense",          "Expense",  "PayrollExpenses"),
    findAccount(realmId, token, "CashCall Infrastructure Expense", "Expense",  "OtherMiscellaneousExpense"),
    findAccount(realmId, token, "Retained Earnings",               "Equity",   "RetainedEarnings"),
  ]);

  // ── Build Journal Entry ────────────────────────────────────────────────────
  const lines: Array<{
    LineNum: number; Amount: number;
    DetailType: string;
    JournalEntryLineDetail: { PostingType: string; AccountRef: { value: string; name: string } };
    Description: string;
  }> = [];
  let lineNum = 1;

  // Revenue (Credit)
  lines.push({
    LineNum: lineNum++, Amount: totalRevenue,
    DetailType: "JournalEntryLineDetail",
    JournalEntryLineDetail: {
      PostingType: "Credit",
      AccountRef: { value: revenueAcctId, name: "CashCall Sales Revenue" },
    },
    Description: `${loc.name} Revenue ${start_date} – ${end_date}`,
  });

  // Food Cost (Debit)
  if (totalFoodCost > 0) {
    lines.push({
      LineNum: lineNum++, Amount: totalFoodCost,
      DetailType: "JournalEntryLineDetail",
      JournalEntryLineDetail: {
        PostingType: "Debit",
        AccountRef: { value: foodAcctId, name: "CashCall Food Cost (COGS)" },
      },
      Description: `${loc.name} Food Cost`,
    });
  }

  // Labor (Debit)
  if (totalLaborCost > 0) {
    lines.push({
      LineNum: lineNum++, Amount: totalLaborCost,
      DetailType: "JournalEntryLineDetail",
      JournalEntryLineDetail: {
        PostingType: "Debit",
        AccountRef: { value: laborAcctId, name: "CashCall Labor Expense" },
      },
      Description: `${loc.name} Labor`,
    });
  }

  // Infrastructure (Debit)
  if (totalInfra > 0) {
    lines.push({
      LineNum: lineNum++, Amount: totalInfra,
      DetailType: "JournalEntryLineDetail",
      JournalEntryLineDetail: {
        PostingType: "Debit",
        AccountRef: { value: infraAcctId, name: "CashCall Infrastructure Expense" },
      },
      Description: `${loc.name} Overhead & Infrastructure`,
    });
  }

  // Net — balance entry (Debit if profit, Credit if loss)
  if (Math.abs(netProfit) > 0.01) {
    lines.push({
      LineNum: lineNum++, Amount: Math.abs(netProfit),
      DetailType: "JournalEntryLineDetail",
      JournalEntryLineDetail: {
        PostingType: netProfit >= 0 ? "Credit" : "Debit",
        AccountRef: { value: retainedAcctId, name: "Retained Earnings" },
      },
      Description: netProfit >= 0 ? `${loc.name} Net Profit` : `${loc.name} Net Loss`,
    });
  }

  const journalEntry = {
    TxnDate: end_date,
    DocNumber: `CC-${loc.name.replace(/\s+/g, "").slice(0, 6).toUpperCase()}-${start_date.replace(/-/g, "")}`,
    PrivateNote: `Imported from CashCall for ${loc.name} (${start_date} to ${end_date})`,
    Line: lines,
  };

  const result = await qbCreate(realmId, token, "JournalEntry", journalEntry) as { JournalEntry?: { Id: string; DocNumber: string } };

  return NextResponse.json({
    ok: true,
    journal_entry_id:  result?.JournalEntry?.Id,
    doc_number:        result?.JournalEntry?.DocNumber,
    summary: {
      revenue: totalRevenue, foodCost: totalFoodCost,
      laborCost: totalLaborCost, infra: totalInfra, netProfit,
    },
  });
}
