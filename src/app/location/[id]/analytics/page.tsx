"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import PrintPDFButton from "@/app/components/PrintPDFButton";
import { createClient } from "@/lib/supabase/client";
import { useAuthGuard } from "@/lib/useAuthGuard";
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  Legend, ResponsiveContainer, PieChart, Pie, Cell, ReferenceLine, ComposedChart, Area,
} from "recharts";
import { CHANNEL_COLORS } from "@/lib/chartColors";

/* ─── Types ─────────────────────────────────────────────────────── */
interface DayRow {
  sale_date: string;
  cash_sales: number; pos_sales: number;
  uber_eats_gross: number; grubhub_gross: number; doordash_gross: number;
  catering_sales: number; cash_tips: number;
}
interface FoodRow        { delivery_date: string; amount: number; }
interface HourlyHoursRow { work_date: string; hours_worked: number; overtime_hours: number; foh_hourly_staff: { hourly_rate: number } | null; }
interface SalariedRow    { monthly_salary: number; }
interface BOHRow         { pay_type: string; pay_rate: number; }
interface InfraRow       { month: string; rent: number; utilities: number; insurance: number; staff_accommodation: number; staff_accom_utilities: number; car_payment: number; gas_expenses: number; phone: number; store_internet: number; trash: number; repairs_maintenance: number; pest_control: number; marketing_fee: number; bank_charges: number; pos_charges: number; credit_card_fee: number; }
interface TaxRow         { month: string; payroll_tax_amount: number; workers_comp_amount: number; benefits_amount: number; }

interface MonthBucket {
  key: string; label: string;
  revenue: number; foodCost: number; laborCost: number;
  infraCost: number; taxCost: number;
  totalCost: number; netProfit: number;
  primeCostPct: number; // (food+labor) / revenue * 100
  foodPct: number; laborPct: number; infraPct: number;
  lossReason: string | null; // null = profitable
  // channel breakdown
  cashSales: number; posSales: number; aggregatorNet: number; catering: number; cashTips: number;
}

/* ─── Helpers ─────────────────────────────────────────────────── */
const num = (v: unknown) => parseFloat(String(v ?? 0)) || 0;
const fmtUSD = (n: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n);
const fmtK = (n: number) => n >= 1000 ? `$${(n / 1000).toFixed(1)}k` : `$${Math.round(n)}`;
const pct = (a: number, b: number) => b > 0 ? ((a / b) * 100).toFixed(1) + "%" : "—";

function monthKey(dateStr: string) {
  return dateStr.slice(0, 7); // "2026-01"
}
function monthLabel(key: string) {
  const [y, m] = key.split("-");
  return new Date(+y, +m - 1, 1).toLocaleDateString("en-US", { month: "short", year: "2-digit" });
}
function rowRevenue(r: DayRow) {
  const aggNet = (num(r.uber_eats_gross) + num(r.grubhub_gross) + num(r.doordash_gross)) * 0.7;
  return num(r.cash_sales) + num(r.pos_sales) + aggNet + num(r.catering_sales) + num(r.cash_tips);
}

/* ─── Linear regression ──────────────────────────────────────── */
function linReg(ys: number[]) {
  const n = ys.length;
  if (n < 2) return { slope: 0, intercept: ys[0] ?? 0 };
  const sumX = (n * (n - 1)) / 2;
  const sumX2 = (n * (n - 1) * (2 * n - 1)) / 6;
  const sumY = ys.reduce((a, b) => a + b, 0);
  const sumXY = ys.reduce((s, y, i) => s + i * y, 0);
  const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
  const intercept = (sumY - slope * sumX) / n;
  return { slope, intercept };
}

/* ─── Pitfall detection ──────────────────────────────────────── */
interface Alert { type: "error" | "warning" | "info"; icon: string; title: string; detail: string; }
function detectPitfalls(months: MonthBucket[], projSlope: number): Alert[] {
  const alerts: Alert[] = [];
  const recent = months.slice(-3);
  if (recent.length < 1) return alerts;

  const avgRev    = months.reduce((s, m) => s + m.revenue, 0) / months.length;
  const avgFood   = months.filter(m => m.foodCost > 0 && m.revenue > 0)
                      .reduce((s, m) => s + (m.foodCost / m.revenue) * 100, 0) /
                    (months.filter(m => m.foodCost > 0 && m.revenue > 0).length || 1);
  const avgLabor  = months.filter(m => m.laborCost > 0 && m.revenue > 0)
                      .reduce((s, m) => s + (m.laborCost / m.revenue) * 100, 0) /
                    (months.filter(m => m.laborCost > 0 && m.revenue > 0).length || 1);
  const avgInfra  = months.filter(m => m.infraCost > 0 && m.revenue > 0)
                      .reduce((s, m) => s + (m.infraCost / m.revenue) * 100, 0) /
                    (months.filter(m => m.infraCost > 0 && m.revenue > 0).length || 1);
  const lastMonth = months[months.length - 1];
  const primeCost = lastMonth ? ((lastMonth.foodCost + lastMonth.laborCost) / (lastMonth.revenue || 1)) * 100 : 0;

  // Declining revenue trend
  if (projSlope < -500) alerts.push({ type: "error", icon: "📉", title: "Declining Revenue Trend", detail: `Sales are falling ~${fmtUSD(Math.abs(projSlope))}/mo. Immediate action needed to reverse the trend.` });

  // 3 consecutive declining months
  if (recent.length === 3 && recent[0].revenue > recent[1].revenue && recent[1].revenue > recent[2].revenue)
    alerts.push({ type: "error", icon: "🔻", title: "3 Consecutive Months of Decline", detail: "Sales have dropped each of the past 3 months. Investigate lost customers, channel mix, or local competition." });

  // ── Critical threshold alerts (user-defined) ──────────────────────────
  // Food cost > 30% → CRITICAL
  if (avgFood > 30)
    alerts.push({ type: "error", icon: "🍖", title: `🚨 Food Cost CRITICAL — ${avgFood.toFixed(1)}% (Threshold: 30%)`, detail: `Average monthly food cost is ${avgFood.toFixed(1)}% of revenue, exceeding the 30% critical threshold. Immediately audit vendor pricing, portion sizes, waste logs, and invoice accuracy. Target: ≤ 28%.` });

  // Labor cost > 33% → CRITICAL
  if (avgLabor > 33)
    alerts.push({ type: "error", icon: "👥", title: `🚨 Labor Cost CRITICAL — ${avgLabor.toFixed(1)}% (Threshold: 33%)`, detail: `Average monthly labor is ${avgLabor.toFixed(1)}% of revenue, exceeding the 33% critical threshold. Review overtime, scheduling efficiency, and staff-to-sales ratios. Target: ≤ 28%.` });
  else if (avgLabor > 28)
    alerts.push({ type: "warning", icon: "👥", title: `Labor Cost Elevated — ${avgLabor.toFixed(1)}%`, detail: "Labor is approaching the 33% critical threshold. Optimise shift scheduling based on peak-hour sales patterns." });

  // Infrastructure cost > 18% → CRITICAL
  if (avgInfra > 18)
    alerts.push({ type: "error", icon: "🏠", title: `🚨 Infrastructure Cost CRITICAL — ${avgInfra.toFixed(1)}% (Threshold: 18%)`, detail: `Infrastructure costs are ${avgInfra.toFixed(1)}% of revenue, exceeding the 18% threshold. Review rent terms, renegotiate utility contracts, and identify fixed-cost reduction opportunities.` });
  else if (avgInfra > 12)
    alerts.push({ type: "warning", icon: "🏠", title: `Infrastructure Cost Elevated — ${avgInfra.toFixed(1)}%`, detail: "Infrastructure costs are high. Review lease terms and utility accounts before they breach the 18% critical limit." });

  // Prime cost
  if (primeCost > 65) alerts.push({ type: "error", icon: "⚠️", title: "Prime Cost Danger Zone (" + primeCost.toFixed(0) + "%)", detail: "Food + Labor exceeds 65% of revenue. Very little left for overhead and profit." });

  // Low revenue month
  if (lastMonth && lastMonth.revenue < avgRev * 0.75)
    alerts.push({ type: "warning", icon: "📊", title: "Recent Month Below Historical Average", detail: `Last month was ${pct(lastMonth.revenue, avgRev)} of the historical average. Check for seasonality or operational issues.` });

  // Positive signals
  if (projSlope > 1000) alerts.push({ type: "info", icon: "📈", title: "Strong Growth Momentum", detail: `Sales growing ~${fmtUSD(projSlope)}/mo on average. Sustain with loyalty programs and capacity planning.` });
  if (primeCost > 0 && primeCost <= 55) alerts.push({ type: "info", icon: "✅", title: "Prime Cost Healthy (" + primeCost.toFixed(0) + "%)", detail: "Food + Labor well within benchmark. Room to invest in marketing or quality upgrades." });

  return alerts;
}

/* ─── Recommendations ────────────────────────────────────────── */
interface Rec { icon: string; title: string; detail: string; impact: "High" | "Medium" | "Low"; }
function buildRecs(months: MonthBucket[]): Rec[] {
  const recs: Rec[] = [];
  if (months.length === 0) return recs;

  const totals = months.reduce((s, m) => ({
    rev: s.rev + m.revenue, food: s.food + m.foodCost, labor: s.labor + m.laborCost,
    catering: s.catering + m.catering, aggr: s.aggr + m.aggregatorNet,
    pos: s.pos + m.posSales, cash: s.cash + m.cashSales,
  }), { rev: 0, food: 0, labor: 0, catering: 0, aggr: 0, pos: 0, cash: 0 });

  const foodPct   = totals.rev > 0 ? (totals.food / totals.rev) * 100 : 0;
  const cateringPct = totals.rev > 0 ? (totals.catering / totals.rev) * 100 : 0;
  const aggrPct   = totals.rev > 0 ? (totals.aggr / totals.rev) * 100 : 0;
  const laborPct  = totals.rev > 0 ? (totals.labor / totals.rev) * 100 : 0;

  // Catering opportunity
  if (cateringPct < 10)
    recs.push({ icon: "🍽️", impact: "High", title: "Grow Catering Revenue", detail: "Catering is only " + cateringPct.toFixed(0) + "% of sales. Corporate catering and event bookings can add 15–25% incremental revenue with higher margins." });

  // Aggregator over-reliance
  if (aggrPct > 40)
    recs.push({ icon: "📱", impact: "High", title: "Reduce Aggregator Dependency", detail: `${aggrPct.toFixed(0)}% of sales flow through third-party apps at ~30% commission. Launch a direct ordering website or loyalty app to recover that margin.` });

  // High food cost
  if (foodPct > 33)
    recs.push({ icon: "🛒", impact: "High", title: "Vendor Contract Renegotiation", detail: "Food cost at " + foodPct.toFixed(0) + "%. Consolidate suppliers, negotiate volume discounts, and implement weekly waste logs. Target sub-32%." });

  // Labor optimization
  if (laborPct > 28)
    recs.push({ icon: "📅", impact: "Medium", title: "Smart Scheduling Optimisation", detail: "Use sales-per-hour data to match staffing to demand. Cross-train staff to cover multiple roles during slow periods." });

  // Online presence
  recs.push({ icon: "⭐", impact: "Medium", title: "Leverage Google & Yelp Reviews", detail: "Restaurants with 4.5+ star ratings see 18% more foot traffic. Proactively request reviews from satisfied dine-in customers." });

  // Happy hour / upsell
  recs.push({ icon: "🕐", impact: "Medium", title: "Introduce Happy Hour / Off-Peak Promotions", detail: "Fill off-peak hours (2–5 PM) with lunch specials or biriyani combos to increase average daily covers without adding staff." });

  // Loyalty
  recs.push({ icon: "🎁", impact: "Medium", title: "Launch Customer Loyalty Program", detail: "A points-based loyalty program increases visit frequency by 20–25%. Even a simple punch-card for dine-in builds retention." });

  // Aggregator menu optimization
  if (aggrPct > 15)
    recs.push({ icon: "🖼️", impact: "Low", title: "Optimise Aggregator Menu Photos & Pricing", detail: "High-quality photos can increase aggregator conversion by 30%. Review item pricing to offset delivery commissions." });

  // Upsell
  recs.push({ icon: "💬", impact: "Low", title: "Staff Upselling Training", detail: "Train staff to suggest add-ons (raita, extra naan, desserts). Even a $3 add-on per table significantly improves check average." });

  return recs;
}

/* ─── Main Component ─────────────────────────────────────────── */
export default function AnalyticsPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const { ready, role, fullAccess } = useAuthGuard();

  // Restricted managers (no full_access) are not permitted to view analytics
  useEffect(() => {
    if (ready && role === "manager" && !fullAccess) router.replace(`/location/${id}`);
  }, [ready, role, fullAccess, id, router]);

  const [locationName, setLocationName] = useState("");
  const [lookback, setLookback] = useState(12); // months
  const [months, setMonths] = useState<MonthBucket[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<"overview" | "costs" | "predict">("overview");

  useEffect(() => {
    supabase.from("locations").select("name").eq("id", id).single()
      .then(({ data }) => setLocationName(data?.name ?? ""));
  }, [id]);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    const startDate = new Date();
    startDate.setMonth(startDate.getMonth() - lookback);
    const start = startDate.toISOString().slice(0, 10);
    const startMonth = start.slice(0, 7) + "-01";

    const [salesRes, foodRes, hourlyRes, salariedRes, bohRes, infraRes, taxRes] = await Promise.all([
      supabase.from("daily_sales")
        .select("sale_date,cash_sales,pos_sales,uber_eats_gross,grubhub_gross,doordash_gross,catering_sales,cash_tips")
        .eq("location_id", id).gte("sale_date", start).order("sale_date"),
      supabase.from("food_deliveries")
        .select("delivery_date,amount")
        .eq("location_id", id).gte("delivery_date", start),
      supabase.from("foh_hourly_hours")
        .select("work_date,hours_worked,overtime_hours,foh_hourly_staff!inner(hourly_rate,location_id)")
        .eq("foh_hourly_staff.location_id", id).gte("work_date", start),
      supabase.from("foh_salaried_staff")
        .select("monthly_salary")
        .eq("location_id", id).eq("active", true),
      supabase.from("boh_staff")
        .select("pay_type,pay_rate")
        .eq("location_id", id).eq("active", true),
      supabase.from("monthly_infrastructure")
        .select("month,rent,utilities,insurance,staff_accommodation,staff_accom_utilities,car_payment,gas_expenses,phone,store_internet,trash,repairs_maintenance,pest_control,marketing_fee,bank_charges,pos_charges,credit_card_fee")
        .eq("location_id", id).gte("month", startMonth),
      supabase.from("monthly_payroll_taxes")
        .select("month,payroll_tax_amount,workers_comp_amount,benefits_amount")
        .eq("location_id", id).gte("month", startMonth),
    ]);

    const salesRows    = (salesRes.data ?? []) as DayRow[];
    const foodRows     = (foodRes.data ?? []) as FoodRow[];
    const hourlyRows   = (hourlyRes.data ?? []) as any[] as HourlyHoursRow[];
    const salariedRows = (salariedRes.data ?? []) as SalariedRow[];
    const bohRows      = (bohRes.data ?? []) as BOHRow[];
    const infraRows    = (infraRes.data ?? []) as InfraRow[];
    const taxRows      = (taxRes.data ?? []) as TaxRow[];

    // Fixed monthly labor components (same each month for active staff)
    const fixedSalariedPerMonth = salariedRows.reduce((s, r) => s + num(r.monthly_salary), 0);
    const fixedBOHPerMonth      = bohRows.filter(r => r.pay_type === "salary").reduce((s, r) => s + num(r.pay_rate), 0);

    // Build month keys ONLY from operational data (sales/food/labor) — not from infra/tax alone
    // This prevents phantom months where only overhead exists but the restaurant wasn't operating
    const keys = new Set<string>();
    salesRows.forEach(r => keys.add(monthKey(r.sale_date)));
    foodRows.forEach(r => keys.add(monthKey(r.delivery_date)));
    hourlyRows.forEach(r => r.work_date && keys.add(monthKey(r.work_date)));

    const sortedKeys = Array.from(keys).sort();

    const buckets: MonthBucket[] = sortedKeys.map(key => {
      const mSales  = salesRows.filter(r => monthKey(r.sale_date) === key);
      const mFood   = foodRows.filter(r => monthKey(r.delivery_date) === key);
      const mHourly = hourlyRows.filter(r => r.work_date && monthKey(r.work_date) === key);
      const mInfra  = infraRows.find(r => monthKey(r.month) === key);
      const mTax    = taxRows.find(r => monthKey(r.month) === key);

      const cashSales     = mSales.reduce((s, r) => s + num(r.cash_sales), 0);
      const posSales      = mSales.reduce((s, r) => s + num(r.pos_sales), 0);
      const aggregatorNet = mSales.reduce((s, r) => s + (num(r.uber_eats_gross) + num(r.grubhub_gross) + num(r.doordash_gross)) * 0.7, 0);
      const catering      = mSales.reduce((s, r) => s + num(r.catering_sales), 0);
      const cashTips      = mSales.reduce((s, r) => s + num(r.cash_tips), 0);
      const revenue       = cashSales + posSales + aggregatorNet + catering + cashTips;

      const foodCost     = mFood.reduce((s, r) => s + num(r.amount), 0);
      const hourlyCost   = mHourly.reduce((s, r) => {
        const rate = num((r.foh_hourly_staff as any)?.hourly_rate);
        return s + num(r.hours_worked) * rate + num(r.overtime_hours) * rate * 1.5;
      }, 0);
      // Only count fixed salary/BOH if there is sales data for this month (i.e., active month)
      const hasSales     = mSales.length > 0 || mFood.length > 0 || mHourly.length > 0;
      const salariedCost = hasSales ? fixedSalariedPerMonth : 0;
      const bohCost      = hasSales ? fixedBOHPerMonth : 0;
      const taxCost      = mTax ? num(mTax.payroll_tax_amount) + num(mTax.workers_comp_amount) + num(mTax.benefits_amount) : 0;
      const laborCost    = hourlyCost + salariedCost + bohCost + taxCost;

      const infraCost  = mInfra ? (
        num(mInfra.rent) + num(mInfra.utilities) + num(mInfra.insurance) +
        num(mInfra.staff_accommodation) + num(mInfra.staff_accom_utilities) +
        num(mInfra.car_payment) + num(mInfra.gas_expenses) + num(mInfra.phone) +
        num(mInfra.store_internet) + num(mInfra.trash) + num(mInfra.repairs_maintenance) +
        num(mInfra.pest_control) + num(mInfra.marketing_fee) + num(mInfra.bank_charges) +
        num(mInfra.pos_charges) + num(mInfra.credit_card_fee)
      ) : 0;
      const totalCost  = foodCost + laborCost + infraCost;
      const netProfit  = revenue - totalCost;

      const foodPct      = revenue > 0 ? (foodCost / revenue) * 100 : 0;
      const laborPct     = revenue > 0 ? (laborCost / revenue) * 100 : 0;
      const infraPct     = revenue > 0 ? (infraCost / revenue) * 100 : 0;
      const primeCostPct = foodPct + laborPct;

      // Loss reason: what drove the loss?
      let lossReason: string | null = null;
      if (netProfit < 0) {
        const reasons: string[] = [];
        if (primeCostPct > 65) reasons.push(`Prime cost ${primeCostPct.toFixed(0)}% (food+labor ate ${primeCostPct.toFixed(0)}¢ of every dollar)`);
        else if (primeCostPct > 58) reasons.push(`Elevated prime cost ${primeCostPct.toFixed(0)}%`);
        if (foodPct > 33) reasons.push(`Food cost ${foodPct.toFixed(0)}% — commodity price spike`);
        if (laborPct > 33) reasons.push(`Labor ${laborPct.toFixed(0)}% — overstaffed vs sales`);
        if (infraPct > 18) reasons.push(`Infrastructure ${infraPct.toFixed(0)}% — one-time or recurring overhead`);
        lossReason = reasons.length > 0 ? reasons.join(" · ") : "Revenue insufficient to cover costs";
      }

      return {
        key, label: monthLabel(key),
        revenue, foodCost, laborCost, infraCost, taxCost,
        totalCost, netProfit,
        primeCostPct, foodPct, laborPct, infraPct, lossReason,
        cashSales, posSales, aggregatorNet, catering, cashTips,
      };
    });

    setMonths(buckets);
    setLoading(false);
  }, [id, lookback, supabase]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  /* ─ Derived stats ─ */
  const totalRevenue  = months.reduce((s, m) => s + m.revenue, 0);
  const totalFood     = months.reduce((s, m) => s + m.foodCost, 0);
  const totalLabor    = months.reduce((s, m) => s + m.laborCost, 0);
  const totalInfra    = months.reduce((s, m) => s + m.infraCost, 0);
  const totalTax      = months.reduce((s, m) => s + m.taxCost, 0); // included in laborCost already
  const totalCosts    = totalFood + totalLabor + totalInfra;
  const totalProfit   = totalRevenue - totalCosts;

  // Loss months for the loss analysis section
  const lossMonths = months.filter(m => m.netProfit < 0 && m.revenue > 0);
  const avgRevenue = months.filter(m => m.revenue > 0).reduce((s, m) => s + m.revenue, 0) / (months.filter(m => m.revenue > 0).length || 1);
  const avgPrimeCost = months.filter(m => m.revenue > 0).reduce((s, m) => s + m.primeCostPct, 0) / (months.filter(m => m.revenue > 0).length || 1);

  // Quarterly grouping (group by quarter within the data range)
  const quarterlyData = (() => {
    const qMap = new Map<string, { label: string; months: MonthBucket[] }>();
    months.forEach(m => {
      const [y, mo] = m.key.split("-").map(Number);
      const q = Math.ceil(mo / 3);
      const qKey = `${y}-Q${q}`;
      if (!qMap.has(qKey)) qMap.set(qKey, { label: `Q${q} ${y}`, months: [] });
      qMap.get(qKey)!.months.push(m);
    });
    return Array.from(qMap.entries()).map(([, v]) => {
      const rev   = v.months.reduce((s, m) => s + m.revenue, 0);
      const food  = v.months.reduce((s, m) => s + m.foodCost, 0);
      const labor = v.months.reduce((s, m) => s + m.laborCost, 0);
      const infra = v.months.reduce((s, m) => s + m.infraCost, 0);
      const profit = rev - food - labor - infra;
      const primePct = rev > 0 ? ((food + labor) / rev) * 100 : 0;
      return {
        label: v.label,
        revenue: rev,
        food, labor, infra, profit,
        primePct,
        foodPct: rev > 0 ? (food / rev) * 100 : 0,
        laborPct: rev > 0 ? (labor / rev) * 100 : 0,
        infraPct: rev > 0 ? (infra / rev) * 100 : 0,
        netMarginPct: rev > 0 ? (profit / rev) * 100 : 0,
        isLoss: profit < 0,
      };
    });
  })();

  const revHistory    = months.map(m => m.revenue);
  const { slope, intercept } = linReg(revHistory);

  // Forecast: next 3 months
  const forecasts = [1, 2, 3].map(i => {
    const x = revHistory.length - 1 + i;
    const predicted = Math.max(0, intercept + slope * x);
    const d = new Date();
    d.setMonth(d.getMonth() + i);
    return {
      label: d.toLocaleDateString("en-US", { month: "short", year: "2-digit" }),
      predicted, isForecast: true,
    };
  });

  const trendData = [
    ...months.map(m => ({ label: m.label, revenue: m.revenue, totalCost: m.totalCost, netProfit: m.netProfit, isForecast: false })),
    ...forecasts.map(f => ({ label: f.label + "*", revenue: undefined, predicted: f.predicted, isForecast: true })),
  ];

  const alerts = detectPitfalls(months, slope);
  const recs   = buildRecs(months);

  const LOOKBACKS = [
    { val: 6, label: "6 Mo" }, { val: 12, label: "12 Mo" },
    { val: 24, label: "24 Mo" }, { val: 36, label: "36 Mo" },
  ];
  const TABS = [
    { key: "overview", label: "📊 Financial Health" },
    { key: "costs",    label: "💸 Cost Breakdown" },
    { key: "predict",  label: "🔮 Predictions" },
  ] as const;

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (!active || !payload?.length) return null;
    return (
      <div className="bg-white border border-gray-200 rounded-xl shadow-lg p-3 text-xs min-w-[170px]">
        <p className="font-semibold text-gray-800 mb-1.5">{label}</p>
        {payload.map((p: any) => p.value != null && (
          <div key={p.dataKey} className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: p.color }} />
              <span className="text-gray-500">{p.name}</span>
            </div>
            <span className="font-semibold">{fmtUSD(p.value)}</span>
          </div>
        ))}
      </div>
    );
  };

  const costPieData = [
    { name: "Food Cost",      value: totalFood,  color: "#e07b39" },
    { name: "Labor",          value: totalLabor, color: "#6366f1" },
    { name: "Infrastructure", value: totalInfra, color: "#0ea5e9" },
  ].filter(d => d.value > 0);

  const channelPieData = [
    { name: "Cash Sales",     value: months.reduce((s,m)=>s+m.cashSales,0),     color: CHANNEL_COLORS.cashSales },
    { name: "POS Sales",      value: months.reduce((s,m)=>s+m.posSales,0),      color: CHANNEL_COLORS.posSales  },
    { name: "Aggregator Net", value: months.reduce((s,m)=>s+m.aggregatorNet,0), color: "#374151"                },
    { name: "Catering",       value: months.reduce((s,m)=>s+m.catering,0),      color: CHANNEL_COLORS.catering  },
    { name: "Cash Tips",      value: months.reduce((s,m)=>s+m.cashTips,0),      color: CHANNEL_COLORS.cashTips  },
  ].filter(d => d.value > 0);

  /* ─ Benchmark gauge ─ */
  const foodPctNum  = totalRevenue > 0 ? (totalFood  / totalRevenue) * 100 : 0;
  const laborPctNum = totalRevenue > 0 ? (totalLabor / totalRevenue) * 100 : 0;
  const infraPctNum = totalRevenue > 0 ? (totalInfra / totalRevenue) * 100 : 0;
  const primeCost   = foodPctNum + laborPctNum;
  const netMargin   = totalRevenue > 0 ? (totalProfit / totalRevenue) * 100 : 0;

  function benchmarkColor(val: number, good: number, warn: number) {
    if (val === 0) return "#d1d5db";
    return val <= good ? "#16a34a" : val <= warn ? "#d97706" : "#dc2626";
  }

  if (!ready) return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="w-8 h-8 border-2 border-teal-400 border-t-transparent rounded-full animate-spin" />
    </div>
  );

  return (
    <div className="min-h-screen" style={{ background: "#060b18" }}>
      {/* Nav */}
      <nav className="bg-white border-b border-gray-200 px-4 h-14 flex items-center gap-3 sticky top-0 z-10 shadow-sm">
        <Link href={`/location/${id}`} className="text-sm text-gray-500 hover:text-gray-900">←</Link>
        <span className="font-semibold text-gray-900">{locationName} — Financial Analytics</span>
        <div className="ml-auto flex items-center gap-2">
          <PrintPDFButton title={`Analytics-${locationName}`} />
        </div>
      </nav>

      <main className="max-w-6xl mx-auto px-4 py-6 space-y-5" id="print-area">

        {/* Controls */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex gap-1 bg-white rounded-xl p-1 shadow-sm border border-gray-200">
            {TABS.map(t => (
              <button key={t.key} onClick={() => setActiveTab(t.key)}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                  activeTab === t.key ? "text-white shadow" : "text-gray-500 hover:text-gray-700"
                }`}
                style={activeTab === t.key ? { background: "linear-gradient(135deg,#00b896,#00d4a8)" } : {}}>
                {t.label}
              </button>
            ))}
          </div>
          <div className="flex gap-1 bg-white rounded-xl p-1 shadow-sm border border-gray-200">
            {LOOKBACKS.map(l => (
              <button key={l.val} onClick={() => setLookback(l.val)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                  lookback === l.val ? "text-white shadow" : "text-gray-500 hover:text-gray-700"
                }`}
                style={lookback === l.val ? { background: "rgba(0,212,168,0.15)" } : {}}>
                {l.label}
              </button>
            ))}
          </div>
        </div>

        {loading ? (
          <div className="text-center py-24 text-gray-400 text-sm">Loading financial data…</div>
        ) : months.length === 0 ? (
          <div className="text-center py-24 text-gray-400 text-sm bg-white rounded-2xl border border-gray-200">
            No data found for this period. Enter daily sales, food deliveries and costs first.
          </div>
        ) : (
          <>
            {/* ══ TAB: Financial Health ══════════════════════════════════ */}
            {activeTab === "overview" && (
              <div className="space-y-5">
                {/* KPI strip */}
                <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                  <KPI label="Total Revenue"   value={fmtUSD(totalRevenue)} color="#16a34a" />
                  <KPI label="Food Cost"        value={fmtUSD(totalFood)}    sub={pct(totalFood, totalRevenue)}   color="#e07b39" />
                  <KPI label="Labor"            value={fmtUSD(totalLabor)}   sub={pct(totalLabor, totalRevenue)}  color="#6366f1" />
                  <KPI label="Infrastructure"   value={fmtUSD(totalInfra)}   sub={pct(totalInfra, totalRevenue)}  color="#0ea5e9" />
                  <KPI label="Net Profit"       value={fmtUSD(totalProfit)}  sub={pct(totalProfit, totalRevenue)}
                    color={totalProfit >= 0 ? "#16a34a" : "#dc2626"} />
                </div>

                {/* ── Loss month analysis ── */}
                {lossMonths.length > 0 && (
                  <div className="rounded-2xl p-5 space-y-4" style={{ background: "#fff7f7", border: "1.5px solid #fecaca" }}>
                    <div className="flex items-center gap-2">
                      <span className="text-xl">🚨</span>
                      <div>
                        <h3 className="font-bold text-red-700">Loss Month{lossMonths.length > 1 ? "s" : ""} Detected — Here's Why</h3>
                        <p className="text-xs text-red-400 mt-0.5">Loss occurs when prime costs (food + labor) are disproportionate to revenue, or revenue drops while costs stay fixed.</p>
                      </div>
                    </div>
                    {lossMonths.map(m => (
                      <div key={m.key} className="rounded-xl p-4" style={{ background: "#fef2f2", border: "1px solid #fca5a5" }}>
                        <div className="flex items-start justify-between gap-4 mb-3">
                          <div>
                            <p className="font-bold text-red-700 text-base">{m.label} — <span className="text-red-600">{fmtUSD(m.netProfit)} loss</span></p>
                            <p className="text-xs text-red-400 mt-0.5">{m.lossReason}</p>
                          </div>
                          <div className="text-right flex-shrink-0">
                            <p className="text-xs text-gray-500">Revenue</p>
                            <p className="font-bold text-gray-800">{fmtUSD(m.revenue)}</p>
                            <p className="text-[10px] text-gray-400">{m.revenue < avgRevenue * 0.95 ? `▼ ${((1 - m.revenue/avgRevenue)*100).toFixed(0)}% below avg` : "Near avg"}</p>
                          </div>
                        </div>
                        <div className="grid grid-cols-3 gap-2">
                          {[
                            { label: "Food Cost", val: m.foodPct, threshold: 30, amount: m.foodCost },
                            { label: "Labor",     val: m.laborPct, threshold: 33, amount: m.laborCost },
                            { label: "Prime Cost",val: m.primeCostPct, threshold: 59, amount: m.foodCost + m.laborCost },
                          ].map(g => {
                            const over = g.val > g.threshold;
                            return (
                              <div key={g.label} className="rounded-lg p-2.5 text-center" style={{ background: over ? "#fef2f2" : "#f0fdf4", border: `1px solid ${over ? "#fca5a5" : "#bbf7d0"}` }}>
                                <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide">{g.label}</p>
                                <p className="text-base font-bold mt-0.5" style={{ color: over ? "#dc2626" : "#16a34a" }}>{g.val.toFixed(1)}%</p>
                                <p className="text-[10px] text-gray-400">{fmtUSD(g.amount)}</p>
                                {over && <p className="text-[9px] font-bold mt-0.5" style={{ color: "#dc2626" }}>▲ {(g.val - g.threshold).toFixed(1)}% over target</p>}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* ── Quarterly health comparison ── */}
                {quarterlyData.length >= 2 && (
                  <div className="bg-white rounded-2xl shadow-sm p-5 border border-gray-100">
                    <h3 className="font-bold text-gray-900 mb-1">Quarterly Financial Health</h3>
                    <p className="text-xs text-gray-400 mb-4">Prime cost % and margins compared quarter by quarter — where did money go wrong?</p>
                    <div className="grid gap-3" style={{ gridTemplateColumns: `repeat(${quarterlyData.length}, 1fr)` }}>
                      {quarterlyData.map(q => (
                        <div key={q.label} className="rounded-xl p-4 relative" style={{
                          background: q.isLoss ? "#fff7f7" : q.netMarginPct > 18 ? "#f0fdf4" : "rgba(255,255,255,0.7)",
                          border: `1.5px solid ${q.isLoss ? "#fca5a5" : q.netMarginPct > 18 ? "#86efac" : "#e5e7eb"}`,
                        }}>
                          {q.isLoss && <span className="absolute top-2 right-2 text-xs font-bold text-red-500 bg-red-50 border border-red-200 rounded-full px-2 py-0.5">LOSS</span>}
                          <p className="font-bold text-gray-800 text-sm">{q.label}</p>
                          <p className="text-lg font-bold mt-1" style={{ color: q.isLoss ? "#dc2626" : "#16a34a" }}>{fmtUSD(q.revenue)}</p>
                          <p className="text-xs text-gray-400">revenue</p>
                          <div className="mt-3 space-y-1.5">
                            {[
                              { label: "Food", pct: q.foodPct, threshold: 30, color: "#e07b39" },
                              { label: "Labor", pct: q.laborPct, threshold: 33, color: "#6366f1" },
                              { label: "Prime", pct: q.primePct, threshold: 59, color: "#dc2626", bold: true },
                              { label: "Net", pct: q.netMarginPct, threshold: 0, color: q.isLoss ? "#dc2626" : "#16a34a", invert: true },
                            ].map(row => (
                              <div key={row.label} className="flex items-center justify-between">
                                <span className="text-[10px] text-gray-500 font-medium w-10">{row.label}</span>
                                <div className="flex-1 mx-2 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                                  <div className="h-full rounded-full" style={{
                                    width: Math.min(100, Math.abs(row.pct)) + "%",
                                    background: row.invert
                                      ? (row.pct >= 10 ? "#16a34a" : row.pct >= 0 ? "#d97706" : "#dc2626")
                                      : (row.pct > row.threshold * 1.1 ? "#dc2626" : row.pct > row.threshold ? "#d97706" : row.color),
                                  }} />
                                </div>
                                <span className={`text-[10px] font-bold w-10 text-right ${row.invert ? (row.pct < 0 ? "text-red-600" : "text-green-700") : (row.pct > row.threshold ? "text-red-600" : "text-gray-700")}`}>
                                  {row.pct > 0 ? row.pct.toFixed(1) : row.pct.toFixed(1)}%
                                </span>
                              </div>
                            ))}
                          </div>
                          <p className="mt-2 text-[10px] font-bold" style={{ color: q.isLoss ? "#dc2626" : q.netMarginPct > 18 ? "#16a34a" : "#6b7280" }}>
                            Net: {fmtUSD(q.profit)} ({q.netMarginPct.toFixed(1)}%)
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Benchmark gauges */}
                <div className="bg-white rounded-2xl shadow-sm p-5 border border-gray-100">
                  <h3 className="font-bold text-gray-900 mb-1">Financial Health Benchmarks</h3>
                  <p className="text-xs text-gray-400 mb-4">Compared against restaurant industry standards</p>
                  <div className="grid sm:grid-cols-2 gap-4">
                    {[
                      { label:"Food Cost %",      val: foodPctNum,  good: 28, warn: 30,  benchmark:"< 30% (critical)", ideal: 28 },
                      { label:"Labor Cost %",     val: laborPctNum, good: 28, warn: 33,  benchmark:"< 33% (critical)", ideal: 28 },
                      { label:"Prime Cost %",     val: primeCost,   good: 58, warn: 65,  benchmark:"< 65%",             ideal: 58 },
                      { label:"Net Margin %",     val: netMargin,   good: 10, warn: 5,   benchmark:"8–15%",             ideal: 12, invert: true },
                      { label:"Infrastructure %", val: infraPctNum, good: 12, warn: 18,  benchmark:"< 18% (critical)", ideal: 10 },
                    ].map(g => {
                      const col = g.invert
                        ? (g.val >= g.good ? "#16a34a" : g.val >= g.warn ? "#d97706" : "#dc2626")
                        : benchmarkColor(g.val, g.good, g.warn);
                      const barW = Math.min(100, Math.abs(g.val));
                      return (
                        <div key={g.label}>
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-xs font-semibold text-gray-600">{g.label}</span>
                            <div className="flex items-center gap-2">
                              <span className="text-xs text-gray-400">Benchmark: {g.benchmark}</span>
                              <span className="text-xs font-bold px-2 py-0.5 rounded-full text-white"
                                style={{ background: col }}>{g.val > 0 ? g.val.toFixed(1) + "%" : "—"}</span>
                            </div>
                          </div>
                          <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                            <div className="h-full rounded-full transition-all" style={{ width: barW + "%", background: col }} />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Revenue vs Cost vs Profit trend */}
                <div className="bg-white rounded-2xl shadow-sm p-5 border border-gray-100">
                  <h3 className="font-bold text-gray-900 mb-1">Revenue vs Total Costs vs Net Profit</h3>
                  <p className="text-xs text-gray-400 mb-4">Monthly comparison — gap between revenue and cost lines is your profit</p>
                  <ResponsiveContainer width="100%" height={300}>
                    <ComposedChart data={months} margin={{ top: 4, right: 12, left: 0, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
                      <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                      <YAxis tickFormatter={fmtK} tick={{ fontSize: 11 }} />
                      <Tooltip content={<CustomTooltip />} />
                      <Legend iconType="circle" iconSize={8} />
                      <Area type="monotone" dataKey="revenue"   name="Revenue"    fill="#dcfce7" stroke="#16a34a" strokeWidth={2.5} fillOpacity={0.3} />
                      <Area type="monotone" dataKey="totalCost" name="Total Cost" fill="#fee2e2" stroke="#dc2626" strokeWidth={2}   fillOpacity={0.2} />
                      <Line type="monotone" dataKey="netProfit" name="Net Profit" stroke="#6366f1" strokeWidth={2}
                        dot={{ r: 3, fill: "#6366f1" }} activeDot={{ r: 5 }} strokeDasharray="none" />
                    </ComposedChart>
                  </ResponsiveContainer>
                </div>

                {/* Channel mix */}
                <div className="grid md:grid-cols-2 gap-4">
                  <div className="bg-white rounded-2xl shadow-sm p-5 border border-gray-100">
                    <h3 className="font-bold text-gray-900 mb-4">Revenue Mix by Channel</h3>
                    <div className="flex items-center gap-4">
                      <ResponsiveContainer width={160} height={160}>
                        <PieChart>
                          <Pie data={channelPieData} cx="50%" cy="50%" innerRadius={45} outerRadius={70} dataKey="value" paddingAngle={3}>
                            {channelPieData.map((c, i) => <Cell key={i} fill={c.color} />)}
                          </Pie>
                          <Tooltip formatter={(v) => fmtUSD(Number(v))} />
                        </PieChart>
                      </ResponsiveContainer>
                      <div className="flex-1 space-y-2">
                        {channelPieData.map(c => (
                          <div key={c.name} className="flex items-center gap-2">
                            <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: c.color }} />
                            <span className="text-xs text-gray-600 flex-1">{c.name}</span>
                            <span className="text-xs font-bold">{totalRevenue > 0 ? ((c.value / totalRevenue) * 100).toFixed(1) + "%" : "—"}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* Monthly P&L table */}
                  <div className="bg-white rounded-2xl shadow-sm overflow-hidden border border-gray-100">
                    <div className="px-4 py-3 border-b border-gray-100" style={{ background:"#fdf8f2" }}>
                      <h3 className="text-sm font-bold text-gray-800">Monthly P&L Summary</h3>
                    </div>
                    <div className="overflow-y-auto max-h-[260px]">
                      <table className="w-full text-xs">
                        <thead className="sticky top-0 bg-gray-50">
                          <tr>
                            <th className="text-left px-3 py-2 font-semibold text-gray-500">Month</th>
                            <th className="text-right px-3 py-2 font-semibold text-gray-500">Revenue</th>
                            <th className="text-right px-3 py-2 font-semibold text-gray-500">Costs</th>
                            <th className="text-right px-3 py-2 font-semibold text-gray-500">Profit</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-50">
                          {[...months].reverse().map(m => (
                            <tr key={m.key} className="hover:bg-teal-950/30/30">
                              <td className="px-3 py-2 text-gray-700 font-medium">{m.label}</td>
                              <td className="px-3 py-2 text-right text-green-700 font-semibold">{m.revenue > 0 ? fmtUSD(m.revenue) : "—"}</td>
                              <td className="px-3 py-2 text-right text-red-500">{m.totalCost > 0 ? fmtUSD(m.totalCost) : "—"}</td>
                              <td className={`px-3 py-2 text-right font-bold ${m.netProfit >= 0 ? "text-green-700" : "text-red-600"}`}>
                                {m.revenue > 0 ? fmtUSD(m.netProfit) : "—"}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* ══ TAB: Cost Breakdown ═══════════════════════════════════ */}
            {activeTab === "costs" && (
              <div className="space-y-5">
                {/* Cost KPIs */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <CostKPI label="Food Cost"      value={fmtUSD(totalFood)}  pct={foodPctNum}  benchmark="28–30%" color="#e07b39" />
                  <CostKPI label="Labor (incl. taxes)" value={fmtUSD(totalLabor)} pct={laborPctNum} benchmark="28–33%" color="#6366f1" />
                  <CostKPI label="Infrastructure" value={fmtUSD(totalInfra)} pct={infraPctNum} benchmark="18% max" color="#0ea5e9" />
                  <CostKPI label="Prime Cost"     value={fmtUSD(totalFood + totalLabor)} pct={foodPctNum + laborPctNum} benchmark="< 65%" color="#dc2626" />
                </div>

                {/* Cost structure pie */}
                <div className="grid md:grid-cols-2 gap-4">
                  <div className="bg-white rounded-2xl shadow-sm p-5 border border-gray-100">
                    <h3 className="font-bold text-gray-900 mb-4">Cost Structure</h3>
                    <div className="flex items-center gap-4">
                      <ResponsiveContainer width={160} height={160}>
                        <PieChart>
                          <Pie data={costPieData} cx="50%" cy="50%" innerRadius={45} outerRadius={70} dataKey="value" paddingAngle={3}>
                            {costPieData.map((c, i) => <Cell key={i} fill={c.color} />)}
                          </Pie>
                          <Tooltip formatter={(v) => fmtUSD(Number(v))} />
                        </PieChart>
                      </ResponsiveContainer>
                      <div className="flex-1 space-y-2">
                        {costPieData.map(c => (
                          <div key={c.name} className="flex items-center gap-2">
                            <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: c.color }} />
                            <span className="text-xs text-gray-600 flex-1">{c.name}</span>
                            <span className="text-xs font-bold">{totalCosts > 0 ? ((c.value / totalCosts) * 100).toFixed(1) + "%" : "—"}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* Cost detail table */}
                  <div className="bg-white rounded-2xl shadow-sm overflow-hidden border border-gray-100">
                    <div className="px-4 py-3 border-b border-gray-100" style={{ background:"#fdf8f2" }}>
                      <h3 className="text-sm font-bold text-gray-800">Cost Category Detail</h3>
                    </div>
                    <table className="w-full text-xs">
                      <tbody className="divide-y divide-gray-50">
                        {[
                          { label:"Food Cost",           val: totalFood,  pct: foodPctNum,  color:"#e07b39" },
                          { label:"Labor (incl. taxes)", val: totalLabor, pct: laborPctNum, color:"#6366f1" },
                          { label:"Infrastructure",      val: totalInfra, pct: infraPctNum, color:"#0ea5e9" },
                          { label:"Prime Cost",          val: totalFood + totalLabor, pct: foodPctNum + laborPctNum, color:"#dc2626" },
                          { label:"Total Costs",         val: totalCosts, pct: totalRevenue>0?(totalCosts/totalRevenue)*100:0, color:"#374151" },
                          { label:"Net Profit",          val: totalProfit, pct: netMargin, color: totalProfit>=0?"#16a34a":"#dc2626" },
                        ].map(row => (
                          <tr key={row.label} className={row.label === "Total Costs" || row.label === "Net Profit" ? "bg-gray-50 font-bold" : ""}>
                            <td className="px-4 py-2.5 flex items-center gap-2">
                              <span className="w-2 h-2 rounded-full" style={{ background: row.color }} />
                              <span style={{ color: row.color }}>{row.label}</span>
                            </td>
                            <td className="px-3 py-2.5 text-right font-semibold">{row.val !== 0 ? fmtUSD(row.val) : "—"}</td>
                            <td className="px-4 py-2.5 text-right text-gray-400">{row.pct > 0 ? row.pct.toFixed(1) + "%" : "—"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Stacked monthly costs bar */}
                <div className="bg-white rounded-2xl shadow-sm p-5 border border-gray-100">
                  <h3 className="font-bold text-gray-900 mb-1">Monthly Cost Breakdown</h3>
                  <p className="text-xs text-gray-400 mb-4">Stacked: Food · Labor · Infrastructure · Payroll Taxes</p>
                  <ResponsiveContainer width="100%" height={300}>
                    <BarChart data={months} margin={{ top: 4, right: 12, left: 0, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
                      <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                      <YAxis tickFormatter={fmtK} tick={{ fontSize: 11 }} />
                      <Tooltip content={<CustomTooltip />} />
                      <Legend iconType="circle" iconSize={8} />
                      <Bar dataKey="foodCost"  name="Food Cost"      stackId="a" fill="#e07b39" />
                      <Bar dataKey="laborCost" name="Labor"          stackId="a" fill="#6366f1" />
                      <Bar dataKey="infraCost" name="Infrastructure" stackId="a" fill="#0ea5e9" />
                      <Bar dataKey="taxCost"   name="Payroll Taxes"  stackId="a" fill="#f59e0b" radius={[4,4,0,0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>

                {/* Monthly cost % of revenue */}
                <div className="bg-white rounded-2xl shadow-sm p-5 border border-gray-100">
                  <h3 className="font-bold text-gray-900 mb-1">Cost % of Revenue — Monthly</h3>
                  <p className="text-xs text-gray-400 mb-4">Benchmark reference lines: Food 35% · Labor 33% · Prime Cost 65%</p>
                  <ResponsiveContainer width="100%" height={280}>
                    <LineChart
                      data={months.filter(m => m.revenue > 0).map(m => ({
                        label: m.label,
                        foodPct:  +(m.foodCost  / m.revenue * 100).toFixed(1),
                        laborPct: +(m.laborCost / m.revenue * 100).toFixed(1),
                        infraPct: +(m.infraCost / m.revenue * 100).toFixed(1),
                        primePct: +((m.foodCost + m.laborCost) / m.revenue * 100).toFixed(1),
                      }))}
                      margin={{ top: 4, right: 12, left: 0, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
                      <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                      <YAxis unit="%" tick={{ fontSize: 11 }} />
                      <Tooltip formatter={(v: any) => v + "%"} />
                      <Legend iconType="circle" iconSize={8} />
                      <ReferenceLine y={30} stroke="#e07b39" strokeDasharray="4 4" label={{ value:"Food 30%", fill:"#e07b39", fontSize:10 }} />
                      <ReferenceLine y={33} stroke="#6366f1" strokeDasharray="4 4" label={{ value:"Labor 33%", fill:"#6366f1", fontSize:10 }} />
                      <ReferenceLine y={65} stroke="#dc2626" strokeDasharray="4 4" label={{ value:"Prime 65%", fill:"#dc2626", fontSize:10 }} />
                      <ReferenceLine y={18} stroke="#0ea5e9" strokeDasharray="4 4" label={{ value:"Infra 18%", fill:"#0ea5e9", fontSize:10 }} />
                      <Line type="monotone" dataKey="foodPct"  name="Food %"   stroke="#e07b39" strokeWidth={2} dot={{ r:3 }} />
                      <Line type="monotone" dataKey="laborPct" name="Labor %"  stroke="#6366f1" strokeWidth={2} dot={{ r:3 }} />
                      <Line type="monotone" dataKey="infraPct" name="Infra %"  stroke="#0ea5e9" strokeWidth={2} dot={{ r:3 }} />
                      <Line type="monotone" dataKey="primePct" name="Prime Cost %" stroke="#dc2626" strokeWidth={2} strokeDasharray="6 3" dot={{ r:3 }} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>
            )}

            {/* ══ TAB: Predictions ══════════════════════════════════════ */}
            {activeTab === "predict" && (
              <div className="space-y-5">
                {/* Trend + forecast chart */}
                <div className="bg-white rounded-2xl shadow-sm p-5 border border-gray-100">
                  <div className="flex items-start justify-between mb-1">
                    <div>
                      <h3 className="font-bold text-gray-900">Revenue Forecast</h3>
                      <p className="text-xs text-gray-400">Historical trend + 3-month projection using linear regression · * = forecast</p>
                    </div>
                    <div className={`text-xs font-bold px-3 py-1.5 rounded-full ${slope > 0 ? "bg-green-100 text-green-700" : "bg-red-100 text-red-600"}`}>
                      {slope > 0 ? "▲ Uptrend" : "▼ Downtrend"} {Math.abs(slope) > 0 ? fmtUSD(Math.abs(slope)) + "/mo" : ""}
                    </div>
                  </div>
                  <ResponsiveContainer width="100%" height={300}>
                    <ComposedChart data={trendData} margin={{ top: 4, right: 12, left: 0, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
                      <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                      <YAxis tickFormatter={fmtK} tick={{ fontSize: 11 }} />
                      <Tooltip content={<CustomTooltip />} />
                      <Legend iconType="circle" iconSize={8} />
                      <Line type="monotone" dataKey="revenue"   name="Actual Revenue"  stroke="#16a34a" strokeWidth={2.5} dot={{ r:3 }} connectNulls={false} />
                      <Line type="monotone" dataKey="predicted" name="Forecast"         stroke="#6366f1" strokeWidth={2}   dot={{ r:4 }} strokeDasharray="6 3" connectNulls />
                    </ComposedChart>
                  </ResponsiveContainer>
                  <div className="mt-3 grid grid-cols-3 gap-3">
                    {forecasts.map(f => (
                      <div key={f.label} className="rounded-xl p-3 text-center" style={{ background:"#f5f3ff", border:"1px solid #e0e7ff" }}>
                        <p className="text-xs text-indigo-400 font-medium">{f.label}</p>
                        <p className="text-base font-bold text-indigo-700 mt-0.5">{fmtUSD(f.predicted)}</p>
                        <p className="text-[10px] text-indigo-300">projected</p>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Alerts / Pitfalls */}
                <div className="bg-white rounded-2xl shadow-sm p-5 border border-gray-100">
                  <h3 className="font-bold text-gray-900 mb-1">⚠️ Pitfall Detection</h3>
                  <p className="text-xs text-gray-400 mb-4">Automated alerts based on your actual financial ratios vs industry benchmarks</p>
                  {alerts.length === 0 ? (
                    <div className="text-center py-6 text-gray-400 text-sm">No critical alerts. Financial performance looks healthy!</div>
                  ) : (
                    <div className="space-y-3">
                      {alerts.map((a, i) => (
                        <div key={i} className="flex items-start gap-3 p-3.5 rounded-xl"
                          style={{
                            background: a.type === "error" ? "#fef2f2" : a.type === "warning" ? "#fffbeb" : "#f0fdf4",
                            border: `1px solid ${a.type === "error" ? "#fecaca" : a.type === "warning" ? "#fde68a" : "#bbf7d0"}`,
                          }}>
                          <span className="text-xl flex-shrink-0 mt-0.5">{a.icon}</span>
                          <div>
                            <p className="text-sm font-bold"
                              style={{ color: a.type === "error" ? "#dc2626" : a.type === "warning" ? "#d97706" : "#16a34a" }}>
                              {a.title}
                            </p>
                            <p className="text-xs text-gray-600 mt-0.5">{a.detail}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Recommendations */}
                <div className="bg-white rounded-2xl shadow-sm p-5 border border-gray-100">
                  <h3 className="font-bold text-gray-900 mb-1">💡 Recommendations to Increase Profitability</h3>
                  <p className="text-xs text-gray-400 mb-4">Data-driven action items ranked by potential impact on revenue and margins</p>
                  <div className="space-y-3">
                    {recs.map((r, i) => (
                      <div key={i} className="flex items-start gap-3 p-4 rounded-xl bg-gray-50 border border-gray-100 hover:bg-teal-950/30/30 transition-colors">
                        <span className="text-2xl flex-shrink-0">{r.icon}</span>
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-0.5">
                            <p className="text-sm font-bold text-gray-900">{r.title}</p>
                            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full"
                              style={{
                                background: r.impact === "High" ? "#fef2f2" : r.impact === "Medium" ? "#fffbeb" : "#f0fdf4",
                                color:      r.impact === "High" ? "#dc2626" : r.impact === "Medium" ? "#d97706" : "#16a34a",
                              }}>
                              {r.impact} Impact
                            </span>
                          </div>
                          <p className="text-xs text-gray-500 leading-relaxed">{r.detail}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Month-by-month profit sparkline */}
                <div className="bg-white rounded-2xl shadow-sm p-5 border border-gray-100">
                  <h3 className="font-bold text-gray-900 mb-1">Net Profit Trend</h3>
                  <p className="text-xs text-gray-400 mb-4">Bars above zero = profitable months · below zero = loss months</p>
                  <ResponsiveContainer width="100%" height={220}>
                    <BarChart data={months} margin={{ top: 4, right: 12, left: 0, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
                      <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                      <YAxis tickFormatter={fmtK} tick={{ fontSize: 11 }} />
                      <Tooltip content={<CustomTooltip />} />
                      <ReferenceLine y={0} stroke="#374151" strokeWidth={1.5} />
                      <Bar dataKey="netProfit" name="Net Profit" radius={[4,4,0,0]}>
                        {months.map((m, i) => (
                          <Cell key={i} fill={m.netProfit >= 0 ? "#16a34a" : "#dc2626"} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}

/* ─── Sub-components ─────────────────────────────────────────── */
function KPI({ label, value, sub, color }: { label: string; value: string; sub?: string; color?: string }) {
  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
      <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide leading-tight">{label}</p>
      <p className="mt-1 text-xl font-bold" style={{ color: color ?? "#111827" }}>{value}</p>
      {sub && <p className="mt-0.5 text-xs text-gray-400">{sub} of revenue</p>}
    </div>
  );
}

function CostKPI({ label, value, pct: pctVal, benchmark, color }: {
  label: string; value: string; pct: number; benchmark: string; color: string;
}) {
  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
      <div className="flex items-center gap-1.5 mb-1">
        <span className="w-2 h-2 rounded-full" style={{ background: color }} />
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">{label}</p>
      </div>
      <p className="text-xl font-bold" style={{ color }}>{value}</p>
      <p className="text-xs text-gray-400 mt-0.5">{pctVal > 0 ? pctVal.toFixed(1) + "% of revenue" : "—"}</p>
      <p className="text-[10px] text-gray-300 mt-0.5">Benchmark: {benchmark}</p>
    </div>
  );
}
