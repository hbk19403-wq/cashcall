"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import Link from "next/link";

interface Location { id: string; name: string; }
interface VendorContact {
  id: string;
  vendor_name: string;
  rep_name?: string;
  rep_email: string;
  account_number?: string;
  notes?: string;
}

const TEAL = "#00d4a8";
const card = { background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 16 };
const input = {
  background: "#1a1a2e", border: "1px solid rgba(255,255,255,0.12)", color: "#e5e7eb",
  borderRadius: 8, padding: "9px 12px", fontSize: 14, width: "100%", boxSizing: "border-box" as const,
};

const KNOWN_VENDORS = ["Sysco", "US Foods", "PFG", "GFS", "Restaurant Depot", "Reinhart", "Dot Foods", "Other"];

export default function VendorsPage() {
  const supabase = createClient();
  const [locations, setLocations] = useState<Location[]>([]);
  const [locationId, setLocationId] = useState("");
  const [vendors, setVendors] = useState<VendorContact[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState({
    vendor_name: "", rep_name: "", rep_email: "", account_number: "", notes: "", custom_vendor: "",
  });
  const [saveMsg, setSaveMsg] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data } = await supabase.from("locations").select("id,name").eq("user_id", user.id).order("name");
      if (data?.length) { setLocations(data); setLocationId(data[0].id); }
    })();
  }, []);

  useEffect(() => {
    if (!locationId) return;
    setLoading(true);
    fetch(`/api/ordering/vendors?locationId=${locationId}`)
      .then(r => r.json())
      .then(json => setVendors(json.vendors ?? []))
      .finally(() => setLoading(false));
  }, [locationId]);

  const startEdit = (v: VendorContact) => {
    setEditId(v.id);
    setForm({
      vendor_name: v.vendor_name,
      rep_name: v.rep_name ?? "",
      rep_email: v.rep_email,
      account_number: v.account_number ?? "",
      notes: v.notes ?? "",
      custom_vendor: KNOWN_VENDORS.includes(v.vendor_name) ? "" : v.vendor_name,
    });
    setShowForm(true);
  };

  const startNew = () => {
    setEditId(null);
    setForm({ vendor_name: "", rep_name: "", rep_email: "", account_number: "", notes: "", custom_vendor: "" });
    setShowForm(true);
    setSaveMsg(null);
  };

  const handleSave = async () => {
    const vendorName = form.vendor_name === "Other" ? form.custom_vendor.trim() : form.vendor_name;
    if (!vendorName || !form.rep_email || !locationId) {
      setSaveMsg({ ok: false, text: "Vendor name and rep email are required." });
      return;
    }
    setSaving(true);
    setSaveMsg(null);
    const res = await fetch("/api/ordering/vendors", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        location_id: locationId,
        vendor_name: vendorName,
        rep_name: form.rep_name || null,
        rep_email: form.rep_email,
        account_number: form.account_number || null,
        notes: form.notes || null,
      }),
    });
    const json = await res.json();
    setSaving(false);
    if (res.ok) {
      setSaveMsg({ ok: true, text: `${vendorName} saved.` });
      setShowForm(false);
      // Refresh list
      const refreshed = await fetch(`/api/ordering/vendors?locationId=${locationId}`);
      const data = await refreshed.json();
      setVendors(data.vendors ?? []);
    } else {
      setSaveMsg({ ok: false, text: json.error ?? "Failed to save." });
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Remove this vendor contact?")) return;
    setDeleting(id);
    await fetch(`/api/ordering/vendors?id=${id}`, { method: "DELETE" });
    setVendors(prev => prev.filter(v => v.id !== id));
    setDeleting(null);
  };

  return (
    <div style={{ minHeight: "100vh", background: "#0a0a0f", color: "#e5e7eb" }}>
      <div style={{ maxWidth: 720, margin: "0 auto", padding: "32px 16px" }}>

        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 8 }}>
          <Link href="/dashboard/ordering" style={{ color: "#6b7280", textDecoration: "none", fontSize: 14 }}>
            ← Back to Ordering
          </Link>
        </div>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24 }}>
          <div>
            <h1 style={{ fontSize: 24, fontWeight: 700, margin: 0 }}>Vendor Contacts</h1>
            <p style={{ color: "#6b7280", fontSize: 14, marginTop: 4 }}>
              Add your vendor reps so CashCall can send orders on your behalf.
            </p>
          </div>
          <button onClick={startNew}
            style={{ background: TEAL, color: "#0a0a0f", border: "none", borderRadius: 8, padding: "9px 16px", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
            + Add Vendor
          </button>
        </div>

        {/* Location picker */}
        {locations.length > 1 && (
          <div style={{ marginBottom: 20 }}>
            <select value={locationId} onChange={e => setLocationId(e.target.value)}
              style={{ ...input, width: "auto" }}>
              {locations.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
            </select>
          </div>
        )}

        {/* Add / Edit form */}
        {showForm && (
          <div style={{ ...card, padding: 24, marginBottom: 24 }}>
            <h3 style={{ margin: "0 0 16px", fontSize: 15, fontWeight: 600 }}>
              {editId ? "Edit Vendor Contact" : "New Vendor Contact"}
            </h3>
            <div style={{ display: "grid", gap: 12 }}>
              <div>
                <label style={{ fontSize: 12, color: "#9ca3af", display: "block", marginBottom: 4 }}>Vendor *</label>
                <select value={form.vendor_name} onChange={e => setForm(f => ({ ...f, vendor_name: e.target.value }))} style={input}>
                  <option value="">Select vendor…</option>
                  {KNOWN_VENDORS.map(v => <option key={v} value={v}>{v}</option>)}
                </select>
                {form.vendor_name === "Other" && (
                  <input style={{ ...input, marginTop: 8 }} placeholder="Vendor name"
                    value={form.custom_vendor} onChange={e => setForm(f => ({ ...f, custom_vendor: e.target.value }))} />
                )}
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <div>
                  <label style={{ fontSize: 12, color: "#9ca3af", display: "block", marginBottom: 4 }}>Rep Name</label>
                  <input style={input} placeholder="e.g. John Smith"
                    value={form.rep_name} onChange={e => setForm(f => ({ ...f, rep_name: e.target.value }))} />
                </div>
                <div>
                  <label style={{ fontSize: 12, color: "#9ca3af", display: "block", marginBottom: 4 }}>Rep Email *</label>
                  <input type="email" style={input} placeholder="rep@sysco.com"
                    value={form.rep_email} onChange={e => setForm(f => ({ ...f, rep_email: e.target.value }))} />
                </div>
              </div>

              <div>
                <label style={{ fontSize: 12, color: "#9ca3af", display: "block", marginBottom: 4 }}>Your Account # (optional)</label>
                <input style={input} placeholder="e.g. 1234567"
                  value={form.account_number} onChange={e => setForm(f => ({ ...f, account_number: e.target.value }))} />
              </div>

              <div>
                <label style={{ fontSize: 12, color: "#9ca3af", display: "block", marginBottom: 4 }}>Notes (optional)</label>
                <input style={input} placeholder="e.g. Delivery on Tues/Thurs only"
                  value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} />
              </div>

              {saveMsg && (
                <div style={{
                  padding: "9px 12px", borderRadius: 8, fontSize: 13,
                  background: saveMsg.ok ? "rgba(0,212,168,0.1)" : "rgba(239,68,68,0.1)",
                  color: saveMsg.ok ? TEAL : "#f87171",
                }}>
                  {saveMsg.text}
                </div>
              )}

              <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
                <button onClick={() => { setShowForm(false); setSaveMsg(null); }}
                  style={{ background: "rgba(255,255,255,0.06)", border: "none", color: "#9ca3af", borderRadius: 8, padding: "9px 16px", fontSize: 13, cursor: "pointer" }}>
                  Cancel
                </button>
                <button onClick={handleSave} disabled={saving}
                  style={{ background: saving ? "rgba(0,212,168,0.4)" : TEAL, color: "#0a0a0f", border: "none", borderRadius: 8, padding: "9px 16px", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
                  {saving ? "Saving…" : "Save Contact"}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Vendor list */}
        {loading ? (
          <p style={{ color: "#6b7280", textAlign: "center", padding: 40 }}>Loading…</p>
        ) : vendors.length === 0 ? (
          <div style={{ ...card, padding: 40, textAlign: "center" }}>
            <p style={{ color: "#6b7280", marginBottom: 16 }}>No vendor contacts yet. Add your Sysco or US Foods rep to start sending orders.</p>
            <button onClick={startNew}
              style={{ background: TEAL, color: "#0a0a0f", border: "none", borderRadius: 8, padding: "10px 20px", fontSize: 14, fontWeight: 600, cursor: "pointer" }}>
              Add First Vendor
            </button>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {vendors.map(v => (
              <div key={v.id} style={{ ...card, padding: "16px 20px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <div>
                  <p style={{ margin: 0, fontSize: 15, fontWeight: 600 }}>{v.vendor_name}</p>
                  <p style={{ margin: "3px 0 0", fontSize: 13, color: "#9ca3af" }}>
                    {v.rep_name ? `${v.rep_name} · ` : ""}{v.rep_email}
                    {v.account_number ? ` · Acct #${v.account_number}` : ""}
                  </p>
                  {v.notes && <p style={{ margin: "2px 0 0", fontSize: 12, color: "#6b7280" }}>{v.notes}</p>}
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                  <button onClick={() => startEdit(v)}
                    style={{ background: "rgba(255,255,255,0.06)", border: "none", color: "#9ca3af", borderRadius: 7, padding: "6px 12px", fontSize: 12, cursor: "pointer" }}>
                    Edit
                  </button>
                  <button onClick={() => handleDelete(v.id)} disabled={deleting === v.id}
                    style={{ background: "rgba(239,68,68,0.1)", border: "none", color: "#f87171", borderRadius: 7, padding: "6px 12px", fontSize: 12, cursor: "pointer" }}>
                    {deleting === v.id ? "…" : "Remove"}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
