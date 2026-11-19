import { redirect } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { createClient } from "@/lib/supabase/server";
import { fetchPLSummary, fetchWeeklyPulse } from "@/lib/fetchPL";
import type { PLSummary } from "@/lib/types";
import { validateMonth } from "@/lib/validateParams";
import CashCallHeader from "@/app/components/CashCallHeader";
import MonthPicker from "@/app/components/MonthPicker";
import PrintPDFButton from "@/app/components/PrintPDFButton";
import PrintHeader from "@/app/components/PrintHeader";
import InstallPrompt from "@/app/components/InstallPrompt";
import ImportDataWidget from "@/app/components/ImportDataWidget";
import { LocationWeeklyPanel } from "@/app/components/WeeklyPulseSection";
import PriceAlertsWidget from "@/app/dashboard/PriceAlertsWidget";

interface Props { searchParams: Promise<{ month?: string }>; }

const fmtUSD = (n: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n);
const pct = (v: number) => v.toFixed(1) + "%";

function primeCostColor(pc: number) {
  if (pc > 65) return { bg: "rgba(239,68,68,0.1)", text: "#f87171", bar: "#ef4444", label: "CRITICAL" };
  if (pc > 58) return { bg: "rgba(249,115,22,0.1)", text: "#fb923c", bar: "#f97316", label: "WARNING" };
  return { bg: "rgba(0,212,168,0.08)", text: "#00d4a8", bar: "#00d4a8", label: "HEALTHY" };
}

function StatCard({ label, value, sub, accent = "#00d4a8" }: { label: string; value: string; sub?: string; accent?: string }) {
  return (
    <div className="rounded-2xl p-5 relative overflow-hidden"
      style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}>
      <div className="absolute top-0 left-0 w-1 h-full rounded-l-2xl" style={{ background: accent }} />
      <p className="text-xs font-medium text-gray-400 uppercase tracking-wide pl-2">{label}</p>
      <p className="text-2xl font-bold mt-1 pl-2" style={{ color: accent }}>{value}</p>
      {sub && <p className="text-xs text-gray-500 mt-0.5 pl-2">{sub}</p>}
    </div>
  );
}

const MARGIN_TARGETS = { food: 28, labor: 30, infra: 19, gross: 22, prime: 58 };

function CostBar({ label, value, target, color }: { label: string; value: number; target: number; color: string }) {
  const over = value > target;
  const barColor = over ? "#ef4444" : color;
  const textColor = over ? "#dc2626" : "#6b7280";
  return (
    <div className="flex items-center gap-2">
      <span className="text-[10px] text-gray-400 w-8">{label}</span>
      <div className="flex-1 relative bg-white/10 rounded-full h-1.5 overflow-hidden">
        <div className="h-full rounded-full transition-all" style={{ width: `${Math.min(value, 100)}%`, background: barColor }} />
      </div>
      <span className="text-[10px] font-semibold w-14 text-right tabular-nums" style={{ color: textColor }}>
        {value.toFixed(1)}%{over ? " ⚠" : ""}
      </span>
    </div>
  );
}

function MarginBadge({ value, target, invert = false }: { value: number; target: number; invert?: boolean }) {
  const bad = invert ? value > target : value < target;
  return (
    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full"
      style={{ background: bad ? "rgba(239,68,68,0.15)" : "rgba(0,212,168,0.15)", color: bad ? "#f87171" : "#00d4a8" }}>
      {bad ? "⚠" : "✓"} {value.toFixed(1)}%
    </span>
  );
}

// Month-over-month delta chip — shown inline next to a metric
function MoM({ diff, unit = "pp", invertColor = false }: { diff: number; unit?: string; invertColor?: boolean }) {
  if (diff === 0) return null;
  const up = diff > 0;
  // invertColor=true means up is bad (used for costs)
  const isGood = invertColor ? !up : up;
  return (
    <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-md ml-1"
      style={{ background: isGood ? "rgba(0,212,168,0.12)" : "rgba(239,68,68,0.12)", color: isGood ? "#00d4a8" : "#f87171" }}>
      {up ? "▲" : "▼"} {Math.abs(diff).toFixed(1)}{unit}
    </span>
  );
}

function QuickEntryButtons({ locationId, month }: { locationId: string; month: string }) {
  return (
    <div className="mt-3 pt-3 flex gap-1.5 flex-wrap" style={{ borderTop: "1px solid rgba(255,255,255,0.06)" }}>
      {[
        { href: `/location/${locationId}/sales?month=${month}`,   label: "Sales",   primary: true  },
        { href: `/location/${locationId}/food?month=${month}`,    label: "Food",    primary: false },
        { href: `/location/${locationId}/payroll?month=${month}`, label: "Payroll", primary: false },
        { href: `/location/${locationId}/staff?month=${month}`,   label: "Labor",   primary: false },
      ].map(a => (
        <Link key={a.href} href={a.href}
          className="text-[11px] font-semibold rounded-lg px-2.5 py-1 transition-all hover:opacity-80"
          style={a.primary
            ? { background: "#00d4a8", color: "#060b18" }
            : { background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.1)", color: "#94a3b8" }
          }>
          {a.label}
        </Link>
      ))}
    </div>
  );
}

function LocationCard({ pl, prevPl, month }: { pl: PLSummary; prevPl?: PLSummary; month: string }) {
  const margin = pl.total_net_sales > 0 ? (pl.net_profit / pl.total_net_sales) * 100 : 0;
  const isProfit = pl.net_profit >= 0;
  const hasData = pl.total_net_sales > 0;
  const primeCost = pl.food_pct + pl.labor_pct;
  const pc = primeCostColor(primeCost);

  const breaches = hasData ? [
    pl.food_pct > MARGIN_TARGETS.food,
    pl.labor_pct > MARGIN_TARGETS.labor,
    pl.infra_pct > MARGIN_TARGETS.infra,
    margin < MARGIN_TARGETS.gross,
  ].filter(Boolean).length : 0;

  const alertColor = breaches === 0 ? "#22c55e" : breaches <= 1 ? "#f59e0b" : "#ef4444";

  // MoM deltas
  const hasPrev = !!prevPl && prevPl.total_net_sales > 0 && hasData;
  const salesDeltaPct = hasPrev ? ((pl.total_net_sales - prevPl!.total_net_sales) / prevPl!.total_net_sales) * 100 : 0;
  const primeDelta   = hasPrev ? primeCost - (prevPl!.food_pct + prevPl!.labor_pct) : 0;
  const foodDelta    = hasPrev ? pl.food_pct  - prevPl!.food_pct  : 0;
  const laborDelta   = hasPrev ? pl.labor_pct - prevPl!.labor_pct : 0;

  // Health label
  const healthLabel = !hasData ? null : breaches === 0 ? "✓ Healthy" : breaches === 1 ? "⚠ 1 Breach" : `✗ ${breaches} Breaches`;
  const healthColor = breaches === 0 ? "#22c55e" : breaches <= 1 ? "#f59e0b" : "#ef4444";
  const healthBg    = breaches === 0 ? "rgba(34,197,94,0.1)" : breaches <= 1 ? "rgba(245,158,11,0.1)" : "rgba(239,68,68,0.1)";

  return (
    <div className="rounded-2xl overflow-hidden"
      style={{
        background: "linear-gradient(135deg, #0a0f1e, #0f172a)",
        border: `1px solid ${hasData && breaches > 0 ? "rgba(239,68,68,0.3)" : "rgba(255,255,255,0.07)"}`,
        boxShadow: hasData && breaches > 1 ? "0 0 20px rgba(239,68,68,0.08)" : "none",
      }}>
      {/* Health bar — colored top strip */}
      <div className="h-1.5 w-full" style={{ background: hasData ? alertColor : "rgba(255,255,255,0.05)" }} />
      <div className="p-5">
        {/* Header — clickable to location overview */}
        <Link href={`/location/${pl.location_id}?month=${month}`} className="group block mb-3">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <h3 className="font-bold text-white group-hover:text-teal-400 transition-colors text-sm leading-tight truncate">{pl.location_name}</h3>
              <p className="text-xs text-gray-500 mt-0.5">{pl.location_code} · {pl.location_state}</p>
            </div>
            <div className="flex flex-col items-end gap-1 flex-shrink-0">
              {hasData && (
                <span className="text-xs font-bold px-2 py-0.5 rounded-full"
                  style={{
                    background: isProfit ? "rgba(0,212,168,0.15)" : "rgba(239,68,68,0.15)",
                    color: isProfit ? "#00d4a8" : "#f87171"
                  }}>
                  {isProfit ? "▲" : "▼"} {pct(Math.abs(margin))}
                </span>
              )}
              {healthLabel && (
                <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full"
                  style={{ background: healthBg, color: healthColor, border: `1px solid ${healthColor}30` }}>
                  {healthLabel}
                </span>
              )}
            </div>
          </div>
        </Link>

        {/* No-data prompt */}
        {!hasData && (
          <div className="rounded-lg px-3 py-2 mb-2 text-[11px] flex items-center gap-2"
            style={{ background: "rgba(0,212,168,0.06)", border: "1px solid rgba(0,212,168,0.15)" }}>
            <span style={{ color: "#00d4a8" }}>⚡</span>
            <span className="text-gray-400">Enter sales below to see your <strong className="text-white">prime cost</strong> instantly</span>
          </div>
        )}

        {/* Prime Cost — the #1 number */}
        {hasData ? (
          <div className="rounded-xl p-3 mb-3" style={{ background: pc.bg, border: `1px solid ${pc.bar}30` }}>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[9px] font-bold uppercase tracking-widest" style={{ color: pc.text }}>Prime Cost</p>
                <div className="flex items-baseline gap-1">
                  <p className="text-2xl font-black tabular-nums" style={{ color: pc.text }}>{primeCost.toFixed(1)}%</p>
                  {hasPrev && <MoM diff={primeDelta} unit="pp" invertColor />}
                </div>
                <p className="text-[9px] mt-0.5" style={{ color: pc.text, opacity: 0.8 }}>
                  Food {pl.food_pct.toFixed(1)}%{hasPrev && foodDelta !== 0 ? ` (${foodDelta > 0 ? "+" : ""}${foodDelta.toFixed(1)}pp)` : ""}
                  {" + "}
                  Labor {pl.labor_pct.toFixed(1)}%{hasPrev && laborDelta !== 0 ? ` (${laborDelta > 0 ? "+" : ""}${laborDelta.toFixed(1)}pp)` : ""}
                </p>
              </div>
              <span className="text-[10px] font-black px-2 py-1 rounded-lg"
                style={{ background: pc.bar, color: pc.label === "HEALTHY" ? "#060b18" : "white" }}>
                {pc.label}
              </span>
            </div>
          </div>
        ) : (
          <div className="rounded-xl p-4 text-center mb-3" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}>
            <p className="text-xs text-gray-600">No data this month</p>
          </div>
        )}

        {hasData && (
          <>
            <div className="grid grid-cols-2 gap-2 mb-3">
              <div className="rounded-lg p-2" style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.06)" }}>
                <p className="text-[10px] text-gray-500">Net Sales</p>
                <p className="text-sm font-bold text-white">{fmtUSD(pl.total_net_sales)}</p>
                {hasPrev && <MoM diff={salesDeltaPct} unit="%" />}
              </div>
              <div className="rounded-lg p-2" style={{
                background: isProfit ? "rgba(0,212,168,0.08)" : "rgba(239,68,68,0.08)",
                border: `1px solid ${isProfit ? "rgba(0,212,168,0.2)" : "rgba(239,68,68,0.2)"}`
              }}>
                <p className="text-[10px] text-gray-500">Net Profit</p>
                <p className="text-sm font-bold" style={{ color: isProfit ? "#00d4a8" : "#f87171" }}>
                  {fmtUSD(pl.net_profit)}
                </p>
              </div>
            </div>
            <div className="space-y-1.5">
              <CostBar label="Food"  value={pl.food_pct}  target={MARGIN_TARGETS.food}  color="#d97706" />
              <CostBar label="Labor" value={pl.labor_pct} target={MARGIN_TARGETS.labor} color="#3b82f6" />
              <CostBar label="Infra" value={pl.infra_pct} target={MARGIN_TARGETS.infra} color="#8b5cf6" />
            </div>
          </>
        )}
        <QuickEntryButtons locationId={pl.location_id} month={month} />
      </div>
    </div>
  );
}

export default async function DashboardPage({ searchParams }: Props) {
  const supabase = await createClient();
  const { month: monthParam } = await searchParams;

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data: profile } = await supabase.from("user_profiles").select("role,username,location_id").eq("user_id", user.id).single();
  if (!profile) redirect("/onboarding");
  if (profile.role !== "owner") redirect("/login");

  const now = new Date();
  const month = validateMonth(monthParam);
  const monthLabel = new Date(month + "T00:00:00").toLocaleDateString("en-US", { month: "long", year: "numeric" });

  // user_id filter + RLS ensures each client sees only their own locations
  const { data: locations } = await supabase.from("locations").select("id,code,name,state")
    .eq("app", "cashcall").eq("user_id", user.id).order("name");
  const plList: PLSummary[] = await Promise.all(
    (locations ?? []).map(loc => fetchPLSummary(supabase, loc.id, month))
  );

  // Previous month for MoM comparison
  const [yr, mo] = month.split("-").map(Number);
  const prevDate = new Date(yr, mo - 2, 1);
  const prevMonth = `${prevDate.getFullYear()}-${String(prevDate.getMonth() + 1).padStart(2, "0")}-01`;
  const prevPlList: PLSummary[] = await Promise.all(
    (locations ?? []).map(loc => fetchPLSummary(supabase, loc.id, prevMonth))
  );

  // Weekly pulse — only for locations that have sales data this month
  const weeklyData = await Promise.all(
    plList.map(pl =>
      pl.total_net_sales > 0
        ? fetchWeeklyPulse(supabase, pl.location_id, month, pl)
        : Promise.resolve([])
    )
  );

  const total = plList.reduce((acc, p) => ({
    net_sales: acc.net_sales + p.total_net_sales,
    food:      acc.food      + p.food_cost,
    labor:     acc.labor     + p.total_labor,
    expenses:  acc.expenses  + p.total_expenses,
    profit:    acc.profit    + p.net_profit,
  }), { net_sales: 0, food: 0, labor: 0, expenses: 0, profit: 0 });

  const activeLocations = plList.filter(p => p.total_net_sales > 0).length;
  const profitableCount = plList.filter(p => p.net_profit > 0).length;
  const overallMargin = total.net_sales > 0 ? (total.profit / total.net_sales) * 100 : 0;
  const sorted = [...plList].sort((a, b) => b.net_profit - a.net_profit);
  // Use UTC hour as an approximation; client-side JS will correct it for users in non-UTC timezones
  const hour = now.getUTCHours();
  const greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";

  // Prime Cost metrics
  const overallPrimeCost = total.net_sales > 0 ? ((total.food + total.labor) / total.net_sales) * 100 : 0;
  const overallFoodPct   = total.net_sales > 0 ? (total.food  / total.net_sales) * 100 : 0;
  const overallLaborPct  = total.net_sales > 0 ? (total.labor / total.net_sales) * 100 : 0;
  const pc = primeCostColor(overallPrimeCost);
  // Locations bleeding (prime cost > 58%)
  const bleeding = plList.filter(p => p.total_net_sales > 0 && (p.food_pct + p.labor_pct) > MARGIN_TARGETS.prime)
    .sort((a, b) => (b.food_pct + b.labor_pct) - (a.food_pct + a.labor_pct));

  return (
    <div className="min-h-screen pb-6" style={{ background: "#060b18" }}>
      <CashCallHeader username={profile.username} role={profile.role} />

      <main className="max-w-7xl mx-auto px-4 py-6 sm:py-8 space-y-5 sm:space-y-7" id="print-area">
        <PrintHeader title="Owner Dashboard — All Locations" subtitle={monthLabel} />

        {/* Welcome banner */}
        <div className="rounded-3xl px-7 py-6 relative overflow-hidden"
          style={{ background: "linear-gradient(135deg, #060b18 0%, #0a1628 60%, #0d1f3c 100%)" }}>
          {/* CashCall watermark */}
          <div className="absolute right-6 top-1/2 -translate-y-1/2 opacity-[0.04] pointer-events-none hidden sm:block text-9xl font-bold" style={{ color: "#00d4a8", fontFamily: "var(--font-space)" }}>
            ⚡
          </div>
          {/* Row 1: Greeting + Month picker */}
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 mb-4">
            <div className="min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-[10px] font-bold tracking-[0.3em] uppercase" style={{ color: "#00d4a8" }}>⚡ CashCall</span>
                <span className="text-white/20 text-xs">·</span>
                <span className="text-[10px] text-gray-500 tracking-wide">Owner Dashboard · All Locations</span>
              </div>
              <h1 className="text-2xl sm:text-3xl font-bold text-white" style={{ fontFamily: "var(--font-space)" }}>{greeting}, {profile.username ? profile.username.charAt(0).toUpperCase() + profile.username.slice(1) : "there"}</h1>
              <p className="text-gray-400 text-sm mt-1 flex flex-wrap items-center gap-x-2">
                <span>{monthLabel}</span>
                <span className="text-white/20">·</span>
                <span>{activeLocations > 0 ? `${activeLocations} of ${plList.length} location${plList.length !== 1 ? "s" : ""} reporting` : plList.length > 0 ? "No data yet this month" : "No locations set up"}</span>
              </p>
            </div>
            <div className="flex-shrink-0">
              <MonthPicker current={month} />
            </div>
          </div>
          {/* Row 2: Action buttons — horizontally scrollable, always visible */}
          <div className="flex items-center gap-2 overflow-x-auto pb-1 no-print" style={{ scrollbarWidth: "none" }}>
            <Link href="/analytics"
              className="flex items-center gap-1.5 text-sm font-medium rounded-xl px-3 py-2 transition-colors whitespace-nowrap flex-shrink-0"
              style={{ background: "rgba(99,102,241,0.15)", border: "1px solid rgba(99,102,241,0.35)", color: "#a5b4fc" }}>
              <span>📊</span><span>Analytics</span>
            </Link>
            <div className="flex-shrink-0">
              <ImportDataWidget locations={(locations ?? []).map(l => ({ id: l.id, name: l.name, code: l.code }))} />
            </div>
            <div className="flex-shrink-0">
              <PrintPDFButton title={`CashCall-Dashboard-${month}`} />
            </div>
            <Link href="/taxdocs"
              className="text-sm font-medium rounded-xl px-3 py-2 transition-colors whitespace-nowrap flex-shrink-0"
              style={{ background: "rgba(232,184,75,0.15)", border: "1px solid rgba(232,184,75,0.35)", color: "#fbbf24" }}>
              📋 Tax Docs
            </Link>
            <Link href="/budget"
              className="text-sm font-medium rounded-xl px-3 py-2 transition-colors whitespace-nowrap flex-shrink-0"
              style={{ background: "rgba(34,197,94,0.15)", border: "1px solid rgba(34,197,94,0.35)", color: "#4ade80" }}>
              📊 Budget
            </Link>
            <Link href="/dashboard/bleeding"
              className="text-sm font-medium rounded-xl px-3 py-2 transition-colors whitespace-nowrap flex-shrink-0"
              style={{ background: "rgba(239,68,68,0.12)", border: "1px solid rgba(239,68,68,0.3)", color: "#f87171" }}>
              🩸 Bleeding
            </Link>
            <Link href="/dashboard/forecast"
              className="text-sm font-medium rounded-xl px-3 py-2 transition-colors whitespace-nowrap flex-shrink-0"
              style={{ background: "rgba(99,102,241,0.12)", border: "1px solid rgba(99,102,241,0.3)", color: "#a5b4fc" }}>
              📈 Forecast
            </Link>
            <Link href="/settings/integrations"
              className="text-sm font-medium rounded-xl px-3 py-2 transition-colors whitespace-nowrap flex-shrink-0"
              style={{ background: "rgba(139,92,246,0.15)", border: "1px solid rgba(139,92,246,0.35)", color: "#c4b5fd" }}>
              🔌 Integrations
            </Link>
            <Link href="/settings/team"
              className="text-sm font-medium rounded-xl px-3 py-2 transition-colors whitespace-nowrap flex-shrink-0"
              style={{ background: "rgba(96,165,250,0.1)", border: "1px solid rgba(96,165,250,0.25)", color: "#93c5fd" }}>
              👥 Team
            </Link>
            <Link href="/settings/security"
              className="text-sm font-medium rounded-xl px-3 py-2 transition-colors whitespace-nowrap flex-shrink-0"
              style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.12)", color: "#9ca3af" }}>
              🔐 Security
            </Link>
            {["hbk19403@gmail.com", "testcashcall@cashcall.io"].includes(user.email ?? "") && (
              <Link href="/admin/clients"
                className="text-sm font-medium rounded-xl px-3 py-2 transition-colors whitespace-nowrap flex-shrink-0"
                style={{ background: "rgba(239,68,68,0.15)", border: "1px solid rgba(239,68,68,0.4)", color: "#f87171" }}>
                🛡 Admin
              </Link>
            )}
          </div>
        </div>

        {/* ── PRIME COST COMMAND CENTER ── */}
        <div className="rounded-2xl overflow-hidden" style={{ background: "linear-gradient(135deg, #0a0f1e, #0f1a2e)", border: "1px solid rgba(0,212,168,0.15)" }}>
          <div className="px-6 pt-5 pb-2 flex items-center gap-2">
            <span className="text-[10px] font-bold tracking-[0.25em] uppercase" style={{ color: "#00d4a8" }}>⚡ Prime Cost Command</span>
            <span className="text-[10px] text-gray-600">— Food + Labor · Target ≤58%</span>
          </div>
          <div className="px-6 pb-5 grid grid-cols-1 sm:grid-cols-3 gap-4">
            {/* Big prime cost number */}
            <div className="sm:col-span-1 flex flex-col justify-center rounded-xl p-4" style={{ background: pc.bg }}>
              <p className="text-[10px] font-bold uppercase tracking-widest mb-1" style={{ color: pc.text }}>All Locations</p>
              <p className="text-5xl font-black tabular-nums leading-none" style={{ color: pc.text }}>
                {total.net_sales > 0 ? overallPrimeCost.toFixed(1) : "—"}<span className="text-2xl">%</span>
              </p>
              <p className="text-xs mt-2" style={{ color: pc.text }}>
                Food {overallFoodPct.toFixed(1)}% &nbsp;+&nbsp; Labor {overallLaborPct.toFixed(1)}%
              </p>
              <div className="mt-3 h-2 rounded-full overflow-hidden" style={{ background: "rgba(0,0,0,0.08)" }}>
                <div className="h-full rounded-full" style={{ width: `${Math.min(overallPrimeCost, 100)}%`, background: pc.bar }} />
              </div>
              <div className="flex justify-between text-[9px] mt-1" style={{ color: pc.text }}>
                <span>0%</span><span className="font-bold">58% target</span><span>100%</span>
              </div>
            </div>

            {/* Cash flow summary */}
            <div className="rounded-xl p-4 flex flex-col gap-3" style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}>
              <p className="text-[10px] font-bold tracking-[0.2em] uppercase text-gray-400">Cash Flow This Month</p>
              <div>
                <p className="text-3xl font-black tabular-nums" style={{ color: total.profit >= 0 ? "#22c55e" : "#ef4444" }}>
                  {total.net_sales > 0 ? fmtUSD(total.profit) : "—"}
                </p>
                <p className="text-xs text-gray-500 mt-0.5">
                  {total.net_sales > 0
                    ? `${pct(overallMargin)} net margin across ${activeLocations} location${activeLocations !== 1 ? "s" : ""}`
                    : "No sales data yet"}
                </p>
              </div>
              <div className="flex gap-3 text-xs">
                <div>
                  <p className="text-gray-600 text-[10px]">Revenue</p>
                  <p className="text-white font-bold">{fmtUSD(total.net_sales)}</p>
                </div>
                <div>
                  <p className="text-gray-600 text-[10px]">Expenses</p>
                  <p className="font-bold" style={{ color: "#f97316" }}>{fmtUSD(total.expenses)}</p>
                </div>
                <div>
                  <p className="text-gray-600 text-[10px]">Profitable</p>
                  <p className="font-bold" style={{ color: profitableCount > 0 ? "#22c55e" : "#ef4444" }}>
                    {profitableCount}/{plList.length}
                  </p>
                </div>
              </div>
            </div>

            {/* Bleed detector */}
            <div className="rounded-xl p-4" style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}>
              <p className="text-[10px] font-bold tracking-[0.2em] uppercase text-gray-400 mb-3">
                {bleeding.length === 0 ? "🟢 All Locations In Range" : `🔴 ${bleeding.length} Location${bleeding.length > 1 ? "s" : ""} Bleeding`}
              </p>
              {bleeding.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-16">
                  <p className="text-2xl">✓</p>
                  <p className="text-xs text-gray-500 mt-1">Prime cost within target</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {bleeding.slice(0, 3).map(p => {
                    const pc2 = p.food_pct + p.labor_pct;
                    const c = primeCostColor(pc2);
                    return (
                      <Link key={p.location_id} href={`/location/${p.location_id}?month=${month}`}
                        className="flex items-center gap-2 rounded-lg px-2 py-1.5 hover:opacity-80 transition-opacity"
                        style={{ background: "rgba(239,68,68,0.1)" }}>
                        <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: c.bar }} />
                        <span className="text-xs text-white font-medium flex-1 truncate">{p.location_name}</span>
                        <span className="text-xs font-black tabular-nums" style={{ color: c.text === "#dc2626" ? "#f87171" : "#fb923c" }}>
                          {pc2.toFixed(1)}%
                        </span>
                        <span className="text-[9px] font-bold px-1.5 py-0.5 rounded" style={{ background: c.bar, color: "white" }}>
                          +{(pc2 - MARGIN_TARGETS.prime).toFixed(1)}
                        </span>
                      </Link>
                    );
                  })}
                  <Link href={`/dashboard/bleeding?month=${month}`}
                    className="block text-center text-[10px] font-bold mt-1 py-1.5 rounded-lg transition-all hover:opacity-80"
                    style={{ background: "rgba(239,68,68,0.12)", color: "#f87171", border: "1px solid rgba(239,68,68,0.2)" }}>
                    🩸 Full Cost Bleeding Report →
                  </Link>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* KPI strip */}
        <div className="rounded-2xl p-6" style={{ background: "linear-gradient(135deg, #0a0f1e, #0f172a)", border: "1px solid rgba(255,255,255,0.06)" }}>
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
            <StatCard label="Total Net Sales" value={fmtUSD(total.net_sales)} sub={`${activeLocations} active`} accent="#00d4a8" />
            <StatCard label="Food Cost" value={fmtUSD(total.food)} sub={total.net_sales > 0 ? pct((total.food/total.net_sales)*100) : "—"} accent="#d97706" />
            <StatCard label="Labor Cost" value={fmtUSD(total.labor)} sub={total.net_sales > 0 ? pct((total.labor/total.net_sales)*100) : "—"} accent="#3b82f6" />
            <StatCard label="Total Expenses" value={fmtUSD(total.expenses)} accent="#8b5cf6" />
            <StatCard label="Net Profit" value={fmtUSD(total.profit)} sub={pct(overallMargin) + " margin"} accent={total.profit >= 0 ? "#22c55e" : "#ef4444"} />
          </div>
          <div className="mt-5 pt-4 border-t border-white/10">
            <div className="flex items-center justify-between mb-1.5 text-xs text-gray-400">
              <span>{profitableCount}/{plList.length} locations profitable</span>
              <span>Overall margin: <strong style={{ color: overallMargin >= 0 ? "#22c55e" : "#ef4444" }}>{pct(overallMargin)}</strong></span>
            </div>
            <div className="w-full rounded-full h-1.5" style={{ background: "rgba(255,255,255,0.08)" }}>
              <div className="h-full rounded-full transition-all"
                style={{ width: `${(profitableCount / Math.max(plList.length, 1)) * 100}%`, background: "linear-gradient(90deg, #00d4a8, #818cf8)" }} />
            </div>
          </div>
        </div>

        {/* ── WEEKLY PULSE ── */}
        {plList.some(p => p.total_net_sales > 0) && (
          <section>
            <div className="flex items-center gap-3 mb-4">
              <span className="text-[10px] font-bold tracking-[0.25em] uppercase" style={{ color: "#00d4a8" }}>📅 Weekly Pulse</span>
              <span className="text-[10px] text-gray-600">— This month, week by week · Food &amp; Labor vs Benchmarks</span>
            </div>
            <div className="space-y-4">
              {sorted.map((pl, i) => (
                weeklyData[plList.indexOf(pl)].length > 0 && (
                  <LocationWeeklyPanel
                    key={pl.location_id}
                    pl={pl}
                    weeks={weeklyData[plList.indexOf(pl)]}
                  />
                )
              ))}
            </div>
          </section>
        )}

        {/* Location cards — or empty state */}
        {sorted.length === 0 ? (
          <div className="rounded-2xl overflow-hidden" style={{ background: "rgba(255,255,255,0.02)", border: "1px dashed rgba(255,255,255,0.1)" }}>
            <div className="px-6 pt-8 pb-4 text-center">
              <div className="w-16 h-16 mx-auto rounded-2xl flex items-center justify-center text-3xl mb-4"
                style={{ background: "rgba(0,212,168,0.08)", border: "1px solid rgba(0,212,168,0.2)" }}>🏪</div>
              <h3 className="text-lg font-bold text-white">Add your first location to get started</h3>
              <p className="text-gray-400 text-sm mt-1 max-w-md mx-auto">CashCall tracks prime cost, food invoices, labor, and daily sales — all in one place. Takes 2 minutes to set up.</p>
              <Link href="/settings/locations/new"
                className="inline-block mt-4 px-8 py-3 rounded-xl text-sm font-bold transition-all hover:opacity-90"
                style={{ background: "#00d4a8", color: "#060b18" }}>
                + Add Location
              </Link>
            </div>
            {/* What happens next steps */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-0 border-t" style={{ borderColor: "rgba(255,255,255,0.07)" }}>
              {[
                { icon: "📸", step: "1", title: "Scan food invoices", desc: "Photograph any invoice. AI reads vendor, category, and total in seconds." },
                { icon: "💰", step: "2", title: "Enter daily sales", desc: "Takes 30 seconds. Your prime cost % appears instantly." },
                { icon: "📊", step: "3", title: "See your numbers", desc: "Food %, labor %, net margin — all live and color-coded to targets." },
              ].map(s => (
                <div key={s.step} className="px-6 py-5 sm:border-l first:border-l-0" style={{ borderColor: "rgba(255,255,255,0.07)" }}>
                  <div className="text-2xl mb-2">{s.icon}</div>
                  <p className="text-[10px] font-bold tracking-widest uppercase mb-1" style={{ color: "#00d4a8" }}>Step {s.step}</p>
                  <p className="text-sm font-semibold text-white mb-1">{s.title}</p>
                  <p className="text-xs text-gray-500">{s.desc}</p>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-base font-bold text-white">All Locations — {monthLabel}</h2>
              <div className="flex items-center gap-3">
                <span className="text-xs text-gray-500">{sorted.length} locations · sorted by profit</span>
                <Link href="/settings/locations/new"
                  className="text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors"
                  style={{ background: "rgba(0,212,168,0.1)", border: "1px solid rgba(0,212,168,0.25)", color: "#00d4a8" }}>
                  + Add Location
                </Link>
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {sorted.map(pl => (
                <LocationCard
                  key={pl.location_id}
                  pl={pl}
                  prevPl={prevPlList.find(p => p.location_id === pl.location_id)}
                  month={month}
                />
              ))}
            </div>
          </div>
        )}

        {/* Price Spike Alerts — client-rendered, hidden when no data */}
        <PriceAlertsWidget month={month} />

        {/* Performance Leaderboard — only show when ≥2 locations have sales */}
        {sorted.filter(p => p.total_net_sales > 0).length >= 2 && (
          <div className="rounded-2xl overflow-hidden" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)" }}>
            <div className="px-5 py-4 flex items-center justify-between" style={{ borderBottom: "1px solid rgba(255,255,255,0.06)", background: "rgba(255,255,255,0.02)" }}>
              <h3 className="font-bold text-white">🏆 Location Rankings — {monthLabel}</h3>
              <span className="text-xs text-gray-500">sorted by prime cost</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead style={{ background: "rgba(255,255,255,0.02)" }}>
                  <tr>
                    {["#", "Location", "Revenue", "Food %", "Labor %", "Prime Cost", "Margin"].map(h => (
                      <th key={h} className="text-left px-4 py-2.5 text-gray-500 font-semibold uppercase tracking-wide" style={{ fontSize: "10px" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {[...sorted]
                    .filter(p => p.total_net_sales > 0)
                    .sort((a, b) => (a.food_pct + a.labor_pct) - (b.food_pct + b.labor_pct))
                    .map((p, i) => {
                      const primePct = p.food_pct + p.labor_pct;
                      const pcColor = primePct > 65 ? "#f87171" : primePct > 58 ? "#fb923c" : "#34d399";
                      const marginColor = p.net_profit_pct < 0 ? "#f87171" : p.net_profit_pct < 10 ? "#fb923c" : "#34d399";
                      const rank = i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : `#${i + 1}`;
                      return (
                        <tr key={p.location_id} className="border-t hover:bg-white/[0.02] transition-colors" style={{ borderColor: "rgba(255,255,255,0.05)" }}>
                          <td className="px-4 py-3 text-gray-400">{rank}</td>
                          <td className="px-4 py-3 font-semibold text-white">{p.location_name}</td>
                          <td className="px-4 py-3 text-gray-300 tabular-nums">${p.total_net_sales.toLocaleString(undefined, { maximumFractionDigits: 0 })}</td>
                          <td className="px-4 py-3 tabular-nums font-semibold" style={{ color: p.food_pct > 32 ? "#fb923c" : "#34d399" }}>{p.food_pct.toFixed(1)}%</td>
                          <td className="px-4 py-3 tabular-nums font-semibold" style={{ color: p.labor_pct > 35 ? "#fb923c" : "#34d399" }}>{p.labor_pct.toFixed(1)}%</td>
                          <td className="px-4 py-3 tabular-nums font-bold" style={{ color: pcColor }}>{primePct.toFixed(1)}%</td>
                          <td className="px-4 py-3 tabular-nums font-semibold" style={{ color: marginColor }}>{p.net_profit_pct.toFixed(1)}%</td>
                        </tr>
                      );
                    })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Summary table */}
        <div className="rounded-2xl overflow-hidden" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)" }}>
          <div className="px-5 py-4" style={{ borderBottom: "1px solid rgba(255,255,255,0.06)", background: "rgba(255,255,255,0.02)" }}>
            <h3 className="font-bold text-white">P&amp;L Summary — {monthLabel}</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead style={{ background: "rgba(255,255,255,0.03)" }}>
                <tr>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Location</th>
                  <th className="text-right px-3 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Net Sales</th>
                  <th className="text-right px-3 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Food %</th>
                  <th className="text-right px-3 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Labor %</th>
                  <th className="text-right px-3 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Expenses</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Net Profit</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Margin</th>
                </tr>
              </thead>
              <tbody>
                {sorted.map(pl => {
                  const m = pl.total_net_sales > 0 ? (pl.net_profit / pl.total_net_sales) * 100 : 0;
                  return (
                    <tr key={pl.location_id} className="border-t hover:bg-white/[0.02] transition-colors"
                      style={{ borderColor: "rgba(255,255,255,0.04)" }}>
                      <td className="px-4 py-3">
                        <Link href={`/location/${pl.location_id}?month=${month}`} className="font-medium text-white hover:text-teal-400 transition-colors">
                          {pl.location_name}
                        </Link>
                        <span className="ml-1.5 text-xs text-gray-600">{pl.location_state}</span>
                      </td>
                      <td className="px-3 py-3 text-right font-medium text-gray-300">{pl.total_net_sales > 0 ? fmtUSD(pl.total_net_sales) : <span className="text-gray-700">—</span>}</td>
                      <td className="px-3 py-3 text-right text-yellow-500 text-xs">{pl.total_net_sales > 0 ? pct(pl.food_pct) : "—"}</td>
                      <td className="px-3 py-3 text-right text-blue-400 text-xs">{pl.total_net_sales > 0 ? pct(pl.labor_pct) : "—"}</td>
                      <td className="px-3 py-3 text-right text-gray-500">{pl.total_net_sales > 0 ? fmtUSD(pl.total_expenses) : "—"}</td>
                      <td className={`px-4 py-3 text-right font-semibold ${pl.net_profit >= 0 ? "text-green-400" : "text-red-400"}`}>
                        {pl.total_net_sales > 0 ? fmtUSD(pl.net_profit) : "—"}
                      </td>
                      <td className={`px-4 py-3 text-right text-xs font-medium ${m >= 0 ? "text-green-400" : "text-red-400"}`}>
                        {pl.total_net_sales > 0 ? pct(m) : "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="font-bold text-white border-t" style={{ background: "rgba(0,212,168,0.08)", borderColor: "rgba(0,212,168,0.2)" }}>
                  <td className="px-4 py-3 text-sm" style={{ color: "#00d4a8" }}>TOTAL</td>
                  <td className="px-3 py-3 text-right">{fmtUSD(total.net_sales)}</td>
                  <td className="px-3 py-3 text-right text-yellow-400 text-xs">{total.net_sales > 0 ? pct((total.food/total.net_sales)*100) : "—"}</td>
                  <td className="px-3 py-3 text-right text-blue-400 text-xs">{total.net_sales > 0 ? pct((total.labor/total.net_sales)*100) : "—"}</td>
                  <td className="px-3 py-3 text-right text-gray-400">{fmtUSD(total.expenses)}</td>
                  <td className={`px-4 py-3 text-right ${total.profit >= 0 ? "text-green-400" : "text-red-400"}`}>{fmtUSD(total.profit)}</td>
                  <td className={`px-4 py-3 text-right text-xs ${overallMargin >= 0 ? "text-green-400" : "text-red-400"}`}>{pct(overallMargin)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      </main>
      <InstallPrompt />
    </div>
  );
}
