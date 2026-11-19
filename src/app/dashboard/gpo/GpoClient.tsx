"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";

const TEAL = "#00d4a8";
const BG = "#060b18";
const CARD = "rgba(255,255,255,0.04)";
const BORDER = "rgba(255,255,255,0.08)";
const RED = "#ff4d4d";
const AMBER = "#f59e0b";
const GREEN = "#10b981";

const fmtUSD = (n: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2 }).format(n);
const fmtUSD0 = (n: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n);

interface GpoItem {
  item_name: string;
  total_locations: number;
  min_price: number;
  max_price: number;
  avg_price: number;
  total_qty_90d: number;
  savings_90d: number;
}

interface LocationBreakdown {
  location_id: string;
  location_name: string;
  avg_price: number;
  qty: number;
}

export default function GpoClient() {
  const [items, setItems] = useState<GpoItem[]>([]);
  const [breakdown, setBreakdown] = useState<Record<string, LocationBreakdown[]>>({});
  const [expanded, setExpanded] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState<"savings" | "spread" | "qty">("savings");

  useEffect(() => {
    setLoading(true);
    fetch("/api/gpo")
      .then(r => r.json())
      .then(d => {
        setItems(d.items || []);
        setBreakdown(d.breakdown || {});
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  const totalSavings = items.reduce((s, i) => s + (i.savings_90d || 0), 0);
  const annualSavings = totalSavings * 4;

  const filtered = items
    .filter(i => !search || i.item_name.toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) =>
      sortBy === "savings" ? b.savings_90d - a.savings_90d :
      sortBy === "spread"  ? (b.max_price - b.min_price) / b.avg_price - (a.max_price - a.min_price) / a.avg_price :
      b.total_qty_90d - a.total_qty_90d
    );

  function spreadPct(item: GpoItem) {
    return ((item.max_price - item.min_price) / item.min_price * 100).toFixed(1);
  }

  return (
    <main style={{ maxWidth: 1100, margin: "0 auto", padding: "24px 20px 80px" }}>

      {/* ── Breadcrumb ── */}
      <div style={{ fontSize: 12, color: "rgba(255,255,255,0.3)", marginBottom: 20 }}>
        <Link href="/dashboard" style={{ color: "rgba(255,255,255,0.3)", textDecoration: "none" }}>Dashboard</Link>
        {" / "}
        <span style={{ color: "rgba(255,255,255,0.6)" }}>GPO Aggregation</span>
      </div>

      {/* ── Page header ── */}
      <div style={{ marginBottom: 28 }}>
        <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800, color: "#fff" }}>
          GPO Price Aggregation
        </h1>
        <p style={{ margin: "6px 0 0", color: "rgba(255,255,255,0.4)", fontSize: 13, maxWidth: 620 }}>
          Items where your locations pay different prices for the same thing. Align everyone to the best price to unlock savings.
        </p>
      </div>

      {loading ? (
        <div style={{ textAlign: "center", padding: 80, color: "rgba(255,255,255,0.3)" }}>
          Loading GPO data…
        </div>
      ) : items.length === 0 ? (
        <div style={{
          textAlign: "center", padding: "64px 20px",
          border: `1px dashed ${BORDER}`, borderRadius: 14,
          color: "rgba(255,255,255,0.3)",
        }}>
          <div style={{ fontSize: 40, marginBottom: 16 }}>🔗</div>
          <div style={{ fontSize: 16, fontWeight: 600, color: "rgba(255,255,255,0.6)", marginBottom: 8 }}>
            No GPO opportunities yet
          </div>
          <div style={{ fontSize: 13 }}>
            Once you have invoices across multiple locations with the same items, price discrepancies will appear here.
          </div>
        </div>
      ) : (
        <>
          {/* ── Summary cards ── */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 14, marginBottom: 28 }}>
            {[
              { label: "Items with Price Gaps", value: items.length, color: TEAL },
              { label: "Est. 90-day Savings", value: fmtUSD0(totalSavings), color: totalSavings > 0 ? GREEN : "rgba(255,255,255,0.6)" },
              { label: "Annualized Savings", value: fmtUSD0(annualSavings), color: annualSavings > 500 ? GREEN : AMBER },
            ].map(s => (
              <div key={s.label} style={{
                background: CARD, border: `1px solid ${BORDER}`, borderRadius: 12, padding: "18px 20px",
              }}>
                <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", marginBottom: 8 }}>{s.label}</div>
                <div style={{ fontSize: 24, fontWeight: 800, color: s.color }}>{s.value}</div>
              </div>
            ))}
          </div>

          {/* ── Controls ── */}
          <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 16, flexWrap: "wrap" }}>
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search items…"
              style={{
                flex: 1, minWidth: 200,
                background: "rgba(255,255,255,0.06)", border: `1px solid ${BORDER}`,
                borderRadius: 8, padding: "8px 12px", color: "#fff", fontSize: 12,
              }}
            />
            <div style={{ display: "flex", gap: 6 }}>
              {(["savings", "spread", "qty"] as const).map(s => (
                <button key={s} onClick={() => setSortBy(s)} style={{
                  padding: "7px 12px", borderRadius: 7, border: "none", fontSize: 11, fontWeight: 600,
                  background: sortBy === s ? TEAL : "rgba(255,255,255,0.08)",
                  color: sortBy === s ? "#0a0a1a" : "rgba(255,255,255,0.5)",
                  cursor: "pointer",
                }}>
                  {s === "savings" ? "💰 Savings" : s === "spread" ? "📊 Price Spread" : "📦 Volume"}
                </button>
              ))}
            </div>
          </div>

          {/* ── Items table ── */}
          <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 12, overflow: "hidden" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{
                  background: "rgba(255,255,255,0.03)",
                  borderBottom: `1px solid ${BORDER}`,
                  color: "rgba(255,255,255,0.4)", fontSize: 11,
                }}>
                  {["Item", "Locations", "Best Price", "Worst Price", "Spread", "90d Volume", "Potential Savings", ""].map(h => (
                    <th key={h} style={{
                      padding: "10px 14px",
                      textAlign: h === "Item" ? "left" : "right",
                      fontWeight: 500,
                      ...(h === "" ? { width: 40 } : {}),
                    }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((item, i) => {
                  const isExp = expanded === item.item_name;
                  const locs = breakdown[item.item_name] || [];
                  return (
                    <React.Fragment key={item.item_name}>
                      <tr
                        onClick={() => setExpanded(isExp ? null : item.item_name)}
                        style={{
                          borderTop: i > 0 ? `1px solid ${BORDER}` : undefined,
                          cursor: "pointer",
                          background: isExp ? "rgba(0,212,168,0.04)" : i % 2 === 0 ? "transparent" : "rgba(255,255,255,0.01)",
                        }}
                      >
                        <td style={{ padding: "11px 14px", fontWeight: 600, color: "#fff" }}>{item.item_name}</td>
                        <td style={{ padding: "11px 14px", textAlign: "right", color: "rgba(255,255,255,0.5)" }}>{item.total_locations}</td>
                        <td style={{ padding: "11px 14px", textAlign: "right", color: GREEN, fontWeight: 700 }}>{fmtUSD(item.min_price)}</td>
                        <td style={{ padding: "11px 14px", textAlign: "right", color: RED }}>{fmtUSD(item.max_price)}</td>
                        <td style={{ padding: "11px 14px", textAlign: "right", color: AMBER, fontWeight: 600 }}>{spreadPct(item)}%</td>
                        <td style={{ padding: "11px 14px", textAlign: "right", color: "rgba(255,255,255,0.4)" }}>{item.total_qty_90d.toFixed(0)} units</td>
                        <td style={{ padding: "11px 14px", textAlign: "right", color: GREEN, fontWeight: 700 }}>
                          {item.savings_90d > 0 ? fmtUSD0(item.savings_90d) : "—"}
                        </td>
                        <td style={{ padding: "11px 14px", textAlign: "right", color: "rgba(255,255,255,0.3)" }}>
                          {isExp ? "▲" : "▼"}
                        </td>
                      </tr>

                      {isExp && (
                        <tr>
                          <td colSpan={8} style={{ padding: "0 14px 14px 28px" }}>
                            <div style={{
                              background: "rgba(255,255,255,0.03)", borderRadius: 8,
                              border: `1px solid ${BORDER}`, overflow: "hidden",
                            }}>
                              <div style={{ padding: "10px 14px", fontSize: 11, fontWeight: 700, color: TEAL, borderBottom: `1px solid ${BORDER}` }}>
                                Price by location (90 days)
                              </div>
                              {locs.length === 0 ? (
                                <div style={{ padding: "12px 14px", color: "rgba(255,255,255,0.3)", fontSize: 12 }}>No breakdown data.</div>
                              ) : (
                                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                                  <tbody>
                                    {locs.map((loc, li) => {
                                      const isBest = loc.avg_price === item.min_price;
                                      const savings = (loc.avg_price - item.min_price) * loc.qty;
                                      return (
                                        <tr key={loc.location_id} style={{ borderTop: li > 0 ? `1px solid ${BORDER}` : undefined }}>
                                          <td style={{ padding: "8px 14px", color: "rgba(255,255,255,0.7)", fontSize: 12 }}>{loc.location_name}</td>
                                          <td style={{ padding: "8px 14px", textAlign: "right", fontWeight: 700, fontSize: 12,
                                            color: isBest ? GREEN : RED }}>
                                            {fmtUSD(loc.avg_price)}
                                            {isBest && <span style={{ fontSize: 10, marginLeft: 6 }}>✓ best</span>}
                                          </td>
                                          <td style={{ padding: "8px 14px", textAlign: "right", color: "rgba(255,255,255,0.4)", fontSize: 12 }}>
                                            {loc.qty.toFixed(0)} units
                                          </td>
                                          <td style={{ padding: "8px 14px", textAlign: "right", fontSize: 12,
                                            color: savings > 0.5 ? RED : GREEN }}>
                                            {savings > 0.5 ? `−${fmtUSD0(savings)} overpay` : "—"}
                                          </td>
                                        </tr>
                                      );
                                    })}
                                  </tbody>
                                </table>
                              )}
                              <div style={{
                                padding: "10px 14px", borderTop: `1px solid ${BORDER}`,
                                fontSize: 11, color: "rgba(255,255,255,0.3)",
                              }}>
                                💡 If all locations paid {fmtUSD(item.min_price)}, you&apos;d save {fmtUSD0(item.savings_90d)} over 90 days (~{fmtUSD0(item.savings_90d * 4)}/year).
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>

          <p style={{ fontSize: 11, color: "rgba(255,255,255,0.2)", marginTop: 14, textAlign: "center" }}>
            Based on invoices from the last 90 days. Items with &lt;3% price spread are excluded.
          </p>
        </>
      )}
    </main>
  );
}
