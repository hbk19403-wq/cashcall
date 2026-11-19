"use client";
import { useEffect, useState, useMemo } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

const fmtUSD = (n: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n);
const pct = (v: number) => v.toFixed(1) + "%";
const monthLabel = (m: string) => new Date(m + "T12:00:00").toLocaleDateString("en-US", { month: "long", year: "numeric" });

function getMonthStr(offset = 0) {
  const d = new Date();
  d.setDate(1);
  d.setMonth(d.getMonth() + offset);
  return d.toISOString().split("T")[0].slice(0, 7) + "-01";
}

interface PLRow {
  month: string;
  net_sales: number;
  food_cost: number;
  labor_cost: number;
  liquor_cost: number;
  infra_cost: number;
  net_profit: number;
}

interface Budget {
  id?: string;
  location_id: string;
  month: string;
  sales_target: number;
  food_pct_target: number;
  labor_pct_target: number;
  infra_pct_target: number;
  liquor_pct_target: number;
  food_budget: number;
  labor_budget: number;
  infra_budget: number;
  liquor_budget: number;
  notes: string;
}

export default function LocationBudgetPage() {
  const { id } = useParams<{ id: string }>();

  const [month, setMonth] = useState(() => getMonthStr(0));
  const [locationName, setLocationName] = useState("");
  const [locationType, setLocationType] = useState<string>("restaurant");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState("");

  const [history, setHistory] = useState<PLRow[]>([]);
  const [budget, setBudget] = useState<Budget>({
    location_id: id, month,
    sales_target: 0, food_pct_target: 28, labor_pct_target: 30,
    infra_pct_target: 7, liquor_pct_target: 20,
    food_budget: 0, labor_budget: 0, infra_budget: 0, liquor_budget: 0,
    notes: "",
  });

  const isBar = locationType === "bar_restaurant";

  useEffect(() => { loadData(); }, [id, month]);

  async function loadData() {
    setLoading(true);
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setLoading(false); return; }

    // Get location info
    const { data: loc } = await supabase.from("locations").select("name,location_type").eq("id", id).single();
    if (loc) { setLocationName(loc.name); setLocationType(loc.location_type || "restaurant"); }

    // Get 6 months of history for actuals + forecast
    const months = Array.from({ length: 6 }, (_, i) => {
      const d = new Date(month + "T12:00:00");
      d.setMonth(d.getMonth() - (5 - i));
      return d.toISOString().split("T")[0].slice(0, 7) + "-01";
    });

    // End date: one month past the last in our range
    const rangeEndObj = new Date(months[5] + "T12:00:00");
    rangeEndObj.setMonth(rangeEndObj.getMonth() + 1);
    const rangeEnd = rangeEndObj.toISOString().slice(0, 7) + "-01";
    const rangeStart = months[0];

    const INFRA_DB_KEYS = ["rent","utilities","insurance","staff_accommodation","staff_accom_utilities","car_payment","gas_expenses","phone","store_internet","trash","repairs_maintenance","pest_control","marketing_fee","bank_charges","pos_charges","credit_card_fee"];

    const [
      { data: salesRaw },
      { data: foodRaw },
      { data: hourlyHoursRaw },
      { data: salariedRaw },
      { data: bohRaw },
      { data: payrollTaxRaw },
      { data: infraRaw },
      { data: disbRaw },
      { data: liquorRaw },
    ] = await Promise.all([
      supabase.from("daily_sales")
        .select("sale_date,cash_sales,pos_sales,uber_eats_gross,grubhub_gross,doordash_gross,catering_sales,cash_tips,aggregator_commission")
        .eq("location_id", id).gte("sale_date", rangeStart).lt("sale_date", rangeEnd),
      supabase.from("food_deliveries")
        .select("delivery_date,amount")
        .eq("location_id", id).gte("delivery_date", rangeStart).lt("delivery_date", rangeEnd),
      supabase.from("foh_hourly_hours")
        .select("work_date,hours_worked,overtime_hours,foh_hourly_staff!inner(hourly_rate,location_id)")
        .eq("foh_hourly_staff.location_id", id).gte("work_date", rangeStart).lt("work_date", rangeEnd),
      supabase.from("foh_salaried_staff").select("monthly_salary").eq("location_id", id).eq("active", true),
      supabase.from("boh_staff").select("pay_type,pay_rate").eq("location_id", id).eq("active", true),
      supabase.from("monthly_payroll_taxes")
        .select("month,payroll_tax_amount,workers_comp_amount,benefits_amount")
        .eq("location_id", id).gte("month", rangeStart).lt("month", rangeEnd),
      supabase.from("monthly_infrastructure")
        .select("*")
        .eq("location_id", id).gte("month", rangeStart).lt("month", rangeEnd),
      supabase.from("salary_disbursements")
        .select("disbursed_on,amount")
        .eq("location_id", id).gte("disbursed_on", rangeStart).lt("disbursed_on", rangeEnd),
      supabase.from("liquor_transactions")
        .select("transaction_date,cost_per_unit,quantity")
        .eq("location_id", id).eq("transaction_type", "purchase")
        .gte("transaction_date", rangeStart).lt("transaction_date", rangeEnd),
    ]);

    const nn = (v: unknown) => parseFloat(String(v ?? 0)) || 0;

    // Fixed salaried costs (same each month unless staff changes)
    const salariedMonthly = (salariedRaw ?? []).reduce((s, r) => s + nn(r.monthly_salary), 0);
    const bohMonthly = (bohRaw ?? []).reduce((s, r) =>
      s + (r.pay_type === "salary" ? nn(r.pay_rate) : nn(r.pay_rate) * 173), 0);

    // Aggregate by month
    const histRows: PLRow[] = months.map(mo => {
      const nextMo = (() => { const d = new Date(mo + "T12:00:00"); d.setMonth(d.getMonth() + 1); return d.toISOString().slice(0, 7) + "-01"; })();
      const inMo = (d: string) => !!d && d >= mo && d < nextMo;
      const mKey = mo.slice(0, 7);

      // Sales: compute net from actual columns
      const net_sales = (salesRaw ?? []).filter(r => inMo(r.sale_date)).reduce((s, r) => {
        const gross = nn(r.cash_sales) + nn(r.pos_sales) + nn(r.uber_eats_gross) + nn(r.grubhub_gross) + nn(r.doordash_gross) + nn(r.catering_sales) + nn(r.cash_tips);
        return s + gross - nn(r.aggregator_commission);
      }, 0);

      // Food: from food_deliveries
      const food_cost = (foodRaw ?? []).filter(r => inMo(r.delivery_date)).reduce((s, r) => s + nn(r.amount), 0);

      // Labor: hourly FOH + salaried/BOH (or payroll disbursements) + taxes
      const hourlyLabor = ((hourlyHoursRaw ?? []) as any[]).filter(r => inMo(r.work_date)).reduce((s, r) => {
        const rate = nn(r.foh_hourly_staff?.hourly_rate);
        return s + nn(r.hours_worked) * rate + nn(r.overtime_hours) * rate * 1.5;
      }, 0);
      const taxRow = (payrollTaxRaw ?? []).find(r => r.month?.startsWith(mKey));
      const payrollTaxes = nn(taxRow?.payroll_tax_amount) + nn(taxRow?.workers_comp_amount) + nn(taxRow?.benefits_amount);
      const disbTotal = (disbRaw ?? []).filter(r => inMo(r.disbursed_on)).reduce((s, r) => s + nn(r.amount), 0);
      const manualSalaried = disbTotal > 0 ? 0 : salariedMonthly + bohMonthly;
      const labor_cost = hourlyLabor + manualSalaried + payrollTaxes + disbTotal;

      // Infra: from monthly_infrastructure, sum all standard + custom fields
      const infraRow = (infraRaw ?? []).find(r => r.month?.startsWith(mKey)) as any;
      const customSum = infraRow ? Object.values((infraRow.custom_fields ?? {}) as Record<string,unknown>).reduce((s: number, v) => s + nn(v), 0) : 0;
      const infra_cost = infraRow ? INFRA_DB_KEYS.reduce((s, k) => s + nn(infraRow[k]), 0) + customSum : 0;

      // Liquor: purchases only
      const liquor_cost = (liquorRaw ?? []).filter(r => inMo(r.transaction_date)).reduce((s, r) => s + nn(r.cost_per_unit) * nn(r.quantity), 0);

      const net_profit = net_sales - food_cost - labor_cost - infra_cost - liquor_cost;
      return { month: mo, net_sales, food_cost, labor_cost, infra_cost, liquor_cost, net_profit };
    });
    setHistory(histRows);

    // Load existing budget
    const { data: bud } = await supabase.from("location_budgets").select("*").eq("location_id", id).eq("month", month).maybeSingle();
    if (bud) {
      setBudget({ ...bud, liquor_pct_target: (bud as Budget & { liquor_pct_target?: number }).liquor_pct_target ?? 20, liquor_budget: (bud as Budget & { liquor_budget?: number }).liquor_budget ?? 0 });
    } else {
      // Auto-fill targets from last 3 month average
      const recent = histRows.slice(3, 6).filter(r => r.net_sales > 0);
      const avgSales = recent.length ? recent.reduce((s, r) => s + r.net_sales, 0) / recent.length : 0;
      const avgFoodPct = recent.length ? recent.reduce((s, r) => s + (r.food_cost / r.net_sales) * 100, 0) / recent.length : 28;
      const avgLaborPct = recent.length ? recent.reduce((s, r) => s + (r.labor_cost / r.net_sales) * 100, 0) / recent.length : 30;
      const avgInfraPct = recent.length ? recent.reduce((s, r) => s + (r.infra_cost / r.net_sales) * 100, 0) / recent.length : 7;
      const avgLiquorPct = recent.length && isBar ? recent.reduce((s, r) => s + (r.liquor_cost / r.net_sales) * 100, 0) / recent.length : 20;
      setBudget(b => ({
        ...b, location_id: id, month,
        sales_target: Math.round(avgSales),
        food_pct_target: parseFloat(avgFoodPct.toFixed(1)),
        labor_pct_target: parseFloat(avgLaborPct.toFixed(1)),
        infra_pct_target: parseFloat(avgInfraPct.toFixed(1)),
        liquor_pct_target: parseFloat(avgLiquorPct.toFixed(1)),
        food_budget: Math.round(avgSales * avgFoodPct / 100),
        labor_budget: Math.round(avgSales * avgLaborPct / 100),
        infra_budget: Math.round(avgSales * avgInfraPct / 100),
        liquor_budget: Math.round(avgSales * avgLiquorPct / 100),
      }));
    }

    setLoading(false);
  }

  async function saveBudget() {
    setSaving(true); setSaveMsg("");
    const supabase = createClient();
    const payload = { ...budget, month, location_id: id };
    const { error } = budget.id
      ? await supabase.from("location_budgets").update(payload).eq("id", budget.id)
      : await supabase.from("location_budgets").insert(payload);
    setSaving(false);
    setSaveMsg(error ? "Error: " + error.message : "✓ Budget saved");
    setTimeout(() => setSaveMsg(""), 3000);
    if (!error) loadData();
  }

  // Recalc $ amounts when sales target changes
  function updateSalesTarget(val: number) {
    setBudget(b => ({
      ...b, sales_target: val,
      food_budget: Math.round(val * b.food_pct_target / 100),
      labor_budget: Math.round(val * b.labor_pct_target / 100),
      infra_budget: Math.round(val * b.infra_pct_target / 100),
      liquor_budget: Math.round(val * b.liquor_pct_target / 100),
    }));
  }

  function updatePct(key: "food_pct_target" | "labor_pct_target" | "infra_pct_target" | "liquor_pct_target", dollarKey: "food_budget" | "labor_budget" | "infra_budget" | "liquor_budget", val: number) {
    setBudget(b => ({ ...b, [key]: val, [dollarKey]: Math.round(b.sales_target * val / 100) }));
  }

  // Forecast: use 3-month average growth trend
  const forecast = useMemo(() => {
    const past = history.filter(r => r.net_sales > 0).slice(0, 5);
    if (past.length < 2) return null;
    const avgGrowth = (past[past.length - 1].net_sales - past[0].net_sales) / (past.length - 1);
    const lastSales = past[past.length - 1].net_sales;
    const avgFoodPct = past.reduce((s, r) => s + (r.food_cost / r.net_sales), 0) / past.length;
    const avgLaborPct = past.reduce((s, r) => s + (r.labor_cost / r.net_sales), 0) / past.length;
    const avgInfraPct = past.reduce((s, r) => s + (r.infra_cost / r.net_sales), 0) / past.length;
    const avgLiquorPct = past.reduce((s, r) => s + (r.liquor_cost / r.net_sales), 0) / past.length;
    return [1, 2, 3].map(i => {
      const d = new Date(month + "T12:00:00");
      d.setMonth(d.getMonth() + i);
      const projSales = Math.max(lastSales + avgGrowth * i, 0);
      return {
        month: d.toISOString().split("T")[0].slice(0, 7) + "-01",
        net_sales: projSales,
        food_cost: projSales * avgFoodPct,
        labor_cost: projSales * avgLaborPct,
        infra_cost: projSales * avgInfraPct,
        liquor_cost: projSales * avgLiquorPct,
        net_profit: projSales * (1 - avgFoodPct - avgLaborPct - avgInfraPct - avgLiquorPct),
      };
    });
  }, [history, month]);

  // This month's actuals
  const actuals = history[history.length - 1];

  const inputStyle = { background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)" };

  if (loading) return <div className="min-h-screen flex items-center justify-center" style={{ background: "#060b18" }}><div className="text-gray-400">Loading…</div></div>;

  return (
    <div className="min-h-screen" style={{ background: "#060b18" }}>
      <div className="max-w-5xl mx-auto px-4 py-8 space-y-6">
        {/* Header */}
        <div className="flex items-start justify-between flex-wrap gap-3">
          <div>
            <Link href={`/location/${id}`} className="text-xs text-teal-400 hover:underline">← {locationName}</Link>
            <h1 className="text-2xl font-bold text-white mt-1">📊 Budget & Forecast</h1>
            <p className="text-gray-400 text-sm mt-0.5">Set targets, track actuals, see 3-month projection</p>
          </div>
          <div className="flex items-center gap-3">
            <select value={month} onChange={e => setMonth(e.target.value)}
              className="rounded-xl px-3 py-2 text-sm text-white outline-none"
              style={{ ...inputStyle, appearance: "none" }}>
              {Array.from({ length: 12 }, (_, i) => getMonthStr(i - 11)).map(m => (
                <option key={m} value={m}>{monthLabel(m)}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Actuals vs Budget */}
        {actuals && budget.sales_target > 0 && (
          <div className="rounded-2xl p-5" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)" }}>
            <h2 className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-4">Actuals vs Budget — {monthLabel(month)}</h2>
            <div className={`grid gap-3 ${isBar ? "grid-cols-2 sm:grid-cols-5" : "grid-cols-2 sm:grid-cols-4"}`}>
              {[
                { label: "Sales", actual: actuals.net_sales, budget: budget.sales_target, lowerBetter: false },
                { label: "Food Cost", actual: actuals.food_cost, budget: budget.food_budget, lowerBetter: true },
                { label: "Labor Cost", actual: actuals.labor_cost, budget: budget.labor_budget, lowerBetter: true },
                ...(isBar ? [{ label: "Liquor Cost", actual: actuals.liquor_cost, budget: budget.liquor_budget, lowerBetter: true }] : []),
                { label: "Overhead", actual: actuals.infra_cost, budget: budget.infra_budget, lowerBetter: true },
              ].map(stat => {
                const diff = stat.actual - stat.budget;
                const over = stat.lowerBetter ? diff > 0 : diff < 0;
                const statusColor = Math.abs(diff) < stat.budget * 0.05 ? "#00d4a8" : over ? "#f87171" : "#00d4a8";
                return (
                  <div key={stat.label} className="rounded-xl p-3" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}>
                    <div className="text-xs text-gray-500 mb-2">{stat.label}</div>
                    <div className="text-lg font-bold text-white">{fmtUSD(stat.actual)}</div>
                    <div className="text-xs text-gray-500">Budget: {fmtUSD(stat.budget)}</div>
                    <div className="text-xs font-semibold mt-1" style={{ color: statusColor }}>
                      {diff > 0 ? "+" : ""}{fmtUSD(diff)}
                    </div>
                    {stat.budget > 0 && (
                      <div className="mt-2 h-1.5 rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,0.08)" }}>
                        <div className="h-full rounded-full transition-all"
                          style={{ width: `${Math.min((stat.actual / stat.budget) * 100, 100)}%`, background: statusColor }} />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Budget targets editor */}
        <div className="rounded-2xl p-5 space-y-4" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)" }}>
          <h2 className="text-xs font-bold text-gray-500 uppercase tracking-widest">Set Budget — {monthLabel(month)}</h2>

          <div>
            <label className="text-xs text-gray-400 uppercase tracking-wide font-semibold block mb-1.5">Sales Target ($)</label>
            <input className="w-full rounded-xl px-4 py-3 text-lg font-bold text-white outline-none focus:ring-2 focus:ring-teal-500/40"
              style={inputStyle} type="number" min="0" step="1000"
              value={budget.sales_target || ""}
              onChange={e => updateSalesTarget(parseFloat(e.target.value) || 0)} />
          </div>

          <div className={`grid gap-4 ${isBar ? "grid-cols-2 sm:grid-cols-4" : "grid-cols-2 sm:grid-cols-3"}`}>
            {[
              { label: "Food Cost %", key: "food_pct_target" as const, dKey: "food_budget" as const },
              { label: "Labor Cost %", key: "labor_pct_target" as const, dKey: "labor_budget" as const },
              ...(isBar ? [{ label: "Liquor Cost %", key: "liquor_pct_target" as const, dKey: "liquor_budget" as const }] : []),
              { label: "Overhead %", key: "infra_pct_target" as const, dKey: "infra_budget" as const },
            ].map(field => (
              <div key={field.label}>
                <label className="text-xs text-gray-400 uppercase tracking-wide font-semibold block mb-1.5">{field.label}</label>
                <div className="relative">
                  <input className="w-full rounded-xl px-4 py-2.5 text-sm font-semibold text-white outline-none focus:ring-2 focus:ring-teal-500/40 pr-8"
                    style={inputStyle} type="number" step="0.5" min="0" max="100"
                    value={budget[field.key] || ""}
                    onChange={e => updatePct(field.key, field.dKey, parseFloat(e.target.value) || 0)} />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 text-sm">%</span>
                </div>
                <div className="text-xs text-gray-600 mt-1">= {fmtUSD(budget[field.dKey])}</div>
              </div>
            ))}
          </div>

          {budget.sales_target > 0 && (
            <div className="rounded-xl px-4 py-3 text-sm" style={{ background: "rgba(0,212,168,0.05)", border: "1px solid rgba(0,212,168,0.15)" }}>
              <div className="flex justify-between">
                <span className="text-gray-400">Projected Net Profit:</span>
                <span className="font-bold" style={{ color: "#00d4a8" }}>
                  {fmtUSD(budget.sales_target - budget.food_budget - budget.labor_budget - budget.infra_budget - (isBar ? budget.liquor_budget : 0))}
                  <span className="text-xs text-gray-500 ml-1">
                    ({pct((1 - budget.food_pct_target / 100 - budget.labor_pct_target / 100 - budget.infra_pct_target / 100 - (isBar ? budget.liquor_pct_target / 100 : 0)) * 100)})
                  </span>
                </span>
              </div>
            </div>
          )}

          <div>
            <label className="text-xs text-gray-400 uppercase tracking-wide font-semibold block mb-1.5">Notes</label>
            <textarea className="w-full rounded-xl px-4 py-3 text-sm text-white outline-none resize-none focus:ring-2 focus:ring-teal-500/40"
              style={inputStyle} rows={2} placeholder="e.g. Special event planned, holiday week…"
              value={budget.notes} onChange={e => setBudget(b => ({ ...b, notes: e.target.value }))} />
          </div>

          <div className="flex items-center gap-3">
            <button onClick={saveBudget} disabled={saving}
              className="px-6 py-2.5 rounded-xl text-sm font-bold disabled:opacity-50 transition-all"
              style={{ background: "#00d4a8", color: "#060b18" }}>
              {saving ? "Saving…" : "💾 Save Budget"}
            </button>
            {saveMsg && <span className="text-sm font-medium" style={{ color: saveMsg.startsWith("✓") ? "#00d4a8" : "#f87171" }}>{saveMsg}</span>}
          </div>
        </div>

        {/* 6-month trend */}
        <div className="rounded-2xl p-5" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)" }}>
          <h2 className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-4">6-Month History</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr style={{ borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
                  {["Month", "Sales", "Food", "Labor", ...(isBar ? ["Liquor"] : []), "Overhead", "Prime Cost %", "Net Profit"].map(h => (
                    <th key={h} className="px-3 py-2 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {history.map((row, idx) => {
                  const primePct = row.net_sales > 0 ? ((row.food_cost + row.labor_cost) / row.net_sales) * 100 : 0;
                  const isCurrent = idx === history.length - 1;
                  return (
                    <tr key={row.month} style={{ borderBottom: idx < history.length - 1 ? "1px solid rgba(255,255,255,0.05)" : "none", background: isCurrent ? "rgba(0,212,168,0.03)" : "transparent" }}>
                      <td className="px-3 py-2.5 font-medium" style={{ color: isCurrent ? "#00d4a8" : "#e2e8f0" }}>{monthLabel(row.month)}{isCurrent ? " ◀" : ""}</td>
                      <td className="px-3 py-2.5 text-white">{row.net_sales > 0 ? fmtUSD(row.net_sales) : <span className="text-gray-600">—</span>}</td>
                      <td className="px-3 py-2.5 text-gray-300">{row.food_cost > 0 ? fmtUSD(row.food_cost) : <span className="text-gray-600">—</span>}</td>
                      <td className="px-3 py-2.5 text-gray-300">{row.labor_cost > 0 ? fmtUSD(row.labor_cost) : <span className="text-gray-600">—</span>}</td>
                      {isBar && <td className="px-3 py-2.5 text-gray-300">{row.liquor_cost > 0 ? fmtUSD(row.liquor_cost) : <span className="text-gray-600">—</span>}</td>}
                      <td className="px-3 py-2.5 text-gray-300">{row.infra_cost > 0 ? fmtUSD(row.infra_cost) : <span className="text-gray-600">—</span>}</td>
                      <td className="px-3 py-2.5">
                        {primePct > 0
                          ? <span style={{ color: primePct > 65 ? "#f87171" : primePct > 60 ? "#fbbf24" : "#00d4a8" }}>{pct(primePct)}</span>
                          : <span className="text-gray-600">—</span>}
                      </td>
                      <td className="px-3 py-2.5 font-semibold" style={{ color: row.net_profit > 0 ? "#00d4a8" : row.net_profit < 0 ? "#f87171" : "#94a3b8" }}>
                        {row.net_sales > 0 ? fmtUSD(row.net_profit) : <span className="text-gray-600">—</span>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* 3-month forecast */}
        {forecast && forecast.some(r => r.net_sales > 0) && (
          <div className="rounded-2xl p-5" style={{ background: "rgba(129,140,248,0.04)", border: "1px solid rgba(129,140,248,0.15)" }}>
            <div className="flex items-center gap-2 mb-4">
              <h2 className="text-xs font-bold text-gray-500 uppercase tracking-widest">3-Month Forecast</h2>
              <span className="text-xs rounded-full px-2 py-0.5" style={{ background: "rgba(129,140,248,0.15)", color: "#818cf8" }}>AI trend projection</span>
            </div>
            <div className="grid grid-cols-3 gap-3">
              {forecast.map((proj, idx) => (
                <div key={proj.month} className="rounded-xl p-4" style={{ background: "rgba(129,140,248,0.06)", border: "1px solid rgba(129,140,248,0.12)" }}>
                  <div className="text-xs text-indigo-400 font-semibold mb-2">{monthLabel(proj.month)}</div>
                  <div className="text-xl font-bold text-white mb-1">{fmtUSD(proj.net_sales)}</div>
                  <div className="text-xs text-gray-500 space-y-0.5">
                    <div>Food: {fmtUSD(proj.food_cost)}</div>
                    <div>Labor: {fmtUSD(proj.labor_cost)}</div>
                    {isBar && <div>Liquor: {fmtUSD(proj.liquor_cost)}</div>}
                    <div>Overhead: {fmtUSD(proj.infra_cost)}</div>
                  </div>
                  <div className="mt-2 pt-2 border-t border-indigo-900/40">
                    <div className="text-xs font-semibold" style={{ color: proj.net_profit > 0 ? "#00d4a8" : "#f87171" }}>
                      Profit: {fmtUSD(proj.net_profit)}
                    </div>
                  </div>
                </div>
              ))}
            </div>
            <p className="text-xs text-gray-600 mt-3">Projected using trend from last {history.filter(r => r.net_sales > 0).length} months of data. Actual results will vary.</p>
          </div>
        )}
      </div>
    </div>
  );
}
