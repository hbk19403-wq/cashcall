"use client";

import { useState, useEffect, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import Link from "next/link";

// ── Types ─────────────────────────────────────────────────────────────────────
interface Location { id: string; name: string; }
interface VendorContact {
  id: string;
  vendor_name: string;
  rep_name?: string;
  rep_email: string;
  account_number?: string;
}
interface LineItem {
  id: string;
  item_name: string;
  item_code?: string;
  pack_size?: string;
  brand?: string;
  quantity: number;
  unit?: string;
  last_unit_price?: number;
  source_line_item_id?: string;
}
interface OrderDraft {
  id: string;
  vendor_name: string;
  status: string;
  submitted_at?: string;
  created_at: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────
const TEAL = "#00d4a8";
const card = "rounded-2xl p-5 relative overflow-hidden";
const cardStyle = { background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" };
const statusColors: Record<string, string> = {
  draft: "#f59e0b",
  submitted: TEAL,
  confirmed: "#22c55e",
  cancelled: "#ef4444",
};

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function OrderingPage() {
  const supabase = createClient();

  const [locations, setLocations] = useState<Location[]>([]);
  const [locationId, setLocationId] = useState<string>("");
  const [vendors, setVendors] = useState<VendorContact[]>([]);
  const [recentOrders, setRecentOrders] = useState<OrderDraft[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<"reorder" | "history">("reorder");

  // Reorder state
  const [selectedVendor, setSelectedVendor] = useState<VendorContact | null>(null);
  const [availableItems, setAvailableItems] = useState<LineItem[]>([]);
  const [cart, setCart] = useState<LineItem[]>([]);
  const [loadingItems, setLoadingItems] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitResult, setSubmitResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [orderNotes, setOrderNotes] = useState("");

  // Load locations
  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data } = await supabase.from("locations").select("id,name").eq("user_id", user.id).order("name");
      if (data?.length) {
        setLocations(data);
        setLocationId(data[0].id);
      }
    })();
  }, []);

  const loadVendorsAndOrders = useCallback(async () => {
    if (!locationId) return;
    setLoading(true);
    const [vendorRes, orderRes] = await Promise.all([
      fetch(`/api/ordering/vendors?locationId=${locationId}`),
      supabase
        .from("order_drafts")
        .select("id,vendor_name,status,submitted_at,created_at")
        .eq("location_id", locationId)
        .order("created_at", { ascending: false })
        .limit(20),
    ]);
    if (vendorRes.ok) {
      const json = await vendorRes.json();
      setVendors(json.vendors ?? []);
    }
    if (orderRes.data) {
      setRecentOrders(orderRes.data);
    }
    setLoading(false);
  }, [locationId]);

  useEffect(() => { loadVendorsAndOrders(); }, [loadVendorsAndOrders]);

  // Load items when vendor selected
  useEffect(() => {
    if (!selectedVendor || !locationId) { setAvailableItems([]); return; }
    setLoadingItems(true);
    setCart([]);
    fetch(`/api/ordering/items?locationId=${locationId}&vendor=${encodeURIComponent(selectedVendor.vendor_name)}`)
      .then(r => r.json())
      .then(json => {
        const items: LineItem[] = (json.items ?? []).map((raw: {
          id: string;
          canonical_name?: string;
          name: string;
          item_code?: string;
          pack_size?: string;
          brand?: string;
          qty?: number;
          unit?: string;
          unit_price?: number;
        }) => ({
          id: raw.id,
          item_name: raw.canonical_name ?? raw.name,
          item_code: raw.item_code,
          pack_size: raw.pack_size,
          brand: raw.brand,
          quantity: raw.qty ?? 1,
          unit: raw.unit,
          last_unit_price: raw.unit_price,
          source_line_item_id: raw.id,
        }));
        setAvailableItems(items);
      })
      .finally(() => setLoadingItems(false));
  }, [selectedVendor, locationId]);

  const addToCart = (item: LineItem) => {
    setCart(prev => {
      if (prev.find(c => c.id === item.id)) return prev;
      return [...prev, { ...item, quantity: 1 }];
    });
  };

  const removeFromCart = (id: string) => setCart(prev => prev.filter(c => c.id !== id));

  const updateQty = (id: string, qty: number) => {
    if (qty <= 0) { removeFromCart(id); return; }
    setCart(prev => prev.map(c => c.id === id ? { ...c, quantity: qty } : c));
  };

  const submitOrder = async () => {
    if (!selectedVendor || cart.length === 0 || !locationId) return;
    setSubmitting(true);
    setSubmitResult(null);
    try {
      const res = await fetch("/api/ordering/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          location_id: locationId,
          vendor_name: selectedVendor.vendor_name,
          items: cart,
          notes: orderNotes || undefined,
        }),
      });
      const json = await res.json();
      setSubmitResult({ ok: json.ok, message: json.message ?? json.error ?? "Done" });
      if (json.ok) {
        setCart([]);
        setOrderNotes("");
        loadVendorsAndOrders();
      }
    } catch {
      setSubmitResult({ ok: false, message: "Network error. Please try again." });
    } finally {
      setSubmitting(false);
    }
  };

  const locationName = locations.find(l => l.id === locationId)?.name ?? "";

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div style={{ minHeight: "100vh", background: "#0a0a0f", color: "#e5e7eb" }}>
      <div style={{ maxWidth: 1100, margin: "0 auto", padding: "32px 16px" }}>

        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 28 }}>
          <div>
            <h1 style={{ fontSize: 26, fontWeight: 700, margin: 0 }}>Vendor Ordering</h1>
            <p style={{ color: "#6b7280", fontSize: 14, marginTop: 4 }}>
              Reorder directly from your invoice history — one click, sent to your rep.
            </p>
          </div>
          <Link href="/dashboard/ordering/vendors"
            style={{ background: TEAL, color: "#0a0a0f", padding: "8px 16px", borderRadius: 8, fontSize: 13, fontWeight: 600, textDecoration: "none" }}>
            + Manage Vendors
          </Link>
        </div>

        {/* Location picker */}
        {locations.length > 1 && (
          <div style={{ marginBottom: 20 }}>
            <select
              value={locationId}
              onChange={e => { setLocationId(e.target.value); setSelectedVendor(null); }}
              style={{ background: "#1a1a2e", border: "1px solid rgba(255,255,255,0.12)", color: "#e5e7eb", padding: "8px 12px", borderRadius: 8, fontSize: 14 }}>
              {locations.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
            </select>
          </div>
        )}

        {/* Tabs */}
        <div style={{ display: "flex", gap: 4, marginBottom: 24, borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
          {(["reorder", "history"] as const).map(tab => (
            <button key={tab} onClick={() => setActiveTab(tab)}
              style={{
                padding: "8px 18px", fontSize: 14, fontWeight: 500, border: "none", cursor: "pointer",
                background: "transparent", color: activeTab === tab ? TEAL : "#6b7280",
                borderBottom: activeTab === tab ? `2px solid ${TEAL}` : "2px solid transparent",
                marginBottom: -1,
              }}>
              {tab === "reorder" ? "Reorder Items" : "Order History"}
            </button>
          ))}
        </div>

        {loading ? (
          <p style={{ color: "#6b7280", textAlign: "center", padding: 40 }}>Loading…</p>
        ) : activeTab === "reorder" ? (

          /* ── Reorder Tab ─────────────────────────────────────────────── */
          <div style={{ display: "grid", gridTemplateColumns: vendors.length ? "1fr 340px" : "1fr", gap: 20 }}>

            {/* Left: Vendor + items */}
            <div>
              {vendors.length === 0 ? (
                <div className={card} style={{ ...cardStyle, textAlign: "center", padding: 48 }}>
                  <p style={{ color: "#6b7280", marginBottom: 16 }}>
                    No vendor contacts set up yet. Add your vendor reps to start ordering.
                  </p>
                  <Link href="/dashboard/ordering/vendors"
                    style={{ background: TEAL, color: "#0a0a0f", padding: "10px 20px", borderRadius: 8, fontSize: 14, fontWeight: 600, textDecoration: "none" }}>
                    Set Up Vendors
                  </Link>
                </div>
              ) : (
                <>
                  {/* Vendor selector */}
                  <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 20 }}>
                    {vendors.map(v => (
                      <button key={v.id}
                        onClick={() => setSelectedVendor(selectedVendor?.id === v.id ? null : v)}
                        style={{
                          padding: "8px 16px", borderRadius: 20, fontSize: 13, fontWeight: 500, cursor: "pointer",
                          border: selectedVendor?.id === v.id ? `1.5px solid ${TEAL}` : "1.5px solid rgba(255,255,255,0.15)",
                          background: selectedVendor?.id === v.id ? "rgba(0,212,168,0.12)" : "rgba(255,255,255,0.04)",
                          color: selectedVendor?.id === v.id ? TEAL : "#d1d5db",
                        }}>
                        {v.vendor_name}
                      </button>
                    ))}
                  </div>

                  {/* Items grid */}
                  {selectedVendor && (
                    loadingItems ? (
                      <p style={{ color: "#6b7280", padding: 24 }}>Loading items…</p>
                    ) : availableItems.length === 0 ? (
                      <div className={card} style={{ ...cardStyle, textAlign: "center", padding: 36 }}>
                        <p style={{ color: "#6b7280" }}>
                          No invoice items found for {selectedVendor.vendor_name}.<br />
                          Upload an invoice from {selectedVendor.vendor_name} to enable reordering.
                        </p>
                      </div>
                    ) : (
                      <div>
                        <p style={{ color: "#9ca3af", fontSize: 13, marginBottom: 12 }}>
                          {availableItems.length} items from recent {selectedVendor.vendor_name} invoices. Click to add to order.
                        </p>
                        <div style={{ display: "grid", gap: 8 }}>
                          {availableItems.map(item => {
                            const inCart = cart.some(c => c.id === item.id);
                            return (
                              <div key={item.id}
                                onClick={() => inCart ? removeFromCart(item.id) : addToCart(item)}
                                style={{
                                  ...cardStyle,
                                  borderRadius: 12, padding: "12px 16px", cursor: "pointer",
                                  border: inCart ? `1.5px solid ${TEAL}` : "1px solid rgba(255,255,255,0.08)",
                                  background: inCart ? "rgba(0,212,168,0.08)" : "rgba(255,255,255,0.03)",
                                  display: "flex", alignItems: "center", justifyContent: "space-between",
                                }}>
                                <div style={{ flex: 1 }}>
                                  <p style={{ margin: 0, fontSize: 14, fontWeight: 500, color: inCart ? TEAL : "#e5e7eb" }}>
                                    {item.item_name}
                                  </p>
                                  <p style={{ margin: "2px 0 0", fontSize: 12, color: "#6b7280" }}>
                                    {[item.brand, item.pack_size, item.item_code].filter(Boolean).join(" · ")}
                                  </p>
                                </div>
                                <div style={{ textAlign: "right", marginLeft: 12 }}>
                                  {item.last_unit_price != null && (
                                    <p style={{ margin: 0, fontSize: 13, color: "#9ca3af" }}>
                                      ${item.last_unit_price.toFixed(2)}/{item.unit ?? "ea"}
                                    </p>
                                  )}
                                  <span style={{
                                    fontSize: 11, padding: "2px 8px", borderRadius: 10,
                                    background: inCart ? TEAL : "rgba(255,255,255,0.08)",
                                    color: inCart ? "#0a0a0f" : "#9ca3af",
                                  }}>
                                    {inCart ? "✓ Added" : "+ Add"}
                                  </span>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )
                  )}
                </>
              )}
            </div>

            {/* Right: Cart */}
            {vendors.length > 0 && (
              <div>
                <div className={card} style={{ ...cardStyle, position: "sticky", top: 20 }}>
                  <h3 style={{ margin: "0 0 16px", fontSize: 15, fontWeight: 600 }}>
                    Order Cart {cart.length > 0 && <span style={{ color: TEAL }}>({cart.length})</span>}
                  </h3>

                  {cart.length === 0 ? (
                    <p style={{ color: "#6b7280", fontSize: 13, textAlign: "center", padding: "20px 0" }}>
                      Click items on the left to add them.
                    </p>
                  ) : (
                    <>
                      <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 16 }}>
                        {cart.map(item => (
                          <div key={item.id} style={{ background: "rgba(255,255,255,0.03)", borderRadius: 10, padding: "10px 12px" }}>
                            <p style={{ margin: "0 0 6px", fontSize: 13, fontWeight: 500 }}>{item.item_name}</p>
                            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                                <button onClick={() => updateQty(item.id, item.quantity - 1)}
                                  style={{ width: 24, height: 24, border: "1px solid rgba(255,255,255,0.15)", borderRadius: 4, background: "rgba(255,255,255,0.05)", color: "#e5e7eb", cursor: "pointer", fontSize: 14 }}>−</button>
                                <input
                                  type="number" min={1} value={item.quantity}
                                  onChange={e => updateQty(item.id, parseInt(e.target.value) || 1)}
                                  style={{ width: 44, textAlign: "center", background: "#1a1a2e", border: "1px solid rgba(255,255,255,0.12)", color: "#e5e7eb", borderRadius: 4, padding: "2px 4px", fontSize: 13 }} />
                                <button onClick={() => updateQty(item.id, item.quantity + 1)}
                                  style={{ width: 24, height: 24, border: "1px solid rgba(255,255,255,0.15)", borderRadius: 4, background: "rgba(255,255,255,0.05)", color: "#e5e7eb", cursor: "pointer", fontSize: 14 }}>+</button>
                                <span style={{ fontSize: 11, color: "#6b7280" }}>{item.unit ?? "cs"}</span>
                              </div>
                              <button onClick={() => removeFromCart(item.id)}
                                style={{ background: "none", border: "none", color: "#6b7280", cursor: "pointer", fontSize: 16 }}>×</button>
                            </div>
                          </div>
                        ))}
                      </div>

                      <textarea
                        placeholder="Order notes (optional)…"
                        value={orderNotes}
                        onChange={e => setOrderNotes(e.target.value)}
                        style={{
                          width: "100%", background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.1)",
                          color: "#e5e7eb", borderRadius: 8, padding: "8px 10px", fontSize: 13, resize: "vertical",
                          minHeight: 60, marginBottom: 12, boxSizing: "border-box",
                        }} />

                      {selectedVendor && (
                        <p style={{ fontSize: 11, color: "#6b7280", marginBottom: 10 }}>
                          Will be emailed to {selectedVendor.rep_email}
                        </p>
                      )}

                      <button
                        onClick={submitOrder}
                        disabled={submitting || !selectedVendor}
                        style={{
                          width: "100%", background: submitting ? "rgba(0,212,168,0.4)" : TEAL,
                          color: "#0a0a0f", border: "none", borderRadius: 8, padding: "11px", fontSize: 14,
                          fontWeight: 600, cursor: submitting ? "not-allowed" : "pointer",
                        }}>
                        {submitting ? "Sending…" : "Send Order"}
                      </button>

                      {submitResult && (
                        <div style={{
                          marginTop: 10, padding: "10px 12px", borderRadius: 8, fontSize: 13,
                          background: submitResult.ok ? "rgba(0,212,168,0.1)" : "rgba(239,68,68,0.1)",
                          color: submitResult.ok ? TEAL : "#f87171",
                        }}>
                          {submitResult.message}
                        </div>
                      )}
                    </>
                  )}
                </div>
              </div>
            )}
          </div>

        ) : (

          /* ── History Tab ─────────────────────────────────────────────── */
          <div>
            {recentOrders.length === 0 ? (
              <p style={{ color: "#6b7280", textAlign: "center", padding: 40 }}>No orders placed yet.</p>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {recentOrders.map(order => (
                  <div key={order.id} className={card} style={{ ...cardStyle, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                    <div>
                      <p style={{ margin: 0, fontSize: 14, fontWeight: 500 }}>{order.vendor_name}</p>
                      <p style={{ margin: "2px 0 0", fontSize: 12, color: "#6b7280" }}>
                        {order.submitted_at
                          ? `Sent ${new Date(order.submitted_at).toLocaleDateString()}`
                          : `Created ${new Date(order.created_at).toLocaleDateString()}`}
                        {" · "}{locationName}
                      </p>
                    </div>
                    <span style={{
                      padding: "3px 10px", borderRadius: 20, fontSize: 12, fontWeight: 500,
                      background: `${statusColors[order.status] ?? "#6b7280"}20`,
                      color: statusColors[order.status] ?? "#6b7280",
                    }}>
                      {order.status.charAt(0).toUpperCase() + order.status.slice(1)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
