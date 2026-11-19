import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { fetchPLSummary } from "@/lib/fetchPL";
import { FOOD_CATEGORIES } from "@/lib/types";
import { validateMonth } from "@/lib/validateParams";
import Nav from "@/app/components/Nav";
import MonthPicker from "@/app/components/MonthPicker";
import PrintPDFButton from "@/app/components/PrintPDFButton";
import PrintHeader from "@/app/components/PrintHeader";
import MobileBottomNav from "@/app/components/MobileBottomNav";
import ExportLocationButton from "@/app/components/ExportLocationButton";

interface Props {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ month?: string }>;
}

const fmt = (n: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n);
const pct = (v: number) => v.toFixed(1) + "%";

function KPI({ label, value, sub, color }: { label: string; value: string; sub?: string; color?: string }) {
  return (
    <div className="rounded-xl p-4" style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)" }}>
      <p className="text-xs font-medium text-gray-400 uppercase tracking-wide">{label}</p>
      <p className={`mt-1 text-xl font-bold ${color ?? "text-white"}`}>{value}</p>
      {sub && <p className="mt-0.5 text-xs text-gray-500">{sub}</p>}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl overflow-hidden" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)" }}>
      <div className="px-5 py-3" style={{ background: "rgba(255,255,255,0.04)", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
        <h3 className="text-sm font-semibold text-gray-300">{title}</h3>
      </div>
      <div className="divide-y" style={{ borderColor: "rgba(255,255,255,0.05)" }}>{children}</div>
    </div>
  );
}

function Row({ label, value, sub, bold, indent }: { label: string; value: string; sub?: string; bold?: boolean; indent?: boolean }) {
  return (
    <div className={`flex items-center justify-between px-5 py-2.5 ${indent ? "pl-10" : ""}`}
      style={{ borderColor: "rgba(255,255,255,0.05)" }}>
      <span className={`text-sm ${bold ? "font-semibold text-white" : "text-gray-400"}`}>{label}</span>
      <div className="text-right">
        <span className={`text-sm ${bold ? "font-semibold text-white" : "text-gray-300"}`}>{value}</span>
        {sub && <span className="ml-2 text-xs text-gray-500">{sub}</span>}
      </div>
    </div>
  );
}

export default async function LocationPage({ params, searchParams }: Props) {
  const supabase = await createClient();
  const { id } = await params;
  const { month: monthParam } = await searchParams;

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("user_profiles").select("role,username,location_id,full_access").eq("user_id", user.id).single();
  if (!profile) redirect("/login");
  if (profile.role !== "owner" && profile.location_id !== id) redirect(`/location/${profile.location_id}`);

  // Ownership gate: verify this location belongs to the authenticated user (or is the manager's assigned location)
  let ownedLoc: { id: string; location_type?: string } | null = null;
  if (profile.role === "owner") {
    const { data } = await supabase
      .from("locations").select("id,location_type").eq("id", id).eq("user_id", user.id).maybeSingle();
    ownedLoc = data;
  } else {
    const { data } = await supabase
      .from("locations").select("id,location_type").eq("id", id).maybeSingle();
    ownedLoc = data;
  }
  if (!ownedLoc) notFound();
  const isBar = ownedLoc.location_type === "bar_restaurant";

  // Restricted manager = manager without the full_access flag
  const isManager = profile.role === "manager" && !profile.full_access;

  const month = validateMonth(monthParam);
  const now = new Date();
  const pl = await fetchPLSummary(supabase, id, month);
  if (!pl.location_name) notFound();

  const monthLabel = new Date(month + "T00:00:00").toLocaleDateString("en-US", { month: "long", year: "numeric" });

  return (
    <div className="min-h-screen" style={{ background: "#060b18" }}>
      <Nav username={profile.username} role={profile.role} />
      <main className="max-w-5xl mx-auto px-4 py-8 space-y-6" id="print-area">
        <PrintHeader title={`${pl.location_name} — P&L Summary`} subtitle={monthLabel} />

        {/* Header */}
        <div className="flex items-start justify-between no-print">
          <div>
            {profile.role === "owner" && <Link href="/dashboard" className="text-xs text-teal-300 hover:underline">← All locations</Link>}
            <h1 className="text-2xl font-bold font-serif text-white mt-1">
              {pl.location_name}
              <span className="ml-2 text-sm font-normal font-sans text-gray-400">{pl.location_code} · {pl.location_state}</span>
            </h1>
            <p className="text-sm text-gray-400">{monthLabel} P&amp;L</p>
          </div>
          <div className="flex items-center gap-3">
            <ExportLocationButton locationId={id} locationCode={pl.location_code} />
            <PrintPDFButton title={`${pl.location_name}-PL-${month}`} orientation="portrait" />
            <MonthPicker current={month} />
          </div>
        </div>

        {/* Quick actions */}
        <div className="rounded-2xl p-4 space-y-3" style={{ background: "rgba(0,212,168,0.04)", border: "1px solid rgba(0,212,168,0.15)" }}>
          <p className="text-[10px] font-bold tracking-[0.2em] uppercase" style={{ color: "#00d4a8" }}>⚡ Data Entry</p>
          <div className="flex gap-2 flex-wrap">
            {[
              { href: `/daily`,                    label: "📅 Daily Overview",     primary: true,  managerOk: true  },
              { href: `/location/${id}/sales`,     label: "📊 Enter Sales",        primary: false, managerOk: true  },
              { href: `/location/${id}/food`,       label: "🥩 Food Cost",           primary: false, managerOk: true  },
              { href: `/location/${id}/staff`,      label: "👥 Staff & Hours",       primary: false, managerOk: true  },
              { href: `/location/${id}/payroll`,    label: "💰 Payroll",             primary: false, managerOk: false },
              { href: `/location/${id}/costs?month=${month}`, label: "🏠 Fixed Costs", primary: false, managerOk: false },
            ].filter(a => !isManager || a.managerOk).map((a) => (
              <Link key={a.href} href={a.href}
                className="text-sm font-semibold rounded-xl px-4 py-2 transition-all hover:opacity-80"
                style={a.primary
                  ? { background: "#00d4a8", color: "#060b18" }
                  : { background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.12)", color: "#e2e8f0" }
                }>
                {a.label}
              </Link>
            ))}
          </div>
          {!isManager && (
            <div className="flex gap-2 flex-wrap pt-1 border-t border-white/5">
              {[
                { href: `/location/${id}/analytics`,        label: "📈 Analytics"   },
                { href: `/location/${id}/menu-engineering`, label: "🧮 Menu Engineering" },
                { href: `/location/${id}/budget`,           label: "📊 Budget & Forecast" },
                ...(isBar ? [{ href: `/location/${id}/liquor-inventory`, label: "🍹 Liquor Inventory" }] : []),
                { href: `/location/${id}/taxdocs`,          label: "📋 Tax Docs"    },
                { href: `/location/${id}/documents`,        label: "📁 Documents"   },
                { href: `/location/${id}/infrastructure`,   label: "🏗️ Infrastructure" },
              ].map(a => (
                <Link key={a.href} href={a.href}
                  className="text-xs rounded-lg px-3 py-1.5 transition-colors"
                  style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", color: "#94a3b8" }}>
                  {a.label}
                </Link>
              ))}
            </div>
          )}
        </div>

        {/* KPI row */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <KPI label="Net Sales" value={fmt(pl.total_net_sales)} sub={`Gross ${fmt(pl.total_gross_sales)}`} />
          <KPI label="Total Expenses" value={fmt(pl.total_expenses)} />
          <KPI label="Net Profit"
            value={fmt(pl.net_profit)}
            sub={pct(pl.net_profit_pct) + " margin"}
            color={pl.net_profit >= 0 ? "text-green-600" : "text-red-600"} />
          <KPI label="Food Cost %" value={pct(pl.food_pct)} sub={fmt(pl.food_cost)} />
        </div>

        <div className="grid md:grid-cols-2 gap-4">
          {/* Sales breakdown */}
          <Section title="Revenue">
            <Row label="Cash sales"     value={fmt(pl.cash_sales)} />
            <Row label="POS sales"      value={fmt(pl.pos_sales)} />
            <Row label="Catering"       value={fmt(pl.catering_sales)} />
            <Row label="Uber Eats (gross)" value={fmt(pl.uber_eats_gross)} />
            <Row label="Grubhub (gross)"   value={fmt(pl.grubhub_gross)} />
            <Row label="DoorDash (gross)"  value={fmt(pl.doordash_gross)} />
            <Row label="Aggregator commission (−30%)" value={`−${fmt(pl.aggregator_commission)}`} />
            <Row label="Cash tips"      value={fmt(pl.cash_tips)} />
            <Row label="Sales tax (est.)" value={`−${fmt(pl.sales_tax)}`} sub={pct((pl.sales_tax / (pl.total_net_sales||1))*100)} />
            <Row label="Net Sales" value={fmt(pl.total_net_sales)} bold />
          </Section>

          {/* Food cost breakdown */}
          <Section title={`Food Cost — ${pct(pl.food_pct)}`}>
            {FOOD_CATEGORIES.map((c) => (
              <Row key={c.key} label={`${c.icon} ${c.label}`}
                value={fmt(pl.food_by_category[c.key])}
                sub={pl.total_net_sales ? pct((pl.food_by_category[c.key] / pl.total_net_sales) * 100) : undefined}
                indent />
            ))}
            <Row label="Total food cost" value={fmt(pl.food_cost)} bold />
          </Section>

          {/* Labor breakdown */}
          <Section title={`Labor — ${pct(pl.labor_pct)}`}>
            <Row label="FOH hourly"   value={fmt(pl.foh_hourly_cost)}  indent />
            <Row label="FOH salaried" value={fmt(pl.foh_salaried_cost)} indent />
            <Row label="BOH (salary)" value={fmt(pl.boh_cost)}         indent />
            <Row label="Payroll taxes & benefits" value={fmt(pl.payroll_taxes)} indent />
            <Row label="Total labor" value={fmt(pl.total_labor)} bold />
          </Section>

          {/* Infrastructure */}
          <Section title={`Infrastructure — ${pct(pl.infra_pct)}`}>
            <Row label="Total infrastructure" value={fmt(pl.infrastructure)} bold />
          </Section>
        </div>

        {/* Bottom summary */}
        <Section title="P&L Summary">
          <Row label="Net sales"           value={fmt(pl.total_net_sales)} />
          <Row label="Food cost"           value={`−${fmt(pl.food_cost)}`}           sub={pct(pl.food_pct)} />
          <Row label="Aggregator commission" value={`−${fmt(pl.aggregator_commission)}`} />
          <Row label="Labor"               value={`−${fmt(pl.total_labor)}`}         sub={pct(pl.labor_pct)} />
          <Row label="Sales tax"           value={`−${fmt(pl.sales_tax)}`} />
          <Row label="Infrastructure"      value={`−${fmt(pl.infrastructure)}`}      sub={pct(pl.infra_pct)} />
          <Row label="Net Profit" value={fmt(pl.net_profit)}
            sub={pct(pl.net_profit_pct) + " margin"} bold />
        </Section>
      </main>

      {/* Mobile bottom nav — hidden on desktop */}
      <MobileBottomNav locationId={id} />
    </div>
  );
}
