"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import PrintPDFButton from "@/app/components/PrintPDFButton";
import { createClient } from "@/lib/supabase/client";
import { useAuthGuard } from "@/lib/useAuthGuard";

/* ─── Types ─────────────────────────────────────────────────── */
interface Contact {
  id: string;
  category: Category;
  subcategory: string | null;
  provider_name: string | null;
  account_number: string | null;
  contact_name: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  contract_start: string | null;
  contract_end: string | null;
  monthly_amount: number | null;
  notes: string | null;
  is_active: boolean;
}

type Category = "utilities" | "insurance" | "pest_control" | "mortgage" | "rent" | "other";

/* ─── Config ─────────────────────────────────────────────────── */
const CATEGORIES: { key: Category; label: string; icon: string; color: string; bg: string; subcategories: string[] }[] = [
  {
    key: "utilities", label: "Utilities", icon: "⚡", color: "#d97706", bg: "#fffbeb",
    subcategories: ["Electric", "Gas", "Water", "Internet / WiFi", "Trash / Waste", "Sewer", "Phone / Landline", "Other Utility"],
  },
  {
    key: "insurance", label: "Insurance", icon: "🛡️", color: "#6366f1", bg: "#f5f3ff",
    subcategories: ["General Liability", "Workers Compensation", "Property Insurance", "Commercial Auto", "Umbrella Policy", "Health Insurance", "Other Insurance"],
  },
  {
    key: "pest_control", label: "Pest Control", icon: "🐛", color: "#16a34a", bg: "#f0fdf4",
    subcategories: ["Monthly Service", "Quarterly Service", "Annual Contract", "Emergency Service"],
  },
  {
    key: "mortgage", label: "Mortgage / Loan", icon: "🏦", color: "#0ea5e9", bg: "#f0f9ff",
    subcategories: ["Building Mortgage", "Equipment Loan", "SBA Loan", "Line of Credit", "Other Loan"],
  },
  {
    key: "rent", label: "Rent / Lease", icon: "🏠", color: "#e07b39", bg: "#fff7ed",
    subcategories: ["Store Rent", "Equipment Lease", "Parking Lot", "Storage Space", "Other Lease"],
  },
  {
    key: "other", label: "Other Services", icon: "🔧", color: "#374151", bg: "#f9fafb",
    subcategories: ["Security / Alarm", "HVAC Maintenance", "Elevator", "Fire Suppression", "Hood Cleaning", "Landscaping", "Snow Removal", "IT Support", "POS System", "Music License", "Health Permit", "Liquor License", "Other"],
  },
];

const EMPTY_FORM = {
  subcategory: "", provider_name: "", account_number: "",
  contact_name: "", phone: "", email: "", address: "",
  contract_start: "", contract_end: "",
  monthly_amount: "", notes: "",
};

const fmt = (n: number | null) =>
  n != null ? new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(n) : "—";

/* ─── Component ──────────────────────────────────────────────── */
export default function InfrastructurePage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const { ready, role, fullAccess } = useAuthGuard();

  // Restricted managers (no full_access) are not permitted to view infrastructure details
  useEffect(() => {
    if (ready && role === "manager" && !fullAccess) router.replace(`/location/${id}`);
  }, [ready, role, fullAccess, id, router]);

  const [locationName, setLocationName] = useState("");
  const [activeTab, setActiveTab] = useState<Category>("utilities");
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState({ ...EMPTY_FORM, subcategory: CATEGORIES[0].subcategories[0] });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);

  useEffect(() => {
    supabase.from("locations").select("name").eq("id", id).single()
      .then(({ data }) => setLocationName(data?.name ?? ""));
  }, [id]);

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase.from("infrastructure_contacts")
      .select("*").eq("location_id", id).order("category").order("provider_name");
    setContacts((data ?? []) as Contact[]);
    setLoading(false);
  }, [id, supabase]);

  useEffect(() => { load(); }, [load]);

  const catContacts = contacts.filter(c => c.category === activeTab);
  const catConfig = CATEGORIES.find(c => c.key === activeTab)!;

  const totalMonthly = contacts.filter(c => c.is_active).reduce((s, c) => s + (c.monthly_amount ?? 0), 0);

  const openAdd = () => {
    setEditId(null);
    setForm({ ...EMPTY_FORM, subcategory: catConfig.subcategories[0] });
    setError("");
    setShowForm(true);
  };

  const openEdit = (c: Contact) => {
    setEditId(c.id);
    setForm({
      subcategory:     c.subcategory    ?? "",
      provider_name:   c.provider_name  ?? "",
      account_number:  c.account_number ?? "",
      contact_name:    c.contact_name   ?? "",
      phone:           c.phone          ?? "",
      email:           c.email          ?? "",
      address:         c.address        ?? "",
      contract_start:  c.contract_start ?? "",
      contract_end:    c.contract_end   ?? "",
      monthly_amount:  c.monthly_amount != null ? String(c.monthly_amount) : "",
      notes:           c.notes          ?? "",
    });
    setError("");
    setShowForm(true);
  };

  const save = async () => {
    setError("");
    if (!form.provider_name.trim() && !form.subcategory.trim()) {
      setError("Enter at least a provider name or service type."); return;
    }
    setSaving(true);
    const payload = {
      location_id:    id,
      category:       activeTab,
      subcategory:    form.subcategory    || null,
      provider_name:  form.provider_name  || null,
      account_number: form.account_number || null,
      contact_name:   form.contact_name   || null,
      phone:          form.phone          || null,
      email:          form.email          || null,
      address:        form.address        || null,
      contract_start: form.contract_start || null,
      contract_end:   form.contract_end   || null,
      monthly_amount: form.monthly_amount ? parseFloat(form.monthly_amount) : null,
      notes:          form.notes          || null,
      updated_at:     new Date().toISOString(),
    };
    let err;
    if (editId) {
      ({ error: err } = await supabase.from("infrastructure_contacts").update(payload).eq("id", editId));
    } else {
      ({ error: err } = await supabase.from("infrastructure_contacts").insert(payload));
    }
    setSaving(false);
    if (err) { setError(err.message); return; }
    setShowForm(false); setEditId(null);
    await load();
  };

  const toggleActive = async (c: Contact) => {
    await supabase.from("infrastructure_contacts").update({ is_active: !c.is_active }).eq("id", c.id);
    setContacts(prev => prev.map(x => x.id === c.id ? { ...x, is_active: !x.is_active } : x));
  };

  const deleteContact = async (cId: string) => {
    if (!confirm("Delete this record?")) return;
    await supabase.from("infrastructure_contacts").delete().eq("id", cId);
    setContacts(prev => prev.filter(x => x.id !== cId));
    if (expandedId === cId) setExpandedId(null);
  };

  const inp = "w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-teal-400 bg-white";
  const lbl = "text-xs font-semibold text-gray-500 mb-1 block";

  // Contract expiry warning
  const today = new Date().toISOString().slice(0, 10);
  const expiringSoon = contacts.filter(c => {
    if (!c.contract_end || !c.is_active) return false;
    const diff = (new Date(c.contract_end).getTime() - new Date(today).getTime()) / 86400000;
    return diff >= 0 && diff <= 60;
  });

  if (!ready) return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: "#060b18" }}>
      <div className="w-8 h-8 border-2 border-teal-400 border-t-transparent rounded-full animate-spin" />
    </div>
  );

  return (
    <div className="min-h-screen" style={{ background: "#060b18" }}>
      {/* Nav */}
      <nav className="bg-white border-b border-gray-200 px-4 h-14 flex items-center gap-3 sticky top-0 z-10 shadow-sm">
        <Link href={`/location/${id}`} className="text-sm text-gray-500 hover:text-gray-900">←</Link>
        <span className="font-semibold text-gray-900">{locationName} — Infrastructure Details</span>
        <div className="ml-auto flex items-center gap-3">
          <span className="text-xs text-gray-400">Total Monthly: <strong className="text-gray-800">{fmt(totalMonthly)}</strong></span>
          <PrintPDFButton title={`Infrastructure-${locationName}`} />
        </div>
      </nav>

      <main className="max-w-5xl mx-auto px-4 py-6 space-y-5" id="print-area">

        {/* Expiry alerts */}
        {expiringSoon.length > 0 && (
          <div className="rounded-2xl p-4 space-y-2" style={{ background: "#fef2f2", border: "1px solid #fecaca" }}>
            <p className="text-sm font-bold text-red-700">⚠️ Contracts Expiring Soon</p>
            {expiringSoon.map(c => {
              const days = Math.ceil((new Date(c.contract_end!).getTime() - new Date(today).getTime()) / 86400000);
              return (
                <p key={c.id} className="text-xs text-red-600">
                  <strong>{c.provider_name ?? c.subcategory}</strong> ({CATEGORIES.find(cat => cat.key === c.category)?.label}) —
                  expires {c.contract_end} ({days === 0 ? "today" : `${days} days`})
                </p>
              );
            })}
          </div>
        )}

        {/* Summary strip */}
        <div className="grid grid-cols-3 sm:grid-cols-6 gap-3">
          {CATEGORIES.map(cat => {
            const catTotal = contacts.filter(c => c.category === cat.key && c.is_active)
              .reduce((s, c) => s + (c.monthly_amount ?? 0), 0);
            const count = contacts.filter(c => c.category === cat.key).length;
            return (
              <button key={cat.key} onClick={() => { setActiveTab(cat.key); setShowForm(false); }}
                className="rounded-2xl p-3 text-left transition-all hover:shadow-md"
                style={{
                  background: activeTab === cat.key ? cat.color : "white",
                  border: `2px solid ${activeTab === cat.key ? cat.color : "#e5e7eb"}`,
                  color: activeTab === cat.key ? "white" : "#374151",
                }}>
                <div className="text-lg mb-1">{cat.icon}</div>
                <p className="text-xs font-bold leading-tight">{cat.label}</p>
                <p className="text-xs mt-0.5" style={{ opacity: 0.8 }}>{count} record{count !== 1 ? "s" : ""}</p>
                {catTotal > 0 && <p className="text-xs font-semibold mt-1">{fmt(catTotal)}/mo</p>}
              </button>
            );
          })}
        </div>

        {/* Tab content */}
        <div className="bg-white rounded-2xl shadow-sm overflow-hidden" style={{ border: "1px solid rgba(255,255,255,0.08)" }}>
          {/* Tab header */}
          <div className="px-5 py-4 flex items-center justify-between"
            style={{ background: catConfig.bg, borderBottom: `2px solid ${catConfig.color}20` }}>
            <div>
              <h2 className="font-bold text-gray-900">{catConfig.icon} {catConfig.label}</h2>
              <p className="text-xs text-gray-400 mt-0.5">
                {catContacts.length} records · Monthly total:{" "}
                <strong style={{ color: catConfig.color }}>
                  {fmt(catContacts.filter(c => c.is_active).reduce((s, c) => s + (c.monthly_amount ?? 0), 0))}
                </strong>
              </p>
            </div>
            <button onClick={openAdd}
              className="px-4 py-2 rounded-xl text-sm font-bold text-white shadow-sm"
              style={{ background: `linear-gradient(135deg,${catConfig.color},${catConfig.color}cc)` }}>
              + Add Record
            </button>
          </div>

          {/* Add / Edit form */}
          {showForm && (
            <div className="px-5 py-5 border-b" style={{ background: "#fdfcfb", borderColor: "#f0e6d3" }}>
              <h3 className="font-bold text-gray-800 mb-4">{editId ? "Edit Record" : `New ${catConfig.label} Record`}</h3>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {/* Service Type */}
                <div>
                  <label className={lbl}>Service Type *</label>
                  <select value={form.subcategory} onChange={e => setForm(p => ({ ...p, subcategory: e.target.value }))} className={inp}>
                    {catConfig.subcategories.map(s => <option key={s}>{s}</option>)}
                  </select>
                </div>
                {/* Provider */}
                <div>
                  <label className={lbl}>Provider / Company</label>
                  <input type="text" placeholder="e.g. PSE&G, Allstate" value={form.provider_name}
                    onChange={e => setForm(p => ({ ...p, provider_name: e.target.value }))} className={inp} />
                </div>
                {/* Account # */}
                <div>
                  <label className={lbl}>Account / Policy #</label>
                  <input type="text" placeholder="Account number" value={form.account_number}
                    onChange={e => setForm(p => ({ ...p, account_number: e.target.value }))} className={inp} />
                </div>
                {/* Contact Name */}
                <div>
                  <label className={lbl}>Contact Person</label>
                  <input type="text" placeholder="Name" value={form.contact_name}
                    onChange={e => setForm(p => ({ ...p, contact_name: e.target.value }))} className={inp} />
                </div>
                {/* Phone */}
                <div>
                  <label className={lbl}>Phone Number</label>
                  <input type="tel" placeholder="+1 (xxx) xxx-xxxx" value={form.phone}
                    onChange={e => setForm(p => ({ ...p, phone: e.target.value }))} className={inp} />
                </div>
                {/* Email */}
                <div>
                  <label className={lbl}>Email</label>
                  <input type="email" placeholder="contact@provider.com" value={form.email}
                    onChange={e => setForm(p => ({ ...p, email: e.target.value }))} className={inp} />
                </div>
                {/* Monthly Amount */}
                <div>
                  <label className={lbl}>Monthly Amount ($)</label>
                  <input type="number" min="0" step="0.01" placeholder="0.00" value={form.monthly_amount}
                    onChange={e => setForm(p => ({ ...p, monthly_amount: e.target.value }))} className={inp} />
                </div>
                {/* Contract Start */}
                <div>
                  <label className={lbl}>Contract Start</label>
                  <input type="date" value={form.contract_start}
                    onChange={e => setForm(p => ({ ...p, contract_start: e.target.value }))} className={inp} />
                </div>
                {/* Contract End */}
                <div>
                  <label className={lbl}>Contract / Renewal Date</label>
                  <input type="date" value={form.contract_end}
                    onChange={e => setForm(p => ({ ...p, contract_end: e.target.value }))} className={inp} />
                </div>
                {/* Address */}
                <div className="col-span-2 sm:col-span-3">
                  <label className={lbl}>Address / Service Location</label>
                  <input type="text" placeholder="Street, City, State, ZIP" value={form.address}
                    onChange={e => setForm(p => ({ ...p, address: e.target.value }))} className={inp} />
                </div>
                {/* Notes */}
                <div className="col-span-2 sm:col-span-3">
                  <label className={lbl}>Notes / Additional Details</label>
                  <textarea rows={2} placeholder="Any important details, login info, instructions…"
                    value={form.notes} onChange={e => setForm(p => ({ ...p, notes: e.target.value }))}
                    className={inp + " resize-none"} />
                </div>
              </div>
              {error && <p className="text-red-500 text-xs mt-2 font-medium">⚠️ {error}</p>}
              <div className="flex gap-2 mt-4">
                <button onClick={save} disabled={saving}
                  className="px-5 py-2.5 rounded-xl text-sm font-bold text-white disabled:opacity-50"
                  style={{ background: `linear-gradient(135deg,#0d1f3c,${catConfig.color})` }}>
                  {saving ? "Saving…" : editId ? "Update Record" : "Save Record"}
                </button>
                <button onClick={() => { setShowForm(false); setEditId(null); }}
                  className="px-4 py-2.5 rounded-xl text-sm font-medium border border-gray-200 text-gray-600 hover:bg-gray-50">
                  Cancel
                </button>
              </div>
            </div>
          )}

          {/* Records list */}
          {loading ? (
            <div className="px-5 py-10 text-center text-gray-400 text-sm">Loading…</div>
          ) : catContacts.length === 0 ? (
            <div className="px-5 py-12 text-center">
              <p className="text-4xl mb-3">{catConfig.icon}</p>
              <p className="text-gray-400 text-sm">No {catConfig.label.toLowerCase()} records yet.</p>
              <button onClick={openAdd} className="mt-3 text-xs font-semibold underline" style={{ color: catConfig.color }}>
                Add your first record →
              </button>
            </div>
          ) : (
            <div className="divide-y divide-gray-50">
              {catContacts.map(c => {
                const isExpanded = expandedId === c.id;
                const expiring = c.contract_end && c.is_active &&
                  (new Date(c.contract_end).getTime() - new Date(today).getTime()) / 86400000 <= 60 &&
                  (new Date(c.contract_end).getTime() - new Date(today).getTime()) / 86400000 >= 0;

                return (
                  <div key={c.id}>
                    {/* Row */}
                    <div className={`px-5 py-4 flex items-start gap-4 cursor-pointer hover:bg-teal-950/30/20 transition-colors ${!c.is_active ? "opacity-50" : ""}`}
                      onClick={() => setExpandedId(isExpanded ? null : c.id)}>
                      {/* Left: service type badge */}
                      <div className="rounded-xl px-2.5 py-1 text-xs font-bold flex-shrink-0 mt-0.5"
                        style={{ background: catConfig.bg, color: catConfig.color, border: `1px solid ${catConfig.color}30` }}>
                        {c.subcategory ?? catConfig.label}
                      </div>

                      {/* Middle: main info */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="font-semibold text-gray-900 text-sm">{c.provider_name ?? "—"}</p>
                          {c.account_number && (
                            <span className="text-xs text-gray-400 font-mono bg-gray-100 rounded px-1.5 py-0.5">
                              Acct# {c.account_number}
                            </span>
                          )}
                          {expiring && (
                            <span className="text-[10px] font-bold bg-red-100 text-red-600 rounded-full px-2 py-0.5">
                              ⚠️ Expiring Soon
                            </span>
                          )}
                          {!c.is_active && (
                            <span className="text-[10px] font-bold bg-gray-100 text-gray-400 rounded-full px-2 py-0.5">Inactive</span>
                          )}
                        </div>
                        <div className="flex items-center gap-4 mt-1 flex-wrap">
                          {c.contact_name && <span className="text-xs text-gray-500">👤 {c.contact_name}</span>}
                          {c.phone && (
                            <a href={`tel:${c.phone}`} onClick={e => e.stopPropagation()}
                              className="text-xs font-semibold hover:underline" style={{ color: catConfig.color }}>
                              📞 {c.phone}
                            </a>
                          )}
                          {c.monthly_amount != null && (
                            <span className="text-xs font-bold text-gray-700">{fmt(c.monthly_amount)}/mo</span>
                          )}
                        </div>
                      </div>

                      {/* Right: actions */}
                      <div className="flex items-center gap-1 flex-shrink-0" onClick={e => e.stopPropagation()}>
                        <button onClick={() => openEdit(c)}
                          className="text-xs px-2 py-1 rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-50">
                          Edit
                        </button>
                        <button onClick={() => toggleActive(c)}
                          className="text-xs px-2 py-1 rounded-lg border font-semibold"
                          style={c.is_active
                            ? { background:"#f0fdf4", color:"#16a34a", borderColor:"#bbf7d0" }
                            : { background:"#f9fafb", color:"#9ca3af", borderColor:"#e5e7eb" }}>
                          {c.is_active ? "Active" : "Inactive"}
                        </button>
                        <button onClick={() => deleteContact(c.id)}
                          className="text-gray-300 hover:text-red-500 ml-1 text-xl leading-none font-light" title="Delete">×</button>
                      </div>
                    </div>

                    {/* Expanded detail */}
                    {isExpanded && (
                      <div className="px-5 pb-5 pt-2 grid grid-cols-2 sm:grid-cols-4 gap-3"
                        style={{ background: catConfig.bg, borderTop: `1px solid ${catConfig.color}15` }}>
                        {[
                          { label:"Account / Policy #", val: c.account_number },
                          { label:"Contact Person",      val: c.contact_name   },
                          { label:"Phone",               val: c.phone ? <a href={`tel:${c.phone}`} className="font-semibold hover:underline" style={{color:catConfig.color}}>{c.phone}</a> : null },
                          { label:"Email",               val: c.email ? <a href={`mailto:${c.email}`} className="font-semibold hover:underline" style={{color:catConfig.color}}>{c.email}</a> : null },
                          { label:"Monthly Amount",      val: fmt(c.monthly_amount) },
                          { label:"Contract Start",      val: c.contract_start },
                          { label:"Contract / Renewal",  val: c.contract_end   },
                          { label:"Address",             val: c.address, wide: true },
                          { label:"Notes",               val: c.notes, wide: true },
                        ].map((row, i) => row.val ? (
                          <div key={i} className={row.wide ? "col-span-2 sm:col-span-4" : ""}>
                            <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">{row.label}</p>
                            <p className="text-sm text-gray-800 mt-0.5">{row.val as any}</p>
                          </div>
                        ) : null)}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* All-records reference table (print-friendly) */}
        {contacts.length > 0 && (
          <div className="bg-white rounded-2xl shadow-sm overflow-hidden print-section" style={{ border: "1px solid rgba(255,255,255,0.08)" }}>
            <div className="px-5 py-3 flex items-center justify-between" style={{ background:"#fdf8f2", borderBottom:"1px solid #f0e6d3" }}>
              <h3 className="font-bold text-gray-900">Complete Infrastructure Directory</h3>
              <span className="text-xs text-gray-400">{contacts.filter(c=>c.is_active).length} active records · {fmt(totalMonthly)}/mo total</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead style={{ background:"rgba(0,212,168,0.05)" }}>
                  <tr>
                    <th className="px-4 py-2.5 text-left font-semibold text-gray-500">Category</th>
                    <th className="px-3 py-2.5 text-left font-semibold text-gray-500">Service</th>
                    <th className="px-3 py-2.5 text-left font-semibold text-gray-500">Provider</th>
                    <th className="px-3 py-2.5 text-left font-semibold text-gray-500">Acct #</th>
                    <th className="px-3 py-2.5 text-left font-semibold text-gray-500">Contact</th>
                    <th className="px-3 py-2.5 text-left font-semibold text-gray-500">📞 Phone</th>
                    <th className="px-3 py-2.5 text-right font-semibold text-gray-500">Monthly</th>
                    <th className="px-3 py-2.5 text-left font-semibold text-gray-500">Renewal</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {contacts.map(c => {
                    const cat = CATEGORIES.find(x => x.key === c.category)!;
                    return (
                      <tr key={c.id} className={`hover:bg-teal-950/30/20 ${!c.is_active ? "opacity-40" : ""}`}>
                        <td className="px-4 py-2.5">
                          <span className="flex items-center gap-1">
                            <span>{cat.icon}</span>
                            <span className="text-gray-600">{cat.label}</span>
                          </span>
                        </td>
                        <td className="px-3 py-2.5 text-gray-700 font-medium">{c.subcategory ?? "—"}</td>
                        <td className="px-3 py-2.5 text-gray-800 font-semibold">{c.provider_name ?? "—"}</td>
                        <td className="px-3 py-2.5 font-mono text-gray-500">{c.account_number ?? "—"}</td>
                        <td className="px-3 py-2.5 text-gray-600">{c.contact_name ?? "—"}</td>
                        <td className="px-3 py-2.5">
                          {c.phone
                            ? <a href={`tel:${c.phone}`} className="font-semibold hover:underline" style={{color:cat.color}}>{c.phone}</a>
                            : <span className="text-gray-300">—</span>}
                        </td>
                        <td className="px-3 py-2.5 text-right font-semibold text-gray-800">{fmt(c.monthly_amount)}</td>
                        <td className="px-3 py-2.5 text-gray-500">{c.contract_end ?? "—"}</td>
                      </tr>
                    );
                  })}
                  <tr className="font-bold" style={{ background:"rgba(0,212,168,0.05)" }}>
                    <td colSpan={6} className="px-4 py-2.5 text-gray-700 text-right">Total Monthly Cost</td>
                    <td className="px-3 py-2.5 text-right" style={{ color:"#00d4a8" }}>{fmt(totalMonthly)}</td>
                    <td />
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
