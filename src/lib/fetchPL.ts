import type { SupabaseClient } from "@supabase/supabase-js";
import type { PLSummary, FoodCategory } from "./types";
import { FOOD_CATEGORIES, INFRA_FIELDS } from "./types";

/* ──────────────────────────────────────────────────────────────────
   Weekly Pulse types
   ────────────────────────────────────────────────────────────────── */
export interface WeekSlice {
  weekNum: number;          // 1-5
  label: string;            // "W1 · Nov 1–7"
  startDay: number;         // 1
  endDay: number;           // 7
  days: number;             // calendar days in this slice
  dayFraction: number;      // days / totalDaysInMonth  (for prorating)
  net_sales: number;
  food_cost: number;
  labor_hourly: number;     // only from foh_hourly_hours this week
  labor_prorated: number;   // salaried + BOH + taxes prorated from monthly total
  total_labor: number;
  prime_cost: number;       // food + total_labor
  prime_pct: number;        // prime / net_sales * 100
  food_pct: number;
  labor_pct: number;
  net_profit: number;
  net_profit_pct: number;
  status: "healthy" | "warning" | "critical" | "no-data";
  is_outlier: boolean;      // >5 pp from monthly avg prime_pct
  is_current_week: boolean;
}

const n = (v: unknown) => parseFloat(String(v ?? 0)) || 0;

export async function fetchPLSummary(
  supabase: SupabaseClient,
  locationId: string,
  month: string // "YYYY-MM-01"
): Promise<PLSummary> {
  const start = month;
  const startDate = new Date(month + "T00:00:00Z");
  const endDate = new Date(startDate);
  endDate.setUTCMonth(endDate.getUTCMonth() + 1);
  const end = endDate.toISOString().slice(0, 10);

  const [locRes, salesRes, foodRes, hourlyHoursRes, salariedRes, bohRes, taxesRes, infraRes, salaryDisbRes] =
    await Promise.all([
      supabase.from("locations").select("id,name,code,state,tax_rate").eq("id", locationId).single(),
      supabase.from("daily_sales")
        .select("cash_sales,pos_sales,uber_eats_gross,grubhub_gross,doordash_gross,catering_sales,cash_tips,aggregator_commission")
        .eq("location_id", locationId).gte("sale_date", start).lt("sale_date", end),
      supabase.from("food_deliveries").select("amount,category")
        .eq("location_id", locationId).gte("delivery_date", start).lt("delivery_date", end),
      supabase.from("foh_hourly_hours")
        .select("hours_worked,overtime_hours,foh_hourly_staff!inner(hourly_rate,location_id)")
        .eq("foh_hourly_staff.location_id", locationId).gte("work_date", start).lt("work_date", end),
      supabase.from("foh_salaried_staff").select("monthly_salary")
        .eq("location_id", locationId).eq("active", true),
      supabase.from("boh_staff").select("pay_type,pay_rate")
        .eq("location_id", locationId).eq("active", true),
      supabase.from("monthly_payroll_taxes")
        .select("payroll_tax_amount,workers_comp_amount,benefits_amount")
        .eq("location_id", locationId).eq("month", start).maybeSingle(),
      supabase.from("monthly_infrastructure")
        .select("rent,utilities,insurance,staff_accommodation,staff_accom_utilities,car_payment,gas_expenses,phone,store_internet,trash,repairs_maintenance,pest_control,marketing_fee,bank_charges,pos_charges,credit_card_fee,custom_fields")
        .eq("location_id", locationId).eq("month", start).maybeSingle(),
      // Salary disbursements from Gusto/QuickBooks payroll sync — additional labor source
      supabase.from("salary_disbursements")
        .select("amount")
        .eq("location_id", locationId)
        .gte("disbursed_on", start)
        .lt("disbursed_on", end),
    ]);

  const loc = locRes.data;
  const taxRate = n(loc?.tax_rate ?? 0);

  // Sales aggregation
  const sales = salesRes.data ?? [];
  const cashSales     = sales.reduce((s, r) => s + n(r.cash_sales), 0);
  const posSales      = sales.reduce((s, r) => s + n(r.pos_sales), 0);
  const uberEats      = sales.reduce((s, r) => s + n(r.uber_eats_gross), 0);
  const grubhub       = sales.reduce((s, r) => s + n(r.grubhub_gross), 0);
  const doordash      = sales.reduce((s, r) => s + n(r.doordash_gross), 0);
  const catering      = sales.reduce((s, r) => s + n(r.catering_sales), 0);
  const cashTips      = sales.reduce((s, r) => s + n(r.cash_tips), 0);
  const aggregatorGross = uberEats + grubhub + doordash;
  const aggregatorCommission = sales.reduce((s, r) => s + n(r.aggregator_commission), 0);
  const aggregatorNet = aggregatorGross - aggregatorCommission;
  const directSales   = cashSales + posSales + catering;
  const totalGross    = directSales + aggregatorGross + cashTips;
  const totalNet      = directSales + aggregatorNet + cashTips;
  const salesTax      = totalNet * taxRate;

  // Food cost by category
  const food = foodRes.data ?? [];
  const foodByCategory = Object.fromEntries(
    FOOD_CATEGORIES.map((c) => [c.key, 0])
  ) as Record<FoodCategory, number>;
  let totalFood = 0;
  for (const row of food) {
    const cat = (row.category as FoodCategory) ?? "miscellaneous";
    foodByCategory[cat] = (foodByCategory[cat] ?? 0) + n(row.amount);
    totalFood += n(row.amount);
  }

  // Labor
  const fohHourlyCost = ((hourlyHoursRes.data ?? []) as any[]).reduce((s, r) => {
    const rate = n(r.foh_hourly_staff?.hourly_rate);
    return s + n(r.hours_worked) * rate + n(r.overtime_hours) * rate * 1.5;
  }, 0);
  const fohSalariedCost = (salariedRes.data ?? []).reduce((s, r) => s + n(r.monthly_salary), 0);
  const bohCost = (bohRes.data ?? [])
    .reduce((s, r) => {
      if (r.pay_type === "salary") return s + n(r.pay_rate);
      // Hourly BOH: estimate ~173 hrs/month (40 hrs/wk × 4.33 wks) until boh_hourly_hours table is added
      return s + n(r.pay_rate) * 173;
    }, 0);
  const payrollTaxes =
    n(taxesRes.data?.payroll_tax_amount) +
    n(taxesRes.data?.workers_comp_amount) +
    n(taxesRes.data?.benefits_amount);
  // Payroll disbursements from Gusto/QuickBooks sync — added on top of manual staff entries
  // If a location uses payroll sync, disbursements replace the need to manually enter salaried staff.
  // We avoid double-counting: if salaried staff records exist AND disbursements exist, disbursements win.
  const disbursedPayroll = (salaryDisbRes.data ?? []).reduce((s, r: {amount:number}) => s + n(r.amount), 0);
  const manualSalariedCost = disbursedPayroll > 0 ? 0 : fohSalariedCost + bohCost; // don't double-count
  const totalLabor = fohHourlyCost + manualSalariedCost + payrollTaxes + disbursedPayroll;

  // Infrastructure — sum all INFRA_FIELDS + custom_fields
  const inf = infraRes.data ?? {};
  const customFieldsSum = Object.values((inf as any).custom_fields ?? {}).reduce((s: number, v) => s + n(v), 0);
  const infrastructure = INFRA_FIELDS.reduce((s, f) => s + n((inf as any)[f.dbKey]), 0) + customFieldsSum;

  const totalExpenses = totalFood + aggregatorCommission + totalLabor + salesTax + infrastructure;
  // Use totalGross (not totalNet) so aggregatorCommission is only subtracted once:
  // totalExpenses already includes aggregatorCommission, and totalNet already subtracts it.
  const netProfit = totalGross - totalExpenses;

  return {
    location_id: locationId,
    location_name: loc?.name ?? "",
    location_code: loc?.code ?? "",
    location_state: loc?.state ?? "",
    month: start,
    cash_sales: cashSales,
    pos_sales: posSales,
    uber_eats_gross: uberEats,
    grubhub_gross: grubhub,
    doordash_gross: doordash,
    catering_sales: catering,
    cash_tips: cashTips,
    aggregator_gross: aggregatorGross,
    aggregator_commission: aggregatorCommission,
    aggregator_net: aggregatorNet,
    total_gross_sales: totalGross,
    total_net_sales: totalNet,
    sales_tax: salesTax,
    food_cost: totalFood,
    food_by_category: foodByCategory,
    foh_hourly_cost: fohHourlyCost,
    foh_salaried_cost: disbursedPayroll > 0 ? disbursedPayroll : fohSalariedCost, // show sync'd payroll as salaried cost
    boh_cost: disbursedPayroll > 0 ? 0 : bohCost,
    payroll_taxes: payrollTaxes,
    total_labor: totalLabor,
    infrastructure,
    total_expenses: totalExpenses,
    net_profit: netProfit,
    food_pct: totalNet ? (totalFood / totalNet) * 100 : 0,
    labor_pct: totalNet ? (totalLabor / totalNet) * 100 : 0,
    infra_pct: totalNet ? (infrastructure / totalNet) * 100 : 0,
    net_profit_pct: totalNet ? (netProfit / totalNet) * 100 : 0,
  };
}

/* ──────────────────────────────────────────────────────────────────
   Weekly Pulse — week-by-week breakdown for a single location/month
   Weeks are Mon–Sun calendar weeks, clamped to the month boundary.
   Monthly fixed costs (salaried, BOH, taxes, infra) are prorated
   by the fraction of days each week falls in the month.
   ────────────────────────────────────────────────────────────────── */
export async function fetchWeeklyPulse(
  supabase: SupabaseClient,
  locationId: string,
  month: string,          // "YYYY-MM-01"
  monthlyPL: PLSummary,
): Promise<WeekSlice[]> {
  const startDate = new Date(month + "T00:00:00Z");
  const endDate   = new Date(startDate);
  endDate.setUTCMonth(endDate.getUTCMonth() + 1);
  const endStr   = endDate.toISOString().slice(0, 10);
  const totalDays = (endDate.getTime() - startDate.getTime()) / 86_400_000;
  const monthLabel = startDate.toLocaleDateString("en-US", { month: "short", timeZone: "UTC" });

  // Build week slices (7-day blocks starting from day 1 of month)
  const slices: Array<{ start: Date; end: Date }> = [];
  let cur = new Date(startDate);
  while (cur < endDate) {
    const sliceEnd = new Date(cur);
    sliceEnd.setUTCDate(sliceEnd.getUTCDate() + 7);
    if (sliceEnd > endDate) sliceEnd.setTime(endDate.getTime());
    slices.push({ start: new Date(cur), end: sliceEnd });
    cur.setUTCDate(cur.getUTCDate() + 7);
  }

  // Fetch day-level data for the month
  const [salesRes, foodRes, hoursRes] = await Promise.all([
    supabase.from("daily_sales")
      .select("sale_date,cash_sales,pos_sales,uber_eats_gross,grubhub_gross,doordash_gross,catering_sales,cash_tips,aggregator_commission")
      .eq("location_id", locationId).gte("sale_date", month).lt("sale_date", endStr),
    supabase.from("food_deliveries")
      .select("delivery_date,amount")
      .eq("location_id", locationId).gte("delivery_date", month).lt("delivery_date", endStr),
    supabase.from("foh_hourly_hours")
      .select("work_date,hours_worked,overtime_hours,foh_hourly_staff!inner(hourly_rate,location_id)")
      .eq("foh_hourly_staff.location_id", locationId).gte("work_date", month).lt("work_date", endStr),
  ]);

  const sales  = salesRes.data  ?? [];
  const food   = foodRes.data   ?? [];
  const hours  = hoursRes.data  ?? [];

  // Fixed monthly costs that we prorate by week — exclude infrastructure here because
  // it is prorated separately as infraProrated on line ~263 to avoid double-counting.
  const monthlyFixed = monthlyPL.foh_salaried_cost + monthlyPL.boh_cost
    + monthlyPL.payroll_taxes;

  // Current date for "is_current_week"
  const today = new Date();

  // Monthly avg prime_pct (for outlier detection) — skip if no monthly data
  const monthlyPrimePct = monthlyPL.food_pct + monthlyPL.labor_pct;

  const result: WeekSlice[] = slices.map((sl, i) => {
    const startStr = sl.start.toISOString().slice(0, 10);
    const endStr2  = sl.end.toISOString().slice(0, 10);
    const days     = (sl.end.getTime() - sl.start.getTime()) / 86_400_000;
    const dayFrac  = days / totalDays;

    const inSlice = (d: string) => d >= startStr && d < endStr2;

    // Sales
    const wSales = sales.filter(r => inSlice(r.sale_date));
    const netSales = wSales.reduce((s, r) => {
      const gross = n(r.cash_sales) + n(r.pos_sales)
        + n(r.uber_eats_gross) + n(r.grubhub_gross) + n(r.doordash_gross)
        + n(r.catering_sales) + n(r.cash_tips);
      const comm  = n(r.aggregator_commission);
      return s + gross - comm;
    }, 0);

    // Food
    const foodCost = food.filter(r => inSlice(r.delivery_date)).reduce((s, r) => s + n(r.amount), 0);

    // Hourly labor
    const laborHourly = (hours as any[]).filter(r => inSlice(r.work_date)).reduce((s, r) => {
      const rate = n(r.foh_hourly_staff?.hourly_rate);
      return s + n(r.hours_worked) * rate + n(r.overtime_hours) * rate * 1.5;
    }, 0);

    // Prorated fixed costs
    const laborProrated = monthlyFixed * dayFrac;
    const totalLabor    = laborHourly + laborProrated;
    const primeCost     = foodCost + totalLabor;

    const primePct  = netSales > 0 ? (primeCost  / netSales) * 100 : 0;
    const foodPct   = netSales > 0 ? (foodCost   / netSales) * 100 : 0;
    const laborPct  = netSales > 0 ? (totalLabor / netSales) * 100 : 0;

    // Approximate infra/tax proration for net profit
    const infraProrated = monthlyPL.infrastructure * dayFrac;
    const salesTaxRate  = monthlyPL.total_net_sales > 0
      ? monthlyPL.sales_tax / monthlyPL.total_net_sales : 0;
    const netProfit = netSales - foodCost - totalLabor - infraProrated - netSales * salesTaxRate;
    const netProfitPct = netSales > 0 ? (netProfit / netSales) * 100 : 0;

    const status: WeekSlice["status"] = netSales === 0 ? "no-data"
      : primePct > 65 ? "critical"
      : primePct > 58 ? "warning"
      : "healthy";

    const isOutlier = netSales > 0 && monthlyPrimePct > 0
      && Math.abs(primePct - monthlyPrimePct) >= 5;

    const startDay = sl.start.getUTCDate();
    const endDay   = new Date(sl.end.getTime() - 1).getUTCDate();
    const isCurrentWeek = today >= sl.start && today < sl.end;

    return {
      weekNum: i + 1,
      label: `W${i + 1} · ${monthLabel} ${startDay}–${endDay}`,
      startDay, endDay, days, dayFraction: dayFrac,
      net_sales: netSales,
      food_cost: foodCost,
      labor_hourly: laborHourly,
      labor_prorated: laborProrated,
      total_labor: totalLabor,
      prime_cost: primeCost,
      prime_pct: primePct,
      food_pct: foodPct,
      labor_pct: laborPct,
      net_profit: netProfit,
      net_profit_pct: netProfitPct,
      status,
      is_outlier: isOutlier,
      is_current_week: isCurrentWeek,
    };
  });

  return result;
}
