"use client";

import { useEffect, useState, useMemo, Suspense } from "react";
import { useParams, useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";
import PrintPDFButton from "@/app/components/PrintPDFButton";
import { createClient } from "@/lib/supabase/client";
import { INFRA_FIELDS } from "@/lib/types";
import { sanitizeLabel, sanitizeAmount, validateMonth } from "@/lib/validateParams";
import { useAuthGuard } from "@/lib/useAuthGuard";

const emptyInfra  = () => Object.fromEntries(INFRA_FIELDS.map(f => [f.key, ""])) as Record<string, string>;

const infraToDb = (infra: Record<string, string>) => {
  const out: Record<string, number> = {};
  for (const f of INFRA_FIELDS) out[f.dbKey] = parseFloat(infra[f.key]) || 0;
  return out;
};
const dbToInfra = (data: Record<string, unknown>) => {
  const out: Record<string, string> = {};
  for (const f of INFRA_FIELDS) out[f.key] = String((data as any)[f.dbKey] ?? "");
  return out;
};

const fmtUSD = (n: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n);

interface CustomField { id: string; label: string; amount: string; }
const newCustomField = (): CustomField => ({ id: crypto.randomUUID(), label: "", amount: "" });

function CostsPageContent() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const searchParams = useSearchParams();
  const supabase = useMemo(() => createClient(), []);
  const { ready, role, fullAccess } = useAuthGuard();

  // Restricted managers (no full_access) are not permitted to view infrastructure costs
  useEffect(() => {
    if (ready && role === "manager" && !fullAccess) router.replace(`/location/${id}`);
  }, [ready, role, fullAccess, id, router]);

  const [month, setMonth] = useState(validateMonth(searchParams.get("month")));
  const [infra, setInfra] = useState<Record<string, string>>(emptyInfra());
  const [customFields, setCustomFields] = useState<CustomField[]>([]);
  const [payroll, setPayroll] = useState({ payroll_tax_amount: "", workers_comp_amount: "", benefits_amount: "" });
  const [saving, setSaving]   = useState(false);
  const [saved,  setSaved]    = useState(false);
  const [locationName, setLocationName] = useState("");

  useEffect(() => {
    supabase.from("locations").select("name").eq("id", id).single()
      .then(({ data }) => setLocationName(data?.name ?? ""));
  }, [id]);

  useEffect(() => {
    supabase.from("monthly_infrastructure").select("*").eq("location_id", id).eq("month", month).maybeSingle()
      .then(({ data }) => {
        if (data) {
          setInfra(dbToInfra(data as Record<string, unknown>));
          // Load custom fields from JSONB
          const cf = (data as any).custom_fields ?? {};
          setCustomFields(
            Object.entries(cf).map(([label, amount]) => ({
              id: crypto.randomUUID(), label, amount: String(amount),
            }))
          );
        } else {
          setInfra(emptyInfra());
          setCustomFields([]);
        }
      });
    supabase.from("monthly_payroll_taxes").select("*").eq("location_id", id).eq("month", month).maybeSingle()
      .then(({ data }) => {
        if (data) setPayroll({
          payroll_tax_amount:  String(data.payroll_tax_amount  ?? ""),
          workers_comp_amount: String(data.workers_comp_amount ?? ""),
          benefits_amount:     String(data.benefits_amount     ?? ""),
        });
        else setPayroll({ payroll_tax_amount: "", workers_comp_amount: "", benefits_amount: "" });
      });
  }, [id, month]);

  const handleSave = async () => {
    setSaving(true);
    // Build custom_fields JSONB from the current rows (skip empty labels)
    const custom_fields: Record<string, number> = {};
    for (const f of customFields) {
      const key = sanitizeLabel(f.label);
      if (key) custom_fields[key] = sanitizeAmount(f.amount);
    }
    await Promise.all([
      supabase.from("monthly_infrastructure").upsert(
        { location_id: id, month, ...infraToDb(infra), custom_fields },
        { onConflict: "location_id,month" }
      ),
      supabase.from("monthly_payroll_taxes").upsert({
        location_id: id, month,
        payroll_tax_amount:  parseFloat(payroll.payroll_tax_amount)  || 0,
        workers_comp_amount: parseFloat(payroll.workers_comp_amount) || 0,
        benefits_amount:     parseFloat(payroll.benefits_amount)     || 0,
      }, { onConflict: "location_id,month" }),
    ]);
    setSaving(false); setSaved(true); setTimeout(() => setSaved(false), 2000);
  };

  const totalInfra =
    INFRA_FIELDS.reduce((s, f) => s + (parseFloat(infra[f.key]) || 0), 0) +
    customFields.reduce((s, f) => s + (parseFloat(f.amount) || 0), 0);
  const totalPayroll =
    (parseFloat(payroll.payroll_tax_amount) || 0) +
    (parseFloat(payroll.workers_comp_amount) || 0) +
    (parseFloat(payroll.benefits_amount) || 0);

  const monthLabel = new Date(month + "T00:00:00").toLocaleDateString("en-US", { month: "long", year: "numeric" });
  const navMonth = (delta: number) => {
    const d = new Date(month + "T00:00:00");
    d.setMonth(d.getMonth() + delta);
    setMonth(d.toISOString().slice(0, 10).slice(0, 7) + "-01");
  };

  const inp = "w-full pl-6 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500";

  if (!ready) return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="w-8 h-8 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
    </div>
  );

  return (
    <div className="min-h-screen bg-gray-50">
      <nav className="bg-white border-b border-gray-200 px-4 h-14 flex items-center gap-3 sticky top-0 z-10">
        <Link href={`/location/${id}`} className="text-sm text-gray-500 hover:text-gray-900">←</Link>
        <span className="font-semibold text-gray-900">{locationName} — Infrastructure Costs</span>
        <div className="ml-auto"><PrintPDFButton title={`Costs-${locationName}`} orientation="portrait" /></div>
        <span className="ml-auto text-sm text-gray-500">Total: <strong className="text-gray-900">{fmtUSD(totalInfra + totalPayroll)}</strong></span>
      </nav>

      <main className="max-w-2xl mx-auto px-4 py-6 space-y-5" id="print-area">
        {/* Month nav */}
        <div className="flex items-center gap-3">
          <button onClick={() => navMonth(-1)} className="border rounded-lg px-3 py-1.5 text-gray-600 hover:bg-gray-100">‹</button>
          <span className="font-medium text-gray-800 min-w-[140px] text-center">{monthLabel}</span>
          <button onClick={() => navMonth(1)}  className="border rounded-lg px-3 py-1.5 text-gray-600 hover:bg-gray-100">›</button>
        </div>

        {/* ── Infrastructure ── */}
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-gray-800">Infrastructure</h3>
            <span className="text-sm font-bold text-gray-900">{fmtUSD(totalInfra)}</span>
          </div>

          {/* Fixed fields */}
          <div className="grid grid-cols-2 gap-3">
            {INFRA_FIELDS.map(f => (
              <div key={f.key}>
                <label className="text-xs font-medium text-gray-600 flex items-center gap-1">
                  {f.label}
                  {f.fixed && <span className="text-gray-300 text-[10px]">(fixed)</span>}
                </label>
                <div className="mt-1 relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">$</span>
                  <input type="number" min="0" step="0.01"
                    value={infra[f.key] ?? ""}
                    onChange={e => setInfra(prev => ({ ...prev, [f.key]: e.target.value }))}
                    placeholder="0" className={inp} />
                </div>
              </div>
            ))}
          </div>

          {/* Custom fields */}
          {customFields.length > 0 && (
            <div className="border-t border-gray-100 pt-4 space-y-2">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Additional Fields</p>
              {customFields.map(f => (
                <div key={f.id} className="flex items-center gap-2">
                  <input type="text" value={f.label}
                    onChange={e => setCustomFields(prev => prev.map(x => x.id === f.id ? { ...x, label: e.target.value } : x))}
                    placeholder="Field name (e.g. Car Payment 2)"
                    className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-brand-500" />
                  <div className="relative w-32">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">$</span>
                    <input type="number" min="0" step="0.01" value={f.amount}
                      onChange={e => setCustomFields(prev => prev.map(x => x.id === f.id ? { ...x, amount: e.target.value } : x))}
                      placeholder="0"
                      className="w-full pl-6 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-brand-500" />
                  </div>
                  <button onClick={() => setCustomFields(prev => prev.filter(x => x.id !== f.id))}
                    className="text-red-400 hover:text-red-600 text-sm px-1">✕</button>
                </div>
              ))}
            </div>
          )}

          {/* Add custom field */}
          <button onClick={() => setCustomFields(prev => [...prev, newCustomField()])}
            className="text-sm text-brand-600 hover:text-brand-700 font-medium flex items-center gap-1">
            + Add Custom Field (e.g. Dishwasher Rent, Extra Car Payment…)
          </button>
        </div>

        {/* ── Payroll Taxes & Benefits ── */}
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5 space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-semibold text-gray-800">Payroll Taxes &amp; Benefits</h3>
              <p className="text-xs text-gray-400 mt-0.5">Auto-filled from Staff page, or enter manually</p>
            </div>
            <span className="text-sm font-bold text-gray-900">{fmtUSD(totalPayroll)}</span>
          </div>
          <div className="grid grid-cols-3 gap-3">
            {[
              { key: "payroll_tax_amount",  label: "Payroll Tax (FICA + SUTA)" },
              { key: "workers_comp_amount", label: "Workers' Comp" },
              { key: "benefits_amount",     label: "Benefits" },
            ].map(f => (
              <div key={f.key}>
                <label className="text-xs font-medium text-gray-600">{f.label}</label>
                <div className="mt-1 relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">$</span>
                  <input type="number" min="0" step="0.01"
                    value={(payroll as any)[f.key] ?? ""}
                    onChange={e => setPayroll(prev => ({ ...prev, [f.key]: e.target.value }))}
                    placeholder="0" className={inp} />
                </div>
              </div>
            ))}
          </div>
        </div>

        <button onClick={handleSave} disabled={saving}
          className="w-full bg-brand-500 hover:bg-brand-600 disabled:opacity-50 text-white rounded-xl py-3 font-semibold text-sm transition-colors">
          {saving ? "Saving…" : saved ? "✓ Saved" : "Save Infrastructure Costs"}
        </button>
      </main>
    </div>
  );
}

export default function CostsPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-[#060b18]" />}>
      <CostsPageContent />
    </Suspense>
  );
}
