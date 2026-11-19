import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { fetchPLSummary } from "@/lib/fetchPL";
import type { PLSummary } from "@/lib/types";
import { validateMonth } from "@/lib/validateParams";
import CashCallHeader from "@/app/components/CashCallHeader";
import MonthPicker from "@/app/components/MonthPicker";

interface Props { searchParams: Promise<{ month?: string }>; }

interface Budget {
  location_id: string;
  food_pct_target: number;
  labor_pct_target: number;
  infra_pct_target: number;
  net_profit_target: number;
  sales_target: number;
}

interface HistoryPoint {
  month: string;   // YYYY-MM-01
  label: string;   // "Nov 2026"
  pl: PLSummary;
}

interface Projection {
  month: string;
  label: string;
  food_pct: number;
  labor_pct: number;
  infra_pct: number;
  net_sales: number;
  net_profit_pct: number;
}

interface CategoryTrend {
  slope: number;       // % per month
  intercept: number;
  r2: number;          // fit quality 0-1
  projected: number[]; // next 3 months values
  verdict: "rising" | "falling" | "stable";
  crossesTarget: number | null; // months until it crosses target (null = won't)
}

const DEFAULT_TARGETS = { food: 28, labor: 30, infra: 19, net_profit: 12 };

// ── Linear regression ────────────────────────────────────────────────────────
function linReg(values: number[]): { slope: number; intercept: number; r2: number } {
  const n = values.length;
  if (n < 2) return { slope: 0, intercept: values[0] ?? 0, r2: 0 };
  const xs = values.map((_, i) => i);
  const sx  = xs.reduce((a, b) => a + b, 0);
  const sy  = values.reduce((a, b) => a + b, 0);
  const sxy = xs.reduce((a, x, i) => a + x * values[i], 0);
  const sx2 = xs.reduce((a, x) => a + x * x, 0);
  const slope     = (n * sxy - sx * sy) / (n * sx2 - sx * sx);
  const intercept = (sy - slope * sx) / n;
  // R²
  const mean = sy / n;
  const ssTot = values.reduce((a, v) => a + (v - mean) ** 2, 0);
  const ssRes = values.reduce((a, v, i) => a + (v - (slope * i + intercept)) ** 2, 0);
  const r2 = ssTot > 0 ? Math.max(0, 1 - ssRes / ssTot) : 0;
  return { slope, intercept, r2 };
}

function buildTrend(values: number[], target: number, projCount = 3): CategoryTrend {
  const { slope, intercept, r2 } = linReg(values);
  const n = values.length;
  const projected = Array.from({ length: projCount }, (_, k) =>
    Math.max(0, intercept + slope * (n + k))
  );
  const verdict: CategoryTrend["verdict"] =
    Math.abs(slope) < 0.15 ? "stable" : slope > 0 ? "rising" : "falling";

  // months until crosses target (only if trending toward it)
  let crossesTarget: number | null = null;
  const current = intercept + slope * (n - 1);
  if (slope > 0 && current < target) {
    // rising toward target (bad for costs)
    const mths = (target - current) / slope;
    if (mths > 0 && mths <= 6) crossesTarget = Math.ceil(mths);
  } else if (slope < 0 && current > target) {
    // falling toward target (good — coming back down)
    const mths = (current - target) / Math.abs(slope);
    if (mths > 0 && mths <= 6) crossesTarget = Math.ceil(mths);
  }

  return { slope, intercept, r2, projected, verdict, crossesTarget };
}

// ── Helpers ──────────────────────────────────────────────────────────────────
const fmtUSD = (n: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n);
const pct = (v: number) => v.toFixed(1) + "%";

function trendIcon(t: CategoryTrend) {
  if (t.verdict === "stable") return { icon: "→", color: "#94a3b8" };
  if (t.verdict === "rising") return { icon: "↑", color: "#f87171" };
  return { icon: "↓", color: "#00d4a8" };
}

function slopeLabel(slope: number) {
  if (Math.abs(slope) < 0.15) return "Stable";
  return `${slope > 0 ? "+" : ""}${slope.toFixed(2)}% / mo`;
}

// ── Sparkline (SVG bars) ─────────────────────────────────────────────────────
function Sparkline({
  actual, projected, target, color
}: { actual: number[]; projected: number[]; target: number; color: string }) {
  const all = [...actual, ...projected];
  const maxV = Math.max(...all, target, 1);
  const W = 140; const H = 36; const barW = 8; const gap = 3;
  const totalBars = actual.length + projected.length;
  const startX = (W - totalBars * (barW + gap) + gap) / 2;

  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`}>
      {/* target line */}
      <line
        x1="0" y1={H - (target / maxV) * H}
        x2={W} y2={H - (target / maxV) * H}
        stroke="rgba(255,255,255,0.2)" strokeWidth="1" strokeDasharray="3 2"
      />
      {/* actual bars */}
      {actual.map((v, i) => {
        const bh = Math.max(2, (v / maxV) * H);
        return (
          <rect key={`a${i}`}
            x={startX + i * (barW + gap)} y={H - bh} width={barW} height={bh}
            rx="2" fill={color} opacity="0.85"
          />
        );
      })}
      {/* projected bars */}
      {projected.map((v, i) => {
        const bh = Math.max(2, (v / maxV) * H);
        const xi = actual.length + i;
        return (
          <rect key={`p${i}`}
            x={startX + xi * (barW + gap)} y={H - bh} width={barW} height={bh}
            rx="2" fill={color} opacity="0.35"
            strokeDasharray="2 1" stroke={color} strokeWidth="0.5"
          />
        );
      })}
    </svg>
  );
}

// ── Month helpers ────────────────────────────────────────────────────────────
function addMonths(base: string, delta: number): string {
  const d = new Date(base + "T00:00:00");
  d.setMonth(d.getMonth() + delta);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
}
function monthLabel(m: string) {
  return new Date(m + "T00:00:00").toLocaleDateString("en-US", { month: "short", year: "numeric" });
}

// ── Page ─────────────────────────────────────────────────────────────────────
export default async function ForecastPage({ searchParams }: Props) {
  const supabase = await createClient();
  const { month: monthParam } = await searchParams;

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data: profile } = await supabase.from("user_profiles").select("role,username").eq("user_id", user.id).single();
  if (!profile) redirect("/onboarding");
  if (profile.role !== "owner") redirect("/login");

  const currentMonth = validateMonth(monthParam);
  const currentLabel = monthLabel(currentMonth);

  // 1. Locations
  const { data: locations } = await supabase
    .from("locations")
    .select("id,code,name,state")
    .eq("app", "cashcall")
    .eq("user_id", user.id)
    .order("name");
  const locs = locations ?? [];

  // 2. Budgets (current month)
  const budgetRows = (await supabase
    .from("location_budgets")
    .select("location_id,food_pct_target,labor_pct_target,infra_pct_target,net_profit_target,sales_target")
    .in("location_id", locs.map(l => l.id))
    .eq("month", currentMonth)
    .then(r => r.data ?? [])) as Budget[];
  const budgetByLoc = Object.fromEntries(budgetRows.map(b => [b.location_id, b]));

  // 3. Fetch 6 months of history per location
  const HISTORY = 6;
  const historyMonths = Array.from({ length: HISTORY }, (_, i) => addMonths(currentMonth, -(HISTORY - 1 - i)));

  const locationData = await Promise.all(locs.map(async loc => {
    const snapshots: HistoryPoint[] = await Promise.all(
      historyMonths.map(async m => ({
        month: m,
        label: monthLabel(m),
        pl: await fetchPLSummary(supabase, loc.id, m),
      }))
    );
    return { loc, snapshots };
  }));

  // 4. Build trends + projections per location
  const PROJ_MONTHS = 3;
  const projMonthStrs = Array.from({ length: PROJ_MONTHS }, (_, i) => addMonths(currentMonth, i + 1));

  const forecastData = locationData.map(({ loc, snapshots }) => {
    const budget = budgetByLoc[loc.id];
    const food_target  = budget?.food_pct_target  ?? DEFAULT_TARGETS.food;
    const labor_target = budget?.labor_pct_target ?? DEFAULT_TARGETS.labor;
    const infra_target = budget?.infra_pct_target ?? DEFAULT_TARGETS.infra;

    // Only use months that have data
    const active = snapshots.filter(s => s.pl.total_net_sales > 0);
    const hasData = active.length >= 2;

    const foodVals   = active.map(s => s.pl.food_pct);
    const laborVals  = active.map(s => s.pl.labor_pct);
    const infraVals  = active.map(s => s.pl.infra_pct);
    const salesVals  = active.map(s => s.pl.total_net_sales);
    const profitVals = active.map(s => s.pl.net_profit_pct);

    const foodTrend   = buildTrend(foodVals,  food_target,  PROJ_MONTHS);
    const laborTrend  = buildTrend(laborVals, labor_target, PROJ_MONTHS);
    const infraTrend  = buildTrend(infraVals, infra_target, PROJ_MONTHS);
    const salesTrend  = buildTrend(salesVals, 0,            PROJ_MONTHS);
    const profitTrend = buildTrend(profitVals, 0,           PROJ_MONTHS);

    // Build projections per month
    const projections: Projection[] = projMonthStrs.map((m, k) => ({
      month: m,
      label: monthLabel(m),
      food_pct:       foodTrend.projected[k],
      labor_pct:      laborTrend.projected[k],
      infra_pct:      infraTrend.projected[k],
      net_sales:      salesTrend.projected[k],
      net_profit_pct: profitTrend.projected[k],
    }));

    // Overall health verdict
    const latest = active[active.length - 1];
    const primeCurrent = latest ? latest.pl.food_pct + latest.pl.labor_pct : 0;
    const primeProj3   = projections[2] ? projections[2].food_pct + projections[2].labor_pct : 0;
    const primeTarget  = food_target + labor_target;

    const alerts: string[] = [];
    if (foodTrend.verdict === "rising" && foodTrend.slope > 0.3)
      alerts.push(`🍔 Food cost rising +${foodTrend.slope.toFixed(1)}%/mo — ${foodTrend.crossesTarget ? `hits ${food_target}% target in ${foodTrend.crossesTarget}mo` : `watch vendors`}`);
    if (laborTrend.verdict === "rising" && laborTrend.slope > 0.3)
      alerts.push(`👥 Labor rising +${laborTrend.slope.toFixed(1)}%/mo — review scheduling`);
    if (infraTrend.verdict === "rising" && infraTrend.slope > 0.2)
      alerts.push(`🏢 Infra costs creeping up — audit fixed expenses`);
    if (salesTrend.slope < 0 && salesVals.length >= 3)
      alerts.push(`📉 Revenue declining ${Math.abs(salesTrend.slope).toFixed(0)}/mo — check foot traffic`);
    if (primeProj3 < primeTarget && primeProj3 > 0)
      alerts.push(`✅ Prime cost projected to improve to ${primeProj3.toFixed(1)}% in 3 months`);

    return {
      loc,
      budget,
      food_target, labor_target, infra_target,
      snapshots, active,
      foodTrend, laborTrend, infraTrend, salesTrend, profitTrend,
      projections,
      hasData,
      primeCurrent,
      primeProj3,
      primeTarget,
      alerts,
    };
  });

  // 5. Cross-location summary
  const activeLocData = forecastData.filter(d => d.hasData);
  const avgFoodProj3  = activeLocData.length
    ? activeLocData.reduce((s, d) => s + (d.projections[2]?.food_pct ?? 0), 0) / activeLocData.length : 0;
  const avgLaborProj3 = activeLocData.length
    ? activeLocData.reduce((s, d) => s + (d.projections[2]?.labor_pct ?? 0), 0) / activeLocData.length : 0;
  const avgPrimeProj3 = avgFoodProj3 + avgLaborProj3;
  const totalSalesProj3 = activeLocData.reduce((s, d) => s + (d.projections[2]?.net_sales ?? 0), 0);

  return (
    <div className="min-h-screen pb-10" style={{ background: "#060b18" }}>
      <CashCallHeader username={profile.username} role={profile.role} />

      <main className="max-w-6xl mx-auto px-4 py-6 space-y-6">

        {/* Page header */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Link href="/dashboard" className="text-[11px] text-gray-500 hover:text-gray-300 transition-colors">← Dashboard</Link>
            </div>
            <h1 className="text-2xl font-bold text-white flex items-center gap-2">
              📈 6-Month Forecast
            </h1>
            <p className="text-sm text-gray-500 mt-0.5">
              {HISTORY}-month trend analysis · 3-month projection · Based on {activeLocData.length} active location{activeLocData.length !== 1 ? "s" : ""}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Link href="/dashboard/bleeding"
              className="text-sm font-medium rounded-xl px-3 py-2 transition-colors"
              style={{ background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.25)", color: "#f87171" }}>
              🩸 Bleeding
            </Link>
            <MonthPicker current={currentMonth} />
          </div>
        </div>

        {/* Hero: cross-location 3-month outlook */}
        {activeLocData.length > 0 && (
          <div className="rounded-3xl p-6 sm:p-8 relative overflow-hidden"
            style={{
              background: "linear-gradient(135deg, #060b18 0%, #0a1420 60%, #0d1f30 100%)",
              border: "1px solid rgba(99,102,241,0.2)",
            }}>
            <div className="absolute right-6 top-1/2 -translate-y-1/2 opacity-[0.04] pointer-events-none text-9xl font-black select-none text-indigo-400">
              📈
            </div>
            <div className="mb-4">
              <p className="text-[10px] font-bold tracking-[0.25em] uppercase text-indigo-400 mb-1">
                ⚡ 3-Month Outlook — All Locations
              </p>
              <p className="text-xs text-gray-500">
                {projMonthStrs.map(m => monthLabel(m)).join(" · ")}
              </p>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              {[
                { label: "Avg Food %",   val: avgFoodProj3,  target: DEFAULT_TARGETS.food,  color: "#f97316", icon: "🍔" },
                { label: "Avg Labor %",  val: avgLaborProj3, target: DEFAULT_TARGETS.labor, color: "#3b82f6", icon: "👥" },
                { label: "Prime Cost",   val: avgPrimeProj3, target: 58,                    color: avgPrimeProj3 > 58 ? "#f87171" : "#00d4a8", icon: "📊" },
                { label: "Revenue (3mo proj)", val: totalSalesProj3, target: 0, color: "#00d4a8", icon: "💰", isMoney: true },
              ].map(({ label, val, target, color, icon, isMoney }) => {
                const isOver = !isMoney && target > 0 && val > target;
                return (
                  <div key={label} className="rounded-2xl p-4"
                    style={{ background: "rgba(255,255,255,0.03)", border: `1px solid ${isOver ? "rgba(239,68,68,0.2)" : "rgba(255,255,255,0.06)"}` }}>
                    <p className="text-[10px] text-gray-500 uppercase tracking-wide mb-1">{icon} {label}</p>
                    <p className="text-2xl font-black tabular-nums" style={{ color }}>
                      {isMoney ? fmtUSD(val) : pct(val)}
                    </p>
                    {!isMoney && target > 0 && (
                      <p className="text-[10px] mt-1" style={{ color: isOver ? "#f87171" : "#6b7280" }}>
                        {isOver ? `⚠ ${(val - target).toFixed(1)}% over target` : `✓ within target (${pct(target)})`}
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Per-location cards */}
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-bold tracking-[0.2em] uppercase text-gray-500">Location Forecasts</span>
            <div className="flex-1 h-px" style={{ background: "rgba(255,255,255,0.06)" }} />
          </div>

          {forecastData.map(d => {
            if (!d.hasData) {
              return (
                <div key={d.loc.id} className="rounded-2xl p-4 flex items-center justify-between"
                  style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.05)" }}>
                  <p className="text-sm text-gray-600">{d.loc.name}</p>
                  <p className="text-xs text-gray-600">No history — need ≥2 months of data</p>
                </div>
              );
            }

            const { foodTrend, laborTrend, infraTrend, projections, alerts, food_target, labor_target, infra_target } = d;
            const latestActual = d.active[d.active.length - 1];

            return (
              <div key={d.loc.id} className="rounded-2xl overflow-hidden"
                style={{ background: "rgba(255,255,255,0.025)", border: "1px solid rgba(255,255,255,0.07)" }}>

                {/* Card header */}
                <div className="px-5 py-4 flex items-center justify-between gap-3 flex-wrap"
                  style={{ background: "rgba(255,255,255,0.02)", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-xl flex items-center justify-center text-xs font-bold"
                      style={{ background: "rgba(99,102,241,0.12)", color: "#a5b4fc" }}>
                      {d.loc.code?.slice(0, 2).toUpperCase() || d.loc.name.slice(0, 2).toUpperCase()}
                    </div>
                    <div>
                      <p className="font-bold text-white text-sm">{d.loc.name}</p>
                      <p className="text-[10px] text-gray-500">
                        {d.active.length} months history · prime cost now {pct(d.primeCurrent)} → proj {pct(d.primeProj3)} in 3mo
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-wrap">
                    {d.alerts.length > 0 && (
                      <span className="text-[10px] font-bold px-2 py-1 rounded-full"
                        style={{ background: "rgba(251,191,36,0.1)", color: "#fbbf24", border: "1px solid rgba(251,191,36,0.2)" }}>
                        {d.alerts.length} alert{d.alerts.length > 1 ? "s" : ""}
                      </span>
                    )}
                    <Link href={`/location/${d.loc.id}/food`}
                      className="text-[11px] font-semibold rounded-lg px-3 py-1.5 transition-all hover:opacity-80"
                      style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)", color: "#94a3b8" }}>
                      View P&L →
                    </Link>
                  </div>
                </div>

                {/* Card body */}
                <div className="px-5 py-4 space-y-5">

                  {/* Alerts */}
                  {alerts.length > 0 && (
                    <div className="rounded-xl p-3 space-y-1"
                      style={{ background: "rgba(251,191,36,0.05)", border: "1px solid rgba(251,191,36,0.15)" }}>
                      {alerts.map((a, i) => (
                        <p key={i} className="text-xs text-amber-300">{a}</p>
                      ))}
                    </div>
                  )}

                  {/* 3 cost categories with sparkline + trend */}
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    {[
                      { label: "Food %",  trend: foodTrend,  vals: d.active.map(s => s.pl.food_pct),  target: food_target,  color: "#f97316", icon: "🍔" },
                      { label: "Labor %", trend: laborTrend, vals: d.active.map(s => s.pl.labor_pct), target: labor_target, color: "#3b82f6", icon: "👥" },
                      { label: "Infra %", trend: infraTrend, vals: d.active.map(s => s.pl.infra_pct), target: infra_target, color: "#8b5cf6", icon: "🏢" },
                    ].map(({ label, trend, vals, target, color, icon }) => {
                      const ti = trendIcon(trend);
                      const isOver = vals[vals.length - 1] > target;
                      const proj3 = trend.projected[2] ?? trend.projected[0];

                      return (
                        <div key={label} className="rounded-xl p-3"
                          style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}>
                          <div className="flex items-center justify-between mb-2">
                            <p className="text-[10px] font-bold uppercase tracking-wide text-gray-500">{icon} {label}</p>
                            <span className="text-[10px] font-bold" style={{ color: ti.color }}>{ti.icon} {slopeLabel(trend.slope)}</span>
                          </div>
                          <div className="flex items-end gap-3 mb-2">
                            <div>
                              <p className="text-[10px] text-gray-600">Now</p>
                              <p className="text-xl font-black tabular-nums" style={{ color: isOver ? "#f87171" : "#e2e8f0" }}>
                                {pct(vals[vals.length - 1] ?? 0)}
                              </p>
                            </div>
                            <p className="text-gray-600 mb-1">→</p>
                            <div>
                              <p className="text-[10px] text-gray-600">In 3mo</p>
                              <p className="text-xl font-black tabular-nums" style={{ color: proj3 > target ? "#f87171" : "#00d4a8" }}>
                                {pct(proj3)}
                              </p>
                            </div>
                            <div className="ml-auto text-right">
                              <p className="text-[10px] text-gray-600">Target</p>
                              <p className="text-sm font-semibold text-gray-400">{pct(target)}</p>
                            </div>
                          </div>
                          <Sparkline actual={vals} projected={trend.projected} target={target} color={color} />
                          {trend.crossesTarget !== null && (
                            <p className="text-[10px] mt-1.5"
                              style={{ color: trend.verdict === "rising" ? "#fbbf24" : "#34d399" }}>
                              {trend.verdict === "rising"
                                ? `⚠ Crosses ${pct(target)} in ~${trend.crossesTarget} month${trend.crossesTarget > 1 ? "s" : ""}`
                                : `✓ Back under target in ~${trend.crossesTarget} month${trend.crossesTarget > 1 ? "s" : ""}`
                              }
                            </p>
                          )}
                        </div>
                      );
                    })}
                  </div>

                  {/* 3-month projection table */}
                  <div className="rounded-xl overflow-hidden" style={{ border: "1px solid rgba(255,255,255,0.06)" }}>
                    <div className="px-4 py-2 text-[10px] font-bold tracking-[0.2em] uppercase text-gray-500"
                      style={{ background: "rgba(255,255,255,0.02)" }}>
                      Monthly Projection Detail
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs" style={{ minWidth: "480px" }}>
                        <thead>
                          <tr style={{ background: "rgba(255,255,255,0.02)" }}>
                            <th className="px-4 py-2 text-left text-gray-500 font-semibold">Month</th>
                            <th className="px-3 py-2 text-center text-gray-500 font-semibold">Rev (proj)</th>
                            <th className="px-3 py-2 text-center" style={{ color: "#f97316" }}>🍔 Food%</th>
                            <th className="px-3 py-2 text-center" style={{ color: "#3b82f6" }}>👥 Labor%</th>
                            <th className="px-3 py-2 text-center" style={{ color: "#8b5cf6" }}>🏢 Infra%</th>
                            <th className="px-3 py-2 text-center" style={{ color: "#94a3b8" }}>Prime</th>
                            <th className="px-3 py-2 text-right" style={{ color: "#00d4a8" }}>Net Profit%</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y" style={{ borderColor: "rgba(255,255,255,0.04)" }}>
                          {/* Last actual row */}
                          {latestActual && (
                            <tr style={{ background: "rgba(255,255,255,0.015)" }}>
                              <td className="px-4 py-2 text-gray-400 font-medium">
                                {latestActual.label}
                                <span className="ml-1 text-[9px] text-gray-600">(actual)</span>
                              </td>
                              <td className="px-3 py-2 text-center text-gray-300 tabular-nums">{fmtUSD(latestActual.pl.total_net_sales)}</td>
                              <td className="px-3 py-2 text-center tabular-nums" style={{ color: latestActual.pl.food_pct > food_target ? "#f87171" : "#e2e8f0" }}>{pct(latestActual.pl.food_pct)}</td>
                              <td className="px-3 py-2 text-center tabular-nums" style={{ color: latestActual.pl.labor_pct > labor_target ? "#f87171" : "#e2e8f0" }}>{pct(latestActual.pl.labor_pct)}</td>
                              <td className="px-3 py-2 text-center tabular-nums" style={{ color: latestActual.pl.infra_pct > infra_target ? "#f87171" : "#e2e8f0" }}>{pct(latestActual.pl.infra_pct)}</td>
                              <td className="px-3 py-2 text-center tabular-nums" style={{ color: (latestActual.pl.food_pct + latestActual.pl.labor_pct) > 58 ? "#f87171" : "#94a3b8" }}>
                                {pct(latestActual.pl.food_pct + latestActual.pl.labor_pct)}
                              </td>
                              <td className="px-3 py-2 text-right tabular-nums" style={{ color: latestActual.pl.net_profit_pct >= 0 ? "#00d4a8" : "#f87171" }}>
                                {pct(latestActual.pl.net_profit_pct)}
                              </td>
                            </tr>
                          )}
                          {projections.map((p, i) => {
                            const prime = p.food_pct + p.labor_pct;
                            const netProfitPct = p.net_profit_pct;
                            return (
                              <tr key={p.month}
                                style={{ background: i % 2 === 0 ? "rgba(99,102,241,0.03)" : undefined }}>
                                <td className="px-4 py-2 font-medium" style={{ color: "#a5b4fc" }}>
                                  {p.label}
                                  <span className="ml-1 text-[9px] text-indigo-800">proj</span>
                                </td>
                                <td className="px-3 py-2 text-center text-gray-400 tabular-nums">{fmtUSD(p.net_sales)}</td>
                                <td className="px-3 py-2 text-center tabular-nums" style={{ color: p.food_pct > food_target ? "#fca5a5" : "#d1fae5" }}>{pct(p.food_pct)}</td>
                                <td className="px-3 py-2 text-center tabular-nums" style={{ color: p.labor_pct > labor_target ? "#fca5a5" : "#d1fae5" }}>{pct(p.labor_pct)}</td>
                                <td className="px-3 py-2 text-center tabular-nums" style={{ color: p.infra_pct > infra_target ? "#fca5a5" : "#d1fae5" }}>{pct(p.infra_pct)}</td>
                                <td className="px-3 py-2 text-center tabular-nums" style={{ color: prime > 58 ? "#fca5a5" : "#94a3b8" }}>{pct(prime)}</td>
                                <td className="px-3 py-2 text-right tabular-nums" style={{ color: netProfitPct >= 0 ? "#00d4a8" : "#f87171" }}>
                                  {pct(netProfitPct)}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Methodology note */}
        <div className="rounded-2xl p-4 text-center"
          style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.05)" }}>
          <p className="text-[10px] text-gray-600">
            Projections use linear regression on the last {HISTORY} months of actuals.
            Bars: solid = actual, faded = projected. Dashed line = budget target.
            Revenue projection applies month-over-month growth rate capped at ±15%.
          </p>
        </div>

      </main>
    </div>
  );
}
