"use client";

import React, { useEffect, useState, useRef, useCallback, useMemo } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import PrintPDFButton from "@/app/components/PrintPDFButton";
import InvoiceOCR from "@/app/components/InvoiceOCR";
import type { ApplyData } from "@/app/components/InvoiceOCR";
import VendorTab from "./VendorTab";
import VendorMarketTab from "./VendorMarketTab";
import ContractsTab from "./ContractsTab";
import { createClient } from "@/lib/supabase/client";
import { useAuthGuard } from "@/lib/useAuthGuard";
import MobileBottomNav from "@/app/components/MobileBottomNav";
import { FOOD_CATEGORIES } from "@/lib/types";
import type { FoodCategory, InvoiceLineItem } from "@/lib/types";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  PieChart, Pie, Cell, LineChart, Line,
} from "recharts";
import { CAT_COLORS } from "@/lib/chartColors";
import { normalizeLineItems } from "@/lib/normalizeLineItems";

/* ─── types ──────────────────────────────────────────────────────── */
interface Attachment { id: string; file_path: string; file_name: string; }
interface Delivery {
  id: string; delivery_date: string; vendor: string;
  invoice_number: string; category: FoodCategory; amount: number; notes: string;
  attachments?: Attachment[];
  lineItems?: InvoiceLineItem[];
}
interface MonthTotal { month: string; label: string; total: number; }
interface PriceOutlier {
  item: string;
  current_price: number;
  avg_price: number;
  diff: number;
  diff_pct: number;
  vendor: string;
  unit: string;
  history: { date: string; price: number; vendor: string; invoice_number?: string; unit?: string }[];
  current_invoice_number?: string;
  current_date?: string;
}

const empty = (): Omit<Delivery, "id"> => ({
  delivery_date: new Date().toISOString().slice(0, 10),
  vendor: "", invoice_number: "", category: "protein", amount: 0, notes: "",
});

const fmtUSD = (n: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 }).format(n);
const fmtUSD0 = (n: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n);

/* ─── helpers ────────────────────────────────────────────────────── */
function groupByWeek(deliveries: Delivery[]) {
  const weeks: Record<number, Record<string, number>> = {};
  for (const d of deliveries) {
    const day = new Date(d.delivery_date + "T00:00:00").getDate();
    const w = Math.ceil(day / 7);
    if (!weeks[w]) weeks[w] = {};
    weeks[w][d.category] = (weeks[w][d.category] || 0) + Number(d.amount);
  }
  return [1, 2, 3, 4, 5].filter(w => weeks[w]).map(w => ({ week: `Week ${w}`, ...weeks[w] }));
}
function groupByCategory(deliveries: Delivery[]) {
  const totals: Record<string, number> = {};
  for (const d of deliveries) totals[d.category] = (totals[d.category] || 0) + Number(d.amount);
  return FOOD_CATEGORIES.map(c => ({ name: c.label, value: totals[c.key] || 0, key: c.key })).filter(x => x.value > 0);
}

/* ─── Invoice Detail Modal (with Returns) ────────────────────────── */
const TEAL = "#00d4a8";
function InvoiceModal({ delivery, onClose, onReturn }: {
  delivery: Delivery;
  onClose: () => void;
  onReturn?: (deliveryId: string, returnAmt: number, returnNote: string) => Promise<void>;
}) {
  const items = delivery.lineItems ?? [];
  const total = items.reduce((s, i) => s + (i.total ?? 0), 0);
  const [showReturn, setShowReturn] = useState(false);
  const [returnItems, setReturnItems] = useState<Record<number, number>>({});
  const [returnNote, setReturnNote] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const returnTotal = Object.entries(returnItems).reduce((sum, [idx, qty]) => {
    const item = items[Number(idx)];
    if (!item || !item.unit_price || qty <= 0) return sum;
    return sum + item.unit_price * qty;
  }, 0);

  const submitReturn = async () => {
    if (!onReturn || returnTotal <= 0) return;
    setSubmitting(true);
    await onReturn(delivery.id, returnTotal, returnNote || `Return from Invoice #${delivery.invoice_number || delivery.id.slice(0,8)}`);
    setSubmitting(false);
    setShowReturn(false);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div className="rounded-2xl shadow-2xl max-w-2xl w-full max-h-[85vh] overflow-hidden flex flex-col"
        style={{ background: "#1a1a2e", border: "1px solid rgba(0,212,168,0.2)" }}
        onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="px-6 py-4 flex items-center justify-between" style={{ borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
          <div>
            <h2 className="font-bold text-white">{delivery.vendor}</h2>
            <p className="text-xs text-white/40 mt-0.5">
              {delivery.delivery_date}
              {delivery.invoice_number && ` · Invoice #${delivery.invoice_number}`}
            </p>
          </div>
          <div className="text-right">
            <p className="text-xl font-bold" style={{ color: TEAL }}>{fmtUSD(Number(delivery.amount))}</p>
            <div className="flex gap-2 mt-1 justify-end">
              {items.length > 0 && onReturn && !showReturn && (
                <button onClick={() => setShowReturn(true)}
                  className="text-xs text-red-400 hover:text-red-300 border border-red-800/40 px-2 py-0.5 rounded-lg">
                  ↩ Return Items
                </button>
              )}
              <button onClick={onClose} className="text-xs text-white/30 hover:text-white/60">✕ Close</button>
            </div>
          </div>
        </div>

        {/* Return form */}
        {showReturn && (
          <div className="px-6 py-4" style={{ background: "rgba(220,38,38,0.08)", borderBottom: "1px solid rgba(220,38,38,0.2)" }}>
            <p className="text-xs font-bold text-red-400 mb-3">↩ Record Return — select items and quantities returned</p>
            <div className="space-y-2 max-h-48 overflow-y-auto mb-3">
              {items.filter(it => it.unit_price && it.qty).map((item, idx) => (
                <div key={idx} className="flex items-center gap-3 rounded-lg px-3 py-2" style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(220,38,38,0.15)" }}>
                  <div className="flex-1 text-xs">
                    <span className="font-medium text-white">{item.name}</span>
                    <span className="text-white/30 ml-2">{fmtUSD(item.unit_price ?? 0)}/{item.unit || "unit"}</span>
                  </div>
                  <div className="flex items-center gap-1 text-xs">
                    <span className="text-white/30">Qty ({item.qty}):</span>
                    <input type="number" min="0" max={item.qty ?? 99}
                      value={returnItems[idx] ?? 0}
                      onChange={e => setReturnItems(p => ({ ...p, [idx]: Number(e.target.value) }))}
                      className="w-14 rounded px-1.5 py-0.5 text-center text-white focus:outline-none text-xs"
                      style={{ background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.15)" }} />
                  </div>
                  <div className="text-xs font-semibold text-red-400 w-16 text-right">
                    {returnItems[idx] ? `−${fmtUSD((returnItems[idx] * (item.unit_price ?? 0)))}` : "—"}
                  </div>
                </div>
              ))}
            </div>
            <input type="text" placeholder="Return reason (optional)" value={returnNote}
              onChange={e => setReturnNote(e.target.value)}
              className="w-full rounded-lg px-3 py-1.5 text-xs mb-3 text-white placeholder:text-white/20 focus:outline-none"
              style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(220,38,38,0.25)" }} />
            <div className="flex items-center justify-between">
              <p className="text-sm font-bold text-red-400">
                Return credit: <span className="text-base">−{fmtUSD(returnTotal)}</span>
              </p>
              <div className="flex gap-2">
                <button onClick={() => { setShowReturn(false); setReturnItems({}); }}
                  className="text-xs px-3 py-1.5 rounded-lg text-white/40 hover:text-white/70"
                  style={{ border: "1px solid rgba(255,255,255,0.1)" }}>Cancel</button>
                <button onClick={submitReturn} disabled={submitting || returnTotal <= 0}
                  className="text-xs px-4 py-1.5 rounded-lg text-white font-bold disabled:opacity-40"
                  style={{ background: "#dc2626" }}>
                  {submitting ? "Recording…" : "Record Return"}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Line items */}
        <div className="overflow-y-auto flex-1">
          {items.length === 0 ? (
            <p className="text-sm text-white/30 text-center py-12">No line items stored for this invoice.<br/>Re-scan the invoice to capture item details.</p>
          ) : (
            <table className="w-full text-xs">
              <thead className="sticky top-0" style={{ background: "rgba(255,255,255,0.04)" }}>
                <tr>
                  {["Item", "Qty", "Unit", "Unit Price", "Total", "Category"].map(h => (
                    <th key={h} className={`px-4 py-2.5 font-semibold text-white/40 ${["Item","Unit","Category"].includes(h) ? "text-left" : "text-right"}`}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {items.map((item, i) => (
                  <tr key={i} style={{ borderBottom: "1px solid rgba(255,255,255,0.04)", background: i % 2 !== 0 ? "rgba(255,255,255,0.02)" : "" }}>
                    <td className="px-4 py-2 text-white font-medium">{item.name}</td>
                    <td className="px-4 py-2 text-right tabular-nums text-white/60">{item.qty}</td>
                    <td className="px-4 py-2 text-white/40">{item.unit}</td>
                    <td className="px-4 py-2 text-right tabular-nums text-white/60">
                      {item.unit_price != null ? fmtUSD(item.unit_price) : "—"}
                    </td>
                    <td className="px-4 py-2 text-right tabular-nums font-semibold text-white">
                      {item.total != null ? fmtUSD(item.total) : "—"}
                    </td>
                    <td className="px-4 py-2">
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-medium" style={{ background: "rgba(0,212,168,0.1)", color: TEAL }}>{item.category}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr style={{ background: "rgba(0,212,168,0.08)", borderTop: "2px solid rgba(0,212,168,0.2)" }}>
                  <td colSpan={4} className="px-4 py-3 font-bold text-white/60">Total</td>
                  <td className="px-4 py-3 text-right font-bold" style={{ color: TEAL }}>{fmtUSD(total)}</td>
                  <td />
                </tr>
              </tfoot>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}

/* ─── Price Outlier Banner ───────────────────────────────────────── */
function OutlierBanner({ outliers }: { outliers: PriceOutlier[] }) {
  const [open, setOpen] = useState(true);
  const [expanded, setExpanded] = useState<number | null>(null);
  if (!outliers.length || !open) return null;
  return (
    <div className="bg-red-50 border border-red-200 rounded-2xl p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-red-800">⚠️ Price Increase Detected ({outliers.length} item{outliers.length > 1 ? "s" : ""})</h3>
        <button onClick={() => setOpen(false)} className="text-xs text-red-400 hover:text-red-600">Dismiss</button>
      </div>
      <div className="space-y-2">
        {outliers.map((o, i) => (
          <div key={i} className="bg-white rounded-xl border border-red-100 overflow-hidden">
            <button
              className="w-full flex items-center gap-3 text-xs px-3 py-2.5 hover:bg-red-50 transition-colors text-left"
              onClick={() => setExpanded(expanded === i ? null : i)}
            >
              <span className="flex-1 text-gray-800 font-semibold">{o.item}</span>
              <span className="text-gray-400 text-[11px]">{o.vendor}</span>
              <span className="text-gray-500 text-[11px]">Avg: <span className="font-medium text-gray-700">{fmtUSD(o.avg_price)}</span></span>
              <span className="font-bold text-red-600">{fmtUSD(o.current_price)}/{o.unit || "unit"}</span>
              <span className="bg-red-100 text-red-700 font-semibold px-2 py-0.5 rounded-full text-[10px]">▲ +{o.diff_pct.toFixed(1)}%</span>
              <span className="text-gray-400 ml-1">{expanded === i ? "▲" : "▼"}</span>
            </button>
            {expanded === i && (
              <div className="border-t border-red-100 px-3 pb-3 pt-2">
                <div className="grid grid-cols-3 gap-2 mb-3">
                  <div className="bg-red-50 rounded-lg p-2 text-center">
                    <p className="text-[10px] text-red-500 font-medium uppercase tracking-wide">Now Paying</p>
                    <p className="text-base font-bold text-red-700">{fmtUSD(o.current_price)}</p>
                    <p className="text-[10px] text-gray-400">{o.vendor}{o.current_invoice_number ? ` · #${o.current_invoice_number}` : ""}</p>
                    {o.current_date && <p className="text-[10px] text-gray-400">{new Date(o.current_date + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" })}</p>}
                  </div>
                  <div className="bg-gray-50 rounded-lg p-2 text-center">
                    <p className="text-[10px] text-gray-500 font-medium uppercase tracking-wide">6-Mo Average</p>
                    <p className="text-base font-bold text-gray-700">{fmtUSD(o.avg_price)}</p>
                    <p className="text-[10px] text-gray-400">historical avg</p>
                  </div>
                  <div className="bg-orange-50 rounded-lg p-2 text-center">
                    <p className="text-[10px] text-orange-500 font-medium uppercase tracking-wide">Overpaying</p>
                    <p className="text-base font-bold text-orange-700">+{fmtUSD(o.diff)}</p>
                    <p className="text-[10px] text-gray-400">per unit vs avg</p>
                  </div>
                </div>
                {o.history.length > 0 && (
                  <div>
                    <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Previous Invoice Prices</p>
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="text-gray-400 text-[10px]">
                          <th className="text-left pb-1 font-medium">Date</th>
                          <th className="text-left pb-1 font-medium">Invoice #</th>
                          <th className="text-left pb-1 font-medium">Vendor</th>
                          <th className="text-right pb-1 font-medium">Unit Price</th>
                          <th className="text-right pb-1 font-medium">vs Today</th>
                        </tr>
                      </thead>
                      <tbody>
                        {o.history.map((h, j) => {
                          const vsDiff = o.current_price - h.price;
                          const vsPct = (vsDiff / h.price) * 100;
                          return (
                            <tr key={j} className={`border-t border-gray-50 ${j % 2 === 0 ? "" : "bg-gray-50"}`}>
                              <td className="py-1.5 text-gray-600">{new Date(h.date + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</td>
                              <td className="py-1.5 text-gray-400 font-mono">{h.invoice_number ? `#${h.invoice_number}` : "—"}</td>
                              <td className="py-1.5 text-gray-500">{h.vendor}</td>
                              <td className="py-1.5 text-right font-semibold text-gray-800">{fmtUSD(h.price)}</td>
                              <td className={`py-1.5 text-right font-semibold ${vsDiff > 0 ? "text-red-500" : "text-green-600"}`}>
                                {vsDiff > 0 ? "▲" : "▼"} {Math.abs(vsPct).toFixed(1)}%
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

/* ─── Price Tracker Tab ──────────────────────────────────────────── */
interface PricePoint { month: string; label: string; price: number; vendor: string; date: string; invoiceNumber: string; qty?: number; unit?: string; }
interface RawPoint   { date: string; dateLabel: string; invoiceNumber: string; vendor: string; price: number; qty?: number; unit?: string; }
interface TrackedItem {
  name: string;
  category: string;
  history: PricePoint[];
  rawPts: RawPoint[];
  latestPrice: number;
  avgPrice: number;
  avg1mo: number;
  avg3mo: number;
  avg6mo: number;
  minPrice: number;
  maxPrice: number;
  changeVsAvg: number;
  changeMoM: number;
  changeWithinMonth: number;
  anomalyCount: number;
  orderCount: number;
}

function Sparkline({ points, color }: { points: number[]; color: string }) {
  if (points.length < 2) return <span className="text-white/20 text-xs">—</span>;
  const min = Math.min(...points);
  const max = Math.max(...points);
  const range = max - min || 1;
  const w = 80; const h = 28; const pad = 3;
  const xs = points.map((_, i) => pad + (i / (points.length - 1)) * (w - pad * 2));
  const ys = points.map(v => h - pad - ((v - min) / range) * (h - pad * 2));
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`}>
      <polyline points={xs.map((x, i) => `${x},${ys[i]}`).join(" ")}
        fill="none" stroke={color} strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={xs[xs.length - 1]} cy={ys[ys.length - 1]} r="2.5" fill={color} />
    </svg>
  );
}

function PriceTrackerTab({ locationId }: { locationId: string }) {
  const supabase = useMemo(() => createClient(), []);
  const [items, setItems] = useState<TrackedItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState<"spike" | "drop" | "name" | "orders">("spike");
  const [expandedItem, setExpandedItem] = useState<string | null>(null);
  const [subTab, setSubTab] = useState<"prices" | "compare" | "spikes" | "patterns" | "vendors">("prices");
  const [selectedVendor, setSelectedVendor] = useState<string | null>(null);
  const [expandedVendorItem, setExpandedVendorItem] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      setLoading(true);
      const since = new Date();
      since.setMonth(since.getMonth() - 9);
      const { data: deliveries } = await supabase
        .from("food_deliveries")
        .select("id,delivery_date,vendor,invoice_number")
        .eq("location_id", locationId)
        .gte("delivery_date", since.toISOString().slice(0, 10))
        .order("delivery_date");
      if (!deliveries?.length) { setLoading(false); return; }

      const deliveryMap: Record<string, { date: string; vendor: string; invoiceNumber: string }> = {};
      for (const d of deliveries) deliveryMap[d.id] = { date: d.delivery_date, vendor: d.vendor, invoiceNumber: d.invoice_number ?? "" };

      const { data: lineItems } = await supabase
        .from("invoice_line_items")
        .select("name,unit_price,qty,unit,category,food_delivery_id")
        .in("food_delivery_id", deliveries.map(d => d.id))
        .not("unit_price", "is", null)
        .gt("unit_price", 0);
      if (!lineItems?.length) { setLoading(false); return; }

      const byItem: Record<string, PricePoint[]> = {};
      const catByItem: Record<string, string> = {};
      for (const li of lineItems) {
        const d = deliveryMap[li.food_delivery_id];
        if (!d) continue;
        const key = li.name.toLowerCase().trim();
        const monthKey = d.date.slice(0, 7);
        const label = new Date(monthKey + "-02").toLocaleDateString("en-US", { month: "short", year: "2-digit" });
        (byItem[key] ??= []).push({ month: monthKey, label, price: Number(li.unit_price), vendor: d.vendor, date: d.date, invoiceNumber: d.invoiceNumber, qty: li.qty ?? undefined, unit: li.unit ?? undefined });
        catByItem[key] = li.category ?? "";
      }

      const now = new Date();
      const thisMonthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;

      const tracked: TrackedItem[] = Object.entries(byItem).map(([name, pts]) => {
        const sorted = [...pts].map(p => p.price).sort((a, b) => a - b);
        const median = sorted[Math.floor(sorted.length / 2)] || 0;
        const cleanPts = median > 0 ? pts.filter(p => p.price <= median * 8 && p.price >= median * 0.15) : pts;
        const anomalyCount = pts.length - cleanPts.length;

        const byMonth: Record<string, number[]> = {};
        for (const p of cleanPts) (byMonth[p.month] ??= []).push(p.price);
        const monthlyAvg = Object.entries(byMonth).sort(([a], [b]) => a.localeCompare(b)).map(([month, prices]) => {
          const avg = prices.reduce((s, v) => s + v, 0) / prices.length;
          const label = new Date(month + "-02").toLocaleDateString("en-US", { month: "short", year: "2-digit" });
          const vendors = cleanPts.filter(p => p.month === month).map(p => p.vendor);
          return { month, label, price: avg, vendor: Array.from(new Set<string>(vendors)).join(", "), date: "", invoiceNumber: "" };
        });

        const prices = monthlyAvg.map(p => p.price);
        const prevMonths = monthlyAvg.filter(p => p.month < thisMonthKey);
        const avg6mo = prevMonths.slice(-6).reduce((s, p) => s + p.price, 0) / Math.max(prevMonths.slice(-6).length, 1);
        const avg3mo = prevMonths.slice(-3).reduce((s, p) => s + p.price, 0) / Math.max(prevMonths.slice(-3).length, 1);
        const avg1mo = prevMonths.slice(-1)[0]?.price ?? 0;
        const latest = prices[prices.length - 1];
        const prev = prices[prices.length - 2];

        const thisMonthPts = cleanPts.filter(p => p.month === thisMonthKey).sort((a, b) => a.date.localeCompare(b.date));
        const withinMonthFirst = thisMonthPts[0]?.price ?? 0;
        const withinMonthLast = thisMonthPts[thisMonthPts.length - 1]?.price ?? 0;
        const changeWithinMonth = withinMonthFirst > 0 ? ((withinMonthLast - withinMonthFirst) / withinMonthFirst) * 100 : 0;

        const rawPts: RawPoint[] = [...cleanPts].sort((a, b) => b.date.localeCompare(a.date)).map(p => ({
          date: p.date,
          dateLabel: new Date(p.date + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "2-digit" }),
          invoiceNumber: p.invoiceNumber, vendor: p.vendor, price: p.price, qty: p.qty, unit: p.unit,
        }));

        const sixMoAgo = new Date(now);
        sixMoAgo.setMonth(sixMoAgo.getMonth() - 6);
        const orderCount = cleanPts.filter(p => p.date >= sixMoAgo.toISOString().slice(0, 10)).length;

        return {
          name: name.split(" ").map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(" "),
          category: catByItem[name], history: monthlyAvg, rawPts,
          latestPrice: latest, avgPrice: avg6mo, avg1mo, avg3mo, avg6mo,
          minPrice: Math.min(...prices), maxPrice: Math.max(...prices),
          changeVsAvg: avg6mo > 0 ? ((latest - avg6mo) / avg6mo) * 100 : 0,
          changeMoM: avg1mo > 0 ? ((latest - avg1mo) / avg1mo) * 100 : prev > 0 ? ((latest - prev) / prev) * 100 : 0,
          changeWithinMonth, anomalyCount, orderCount,
        };
      }).filter(it => it.history.length >= 1);

      setItems(tracked);
      setLoading(false);
    })();
  }, [locationId, supabase]);

  const fmtPct = (v: number) => `${v >= 0 ? "+" : ""}${v.toFixed(1)}%`;
  const alertColor = (pct: number) =>
    pct >= 20 ? "#f87171" : pct >= 10 ? "#fb923c" : pct >= 5 ? "#fbbf24" :
    pct <= -10 ? "#34d399" : pct <= -5 ? "#86efac" : "#6b7280";
  const alertLabel = (pct: number, anomalies = 0) => {
    if (anomalies > 0 && Math.abs(pct) >= 50) return "⚠️ Review invoice";
    return pct >= 20 ? "🔴 Major spike" : pct >= 10 ? "🟠 Spike" : pct >= 5 ? "🟡 Rising" :
      pct <= -10 ? "🟢 Major drop" : pct <= -5 ? "🟢 Drop" : "⚪ Stable";
  };

  const filtered = items
    .filter(it => !search || it.name.toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) =>
      sortBy === "spike"  ? b.changeVsAvg - a.changeVsAvg :
      sortBy === "drop"   ? a.changeVsAvg - b.changeVsAvg :
      sortBy === "orders" ? b.orderCount - a.orderCount :
      a.name.localeCompare(b.name)
    );

  const spikes = items.filter(it => it.changeVsAvg >= 15).sort((a, b) => b.changeVsAvg - a.changeVsAvg);

  const catGroups: Record<string, TrackedItem[]> = {};
  for (const it of items) { const cat = it.category || "Uncategorized"; (catGroups[cat] ??= []).push(it); }

  // ── Vendor price intelligence ──────────────────────────────────────
  interface VendorCommodity {
    name: string; category: string;
    latestVendorPrice: number; latestVendorDate: string; latestVendorInvoice: string;
    vendorPts: RawPoint[]; avg3mo: number; avg6mo: number; vsAvg3mo: number; vsAvg6mo: number;
  }
  interface VendorGroup {
    name: string; commodities: VendorCommodity[]; spikeCount: number; dropCount: number; lastDate: string;
  }
  const vendorMap: Record<string, VendorGroup> = {};
  for (const it of items) {
    const vendorSet = Array.from(new Set(it.rawPts.map(p => p.vendor)));
    for (const v of vendorSet) {
      const pts = it.rawPts.filter(p => p.vendor === v);
      if (!pts.length) continue;
      const latestPt = pts[0];
      const vs3 = it.avg3mo > 0 ? ((latestPt.price - it.avg3mo) / it.avg3mo) * 100 : 0;
      const vs6 = it.avg6mo > 0 ? ((latestPt.price - it.avg6mo) / it.avg6mo) * 100 : 0;
      const vc: VendorCommodity = {
        name: it.name, category: it.category,
        latestVendorPrice: latestPt.price, latestVendorDate: latestPt.dateLabel, latestVendorInvoice: latestPt.invoiceNumber,
        vendorPts: pts, avg3mo: it.avg3mo, avg6mo: it.avg6mo, vsAvg3mo: vs3, vsAvg6mo: vs6,
      };
      if (!vendorMap[v]) vendorMap[v] = { name: v, commodities: [], spikeCount: 0, dropCount: 0, lastDate: "" };
      vendorMap[v].commodities.push(vc);
      if (vs6 >= 10) vendorMap[v].spikeCount++;
      if (vs6 <= -10) vendorMap[v].dropCount++;
      if (!vendorMap[v].lastDate || latestPt.date > vendorMap[v].lastDate) vendorMap[v].lastDate = latestPt.date;
    }
  }
  const vendorGroups = Object.values(vendorMap).sort((a, b) => b.spikeCount - a.spikeCount || a.name.localeCompare(b.name));
  // ──────────────────────────────────────────────────────────────────

  if (loading) return <div className="py-16 text-center text-sm text-white/30">Loading price history…</div>;
  if (!items.length) return (
    <div className="py-16 text-center text-sm text-white/30">
      No line-item data yet. Scan invoices with AI to start tracking commodity prices.
    </div>
  );

  /* ── Inline expand row ─────────────────────────────────────────── */
  const ExpandedRow = ({ it }: { it: TrackedItem }) => {
    const compCards = [
      { label: "Within Month", val: it.changeWithinMonth, desc: "first → latest this month", ref: null as number | null },
      { label: "vs Last Month", val: it.changeMoM, desc: it.avg1mo > 0 ? `prev mo avg $${it.avg1mo.toFixed(2)}` : "no previous month", ref: it.avg1mo },
      { label: "vs 3-Mo Avg", val: it.avg3mo > 0 ? ((it.latestPrice - it.avg3mo) / it.avg3mo) * 100 : 0, desc: it.avg3mo > 0 ? `3-mo avg $${it.avg3mo.toFixed(2)}` : "< 3 mo of data", ref: it.avg3mo },
      { label: "vs 6-Mo Avg", val: it.changeVsAvg, desc: `6-mo avg $${it.avgPrice.toFixed(2)}`, ref: it.avg6mo },
    ];
    const cardBg = (v: number, ref: number | null) => {
      if (ref !== null && ref === 0) return "rgba(255,255,255,0.03)";
      return Math.abs(v) < 5 ? "rgba(255,255,255,0.04)" : v > 0 ? "rgba(248,113,113,0.08)" : "rgba(52,211,153,0.08)";
    };

    return (
      <tr>
        <td colSpan={7} className="p-0">
          <div className="px-5 py-4" style={{ background: "rgba(0,212,168,0.04)", borderTop: "1px solid rgba(0,212,168,0.1)", borderBottom: "1px solid rgba(0,212,168,0.1)" }}>
            {/* Price comparison cards */}
            <div className="grid grid-cols-2 gap-2 mb-4 sm:grid-cols-4">
              {compCards.map((c, i) => (
                <div key={i} className="rounded-xl p-3 text-center" style={{ background: cardBg(c.val, c.ref), border: `1px solid ${Math.abs(c.val) < 5 ? "rgba(255,255,255,0.06)" : c.val > 0 ? "rgba(248,113,113,0.2)" : "rgba(52,211,153,0.2)"}` }}>
                  <p className="text-[10px] text-white/30 font-medium uppercase tracking-wide">{c.label}</p>
                  <p className="text-lg font-bold mt-0.5" style={{ color: c.ref !== null && c.ref === 0 ? "#6b7280" : alertColor(c.val) }}>
                    {c.ref !== null && c.ref === 0 ? "—" : fmtPct(c.val)}
                  </p>
                  <p className="text-[10px] text-white/20 mt-0.5">{c.desc}</p>
                </div>
              ))}
            </div>

            {/* Current price */}
            <div className="flex items-center gap-3 mb-3 text-xs">
              <span className="font-bold text-white text-sm">${it.latestPrice.toFixed(2)}</span>
              <span className="text-white/30">current unit price</span>
              {it.rawPts[0] && (
                <>
                  <span className="text-white/20">·</span>
                  <span className="text-white/40">Last: {it.rawPts[0].dateLabel}</span>
                  {it.rawPts[0].invoiceNumber && <span className="text-white/20 font-mono">#{it.rawPts[0].invoiceNumber}</span>}
                  <span className="text-white/30">{it.rawPts[0].vendor}</span>
                  {it.rawPts[0].qty && it.rawPts[0].unit && (
                    <span className="rounded-full px-2 py-0.5 font-semibold text-[10px]" style={{ background: "rgba(0,212,168,0.12)", color: TEAL }}>
                      {it.rawPts[0].qty} {it.rawPts[0].unit}
                    </span>
                  )}
                </>
              )}
            </div>

            {/* Chart inside expand */}
            {it.history.length >= 2 && (
              <div className="mb-3">
                <p className="text-[10px] font-semibold text-white/20 uppercase tracking-wide mb-1.5">Monthly avg price trend</p>
                <ResponsiveContainer width="100%" height={120}>
                  <LineChart data={it.history} margin={{ top: 4, right: 8, left: 0, bottom: 4 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                    <XAxis dataKey="label" tick={{ fontSize: 10, fill: "rgba(255,255,255,0.3)" }} />
                    <YAxis tickFormatter={v => `$${v}`} tick={{ fontSize: 10, fill: "rgba(255,255,255,0.3)" }} width={44} />
                    <Tooltip formatter={(v) => [`$${Number(v).toFixed(2)}`, "Avg unit price"]}
                      contentStyle={{ background: "#0a0a1a", border: "1px solid rgba(0,212,168,0.2)", borderRadius: "8px", color: "#fff", fontSize: "11px" }} />
                    <Line type="monotone" dataKey="price" stroke={TEAL} strokeWidth={2} dot={{ r: 3, fill: TEAL }} activeDot={{ r: 5 }} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )}

            {/* Per-invoice history table */}
            {it.rawPts.length > 0 && (
              <div>
                <p className="text-[10px] font-semibold text-white/20 uppercase tracking-wide mb-1.5">Invoice history (newest first)</p>
                <div className="overflow-x-auto rounded-xl" style={{ border: "1px solid rgba(0,212,168,0.12)" }}>
                  <table className="w-full text-xs">
                    <thead style={{ background: "rgba(0,212,168,0.06)" }}>
                      <tr>
                        {["Date","Invoice #","Vendor","Qty / Unit","Unit Price","vs Previous Invoice"].map((h, i) => (
                          <th key={h} className={`px-3 py-2 font-semibold text-white/30 ${i >= 4 ? "text-right" : "text-left"}`}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {it.rawPts.map((pt, i) => {
                        const prv = it.rawPts[i + 1];
                        const diff = prv ? pt.price - prv.price : null;
                        const diffPct = prv && prv.price > 0 ? ((pt.price - prv.price) / prv.price) * 100 : null;
                        return (
                          <tr key={i} style={{ borderTop: "1px solid rgba(255,255,255,0.04)", background: i === 0 ? "rgba(0,212,168,0.05)" : undefined }}>
                            <td className="px-3 py-2 font-medium text-white">
                              {pt.dateLabel}
                              {i === 0 && <span className="ml-1.5 text-[9px] rounded-full px-1.5 py-0.5 font-bold" style={{ background: "rgba(0,212,168,0.15)", color: TEAL }}>LATEST</span>}
                            </td>
                            <td className="px-3 py-2 text-white/30 font-mono">{pt.invoiceNumber || "—"}</td>
                            <td className="px-3 py-2 text-white/50">{pt.vendor}</td>
                            <td className="px-3 py-2 text-white/40">
                              {pt.qty != null || pt.unit ? (
                                <span className="flex items-center gap-1">
                                  {pt.qty != null && <span className="font-medium text-white/60">{pt.qty}</span>}
                                  {pt.unit && <span className="text-[9px] uppercase px-1.5 py-0.5 rounded" style={{ background: "rgba(255,255,255,0.06)" }}>{pt.unit}</span>}
                                </span>
                              ) : <span className="text-white/20">—</span>}
                            </td>
                            <td className="px-3 py-2 text-right font-bold tabular-nums text-white">${pt.price.toFixed(2)}</td>
                            <td className="px-3 py-2 text-right tabular-nums">
                              {diffPct !== null ? (
                                <span className="font-semibold" style={{ color: diff! > 0 ? "#f87171" : diff! < 0 ? "#34d399" : "#6b7280" }}>
                                  {diff! > 0 ? "▲" : diff! < 0 ? "▼" : ""} {Math.abs(diffPct).toFixed(1)}%
                                  <span className="text-white/20 font-normal ml-1">({diff! > 0 ? "+" : ""}{diff!.toFixed(2)})</span>
                                </span>
                              ) : <span className="text-white/20 text-[10px]">first entry</span>}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        </td>
      </tr>
    );
  };

  return (
    <div className="space-y-4">
      {/* Sub-tab switcher */}
      <div className="flex gap-1 rounded-2xl p-1 flex-wrap" style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}>
        {(["prices", "compare", "spikes", "patterns", "vendors"] as const).map(t => (
          <button key={t} onClick={() => { setSubTab(t); setSelectedVendor(null); setExpandedVendorItem(null); }}
            className="px-4 py-1.5 rounded-xl text-xs font-semibold transition-all"
            style={subTab === t ? { background: TEAL, color: "#0a0a1a" } : { color: "rgba(255,255,255,0.4)" }}>
            {t === "prices" ? "📊 Price Tracker" : t === "compare" ? "📈 Price Comparison" : t === "spikes" ? `🚨 Major Spikes${spikes.length > 0 ? ` (${spikes.length})` : ""}` : t === "patterns" ? "📋 Order Patterns" : `🏪 By Vendor (${vendorGroups.length})`}
          </button>
        ))}
      </div>

      {/* ── PRICE TRACKER sub-tab ──────────────────────────────────── */}
      {subTab === "prices" && (
        <div className="rounded-2xl overflow-hidden" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)" }}>
          <div className="px-5 py-3 flex items-center gap-3 flex-wrap" style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
            <span className="text-sm font-bold text-white">All Commodities</span>
            <span className="text-xs text-white/30">click a row to see full price history & comparisons</span>
            <input value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Search item…"
              className="ml-auto rounded-lg px-3 py-1.5 text-xs text-white placeholder:text-white/20 focus:outline-none w-40"
              style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)" }} />
            <div className="flex gap-1 text-xs">
              {(["spike","drop","orders","name"] as const).map(s => (
                <button key={s} onClick={() => setSortBy(s)}
                  className="px-2.5 py-1 rounded-lg font-medium transition-colors"
                  style={sortBy === s ? { background: TEAL, color: "#0a0a1a" } : { background: "rgba(255,255,255,0.06)", color: "rgba(255,255,255,0.5)" }}>
                  {s === "spike" ? "▲ Spike" : s === "drop" ? "▼ Drop" : s === "orders" ? "# Orders" : "A–Z"}
                </button>
              ))}
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead style={{ background: "rgba(255,255,255,0.03)" }}>
                <tr>
                  {["Item","Latest","6-mo avg","vs 6-mo","vs Last Mo","Trend","Status"].map((h, i) => (
                    <th key={h} className={`px-4 py-2.5 font-semibold text-white/30 ${i === 0 || i === 6 ? "text-left" : "text-right"} ${i === 5 ? "text-center" : ""}`}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((it, i) => (
                  <React.Fragment key={it.name}>
                    <tr
                      onClick={() => setExpandedItem(expandedItem === it.name ? null : it.name)}
                      className="cursor-pointer transition-colors"
                      style={{ borderTop: "1px solid rgba(255,255,255,0.04)", background: expandedItem === it.name ? "rgba(0,212,168,0.05)" : undefined }}>
                      <td className="px-4 py-2.5 font-medium text-white">
                        <span className="flex items-center gap-1.5">
                          <span className="text-[10px] text-white/20 transition-transform" style={{ transform: expandedItem === it.name ? "rotate(90deg)" : "none", display: "inline-block" }}>▶</span>
                          {it.name}
                        </span>
                        {it.category && <span className="text-[9px] text-white/20 block">{it.category}</span>}
                      </td>
                      <td className="px-4 py-2.5 text-right font-bold tabular-nums text-white">${it.latestPrice.toFixed(2)}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums text-white/30">${it.avg6mo.toFixed(2)}</td>
                      <td className="px-4 py-2.5 text-right font-bold tabular-nums" style={{ color: alertColor(it.changeVsAvg) }}>{fmtPct(it.changeVsAvg)}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums" style={{ color: alertColor(it.changeMoM) }}>
                        {it.avg1mo > 0 ? fmtPct(it.changeMoM) : <span className="text-white/20">—</span>}
                      </td>
                      <td className="px-4 py-2.5">
                        <div className="flex justify-center">
                          <Sparkline points={it.history.map(p => p.price)}
                            color={it.changeVsAvg >= 10 ? "#f87171" : it.changeVsAvg <= -5 ? "#34d399" : "#6b7280"} />
                        </div>
                      </td>
                      <td className="px-4 py-2.5">
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold border"
                          style={{ color: alertColor(it.changeVsAvg), borderColor: alertColor(it.changeVsAvg) + "55", background: alertColor(it.changeVsAvg) + "11" }}>
                          {alertLabel(it.changeVsAvg, it.anomalyCount)}
                        </span>
                      </td>
                    </tr>
                    {expandedItem === it.name && <ExpandedRow it={it} />}
                  </React.Fragment>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── PRICE COMPARISON sub-tab ──────────────────────────────── */}
      {subTab === "compare" && (() => {
        const sortedItems = [...items].sort((a, b) => Math.abs(b.changeVsAvg) - Math.abs(a.changeVsAvg));
        const fmtChange = (pct: number, hasData: boolean) => {
          if (!hasData) return <span className="text-white/20 text-[10px]">—</span>;
          const color = pct >= 15 ? "#f87171" : pct >= 5 ? "#fb923c" : pct <= -5 ? "#34d399" : "#6b7280";
          return <span className="font-bold tabular-nums" style={{ color }}>{pct > 0 ? "▲" : pct < 0 ? "▼" : ""}{Math.abs(pct).toFixed(1)}%</span>;
        };
        return (
          <div className="space-y-4">
            {/* Legend */}
            <div className="flex gap-4 text-[10px] font-medium flex-wrap">
              {[["🔴", "#f87171", "Spike ≥15%"], ["🟠", "#fb923c", "High 5–14%"], ["⚪", "#6b7280", "Stable ±4%"], ["🟢", "#34d399", "Drop ≥5%"]].map(([icon, color, label]) => (
                <span key={label as string} className="flex items-center gap-1" style={{ color: color as string }}>{icon} {label}</span>
              ))}
            </div>
            {/* Comparison Table */}
            <div className="rounded-2xl overflow-hidden" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)" }}>
              <div className="px-5 py-3 flex items-center gap-2 flex-wrap" style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
                <span className="text-sm font-bold text-white">Commodity Price Comparison</span>
                <span className="text-[10px] text-white/30 ml-2">All periods show average unit price across invoices</span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead style={{ background: "rgba(0,212,168,0.06)" }}>
                    <tr>
                      {["Commodity", "Current Price", "Last Month Avg", "vs 1-Mo", "3-Month Avg", "vs 3-Mo", "6-Month Avg", "vs 6-Mo", "Trend"].map((h, i) => (
                        <th key={h} className={`px-4 py-3 font-semibold text-white/40 whitespace-nowrap ${i === 0 ? "text-left" : "text-right"} ${i === 8 ? "text-center" : ""}`}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {sortedItems.map((it, idx) => {
                      const vs1 = it.avg1mo > 0 ? ((it.latestPrice - it.avg1mo) / it.avg1mo) * 100 : null;
                      const vs3 = it.avg3mo > 0 ? ((it.latestPrice - it.avg3mo) / it.avg3mo) * 100 : null;
                      const vs6 = it.avg6mo > 0 ? ((it.latestPrice - it.avg6mo) / it.avg6mo) * 100 : null;
                      const rowAlert = vs6 !== null && Math.abs(vs6) >= 15;
                      return (
                        <tr key={it.name} style={{ borderTop: "1px solid rgba(255,255,255,0.04)", background: rowAlert ? "rgba(248,113,113,0.04)" : undefined }}>
                          <td className="px-4 py-3 font-medium text-white whitespace-nowrap">
                            {it.name}
                            {it.category && <span className="block text-[9px] text-white/20">{it.category}</span>}
                          </td>
                          <td className="px-4 py-3 text-right font-bold tabular-nums text-white">${it.latestPrice.toFixed(2)}</td>
                          <td className="px-4 py-3 text-right tabular-nums text-white/50">{it.avg1mo > 0 ? `$${it.avg1mo.toFixed(2)}` : <span className="text-white/20">—</span>}</td>
                          <td className="px-4 py-3 text-right">{fmtChange(vs1 ?? 0, vs1 !== null)}</td>
                          <td className="px-4 py-3 text-right tabular-nums text-white/50">{it.avg3mo > 0 ? `$${it.avg3mo.toFixed(2)}` : <span className="text-white/20">—</span>}</td>
                          <td className="px-4 py-3 text-right">{fmtChange(vs3 ?? 0, vs3 !== null)}</td>
                          <td className="px-4 py-3 text-right tabular-nums text-white/50">{it.avg6mo > 0 ? `$${it.avg6mo.toFixed(2)}` : <span className="text-white/20">—</span>}</td>
                          <td className="px-4 py-3 text-right">{fmtChange(vs6 ?? 0, vs6 !== null)}</td>
                          <td className="px-4 py-3">
                            <div className="flex justify-center">
                              <Sparkline points={it.history.map(p => p.price)} color={vs6 !== null && vs6 >= 10 ? "#f87171" : vs6 !== null && vs6 <= -5 ? "#34d399" : "#6b7280"} />
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Price Intelligence Summary Cards */}
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {[
                { label: "Biggest Spike", icon: "🔴", item: sortedItems.find(it => it.avg6mo > 0 && ((it.latestPrice - it.avg6mo) / it.avg6mo) * 100 >= 5) },
                { label: "Biggest Drop", icon: "🟢", item: sortedItems.slice().reverse().find(it => it.avg6mo > 0 && ((it.latestPrice - it.avg6mo) / it.avg6mo) * 100 <= -5) },
                { label: "Most Stable", icon: "⚪", item: [...sortedItems].sort((a, b) => Math.abs((a.latestPrice - a.avg6mo) / Math.max(a.avg6mo, 0.01)) - Math.abs((b.latestPrice - b.avg6mo) / Math.max(b.avg6mo, 0.01)))[0] },
                { label: "Most Volatile", icon: "⚡", item: [...sortedItems].sort((a, b) => b.anomalyCount - a.anomalyCount)[0] },
              ].map(({ label, icon, item }) => item ? (
                <div key={label} className="rounded-xl p-3" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)" }}>
                  <div className="text-[10px] text-white/30 font-semibold uppercase tracking-wide mb-1">{icon} {label}</div>
                  <div className="text-sm font-bold text-white truncate">{item.name}</div>
                  <div className="text-xs font-bold mt-0.5" style={{ color: item.avg6mo > 0 && ((item.latestPrice - item.avg6mo) / item.avg6mo) * 100 >= 5 ? "#f87171" : "#34d399" }}>
                    ${item.latestPrice.toFixed(2)} {item.avg6mo > 0 ? `(${((item.latestPrice - item.avg6mo) / item.avg6mo * 100) > 0 ? "▲" : "▼"}${Math.abs((item.latestPrice - item.avg6mo) / item.avg6mo * 100).toFixed(1)}% vs 6-mo)` : ""}
                  </div>
                </div>
              ) : null)}
            </div>
          </div>
        );
      })()}

      {/* ── MAJOR SPIKES sub-tab ───────────────────────────────────── */}
      {subTab === "spikes" && (
        <div className="space-y-3">
          {spikes.length === 0 ? (
            <div className="rounded-2xl py-12 text-center text-sm text-white/30" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)" }}>
              ✅ No major spikes — all items within 15% of 6-month average
            </div>
          ) : spikes.map((it, i) => (
            <div key={i} className="rounded-2xl overflow-hidden" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(248,113,113,0.25)" }}>
              <div className="flex items-center gap-4 px-5 py-4" style={{ borderBottom: "1px solid rgba(248,113,113,0.15)" }}>
                <div className="w-8 h-8 rounded-full flex items-center justify-center text-white font-bold text-sm" style={{ background: "#dc2626" }}>{i + 1}</div>
                <div className="flex-1">
                  <p className="font-bold text-white">{it.name}</p>
                  <p className="text-xs text-white/30">{it.category} · Last seen: {it.rawPts[0]?.vendor} on {it.rawPts[0]?.dateLabel}</p>
                </div>
                <div className="text-right">
                  <p className="text-2xl font-black" style={{ color: "#f87171" }}>+{it.changeVsAvg.toFixed(1)}%</p>
                  <p className="text-xs text-white/30">vs 6-month average</p>
                </div>
              </div>
              <div className="grid grid-cols-4" style={{ borderTop: "1px solid rgba(255,255,255,0.06)" }}>
                {[
                  { l: "Now", v: `$${it.latestPrice.toFixed(2)}`, c: "#f87171" },
                  { l: "1-Mo Avg", v: it.avg1mo > 0 ? `$${it.avg1mo.toFixed(2)}` : "—", c: "rgba(255,255,255,0.6)" },
                  { l: "3-Mo Avg", v: it.avg3mo > 0 ? `$${it.avg3mo.toFixed(2)}` : "—", c: "rgba(255,255,255,0.6)" },
                  { l: "6-Mo Avg", v: `$${it.avg6mo.toFixed(2)}`, c: "rgba(255,255,255,0.6)" },
                ].map((cell, j) => (
                  <div key={j} className="px-4 py-3 text-center" style={{ borderRight: j < 3 ? "1px solid rgba(255,255,255,0.06)" : undefined }}>
                    <p className="text-[10px] text-white/30 uppercase tracking-wide">{cell.l}</p>
                    <p className="text-base font-bold" style={{ color: cell.c }}>{cell.v}</p>
                  </div>
                ))}
              </div>
              {it.rawPts.slice(0, 4).length > 0 && (
                <div className="px-5 py-3" style={{ borderTop: "1px solid rgba(255,255,255,0.06)" }}>
                  <p className="text-[10px] text-white/20 uppercase font-semibold mb-2">Recent Invoice Prices</p>
                  <div className="space-y-1">
                    {it.rawPts.slice(0, 4).map((pt, j) => {
                      const prv = it.rawPts[j + 1];
                      const diffPct = prv && prv.price > 0 ? ((pt.price - prv.price) / prv.price) * 100 : null;
                      return (
                        <div key={j} className="flex items-center gap-3 text-xs">
                          <span className="text-white/30 w-24">{pt.dateLabel}</span>
                          <span className="text-white/20 font-mono w-20">{pt.invoiceNumber ? `#${pt.invoiceNumber}` : "—"}</span>
                          <span className="text-white/40 flex-1">{pt.vendor}</span>
                          {pt.qty && pt.unit && <span className="text-white/30">{pt.qty} {pt.unit}</span>}
                          <span className="font-bold text-white tabular-nums">${pt.price.toFixed(2)}</span>
                          {diffPct !== null && (
                            <span className="font-semibold tabular-nums w-14 text-right" style={{ color: diffPct > 0 ? "#f87171" : "#34d399" }}>
                              {diffPct > 0 ? "▲" : "▼"} {Math.abs(diffPct).toFixed(1)}%
                            </span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* ── ORDER PATTERNS sub-tab ────────────────────────────────── */}
      {subTab === "patterns" && (
        <div className="space-y-4">
          {Object.entries(catGroups).sort(([a], [b]) => a.localeCompare(b)).map(([cat, catItems]) => (
            <div key={cat} className="rounded-2xl overflow-hidden" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)" }}>
              <div className="px-5 py-3 flex items-center gap-2" style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
                <span className="text-sm font-bold text-white">{cat}</span>
                <span className="text-xs text-white/30">{catItems.length} item{catItems.length !== 1 ? "s" : ""}</span>
              </div>
              <table className="w-full text-xs">
                <thead style={{ background: "rgba(255,255,255,0.02)" }}>
                  <tr>
                    {["Item","Orders / 6 mo","~Monthly Freq","Avg Unit Price","Trend","Last Ordered"].map((h, i) => (
                      <th key={h} className={`px-4 py-2 font-semibold text-white/30 ${i === 0 || i === 5 ? "text-left" : "text-right"}`}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {catItems.sort((a, b) => b.orderCount - a.orderCount).map((it, i) => {
                    const freqPerMonth = it.orderCount / 6;
                    const freqLabel = freqPerMonth >= 4 ? "Weekly" : freqPerMonth >= 2 ? "Bi-weekly" : freqPerMonth >= 1 ? "Monthly" : freqPerMonth >= 0.5 ? "Every 2 mo" : "Occasional";
                    const freqColor = freqPerMonth >= 2 ? { background: "rgba(0,212,168,0.12)", color: TEAL } : freqPerMonth >= 1 ? { background: "rgba(251,191,36,0.1)", color: "#fbbf24" } : { background: "rgba(255,255,255,0.04)", color: "rgba(255,255,255,0.3)" };
                    return (
                      <tr key={i} style={{ borderTop: "1px solid rgba(255,255,255,0.04)" }}>
                        <td className="px-4 py-2.5 font-medium text-white">{it.name}</td>
                        <td className="px-4 py-2.5 text-right tabular-nums text-white/50">{it.orderCount}</td>
                        <td className="px-4 py-2.5 text-right">
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold" style={freqColor}>{freqLabel}</span>
                        </td>
                        <td className="px-4 py-2.5 text-right tabular-nums font-medium text-white/70">${it.avgPrice.toFixed(2)}</td>
                        <td className="px-4 py-2.5 text-right" style={{ color: alertColor(it.changeVsAvg) }}>
                          {it.history.length >= 2 ? fmtPct(it.changeVsAvg) : "—"}
                        </td>
                        <td className="px-4 py-2.5 text-white/30">
                          {it.rawPts[0] ? `${it.rawPts[0].dateLabel} · ${it.rawPts[0].vendor}` : "—"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ))}
        </div>
      )}

      {/* ── VENDOR PRICE INTELLIGENCE sub-tab ─────────────────────── */}
      {subTab === "vendors" && (
        <div className="space-y-4">
          {!selectedVendor ? (
            <>
              <p className="text-xs text-white/30">Select a vendor to see all their commodities, price fluctuations, and spike outliers vs 3-month &amp; 6-month averages.</p>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {vendorGroups.map(vg => {
                  const avgVs6 = vg.commodities.length ? vg.commodities.reduce((s, c) => s + c.vsAvg6mo, 0) / vg.commodities.length : 0;
                  const worstSpike = vg.commodities.reduce((worst, c) => c.vsAvg6mo > worst ? c.vsAvg6mo : worst, 0);
                  return (
                    <button key={vg.name}
                      onClick={() => { setSelectedVendor(vg.name); setExpandedVendorItem(null); }}
                      className="text-left rounded-2xl p-4 transition-all group"
                      style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)" }}
                      onMouseEnter={e => (e.currentTarget.style.borderColor = TEAL + "66")}
                      onMouseLeave={e => (e.currentTarget.style.borderColor = "rgba(255,255,255,0.08)")}>
                      <div className="flex items-start justify-between gap-2 mb-3">
                        <div>
                          <p className="font-bold text-white text-sm leading-tight">{vg.name}</p>
                          <p className="text-[10px] text-white/30 mt-0.5">{vg.commodities.length} commodit{vg.commodities.length !== 1 ? "ies" : "y"} · Last: {vg.lastDate}</p>
                        </div>
                        <span className="text-white/30">→</span>
                      </div>
                      <div className="grid grid-cols-3 gap-2 text-center">
                        {[
                          { label: "Spikes", val: String(vg.spikeCount), color: vg.spikeCount > 0 ? "#f87171" : "rgba(255,255,255,0.3)" },
                          { label: "Drops",  val: String(vg.dropCount),  color: vg.dropCount > 0 ? TEAL : "rgba(255,255,255,0.3)" },
                          { label: "Avg vs 6mo", val: fmtPct(avgVs6), color: alertColor(avgVs6) },
                        ].map(s => (
                          <div key={s.label} className="rounded-xl p-2" style={{ background: "rgba(255,255,255,0.03)" }}>
                            <p className="text-[9px] text-white/25 uppercase font-semibold">{s.label}</p>
                            <p className="text-base font-bold mt-0.5" style={{ color: s.color }}>{s.val}</p>
                          </div>
                        ))}
                      </div>
                      {vg.spikeCount > 0 && (
                        <div className="mt-2.5 px-2.5 py-1.5 rounded-lg text-[10px] font-semibold" style={{ background: "rgba(248,113,113,0.1)", color: "#f87171" }}>
                          ⚠️ Worst spike: +{worstSpike.toFixed(1)}% vs 6-month avg — negotiate!
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>
            </>
          ) : (
            (() => {
              const vg = vendorGroups.find(v => v.name === selectedVendor)!;
              const spikesHere = vg.commodities.filter(c => c.vsAvg6mo >= 10).sort((a, b) => b.vsAvg6mo - a.vsAvg6mo);
              const stableHere = vg.commodities.filter(c => Math.abs(c.vsAvg6mo) < 10).sort((a, b) => a.name.localeCompare(b.name));
              const dropsHere  = vg.commodities.filter(c => c.vsAvg6mo <= -10).sort((a, b) => a.vsAvg6mo - b.vsAvg6mo);
              const allSorted  = [...spikesHere, ...stableHere, ...dropsHere];

              const CommodityExpandedRow = ({ vc }: { vc: typeof vg.commodities[0] }) => (
                <tr>
                  <td colSpan={8} className="p-0">
                    <div className="px-5 py-4" style={{ background: "rgba(0,212,168,0.04)", borderTop: "1px solid rgba(0,212,168,0.1)", borderBottom: "1px solid rgba(0,212,168,0.1)" }}>
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-4">
                        {[
                          { label: "Latest (this vendor)", display: `$${vc.latestVendorPrice.toFixed(2)}`, sub: `${vc.latestVendorDate}${vc.latestVendorInvoice ? ` · #${vc.latestVendorInvoice}` : ""}`, val: null },
                          { label: "vs 3-Mo Avg", display: vc.avg3mo > 0 ? fmtPct(vc.vsAvg3mo) : "—", sub: vc.avg3mo > 0 ? `3-mo avg $${vc.avg3mo.toFixed(2)}` : "< 3 months data", val: vc.vsAvg3mo },
                          { label: "vs 6-Mo Avg", display: vc.avg6mo > 0 ? fmtPct(vc.vsAvg6mo) : "—", sub: vc.avg6mo > 0 ? `6-mo avg $${vc.avg6mo.toFixed(2)}` : "< 6 months data", val: vc.vsAvg6mo },
                          { label: "Times Ordered", display: String(vc.vendorPts.length), sub: "from this vendor", val: null },
                        ].map((card, i) => (
                          <div key={i} className="rounded-xl p-3 text-center" style={{ background: card.val !== null ? (card.val > 5 ? "rgba(248,113,113,0.08)" : card.val < -5 ? "rgba(52,211,153,0.08)" : "rgba(255,255,255,0.04)") : "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.06)" }}>
                            <p className="text-[10px] text-white/30 font-semibold uppercase tracking-wide leading-tight">{card.label}</p>
                            <p className="text-lg font-bold mt-1" style={{ color: card.val !== null ? alertColor(card.val) : "white" }}>{card.display}</p>
                            <p className="text-[10px] text-white/25 mt-0.5">{card.sub}</p>
                          </div>
                        ))}
                      </div>
                      {vc.vendorPts.length >= 2 && (
                        <div className="flex items-center gap-4 mb-3">
                          <p className="text-[10px] font-semibold text-white/30 uppercase tracking-wide shrink-0">Price trend (oldest → newest)</p>
                          <Sparkline points={[...vc.vendorPts].reverse().map(p => p.price)}
                            color={vc.vsAvg6mo >= 10 ? "#f87171" : vc.vsAvg6mo <= -10 ? TEAL : "#6b7280"} />
                        </div>
                      )}
                      <div className="overflow-x-auto rounded-xl" style={{ border: "1px solid rgba(255,255,255,0.06)" }}>
                        <table className="w-full text-xs">
                          <thead style={{ background: "rgba(255,255,255,0.03)" }}>
                            <tr>
                              {["Date","Invoice #","Qty / Unit","Unit Price","vs Prev Invoice","vs 6-Mo Avg"].map((h, i) => (
                                <th key={h} className={`px-3 py-2 font-semibold text-white/30 ${i >= 3 ? "text-right" : "text-left"}`}>{h}</th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {vc.vendorPts.map((pt, pi) => {
                              const prv = vc.vendorPts[pi + 1];
                              const diffPct = prv && prv.price > 0 ? ((pt.price - prv.price) / prv.price) * 100 : null;
                              const vs6 = vc.avg6mo > 0 ? ((pt.price - vc.avg6mo) / vc.avg6mo) * 100 : null;
                              const isOutlier = vs6 !== null && Math.abs(vs6) >= 15;
                              return (
                                <tr key={pi} style={{ borderTop: "1px solid rgba(255,255,255,0.04)", background: pi === 0 ? "rgba(0,212,168,0.04)" : isOutlier ? "rgba(248,113,113,0.05)" : undefined }}>
                                  <td className="px-3 py-2 font-medium text-white">
                                    {pt.dateLabel}
                                    {pi === 0 && <span className="ml-1.5 text-[9px] px-1.5 py-0.5 rounded-full font-bold" style={{ background: TEAL + "22", color: TEAL }}>LATEST</span>}
                                    {isOutlier && pi !== 0 && <span className="ml-1.5 text-[9px] px-1.5 py-0.5 rounded-full font-bold" style={{ background: "rgba(248,113,113,0.2)", color: "#f87171" }}>OUTLIER</span>}
                                  </td>
                                  <td className="px-3 py-2 text-white/30 font-mono">{pt.invoiceNumber || "—"}</td>
                                  <td className="px-3 py-2 text-white/40">
                                    {pt.qty != null || pt.unit ? `${pt.qty != null ? pt.qty : ""} ${pt.unit ?? ""}`.trim() : "—"}
                                  </td>
                                  <td className="px-3 py-2 text-right font-bold tabular-nums text-white">${pt.price.toFixed(2)}</td>
                                  <td className="px-3 py-2 text-right tabular-nums">
                                    {diffPct !== null
                                      ? <span style={{ color: diffPct > 0 ? "#f87171" : diffPct < 0 ? TEAL : "rgba(255,255,255,0.3)", fontWeight: 600 }}>
                                          {diffPct > 0 ? "▲" : "▼"} {Math.abs(diffPct).toFixed(1)}%
                                        </span>
                                      : <span className="text-white/20 text-[10px]">first entry</span>}
                                  </td>
                                  <td className="px-3 py-2 text-right tabular-nums">
                                    {vs6 !== null
                                      ? <span style={{ color: alertColor(vs6), fontWeight: 600 }}>{vs6 >= 0 ? "+" : ""}{vs6.toFixed(1)}%</span>
                                      : <span className="text-white/20">—</span>}
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </td>
                </tr>
              );

              return (
                <div className="space-y-4">
                  <div className="flex items-center gap-3 flex-wrap">
                    <button onClick={() => { setSelectedVendor(null); setExpandedVendorItem(null); }}
                      className="text-xs px-3 py-1.5 rounded-lg font-medium transition-colors"
                      style={{ background: "rgba(255,255,255,0.06)", color: "rgba(255,255,255,0.6)" }}>
                      ← All Vendors
                    </button>
                    <div>
                      <h3 className="font-bold text-white text-base">{vg.name}</h3>
                      <p className="text-xs text-white/30">{vg.commodities.length} commodities · last order {vg.lastDate}</p>
                    </div>
                    {vg.spikeCount > 0 && (
                      <span className="ml-auto text-xs font-semibold px-3 py-1.5 rounded-lg" style={{ background: "rgba(248,113,113,0.1)", color: "#f87171", border: "1px solid rgba(248,113,113,0.2)" }}>
                        🚨 {vg.spikeCount} price spike{vg.spikeCount !== 1 ? "s" : ""} detected
                      </span>
                    )}
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    {[
                      { label: "Commodities", val: String(vg.commodities.length), color: "white" },
                      { label: "Price Spikes (≥10%↑)", val: String(vg.spikeCount), color: vg.spikeCount > 0 ? "#f87171" : "rgba(255,255,255,0.3)" },
                      { label: "Price Drops (≥10%↓)", val: String(vg.dropCount), color: vg.dropCount > 0 ? TEAL : "rgba(255,255,255,0.3)" },
                      { label: "Stable Items", val: String(vg.commodities.length - vg.spikeCount - vg.dropCount), color: "rgba(255,255,255,0.5)" },
                    ].map((s, i) => (
                      <div key={i} className="rounded-2xl p-4 text-center" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}>
                        <p className="text-[10px] text-white/25 uppercase font-semibold tracking-wide">{s.label}</p>
                        <p className="text-2xl font-bold mt-1" style={{ color: s.color }}>{s.val}</p>
                      </div>
                    ))}
                  </div>
                  <div className="rounded-2xl overflow-hidden" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)" }}>
                    <div className="px-5 py-3 flex items-center gap-2" style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
                      <span className="text-sm font-bold text-white">All Commodities from {vg.name}</span>
                      <span className="text-xs text-white/30">click a row to see full invoice history &amp; outliers</span>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs">
                        <thead style={{ background: "rgba(255,255,255,0.02)" }}>
                          <tr>
                            {["Commodity","Latest Price","3-Mo Avg","6-Mo Avg","vs 3-Mo","vs 6-Mo","Trend","Status"].map((h, i) => (
                              <th key={h} className={`px-4 py-2.5 font-semibold text-white/30 ${i === 0 || i === 7 ? "text-left" : i === 6 ? "text-center" : "text-right"}`}>{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {allSorted.map(vc => (
                            <React.Fragment key={vc.name}>
                              <tr
                                onClick={() => setExpandedVendorItem(expandedVendorItem === vc.name ? null : vc.name)}
                                className="cursor-pointer transition-colors"
                                style={{ borderTop: "1px solid rgba(255,255,255,0.04)", background: expandedVendorItem === vc.name ? "rgba(0,212,168,0.05)" : undefined }}>
                                <td className="px-4 py-2.5">
                                  <span className="flex items-center gap-1.5 font-medium text-white">
                                    <span className="text-[10px] text-white/20" style={{ transform: expandedVendorItem === vc.name ? "rotate(90deg)" : "none", display: "inline-block" }}>▶</span>
                                    {vc.name}
                                  </span>
                                  {vc.category && <span className="text-[9px] text-white/20 block ml-4">{vc.category}</span>}
                                </td>
                                <td className="px-4 py-2.5 text-right font-bold tabular-nums text-white">${vc.latestVendorPrice.toFixed(2)}</td>
                                <td className="px-4 py-2.5 text-right tabular-nums text-white/30">{vc.avg3mo > 0 ? `$${vc.avg3mo.toFixed(2)}` : "—"}</td>
                                <td className="px-4 py-2.5 text-right tabular-nums text-white/30">{vc.avg6mo > 0 ? `$${vc.avg6mo.toFixed(2)}` : "—"}</td>
                                <td className="px-4 py-2.5 text-right font-semibold tabular-nums" style={{ color: alertColor(vc.vsAvg3mo) }}>{vc.avg3mo > 0 ? fmtPct(vc.vsAvg3mo) : "—"}</td>
                                <td className="px-4 py-2.5 text-right font-bold tabular-nums" style={{ color: alertColor(vc.vsAvg6mo) }}>{vc.avg6mo > 0 ? fmtPct(vc.vsAvg6mo) : "—"}</td>
                                <td className="px-4 py-2.5 text-center">
                                  {vc.vendorPts.length >= 2 && (
                                    <Sparkline points={[...vc.vendorPts].reverse().map(p => p.price)}
                                      color={vc.vsAvg6mo >= 10 ? "#f87171" : vc.vsAvg6mo <= -10 ? TEAL : "#6b7280"} />
                                  )}
                                </td>
                                <td className="px-4 py-2.5">
                                  <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold border"
                                    style={{ color: alertColor(vc.vsAvg6mo), borderColor: alertColor(vc.vsAvg6mo) + "55", background: alertColor(vc.vsAvg6mo) + "11" }}>
                                    {alertLabel(vc.vsAvg6mo)}
                                  </span>
                                </td>
                              </tr>
                              {expandedVendorItem === vc.name && <CommodityExpandedRow vc={vc} />}
                            </React.Fragment>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              );
            })()
          )}
        </div>
      )}
    </div>
  );
}

/* ─── component ──────────────────────────────────────────────────── */
export default function FoodPage() {
  const { id } = useParams<{ id: string }>();
  const supabase = useMemo(() => createClient(), []);
  const { ready } = useAuthGuard();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [tab, setTab] = useState<"log" | "monthly" | "trends" | "vendors" | "prices" | "market" | "contracts">("log");
  const [deliveries, setDeliveries] = useState<Delivery[]>([]);
  const [form, setForm] = useState(empty());
  const [customCategory, setCustomCategory] = useState("");
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [pendingLineItems, setPendingLineItems] = useState<InvoiceLineItem[]>([]);
  const [saving, setSaving] = useState(false);
  const [locationName, setLocationName] = useState("");
  const [deleting, setDeleting] = useState<string | null>(null);
  const [uploading, setUploading] = useState<string | null>(null);
  const [expandedRow, setExpandedRow] = useState<string | null>(null);
  const [trendData, setTrendData] = useState<MonthTotal[]>([]);
  const [modalDelivery, setModalDelivery] = useState<Delivery | null>(null);
  const [outliers, setOutliers] = useState<PriceOutlier[]>([]);
  const [saveError, setSaveError] = useState("");
  const [dupWarning, setDupWarning] = useState<string | null>(null);
  // OCR metadata captured from last scan — persisted into food_deliveries on save
  const [ocrScore, setOcrScore] = useState<number | undefined>(undefined);
  const [ocrParsingStatus, setOcrParsingStatus] = useState<string | undefined>(undefined);
  const [logSort, setLogSort] = useState<"date" | "category" | "vendor" | "amount">("date");
  const [logSearch, setLogSearch] = useState("");
  const csvFoodRef = useRef<HTMLInputElement>(null);
  const [csvFoodRows, setCsvFoodRows] = useState<Record<string, string>[]>([]);
  const [csvFoodImporting, setCsvFoodImporting] = useState(false);
  const [csvFoodStatus, setCsvFoodStatus] = useState("");

  const monthLabel = new Date(year, month - 1, 1).toLocaleDateString("en-US", { month: "long", year: "numeric" });

  useEffect(() => {
    supabase.from("locations").select("name").eq("id", id).single()
      .then(({ data }) => setLocationName(data?.name ?? ""));
  }, [id]);

  /* load deliveries + line items for current month */
  const load = useCallback(async () => {
    const start = `${year}-${String(month).padStart(2, "0")}-01`;
    const end   = new Date(year, month, 1).toISOString().slice(0, 10);
    const { data: rows } = await supabase.from("food_deliveries")
      .select("id,delivery_date,vendor,invoice_number,category,amount,notes")
      .eq("location_id", id).gte("delivery_date", start).lt("delivery_date", end)
      .order("delivery_date", { ascending: false });
    if (!rows) { setDeliveries([]); return; }

    const ids = rows.map(r => r.id);
    const [attRes, itemRes] = await Promise.all([
      supabase.from("food_delivery_attachments")
        .select("id,food_delivery_id,file_path,file_name")
        .in("food_delivery_id", ids),
      supabase.from("invoice_line_items")
        .select("id,food_delivery_id,name,qty,unit,unit_price,total,category")
        .in("food_delivery_id", ids),
    ]);

    const byAtt: Record<string, Attachment[]> = {};
    for (const a of (attRes.data ?? [])) (byAtt[a.food_delivery_id] ??= []).push(a);

    const byItem: Record<string, InvoiceLineItem[]> = {};
    for (const i of (itemRes.data ?? [])) (byItem[i.food_delivery_id] ??= []).push(i);

    setDeliveries(rows.map(r => ({
      ...r,
      attachments: byAtt[r.id] ?? [],
      lineItems: byItem[r.id] ?? [],
    } as Delivery)));

    // Detect price outliers in latest invoices
    detectOutliers(itemRes.data ?? [], rows);
  }, [id, year, month, supabase]);

  /* Detect price outliers vs historical averages */
  const detectOutliers = useCallback(async (currentItems: InvoiceLineItem[], currentDeliveries: { id: string; vendor: string; delivery_date: string; invoice_number?: string }[]) => {
    if (!currentItems.length) return;

    const sixMonthsAgo = new Date(year, month - 7, 1).toISOString().slice(0, 10);
    const monthStart = `${year}-${String(month).padStart(2, "0")}-01`;

    const { data: history } = await supabase
      .from("invoice_line_items")
      .select("name,unit,unit_price,food_delivery_id")
      .not("unit_price", "is", null)
      .gt("unit_price", 0);

    if (!history?.length) return;

    const { data: histDeliveries } = await supabase
      .from("food_deliveries")
      .select("id,delivery_date,vendor,invoice_number")
      .eq("location_id", id)
      .gte("delivery_date", sixMonthsAgo)
      .lt("delivery_date", monthStart)
      .order("delivery_date", { ascending: false });

    const histIds = new Set((histDeliveries ?? []).map(d => d.id));
    const deliveryMap = Object.fromEntries(currentDeliveries.map(d => [d.id, d]));
    const histDeliveryMap = Object.fromEntries((histDeliveries ?? []).map(d => [d.id, d]));

    // Key = "item name|unit" — only compare same unit across invoices
    const histPoints: Record<string, { date: string; price: number; vendor: string; invoice_number?: string; unit?: string }[]> = {};
    for (const h of history) {
      if (!histIds.has(h.food_delivery_id)) continue;
      const del = histDeliveryMap[h.food_delivery_id];
      if (!del) continue;
      const key = `${h.name.toLowerCase().trim()}|${(h.unit ?? "").toLowerCase().trim()}`;
      (histPoints[key] ??= []).push({ date: del.delivery_date, price: Number(h.unit_price), vendor: del.vendor, invoice_number: del.invoice_number ?? undefined, unit: h.unit ?? undefined });
    }
    for (const key of Object.keys(histPoints)) {
      histPoints[key] = histPoints[key]
        .sort((a, b) => b.date.localeCompare(a.date))
        .filter((p, i, arr) => i === 0 || p.date !== arr[i - 1].date)
        .slice(0, 6);
    }
    const histMap: Record<string, number[]> = {};
    for (const [key, pts] of Object.entries(histPoints)) histMap[key] = pts.map(p => p.price);

    const found: PriceOutlier[] = [];
    const currentDeliveryIds = new Set(currentDeliveries.map(d => d.id));

    for (const item of currentItems) {
      if (!item.unit_price || !currentDeliveryIds.has(item.food_delivery_id as string)) continue;
      const key = `${item.name.toLowerCase().trim()}|${(item.unit ?? "").toLowerCase().trim()}`;
      const hist = histMap[key];
      if (!hist?.length) continue;
      const avg = hist.reduce((s, v) => s + v, 0) / hist.length;
      const diff = Number(item.unit_price) - avg;
      const pct = (diff / avg) * 100;
      if (pct >= 10) {
        const currentDel = deliveryMap[item.food_delivery_id as string];
        found.push({
          item: item.name,
          current_price: Number(item.unit_price),
          avg_price: avg,
          diff,
          diff_pct: pct,
          vendor: currentDel?.vendor ?? "",
          unit: item.unit ?? "",
          history: histPoints[key] ?? [],
          current_invoice_number: currentDel?.invoice_number ?? undefined,
          current_date: currentDel?.delivery_date ?? undefined,
        });
      }
    }
    setOutliers(found.sort((a, b) => b.diff_pct - a.diff_pct));
  }, [id, year, month, supabase]);

  useEffect(() => { load(); }, [load]);

  /* 6-month trend */
  useEffect(() => {
    const months = Array.from({ length: 6 }, (_, i) => {
      const d = new Date(year, month - 1 - i, 1);
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
    }).reverse();
    const [first] = months;
    const lastEnd = new Date(year, month, 1).toISOString().slice(0, 10);
    supabase.from("food_deliveries").select("delivery_date,amount")
      .eq("location_id", id).gte("delivery_date", first).lt("delivery_date", lastEnd)
      .then(({ data }) => {
        const map: Record<string, number> = {};
        for (const r of (data ?? [])) {
          const m = r.delivery_date.slice(0, 7) + "-01";
          map[m] = (map[m] || 0) + Number(r.amount);
        }
        setTrendData(months.map(m => ({
          month: m, total: map[m] || 0,
          label: new Date(m + "T00:00:00").toLocaleDateString("en-US", { month: "short", year: "2-digit" }),
        })));
      });
  }, [id, year, month, supabase]);

  const nav = (delta: number) => {
    let m = month + delta, y = year;
    if (m > 12) { m = 1; y++; } if (m < 1) { m = 12; y--; }
    setMonth(m); setYear(y);
  };

  /* upload helpers */
  const uploadFiles = async (deliveryId: string, files: File[], userId?: string) => {
    for (const file of files) {
      const ext = file.name.split(".").pop();
      const path = `${id}/${deliveryId}/${Date.now()}.${ext}`;
      const { error } = await supabase.storage.from("invoices").upload(path, file);
      if (!error) await supabase.from("food_delivery_attachments").insert({
        food_delivery_id: deliveryId, file_path: path, file_name: file.name, uploaded_by: userId ?? null,
      });
    }
  };

  /** Returns true if a matching delivery already exists in the DB. */
  const isDuplicate = async (vendor: string, invoiceNumber: string | null | undefined, date: string, amount: number): Promise<boolean> => {
    let q = supabase.from("food_deliveries").select("id", { count: "exact", head: true })
      .eq("location_id", id)
      .ilike("vendor", vendor.trim())
      .eq("delivery_date", date);
    if (invoiceNumber?.trim()) {
      q = q.ilike("invoice_number", invoiceNumber.trim());
    } else {
      // Without an invoice number, match on amount (within ±1 cent)
      q = q.gte("amount", amount - 0.01).lte("amount", amount + 0.01);
    }
    const { count } = await q;
    return (count ?? 0) > 0;
  };

  const handleSubmit = async (e: React.FormEvent, force = false) => {
    e.preventDefault();
    setSaving(true);
    setSaveError("");
    setDupWarning(null);
    try {
      if (!form.vendor.trim()) throw new Error("Vendor is required.");
      if (!form.amount || form.amount <= 0) throw new Error("Amount must be greater than 0.");

      // Duplicate check — skip if user already confirmed "Save Anyway"
      if (!force) {
        const dup = await isDuplicate(form.vendor, form.invoice_number, form.delivery_date, parseFloat(String(form.amount)));
        if (dup) {
          setDupWarning(`An entry for "${form.vendor}" on ${form.delivery_date}${form.invoice_number ? ` (Invoice #${form.invoice_number})` : ""} already exists.`);
          setSaving(false);
          return;
        }
      }

      const { data: { user } } = await supabase.auth.getUser();
      const notesWithCategory = form.category === "miscellaneous" && customCategory.trim()
        ? `[${customCategory.trim()}]${form.notes ? " " + form.notes : ""}`
        : form.notes || null;

      // Generate UUID client-side so we never depend on .select() after insert
      const newId = crypto.randomUUID();
      const { error: insErr } = await supabase.from("food_deliveries").insert({
        id: newId,
        location_id: id, delivery_date: form.delivery_date, vendor: form.vendor,
        invoice_number: form.invoice_number || null, category: form.category,
        amount: parseFloat(String(form.amount)) || 0, notes: notesWithCategory,
        ocr_confidence_score: ocrScore ?? null,
        parsing_status: ocrParsingStatus ?? null,
      });

      if (insErr) throw new Error(`DB error: ${insErr.message}`);

      if (pendingFiles.length) await uploadFiles(newId, pendingFiles, user?.id);

      // Save OCR line items — normalize names to canonical items_master before insert
      if (pendingLineItems.length) {
        const normalized = await normalizeLineItems(supabase, pendingLineItems);
        const { error: liErr } = await supabase.from("invoice_line_items").insert(
          normalized.map(({ name, qty, unit, unit_price, total, category, item_id }) => ({
            food_delivery_id: newId, name, qty, unit, unit_price, total, category, item_id,
          }))
        );
        if (liErr) console.warn("Line items insert failed:", liErr.message);

        // Fire-and-forget price spike check — alerts user via WhatsApp/email if any item >10% above avg
        fetch("/api/notify/price-spike", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ food_delivery_id: newId, location_id: id }),
        }).then(r => r.json()).then(d => {
          if (d.spikes?.length) {
            setSaveError(`✓ Saved! ⚠ ${d.spikes.length} price spike${d.spikes.length > 1 ? "s" : ""} detected — alert sent.`);
          }
        }).catch(() => {}); // non-fatal
      }

      // Navigate to the month of the saved entry so it's visible immediately
      const savedDate = new Date(form.delivery_date + "T00:00:00");
      setYear(savedDate.getFullYear());
      setMonth(savedDate.getMonth() + 1);

      setForm(empty()); setCustomCategory(""); setPendingFiles([]); setPendingLineItems([]);
      setOcrScore(undefined); setOcrParsingStatus(undefined);
      setDupWarning(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
      setSaveError("✓ Entry saved!");
      setTimeout(() => setSaveError(""), 3000);
      load();
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Save failed — please try again.");
    } finally {
      setSaving(false);
    }
  };

  const handleAttachToExisting = async (deliveryId: string, files: FileList) => {
    setUploading(deliveryId);
    const { data: { user } } = await supabase.auth.getUser();
    await uploadFiles(deliveryId, Array.from(files), user?.id);
    setUploading(null); load();
  };

  const handleDeleteAttachment = async (attId: string, filePath: string) => {
    await supabase.storage.from("invoices").remove([filePath]);
    await supabase.from("food_delivery_attachments").delete().eq("id", attId);
    load();
  };

  const getSignedUrl = async (filePath: string) => {
    const { data } = await supabase.storage.from("invoices").createSignedUrl(filePath, 60);
    if (data?.signedUrl) window.open(data.signedUrl, "_blank");
  };

  const handleDelete = async (did: string, atts: Attachment[] = []) => {
    setDeleting(did);
    if (atts.length) await supabase.storage.from("invoices").remove(atts.map(a => a.file_path));
    await supabase.from("food_deliveries").delete().eq("id", did);
    setDeleting(null); load();
  };

  const handleOCRApply = (data: ApplyData) => {
    setForm(f => ({
      ...f,
      vendor:          data.vendor          || f.vendor,
      invoice_number:  data.invoice_number  || f.invoice_number,
      delivery_date:   data.delivery_date   || f.delivery_date,
      amount:          data.amount > 0      ? data.amount : f.amount,
      category:        data.category        || f.category,
      notes:           data.notes           || f.notes,
    }));
    setPendingLineItems(data.lineItems ?? []);
    // Capture OCR confidence metadata for storage on save
    setOcrScore(data.ocr_confidence_score);
    setOcrParsingStatus(data.parsing_status);
  };

  /** Bulk-save all OCR invoices at once (attaches the same PDF to each). */
  const handleSaveAll = async (items: ApplyData[]) => {
    const { data: { user } } = await supabase.auth.getUser();
    let saved = 0; let skipped = 0;
    for (const data of items) {
      if (!data.vendor?.trim() || !data.amount || data.amount <= 0) continue;
      const deliveryDate = data.delivery_date || new Date().toISOString().slice(0, 10);

      // Skip duplicates silently
      const dup = await isDuplicate(data.vendor, data.invoice_number, deliveryDate, data.amount);
      if (dup) { skipped++; continue; }

      const newId = crypto.randomUUID();
      const { error: insErr } = await supabase.from("food_deliveries").insert({
        id: newId,
        location_id: id,
        delivery_date: deliveryDate,
        vendor: data.vendor,
        invoice_number: data.invoice_number || null,
        category: data.category,
        amount: data.amount,
        notes: data.notes || null,
        ocr_confidence_score: data.ocr_confidence_score ?? null,
        parsing_status: data.parsing_status ?? "parsed",
      });
      if (insErr) throw new Error(`DB error for ${data.vendor}: ${insErr.message}`);
      saved++;
      // Attach the same PDF to each invoice
      if (pendingFiles.length) await uploadFiles(newId, pendingFiles, user?.id);
      // Save line items — normalize names first
      if (data.lineItems?.length) {
        const normalized = await normalizeLineItems(supabase, data.lineItems);
        await supabase.from("invoice_line_items").insert(
          normalized.map(item => ({
            food_delivery_id: newId,
            name: item.name,
            raw_description: item.raw_description ?? null,
            qty: item.qty,
            unit: item.unit,
            unit_price: item.unit_price,
            total: item.total,
            category: item.category,
            item_id: (item as { item_id?: string }).item_id ?? undefined,
            ocr_confidence: item.ocr_confidence ?? null,
            is_catch_weight: item.is_catch_weight ?? false,
            is_credit: item.is_credit ?? false,
            is_fee: item.is_fee ?? false,
          }))
        );
      }
    }
    // Navigate to month of first entry and reload
    if (items[0]?.delivery_date) {
      const d = new Date(items[0].delivery_date + "T00:00:00");
      setYear(d.getFullYear());
      setMonth(d.getMonth() + 1);
    }
    setForm(empty()); setCustomCategory(""); setPendingFiles([]); setPendingLineItems([]);
    setOcrScore(undefined); setOcrParsingStatus(undefined);
    setDupWarning(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
    const msg = skipped > 0
      ? `✓ Saved ${saved} invoice${saved !== 1 ? "s" : ""}. Skipped ${skipped} duplicate${skipped !== 1 ? "s" : ""}.`
      : `✓ Saved ${saved} invoice${saved !== 1 ? "s" : ""}.`;
    setSaveError(msg);
    setTimeout(() => setSaveError(""), 5000);
    load();
  };

  const total = deliveries.reduce((s, r) => s + Number(r.amount), 0);
  const weeklyData = groupByWeek(deliveries);
  const catData = groupByCategory(deliveries);

  /* ─── render ─────────────────────────────────────────────────── */
  const TABS = [
    { key: "log",     label: "📋 Log Entry" },
    { key: "monthly", label: "📊 This Month" },
    { key: "trends",  label: "📈 Trends" },
    { key: "vendors",   label: "🏪 Vendors" },
    { key: "prices",    label: "🎯 Price Tracker" },
    { key: "market",    label: "🔍 Market Intel" },
    { key: "contracts", label: "📋 Contracts" },
  ] as const;

  const sortedDeliveries = [...deliveries]
    .filter(d => !logSearch ||
      d.vendor.toLowerCase().includes(logSearch.toLowerCase()) ||
      d.category.toLowerCase().includes(logSearch.toLowerCase()) ||
      (d.invoice_number ?? "").toLowerCase().includes(logSearch.toLowerCase()))
    .sort((a, b) =>
      logSort === "category" ? a.category.localeCompare(b.category) :
      logSort === "vendor"   ? a.vendor.localeCompare(b.vendor) :
      logSort === "amount"   ? Number(b.amount) - Number(a.amount) :
      b.delivery_date.localeCompare(a.delivery_date)
    );

  /* ── CSV import for food deliveries ─────────────────────────────── */
  function parseFoodCsv(text: string) {
    const lines = text.split(/\r?\n/).filter(l => l.trim());
    if (lines.length < 2) return [];
    const headers = lines[0].split(",").map(h => h.trim().toLowerCase().replace(/[^a-z0-9_]/g, "_"));
    return lines.slice(1).map(line => {
      const vals = line.split(",");
      const row: Record<string, string> = {};
      headers.forEach((h, i) => { row[h] = (vals[i] ?? "").trim().replace(/^"|"$/g, ""); });
      return row;
    }).filter(r => r.delivery_date || r.date);
  }

  const handleFoodCsvFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setCsvFoodStatus(""); setCsvFoodRows([]);
    const reader = new FileReader();
    reader.onload = ev => {
      const parsed = parseFoodCsv(ev.target?.result as string);
      if (!parsed.length) { setCsvFoodStatus("⚠️ No valid rows found. Check the CSV format."); return; }
      const rows = parsed.map(r => ({ ...r, delivery_date: r.delivery_date || r.date || "" }));
      setCsvFoodRows(rows);
      setCsvFoodStatus(`✓ ${rows.length} row${rows.length !== 1 ? "s" : ""} ready to import — review below and click Import.`);
    };
    reader.readAsText(file);
    e.target.value = "";
  };

  const importFoodCsv = async () => {
    if (!csvFoodRows.length) return;
    setCsvFoodImporting(true); setCsvFoodStatus("Importing…");
    try {
      const payloads = csvFoodRows.map(r => ({
        location_id: id,
        delivery_date: r.delivery_date,
        vendor: r.vendor || "",
        invoice_number: r.invoice_number || r.invoice_num || "",
        category: (r.category as FoodCategory) || "other",
        amount: parseFloat(r.amount || "0") || 0,
        notes: r.notes || "",
      }));
      const { data: inserted, error } = await supabase.from("food_deliveries").insert(payloads).select();
      if (error) throw error;
      setDeliveries(prev => [...(inserted as Delivery[]), ...prev]);
      setCsvFoodStatus(`✓ Imported ${payloads.length} row${payloads.length !== 1 ? "s" : ""} successfully!`);
      setCsvFoodRows([]);
    } catch (e) {
      setCsvFoodStatus("✗ Import failed: " + (e instanceof Error ? e.message : "Unknown"));
    } finally {
      setCsvFoodImporting(false);
    }
  };

  if (!ready) return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="w-8 h-8 border-2 border-teal-400 border-t-transparent rounded-full animate-spin" />
    </div>
  );

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Invoice detail modal */}
      {modalDelivery && (
        <InvoiceModal delivery={modalDelivery} onClose={() => setModalDelivery(null)}
          onReturn={async (deliveryId, returnAmt, returnNote) => {
            const src = deliveries.find(d => d.id === deliveryId);
            if (!src) return;
            await supabase.from("food_deliveries").insert({
              location_id: id,
              delivery_date: new Date().toISOString().slice(0, 10),
              vendor: src.vendor,
              category: src.category,
              amount: -Math.abs(returnAmt),
              payment_status: "paid",
              notes: `RETURN: ${returnNote} (orig invoice ${src.invoice_number ?? deliveryId.slice(0, 8)})`,
            });
            load();
          }}
        />
      )}

      {/* nav */}
      <nav className="bg-white border-b border-gray-200 px-4 h-14 flex items-center gap-2 sticky top-0 z-10">
        <Link href={`/location/${id}`} className="text-sm text-gray-500 hover:text-gray-900 flex-shrink-0">←</Link>
        <span className="font-semibold text-gray-900 truncate min-w-0">{locationName} — Food</span>
        <div className="ml-auto flex items-center gap-2 flex-shrink-0">
          <Link href="/analytics" className="text-xs text-blue-600 hover:underline font-medium hidden sm:block">📊 Analytics</Link>
          <PrintPDFButton title={`FoodInventory-${locationName}`} />
          <span className="text-sm font-semibold text-gray-700 hidden sm:block">{monthLabel}: <span className="text-brand-500">{fmtUSD0(total)}</span></span>
        </div>
      </nav>

      <main className="max-w-4xl mx-auto px-4 py-6 pb-24 md:pb-8 space-y-5" id="print-area">
        {/* Month navigation */}
        <div className="flex items-center gap-3">
          <button onClick={() => nav(-1)} className="border rounded-lg px-3 py-1.5 text-gray-600 hover:bg-gray-100">‹</button>
          <span className="font-medium text-gray-800 min-w-[140px] text-center">{monthLabel}</span>
          <button onClick={() => nav(1)}  className="border rounded-lg px-3 py-1.5 text-gray-600 hover:bg-gray-100">›</button>
        </div>

        {/* Price outlier banner */}
        <OutlierBanner outliers={outliers} />

        {/* Tab bar — scrollable on mobile */}
        <div className="overflow-x-auto -mx-4 px-4 pb-1">
          <div className="flex gap-1 bg-gray-700 p-1 rounded-xl w-max flex-nowrap">
            {TABS.map(t => (
              <button key={t.key} onClick={() => setTab(t.key)}
                className={`px-4 py-2.5 rounded-lg text-sm font-bold transition-colors whitespace-nowrap ${
                  tab === t.key
                    ? "bg-white shadow text-gray-900"
                    : "text-amber-100 hover:text-white hover:bg-gray-600"
                }`}>{t.label}</button>
            ))}
          </div>
        </div>

        {/* ── TAB: Log Entry ── */}
        {tab === "log" && (
          <div className="space-y-5">
            <form onSubmit={handleSubmit} className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6 space-y-4">
              <h3 className="font-semibold text-gray-800 text-base">Log Inventory Entry</h3>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label-xs">Date</label>
                  <input type="date" required value={form.delivery_date}
                    onChange={e => setForm(f => ({ ...f, delivery_date: e.target.value }))}
                    className="input-std mt-1" />
                </div>
                <div>
                  <label className="label-xs">Category</label>
                  <select value={form.category} onChange={e => {
                    setForm(f => ({ ...f, category: e.target.value as FoodCategory }));
                    if (e.target.value !== "miscellaneous") setCustomCategory("");
                  }} className="input-std mt-1">
                    {FOOD_CATEGORIES.map(c => <option key={c.key} value={c.key}>{c.icon} {c.label}</option>)}
                  </select>
                  {form.category === "miscellaneous" && (
                    <input type="text" value={customCategory}
                      onChange={e => setCustomCategory(e.target.value)}
                      placeholder="Specify expense type"
                      className="input-std mt-1.5" />
                  )}
                </div>
                <div>
                  <label className="label-xs">Vendor</label>
                  <input type="text" required value={form.vendor}
                    onChange={e => setForm(f => ({ ...f, vendor: e.target.value }))}
                    placeholder="US Foods, Sysco…" className="input-std mt-1" />
                </div>
                <div>
                  <label className="label-xs">Invoice #</label>
                  <input type="text" value={form.invoice_number}
                    onChange={e => setForm(f => ({ ...f, invoice_number: e.target.value }))}
                    placeholder="Optional" className="input-std mt-1" />
                </div>
                <div>
                  <label className="label-xs">Amount ($)</label>
                  <input type="number" min="0.01" step="0.01" value={form.amount || ""}
                    onChange={e => setForm(f => ({ ...f, amount: parseFloat(e.target.value) || 0 }))}
                    placeholder="0.00"
                    className="input-std mt-1" />
                </div>
                <div>
                  <label className="label-xs">Notes {pendingLineItems.length > 0 && <span className="text-emerald-600">({pendingLineItems.length} items from OCR)</span>}</label>
                  <input type="text" value={form.notes}
                    onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                    className="input-std mt-1" />
                </div>
              </div>

              {/* Invoice upload + AI OCR */}
              <div>
                <label className="label-xs mb-1 block">Attach Invoice</label>
                <div onClick={() => fileInputRef.current?.click()}
                  className="border-2 border-dashed border-gray-200 rounded-xl p-4 text-center cursor-pointer hover:border-brand-500 transition-colors">
                  <input ref={fileInputRef} type="file" multiple accept="image/*,application/pdf"
                    className="hidden" onChange={e => setPendingFiles(Array.from(e.target.files ?? []))} />
                  {pendingFiles.length === 0
                    ? <p className="text-xs text-gray-400">📎 Click to attach PDF or image — AI can auto-fill the form</p>
                    : <p className="text-xs text-brand-600 font-medium">{pendingFiles.map(f => f.name).join(", ")}</p>}
                </div>
                <InvoiceOCR pendingFiles={pendingFiles} onApply={handleOCRApply} onSaveAll={handleSaveAll} />
              </div>

              {/* ── CSV Import Section ──────────────────────────────────────── */}
              <div className="border border-dashed border-gray-200 rounded-xl p-4 bg-gray-50">
                <p className="text-xs font-semibold text-gray-600 mb-2">📂 Or import from CSV</p>
                <div className="text-[11px] rounded-lg p-2 mb-3 bg-green-50 border border-green-200 text-green-700">
                  <code>delivery_date, vendor, invoice_number, category, amount, notes</code>
                  <br/><code>2026-11-01, Sysco, INV-123, protein, 450.00, Weekly order</code>
                  <br/>
                  <button className="text-green-700 underline mt-1" onClick={() => {
                    const header = "delivery_date,vendor,invoice_number,category,amount,notes";
                    const ex = "2026-11-01,Sysco,INV-123,protein,450.00,Weekly order";
                    const blob = new Blob([header + "\n" + ex], { type: "text/csv" });
                    const a = document.createElement("a"); a.href = URL.createObjectURL(blob);
                    a.download = "food_import_template.csv"; a.click();
                  }}>⬇ Download template</button>
                </div>
                <input ref={csvFoodRef} type="file" accept=".csv,text/csv" className="hidden"
                  onChange={handleFoodCsvFile} />
                <button onClick={() => csvFoodRef.current?.click()}
                  className="text-xs font-semibold text-teal-700 border border-teal-300 rounded-lg px-3 py-1.5 hover:bg-teal-50 transition-colors mb-2">
                  📂 Choose CSV File
                </button>
                {csvFoodStatus && (
                  <p className={`text-xs font-medium mt-1 ${csvFoodStatus.startsWith("✗") ? "text-red-600" : csvFoodStatus.startsWith("✓") ? "text-green-700" : "text-gray-500"}`}>
                    {csvFoodStatus}
                  </p>
                )}
                {csvFoodRows.length > 0 && (
                  <div className="mt-3 space-y-2">
                    <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
                      <table className="w-full text-[11px]">
                        <thead><tr className="border-b border-gray-100 bg-gray-50">
                          {["Date","Vendor","Invoice #","Category","Amount","Notes"].map(h => (
                            <th key={h} className="px-2 py-1.5 text-left text-gray-500 font-semibold">{h}</th>
                          ))}
                        </tr></thead>
                        <tbody>
                          {csvFoodRows.slice(0, 10).map((r, i) => (
                            <tr key={i} className="border-b border-gray-50">
                              <td className="px-2 py-1 font-mono text-gray-700">{r.delivery_date}</td>
                              <td className="px-2 py-1 text-gray-700">{r.vendor}</td>
                              <td className="px-2 py-1 text-gray-500">{r.invoice_number || r.invoice_num}</td>
                              <td className="px-2 py-1 text-gray-600 capitalize">{r.category}</td>
                              <td className="px-2 py-1 text-right tabular-nums">${parseFloat(r.amount||"0").toFixed(2)}</td>
                              <td className="px-2 py-1 text-gray-400 max-w-[120px] truncate">{r.notes}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      {csvFoodRows.length > 10 && <p className="text-[10px] text-gray-400 px-3 py-1">… and {csvFoodRows.length - 10} more</p>}
                    </div>
                    <button onClick={importFoodCsv} disabled={csvFoodImporting}
                      className="w-full py-2 rounded-xl text-xs font-bold text-white disabled:opacity-50"
                      style={{ background:"linear-gradient(135deg,#00b896,#00d4a8)" }}>
                      {csvFoodImporting ? "Importing…" : `✅ Import ${csvFoodRows.length} rows into Food Inventory`}
                    </button>
                  </div>
                )}
              </div>

              {dupWarning && (
                <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 flex items-start gap-3">
                  <span className="text-amber-500 text-base mt-0.5">⚠️</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-amber-800">Possible duplicate</p>
                    <p className="text-xs text-amber-700 mt-0.5">{dupWarning}</p>
                  </div>
                  <div className="flex gap-2 flex-shrink-0">
                    <button type="button" onClick={() => setDupWarning(null)}
                      className="text-xs text-amber-600 hover:text-amber-800 font-medium px-2 py-1 rounded">
                      Cancel
                    </button>
                    <button type="button"
                      onClick={e => handleSubmit(e as unknown as React.FormEvent, true)}
                      className="text-xs bg-amber-500 hover:bg-amber-600 text-white font-semibold px-3 py-1 rounded-lg">
                      Save Anyway
                    </button>
                  </div>
                </div>
              )}
              <div className="flex items-center gap-3 flex-wrap">
                <button type="submit" disabled={saving}
                  className="bg-brand-500 hover:bg-brand-600 text-white rounded-xl px-5 py-2.5 text-sm font-semibold disabled:opacity-50 transition-colors">
                  {saving ? "Saving…" : "+ Add Entry"}
                </button>
                {saveError && (
                  <p className={`text-xs font-medium ${saveError.startsWith("✓") ? "text-emerald-600" : "text-red-600"}`}>
                    {saveError.startsWith("✓") ? saveError : `⚠️ ${saveError}`}
                  </p>
                )}
              </div>
            </form>

            {/* Delivery list */}
            <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
              <div className="px-5 py-3 bg-gray-50 border-b border-gray-200 flex flex-col gap-2">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-gray-700">Entries — {monthLabel}</h3>
                  <span className="text-sm font-bold text-gray-900">{fmtUSD0(total)}</span>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  <input
                    type="text"
                    placeholder="Search vendor, category…"
                    value={logSearch}
                    onChange={e => setLogSearch(e.target.value)}
                    className="text-xs border border-gray-200 rounded-lg px-2.5 py-1 text-gray-700 outline-none focus:border-teal-400 w-44"
                  />
                  <div className="flex gap-1">
                    {([["date","📅 Date"],["category","🏷 Cat"],["vendor","🏪 Vendor"],["amount","💰 Amt"]] as const).map(([k,l]) => (
                      <button key={k} onClick={() => setLogSort(k)}
                        className={`text-[10px] px-2 py-0.5 rounded-full font-medium transition-colors ${logSort === k ? "bg-teal-500 text-white" : "bg-gray-100 text-gray-500 hover:bg-gray-200"}`}>
                        {l}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
              {deliveries.length === 0 ? (
                <p className="text-sm text-gray-400 text-center py-10">No entries for {monthLabel}.</p>
              ) : (
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 border-b border-gray-100">
                    <tr>
                      <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500">Date</th>
                      <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500">Category</th>
                      <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500">Vendor</th>
                      <th className="text-right px-4 py-2.5 text-xs font-semibold text-gray-500">Amount</th>
                      <th className="text-center px-4 py-2.5 text-xs font-semibold text-gray-500">📎</th>
                      <th className="px-2 py-2.5 w-8"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {sortedDeliveries.map(d => {
                      const cat = FOOD_CATEGORIES.find(c => c.key === d.category);
                      const isExpanded = expandedRow === d.id;
                      const attCount = d.attachments?.length ?? 0;
                      const itemCount = d.lineItems?.length ?? 0;
                      return (
                        <React.Fragment key={d.id}>
                          <tr className="hover:bg-gray-50 transition-colors">
                            <td className="px-4 py-2.5 text-gray-500 tabular-nums">{d.delivery_date}</td>
                            <td className="px-4 py-2.5">
                              <span className="inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full"
                                style={{ background: CAT_COLORS[d.category] + "18", color: CAT_COLORS[d.category] }}>
                                {cat?.icon} {cat?.label}
                              </span>
                            </td>
                            <td className="px-4 py-2.5">
                              {/* Clickable vendor → invoice modal */}
                              <button
                                onClick={() => setModalDelivery(d)}
                                className="text-left group"
                              >
                                <span className="text-gray-800 font-medium group-hover:text-blue-600 transition-colors">
                                  {d.vendor}
                                </span>
                                {d.invoice_number && (
                                  <span className="ml-1 text-xs text-gray-400">#{d.invoice_number}</span>
                                )}
                                {itemCount > 0 && (
                                  <span className="ml-1.5 text-[10px] text-blue-500 bg-blue-50 px-1.5 py-0.5 rounded-full">
                                    {itemCount} items
                                  </span>
                                )}
                              </button>
                            </td>
                            <td className="px-4 py-2.5 text-right font-semibold tabular-nums">{fmtUSD0(Number(d.amount))}</td>
                            <td className="px-4 py-2.5 text-center">
                              <button onClick={() => setExpandedRow(isExpanded ? null : d.id)}
                                className={`text-xs px-2 py-0.5 rounded-full font-medium transition-colors ${
                                  attCount > 0 ? "bg-indigo-50 text-indigo-600 hover:bg-indigo-100" : "text-gray-300 hover:text-gray-500"
                                }`}>
                                {attCount > 0 ? `📎 ${attCount}` : "attach"}
                              </button>
                            </td>
                            <td className="px-2 py-2.5 text-center">
                              <button onClick={() => handleDelete(d.id, d.attachments)} disabled={deleting === d.id}
                                className="text-xs text-red-300 hover:text-red-500">✕</button>
                            </td>
                          </tr>
                          {isExpanded && (
                            <tr>
                              <td colSpan={6} className="px-6 py-3 bg-indigo-50/50">
                                <div className="space-y-1.5">
                                  {(d.attachments ?? []).map(a => (
                                    <div key={a.id} className="flex items-center gap-3">
                                      <span className="text-xs text-gray-600 flex-1 truncate">📄 {a.file_name}</span>
                                      <button onClick={() => getSignedUrl(a.file_path)} className="text-xs text-indigo-600 hover:underline">View</button>
                                      <button onClick={() => handleDeleteAttachment(a.id, a.file_path)} className="text-xs text-red-400 hover:text-red-600">Remove</button>
                                    </div>
                                  ))}
                                  <label className="flex items-center gap-1 cursor-pointer">
                                    <span className="text-xs text-gray-400 hover:text-indigo-600 transition-colors">
                                      {uploading === d.id ? "Uploading…" : "+ Attach more"}
                                    </span>
                                    <input type="file" multiple accept="image/*,application/pdf" className="hidden"
                                      disabled={uploading === d.id}
                                      onChange={e => e.target.files && handleAttachToExisting(d.id, e.target.files)} />
                                  </label>
                                </div>
                              </td>
                            </tr>
                          )}
                        </React.Fragment>
                      );
                    })}
                  </tbody>
                  <tfoot>
                    <tr className="bg-gray-50 border-t border-gray-200">
                      <td colSpan={3} className="px-4 py-2.5 text-sm font-semibold text-gray-700">Total</td>
                      <td className="px-4 py-2.5 text-right text-sm font-bold text-gray-900">{fmtUSD0(total)}</td>
                      <td colSpan={2}></td>
                    </tr>
                  </tfoot>
                </table>
              )}
            </div>
          </div>
        )}

        {/* ── TAB: This Month ── */}
        {tab === "monthly" && (
          <div className="space-y-5">
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
              {FOOD_CATEGORIES.map(c => {
                const amt = deliveries.filter(d => d.category === c.key).reduce((s, d) => s + Number(d.amount), 0);
                return (
                  <div key={c.key} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
                    <p className="text-lg">{c.icon}</p>
                    <p className="text-xs text-gray-500 mt-1 leading-tight">{c.label}</p>
                    <p className="text-lg font-bold mt-1" style={{ color: CAT_COLORS[c.key] }}>{fmtUSD0(amt)}</p>
                    <p className="text-xs text-gray-400">{total > 0 ? ((amt / total) * 100).toFixed(1) + "%" : "—"}</p>
                  </div>
                );
              })}
            </div>
            <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5">
              <h3 className="font-semibold text-gray-800 mb-4">Weekly Spend by Category</h3>
              {weeklyData.length === 0
                ? <p className="text-sm text-gray-400 text-center py-8">No entries this month yet.</p>
                : (
                  <ResponsiveContainer width="100%" height={260}>
                    <BarChart data={weeklyData} margin={{ top: 4, right: 12, left: 0, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
                      <XAxis dataKey="week" tick={{ fontSize: 12 }} />
                      <YAxis tickFormatter={v => `$${(v / 1000).toFixed(0)}k`} tick={{ fontSize: 11 }} />
                      <Tooltip formatter={(v) => fmtUSD0(Number(v))} />
                      <Legend iconType="circle" iconSize={8} />
                      {FOOD_CATEGORIES.map(c => (
                        <Bar key={c.key} dataKey={c.key} name={c.label} stackId="a"
                          fill={CAT_COLORS[c.key]} radius={c.key === "miscellaneous" ? [4, 4, 0, 0] : [0, 0, 0, 0]} />
                      ))}
                    </BarChart>
                  </ResponsiveContainer>
                )}
            </div>
            <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5">
              <h3 className="font-semibold text-gray-800 mb-4">Category Distribution</h3>
              {catData.length === 0
                ? <p className="text-sm text-gray-400 text-center py-8">No entries yet.</p>
                : (
                  <div className="flex flex-col sm:flex-row items-center gap-6">
                    <ResponsiveContainer width={220} height={220}>
                      <PieChart>
                        <Pie data={catData} cx="50%" cy="50%" innerRadius={60} outerRadius={90} dataKey="value" paddingAngle={3}>
                          {catData.map(entry => <Cell key={entry.key} fill={CAT_COLORS[entry.key]} />)}
                        </Pie>
                        <Tooltip formatter={(v) => fmtUSD0(Number(v))} />
                      </PieChart>
                    </ResponsiveContainer>
                    <div className="flex-1 space-y-2 w-full">
                      {catData.map(entry => (
                        <div key={entry.key} className="flex items-center gap-2">
                          <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: CAT_COLORS[entry.key] }} />
                          <span className="text-sm text-gray-600 flex-1">{entry.name}</span>
                          <span className="text-sm font-semibold">{fmtUSD0(entry.value)}</span>
                          <span className="text-xs text-gray-400 w-10 text-right">
                            {total > 0 ? ((entry.value / total) * 100).toFixed(1) + "%" : ""}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
            </div>
          </div>
        )}

        {/* ── TAB: Trends ── */}
        {tab === "trends" && (
          <div className="space-y-5">
            <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5">
              <h3 className="font-semibold text-gray-800 mb-1">6-Month Food Cost Trend</h3>
              <ResponsiveContainer width="100%" height={280}>
                <LineChart data={trendData} margin={{ top: 4, right: 12, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
                  <XAxis dataKey="label" tick={{ fontSize: 12 }} />
                  <YAxis tickFormatter={v => `$${(v / 1000).toFixed(0)}k`} tick={{ fontSize: 11 }} />
                  <Tooltip formatter={(v) => fmtUSD0(Number(v))} />
                  <Line type="monotone" dataKey="total" name="Food Cost"
                    stroke="#e07b39" strokeWidth={2.5} dot={{ r: 4, fill: "#e07b39" }} activeDot={{ r: 6 }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
            <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
              <div className="px-5 py-3 bg-gray-50 border-b border-gray-200">
                <h3 className="text-sm font-semibold text-gray-700">Monthly Summary</h3>
              </div>
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100">
                    <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500">Month</th>
                    <th className="text-right px-4 py-2.5 text-xs font-semibold text-gray-500">Food Cost</th>
                    <th className="text-right px-4 py-2.5 text-xs font-semibold text-gray-500">vs Prior Month</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {trendData.map((row, i) => {
                    const prev = trendData[i - 1];
                    const delta = prev ? row.total - prev.total : null;
                    const deltaPct = prev && prev.total > 0 ? ((row.total - prev.total) / prev.total) * 100 : null;
                    return (
                      <tr key={row.month} className="hover:bg-gray-50">
                        <td className="px-4 py-2.5 text-gray-700">{row.label}</td>
                        <td className="px-4 py-2.5 text-right font-medium">{row.total > 0 ? fmtUSD0(row.total) : "—"}</td>
                        <td className="px-4 py-2.5 text-right text-xs">
                          {deltaPct !== null ? (
                            <span className={deltaPct > 0 ? "text-red-500" : "text-green-600"}>
                              {deltaPct > 0 ? "▲" : "▼"} {Math.abs(deltaPct).toFixed(1)}%
                            </span>
                          ) : "—"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {tab === "vendors" && <VendorTab locationId={id} />}

        {tab === "prices" && <PriceTrackerTab locationId={id} />}
        {tab === "market" && <VendorMarketTab locationId={id} />}
        {tab === "contracts" && <ContractsTab locationId={id} />}
      </main>

      <MobileBottomNav locationId={id} />

      <style jsx global>{`
        .input-std { @apply w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500; }
        .label-xs  { @apply text-xs font-medium text-gray-600; }
      `}</style>
    </div>
  );
}
