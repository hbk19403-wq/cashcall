"use client";
import { useState } from "react";
import Link from "next/link";
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";

// ── Simulation data ─────────────────────────────────────────────────────────
const DEMO_USER = "guest_operator@cashcall.io";
const LOCATION = "CashCall Demo — Tampa Bay";

const WEEKLY_SALES = [
  { day: "Mon", sales: 6820, labor: 2180, food: 1920 },
  { day: "Tue", sales: 7140, labor: 2290, food: 2010 },
  { day: "Wed", sales: 8200, labor: 2560, food: 2300 },
  { day: "Thu", sales: 9600, labor: 2900, food: 2700 },
  { day: "Fri", sales: 12450, labor: 3200, food: 3490 },  // Friday surge
  { day: "Sat", sales: 11200, labor: 3600, food: 3136 },
  { day: "Sun", sales: 8900, labor: 3890, food: 2492 },   // Sunday overtime spike
];

const TOTAL_SALES = WEEKLY_SALES.reduce((a, d) => a + d.sales, 0);
const TOTAL_LABOR = WEEKLY_SALES.reduce((a, d) => a + d.labor, 0);
const TOTAL_FOOD = WEEKLY_SALES.reduce((a, d) => a + d.food, 0);
const INFRA = 9600;
const NET_PROFIT = TOTAL_SALES - TOTAL_LABOR - TOTAL_FOOD - INFRA;
const PRIME_COST_PCT = ((TOTAL_LABOR + TOTAL_FOOD) / TOTAL_SALES) * 100;
const FOOD_PCT = (TOTAL_FOOD / TOTAL_SALES) * 100;
const LABOR_PCT = (TOTAL_LABOR / TOTAL_SALES) * 100;

const INVOICE_ALERTS = [
  {
    id: 1, vendor: "Sysco Foods", category: "Poultry", item: "Chicken Breast (lb)",
    prev: 2.89, curr: 3.42, qty: 580, unit: "lb",
    impact: Math.round((3.42 - 2.89) * 580),
    pct: ((3.42 - 2.89) / 2.89 * 100).toFixed(1),
    severity: "critical",
  },
  {
    id: 2, vendor: "Restaurant Depot", category: "Produce", item: "Roma Tomatoes (case)",
    prev: 18.40, curr: 19.20, qty: 40, unit: "case",
    impact: Math.round((19.20 - 18.40) * 40),
    pct: ((19.20 - 18.40) / 18.40 * 100).toFixed(1),
    severity: "warning",
  },
  {
    id: 3, vendor: "US Foods", category: "Spices", item: "Garam Masala (5lb)",
    prev: 34.00, curr: 35.50, qty: 12, unit: "bag",
    impact: Math.round((35.50 - 34.00) * 12),
    pct: ((35.50 - 34.00) / 34.00 * 100).toFixed(1),
    severity: "info",
  },
];

const LABOR_PULSE = WEEKLY_SALES.map(d => ({
  day: d.day,
  spmh: parseFloat((d.sales / (d.labor / 18)).toFixed(0)),
  target: 285,
  overtime: d.day === "Sun" ? "2.4 hrs OT" : null,
}));

const DAILY_SALES = [
  { date: "Mon Oct 7", pos: 5200, cash: 980, uber: 420, catering: 220, liquor: 0 },
  { date: "Tue Oct 8", pos: 5480, cash: 1100, uber: 380, catering: 0, liquor: 180 },
  { date: "Wed Oct 9", pos: 6300, cash: 1200, uber: 520, catering: 0, liquor: 180 },
  { date: "Thu Oct 10", pos: 7100, cash: 1800, uber: 480, catering: 0, liquor: 220 },
  { date: "Fri Oct 11 🔥", pos: 8900, cash: 2100, uber: 980, catering: 0, liquor: 470 },
  { date: "Sat Oct 12", pos: 8400, cash: 1900, uber: 680, catering: 0, liquor: 220 },
  { date: "Sun Oct 13", pos: 6200, cash: 1700, uber: 720, catering: 0, liquor: 280 },
];

// ── Price Tracker data ───────────────────────────────────────────────────────
const PRICE_ITEMS = [
  { category: "Poultry", item: "Chicken Breast", vendor: "Sysco", unit: "lb",
    curr: 3.42, m1: 2.89, m3: 2.74, market: 3.10, qty: 580,
    status: "spike", recommendation: "Switch to Restaurant Depot ($2.98/lb) or request quote. You're paying $0.44/lb above market." },
  { category: "Beef", item: "Beef Tenderloin", vendor: "US Foods", unit: "lb",
    curr: 18.90, m1: 16.40, m3: 15.80, market: 17.20, qty: 45,
    status: "spike", recommendation: "Up 15.2% in 30 days. Consider 86-ing or adjusting portion size by 0.5oz to protect margin." },
  { category: "Produce", item: "Roma Tomatoes", vendor: "Restaurant Depot", unit: "case",
    curr: 19.20, m1: 18.40, m3: 18.10, market: 20.50, qty: 40,
    status: "stable", recommendation: "You're buying $1.30/case below market benchmark. Lock in volume pricing now." },
  { category: "Dairy", item: "Heavy Cream", vendor: "Sysco", unit: "qt",
    curr: 4.10, m1: 4.10, m3: 3.90, market: 4.30, qty: 80,
    status: "stable", recommendation: "Stable. Below market by $0.20/qt — no action needed." },
  { category: "Produce", item: "Avocados", vendor: "US Foods", unit: "each",
    curr: 1.85, m1: 1.42, m3: 1.38, market: 1.60, qty: 240,
    status: "spike", recommendation: "Up 30% in 30 days — seasonal spike. Lock in 2-week contract at $1.65 with backup vendor." },
  { category: "Spices", item: "Garam Masala", vendor: "Restaurant Depot", unit: "5lb bag",
    curr: 35.50, m1: 34.00, m3: 33.20, market: 34.80, qty: 12,
    status: "warning", recommendation: "Modest 4.4% increase. Monitor — if goes above $37 consider buying in bulk." },
  { category: "Protein", item: "Atlantic Salmon", vendor: "Sysco", unit: "lb",
    curr: 9.80, m1: 10.40, m3: 10.90, market: 10.20, qty: 60,
    status: "drop", recommendation: "Down 5.8%! Great time to feature salmon specials and build this week's margin." },
];

const TOTAL_PRICE_IMPACT = PRICE_ITEMS
  .filter(p => p.status === "spike" || p.status === "warning")
  .reduce((a, p) => a + Math.round((p.curr - p.m1) * p.qty), 0);

// ── Weekly Digest data ───────────────────────────────────────────────────────
const DAILY_DIGEST = [
  { date: "Mon Oct 7", emoji: "📊", prime: 53.8, food: 29.4, labor: 24.4, profit: 1240, note: "Solid start. Prime cost on target.", color: "#00d4a8", status: "healthy" },
  { date: "Tue Oct 8", emoji: "✅", prime: 52.6, food: 28.8, labor: 23.8, profit: 1380, note: "Best Tuesday in 6 weeks. SPMH $312.", color: "#00d4a8", status: "healthy" },
  { date: "Wed Oct 9", emoji: "⚠️", prime: 55.9, food: 28.0, labor: 27.9, profit: 1200, note: "Labor crept up — 3 staff ran 30 min late close.", color: "#f59e0b", status: "warning" },
  { date: "Thu Oct 10", emoji: "✅", prime: 54.2, food: 28.1, labor: 26.1, profit: 1640, note: "Strong Thursday. Food cost under control.", color: "#00d4a8", status: "healthy" },
  { date: "Fri Oct 11 🔥", emoji: "🔥", prime: 53.7, food: 28.0, labor: 25.7, profit: 3220, note: "Best night of week. $12,450 sales. Tight execution.", color: "#818cf8", status: "great" },
  { date: "Sat Oct 12", emoji: "⚠️", prime: 59.8, food: 28.0, labor: 31.8, profit: 1140, note: "Overtime hit Sat shift. Labor $3,600 — $400 over budget.", color: "#f59e0b", status: "warning" },
  { date: "Sun Oct 13", emoji: "🚨", prime: 70.4, food: 28.0, labor: 42.4, profit: -320, note: "Sunday: 2.4 hrs OT. SPMH $229. Under $285 target.", color: "#ef4444", status: "critical" },
];

const WEEKLY_BLEEDS = [
  { rank: 1, area: "Sunday Labor Overtime", amount: 374, type: "Labor", detail: "2.4 hrs × 1.5× rate = $54 direct OT + $320 margin loss from inefficiency. Schedule 1 fewer server 4–7pm.", color: "#ef4444", icon: "👥" },
  { rank: 2, area: "Chicken Breast Price Spike", amount: 307, type: "Food Cost", detail: "+$0.53/lb × 580lb weekly volume. Sysco raised unannounced. Backup vendor (Restaurant Depot) is $2.98/lb.", color: "#f97316", icon: "🐔" },
  { rank: 3, area: "Saturday Overstaffing", amount: 280, type: "Labor", detail: "3 servers scheduled for 6pm–close but volume dropped at 9pm. Early cuts would have saved ~$280.", color: "#f59e0b", icon: "📅" },
  { rank: 4, area: "Avocado Cost Surge", amount: 103, type: "Food Cost", detail: "Up 30% ($1.42 → $1.85/each × 240 weekly). Seasonal spike — consider rotating guac off prix-fixe for 2 weeks.", color: "#eab308", icon: "🥑" },
];

// ── Integrations data ────────────────────────────────────────────────────────
const POS_INTEGRATIONS = [
  { name: "Toast POS", logo: "🍞", status: "connected", lastSync: "Today 11:42 PM", features: ["Sales auto-pull", "Item-level detail", "Void tracking"], color: "#00d4a8" },
  { name: "Clover", logo: "🍀", status: "available", lastSync: null, features: ["Sales auto-pull", "Shift reports", "Menu sync"], color: "#6b7280" },
  { name: "Square", logo: "◼", status: "available", lastSync: null, features: ["Daily totals", "Labor tracking", "Deposit sync"], color: "#6b7280" },
  { name: "Lightspeed", logo: "⚡", status: "available", lastSync: null, features: ["Sales + inventory", "Staff reports"], color: "#6b7280" },
];

const PAYROLL_INTEGRATIONS = [
  { name: "Gusto", logo: "💚", status: "connected", lastSync: "Sun Oct 13 · Pay period synced", features: ["Labor cost by shift", "OT detection", "Department split"], color: "#00d4a8" },
  { name: "ADP Workforce", logo: "🔵", status: "available", lastSync: null, features: ["Payroll totals", "Dept breakdown", "OT flags"], color: "#6b7280" },
  { name: "QuickBooks Payroll", logo: "📗", status: "available", lastSync: null, features: ["Labor cost sync", "Tax integration"], color: "#6b7280" },
  { name: "Paychex", logo: "🏦", status: "available", lastSync: null, features: ["Weekly labor totals", "Benefits cost"], color: "#6b7280" },
  { name: "CSV Upload", logo: "📄", status: "always_on", lastSync: "Anytime", features: ["Upload any payroll export", "Auto-categorizes", "Works with any system"], color: "#818cf8" },
];

function fmt(n: number) { return "$" + n.toLocaleString(); }
function pct(n: number) { return n.toFixed(1) + "%"; }

function PrimeCostGauge({ value }: { value: number }) {
  const color = value > 65 ? "#ef4444" : value > 58 ? "#f59e0b" : "#00d4a8";
  const label = value > 65 ? "CRITICAL" : value > 58 ? "WARNING" : "HEALTHY";
  return (
    <div className="text-center">
      <div className="text-xs text-gray-400 uppercase tracking-wider mb-2">Prime Cost</div>
      <div className="text-5xl font-bold tabular-nums mb-1" style={{ color, fontFamily: "var(--font-space)" }}>
        {pct(value)}
      </div>
      <div className="text-xs font-bold px-3 py-1 rounded-full inline-block"
        style={{ background: color + "20", color, border: `1px solid ${color}40` }}>
        {label}
      </div>
      <div className="mt-2 h-2.5 rounded-full bg-white/10 overflow-hidden mx-4">
        <div className="h-full rounded-full transition-all duration-1000"
          style={{ width: `${Math.min(value, 100)}%`, background: color }} />
      </div>
      <div className="text-xs text-gray-500 mt-1">Target ≤58% · Food {pct(FOOD_PCT)} · Labor {pct(LABOR_PCT)}</div>
    </div>
  );
}

type Tab = "overview" | "sales" | "invoices" | "labor" | "prices" | "digest" | "pl" | "integrations";

export default function SandboxPage() {
  const [tab, setTab] = useState<Tab>("overview");
  const [selectedPrice, setSelectedPrice] = useState<number | null>(null);

  const tabs: { id: Tab; label: string; icon: string }[] = [
    { id: "overview",     label: "Overview",      icon: "📊" },
    { id: "sales",        label: "Sales Log",      icon: "💰" },
    { id: "invoices",     label: "Invoice Alerts", icon: "🧾" },
    { id: "prices",       label: "Price Tracker",  icon: "📈" },
    { id: "labor",        label: "Labor Pulse",    icon: "👥" },
    { id: "digest",       label: "Weekly Digest",  icon: "📩" },
    { id: "pl",           label: "P&L",            icon: "📋" },
    { id: "integrations", label: "Integrations",   icon: "🔌" },
  ];

  return (
    <div className="min-h-screen" style={{ background: "#060b18" }}>
      {/* Top Bar */}
      <div className="flex items-center justify-between px-4 py-3 border-b sticky top-0 z-50"
        style={{ background: "rgba(6,11,24,0.95)", borderColor: "rgba(255,255,255,0.06)", backdropFilter: "blur(12px)" }}>
        <div className="flex items-center gap-3">
          <Link href="/" className="text-lg font-bold" style={{ color: "#00d4a8", fontFamily: "var(--font-space)" }}>⚡ CashCall</Link>
          <span className="hidden sm:block text-xs px-2 py-1 rounded-full"
            style={{ background: "rgba(0,212,168,0.15)", color: "#00d4a8", border: "1px solid rgba(0,212,168,0.3)" }}>
            🧪 SANDBOX MODE
          </span>
          <span className="text-xs text-gray-500 hidden sm:block">{LOCATION}</span>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs text-gray-500 hidden sm:block">{DEMO_USER}</span>
          <Link href="/trial"
            className="px-4 py-2 rounded-xl text-sm font-bold transition-all"
            style={{ background: "#00d4a8", color: "#060b18" }}>
            🔐 Get Your Portal
          </Link>
        </div>
      </div>

      {/* Demo banner */}
      <div className="px-4 py-2 text-center text-xs border-b"
        style={{ background: "rgba(240,180,41,0.08)", borderColor: "rgba(240,180,41,0.2)", color: "#f0b429" }}>
        ⚡ LIVE SIMULATION — Pre-loaded: Friday night surge (+54% vs avg), 18.3% poultry price hike, Sunday overtime alert
      </div>

      {/* Tabs */}
      <div className="flex overflow-x-auto border-b px-4 gap-1 py-2" style={{ borderColor: "rgba(255,255,255,0.06)" }}>
        {tabs.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-medium whitespace-nowrap transition-all"
            style={{
              background: tab === t.id ? "rgba(0,212,168,0.15)" : "transparent",
              color: tab === t.id ? "#00d4a8" : "#6b7280",
              border: tab === t.id ? "1px solid rgba(0,212,168,0.4)" : "1px solid transparent",
            }}>
            {t.icon} {t.label}
          </button>
        ))}
      </div>

      <div className="p-4 max-w-6xl mx-auto">
        {/* ─── OVERVIEW ─── */}
        {tab === "overview" && (
          <div className="space-y-4">
            {/* KPI strip */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {[
                { label: "Week Sales", value: fmt(TOTAL_SALES), color: "#00d4a8" },
                { label: "Net Profit", value: fmt(NET_PROFIT), color: "#818cf8" },
                { label: "Food Cost %", value: pct(FOOD_PCT), color: FOOD_PCT > 30 ? "#ef4444" : "#f59e0b" },
                { label: "Labor Cost %", value: pct(LABOR_PCT), color: LABOR_PCT > 30 ? "#ef4444" : "#f59e0b" },
              ].map(k => (
                <div key={k.label} className="rounded-2xl p-4" style={{
                  background: "rgba(255,255,255,0.03)",
                  border: "1px solid rgba(255,255,255,0.06)"
                }}>
                  <div className="text-xs text-gray-400 uppercase tracking-wider mb-1">{k.label}</div>
                  <div className="text-2xl font-bold tabular-nums" style={{ color: k.color, fontFamily: "var(--font-space)" }}>{k.value}</div>
                </div>
              ))}
            </div>

            {/* Prime Cost + Chart */}
            <div className="grid sm:grid-cols-2 gap-4">
              <div className="rounded-2xl p-5" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}>
                <PrimeCostGauge value={PRIME_COST_PCT} />
              </div>
              <div className="rounded-2xl p-5" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}>
                <div className="text-xs text-gray-400 uppercase tracking-wider mb-3">Daily Sales This Week</div>
                <ResponsiveContainer width="100%" height={160}>
                  <BarChart data={WEEKLY_SALES} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
                    <XAxis dataKey="day" tick={{ fill: "#6b7280", fontSize: 10 }} axisLine={false} />
                    <YAxis tick={{ fill: "#6b7280", fontSize: 10 }} axisLine={false} />
                    <Tooltip formatter={(v) => ["$" + Number(v).toLocaleString(), "Sales"]}
                      contentStyle={{ background: "#0f172a", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, fontSize: 12 }} />
                    <Bar dataKey="sales" fill="#00d4a8" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Today's P&L Breakdown */}
            {(() => {
              const today = WEEKLY_SALES[WEEKLY_SALES.length - 1]; // Sunday (latest day)
              const todayDigest = DAILY_DIGEST[DAILY_DIGEST.length - 1];
              const infraDaily = Math.round(INFRA / 7);
              const todayProfit = today.sales - today.food - today.labor - infraDaily;
              const profitPct = (todayProfit / today.sales) * 100;
              const isProfitable = todayProfit >= 0;
              const foodPct = (today.food / today.sales) * 100;
              const laborPct = (today.labor / today.sales) * 100;
              const infraPct = (infraDaily / today.sales) * 100;
              return (
                <div className="rounded-2xl p-5" style={{ background: "rgba(255,255,255,0.03)", border: `1px solid ${isProfitable ? "rgba(0,212,168,0.2)" : "rgba(239,68,68,0.2)"}` }}>
                  <div className="flex items-center justify-between mb-4">
                    <div>
                      <div className="text-xs text-gray-400 uppercase tracking-wider">Today&apos;s P&amp;L — {todayDigest.date}</div>
                      <div className="text-lg font-bold text-white mt-0.5">Daily Profit &amp; Loss Breakdown</div>
                    </div>
                    <div className="text-right">
                      <div className="text-2xl font-bold tabular-nums" style={{ color: isProfitable ? "#00d4a8" : "#ef4444", fontFamily: "var(--font-space)" }}>
                        {isProfitable ? "+" : ""}{fmt(todayProfit)}
                      </div>
                      <div className="text-xs mt-0.5" style={{ color: isProfitable ? "#00d4a8" : "#ef4444" }}>
                        {isProfitable ? "▲" : "▼"} {Math.abs(profitPct).toFixed(1)}% net margin
                      </div>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
                    {[
                      { label: "Today's Sales", value: fmt(today.sales), pct: null, color: "#00d4a8", icon: "💰" },
                      { label: "Food Cost", value: fmt(today.food), pct: foodPct, color: foodPct > 30 ? "#ef4444" : "#f59e0b", icon: "🍽️" },
                      { label: "Labor Cost", value: fmt(today.labor), pct: laborPct, color: laborPct > 30 ? "#ef4444" : "#f59e0b", icon: "👥" },
                      { label: "Infrastructure", value: fmt(infraDaily), pct: infraPct, color: "#818cf8", icon: "🏗️" },
                    ].map(k => (
                      <div key={k.label} className="rounded-xl p-3" style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.07)" }}>
                        <div className="text-xs text-gray-500 mb-1">{k.icon} {k.label}</div>
                        <div className="text-lg font-bold tabular-nums" style={{ color: k.color, fontFamily: "var(--font-space)" }}>{k.value}</div>
                        {k.pct !== null && (
                          <div className="text-[10px] mt-0.5" style={{ color: k.color }}>{k.pct.toFixed(1)}% of sales</div>
                        )}
                      </div>
                    ))}
                  </div>
                  {/* Cost bar */}
                  <div className="rounded-xl overflow-hidden h-3 flex mb-2">
                    <div style={{ width: `${foodPct}%`, background: foodPct > 30 ? "#ef4444" : "#f59e0b" }} title={`Food ${foodPct.toFixed(1)}%`} />
                    <div style={{ width: `${laborPct}%`, background: laborPct > 30 ? "#dc2626" : "#f97316" }} title={`Labor ${laborPct.toFixed(1)}%`} />
                    <div style={{ width: `${infraPct}%`, background: "#818cf8" }} title={`Infra ${infraPct.toFixed(1)}%`} />
                    <div style={{ width: `${Math.max(0, profitPct)}%`, background: "#00d4a8" }} title={`Profit ${profitPct.toFixed(1)}%`} />
                  </div>
                  <div className="flex flex-wrap gap-x-4 gap-y-1 text-[10px] text-gray-500">
                    <span><span style={{ color: "#f59e0b" }}>■</span> Food {foodPct.toFixed(1)}%</span>
                    <span><span style={{ color: "#f97316" }}>■</span> Labor {laborPct.toFixed(1)}%</span>
                    <span><span style={{ color: "#818cf8" }}>■</span> Infra {infraPct.toFixed(1)}%</span>
                    <span><span style={{ color: "#00d4a8" }}>■</span> Net Margin {Math.abs(profitPct).toFixed(1)}% {isProfitable ? "profit" : "loss"}</span>
                  </div>
                  <div className="mt-3 text-xs rounded-xl px-3 py-2.5" style={{ background: isProfitable ? "rgba(0,212,168,0.08)" : "rgba(239,68,68,0.08)", color: isProfitable ? "#00d4a8" : "#ef4444", border: `1px solid ${isProfitable ? "rgba(0,212,168,0.2)" : "rgba(239,68,68,0.2)"}` }}>
                    {todayDigest.note}
                  </div>
                </div>
              );
            })()}

            {/* Active Alerts */}
            <div className="rounded-2xl p-5" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}>
              <div className="text-xs text-gray-400 uppercase tracking-wider mb-3">🔔 Active Intelligence Alerts</div>
              <div className="space-y-3">
                <div className="flex items-start gap-3 p-3 rounded-xl" style={{ background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.25)" }}>
                  <span className="text-lg mt-0.5">🚨</span>
                  <div>
                    <div className="text-sm font-semibold text-red-400">Poultry Price Spike: +18.3%</div>
                    <div className="text-xs text-gray-400 mt-0.5">Chicken breast up $0.53/lb from Sysco. ${Math.round((3.42-2.89)*580).toLocaleString()} weekly impact at current volume. Consider switching to backup vendor or adjusting menu pricing.</div>
                  </div>
                </div>
                <div className="flex items-start gap-3 p-3 rounded-xl" style={{ background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.25)" }}>
                  <span className="text-lg mt-0.5">⚠️</span>
                  <div>
                    <div className="text-sm font-semibold text-red-400">Sunday Overtime Alert</div>
                    <div className="text-xs text-gray-400 mt-0.5">2.4 hrs overtime logged on Sunday. Labor at ${fmt(WEEKLY_SALES[6].labor)} vs ${fmt(WEEKLY_SALES[0].labor)} Monday baseline. SPMH dropped to ${Math.round(WEEKLY_SALES[6].sales/(WEEKLY_SALES[6].labor/18))}/hr — below $285 target.</div>
                  </div>
                </div>
                <div className="flex items-start gap-3 p-3 rounded-xl" style={{ background: "rgba(0,212,168,0.08)", border: "1px solid rgba(0,212,168,0.25)" }}>
                  <span className="text-lg mt-0.5">🔥</span>
                  <div>
                    <div className="text-sm font-semibold text-green-400">Friday Night: $12,450 (+54% vs weekly avg)</div>
                    <div className="text-xs text-gray-400 mt-0.5">Best sales day this week. POS $8,900 · Cash $2,100 · UberEats $980 · Liquor $470. Prime cost held at 53.7% — strong execution.</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ─── SALES LOG ─── */}
        {tab === "sales" && (
          <div className="rounded-2xl overflow-hidden" style={{ border: "1px solid rgba(255,255,255,0.06)" }}>
            <div className="px-4 py-3 border-b flex items-center justify-between" style={{ background: "rgba(255,255,255,0.03)", borderColor: "rgba(255,255,255,0.06)" }}>
              <div className="text-sm font-semibold text-white">Weekly Sales Log</div>
              <div className="text-xs text-gray-400 px-2 py-1 rounded-lg" style={{ background: "rgba(0,212,168,0.1)", color: "#00d4a8" }}>
                ⚡ Entered via AI photo scan in &lt;2 mins/day
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr style={{ background: "rgba(255,255,255,0.02)" }}>
                    {["Date", "POS", "Cash", "Uber Eats", "Catering", "🍷 Liquor", "Total"].map(h => (
                      <th key={h} className="px-4 py-2 text-left text-xs text-gray-400 uppercase tracking-wider font-medium">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {DAILY_SALES.map((row, i) => {
                    const total = row.pos + row.cash + row.uber + row.catering + row.liquor;
                    const isFriday = row.date.includes("Fri");
                    return (
                      <tr key={i} className="border-t hover:bg-white/[0.02] transition-colors"
                        style={{ borderColor: "rgba(255,255,255,0.04)", background: isFriday ? "rgba(0,212,168,0.04)" : undefined }}>
                        <td className="px-4 py-2.5 text-xs font-medium" style={{ color: isFriday ? "#00d4a8" : "#9ca3af" }}>{row.date}</td>
                        <td className="px-4 py-2.5 text-xs tabular-nums text-white">{fmt(row.pos)}</td>
                        <td className="px-4 py-2.5 text-xs tabular-nums text-white">{fmt(row.cash)}</td>
                        <td className="px-4 py-2.5 text-xs tabular-nums text-white">{fmt(row.uber)}</td>
                        <td className="px-4 py-2.5 text-xs tabular-nums text-gray-400">{row.catering ? fmt(row.catering) : "—"}</td>
                        <td className="px-4 py-2.5 text-xs tabular-nums" style={{ color: "#a78bfa" }}>{row.liquor ? fmt(row.liquor) : "—"}</td>
                        <td className="px-4 py-2.5 text-xs font-bold tabular-nums" style={{ color: "#00d4a8" }}>{fmt(total)}</td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr style={{ background: "rgba(0,212,168,0.06)", borderTop: "1px solid rgba(0,212,168,0.2)" }}>
                    <td className="px-4 py-2 text-xs font-bold text-white">Total</td>
                    {["pos", "cash", "uber", "catering", "liquor"].map(k => (
                      <td key={k} className="px-4 py-2 text-xs font-bold tabular-nums text-white">
                        {fmt(DAILY_SALES.reduce((a, r) => a + ((r as unknown) as Record<string, number>)[k], 0))}
                      </td>
                    ))}
                    <td className="px-4 py-2 text-xs font-bold tabular-nums" style={{ color: "#00d4a8" }}>{fmt(TOTAL_SALES)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        )}

        {/* ─── INVOICE ALERTS ─── */}
        {tab === "invoices" && (
          <div className="space-y-4">
            {/* OCR Scanned Invoice List */}
            <div className="rounded-2xl overflow-hidden" style={{ border: "1px solid rgba(255,255,255,0.06)" }}>
              <div className="px-4 py-3 border-b flex items-center justify-between flex-wrap gap-2"
                style={{ background: "rgba(0,212,168,0.04)", borderColor: "rgba(0,212,168,0.15)" }}>
                <div>
                  <div className="text-sm font-bold text-white">OCR-Scanned Invoices</div>
                  <div className="text-[10px] text-gray-500 mt-0.5">AI reads every invoice — no manual entry needed</div>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] px-2 py-1 rounded-full font-bold" style={{ background: "rgba(0,212,168,0.15)", color: "#00d4a8", border: "1px solid rgba(0,212,168,0.3)" }}>
                    ✅ 7 invoices scanned this week
                  </span>
                  <span className="text-[10px] px-2 py-1 rounded-full font-bold" style={{ background: "rgba(255,255,255,0.05)", color: "#6b7280" }}>
                    avg scan: 38 sec
                  </span>
                </div>
              </div>
              {[
                { vendor: "Sysco", date: "Mon Oct 7", time: "9:14 AM", total: 4382.60, items: 18, status: "ok", flags: 1, flagItem: "Chicken breast +18.3%", categories: ["Poultry", "Dairy", "Dry Goods", "Produce"], icon: "🏢" },
                { vendor: "US Foods", date: "Tue Oct 8", time: "11:02 AM", total: 2914.00, items: 11, status: "ok", flags: 1, flagItem: "Beef tenderloin +15.2%", categories: ["Beef", "Pork", "Seafood"], icon: "🚚" },
                { vendor: "Restaurant Depot", date: "Wed Oct 9", time: "8:45 AM", total: 1876.40, items: 22, status: "ok", flags: 0, flagItem: null, categories: ["Dry Goods", "Spices", "Canned", "Oil"], icon: "🏬" },
                { vendor: "Produce Direct", date: "Wed Oct 9", time: "7:30 AM", total: 843.20, items: 14, status: "ok", flags: 1, flagItem: "Avocados +30% (seasonal)", categories: ["Produce", "Herbs", "Citrus"], icon: "🥬" },
                { vendor: "Local Bakery", date: "Thu Oct 10", time: "6:55 AM", total: 312.00, items: 6, status: "ok", flags: 0, flagItem: null, categories: ["Bread", "Pastry"], icon: "🍞" },
                { vendor: "Sysco", date: "Fri Oct 11", time: "10:20 AM", total: 3910.80, items: 15, status: "ok", flags: 0, flagItem: null, categories: ["Poultry", "Dairy", "Condiments"], icon: "🏢" },
                { vendor: "Beverages Unlimited", date: "Fri Oct 11", time: "2:15 PM", total: 1244.50, items: 9, status: "ok", flags: 0, flagItem: null, categories: ["Beer", "Wine", "Spirits", "NA Bev"], icon: "🥂" },
              ].map((inv, i) => (
                <div key={i} className="border-t px-4 py-3 hover:bg-white/[0.015] transition-colors"
                  style={{ borderColor: "rgba(255,255,255,0.04)" }}>
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-xl flex items-center justify-center text-base flex-shrink-0"
                      style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)" }}>
                      {inv.icon}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-semibold text-white">{inv.vendor}</span>
                        {inv.flags > 0 && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded font-bold"
                            style={{ background: "rgba(239,68,68,0.15)", color: "#ef4444", border: "1px solid rgba(239,68,68,0.3)" }}>
                            ⚠ {inv.flags} price alert
                          </span>
                        )}
                        {inv.flags === 0 && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded font-bold"
                            style={{ background: "rgba(0,212,168,0.1)", color: "#00d4a8" }}>
                            ✓ Prices normal
                          </span>
                        )}
                      </div>
                      <div className="text-[10px] text-gray-500 mt-0.5">
                        {inv.date} · {inv.time} · {inv.items} line items · {inv.categories.join(", ")}
                      </div>
                      {inv.flagItem && (
                        <div className="text-[10px] text-red-400 mt-0.5">⚠ {inv.flagItem}</div>
                      )}
                    </div>
                    <div className="flex items-center gap-3 flex-shrink-0">
                      <div className="text-right">
                        <div className="text-sm font-bold tabular-nums text-white">{fmt(inv.total)}</div>
                        <div className="text-[10px] text-gray-500">invoice total</div>
                      </div>
                      <div className="text-[10px] px-2 py-1 rounded-lg font-medium"
                        style={{ background: "rgba(0,212,168,0.1)", color: "#00d4a8" }}>
                        📷 Scanned
                      </div>
                    </div>
                  </div>
                </div>
              ))}
              <div className="px-4 py-2.5 flex items-center justify-between"
                style={{ background: "rgba(0,212,168,0.05)", borderTop: "1px solid rgba(0,212,168,0.15)" }}>
                <div className="text-xs text-gray-500">Week total: 7 invoices · 95 line items · 100% scanned</div>
                <div className="text-sm font-bold tabular-nums" style={{ color: "#00d4a8" }}>{fmt(4382.60 + 2914.00 + 1876.40 + 843.20 + 312.00 + 3910.80 + 1244.50)}</div>
              </div>
            </div>

            <div className="text-xs text-gray-400 px-1 pt-2">AI Invoice Intelligence — price changes vs 30-day baseline</div>
            {INVOICE_ALERTS.map(alert => {
              const colors = alert.severity === "critical"
                ? { bg: "rgba(239,68,68,0.08)", border: "rgba(239,68,68,0.3)", text: "#ef4444", badge: "#dc2626" }
                : alert.severity === "warning"
                ? { bg: "rgba(245,158,11,0.08)", border: "rgba(245,158,11,0.3)", text: "#f59e0b", badge: "#d97706" }
                : { bg: "rgba(129,140,248,0.06)", border: "rgba(129,140,248,0.2)", text: "#818cf8", badge: "#6366f1" };
              return (
                <div key={alert.id} className="rounded-2xl p-5"
                  style={{ background: colors.bg, border: `1px solid ${colors.border}` }}>
                  <div className="flex items-start justify-between gap-4 mb-3">
                    <div>
                      <div className="text-sm font-bold text-white mb-0.5">{alert.item}</div>
                      <div className="text-xs text-gray-400">{alert.vendor} · {alert.category}</div>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <div className="text-lg font-bold" style={{ color: colors.text }}>+{alert.pct}%</div>
                      <div className="text-xs text-gray-400">price increase</div>
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-3">
                    <div className="text-center">
                      <div className="text-xs text-gray-500 mb-0.5">Last Month</div>
                      <div className="text-sm font-semibold text-white">${alert.prev.toFixed(2)}/{alert.unit}</div>
                    </div>
                    <div className="text-center">
                      <div className="text-xs text-gray-500 mb-0.5">This Invoice</div>
                      <div className="text-sm font-bold" style={{ color: colors.text }}>${alert.curr.toFixed(2)}/{alert.unit}</div>
                    </div>
                    <div className="text-center">
                      <div className="text-xs text-gray-500 mb-0.5">Weekly Impact</div>
                      <div className="text-sm font-bold" style={{ color: colors.text }}>+{fmt(alert.impact)}</div>
                    </div>
                  </div>
                  <div className="mt-3 flex gap-2">
                    <button className="text-xs px-3 py-1 rounded-lg font-medium"
                      style={{ background: colors.badge + "30", color: colors.text }}>
                      📧 Flag for Review
                    </button>
                    <button className="text-xs px-3 py-1 rounded-lg font-medium"
                      style={{ background: "rgba(255,255,255,0.06)", color: "#9ca3af" }}>
                      Compare Vendors
                    </button>
                  </div>
                </div>
              );
            })}
            <div className="rounded-2xl p-4 text-center" style={{ background: "rgba(0,212,168,0.05)", border: "1px solid rgba(0,212,168,0.15)" }}>
              <div className="text-sm text-gray-400 mb-2">Total weekly cost impact from price changes</div>
              <div className="text-3xl font-bold" style={{ color: "#ef4444", fontFamily: "var(--font-space)" }}>
                +{fmt(INVOICE_ALERTS.reduce((a, i) => a + i.impact, 0))}
              </div>
              <div className="text-xs text-gray-500 mt-1">Detected automatically from scanned invoices</div>
            </div>
          </div>
        )}

        {/* ─── LABOR PULSE ─── */}
        {tab === "labor" && (
          <div className="space-y-4">
            <div className="grid sm:grid-cols-3 gap-3">
              <div className="rounded-2xl p-4" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}>
                <div className="text-xs text-gray-400 uppercase tracking-wider mb-1">Total Labor</div>
                <div className="text-2xl font-bold" style={{ color: "#f59e0b", fontFamily: "var(--font-space)" }}>{fmt(TOTAL_LABOR)}</div>
                <div className="text-xs text-gray-500 mt-0.5">{pct(LABOR_PCT)} of sales</div>
              </div>
              <div className="rounded-2xl p-4" style={{ background: "rgba(239,68,68,0.06)", border: "1px solid rgba(239,68,68,0.2)" }}>
                <div className="text-xs text-red-400 uppercase tracking-wider mb-1">⚠ Overtime</div>
                <div className="text-2xl font-bold text-red-400" style={{ fontFamily: "var(--font-space)" }}>2.4 hrs</div>
                <div className="text-xs text-gray-500 mt-0.5">Sunday — adds ~$54 to labor cost</div>
              </div>
              <div className="rounded-2xl p-4" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}>
                <div className="text-xs text-gray-400 uppercase tracking-wider mb-1">Avg SPMH</div>
                <div className="text-2xl font-bold text-white" style={{ fontFamily: "var(--font-space)" }}>
                  ${Math.round(TOTAL_SALES / (TOTAL_LABOR / 18))}
                </div>
                <div className="text-xs text-gray-500 mt-0.5">Target: $285/hr</div>
              </div>
            </div>

            <div className="rounded-2xl p-5" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}>
              <div className="text-xs text-gray-400 uppercase tracking-wider mb-3">Sales Per Man Hour (SPMH) vs Target</div>
              <ResponsiveContainer width="100%" height={200}>
                <LineChart data={LABOR_PULSE} margin={{ top: 0, right: 10, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
                  <XAxis dataKey="day" tick={{ fill: "#6b7280", fontSize: 11 }} axisLine={false} />
                  <YAxis tick={{ fill: "#6b7280", fontSize: 10 }} axisLine={false} domain={[200, 400]} />
                  <Tooltip contentStyle={{ background: "#0f172a", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, fontSize: 12 }} />
                  <Line type="monotone" dataKey="spmh" stroke="#818cf8" strokeWidth={2.5} dot={{ fill: "#818cf8", r: 4 }} name="SPMH" />
                  <Line type="monotone" dataKey="target" stroke="#00d4a8" strokeWidth={1.5} strokeDasharray="6 3" dot={false} name="Target" />
                </LineChart>
              </ResponsiveContainer>
              <div className="flex gap-4 mt-2 text-xs text-gray-500">
                <div className="flex items-center gap-1.5"><div className="w-4 h-0.5 bg-indigo-400 rounded" /> SPMH Actual</div>
                <div className="flex items-center gap-1.5"><div className="w-4 h-0.5 border-t border-dashed border-teal-400" /> $285 Target</div>
              </div>
            </div>

            <div className="rounded-2xl overflow-hidden" style={{ border: "1px solid rgba(255,255,255,0.06)" }}>
              <div className="px-4 py-3 border-b text-xs font-semibold text-gray-400 uppercase tracking-wider"
                style={{ background: "rgba(255,255,255,0.02)", borderColor: "rgba(255,255,255,0.06)" }}>
                Daily Labor Breakdown
              </div>
              <table className="w-full text-sm">
                <tbody>
                  {WEEKLY_SALES.map((d, i) => {
                    const spmh = Math.round(d.sales / (d.labor / 18));
                    const pctLab = (d.labor / d.sales * 100);
                    const isSunday = d.day === "Sun";
                    return (
                      <tr key={i} className="border-t" style={{ borderColor: "rgba(255,255,255,0.04)", background: isSunday ? "rgba(239,68,68,0.04)" : undefined }}>
                        <td className="px-4 py-2.5 text-xs font-medium text-gray-300">{d.day}</td>
                        <td className="px-4 py-2.5 text-xs tabular-nums text-white">{fmt(d.labor)}</td>
                        <td className="px-4 py-2.5 text-xs tabular-nums" style={{ color: pctLab > 36 ? "#ef4444" : "#9ca3af" }}>
                          {pctLab.toFixed(1)}%
                        </td>
                        <td className="px-4 py-2.5 text-xs tabular-nums" style={{ color: spmh < 285 ? "#ef4444" : "#818cf8" }}>
                          ${spmh}/hr
                        </td>
                        <td className="px-4 py-2.5 text-xs" style={{ color: "#ef4444" }}>
                          {isSunday ? "⚠ 2.4 hrs OT" : ""}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ─── PRICE TRACKER ─── */}
        {tab === "prices" && (
          <div className="space-y-4">
            {/* Summary bar */}
            <div className="grid grid-cols-3 gap-3">
              <div className="rounded-2xl p-4" style={{ background: "rgba(239,68,68,0.07)", border: "1px solid rgba(239,68,68,0.2)" }}>
                <div className="text-xs text-red-400 uppercase tracking-wider mb-1">Spike Alerts</div>
                <div className="text-2xl font-bold text-red-400" style={{ fontFamily: "var(--font-space)" }}>
                  {PRICE_ITEMS.filter(p => p.status === "spike").length}
                </div>
                <div className="text-xs text-gray-500 mt-0.5">items up this week</div>
              </div>
              <div className="rounded-2xl p-4" style={{ background: "rgba(0,212,168,0.07)", border: "1px solid rgba(0,212,168,0.2)" }}>
                <div className="text-xs text-teal-400 uppercase tracking-wider mb-1">Price Drop</div>
                <div className="text-2xl font-bold text-teal-400" style={{ fontFamily: "var(--font-space)" }}>
                  {PRICE_ITEMS.filter(p => p.status === "drop").length}
                </div>
                <div className="text-xs text-gray-500 mt-0.5">opportunity to save</div>
              </div>
              <div className="rounded-2xl p-4" style={{ background: "rgba(239,68,68,0.07)", border: "1px solid rgba(239,68,68,0.2)" }}>
                <div className="text-xs text-red-400 uppercase tracking-wider mb-1">Weekly Impact</div>
                <div className="text-2xl font-bold text-red-400" style={{ fontFamily: "var(--font-space)" }}>+{fmt(TOTAL_PRICE_IMPACT)}</div>
                <div className="text-xs text-gray-500 mt-0.5">extra cost vs last month</div>
              </div>
            </div>

            {/* Price table */}
            <div className="rounded-2xl overflow-hidden" style={{ border: "1px solid rgba(255,255,255,0.06)" }}>
              <div className="px-4 py-3 border-b" style={{ background: "rgba(255,255,255,0.02)", borderColor: "rgba(255,255,255,0.06)" }}>
                <div className="text-xs text-gray-400 uppercase tracking-wider">Vendor Price Intelligence — Updated on Invoice Scan</div>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr style={{ background: "rgba(255,255,255,0.02)" }}>
                      {["Item", "Vendor", "This Invoice", "Last Month", "3M Avg", "Market", "Change", "Wkly Impact"].map(h => (
                        <th key={h} className="px-3 py-2 text-left text-xs text-gray-500 uppercase tracking-wider font-medium whitespace-nowrap">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {PRICE_ITEMS.map((p, i) => {
                      const chgPct = ((p.curr - p.m1) / p.m1 * 100);
                      const impact = Math.round((p.curr - p.m1) * p.qty);
                      const statusColor = p.status === "spike" ? "#ef4444" : p.status === "drop" ? "#00d4a8" : p.status === "warning" ? "#f59e0b" : "#6b7280";
                      const statusIcon = p.status === "spike" ? "▲" : p.status === "drop" ? "▼" : p.status === "warning" ? "▲" : "–";
                      const isSelected = selectedPrice === i;
                      return (
                        <>
                          <tr key={i}
                            onClick={() => setSelectedPrice(isSelected ? null : i)}
                            className="border-t transition-colors cursor-pointer"
                            style={{ borderColor: "rgba(255,255,255,0.04)", background: isSelected ? "rgba(0,212,168,0.06)" : p.status === "spike" ? "rgba(239,68,68,0.03)" : p.status === "drop" ? "rgba(0,212,168,0.03)" : undefined }}>
                            <td className="px-3 py-2.5">
                              <div className="flex items-center gap-1.5">
                                <span className="text-[10px] transition-transform" style={{ color: "#00d4a8", transform: isSelected ? "rotate(90deg)" : "none" }}>▶</span>
                                <div>
                                  <div className="text-xs font-semibold text-white">{p.item}</div>
                                  <div className="text-[10px] text-gray-500">{p.category}</div>
                                </div>
                              </div>
                            </td>
                            <td className="px-3 py-2.5 text-xs text-gray-400 whitespace-nowrap">{p.vendor}</td>
                            <td className="px-3 py-2.5 text-xs font-bold tabular-nums" style={{ color: statusColor }}>${p.curr.toFixed(2)}<span className="text-gray-600">/{p.unit}</span></td>
                            <td className="px-3 py-2.5 text-xs tabular-nums text-gray-400">${p.m1.toFixed(2)}</td>
                            <td className="px-3 py-2.5 text-xs tabular-nums text-gray-500">${p.m3.toFixed(2)}</td>
                            <td className="px-3 py-2.5 text-xs tabular-nums" style={{ color: p.curr > p.market ? "#f59e0b" : "#00d4a8" }}>${p.market.toFixed(2)}</td>
                            <td className="px-3 py-2.5 text-xs font-bold tabular-nums whitespace-nowrap" style={{ color: statusColor }}>
                              {statusIcon} {Math.abs(chgPct).toFixed(1)}%
                            </td>
                            <td className="px-3 py-2.5 text-xs font-bold tabular-nums whitespace-nowrap" style={{ color: impact > 0 ? "#ef4444" : "#00d4a8" }}>
                              {impact > 0 ? "+" : ""}{fmt(impact)}
                            </td>
                          </tr>
                          {isSelected && (
                            <tr key={`detail-${i}`}>
                              <td colSpan={8} className="px-4 py-4" style={{ background: "rgba(0,212,168,0.04)", borderTop: "1px solid rgba(0,212,168,0.15)", borderBottom: "1px solid rgba(0,212,168,0.15)" }}>
                                <div className="flex flex-col sm:flex-row gap-4">
                                  {/* Price comparison chart */}
                                  <div className="flex-1 min-w-0">
                                    <div className="text-xs text-gray-400 uppercase tracking-wider mb-3">Price Comparison — {p.item} (/{p.unit})</div>
                                    <div className="flex items-end gap-3 h-28">
                                      {[
                                        { label: "Current", val: p.curr, color: statusColor },
                                        { label: "1M Ago", val: p.m1, color: "#6b7280" },
                                        { label: "3M Avg", val: p.m3, color: "#4b5563" },
                                        { label: "Market", val: p.market, color: "#818cf8" },
                                      ].map(bar => {
                                        const maxV = Math.max(p.curr, p.m1, p.m3, p.market) * 1.15;
                                        const heightPct = (bar.val / maxV) * 100;
                                        return (
                                          <div key={bar.label} className="flex flex-col items-center gap-1 flex-1">
                                            <div className="text-[10px] font-bold tabular-nums" style={{ color: bar.color }}>${bar.val.toFixed(2)}</div>
                                            <div className="w-full rounded-t flex-shrink-0" style={{ height: `${heightPct * 0.8}px`, background: bar.color, minHeight: 8, opacity: bar.label === "Current" ? 1 : 0.6 }} />
                                            <div className="text-[9px] text-gray-500 text-center leading-tight">{bar.label}</div>
                                          </div>
                                        );
                                      })}
                                    </div>
                                    <div className="mt-2 text-[10px] text-gray-500">
                                      Volume: {p.qty} {p.unit}/week · Weekly spend: {fmt(Math.round(p.curr * p.qty))}
                                    </div>
                                  </div>
                                  {/* Recommendation */}
                                  <div className="sm:w-64 rounded-xl p-4 flex-shrink-0"
                                    style={{ background: p.status === "spike" ? "rgba(239,68,68,0.08)" : p.status === "drop" ? "rgba(0,212,168,0.08)" : "rgba(245,158,11,0.08)", border: `1px solid ${p.status === "spike" ? "rgba(239,68,68,0.25)" : p.status === "drop" ? "rgba(0,212,168,0.25)" : "rgba(245,158,11,0.25)"}` }}>
                                    <div className="text-sm font-bold mb-1.5" style={{ color: statusColor }}>
                                      {p.status === "spike" ? "🚨 Action Required" : p.status === "drop" ? "💡 Opportunity" : "⚠️ Watch List"}
                                    </div>
                                    <div className="text-xs text-gray-300 leading-relaxed">{p.recommendation}</div>
                                    {p.curr > p.market && (
                                      <div className="mt-2 text-[10px] font-semibold" style={{ color: "#f59e0b" }}>
                                        Paying ${(p.curr - p.market).toFixed(2)}/{p.unit} above market · {fmt(Math.round((p.curr - p.market) * p.qty))}/wk overage
                                      </div>
                                    )}
                                  </div>
                                </div>
                              </td>
                            </tr>
                          )}
                        </>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Recommendations */}
            <div className="space-y-3">
              <div className="text-xs text-gray-400 uppercase tracking-wider px-1">AI Recommendations</div>
              {PRICE_ITEMS.filter(p => p.status === "spike" || p.status === "drop").map((p, i) => (
                <div key={i} className="rounded-xl p-4 flex gap-3"
                  style={{
                    background: p.status === "spike" ? "rgba(239,68,68,0.06)" : "rgba(0,212,168,0.06)",
                    border: `1px solid ${p.status === "spike" ? "rgba(239,68,68,0.2)" : "rgba(0,212,168,0.2)"}`,
                  }}>
                  <span className="text-lg flex-shrink-0 mt-0.5">{p.status === "spike" ? "🚨" : "💡"}</span>
                  <div>
                    <div className="text-sm font-semibold mb-0.5" style={{ color: p.status === "spike" ? "#ef4444" : "#00d4a8" }}>
                      {p.item} — {p.status === "spike" ? `Up ${((p.curr - p.m1) / p.m1 * 100).toFixed(1)}%` : `Down ${((p.m1 - p.curr) / p.m1 * 100).toFixed(1)}% — opportunity`}
                    </div>
                    <div className="text-xs text-gray-400 leading-relaxed">{p.recommendation}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ─── WEEKLY DIGEST ─── */}
        {tab === "digest" && (
          <div className="space-y-4">
            {/* Top bleeds */}
            <div className="rounded-2xl p-5" style={{ background: "rgba(239,68,68,0.05)", border: "1px solid rgba(239,68,68,0.2)" }}>
              <div className="flex items-center gap-2 mb-4">
                <span className="text-lg">🩸</span>
                <div>
                  <div className="text-sm font-bold text-white">Where You Lost Money This Week</div>
                  <div className="text-xs text-gray-400">AI-detected margin leaks — week of Oct 7–13</div>
                </div>
                <div className="ml-auto text-right">
                  <div className="text-lg font-bold text-red-400" style={{ fontFamily: "var(--font-space)" }}>
                    {fmt(WEEKLY_BLEEDS.reduce((a, b) => a + b.amount, 0))}
                  </div>
                  <div className="text-xs text-gray-500">total preventable loss</div>
                </div>
              </div>
              <div className="space-y-3">
                {WEEKLY_BLEEDS.map((b, i) => (
                  <div key={i} className="flex gap-3 items-start rounded-xl p-3"
                    style={{ background: "rgba(0,0,0,0.25)", border: "1px solid rgba(255,255,255,0.05)" }}>
                    <div className="w-7 h-7 rounded-lg flex items-center justify-center text-sm flex-shrink-0" style={{ background: b.color + "20", border: `1px solid ${b.color}40` }}>
                      {b.icon}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2 mb-0.5">
                        <span className="text-sm font-semibold text-white">{b.area}</span>
                        <span className="text-sm font-bold flex-shrink-0" style={{ color: b.color }}>−{fmt(b.amount)}</span>
                      </div>
                      <div className="text-[10px] px-1.5 py-0.5 rounded inline-block mb-1" style={{ background: b.color + "20", color: b.color }}>{b.type}</div>
                      <div className="text-xs text-gray-400 leading-relaxed">{b.detail}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Daily digest strip */}
            <div className="rounded-2xl overflow-hidden" style={{ border: "1px solid rgba(255,255,255,0.06)" }}>
              <div className="px-4 py-3 border-b" style={{ background: "rgba(255,255,255,0.02)", borderColor: "rgba(255,255,255,0.06)" }}>
                <div className="text-xs text-gray-400 uppercase tracking-wider">Daily Financial Digest — Sent 6 AM via WhatsApp & Email</div>
              </div>
              <div className="divide-y divide-white/[0.04]">
                {DAILY_DIGEST.map((d, i) => (
                  <div key={i} className="px-4 py-3 flex items-center gap-4 hover:bg-white/[0.015] transition-colors"
                    style={{ background: d.status === "critical" ? "rgba(239,68,68,0.04)" : d.status === "great" ? "rgba(129,140,248,0.04)" : undefined }}>
                    <div className="text-lg flex-shrink-0">{d.emoji}</div>
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-semibold text-gray-300 mb-0.5">{d.date}</div>
                      <div className="text-xs text-gray-500 truncate">{d.note}</div>
                    </div>
                    <div className="flex items-center gap-3 flex-shrink-0 text-right">
                      <div>
                        <div className="text-xs tabular-nums font-bold" style={{ color: d.color }}>{pct(d.prime)}</div>
                        <div className="text-[10px] text-gray-600">prime cost</div>
                      </div>
                      <div>
                        <div className={`text-xs tabular-nums font-bold ${d.profit < 0 ? "text-red-400" : "text-white"}`}>{fmt(Math.abs(d.profit))}</div>
                        <div className="text-[10px] text-gray-600">{d.profit < 0 ? "loss" : "profit"}</div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Sample WhatsApp message */}
            <div className="rounded-2xl p-5" style={{ background: "rgba(0,0,0,0.4)", border: "1px solid rgba(255,255,255,0.07)" }}>
              <div className="text-xs text-gray-400 uppercase tracking-wider mb-3">📲 What You Actually Receive — 6 AM WhatsApp</div>
              <div className="rounded-2xl p-4 max-w-sm" style={{ background: "#1a2a1a", border: "1px solid rgba(0,212,168,0.15)" }}>
                <div className="text-xs text-gray-400 mb-2">CashCall AI · Today, 6:00 AM</div>
                <div className="text-sm text-white leading-relaxed font-mono" style={{ fontSize: 13 }}>
                  📊 <strong>Tampa Bay — Friday Oct 11</strong><br />
                  💰 Sales: $12,450 ✅ (Target $8,500)<br />
                  🍖 Food: $3,486 (28.0%) — On track<br />
                  👥 Labor: $3,200 (25.7%) — On track<br />
                  ⚡ Prime Cost: <strong style={{ color: "#00d4a8" }}>53.7%</strong> — ✅ Healthy<br />
                  🏢 Infra: $1,371 (11.0%)<br />
                  <span style={{ color: "#818cf8" }}>💵 Net Profit: $4,393 (35.3%)</span><br />
                  <br />
                  <span style={{ color: "#ef4444" }}>⚠ Chicken breast up 18.3% from Sysco</span><br />
                  <span style={{ color: "#f59e0b" }}>💡 Best Friday since August — replicate staffing model</span>
                </div>
              </div>
            </div>

            {/* Week-over-week comparison */}
            <div className="rounded-2xl p-5" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}>
              <div className="text-xs text-gray-400 uppercase tracking-wider mb-3">Week-over-Week Profit Trend</div>
              <ResponsiveContainer width="100%" height={140}>
                <LineChart data={[
                  { week: "Wk -4", profit: 4200 },
                  { week: "Wk -3", profit: 3800 },
                  { week: "Wk -2", profit: 5100 },
                  { week: "Wk -1", profit: 4600 },
                  { week: "This Wk", profit: NET_PROFIT },
                ]} margin={{ top: 4, right: 10, left: -10, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
                  <XAxis dataKey="week" tick={{ fill: "#6b7280", fontSize: 10 }} axisLine={false} />
                  <YAxis tick={{ fill: "#6b7280", fontSize: 10 }} axisLine={false} tickFormatter={v => "$" + (v / 1000).toFixed(1) + "k"} />
                  <Tooltip formatter={(v) => [fmt(Number(v)), "Net Profit"]}
                    contentStyle={{ background: "#0f172a", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, fontSize: 12 }} />
                  <Line type="monotone" dataKey="profit" stroke="#818cf8" strokeWidth={2.5} dot={{ fill: "#818cf8", r: 4 }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}

        {/* ─── INTEGRATIONS ─── */}
        {tab === "integrations" && (
          <div className="space-y-6">
            {/* POS */}
            <div>
              <div className="flex items-center gap-2 mb-3">
                <span className="text-base">🖥</span>
                <div className="text-sm font-bold text-white">Point of Sale — Sales Auto-Sync</div>
                <div className="ml-auto text-xs text-gray-500">Sales pull automatically each night</div>
              </div>
              <div className="grid sm:grid-cols-2 gap-3">
                {POS_INTEGRATIONS.map((intg, i) => (
                  <div key={i} className="rounded-2xl p-4"
                    style={{
                      background: intg.status === "connected" ? "rgba(0,212,168,0.06)" : "rgba(255,255,255,0.03)",
                      border: `1px solid ${intg.status === "connected" ? "rgba(0,212,168,0.25)" : "rgba(255,255,255,0.07)"}`,
                    }}>
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <span className="text-xl">{intg.logo}</span>
                        <span className="text-sm font-semibold text-white">{intg.name}</span>
                      </div>
                      {intg.status === "connected" ? (
                        <span className="text-[10px] px-2 py-1 rounded-full font-bold" style={{ background: "rgba(0,212,168,0.2)", color: "#00d4a8", border: "1px solid rgba(0,212,168,0.4)" }}>
                          ✅ CONNECTED
                        </span>
                      ) : (
                        <span className="text-[10px] px-2 py-1 rounded-full font-bold" style={{ background: "rgba(255,255,255,0.06)", color: "#6b7280", border: "1px solid rgba(255,255,255,0.1)" }}>
                          + CONNECT
                        </span>
                      )}
                    </div>
                    {intg.lastSync && (
                      <div className="text-xs text-teal-400 mb-2">↻ Last sync: {intg.lastSync}</div>
                    )}
                    <div className="flex flex-wrap gap-1.5">
                      {intg.features.map(f => (
                        <span key={f} className="text-[10px] px-2 py-0.5 rounded-full"
                          style={{ background: "rgba(255,255,255,0.06)", color: intg.status === "connected" ? "#94a3b8" : "#4b5563" }}>
                          {f}
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Payroll */}
            <div>
              <div className="flex items-center gap-2 mb-3">
                <span className="text-base">💼</span>
                <div className="text-sm font-bold text-white">Payroll — Labor Cost Auto-Sync</div>
                <div className="ml-auto text-xs text-gray-500">Labor pulls each pay period</div>
              </div>
              <div className="grid sm:grid-cols-2 gap-3">
                {PAYROLL_INTEGRATIONS.map((intg, i) => (
                  <div key={i} className="rounded-2xl p-4"
                    style={{
                      background: intg.status === "connected" ? "rgba(0,212,168,0.06)" : intg.status === "always_on" ? "rgba(129,140,248,0.06)" : "rgba(255,255,255,0.03)",
                      border: `1px solid ${intg.status === "connected" ? "rgba(0,212,168,0.25)" : intg.status === "always_on" ? "rgba(129,140,248,0.25)" : "rgba(255,255,255,0.07)"}`,
                    }}>
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <span className="text-xl">{intg.logo}</span>
                        <span className="text-sm font-semibold text-white">{intg.name}</span>
                      </div>
                      {intg.status === "connected" ? (
                        <span className="text-[10px] px-2 py-1 rounded-full font-bold" style={{ background: "rgba(0,212,168,0.2)", color: "#00d4a8", border: "1px solid rgba(0,212,168,0.4)" }}>
                          ✅ CONNECTED
                        </span>
                      ) : intg.status === "always_on" ? (
                        <span className="text-[10px] px-2 py-1 rounded-full font-bold" style={{ background: "rgba(129,140,248,0.2)", color: "#818cf8", border: "1px solid rgba(129,140,248,0.4)" }}>
                          ✅ ALWAYS ON
                        </span>
                      ) : (
                        <span className="text-[10px] px-2 py-1 rounded-full font-bold" style={{ background: "rgba(255,255,255,0.06)", color: "#6b7280", border: "1px solid rgba(255,255,255,0.1)" }}>
                          + CONNECT
                        </span>
                      )}
                    </div>
                    {intg.lastSync && (
                      <div className="text-xs mb-2" style={{ color: intg.status === "always_on" ? "#818cf8" : "#00d4a8" }}>
                        ↻ {intg.lastSync}
                      </div>
                    )}
                    <div className="flex flex-wrap gap-1.5">
                      {intg.features.map(f => (
                        <span key={f} className="text-[10px] px-2 py-0.5 rounded-full"
                          style={{ background: "rgba(255,255,255,0.06)", color: intg.status !== "available" ? "#94a3b8" : "#4b5563" }}>
                          {f}
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Data flow explainer */}
            <div className="rounded-2xl p-5" style={{ background: "rgba(0,212,168,0.04)", border: "1px solid rgba(0,212,168,0.15)" }}>
              <div className="text-xs text-teal-400 uppercase tracking-wider mb-3">How It Works — Zero Manual Entry</div>
              <div className="grid sm:grid-cols-4 gap-3 text-center text-xs">
                {[
                  { icon: "🖥", label: "POS fires", sub: "Sales pull nightly" },
                  { icon: "💼", label: "Payroll syncs", sub: "Every pay period" },
                  { icon: "🧾", label: "Invoice scanned", sub: "AI OCR in seconds" },
                  { icon: "📊", label: "P&L ready", sub: "Auto-calculated" },
                ].map((step, i) => (
                  <div key={i} className="flex flex-col items-center gap-2 p-3 rounded-xl" style={{ background: "rgba(0,0,0,0.2)" }}>
                    <span className="text-2xl">{step.icon}</span>
                    <div>
                      <div className="font-semibold text-white">{step.label}</div>
                      <div className="text-gray-500 text-[10px] mt-0.5">{step.sub}</div>
                    </div>
                    {i < 3 && <div className="hidden sm:block absolute right-0 top-1/2 text-gray-700">→</div>}
                  </div>
                ))}
              </div>
              <div className="mt-3 text-center text-xs text-gray-500">
                Connect once · CashCall handles everything else automatically · No spreadsheets · No double-entry
              </div>
            </div>
          </div>
        )}

        {/* ─── P&L ─── */}
        {tab === "pl" && (
          <div className="space-y-4">
            <div className="rounded-2xl p-5" style={{ background: "linear-gradient(135deg, #0f172a, #060b18)", border: "1px solid rgba(0,212,168,0.15)" }}>
              <div className="flex items-center justify-between mb-4">
                <div>
                  <div className="text-xs text-gray-400 uppercase tracking-wider">Weekly P&L — Auto-Generated</div>
                  <div className="text-sm text-gray-300 mt-0.5">Oct 7–13 · Tampa Bay Demo</div>
                </div>
                <div className="text-xs px-3 py-1.5 rounded-full font-semibold"
                  style={{ background: "rgba(0,212,168,0.15)", color: "#00d4a8", border: "1px solid rgba(0,212,168,0.3)" }}>
                  ⚡ Auto-Calculated
                </div>
              </div>

              {[
                { label: "Gross Sales", value: TOTAL_SALES, pctOf: null, color: "#00d4a8", bold: true },
                { label: "  Food Cost", value: TOTAL_FOOD, pctOf: TOTAL_SALES, color: FOOD_PCT > 30 ? "#ef4444" : "#f59e0b" },
                { label: "  Labor Cost", value: TOTAL_LABOR, pctOf: TOTAL_SALES, color: LABOR_PCT > 30 ? "#ef4444" : "#f59e0b" },
                { label: "Prime Cost", value: TOTAL_FOOD + TOTAL_LABOR, pctOf: TOTAL_SALES, color: PRIME_COST_PCT > 60 ? "#ef4444" : "#00d4a8", bold: true },
                { label: "  Infrastructure", value: INFRA, pctOf: TOTAL_SALES, color: "#94a3b8" },
                { label: "Net Profit", value: NET_PROFIT, pctOf: TOTAL_SALES, color: "#818cf8", bold: true },
              ].map((row, i) => (
                <div key={i} className="flex justify-between items-center py-2.5 border-b"
                  style={{ borderColor: "rgba(255,255,255,0.05)" }}>
                  <span className={`text-sm ${row.bold ? "font-bold text-white" : "text-gray-400"}`}>{row.label}</span>
                  <div className="flex items-center gap-4">
                    {row.pctOf && (
                      <span className="text-xs tabular-nums" style={{ color: row.color + "cc" }}>
                        {(row.value / row.pctOf * 100).toFixed(1)}%
                      </span>
                    )}
                    <span className="text-sm font-semibold tabular-nums" style={{ color: row.color, fontFamily: "var(--font-space)" }}>
                      {fmt(row.value)}
                    </span>
                  </div>
                </div>
              ))}
            </div>

            <div className="rounded-2xl p-4 text-center" style={{ background: "rgba(129,140,248,0.06)", border: "1px solid rgba(129,140,248,0.2)" }}>
              <div className="text-xs text-indigo-400 uppercase tracking-wider mb-1">Data Sources — All Automated</div>
              <div className="flex flex-wrap justify-center gap-2 mt-2">
                {["📸 AI Sales Scan", "🧾 Invoice OCR", "💰 Payroll CSV", "📊 Fixed Infra Schedule"].map(s => (
                  <span key={s} className="text-xs px-2 py-1 rounded-lg" style={{ background: "rgba(255,255,255,0.06)", color: "#94a3b8" }}>{s}</span>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Upgrade prompt */}
      <div className="fixed bottom-0 left-0 right-0 p-4 border-t"
        style={{ background: "rgba(6,11,24,0.98)", borderColor: "rgba(0,212,168,0.2)", backdropFilter: "blur(12px)" }}>
        <div className="max-w-2xl mx-auto flex items-center justify-between gap-4">
          <div className="text-sm text-gray-300">
            <span className="font-semibold text-white">Ready to secure your own restaurant's data?</span>
            <span className="text-gray-400"> · 30-day free trial · Your encryption key, generated now</span>
          </div>
          <Link href="/trial"
            className="flex-shrink-0 px-5 py-2.5 rounded-xl text-sm font-bold whitespace-nowrap"
            style={{ background: "#00d4a8", color: "#060b18" }}>
            🔐 Request Your Portal
          </Link>
        </div>
      </div>

      {/* Bottom padding for upgrade bar */}
      <div className="h-20" />
    </div>
  );
}
