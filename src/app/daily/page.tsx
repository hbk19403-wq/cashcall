"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import Nav from "@/app/components/Nav";
import { useAuthGuard } from "@/lib/useAuthGuard";

/* ── helpers ── */
const fmtCurrency = (n: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n);

const fmtCurrencyFull = (n: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);

function addDays(dateStr: string, days: number) {
  const d = new Date(dateStr + "T00:00:00");
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}
function todayLocal() { return new Date().toLocaleDateString("en-CA"); }
function fmtDate(dateStr: string) {
  return new Date(dateStr + "T00:00:00").toLocaleDateString("en-US", {
    weekday: "long", month: "short", day: "numeric",
  });
}
function fmtDateShort(dateStr: string) {
  return new Date(dateStr + "T00:00:00").toLocaleDateString("en-US", {
    weekday: "short", month: "short", day: "numeric",
  });
}

/* ── types ── */
interface SalesRow {
  location_id: string;
  cash_sales: number; pos_sales: number; liquor_sales: number;
  uber_eats_gross: number; grubhub_gross: number; doordash_gross: number;
  catering_sales: number;
  cash_tips: number;
}
interface Location { id: string; name: string; }

function calc(rows: SalesRow[]) {
  let dineIn = 0, delivery = 0, catering = 0, tips = 0;
  for (const r of rows) {
    dineIn    += (r.cash_sales ?? 0) + (r.pos_sales ?? 0) + (r.liquor_sales ?? 0);
    delivery  += (r.uber_eats_gross ?? 0) + (r.grubhub_gross ?? 0) + (r.doordash_gross ?? 0);
    catering  += r.catering_sales ?? 0;
    tips      += r.cash_tips ?? 0;
  }
  return { dineIn, delivery, catering, tips, total: dineIn + delivery + catering };
}

function pctChange(now: number, prev: number) {
  if (prev === 0) return null;
  return ((now - prev) / prev) * 100;
}

/* ── source card ── */
function SourceCard({
  icon, label, today, lastWeek,
}: { icon: string; label: string; today: number; lastWeek: number }) {
  const pct = pctChange(today, lastWeek);
  const up = pct === null ? null : pct >= 0;
  return (
    <div className="rounded-2xl border border-white/[0.08] p-5" style={{ background: "rgba(255,255,255,0.04)" }}>
      <div className="flex items-center gap-2 mb-3">
        <span className="text-xl">{icon}</span>
        <span className="text-xs font-bold tracking-widest text-gray-400 uppercase">{label}</span>
      </div>
      <p className="text-2xl font-extrabold text-white">{fmtCurrency(today)}</p>
      {pct !== null ? (
        <p className={`text-xs font-semibold mt-1 ${up ? "text-emerald-400" : "text-red-400"}`}>
          {up ? "▲" : "▼"} {Math.abs(pct).toFixed(1)}% vs last week
        </p>
      ) : (
        <p className="text-xs text-gray-600 mt-1">No data last week</p>
      )}
    </div>
  );
}

/* ── main ── */
export default function DailyDashboard() {
  const supabase = createClient();
  const auth = useAuthGuard();
  const [username, setUsername] = useState("");
  const [locations, setLocations] = useState<Location[]>([]);
  const [selectedLoc, setSelectedLoc] = useState("all");
  const [date, setDate] = useState(todayLocal());
  const [todayRows, setTodayRows] = useState<SalesRow[]>([]);
  const [prevRows, setPrevRows] = useState<SalesRow[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!auth.ready) return;
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data: profile } = await supabase.from("user_profiles")
        .select("username").eq("user_id", user.id).single();
      setUsername(profile?.username ?? "");
      let q = supabase.from("locations").select("id,name").order("name");
      if (auth.role !== "owner") q = q.eq("id", auth.locationId!);
      const { data: locs } = await q;
      setLocations(locs ?? []);
      if (auth.role !== "owner" && auth.locationId) setSelectedLoc(auth.locationId);
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auth.ready]);

  const load = useCallback(async () => {
    setLoading(true);
    const prevDate = addDays(date, -7);
    const COLS = "location_id,cash_sales,pos_sales,liquor_sales,uber_eats_gross,grubhub_gross,doordash_gross,catering_sales,cash_tips";
    const ids = selectedLoc === "all" ? locations.map(l => l.id) : [selectedLoc];

    const [{ data: t }, { data: p }] = await Promise.all([
      supabase.from("daily_sales").select(COLS).eq("sale_date", date).in("location_id", ids),
      supabase.from("daily_sales").select(COLS).eq("sale_date", prevDate).in("location_id", ids),
    ]);
    setTodayRows((t ?? []) as SalesRow[]);
    setPrevRows((p ?? []) as SalesRow[]);
    setLoading(false);
  }, [date, selectedLoc, locations, supabase]);

  useEffect(() => { if (auth.ready && locations.length >= 0) load(); }, [auth.ready, locations, load]);

  const now  = calc(todayRows);
  const prev = calc(prevRows);
  const prevDate = addDays(date, -7);
  const totalPct = pctChange(now.total, prev.total);
  const totalUp  = totalPct === null ? null : totalPct >= 0;

  if (!auth.ready) return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: "#060b18" }}>
      <div className="w-7 h-7 border-2 border-emerald-400 border-t-transparent rounded-full animate-spin" />
    </div>
  );

  return (
    <div className="min-h-screen pb-12" style={{ background: "linear-gradient(160deg,#060b18 0%,#0a1628 60%,#0d1f3c 100%)" }}>
      <Nav username={username} role={auth.role ?? ""} />

      <div className="max-w-3xl mx-auto px-4 pt-6 space-y-5">

        {/* ── back + title ── */}
        <div className="flex items-center justify-between">
          <Link href="/dashboard" className="text-xs text-emerald-400 hover:underline">← Dashboard</Link>
        </div>

        {/* ── date nav ── */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setDate(d => addDays(d, -1))}
              className="w-9 h-9 rounded-xl border border-white/10 bg-white/[0.04] text-gray-400 hover:text-white hover:bg-white/10 flex items-center justify-center text-lg transition-colors">
              ‹
            </button>
            <div>
              <p className="text-lg font-extrabold text-white">{fmtDate(date)}</p>
              <p className="text-xs text-gray-500">vs {fmtDateShort(prevDate)}</p>
            </div>
            <button
              onClick={() => setDate(d => addDays(d, 1))}
              disabled={date >= todayLocal()}
              className="w-9 h-9 rounded-xl border border-white/10 bg-white/[0.04] text-gray-400 hover:text-white hover:bg-white/10 flex items-center justify-center text-lg transition-colors disabled:opacity-20">
              ›
            </button>
          </div>

          {/* store picker */}
          {locations.length > 1 && (
            <select
              value={selectedLoc}
              onChange={e => setSelectedLoc(e.target.value)}
              className="bg-white/[0.06] border border-white/10 rounded-xl px-4 py-2 text-sm font-semibold text-white focus:outline-none focus:ring-2 focus:ring-emerald-500">
              <option value="all">All Stores</option>
              {locations.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
            </select>
          )}
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="w-7 h-7 border-2 border-emerald-400 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (
          <>
            {/* ── HERO: total sales ── */}
            <div className="rounded-3xl p-7 relative overflow-hidden"
              style={{ background: "linear-gradient(135deg, #003d30 0%, #005c47 50%, #007a5e 100%)", border: "1px solid rgba(0,184,150,0.3)" }}>
              {/* decorative glow */}
              <div className="absolute -top-8 -right-8 w-40 h-40 rounded-full opacity-20"
                style={{ background: "radial-gradient(circle, #00d4a8, transparent)" }} />

              <p className="text-xs font-bold tracking-widest text-emerald-300/70 uppercase mb-1">Total Sales</p>
              <p className="text-5xl font-extrabold text-white mb-3 leading-none">
                {fmtCurrencyFull(now.total)}
              </p>

              {totalPct !== null ? (
                <div className={`inline-flex items-center gap-2 rounded-full px-4 py-1.5 text-sm font-bold
                  ${totalUp
                    ? "bg-emerald-400/20 text-emerald-300 border border-emerald-400/30"
                    : "bg-red-400/20 text-red-300 border border-red-400/30"}`}>
                  <span>{totalUp ? "▲" : "▼"}</span>
                  <span>{Math.abs(totalPct).toFixed(1)}% vs last {fmtDateShort(prevDate)}</span>
                </div>
              ) : (
                <p className="text-sm text-emerald-300/50">No data for last week</p>
              )}

              {todayRows.length === 0 && (
                <p className="mt-3 text-xs text-emerald-300/40">
                  No sales entered for this date.{" "}
                  <Link href={`/location/${locations[0]?.id}/sales`} className="underline hover:text-emerald-300">
                    Enter sales →
                  </Link>
                </p>
              )}
            </div>

            {/* ── 4 source cards ── */}
            <div className="grid grid-cols-2 gap-3">
              <SourceCard icon="🍽️" label="Dine-In"       today={now.dineIn}    lastWeek={prev.dineIn} />
              <SourceCard icon="🛵" label="Delivery Apps" today={now.delivery}  lastWeek={prev.delivery} />
              <SourceCard icon="🍱" label="Catering"      today={now.catering}  lastWeek={prev.catering} />
              <SourceCard icon="💵" label="Cash Tips"     today={now.tips}      lastWeek={prev.tips} />
            </div>

            {/* ── simple breakdown table ── */}
            {now.total > 0 && (
              <div className="rounded-2xl overflow-hidden border border-white/[0.07]" style={{ background: "#0d1829" }}>
                <div className="px-5 py-3.5 border-b border-white/[0.07]">
                  <h2 className="text-sm font-bold text-white">Breakdown</h2>
                </div>
                <table className="w-full">
                  <thead>
                    <tr className="text-[10px] font-bold tracking-widest text-gray-500 uppercase border-b border-white/[0.05]"
                      style={{ background: "rgba(255,255,255,0.02)" }}>
                      <th className="py-2.5 text-left pl-5">Source</th>
                      <th className="py-2.5 text-right pr-4">Today</th>
                      <th className="py-2.5 text-right pr-5">vs Last Week</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[
                      { label: "🍽️ Dine-In",        today: now.dineIn,   last: prev.dineIn },
                      { label: "🛵 Delivery Apps",   today: now.delivery, last: prev.delivery },
                      { label: "🍱 Catering",        today: now.catering, last: prev.catering },
                      { label: "💵 Cash Tips",       today: now.tips,     last: prev.tips },
                    ].filter(r => r.today > 0 || r.last > 0).map(r => {
                      const pct = pctChange(r.today, r.last);
                      const up = pct === null ? null : pct >= 0;
                      return (
                        <tr key={r.label} className="border-b border-white/[0.04] hover:bg-white/[0.02]">
                          <td className="py-3 pl-5 text-sm text-gray-300 font-medium">{r.label}</td>
                          <td className="py-3 pr-4 text-sm text-white font-semibold text-right">
                            {fmtCurrencyFull(r.today)}
                          </td>
                          <td className={`py-3 pr-5 text-sm font-bold text-right ${
                            pct === null ? "text-gray-600" : up ? "text-emerald-400" : "text-red-400"
                          }`}>
                            {pct === null ? "—" : `${up ? "+" : ""}${pct.toFixed(1)}%`}
                          </td>
                        </tr>
                      );
                    })}
                    <tr style={{ background: "rgba(0,184,150,0.06)", borderTop: "1px solid rgba(0,184,150,0.2)" }}>
                      <td className="py-3.5 pl-5 text-sm font-extrabold text-white">Total</td>
                      <td className="py-3.5 pr-4 text-sm font-extrabold text-white text-right">
                        {fmtCurrencyFull(now.total)}
                      </td>
                      <td className={`py-3.5 pr-5 text-sm font-extrabold text-right ${
                        totalPct === null ? "text-gray-600" : totalUp ? "text-emerald-400" : "text-red-400"
                      }`}>
                        {totalPct === null ? "—" : `${totalUp ? "+" : ""}${totalPct.toFixed(1)}%`}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            )}

            {/* ── by location (multi-store owners only) ── */}
            {selectedLoc === "all" && locations.length > 1 && (
              <div className="rounded-2xl overflow-hidden border border-white/[0.07]" style={{ background: "#0d1829" }}>
                <div className="px-5 py-3.5 border-b border-white/[0.07]">
                  <h2 className="text-sm font-bold text-white">By Store</h2>
                </div>
                {locations.map(loc => {
                  const t = calc(todayRows.filter(r => r.location_id === loc.id));
                  const p = calc(prevRows.filter(r => r.location_id === loc.id));
                  if (t.total === 0 && p.total === 0) return null;
                  const pct = pctChange(t.total, p.total);
                  const up = pct === null ? null : pct >= 0;
                  return (
                    <div key={loc.id} className="flex items-center justify-between px-5 py-3.5 border-b border-white/[0.05] hover:bg-white/[0.02]">
                      <div>
                        <p className="text-sm font-semibold text-white">{loc.name}</p>
                        {pct !== null && (
                          <p className={`text-xs font-semibold ${up ? "text-emerald-400" : "text-red-400"}`}>
                            {up ? "▲" : "▼"} {Math.abs(pct).toFixed(1)}% vs last week
                          </p>
                        )}
                      </div>
                      <p className="text-base font-extrabold text-white">{fmtCurrency(t.total)}</p>
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
