export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import ExcelJS from "exceljs";

// ── helpers ────────────────────────────────────────────────────────────────────
const TEAL = "FF00D4A8";
const DARK = "FF0A0A1A";
const HEADER_BG = "FF0D1F3C";

function styleHeader(ws: ExcelJS.Worksheet, cols: string[]) {
  ws.columns = cols.map(k => ({ header: k, key: k, width: Math.max(k.length + 4, 14) }));
  const row = ws.getRow(1);
  row.eachCell(cell => {
    cell.font = { bold: true, color: { argb: TEAL } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: HEADER_BG } };
    cell.alignment = { horizontal: "center" };
    cell.border = { bottom: { style: "thin", color: { argb: TEAL } } };
  });
  row.commit();
}

function addRows(ws: ExcelJS.Worksheet, rows: Record<string, unknown>[]) {
  rows.forEach((r, i) => {
    const row = ws.addRow(r);
    row.eachCell(cell => {
      cell.fill = {
        type: "pattern", pattern: "solid",
        fgColor: { argb: i % 2 === 0 ? "FF0F1629" : "FF111827" },
      };
      cell.font = { color: { argb: "FFD1D5DB" } };
    });
    row.commit();
  });
}

// ── GET /api/export/location/[id] ─────────────────────────────────────────────
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: locationId } = await params;
  const supabase = await createClient();

  // Auth
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Verify the location belongs to this user
  const { data: loc } = await supabase
    .from("locations").select("id,name,code").eq("id", locationId).eq("user_id", user.id).single();
  if (!loc) return NextResponse.json({ error: "Location not found" }, { status: 404 });

  // ── Fetch all data ───────────────────────────────────────────────────────────
  const [
    { data: sales },
    { data: deliveries },
    { data: lineItems },
    { data: payrollEntries },
    { data: payrollLines },
    { data: infra },
    { data: payrollTaxes },
    { data: safeCash },
  ] = await Promise.all([
    supabase.from("daily_sales")
      .select("sale_date,cash_sales,pos_sales,uber_eats_gross,grubhub_gross,doordash_gross,catering_sales,cash_tips,aggregator_commission,liquor_sales,notes")
      .eq("location_id", locationId).order("sale_date"),
    supabase.from("food_deliveries")
      .select("delivery_date,vendor,invoice_number,category,amount,payment_status,paid_on,payment_method,cheque_number,notes")
      .eq("location_id", locationId).order("delivery_date"),
    supabase.from("invoice_line_items")
      .select("name,qty,unit,unit_price,total,category,food_delivery_id,food_deliveries!inner(invoice_number,delivery_date,vendor,location_id)")
      .eq("food_deliveries.location_id", locationId)
      .order("created_at"),
    supabase.from("payroll_entries")
      .select("period_start,period_end,pay_date,gross_wages,employer_taxes,net_wages,employee_count,source,notes")
      .eq("location_id", locationId).order("pay_date"),
    supabase.from("payroll_line_items")
      .select("employee_name,employee_id,role,hours_regular,hours_overtime,rate,gross_wages,net_wages,payroll_entries!inner(period_start,pay_date,location_id)")
      .eq("payroll_entries.location_id", locationId)
      .order("created_at"),
    supabase.from("monthly_infrastructure")
      .select("month,rent,utilities,insurance,staff_accommodation,car_payment,gas_expenses,phone,store_internet,trash,repairs_maintenance,pest_control,marketing_fee,bank_charges,pos_charges,credit_card_fee")
      .eq("location_id", locationId).order("month"),
    supabase.from("monthly_payroll_taxes")
      .select("month,payroll_tax_amount,workers_comp_amount,benefits_amount")
      .eq("location_id", locationId).order("month"),
    supabase.from("safe_cash_disbursements")
      .select("disbursement_date,amount,category,description,recipient")
      .eq("location_id", locationId).order("disbursement_date"),
  ]);

  // ── Build workbook ───────────────────────────────────────────────────────────
  const wb = new ExcelJS.Workbook();
  wb.creator = "CashCall";
  wb.created = new Date();
  wb.properties.date1904 = false;

  // ── Sheet 0: Info ────────────────────────────────────────────────────────────
  const wsInfo = wb.addWorksheet("ℹ️ Info");
  wsInfo.columns = [{ key: "key", width: 24 }, { key: "value", width: 48 }];
  const infoRows = [
    { key: "Export Source", value: "CashCall — cashcall.io" },
    { key: "Location", value: loc.name },
    { key: "Location Code", value: loc.code },
    { key: "Location ID", value: loc.id },
    { key: "Exported At", value: new Date().toISOString() },
    { key: "", value: "" },
    { key: "Sheets included", value: "Daily Sales · Food Deliveries · Invoice Line Items · Payroll Entries · Payroll Line Items · Infrastructure · Payroll Taxes · Safe Cash" },
    { key: "", value: "" },
    { key: "Import instructions", value: "To re-import: go to Dashboard → Import Data, upload this file. Keep column headers and sheet names exactly as exported." },
  ];
  infoRows.forEach((r, i) => {
    const row = wsInfo.addRow([r.key, r.value]);
    row.getCell(1).font = { bold: true, color: { argb: TEAL } };
    row.getCell(2).font = { color: { argb: "FFD1D5DB" } };
    row.eachCell(cell => {
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: i === 0 ? HEADER_BG : "FF0A0A1A" } };
    });
    row.commit();
  });

  // ── Sheet 1: Daily Sales ─────────────────────────────────────────────────────
  const wsSales = wb.addWorksheet("Daily Sales");
  const salesCols = ["sale_date","cash_sales","pos_sales","uber_eats_gross","grubhub_gross","doordash_gross","catering_sales","cash_tips","aggregator_commission","liquor_sales","notes"];
  styleHeader(wsSales, salesCols);
  addRows(wsSales, (sales ?? []) as Record<string, unknown>[]);

  // ── Sheet 2: Food Deliveries ─────────────────────────────────────────────────
  const wsDeliveries = wb.addWorksheet("Food Deliveries");
  const deliveryCols = ["delivery_date","vendor","invoice_number","category","amount","payment_status","paid_on","payment_method","cheque_number","notes"];
  styleHeader(wsDeliveries, deliveryCols);
  addRows(wsDeliveries, (deliveries ?? []) as Record<string, unknown>[]);

  // ── Sheet 3: Invoice Line Items ──────────────────────────────────────────────
  const wsLineItems = wb.addWorksheet("Invoice Line Items");
  const lineItemCols = ["invoice_number","delivery_date","vendor","name","qty","unit","unit_price","total","category"];
  styleHeader(wsLineItems, lineItemCols);
  const flatLineItems = (lineItems ?? []).map((li: Record<string, unknown>) => {
    const fd = li.food_deliveries as Record<string, unknown> | null;
    return {
      invoice_number: fd?.invoice_number ?? "",
      delivery_date: fd?.delivery_date ?? "",
      vendor: fd?.vendor ?? "",
      name: li.name,
      qty: li.qty,
      unit: li.unit,
      unit_price: li.unit_price,
      total: li.total,
      category: li.category,
    };
  });
  addRows(wsLineItems, flatLineItems);

  // ── Sheet 4: Payroll Entries ─────────────────────────────────────────────────
  const wsPayroll = wb.addWorksheet("Payroll Entries");
  const payrollCols = ["period_start","period_end","pay_date","gross_wages","employer_taxes","net_wages","employee_count","source","notes"];
  styleHeader(wsPayroll, payrollCols);
  addRows(wsPayroll, (payrollEntries ?? []) as Record<string, unknown>[]);

  // ── Sheet 5: Payroll Line Items ──────────────────────────────────────────────
  const wsPayrollLines = wb.addWorksheet("Payroll Line Items");
  const payrollLineCols = ["period_start","pay_date","employee_name","employee_id","role","hours_regular","hours_overtime","rate","gross_wages","net_wages"];
  styleHeader(wsPayrollLines, payrollLineCols);
  const flatPayrollLines = (payrollLines ?? []).map((pl: Record<string, unknown>) => {
    const pe = pl.payroll_entries as Record<string, unknown> | null;
    return {
      period_start: pe?.period_start ?? "",
      pay_date: pe?.pay_date ?? "",
      employee_name: pl.employee_name,
      employee_id: pl.employee_id,
      role: pl.role,
      hours_regular: pl.hours_regular,
      hours_overtime: pl.hours_overtime,
      rate: pl.rate,
      gross_wages: pl.gross_wages,
      net_wages: pl.net_wages,
    };
  });
  addRows(wsPayrollLines, flatPayrollLines);

  // ── Sheet 6: Infrastructure ──────────────────────────────────────────────────
  const wsInfra = wb.addWorksheet("Infrastructure");
  const infraCols = ["month","rent","utilities","insurance","staff_accommodation","car_payment","gas_expenses","phone","store_internet","trash","repairs_maintenance","pest_control","marketing_fee","bank_charges","pos_charges","credit_card_fee"];
  styleHeader(wsInfra, infraCols);
  addRows(wsInfra, (infra ?? []) as Record<string, unknown>[]);

  // ── Sheet 7: Payroll Taxes ───────────────────────────────────────────────────
  const wsPayTax = wb.addWorksheet("Payroll Taxes");
  const payTaxCols = ["month","payroll_tax_amount","workers_comp_amount","benefits_amount"];
  styleHeader(wsPayTax, payTaxCols);
  addRows(wsPayTax, (payrollTaxes ?? []) as Record<string, unknown>[]);

  // ── Sheet 8: Safe Cash ───────────────────────────────────────────────────────
  const wsSafeCash = wb.addWorksheet("Safe Cash");
  const safeCashCols = ["disbursement_date","amount","category","description","recipient"];
  styleHeader(wsSafeCash, safeCashCols);
  addRows(wsSafeCash, (safeCash ?? []) as Record<string, unknown>[]);

  // ── Serialize ────────────────────────────────────────────────────────────────
  const buf = await wb.xlsx.writeBuffer();
  const filename = `CashCall_${loc.code}_${new Date().toISOString().slice(0, 10)}.xlsx`;

  return new NextResponse(buf, {
    status: 200,
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
