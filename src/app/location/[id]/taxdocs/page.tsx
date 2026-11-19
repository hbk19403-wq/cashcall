import { redirect } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { createClient } from "@/lib/supabase/server";
import { fetchPLSummary } from "@/lib/fetchPL";
import type { PLSummary } from "@/lib/types";
import { validateYear } from "@/lib/validateParams";
import Nav from "@/app/components/Nav";
import PrintPDFButton from "@/app/components/PrintPDFButton";
import PrintHeader from "@/app/components/PrintHeader";

interface Props {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ year?: string }>;
}

const fmtUSD = (n: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n);
const fmtUSD2 = (n: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);
const pct = (v: number) => v.toFixed(2) + "%";

const MONTH_NAMES = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

export default async function TaxDocsPage({ params, searchParams }: Props) {
  const supabase = await createClient();
  const { id } = await params;
  const { year: yearParam } = await searchParams;

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data: profile } = await supabase.from("user_profiles").select("role,username,location_id").eq("user_id", user.id).single();
  if (!profile) redirect("/login");
  if (profile.role !== "owner" && profile.location_id !== id) redirect(`/location/${profile.location_id}`);

  const year = validateYear(yearParam);
  const { data: loc } = await supabase.from("locations").select("name,code,state,tax_rate").eq("id", id).single();
  if (!loc) redirect("/");

  // Fetch all 12 months
  const months = Array.from({ length: 12 }, (_, i) =>
    `${year}-${String(i + 1).padStart(2, "0")}-01`
  );
  const plData: PLSummary[] = await Promise.all(months.map(m => fetchPLSummary(supabase, id, m)));

  // Annual totals
  const ann = plData.reduce((a, p) => ({
    net_sales:           a.net_sales           + p.total_net_sales,
    gross_sales:         a.gross_sales         + p.total_gross_sales,
    food:                a.food                + p.food_cost,
    labor:               a.labor               + p.total_labor,
    commissions:         a.commissions         + p.aggregator_commission,
    infra:               a.infra               + p.infrastructure,
    sales_tax:           a.sales_tax           + p.sales_tax,
    expenses:            a.expenses            + p.total_expenses,
    profit:              a.profit              + p.net_profit,
    cash_sales:          a.cash_sales          + p.cash_sales,
    pos_sales:           a.pos_sales           + p.pos_sales,
    uber_eats_gross:     a.uber_eats_gross     + p.uber_eats_gross,
    grubhub_gross:       a.grubhub_gross       + p.grubhub_gross,
    doordash_gross:      a.doordash_gross      + p.doordash_gross,
    catering:            a.catering            + p.catering_sales,
    cash_tips:           a.cash_tips           + p.cash_tips,
  }), {
    net_sales:0, gross_sales:0, food:0, labor:0, commissions:0, infra:0,
    sales_tax:0, expenses:0, profit:0, cash_sales:0, pos_sales:0,
    uber_eats_gross:0, grubhub_gross:0, doordash_gross:0, catering:0, cash_tips:0,
  });

  const annMargin = ann.net_sales > 0 ? (ann.profit / ann.net_sales) * 100 : 0;
  const taxRate = Number(loc.tax_rate ?? 0);
  const reportDate = new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });

  return (
    <div className="min-h-screen bg-[#060b18]">
      <Nav username={profile.username} role={profile.role} />

      <main className="max-w-6xl mx-auto px-4 py-8 space-y-6" id="print-area">
        <PrintHeader title={`Tax Documentation — ${loc?.name ?? ""}`} subtitle={`${year} Annual P&L`} />

        {/* Header bar */}
        <div className="flex items-center justify-between no-print">
          <div className="flex items-center gap-3">
            <Link href={`/location/${id}`} className="text-sm text-gray-500 hover:text-gray-900">← Back</Link>
            <h1 className="font-bold text-gray-900 text-lg">Tax Documentation</h1>
          </div>
          <div className="flex items-center gap-3">
            {/* Year selector */}
            <div className="flex items-center gap-1 border border-white/10 rounded-xl overflow-hidden bg-white/5 shadow-sm">
              <Link href={`?year=${year - 1}`} className="px-3 py-2 text-gray-400 hover:bg-white/10 text-sm">‹</Link>
              <span className="px-4 py-2 text-sm font-semibold text-gray-800">{year}</span>
              <Link href={`?year=${year + 1}`} className="px-3 py-2 text-gray-400 hover:bg-white/10 text-sm">›</Link>
            </div>
            <PrintPDFButton title={`TaxDocs-${loc?.name ?? ""}-${year}`} orientation="landscape" />
          </div>
        </div>

        {/* ── Document header (prints nicely) ── */}
        <div className="bg-[#060b18] rounded-3xl p-8 text-white relative overflow-hidden print:rounded-none print:p-6">
          <div className="absolute right-6 top-1/2 -translate-y-1/2 opacity-10 pointer-events-none">
            <Image src="/logo.svg" alt="" width={160} height={160} />
          </div>
          <div className="flex flex-col sm:flex-row items-start sm:items-end gap-6">
            <div className="flex-1">
              <p className="text-[#00d4a8] text-xs font-semibold tracking-[0.25em] uppercase">Tax Documentation</p>
              <h2 className="text-2xl font-bold mt-1 font-serif">
                {loc.name} — Annual P&amp;L
              </h2>
              <p className="text-gray-400 text-sm mt-1">
                Fiscal Year {year} · {loc.code}, {loc.state} · Sales Tax Rate: {(taxRate * 100).toFixed(3)}%
              </p>
            </div>
            <div className="text-right text-sm text-gray-400">
              <p>CashCall</p>
              <p>Generated: {reportDate}</p>
              <p className="text-[#00d4a8] font-semibold mt-1">CONFIDENTIAL</p>
            </div>
          </div>
        </div>

        {/* ── Annual KPI summary ── */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {[
            { label: "Gross Sales",    value: fmtUSD(ann.gross_sales), color: "text-gray-900" },
            { label: "Net Sales",      value: fmtUSD(ann.net_sales),   color: "text-gray-900" },
            { label: "Total Expenses", value: fmtUSD(ann.expenses),    color: "text-red-600" },
            { label: "Net Profit",     value: fmtUSD(ann.profit),      color: ann.profit >= 0 ? "text-green-600" : "text-red-600" },
          ].map(k => (
            <div key={k.label} className="bg-[#0f172a] rounded-2xl border border-white/10 shadow-sm p-5">
              <p className="text-xs text-gray-400 uppercase tracking-wide">{k.label}</p>
              <p className={`text-xl font-bold mt-1 ${k.color}`}>{k.value}</p>
            </div>
          ))}
        </div>

        {/* ── 12-Month P&L Table ── */}
        <div className="bg-[#0f172a] rounded-2xl border border-white/10 shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
            <h3 className="font-bold text-gray-900">Monthly P&amp;L — {year}</h3>
            <span className="text-xs text-gray-400">All amounts in USD</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-white/5 border-b border-white/10">
                <tr>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-400 sticky left-0 bg-white/5">Month</th>
                  <th className="text-right px-3 py-3 text-xs font-semibold text-gray-500 whitespace-nowrap">Gross Sales</th>
                  <th className="text-right px-3 py-3 text-xs font-semibold text-gray-500 whitespace-nowrap">Net Sales</th>
                  <th className="text-right px-3 py-3 text-xs font-semibold text-teal-400 whitespace-nowrap">Food Cost</th>
                  <th className="text-right px-3 py-3 text-xs font-semibold text-blue-600 whitespace-nowrap">Labor</th>
                  <th className="text-right px-3 py-3 text-xs font-semibold text-gray-500 whitespace-nowrap">Commissions</th>
                  <th className="text-right px-3 py-3 text-xs font-semibold text-purple-600 whitespace-nowrap">Infra</th>
                  <th className="text-right px-3 py-3 text-xs font-semibold text-red-600 whitespace-nowrap">Sales Tax</th>
                  <th className="text-right px-3 py-3 text-xs font-semibold text-gray-500 whitespace-nowrap">Total Exp.</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-gray-900 whitespace-nowrap">Net Profit</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500">Margin</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {plData.map((p, i) => {
                  const hasData = p.total_net_sales > 0;
                  const margin = hasData ? (p.net_profit / p.total_net_sales) * 100 : 0;
                  return (
                    <tr key={i} className={`hover:bg-white/5 ${!hasData ? "opacity-40" : ""}`}>
                      <td className="px-4 py-2.5 font-medium text-gray-200 sticky left-0 bg-[#0f172a]">
                        {MONTH_NAMES[i]} {year}
                      </td>
                      <td className="px-3 py-2.5 text-right text-gray-600 tabular-nums">{hasData ? fmtUSD(p.total_gross_sales) : "—"}</td>
                      <td className="px-3 py-2.5 text-right font-medium tabular-nums">{hasData ? fmtUSD(p.total_net_sales) : "—"}</td>
                      <td className="px-3 py-2.5 text-right text-teal-300 tabular-nums">
                        {hasData ? <>{fmtUSD(p.food_cost)} <span className="text-xs text-gray-400">({p.food_pct.toFixed(1)}%)</span></> : "—"}
                      </td>
                      <td className="px-3 py-2.5 text-right text-blue-700 tabular-nums">
                        {hasData ? <>{fmtUSD(p.total_labor)} <span className="text-xs text-gray-400">({p.labor_pct.toFixed(1)}%)</span></> : "—"}
                      </td>
                      <td className="px-3 py-2.5 text-right text-gray-600 tabular-nums">{hasData ? fmtUSD(p.aggregator_commission) : "—"}</td>
                      <td className="px-3 py-2.5 text-right text-purple-700 tabular-nums">{hasData ? fmtUSD(p.infrastructure) : "—"}</td>
                      <td className="px-3 py-2.5 text-right text-red-600 font-medium tabular-nums">{hasData ? fmtUSD(p.sales_tax) : "—"}</td>
                      <td className="px-3 py-2.5 text-right text-gray-700 tabular-nums">{hasData ? fmtUSD(p.total_expenses) : "—"}</td>
                      <td className={`px-4 py-2.5 text-right font-semibold tabular-nums ${hasData ? (p.net_profit >= 0 ? "text-green-600" : "text-red-500") : "text-gray-300"}`}>
                        {hasData ? fmtUSD(p.net_profit) : "—"}
                      </td>
                      <td className={`px-4 py-2.5 text-right text-xs font-medium ${hasData ? (margin >= 0 ? "text-green-600" : "text-red-500") : "text-gray-300"}`}>
                        {hasData ? pct(margin) : "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="bg-[#060b18] text-white font-bold border-t-2 border-[#00d4a8]">
                  <td className="px-4 py-3 text-sm">ANNUAL TOTAL</td>
                  <td className="px-3 py-3 text-right tabular-nums">{fmtUSD(ann.gross_sales)}</td>
                  <td className="px-3 py-3 text-right tabular-nums">{fmtUSD(ann.net_sales)}</td>
                  <td className="px-3 py-3 text-right text-teal-400 tabular-nums">{fmtUSD(ann.food)}</td>
                  <td className="px-3 py-3 text-right text-blue-400 tabular-nums">{fmtUSD(ann.labor)}</td>
                  <td className="px-3 py-3 text-right tabular-nums">{fmtUSD(ann.commissions)}</td>
                  <td className="px-3 py-3 text-right text-purple-400 tabular-nums">{fmtUSD(ann.infra)}</td>
                  <td className="px-3 py-3 text-right text-red-400 tabular-nums">{fmtUSD(ann.sales_tax)}</td>
                  <td className="px-3 py-3 text-right tabular-nums">{fmtUSD(ann.expenses)}</td>
                  <td className={`px-4 py-3 text-right tabular-nums ${ann.profit >= 0 ? "text-green-400" : "text-red-400"}`}>{fmtUSD(ann.profit)}</td>
                  <td className={`px-4 py-3 text-right text-xs ${annMargin >= 0 ? "text-green-400" : "text-red-400"}`}>{pct(annMargin)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>

        {/* ── Sales Tax Filing Summary ── */}
        <div className="bg-[#0f172a] rounded-2xl border border-white/10 shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100 bg-red-50">
            <h3 className="font-bold text-red-800">📊 Sales Tax Filing Summary — {year}</h3>
            <p className="text-xs text-red-600 mt-0.5">Estimated tax owed = Net Taxable Sales × {(taxRate * 100).toFixed(3)}% ({loc.state} rate)</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-red-50/50 border-b border-gray-100">
                <tr>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500">Quarter / Month</th>
                  <th className="text-right px-3 py-3 text-xs font-semibold text-gray-500">Taxable Sales</th>
                  <th className="text-right px-3 py-3 text-xs font-semibold text-red-600">Tax Rate</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-red-700">Sales Tax Owed</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500">Cumulative</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {[
                  { label: "Q1 (Jan – Mar)", months: [0,1,2] },
                  { label: "Q2 (Apr – Jun)", months: [3,4,5] },
                  { label: "Q3 (Jul – Sep)", months: [6,7,8] },
                  { label: "Q4 (Oct – Dec)", months: [9,10,11] },
                ].map((q, qi) => {
                  const qSales = q.months.reduce((s, mi) => s + plData[mi].total_net_sales, 0);
                  const qTax   = qSales * taxRate;
                  const cumulative = [0,1,2,3].slice(0, qi + 1).reduce((s, qqi) => {
                    const ms = [[0,1,2],[3,4,5],[6,7,8],[9,10,11]][qqi];
                    return s + ms.reduce((ss, mi) => ss + plData[mi].total_net_sales * taxRate, 0);
                  }, 0);
                  return (
                    <>
                      {/* Monthly breakdown */}
                      {q.months.map(mi => {
                        const p = plData[mi];
                        return (
                          <tr key={mi} className="hover:bg-gray-50 text-gray-500">
                            <td className="px-4 py-2 pl-8 text-xs text-gray-400">{MONTH_NAMES[mi]} {year}</td>
                            <td className="px-3 py-2 text-right text-xs tabular-nums">{p.total_net_sales > 0 ? fmtUSD(p.total_net_sales) : "—"}</td>
                            <td className="px-3 py-2 text-right text-xs text-red-400">{(taxRate * 100).toFixed(3)}%</td>
                            <td className="px-4 py-2 text-right text-xs font-medium text-red-600 tabular-nums">{p.total_net_sales > 0 ? fmtUSD2(p.total_net_sales * taxRate) : "—"}</td>
                            <td className="px-4 py-2 text-right text-xs text-gray-400">—</td>
                          </tr>
                        );
                      })}
                      {/* Quarter total */}
                      <tr key={`q${qi}`} className="bg-red-50/80 font-semibold">
                        <td className="px-4 py-2.5 text-sm text-red-800">{q.label}</td>
                        <td className="px-3 py-2.5 text-right tabular-nums text-gray-800">{fmtUSD(qSales)}</td>
                        <td className="px-3 py-2.5 text-right text-red-600">{(taxRate * 100).toFixed(3)}%</td>
                        <td className="px-4 py-2.5 text-right text-red-700 font-bold tabular-nums">{fmtUSD2(qTax)}</td>
                        <td className="px-4 py-2.5 text-right text-red-600 tabular-nums">{fmtUSD2(cumulative)}</td>
                      </tr>
                    </>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="bg-red-700 text-white font-bold">
                  <td className="px-4 py-3">ANNUAL SALES TAX — {year}</td>
                  <td className="px-3 py-3 text-right tabular-nums">{fmtUSD(ann.net_sales)}</td>
                  <td className="px-3 py-3 text-right">{(taxRate * 100).toFixed(3)}%</td>
                  <td className="px-4 py-3 text-right tabular-nums text-lg">{fmtUSD2(ann.net_sales * taxRate)}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{fmtUSD2(ann.net_sales * taxRate)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>

        {/* ── Revenue channel breakdown ── */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
          <h3 className="font-bold text-gray-900 mb-4">Annual Revenue Channel Breakdown</h3>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {[
              { label: "Cash Sales",         value: ann.cash_sales,      color: "bg-blue-100 text-blue-800" },
              { label: "POS Sales",          value: ann.pos_sales,       color: "bg-purple-100 text-purple-800" },
              { label: "Uber Eats (gross)",  value: ann.uber_eats_gross, color: "bg-gray-100 text-gray-800" },
              { label: "Grubhub (gross)",    value: ann.grubhub_gross,   color: "bg-orange-100 text-orange-800" },
              { label: "DoorDash (gross)",   value: ann.doordash_gross,  color: "bg-red-100 text-red-800" },
              { label: "Catering",           value: ann.catering,        color: "bg-green-100 text-green-800" },
              { label: "Cash Tips",          value: ann.cash_tips,       color: "bg-gray-100 text-gray-700" },
              { label: "Aggregator Commission (−)", value: ann.commissions, color: "bg-red-50 text-red-700" },
            ].map(c => (
              <div key={c.label} className={`rounded-xl px-4 py-3 ${c.color}`}>
                <p className="text-xs font-medium opacity-80">{c.label}</p>
                <p className="text-sm font-bold mt-1">{fmtUSD(c.value)}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Disclaimer */}
        <div className="border border-teal-800 bg-teal-950/30 rounded-2xl p-5">
          <p className="text-xs text-teal-200 font-medium mb-1">⚠️ Important Disclaimer</p>
          <p className="text-xs text-teal-300 leading-relaxed">
            This report is generated from internal POS and sales data entered in the CashCall.
            Sales tax figures are estimates based on the state tax rate configured for this location.
            Actual sales tax liability may vary based on local jurisdictions, exemptions, and filing rules.
            Please consult your CPA or tax advisor before filing. All figures should be verified against
            official POS reports and accounting records.
          </p>
        </div>


      </main>
    </div>
  );
}
