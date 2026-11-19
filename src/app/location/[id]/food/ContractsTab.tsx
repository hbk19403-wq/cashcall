"use client";

import React, { useEffect, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";

const TEAL = "#00d4a8";
const BG = "#060b18";
const CARD = "rgba(255,255,255,0.04)";
const BORDER = "rgba(255,255,255,0.08)";
const RED = "#ff4d4d";
const AMBER = "#f59e0b";
const GREEN = "#10b981";

const fmtUSD = (n: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2 }).format(n);
const fmtPct = (n: number) =>
  `${n > 0 ? "+" : ""}${n.toFixed(1)}%`;

interface ContractPrice {
  id: string;
  vendor: string;
  item_name: string;
  contract_price: number;
  unit: string;
  effective_date: string;
  expiry_date: string | null;
  notes: string | null;
}

interface Violation {
  item_name: string;
  vendor: string;
  contract_price: number;
  avg_actual: number;
  overcharge_pct: number;
  invoice_count: number;
  last_seen: string;
}

const EMPTY_FORM = {
  vendor: "",
  item_name: "",
  contract_price: "",
  unit: "case",
  effective_date: new Date().toISOString().slice(0, 10),
  expiry_date: "",
  notes: "",
};

export default function ContractsTab({ locationId }: { locationId: string }) {
  const supabase = createClient();
  const [contracts, setContracts] = useState<ContractPrice[]>([]);
  const [violations, setViolations] = useState<Violation[]>([]);
  const [loading, setLoading] = useState(true);
  const [checking, setChecking] = useState(false);
  const [checkResult, setCheckResult] = useState<number | null>(null);
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const [{ data: cp }, { data: viol }] = await Promise.all([
      supabase
        .from("contract_prices")
        .select("*")
        .eq("location_id", locationId)
        .order("vendor", { ascending: true })
        .order("item_name", { ascending: true }),
      supabase.rpc("get_contract_violations", { p_location_id: locationId }),
    ]);
    setContracts(cp || []);
    setViolations(viol || []);
    setLoading(false);
  }, [locationId, supabase]);

  useEffect(() => { load(); }, [load]);

  async function saveContract() {
    const price = parseFloat(form.contract_price);
    if (!form.vendor.trim()) { setFormError("Vendor is required"); return; }
    if (!form.item_name.trim()) { setFormError("Item name is required"); return; }
    if (!form.contract_price || isNaN(price) || price <= 0) { setFormError("Enter a valid price > 0"); return; }
    setSaving(true); setFormError("");
    const { error } = await supabase.from("contract_prices").insert({
      location_id: locationId,
      vendor: form.vendor.trim(),
      item_name: form.item_name.trim(),
      contract_price: price,
      unit: form.unit.trim() || "case",
      effective_date: form.effective_date,
      expiry_date: form.expiry_date || null,
      notes: form.notes || null,
    });
    setSaving(false);
    if (error) { setFormError(error.message); return; }
    setForm({ ...EMPTY_FORM });
    setShowForm(false);
    load();
  }

  async function deleteContract(id: string) {
    setDeleting(id);
    await supabase.from("contract_prices").delete().eq("id", id);
    setDeleting(null);
    load();
  }

  async function checkViolations() {
    setChecking(true); setCheckResult(null);
    const { data, error } = await supabase.rpc("flag_price_violations", { p_location_id: locationId });
    setChecking(false);
    if (!error) setCheckResult(typeof data === "number" ? data : 0);
    load();
  }

  const isExpired = (c: ContractPrice) =>
    c.expiry_date && new Date(c.expiry_date) < new Date();

  const totalOverpay = violations.reduce((s, v) => {
    const perUnit = v.avg_actual - v.contract_price;
    return s + perUnit * v.invoice_count;
  }, 0);

  /* ─── render ─────────────────────────────────────────────────────── */
  return (
    <div style={{ color: "rgba(255,255,255,0.85)", fontSize: 13, paddingBottom: 40 }}>

      {/* ── Header row ── */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: "#fff" }}>
            Contract Price Enforcement
          </h2>
          <p style={{ margin: "4px 0 0", color: "rgba(255,255,255,0.4)", fontSize: 12 }}>
            Set negotiated prices per item. Violations are flagged when invoices exceed your contract price by &gt;3%.
          </p>
        </div>
        <div style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
          <button
            onClick={checkViolations}
            disabled={checking || contracts.length === 0}
            style={{
              padding: "7px 14px", borderRadius: 8, border: `1px solid ${TEAL}`,
              background: "transparent", color: TEAL, cursor: "pointer", fontSize: 12, fontWeight: 600,
              opacity: (checking || contracts.length === 0) ? 0.4 : 1,
            }}
          >
            {checking ? "Checking…" : "🔍 Check Violations"}
          </button>
          <button
            onClick={() => { setShowForm(f => !f); setFormError(""); }}
            style={{
              padding: "7px 14px", borderRadius: 8, border: "none",
              background: TEAL, color: "#0a0a1a", cursor: "pointer", fontSize: 12, fontWeight: 700,
            }}
          >
            {showForm ? "✕ Cancel" : "+ Add Contract"}
          </button>
        </div>
      </div>

      {/* ── Check result banner ── */}
      {checkResult !== null && (
        <div style={{
          marginBottom: 16, padding: "10px 16px", borderRadius: 8,
          background: checkResult > 0 ? "rgba(255,77,77,0.12)" : "rgba(16,185,129,0.12)",
          border: `1px solid ${checkResult > 0 ? RED : GREEN}`,
          color: checkResult > 0 ? RED : GREEN, fontWeight: 600, fontSize: 12,
        }}>
          {checkResult > 0
            ? `⚠️ ${checkResult} invoice line item${checkResult !== 1 ? "s" : ""} flagged as over-contract.`
            : "✅ No violations found — all recent invoices are within contract."}
        </div>
      )}

      {/* ── Summary cards ── */}
      {!loading && (contracts.length > 0 || violations.length > 0) && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 12, marginBottom: 20 }}>
          {[
            { label: "Active Contracts", value: contracts.filter(c => !isExpired(c)).length, color: TEAL },
            { label: "Items Overcharged", value: violations.length, color: violations.length > 0 ? RED : GREEN },
            { label: "Est. 90-day Overpay", value: fmtUSD(totalOverpay > 0 ? totalOverpay : 0), color: totalOverpay > 0 ? AMBER : GREEN },
          ].map(s => (
            <div key={s.label} style={{
              background: CARD, border: `1px solid ${BORDER}`, borderRadius: 10,
              padding: "14px 16px",
            }}>
              <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", marginBottom: 6 }}>{s.label}</div>
              <div style={{ fontSize: 20, fontWeight: 700, color: s.color }}>{s.value}</div>
            </div>
          ))}
        </div>
      )}

      {/* ── Violations table ── */}
      {violations.length > 0 && (
        <div style={{ marginBottom: 24 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: RED, marginBottom: 10 }}>
            🚨 Active Violations (last 90 days)
          </div>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ color: "rgba(255,255,255,0.4)", fontSize: 11 }}>
                {["Item", "Vendor", "Contract", "Avg Paid", "Overage", "Invoices", "Last Seen"].map(h => (
                  <th key={h} style={{ padding: "6px 10px", textAlign: h === "Item" || h === "Vendor" ? "left" : "right", fontWeight: 500 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {violations.map((v, i) => (
                <tr key={i} style={{
                  borderTop: `1px solid ${BORDER}`,
                  background: i % 2 === 0 ? "transparent" : "rgba(255,255,255,0.015)",
                }}>
                  <td style={{ padding: "9px 10px", fontWeight: 600, color: "#fff" }}>{v.item_name}</td>
                  <td style={{ padding: "9px 10px", color: "rgba(255,255,255,0.6)" }}>{v.vendor}</td>
                  <td style={{ padding: "9px 10px", textAlign: "right" }}>{fmtUSD(v.contract_price)}</td>
                  <td style={{ padding: "9px 10px", textAlign: "right", color: RED, fontWeight: 600 }}>{fmtUSD(v.avg_actual)}</td>
                  <td style={{ padding: "9px 10px", textAlign: "right", color: RED, fontWeight: 700 }}>{fmtPct(v.overcharge_pct)}</td>
                  <td style={{ padding: "9px 10px", textAlign: "right", color: "rgba(255,255,255,0.4)" }}>{v.invoice_count}</td>
                  <td style={{ padding: "9px 10px", textAlign: "right", color: "rgba(255,255,255,0.4)" }}>{v.last_seen}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ── Add contract form ── */}
      {showForm && (
        <div style={{
          background: "rgba(0,212,168,0.05)", border: `1px solid ${TEAL}40`,
          borderRadius: 10, padding: "18px 20px", marginBottom: 20,
        }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: TEAL, marginBottom: 14 }}>New Contract Price</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            {[
              { key: "vendor", label: "Vendor *", placeholder: "e.g. Sysco" },
              { key: "item_name", label: "Item Name *", placeholder: "e.g. Chicken Breast 40# case" },
            ].map(f => (
              <div key={f.key}>
                <label style={{ display: "block", fontSize: 11, color: "rgba(255,255,255,0.4)", marginBottom: 4 }}>{f.label}</label>
                <input
                  value={(form as Record<string, string>)[f.key]}
                  onChange={e => setForm(p => ({ ...p, [f.key]: e.target.value }))}
                  placeholder={f.placeholder}
                  style={inputStyle}
                />
              </div>
            ))}
            <div>
              <label style={{ display: "block", fontSize: 11, color: "rgba(255,255,255,0.4)", marginBottom: 4 }}>Contract Price * ($/unit)</label>
              <input
                type="number" min="0" step="0.01"
                value={form.contract_price}
                onChange={e => setForm(p => ({ ...p, contract_price: e.target.value }))}
                placeholder="e.g. 89.50"
                style={inputStyle}
              />
            </div>
            <div>
              <label style={{ display: "block", fontSize: 11, color: "rgba(255,255,255,0.4)", marginBottom: 4 }}>Unit</label>
              <input
                value={form.unit}
                onChange={e => setForm(p => ({ ...p, unit: e.target.value }))}
                placeholder="case / lb / each"
                style={inputStyle}
              />
            </div>
            <div>
              <label style={{ display: "block", fontSize: 11, color: "rgba(255,255,255,0.4)", marginBottom: 4 }}>Effective Date</label>
              <input
                type="date"
                value={form.effective_date}
                onChange={e => setForm(p => ({ ...p, effective_date: e.target.value }))}
                style={inputStyle}
              />
            </div>
            <div>
              <label style={{ display: "block", fontSize: 11, color: "rgba(255,255,255,0.4)", marginBottom: 4 }}>Expiry Date (optional)</label>
              <input
                type="date"
                value={form.expiry_date}
                onChange={e => setForm(p => ({ ...p, expiry_date: e.target.value }))}
                style={inputStyle}
              />
            </div>
            <div style={{ gridColumn: "1/-1" }}>
              <label style={{ display: "block", fontSize: 11, color: "rgba(255,255,255,0.4)", marginBottom: 4 }}>Notes (optional)</label>
              <input
                value={form.notes}
                onChange={e => setForm(p => ({ ...p, notes: e.target.value }))}
                placeholder="e.g. Q4 2026 negotiated rate"
                style={inputStyle}
              />
            </div>
          </div>
          {formError && (
            <div style={{ color: RED, fontSize: 12, marginTop: 10 }}>⚠️ {formError}</div>
          )}
          <div style={{ marginTop: 14, display: "flex", gap: 10 }}>
            <button
              onClick={saveContract}
              disabled={saving}
              style={{
                padding: "8px 20px", borderRadius: 8, border: "none",
                background: TEAL, color: "#0a0a1a", cursor: "pointer", fontSize: 12, fontWeight: 700,
                opacity: saving ? 0.6 : 1,
              }}
            >
              {saving ? "Saving…" : "Save Contract"}
            </button>
            <button
              onClick={() => { setShowForm(false); setFormError(""); setForm({ ...EMPTY_FORM }); }}
              style={{
                padding: "8px 16px", borderRadius: 8, border: `1px solid ${BORDER}`,
                background: "transparent", color: "rgba(255,255,255,0.5)", cursor: "pointer", fontSize: 12,
              }}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* ── Contracts table ── */}
      {loading ? (
        <div style={{ color: "rgba(255,255,255,0.3)", textAlign: "center", padding: 40 }}>Loading contracts…</div>
      ) : contracts.length === 0 ? (
        <div style={{
          textAlign: "center", padding: "48px 20px",
          border: `1px dashed ${BORDER}`, borderRadius: 12,
          color: "rgba(255,255,255,0.3)",
        }}>
          <div style={{ fontSize: 32, marginBottom: 12 }}>📋</div>
          <div style={{ fontSize: 15, fontWeight: 600, color: "rgba(255,255,255,0.6)", marginBottom: 8 }}>No contract prices yet</div>
          <div style={{ fontSize: 12 }}>Add negotiated prices and CashCall will flag any invoice that exceeds them.</div>
          <button
            onClick={() => setShowForm(true)}
            style={{
              marginTop: 16, padding: "8px 20px", borderRadius: 8, border: "none",
              background: TEAL, color: "#0a0a1a", cursor: "pointer", fontSize: 12, fontWeight: 700,
            }}
          >
            + Add First Contract
          </button>
        </div>
      ) : (
        <div>
          <div style={{ fontSize: 12, fontWeight: 700, color: "rgba(255,255,255,0.5)", marginBottom: 10 }}>
            All Contracts ({contracts.length})
          </div>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ color: "rgba(255,255,255,0.4)", fontSize: 11 }}>
                {["Vendor", "Item", "Contract Price", "Unit", "Effective", "Expires", "Status", ""].map(h => (
                  <th key={h} style={{
                    padding: "6px 10px",
                    textAlign: h === "" || h === "Contract Price" ? "right" : "left",
                    fontWeight: 500,
                  }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {contracts.map((c, i) => {
                const expired = isExpired(c);
                const violation = violations.find(v =>
                  v.item_name.toLowerCase() === c.item_name.toLowerCase() &&
                  v.vendor.toLowerCase() === c.vendor.toLowerCase()
                );
                return (
                  <tr key={c.id} style={{
                    borderTop: `1px solid ${BORDER}`,
                    background: i % 2 === 0 ? "transparent" : "rgba(255,255,255,0.015)",
                    opacity: expired ? 0.5 : 1,
                  }}>
                    <td style={{ padding: "9px 10px", color: "rgba(255,255,255,0.6)" }}>{c.vendor}</td>
                    <td style={{ padding: "9px 10px", fontWeight: 600, color: "#fff" }}>{c.item_name}</td>
                    <td style={{ padding: "9px 10px", textAlign: "right", fontWeight: 700, color: TEAL }}>
                      {fmtUSD(c.contract_price)}
                    </td>
                    <td style={{ padding: "9px 10px", color: "rgba(255,255,255,0.4)" }}>{c.unit}</td>
                    <td style={{ padding: "9px 10px", color: "rgba(255,255,255,0.4)" }}>{c.effective_date}</td>
                    <td style={{ padding: "9px 10px", color: "rgba(255,255,255,0.4)" }}>
                      {c.expiry_date || <span style={{ color: "rgba(255,255,255,0.2)" }}>—</span>}
                    </td>
                    <td style={{ padding: "9px 10px" }}>
                      {expired
                        ? <span style={{ color: "rgba(255,255,255,0.3)", fontSize: 11 }}>Expired</span>
                        : violation
                          ? <span style={{ color: RED, fontSize: 11, fontWeight: 700 }}>⚠️ {fmtPct(violation.overcharge_pct)}</span>
                          : <span style={{ color: GREEN, fontSize: 11 }}>✓ OK</span>
                      }
                    </td>
                    <td style={{ padding: "9px 10px", textAlign: "right" }}>
                      <button
                        onClick={() => deleteContract(c.id)}
                        disabled={deleting === c.id}
                        style={{
                          background: "none", border: "none", cursor: "pointer",
                          color: "rgba(255,255,255,0.3)", fontSize: 12, padding: "2px 6px",
                        }}
                        title="Remove contract"
                      >
                        {deleting === c.id ? "…" : "✕"}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  width: "100%",
  background: "rgba(255,255,255,0.06)",
  border: "1px solid rgba(255,255,255,0.12)",
  borderRadius: 7,
  padding: "8px 10px",
  color: "#fff",
  fontSize: 12,
  boxSizing: "border-box",
};
