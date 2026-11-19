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
  month: string;
  food_pct_target: number;
  labor_pct_target: number;
  infra_pct_target: number;
  prime_cost_target: number;
  sales_target: number;
}

interface TopItem { name: string; total: number; }

interface LocationBleed {
  location_id: string;
  location_name: string;
  location_code: string;
  pl: PLSummary;
  budget: Budget | null;
  food_target: number;
  labor_target: number;
  infra_target: number;
  food_bleed_pct: number;
  food_bleed_usd: number;
  labor_bleed_pct: number;
  labor_bleed_usd: number;
  infra_bleed_pct: number;
  infra_bleed_usd: number;
  total_bleed_usd: number;
  top_items: TopItem[];
}

const DEFAULT_TARGETS = { food: 28, labor: 30, infra: 19 };

const fmtUSD = (n: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n);
const pct = (v: number) => v.toFixed(1) + "%";

function bleedColor(bleed: number) {
  if (bleed > 5)  return { text: "#f87171", bg: "rgba(239,68,68,0.1)",   bar: "#ef4444", label: "CRITICAL" };
  if (bleed > 2)  return { text: "#fb923c", bg: "rgba(249,115,22,0.1)",  bar: "#f97316", label: "WARNING"  };
  if (bleed > 0)  return { text: "#fbbf24", bg: "rgba(251,191,36,0.08)", bar: "#f59e0b", label: "SLIGHT"   };
  return           { text: "#00d4a8", bg: "rgba(0,212,168,0.08)",         bar: "#00d4a8", label: "ON TRACK"  };
}

function BleedBar({
  label, actual, target, bleedUsd, icon
}: { label: string; actual: number; target: number; bleedUsd: number; icon: string }) {
  const bleedPct = actual - target;
  const c = bleedColor(bleedPct);
  const isOver = bleedPct > 0;
  const barW = Math.min(Math.max(actual, 0), 100);
  const targetX = Math.min(target, 100);

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-xs">
        <span className="text-gray-400 flex items-center gap-1">
          <span>{icon}</span>
          <span className="font-medium">{label}</span>
          <span className="text-gray-600 ml-1">target {pct(target)}</span>
        </span>
        <div className="flex items-center gap-2">
          <span className="font-bold tabular-nums" style={{ color: isOver ? c.text : "#00d4a8" }}>
            {pct(actual)}
          </span>
          {isOver && (
            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full" style={{ background: c.bg, color: c.text }}>
              +{pct(bleedPct)} · {fmtUSD(bleedUsd)}
            </span>
          )}
          {!isOver && (
            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full" style={{ background: "rgba(0,212,168,0.1)", color: "#00d4a8" }}>
              ✓ {pct(Math.abs(bleedPct))} under
            </span>
          )}
        </div>
      </div>
      {/* Progress bar with target marker */}
      <div className="relative h-2 rounded-full overflow-visible" style={{ background: "rgba(255,255,255,0.06)" }}>
        <div className="h-full rounded-full transition-all" style={{ width: `${barW}%`, background: isOver ? c.bar : "#00d4a8" }} />
        {/* target marker */}
        <div className="absolute top-1/2 -translate-y-1/2 w-0.5 h-4 rounded-full"
          style={{ left: `${targetX}%`, background: "rgba(255,255,255,0.35)" }} />
      </div>
    </div>
  );
}

export default async function BleedingPage({ searchParams }: Props) {
  const supabase = await createClient();
  const { month: monthParam } = await searchParams;

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data: profile } = await supabase.from("user_profiles").select("role,username,location_id").eq("user_id", user.id).single();
  if (!profile) redirect("/onboarding");
  if (profile.role !== "owner") redirect("/login");

  const month = validateMonth(monthParam);
  const monthLabel = new Date(month + "T00:00:00").toLocaleDateString("en-US", { month: "long", year: "numeric" });

  // 1. Fetch all user locations
  const { data: locations } = await supabase
    .from("locations")
    .select("id,code,name,state")
    .eq("app", "cashcall")
    .eq("user_id", user.id)
    .order("name");

  const locs = locations ?? [];

  // 2. Fetch PL summaries and budgets in parallel
  const [plList, budgetRows] = await Promise.all([
    Promise.all(locs.map(loc => fetchPLSummary(supabase, loc.id, month))),
    supabase
      .from("location_budgets")
      .select("location_id,month,food_pct_target,labor_pct_target,infra_pct_target,prime_cost_target,sales_target")
      .in("location_id", locs.map(l => l.id))
      .eq("month", month)
      .then(r => r.data ?? []) as Promise<Budget[]>,
  ]);

  const budgetByLoc = Object.fromEntries((budgetRows).map(b => [b.location_id, b]));

  // 3. Fetch top spending items cross-location for the month (food deliveries → line items)
  // First get all food delivery IDs for this month across all locations
  const monthEnd = month.replace("-01", "") + "-" +
    new Date(parseInt(month.slice(0,4)), parseInt(month.slice(5,7)), 0).getDate();

  const { data: deliveries } = await supabase
    .from("food_deliveries")
    .select("id,location_id")
    .in("location_id", locs.map(l => l.id))
    .gte("delivery_date", month)
    .lte("delivery_date", monthEnd);

  const deliveryIds = (deliveries ?? []).map(d => d.id);
  const deliveryLocMap: Record<string, string> = Object.fromEntries(
    (deliveries ?? []).map(d => [d.id, d.location_id])
  );

  // Fetch line items for those deliveries
  const { data: lineItems } = deliveryIds.length > 0
    ? await supabase
        .from("invoice_line_items")
        .select("food_delivery_id,name,total")
        .in("food_delivery_id", deliveryIds.slice(0, 500))
    : { data: [] };

  // Group top items per location
  const itemsByLoc: Record<string, Record<string, number>> = {};
  for (const li of (lineItems ?? [])) {
    const locId = deliveryLocMap[li.food_delivery_id ?? ""];
    if (!locId) continue;
    if (!itemsByLoc[locId]) itemsByLoc[locId] = {};
    const key = (li.name ?? "").toLowerCase().trim();
    if (key) itemsByLoc[locId][key] = (itemsByLoc[locId][key] ?? 0) + (Number(li.total) || 0);
  }

  // 4. Build per-location bleed data
  const bleedData: LocationBleed[] = locs.map((loc, i) => {
    const pl = plList[i];
    const budget = budgetByLoc[loc.id] ?? null;
    const food_target = budget?.food_pct_target  ?? DEFAULT_TARGETS.food;
    const labor_target = budget?.labor_pct_target ?? DEFAULT_TARGETS.labor;
    const infra_target = budget?.infra_pct_target ?? DEFAULT_TARGETS.infra;
    const ns = pl.total_net_sales;

    const food_bleed_pct  = pl.food_pct  - food_target;
    const labor_bleed_pct = pl.labor_pct - labor_target;
    const infra_bleed_pct = pl.infra_pct - infra_target;

    const food_bleed_usd  = Math.max(0, food_bleed_pct  / 100 * ns);
    const labor_bleed_usd = Math.max(0, labor_bleed_pct / 100 * ns);
    const infra_bleed_usd = Math.max(0, infra_bleed_pct / 100 * ns);
    const total_bleed_usd = food_bleed_usd + labor_bleed_usd + infra_bleed_usd;

    // Top 5 items by spend for this location
    const itemMap = itemsByLoc[loc.id] ?? {};
    const top_items: TopItem[] = Object.entries(itemMap)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 5)
      .map(([name, total]) => ({ name, total }));

    return {
      location_id:   loc.id,
      location_name: loc.name,
      location_code: loc.code,
      pl,
      budget,
      food_target,
      labor_target,
      infra_target,
      food_bleed_pct,
      food_bleed_usd,
      labor_bleed_pct,
      labor_bleed_usd,
      infra_bleed_pct,
      infra_bleed_usd,
      total_bleed_usd,
      top_items,
    };
  });

  // 5. Sort: locations with data first, then by bleed amount desc
  const withData    = bleedData.filter(b => b.pl.total_net_sales > 0).sort((a, b) => b.total_bleed_usd - a.total_bleed_usd);
  const withoutData = bleedData.filter(b => b.pl.total_net_sales === 0);
  const sorted = [...withData, ...withoutData];

  // 6. Totals
  const totalBleedUsd = withData.reduce((s, b) => s + b.total_bleed_usd, 0);
  const bleedingCount = withData.filter(b => b.total_bleed_usd > 0).length;
  const worstFood     = withData.reduce((best, b) => b.food_bleed_pct  > best.food_bleed_pct  ? b : best, withData[0]);
  const worstLabor    = withData.reduce((best, b) => b.labor_bleed_pct > best.labor_bleed_pct ? b : best, withData[0]);

  // Top items across all locations
  const globalItems: Record<string, number> = {};
  for (const li of (lineItems ?? [])) {
    const key = (li.name ?? "").toLowerCase().trim();
    if (key) globalItems[key] = (globalItems[key] ?? 0) + (Number(li.total) || 0);
  }
  const topGlobalItems = Object.entries(globalItems)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 8)
    .map(([name, total]) => ({ name, total }));

  return (
    <div className="min-h-screen pb-10" style={{ background: "#060b18" }}>
      <CashCallHeader username={profile.username} role={profile.role} />

      <main className="max-w-6xl mx-auto px-4 py-6 space-y-6">

        {/* ── Page header ── */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Link href="/dashboard"
                className="text-[11px] text-gray-500 hover:text-gray-300 transition-colors">
                ← Dashboard
              </Link>
            </div>
            <h1 className="text-2xl font-bold text-white flex items-center gap-2">
              🩸 Cost Bleeding Dashboard
            </h1>
            <p className="text-sm text-gray-500 mt-0.5">{monthLabel} — where margin is leaking vs your budget targets</p>
          </div>
          <MonthPicker current={month} />
        </div>

        {/* ── Hero: total bleed ── */}
        {withData.length > 0 && (
          <div className="rounded-3xl p-6 sm:p-8 relative overflow-hidden"
            style={{
              background: totalBleedUsd > 0
                ? "linear-gradient(135deg, #1a0505 0%, #1f0808 60%, #2a0d0d 100%)"
                : "linear-gradient(135deg, #021a12 0%, #041f15 60%, #062a1a 100%)",
              border: `1px solid ${totalBleedUsd > 0 ? "rgba(239,68,68,0.25)" : "rgba(0,212,168,0.2)"}`,
            }}>
            {/* Watermark */}
            <div className="absolute right-6 top-1/2 -translate-y-1/2 opacity-[0.03] pointer-events-none text-9xl font-black select-none"
              style={{ color: totalBleedUsd > 0 ? "#ef4444" : "#00d4a8" }}>
              {totalBleedUsd > 0 ? "🩸" : "✓"}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
              {/* Main bleed number */}
              <div className="sm:col-span-1">
                <p className="text-[10px] font-bold tracking-[0.25em] uppercase mb-1"
                  style={{ color: totalBleedUsd > 0 ? "#f87171" : "#00d4a8" }}>
                  {totalBleedUsd > 0 ? "⚠ Total Monthly Bleed" : "✓ All Locations On Target"}
                </p>
                <p className="text-5xl font-black tabular-nums leading-none"
                  style={{ color: totalBleedUsd > 0 ? "#f87171" : "#00d4a8" }}>
                  {fmtUSD(totalBleedUsd)}
                </p>
                <p className="text-xs text-gray-500 mt-2">
                  {bleedingCount > 0
                    ? `${bleedingCount} of ${withData.length} active location${withData.length > 1 ? "s" : ""} over budget`
                    : `All ${withData.length} active location${withData.length > 1 ? "s" : ""} within target`}
                </p>
              </div>

              {/* Breakdown */}
              <div className="sm:col-span-2 grid grid-cols-3 gap-4">
                {[
                  {
                    icon: "🍔", label: "Food Bleed",
                    amount: withData.reduce((s, b) => s + b.food_bleed_usd, 0),
                    worst: worstFood ? `${worstFood.location_name.split(" ")[0]} +${worstFood.food_bleed_pct.toFixed(1)}%` : null,
                    color: "#f97316",
                  },
                  {
                    icon: "👥", label: "Labor Bleed",
                    amount: withData.reduce((s, b) => s + b.labor_bleed_usd, 0),
                    worst: worstLabor ? `${worstLabor.location_name.split(" ")[0]} +${worstLabor.labor_bleed_pct.toFixed(1)}%` : null,
                    color: "#3b82f6",
                  },
                  {
                    icon: "🏢", label: "Infra Bleed",
                    amount: withData.reduce((s, b) => s + b.infra_bleed_usd, 0),
                    worst: null,
                    color: "#8b5cf6",
                  },
                ].map(({ icon, label, amount, worst, color }) => (
                  <div key={label} className="rounded-2xl p-4"
                    style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}>
                    <p className="text-[10px] text-gray-500 uppercase tracking-wide mb-1">{icon} {label}</p>
                    <p className="text-xl font-bold tabular-nums" style={{ color: amount > 0 ? color : "#00d4a8" }}>
                      {amount > 0 ? fmtUSD(amount) : "✓ OK"}
                    </p>
                    {worst && amount > 0 && (
                      <p className="text-[10px] text-gray-600 mt-1 truncate">{worst}</p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ── Per-location cards ── */}
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-bold tracking-[0.2em] uppercase text-gray-500">Location Breakdown</span>
            <div className="flex-1 h-px" style={{ background: "rgba(255,255,255,0.06)" }} />
            {!budgetRows.length && (
              <Link href="/budget"
                className="text-[10px] text-amber-400 hover:text-amber-300 transition-colors">
                ⚠ Set budgets →
              </Link>
            )}
          </div>

          {sorted.map(b => {
            const hasData = b.pl.total_net_sales > 0;
            const pc = bleedColor(b.total_bleed_usd > 0 ? Math.max(b.food_bleed_pct, b.labor_bleed_pct, b.infra_bleed_pct) : -1);
            const hasBudget = !!b.budget;

            return (
              <div key={b.location_id} className="rounded-2xl overflow-hidden"
                style={{ background: "rgba(255,255,255,0.025)", border: "1px solid rgba(255,255,255,0.07)" }}>
                {/* Card header */}
                <div className="px-5 py-4 flex items-center justify-between gap-3 flex-wrap"
                  style={{ background: "rgba(255,255,255,0.02)", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-xl flex items-center justify-center text-xs font-bold"
                      style={{ background: "rgba(255,255,255,0.06)", color: "#94a3b8" }}>
                      {b.location_code?.slice(0, 2).toUpperCase() || b.location_name.slice(0, 2).toUpperCase()}
                    </div>
                    <div>
                      <p className="font-bold text-white text-sm">{b.location_name}</p>
                      {hasData ? (
                        <p className="text-[10px] text-gray-500">
                          Net Sales: {fmtUSD(b.pl.total_net_sales)}
                          {!hasBudget && " · "}{!hasBudget && <span className="text-amber-500">using default targets</span>}
                        </p>
                      ) : (
                        <p className="text-[10px] text-gray-600">No data this month</p>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    {hasData && b.total_bleed_usd > 0 && (
                      <div className="text-right">
                        <p className="text-[10px] text-gray-500 uppercase tracking-wide">Total Bleed</p>
                        <p className="text-lg font-black tabular-nums" style={{ color: "#f87171" }}>
                          {fmtUSD(b.total_bleed_usd)}
                        </p>
                      </div>
                    )}
                    {hasData && b.total_bleed_usd === 0 && (
                      <span className="text-[10px] font-bold px-2 py-1 rounded-full"
                        style={{ background: "rgba(0,212,168,0.1)", color: "#00d4a8" }}>
                        ✓ ON TARGET
                      </span>
                    )}
                    <Link href={`/location/${b.location_id}/food`}
                      className="text-[11px] font-semibold rounded-lg px-3 py-1.5 transition-all hover:opacity-80"
                      style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)", color: "#94a3b8" }}>
                      View P&L →
                    </Link>
                  </div>
                </div>

                {/* Card body */}
                {hasData ? (
                  <div className="px-5 py-4 grid grid-cols-1 md:grid-cols-2 gap-6">
                    {/* Left: cost bars */}
                    <div className="space-y-3">
                      <BleedBar label="Food Cost"  icon="🍔" actual={b.pl.food_pct}  target={b.food_target}  bleedUsd={b.food_bleed_usd}  />
                      <BleedBar label="Labor Cost" icon="👥" actual={b.pl.labor_pct} target={b.labor_target} bleedUsd={b.labor_bleed_usd} />
                      <BleedBar label="Infra Cost" icon="🏢" actual={b.pl.infra_pct} target={b.infra_target} bleedUsd={b.infra_bleed_usd} />

                      {/* Prime cost summary */}
                      <div className="pt-2 mt-1" style={{ borderTop: "1px solid rgba(255,255,255,0.05)" }}>
                        <div className="flex items-center justify-between text-xs">
                          <span className="text-gray-500">Prime Cost (Food + Labor)</span>
                          <span className="font-bold tabular-nums"
                            style={{ color: (b.pl.food_pct + b.pl.labor_pct) > 58 ? "#f87171" : "#00d4a8" }}>
                            {pct(b.pl.food_pct + b.pl.labor_pct)}
                            <span className="text-gray-600 font-normal ml-1">/ target {pct(b.food_target + b.labor_target)}</span>
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Right: top spending items */}
                    <div>
                      {b.top_items.length > 0 ? (
                        <div>
                          <p className="text-[10px] font-bold uppercase tracking-wide text-gray-500 mb-2">
                            🧾 Top Food Spend This Month
                          </p>
                          <div className="space-y-1.5">
                            {b.top_items.map((item, idx) => {
                              const maxTotal = b.top_items[0]?.total ?? 1;
                              const barW = (item.total / maxTotal) * 100;
                              return (
                                <div key={idx} className="flex items-center gap-2">
                                  <span className="text-[10px] text-gray-600 w-3 tabular-nums">{idx + 1}.</span>
                                  <div className="flex-1 relative">
                                    <div className="absolute inset-0 rounded" style={{ background: "rgba(249,115,22,0.08)", width: `${barW}%` }} />
                                    <div className="relative flex items-center justify-between px-2 py-0.5">
                                      <span className="text-[11px] text-gray-300 capitalize truncate max-w-[140px]">{item.name}</span>
                                      <span className="text-[11px] font-semibold tabular-nums text-orange-400 ml-2 flex-shrink-0">{fmtUSD(item.total)}</span>
                                    </div>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      ) : (
                        <div className="flex items-center justify-center h-full">
                          <p className="text-xs text-gray-600 text-center">
                            No invoice line items scanned yet.<br />
                            <Link href={`/location/${b.location_id}/food`} className="text-blue-400 hover:text-blue-300">
                              Upload invoices →
                            </Link>
                          </p>
                        </div>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="px-5 py-4 text-xs text-gray-600">
                    No sales data entered for {monthLabel}. &nbsp;
                    <Link href={`/location/${b.location_id}/sales`} className="text-blue-400 hover:text-blue-300">Enter sales →</Link>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* ── Global top items ── */}
        {topGlobalItems.length > 0 && (
          <div className="rounded-2xl overflow-hidden"
            style={{ background: "rgba(255,255,255,0.025)", border: "1px solid rgba(255,255,255,0.07)" }}>
            <div className="px-5 py-3 flex items-center gap-2"
              style={{ background: "rgba(255,255,255,0.02)", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
              <span className="text-[10px] font-bold tracking-[0.2em] uppercase text-gray-500">🧾 Top 8 Ingredients by Spend — All Locations</span>
            </div>
            <div className="px-5 py-4 grid grid-cols-2 sm:grid-cols-4 gap-3">
              {topGlobalItems.map((item, idx) => (
                <div key={idx} className="rounded-xl px-3 py-2"
                  style={{ background: "rgba(249,115,22,0.06)", border: "1px solid rgba(249,115,22,0.12)" }}>
                  <p className="text-[10px] text-gray-600 tabular-nums">#{idx + 1}</p>
                  <p className="text-xs text-gray-200 capitalize font-medium truncate mt-0.5">{item.name}</p>
                  <p className="text-sm font-bold text-orange-400 tabular-nums mt-0.5">{fmtUSD(item.total)}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── No budget warning ── */}
        {!budgetRows.length && withData.length > 0 && (
          <div className="rounded-2xl p-5 flex items-start gap-4"
            style={{ background: "rgba(251,191,36,0.06)", border: "1px solid rgba(251,191,36,0.2)" }}>
            <span className="text-2xl mt-0.5">⚠️</span>
            <div>
              <p className="text-sm font-semibold text-amber-300">No budgets set for {monthLabel}</p>
              <p className="text-xs text-gray-500 mt-1">
                Bleed amounts above use default targets (Food 28%, Labor 30%, Infra 19%).
                Set custom targets in the <Link href="/budget" className="text-amber-400 hover:text-amber-300 underline">Budget page</Link> for more accurate analysis.
              </p>
            </div>
          </div>
        )}

      </main>
    </div>
  );
}
