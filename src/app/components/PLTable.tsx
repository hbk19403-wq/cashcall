import type { PLSummary } from "@/lib/types";
import Link from "next/link";

const fmt = (n: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n);
const pct = (cost: number, revenue: number) =>
  revenue === 0 ? "—" : ((cost / revenue) * 100).toFixed(1) + "%";

interface PLTableProps {
  rows: PLSummary[];
  showLocation?: boolean;
}

export default function PLTable({ rows, showLocation = false }: PLTableProps) {
  const totals = rows.reduce(
    (acc, r) => ({
      total_net_sales: acc.total_net_sales + r.total_net_sales,
      food_cost: acc.food_cost + r.food_cost,
      total_labor: acc.total_labor + r.total_labor,
      aggregator_commission: acc.aggregator_commission + r.aggregator_commission,
      infrastructure: acc.infrastructure + r.infrastructure,
      total_expenses: acc.total_expenses + r.total_expenses,
      net_profit: acc.net_profit + r.net_profit,
    }),
    { total_net_sales: 0, food_cost: 0, total_labor: 0, aggregator_commission: 0, infrastructure: 0, total_expenses: 0, net_profit: 0 }
  );

  return (
    <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white shadow-sm">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-gray-50 border-b border-gray-200">
            {showLocation && <th className="text-left px-4 py-3 font-semibold text-gray-600">Location</th>}
            <th className="text-right px-4 py-3 font-semibold text-gray-600">Net Sales</th>
            <th className="text-right px-4 py-3 font-semibold text-gray-600">Food</th>
            <th className="text-right px-4 py-3 font-semibold text-gray-600">Labor</th>
            <th className="text-right px-4 py-3 font-semibold text-gray-600">Commissions</th>
            <th className="text-right px-4 py-3 font-semibold text-gray-600">Infra</th>
            <th className="text-right px-4 py-3 font-semibold text-gray-600">Total Costs</th>
            <th className="text-right px-4 py-3 font-semibold text-gray-600">Net Profit</th>
            <th className="text-right px-4 py-3 font-semibold text-gray-600">Margin</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {rows.map((r) => (
            <tr key={r.location_id} className="hover:bg-gray-50 transition-colors">
              {showLocation && (
                <td className="px-4 py-3">
                  <Link href={`/location/${r.location_id}`} className="font-medium text-brand-600 hover:underline">
                    {r.location_name}
                  </Link>
                  <span className="ml-1.5 text-xs text-gray-400">{r.location_state}</span>
                </td>
              )}
              <td className="text-right px-4 py-3 font-medium">{fmt(r.total_net_sales)}</td>
              <td className="text-right px-4 py-3 text-gray-600">
                {fmt(r.food_cost)}
                <span className="ml-1 text-xs text-gray-400">{pct(r.food_cost, r.total_net_sales)}</span>
              </td>
              <td className="text-right px-4 py-3 text-gray-600">
                {fmt(r.total_labor)}
                <span className="ml-1 text-xs text-gray-400">{pct(r.total_labor, r.total_net_sales)}</span>
              </td>
              <td className="text-right px-4 py-3 text-gray-600">{fmt(r.aggregator_commission)}</td>
              <td className="text-right px-4 py-3 text-gray-600">{fmt(r.infrastructure)}</td>
              <td className="text-right px-4 py-3 text-gray-600">{fmt(r.total_expenses)}</td>
              <td className={`text-right px-4 py-3 font-semibold ${r.net_profit >= 0 ? "text-green-600" : "text-red-600"}`}>
                {fmt(r.net_profit)}
              </td>
              <td className={`text-right px-4 py-3 text-xs font-medium ${r.net_profit >= 0 ? "text-green-600" : "text-red-600"}`}>
                {pct(r.net_profit, r.total_net_sales)}
              </td>
            </tr>
          ))}
        </tbody>
        {rows.length > 1 && (
          <tfoot>
            <tr className="bg-gray-50 border-t-2 border-gray-200 font-semibold">
              {showLocation && <td className="px-4 py-3 text-gray-700">Total ({rows.length} locations)</td>}
              <td className="text-right px-4 py-3">{fmt(totals.total_net_sales)}</td>
              <td className="text-right px-4 py-3">{fmt(totals.food_cost)}</td>
              <td className="text-right px-4 py-3">{fmt(totals.total_labor)}</td>
              <td className="text-right px-4 py-3">{fmt(totals.aggregator_commission)}</td>
              <td className="text-right px-4 py-3">{fmt(totals.infrastructure)}</td>
              <td className="text-right px-4 py-3">{fmt(totals.total_expenses)}</td>
              <td className={`text-right px-4 py-3 ${totals.net_profit >= 0 ? "text-green-600" : "text-red-600"}`}>
                {fmt(totals.net_profit)}
              </td>
              <td className={`text-right px-4 py-3 text-xs ${totals.net_profit >= 0 ? "text-green-600" : "text-red-600"}`}>
                {pct(totals.net_profit, totals.total_net_sales)}
              </td>
            </tr>
          </tfoot>
        )}
      </table>
    </div>
  );
}
