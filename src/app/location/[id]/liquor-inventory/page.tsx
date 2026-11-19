"use client";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

const SPIRIT_TYPES = ["Whiskey/Bourbon", "Vodka", "Rum", "Gin", "Tequila", "Wine", "Beer", "Other"];

interface Bottle {
  id: string;
  spirit_type: string;
  brand: string;
  bottle_size_ml: number;
  pour_size_oz: number;
  cost_per_bottle: number;
  par_level: number;
  current_stock: number;
}

interface Transaction {
  id: string;
  bottle_id: string;
  transaction_type: string;
  quantity: number;
  cost_per_unit: number;
  transaction_date: string;
  notes: string;
}

const fmtUSD = (n: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2 }).format(n);

function poursPerBottle(size_ml: number, pour_oz: number) {
  const bottleOz = size_ml / 29.5735;
  return pour_oz > 0 ? bottleOz / pour_oz : 0;
}

export default function LiquorInventoryPage() {
  const { id } = useParams<{ id: string }>();
  const supabase = createClient();

  const [bottles, setBottles] = useState<Bottle[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [locationName, setLocationName] = useState("");
  const [activeTab, setActiveTab] = useState<"inventory" | "log">("inventory");

  // Bottle form
  const [showBottleForm, setShowBottleForm] = useState(false);
  const [editBottle, setEditBottle] = useState<Bottle | null>(null);
  const [bForm, setBForm] = useState({ spirit_type: "Vodka", brand: "", bottle_size_ml: "750", pour_size_oz: "1.5", cost_per_bottle: "", par_level: "2", current_stock: "0" });
  const [bError, setBError] = useState("");
  const [bSaving, setBSaving] = useState(false);

  // Log purchase/count form
  const [showLogForm, setShowLogForm] = useState(false);
  const [logBottleId, setLogBottleId] = useState("");
  const [logForm, setLogForm] = useState({ transaction_type: "purchase", quantity: "1", cost_per_unit: "", transaction_date: new Date().toISOString().split("T")[0], notes: "" });
  const [logError, setLogError] = useState("");
  const [logSaving, setLogSaving] = useState(false);

  const [deleting, setDeleting] = useState<string | null>(null);

  useEffect(() => { loadData(); }, [id]);

  async function loadData() {
    setLoading(true);
    const [{ data: loc }, { data: btl }, { data: txn }] = await Promise.all([
      supabase.from("locations").select("name").eq("id", id).single(),
      supabase.from("liquor_bottles").select("*").eq("location_id", id).order("spirit_type").order("brand"),
      supabase.from("liquor_transactions").select("*").eq("location_id", id).order("transaction_date", { ascending: false }).limit(50),
    ]);
    if (loc) setLocationName(loc.name);
    setBottles(btl || []);
    setTransactions(txn || []);
    setLoading(false);
  }

  function openAddBottle() {
    setEditBottle(null);
    setBForm({ spirit_type: "Vodka", brand: "", bottle_size_ml: "750", pour_size_oz: "1.5", cost_per_bottle: "", par_level: "2", current_stock: "0" });
    setBError("");
    setShowBottleForm(true);
  }

  function openEditBottle(b: Bottle) {
    setEditBottle(b);
    setBForm({
      spirit_type: b.spirit_type, brand: b.brand,
      bottle_size_ml: String(b.bottle_size_ml), pour_size_oz: String(b.pour_size_oz),
      cost_per_bottle: String(b.cost_per_bottle), par_level: String(b.par_level), current_stock: String(b.current_stock),
    });
    setBError("");
    setShowBottleForm(true);
  }

  async function saveBottle() {
    if (!bForm.brand.trim()) { setBError("Brand is required."); return; }
    setBSaving(true); setBError("");
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setBSaving(false); return; }
    const payload = {
      location_id: id, user_id: user.id,
      spirit_type: bForm.spirit_type, brand: bForm.brand.trim(),
      bottle_size_ml: parseInt(bForm.bottle_size_ml) || 750,
      pour_size_oz: parseFloat(bForm.pour_size_oz) || 1.5,
      cost_per_bottle: parseFloat(bForm.cost_per_bottle) || 0,
      par_level: parseInt(bForm.par_level) || 2,
      current_stock: parseInt(bForm.current_stock) || 0,
    };
    let err;
    if (editBottle) {
      ({ error: err } = await supabase.from("liquor_bottles").update(payload).eq("id", editBottle.id));
    } else {
      ({ error: err } = await supabase.from("liquor_bottles").insert(payload));
    }
    setBSaving(false);
    if (err) { setBError(err.message); return; }
    setShowBottleForm(false);
    loadData();
  }

  async function deleteBottle(bottleId: string) {
    setDeleting(bottleId);
    await supabase.from("liquor_bottles").delete().eq("id", bottleId);
    setDeleting(null);
    loadData();
  }

  function openLog(bottleId: string, bottle: Bottle) {
    setLogBottleId(bottleId);
    setLogForm({ transaction_type: "purchase", quantity: "1", cost_per_unit: String(bottle.cost_per_bottle), transaction_date: new Date().toISOString().split("T")[0], notes: "" });
    setLogError("");
    setShowLogForm(true);
  }

  async function saveLog() {
    if (!logBottleId) { setLogError("Select a bottle."); return; }
    setLogSaving(true); setLogError("");
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setLogSaving(false); return; }
    const qty = parseInt(logForm.quantity) || 1;
    const { error: err } = await supabase.from("liquor_transactions").insert({
      location_id: id, user_id: user.id, bottle_id: logBottleId,
      transaction_type: logForm.transaction_type,
      quantity: qty,
      cost_per_unit: parseFloat(logForm.cost_per_unit) || 0,
      transaction_date: logForm.transaction_date,
      notes: logForm.notes,
    });
    // Update current_stock
    if (!err) {
      const bottle = bottles.find(b => b.id === logBottleId);
      if (bottle) {
        const newStock = logForm.transaction_type === "purchase"
          ? bottle.current_stock + qty
          : qty; // "count" = set actual stock
        await supabase.from("liquor_bottles").update({ current_stock: newStock }).eq("id", logBottleId);
      }
    }
    setLogSaving(false);
    if (err) { setLogError(err.message); return; }
    setShowLogForm(false);
    loadData();
  }

  const lowStock = bottles.filter(b => b.current_stock < b.par_level);
  const totalInvValue = bottles.reduce((s, b) => s + b.current_stock * b.cost_per_bottle, 0);

  const inputClass = "w-full rounded-xl px-3 py-2.5 text-sm text-white outline-none focus:ring-2 focus:ring-teal-500/40";
  const inputStyle = { background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)" };

  return (
    <div className="min-h-screen" style={{ background: "#060b18" }}>
      <div className="max-w-5xl mx-auto px-4 py-8 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <Link href={`/location/${id}`} className="text-xs text-teal-400 hover:underline">← {locationName}</Link>
            <h1 className="text-2xl font-bold text-white mt-1">🍹 Liquor Inventory</h1>
            <p className="text-gray-400 text-sm mt-0.5">Track bottles, pours, par levels, and variance</p>
          </div>
          <div className="flex gap-2">
            {bottles.length > 0 && (
              <button onClick={() => { setLogBottleId(bottles[0].id); setLogForm({ transaction_type: "purchase", quantity: "1", cost_per_unit: String(bottles[0].cost_per_bottle), transaction_date: new Date().toISOString().split("T")[0], notes: "" }); setLogError(""); setShowLogForm(true); }}
                className="px-4 py-2 rounded-xl text-sm font-semibold transition-all"
                style={{ background: "rgba(129,140,248,0.15)", border: "1px solid rgba(129,140,248,0.3)", color: "#818cf8" }}>
                📝 Log Purchase / Count
              </button>
            )}
            <button onClick={openAddBottle}
              className="px-4 py-2 rounded-xl text-sm font-bold"
              style={{ background: "#00d4a8", color: "#060b18" }}>
              + Add Bottle
            </button>
          </div>
        </div>

        {loading && <div className="text-center py-16 text-gray-400">Loading inventory…</div>}

        {!loading && (
          <>
            {/* Alert: low stock */}
            {lowStock.length > 0 && (
              <div className="rounded-xl px-4 py-3 flex items-start gap-3" style={{ background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.25)" }}>
                <span className="text-lg">⚠️</span>
                <div>
                  <p className="text-sm font-semibold text-red-400">Low Stock Alert — {lowStock.length} item{lowStock.length !== 1 ? "s" : ""} below par</p>
                  <p className="text-xs text-red-300 mt-0.5">{lowStock.map(b => `${b.brand} (${b.current_stock}/${b.par_level})`).join(" · ")}</p>
                </div>
              </div>
            )}

            {/* Summary cards */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {[
                { label: "Total SKUs", value: bottles.length, color: "#00d4a8" },
                { label: "Inv. Value", value: fmtUSD(totalInvValue), color: "#818cf8" },
                { label: "Below Par", value: lowStock.length, color: lowStock.length > 0 ? "#f87171" : "#00d4a8" },
                { label: "Spirits", value: Array.from(new Set(bottles.map(b => b.spirit_type))).length, color: "#fbbf24" },
              ].map(stat => (
                <div key={stat.label} className="rounded-xl p-4 text-center" style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}>
                  <div className="text-2xl font-bold" style={{ color: stat.color }}>{stat.value}</div>
                  <div className="text-xs text-gray-400 mt-0.5">{stat.label}</div>
                </div>
              ))}
            </div>

            {/* Tabs */}
            <div className="flex gap-1 p-1 rounded-xl" style={{ background: "rgba(255,255,255,0.04)" }}>
              {(["inventory", "log"] as const).map(tab => (
                <button key={tab} onClick={() => setActiveTab(tab)}
                  className="flex-1 py-2 rounded-lg text-sm font-semibold capitalize transition-all"
                  style={activeTab === tab
                    ? { background: "#00d4a8", color: "#060b18" }
                    : { color: "#94a3b8" }}>
                  {tab === "inventory" ? "🍾 Bottles" : "📋 Activity Log"}
                </button>
              ))}
            </div>

            {activeTab === "inventory" && (
              <>
                {bottles.length === 0 ? (
                  <div className="rounded-2xl p-12 text-center" style={{ background: "rgba(255,255,255,0.03)", border: "1px dashed rgba(255,255,255,0.1)" }}>
                    <div className="text-4xl mb-3">🍾</div>
                    <h3 className="text-white font-semibold text-lg">No bottles yet</h3>
                    <p className="text-gray-400 text-sm mt-1 mb-4">Add spirits to track your bar inventory</p>
                    <button onClick={openAddBottle} className="px-6 py-2.5 rounded-xl text-sm font-bold" style={{ background: "#00d4a8", color: "#060b18" }}>
                      + Add First Bottle
                    </button>
                  </div>
                ) : (
                  /* Group by spirit type */
                  SPIRIT_TYPES.filter(t => bottles.some(b => b.spirit_type === t)).map(spiritType => (
                    <div key={spiritType}>
                      <h3 className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-2">{spiritType}</h3>
                      <div className="space-y-2">
                        {bottles.filter(b => b.spirit_type === spiritType).map(bottle => {
                          const pours = poursPerBottle(bottle.bottle_size_ml, bottle.pour_size_oz);
                          const costPerPour = pours > 0 ? bottle.cost_per_bottle / pours : 0;
                          const isLow = bottle.current_stock < bottle.par_level;
                          return (
                            <div key={bottle.id} className="rounded-xl p-4 flex flex-wrap items-center gap-4"
                              style={{ background: isLow ? "rgba(239,68,68,0.06)" : "rgba(255,255,255,0.03)", border: `1px solid ${isLow ? "rgba(239,68,68,0.2)" : "rgba(255,255,255,0.08)"}` }}>
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2">
                                  <span className="font-semibold text-white">{bottle.brand}</span>
                                  {isLow && <span className="text-xs rounded-full px-2 py-0.5 font-medium" style={{ background: "rgba(239,68,68,0.15)", color: "#f87171" }}>Low Stock</span>}
                                </div>
                                <div className="text-xs text-gray-500 mt-0.5">{bottle.bottle_size_ml}ml · {bottle.pour_size_oz}oz pours · {pours.toFixed(0)} pours/bottle</div>
                              </div>
                              <div className="flex gap-6 text-center text-sm">
                                <div>
                                  <div className="font-bold text-white">{bottle.current_stock}<span className="text-gray-500">/{bottle.par_level}</span></div>
                                  <div className="text-xs text-gray-500">Stock/Par</div>
                                </div>
                                <div>
                                  <div className="font-bold text-white">{fmtUSD(bottle.cost_per_bottle)}</div>
                                  <div className="text-xs text-gray-500">Per Bottle</div>
                                </div>
                                <div>
                                  <div className="font-bold" style={{ color: "#818cf8" }}>{fmtUSD(costPerPour)}</div>
                                  <div className="text-xs text-gray-500">Per Pour</div>
                                </div>
                              </div>
                              <div className="flex gap-2 ml-auto">
                                <button onClick={() => openLog(bottle.id, bottle)}
                                  className="text-xs px-2.5 py-1.5 rounded-lg font-medium transition-colors"
                                  style={{ background: "rgba(129,140,248,0.1)", color: "#818cf8" }}>Log</button>
                                <button onClick={() => openEditBottle(bottle)}
                                  className="text-xs text-gray-400 hover:text-white px-2.5 py-1.5 rounded-lg"
                                  style={{ background: "rgba(255,255,255,0.05)" }}>Edit</button>
                                <button onClick={() => deleteBottle(bottle.id)} disabled={deleting === bottle.id}
                                  className="text-xs text-red-400 hover:text-red-300 px-2.5 py-1.5 rounded-lg disabled:opacity-40"
                                  style={{ background: "rgba(239,68,68,0.08)" }}>
                                  {deleting === bottle.id ? "…" : "Del"}
                                </button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ))
                )}
              </>
            )}

            {activeTab === "log" && (
              <div className="rounded-2xl overflow-hidden" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)" }}>
                {transactions.length === 0 ? (
                  <div className="p-10 text-center text-gray-500 text-sm">No activity yet — log a purchase or stock count to get started.</div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr style={{ borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
                          {["Date", "Type", "Bottle", "Qty", "Unit Cost", "Total", "Notes"].map(h => (
                            <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider whitespace-nowrap">{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {transactions.map((txn, idx) => {
                          const bottle = bottles.find(b => b.id === txn.bottle_id);
                          return (
                            <tr key={txn.id} style={{ borderBottom: idx < transactions.length - 1 ? "1px solid rgba(255,255,255,0.05)" : "none" }}>
                              <td className="px-4 py-3 text-gray-400 whitespace-nowrap">{txn.transaction_date}</td>
                              <td className="px-4 py-3">
                                <span className="text-xs rounded-full px-2.5 py-0.5 font-medium capitalize"
                                  style={txn.transaction_type === "purchase"
                                    ? { background: "rgba(0,212,168,0.12)", color: "#00d4a8" }
                                    : { background: "rgba(129,140,248,0.12)", color: "#818cf8" }}>
                                  {txn.transaction_type}
                                </span>
                              </td>
                              <td className="px-4 py-3 text-white">{bottle ? `${bottle.brand} (${bottle.spirit_type})` : "—"}</td>
                              <td className="px-4 py-3 text-gray-300">{txn.quantity}</td>
                              <td className="px-4 py-3 text-gray-300">{fmtUSD(txn.cost_per_unit)}</td>
                              <td className="px-4 py-3 text-white font-medium">{fmtUSD(txn.quantity * txn.cost_per_unit)}</td>
                              <td className="px-4 py-3 text-gray-500 text-xs">{txn.notes || "—"}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}
          </>
        )}

        {/* Add/Edit Bottle Modal */}
        {showBottleForm && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,0.75)" }}>
            <div className="w-full max-w-md rounded-2xl p-6 space-y-4" style={{ background: "#0d1626", border: "1px solid rgba(255,255,255,0.1)" }}>
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-bold text-white">{editBottle ? "Edit Bottle" : "Add Bottle"}</h2>
                <button onClick={() => setShowBottleForm(false)} className="text-gray-400 hover:text-white text-xl">✕</button>
              </div>
              <div className="space-y-3">
                <div>
                  <label className="text-xs text-gray-400 uppercase tracking-wide font-semibold">Spirit Type</label>
                  <select className={`${inputClass} mt-1`} style={{ ...inputStyle, appearance: "none" }}
                    value={bForm.spirit_type} onChange={e => setBForm(f => ({ ...f, spirit_type: e.target.value }))}>
                    {SPIRIT_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs text-gray-400 uppercase tracking-wide font-semibold">Brand *</label>
                  <input className={`${inputClass} mt-1`} style={inputStyle}
                    placeholder="e.g. Tito's" value={bForm.brand}
                    onChange={e => setBForm(f => ({ ...f, brand: e.target.value }))} autoFocus />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs text-gray-400 uppercase tracking-wide font-semibold">Bottle Size (ml)</label>
                    <input className={`${inputClass} mt-1`} style={inputStyle}
                      type="number" placeholder="750"
                      value={bForm.bottle_size_ml} onChange={e => setBForm(f => ({ ...f, bottle_size_ml: e.target.value }))} />
                  </div>
                  <div>
                    <label className="text-xs text-gray-400 uppercase tracking-wide font-semibold">Pour Size (oz)</label>
                    <input className={`${inputClass} mt-1`} style={inputStyle}
                      type="number" step="0.25" placeholder="1.5"
                      value={bForm.pour_size_oz} onChange={e => setBForm(f => ({ ...f, pour_size_oz: e.target.value }))} />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs text-gray-400 uppercase tracking-wide font-semibold">Cost Per Bottle ($)</label>
                    <input className={`${inputClass} mt-1`} style={inputStyle}
                      type="number" step="0.01" placeholder="24.99"
                      value={bForm.cost_per_bottle} onChange={e => setBForm(f => ({ ...f, cost_per_bottle: e.target.value }))} />
                  </div>
                  <div>
                    <label className="text-xs text-gray-400 uppercase tracking-wide font-semibold">Par Level (bottles)</label>
                    <input className={`${inputClass} mt-1`} style={inputStyle}
                      type="number" min="1" placeholder="2"
                      value={bForm.par_level} onChange={e => setBForm(f => ({ ...f, par_level: e.target.value }))} />
                  </div>
                </div>
                <div>
                  <label className="text-xs text-gray-400 uppercase tracking-wide font-semibold">Current Stock (bottles)</label>
                  <input className={`${inputClass} mt-1`} style={inputStyle}
                    type="number" min="0" placeholder="0"
                    value={bForm.current_stock} onChange={e => setBForm(f => ({ ...f, current_stock: e.target.value }))} />
                </div>
                {bForm.bottle_size_ml && bForm.pour_size_oz && (
                  <div className="rounded-xl px-3 py-2 text-xs" style={{ background: "rgba(0,212,168,0.05)", border: "1px solid rgba(0,212,168,0.15)" }}>
                    <span className="text-gray-400">Pours per bottle: </span>
                    <span className="text-teal-400 font-bold">{poursPerBottle(parseInt(bForm.bottle_size_ml) || 750, parseFloat(bForm.pour_size_oz) || 1.5).toFixed(0)}</span>
                    {bForm.cost_per_bottle && (
                      <> · <span className="text-gray-400">Cost per pour: </span>
                      <span className="text-teal-400 font-bold">{fmtUSD((parseFloat(bForm.cost_per_bottle) || 0) / poursPerBottle(parseInt(bForm.bottle_size_ml) || 750, parseFloat(bForm.pour_size_oz) || 1.5))}</span></>
                    )}
                  </div>
                )}
              </div>
              {bError && <p className="text-sm text-red-400 rounded-lg px-3 py-2" style={{ background: "rgba(239,68,68,0.1)" }}>{bError}</p>}
              <div className="flex gap-3">
                <button onClick={() => setShowBottleForm(false)}
                  className="flex-1 py-2.5 rounded-xl text-sm font-medium text-gray-400"
                  style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}>Cancel</button>
                <button onClick={saveBottle} disabled={bSaving}
                  className="flex-1 py-2.5 rounded-xl text-sm font-bold disabled:opacity-50"
                  style={{ background: "#00d4a8", color: "#060b18" }}>
                  {bSaving ? "Saving…" : editBottle ? "Save Changes" : "Add Bottle"}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Log transaction modal */}
        {showLogForm && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,0.75)" }}>
            <div className="w-full max-w-md rounded-2xl p-6 space-y-4" style={{ background: "#0d1626", border: "1px solid rgba(255,255,255,0.1)" }}>
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-bold text-white">Log Activity</h2>
                <button onClick={() => setShowLogForm(false)} className="text-gray-400 hover:text-white text-xl">✕</button>
              </div>
              <div className="space-y-3">
                <div>
                  <label className="text-xs text-gray-400 uppercase tracking-wide font-semibold">Bottle</label>
                  <select className={`${inputClass} mt-1`} style={{ ...inputStyle, appearance: "none" }}
                    value={logBottleId} onChange={e => { const b = bottles.find(b => b.id === e.target.value); setLogBottleId(e.target.value); if (b) setLogForm(f => ({ ...f, cost_per_unit: String(b.cost_per_bottle) })); }}>
                    {bottles.map(b => <option key={b.id} value={b.id}>{b.brand} ({b.spirit_type})</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs text-gray-400 uppercase tracking-wide font-semibold">Type</label>
                  <div className="grid grid-cols-2 gap-2 mt-1">
                    {[{ v: "purchase", label: "📦 Purchase", desc: "Add to stock" }, { v: "count", label: "🔢 Count", desc: "Set actual stock" }].map(opt => (
                      <button key={opt.v} type="button" onClick={() => setLogForm(f => ({ ...f, transaction_type: opt.v }))}
                        className="rounded-xl p-3 text-left transition-all"
                        style={logForm.transaction_type === opt.v
                          ? { background: "rgba(0,212,168,0.12)", border: "2px solid #00d4a8" }
                          : { background: "rgba(255,255,255,0.04)", border: "2px solid rgba(255,255,255,0.08)" }}>
                        <div className="text-sm font-semibold text-white">{opt.label}</div>
                        <div className="text-xs text-gray-400">{opt.desc}</div>
                      </button>
                    ))}
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs text-gray-400 uppercase tracking-wide font-semibold">
                      {logForm.transaction_type === "purchase" ? "Bottles Purchased" : "Bottles On Hand"}
                    </label>
                    <input className={`${inputClass} mt-1`} style={inputStyle}
                      type="number" min="0" value={logForm.quantity}
                      onChange={e => setLogForm(f => ({ ...f, quantity: e.target.value }))} />
                  </div>
                  <div>
                    <label className="text-xs text-gray-400 uppercase tracking-wide font-semibold">Cost / Bottle ($)</label>
                    <input className={`${inputClass} mt-1`} style={inputStyle}
                      type="number" step="0.01" value={logForm.cost_per_unit}
                      onChange={e => setLogForm(f => ({ ...f, cost_per_unit: e.target.value }))} />
                  </div>
                </div>
                <div>
                  <label className="text-xs text-gray-400 uppercase tracking-wide font-semibold">Date</label>
                  <input className={`${inputClass} mt-1`} style={inputStyle}
                    type="date" value={logForm.transaction_date}
                    onChange={e => setLogForm(f => ({ ...f, transaction_date: e.target.value }))} />
                </div>
                <div>
                  <label className="text-xs text-gray-400 uppercase tracking-wide font-semibold">Notes (optional)</label>
                  <input className={`${inputClass} mt-1`} style={inputStyle}
                    placeholder="e.g. weekly order" value={logForm.notes}
                    onChange={e => setLogForm(f => ({ ...f, notes: e.target.value }))} />
                </div>
              </div>
              {logError && <p className="text-sm text-red-400 rounded-lg px-3 py-2" style={{ background: "rgba(239,68,68,0.1)" }}>{logError}</p>}
              <div className="flex gap-3">
                <button onClick={() => setShowLogForm(false)}
                  className="flex-1 py-2.5 rounded-xl text-sm font-medium text-gray-400"
                  style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}>Cancel</button>
                <button onClick={saveLog} disabled={logSaving}
                  className="flex-1 py-2.5 rounded-xl text-sm font-bold disabled:opacity-50"
                  style={{ background: "#00d4a8", color: "#060b18" }}>
                  {logSaving ? "Saving…" : "Save Log"}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
