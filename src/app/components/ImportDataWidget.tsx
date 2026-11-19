"use client";
import { useState, useRef, useCallback } from "react";

interface Location { id: string; name: string; code: string; }

interface ImportResult {
  ok: boolean;
  location: { id: string; name: string };
  totalInserted: number;
  results: Record<string, { inserted: number; errors: string[] }>;
  errors?: string[];
}

export default function ImportDataWidget({ locations }: { locations: Location[] }) {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<"upload" | "preview" | "done">("upload");
  const [locationId, setLocationId] = useState(locations[0]?.id ?? "");
  const [file, setFile] = useState<File | null>(null);
  const [dragging, setDragging] = useState(false);
  const [preview, setPreview] = useState<{ sheets: string[]; rowCounts: Record<string, number>; location: { name: string } } | null>(null);
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [error, setError] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  const SHEET_LABELS: Record<string, string> = {
    daily_sales: "Daily Sales", food_deliveries: "Food Deliveries",
    invoice_line_items: "Invoice Line Items", payroll_entries: "Payroll Entries",
    payroll_line_items: "Payroll Line Items", infrastructure: "Infrastructure",
    payroll_taxes: "Payroll Taxes", safe_cash: "Safe Cash",
  };

  const reset = () => {
    setStep("upload"); setFile(null); setPreview(null);
    setResult(null); setError(""); setDragging(false);
    if (fileRef.current) fileRef.current.value = "";
  };

  const handleFile = useCallback((f: File) => {
    if (!f.name.endsWith(".xlsx") && !f.name.endsWith(".xls")) {
      setError("Please upload an .xlsx file exported from CashCall."); return;
    }
    setFile(f); setError("");
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault(); setDragging(false);
    const f = e.dataTransfer.files[0];
    if (f) handleFile(f);
  }, [handleFile]);

  const handlePreview = async () => {
    if (!file || !locationId) { setError("Select a location and upload a file."); return; }
    setError(""); setImporting(true);
    try {
      const fd = new FormData();
      fd.append("location_id", locationId);
      fd.append("file", file);
      fd.append("preview", "true");
      const res = await fetch("/api/import/location", { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Preview failed");
      setPreview(data);
      setStep("preview");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Preview failed");
    } finally {
      setImporting(false);
    }
  };

  const handleImport = async () => {
    if (!file || !locationId) return;
    setImporting(true); setError("");
    try {
      const fd = new FormData();
      fd.append("location_id", locationId);
      fd.append("file", file);
      const res = await fetch("/api/import/location", { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Import failed");
      setResult(data);
      setStep("done");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Import failed");
    } finally {
      setImporting(false);
    }
  };

  if (!open) {
    return (
      <button onClick={() => setOpen(true)}
        className="flex items-center gap-2 text-sm font-semibold rounded-xl px-4 py-2.5 transition-all hover:opacity-80 whitespace-nowrap"
        style={{ background: "rgba(16,185,129,0.15)", border: "1px solid rgba(16,185,129,0.35)", color: "#34d399" }}>
        📥 Import Data
      </button>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,0.75)" }}
      onClick={e => { if (e.target === e.currentTarget) { setOpen(false); reset(); } }}>
      <div className="w-full max-w-lg rounded-3xl overflow-hidden shadow-2xl"
        style={{ background: "#0a0f1e", border: "1px solid rgba(0,212,168,0.2)" }}>
        {/* Header */}
        <div className="px-6 py-5 flex items-center justify-between" style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
          <div>
            <h2 className="text-lg font-bold text-white">📥 Import Location Data</h2>
            <p className="text-xs text-gray-400 mt-0.5">Upload a CashCall Excel export to restore or populate all data categories</p>
          </div>
          <button onClick={() => { setOpen(false); reset(); }} className="text-gray-500 hover:text-white text-2xl leading-none">×</button>
        </div>

        <div className="px-6 py-5 space-y-5">
          {/* Step indicators */}
          <div className="flex items-center gap-2 text-xs">
            {(["upload", "preview", "done"] as const).map((s, i) => (
              <div key={s} className="flex items-center gap-2">
                {i > 0 && <div className="w-8 h-px" style={{ background: step === "upload" && s !== "upload" ? "rgba(255,255,255,0.1)" : "rgba(0,212,168,0.4)" }} />}
                <span className={`px-2.5 py-1 rounded-full font-semibold transition-colors ${step === s ? "text-teal-900" : step > s ? "text-teal-400" : "text-gray-500"}`}
                  style={step === s ? { background: "#00d4a8" } : {}}>
                  {i + 1}. {s === "upload" ? "Select File" : s === "preview" ? "Preview" : "Done"}
                </span>
              </div>
            ))}
          </div>

          {/* ── STEP 1: Upload ── */}
          {step === "upload" && (
            <>
              {/* Location selector */}
              {locations.length > 1 && (
                <div>
                  <label className="text-xs font-semibold text-gray-400 mb-1.5 block">Import data for:</label>
                  <select value={locationId} onChange={e => setLocationId(e.target.value)}
                    className="w-full rounded-xl border text-sm px-3 py-2 focus:outline-none focus:ring-2 focus:ring-teal-400"
                    style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.12)", color: "#e2e8f0" }}>
                    {locations.map(l => (
                      <option key={l.id} value={l.id} style={{ background: "#0a0f1e" }}>{l.name} ({l.code})</option>
                    ))}
                  </select>
                </div>
              )}

              {/* Drop zone */}
              <div
                onDrop={handleDrop}
                onDragOver={e => { e.preventDefault(); setDragging(true); }}
                onDragLeave={() => setDragging(false)}
                onClick={() => fileRef.current?.click()}
                className="rounded-2xl flex flex-col items-center justify-center gap-3 py-10 cursor-pointer transition-all"
                style={{
                  border: `2px dashed ${dragging ? "#00d4a8" : file ? "#00b896" : "rgba(255,255,255,0.15)"}`,
                  background: dragging ? "rgba(0,212,168,0.05)" : file ? "rgba(0,212,168,0.03)" : "rgba(255,255,255,0.02)",
                }}>
                <span className="text-4xl">{file ? "✅" : "📊"}</span>
                {file ? (
                  <div className="text-center">
                    <p className="text-sm font-semibold text-white">{file.name}</p>
                    <p className="text-xs text-gray-400">{(file.size / 1024).toFixed(0)} KB · Click to change</p>
                  </div>
                ) : (
                  <div className="text-center">
                    <p className="text-sm font-semibold text-gray-300">Drop your CashCall .xlsx export here</p>
                    <p className="text-xs text-gray-500 mt-1">or click to browse · Supports multi-sheet exports</p>
                  </div>
                )}
                <input ref={fileRef} type="file" accept=".xlsx,.xls" className="hidden"
                  onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); }} />
              </div>

              <div className="rounded-xl p-3 text-xs text-gray-400" style={{ background: "rgba(0,212,168,0.04)", border: "1px solid rgba(0,212,168,0.12)" }}>
                <strong className="text-teal-400">What gets imported:</strong> Daily Sales, Food Deliveries, Invoice Line Items, Payroll Entries, Payroll Line Items, Infrastructure, Payroll Taxes, Safe Cash
              </div>

              {error && <p className="text-red-400 text-xs">{error}</p>}

              <div className="flex gap-3">
                <button onClick={() => { setOpen(false); reset(); }}
                  className="flex-1 rounded-xl py-2.5 text-sm font-semibold text-gray-400 transition-colors hover:text-white"
                  style={{ border: "1px solid rgba(255,255,255,0.1)" }}>
                  Cancel
                </button>
                <button onClick={handlePreview} disabled={!file || !locationId || importing}
                  className="flex-1 rounded-xl py-2.5 text-sm font-bold text-white disabled:opacity-40 transition-all"
                  style={{ background: "linear-gradient(135deg,#00b896,#00d4a8)" }}>
                  {importing ? "Analyzing…" : "Preview →"}
                </button>
              </div>
            </>
          )}

          {/* ── STEP 2: Preview ── */}
          {step === "preview" && preview && (
            <>
              <div className="rounded-xl overflow-hidden" style={{ border: "1px solid rgba(0,212,168,0.2)" }}>
                <div className="px-4 py-3" style={{ background: "rgba(0,212,168,0.08)", borderBottom: "1px solid rgba(0,212,168,0.1)" }}>
                  <p className="text-xs font-bold text-teal-400">Importing into: {preview.location.name}</p>
                  <p className="text-xs text-gray-400 mt-0.5">{preview.sheets.length} sheet{preview.sheets.length !== 1 ? "s" : ""} found in file</p>
                </div>
                <div className="divide-y divide-white/5">
                  {preview.sheets.map(sheet => {
                    const count = preview.rowCounts[sheet] ?? 0;
                    const label = SHEET_LABELS[sheet] ?? sheet.replace(/_/g, " ");
                    return (
                      <div key={sheet} className="px-4 py-2.5 flex items-center justify-between">
                        <span className="text-sm text-gray-300 capitalize">{label}</span>
                        <span className="text-xs font-semibold px-2 py-0.5 rounded-full"
                          style={{ background: count > 0 ? "rgba(0,212,168,0.15)" : "rgba(255,255,255,0.05)", color: count > 0 ? "#00d4a8" : "#6b7280" }}>
                          {count} row{count !== 1 ? "s" : ""}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="rounded-xl p-3 text-xs" style={{ background: "rgba(249,115,22,0.08)", border: "1px solid rgba(249,115,22,0.2)" }}>
                <p className="text-orange-400 font-semibold mb-0.5">⚠ This will upsert (merge) data</p>
                <p className="text-gray-400">Existing records for the same dates/periods will be updated, not duplicated. New records will be added.</p>
              </div>

              {error && <p className="text-red-400 text-xs">{error}</p>}

              <div className="flex gap-3">
                <button onClick={reset}
                  className="flex-1 rounded-xl py-2.5 text-sm font-semibold text-gray-400 transition-colors hover:text-white"
                  style={{ border: "1px solid rgba(255,255,255,0.1)" }}>
                  ← Back
                </button>
                <button onClick={handleImport} disabled={importing}
                  className="flex-1 rounded-xl py-2.5 text-sm font-bold text-white disabled:opacity-40 transition-all"
                  style={{ background: "linear-gradient(135deg,#059669,#10b981)" }}>
                  {importing ? "Importing…" : "✓ Confirm Import"}
                </button>
              </div>
            </>
          )}

          {/* ── STEP 3: Done ── */}
          {step === "done" && result && (
            <>
              <div className="text-center py-4">
                <div className="text-5xl mb-3">{result.ok ? "✅" : "⚠️"}</div>
                <p className="text-lg font-bold text-white">{result.ok ? "Import Complete!" : "Import Finished with Warnings"}</p>
                <p className="text-sm text-gray-400 mt-1">
                  {result.totalInserted} record{result.totalInserted !== 1 ? "s" : ""} imported into <strong className="text-teal-400">{result.location.name}</strong>
                </p>
              </div>

              <div className="rounded-xl overflow-hidden" style={{ border: "1px solid rgba(255,255,255,0.06)" }}>
                {Object.entries(result.results).filter(([,r]) => r.inserted > 0 || r.errors.length > 0).map(([key, r]) => (
                  <div key={key} className="px-4 py-2 flex items-center justify-between border-b last:border-0"
                    style={{ borderColor: "rgba(255,255,255,0.05)" }}>
                    <span className="text-xs text-gray-400 capitalize">{SHEET_LABELS[key] ?? key.replace(/_/g, " ")}</span>
                    <div className="flex items-center gap-2">
                      {r.inserted > 0 && (
                        <span className="text-xs font-semibold text-teal-400">+{r.inserted}</span>
                      )}
                      {r.errors.length > 0 && (
                        <span className="text-xs text-red-400">{r.errors.length} err</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              {result.errors && result.errors.length > 0 && (
                <div className="rounded-xl p-3 text-xs text-red-300 space-y-0.5" style={{ background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.2)" }}>
                  {result.errors.slice(0, 3).map((e, i) => <p key={i}>{e}</p>)}
                  {result.errors.length > 3 && <p className="text-gray-500">+{result.errors.length - 3} more</p>}
                </div>
              )}

              <button onClick={() => { setOpen(false); reset(); window.location.reload(); }}
                className="w-full rounded-xl py-2.5 text-sm font-bold text-white"
                style={{ background: "linear-gradient(135deg,#00b896,#00d4a8)" }}>
                Done — Refresh Dashboard
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
