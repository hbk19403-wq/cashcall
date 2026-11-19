"use client";

import { useEffect, useState, useMemo, useCallback } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { useAuthGuard } from "@/lib/useAuthGuard";
import type { FoodCategory } from "@/lib/types";

interface Location { id: string; name: string; code: string; state: string; }

interface Budget {
  id?: string;
  location_id: string;
  month: string;           // YYYY-MM-DD
  sales_target: number;
  food_pct_target: number;
  labor_pct_target: number;
  infra_pct_target: number;
  prime_cost_target: number;
  net_profit_target: number;
  food_budget: number;
  labor_budget: number;
  infra_budget: number;
  notes: string;
}

interface Actual {
  net_sales: number;
  food_cost: number;
  labor_cost: number;
  infra_cost: number;
  net_profit: number;
  days_elapsed: number;
  days_in_month: number;
}

const fmtUSD = (n: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n);
const pct = (v: number) => v.toFixed(1) + "%";

interface MonthlySnapshot {
  monthStr: string;     // "YYYY-MM-01"
  label: string;        // "Oct 2026"
  sales: number;
  food: number;
  labor: number;
  infra: number;
  profit: number;
  primePct: number;
  isProjected: boolean;
}

function CashFlowForecast({ snapshots }: { snapshots: MonthlySnapshot[] }) {
  const actual = snapshots.filter(s => !s.isProjected);
  const projected = snapshots.filter(s => s.isProjected);
  const allMonths = [...actual, ...projected];

  const maxVal = Math.max(...allMonths.map(s => Math.abs(s.profit)), 1000);
  const maxSales = Math.max(...allMonths.map(s => s.sales), 1000);

  const primeCostColor = (pc: number) =>
    pc > 65 ? "#ef4444" : pc > 58 ? "#f59e0b" : "#00d4a8";

  return (
    <div className="space-y-4">
      {/* 6-month chart */}
      <div className="rounded-2xl overflow-hidden" style={{ border: "1px solid rgba(255,255,255,0.06)" }}>
        <div className="px-4 py-3 border-b flex items-center justify-between"
          style={{ background: "rgba(255,255,255,0.02)", borderColor: "rgba(255,255,255,0.06)" }}>
          <div className="text-sm font-bold text-white">Net Cash Position — 3 Month History + 3 Month Projection</div>
          <div className="text-xs text-gray-500 flex items-center gap-3">
            <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-sm inline-block" style={{ background: "rgba(0,212,168,0.6)" }} />Actual</span>
            <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-sm inline-block border border-dashed" style={{ background: "rgba(129,140,248,0.3)", borderColor: "#818cf8" }} />Projected</span>
          </div>
        </div>
        <div className="p-4">
          <div className="flex items-end gap-2 h-40">
            {allMonths.map((s, i) => {
              const barH = Math.abs(s.profit) / maxVal * 100;
              const isNeg = s.profit < 0;
              const color = s.isProjected
                ? (isNeg ? "rgba(239,68,68,0.4)" : "rgba(129,140,248,0.5)")
                : (isNeg ? "#ef4444" : "#00d4a8");
              return (
                <div key={i} className="flex-1 flex flex-col items-center gap-1">
                  <div className="text-[10px] font-bold tabular-nums" style={{ color: isNeg ? "#ef4444" : "#00d4a8" }}>
                    {isNeg ? "-" : "+"}{fmtUSD(Math.abs(s.profit)).replace("$", "")}
                  </div>
                  <div className="w-full flex items-end justify-center" style={{ height: 80 }}>
                    <div className="w-full rounded-t-lg transition-all"
                      style={{
                        height: `${Math.max(barH, 4)}%`,
                        background: color,
                        border: s.isProjected ? "1px dashed rgba(129,140,248,0.6)" : "none",
                      }} />
                  </div>
                  <div className="text-[9px] text-gray-500 text-center leading-tight">{s.label}</div>
                  {s.isProjected && <div className="text-[8px] text-purple-400 font-bold">PROJ</div>}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Monthly table */}
      <div className="rounded-2xl overflow-hidden" style={{ border: "1px solid rgba(255,255,255,0.06)" }}>
        <table className="w-full text-sm">
          <thead>
            <tr style={{ background: "rgba(255,255,255,0.02)" }}>
              {["Month", "Revenue", "Food", "Labor", "Infra", "Prime%", "Net Cash"].map(h => (
                <th key={h} className="px-3 py-2 text-left text-xs text-gray-500 uppercase tracking-wider font-medium">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {allMonths.map((s, i) => (
              <tr key={i} className="border-t transition-colors hover:bg-white/[0.015]"
                style={{
                  borderColor: "rgba(255,255,255,0.04)",
                  background: s.isProjected ? "rgba(129,140,248,0.03)" : undefined,
                }}>
                <td className="px-3 py-2.5">
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs font-semibold text-white">{s.label}</span>
                    {s.isProjected && (
                      <span className="text-[9px] px-1.5 py-0.5 rounded font-bold"
                        style={{ background: "rgba(129,140,248,0.2)", color: "#818cf8" }}>PROJ</span>
                    )}
                  </div>
                </td>
                <td className="px-3 py-2.5 text-xs font-bold tabular-nums text-white">{fmtUSD(s.sales)}</td>
                <td className="px-3 py-2.5 text-xs tabular-nums" style={{ color: s.food / s.sales > 0.3 ? "#f59e0b" : "#9ca3af" }}>
                  {fmtUSD(s.food)} <span className="text-gray-600">({s.sales > 0 ? pct(s.food / s.sales * 100) : "—"})</span>
                </td>
                <td className="px-3 py-2.5 text-xs tabular-nums" style={{ color: s.labor / s.sales > 0.32 ? "#f59e0b" : "#9ca3af" }}>
                  {fmtUSD(s.labor)} <span className="text-gray-600">({s.sales > 0 ? pct(s.labor / s.sales * 100) : "—"})</span>
                </td>
                <td className="px-3 py-2.5 text-xs tabular-nums text-gray-400">{fmtUSD(s.infra)}</td>
                <td className="px-3 py-2.5 text-xs font-bold tabular-nums"
                  style={{ color: primeCostColor(s.primePct) }}>{pct(s.primePct)}</td>
                <td className="px-3 py-2.5 text-xs font-bold tabular-nums"
                  style={{ color: s.profit < 0 ? "#ef4444" : "#00d4a8" }}>
                  {s.profit < 0 ? "-" : "+"}{fmtUSD(Math.abs(s.profit))}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr style={{ background: "rgba(0,212,168,0.04)", borderTop: "1px solid rgba(0,212,168,0.15)" }}>
              <td className="px-3 py-2 text-xs font-bold text-white">6-Month Total</td>
              <td className="px-3 py-2 text-xs font-bold tabular-nums text-white">{fmtUSD(allMonths.reduce((s, m) => s + m.sales, 0))}</td>
              <td className="px-3 py-2 text-xs tabular-nums text-gray-400">{fmtUSD(allMonths.reduce((s, m) => s + m.food, 0))}</td>
              <td className="px-3 py-2 text-xs tabular-nums text-gray-400">{fmtUSD(allMonths.reduce((s, m) => s + m.labor, 0))}</td>
              <td className="px-3 py-2 text-xs tabular-nums text-gray-400">{fmtUSD(allMonths.reduce((s, m) => s + m.infra, 0))}</td>
              <td className="px-3 py-2"></td>
              <td className="px-3 py-2 text-xs font-bold tabular-nums" style={{ color: allMonths.reduce((s, m) => s + m.profit, 0) < 0 ? "#ef4444" : "#00d4a8" }}>
                {fmtUSD(allMonths.reduce((s, m) => s + m.profit, 0))}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>

      {/* Cash pressure warnings */}
      {projected.some(s => s.profit < 0) && (
        <div className="rounded-2xl p-4" style={{ background: "rgba(239,68,68,0.06)", border: "1px solid rgba(239,68,68,0.2)" }}>
          <div className="flex gap-3 items-start">
            <span className="text-lg">⚠️</span>
            <div>
              <div className="text-sm font-bold text-red-400 mb-1">Cash Pressure Alert</div>
              <div className="text-xs text-gray-400">
                Projection shows negative cash in {projected.filter(s => s.profit < 0).map(s => s.label).join(", ")}.
                Review your prime cost targets and consider: reducing overtime, renegotiating supplier prices, or adjusting menu pricing.
              </div>
            </div>
          </div>
        </div>
      )}

      {projected.every(s => s.profit > 0) && (
        <div className="rounded-2xl p-4" style={{ background: "rgba(0,212,168,0.04)", border: "1px solid rgba(0,212,168,0.15)" }}>
          <div className="text-xs text-gray-400">
            ✅ <strong className="text-white">Cash flow looks healthy</strong> — based on your last 3 months trend, all projected months show positive net cash. Keep prime cost at or below {pct(58)} to stay on track.
          </div>
        </div>
      )}

      <div className="text-[10px] text-gray-600 px-1">
        Projections use a weighted average of the last 3 months with linear trend adjustment. Actual results will vary based on sales volume, vendor pricing, and staffing changes.
      </div>
    </div>
  );
}

function emptyBudget(locationId: string, month: string): Budget {
  return {
    location_id: locationId, month,
    sales_target: 0,
    food_pct_target: 28, labor_pct_target: 30, infra_pct_target: 19,
    prime_cost_target: 58, net_profit_target: 22,
    food_budget: 0, labor_budget: 0, infra_budget: 0,
    notes: "",
  };
}

function VarianceBar({ label, actual, budget, color, invert = false }: {
  label: string; actual: number; budget: number; color: string; invert?: boolean;
}) {
  if (!budget) return null;
  const ratio = actual / budget;
  const over  = invert ? actual > budget : actual < budget;
  const barColor = over ? "#ef4444" : color;
  const pctUsed  = Math.min(ratio * 100, 120);
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-xs">
        <span className="text-gray-600 font-medium">{label}</span>
        <div className="flex items-center gap-2">
          <span className="text-gray-400">Actual: <strong className="text-gray-700">{fmtUSD(actual)}</strong></span>
          <span className="text-gray-300">/</span>
          <span className="text-gray-400">Budget: <strong>{fmtUSD(budget)}</strong></span>
          <span className="text-xs font-bold px-1.5 py-0.5 rounded-full"
            style={{ background: over ? "#fef2f2" : "#f0fdf4", color: over ? "#dc2626" : "#16a34a" }}>
            {over ? "▲" : "▼"} {Math.abs((ratio - 1) * 100).toFixed(1)}%
          </span>
        </div>
      </div>
      <div className="relative h-2 rounded-full overflow-hidden" style={{ background: "#f3f4f6" }}>
        <div className="h-full rounded-full transition-all" style={{ width: `${Math.min(pctUsed, 100)}%`, background: barColor }} />
        {/* Budget marker at 100% */}
        <div className="absolute top-0 h-full w-0.5 bg-gray-400" style={{ left: "100%" }} />
      </div>
    </div>
  );
}

function ForecastCard({ actual, budget, label }: { actual: Actual; budget: Budget; label: string }) {
  const { days_elapsed, days_in_month } = actual;
  if (!days_elapsed || !actual.net_sales) return null;

  const dailyRevRate  = actual.net_sales / days_elapsed;
  const forecastSales = dailyRevRate * days_in_month;
  const forecastFood  = actual.food_cost  / days_elapsed * days_in_month;
  const forecastLabor = actual.labor_cost / days_elapsed * days_in_month;
  const forecastInfra = actual.infra_cost / days_elapsed * days_in_month;
  const forecastProfit = forecastSales - forecastFood - forecastLabor - forecastInfra;
  const forecastPrimePct = forecastSales > 0 ? ((forecastFood + forecastLabor) / forecastSales) * 100 : 0;
  const daysLeft = days_in_month - days_elapsed;

  const salesGap = budget.sales_target > 0 ? budget.sales_target - forecastSales : 0;
  const primePcTarget = budget.prime_cost_target;

  return (
    <div className="rounded-2xl border border-gray-200 overflow-hidden bg-white">
      <div className="px-5 py-3 border-b border-gray-100" style={{ background: "#faf7f2" }}>
        <div className="flex items-center justify-between">
          <h4 className="text-sm font-bold text-gray-800">📈 Month-End Forecast — {label}</h4>
          <span className="text-xs text-gray-400">{days_elapsed}d elapsed · {daysLeft}d left</span>
        </div>
      </div>
      <div className="p-5 grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          { l: "Projected Sales",    v: forecastSales,  target: budget.sales_target,   good: forecastSales >= budget.sales_target },
          { l: "Projected Profit",   v: forecastProfit, target: budget.sales_target * budget.net_profit_target / 100, good: forecastProfit > 0 },
          { l: "Prime Cost (proj)",  v: forecastPrimePct, target: primePcTarget, good: forecastPrimePct <= primePcTarget, isPct: true },
          { l: "Sales Gap vs Budget",v: Math.abs(salesGap), target: 0, good: salesGap <= 0, isGap: true },
        ].map(({ l, v, target, good, isPct, isGap }) => (
          <div key={l} className="rounded-xl p-3" style={{ background: good ? "#f0fdf4" : "#fef2f2" }}>
            <p className="text-[10px] text-gray-500 font-medium uppercase tracking-wide">{l}</p>
            <p className="text-xl font-black mt-0.5" style={{ color: good ? "#15803d" : "#dc2626" }}>
              {isPct ? pct(v) : isGap ? (salesGap <= 0 ? "On track" : fmtUSD(v) + " short") : fmtUSD(v)}
            </p>
            {target > 0 && !isGap && (
              <p className="text-[10px] text-gray-400 mt-0.5">
                Target: {isPct ? pct(target) : fmtUSD(target)}
              </p>
            )}
          </div>
        ))}
      </div>
      <div className="px-5 pb-4">
        <div className="rounded-xl bg-amber-50 border border-amber-100 px-4 py-3 text-xs text-amber-800">
          <strong>At current pace:</strong> Revenue {fmtUSD(forecastSales)} · Food {pct(forecastSales > 0 ? forecastFood/forecastSales*100 : 0)} ·
          Labor {pct(forecastSales > 0 ? forecastLabor/forecastSales*100 : 0)} ·
          Prime {pct(forecastPrimePct)} · Net Profit {pct(forecastSales > 0 ? forecastProfit/forecastSales*100 : 0)}
        </div>
      </div>
    </div>
  );
}

export default function BudgetPage() {
  const supabase = useMemo(() => createClient(), []);
  const { ready } = useAuthGuard();

  const now = new Date();
  const [year,  setYear]  = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [tab,   setTab]   = useState<"overview" | "set" | "forecast" | "plan" | "cashflow">("overview");

  const [locations, setLocations]   = useState<Location[]>([]);
  const [budgets,   setBudgets]     = useState<Budget[]>([]);
  const [actuals,   setActuals]     = useState<Record<string, Actual>>({});
  const [saving,    setSaving]      = useState<Record<string, boolean>>({});
  const [msgs,      setMsgs]        = useState<Record<string, string>>({});
  const [forms,     setForms]       = useState<Record<string, Budget>>({});
  const [cashFlowData, setCashFlowData] = useState<Record<string, MonthlySnapshot[]>>({});

  const monthStr  = `${year}-${String(month).padStart(2, "0")}-01`;
  const monthLabel = new Date(monthStr + "T12:00:00").toLocaleDateString("en-US", { month: "long", year: "numeric" });

  const nav = (d: number) => {
    let m = month + d, y = year;
    if (m > 12) { m = 1;  y++; }
    if (m < 1)  { m = 12; y--; }
    setMonth(m); setYear(y);
  };

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) return;
      supabase.from("locations").select("id,name,code,state").eq("app", "cashcall").eq("user_id", user.id).order("name")
        .then(({ data }) => setLocations(data ?? []));
    });
  }, []);

  const loadBudgets = useCallback(async () => {
    const { data } = await supabase.from("location_budgets").select("*").eq("month", monthStr);
    const b = data ?? [];
    setBudgets(b);
    // Init forms
    const f: Record<string, Budget> = {};
    for (const loc of locations) {
      f[loc.id] = b.find(x => x.location_id === loc.id) ?? emptyBudget(loc.id, monthStr);
    }
    setForms(f);
  }, [monthStr, locations, supabase]);

  useEffect(() => { loadBudgets(); }, [loadBudgets]);

  // Load actuals
  useEffect(() => {
    if (!locations.length) return;
    const start = monthStr;
    const end   = new Date(year, month, 1).toISOString().slice(0, 10);
    const today = now.toISOString().slice(0, 10);
    const daysInMonth = new Date(year, month, 0).getDate();
    const daysElapsed = Math.min(now.getDate(), daysInMonth);

    Promise.all(locations.map(async loc => {
      const [foodRes, salesRes, laborRes, infraRes] = await Promise.all([
        supabase.from("food_deliveries").select("amount").eq("location_id", loc.id).gte("delivery_date", start).lt("delivery_date", end),
        supabase.from("daily_sales").select("cash_sales,pos_sales,uber_eats_gross,grubhub_gross,doordash_gross,catering_sales,aggregator_commission").eq("location_id", loc.id).gte("sale_date", start).lt("sale_date", end),
        supabase.from("salary_disbursements").select("amount").eq("location_id", loc.id).gte("disbursed_on", start).lt("disbursed_on", end),
        supabase.from("monthly_infrastructure").select("rent,utilities,staff_accommodation,staff_accom_utilities,insurance,car_payment,gas_expenses,phone,store_internet,trash,repairs_maintenance,pest_control,marketing_fee,bank_charges,pos_charges,credit_card_fee,custom_fields").eq("location_id", loc.id).gte("month", start).lt("month", end),
      ]);

      const food_cost  = (foodRes.data ?? []).reduce((s, r) => s + Number(r.amount ?? 0), 0);
      const labor_cost = (laborRes.data ?? []).reduce((s, r) => s + Number(r.amount ?? 0), 0);
      const infra_cost = (infraRes.data ?? []).reduce((s, r) => {
        const fixed = ["rent","utilities","staff_accommodation","staff_accom_utilities","insurance","car_payment","gas_expenses","phone","store_internet","trash","repairs_maintenance","pest_control","marketing_fee","bank_charges","pos_charges","credit_card_fee"]
          .reduce((t, k) => t + Number((r as Record<string, unknown>)[k] ?? 0), 0);
        const customFields = (r as Record<string, unknown>).custom_fields as Record<string, unknown> ?? {};
        const custom = Object.values(customFields).reduce((t: number, v: unknown) => t + Number(v ?? 0), 0);
        return s + fixed + custom;
      }, 0);

      let gross_sales = 0, agg_commission = 0;
      for (const r of (salesRes.data ?? [])) {
        gross_sales += Number(r.cash_sales ?? 0) + Number(r.pos_sales ?? 0)
          + Number(r.uber_eats_gross ?? 0) + Number(r.grubhub_gross ?? 0)
          + Number(r.doordash_gross ?? 0) + Number(r.catering_sales ?? 0);
        agg_commission += Number(r.aggregator_commission ?? 0);
      }
      const net_sales  = gross_sales - agg_commission;
      const net_profit = net_sales - food_cost - labor_cost - infra_cost;

      return [loc.id, { net_sales, food_cost, labor_cost, infra_cost, net_profit, days_elapsed: daysElapsed, days_in_month: daysInMonth }] as const;
    })).then(results => {
      setActuals(Object.fromEntries(results));
    });
  }, [locations, monthStr, year, month, supabase]);

  const setField = (locId: string, field: keyof Budget, value: number | string) => {
    setForms(p => {
      const f = { ...p[locId], [field]: value };
      // Auto-compute absolute budgets from pct targets when sales target changes
      if (field === "sales_target" || field === "food_pct_target" || field === "labor_pct_target" || field === "infra_pct_target") {
        const s = Number(field === "sales_target" ? value : f.sales_target);
        f.food_budget  = s * f.food_pct_target  / 100;
        f.labor_budget = s * f.labor_pct_target / 100;
        f.infra_budget = s * f.infra_pct_target / 100;
        f.prime_cost_target = Number(f.food_pct_target) + Number(f.labor_pct_target);
      }
      return { ...p, [locId]: f };
    });
  };

  const saveBudget = async (locId: string) => {
    setSaving(p => ({ ...p, [locId]: true }));
    const b = { ...forms[locId], month: monthStr, updated_at: new Date().toISOString() };
    const { error } = await supabase.from("location_budgets").upsert(b, { onConflict: "location_id,month" });
    setSaving(p => ({ ...p, [locId]: false }));
    if (error) {
      setMsgs(p => ({ ...p, [locId]: "✗ " + error.message }));
    } else {
      setMsgs(p => ({ ...p, [locId]: "✓ Saved!" }));
      setTimeout(() => setMsgs(p => ({ ...p, [locId]: "" })), 3000);
      loadBudgets();
    }
  };

  // Load 3 months of history for cash flow forecasting
  useEffect(() => {
    if (!locations.length || tab !== "cashflow") return;

    const fetchMonthSnapshot = async (locId: string, mStr: string, mLabel: string, isProjected: boolean): Promise<MonthlySnapshot> => {
      const startDate = new Date(mStr + "T00:00:00Z");
      const endDate   = new Date(startDate);
      endDate.setUTCMonth(endDate.getUTCMonth() + 1);
      const endStr = endDate.toISOString().slice(0, 10);

      if (isProjected) {
        // For projected months, return zeros (will be filled from trend)
        return { monthStr: mStr, label: mLabel, sales: 0, food: 0, labor: 0, infra: 0, profit: 0, primePct: 0, isProjected: true };
      }

      const [salesRes, foodRes, laborRes, infraRes] = await Promise.all([
        supabase.from("daily_sales").select("cash_sales,pos_sales,uber_eats_gross,grubhub_gross,doordash_gross,catering_sales,aggregator_commission").eq("location_id", locId).gte("sale_date", mStr).lt("sale_date", endStr),
        supabase.from("food_deliveries").select("amount").eq("location_id", locId).gte("delivery_date", mStr).lt("delivery_date", endStr),
        supabase.from("salary_disbursements").select("amount").eq("location_id", locId).gte("disbursed_on", mStr).lt("disbursed_on", endStr),
        supabase.from("monthly_infrastructure").select("rent,utilities,insurance,staff_accommodation,staff_accom_utilities,car_payment,gas_expenses,phone,store_internet,trash,repairs_maintenance,pest_control,marketing_fee,bank_charges,pos_charges,credit_card_fee").eq("location_id", locId).eq("month", mStr).maybeSingle(),
      ]);

      const n = (v: unknown) => parseFloat(String(v ?? 0)) || 0;
      const sales = (salesRes.data ?? []).reduce((s, r) => s + n(r.cash_sales) + n(r.pos_sales) + n(r.uber_eats_gross) + n(r.grubhub_gross) + n(r.doordash_gross) + n(r.catering_sales) - n(r.aggregator_commission), 0);
      const food  = (foodRes.data ?? []).reduce((s, r) => s + n(r.amount), 0);
      const labor = (laborRes.data ?? []).reduce((s, r) => s + n(r.amount), 0);
      const inf   = infraRes.data ?? {};
      const infra = ["rent","utilities","insurance","staff_accommodation","staff_accom_utilities","car_payment","gas_expenses","phone","store_internet","trash","repairs_maintenance","pest_control","marketing_fee","bank_charges","pos_charges","credit_card_fee"].reduce((s, f) => s + n((inf as Record<string, unknown>)[f]), 0);
      const profit = sales - food - labor - infra;
      const primePct = sales > 0 ? ((food + labor) / sales) * 100 : 0;
      return { monthStr: mStr, label: mLabel, sales, food, labor, infra, profit, primePct, isProjected: false };
    };

    Promise.all(locations.map(async (loc) => {
      const months: { mStr: string; label: string }[] = [];
      for (let i = -2; i <= 0; i++) {
        const d = new Date(now.getFullYear(), now.getMonth() + i, 1);
        months.push({ mStr: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`, label: d.toLocaleDateString("en-US", { month: "short", year: "numeric" }) });
      }

      const actualSnapshots = await Promise.all(months.map(m => fetchMonthSnapshot(loc.id, m.mStr, m.label, false)));
      const withData = actualSnapshots.filter(s => s.sales > 0);

      // Trend: weighted avg of available months (most recent = 3x weight)
      const weights = withData.length === 3 ? [1, 2, 3] : withData.length === 2 ? [1, 2] : [1];
      const totalWeight = weights.reduce((s, w) => s + w, 0);
      const wSales  = withData.reduce((s, snap, i) => s + snap.sales  * weights[i], 0) / totalWeight;
      const wFood   = withData.reduce((s, snap, i) => s + snap.food   * weights[i], 0) / totalWeight;
      const wLabor  = withData.reduce((s, snap, i) => s + snap.labor  * weights[i], 0) / totalWeight;
      const wInfra  = withData.reduce((s, snap, i) => s + snap.infra  * weights[i], 0) / totalWeight;

      // Month-over-month growth rate (last 2 months if available)
      let growthRate = 1.0;
      if (withData.length >= 2) {
        const last  = withData[withData.length - 1].sales;
        const prev  = withData[withData.length - 2].sales;
        if (prev > 0) growthRate = Math.max(0.85, Math.min(1.15, last / prev)); // cap at ±15%
      }

      // Build projected months
      const projectedMonths: MonthlySnapshot[] = [];
      for (let i = 1; i <= 3; i++) {
        const d = new Date(now.getFullYear(), now.getMonth() + i, 1);
        const scale = Math.pow(growthRate, i);
        const pSales = wSales * scale;
        const pFood  = wFood  * scale;
        const pLabor = wLabor; // labor tends to be stickier
        const pInfra = wInfra; // infra is mostly fixed
        const pProfit = pSales - pFood - pLabor - pInfra;
        const pPrime  = pSales > 0 ? ((pFood + pLabor) / pSales) * 100 : 0;
        projectedMonths.push({
          monthStr: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`,
          label: d.toLocaleDateString("en-US", { month: "short", year: "numeric" }),
          sales: Math.round(pSales), food: Math.round(pFood),
          labor: Math.round(pLabor), infra: Math.round(pInfra),
          profit: Math.round(pProfit), primePct: pPrime, isProjected: true,
        });
      }

      return [loc.id, [...actualSnapshots, ...projectedMonths]] as const;
    })).then(results => setCashFlowData(Object.fromEntries(results) as Record<string, MonthlySnapshot[]>));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [locations, tab]);

  // Build next month budgets from this month's averages
  const buildNextMonthPlan = async (locId: string) => {
    const a = actuals[locId];
    if (!a || !a.net_sales) { setMsgs(p => ({ ...p, [locId]: "⚠ No actuals yet for projection" })); return; }
    const nextM = month === 12 ? 1 : month + 1;
    const nextY = month === 12 ? year + 1 : year;
    const nextMonthStr = `${nextY}-${String(nextM).padStart(2, "0")}-01`;
    const daysNext = new Date(nextY, nextM, 0).getDate();

    // Scale actuals to next full month
    const scale = daysNext / a.days_in_month;
    const projSales = a.net_sales  * scale * 1.05; // +5% growth assumption
    const foodPct   = a.net_sales > 0 ? a.food_cost  / a.net_sales * 100 : 28;
    const laborPct  = a.net_sales > 0 ? a.labor_cost / a.net_sales * 100 : 30;
    const infraPct  = a.net_sales > 0 ? a.infra_cost / a.net_sales * 100 : 19;

    const plan = {
      location_id: locId, month: nextMonthStr,
      sales_target:      Math.round(projSales),
      food_pct_target:   parseFloat(foodPct.toFixed(1)),
      labor_pct_target:  parseFloat(laborPct.toFixed(1)),
      infra_pct_target:  parseFloat(infraPct.toFixed(1)),
      prime_cost_target: parseFloat((foodPct + laborPct).toFixed(1)),
      net_profit_target: 22,
      food_budget:       Math.round(projSales * foodPct  / 100),
      labor_budget:      Math.round(projSales * laborPct / 100),
      infra_budget:      Math.round(projSales * infraPct / 100),
      notes: `Auto-generated from ${monthLabel} actuals (+5% growth)`,
    };
    const { error } = await supabase.from("location_budgets").upsert(plan, { onConflict: "location_id,month" });
    setMsgs(p => ({ ...p, [locId]: error ? "✗ " + error.message : `✓ Next month plan saved!` }));
    setTimeout(() => setMsgs(p => ({ ...p, [locId]: "" })), 4000);
  };

  if (!ready) return <div className="min-h-screen flex items-center justify-center"><div className="w-8 h-8 border-2 border-amber-400 border-t-transparent rounded-full animate-spin" /></div>;

  const TABS = [
    { key: "overview",  label: "📊 Overview" },
    { key: "set",       label: "✏️ Set Budgets" },
    { key: "forecast",  label: "🔮 Forecast" },
    { key: "cashflow",  label: "💸 Cash Flow" },
    { key: "plan",      label: "📅 Next Month Plan" },
  ] as const;

  // Summary totals
  const totalActual  = Object.values(actuals).reduce((s, a) => ({ sales: s.sales + a.net_sales, profit: s.profit + a.net_profit, food: s.food + a.food_cost, labor: s.labor + a.labor_cost }), { sales: 0, profit: 0, food: 0, labor: 0 });
  const totalBudget  = budgets.reduce((s, b) => ({ sales: s.sales + b.sales_target, food: s.food + b.food_budget, labor: s.labor + b.labor_budget }), { sales: 0, food: 0, labor: 0 });

  return (
    <div className="min-h-screen bg-[#060b18]">
      <nav className="bg-[#0a1628] border-b border-white/10 px-4 h-14 flex items-center gap-3 sticky top-0 z-10">
        <Link href="/dashboard" className="text-sm text-gray-400 hover:text-white">← Dashboard</Link>
        <span className="font-semibold text-white">Budget & Forecast</span>
      </nav>

      <main className="max-w-5xl mx-auto px-4 py-6 space-y-5">
        {/* Month picker */}
        <div className="flex items-center gap-3">
          <button onClick={() => nav(-1)} className="border border-white/20 rounded-lg px-3 py-1.5 text-gray-400 hover:bg-white/10">‹</button>
          <span className="font-bold text-gray-800 min-w-[160px] text-center">{monthLabel}</span>
          <button onClick={() => nav(1)}  className="border border-white/20 rounded-lg px-3 py-1.5 text-gray-400 hover:bg-white/10">›</button>
        </div>

        {/* Hero summary */}
        <div className="rounded-2xl p-6 grid grid-cols-2 sm:grid-cols-4 gap-4" style={{ background: "linear-gradient(135deg,#1a0d02,#2c1a0e)" }}>
          {[
            { l: "Actual Revenue",    v: fmtUSD(totalActual.sales),  sub: totalBudget.sales > 0 ? `Budget: ${fmtUSD(totalBudget.sales)}` : "No budget set", good: totalActual.sales >= totalBudget.sales || totalBudget.sales === 0 },
            { l: "Actual Profit",     v: fmtUSD(totalActual.profit), sub: `${totalActual.sales > 0 ? pct(totalActual.profit / totalActual.sales * 100) : "—"} margin`, good: totalActual.profit > 0 },
            { l: "Prime Cost (act.)", v: totalActual.sales > 0 ? pct((totalActual.food + totalActual.labor) / totalActual.sales * 100) : "—", sub: "Target: ≤58%", good: totalActual.sales > 0 && (totalActual.food + totalActual.labor) / totalActual.sales * 100 <= 58 },
            { l: "Locations w/ budget",v: `${budgets.length}/${locations.length}`, sub: budgets.length < locations.length ? "Set budgets below" : "All covered", good: budgets.length === locations.length },
          ].map(({ l, v, sub, good }) => (
            <div key={l} className="rounded-xl p-4" style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)" }}>
              <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400">{l}</p>
              <p className="text-2xl font-black mt-1" style={{ color: good ? "#22c55e" : "#ef4444" }}>{v}</p>
              <p className="text-[10px] text-gray-500 mt-0.5">{sub}</p>
            </div>
          ))}
        </div>

        {/* Tabs */}
        <div className="flex gap-1 bg-white/5 p-1 rounded-xl w-fit">
          {TABS.map(t => (
            <button key={t.key} onClick={() => setTab(t.key)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${tab === t.key ? "bg-white/10 shadow text-white" : "text-gray-400 hover:text-gray-200"}`}>
              {t.label}
            </button>
          ))}
        </div>

        {/* ── OVERVIEW TAB ── */}
        {tab === "overview" && (
          <div className="space-y-4">
            {locations.map(loc => {
              const a = actuals[loc.id];
              const b = budgets.find(x => x.location_id === loc.id);
              if (!a || !b) return (
                <div key={loc.id} className="bg-[#0f172a] rounded-2xl border border-white/10 p-5 flex items-center justify-between">
                  <div>
                    <p className="font-semibold text-gray-800">{loc.name}</p>
                    <p className="text-xs text-gray-400">{!b ? "No budget set" : "No actuals yet"}</p>
                  </div>
                  <button onClick={() => setTab("set")} className="text-xs text-amber-600 hover:underline">Set Budget →</button>
                </div>
              );
              return (
                <div key={loc.id} className="bg-[#0f172a] rounded-2xl border border-white/10 shadow-sm overflow-hidden">
                  <div className="px-5 py-3 border-b border-gray-100 flex items-center justify-between" style={{ background: "#faf7f2" }}>
                    <div>
                      <p className="font-bold text-gray-900">{loc.name}</p>
                      <p className="text-xs text-gray-400">{loc.code} · {loc.state}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-bold" style={{ color: a.net_profit >= 0 ? "#16a34a" : "#dc2626" }}>{fmtUSD(a.net_profit)}</p>
                      <p className="text-xs text-gray-400">Net profit</p>
                    </div>
                  </div>
                  <div className="p-5 space-y-3">
                    <VarianceBar label="Revenue" actual={a.net_sales}  budget={b.sales_target}  color="#e8b84b" invert />
                    <VarianceBar label="Food"    actual={a.food_cost}  budget={b.food_budget}   color="#d97706" />
                    <VarianceBar label="Labor"   actual={a.labor_cost} budget={b.labor_budget}  color="#3b82f6" />
                    <VarianceBar label="Infra"   actual={a.infra_cost} budget={b.infra_budget}  color="#8b5cf6" />
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* ── SET BUDGETS TAB ── */}
        {tab === "set" && (
          <div className="space-y-4">
            {locations.map(loc => {
              const f = forms[loc.id] ?? emptyBudget(loc.id, monthStr);
              const m = msgs[loc.id] ?? "";
              return (
                <div key={loc.id} className="bg-[#0f172a] rounded-2xl border border-white/10 shadow-sm overflow-hidden">
                  <div className="px-6 py-4 border-b border-gray-100" style={{ background: "#faf7f2" }}>
                    <p className="font-bold text-gray-900">{loc.name} <span className="text-xs font-normal text-gray-400 ml-1">{loc.state}</span></p>
                  </div>
                  <div className="px-6 py-5 space-y-4">
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                      {([
                        { key: "sales_target",      label: "Sales Target ($)",       prefix: "$" },
                        { key: "food_pct_target",   label: "Food Cost Target (%)",   suffix: "%" },
                        { key: "labor_pct_target",  label: "Labor Cost Target (%)",  suffix: "%" },
                        { key: "net_profit_target", label: "Net Profit Target (%)",  suffix: "%" },
                      ] as { key: keyof Budget; label: string; prefix?: string; suffix?: string }[]).map(({ key, label, prefix, suffix }) => (
                        <div key={key}>
                          <label className="text-xs font-medium text-gray-600 block mb-1">{label}</label>
                          <div className="relative">
                            {prefix && <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">{prefix}</span>}
                            <input type="number" step="0.1" min="0"
                              value={f[key] as number || ""}
                              onChange={e => setField(loc.id, key, parseFloat(e.target.value) || 0)}
                              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
                              style={{ paddingLeft: prefix ? "1.75rem" : "0.75rem" }} />
                            {suffix && <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">{suffix}</span>}
                          </div>
                        </div>
                      ))}
                    </div>

                    {/* Auto-computed budgets */}
                    {f.sales_target > 0 && (
                      <div className="grid grid-cols-3 gap-3 text-xs bg-white/5 rounded-xl p-3">
                        {[
                          { l: "Food Budget",  v: f.food_budget  },
                          { l: "Labor Budget", v: f.labor_budget },
                          { l: "Infra Budget", v: f.infra_budget },
                        ].map(({ l, v }) => (
                          <div key={l}>
                            <p className="text-gray-400">{l}</p>
                            <p className="font-bold text-gray-800">{fmtUSD(v)}</p>
                          </div>
                        ))}
                      </div>
                    )}

                    <div>
                      <label className="text-xs font-medium text-gray-600 block mb-1">Notes</label>
                      <input type="text" value={f.notes}
                        onChange={e => setField(loc.id, "notes", e.target.value)}
                        placeholder="e.g. Ramadan month — expect +20% food"
                        className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400" />
                    </div>

                    <div className="flex items-center gap-3">
                      <button onClick={() => saveBudget(loc.id)} disabled={saving[loc.id]}
                        className="px-5 py-2.5 rounded-xl text-sm font-semibold text-white disabled:opacity-50 transition-colors"
                        style={{ background: "#1a0d02" }}>
                        {saving[loc.id] ? "Saving…" : "Save Budget"}
                      </button>
                      {m && <span className={`text-xs font-medium ${m.startsWith("✓") ? "text-green-600" : "text-red-500"}`}>{m}</span>}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* ── FORECAST TAB ── */}
        {tab === "forecast" && (
          <div className="space-y-4">
            {locations.map(loc => {
              const a = actuals[loc.id];
              const b = budgets.find(x => x.location_id === loc.id);
              if (!a || !b) return (
                <div key={loc.id} className="bg-[#0f172a] rounded-2xl border border-white/10 p-5 text-sm text-gray-400">
                  {loc.name} — {!b ? "Set a budget first" : "No sales data yet"}
                </div>
              );
              return (
                <ForecastCard key={loc.id} actual={a} budget={b}
                  label={`${loc.name} · ${monthLabel}`} />
              );
            })}
          </div>
        )}

        {/* ── CASH FLOW TAB ── */}
        {tab === "cashflow" && (
          <div className="space-y-6">
            {locations.length === 0 && (
              <div className="text-sm text-gray-400 p-5">No locations found.</div>
            )}
            {locations.map(loc => {
              const snapshots = cashFlowData[loc.id];
              return (
                <div key={loc.id} className="rounded-2xl overflow-hidden" style={{ border: "1px solid rgba(255,255,255,0.08)" }}>
                  <div className="px-5 py-3 border-b flex items-center justify-between"
                    style={{ background: "rgba(255,255,255,0.02)", borderColor: "rgba(255,255,255,0.08)" }}>
                    <div>
                      <div className="text-sm font-bold text-white">{loc.name}</div>
                      <div className="text-xs text-gray-500">{loc.code} · {loc.state}</div>
                    </div>
                    <div className="text-xs text-gray-500">90-day cash flow projection</div>
                  </div>
                  <div className="p-4">
                    {!snapshots ? (
                      <div className="flex items-center gap-2 text-xs text-gray-500 py-6 justify-center">
                        <div className="w-4 h-4 border-2 border-teal-400 border-t-transparent rounded-full animate-spin" />
                        Loading historical data…
                      </div>
                    ) : snapshots.filter(s => !s.isProjected && s.sales > 0).length === 0 ? (
                      <div className="text-sm text-gray-500 py-6 text-center">
                        No sales data in the last 3 months — enter sales data to see cash flow projections.
                      </div>
                    ) : (
                      <CashFlowForecast snapshots={snapshots} />
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* ── NEXT MONTH PLAN TAB ── */}
        {tab === "plan" && (
          <div className="space-y-4">
            <div className="bg-blue-50 border border-blue-100 rounded-2xl p-5 text-sm text-blue-800">
              <strong>Auto-generate next month's budget</strong> from this month's actuals with a 5% growth assumption. Review and tweak before saving.
            </div>
            {locations.map(loc => {
              const a = actuals[loc.id];
              const m = msgs[loc.id] ?? "";
              const nextM = month === 12 ? 1 : month + 1;
              const nextY = month === 12 ? year + 1 : year;
              const nextLabel = new Date(nextY, nextM - 1, 1).toLocaleDateString("en-US", { month: "long", year: "numeric" });
              return (
                <div key={loc.id} className="bg-[#0f172a] rounded-2xl border border-white/10 shadow-sm p-5">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-bold text-gray-900">{loc.name}</p>
                      <p className="text-xs text-gray-400 mt-0.5">
                        {a?.net_sales
                          ? `This month: ${fmtUSD(a.net_sales)} revenue · Projecting +5% → ${fmtUSD(a.net_sales * 1.05)} for ${nextLabel}`
                          : "No actuals yet — plan will use default targets"}
                      </p>
                    </div>
                    <div className="flex items-center gap-3">
                      {m && <span className={`text-xs font-medium ${m.startsWith("✓") ? "text-green-600" : "text-red-500"}`}>{m}</span>}
                      <button onClick={() => buildNextMonthPlan(loc.id)}
                        className="px-4 py-2 rounded-xl text-sm font-semibold text-white transition-colors"
                        style={{ background: "#1a0d02" }}>
                        Generate {nextLabel} Plan →
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}
