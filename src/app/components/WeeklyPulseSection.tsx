/**
 * WeeklyPulseSection — "This Month, Week by Week"
 *
 * Shows each location's weekly breakdown:
 *  • Net Sales per week
 *  • Prime Cost % (food + labor) with green/amber/red status
 *  • Outlier flag when a week deviates ≥5 pp from the monthly avg
 *  • Explicit bleeding driver: FOOD or LABOR over benchmark
 *  • Weekly profit / loss
 *
 * Fixed costs (salaried, infra, taxes) are prorated by day fraction.
 * Infrastructure is constant and shown separately so food vs labor is clear.
 */

import type { WeekSlice } from "@/lib/fetchPL";
import type { PLSummary } from "@/lib/types";

/* ─── benchmarks (same as dashboard) ─────────────────────────────── */
const BENCH = { food: 28, labor: 30, prime: 58 };

/* ─── helpers ─────────────────────────────────────────────────────── */
const fmtUSD = (n: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n);
const pp = (n: number) => n.toFixed(1) + "%";

function weekStatus(w: WeekSlice) {
  if (w.status === "critical") return { color: "#ef4444", bg: "rgba(239,68,68,0.1)", border: "rgba(239,68,68,0.35)", label: "CRITICAL" };
  if (w.status === "warning")  return { color: "#f97316", bg: "rgba(249,115,22,0.1)", border: "rgba(249,115,22,0.35)", label: "WARNING" };
  if (w.status === "healthy")  return { color: "#00d4a8", bg: "rgba(0,212,168,0.08)", border: "rgba(0,212,168,0.25)", label: "HEALTHY" };
  return { color: "#6b7280", bg: "rgba(255,255,255,0.03)", border: "rgba(255,255,255,0.08)", label: "NO DATA" };
}

/** Identify the primary cost driver causing loss or warning */
function bleedDriver(w: WeekSlice): { food: boolean; labor: boolean; text: string } | null {
  if (w.status === "no-data" || w.net_sales === 0) return null;
  const foodOver   = w.food_pct  > BENCH.food;
  const laborOver  = w.labor_pct > BENCH.labor;
  if (!foodOver && !laborOver) return null;

  // Both over? show whichever is MORE over benchmark
  if (foodOver && laborOver) {
    const foodExcess  = w.food_pct  - BENCH.food;
    const laborExcess = w.labor_pct - BENCH.labor;
    if (foodExcess >= laborExcess)
      return { food: true, labor: false, text: `🍖 Food ${pp(w.food_pct)} (target ${BENCH.food}%)` };
    return { food: false, labor: true, text: `👥 Labor ${pp(w.labor_pct)} (target ${BENCH.labor}%)` };
  }
  if (foodOver)  return { food: true,  labor: false, text: `🍖 Food ${pp(w.food_pct)} (target ${BENCH.food}%)` };
  return { food: false, labor: true,  text: `👥 Labor ${pp(w.labor_pct)} (target ${BENCH.labor}%)` };
}

/* ─── single week card ─────────────────────────────────────────────── */
function WeekCard({ w, monthPrimePct }: { w: WeekSlice; monthPrimePct: number }) {
  const st    = weekStatus(w);
  const isNeg = w.net_profit < 0;
  const driver = bleedDriver(w);
  const vsAvg  = w.net_sales > 0 && monthPrimePct > 0
    ? w.prime_pct - monthPrimePct : 0;

  return (
    <div
      className="rounded-xl overflow-hidden flex-1 min-w-0"
      style={{
        background: w.is_current_week
          ? "linear-gradient(135deg,#0c1628,#0a1e35)"
          : "rgba(255,255,255,0.03)",
        border: `1px solid ${w.is_current_week ? st.border : "rgba(255,255,255,0.07)"}`,
        boxShadow: w.is_current_week ? `0 0 16px ${st.color}22` : "none",
      }}
    >
      {/* Top accent bar */}
      <div className="h-0.5 w-full" style={{ background: st.color }} />

      <div className="p-3 space-y-2">
        {/* Week label */}
        <div className="flex items-center justify-between gap-1">
          <span className="text-[10px] font-bold text-gray-400 truncate">{w.label}</span>
          {w.is_current_week && (
            <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full flex-shrink-0"
              style={{ background: "rgba(99,102,241,0.2)", color: "#a5b4fc" }}>
              NOW
            </span>
          )}
        </div>

        {/* Prime Cost — big number */}
        {w.status === "no-data" ? (
          <p className="text-[10px] text-gray-600 text-center py-2">No data</p>
        ) : (
          <>
            <div className="rounded-lg p-2 text-center" style={{ background: st.bg }}>
              <p className="text-[8px] font-bold tracking-widest uppercase" style={{ color: st.color }}>Prime Cost</p>
              <p className="text-xl font-black tabular-nums leading-tight" style={{ color: st.color }}>
                {pp(w.prime_pct)}
              </p>
              <p className="text-[9px] mt-0.5" style={{ color: st.color, opacity: 0.75 }}>{st.label}</p>
            </div>

            {/* Food / Labor bars */}
            <div className="space-y-1">
              {/* Food */}
              <div className="flex items-center gap-1.5">
                <span className="text-[9px] text-gray-500 w-9 flex-shrink-0">Food</span>
                <div className="flex-1 relative bg-white/10 rounded-full h-1 overflow-hidden">
                  <div className="h-full rounded-full" style={{
                    width: `${Math.min(w.food_pct, 100)}%`,
                    background: w.food_pct > BENCH.food ? "#ef4444" : "#d97706"
                  }} />
                </div>
                <span className="text-[9px] tabular-nums w-9 text-right flex-shrink-0"
                  style={{ color: w.food_pct > BENCH.food ? "#f87171" : "#9ca3af" }}>
                  {pp(w.food_pct)}{w.food_pct > BENCH.food ? "⚠" : ""}
                </span>
              </div>
              {/* Labor */}
              <div className="flex items-center gap-1.5">
                <span className="text-[9px] text-gray-500 w-9 flex-shrink-0">Labor</span>
                <div className="flex-1 relative bg-white/10 rounded-full h-1 overflow-hidden">
                  <div className="h-full rounded-full" style={{
                    width: `${Math.min(w.labor_pct, 100)}%`,
                    background: w.labor_pct > BENCH.labor ? "#ef4444" : "#3b82f6"
                  }} />
                </div>
                <span className="text-[9px] tabular-nums w-9 text-right flex-shrink-0"
                  style={{ color: w.labor_pct > BENCH.labor ? "#f87171" : "#9ca3af" }}>
                  {pp(w.labor_pct)}{w.labor_pct > BENCH.labor ? "⚠" : ""}
                </span>
              </div>
            </div>

            {/* Net Sales + Profit */}
            <div className="grid grid-cols-2 gap-1.5">
              <div className="rounded-md p-1.5" style={{ background: "rgba(255,255,255,0.04)" }}>
                <p className="text-[8px] text-gray-500">Net Sales</p>
                <p className="text-[11px] font-bold text-white tabular-nums">{fmtUSD(w.net_sales)}</p>
              </div>
              <div className="rounded-md p-1.5" style={{
                background: isNeg ? "rgba(239,68,68,0.08)" : "rgba(0,212,168,0.08)"
              }}>
                <p className="text-[8px] text-gray-500">{isNeg ? "Loss" : "Profit"}</p>
                <p className="text-[11px] font-bold tabular-nums"
                  style={{ color: isNeg ? "#f87171" : "#00d4a8" }}>
                  {fmtUSD(Math.abs(w.net_profit))}
                </p>
              </div>
            </div>

            {/* vs Monthly avg */}
            {monthPrimePct > 0 && (
              <p className="text-[8px] text-center"
                style={{ color: Math.abs(vsAvg) >= 5 ? "#f97316" : "#6b7280" }}>
                {vsAvg >= 0 ? "▲" : "▼"} {Math.abs(vsAvg).toFixed(1)} pp vs month avg
                {Math.abs(vsAvg) >= 5 && " ⚡ OUTLIER"}
              </p>
            )}

            {/* Bleed driver */}
            {driver && (
              <div className="rounded-md px-2 py-1 text-center"
                style={{ background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.25)" }}>
                <p className="text-[8px] font-semibold" style={{ color: "#fca5a5" }}>
                  Bleeding: {driver.text}
                </p>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

/* ─── per-location weekly panel ────────────────────────────────────── */
export function LocationWeeklyPanel({
  pl, weeks
}: {
  pl: PLSummary;
  weeks: WeekSlice[];
}) {
  const monthPrimePct = pl.food_pct + pl.labor_pct;
  const hasData = weeks.some(w => w.net_sales > 0);
  if (!hasData) return null;

  // Count problem weeks
  const criticalWeeks = weeks.filter(w => w.status === "critical").length;
  const warningWeeks  = weeks.filter(w => w.status === "warning").length;
  const outlierWeeks  = weeks.filter(w => w.is_outlier).length;

  // Current week snapshot
  const currentWeek = weeks.find(w => w.is_current_week);

  const overallStatus = criticalWeeks > 0 ? "#ef4444"
    : warningWeeks > 0 ? "#f97316"
    : "#00d4a8";

  return (
    <div className="rounded-2xl overflow-hidden"
      style={{
        background: "linear-gradient(135deg,#080d1c,#0a1220)",
        border: `1px solid ${overallStatus}25`,
      }}>
      {/* Header */}
      <div className="px-4 pt-4 pb-3 flex items-center justify-between flex-wrap gap-2"
        style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
        <div className="flex items-center gap-2 min-w-0">
          <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: overallStatus }} />
          <h3 className="text-sm font-bold text-white truncate">{pl.location_name}</h3>
          <span className="text-xs text-gray-500">· Weekly Pulse</span>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {criticalWeeks > 0 && (
            <span className="text-[9px] font-bold px-2 py-0.5 rounded-full"
              style={{ background: "rgba(239,68,68,0.15)", color: "#f87171" }}>
              🚨 {criticalWeeks} critical week{criticalWeeks > 1 ? "s" : ""}
            </span>
          )}
          {warningWeeks > 0 && (
            <span className="text-[9px] font-bold px-2 py-0.5 rounded-full"
              style={{ background: "rgba(249,115,22,0.15)", color: "#fb923c" }}>
              ⚠ {warningWeeks} warning week{warningWeeks > 1 ? "s" : ""}
            </span>
          )}
          {outlierWeeks > 0 && (
            <span className="text-[9px] font-bold px-2 py-0.5 rounded-full"
              style={{ background: "rgba(99,102,241,0.15)", color: "#a5b4fc" }}>
              ⚡ {outlierWeeks} outlier{outlierWeeks > 1 ? "s" : ""}
            </span>
          )}
          {currentWeek && currentWeek.net_sales > 0 && (
            <span className="text-[9px] font-semibold text-gray-400">
              This week: <span style={{ color: weekStatus(currentWeek).color }}>
                {pp(currentWeek.prime_pct)} prime cost
              </span>
            </span>
          )}
        </div>
      </div>

      {/* Week cards */}
      <div className="p-3 grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-5 gap-2">
        {weeks.map(w => (
          <WeekCard key={w.weekNum} w={w} monthPrimePct={monthPrimePct} />
        ))}
      </div>

      {/* Monthly summary footer */}
      <div className="px-4 pb-3 flex items-center gap-4 flex-wrap"
        style={{ borderTop: "1px solid rgba(255,255,255,0.04)" }}>
        <span className="text-[9px] text-gray-600 uppercase tracking-widest pt-2">Monthly avg →</span>
        <span className="text-[10px] pt-2" style={{ color: pl.food_pct > BENCH.food ? "#f87171" : "#9ca3af" }}>
          Food {pp(pl.food_pct)}{pl.food_pct > BENCH.food ? " ⚠" : ""}
        </span>
        <span className="text-[10px] pt-2" style={{ color: pl.labor_pct > BENCH.labor ? "#f87171" : "#9ca3af" }}>
          Labor {pp(pl.labor_pct)}{pl.labor_pct > BENCH.labor ? " ⚠" : ""}
        </span>
        <span className="text-[10px] font-bold pt-2"
          style={{ color: monthPrimePct > BENCH.prime ? "#f87171" : "#00d4a8" }}>
          Prime {pp(monthPrimePct)} / target ≤{BENCH.prime}%
        </span>
        <span className="text-[10px] pt-2 ml-auto"
          style={{ color: pl.net_profit >= 0 ? "#00d4a8" : "#f87171" }}>
          {pl.net_profit >= 0 ? "▲" : "▼"} {fmtUSD(Math.abs(pl.net_profit))} net {pl.net_profit >= 0 ? "profit" : "loss"}
        </span>
      </div>
    </div>
  );
}
