"use client";
import { useEffect, useRef, useState } from "react";

export interface LocationMetrics {
  id: string;
  name: string;
  code: string;
  state: string;
  net_sales: number;
  food_cost: number;
  total_labor: number;
  infrastructure: number;
  net_profit: number;
  food_pct: number;
  labor_pct: number;
  infra_pct: number;
  net_profit_pct: number;
  prime_cost_pct: number;
  food_by_category: Record<string, number>;
}

export interface MonthTrend {
  month: string;        // "2026-10-01"
  label: string;        // "Oct 26"
  locations: { id: string; prime_cost_pct: number; food_pct: number; net_profit_pct: number }[];
}

interface Props {
  current: LocationMetrics[];
  trend: MonthTrend[];
  monthLabel: string;
}

const fmtUSD = (n: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n);

const pct = (v: number) => v.toFixed(1) + "%";

const LOCATION_COLORS = ["#00d4a8", "#818cf8", "#f59e0b", "#f87171", "#34d399", "#a78bfa"];

function statusColor(val: number, target: number, invert = false) {
  const bad = invert ? val > target : val < target;
  if (invert) {
    if (val > target * 1.1) return { bg: "rgba(239,68,68,0.15)", text: "#f87171" };
    if (val > target) return { bg: "rgba(249,115,22,0.12)", text: "#fb923c" };
    return { bg: "rgba(0,212,168,0.1)", text: "#00d4a8" };
  } else {
    if (val < target * 0.9) return { bg: "rgba(239,68,68,0.15)", text: "#f87171" };
    if (val < target) return { bg: "rgba(249,115,22,0.12)", text: "#fb923c" };
    return { bg: "rgba(0,212,168,0.1)", text: "#00d4a8" };
  }
}

function MetricCell({ value, target, invert = false, fmt = pct }: {
  value: number; target: number; invert?: boolean; fmt?: (v: number) => string;
}) {
  const c = statusColor(value, target, invert);
  return (
    <td className="px-3 py-2.5 text-center tabular-nums">
      <span className="text-xs font-semibold px-2 py-0.5 rounded-lg" style={{ background: c.bg, color: c.text }}>
        {fmt(value)}
      </span>
    </td>
  );
}

function RankBadge({ rank, total }: { rank: number; total: number }) {
  const isTop = rank === 1;
  const isBot = rank === total;
  return (
    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full ml-1"
      style={{
        background: isTop ? "rgba(0,212,168,0.15)" : isBot ? "rgba(239,68,68,0.12)" : "rgba(255,255,255,0.07)",
        color: isTop ? "#00d4a8" : isBot ? "#f87171" : "#6b7280",
      }}>
      #{rank}
    </span>
  );
}

export default function RollupClient({ current, trend, monthLabel }: Props) {
  const chartRef = useRef<HTMLCanvasElement>(null);
  const chartInstance = useRef<unknown>(null);
  const [activeMetric, setActiveMetric] = useState<"prime_cost_pct" | "food_pct" | "net_profit_pct">("prime_cost_pct");
  const [sortBy, setSortBy] = useState<keyof LocationMetrics>("prime_cost_pct");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  const sorted = [...current].sort((a, b) => {
    const av = a[sortBy] as number, bv = b[sortBy] as number;
    return sortDir === "desc" ? bv - av : av - bv;
  });

  // Rank by prime cost (lower is better for prime cost — ascending rank)
  const rankedByPrime = [...current].sort((a, b) => a.prime_cost_pct - b.prime_cost_pct);

  const totals = current.reduce((acc, l) => ({
    net_sales: acc.net_sales + l.net_sales,
    food_cost: acc.food_cost + l.food_cost,
    total_labor: acc.total_labor + l.total_labor,
    infrastructure: acc.infrastructure + l.infrastructure,
    net_profit: acc.net_profit + l.net_profit,
  }), { net_sales: 0, food_cost: 0, total_labor: 0, infrastructure: 0, net_profit: 0 });

  const portFoodPct = totals.net_sales > 0 ? (totals.food_cost / totals.net_sales) * 100 : 0;
  const portLaborPct = totals.net_sales > 0 ? (totals.total_labor / totals.net_sales) * 100 : 0;
  const portPrimePct = portFoodPct + portLaborPct;
  const portMargin = totals.net_sales > 0 ? (totals.net_profit / totals.net_sales) * 100 : 0;

  const metricLabels = {
    prime_cost_pct: "Prime Cost %",
    food_pct: "Food Cost %",
    net_profit_pct: "Net Margin %",
  };

  useEffect(() => {
    if (!chartRef.current || trend.length === 0 || current.length === 0) return;
    // Dynamically load Chart.js from CDN
    if (typeof window === "undefined") return;

    const loadChart = async () => {
      // @ts-ignore
      if (!window.Chart) {
        await new Promise<void>((resolve) => {
          const s = document.createElement("script");
          s.src = "https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.1/chart.umd.min.js";
          s.onload = () => resolve();
          document.head.appendChild(s);
        });
      }
      // @ts-ignore
      const Chart = window.Chart;
      if (chartInstance.current) {
        // @ts-ignore
        chartInstance.current.destroy();
      }

      const labels = trend.map(t => t.label);
      const datasets = current.map((loc, i) => ({
        label: loc.code || loc.name,
        data: trend.map(t => {
          const entry = t.locations.find(l => l.id === loc.id);
          if (!entry) return null;
          return activeMetric === "prime_cost_pct" ? entry.prime_cost_pct
            : activeMetric === "food_pct" ? entry.food_pct
            : entry.net_profit_pct;
        }),
        borderColor: LOCATION_COLORS[i % LOCATION_COLORS.length],
        backgroundColor: LOCATION_COLORS[i % LOCATION_COLORS.length] + "22",
        borderWidth: 2,
        pointRadius: 4,
        pointHoverRadius: 6,
        tension: 0.3,
        spanGaps: true,
      }));

      chartInstance.current = new Chart(chartRef.current, {
        type: "line",
        data: { labels, datasets },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          interaction: { mode: "index", intersect: false },
          plugins: {
            legend: { position: "bottom", labels: { color: "#9ca3af", font: { size: 11 }, boxWidth: 12, padding: 16 } },
            tooltip: {
              backgroundColor: "rgba(6,11,24,0.95)",
              borderColor: "rgba(0,212,168,0.3)",
              borderWidth: 1,
              titleColor: "#fff",
              bodyColor: "#9ca3af",
              callbacks: {
                label: (ctx: { dataset: { label: string }; parsed: { y: number } }) =>
                  ` ${ctx.dataset.label}: ${ctx.parsed.y?.toFixed(1) ?? "—"}%`,
              },
            },
          },
          scales: {
            x: { grid: { color: "rgba(255,255,255,0.05)" }, ticks: { color: "#6b7280", font: { size: 10 } } },
            y: {
              grid: { color: "rgba(255,255,255,0.05)" },
              ticks: { color: "#6b7280", font: { size: 10 }, callback: (v: number) => v + "%" },
              ...(activeMetric !== "net_profit_pct" ? { min: 0 } : {}),
            },
          },
        },
      });
    };

    loadChart();
    return () => {
      // @ts-ignore
      if (chartInstance.current) chartInstance.current.destroy();
    };
  }, [trend, activeMetric, current]);

  const toggleSort = (col: keyof LocationMetrics) => {
    if (sortBy === col) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortBy(col); setSortDir("desc"); }
  };

  const TH = ({ label, col }: { label: string; col: keyof LocationMetrics }) => (
    <th onClick={() => toggleSort(col)}
      className="px-3 py-2 text-[10px] uppercase tracking-wider font-semibold cursor-pointer select-none whitespace-nowrap"
      style={{ color: sortBy === col ? "#00d4a8" : "#6b7280" }}>
      {label} {sortBy === col ? (sortDir === "desc" ? "↓" : "↑") : ""}
    </th>
  );

  if (current.length === 0) {
    return (
      <div className="text-center py-16 text-gray-500 text-sm">
        No location data for this month. Add sales and food data to see the roll-up.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* ── Portfolio Summary ── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: "Portfolio Revenue", value: fmtUSD(totals.net_sales), accent: "#00d4a8" },
          { label: "Prime Cost", value: pct(portPrimePct), accent: portPrimePct > 65 ? "#f87171" : portPrimePct > 58 ? "#fb923c" : "#00d4a8" },
          { label: "Net Profit", value: fmtUSD(totals.net_profit), accent: totals.net_profit >= 0 ? "#00d4a8" : "#f87171" },
          { label: "Net Margin", value: pct(portMargin), accent: portMargin >= 15 ? "#00d4a8" : portMargin >= 8 ? "#fb923c" : "#f87171" },
        ].map(s => (
          <div key={s.label} className="rounded-2xl p-4 relative overflow-hidden"
            style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}>
            <div className="absolute top-0 left-0 w-1 h-full rounded-l-2xl" style={{ background: s.accent }} />
            <p className="text-[10px] uppercase tracking-wider text-gray-500 pl-2">{s.label}</p>
            <p className="text-xl font-bold mt-1 pl-2" style={{ color: s.accent }}>{s.value}</p>
          </div>
        ))}
      </div>

      {/* ── Trend Chart ── */}
      {trend.length >= 2 && (
        <div className="rounded-2xl p-5 border" style={{ background: "rgba(255,255,255,0.03)", borderColor: "rgba(255,255,255,0.08)" }}>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
            <h3 className="text-sm font-bold text-white">6-Month Trend — All Locations</h3>
            <div className="flex gap-1.5 flex-wrap">
              {(Object.keys(metricLabels) as Array<keyof typeof metricLabels>).map(m => (
                <button key={m} onClick={() => setActiveMetric(m as typeof activeMetric)}
                  className="text-[11px] px-2.5 py-1 rounded-lg font-semibold transition-all"
                  style={activeMetric === m
                    ? { background: "#00d4a8", color: "#060b18" }
                    : { background: "rgba(255,255,255,0.07)", color: "#6b7280" }}>
                  {metricLabels[m]}
                </button>
              ))}
            </div>
          </div>
          <div style={{ height: 240 }}>
            <canvas ref={chartRef} />
          </div>
        </div>
      )}

      {/* ── Comparison Table ── */}
      <div className="rounded-2xl border overflow-hidden" style={{ borderColor: "rgba(255,255,255,0.08)" }}>
        <div className="px-5 py-3 border-b flex items-center justify-between"
          style={{ background: "rgba(255,255,255,0.03)", borderColor: "rgba(255,255,255,0.08)" }}>
          <h3 className="text-sm font-bold text-white">Location Comparison — {monthLabel}</h3>
          <span className="text-xs text-gray-500">{current.length} locations</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr style={{ background: "rgba(255,255,255,0.02)", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
                <th className="px-4 py-2 text-[10px] uppercase tracking-wider font-semibold text-gray-500">Location</th>
                <TH label="Net Sales" col="net_sales" />
                <TH label="Food %" col="food_pct" />
                <TH label="Labor %" col="labor_pct" />
                <TH label="Prime Cost" col="prime_cost_pct" />
                <TH label="Infra %" col="infra_pct" />
                <TH label="Net Margin" col="net_profit_pct" />
                <TH label="Net Profit $" col="net_profit" />
              </tr>
            </thead>
            <tbody>
              {sorted.map((loc, i) => {
                const rank = rankedByPrime.findIndex(l => l.id === loc.id) + 1;
                const isLast = i === sorted.length - 1;
                return (
                  <tr key={loc.id}
                    style={{ borderBottom: isLast ? "none" : "1px solid rgba(255,255,255,0.04)" }}
                    className="hover:bg-white/[0.02] transition-colors">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div className="w-2 h-2 rounded-full flex-shrink-0"
                          style={{ background: LOCATION_COLORS[current.indexOf(loc) % LOCATION_COLORS.length] }} />
                        <div>
                          <div className="text-xs font-semibold text-white">
                            {loc.name}
                            <RankBadge rank={rank} total={current.length} />
                          </div>
                          <div className="text-[10px] text-gray-500">{loc.state}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-3 py-2.5 text-center">
                      <span className="text-xs text-gray-300 tabular-nums">{fmtUSD(loc.net_sales)}</span>
                    </td>
                    <MetricCell value={loc.food_pct} target={28} invert />
                    <MetricCell value={loc.labor_pct} target={30} invert />
                    <MetricCell value={loc.prime_cost_pct} target={58} invert />
                    <MetricCell value={loc.infra_pct} target={19} invert />
                    <MetricCell value={loc.net_profit_pct} target={15} />
                    <td className="px-3 py-2.5 text-center">
                      <span className="text-xs tabular-nums font-semibold"
                        style={{ color: loc.net_profit >= 0 ? "#00d4a8" : "#f87171" }}>
                        {fmtUSD(loc.net_profit)}
                      </span>
                    </td>
                  </tr>
                );
              })}
              {/* Portfolio totals row */}
              <tr style={{ background: "rgba(0,212,168,0.04)", borderTop: "1px solid rgba(0,212,168,0.15)" }}>
                <td className="px-4 py-3">
                  <span className="text-xs font-bold" style={{ color: "#00d4a8" }}>Portfolio Total</span>
                </td>
                <td className="px-3 py-2.5 text-center">
                  <span className="text-xs font-bold text-white tabular-nums">{fmtUSD(totals.net_sales)}</span>
                </td>
                <td className="px-3 py-2.5 text-center">
                  <span className="text-xs font-semibold text-gray-300 tabular-nums">{pct(portFoodPct)}</span>
                </td>
                <td className="px-3 py-2.5 text-center">
                  <span className="text-xs font-semibold text-gray-300 tabular-nums">{pct(portLaborPct)}</span>
                </td>
                <td className="px-3 py-2.5 text-center">
                  <span className="text-xs font-bold tabular-nums"
                    style={{ color: portPrimePct > 65 ? "#f87171" : portPrimePct > 58 ? "#fb923c" : "#00d4a8" }}>
                    {pct(portPrimePct)}
                  </span>
                </td>
                <td className="px-3 py-2.5 text-center">
                  <span className="text-xs text-gray-400 tabular-nums">—</span>
                </td>
                <td className="px-3 py-2.5 text-center">
                  <span className="text-xs font-bold tabular-nums"
                    style={{ color: portMargin >= 15 ? "#00d4a8" : portMargin >= 8 ? "#fb923c" : "#f87171" }}>
                    {pct(portMargin)}
                  </span>
                </td>
                <td className="px-3 py-2.5 text-center">
                  <span className="text-xs font-bold tabular-nums"
                    style={{ color: totals.net_profit >= 0 ? "#00d4a8" : "#f87171" }}>
                    {fmtUSD(totals.net_profit)}
                  </span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Food Cost Breakdown ── */}
      {current.some(l => Object.values(l.food_by_category).some(v => v > 0)) && (
        <div className="rounded-2xl border overflow-hidden" style={{ borderColor: "rgba(255,255,255,0.08)" }}>
          <div className="px-5 py-3 border-b" style={{ background: "rgba(255,255,255,0.03)", borderColor: "rgba(255,255,255,0.08)" }}>
            <h3 className="text-sm font-bold text-white">Food Cost by Category</h3>
          </div>
          <div className="p-5 grid gap-4">
            {current.filter(l => l.net_sales > 0).map((loc, i) => {
              const totalFood = loc.food_cost || 1;
              const cats = Object.entries(loc.food_by_category)
                .filter(([, v]) => v > 0)
                .sort(([, a], [, b]) => b - a);
              if (cats.length === 0) return null;
              return (
                <div key={loc.id}>
                  <div className="flex items-center gap-2 mb-2">
                    <div className="w-2 h-2 rounded-full" style={{ background: LOCATION_COLORS[i % LOCATION_COLORS.length] }} />
                    <span className="text-xs font-semibold text-white">{loc.name}</span>
                    <span className="text-xs text-gray-500">({pct(loc.food_pct)} of sales)</span>
                  </div>
                  <div className="flex gap-1 flex-wrap">
                    {cats.map(([cat, val]) => (
                      <div key={cat} className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg"
                        style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.07)" }}>
                        <span className="text-[10px] text-gray-400 capitalize">{cat.replace("_", " ")}</span>
                        <span className="text-[10px] font-semibold text-white">{fmtUSD(val)}</span>
                        <span className="text-[9px] text-gray-500">({((val / totalFood) * 100).toFixed(0)}%)</span>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Legend / Targets ── */}
      <div className="flex flex-wrap gap-3 text-[10px] text-gray-500">
        {[
          { label: "Food target", value: "< 28%" },
          { label: "Labor target", value: "< 30%" },
          { label: "Prime cost target", value: "< 58%" },
          { label: "Net margin target", value: "> 15%" },
        ].map(t => (
          <span key={t.label} className="px-2 py-1 rounded-lg" style={{ background: "rgba(255,255,255,0.04)" }}>
            <span className="text-gray-400">{t.label}:</span> <span className="text-white font-medium">{t.value}</span>
          </span>
        ))}
      </div>
    </div>
  );
}
