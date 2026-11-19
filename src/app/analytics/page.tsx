"use client";

import { useEffect, useState, useMemo, useCallback } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { useAuthGuard } from "@/lib/useAuthGuard";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer, LineChart, Line, ReferenceLine, Cell,
} from "recharts";

/* ─── design tokens ────────────────────────────────────────────────── */
const BG   = "#060b18";
const CARD = "rgba(255,255,255,0.04)";
const BORDER = "rgba(255,255,255,0.08)";
const GREEN  = "#00d4a8";
const RED    = "#ef4444";
const AMBER  = "#f59e0b";
const BLUE   = "#3b82f6";
const CHART_COLORS = ["#00d4a8","#3b82f6","#a855f7","#f97316","#ec4899","#14b8a6"];

const TARGETS = { food: 28, labor: 30, infra: 19, gross: 22, prime: 58 };
const fmtUSD = (n: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n);
const fmtPct = (n: number) => `${n.toFixed(1)}%`;

/* ─── types ─────────────────────────────────────────────────────────── */
interface PLRow {
  location_id: string;
  location_name: string;
  month: string;
  food_pct: number;  labor_pct: number;  infra_pct: number;  net_profit_pct: number;
  food_cost: number; total_labor: number; infrastructure: number;
  total_net_sales: number; net_profit: number;
}

interface TrendPoint {
  label: string;
  food_pct: number;
  labor_pct: number;
  prime_pct: number;
  net_pct: number;
}

interface PriceOutlier {
  item: string; location: string; current_price: number;
  avg_price: number; diff_pct: number; vendor: string; date: string;
}

interface NotifSetting {
  location_id: string; location_name: string;
  email: string; phone: string;
  notify_food_pct_threshold: number;
  notify_labor_pct_threshold: number;
  notify_price_increase_pct: number;
}

interface QuarterRow {
  quarter: string;
  food_pct: number; labor_pct: number; infra_pct: number;
  prime_pct: number; net_pct: number;
  sales: number; profit: number;
}

/* ─── sub-components ───────────────────────────────────────────────── */
function KPICard({ label, value, sub, color }: { label: string; value: string; sub?: string; color: string }) {
  return (
    <div className="rounded-2xl p-4 relative overflow-hidden" style={{ background: CARD, border: `1px solid ${BORDER}` }}>
      <div className="absolute top-0 left-0 w-1 h-full rounded-l-2xl" style={{ background: color }} />
      <p className="text-xs text-gray-500 uppercase tracking-wide pl-2">{label}</p>
      <p className="text-2xl font-bold mt-1 pl-2 tabular-nums" style={{ color }}>{value}</p>
      {sub && <p className="text-[11px] text-gray-600 mt-0.5 pl-2">{sub}</p>}
    </div>
  );
}

function MarginBar({ label, value, target, invert = false }: {
  label: string; value: number; target: number; invert?: boolean;
}) {
  const bad = invert ? value > target : value < target;
  const color = bad ? RED : GREEN;
  const pct = Math.min((value / Math.max(target * 1.6, 40)) * 100, 100);
  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-xs text-gray-400 font-medium">{label}</span>
        <span className="text-xs font-bold tabular-nums" style={{ color }}>
          {fmtPct(value)} <span className="text-gray-600 font-normal">/ {target}% target</span>
        </span>
      </div>
      <div className="h-2 rounded-full relative overflow-hidden" style={{ background: "rgba(255,255,255,0.08)" }}>
        <div className="h-full rounded-full transition-all duration-500" style={{ width: `${pct}%`, background: color }} />
        <div className="absolute top-0 h-full w-px" style={{
          left: `${Math.min((target / Math.max(target * 1.6, 40)) * 100, 100)}%`,
          background: "rgba(255,255,255,0.3)"
        }} />
      </div>
    </div>
  );
}

function SuggestionCard({ data }: { data: PLRow[] }) {
  const [text, setText] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const analyze = async () => {
    setLoading(true);
    const summary = data.slice(0, 10).map(r =>
      `${r.location_name} (${r.month}): food ${r.food_pct.toFixed(1)}%, labor ${r.labor_pct.toFixed(1)}%, infra ${r.infra_pct.toFixed(1)}%, net ${r.net_profit_pct.toFixed(1)}%`
    ).join("\n");
    try {
      const res = await fetch("/api/analyze", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: `Restaurant financial advisor. Analyze P&L margins (targets: food ≤28%, labor ≤30%, infra ≤19%, gross margin ≥22%) and give 3-5 specific, actionable suggestions:\n\n${summary}\n\nBe concise. Focus on the biggest margin leaks and specific fixes.` }),
      });
      const d = await res.json();
      if (d.error) throw new Error(d.error.message ?? d.error);
      setText(d.content[0].text);
    } catch (e) { setText("Error: " + (e instanceof Error ? e.message : "failed")); }
    setLoading(false);
  };
  return (
    <div className="rounded-2xl p-5" style={{ background: "rgba(99,102,241,0.08)", border: "1px solid rgba(99,102,241,0.25)" }}>
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-semibold text-white text-sm">🤖 AI Margin Recommendations</h3>
        <button onClick={analyze} disabled={loading}
          className="text-xs px-3 py-1.5 rounded-lg font-medium disabled:opacity-50 transition-colors"
          style={{ background: "rgba(99,102,241,0.3)", color: "#a5b4fc" }}>
          {loading ? "Analyzing…" : text ? "Re-analyze" : "Analyze Margins"}
        </button>
      </div>
      {text
        ? <p className="text-sm text-gray-300 whitespace-pre-wrap leading-relaxed">{text}</p>
        : <p className="text-sm text-gray-500">Click Analyze to get AI-powered suggestions on where you&apos;re losing margin.</p>}
    </div>
  );
}

/* ─── main ──────────────────────────────────────────────────────────── */
export default function AnalyticsPage() {
  const supabase = useMemo(() => createClient(), []);
  const { ready } = useAuthGuard();

  const now = new Date();
  const [month, setMonth] = useState(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`);
  const [plData, setPlData]   = useState<PLRow[]>([]);
  const [outliers, setOutliers] = useState<PriceOutlier[]>([]);
  const [notifSettings, setNotifSettings] = useState<NotifSetting[]>([]);
  const [locations, setLocations] = useState<{ id: string; name: string }[]>([]);
  const [tab, setTab] = useState<"margins"|"trends"|"quarterly"|"outliers"|"notify">("margins");
  const [locTrends, setLocTrends] = useState<Record<string, TrendPoint[]>>({});
  const [quarterData, setQuarterData] = useState<QuarterRow[]>([]);
  const [saving, setSaving] = useState<string | null>(null);
  const [notifying, setNotifying] = useState(false);
  const [notifMsg, setNotifMsg] = useState("");

  const load = useCallback(async () => {
    const monthDate = month + "-01";
    const nextDate = (() => {
      const d = new Date(monthDate + "T00:00:00");
      d.setMonth(d.getMonth() + 1);
      return d.toISOString().slice(0, 10);
    })();

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const [locRes, foodRes, salaryRes, infraRes, ptaxRes, salesRes, hourlyRes, salariedRes, bohRes] = await Promise.all([
      supabase.from("locations").select("id,name").eq("app", "cashcall").eq("user_id", user.id),
      supabase.from("food_deliveries").select("location_id,amount")
        .gte("delivery_date", monthDate).lt("delivery_date", nextDate),
      supabase.from("salary_disbursements").select("location_id,amount")
        .gte("disbursed_on", monthDate).lt("disbursed_on", nextDate),
      supabase.from("monthly_infrastructure")
        .select("location_id,rent,utilities,insurance,staff_accommodation,staff_accom_utilities,car_payment,gas_expenses,phone,store_internet,trash,repairs_maintenance,pest_control,marketing_fee,bank_charges,pos_charges,credit_card_fee,custom_fields")
        .eq("month", monthDate),
      supabase.from("monthly_payroll_taxes").select("location_id,payroll_tax_amount,workers_comp_amount,benefits_amount")
        .eq("month", monthDate),
      supabase.from("daily_sales").select("location_id,cash_sales,pos_sales,uber_eats_gross,grubhub_gross,doordash_gross,catering_sales")
        .gte("sale_date", monthDate).lt("sale_date", nextDate),
      supabase.from("foh_hourly_hours")
        .select("hours_worked,overtime_hours,foh_hourly_staff!inner(hourly_rate,location_id)")
        .gte("work_date", monthDate).lt("work_date", nextDate),
      supabase.from("foh_salaried_staff").select("location_id,monthly_salary").eq("active", true),
      supabase.from("boh_staff").select("location_id,pay_type,pay_rate").eq("active", true),
    ]);

    const locs = locRes.data ?? [];
    setLocations(locs);

    const foodByLoc: Record<string, number> = {};
    for (const r of (foodRes.data ?? [])) foodByLoc[r.location_id] = (foodByLoc[r.location_id] ?? 0) + Number(r.amount);

    const laborByLoc: Record<string, number> = {};
    for (const r of (hourlyRes.data ?? [])) {
      const staff = (r as any).foh_hourly_staff;
      if (!staff?.location_id) continue;
      const pay = Number(r.hours_worked ?? 0) * Number(staff.hourly_rate ?? 0)
        + Number(r.overtime_hours ?? 0) * Number(staff.hourly_rate ?? 0) * 0.5;
      laborByLoc[staff.location_id] = (laborByLoc[staff.location_id] ?? 0) + pay;
    }
    for (const r of (salariedRes.data ?? [])) laborByLoc[r.location_id] = (laborByLoc[r.location_id] ?? 0) + Number(r.monthly_salary ?? 0);
    for (const r of (bohRes.data ?? [])) {
      const pay = r.pay_type === "salary" ? Number(r.pay_rate ?? 0) : Number(r.pay_rate ?? 0) * 160;
      laborByLoc[r.location_id] = (laborByLoc[r.location_id] ?? 0) + pay;
    }
    for (const r of (ptaxRes.data ?? [])) {
      laborByLoc[r.location_id] = (laborByLoc[r.location_id] ?? 0)
        + Number((r as any).payroll_tax_amount ?? 0) + Number((r as any).workers_comp_amount ?? 0) + Number((r as any).benefits_amount ?? 0);
    }
    for (const r of (salaryRes.data ?? [])) {
      if (!laborByLoc[r.location_id]) laborByLoc[r.location_id] = Number(r.amount ?? 0);
    }

    const infraByLoc: Record<string, number> = {};
    for (const r of (infraRes.data ?? [])) {
      const keys = ["rent","utilities","insurance","staff_accommodation","staff_accom_utilities","car_payment","gas_expenses","phone","store_internet","trash","repairs_maintenance","pest_control","marketing_fee","bank_charges","pos_charges","credit_card_fee"] as const;
      const fixed = keys.reduce((s, k) => s + Number((r as any)[k] ?? 0), 0);
      const custom = Object.values((r as any).custom_fields ?? {}).reduce((s: number, v) => s + Number(v ?? 0), 0);
      infraByLoc[r.location_id] = (infraByLoc[r.location_id] ?? 0) + fixed + custom;
    }

    const salesByLoc: Record<string, number> = {};
    for (const r of (salesRes.data ?? [])) {
      const s = [r.cash_sales, r.pos_sales, r.uber_eats_gross, r.grubhub_gross, r.doordash_gross, r.catering_sales]
        .reduce((a, b) => a + Number(b ?? 0), 0);
      salesByLoc[r.location_id] = (salesByLoc[r.location_id] ?? 0) + s;
    }

    const rows: PLRow[] = locs.map(loc => {
      const sales = salesByLoc[loc.id] ?? 0;
      const food = foodByLoc[loc.id] ?? 0;
      const labor = laborByLoc[loc.id] ?? 0;
      const infra = infraByLoc[loc.id] ?? 0;
      const expenses = food + labor + infra;
      const net = sales - expenses;
      return {
        location_id: loc.id, location_name: loc.name, month: monthDate,
        food_cost: food, total_labor: labor, infrastructure: infra,
        total_net_sales: sales, net_profit: net,
        food_pct:       sales > 0 ? (food  / sales) * 100 : 0,
        labor_pct:      sales > 0 ? (labor / sales) * 100 : 0,
        infra_pct:      sales > 0 ? (infra / sales) * 100 : 0,
        net_profit_pct: sales > 0 ? (net   / sales) * 100 : 0,
      };
    });
    setPlData(rows);

    // ── 6-month trends with food + labor + prime ───────────────────────
    const sixAgo = new Date(now); sixAgo.setMonth(sixAgo.getMonth() - 5);
    const sixAgoDate = `${sixAgo.getFullYear()}-${String(sixAgo.getMonth() + 1).padStart(2, "0")}-01`;

    const sixMonths = Array.from({ length: 6 }, (_, i) => {
      const d = new Date(now.getFullYear(), now.getMonth() - 5 + i, 1);
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
    });

    const [foodTrendRes, salesTrendRes, salaryTrendRes, salariedStaffRes, bohStaffRes] = await Promise.all([
      supabase.from("food_deliveries").select("location_id,delivery_date,amount")
        .gte("delivery_date", sixAgoDate).lt("delivery_date", nextDate),
      supabase.from("daily_sales")
        .select("location_id,sale_date,cash_sales,pos_sales,uber_eats_gross,grubhub_gross,doordash_gross,catering_sales")
        .gte("sale_date", sixAgoDate).lt("sale_date", nextDate),
      // salary disbursements as labor proxy for trend
      supabase.from("salary_disbursements").select("location_id,disbursed_on,amount")
        .gte("disbursed_on", sixAgoDate).lt("disbursed_on", nextDate),
      // salaried staff: fixed monthly — we'll count their salary for each month
      supabase.from("foh_salaried_staff").select("location_id,monthly_salary").eq("active", true),
      supabase.from("boh_staff").select("location_id,pay_type,pay_rate").eq("active", true),
    ]);

    // Food by loc+month
    const foodTrendMap: Record<string, Record<string, number>> = {};
    for (const r of (foodTrendRes.data ?? [])) {
      const mKey = r.delivery_date.slice(0, 7) + "-01";
      (foodTrendMap[r.location_id] ??= {})[mKey] = ((foodTrendMap[r.location_id]?.[mKey]) ?? 0) + Number(r.amount);
    }

    // Sales by loc+month
    const salesTrendMap: Record<string, Record<string, number>> = {};
    for (const r of (salesTrendRes.data ?? [])) {
      const mKey = r.sale_date.slice(0, 7) + "-01";
      const s = [r.cash_sales, r.pos_sales, r.uber_eats_gross, r.grubhub_gross, r.doordash_gross, r.catering_sales]
        .reduce((a, b) => a + Number(b ?? 0), 0);
      (salesTrendMap[r.location_id] ??= {})[mKey] = ((salesTrendMap[r.location_id]?.[mKey]) ?? 0) + s;
    }

    // Labor by loc+month: salary disbursements (actual payroll payments)
    const laborTrendMap: Record<string, Record<string, number>> = {};
    for (const r of (salaryTrendRes.data ?? [])) {
      const mKey = r.disbursed_on.slice(0, 7) + "-01";
      (laborTrendMap[r.location_id] ??= {})[mKey] = ((laborTrendMap[r.location_id]?.[mKey]) ?? 0) + Number(r.amount ?? 0);
    }
    // Supplement with fixed monthly staff for months with no disbursements
    const fixedLaborByLoc: Record<string, number> = {};
    for (const r of (salariedStaffRes.data ?? [])) fixedLaborByLoc[r.location_id] = (fixedLaborByLoc[r.location_id] ?? 0) + Number(r.monthly_salary ?? 0);
    for (const r of (bohStaffRes.data ?? [])) {
      const pay = r.pay_type === "salary" ? Number(r.pay_rate ?? 0) : Number(r.pay_rate ?? 0) * 160;
      fixedLaborByLoc[r.location_id] = (fixedLaborByLoc[r.location_id] ?? 0) + pay;
    }

    const byLoc: Record<string, TrendPoint[]> = {};
    for (const loc of locs) {
      byLoc[loc.id] = sixMonths.map(mKey => {
        const food  = foodTrendMap[loc.id]?.[mKey] ?? 0;
        const sales = salesTrendMap[loc.id]?.[mKey] ?? 0;
        // Use disbursements if available, fall back to fixed staff cost
        const laborDisbursed = laborTrendMap[loc.id]?.[mKey] ?? 0;
        const labor = laborDisbursed > 0 ? laborDisbursed : (fixedLaborByLoc[loc.id] ?? 0);
        const net = sales - food - labor;
        const label = new Date(mKey + "T00:00:00").toLocaleDateString("en-US", { month: "short", year: "2-digit" });
        return {
          label,
          food_pct:  sales > 0 ? (food  / sales) * 100 : 0,
          labor_pct: sales > 0 ? (labor / sales) * 100 : 0,
          prime_pct: sales > 0 ? ((food + labor) / sales) * 100 : 0,
          net_pct:   sales > 0 ? (net   / sales) * 100 : 0,
        };
      });
    }
    setLocTrends(byLoc);

    // ── Quarterly comparison (last 4 quarters) ─────────────────────────
    const quarters: QuarterRow[] = [];
    for (let q = 3; q >= 0; q--) {
      // figure out the quarter
      const refMonth = now.getMonth() - q * 3;
      const refYear  = now.getFullYear() + Math.floor(refMonth / 12);
      const qMonth   = ((refMonth % 12) + 12) % 12;
      const qStart   = new Date(refYear, qMonth - (qMonth % 3), 1);
      const qEnd     = new Date(qStart.getFullYear(), qStart.getMonth() + 3, 1);
      const qStartStr = qStart.toISOString().slice(0, 10);
      const qEndStr   = qEnd.toISOString().slice(0, 10);
      const qLabel = `Q${Math.floor(qStart.getMonth() / 3) + 1} ${qStart.getFullYear()}`;

      const [qFood, qSales, qLabor] = await Promise.all([
        supabase.from("food_deliveries").select("amount").gte("delivery_date", qStartStr).lt("delivery_date", qEndStr),
        supabase.from("daily_sales")
          .select("cash_sales,pos_sales,uber_eats_gross,grubhub_gross,doordash_gross,catering_sales")
          .gte("sale_date", qStartStr).lt("sale_date", qEndStr),
        supabase.from("salary_disbursements").select("amount")
          .gte("disbursed_on", qStartStr).lt("disbursed_on", qEndStr),
      ]);

      const food  = (qFood.data ?? []).reduce((s, r) => s + Number(r.amount ?? 0), 0);
      const sales = (qSales.data ?? []).reduce((s, r) =>
        s + [r.cash_sales, r.pos_sales, r.uber_eats_gross, r.grubhub_gross, r.doordash_gross, r.catering_sales]
          .reduce((a, b) => a + Number(b ?? 0), 0), 0);
      const labor = (qLabor.data ?? []).reduce((s, r) => s + Number(r.amount ?? 0), 0);
      const net   = sales - food - labor;

      if (sales > 0 || food > 0) {
        quarters.push({
          quarter: qLabel,
          food_pct:  sales > 0 ? (food  / sales) * 100 : 0,
          labor_pct: sales > 0 ? (labor / sales) * 100 : 0,
          infra_pct: 0,
          prime_pct: sales > 0 ? ((food + labor) / sales) * 100 : 0,
          net_pct:   sales > 0 ? (net   / sales) * 100 : 0,
          sales, profit: net,
        });
      }
    }
    setQuarterData(quarters);

    // ── Price outliers ─────────────────────────────────────────────────
    detectOutliers(locs);

    // ── Notification settings ──────────────────────────────────────────
    const { data: ns } = await supabase.from("location_notification_settings").select("*");
    const settingsMap = Object.fromEntries((ns ?? []).map(n => [n.location_id, n]));
    setNotifSettings(locs.map(loc => ({
      location_id: loc.id, location_name: loc.name,
      email: settingsMap[loc.id]?.email ?? "",
      phone: settingsMap[loc.id]?.phone ?? "",
      notify_food_pct_threshold: settingsMap[loc.id]?.notify_food_pct_threshold ?? 28,
      notify_labor_pct_threshold: settingsMap[loc.id]?.notify_labor_pct_threshold ?? 30,
      notify_price_increase_pct: settingsMap[loc.id]?.notify_price_increase_pct ?? 10,
    })));
  }, [month, supabase]);

  const detectOutliers = async (locs: { id: string; name: string }[]) => {
    const sixAgo = new Date(); sixAgo.setMonth(sixAgo.getMonth() - 6);
    const sixAgoDate = sixAgo.toISOString().slice(0, 10);
    const monthDate = month + "-01";
    const nextDate = (() => {
      const d = new Date(monthDate + "T00:00:00");
      d.setMonth(d.getMonth() + 1);
      return d.toISOString().slice(0, 10);
    })();
    const { data: currentDeliveries } = await supabase.from("food_deliveries")
      .select("id,location_id,vendor,delivery_date").gte("delivery_date", monthDate).lt("delivery_date", nextDate);
    if (!currentDeliveries?.length) return;
    const currentIds = currentDeliveries.map(d => d.id);
    const [currentItems, histDeliveries] = await Promise.all([
      supabase.from("invoice_line_items").select("name,unit_price,food_delivery_id")
        .in("food_delivery_id", currentIds).not("unit_price", "is", null),
      supabase.from("food_deliveries").select("id,location_id")
        .gte("delivery_date", sixAgoDate).lt("delivery_date", monthDate),
    ]);
    if (!currentItems.data?.length || !histDeliveries.data?.length) return;
    const histIds = histDeliveries.data.map(d => d.id);
    const { data: histItems } = await supabase.from("invoice_line_items")
      .select("name,unit_price,food_delivery_id").in("food_delivery_id", histIds);
    const histMap: Record<string, number[]> = {};
    for (const h of (histItems ?? [])) {
      if (!h.unit_price) continue;
      (histMap[h.name.toLowerCase().trim()] ??= []).push(Number(h.unit_price));
    }
    const delivMap = Object.fromEntries(currentDeliveries.map(d => [d.id, d]));
    const locMap   = Object.fromEntries(locs.map(l => [l.id, l.name]));
    const found: PriceOutlier[] = [];
    for (const item of (currentItems.data ?? [])) {
      if (!item.unit_price) continue;
      const key = item.name.toLowerCase().trim();
      const hist = histMap[key];
      if (!hist?.length) continue;
      const avg = hist.reduce((s, v) => s + v, 0) / hist.length;
      const pct = ((Number(item.unit_price) - avg) / avg) * 100;
      if (pct >= 10) {
        const deliv = delivMap[item.food_delivery_id];
        found.push({
          item: item.name, current_price: Number(item.unit_price), avg_price: avg,
          diff_pct: pct, vendor: deliv?.vendor ?? "",
          location: locMap[deliv?.location_id] ?? "", date: deliv?.delivery_date ?? "",
        });
      }
    }
    setOutliers(found.sort((a, b) => b.diff_pct - a.diff_pct).slice(0, 20));
  };

  useEffect(() => { load(); }, [load]);

  const navMonth = (delta: number) => {
    const d = new Date(month + "-01T00:00:00");
    d.setMonth(d.getMonth() + delta);
    setMonth(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
  };

  const saveNotifSetting = async (s: NotifSetting) => {
    setSaving(s.location_id);
    await supabase.from("location_notification_settings").upsert({
      location_id: s.location_id, email: s.email, phone: s.phone,
      notify_food_pct_threshold: s.notify_food_pct_threshold,
      notify_labor_pct_threshold: s.notify_labor_pct_threshold,
      notify_price_increase_pct: s.notify_price_increase_pct,
      updated_at: new Date().toISOString(),
    }, { onConflict: "location_id" });
    setSaving(null);
  };

  const triggerWeeklyNotify = async () => {
    setNotifying(true); setNotifMsg("");
    try {
      const res = await fetch("/api/notify/weekly", { method: "POST" });
      const d = await res.json();
      setNotifMsg(d.message ?? "Sent!");
    } catch { setNotifMsg("Error triggering notifications."); }
    setNotifying(false);
  };

  /* Aggregates */
  const totalSales = plData.reduce((s, r) => s + r.total_net_sales, 0);
  const totalFood  = plData.reduce((s, r) => s + r.food_cost, 0);
  const totalLabor = plData.reduce((s, r) => s + r.total_labor, 0);
  const totalInfra = plData.reduce((s, r) => s + r.infrastructure, 0);
  const totalNet   = plData.reduce((s, r) => s + r.net_profit, 0);
  const avgFood    = totalSales > 0 ? (totalFood  / totalSales) * 100 : 0;
  const avgLabor   = totalSales > 0 ? (totalLabor / totalSales) * 100 : 0;
  const avgInfra   = totalSales > 0 ? (totalInfra / totalSales) * 100 : 0;
  const avgNet     = totalSales > 0 ? (totalNet   / totalSales) * 100 : 0;
  const avgPrime   = avgFood + avgLabor;

  const monthLabel = new Date(month + "-01T00:00:00").toLocaleDateString("en-US", { month: "long", year: "numeric" });

  if (!ready) return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: BG }}>
      <div className="w-8 h-8 border-2 border-t-transparent rounded-full animate-spin" style={{ borderColor: GREEN }} />
    </div>
  );

  const TABS = [
    { key: "margins",   label: "📊 Margins"    },
    { key: "trends",    label: "📈 Trends"     },
    { key: "quarterly", label: "📅 Quarterly"  },
    { key: "outliers",  label: "⚠️ Price Alerts"},
    { key: "notify",    label: "🔔 Alerts"     },
  ] as const;

  return (
    <div className="min-h-screen pb-10" style={{ background: BG }}>
      {/* nav */}
      <header className="sticky top-0 z-50 border-b" style={{ background: "rgba(6,11,24,0.95)", backdropFilter: "blur(12px)", borderColor: "rgba(255,255,255,0.08)" }}>
        <div className="max-w-5xl mx-auto px-4 h-14 flex items-center gap-3">
          <Link href="/dashboard" className="text-gray-400 hover:text-white text-sm transition-colors">← Dashboard</Link>
          <div className="h-4 w-px" style={{ background: "rgba(255,255,255,0.12)" }} />
          <span className="font-semibold text-white text-sm">📊 Cost Analytics</span>
          <span className="text-xs text-gray-600 hidden sm:inline">All Locations</span>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-6 space-y-5">
        {/* Month nav */}
        <div className="flex items-center gap-3">
          <button onClick={() => navMonth(-1)}
            className="rounded-xl px-3 py-2 text-sm text-gray-400 hover:text-white transition-colors"
            style={{ background: CARD, border: `1px solid ${BORDER}` }}>‹</button>
          <span className="font-semibold text-white min-w-[140px] text-center">{monthLabel}</span>
          <button onClick={() => navMonth(1)}
            className="rounded-xl px-3 py-2 text-sm text-gray-400 hover:text-white transition-colors"
            style={{ background: CARD, border: `1px solid ${BORDER}` }}>›</button>
        </div>

        {/* KPI strip */}
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
          <KPICard label="Total Sales" value={fmtUSD(totalSales)} sub="all locations" color={BLUE} />
          <KPICard label="Prime Cost" value={fmtPct(avgPrime)} sub={`target ≤${TARGETS.prime}%`} color={avgPrime > TARGETS.prime ? RED : GREEN} />
          <KPICard label="Food Cost %" value={fmtPct(avgFood)} sub={`target ≤${TARGETS.food}%`} color={avgFood > TARGETS.food ? RED : AMBER} />
          <KPICard label="Labor %" value={fmtPct(avgLabor)} sub={`target ≤${TARGETS.labor}%`} color={avgLabor > TARGETS.labor ? RED : BLUE} />
          <KPICard label="Net Profit %" value={fmtPct(avgNet)} sub={`target ≥${TARGETS.gross}%`} color={avgNet < TARGETS.gross ? RED : GREEN} />
        </div>

        {/* Tabs */}
        <div className="flex gap-1 overflow-x-auto pb-1" style={{ scrollbarWidth: "none" }}>
          {TABS.map(t => (
            <button key={t.key} onClick={() => setTab(t.key)}
              className="px-3 sm:px-4 py-2 rounded-xl text-xs sm:text-sm font-medium transition-all whitespace-nowrap flex-shrink-0"
              style={tab === t.key
                ? { background: "rgba(0,212,168,0.15)", border: "1px solid rgba(0,212,168,0.35)", color: GREEN }
                : { background: CARD, border: `1px solid ${BORDER}`, color: "#6b7280" }}>
              {t.label}
            </button>
          ))}
        </div>

        {/* ── Margins ── */}
        {tab === "margins" && (
          <div className="space-y-5">
            <div className="rounded-2xl p-5 space-y-4" style={{ background: CARD, border: `1px solid ${BORDER}` }}>
              <h3 className="font-semibold text-white text-sm">Combined Margin Health — {monthLabel}</h3>
              <MarginBar label="Prime Cost (Food + Labor)" value={avgPrime} target={TARGETS.prime} invert />
              <MarginBar label="Food Cost" value={avgFood}  target={TARGETS.food}  invert />
              <MarginBar label="Labor Cost" value={avgLabor} target={TARGETS.labor} invert />
              <MarginBar label="Infrastructure" value={avgInfra} target={TARGETS.infra} invert />
              <MarginBar label="Net Profit (Gross Margin)" value={avgNet} target={TARGETS.gross} />
            </div>

            <div className="rounded-2xl overflow-hidden" style={{ background: CARD, border: `1px solid ${BORDER}` }}>
              <div className="px-5 py-3 border-b" style={{ borderColor: BORDER }}>
                <h3 className="text-sm font-semibold text-gray-300">Per-Location Margins</h3>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b" style={{ borderColor: BORDER }}>
                      {["Location", "Sales", "Prime %", "Food %", "Labor %", "Net %"].map(h => (
                        <th key={h} className={`px-4 py-2.5 text-xs font-semibold text-gray-500 ${h === "Location" ? "text-left" : "text-right"}`}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {plData.map(r => {
                      const prime = r.food_pct + r.labor_pct;
                      return (
                        <tr key={r.location_id} className="border-b transition-colors hover:bg-white/[0.02]"
                          style={{ borderColor: "rgba(255,255,255,0.04)" }}>
                          <td className="px-4 py-2.5">
                            <Link href={`/location/${r.location_id}/food`} className="text-teal-400 hover:text-teal-300 font-medium transition-colors">
                              {r.location_name}
                            </Link>
                          </td>
                          <td className="px-4 py-2.5 text-right text-gray-400 tabular-nums">{fmtUSD(r.total_net_sales)}</td>
                          <td className="px-4 py-2.5 text-right font-bold tabular-nums" style={{ color: prime > TARGETS.prime ? RED : GREEN }}>{fmtPct(prime)}</td>
                          <td className="px-4 py-2.5 text-right tabular-nums" style={{ color: r.food_pct > TARGETS.food ? RED : AMBER }}>{fmtPct(r.food_pct)}</td>
                          <td className="px-4 py-2.5 text-right tabular-nums" style={{ color: r.labor_pct > TARGETS.labor ? RED : BLUE }}>{fmtPct(r.labor_pct)}</td>
                          <td className="px-4 py-2.5 text-right font-semibold tabular-nums" style={{ color: r.net_profit_pct < TARGETS.gross ? RED : GREEN }}>{fmtPct(r.net_profit_pct)}</td>
                        </tr>
                      );
                    })}
                    {plData.length === 0 && (
                      <tr><td colSpan={6} className="px-4 py-10 text-center text-sm text-gray-600">No data for {monthLabel}. Enter food deliveries and daily sales first.</td></tr>
                    )}
                  </tbody>
                  {plData.length > 0 && (
                    <tfoot>
                      <tr className="border-t font-bold" style={{ background: "rgba(0,212,168,0.06)", borderColor: "rgba(0,212,168,0.2)" }}>
                        <td className="px-4 py-2.5" style={{ color: GREEN }}>All Locations</td>
                        <td className="px-4 py-2.5 text-right text-white tabular-nums">{fmtUSD(totalSales)}</td>
                        <td className="px-4 py-2.5 text-right tabular-nums" style={{ color: avgPrime > TARGETS.prime ? RED : GREEN }}>{fmtPct(avgPrime)}</td>
                        <td className="px-4 py-2.5 text-right tabular-nums" style={{ color: avgFood > TARGETS.food ? RED : AMBER }}>{fmtPct(avgFood)}</td>
                        <td className="px-4 py-2.5 text-right tabular-nums" style={{ color: avgLabor > TARGETS.labor ? RED : BLUE }}>{fmtPct(avgLabor)}</td>
                        <td className="px-4 py-2.5 text-right tabular-nums" style={{ color: avgNet < TARGETS.gross ? RED : GREEN }}>{fmtPct(avgNet)}</td>
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>
            </div>

            {plData.length > 0 && (
              <div className="rounded-2xl p-5" style={{ background: CARD, border: `1px solid ${BORDER}` }}>
                <h3 className="font-semibold text-white text-sm mb-4">Cost Breakdown by Location</h3>
                <ResponsiveContainer width="100%" height={260}>
                  <BarChart data={plData} margin={{ top: 4, right: 12, left: 0, bottom: 40 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                    <XAxis dataKey="location_name" tick={{ fontSize: 11, fill: "#6b7280" }} angle={-15} textAnchor="end" />
                    <YAxis tickFormatter={v => `${v}%`} tick={{ fontSize: 11, fill: "#6b7280" }} domain={[0, 70]} />
                    <Tooltip formatter={(v) => `${Number(v).toFixed(1)}%`}
                      contentStyle={{ background: "#0a1628", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 8, color: "#fff" }} />
                    <Legend iconType="circle" iconSize={8} wrapperStyle={{ color: "#9ca3af", fontSize: 12 }} />
                    <ReferenceLine y={TARGETS.prime} stroke={RED} strokeDasharray="4 2"
                      label={{ value: "58% prime target", position: "right", fontSize: 9, fill: RED }} />
                    <Bar dataKey="food_pct"  name="Food %"  fill={AMBER} radius={[4, 4, 0, 0]} />
                    <Bar dataKey="labor_pct" name="Labor %" fill={BLUE}  radius={[4, 4, 0, 0]} />
                    <Bar dataKey="infra_pct" name="Infra %" fill="#8b5cf6" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="net_profit_pct" name="Net %" fill={GREEN} radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}

            {plData.length > 0 && <SuggestionCard data={plData} />}
          </div>
        )}

        {/* ── Trends ── */}
        {tab === "trends" && (
          <div className="space-y-5">
            <p className="text-xs text-gray-600">6-month prime cost trend per location. Targets: food ≤28%, labor ≤30%, prime ≤58%.</p>
            {locations.length === 0
              ? <p className="text-sm text-gray-600 text-center py-12">No locations loaded.</p>
              : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {locations.map(loc => {
                    const data = locTrends[loc.id] ?? [];
                    const hasAny = data.some(d => d.food_pct > 0 || d.labor_pct > 0);
                    const latest = [...data].reverse().find(d => d.prime_pct > 0);
                    const primeOk = latest ? latest.prime_pct <= TARGETS.prime : true;
                    return (
                      <div key={loc.id} className="rounded-2xl p-4" style={{ background: CARD, border: `1px solid ${BORDER}` }}>
                        <div className="flex items-center justify-between mb-3">
                          <h3 className="font-semibold text-white text-sm">{loc.name}</h3>
                          {hasAny && latest && (
                            <span className="text-xs font-bold px-2 py-0.5 rounded-full"
                              style={{ background: primeOk ? "rgba(0,212,168,0.15)" : "rgba(239,68,68,0.15)", color: primeOk ? GREEN : RED }}>
                              Prime {latest.prime_pct.toFixed(1)}%
                            </span>
                          )}
                        </div>
                        {!hasAny
                          ? <p className="text-xs text-gray-600 text-center py-6">No data scanned yet</p>
                          : (
                            <ResponsiveContainer width="100%" height={150}>
                              <LineChart data={data} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
                                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                                <XAxis dataKey="label" tick={{ fontSize: 10, fill: "#6b7280" }} />
                                <YAxis tickFormatter={v => `${v}%`} tick={{ fontSize: 10, fill: "#6b7280" }} domain={[0, "auto"]} />
                                <Tooltip formatter={(v) => `${Number(v).toFixed(1)}%`}
                                  contentStyle={{ background: "#0a1628", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 8, color: "#fff" }} />
                                <ReferenceLine y={TARGETS.food}  stroke={AMBER} strokeDasharray="3 2" />
                                <ReferenceLine y={TARGETS.prime} stroke={RED}   strokeDasharray="3 2" />
                                <Line type="monotone" dataKey="food_pct"  name="Food %"   stroke={AMBER} strokeWidth={2} dot={{ r: 3 }} />
                                <Line type="monotone" dataKey="labor_pct" name="Labor %"  stroke={BLUE}  strokeWidth={2} dot={{ r: 3 }} />
                                <Line type="monotone" dataKey="prime_pct" name="Prime %"  stroke={RED}   strokeWidth={2} strokeDasharray="5 3" dot={{ r: 2 }} />
                              </LineChart>
                            </ResponsiveContainer>
                          )}
                      </div>
                    );
                  })}
                </div>
              )}

            {/* Combined prime cost line */}
            {Object.keys(locTrends).length > 0 && (
              <div className="rounded-2xl p-5" style={{ background: CARD, border: `1px solid ${BORDER}` }}>
                <h3 className="font-semibold text-white text-sm mb-1">All Locations — Prime Cost % Over 6 Months</h3>
                <p className="text-xs text-gray-600 mb-4">Dashed red = 58% target</p>
                <ResponsiveContainer width="100%" height={240}>
                  <LineChart margin={{ top: 4, right: 12, left: 0, bottom: 0 }}
                    data={(() => {
                      const sixMonths = Array.from({ length: 6 }, (_, i) => {
                        const d = new Date(now.getFullYear(), now.getMonth() - 5 + i, 1);
                        return new Date(d).toLocaleDateString("en-US", { month: "short", year: "2-digit" });
                      });
                      return sixMonths.map((label, idx) => {
                        const row: Record<string, unknown> = { label };
                        for (const loc of locations) row[loc.name] = locTrends[loc.id]?.[idx]?.prime_pct ?? 0;
                        return row;
                      });
                    })()}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                    <XAxis dataKey="label" tick={{ fontSize: 11, fill: "#6b7280" }} />
                    <YAxis tickFormatter={v => `${v}%`} tick={{ fontSize: 11, fill: "#6b7280" }} />
                    <Tooltip formatter={(v) => `${Number(v).toFixed(1)}%`}
                      contentStyle={{ background: "#0a1628", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 8, color: "#fff" }} />
                    <Legend iconType="circle" iconSize={8} wrapperStyle={{ color: "#9ca3af", fontSize: 12 }} />
                    <ReferenceLine y={TARGETS.prime} stroke={RED} strokeDasharray="4 2"
                      label={{ value: "58% prime", position: "right", fontSize: 10, fill: RED }} />
                    {locations.map((loc, i) => (
                      <Line key={loc.id} type="monotone" dataKey={loc.name}
                        stroke={CHART_COLORS[i % CHART_COLORS.length]} strokeWidth={2}
                        dot={{ r: 3 }} activeDot={{ r: 5 }} />
                    ))}
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>
        )}

        {/* ── Quarterly ── */}
        {tab === "quarterly" && (
          <div className="space-y-5">
            <p className="text-xs text-gray-600">Quarter-over-quarter comparison. Shows cost % trajectory and whether you&apos;re improving or declining.</p>

            {quarterData.length === 0
              ? <p className="text-sm text-gray-600 text-center py-12">No quarterly data available. Enter sales and food deliveries to start tracking.</p>
              : (
                <>
                  {/* Quarter comparison cards */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    {quarterData.map((q, i) => {
                      const prev = quarterData[i - 1];
                      const primeDelta = prev ? q.prime_pct - prev.prime_pct : 0;
                      const isImproving = primeDelta < 0;
                      return (
                        <div key={q.quarter} className="rounded-2xl p-4" style={{ background: CARD, border: `1px solid ${BORDER}` }}>
                          <p className="text-[10px] font-bold uppercase tracking-widest mb-2" style={{ color: GREEN }}>{q.quarter}</p>
                          <p className="text-xl font-black tabular-nums" style={{ color: q.prime_pct > TARGETS.prime ? RED : GREEN }}>
                            {fmtPct(q.prime_pct)}
                          </p>
                          <p className="text-[10px] text-gray-600 mb-2">Prime Cost</p>
                          {prev && (
                            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded"
                              style={{ background: isImproving ? "rgba(0,212,168,0.15)" : "rgba(239,68,68,0.15)", color: isImproving ? GREEN : RED }}>
                              {isImproving ? "▼" : "▲"} {Math.abs(primeDelta).toFixed(1)}% vs prior Q
                            </span>
                          )}
                          <div className="mt-2 space-y-1 text-[10px] text-gray-500">
                            <div className="flex justify-between"><span>Food</span><span style={{ color: q.food_pct > TARGETS.food ? RED : AMBER }}>{fmtPct(q.food_pct)}</span></div>
                            <div className="flex justify-between"><span>Labor</span><span style={{ color: q.labor_pct > TARGETS.labor ? RED : BLUE }}>{fmtPct(q.labor_pct)}</span></div>
                            <div className="flex justify-between"><span>Net</span><span style={{ color: q.net_pct < TARGETS.gross ? RED : GREEN }}>{fmtPct(q.net_pct)}</span></div>
                          </div>
                          <p className="text-[10px] text-gray-600 mt-2 pt-2 border-t tabular-nums" style={{ borderColor: BORDER }}>
                            {fmtUSD(q.sales)} revenue
                          </p>
                        </div>
                      );
                    })}
                  </div>

                  {/* Bar chart comparison */}
                  <div className="rounded-2xl p-5" style={{ background: CARD, border: `1px solid ${BORDER}` }}>
                    <h3 className="font-semibold text-white text-sm mb-4">Prime Cost by Quarter</h3>
                    <ResponsiveContainer width="100%" height={240}>
                      <BarChart data={quarterData} margin={{ top: 4, right: 12, left: 0, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                        <XAxis dataKey="quarter" tick={{ fontSize: 12, fill: "#9ca3af" }} />
                        <YAxis tickFormatter={v => `${v}%`} tick={{ fontSize: 11, fill: "#6b7280" }} domain={[0, 80]} />
                        <Tooltip formatter={(v) => `${Number(v).toFixed(1)}%`}
                          contentStyle={{ background: "#0a1628", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 8, color: "#fff" }} />
                        <Legend iconType="circle" iconSize={8} wrapperStyle={{ color: "#9ca3af", fontSize: 12 }} />
                        <ReferenceLine y={TARGETS.prime} stroke={RED} strokeDasharray="4 2"
                          label={{ value: "58% target", position: "right", fontSize: 10, fill: RED }} />
                        <Bar dataKey="food_pct"  name="Food %"  fill={AMBER} radius={[3, 3, 0, 0]}>
                          {quarterData.map((q, i) => <Cell key={i} fill={q.food_pct > TARGETS.food ? "#ef4444" : AMBER} />)}
                        </Bar>
                        <Bar dataKey="labor_pct" name="Labor %" fill={BLUE}  radius={[3, 3, 0, 0]}>
                          {quarterData.map((q, i) => <Cell key={i} fill={q.labor_pct > TARGETS.labor ? "#f97316" : BLUE} />)}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>

                  {/* Net profit trend */}
                  <div className="rounded-2xl p-5" style={{ background: CARD, border: `1px solid ${BORDER}` }}>
                    <h3 className="font-semibold text-white text-sm mb-4">Net Profit % by Quarter</h3>
                    <ResponsiveContainer width="100%" height={180}>
                      <LineChart data={quarterData} margin={{ top: 4, right: 12, left: 0, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                        <XAxis dataKey="quarter" tick={{ fontSize: 12, fill: "#9ca3af" }} />
                        <YAxis tickFormatter={v => `${v}%`} tick={{ fontSize: 11, fill: "#6b7280" }} />
                        <Tooltip formatter={(v) => `${Number(v).toFixed(1)}%`}
                          contentStyle={{ background: "#0a1628", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 8, color: "#fff" }} />
                        <ReferenceLine y={TARGETS.gross} stroke={GREEN} strokeDasharray="4 2"
                          label={{ value: "22% target", position: "right", fontSize: 10, fill: GREEN }} />
                        <Line type="monotone" dataKey="net_pct" name="Net Profit %"
                          stroke={GREEN} strokeWidth={2.5} dot={{ r: 5, fill: GREEN }} activeDot={{ r: 7 }}>
                          {quarterData.map((q, i) => <Cell key={i} fill={q.net_pct < TARGETS.gross ? RED : GREEN} />)}
                        </Line>
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                </>
              )}
          </div>
        )}

        {/* ── Price Outliers ── */}
        {tab === "outliers" && (
          <div className="space-y-4">
            <div className="rounded-2xl overflow-hidden" style={{ background: CARD, border: `1px solid ${BORDER}` }}>
              <div className="px-5 py-3 border-b flex items-center justify-between"
                style={{ borderColor: BORDER, background: "rgba(245,158,11,0.08)" }}>
                <h3 className="text-sm font-semibold text-amber-400">⚠️ Price Increase Alerts — {monthLabel}</h3>
                <span className="text-xs text-amber-600">Items ≥10% above 6-month avg</span>
              </div>
              {outliers.length === 0
                ? <p className="text-sm text-gray-600 text-center py-12">No significant price increases detected this month.<br/>Scan invoices with AI OCR to track line-item prices.</p>
                : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b" style={{ borderColor: BORDER }}>
                          {["Item","Location","Vendor","Date","Current","Avg (6mo)","Change"].map(h => (
                            <th key={h} className={`px-4 py-2.5 text-xs font-semibold text-gray-500 ${["Item","Location","Vendor"].includes(h) ? "text-left" : "text-right"}`}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {outliers.map((o, i) => (
                          <tr key={i} className="border-b transition-colors hover:bg-white/[0.02]"
                            style={{ borderColor: "rgba(255,255,255,0.04)" }}>
                            <td className="px-4 py-2.5 font-medium text-white">{o.item}</td>
                            <td className="px-4 py-2.5 text-gray-500 text-xs">{o.location}</td>
                            <td className="px-4 py-2.5 text-gray-500 text-xs">{o.vendor}</td>
                            <td className="px-4 py-2.5 text-right text-gray-600 text-xs">{o.date}</td>
                            <td className="px-4 py-2.5 text-right font-semibold text-white tabular-nums">${o.current_price.toFixed(2)}</td>
                            <td className="px-4 py-2.5 text-right text-gray-500 tabular-nums">${o.avg_price.toFixed(2)}</td>
                            <td className="px-4 py-2.5 text-right font-bold tabular-nums" style={{ color: RED }}>▲ {o.diff_pct.toFixed(1)}%</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
            </div>
            {outliers.length > 0 && (
              <div className="rounded-2xl p-4 text-sm" style={{ background: "rgba(245,158,11,0.08)", border: "1px solid rgba(245,158,11,0.2)" }}>
                <strong className="text-amber-400">Cost Impact:</strong>
                <span className="text-gray-400 ml-2">Price increases on high-volume items directly raise your food cost %. Check with vendors for contract pricing.</span>
              </div>
            )}
          </div>
        )}

        {/* ── Notifications ── */}
        {tab === "notify" && (
          <div className="space-y-4">
            <div className="rounded-2xl p-4 text-sm flex items-center justify-between flex-wrap gap-3"
              style={{ background: "rgba(99,102,241,0.08)", border: "1px solid rgba(99,102,241,0.25)" }}>
              <div>
                <strong className="text-white">Weekly cost alerts</strong>
                <span className="text-gray-400 ml-2">— Sends email/SMS when costs rise above your thresholds.</span>
              </div>
              <button onClick={triggerWeeklyNotify} disabled={notifying}
                className="shrink-0 text-xs px-4 py-2 rounded-lg font-medium disabled:opacity-50 transition-colors"
                style={{ background: "rgba(99,102,241,0.3)", color: "#a5b4fc" }}>
                {notifying ? "Sending…" : "▶ Send Now"}
              </button>
            </div>
            {notifMsg && <p className="text-sm font-medium" style={{ color: GREEN }}>{notifMsg}</p>}
            <div className="space-y-3">
              {notifSettings.map((s, i) => (
                <div key={s.location_id} className="rounded-2xl p-5 space-y-3" style={{ background: CARD, border: `1px solid ${BORDER}` }}>
                  <h3 className="font-semibold text-white text-sm">{s.location_name}</h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {[
                      { label: "Email", key: "email" as const, type: "email", placeholder: "manager@yourrestaurant.com" },
                      { label: "Phone (SMS)", key: "phone" as const, type: "tel", placeholder: "+1 555-555-5555" },
                    ].map(({ label, key, type, placeholder }) => (
                      <div key={key}>
                        <label className="text-xs font-medium text-gray-500 block mb-1">{label}</label>
                        <input type={type} value={(s as any)[key]}
                          onChange={e => {
                            const copy = [...notifSettings];
                            copy[i] = { ...s, [key]: e.target.value };
                            setNotifSettings(copy);
                          }}
                          placeholder={placeholder}
                          className="w-full rounded-lg px-3 py-2 text-sm text-white focus:outline-none"
                          style={{ background: "rgba(255,255,255,0.06)", border: `1px solid ${BORDER}` }} />
                      </div>
                    ))}
                  </div>
                  <button onClick={() => saveNotifSetting(s)} disabled={saving === s.location_id}
                    className="text-xs px-4 py-2 rounded-lg font-medium disabled:opacity-50 transition-colors"
                    style={{ background: "rgba(0,212,168,0.15)", border: "1px solid rgba(0,212,168,0.3)", color: GREEN }}>
                    {saving === s.location_id ? "Saving…" : "Save Settings"}
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
