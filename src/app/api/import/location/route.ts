export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import ExcelJS from "exceljs";

// ── helpers ────────────────────────────────────────────────────────────────────
function n(v: unknown): number | null {
  const x = parseFloat(String(v ?? ""));
  return isNaN(x) ? null : x;
}
function s(v: unknown): string | null {
  const x = String(v ?? "").trim();
  return x === "" || x === "null" || x === "undefined" ? null : x;
}
function d(v: unknown): string | null {
  if (!v) return null;
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  const x = String(v).trim();
  if (!x || x === "null") return null;
  // Accept YYYY-MM-DD or various Excel date formats
  const dt = new Date(x);
  if (isNaN(dt.getTime())) return null;
  return dt.toISOString().slice(0, 10);
}

function sheetToRows(ws: ExcelJS.Worksheet): Record<string, string>[] {
  const rows: Record<string, string>[] = [];
  const headers: string[] = [];
  ws.eachRow((row, idx) => {
    if (idx === 1) {
      row.eachCell((cell, col) => { headers[col - 1] = String(cell.value ?? "").trim().toLowerCase().replace(/\s+/g, "_"); });
      return;
    }
    const obj: Record<string, string> = {};
    row.eachCell((cell, col) => {
      const h = headers[col - 1];
      if (h) obj[h] = String(cell.value instanceof Date ? cell.value.toISOString().slice(0, 10) : (cell.value ?? "")).trim();
    });
    // Skip empty rows
    if (Object.values(obj).some(v => v !== "")) rows.push(obj);
  });
  return rows;
}

// ── POST /api/import/location ─────────────────────────────────────────────────
// Body: multipart form with fields: location_id, file (xlsx), preview (optional "true")
export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const formData = await req.formData();
  const locationId = s(formData.get("location_id"));
  const previewOnly = formData.get("preview") === "true";
  const file = formData.get("file") as File | null;

  if (!locationId || !file) return NextResponse.json({ error: "location_id and file required" }, { status: 400 });

  // Verify ownership
  const { data: loc } = await supabase.from("locations").select("id,name,code").eq("id", locationId).eq("user_id", user.id).single();
  if (!loc) return NextResponse.json({ error: "Location not found" }, { status: 404 });

  // Parse Excel
  const arrayBuf = await file.arrayBuffer();
  const wb = new ExcelJS.Workbook();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await wb.xlsx.load(Buffer.from(arrayBuf) as any);

  // Map sheet name → data
  const sheetData: Record<string, Record<string, string>[]> = {};
  wb.eachSheet(ws => {
    const key = ws.name.toLowerCase().replace(/[^a-z0-9]/g, "_").replace(/_+/g, "_");
    sheetData[key] = sheetToRows(ws);
  });

  // Summary counts for preview
  const summary: Record<string, number> = {};
  for (const [k, rows] of Object.entries(sheetData)) {
    summary[k] = rows.length;
  }

  if (previewOnly) {
    return NextResponse.json({
      location: { id: loc.id, name: loc.name, code: loc.code },
      sheets: Object.keys(sheetData),
      rowCounts: summary,
    });
  }

  // ── Upsert all sheets ──────────────────────────────────────────────────────
  const results: Record<string, { inserted: number; errors: string[] }> = {};

  // Helper to find rows by sheet name variants
  const getSheet = (...names: string[]) => {
    for (const n of names) {
      const k = n.toLowerCase().replace(/[^a-z0-9]/g, "_").replace(/_+/g, "_");
      if (sheetData[k]) return sheetData[k];
    }
    return [];
  };

  // 1. Daily Sales
  const salesRows = getSheet("Daily Sales", "daily_sales", "Sales");
  {
    const toInsert = salesRows.map(r => ({
      location_id: locationId,
      sale_date: d(r.sale_date),
      cash_sales: n(r.cash_sales) ?? 0,
      pos_sales: n(r.pos_sales) ?? 0,
      uber_eats_gross: n(r.uber_eats_gross) ?? 0,
      grubhub_gross: n(r.grubhub_gross) ?? 0,
      doordash_gross: n(r.doordash_gross) ?? 0,
      catering_sales: n(r.catering_sales) ?? 0,
      cash_tips: n(r.cash_tips) ?? 0,
      aggregator_commission: n(r.aggregator_commission) ?? 0,
      liquor_sales: n(r.liquor_sales) ?? 0,
      notes: s(r.notes),
    })).filter(r => r.sale_date);
    const errs: string[] = [];
    let inserted = 0;
    const CHUNK = 100;
    for (let i = 0; i < toInsert.length; i += CHUNK) {
      const { error } = await supabase.from("daily_sales").upsert(toInsert.slice(i, i + CHUNK), { onConflict: "location_id,sale_date" });
      if (error) errs.push(error.message); else inserted += toInsert.slice(i, i + CHUNK).length;
    }
    results.daily_sales = { inserted, errors: errs };
  }

  // 2. Food Deliveries
  const deliveryRows = getSheet("Food Deliveries", "food_deliveries");
  const invoiceToDbId: Record<string, string> = {};
  {
    const toInsert = deliveryRows.map(r => ({
      location_id: locationId,
      delivery_date: d(r.delivery_date),
      vendor: s(r.vendor) ?? "Unknown",
      invoice_number: s(r.invoice_number),
      category: s(r.category),
      amount: n(r.amount) ?? 0,
      payment_status: s(r.payment_status) ?? "pending",
      paid_on: d(r.paid_on),
      payment_method: s(r.payment_method),
      cheque_number: s(r.cheque_number),
      notes: s(r.notes),
    })).filter(r => r.delivery_date);
    const errs: string[] = [];
    let inserted = 0;
    for (const row of toInsert) {
      const { data, error } = await supabase.from("food_deliveries")
        .upsert(row, { onConflict: "location_id,invoice_number" })
        .select("id,invoice_number").single();
      if (error) { errs.push(error.message); continue; }
      if (data && row.invoice_number) invoiceToDbId[row.invoice_number] = data.id;
      inserted++;
    }
    results.food_deliveries = { inserted, errors: errs };
  }

  // 3. Invoice Line Items
  const lineItemRows = getSheet("Invoice Line Items", "invoice_line_items");
  {
    // We need the food_delivery_id for each line item
    // Either from our just-built map, or by querying existing deliveries
    if (Object.keys(invoiceToDbId).length === 0) {
      // Fetch all delivery IDs for this location
      const { data: deliveries } = await supabase.from("food_deliveries")
        .select("id,invoice_number").eq("location_id", locationId);
      for (const d of (deliveries ?? [])) {
        if (d.invoice_number) invoiceToDbId[d.invoice_number] = d.id;
      }
    }
    const toInsert = lineItemRows.map(r => {
      const fdId = invoiceToDbId[s(r.invoice_number) ?? ""];
      if (!fdId) return null;
      return {
        food_delivery_id: fdId,
        name: s(r.name) ?? "Unknown",
        qty: n(r.qty),
        unit: s(r.unit),
        unit_price: n(r.unit_price),
        total: n(r.total),
        category: s(r.category),
      };
    }).filter(Boolean) as Record<string, unknown>[];
    const errs: string[] = [];
    let inserted = 0;
    const CHUNK = 200;
    for (let i = 0; i < toInsert.length; i += CHUNK) {
      const { error } = await supabase.from("invoice_line_items").insert(toInsert.slice(i, i + CHUNK));
      if (error) errs.push(error.message); else inserted += toInsert.slice(i, i + CHUNK).length;
    }
    results.invoice_line_items = { inserted, errors: errs };
  }

  // 4. Payroll Entries
  const payrollRows = getSheet("Payroll Entries", "payroll_entries", "Payroll");
  const payDateToId: Record<string, string> = {};
  {
    const toInsert = payrollRows.map(r => ({
      location_id: locationId,
      period_start: d(r.period_start),
      period_end: d(r.period_end),
      pay_date: d(r.pay_date),
      gross_wages: n(r.gross_wages) ?? 0,
      employer_taxes: n(r.employer_taxes) ?? 0,
      net_wages: n(r.net_wages) ?? 0,
      employee_count: n(r.employee_count) ?? 0,
      source: s(r.source) ?? "manual",
      notes: s(r.notes),
    })).filter(r => r.pay_date && r.period_start);
    const errs: string[] = [];
    let inserted = 0;
    for (const row of toInsert) {
      const { data, error } = await supabase.from("payroll_entries")
        .upsert(row, { onConflict: "location_id,pay_date" })
        .select("id,pay_date").single();
      if (error) { errs.push(error.message); continue; }
      if (data && row.pay_date) payDateToId[row.pay_date] = data.id;
      inserted++;
    }
    results.payroll_entries = { inserted, errors: errs };
  }

  // 5. Payroll Line Items
  const payrollLineRows = getSheet("Payroll Line Items", "payroll_line_items");
  {
    if (Object.keys(payDateToId).length === 0) {
      const { data: entries } = await supabase.from("payroll_entries").select("id,pay_date").eq("location_id", locationId);
      for (const e of (entries ?? [])) { if (e.pay_date) payDateToId[e.pay_date] = e.id; }
    }
    const toInsert = payrollLineRows.map(r => {
      const entryId = payDateToId[d(r.pay_date) ?? ""];
      if (!entryId) return null;
      return {
        payroll_entry_id: entryId,
        employee_name: s(r.employee_name) ?? "Unknown",
        employee_id: s(r.employee_id),
        role: s(r.role),
        hours_regular: n(r.hours_regular),
        hours_overtime: n(r.hours_overtime),
        rate: n(r.rate),
        gross_wages: n(r.gross_wages) ?? 0,
        net_wages: n(r.net_wages) ?? 0,
      };
    }).filter(Boolean) as Record<string, unknown>[];
    const errs: string[] = [];
    let inserted = 0;
    const CHUNK = 200;
    for (let i = 0; i < toInsert.length; i += CHUNK) {
      const { error } = await supabase.from("payroll_line_items").insert(toInsert.slice(i, i + CHUNK));
      if (error) errs.push(error.message); else inserted += toInsert.slice(i, i + CHUNK).length;
    }
    results.payroll_line_items = { inserted, errors: errs };
  }

  // 6. Infrastructure
  const infraRows = getSheet("Infrastructure", "monthly_infrastructure");
  {
    const toInsert = infraRows.map(r => ({
      location_id: locationId,
      month: d(r.month) ? String(r.month).slice(0, 7) : null, // YYYY-MM
      rent: n(r.rent) ?? 0,
      utilities: n(r.utilities) ?? 0,
      insurance: n(r.insurance) ?? 0,
      staff_accommodation: n(r.staff_accommodation) ?? 0,
      car_payment: n(r.car_payment) ?? 0,
      gas_expenses: n(r.gas_expenses) ?? 0,
      phone: n(r.phone) ?? 0,
      store_internet: n(r.store_internet) ?? 0,
      trash: n(r.trash) ?? 0,
      repairs_maintenance: n(r.repairs_maintenance) ?? 0,
      pest_control: n(r.pest_control) ?? 0,
      marketing_fee: n(r.marketing_fee) ?? 0,
      bank_charges: n(r.bank_charges) ?? 0,
      pos_charges: n(r.pos_charges) ?? 0,
      credit_card_fee: n(r.credit_card_fee) ?? 0,
    })).filter(r => r.month);
    const errs: string[] = [];
    let inserted = 0;
    for (let i = 0; i < toInsert.length; i += 50) {
      const { error } = await supabase.from("monthly_infrastructure").upsert(toInsert.slice(i, i + 50), { onConflict: "location_id,month" });
      if (error) errs.push(error.message); else inserted += toInsert.slice(i, i + 50).length;
    }
    results.monthly_infrastructure = { inserted, errors: errs };
  }

  // 7. Payroll Taxes
  const payTaxRows = getSheet("Payroll Taxes", "monthly_payroll_taxes");
  {
    const toInsert = payTaxRows.map(r => ({
      location_id: locationId,
      month: String(r.month ?? "").slice(0, 7),
      payroll_tax_amount: n(r.payroll_tax_amount) ?? 0,
      workers_comp_amount: n(r.workers_comp_amount) ?? 0,
      benefits_amount: n(r.benefits_amount) ?? 0,
    })).filter(r => r.month);
    const errs: string[] = [];
    let inserted = 0;
    for (let i = 0; i < toInsert.length; i += 50) {
      const { error } = await supabase.from("monthly_payroll_taxes").upsert(toInsert.slice(i, i + 50), { onConflict: "location_id,month" });
      if (error) errs.push(error.message); else inserted += toInsert.slice(i, i + 50).length;
    }
    results.monthly_payroll_taxes = { inserted, errors: errs };
  }

  // 8. Safe Cash
  const safeCashRows = getSheet("Safe Cash", "safe_cash");
  {
    const toInsert = safeCashRows.map(r => ({
      location_id: locationId,
      disbursement_date: d(r.disbursement_date),
      amount: n(r.amount) ?? 0,
      category: s(r.category),
      description: s(r.description),
      recipient: s(r.recipient),
    })).filter(r => r.disbursement_date);
    const errs: string[] = [];
    let inserted = 0;
    if (toInsert.length) {
      const { error } = await supabase.from("safe_cash_disbursements").insert(toInsert);
      if (error) errs.push(error.message); else inserted = toInsert.length;
    }
    results.safe_cash = { inserted, errors: errs };
  }

  const totalInserted = Object.values(results).reduce((s, r) => s + r.inserted, 0);
  const allErrors = Object.entries(results).flatMap(([k, r]) => r.errors.map(e => `${k}: ${e}`));

  return NextResponse.json({
    ok: allErrors.length === 0,
    location: { id: loc.id, name: loc.name },
    totalInserted,
    results,
    errors: allErrors.length ? allErrors : undefined,
  });
}
