"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import PrintPDFButton from "@/app/components/PrintPDFButton";
import { createClient } from "@/lib/supabase/client";
import { useAuthGuard } from "@/lib/useAuthGuard";

/* ─── Types ────────────────────────────────────────────────────────────────── */
interface HourlyStaff   { id: string; name: string; position: string; hourly_rate: number; active: boolean; }
interface SalariedStaff { id: string; name: string; position: string; monthly_salary: number; active: boolean; }
interface BOHStaff      { id: string; name: string; position: string; pay_type: string; pay_rate: number; active: boolean; }

/* ─── Constants ────────────────────────────────────────────────────────────── */
const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;
const DEFAULT_RATES = { fica: 7.65, state_ui: 3.0, workers_comp: 2.0 };

const fmtUSD  = (n: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n);
const fmtUSD2 = (n: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2 }).format(n);

/* ─── Week helpers ─────────────────────────────────────────────────────────── */
function getWeekStart(d = new Date()): Date {
  const date = new Date(d);
  date.setDate(date.getDate() - date.getDay());   // back to Sunday
  date.setHours(0, 0, 0, 0);
  return date;
}
function weekDateStrings(start: Date): string[] {
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(start);
    d.setDate(d.getDate() + i);
    return d.toISOString().slice(0, 10);
  });
}
function fmtDay(dateStr: string, dayAbbr: string) {
  const d = new Date(dateStr + "T12:00:00");
  return `${dayAbbr} ${d.getDate()}`;
}
function isToday(dateStr: string) {
  return dateStr === new Date().toISOString().slice(0, 10);
}

/* ─── Component ────────────────────────────────────────────────────────────── */
export default function StaffPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const { ready, role, fullAccess } = useAuthGuard();

  // Restricted manager = manager without full_access flag
  const isManager = role === "manager" && !fullAccess;

  /* -- Page state -- */
  // Restricted managers land directly on timesheet; full-access users see roster first
  const [view, setView] = useState<"roster" | "timesheet">("roster");

  useEffect(() => {
    if (ready && isManager) setView("timesheet");
  }, [ready, isManager]);
  const [locationName, setLocationName] = useState("");

  /* -- Staff lists -- */
  const [fohHourly,   setFohHourly]   = useState<HourlyStaff[]>([]);
  const [fohSalaried, setFohSalaried] = useState<SalariedStaff[]>([]);
  const [boh,         setBoh]         = useState<BOHStaff[]>([]);

  /* -- Roster save state -- */
  const [saving, setSaving] = useState(false);
  const [saved,  setSaved]  = useState(false);

  /* -- Payroll tax -- */
  const now = new Date();
  const [month, setMonth] = useState(`${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,"0")}-01`);
  const [rates, setRates] = useState(DEFAULT_RATES);
  const [benefits, setBenefits] = useState(0);
  const [savingTax, setSavingTax] = useState(false);
  const [savedTax,  setSavedTax]  = useState(false);

  /* -- Weekly timesheet state -- */
  const [weekStart, setWeekStart]     = useState<Date>(getWeekStart());
  // staffId → dateStr → hours string
  const [weekHours, setWeekHours]     = useState<Record<string, Record<string, string>>>({});
  const [savingWeek, setSavingWeek]   = useState(false);
  const [savedWeek,  setSavedWeek]    = useState(false);

  const dates = weekDateStrings(weekStart);
  const weekLabel = (() => {
    const start = new Date(dates[0] + "T12:00:00");
    const end   = new Date(dates[6] + "T12:00:00");
    const opts: Intl.DateTimeFormatOptions = { month: "short", day: "numeric" };
    return `${start.toLocaleDateString("en-US", opts)} – ${end.toLocaleDateString("en-US", { ...opts, year: "numeric" })}`;
  })();

  /* ── Load staff ──────────────────────────────────────────────────────────── */
  const load = useCallback(async () => {
    const [h, s, b] = await Promise.all([
      supabase.from("foh_hourly_staff").select("id,name,position,hourly_rate,active").eq("location_id", id).eq("active", true).order("name"),
      supabase.from("foh_salaried_staff").select("id,name,position,monthly_salary,active").eq("location_id", id).eq("active", true).order("name"),
      supabase.from("boh_staff").select("id,name,position,pay_type,pay_rate,active").eq("location_id", id).eq("active", true).order("name"),
    ]);
    setFohHourly((h.data ?? []) as HourlyStaff[]);
    setFohSalaried((s.data ?? []) as SalariedStaff[]);
    setBoh((b.data ?? []) as BOHStaff[]);
  }, [id, supabase]);

  useEffect(() => {
    supabase.from("locations").select("name").eq("id", id).single()
      .then(({ data }) => setLocationName(data?.name ?? ""));
    load();
  }, [id, load, supabase]);

  /* Load payroll taxes for month */
  useEffect(() => {
    supabase.from("monthly_payroll_taxes").select("*").eq("location_id", id).eq("month", month).maybeSingle()
      .then(({ data }) => { if (data) setBenefits(data.benefits_amount ?? 0); });
  }, [id, month, supabase]);

  /* ── Load weekly hours from DB ───────────────────────────────────────────── */
  useEffect(() => {
    if (!fohHourly.length) return;
    supabase.from("foh_hourly_hours")
      .select("staff_id, work_date, hours_worked")
      .in("staff_id", fohHourly.map(s => s.id))
      .gte("work_date", dates[0])
      .lte("work_date", dates[6])
      .then(({ data }) => {
        const map: Record<string, Record<string, string>> = {};
        for (const s of fohHourly) map[s.id] = {};
        for (const row of (data ?? [])) {
          const hrs = Number(row.hours_worked) || 0;
          map[row.staff_id] = map[row.staff_id] ?? {};
          map[row.staff_id][row.work_date] = hrs > 0 ? String(hrs) : "";
        }
        setWeekHours(map);
      });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [weekStart, fohHourly.map(s => s.id).join(","), id]);

  /* ── Save weekly hours ───────────────────────────────────────────────────── */
  const saveWeekHours = async () => {
    setSavingWeek(true);
    const upsertRows: { staff_id: string; work_date: string; hours_worked: number; overtime_hours: number }[] = [];
    const deleteKeys: { staff_id: string; work_date: string }[] = [];

    for (const staff of fohHourly) {
      for (const date of dates) {
        const hrs = parseFloat(weekHours[staff.id]?.[date] ?? "0") || 0;
        if (hrs > 0) {
          upsertRows.push({ staff_id: staff.id, work_date: date, hours_worked: hrs, overtime_hours: 0 });
        } else {
          deleteKeys.push({ staff_id: staff.id, work_date: date });
        }
      }
    }

    if (upsertRows.length) {
      await supabase.from("foh_hourly_hours").upsert(upsertRows, { onConflict: "staff_id,work_date" });
    }
    for (const { staff_id, work_date } of deleteKeys) {
      await supabase.from("foh_hourly_hours").delete().eq("staff_id", staff_id).eq("work_date", work_date);
    }
    setSavingWeek(false); setSavedWeek(true); setTimeout(() => setSavedWeek(false), 2500);
  };

  /* ── Roster save ─────────────────────────────────────────────────────────── */
  const handleSaveStaff = async () => {
    setSaving(true);
    await Promise.all([
      ...fohHourly.map(s => supabase.from("foh_hourly_staff").update({ hourly_rate: s.hourly_rate, name: s.name, position: s.position }).eq("id", s.id)),
      ...fohSalaried.map(s => supabase.from("foh_salaried_staff").update({ monthly_salary: s.monthly_salary, name: s.name, position: s.position }).eq("id", s.id)),
      ...boh.map(s => supabase.from("boh_staff").update({ pay_rate: s.pay_rate, name: s.name, position: s.position }).eq("id", s.id)),
    ]);
    setSaving(false); setSaved(true); setTimeout(() => setSaved(false), 2000);
  };

  /* ── Add staff ───────────────────────────────────────────────────────────── */
  const addHourly = async () => {
    const { data } = await supabase.from("foh_hourly_staff")
      .insert({ location_id: id, name: "New Staff", position: "FOH Hourly", hourly_rate: 0, active: true })
      .select("id,name,position,hourly_rate,active").single();
    if (data) setFohHourly(p => [...p, data as HourlyStaff]);
  };
  const addSalaried = async () => {
    const { data } = await supabase.from("foh_salaried_staff")
      .insert({ location_id: id, name: "New Staff", position: "Manager", monthly_salary: 0, active: true })
      .select("id,name,position,monthly_salary,active").single();
    if (data) setFohSalaried(p => [...p, data as SalariedStaff]);
  };
  const addBOH = async () => {
    const { data } = await supabase.from("boh_staff")
      .insert({ location_id: id, name: "New Staff", position: "Line Chef", pay_type: "salary", pay_rate: 0, active: true })
      .select("id,name,position,pay_type,pay_rate,active").single();
    if (data) setBoh(p => [...p, data as BOHStaff]);
  };
  const deactivate = async (table: string, staffId: string) => {
    await supabase.from(table).update({ active: false }).eq("id", staffId);
    load();
  };

  /* ── Payroll tax ─────────────────────────────────────────────────────────── */
  const fohHourlyCost   = fohHourly.reduce((s, r) => s + r.hourly_rate * 160, 0);
  const fohSalariedCost = fohSalaried.reduce((s, r) => s + r.monthly_salary, 0);
  const bohCost         = boh.filter(r => r.pay_type === "salary").reduce((s, r) => s + r.pay_rate, 0);
  const totalGrossLabor = fohHourlyCost + fohSalariedCost + bohCost;
  const ficaAmt         = totalGrossLabor * (rates.fica / 100);
  const stateUIAmt      = totalGrossLabor * (rates.state_ui / 100);
  const workersCompAmt  = totalGrossLabor * (rates.workers_comp / 100);
  const totalPayrollTax = ficaAmt + stateUIAmt + workersCompAmt + benefits;
  const totalLabor      = totalGrossLabor + totalPayrollTax;

  const monthLabel = new Date(month + "T00:00:00").toLocaleDateString("en-US", { month: "long", year: "numeric" });
  const navMonth = (delta: number) => {
    const d = new Date(month + "T00:00:00");
    d.setMonth(d.getMonth() + delta);
    setMonth(d.toISOString().slice(0, 7) + "-01");
  };

  const handleSavePayrollTax = async () => {
    setSavingTax(true);
    await supabase.from("monthly_payroll_taxes").upsert({
      location_id: id, month,
      payroll_tax_amount:  ficaAmt + stateUIAmt,
      workers_comp_amount: workersCompAmt,
      benefits_amount:     benefits,
    }, { onConflict: "location_id,month" });
    setSavingTax(false); setSavedTax(true); setTimeout(() => setSavedTax(false), 2000);
  };

  /* ── Weekly cost calculations ────────────────────────────────────────────── */
  const staffWeeklySummary = fohHourly.map(s => {
    let totalHrs = 0;
    for (const d of dates) totalHrs += parseFloat(weekHours[s.id]?.[d] ?? "0") || 0;
    const totalCost = totalHrs * s.hourly_rate;
    return { id: s.id, totalHrs, totalCost };
  });
  const weekTotalHrs  = staffWeeklySummary.reduce((s, r) => s + r.totalHrs, 0);
  const weekTotalCost = staffWeeklySummary.reduce((s, r) => s + r.totalCost, 0);

  const inp = "border border-gray-200 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-brand-500";

  if (!ready) return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="w-8 h-8 border-2 border-teal-400 border-t-transparent rounded-full animate-spin" />
    </div>
  );

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Nav */}
      <nav className="bg-white border-b border-gray-200 px-4 h-14 flex items-center gap-3 sticky top-0 z-10">
        <Link href={`/location/${id}`} className="text-sm text-gray-500 hover:text-gray-900">←</Link>
        <span className="font-semibold text-gray-900">{locationName} — Staff & Labor</span>
        <div className="ml-auto flex items-center gap-3">
          <PrintPDFButton title={`Staff-${locationName}`} orientation="landscape" />
          <span className="text-sm text-gray-500">Est. total labor: <strong className="text-gray-900">{fmtUSD(totalLabor)}</strong></span>
        </div>
      </nav>

      {/* View toggle — managers only see timesheet */}
      {!isManager && (
        <div className="sticky top-14 z-10 bg-white border-b border-gray-100 px-4 py-2 flex gap-2">
          {([["roster", "👥 Staff Roster"], ["timesheet", "⏱️ Weekly Hours"]] as const).map(([v, label]) => (
            <button key={v} onClick={() => setView(v)}
              className="px-4 py-1.5 rounded-lg text-sm font-semibold transition-all"
              style={view === v
                ? { background: "linear-gradient(135deg,#00b896,#00d4a8)", color: "white" }
                : { color: "#6b7280", background: "#f3f4f6" }}>
              {label}
            </button>
          ))}
        </div>
      )}

      <main className="max-w-5xl mx-auto px-4 py-6 space-y-5" id="print-area">

        {/* ══════════════════════ ROSTER VIEW ══════════════════════ */}
        {view === "roster" && (
          <>
            {/* FOH Hourly Roster */}
            <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5">
              <div className="flex items-baseline justify-between mb-3">
                <div>
                  <h3 className="font-semibold text-gray-800">FOH — Hourly Staff</h3>
                  <p className="text-xs text-gray-400">Set rate/hr here. Enter daily hours in Weekly Hours tab.</p>
                </div>
                <span className="text-sm font-bold text-gray-900">{fmtUSD(fohHourlyCost)}<span className="text-xs text-gray-400 font-normal"> /mo est.</span></span>
              </div>
              {/* Header row */}
              {fohHourly.length > 0 && (
                <div className="flex items-center gap-2 px-1 mb-1">
                  <span className="flex-1 text-xs font-semibold text-gray-400 uppercase tracking-wide">Full Name</span>
                  <span className="w-32 text-xs font-semibold text-gray-400 uppercase tracking-wide">Position</span>
                  <span className="w-24 text-xs font-semibold text-gray-400 uppercase tracking-wide text-right">Rate / hr</span>
                  <span className="w-6" />
                </div>
              )}
              <div className="space-y-2">
                {fohHourly.map(s => (
                  <div key={s.id} className="flex items-center gap-2 group">
                    <input value={s.name} onChange={e => setFohHourly(p => p.map(r => r.id === s.id ? { ...r, name: e.target.value } : r))}
                      placeholder="Full name" className={`flex-1 ${inp}`} />
                    <input value={s.position} onChange={e => setFohHourly(p => p.map(r => r.id === s.id ? { ...r, position: e.target.value } : r))}
                      placeholder="Position" className={`w-32 ${inp}`} />
                    <div className="relative w-24">
                      <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400 text-xs">$</span>
                      <input type="number" min="0" step="0.01" value={s.hourly_rate || ""}
                        onChange={e => setFohHourly(p => p.map(r => r.id === s.id ? { ...r, hourly_rate: parseFloat(e.target.value) || 0 } : r))}
                        placeholder="0.00" className={`w-full pl-5 text-right ${inp}`} />
                    </div>
                    <span className="text-xs text-gray-400 w-6">/hr</span>
                    <button onClick={() => deactivate("foh_hourly_staff", s.id)} title="Remove"
                      className="opacity-0 group-hover:opacity-100 text-xs text-red-400 hover:text-red-600 transition-opacity">✕</button>
                  </div>
                ))}
                {fohHourly.length === 0 && <p className="text-xs text-gray-400 py-2">No hourly FOH staff. Click + to add.</p>}
              </div>
              <button onClick={addHourly} className="mt-3 text-sm text-brand-600 hover:text-brand-700 font-medium">+ Add Hourly Staff</button>
            </div>

            {/* FOH Salaried Roster */}
            <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5">
              <div className="flex items-baseline justify-between mb-3">
                <div>
                  <h3 className="font-semibold text-gray-800">FOH — Salaried Staff</h3>
                  <p className="text-xs text-gray-400">Monthly salary</p>
                </div>
                <span className="text-sm font-bold text-gray-900">{fmtUSD(fohSalariedCost)}<span className="text-xs text-gray-400 font-normal"> /mo</span></span>
              </div>
              <div className="space-y-2">
                {fohSalaried.map(s => (
                  <div key={s.id} className="flex items-center gap-2 group">
                    <input value={s.name} onChange={e => setFohSalaried(p => p.map(r => r.id === s.id ? { ...r, name: e.target.value } : r))}
                      placeholder="Full name" className={`flex-1 ${inp}`} />
                    <input value={s.position} onChange={e => setFohSalaried(p => p.map(r => r.id === s.id ? { ...r, position: e.target.value } : r))}
                      placeholder="Position" className={`w-32 ${inp}`} />
                    <div className="relative w-28">
                      <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400 text-xs">$</span>
                      <input type="number" min="0" step="1" value={s.monthly_salary || ""}
                        onChange={e => setFohSalaried(p => p.map(r => r.id === s.id ? { ...r, monthly_salary: parseFloat(e.target.value) || 0 } : r))}
                        placeholder="0" className={`w-full pl-5 ${inp}`} />
                    </div>
                    <span className="text-xs text-gray-400">/mo</span>
                    <button onClick={() => deactivate("foh_salaried_staff", s.id)} title="Remove"
                      className="opacity-0 group-hover:opacity-100 text-xs text-red-400 hover:text-red-600 transition-opacity">✕</button>
                  </div>
                ))}
                {fohSalaried.length === 0 && <p className="text-xs text-gray-400 py-2">No salaried FOH staff.</p>}
              </div>
              <button onClick={addSalaried} className="mt-3 text-sm text-brand-600 hover:text-brand-700 font-medium">+ Add Salaried Staff</button>
            </div>

            {/* BOH */}
            <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5">
              <div className="flex items-baseline justify-between mb-3">
                <div>
                  <h3 className="font-semibold text-gray-800">BOH — Kitchen Staff</h3>
                  <p className="text-xs text-gray-400">Monthly salary</p>
                </div>
                <span className="text-sm font-bold text-gray-900">{fmtUSD(bohCost)}<span className="text-xs text-gray-400 font-normal"> /mo</span></span>
              </div>
              <div className="space-y-2">
                {boh.map(s => (
                  <div key={s.id} className="flex items-center gap-2 group">
                    <input value={s.name} onChange={e => setBoh(p => p.map(r => r.id === s.id ? { ...r, name: e.target.value } : r))}
                      placeholder="Full name" className={`flex-1 ${inp}`} />
                    <input value={s.position} onChange={e => setBoh(p => p.map(r => r.id === s.id ? { ...r, position: e.target.value } : r))}
                      placeholder="Position" className={`w-32 ${inp}`} />
                    <div className="relative w-28">
                      <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400 text-xs">$</span>
                      <input type="number" min="0" step="1" value={s.pay_rate || ""}
                        onChange={e => setBoh(p => p.map(r => r.id === s.id ? { ...r, pay_rate: parseFloat(e.target.value) || 0 } : r))}
                        placeholder="0" className={`w-full pl-5 ${inp}`} />
                    </div>
                    <span className="text-xs text-gray-400">/mo</span>
                    <button onClick={() => deactivate("boh_staff", s.id)} title="Remove"
                      className="opacity-0 group-hover:opacity-100 text-xs text-red-400 hover:text-red-600 transition-opacity">✕</button>
                  </div>
                ))}
                {boh.length === 0 && <p className="text-xs text-gray-400 py-2">No BOH staff.</p>}
              </div>
              <button onClick={addBOH} className="mt-3 text-sm text-brand-600 hover:text-brand-700 font-medium">+ Add BOH Staff</button>
            </div>

            <button onClick={handleSaveStaff} disabled={saving}
              className="w-full bg-brand-500 hover:bg-brand-600 disabled:opacity-50 text-white rounded-xl py-3 font-semibold text-sm transition-colors">
              {saving ? "Saving…" : saved ? "✓ Staff Saved" : "Save Staff Rates & Names"}
            </button>

            {/* Payroll Tax Calculator — owners only */}
            {!isManager && <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5 space-y-4">
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="font-semibold text-gray-800">Payroll Tax Calculator</h3>
                  <p className="text-xs text-gray-400 mt-0.5">Auto-estimates taxes on gross labor. Push to Monthly Costs.</p>
                </div>
                <div className="flex items-center gap-1">
                  <button onClick={() => navMonth(-1)} className="border rounded px-1.5 py-0.5 text-gray-500 hover:bg-gray-100 text-xs">‹</button>
                  <span className="text-xs font-medium text-gray-600 min-w-[90px] text-center">{monthLabel}</span>
                  <button onClick={() => navMonth(1)} className="border rounded px-1.5 py-0.5 text-gray-500 hover:bg-gray-100 text-xs">›</button>
                </div>
              </div>
              <div className="bg-gray-50 rounded-xl p-4 space-y-1.5">
                <TaxRow label="FOH Hourly (est. 160h/staff/mo)" amount={fohHourlyCost} />
                <TaxRow label="FOH Salaried" amount={fohSalariedCost} />
                <TaxRow label="BOH Salaries"  amount={bohCost} />
                <div className="border-t border-gray-200 mt-2 pt-2">
                  <TaxRow label="Total Gross Labor" amount={totalGrossLabor} bold />
                </div>
              </div>
              <div className="space-y-2">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Tax Rates (adjustable)</p>
                {([
                  { label: "FICA — Employer share",            key: "fica"         as const },
                  { label: "State Unemployment (SUTA/FUTA)",   key: "state_ui"     as const },
                  { label: "Workers' Compensation",            key: "workers_comp" as const },
                ] as const).map(f => (
                  <div key={f.key} className="flex items-center gap-3">
                    <span className="text-sm text-gray-600 flex-1">{f.label}</span>
                    <div className="relative w-24">
                      <input type="number" min="0" max="30" step="0.01" value={rates[f.key]}
                        onChange={e => setRates(r => ({ ...r, [f.key]: parseFloat(e.target.value) || 0 }))}
                        className={`w-full pr-6 text-right ${inp}`} />
                      <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 text-xs">%</span>
                    </div>
                    <span className="text-sm font-medium text-gray-700 w-24 text-right tabular-nums">
                      {fmtUSD(totalGrossLabor * (rates[f.key] / 100))}
                    </span>
                  </div>
                ))}
                <div className="flex items-center gap-3">
                  <span className="text-sm text-gray-600 flex-1">Benefits (health, 401k, etc.)</span>
                  <div className="relative w-24">
                    <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400 text-xs">$</span>
                    <input type="number" min="0" step="1" value={benefits || ""} placeholder="0"
                      onChange={e => setBenefits(parseFloat(e.target.value) || 0)}
                      className={`w-full pl-5 ${inp}`} />
                  </div>
                  <span className="text-sm font-medium text-gray-700 w-24 text-right tabular-nums">{fmtUSD(benefits)}</span>
                </div>
              </div>
              <div className="bg-brand-50 rounded-xl p-4 space-y-1.5">
                <TaxRow label="Total Payroll Taxes & Benefits" amount={totalPayrollTax} color="text-brand-600" />
                <div className="border-t border-brand-100 pt-2">
                  <TaxRow label="Total Labor Cost (incl. taxes)" amount={totalLabor} bold color="text-brand-700" />
                </div>
              </div>
              <button onClick={handleSavePayrollTax} disabled={savingTax}
                className="w-full border-2 border-brand-500 text-brand-600 hover:bg-brand-50 disabled:opacity-50 rounded-xl py-2.5 font-semibold text-sm transition-colors">
                {savingTax ? "Saving…" : savedTax ? "✓ Saved to Monthly Costs" : `Save Payroll Taxes → ${monthLabel}`}
              </button>
            </div>}
            {!isManager && <p className="text-xs text-gray-400 text-center pb-4">
              Rates are estimates. Adjust to match your actual rates. Hourly FOH uses 160h/month for cost estimate here.
            </p>}
          </>
        )}

        {/* ══════════════════ WEEKLY TIMESHEET VIEW ══════════════════ */}
        {view === "timesheet" && (
          <>
            {fohHourly.length === 0 ? (
              <div className="bg-white rounded-2xl border border-gray-200 p-10 text-center">
                <p className="text-4xl mb-3">👥</p>
                <p className="text-gray-500 text-sm">No hourly FOH staff added yet.</p>
                {!isManager && (
                  <button onClick={() => setView("roster")} className="mt-3 text-sm text-teal-400 hover:underline">
                    → Go to Staff Roster to add them
                  </button>
                )}
              </div>
            ) : (
              <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
                {/* Header */}
                <div className="px-5 py-4 flex flex-wrap items-center gap-3"
                  style={{ background: "linear-gradient(135deg,#060b18,#0d1f3c)" }}>
                  <div>
                    <h3 className="font-bold text-white">FOH — Weekly Hours Entry</h3>
                    <p className="text-xs text-amber-300/70 mt-0.5">Enter hours worked per day. Totals flow into Payroll automatically.</p>
                  </div>
                  <div className="ml-auto flex items-center gap-2 flex-wrap">
                    {/* Week nav */}
                    <div className="flex items-center gap-2 bg-white/10 rounded-xl px-3 py-1.5">
                      <button onClick={() => setWeekStart(prev => { const d = new Date(prev); d.setDate(d.getDate()-7); return d; })}
                        className="text-amber-300 hover:text-white font-bold">‹</button>
                      <span className="text-white text-sm font-medium min-w-[170px] text-center">{weekLabel}</span>
                      <button onClick={() => setWeekStart(prev => { const d = new Date(prev); d.setDate(d.getDate()+7); return d; })}
                        className="text-amber-300 hover:text-white font-bold">›</button>
                    </div>
                    <button onClick={saveWeekHours} disabled={savingWeek}
                      className="px-4 py-2 rounded-xl text-sm font-bold disabled:opacity-50 transition-all"
                      style={{ background: "linear-gradient(135deg,#00b896,#00d4a8)", color: "#060b18" }}>
                      {savingWeek ? "Saving…" : savedWeek ? "✓ Saved!" : "💾 Save Hours"}
                    </button>
                  </div>
                </div>

                {/* Week totals summary strip */}
                <div className="grid grid-cols-2 gap-3 px-5 py-3 border-b border-gray-100" style={{ background: "#fdf8f2" }}>
                  <div className="text-center">
                    <p className="text-xs text-gray-400 uppercase tracking-wide">Total Hours This Week</p>
                    <p className="text-lg font-bold text-gray-900">{weekTotalHrs.toFixed(1)}</p>
                  </div>
                  <div className="text-center">
                    <p className="text-xs text-gray-400 uppercase tracking-wide">Week Labor Cost</p>
                    <p className="text-lg font-bold" style={{ color: "#00d4a8" }}>{fmtUSD(weekTotalCost)}</p>
                  </div>
                </div>

                {/* Timesheet table */}
                <div className="overflow-x-auto">
                  <table className="w-full text-sm" style={{ minWidth: "700px" }}>
                    <thead style={{ background: "rgba(0,212,168,0.05)" }}>
                      <tr>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 sticky left-0 bg-inherit">Employee</th>
                        <th className="px-3 py-3 text-center text-xs font-semibold text-gray-500">Rate/hr</th>
                        {dates.map((d, i) => (
                          <th key={d} className={`px-1 py-3 text-center text-xs font-semibold ${isToday(d) ? "text-teal-400" : "text-gray-500"}`}>
                            {fmtDay(d, DAYS[i])}
                          </th>
                        ))}
                        <th className="px-3 py-3 text-center text-xs font-semibold text-gray-600">Total Hrs</th>
                        <th className="px-3 py-3 text-right text-xs font-semibold" style={{ color: "#00d4a8" }}>Week Cost</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {fohHourly.map((s, si) => {
                        const summary = staffWeeklySummary[si];
                        return (
                          <tr key={s.id} className="hover:bg-teal-950/30/30">
                            <td className="px-4 py-3 sticky left-0 bg-white">
                              <p className="font-semibold text-gray-900 text-sm leading-tight">{s.name}</p>
                              <p className="text-xs text-gray-400">{s.position}</p>
                            </td>
                            <td className="px-3 py-3 text-center">
                              <span className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-bold"
                                style={{ background: "#fef3c7", color: "#92400e" }}>
                                ${s.hourly_rate}/hr
                              </span>
                            </td>
                            {dates.map(d => (
                              <td key={d} className={`px-1 py-2 ${isToday(d) ? "bg-teal-950/30/40" : ""}`}>
                                <input
                                  type="number" min="0" max="24" step="0.5"
                                  value={weekHours[s.id]?.[d] ?? ""}
                                  placeholder="—"
                                  onChange={e => setWeekHours(prev => ({
                                    ...prev,
                                    [s.id]: { ...prev[s.id], [d]: e.target.value }
                                  }))}
                                  className="w-14 text-center rounded-md border border-gray-200 px-1 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-teal-400 bg-white"
                                />
                              </td>
                            ))}
                            <td className="px-3 py-3 text-center">
                              <p className="font-bold text-gray-900 text-sm">{summary.totalHrs.toFixed(1)}<span className="text-xs text-gray-400 font-normal"> hrs</span></p>
                            </td>
                            <td className="px-3 py-3 text-right">
                              <p className="font-bold text-sm" style={{ color: "#00d4a8" }}>{fmtUSD2(summary.totalCost)}</p>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                    <tfoot>
                      <tr style={{ background: "linear-gradient(135deg,#060b18,#0d1f3c)" }}>
                        <td colSpan={2} className="px-4 py-3 text-xs font-bold text-amber-300 uppercase tracking-wide">Week Total</td>
                        {dates.map(d => {
                          const dayTotal = fohHourly.reduce((s, st) => s + (parseFloat(weekHours[st.id]?.[d] ?? "0") || 0), 0);
                          return (
                            <td key={d} className="px-1 py-3 text-center">
                              <p className="text-xs font-bold text-white">{dayTotal.toFixed(1)}</p>
                            </td>
                          );
                        })}
                        <td className="px-3 py-3 text-center">
                          <p className="text-sm font-bold text-white">{weekTotalHrs.toFixed(1)}</p>
                        </td>
                        <td className="px-3 py-3 text-right">
                          <p className="text-sm font-bold" style={{ color: "#00d4a8" }}>{fmtUSD2(weekTotalCost)}</p>
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>

                <div className="px-5 py-3 text-xs text-gray-400 border-t border-gray-100">
                  Hours are pulled automatically into Payroll for disbursement.
                </div>
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}

/* ─── Shared sub-components ─────────────────────────────────────────────────── */
function TaxRow({ label, amount, bold, color }: { label: string; amount: number; bold?: boolean; color?: string }) {
  const fmt = (n: number) =>
    new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n);
  return (
    <div className="flex items-center justify-between">
      <span className={`text-sm ${bold ? "font-semibold text-gray-800" : "text-gray-600"}`}>{label}</span>
      <span className={`text-sm tabular-nums ${bold ? "font-bold" : "font-medium"} ${color ?? "text-gray-700"}`}>{fmt(amount)}</span>
    </div>
  );
}
