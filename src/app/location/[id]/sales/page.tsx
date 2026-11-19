"use client";

import { useEffect, useState, useCallback, useMemo, useRef } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { useAuthGuard } from "@/lib/useAuthGuard";
import PrintPDFButton from "@/app/components/PrintPDFButton";
import MobileBottomNav from "@/app/components/MobileBottomNav";

// ─── Sales channels (non-catering) ───────────────────────────────────────────
const BASE_CHANNELS = [
  { key: "cash_sales",        label: "Cash Sales",        icon: "💵", cashContrib: true },
  { key: "pos_sales",         label: "POS Sales",         icon: "💳" },
  { key: "liquor_sales",      label: "Liquor Sales",      icon: "🍷" },
  { key: "uber_eats_gross",   label: "Uber Eats (gross)", icon: "🛵", commission: true },
  { key: "grubhub_gross",     label: "Grubhub (gross)",   icon: "🟠", commission: true },
  { key: "doordash_gross",    label: "DoorDash (gross)",  icon: "🔴", commission: true },
  { key: "cash_tips",         label: "Cash Tips",         icon: "💰" },
  { key: "safe_cash_balance", label: "Safe Cash (closing)",icon: "🔒", balanceOnly: true },
];

// Catering is broken into payment methods
const CATERING_KEYS = [
  { key: "catering_cash",   label: "Catering — Cash",   icon: "💵", cashContrib: true },
  { key: "catering_card",   label: "Catering — Card",   icon: "💳" },
  { key: "catering_cheque", label: "Catering — Cheque", icon: "🏦" },
];

const ALL_CHANNELS = [...BASE_CHANNELS.filter(c => !c.balanceOnly), ...CATERING_KEYS];
const ALL_KEYS = [...BASE_CHANNELS, ...CATERING_KEYS].map(c => c.key);

const DISBURSE_CATS = [
  "Salaries / Wages", "Rent", "Maintenance & Repairs",
  "Supplies", "Utilities", "Food Purchase", "Other Expense",
];

const emptyDay = () => Object.fromEntries(ALL_KEYS.map(k => [k, ""]));
const fmt  = (n: number) => "$" + Math.round(n).toLocaleString();
const fmtD = (n: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2 }).format(n);

function getDaysInMonth(year: number, month: number) {
  const days: { key: string; d: number; dow: string; isWeekend: boolean }[] = [];
  const total = new Date(year, month, 0).getDate();
  for (let d = 1; d <= total; d++) {
    const date = new Date(year, month - 1, d);
    const key  = `${year}-${String(month).padStart(2,"0")}-${String(d).padStart(2,"0")}`;
    const dow  = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"][date.getDay()];
    days.push({ key, d, dow, isWeekend: date.getDay() === 0 || date.getDay() === 6 });
  }
  return days;
}

interface Disbursement {
  id: string; disbursed_on: string; amount: number; category: string; notes: string | null;
}

// ─── Component ───────────────────────────────────────────────────────────────
export default function SalesPage() {
  const { id } = useParams<{ id: string }>();
  const supabase = useMemo(() => createClient(), []);
  const { ready } = useAuthGuard();
  const now = new Date();

  const [activeTab, setActiveTab] = useState<"sales" | "safecash" | "scan" | "csv">("sales");

  // CSV Import state
  const csvSalesRef = useRef<HTMLInputElement>(null);
  const [csvRows, setCsvRows] = useState<Record<string, string>[]>([]);
  const [csvImporting, setCsvImporting] = useState(false);
  const [csvStatus, setCsvStatus] = useState("");
  const [year, setYear]   = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [rows, setRows]   = useState<Record<string, Record<string, string>>>({});
  const [saving, setSaving] = useState<string | null>(null);
  const [saved, setSaved]   = useState<string | null>(null);
  const [locationName, setLocationName] = useState("");

  // Sales OCR state
  const [ocrFiles, setOcrFiles] = useState<File[]>([]);
  const [ocrDate, setOcrDate] = useState(now.toISOString().slice(0, 10));
  const [ocrScanning, setOcrScanning] = useState(false);
  const [ocrResult, setOcrResult] = useState<Record<string, string> | null>(null);
  const [ocrStatus, setOcrStatus] = useState("");
  const [ocrSaving, setOcrSaving] = useState(false);
  const ocrFileRef = useRef<HTMLInputElement>(null);

  // Safe cash
  const [disbursements, setDisbursements] = useState<Disbursement[]>([]);
  const [totalCashIn, setTotalCashIn] = useState(0);
  const [disbForm, setDisbForm] = useState({
    date: now.toISOString().slice(0,10), amount: "", category: DISBURSE_CATS[0], notes: "",
  });
  const [disbSaving, setDisbSaving] = useState(false);
  const [disbError,  setDisbError]  = useState("");

  const days = getDaysInMonth(year, month);
  const monthStart = `${year}-${String(month).padStart(2,"0")}-01`;
  const monthEnd   = new Date(year, month, 1).toISOString().slice(0,10);

  useEffect(() => {
    supabase.from("locations").select("name").eq("id", id).single()
      .then(({ data }) => setLocationName(data?.name ?? ""));
  }, [id]);

  // Load sales rows
  useEffect(() => {
    supabase.from("daily_sales")
      .select("sale_date,cash_sales,pos_sales,liquor_sales,uber_eats_gross,grubhub_gross,doordash_gross,catering_cash,catering_card,catering_cheque,cash_tips,safe_cash_balance")
      .eq("location_id", id).gte("sale_date", monthStart).lt("sale_date", monthEnd)
      .then(({ data }) => {
        const init: Record<string, Record<string, string>> = {};
        let cashTotal = 0;
        for (const row of data ?? []) {
          const r: Record<string, string> = {};
          for (const k of ALL_KEYS) r[k] = String((row as any)[k] ?? "");
          init[row.sale_date] = r;
          // Safe cash = cash_sales + catering_cash + cash_tips (all physical cash)
          cashTotal += (parseFloat(String(row.cash_sales ?? 0)) || 0)
                     + (parseFloat(String(row.catering_cash ?? 0)) || 0)
                     + (parseFloat(String(row.cash_tips ?? 0)) || 0);
        }
        setRows(init);
        setTotalCashIn(cashTotal);
      });
  }, [id, year, month]);

  // Load disbursements
  useEffect(() => {
    supabase.from("safe_cash_disbursements")
      .select("id,disbursed_on,amount,category,notes")
      .eq("location_id", id).gte("disbursed_on", monthStart).lt("disbursed_on", monthEnd)
      .order("disbursed_on", { ascending: true })
      .then(({ data }) => setDisbursements((data ?? []) as Disbursement[]));
  }, [id, year, month, disbSaving]);

  const handleChange = (date: string, key: string, val: string) => {
    setRows(prev => ({ ...prev, [date]: { ...(prev[date] ?? emptyDay()), [key]: val } }));
  };

  const saveDay = useCallback(async (date: string) => {
    const r = rows[date] ?? {};
    const n = (k: string) => parseFloat(r[k]) || 0;

    const cateringTotal = n("catering_cash") + n("catering_card") + n("catering_cheque");

    const payload = {
      location_id:      id,
      sale_date:        date,
      cash_sales:       n("cash_sales"),
      pos_sales:        n("pos_sales"),
      liquor_sales:     n("liquor_sales"),
      uber_eats_gross:  n("uber_eats_gross"),
      grubhub_gross:    n("grubhub_gross"),
      doordash_gross:   n("doordash_gross"),
      catering_cash:    n("catering_cash"),
      catering_card:    n("catering_card"),
      catering_cheque:  n("catering_cheque"),
      catering_sales:   cateringTotal,      // keep legacy column in sync
      cash_tips:        n("cash_tips"),
      safe_cash_balance: r.safe_cash_balance !== "" ? parseFloat(r.safe_cash_balance) : null,
      gross_sales: 0, net_sales: 0, tax_collected: 0,
    };

    setSaving(date);
    await supabase.from("daily_sales").upsert(payload, { onConflict: "location_id,sale_date" });
    setSaving(null); setSaved(date); setTimeout(() => setSaved(null), 1500);

    // Recompute safe cash total (cash_sales + catering_cash + cash_tips = physical cash in safe)
    const next = { ...rows, [date]: r };
    let total = 0;
    for (const row of Object.values(next)) {
      total += (parseFloat(row.cash_sales) || 0)
             + (parseFloat(row.catering_cash) || 0)
             + (parseFloat(row.cash_tips) || 0);
    }
    setTotalCashIn(total);
  }, [rows, id, supabase]);

  // ── Daily net total — aggregators net of 30% commission ─────────────────────
  const dayTotal = (date: string) => {
    const r = rows[date] ?? {};
    const n = (k: string) => parseFloat(r[k]) || 0;
    const aggNet = (n("uber_eats_gross") + n("grubhub_gross") + n("doordash_gross")) * 0.7;
    return n("cash_sales") + n("pos_sales") + n("liquor_sales") + aggNet
         + n("catering_cash") + n("catering_card") + n("catering_cheque")
         + n("cash_tips");
  };

  // ── Month totals ──────────────────────────────────────────────────────────
  const MT = days.reduce((acc, { key }) => {
    const r = rows[key] ?? {};
    const n = (k: string) => parseFloat(r[k]) || 0;
    return {
      cash:           acc.cash           + n("cash_sales"),
      pos:            acc.pos            + n("pos_sales"),
      liquor:         acc.liquor         + n("liquor_sales"),
      uber:           acc.uber           + n("uber_eats_gross"),
      grub:           acc.grub           + n("grubhub_gross"),
      door:           acc.door           + n("doordash_gross"),
      cat_cash:       acc.cat_cash       + n("catering_cash"),
      cat_card:       acc.cat_card       + n("catering_card"),
      cat_cheque:     acc.cat_cheque     + n("catering_cheque"),
      tips:           acc.tips           + n("cash_tips"),
    };
  }, { cash:0,pos:0,liquor:0,uber:0,grub:0,door:0,cat_cash:0,cat_card:0,cat_cheque:0,tips:0 });
  const totalCatering  = MT.cat_cash + MT.cat_card + MT.cat_cheque;
  const cateringIncentive = totalCatering * 0.08;
  const monthNetTotal  = days.reduce((s, { key }) => s + dayTotal(key), 0);

  const nav = (delta: number) => {
    let m = month + delta, y = year;
    if (m > 12) { m = 1; y++; } if (m < 1) { m = 12; y--; }
    setMonth(m); setYear(y);
  };
  const monthLabel = new Date(year, month - 1, 1).toLocaleDateString("en-US", { month: "long", year: "numeric" });

  // ── Safe cash ─────────────────────────────────────────────────────────────
  const totalDisbursed = disbursements.reduce((s, d) => s + Number(d.amount), 0);
  const safeBalance    = totalCashIn - totalDisbursed;

  const addDisbursement = async () => {
    setDisbError("");
    const amt = parseFloat(disbForm.amount);
    if (!amt || amt <= 0) { setDisbError("Enter a valid amount greater than 0."); return; }
    if (!disbForm.date)   { setDisbError("Select a disbursement date."); return; }
    if (amt > safeBalance) { setDisbError(`Amount exceeds safe balance of ${fmtD(safeBalance)}.`); return; }
    setDisbSaving(true);
    const { error } = await supabase.from("safe_cash_disbursements").insert({
      location_id: id, disbursed_on: disbForm.date, amount: amt,
      category: disbForm.category, notes: disbForm.notes || null,
    });
    setDisbSaving(false);
    if (error) { setDisbError(error.message); return; }
    setDisbForm({ date: now.toISOString().slice(0,10), amount: "", category: DISBURSE_CATS[0], notes: "" });
    const { data } = await supabase.from("safe_cash_disbursements")
      .select("id,disbursed_on,amount,category,notes")
      .eq("location_id", id).gte("disbursed_on", monthStart).lt("disbursed_on", monthEnd)
      .order("disbursed_on", { ascending: true });
    setDisbursements((data ?? []) as Disbursement[]);
  };

  const deleteDisbursement = async (diId: string) => {
    if (!confirm("Delete this disbursement record?")) return;
    await supabase.from("safe_cash_disbursements").delete().eq("id", diId);
    setDisbursements(prev => prev.filter(d => d.id !== diId));
  };

  const inputCls = "w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-400 bg-white";

  // ── Sales OCR scan ────────────────────────────────────────────────────────
  const runSalesOcr = useCallback(async () => {
    if (!ocrFiles.length) { setOcrStatus("⚠️ Please select at least one file."); return; }
    // Guard: reject unsupported image types (Anthropic supports jpeg/png/gif/webp + pdf)
    const SUPPORTED = new Set(["image/jpeg","image/jpg","image/png","image/gif","image/webp","application/pdf"]);
    const bad = ocrFiles.filter(f => f.type && !SUPPORTED.has(f.type.toLowerCase()));
    if (bad.length) {
      setOcrStatus(`⚠️ Unsupported format: ${bad.map(f => f.name).join(", ")}. Use JPG, PNG, WebP, or PDF.`);
      return;
    }
    setOcrScanning(true);
    setOcrResult(null);
    setOcrStatus("Scanning…");
    try {
      // Convert files to base64 — preserve MIME so API routes PDFs vs images correctly
      const images: { type: string; data: string }[] = await Promise.all(
        ocrFiles.map(f => new Promise<{ type: string; data: string }>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => {
            const b64 = (reader.result as string).split(",")[1];
            resolve({ type: f.type || "image/jpeg", data: b64 });
          };
          reader.onerror = reject;
          reader.readAsDataURL(f);
        }))
      );
      const res = await fetch("/api/sales-ocr", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ images, date: ocrDate }),
      });
      if (!res.ok) throw new Error(`OCR failed: ${res.status}`);
      const json = await res.json();
      setOcrResult(json.sales ?? {});
      // Auto-update date if AI reads it from the document
      if (json.date && /^\d{4}-\d{2}-\d{2}$/.test(json.date)) {
        setOcrDate(json.date);
        setOcrStatus(`✓ Scan complete — date detected: ${json.date}. Review and apply below.`);
      } else {
        setOcrStatus("✓ Scan complete — review and apply below.");
      }
    } catch (e) {
      setOcrStatus("✗ " + (e instanceof Error ? e.message : "Scan failed"));
    } finally {
      setOcrScanning(false);
    }
  }, [ocrFiles, ocrDate]);

  const applySalesOcr = useCallback(async () => {
    if (!ocrResult || !ocrDate) return;
    setOcrSaving(true);
    try {
      // Build merged row for this date using the document's extracted date
      const r: Record<string, string> = {
        ...(rows[ocrDate] ?? {}),
        ...Object.fromEntries(
          Object.entries(ocrResult).filter(([k]) => ALL_KEYS.includes(k)).map(([k, v]) => [k, String(v)])
        ),
      };
      const n = (k: string) => parseFloat(r[k]) || 0;
      const cateringTotal = n("catering_cash") + n("catering_card") + n("catering_cheque");

      // Save directly to Supabase using the date from the document, not today's date
      const payload = {
        location_id:      id,
        sale_date:        ocrDate,
        cash_sales:       n("cash_sales"),
        pos_sales:        n("pos_sales"),
        liquor_sales:     n("liquor_sales"),
        uber_eats_gross:  n("uber_eats_gross"),
        grubhub_gross:    n("grubhub_gross"),
        doordash_gross:   n("doordash_gross"),
        catering_cash:    n("catering_cash"),
        catering_card:    n("catering_card"),
        catering_cheque:  n("catering_cheque"),
        catering_sales:   cateringTotal,
        cash_tips:        n("cash_tips"),
        safe_cash_balance: r.safe_cash_balance !== "" ? parseFloat(r.safe_cash_balance) : null,
        gross_sales: 0, net_sales: 0, tax_collected: 0,
      };
      await supabase.from("daily_sales").upsert(payload, { onConflict: "location_id,sale_date" });

      // Update local state so the row is immediately visible in the table
      setRows(prev => ({ ...prev, [ocrDate]: r }));

      // Navigate to the month that contains the document's date
      const d = new Date(ocrDate + "T00:00:00");
      setYear(d.getFullYear()); setMonth(d.getMonth() + 1);

      setOcrStatus(`✓ Saved! Sales for ${ocrDate} recorded from document date.`);
      setActiveTab("sales");
    } catch (e) {
      setOcrStatus("✗ Save failed: " + (e instanceof Error ? e.message : "Unknown error"));
    } finally {
      setOcrSaving(false);
    }
  }, [ocrResult, ocrDate, rows, id, supabase]);

  // ── CSV Sales Import ─────────────────────────────────────────────────────
  const SALES_COLS = ["cash_sales","pos_sales","liquor_sales","uber_eats_gross","grubhub_gross",
    "doordash_gross","catering_cash","catering_card","catering_cheque","cash_tips"];

  function parseSalesCsv(text: string) {
    const lines = text.split(/\r?\n/).filter(l => l.trim());
    if (lines.length < 2) return [];
    const headers = lines[0].split(",").map(h => h.trim().toLowerCase().replace(/[^a-z0-9_]/g,"_"));
    return lines.slice(1).map(line => {
      const vals = line.split(",");
      const row: Record<string,string> = {};
      headers.forEach((h, i) => { row[h] = (vals[i] ?? "").trim().replace(/^"|"$/g,""); });
      return row;
    }).filter(r => r.sale_date || r.date);
  }

  const handleSalesCsvFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setCsvStatus(""); setCsvRows([]);
    const reader = new FileReader();
    reader.onload = ev => {
      const parsed = parseSalesCsv(ev.target?.result as string);
      if (!parsed.length) { setCsvStatus("⚠️ No valid rows found. Check the CSV format."); return; }
      // Normalize date key
      const rows = parsed.map(r => ({ ...r, sale_date: r.sale_date || r.date || "" }));
      setCsvRows(rows);
      setCsvStatus(`✓ ${rows.length} row${rows.length !== 1 ? "s" : ""} ready to import — review below and click Import.`);
    };
    reader.readAsText(file);
    e.target.value = "";
  };

  const importSalesCsv = async () => {
    if (!csvRows.length) return;
    setCsvImporting(true); setCsvStatus("Importing…");
    try {
      const payloads = csvRows.map(r => {
        const n = (k: string) => parseFloat(r[k] || "0") || 0;
        return {
          location_id: id,
          sale_date: r.sale_date,
          cash_sales: n("cash_sales"), pos_sales: n("pos_sales"),
          liquor_sales: n("liquor_sales"), uber_eats_gross: n("uber_eats_gross"),
          grubhub_gross: n("grubhub_gross"), doordash_gross: n("doordash_gross"),
          catering_cash: n("catering_cash"), catering_card: n("catering_card"),
          catering_cheque: n("catering_cheque"), cash_tips: n("cash_tips"),
          gross_sales: 0, net_sales: 0, tax_collected: 0,
        };
      });
      const { error } = await supabase.from("daily_sales").upsert(payloads, { onConflict: "location_id,sale_date" });
      if (error) throw error;
      // Refresh rows
      const monthData: Record<string, Record<string,string>> = {};
      payloads.forEach(p => { monthData[p.sale_date] = { ...Object.fromEntries(SALES_COLS.map(k => [k, String((p as unknown as Record<string,number>)[k] ?? 0)])) }; });
      setRows(prev => ({ ...prev, ...monthData }));
      setCsvStatus(`✓ Imported ${payloads.length} row${payloads.length !== 1 ? "s" : ""} successfully!`);
      setCsvRows([]);
      setActiveTab("sales");
    } catch (e) {
      setCsvStatus("✗ Import failed: " + (e instanceof Error ? e.message : "Unknown"));
    } finally {
      setCsvImporting(false);
    }
  };

  if (!ready) return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="w-8 h-8 border-2 border-teal-400 border-t-transparent rounded-full animate-spin" />
    </div>
  );

  return (
    <div className="min-h-screen" style={{ background: "#060b18" }}>
      <nav className="sticky top-0 z-40 bg-white border-b border-gray-200 px-4 h-13 flex items-center gap-3 shadow-sm">
        <Link href={`/location/${id}`} className="text-sm text-gray-400 hover:text-gray-700 mr-1">←</Link>
        <span className="font-semibold text-gray-900 text-sm">{locationName}</span>
        <span className="text-gray-300">·</span>
        <span className="text-sm text-gray-500">Sales & Safe Cash</span>
        <div className="ml-auto"><PrintPDFButton title={`Sales-${locationName}-${year}-${month}`} /></div>
      </nav>

      <main className="max-w-full px-4 py-5" id="print-area">

        {/* Controls row */}
        <div className="flex flex-wrap items-center gap-3 mb-5">
          <div className="flex items-center gap-2">
            <button onClick={() => nav(-1)} className="border border-gray-300 rounded-lg px-2.5 py-1.5 text-gray-600 hover:bg-gray-100 text-sm">‹</button>
            <span className="font-semibold text-gray-800 min-w-32 text-center">{monthLabel}</span>
            <button onClick={() => nav(1)}  className="border border-gray-300 rounded-lg px-2.5 py-1.5 text-gray-600 hover:bg-gray-100 text-sm">›</button>
          </div>
          <div className="flex rounded-xl overflow-hidden border border-gray-200 shadow-sm bg-white">
            {([["sales","📊 Daily Sales"],["safecash","🔒 Safe Cash"],["scan","📸 Scan Sales"],["csv","📂 CSV Import"]] as const).map(([tab, label]) => (
              <button key={tab} onClick={() => setActiveTab(tab)}
                className="px-4 py-2 text-sm font-semibold transition-colors"
                style={activeTab === tab
                  ? { background: "linear-gradient(135deg,#00b896,#00d4a8)", color:"white" }
                  : { color:"#6b7280" }}>
                {label}
              </button>
            ))}
          </div>
          {totalCatering > 0 && (
            <div className="flex items-center gap-2 rounded-xl px-4 py-2 border"
              style={{ background:"#fef3c7", borderColor:"#fcd34d" }}>
              <span className="text-xs text-teal-300">🍽️ Chef Incentive (8% catering)</span>
              <span className="font-bold text-teal-200">{fmtD(cateringIncentive)}</span>
            </div>
          )}
        </div>

        {/* ── DAILY SALES TAB ────────────────────────────────────────────── */}
        {activeTab === "sales" && (
          <>
            {/* Safe cash info banner */}
            <div className="mb-3 flex flex-wrap gap-3">
              <div className="rounded-xl px-4 py-2.5 flex items-center gap-3 border"
                style={{ background:"#f0fdf4", borderColor:"#bbf7d0" }}>
                <span className="text-xs font-semibold text-green-700">💵 Safe Cash This Month</span>
                <span className="font-bold text-green-700">{fmtD(totalCashIn)}</span>
                <span className="text-xs text-green-500">= Cash Sales {fmtD(MT.cash)} + Catering Cash {fmtD(MT.cat_cash)} + Tips {fmtD(MT.tips)}</span>
              </div>
            </div>

            <div className="overflow-x-auto rounded-2xl shadow-sm" style={{ border: "1px solid rgba(255,255,255,0.08)", background: "#0a1628" }}>
              <table className="text-xs w-full min-w-max">
                <thead style={{ background:"rgba(0,212,168,0.05)", borderBottom:"2px solid rgba(0,212,168,0.2)" }}>
                  <tr>
                    <th className="sticky left-0 text-left px-3 py-2.5 font-bold text-gray-300 w-16 whitespace-nowrap" style={{ background:"#0a1628" }}>Day</th>
                    {/* Base channels */}
                    <th className="px-2 py-2.5 font-semibold text-gray-400 text-right whitespace-nowrap">💵 Cash Sales</th>
                    <th className="px-2 py-2.5 font-semibold text-gray-400 text-right whitespace-nowrap">💳 POS Sales</th>
                    <th className="px-2 py-2.5 font-semibold text-right whitespace-nowrap" style={{ color:"#a78bfa" }}>🍷 Liquor</th>
                    <th className="px-2 py-2.5 font-semibold text-gray-400 text-right whitespace-nowrap">🛵 Uber Eats*</th>
                    <th className="px-2 py-2.5 font-semibold text-gray-400 text-right whitespace-nowrap">🟠 Grubhub*</th>
                    <th className="px-2 py-2.5 font-semibold text-gray-400 text-right whitespace-nowrap">🔴 DoorDash*</th>
                    {/* Catering sub-fields with highlight */}
                    <th className="px-2 py-2.5 font-bold text-right whitespace-nowrap" style={{ color:"#fbbf24", background:"rgba(251,191,36,0.08)" }}>🍽️ Cat. Cash</th>
                    <th className="px-2 py-2.5 font-bold text-right whitespace-nowrap" style={{ color:"#60a5fa", background:"rgba(96,165,250,0.08)" }}>🍽️ Cat. Card</th>
                    <th className="px-2 py-2.5 font-bold text-right whitespace-nowrap" style={{ color:"#c084fc", background:"rgba(192,132,252,0.08)" }}>🍽️ Cat. Cheque</th>
                    <th className="px-2 py-2.5 font-semibold text-gray-400 text-right whitespace-nowrap">💰 Tips</th>
                    <th className="px-2 py-2.5 font-semibold text-gray-400 text-right whitespace-nowrap">🔒 Safe Bal.</th>
                    <th className="px-3 py-2.5 font-bold text-gray-200 text-right">Net Total</th>
                    <th className="px-3 py-2.5 w-14" />
                  </tr>
                </thead>
                <tbody style={{ borderColor: "rgba(255,255,255,0.06)" }}>
                  {days.map(({ key, d, dow, isWeekend }) => (
                    <tr key={key} className="border-t transition-colors" style={{ borderColor: "rgba(255,255,255,0.05)", background: isWeekend ? "rgba(0,212,168,0.04)" : "transparent" }}
                      onMouseEnter={e => (e.currentTarget.style.background = isWeekend ? "rgba(0,212,168,0.07)" : "rgba(255,255,255,0.02)")}
                      onMouseLeave={e => (e.currentTarget.style.background = isWeekend ? "rgba(0,212,168,0.04)" : "transparent")}>
                      <td className="sticky left-0 px-3 py-1.5 font-semibold whitespace-nowrap text-xs" style={{ background: "#060b18", color: isWeekend ? "#2dd4bf" : "#d1d5db" }}>
                        {dow} {d}
                      </td>
                      {/* Cash + POS sales */}
                      {["cash_sales","pos_sales"].map(k => (
                        <td key={k} className="px-1 py-1">
                          <input type="number" min="0" step="0.01" placeholder="0"
                            value={rows[key]?.[k] ?? ""}
                            onChange={e => handleChange(key, k, e.target.value)}
                            onBlur={() => saveDay(key)}
                            className="w-24 text-right rounded-lg px-2 py-1 text-xs text-gray-200 placeholder-gray-600 focus:outline-none focus:ring-1 focus:ring-teal-500"
                            style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)" }} />
                        </td>
                      ))}
                      {/* Liquor sales */}
                      <td className="px-1 py-1">
                        <input type="number" min="0" step="0.01" placeholder="0"
                          value={rows[key]?.["liquor_sales"] ?? ""}
                          onChange={e => handleChange(key, "liquor_sales", e.target.value)}
                          onBlur={() => saveDay(key)}
                          className="w-24 text-right rounded-lg px-2 py-1 text-xs text-purple-300 placeholder-purple-900 focus:outline-none focus:ring-1 focus:ring-purple-500"
                          style={{ background: "rgba(167,139,250,0.08)", border: "1px solid rgba(167,139,250,0.2)" }} />
                      </td>
                      {["uber_eats_gross","grubhub_gross","doordash_gross"].map(k => (
                        <td key={k} className="px-1 py-1">
                          <input type="number" min="0" step="0.01" placeholder="0"
                            value={rows[key]?.[k] ?? ""}
                            onChange={e => handleChange(key, k, e.target.value)}
                            onBlur={() => saveDay(key)}
                            className="w-24 text-right rounded-lg px-2 py-1 text-xs text-gray-200 placeholder-gray-600 focus:outline-none focus:ring-1 focus:ring-teal-500"
                            style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)" }} />
                        </td>
                      ))}
                      {/* Catering sub-fields */}
                      <td className="px-1 py-1" style={{ background: "rgba(251,191,36,0.05)" }}>
                        <input type="number" min="0" step="0.01" placeholder="0"
                          value={rows[key]?.["catering_cash"] ?? ""}
                          onChange={e => handleChange(key, "catering_cash", e.target.value)}
                          onBlur={() => saveDay(key)}
                          className="w-24 text-right rounded-lg px-2 py-1 text-xs text-amber-300 placeholder-amber-900 focus:outline-none focus:ring-1 focus:ring-amber-500"
                          style={{ background: "rgba(251,191,36,0.08)", border: "1px solid rgba(251,191,36,0.2)" }} />
                      </td>
                      <td className="px-1 py-1" style={{ background: "rgba(96,165,250,0.05)" }}>
                        <input type="number" min="0" step="0.01" placeholder="0"
                          value={rows[key]?.["catering_card"] ?? ""}
                          onChange={e => handleChange(key, "catering_card", e.target.value)}
                          onBlur={() => saveDay(key)}
                          className="w-24 text-right rounded-lg px-2 py-1 text-xs text-blue-300 placeholder-blue-900 focus:outline-none focus:ring-1 focus:ring-blue-500"
                          style={{ background: "rgba(96,165,250,0.08)", border: "1px solid rgba(96,165,250,0.2)" }} />
                      </td>
                      <td className="px-1 py-1" style={{ background: "rgba(192,132,252,0.05)" }}>
                        <input type="number" min="0" step="0.01" placeholder="0"
                          value={rows[key]?.["catering_cheque"] ?? ""}
                          onChange={e => handleChange(key, "catering_cheque", e.target.value)}
                          onBlur={() => saveDay(key)}
                          className="w-24 text-right rounded-lg px-2 py-1 text-xs text-purple-300 placeholder-purple-900 focus:outline-none focus:ring-1 focus:ring-purple-500"
                          style={{ background: "rgba(192,132,252,0.08)", border: "1px solid rgba(192,132,252,0.2)" }} />
                      </td>
                      {/* Tips */}
                      <td className="px-1 py-1">
                        <input type="number" min="0" step="0.01" placeholder="0"
                          value={rows[key]?.["cash_tips"] ?? ""}
                          onChange={e => handleChange(key, "cash_tips", e.target.value)}
                          onBlur={() => saveDay(key)}
                          className="w-24 text-right rounded-lg px-2 py-1 text-xs text-gray-200 placeholder-gray-600 focus:outline-none focus:ring-1 focus:ring-teal-500"
                          style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)" }} />
                      </td>
                      {/* Safe cash balance */}
                      <td className="px-1 py-1">
                        <input type="number" min="0" step="0.01" placeholder="—"
                          value={rows[key]?.["safe_cash_balance"] ?? ""}
                          onChange={e => handleChange(key, "safe_cash_balance", e.target.value)}
                          onBlur={() => saveDay(key)}
                          className="w-24 text-right rounded-lg px-2 py-1 text-xs text-gray-400 placeholder-gray-600 focus:outline-none focus:ring-1 focus:ring-gray-500"
                          style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }} />
                      </td>
                      <td className="px-3 py-1.5 text-right font-semibold whitespace-nowrap" style={{ color: "#e5e7eb" }}>
                        {dayTotal(key) > 0 ? fmt(dayTotal(key)) : <span className="text-gray-600">—</span>}
                      </td>
                      <td className="px-2 py-1.5 text-center">
                        {saving === key ? <span className="text-gray-400 text-xs">…</span>
                          : saved === key ? <span className="text-green-500 text-xs">✓</span>
                          : <button onClick={() => saveDay(key)} className="text-xs text-teal-400 hover:underline">Save</button>}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr style={{ background:"linear-gradient(135deg,#060b18,#0d1f3c)", color:"white" }}>
                    <td className="px-3 py-2.5 font-bold text-xs">MONTH</td>
                    <td className="px-2 py-2.5 text-right font-bold text-teal-400 text-xs">{fmt(MT.cash)}</td>
                    <td className="px-2 py-2.5 text-right text-blue-400 text-xs">{fmt(MT.pos)}</td>
                    <td className="px-2 py-2.5 text-right text-xs" style={{ color:"#c4b5fd" }}>{fmt(MT.liquor)}</td>
                    <td className="px-2 py-2.5 text-right text-gray-300 text-xs">{fmt(MT.uber)}</td>
                    <td className="px-2 py-2.5 text-right text-gray-300 text-xs">{fmt(MT.grub)}</td>
                    <td className="px-2 py-2.5 text-right text-gray-300 text-xs">{fmt(MT.door)}</td>
                    <td className="px-2 py-2.5 text-right text-amber-300 font-bold text-xs">{fmt(MT.cat_cash)}</td>
                    <td className="px-2 py-2.5 text-right text-blue-300 text-xs">{fmt(MT.cat_card)}</td>
                    <td className="px-2 py-2.5 text-right text-purple-300 text-xs">{fmt(MT.cat_cheque)}</td>
                    <td className="px-2 py-2.5 text-right text-gray-300 text-xs">{fmt(MT.tips)}</td>
                    <td className="px-2 py-2.5" />
                    <td className="px-3 py-2.5 text-right font-bold text-white text-xs">{fmt(monthNetTotal)}</td>
                    <td />
                  </tr>
                </tfoot>
              </table>
            </div>

            {/* Legend */}
            <div className="mt-2 flex flex-wrap gap-4 text-xs text-gray-400">
              <span>* Aggregators: enter gross — 30% commission auto-deducted in P&L</span>
              <span className="text-teal-400 font-medium">🔒 Safe Cash = Cash Sales + Catering Cash + Cash Tips</span>
              {totalCatering > 0 && (
                <span className="text-teal-400">🍽️ Total Catering: {fmtD(totalCatering)} (Cash {fmtD(MT.cat_cash)} · Card {fmtD(MT.cat_card)} · Cheque {fmtD(MT.cat_cheque)})</span>
              )}
            </div>
          </>
        )}

        {/* ── SCAN SALES TAB ──────────────────────────────────────────────── */}
        {activeTab === "scan" && (
          <div className="max-w-2xl space-y-5">
            <div className="bg-white rounded-2xl p-6 shadow-sm" style={{ border:"1px solid rgba(255,255,255,0.08)" }}>
              <h3 className="font-bold text-gray-900 mb-1">📸 Scan Daily Sales Report</h3>
              <p className="text-xs text-gray-400 mb-5">
                Upload a photo or PDF of your POS end-of-day report, cash drawer summary, or sales printout. Claude AI will extract the numbers and fill in the daily sales for that date.
              </p>

              {/* Date */}
              <div className="mb-4">
                <label className="text-xs text-gray-500 font-semibold mb-1 block">Sales Date *</label>
                <input type="date" value={ocrDate}
                  onChange={e => setOcrDate(e.target.value)}
                  className={inputCls} style={{ maxWidth: 220 }} />
              </div>

              {/* File upload */}
              <div className="mb-4">
                <label className="text-xs text-gray-500 font-semibold mb-1 block">Upload Photo(s) *</label>
                <input ref={ocrFileRef} type="file" accept="image/*,application/pdf" multiple
                  onChange={e => setOcrFiles(Array.from(e.target.files ?? []))}
                  className="hidden" id="sales-ocr-input" />
                <label htmlFor="sales-ocr-input"
                  className="flex flex-col items-center justify-center gap-2 border-2 border-dashed rounded-xl p-6 cursor-pointer hover:border-amber-400 transition-colors"
                  style={{ borderColor: ocrFiles.length ? "#00d4a8" : "rgba(255,255,255,0.15)", background:"rgba(0,212,168,0.05)" }}>
                  <span className="text-3xl">{ocrFiles.length ? (ocrFiles.some(f => f.type === "application/pdf") ? "📋" : "📄") : "📷"}</span>
                  <span className="text-sm font-semibold text-gray-700">
                    {ocrFiles.length ? `${ocrFiles.length} file${ocrFiles.length > 1 ? "s" : ""} selected` : "Tap to select photos or PDF"}
                  </span>
                  <span className="text-xs text-gray-400">JPG, PNG, WebP or PDF — multiple allowed</span>
                </label>
                {ocrFiles.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-2">
                    {ocrFiles.map((f, i) => (
                      <div key={i} className="flex items-center gap-1 bg-teal-950/30 border border-teal-800 rounded-lg px-2 py-1">
                        <span className="text-xs text-teal-300 font-medium">{f.name}</span>
                        <button onClick={() => setOcrFiles(prev => prev.filter((_, j) => j !== i))}
                          className="text-teal-400 hover:text-red-500 ml-1 text-sm">×</button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Scan button */}
              <button onClick={runSalesOcr} disabled={ocrScanning || !ocrFiles.length}
                className="px-6 py-2.5 rounded-xl text-sm font-bold text-white disabled:opacity-50 transition-colors"
                style={{ background:"linear-gradient(135deg,#00b896,#00d4a8)" }}>
                {ocrScanning ? "🔍 Scanning…" : "🔍 Scan with AI"}
              </button>

              {ocrStatus && (
                <p className={`mt-3 text-sm font-medium ${ocrStatus.startsWith("✗") ? "text-red-600" : ocrStatus.startsWith("✓") ? "text-green-600" : "text-gray-500"}`}>
                  {ocrStatus}
                </p>
              )}
            </div>

            {/* OCR Results */}
            {ocrResult && (
              <div className="bg-white rounded-2xl shadow-sm overflow-hidden" style={{ border:"1px solid rgba(255,255,255,0.08)" }}>
                <div className="px-5 py-4" style={{ background:"#fdf8f2", borderBottom:"1px solid #f0e6d3" }}>
                  <h3 className="font-bold text-gray-900">Extracted Sales — {ocrDate}</h3>
                  <p className="text-xs text-gray-400 mt-0.5">Review the values below before applying. Edit any incorrect fields.</p>
                </div>
                <div className="p-5 grid grid-cols-2 gap-3">
                  {[
                    { key: "cash_sales", label: "💵 Cash Sales", icon: "💵" },
                    { key: "pos_sales", label: "💳 POS Sales", icon: "💳" },
                    { key: "liquor_sales", label: "🍷 Liquor Sales", icon: "🍷" },
                    { key: "uber_eats_gross", label: "🛵 Uber Eats (gross)", icon: "🛵" },
                    { key: "grubhub_gross", label: "🟠 Grubhub (gross)", icon: "🟠" },
                    { key: "doordash_gross", label: "🔴 DoorDash (gross)", icon: "🔴" },
                    { key: "catering_cash", label: "🍽️ Catering Cash", icon: "🍽️" },
                    { key: "catering_card", label: "🍽️ Catering Card", icon: "🍽️" },
                    { key: "catering_cheque", label: "🍽️ Catering Cheque", icon: "🍽️" },
                    { key: "cash_tips", label: "💰 Cash Tips", icon: "💰" },
                  ].map(({ key, label }) => (
                    <div key={key}>
                      <label className="text-xs text-gray-500 mb-1 block">{label}</label>
                      <input type="number" min="0" step="0.01"
                        value={ocrResult[key] ?? ""}
                        onChange={e => setOcrResult(prev => prev ? { ...prev, [key]: e.target.value } : prev)}
                        className={inputCls} />
                    </div>
                  ))}
                </div>
                <div className="px-5 pb-5">
                  <button onClick={applySalesOcr} disabled={ocrSaving}
                    className="w-full py-3 rounded-xl text-sm font-bold text-white disabled:opacity-50"
                    style={{ background:"linear-gradient(135deg,#00b896,#00d4a8)" }}>
                    {ocrSaving ? "Saving to database…" : `✅ Save & Apply to ${ocrDate}`}
                  </button>
                </div>
              </div>
            )}

            {/* Tips */}
            <div className="rounded-xl p-4 text-xs text-teal-300 space-y-1"
              style={{ background:"#fffbeb", border:"1px solid #fcd34d" }}>
              <p className="font-bold">📌 Tips for best results</p>
              <p>• PDFs (emailed Z-reports, Clover/Toast reports) work best — just upload the file</p>
              <p>• For photos: point camera straight at the printout — avoid shadows and glare</p>
              <p>• Include the full page showing all category totals</p>
              <p>• Works with POS Z-reports, Clover day summaries, Toast EOD, and handwritten daily sheets</p>
              <p>• The date is auto-detected from the document — confirm before applying</p>
              <p>• If a field isn't detected, it will be blank — fill it in manually</p>
            </div>
          </div>
        )}

        {/* ── CSV IMPORT TAB ──────────────────────────────────────────────── */}
        {activeTab === "csv" && (
          <div className="max-w-2xl space-y-5">
            <div className="bg-white rounded-2xl p-6 shadow-sm" style={{ border:"1px solid rgba(255,255,255,0.08)" }}>
              <h3 className="font-bold text-gray-900 mb-1">📂 Import Sales from CSV</h3>
              <p className="text-xs text-gray-400 mb-4">
                Upload a CSV file with one row per day. Existing dates are overwritten (upsert). Missing columns default to 0.
              </p>

              {/* Template download */}
              <div className="mb-5 rounded-xl p-4 text-xs space-y-2" style={{ background:"#f0fdf4", border:"1px solid #86efac" }}>
                <p className="font-bold text-green-800">📋 CSV Format</p>
                <code className="block text-green-700 text-[11px] break-all">
                  sale_date,cash_sales,pos_sales,liquor_sales,uber_eats_gross,grubhub_gross,doordash_gross,catering_cash,catering_card,catering_cheque,cash_tips
                </code>
                <code className="block text-green-600 text-[11px]">2026-11-01,1200.00,3400.00,500.00,250.00,180.00,320.00,0,0,0,45.00</code>
                <button
                  onClick={() => {
                    const header = "sale_date,cash_sales,pos_sales,liquor_sales,uber_eats_gross,grubhub_gross,doordash_gross,catering_cash,catering_card,catering_cheque,cash_tips";
                    const example = "2026-11-01,1200.00,3400.00,500.00,250.00,180.00,320.00,0,0,0,45.00";
                    const blob = new Blob([header + "\n" + example], { type: "text/csv" });
                    const a = document.createElement("a"); a.href = URL.createObjectURL(blob);
                    a.download = "sales_import_template.csv"; a.click();
                  }}
                  className="mt-1 text-xs text-green-700 underline hover:text-green-900">
                  ⬇ Download template CSV
                </button>
              </div>

              {/* File picker */}
              <input ref={csvSalesRef} type="file" accept=".csv,text/csv" className="hidden"
                onChange={handleSalesCsvFile} />
              <button onClick={() => csvSalesRef.current?.click()}
                className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold text-white mb-4"
                style={{ background:"linear-gradient(135deg,#00b896,#00d4a8)" }}>
                📂 Choose CSV File
              </button>

              {csvStatus && (
                <p className={`text-sm font-medium mb-4 ${csvStatus.startsWith("✗") ? "text-red-600" : csvStatus.startsWith("✓") ? "text-green-700" : "text-gray-500"}`}>
                  {csvStatus}
                </p>
              )}

              {/* Preview table */}
              {csvRows.length > 0 && (
                <div className="space-y-4">
                  <div className="overflow-x-auto rounded-xl border border-gray-200">
                    <table className="w-full text-xs">
                      <thead style={{ background:"#f8fafc" }}>
                        <tr>
                          {["Date","Cash","POS","Liquor","Uber","Grubhub","DoorDash","Cat.Cash","Cat.Card","Cat.Cheq","Tips"].map(h => (
                            <th key={h} className="px-2 py-2 text-left text-gray-500 font-semibold whitespace-nowrap">{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {csvRows.map((r, i) => (
                          <tr key={i} className={i % 2 === 0 ? "bg-white" : "bg-gray-50"}>
                            <td className="px-2 py-1.5 font-mono font-semibold text-gray-800">{r.sale_date}</td>
                            {["cash_sales","pos_sales","liquor_sales","uber_eats_gross","grubhub_gross","doordash_gross","catering_cash","catering_card","catering_cheque","cash_tips"].map(k => (
                              <td key={k} className="px-2 py-1.5 text-right tabular-nums text-gray-700">
                                {parseFloat(r[k] || "0") ? `$${parseFloat(r[k]).toFixed(2)}` : "—"}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <button onClick={importSalesCsv} disabled={csvImporting}
                    className="w-full py-3 rounded-xl text-sm font-bold text-white disabled:opacity-50"
                    style={{ background:"linear-gradient(135deg,#00b896,#00d4a8)" }}>
                    {csvImporting ? "Importing…" : `✅ Import ${csvRows.length} row${csvRows.length !== 1 ? "s" : ""} into Sales`}
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── SAFE CASH TAB ───────────────────────────────────────────────── */}
        {activeTab === "safecash" && (
          <div className="max-w-3xl space-y-5">
            {/* How safe cash is calculated — transparency */}
            <div className="rounded-2xl p-4 border" style={{ background:"#fffbeb", borderColor:"#fcd34d" }}>
              <p className="text-xs font-bold text-teal-200 mb-1">📌 How Safe Cash is calculated</p>
              <p className="text-xs text-teal-300">
                Safe Cash = <strong>Cash Sales</strong> ({fmtD(MT.cash)}) + <strong>Catering — Cash</strong> ({fmtD(MT.cat_cash)}) + <strong>Cash Tips</strong> ({fmtD(MT.tips)}) = <strong>{fmtD(totalCashIn)}</strong>
              </p>
              <p className="text-xs text-teal-400 mt-0.5">
                Card sales, cheque payments, and aggregator amounts are NOT included — they don't flow through the physical safe.
              </p>
            </div>

            {/* Balance cards */}
            <div className="grid grid-cols-3 gap-4">
              {[
                { label:"Cash Received (month)", value:fmtD(totalCashIn), color:"#16a34a",
                  sub:`Cash ${fmtD(MT.cash)} + Cat. Cash ${fmtD(MT.cat_cash)} + Tips ${fmtD(MT.tips)}` },
                { label:"Total Disbursed",        value:fmtD(totalDisbursed), color:"#dc2626",
                  sub:`${disbursements.length} disbursements` },
                { label:"Current Safe Balance",   value:fmtD(safeBalance),
                  color: safeBalance >= 0 ? "#00d4a8" : "#dc2626",
                  sub: safeBalance < 0 ? "⚠️ Balance is negative!" : "Available in safe" },
              ].map(k => (
                <div key={k.label} className="bg-white rounded-2xl p-5 shadow-sm" style={{ border:"1px solid rgba(255,255,255,0.08)" }}>
                  <p className="text-xs text-gray-400 uppercase tracking-wide">{k.label}</p>
                  <p className="text-xl font-bold mt-1" style={{ color:k.color }}>{k.value}</p>
                  <p className="text-xs text-gray-400 mt-0.5">{k.sub}</p>
                </div>
              ))}
            </div>

            {/* Add disbursement */}
            <div className="bg-white rounded-2xl p-6 shadow-sm" style={{ border:"1px solid rgba(255,255,255,0.08)" }}>
              <h3 className="font-bold text-gray-900 mb-1">Record Disbursement</h3>
              <p className="text-xs text-gray-400 mb-4">All cash paid out of the safe must be recorded here.</p>
              <div className="grid grid-cols-2 gap-3 mb-3">
                <div>
                  <label className="text-xs text-gray-500 font-semibold mb-1 block">Date *</label>
                  <input type="date" value={disbForm.date}
                    onChange={e => setDisbForm(p => ({ ...p, date:e.target.value }))} className={inputCls} />
                </div>
                <div>
                  <label className="text-xs text-gray-500 font-semibold mb-1 block">Amount ($) *</label>
                  <input type="number" min="0" step="0.01" placeholder="0.00"
                    value={disbForm.amount}
                    onChange={e => setDisbForm(p => ({ ...p, amount:e.target.value }))} className={inputCls} />
                </div>
                <div>
                  <label className="text-xs text-gray-500 font-semibold mb-1 block">Category *</label>
                  <select value={disbForm.category}
                    onChange={e => setDisbForm(p => ({ ...p, category:e.target.value }))} className={inputCls}>
                    {DISBURSE_CATS.map(c => <option key={c}>{c}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs text-gray-500 font-semibold mb-1 block">Notes / Description</label>
                  <input type="text" placeholder="e.g. Paid part-time staff wages"
                    value={disbForm.notes}
                    onChange={e => setDisbForm(p => ({ ...p, notes:e.target.value }))} className={inputCls} />
                </div>
              </div>
              {disbError && (
                <p className="text-red-500 text-xs mb-2 font-medium">⚠️ {disbError}</p>
              )}
              <button onClick={addDisbursement} disabled={disbSaving}
                className="px-5 py-2.5 rounded-xl text-sm font-bold text-white disabled:opacity-50"
                style={{ background:"linear-gradient(135deg,#00b896,#00d4a8)" }}>
                {disbSaving ? "Saving…" : "➕ Record Disbursement"}
              </button>
            </div>

            {/* Disbursements ledger */}
            <div className="bg-white rounded-2xl shadow-sm overflow-hidden" style={{ border:"1px solid rgba(255,255,255,0.08)" }}>
              <div className="px-5 py-3.5 flex items-center justify-between"
                style={{ borderBottom:"1px solid #f0e6d3", background:"#fdf8f2" }}>
                <h3 className="font-bold text-gray-900">Disbursement Ledger — {monthLabel}</h3>
                <span className="text-xs text-gray-400">{disbursements.length} records</span>
              </div>
              {disbursements.length === 0 ? (
                <div className="px-5 py-10 text-center text-gray-400 text-sm">
                  No disbursements recorded this month.
                </div>
              ) : (
                <div className="divide-y divide-gray-50">
                  {(() => {
                    let running = totalCashIn;
                    return disbursements.map(d => {
                      running -= Number(d.amount);
                      const bal = running;
                      return (
                        <div key={d.id} className="px-5 py-3 flex items-center gap-4 hover:bg-gray-50">
                          <div className="w-20 flex-shrink-0">
                            <p className="text-xs font-bold text-gray-700">
                              {new Date(d.disbursed_on + "T00:00:00").toLocaleDateString("en-US",{ month:"short", day:"numeric" })}
                            </p>
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-semibold text-gray-900">{d.category}</p>
                            {d.notes && <p className="text-xs text-gray-400 truncate">{d.notes}</p>}
                          </div>
                          <div className="text-right flex-shrink-0">
                            <p className="text-sm font-bold text-red-600">−{fmtD(Number(d.amount))}</p>
                            <p className="text-[10px] text-gray-400">
                              Bal: <span style={{ color: bal >= 0 ? "#00d4a8" : "#dc2626", fontWeight:600 }}>{fmtD(bal)}</span>
                            </p>
                          </div>
                          <button onClick={() => deleteDisbursement(d.id)}
                            className="text-gray-300 hover:text-red-500 transition-colors ml-1 text-xl leading-none"
                            title="Delete record">×</button>
                        </div>
                      );
                    });
                  })()}
                </div>
              )}
              {disbursements.length > 0 && (
                <div className="px-5 py-3.5 flex items-center justify-between font-bold rounded-b-2xl"
                  style={{ background:"linear-gradient(135deg,#060b18,#0d1f3c)", color:"white" }}>
                  <span className="text-sm">Current Safe Balance</span>
                  <span className="text-lg" style={{ color: safeBalance >= 0 ? "#00d4a8" : "#ef4444" }}>
                    {fmtD(safeBalance)}
                  </span>
                </div>
              )}
            </div>
          </div>
        )}
      </main>
      <MobileBottomNav locationId={id} />
    </div>
  );
}
