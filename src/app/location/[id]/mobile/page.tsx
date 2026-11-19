"use client";
// Mobile Quick-Entry hub — CashCall
import { useEffect, useState, useMemo } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { useAuthGuard } from "@/lib/useAuthGuard";
import MobileBottomNav from "@/app/components/MobileBottomNav";

// ── helpers ──────────────────────────────────────────────────────────────────
const fmtUSD = (n: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n);
// `today` is computed inside effects to avoid stale values after midnight

// ── Quick-action config ───────────────────────────────────────────────────────
const ACTIONS = [
  { href: "sales",          icon: "💵", label: "Today's Sales",      desc: "Enter daily revenue",     priority: true  },
  { href: "food",           icon: "🥩", label: "Food Delivery",       desc: "Log invoice / receipt",   priority: true  },
  { href: "payroll",        icon: "💰", label: "Payroll",             desc: "Bi-monthly salary run",   priority: false },
  { href: "costs",          icon: "🏠", label: "Infra Costs",         desc: "Monthly fixed costs",     priority: false },
  { href: "infrastructure", icon: "🏗️", label: "Infra Details",       desc: "Contacts & contracts",    priority: false },
  { href: "staff",          icon: "👥", label: "Staff & Labor",        desc: "Manage team",             priority: false },
  { href: "analytics",      icon: "📈", label: "Analytics",           desc: "Financial insights",      priority: false },
  { href: "taxdocs",        icon: "📋", label: "Tax Documents",        desc: "Monthly tax records",     priority: false },
];

// ── KPI card ──────────────────────────────────────────────────────────────────
function KPICard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="flex flex-col gap-0.5 rounded-2xl p-3 text-center"
      style={{ background: "rgba(0,212,168,0.08)", border: "1px solid rgba(0,212,168,0.15)", backdropFilter: "blur(8px)" }}>
      <p className="text-caption tracking-widest uppercase" style={{ color: "rgba(0,212,168,0.7)" }}>{label}</p>
      <p className="text-kpi text-white leading-tight">{value}</p>
      {sub && <p className="text-caption" style={{ color: "rgba(255,255,255,0.45)" }}>{sub}</p>}
    </div>
  );
}

// ── Action tile (priority = larger, accent-bordered) ─────────────────────────
function ActionTile({ href, icon, label, desc, priority }: typeof ACTIONS[0] & { href: string }) {
  return (
    <Link href={href}
      className="flex flex-col gap-1 rounded-2xl p-4 active:scale-95 transition-transform"
      style={{
        background: priority ? "rgba(0,212,168,0.1)" : "rgba(255,255,255,0.05)",
        border: priority ? "1.5px solid rgba(0,212,168,0.35)" : "1.5px solid rgba(255,255,255,0.08)",
        boxShadow: "var(--shadow-1)",
        backdropFilter: "blur(4px)",
      }}>
      <span className="text-2xl leading-none">{icon}</span>
      <p className="text-body-md font-semibold leading-tight mt-1"
        style={{ color: priority ? "#00d4a8" : "rgba(255,255,255,0.9)" }}>{label}</p>
      <p className="text-caption" style={{ color: "rgba(255,255,255,0.5)" }}>{desc}</p>
    </Link>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────
export default function MobileHub() {
  const { id } = useParams<{ id: string }>();
  const supabase = useMemo(() => createClient(), []);
  const { ready } = useAuthGuard();

  const [locName, setLocName] = useState("");
  const [todaySales, setTodaySales] = useState<number | null>(null);
  const [mtdRevenue, setMtdRevenue] = useState(0);
  const [foodThisWeek, setFoodThisWeek] = useState(0);
  const [greeting, setGreeting] = useState("Good morning");
  const [dateStr, setDateStr] = useState("");

  useEffect(() => {
    const h = new Date().getHours();
    setGreeting(h >= 17 ? "Good evening" : h >= 12 ? "Good afternoon" : "Good morning");
    setDateStr(new Date().toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" }));
  }, []);

  useEffect(() => {
    if (!ready) return;
    (async () => {
      const today = new Date().toISOString().slice(0, 10);

      // Location name
      const { data: loc } = await supabase.from("locations").select("name").eq("id", id).single();
      setLocName(loc?.name ?? "");

      // Today's sales
      const { data: ts } = await supabase.from("daily_sales")
        .select("cash_sales,pos_sales,uber_eats_gross,grubhub_gross,doordash_gross,catering_sales,cash_tips")
        .eq("location_id", id).eq("sale_date", today).maybeSingle();
      if (ts) {
        const agg = (+(ts.uber_eats_gross||0) + +(ts.grubhub_gross||0) + +(ts.doordash_gross||0)) * 0.7;
        setTodaySales(+(ts.cash_sales||0) + +(ts.pos_sales||0) + agg + +(ts.catering_sales||0) + +(ts.cash_tips||0));
      }

      // MTD revenue
      const monthStart = today.slice(0, 7) + "-01";
      const { data: mtd } = await supabase.from("daily_sales")
        .select("cash_sales,pos_sales,uber_eats_gross,grubhub_gross,doordash_gross,catering_sales,cash_tips")
        .eq("location_id", id).gte("sale_date", monthStart);
      if (mtd) {
        setMtdRevenue(mtd.reduce((s, r) => {
          const agg = (+(r.uber_eats_gross||0) + +(r.grubhub_gross||0) + +(r.doordash_gross||0)) * 0.7;
          return s + +(r.cash_sales||0) + +(r.pos_sales||0) + agg + +(r.catering_sales||0) + +(r.cash_tips||0);
        }, 0));
      }

      // Food spend (7 days)
      const weekAgo = new Date(); weekAgo.setDate(weekAgo.getDate() - 7);
      const { data: food } = await supabase.from("food_deliveries")
        .select("amount").eq("location_id", id).gte("delivery_date", weekAgo.toISOString().slice(0, 10));
      setFoodThisWeek((food ?? []).reduce((s, r) => s + +r.amount, 0));
    })();
  }, [id, ready]);

  if (!ready) return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: "#060b18" }}>
      <div className="w-8 h-8 border-2 border-teal-400 border-t-transparent rounded-full animate-spin" />
    </div>
  );

  const baseHref = `/location/${id}`;

  return (
    <div className="min-h-screen pb-28" style={{ background: "#060b18" }}>

      {/* ── Hero header (Zone 1 — Immediate attention) ─────────────────────── */}
      <div className="sticky top-0 z-20 pb-4"
        style={{
          background: "linear-gradient(160deg, #060b18 0%, #0a1628 60%, #0d1f3c 100%)",
          paddingTop: "calc(env(safe-area-inset-top, 0px) + 48px)",
          boxShadow: "0 4px 24px rgba(0,0,0,0.30)",
        }}>

        {/* Top bar */}
        <div className="flex items-start justify-between px-5">
          <div>
            <p className="text-caption uppercase tracking-widest" style={{ color: "rgba(0,212,168,0.70)" }}>{greeting}</p>
            <h1 className="text-title-lg text-white mt-0.5">{locName || "Loading…"}</h1>
            <p className="text-body-sm mt-0.5" style={{ color: "rgba(255,255,255,0.45)" }}>{dateStr}</p>
          </div>
          <Link href="/dashboard"
            className="flex items-center justify-center w-10 h-10 rounded-xl mt-1"
            style={{ background: "rgba(0,212,168,0.08)", border: "1px solid rgba(0,212,168,0.25)" }}>
            <span className="text-base" style={{ color: "#00d4a8" }}>⬅</span>
          </Link>
        </div>

        {/* KPI strip — most important numbers at the top */}
        <div className="grid grid-cols-3 gap-2 px-4 mt-5">
          <KPICard
            label="Today"
            value={todaySales !== null ? fmtUSD(todaySales) : "—"}
            sub={todaySales === null ? "Not entered" : undefined}
          />
          <KPICard label="MTD Rev" value={fmtUSD(mtdRevenue)} />
          <KPICard label="Food 7d" value={fmtUSD(foodThisWeek)} />
        </div>

        {/* Critical alert — sales not entered */}
        {todaySales === null && (
          <Link href={`${baseHref}/sales`}
            className="mx-4 mt-3 flex items-center gap-3 rounded-2xl px-4 py-3"
            style={{
              background: "rgba(220,38,38,0.18)",
              border: "1px solid rgba(220,38,38,0.40)",
            }}>
            <span className="text-xl flex-shrink-0">⚠️</span>
            <div>
              <p className="text-body-sm font-bold text-white">Today's sales not entered yet</p>
              <p className="text-caption" style={{ color: "rgba(255,255,255,0.55)" }}>Tap to enter now →</p>
            </div>
          </Link>
        )}
      </div>

      {/* ── Quick actions (Zone 2 — Primary tasks) ─────────────────────────── */}
      <div className="px-4 pt-5">
        <p className="text-label px-1 mb-3" style={{ color: "rgba(255,255,255,0.4)" }}>Quick Actions</p>

        {/* Priority row — top 2 actions get full visual weight */}
        <div className="grid grid-cols-2 gap-3 mb-3">
          {ACTIONS.filter(a => a.priority).map(a => (
            <ActionTile key={a.href} {...a} href={`${baseHref}/${a.href}`} />
          ))}
        </div>

        {/* Secondary grid */}
        <div className="grid grid-cols-2 gap-3">
          {ACTIONS.filter(a => !a.priority).map(a => (
            <ActionTile key={a.href} {...a} href={`${baseHref}/${a.href}`} />
          ))}
        </div>
      </div>

      {/* ── Bottom nav ─────────────────────────────────────────────────────── */}
      <MobileBottomNav locationId={id} />
    </div>
  );
}
