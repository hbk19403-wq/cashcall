"use client";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

const AVG_KITCHEN_WAGE = 18; // $/hr — used for labor cost per plate calc

interface MenuItem {
  id: string;
  name: string;
  food_cost: number;
  cook_time_minutes: number;
  selling_price: number;
  is_popular: boolean;
}

interface DishForm {
  name: string;
  food_cost: string;
  cook_time_minutes: string;
  selling_price: string;
  is_popular: boolean;
}

const fmtUSD = (n: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2 }).format(n);

function calcMetrics(item: MenuItem) {
  const laborCost = (item.cook_time_minutes / 60) * AVG_KITCHEN_WAGE;
  const totalCost = item.food_cost + laborCost;
  const recommendedPrice = item.food_cost / 0.28; // target 28% food cost
  const actualFoodPct = item.selling_price > 0 ? (item.food_cost / item.selling_price) * 100 : null;
  const margin = item.selling_price > 0 ? item.selling_price - totalCost : null;
  const marginPct = item.selling_price > 0 ? ((item.selling_price - totalCost) / item.selling_price) * 100 : null;
  return { laborCost, totalCost, recommendedPrice, actualFoodPct, margin, marginPct };
}

function bcgCategory(item: MenuItem): { label: string; color: string; bg: string; desc: string } {
  const { marginPct } = calcMetrics(item);
  const highMargin = marginPct !== null ? marginPct > 60 : false;
  const popular = item.is_popular;

  if (highMargin && popular) return { label: "⭐ Star", color: "#00d4a8", bg: "rgba(0,212,168,0.12)", desc: "High margin + popular — keep & promote" };
  if (!highMargin && popular) return { label: "🐴 Plowhorse", color: "#fbbf24", bg: "rgba(251,191,36,0.1)", desc: "Popular but low margin — optimize or raise price" };
  if (highMargin && !popular) return { label: "❓ Puzzle", color: "#818cf8", bg: "rgba(129,140,248,0.1)", desc: "High margin but slow — needs marketing" };
  return { label: "🐕 Dog", color: "#f87171", bg: "rgba(248,113,113,0.1)", desc: "Low margin + slow — consider removing" };
}

export default function MenuEngineeringPage() {
  const { id } = useParams<{ id: string }>();
  const supabase = createClient();

  const [items, setItems] = useState<MenuItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editItem, setEditItem] = useState<MenuItem | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [locationName, setLocationName] = useState("");
  const [form, setForm] = useState<DishForm>({
    name: "", food_cost: "", cook_time_minutes: "", selling_price: "", is_popular: false,
  });
  const [formError, setFormError] = useState("");

  useEffect(() => {
    loadData();
  }, [id]);

  async function loadData() {
    setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const [{ data: loc }, { data: menu }] = await Promise.all([
      supabase.from("locations").select("name").eq("id", id).single(),
      supabase.from("menu_items").select("*").eq("location_id", id).order("name"),
    ]);
    if (loc) setLocationName(loc.name);
    setItems(menu || []);
    setLoading(false);
  }

  function openAddForm() {
    setEditItem(null);
    setForm({ name: "", food_cost: "", cook_time_minutes: "", selling_price: "", is_popular: false });
    setFormError("");
    setShowForm(true);
  }

  function openEditForm(item: MenuItem) {
    setEditItem(item);
    setForm({
      name: item.name,
      food_cost: String(item.food_cost),
      cook_time_minutes: String(item.cook_time_minutes),
      selling_price: String(item.selling_price),
      is_popular: item.is_popular,
    });
    setFormError("");
    setShowForm(true);
  }

  async function saveItem() {
    if (!form.name.trim()) { setFormError("Dish name is required."); return; }
    const foodCost = parseFloat(form.food_cost) || 0;
    const cookTime = parseInt(form.cook_time_minutes) || 0;
    const sellPrice = parseFloat(form.selling_price) || 0;
    setSaving(true);
    setFormError("");
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setSaving(false); return; }
    const payload = {
      location_id: id, user_id: user.id,
      name: form.name.trim(),
      food_cost: foodCost,
      cook_time_minutes: cookTime,
      selling_price: sellPrice,
      is_popular: form.is_popular,
    };
    let err;
    if (editItem) {
      ({ error: err } = await supabase.from("menu_items").update(payload).eq("id", editItem.id));
    } else {
      ({ error: err } = await supabase.from("menu_items").insert(payload));
    }
    setSaving(false);
    if (err) { setFormError(err.message); return; }
    setShowForm(false);
    loadData();
  }

  async function deleteItem(itemId: string) {
    setDeleting(itemId);
    await supabase.from("menu_items").delete().eq("id", itemId);
    setDeleting(null);
    loadData();
  }

  const stars = items.filter(i => { const { marginPct } = calcMetrics(i); return (marginPct ?? 0) > 60 && i.is_popular; });
  const plowhorses = items.filter(i => { const { marginPct } = calcMetrics(i); return (marginPct ?? 0) <= 60 && i.is_popular; });
  const puzzles = items.filter(i => { const { marginPct } = calcMetrics(i); return (marginPct ?? 0) > 60 && !i.is_popular; });
  const dogs = items.filter(i => { const { marginPct } = calcMetrics(i); return (marginPct ?? 0) <= 60 && !i.is_popular; });

  const inputClass = "w-full rounded-xl px-4 py-2.5 text-sm text-white outline-none focus:ring-2 focus:ring-teal-500/40";
  const inputStyle = { background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)" };

  return (
    <div className="min-h-screen" style={{ background: "#060b18" }}>
      <div className="max-w-5xl mx-auto px-4 py-8 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <Link href={`/location/${id}`} className="text-xs text-teal-400 hover:underline">← {locationName}</Link>
            <h1 className="text-2xl font-bold text-white mt-1">🧮 Menu Engineering</h1>
            <p className="text-gray-400 text-sm mt-0.5">Food cost %, labor per plate, recommended pricing</p>
          </div>
          <button onClick={openAddForm}
            className="px-4 py-2 rounded-xl text-sm font-bold transition-all"
            style={{ background: "#00d4a8", color: "#060b18" }}>
            + Add Dish
          </button>
        </div>

        {loading && (
          <div className="text-center py-16 text-gray-400">Loading menu…</div>
        )}

        {!loading && items.length === 0 && (
          <div className="rounded-2xl p-12 text-center" style={{ background: "rgba(255,255,255,0.03)", border: "1px dashed rgba(255,255,255,0.1)" }}>
            <div className="text-4xl mb-3">🍽️</div>
            <h3 className="text-white font-semibold text-lg">No dishes yet</h3>
            <p className="text-gray-400 text-sm mt-1 mb-4">Add your menu items to see cost analysis and BCG matrix</p>
            <button onClick={openAddForm}
              className="px-6 py-2.5 rounded-xl text-sm font-bold"
              style={{ background: "#00d4a8", color: "#060b18" }}>
              + Add First Dish
            </button>
          </div>
        )}

        {!loading && items.length > 0 && (
          <>
            {/* Summary row */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {[
                { label: "Total Dishes", value: items.length, color: "#00d4a8" },
                { label: "Avg Food Cost %", value: (() => {
                  const withPrice = items.filter(i => i.selling_price > 0);
                  if (!withPrice.length) return "—";
                  const avg = withPrice.reduce((s, i) => s + (i.food_cost / i.selling_price) * 100, 0) / withPrice.length;
                  return avg.toFixed(1) + "%";
                })(), color: "#fbbf24" },
                { label: "Avg Margin", value: (() => {
                  const withPrice = items.filter(i => i.selling_price > 0);
                  if (!withPrice.length) return "—";
                  const avg = withPrice.reduce((s, i) => {
                    const { marginPct } = calcMetrics(i);
                    return s + (marginPct ?? 0);
                  }, 0) / withPrice.length;
                  return avg.toFixed(1) + "%";
                })(), color: "#818cf8" },
                { label: "Stars", value: stars.length, color: "#00d4a8" },
              ].map(stat => (
                <div key={stat.label} className="rounded-xl p-4 text-center" style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}>
                  <div className="text-2xl font-bold" style={{ color: stat.color }}>{stat.value}</div>
                  <div className="text-xs text-gray-400 mt-0.5">{stat.label}</div>
                </div>
              ))}
            </div>

            {/* BCG Matrix */}
            <div className="rounded-2xl p-5" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)" }}>
              <h2 className="text-sm font-bold text-white mb-4 uppercase tracking-wider">📊 Menu Matrix</h2>
              <div className="grid grid-cols-2 gap-3">
                {[
                  { title: "⭐ Stars", items: stars, color: "#00d4a8", bg: "rgba(0,212,168,0.08)", desc: "High margin · Popular" },
                  { title: "❓ Puzzles", items: puzzles, color: "#818cf8", bg: "rgba(129,140,248,0.08)", desc: "High margin · Slow mover" },
                  { title: "🐴 Plowhorses", items: plowhorses, color: "#fbbf24", bg: "rgba(251,191,36,0.08)", desc: "Popular · Low margin" },
                  { title: "🐕 Dogs", items: dogs, color: "#f87171", bg: "rgba(248,113,113,0.08)", desc: "Slow · Low margin" },
                ].map(quad => (
                  <div key={quad.title} className="rounded-xl p-4 min-h-[100px]" style={{ background: quad.bg, border: `1px solid ${quad.color}30` }}>
                    <div className="text-sm font-bold mb-0.5" style={{ color: quad.color }}>{quad.title}</div>
                    <div className="text-xs text-gray-500 mb-3">{quad.desc}</div>
                    {quad.items.length === 0
                      ? <span className="text-xs text-gray-600 italic">None</span>
                      : quad.items.map(i => (
                        <div key={i.id} className="text-xs text-gray-300 py-0.5 truncate">{i.name}</div>
                      ))}
                  </div>
                ))}
              </div>
              <p className="text-xs text-gray-600 mt-3">Matrix based on margin % and popularity tag. Toggle "popular" on each dish to place it correctly.</p>
            </div>

            {/* Dish table */}
            <div className="rounded-2xl overflow-hidden" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)" }}>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr style={{ borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
                      {["Dish", "Food Cost", "Labor Cost", "Total Cost", "Sell Price", "Food Cost %", "Margin", "Category", ""].map(h => (
                        <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider whitespace-nowrap">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((item, idx) => {
                      const { laborCost, totalCost, recommendedPrice, actualFoodPct, margin, marginPct } = calcMetrics(item);
                      const cat = bcgCategory(item);
                      return (
                        <tr key={item.id} style={{ borderBottom: idx < items.length - 1 ? "1px solid rgba(255,255,255,0.05)" : "none" }}>
                          <td className="px-4 py-3 font-medium text-white">{item.name}</td>
                          <td className="px-4 py-3 text-gray-300">{fmtUSD(item.food_cost)}</td>
                          <td className="px-4 py-3 text-gray-300">{fmtUSD(laborCost)}</td>
                          <td className="px-4 py-3 text-gray-300">{fmtUSD(totalCost)}</td>
                          <td className="px-4 py-3">
                            {item.selling_price > 0
                              ? <span className="text-white">{fmtUSD(item.selling_price)}</span>
                              : <span className="text-xs text-teal-400">Rec: {fmtUSD(recommendedPrice)}</span>}
                          </td>
                          <td className="px-4 py-3">
                            {actualFoodPct !== null
                              ? <span style={{ color: actualFoodPct > 32 ? "#f87171" : "#00d4a8" }}>{actualFoodPct.toFixed(1)}%</span>
                              : <span className="text-gray-600">—</span>}
                          </td>
                          <td className="px-4 py-3">
                            {marginPct !== null
                              ? <span style={{ color: marginPct > 60 ? "#00d4a8" : "#fbbf24" }}>{marginPct.toFixed(1)}%</span>
                              : <span className="text-gray-600">—</span>}
                          </td>
                          <td className="px-4 py-3">
                            <span className="text-xs rounded-full px-2 py-0.5 font-medium" style={{ background: cat.bg, color: cat.color }}>{cat.label}</span>
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex gap-2">
                              <button onClick={() => openEditForm(item)} className="text-xs text-gray-400 hover:text-white">Edit</button>
                              <button onClick={() => deleteItem(item.id)} disabled={deleting === item.id}
                                className="text-xs text-red-400 hover:text-red-300 disabled:opacity-40">
                                {deleting === item.id ? "…" : "Del"}
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}

        {/* Add/Edit modal */}
        {showForm && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,0.7)" }}>
            <div className="w-full max-w-md rounded-2xl p-6 space-y-4" style={{ background: "#0d1626", border: "1px solid rgba(255,255,255,0.1)" }}>
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-bold text-white">{editItem ? "Edit Dish" : "Add Dish"}</h2>
                <button onClick={() => setShowForm(false)} className="text-gray-400 hover:text-white text-xl">✕</button>
              </div>

              <div className="space-y-3">
                <div>
                  <label className="text-xs text-gray-400 uppercase tracking-wide font-semibold">Dish Name *</label>
                  <input className={`${inputClass} mt-1`} style={inputStyle}
                    placeholder="e.g. Grilled Salmon" value={form.name}
                    onChange={e => setForm(f => ({ ...f, name: e.target.value }))} autoFocus />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs text-gray-400 uppercase tracking-wide font-semibold">Food Cost ($)</label>
                    <input className={`${inputClass} mt-1`} style={inputStyle}
                      type="number" step="0.01" min="0" placeholder="e.g. 6.50"
                      value={form.food_cost} onChange={e => setForm(f => ({ ...f, food_cost: e.target.value }))} />
                  </div>
                  <div>
                    <label className="text-xs text-gray-400 uppercase tracking-wide font-semibold">Cook Time (min)</label>
                    <input className={`${inputClass} mt-1`} style={inputStyle}
                      type="number" step="1" min="0" placeholder="e.g. 15"
                      value={form.cook_time_minutes} onChange={e => setForm(f => ({ ...f, cook_time_minutes: e.target.value }))} />
                  </div>
                </div>
                <div>
                  <label className="text-xs text-gray-400 uppercase tracking-wide font-semibold">Selling Price ($) <span className="text-gray-600 normal-case font-normal">(leave blank for recommendation)</span></label>
                  <input className={`${inputClass} mt-1`} style={inputStyle}
                    type="number" step="0.01" min="0" placeholder="e.g. 24.00"
                    value={form.selling_price} onChange={e => setForm(f => ({ ...f, selling_price: e.target.value }))} />
                </div>
                <button type="button"
                  onClick={() => setForm(f => ({ ...f, is_popular: !f.is_popular }))}
                  className="w-full rounded-xl px-4 py-3 text-sm font-semibold text-left flex items-center gap-3 transition-all"
                  style={form.is_popular
                    ? { background: "rgba(0,212,168,0.1)", border: "2px solid #00d4a8", color: "#00d4a8" }
                    : { background: "rgba(255,255,255,0.04)", border: "2px solid rgba(255,255,255,0.1)", color: "#94a3b8" }}>
                  <span className="text-lg">{form.is_popular ? "⭐" : "☆"}</span>
                  <span>Popular item <span className="font-normal text-xs">(customers order it often)</span></span>
                </button>

                {form.food_cost && (
                  <div className="rounded-xl p-3 text-xs space-y-1" style={{ background: "rgba(0,212,168,0.05)", border: "1px solid rgba(0,212,168,0.15)" }}>
                    <div className="font-semibold text-teal-400 mb-1.5">Live Preview</div>
                    <div className="flex justify-between text-gray-400">
                      <span>Labor cost ({form.cook_time_minutes || 0}min × ${AVG_KITCHEN_WAGE}/hr):</span>
                      <span className="text-white">{fmtUSD((parseInt(form.cook_time_minutes || "0") / 60) * AVG_KITCHEN_WAGE)}</span>
                    </div>
                    <div className="flex justify-between text-gray-400">
                      <span>Recommended sell price (28% food cost):</span>
                      <span className="text-teal-400 font-semibold">{fmtUSD(parseFloat(form.food_cost || "0") / 0.28)}</span>
                    </div>
                    {form.selling_price && parseFloat(form.selling_price) > 0 && (
                      <div className="flex justify-between text-gray-400">
                        <span>Your food cost %:</span>
                        <span style={{ color: (parseFloat(form.food_cost || "0") / parseFloat(form.selling_price)) * 100 > 32 ? "#f87171" : "#00d4a8" }}>
                          {((parseFloat(form.food_cost || "0") / parseFloat(form.selling_price)) * 100).toFixed(1)}%
                        </span>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {formError && <p className="text-sm text-red-400 rounded-lg px-3 py-2" style={{ background: "rgba(239,68,68,0.1)" }}>{formError}</p>}

              <div className="flex gap-3">
                <button onClick={() => setShowForm(false)}
                  className="flex-1 py-2.5 rounded-xl text-sm font-medium text-gray-400"
                  style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}>
                  Cancel
                </button>
                <button onClick={saveItem} disabled={saving}
                  className="flex-1 py-2.5 rounded-xl text-sm font-bold disabled:opacity-50"
                  style={{ background: "#00d4a8", color: "#060b18" }}>
                  {saving ? "Saving…" : editItem ? "Save Changes" : "Add Dish"}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
