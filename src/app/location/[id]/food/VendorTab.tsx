"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { createClient } from "@/lib/supabase/client";

const fmtD = (n: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(n);
const fmtD2 = (n: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2 }).format(n);

const PAYMENT_METHODS = ["cash", "cheque", "card", "bank_transfer"] as const;
const METHOD_LABELS: Record<string, string> = { cash: "Cash", cheque: "Cheque", card: "Card", bank_transfer: "Bank Transfer" };
const STATUS_COLORS: Record<string, string> = { pending: "#f87171", paid: "#34d399", partial: "#fbbf24" };
const CATEGORIES = ["Meat", "Indian Groceries", "Restaurant Depot", "Rice", "Produce", "Dairy", "Beverages", "Supplies", "Other"];

function lastNMonths(n: number): string[] {
  const out: string[] = [];
  const d = new Date();
  for (let i = 0; i < n; i++) {
    out.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
    d.setMonth(d.getMonth() - 1);
  }
  return out;
}
const mLabel = (m: string) =>
  new Date(m + "-02").toLocaleDateString("en-US", { month: "short", year: "2-digit" });

interface Vendor {
  id: string; name: string; contact_person: string | null; phone: string | null;
  email: string | null; category: string | null; payment_terms: string | null;
  address: string | null; notes: string | null; is_active: boolean;
}
interface Delivery {
  id: string; delivery_date: string; vendor: string; vendor_id: string | null;
  category: string; amount: number; invoice_number: string | null;
  payment_status: string; paid_on: string | null; payment_method: string | null;
  cheque_number: string | null; notes: string | null;
}

const ACCENT = "#00d4a8";
const ACCENT_DIM = "rgba(0,212,168,0.12)";
const BG_CARD = "rgba(255,255,255,0.04)";
const BG_CARD_HOVER = "rgba(0,212,168,0.06)";
const BORDER = "rgba(255,255,255,0.08)";
const BORDER_ACCENT = "rgba(0,212,168,0.3)";

const inputCls = "w-full rounded-lg px-3 py-2 text-sm bg-white/5 border border-white/10 text-white placeholder-white/30 focus:outline-none focus:ring-1 focus:ring-teal-400 focus:border-teal-400/50";

export default function VendorTab({ locationId }: { locationId: string }) {
  const supabase = useMemo(() => createClient(), []);
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [deliveries, setDeliveries] = useState<Delivery[]>([]);
  // Select by VENDOR NAME (not id) — this makes unregistered vendors work too
  const [selectedName, setSelectedName] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"overview" | "monthly">("overview");
  const [showAdd, setShowAdd] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const emptyForm = { name: "", contact_person: "", phone: "", email: "", category: CATEGORIES[0], payment_terms: "Net 30", address: "", notes: "" };
  const [form, setForm] = useState(emptyForm);

  const loadVendors = useCallback(async () => {
    const { data } = await supabase.from("vendors").select("*").eq("location_id", locationId).order("name");
    setVendors((data ?? []) as Vendor[]);
  }, [locationId, supabase]);

  const loadDeliveries = useCallback(async () => {
    const { data } = await supabase.from("food_deliveries")
      .select("id,delivery_date,vendor,vendor_id,category,amount,invoice_number,payment_status,paid_on,payment_method,cheque_number,notes")
      .eq("location_id", locationId).order("delivery_date", { ascending: false });
    setDeliveries((data ?? []) as Delivery[]);
  }, [locationId, supabase]);

  useEffect(() => { loadVendors(); loadDeliveries(); }, [loadVendors, loadDeliveries]);

  // All unique vendor names from actual deliveries (case-deduplicated)
  const allVendorNames = useMemo(() => {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const d of deliveries) {
      const n = d.vendor?.trim();
      if (n && !seen.has(n.toLowerCase())) { seen.add(n.toLowerCase()); out.push(n); }
    }
    return out;
  }, [deliveries]);

  // All deliveries for a vendor name (case-insensitive match)
  const delivsByName = useCallback((name: string) =>
    deliveries.filter(d => d.vendor?.trim().toLowerCase() === name.toLowerCase()),
    [deliveries]);

  const monthlyFor = useCallback((name: string) => {
    const map: Record<string, number> = {};
    for (const d of delivsByName(name)) {
      if (Number(d.amount) <= 0) continue; // skip returns/credits
      const m = d.delivery_date.slice(0, 7);
      map[m] = (map[m] ?? 0) + Number(d.amount);
    }
    return map;
  }, [delivsByName]);

  const MONTHS = useMemo(() => lastNMonths(6), []);

  const vendorsBySpend = useMemo(() => [...allVendorNames].sort((a, b) => {
    const ma = monthlyFor(a); const mb = monthlyFor(b);
    const ta = MONTHS.reduce((s, m) => s + (ma[m] ?? 0), 0);
    const tb = MONTHS.reduce((s, m) => s + (mb[m] ?? 0), 0);
    return tb - ta;
  }), [allVendorNames, monthlyFor, MONTHS]);

  const monthlyByVendor = useMemo(() => {
    const result: Record<string, Record<string, number>> = {};
    for (const d of deliveries) {
      if (Number(d.amount) <= 0) continue; // skip returns/credits
      const name = d.vendor?.trim() ?? "Unknown";
      const month = d.delivery_date.slice(0, 7);
      if (!result[name]) result[name] = {};
      result[name][month] = (result[name][month] ?? 0) + Number(d.amount);
    }
    return result;
  }, [deliveries]);

  const saveVendor = async () => {
    setError("");
    if (!form.name.trim()) { setError("Vendor name is required."); return; }
    setSaving(true);
    const { error: err } = await supabase.from("vendors").insert({
      location_id: locationId, name: form.name.trim(),
      contact_person: form.contact_person || null, phone: form.phone || null,
      email: form.email || null, category: form.category, payment_terms: form.payment_terms,
      address: form.address || null, notes: form.notes || null,
    });
    setSaving(false);
    if (err) { setError(err.message); return; }
    setForm(emptyForm); setShowAdd(false); await loadVendors();
  };

  const toggleActive = async (v: Vendor) => {
    await supabase.from("vendors").update({ is_active: !v.is_active }).eq("id", v.id);
    setVendors(prev => prev.map(x => x.id === v.id ? { ...x, is_active: !x.is_active } : x));
  };

  const deleteVendor = async (id: string) => {
    if (!confirm("Delete this vendor record? Delivery records will NOT be deleted.")) return;
    await supabase.from("vendors").delete().eq("id", id);
    setVendors(prev => prev.filter(v => v.id !== id));
  };

  const markPaid = async (deliveryId: string, method: typeof PAYMENT_METHODS[number], chequeNum: string) => {
    await supabase.from("food_deliveries").update({
      payment_status: "paid", paid_on: new Date().toISOString().slice(0, 10),
      payment_method: method, cheque_number: method === "cheque" ? chequeNum : null,
    }).eq("id", deliveryId);
    await loadDeliveries();
  };

  const markPending = async (deliveryId: string) => {
    await supabase.from("food_deliveries").update({
      payment_status: "pending", paid_on: null, payment_method: null, cheque_number: null,
    }).eq("id", deliveryId);
    await loadDeliveries();
  };

  if (selectedName) {
    const vd = delivsByName(selectedName);
    const regVendor = vendors.find(v => v.name.toLowerCase() === selectedName.toLowerCase()) ?? null;
    return (
      <VendorDetail
        vendorName={selectedName}
        vendor={regVendor}
        deliveries={vd}
        months={MONTHS}
        onBack={() => setSelectedName(null)}
        onMarkPaid={markPaid}
        onMarkPending={markPending}
        onToggle={toggleActive}
        onDelete={deleteVendor}
      />
    );
  }

  // Only positive amounts = ordered/invoiced (exclude returns which are negative)
  const totalInvoiced = deliveries.filter(d => Number(d.amount) > 0).reduce((s, d) => s + Number(d.amount), 0);
  const totalPaid = deliveries.filter(d => d.payment_status === "paid" && Number(d.amount) > 0).reduce((s, d) => s + Number(d.amount), 0);
  const totalPending = deliveries.filter(d => (d.payment_status === "pending" || d.payment_status === "partial") && Number(d.amount) > 0).reduce((s, d) => s + Number(d.amount), 0);

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-bold text-white text-base">Vendor Management</h2>
          <p className="text-xs text-white/40 mt-0.5">{allVendorNames.length} vendors · {deliveries.length} invoices</p>
        </div>
        <button onClick={() => { setShowAdd(a => !a); setError(""); setForm(emptyForm); }}
          className="px-4 py-2 text-xs font-bold rounded-xl"
          style={{ background: showAdd ? "rgba(255,255,255,0.1)" : `linear-gradient(135deg,${ACCENT},#00b896)`, color: showAdd ? "white" : "black" }}>
          {showAdd ? "✕ Cancel" : "+ Add Vendor"}
        </button>
      </div>

      {/* Sub-tabs */}
      {!showAdd && (
        <div className="flex gap-1 p-1 rounded-xl w-fit" style={{ background: "rgba(255,255,255,0.05)" }}>
          {(["overview", "monthly"] as const).map(tab => (
            <button key={tab} onClick={() => setActiveTab(tab)}
              className="px-4 py-1.5 rounded-lg text-xs font-semibold transition-all"
              style={activeTab === tab
                ? { background: ACCENT_DIM, color: ACCENT, border: `1px solid ${BORDER_ACCENT}` }
                : { color: "rgba(255,255,255,0.4)" }}>
              {tab === "monthly" ? "📊 Monthly Spend" : "💳 All Vendors"}
            </button>
          ))}
        </div>
      )}

      {/* Add vendor form */}
      {showAdd && (
        <div className="rounded-2xl p-6" style={{ background: BG_CARD, border: `1px solid ${BORDER}` }}>
          <h3 className="font-bold text-white mb-4">Register Vendor</h3>
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <label className="text-xs font-semibold text-white/40 mb-1 block">Vendor Name *</label>
              <input type="text" placeholder="Must match name used on invoices" value={form.name}
                onChange={e => setForm(p => ({ ...p, name: e.target.value }))} className={inputCls} />
            </div>
            <div>
              <label className="text-xs font-semibold text-white/40 mb-1 block">Contact Person</label>
              <input type="text" placeholder="Name" value={form.contact_person}
                onChange={e => setForm(p => ({ ...p, contact_person: e.target.value }))} className={inputCls} />
            </div>
            <div>
              <label className="text-xs font-semibold text-white/40 mb-1 block">Phone</label>
              <input type="tel" placeholder="+1 (xxx) xxx-xxxx" value={form.phone}
                onChange={e => setForm(p => ({ ...p, phone: e.target.value }))} className={inputCls} />
            </div>
            <div>
              <label className="text-xs font-semibold text-white/40 mb-1 block">Email</label>
              <input type="email" placeholder="vendor@example.com" value={form.email}
                onChange={e => setForm(p => ({ ...p, email: e.target.value }))} className={inputCls} />
            </div>
            <div>
              <label className="text-xs font-semibold text-white/40 mb-1 block">Category</label>
              <select value={form.category} onChange={e => setForm(p => ({ ...p, category: e.target.value }))} className={inputCls}>
                {CATEGORIES.map(c => <option key={c} style={{ background: "#1a1a2e" }}>{c}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs font-semibold text-white/40 mb-1 block">Payment Terms</label>
              <select value={form.payment_terms} onChange={e => setForm(p => ({ ...p, payment_terms: e.target.value }))} className={inputCls}>
                {["Immediate", "Net 7", "Net 15", "Net 30", "Net 45", "Net 60", "COD"].map(t => <option key={t} style={{ background: "#1a1a2e" }}>{t}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs font-semibold text-white/40 mb-1 block">Address</label>
              <input type="text" placeholder="Street, City, State" value={form.address}
                onChange={e => setForm(p => ({ ...p, address: e.target.value }))} className={inputCls} />
            </div>
            <div className="col-span-2">
              <label className="text-xs font-semibold text-white/40 mb-1 block">Notes</label>
              <input type="text" placeholder="Any additional notes" value={form.notes}
                onChange={e => setForm(p => ({ ...p, notes: e.target.value }))} className={inputCls} />
            </div>
          </div>
          {error && <p className="text-red-400 text-xs mt-2 font-medium">⚠️ {error}</p>}
          <div className="mt-4">
            <button onClick={saveVendor} disabled={saving}
              className="px-5 py-2.5 rounded-xl text-sm font-bold text-black disabled:opacity-50"
              style={{ background: `linear-gradient(135deg,${ACCENT},#00b896)` }}>
              {saving ? "Saving…" : "Save Vendor"}
            </button>
          </div>
        </div>
      )}

      {!showAdd && (
        <>
          {/* Summary strip */}
          <div className="grid grid-cols-3 gap-4">
            {[
              { label: "Total Invoiced", value: fmtD(totalInvoiced), color: ACCENT },
              { label: "Total Paid", value: fmtD(totalPaid), color: "#34d399" },
              { label: "Pending", value: fmtD(totalPending), color: "#f87171" },
            ].map(k => (
              <div key={k.label} className="rounded-2xl p-4" style={{ background: BG_CARD, border: `1px solid ${BORDER}` }}>
                <p className="text-xs text-white/40 uppercase tracking-wide">{k.label}</p>
                <p className="text-xl font-bold mt-1" style={{ color: k.color }}>{k.value}</p>
              </div>
            ))}
          </div>

          {/* ── ALL VENDORS TAB ── */}
          {activeTab === "overview" && (
            vendorsBySpend.length === 0 ? (
              <div className="rounded-2xl p-10 text-center" style={{ background: BG_CARD, border: `1px solid ${BORDER}` }}>
                <p className="text-white/40 text-sm">No invoices found. Add food deliveries to see vendors here.</p>
              </div>
            ) : (
              <div className="grid sm:grid-cols-2 gap-4">
                {vendorsBySpend.map(vendorName => {
                  const vd = delivsByName(vendorName);
                  const monthly = monthlyFor(vendorName);
                  const thisMonth = monthly[MONTHS[0]] ?? 0;
                  const lastMonth = monthly[MONTHS[1]] ?? 0;
                  const allTimeTotal = vd.filter(d => Number(d.amount) > 0).reduce((s, d) => s + Number(d.amount), 0);
                  const allTimePaid = vd.filter(d => d.payment_status === "paid" && Number(d.amount) > 0).reduce((s, d) => s + Number(d.amount), 0);
                  const allTimePending = allTimeTotal - allTimePaid;
                  const regVendor = vendors.find(v => v.name.toLowerCase() === vendorName.toLowerCase());
                  const sixMo = MONTHS.reduce((s, m) => s + (monthly[m] ?? 0), 0);

                  return (
                    <div key={vendorName}
                      className="rounded-2xl overflow-hidden cursor-pointer transition-all hover:scale-[1.01]"
                      style={{ background: BG_CARD, border: `1px solid ${BORDER}` }}
                      onClick={() => setSelectedName(vendorName)}>
                      <div className="h-0.5 w-full" style={{ background: `linear-gradient(90deg,${ACCENT},transparent)` }} />
                      <div className="p-5">
                        <div className="flex items-start justify-between mb-3">
                          <div>
                            <h3 className="font-bold text-white text-base">{vendorName}</h3>
                            <p className="text-xs text-white/40 mt-0.5">
                              {vd.length} invoice{vd.length !== 1 ? "s" : ""}
                              {regVendor?.category ? ` · ${regVendor.category}` : ""}
                              {regVendor?.payment_terms ? ` · ${regVendor.payment_terms}` : ""}
                            </p>
                            {regVendor?.phone && <p className="text-xs text-white/50 mt-0.5">📞 {regVendor.phone}</p>}
                            {regVendor?.contact_person && <p className="text-xs text-white/50">👤 {regVendor.contact_person}</p>}
                          </div>
                          {!regVendor && (
                            <span className="text-[9px] px-2 py-0.5 rounded-full font-semibold shrink-0"
                              style={{ background: "rgba(251,191,36,0.1)", color: "#fbbf24", border: "1px solid rgba(251,191,36,0.2)" }}>
                              Unregistered
                            </span>
                          )}
                        </div>

                        <div className="grid grid-cols-3 gap-2 mb-3">
                          <div className="rounded-lg px-2 py-2 text-center" style={{ background: ACCENT_DIM }}>
                            <p className="text-[9px] text-white/40 uppercase">This month</p>
                            <p className="text-sm font-bold mt-0.5" style={{ color: ACCENT }}>{fmtD(thisMonth)}</p>
                          </div>
                          <div className="rounded-lg px-2 py-2 text-center" style={{ background: "rgba(255,255,255,0.04)" }}>
                            <p className="text-[9px] text-white/40 uppercase">Last month</p>
                            <p className="text-sm font-bold mt-0.5 text-white/60">{fmtD(lastMonth)}</p>
                          </div>
                          <div className="rounded-lg px-2 py-2 text-center" style={{ background: "rgba(255,255,255,0.04)" }}>
                            <p className="text-[9px] text-white/40 uppercase">6-mo total</p>
                            <p className="text-sm font-bold mt-0.5 text-white/80">{fmtD(sixMo)}</p>
                          </div>
                        </div>

                        <div className="grid grid-cols-2 gap-2 text-center">
                          <div className="rounded-lg py-2" style={{ background: "rgba(52,211,153,0.08)" }}>
                            <p className="text-[10px] text-white/40">All-time Paid</p>
                            <p className="text-sm font-bold text-emerald-400">{fmtD(allTimePaid)}</p>
                          </div>
                          <div className="rounded-lg py-2" style={{ background: allTimePending > 0 ? "rgba(248,113,113,0.08)" : "rgba(255,255,255,0.04)" }}>
                            <p className="text-[10px] text-white/40">Pending</p>
                            <p className="text-sm font-bold" style={{ color: allTimePending > 0 ? "#f87171" : "rgba(255,255,255,0.3)" }}>
                              {fmtD(allTimePending)}
                            </p>
                          </div>
                        </div>

                        <p className="text-[10px] text-white/25 text-right mt-2">Tap to see all invoices →</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            )
          )}

          {/* ── MONTHLY SPEND TAB ── */}
          {activeTab === "monthly" && (
            <div className="rounded-2xl overflow-hidden" style={{ background: BG_CARD, border: `1px solid ${BORDER}` }}>
              <div className="px-5 py-3" style={{ borderBottom: `1px solid ${BORDER}`, background: "rgba(0,212,168,0.04)" }}>
                <h3 className="font-bold text-white">Monthly Spend by Vendor</h3>
                <p className="text-xs text-white/40 mt-0.5">All vendors from invoices · last 6 months</p>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead style={{ background: "rgba(255,255,255,0.03)" }}>
                    <tr>
                      <th className="px-4 py-3 text-left font-semibold text-white/50 min-w-[160px]">Vendor</th>
                      {[...MONTHS].reverse().map(m => (
                        <th key={m} className="px-3 py-3 text-right font-semibold text-white/40 min-w-[90px]">{mLabel(m)}</th>
                      ))}
                      <th className="px-4 py-3 text-right font-bold text-white/60 min-w-[100px]" style={{ borderLeft: `1px solid ${BORDER}` }}>6-Mo Total</th>
                    </tr>
                  </thead>
                  <tbody style={{ borderTop: `1px solid ${BORDER}` }}>
                    {vendorsBySpend.map(vendorName => {
                      const monthly = monthlyByVendor[vendorName] ?? {};
                      const sixMoTotal = MONTHS.reduce((s, m) => s + (monthly[m] ?? 0), 0);
                      if (sixMoTotal === 0) return null;
                      const maxInRow = Math.max(...MONTHS.map(m => monthly[m] ?? 0), 1);
                      return (
                        <tr key={vendorName} className="cursor-pointer transition-colors"
                          style={{ borderBottom: `1px solid ${BORDER}` }}
                          onMouseEnter={e => (e.currentTarget.style.background = BG_CARD_HOVER)}
                          onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
                          onClick={() => setSelectedName(vendorName)}>
                          <td className="px-4 py-3 font-semibold text-teal-400 underline decoration-dashed underline-offset-2">{vendorName}</td>
                          {[...MONTHS].reverse().map(m => {
                            const val = monthly[m] ?? 0;
                            return (
                              <td key={m} className="px-3 py-3 text-right">
                                {val > 0 ? (
                                  <div className="flex flex-col items-end gap-1">
                                    <span className="font-semibold text-white/80">{fmtD(val)}</span>
                                    <div className="w-14 rounded-full h-0.5" style={{ background: "rgba(255,255,255,0.08)" }}>
                                      <div className="h-0.5 rounded-full" style={{ width: `${(val / maxInRow) * 100}%`, background: ACCENT }} />
                                    </div>
                                  </div>
                                ) : <span className="text-white/15">—</span>}
                              </td>
                            );
                          })}
                          <td className="px-4 py-3 text-right font-bold text-white/80" style={{ borderLeft: `1px solid ${BORDER}` }}>{fmtD(sixMoTotal)}</td>
                        </tr>
                      );
                    })}
                    <tr style={{ background: "rgba(0,212,168,0.06)", borderTop: `1px solid ${BORDER}` }}>
                      <td className="px-4 py-3 font-bold text-white/70">TOTAL</td>
                      {[...MONTHS].reverse().map(m => {
                        const t = vendorsBySpend.reduce((s, vn) => s + (monthlyByVendor[vn]?.[m] ?? 0), 0);
                        return <td key={m} className="px-3 py-3 text-right font-bold text-white/70">{t > 0 ? fmtD(t) : "—"}</td>;
                      })}
                      <td className="px-4 py-3 text-right font-bold" style={{ color: ACCENT, borderLeft: `1px solid ${BORDER}` }}>
                        {fmtD(vendorsBySpend.reduce((s, vn) => s + MONTHS.reduce((ms, m) => ms + (monthlyByVendor[vn]?.[m] ?? 0), 0), 0))}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ─── Vendor Detail ──────────────────────────────────────────────────────────────
function VendorDetail({ vendorName, vendor, deliveries, months, onBack, onMarkPaid, onMarkPending, onToggle, onDelete }: {
  vendorName: string;
  vendor: Vendor | null;
  deliveries: Delivery[];
  months: string[];
  onBack: () => void;
  onMarkPaid: (id: string, method: any, cheque: string) => void;
  onMarkPending: (id: string) => void;
  onToggle: (v: Vendor) => void;
  onDelete: (id: string) => void;
}) {
  const [payModal, setPayModal] = useState<string | null>(null);
  const [method, setMethod] = useState<"cash" | "cheque" | "card" | "bank_transfer">("cash");
  const [chequeNum, setChequeNum] = useState("");
  const currentMonthKey = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, "0")}`;
  const [filterMonth, setFilterMonth] = useState<string>(currentMonthKey);

  // Monthly breakdown — only count positive amounts (ordered commodities, not returns)
  const monthlySpend = useMemo(() => {
    const map: Record<string, { total: number; paid: number; count: number }> = {};
    for (const d of deliveries) {
      const m = d.delivery_date.slice(0, 7);
      if (!map[m]) map[m] = { total: 0, paid: 0, count: 0 };
      if (Number(d.amount) > 0) {
        map[m].total += Number(d.amount);
        if (d.payment_status === "paid") map[m].paid += Number(d.amount);
      }
      map[m].count++;
    }
    return map;
  }, [deliveries]);

  const availableMonths = useMemo(() =>
    Object.keys(monthlySpend).sort().reverse(), [monthlySpend]);

  const visibleDeliveries = filterMonth === "all"
    ? deliveries
    : deliveries.filter(d => d.delivery_date.slice(0, 7) === filterMonth);

  // Only positive amounts = ordered commodities (returns/credits are negative)
  const allTotal = deliveries.filter(d => Number(d.amount) > 0).reduce((s, d) => s + Number(d.amount), 0);
  const allPaid = deliveries.filter(d => d.payment_status === "paid" && Number(d.amount) > 0).reduce((s, d) => s + Number(d.amount), 0);
  const allPending = allTotal - allPaid;

  const filtTotal = visibleDeliveries.filter(d => Number(d.amount) > 0).reduce((s, d) => s + Number(d.amount), 0);
  const filtPaid = visibleDeliveries.filter(d => d.payment_status === "paid" && Number(d.amount) > 0).reduce((s, d) => s + Number(d.amount), 0);
  const filtPending = filtTotal - filtPaid;

  return (
    <div className="space-y-4">
      {/* Back + header */}
      <div className="flex items-center gap-3">
        <button onClick={onBack}
          className="px-3 py-2 text-xs font-medium rounded-xl text-white/60"
          style={{ background: BG_CARD, border: `1px solid ${BORDER}` }}>
          ← All Vendors
        </button>
        <div>
          <h2 className="font-bold text-white text-lg">{vendorName}</h2>
          {!vendor && (
            <span className="text-[10px] px-2 py-0.5 rounded-full font-semibold"
              style={{ background: "rgba(251,191,36,0.1)", color: "#fbbf24", border: "1px solid rgba(251,191,36,0.2)" }}>
              Unregistered
            </span>
          )}
        </div>
        {vendor && (
          <div className="ml-auto">
            <button onClick={() => onToggle(vendor)}
              className="text-xs px-3 py-1.5 rounded-full font-semibold"
              style={vendor.is_active
                ? { background: "rgba(52,211,153,0.1)", color: "#34d399", border: "1px solid rgba(52,211,153,0.2)" }
                : { background: BG_CARD, color: "rgba(255,255,255,0.3)", border: `1px solid ${BORDER}` }}>
              {vendor.is_active ? "Active" : "Inactive"}
            </button>
          </div>
        )}
      </div>

      {/* Contact info */}
      {vendor && (vendor.phone || vendor.email || vendor.contact_person || vendor.address) && (
        <div className="rounded-2xl px-5 py-3 flex flex-wrap gap-4 text-xs text-white/50" style={{ background: BG_CARD, border: `1px solid ${BORDER}` }}>
          {vendor.contact_person && <span>👤 {vendor.contact_person}</span>}
          {vendor.phone && <span>📞 {vendor.phone}</span>}
          {vendor.email && <span>✉️ {vendor.email}</span>}
          {vendor.address && <span>📍 {vendor.address}</span>}
          {vendor.payment_terms && <span>🗓 {vendor.payment_terms}</span>}
        </div>
      )}

      {/* All-time summary */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: "All-time Invoiced", value: fmtD2(allTotal), color: ACCENT },
          { label: "All-time Paid", value: fmtD2(allPaid), color: "#34d399" },
          { label: "Outstanding", value: fmtD2(allPending), color: allPending > 0 ? "#f87171" : "rgba(255,255,255,0.3)" },
        ].map(k => (
          <div key={k.label} className="rounded-2xl p-3 text-center" style={{ background: BG_CARD, border: `1px solid ${BORDER}` }}>
            <p className="text-[10px] text-white/40 uppercase">{k.label}</p>
            <p className="text-base font-bold mt-0.5" style={{ color: k.color }}>{k.value}</p>
          </div>
        ))}
      </div>

      {/* Monthly spend breakdown — clickable month filters */}
      {availableMonths.length > 0 && (
        <div className="rounded-2xl p-4" style={{ background: BG_CARD, border: `1px solid ${BORDER}` }}>
          <p className="text-[10px] font-semibold text-white/30 uppercase tracking-wide mb-3">Monthly Spend — click to filter invoices below</p>
          <div className="flex gap-2 flex-wrap">
            <button
              onClick={() => setFilterMonth("all")}
              className="rounded-xl px-3 py-2 text-center min-w-[72px] transition-all"
              style={{
                background: filterMonth === "all" ? ACCENT_DIM : "rgba(255,255,255,0.04)",
                border: filterMonth === "all" ? `2px solid ${ACCENT}` : `1px solid ${BORDER}`,
              }}>
              <p className="text-[9px] font-semibold" style={{ color: filterMonth === "all" ? ACCENT : "rgba(255,255,255,0.3)" }}>ALL TIME</p>
              <p className="text-xs font-bold mt-0.5" style={{ color: filterMonth === "all" ? "white" : "rgba(255,255,255,0.7)" }}>
                {fmtD(allTotal)}
              </p>
            </button>
            {availableMonths.slice(0, 9).map(m => {
              const ms = monthlySpend[m];
              const active = filterMonth === m;
              return (
                <button key={m}
                  onClick={() => setFilterMonth(m)}
                  className="rounded-xl px-3 py-2 text-center min-w-[72px] transition-all"
                  style={{
                    background: active ? ACCENT_DIM : "rgba(255,255,255,0.04)",
                    border: active ? `2px solid ${ACCENT}` : `1px solid ${BORDER}`,
                  }}>
                  <p className="text-[9px] font-semibold" style={{ color: active ? ACCENT : "rgba(255,255,255,0.3)" }}>{mLabel(m)}</p>
                  <p className="text-xs font-bold mt-0.5" style={{ color: active ? "white" : "rgba(255,255,255,0.7)" }}>
                    {fmtD(ms.total)}
                  </p>
                  <p className="text-[8px]" style={{ color: ms.paid >= ms.total && ms.paid > 0 ? "#34d399" : ms.paid > 0 ? "#fbbf24" : "#f87171" }}>
                    {ms.paid >= ms.total && ms.paid > 0 ? "✓ paid" : ms.paid > 0 ? `${fmtD(ms.paid)} paid` : "unpaid"}
                  </p>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Invoice table */}
      <div className="rounded-2xl overflow-hidden" style={{ background: BG_CARD, border: `1px solid ${BORDER}` }}>
        <div className="px-5 py-3" style={{ borderBottom: `1px solid ${BORDER}`, background: ACCENT_DIM }}>
          <h3 className="font-bold text-white">
            {filterMonth === "all" ? "All Invoices" : `Invoices — ${mLabel(filterMonth)}`}
          </h3>
          <p className="text-xs text-white/40 mt-0.5">
            {visibleDeliveries.length} record{visibleDeliveries.length !== 1 ? "s" : ""} ·
            Total: <span className="font-semibold text-white/70">{fmtD2(filtTotal)}</span>
            {filtPending > 0 && <span className="text-red-400 ml-2">· {fmtD2(filtPending)} pending</span>}
          </p>
        </div>
        {visibleDeliveries.length === 0 ? (
          <p className="px-5 py-8 text-center text-white/30 text-sm">
            No invoices for {filterMonth === "all" ? "this vendor" : mLabel(filterMonth)}.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead style={{ background: "rgba(255,255,255,0.03)" }}>
                <tr>
                  <th className="px-4 py-2.5 text-left text-xs font-semibold text-white/40">Date</th>
                  <th className="px-3 py-2.5 text-left text-xs font-semibold text-white/40">Invoice #</th>
                  <th className="px-3 py-2.5 text-left text-xs font-semibold text-white/40">Category</th>
                  <th className="px-3 py-2.5 text-right text-xs font-semibold text-white/40">Amount</th>
                  <th className="px-3 py-2.5 text-center text-xs font-semibold text-white/40">Status</th>
                  <th className="px-3 py-2.5 text-left text-xs font-semibold text-white/30">Paid On</th>
                  <th className="px-3 py-2.5 text-left text-xs font-semibold text-white/30">Method</th>
                  <th className="px-4 py-2.5 text-center text-xs font-semibold text-white/40">Action</th>
                </tr>
              </thead>
              <tbody>
                {visibleDeliveries.map(d => (
                  <tr key={d.id} style={{ borderBottom: `1px solid ${BORDER}` }}
                    onMouseEnter={e => (e.currentTarget.style.background = BG_CARD_HOVER)}
                    onMouseLeave={e => (e.currentTarget.style.background = "transparent")}>
                    <td className="px-4 py-2.5 text-xs text-white/60 whitespace-nowrap font-medium">{d.delivery_date}</td>
                    <td className="px-3 py-2.5 text-xs text-white/40 font-mono">{d.invoice_number || "—"}</td>
                    <td className="px-3 py-2.5 text-xs text-white/60">{d.category}</td>
                    <td className="px-3 py-2.5 text-right font-bold text-white">{fmtD2(Number(d.amount))}</td>
                    <td className="px-3 py-2.5 text-center">
                      <span className="text-xs font-bold px-2 py-0.5 rounded-full capitalize"
                        style={{
                          background: d.payment_status === "paid" ? "rgba(52,211,153,0.1)" : d.payment_status === "partial" ? "rgba(251,191,36,0.1)" : "rgba(248,113,113,0.1)",
                          color: STATUS_COLORS[d.payment_status] ?? "rgba(255,255,255,0.4)"
                        }}>
                        {d.payment_status}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-xs text-white/40">{d.paid_on ?? "—"}</td>
                    <td className="px-3 py-2.5 text-xs text-white/40">
                      {d.payment_method ? METHOD_LABELS[d.payment_method] : "—"}
                      {d.cheque_number && <span className="text-white/25"> #{d.cheque_number}</span>}
                    </td>
                    <td className="px-4 py-2.5 text-center">
                      {d.payment_status === "paid" ? (
                        <button onClick={() => onMarkPending(d.id)} className="text-xs text-red-400/70 hover:text-red-400">Mark Pending</button>
                      ) : (
                        <button onClick={() => { setPayModal(d.id); setMethod("cash"); setChequeNum(""); }}
                          className="text-xs font-semibold px-2.5 py-1 rounded-lg text-black"
                          style={{ background: `linear-gradient(135deg,${ACCENT},#00b896)` }}>
                          Mark Paid
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr style={{ background: "rgba(0,212,168,0.05)", borderTop: `1px solid ${BORDER}` }}>
                  <td colSpan={3} className="px-4 py-2 text-xs font-bold text-white/50">
                    {filterMonth === "all" ? "All-time Total" : `${mLabel(filterMonth)} Total`}
                  </td>
                  <td className="px-3 py-2 text-right text-xs font-bold text-white">{fmtD2(filtTotal)}</td>
                  <td colSpan={4} className="px-3 py-2 text-xs">
                    {filtPaid > 0 && <span className="text-emerald-400 font-semibold">{fmtD2(filtPaid)} paid</span>}
                    {filtPending > 0 && <span className="text-red-400 font-semibold ml-2">{fmtD2(filtPending)} pending</span>}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>

      {/* Pay modal */}
      {payModal && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="rounded-2xl p-6 w-full max-w-sm shadow-2xl" style={{ background: "#1a1a2e", border: `1px solid ${BORDER_ACCENT}` }}>
            <h3 className="font-bold text-white mb-4">Record Payment</h3>
            <div className="grid grid-cols-2 gap-2">
              {PAYMENT_METHODS.map(m => (
                <button key={m} onClick={() => setMethod(m)}
                  className="py-2 rounded-lg text-xs font-semibold border transition-all"
                  style={method === m
                    ? { background: ACCENT_DIM, color: ACCENT, borderColor: ACCENT }
                    : { background: "rgba(255,255,255,0.04)", color: "rgba(255,255,255,0.5)", borderColor: BORDER }}>
                  {METHOD_LABELS[m]}
                </button>
              ))}
            </div>
            {method === "cheque" && (
              <div className="mt-3">
                <label className="text-xs font-semibold text-white/40 mb-1 block">Cheque Number *</label>
                <input type="text" placeholder="e.g. 001234" value={chequeNum}
                  onChange={e => setChequeNum(e.target.value)} className={inputCls} />
              </div>
            )}
            <div className="flex gap-2 mt-4">
              <button onClick={() => {
                if (method === "cheque" && !chequeNum.trim()) { alert("Cheque number required."); return; }
                onMarkPaid(payModal, method, chequeNum);
                setPayModal(null);
              }} className="flex-1 py-2.5 rounded-xl text-sm font-bold text-black"
                style={{ background: `linear-gradient(135deg,${ACCENT},#00b896)` }}>
                Confirm Payment
              </button>
              <button onClick={() => setPayModal(null)}
                className="px-4 py-2.5 rounded-xl text-sm font-medium text-white/50"
                style={{ background: "rgba(255,255,255,0.05)", border: `1px solid ${BORDER}` }}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
