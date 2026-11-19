"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

const US_STATES = [
  "AL","AK","AZ","AR","CA","CO","CT","DE","FL","GA","HI","ID","IL","IN","IA",
  "KS","KY","LA","ME","MD","MA","MI","MN","MS","MO","MT","NE","NV","NH","NJ",
  "NM","NY","NC","ND","OH","OK","OR","PA","RI","SC","SD","TN","TX","UT","VT",
  "VA","WA","WV","WI","WY","DC",
];

export default function NewLocationPage() {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [form, setForm] = useState({ name: "", state: "", tax_rate: "", address: "" });

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!form.name.trim()) { setError("Restaurant name is required."); return; }
    if (!form.state) { setError("Please select a state."); return; }

    setSaving(true);
    try {
      const res = await fetch("/api/locations/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, tax_rate: String(parseFloat(form.tax_rate || "0") / 100) }),
      });
      const data = await res.json();
      if (data.ok) router.push("/dashboard");
      else setError(data.error || "Failed to create location.");
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  const inputClass = "w-full rounded-xl px-4 py-3 text-sm text-white outline-none transition-all focus:ring-2 focus:ring-teal-500/40";
  const inputStyle = { background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)" };

  return (
    <div className="min-h-screen" style={{ background: "#060b18" }}>
      <header className="sticky top-0 z-50 border-b"
        style={{ background: "rgba(6,11,24,0.96)", borderColor: "rgba(0,212,168,0.15)", backdropFilter: "blur(12px)" }}>
        <div className="max-w-7xl mx-auto px-4 h-14 flex items-center gap-3">
          <Link href="/dashboard" className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center font-bold text-xs"
              style={{ background: "linear-gradient(135deg,#00b896,#00d4a8)", color: "#060b18" }}>CC</div>
            <span className="text-white font-bold text-sm hidden sm:block">CashCall</span>
          </Link>
          <div className="flex-1" />
          <Link href="/dashboard" className="text-sm text-gray-400 hover:text-white transition-colors">← Dashboard</Link>
        </div>
      </header>
      <main className="max-w-lg mx-auto px-4 py-10">
        <div className="flex items-center gap-3 mb-8">
          <Link href="/dashboard" className="text-gray-500 hover:text-white transition-colors text-sm">← Dashboard</Link>
          <span className="text-gray-700">/</span>
          <span className="text-gray-400 text-sm">Add Location</span>
        </div>

        <div className="mb-8">
          <h1 className="text-2xl font-bold text-white">Add a new location</h1>
          <p className="text-gray-400 text-sm mt-1">Each location gets its own P&L dashboard, food cost tracking, and labor reports.</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="rounded-2xl p-6 space-y-5"
            style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)" }}>

            <div>
              <label className="block text-xs font-semibold text-gray-400 mb-1.5 uppercase tracking-wide">Restaurant name *</label>
              <input className={inputClass} style={inputStyle} placeholder="e.g. The Spice House — Downtown"
                value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} autoFocus />
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-400 mb-1.5 uppercase tracking-wide">Address (optional)</label>
              <input className={inputClass} style={inputStyle} placeholder="123 Main St, City"
                value={form.address} onChange={e => setForm(f => ({ ...f, address: e.target.value }))} />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-gray-400 mb-1.5 uppercase tracking-wide">State *</label>
                <select className={inputClass} style={{ ...inputStyle, appearance: "none" } as React.CSSProperties}
                  value={form.state} onChange={e => setForm(f => ({ ...f, state: e.target.value }))}>
                  <option value="">Select…</option>
                  {US_STATES.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-400 mb-1.5 uppercase tracking-wide">Sales tax %</label>
                <input className={inputClass} style={inputStyle} type="number" step="0.1" min="0" max="20"
                  placeholder="e.g. 8.25" value={form.tax_rate} onChange={e => setForm(f => ({ ...f, tax_rate: e.target.value }))} />
              </div>
            </div>

            {error && (
              <p className="text-sm rounded-lg px-3 py-2"
                style={{ color: "#f87171", background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.2)" }}>
                {error}
              </p>
            )}
          </div>

          <div className="flex gap-3">
            <Link href="/dashboard"
              className="px-5 py-3 rounded-xl text-sm font-medium text-gray-400 transition-colors hover:text-white"
              style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}>
              Cancel
            </Link>
            <button type="submit" disabled={saving}
              className="flex-1 py-3 rounded-xl text-sm font-bold transition-all hover:opacity-90 disabled:opacity-50"
              style={{ background: "#00d4a8", color: "#060b18" }}>
              {saving ? "Creating location…" : "Create Location →"}
            </button>
          </div>
        </form>
      </main>
    </div>
  );
}
