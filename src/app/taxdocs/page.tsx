import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { fetchPLSummary } from "@/lib/fetchPL";
import { validateYear } from "@/lib/validateParams";
import HBKHeader from "@/app/components/HBKHeader";
import PrintPDFButton from "@/app/components/PrintPDFButton";
import PrintHeader from "@/app/components/PrintHeader";

interface Props { searchParams: Promise<{ year?: string }>; }

const fmtUSD = (n: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n);
const pct = (v: number) => (isFinite(v) ? v.toFixed(1) + "%" : "—");

const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
const QTR = ["Q1","Q2","Q3","Q4"];

export default async function TaxDocsPage({ searchParams }: Props) {
  const supabase = await createClient();
  const { year: yearParam } = await searchParams;

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data: profile } = await supabase.from("user_profiles").select("role,username,location_id").eq("user_id", user.id).single();
  if (!profile || profile.role !== "owner") redirect("/");

  const year = validateYear(yearParam);
  const prevYear = `/taxdocs?year=${year - 1}`;
  const nextYear = `/taxdocs?year=${year + 1}`;
  const isCurrentYear = year === new Date().getFullYear();

  // Fetch all locations
  const { data: locations } = await supabase.from("locations").select("id,name,code,state").eq("app", "cashcall").eq("user_id", user.id).order("name");

  // Fetch 12 months × all locations
  const months = Array.from({ length: 12 }, (_, i) =>
    `${year}-${String(i + 1).padStart(2, "0")}-01`
  );

  // For each location, fetch all 12 months
  const allPL = await Promise.all(
    (locations ?? []).map(async (loc) => {
      const pls = await Promise.all(months.map(m => fetchPLSummary(supabase, loc.id, m)));
      return { loc, pls };
    })
  );

  // Aggregate totals across all locations per month
  const monthlyTotals = months.map((_, mi) => {
    return allPL.reduce((acc, { pls }) => {
      const p = pls[mi];
      return {
        gross_sales: acc.gross_sales + p.total_gross_sales,
        net_sales: acc.net_sales + p.total_net_sales,
        food_cost: acc.food_cost + p.food_cost,
        labor: acc.labor + p.total_labor,
        infra: acc.infra + p.infrastructure,
        expenses: acc.expenses + p.total_expenses,
        sales_tax: acc.sales_tax + p.sales_tax,
        net_profit: acc.net_profit + p.net_profit,
        commission: acc.commission + p.aggregator_commission,
      };
    }, { gross_sales:0, net_sales:0, food_cost:0, labor:0, infra:0, expenses:0, sales_tax:0, net_profit:0, commission:0 });
  });

  // Annual totals
  const annual = monthlyTotals.reduce((acc, m) => ({
    gross_sales: acc.gross_sales + m.gross_sales,
    net_sales: acc.net_sales + m.net_sales,
    food_cost: acc.food_cost + m.food_cost,
    labor: acc.labor + m.labor,
    infra: acc.infra + m.infra,
    expenses: acc.expenses + m.expenses,
    sales_tax: acc.sales_tax + m.sales_tax,
    net_profit: acc.net_profit + m.net_profit,
    commission: acc.commission + m.commission,
  }), { gross_sales:0, net_sales:0, food_cost:0, labor:0, infra:0, expenses:0, sales_tax:0, net_profit:0, commission:0 });

  // Quarterly aggregates
  const quarterly = [0,1,2,3].map(q => {
    const qMonths = monthlyTotals.slice(q*3, q*3+3);
    return qMonths.reduce((acc, m) => ({
      net_sales: acc.net_sales + m.net_sales,
      sales_tax: acc.sales_tax + m.sales_tax,
    }), { net_sales:0, sales_tax:0 });
  });

  return (
    <div className="min-h-screen bg-gray-50">
      <HBKHeader username={profile.username} role={profile.role} />

      <main className="max-w-7xl mx-auto px-4 py-8 space-y-8" id="print-area">
        <PrintHeader title={`Annual Tax Documentation — ${year}`} subtitle="All Locations" />

        {/* Hero / Year selector */}
        <div className="bg-[#0f0702] rounded-3xl px-8 py-7 flex flex-col sm:flex-row items-start sm:items-center gap-4 print:rounded-xl">
          <div className="flex-1">
            <p className="text-[#c8921a] text-xs font-semibold tracking-[0.25em] uppercase">Tax Documentation</p>
            <h1 className="text-2xl sm:text-3xl font-bold text-white mt-1 font-serif">
              Annual P&amp;L — {year}
            </h1>
            <p className="text-gray-400 text-sm mt-1">Consolidated · {locations?.length ?? 0} locations · All amounts in USD</p>
          </div>
          <div className="flex items-center gap-2">
            <Link href={prevYear} className="w-9 h-9 flex items-center justify-center rounded-lg border border-[#c8921a]/40 text-[#e8b84b] hover:bg-[#c8921a]/20 transition-colors text-sm">‹</Link>
            <span className="text-[#e8b84b] font-bold text-lg w-16 text-center">{year}</span>
            <Link href={nextYear} className={`w-9 h-9 flex items-center justify-center rounded-lg border border-[#c8921a]/40 text-[#e8b84b] hover:bg-[#c8921a]/20 transition-colors text-sm ${isCurrentYear ? "opacity-30 pointer-events-none" : ""}`}>›</Link>
            <Link href="/dashboard" className="ml-3 text-xs text-gray-400 border border-white/10 rounded-lg px-3 py-2 hover:text-white hover:border-white/30 transition-colors print:hidden">← Dashboard</Link>
            <PrintPDFButton title={`CashCall-TaxDocs-${year}`} />
          </div>
        </div>

        {/* Annual KPI strip */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {[
            { label: "Total Gross Sales", value: fmtUSD(annual.gross_sales), color: "text-white" },
            { label: "Total Net Sales", value: fmtUSD(annual.net_sales), color: "text-[#e8b84b]" },
            { label: "Est. Sales Tax Collected", value: fmtUSD(annual.sales_tax), color: "text-red-400" },
            { label: "Net Profit", value: fmtUSD(annual.net_profit), color: annual.net_profit >= 0 ? "text-green-400" : "text-red-400" },
          ].map(k => (
            <div key={k.label} className="bg-[#0f0702] border border-[#c8921a]/20 rounded-2xl p-5">
              <p className="text-xs text-gray-400 uppercase tracking-wide">{k.label}</p>
              <p className={`text-2xl font-bold mt-1 ${k.color}`}>{k.value}</p>
            </div>
          ))}
        </div>

        {/* 12-Month P&L Table */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
            <h2 className="font-bold text-gray-900">Monthly P&amp;L — {year}</h2>
            <span className="text-xs text-gray-400">All locations combined</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 w-20">Month</th>
                  <th className="text-right px-3 py-3 text-xs font-semibold text-gray-500">Gross Sales</th>
                  <th className="text-right px-3 py-3 text-xs font-semibold text-gray-500">Net Sales</th>
                  <th className="text-right px-3 py-3 text-xs font-semibold text-gray-500">Food Cost</th>
                  <th className="text-right px-3 py-3 text-xs font-semibold text-gray-500">Food %</th>
                  <th className="text-right px-3 py-3 text-xs font-semibold text-gray-500">Labor</th>
                  <th className="text-right px-3 py-3 text-xs font-semibold text-gray-500">Labor %</th>
                  <th className="text-right px-3 py-3 text-xs font-semibold text-gray-500">Commissions</th>
                  <th className="text-right px-3 py-3 text-xs font-semibold text-gray-500">Infra</th>
                  <th className="text-right px-3 py-3 text-xs font-semibold text-gray-500">Total Exp.</th>
                  <th className="text-right px-3 py-3 text-xs font-semibold text-gray-500 text-red-600">Sales Tax</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500">Net Profit</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500">Margin</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {monthlyTotals.map((m, i) => {
                  const hasData = m.net_sales > 0;
                  const margin = hasData ? (m.net_profit / m.net_sales) * 100 : 0;
                  return (
                    <tr key={i} className="hover:bg-gray-50">
                      <td className="px-4 py-3 font-medium text-gray-900">{MONTHS[i]}</td>
                      <td className="px-3 py-3 text-right text-gray-600">{hasData ? fmtUSD(m.gross_sales) : <span className="text-gray-300">—</span>}</td>
                      <td className="px-3 py-3 text-right font-medium">{hasData ? fmtUSD(m.net_sales) : <span className="text-gray-300">—</span>}</td>
                      <td className="px-3 py-3 text-right text-amber-600">{hasData ? fmtUSD(m.food_cost) : "—"}</td>
                      <td className="px-3 py-3 text-right text-amber-500 text-xs">{hasData ? pct((m.food_cost/m.net_sales)*100) : "—"}</td>
                      <td className="px-3 py-3 text-right text-blue-600">{hasData ? fmtUSD(m.labor) : "—"}</td>
                      <td className="px-3 py-3 text-right text-blue-500 text-xs">{hasData ? pct((m.labor/m.net_sales)*100) : "—"}</td>
                      <td className="px-3 py-3 text-right text-gray-500">{hasData ? fmtUSD(m.commission) : "—"}</td>
                      <td className="px-3 py-3 text-right text-gray-500">{hasData ? fmtUSD(m.infra) : "—"}</td>
                      <td className="px-3 py-3 text-right text-gray-700">{hasData ? fmtUSD(m.expenses) : "—"}</td>
                      <td className="px-3 py-3 text-right text-red-500 font-medium">{hasData ? fmtUSD(m.sales_tax) : "—"}</td>
                      <td className={`px-4 py-3 text-right font-semibold ${m.net_profit >= 0 ? "text-green-600" : "text-red-500"}`}>
                        {hasData ? fmtUSD(m.net_profit) : "—"}
                      </td>
                      <td className={`px-4 py-3 text-right text-xs ${margin >= 0 ? "text-green-600" : "text-red-500"}`}>
                        {hasData ? pct(margin) : "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="bg-[#0f0702] text-white font-bold">
                  <td className="px-4 py-3">ANNUAL</td>
                  <td className="px-3 py-3 text-right text-gray-300">{fmtUSD(annual.gross_sales)}</td>
                  <td className="px-3 py-3 text-right">{fmtUSD(annual.net_sales)}</td>
                  <td className="px-3 py-3 text-right text-amber-400">{fmtUSD(annual.food_cost)}</td>
                  <td className="px-3 py-3 text-right text-amber-400 text-xs">{pct((annual.food_cost/annual.net_sales)*100)}</td>
                  <td className="px-3 py-3 text-right text-blue-400">{fmtUSD(annual.labor)}</td>
                  <td className="px-3 py-3 text-right text-blue-400 text-xs">{pct((annual.labor/annual.net_sales)*100)}</td>
                  <td className="px-3 py-3 text-right text-gray-300">{fmtUSD(annual.commission)}</td>
                  <td className="px-3 py-3 text-right text-gray-300">{fmtUSD(annual.infra)}</td>
                  <td className="px-3 py-3 text-right text-gray-300">{fmtUSD(annual.expenses)}</td>
                  <td className="px-3 py-3 text-right text-red-400">{fmtUSD(annual.sales_tax)}</td>
                  <td className={`px-4 py-3 text-right ${annual.net_profit >= 0 ? "text-green-400" : "text-red-400"}`}>{fmtUSD(annual.net_profit)}</td>
                  <td className={`px-4 py-3 text-right text-xs ${annual.net_profit >= 0 ? "text-green-400" : "text-red-400"}`}>{pct((annual.net_profit/annual.net_sales)*100)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>

        {/* Sales Tax Quarterly Filing */}
        <div className="grid md:grid-cols-2 gap-6">
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-100">
              <h2 className="font-bold text-gray-900">Quarterly Sales Tax Summary</h2>
              <p className="text-xs text-gray-400 mt-0.5">For quarterly state filing reference</p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500">Period</th>
                    <th className="text-right px-3 py-3 text-xs font-semibold text-gray-500">Net Sales</th>
                    <th className="text-right px-4 py-3 text-xs font-semibold text-red-500">Est. Sales Tax</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {[0,1,2,3].map(q => (
                    <>
                      {[0,1,2].map(mi => {
                        const idx = q*3 + mi;
                        const m = monthlyTotals[idx];
                        return (
                          <tr key={`${q}-${mi}`} className="hover:bg-gray-50">
                            <td className="px-4 py-2.5 text-gray-500 pl-8">{MONTHS[idx]}</td>
                            <td className="px-3 py-2.5 text-right text-gray-600">{m.net_sales > 0 ? fmtUSD(m.net_sales) : "—"}</td>
                            <td className="px-4 py-2.5 text-right text-red-500">{m.net_sales > 0 ? fmtUSD(m.sales_tax) : "—"}</td>
                          </tr>
                        );
                      })}
                      <tr key={`q${q}-total`} className="bg-amber-50">
                        <td className="px-4 py-2.5 font-bold text-gray-800">{QTR[q]} Total</td>
                        <td className="px-3 py-2.5 text-right font-semibold">{fmtUSD(quarterly[q].net_sales)}</td>
                        <td className="px-4 py-2.5 text-right font-bold text-red-600">{fmtUSD(quarterly[q].sales_tax)}</td>
                      </tr>
                    </>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="bg-red-600 text-white font-bold">
                    <td className="px-4 py-3">ANNUAL TOTAL</td>
                    <td className="px-3 py-3 text-right">{fmtUSD(annual.net_sales)}</td>
                    <td className="px-4 py-3 text-right text-lg">{fmtUSD(annual.sales_tax)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>

          {/* Per-Location Annual Breakdown */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-100">
              <h2 className="font-bold text-gray-900">Per-Location Annual Summary</h2>
              <p className="text-xs text-gray-400 mt-0.5">Net sales and profit by location</p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500">Location</th>
                    <th className="text-right px-3 py-3 text-xs font-semibold text-gray-500">Net Sales</th>
                    <th className="text-right px-3 py-3 text-xs font-semibold text-red-500">Sales Tax</th>
                    <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500">Net Profit</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {allPL.map(({ loc, pls }) => {
                    const locAnnual = pls.reduce((acc, p) => ({
                      net_sales: acc.net_sales + p.total_net_sales,
                      sales_tax: acc.sales_tax + p.sales_tax,
                      net_profit: acc.net_profit + p.net_profit,
                    }), { net_sales:0, sales_tax:0, net_profit:0 });
                    return (
                      <tr key={loc.id} className="hover:bg-gray-50">
                        <td className="px-4 py-2.5">
                          <Link href={`/location/${loc.id}/taxdocs?year=${year}`} className="font-medium text-gray-900 hover:text-amber-600">
                            {loc.name}
                          </Link>
                          <span className="ml-1 text-xs text-gray-400">{loc.state}</span>
                        </td>
                        <td className="px-3 py-2.5 text-right text-gray-700">{locAnnual.net_sales > 0 ? fmtUSD(locAnnual.net_sales) : <span className="text-gray-300">—</span>}</td>
                        <td className="px-3 py-2.5 text-right text-red-500">{locAnnual.net_sales > 0 ? fmtUSD(locAnnual.sales_tax) : "—"}</td>
                        <td className={`px-4 py-2.5 text-right font-semibold ${locAnnual.net_profit >= 0 ? "text-green-600" : "text-red-500"}`}>
                          {locAnnual.net_sales > 0 ? fmtUSD(locAnnual.net_profit) : "—"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr className="bg-[#0f0702] text-white font-bold">
                    <td className="px-4 py-3">TOTAL</td>
                    <td className="px-3 py-3 text-right">{fmtUSD(annual.net_sales)}</td>
                    <td className="px-3 py-3 text-right text-red-400">{fmtUSD(annual.sales_tax)}</td>
                    <td className={`px-4 py-3 text-right ${annual.net_profit >= 0 ? "text-green-400" : "text-red-400"}`}>{fmtUSD(annual.net_profit)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        </div>

        {/* Disclaimer */}
        <div className="bg-amber-50 border border-amber-200 rounded-xl px-5 py-4">
          <p className="text-xs text-amber-800">
            <strong>Disclaimer:</strong> Sales tax figures shown are estimates based on recorded sales data. Actual tax liability may vary based on applicable state/local tax rates, exemptions, and adjustments. Please consult a licensed CPA or tax professional before filing.
          </p>
        </div>

      </main>

    </div>
  );
}
