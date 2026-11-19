"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { SpikeAlert } from "@/app/api/price-spikes/route";

interface Props {
  /** Current dashboard month (YYYY-MM-01) — used only to invalidate cache on month change */
  month: string;
}

const TEAL = "#00d4a8";

function pctColor(pct: number) {
  if (pct >= 20) return "#f87171";
  if (pct >= 10) return "#fb923c";
  if (pct >= 8)  return "#fbbf24";
  if (pct <= -15) return "#34d399";
  if (pct <= -8)  return "#86efac";
  return "#6b7280";
}

function SpikeChip({ pct }: { pct: number }) {
  const up = pct > 0;
  const color = pctColor(pct);
  const label = Math.abs(pct) >= 20
    ? (up ? "🔴 Major spike" : "🟢 Major drop")
    : Math.abs(pct) >= 10
    ? (up ? "🟠 Spike" : "🟢 Drop")
    : (up ? "🟡 Rising" : "🟢 Falling");
  return (
    <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-md"
      style={{ background: up ? "rgba(239,68,68,0.12)" : "rgba(52,211,153,0.12)", color }}>
      {label}
    </span>
  );
}

export default function PriceAlertsWidget({ month }: Props) {
  const [spikes, setSpikes] = useState<SpikeAlert[]>([]);
  const [loading, setLoading] = useState(true);
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    setLoading(true);
    fetch("/api/price-spikes")
      .then(r => r.json())
      .then(d => { setSpikes(d.spikes ?? []); setLoading(false); })
      .catch(() => setLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [month]);

  if (loading) return null;
  if (!spikes.length) return null;

  const spikeAlerts = spikes.filter(s => s.changePct > 0);
  const dropAlerts  = spikes.filter(s => s.changePct < 0);

  return (
    <div className="rounded-3xl overflow-hidden" style={{ background: "rgba(255,255,255,0.025)", border: "1px solid rgba(239,68,68,0.2)" }}>
      {/* Header */}
      <button
        onClick={() => setCollapsed(c => !c)}
        className="w-full flex items-center justify-between px-6 py-4 text-left"
      >
        <div className="flex items-center gap-3">
          <span className="text-lg">⚠️</span>
          <div>
            <p className="text-white font-bold text-sm">
              Commodity Price Alerts
              <span className="ml-2 text-[11px] font-semibold px-2 py-0.5 rounded-full" style={{ background: "rgba(239,68,68,0.15)", color: "#f87171" }}>
                {spikeAlerts.length} spike{spikeAlerts.length !== 1 ? "s" : ""}
              </span>
              {dropAlerts.length > 0 && (
                <span className="ml-1 text-[11px] font-semibold px-2 py-0.5 rounded-full" style={{ background: "rgba(52,211,153,0.12)", color: "#34d399" }}>
                  {dropAlerts.length} drop{dropAlerts.length !== 1 ? "s" : ""}
                </span>
              )}
            </p>
            <p className="text-gray-500 text-[11px] mt-0.5">vs 3-month average unit price · click a row to view details</p>
          </div>
        </div>
        <span className="text-gray-600 text-sm">{collapsed ? "▼" : "▲"}</span>
      </button>

      {!collapsed && (
        <div className="px-2 pb-4">
          <div className="overflow-x-auto rounded-2xl" style={{ border: "1px solid rgba(255,255,255,0.06)" }}>
            <table className="w-full text-xs">
              <thead style={{ background: "rgba(255,255,255,0.04)" }}>
                <tr>
                  {["Ingredient", "Location", "Current Price", "3-Mo Avg", "Change", "Vendor", ""].map((h, i) => (
                    <th key={i} className={`px-4 py-2.5 text-[10px] font-semibold text-white/30 uppercase tracking-wide ${i >= 2 ? "text-right" : "text-left"}`}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {spikes.map((s, i) => (
                  <tr key={i}
                    className="border-t transition-colors hover:bg-white/[0.03]"
                    style={{ borderColor: "rgba(255,255,255,0.05)" }}>
                    <td className="px-4 py-3 font-medium text-white">
                      {s.name}
                      {s.unit && <span className="text-white/30 ml-1 text-[10px]">/ {s.unit}</span>}
                    </td>
                    <td className="px-4 py-3 text-white/50">{s.locationName}</td>
                    <td className="px-4 py-3 text-right font-bold tabular-nums text-white">
                      ${s.latestPrice.toFixed(2)}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-white/40">
                      ${s.avg3mo.toFixed(2)}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <span className="font-bold tabular-nums" style={{ color: pctColor(s.changePct) }}>
                        {s.changePct > 0 ? "▲" : "▼"} {Math.abs(s.changePct).toFixed(1)}%
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right text-white/30">{s.vendor}</td>
                    <td className="px-4 py-3 text-right">
                      <Link
                        href={`/location/${s.locationId}/food?tab=prices`}
                        className="text-[10px] font-semibold hover:text-teal-400 transition-colors"
                        style={{ color: TEAL }}
                      >
                        View →
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Summary chips */}
          <div className="flex flex-wrap gap-2 mt-3 px-2">
            {spikeAlerts.slice(0, 3).map((s, i) => (
              <SpikeChip key={i} pct={s.changePct} />
            ))}
            {dropAlerts.slice(0, 2).map((s, i) => (
              <SpikeChip key={`d${i}`} pct={s.changePct} />
            ))}
            {spikes.length > 5 && (
              <span className="text-[9px] text-white/30 self-center">+{spikes.length - 5} more</span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
