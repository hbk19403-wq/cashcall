"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import type { FoodCategory, InvoiceLineItem } from "@/lib/types";

interface OCRItem {
  name: string;
  /** Exact text from invoice before normalization (architecture: Phase 2 raw capture) */
  raw_description?: string;
  canonical_name?: string;
  qty: number;
  unit: string;
  unit_price: number | null;
  total: number | null;
  category: string;
  /** Per-item confidence: "high" | "medium" | "low" */
  confidence?: string;
  is_catch_weight?: boolean;
  is_credit?: boolean;
  is_fee?: boolean;
}

interface OCRResult {
  vendor: string;
  invoice_number: string;
  date: string;
  category: string;
  /** @deprecated legacy field from old OCR prompt — mapped automatically */
  hbk_category?: string;
  /** Top-level 0.0–1.0 confidence score for entire document (architecture: Phase 2) */
  confidence_score?: number;
  /** Per-invoice parse confidence: "high" | "medium" | "low" */
  parse_confidence?: string;
  items: OCRItem[];
  subtotal: number | null;
  tax: number | null;
  total: number;
  distributor?: string;
  doc_quality?: string;
}

export interface ApplyData {
  vendor: string;
  invoice_number: string;
  delivery_date: string;
  amount: number;
  category: FoodCategory;
  notes: string;
  lineItems: InvoiceLineItem[];
  /** OCR document confidence score (0.0–1.0) for architecture Phase 2 persistence */
  ocr_confidence_score?: number;
  /** Parsing status for architecture Phase 2 persistence */
  parsing_status?: "parsed" | "low_confidence" | "failed";
}

interface Props {
  pendingFiles: File[];
  onApply: (data: ApplyData) => void;
  onSaveAll?: (items: ApplyData[]) => Promise<void>;
}

const CAT_COLORS: Record<string, string> = {
  MEAT: "#fee2e2", SEAFOOD: "#fde8d8", PRODUCE: "#d1fae5", DAIRY: "#ede9fe",
  DRY_GOODS: "#fef3c7", SPICES: "#fce7f3", RICE: "#dbeafe", GRAINS: "#dbeafe",
  BEVERAGE: "#e0f2fe", SUPPLIES: "#f1f5f9", OTHER: "#f1f5f9", PROTEIN: "#fee2e2",
};

const CAT_LABELS: Record<string, string> = {
  protein:      "🥩 Protein",
  produce:      "🥬 Produce",
  wholesale:    "🏪 Wholesale",
  dry_goods:    "🫘 Dry Goods",
  beverages:    "🧃 Beverages",
  miscellaneous:"🧾 Misc",
  // legacy HBK keys — kept for any existing data
  meat:             "🥩 Protein",
  indianGroceries:  "🥬 Produce",
  restaurantDepot:  "🏪 Wholesale",
  rice:             "🫘 Dry Goods",
};

function parseCategory(raw: string): FoodCategory {
  const s = (raw ?? "").toLowerCase().replace(/[^a-z_]/g, "");
  if (s === "protein" || s.includes("meat") || s.includes("seafood") || s.includes("chicken") || s.includes("beef") || s.includes("lamb") || s.includes("poultry") || s.includes("fish")) return "protein";
  if (s === "produce" || s.includes("produce") || s.includes("vegetable") || s.includes("fruit") || s.includes("herb") || s.includes("salad") || s.includes("indian") || s.includes("grocery") || s.includes("spice")) return "produce";
  if (s === "wholesale" || s.includes("wholesale") || s.includes("depot") || s.includes("sysco") || s.includes("usfood") || s.includes("gordon") || s.includes("costco") || s.includes("sams")) return "wholesale";
  if (s === "dry_goods" || s === "drygoods" || s.includes("rice") || s.includes("grain") || s.includes("flour") || s.includes("dry") || s.includes("can") || s.includes("oil") || s.includes("pantry")) return "dry_goods";
  if (s === "beverages" || s.includes("bever") || s.includes("drink") || s.includes("juice") || s.includes("soda") || s.includes("alcohol") || s.includes("beer") || s.includes("wine")) return "beverages";
  if (s.includes("misc") || s.includes("other") || s.includes("utility") || s.includes("repair") || s.includes("suppli") || s.includes("packag") || s.includes("clean")) return "miscellaneous";
  // For item-level categories that might come through (PROTEIN, PRODUCE, etc.)
  if (s.includes("protein")) return "protein";
  if (s.includes("dairy")) return "wholesale";
  if (s.includes("beverage")) return "beverages";
  return "wholesale"; // safe fallback for unrecognized
}

/** Normalize per-item category to a display string */
function normalizeItemCategory(cat: string): string {
  const s = (cat ?? "").toUpperCase().trim();
  const valid = ["PROTEIN", "SEAFOOD", "PRODUCE", "DAIRY", "DRY_GOODS", "SPICES", "GRAINS", "BEVERAGE", "SUPPLIES", "OTHER"];
  if (valid.includes(s)) return s;
  // try to map common variations
  if (s.includes("MEAT") || s.includes("BEEF") || s.includes("CHICKEN") || s.includes("LAMB")) return "PROTEIN";
  if (s.includes("FISH") || s.includes("SHRIMP") || s.includes("SEA")) return "SEAFOOD";
  if (s.includes("VEG") || s.includes("FRUIT") || s.includes("HERB") || s.includes("PRODUCE")) return "PRODUCE";
  if (s.includes("DAIRY") || s.includes("MILK") || s.includes("CHEESE") || s.includes("EGG")) return "DAIRY";
  if (s.includes("RICE") || s.includes("GRAIN") || s.includes("DRY") || s.includes("OIL") || s.includes("CAN")) return "DRY_GOODS";
  if (s.includes("SPICE") || s.includes("SAUCE") || s.includes("SEASON")) return "SPICES";
  if (s.includes("BREAD") || s.includes("GRAIN") || s.includes("BREAD")) return "GRAINS";
  if (s.includes("DRINK") || s.includes("BEV") || s.includes("JUICE") || s.includes("SODA")) return "BEVERAGE";
  if (s.includes("SUPPLY") || s.includes("SUPPLIES") || s.includes("PACK") || s.includes("CLEAN")) return "SUPPLIES";
  return "OTHER";
}

/** Read a File as base64 string (without data: prefix) */
async function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve((reader.result as string).split(",")[1]);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

/** Load PDF.js from local /public/pdfjs folder */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function loadPdfJs(): Promise<any> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  if ((window as any).pdfjsLib) return (window as any).pdfjsLib;
  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "/pdfjs/pdf.min.js";
    script.onload = () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const lib = (window as any).pdfjsLib;
      lib.GlobalWorkerOptions.workerSrc = "/pdfjs/pdf.worker.min.js";
      resolve(lib);
    };
    script.onerror = () => reject(new Error("Failed to load PDF.js"));
    document.head.appendChild(script);
  });
}

/** Convert ALL pages of a PDF to compressed JPEGs (max 20 pages, 1200px wide for better readability). */
async function pdfToImages(
  file: File,
  onStatus: (s: string) => void
): Promise<{ type: string; data: string }[]> {
  onStatus("Loading PDF renderer…");
  const pdfjsLib = await loadPdfJs();
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  const pageCount = Math.min(pdf.numPages, 40);
  const images: { type: string; data: string }[] = [];
  for (let i = 1; i <= pageCount; i++) {
    onStatus(`Rendering page ${i} of ${pageCount}…`);
    const page = await pdf.getPage(i);
    const baseViewport = page.getViewport({ scale: 1 });
    // Use 1200px wide for better text legibility (was 800px)
    const scale = Math.min(1200 / baseViewport.width, 2.0);
    const viewport = page.getViewport({ scale });
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(viewport.width);
    canvas.height = Math.round(viewport.height);
    await page.render({ canvasContext: canvas.getContext("2d")!, viewport }).promise;
    const data = canvas.toDataURL("image/jpeg", 0.82).split(",")[1];
    images.push({ type: "image/jpeg", data });
  }
  return images;
}

/** Compress a single image file to JPEG at max 1600px, quality 0.82. */
async function compressImage(file: File): Promise<{ type: string; data: string }> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      const MAX = 1600;
      let { width, height } = img;
      if (width > MAX) { height = Math.round(height * MAX / width); width = MAX; }
      const canvas = document.createElement("canvas");
      canvas.width = width; canvas.height = height;
      canvas.getContext("2d")!.drawImage(img, 0, 0, width, height);
      const data = canvas.toDataURL("image/jpeg", 0.82).split(",")[1];
      resolve({ type: "image/jpeg", data });
    };
    img.onerror = reject;
    img.src = url;
  });
}

/** Send files to /api/ocr and return all parsed invoices with top-level confidence score. */
async function scanBatch(
  images: { type: string; data: string }[]
): Promise<OCRResult[]> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 90000); // 90s timeout for large PDFs
  let res: Response;
  try {
    res = await fetch("/api/ocr", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ files: images }),
      signal: controller.signal,
    });
  } catch (fetchErr) {
    if (fetchErr instanceof Error && fetchErr.name === "AbortError") {
      throw new Error("Scan timed out — try fewer pages or a smaller file.");
    }
    throw new Error("Network error — check your connection and try again.");
  } finally {
    clearTimeout(timeoutId);
  }

  const rawText = await res.text();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let data: any;
  try { data = JSON.parse(rawText); }
  catch {
    throw new Error(
      res.status === 413 ? "File too large — try splitting the PDF into smaller sections." :
      `Server error: ${rawText.slice(0, 80)}`
    );
  }
  if (!res.ok) throw new Error(data.error ?? `Error ${res.status}`);
  if (data.error) throw new Error(data.error.message ?? data.error);

  const text: string = data.content[0].text.trim();
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end === -1) return [];
  const parsed = JSON.parse(text.slice(start, end + 1));

  // Extract top-level confidence_score (architecture Phase 2: document-level score)
  const topConfidence: number | undefined = typeof parsed.confidence_score === "number"
    ? parsed.confidence_score
    : undefined;

  // Support both {invoices:[...]} and legacy single-invoice {}
  let invoices: OCRResult[] = [];
  if (Array.isArray(parsed.invoices)) invoices = parsed.invoices;
  else if (parsed.vendor !== undefined) invoices = [parsed];

  // Stamp each invoice with the top-level confidence_score if not already present
  return invoices.map(inv => ({
    ...inv,
    confidence_score: inv.confidence_score ?? topConfidence,
  }));
}

function resultToApplyData(parsed: OCRResult): ApplyData {
  // Ensure category is always populated
  const rawCat = parsed.category ?? parsed.hbk_category ?? "";
  const category = rawCat ? parseCategory(rawCat) : "wholesale";

  const topItems = (parsed.items ?? [])
    .sort((a, b) => (b.total ?? 0) - (a.total ?? 0))
    .slice(0, 5)
    .map(i => `${i.name} (${i.qty}${i.unit ? " " + i.unit : ""})`)
    .join(", ");

  const lineItems: InvoiceLineItem[] = (parsed.items ?? []).map(i => ({
    name: i.canonical_name ?? i.name,
    raw_description: i.raw_description ?? i.name,
    qty: i.qty,
    unit: i.unit,
    unit_price: i.unit_price,
    total: i.total,
    category: normalizeItemCategory(i.category),
    ocr_confidence: i.confidence ?? (i.is_catch_weight ? "medium" : "high"),
    is_catch_weight: i.is_catch_weight ?? false,
    is_credit: i.is_credit ?? false,
    is_fee: i.is_fee ?? false,
  }));

  // Architecture Phase 2: determine parsing_status from confidence_score
  const score = parsed.confidence_score;
  const parsing_status: ApplyData["parsing_status"] =
    score === undefined ? "parsed"
    : score >= 0.70 ? "parsed"
    : "low_confidence";

  return {
    vendor: parsed.vendor ?? "",
    invoice_number: parsed.invoice_number ?? "",
    delivery_date: parsed.date ?? new Date().toISOString().slice(0, 10),
    amount: parsed.total ?? 0,
    category,
    notes: topItems ? `Items: ${topItems}` : "",
    lineItems,
    ocr_confidence_score: parsed.confidence_score,
    parsing_status,
  };
}

// Vercel body limit ~4.5MB. Base64 overhead is ~1.37x. So max PDF ~3MB uncompressed.
const MAX_DIRECT_PDF_BYTES = 3 * 1024 * 1024; // 3 MB

export default function InvoiceOCR({ pendingFiles, onApply, onSaveAll }: Props) {
  const [scanning, setScanning] = useState(false);
  const [savingAll, setSavingAll] = useState(false);
  const [results, setResults] = useState<OCRResult[]>([]);
  const [applied, setApplied] = useState<Set<number>>(new Set());
  const [status, setStatus] = useState("");
  const resultsRef = useRef<HTMLDivElement>(null);

  const onApplyRef = useRef(onApply);
  useEffect(() => { onApplyRef.current = onApply; }, [onApply]);

  // Reset results when files change
  useEffect(() => { setResults([]); setApplied(new Set()); setStatus(""); }, [pendingFiles]);

  const scan = useCallback(async () => {
    if (!pendingFiles.length) return;
    setScanning(true);
    setResults([]);
    setApplied(new Set());
    setStatus("Starting scan…");

    try {
      const allInvoices: OCRResult[] = [];

      for (const f of pendingFiles) {
        if (f.type === "application/pdf") {
          if (f.size <= MAX_DIRECT_PDF_BYTES) {
            // ── PREFERRED PATH: send PDF natively to Claude ──────────────
            // Claude reads PDF text directly — far more accurate than images
            setStatus(`Reading ${f.name} (${(f.size / 1024).toFixed(0)} KB)…`);
            const base64 = await fileToBase64(f);
            setStatus("Scanning with Claude AI (native PDF)…");
            const invoices = await scanBatch([{ type: "application/pdf", data: base64 }]);
            allInvoices.push(...invoices);
          } else {
            // ── FALLBACK: large PDF — render to images at 1200px ─────────
            const pages = await pdfToImages(f, setStatus);
            const BATCH = 4; // smaller batches since images are larger now
            const totalBatches = Math.ceil(pages.length / BATCH);
            for (let b = 0; b < totalBatches; b++) {
              const batch = pages.slice(b * BATCH, (b + 1) * BATCH);
              const label = totalBatches > 1
                ? `Scanning pages ${b * BATCH + 1}–${Math.min((b + 1) * BATCH, pages.length)} of ${pages.length}…`
                : "Scanning with Claude AI…";
              setStatus(label);
              const invoices = await scanBatch(batch);
              allInvoices.push(...invoices);
            }
          }
        } else {
          // ── Image file ─────────────────────────────────────────────────
          setStatus("Compressing image…");
          const img = await compressImage(f);
          setStatus("Scanning with Claude AI…");
          const invoices = await scanBatch([img]);
          allInvoices.push(...invoices);
        }
      }

      if (allInvoices.length === 0) {
        setStatus("✗ No invoices found — try a clearer scan or different file.");
        return;
      }

      setResults(allInvoices);

      if (allInvoices.length === 1) {
        onApplyRef.current(resultToApplyData(allInvoices[0]));
        setApplied(new Set([0]));
        setStatus(`✓ 1 invoice scanned — form filled! Click "+ Add Entry" to save.`);
      } else {
        setStatus(`✓ ${allInvoices.length} invoices found — click "Add to Log →" on each, or "Save All".`);
        setTimeout(() => {
          resultsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
        }, 100);
      }
      setTimeout(() => setStatus(""), 10000);
    } catch (e) {
      setStatus("✗ " + (e instanceof Error ? e.message : "Scan failed"));
    } finally {
      setScanning(false);
    }
  }, [pendingFiles]);

  const applyOne = useCallback((idx: number) => {
    const inv = results[idx];
    if (!inv) return;
    onApplyRef.current(resultToApplyData(inv));
    setApplied(prev => new Set<number>(Array.from(prev).concat(idx)));
  }, [results]);

  const saveAll = useCallback(async () => {
    if (!onSaveAll || results.length === 0) return;
    setSavingAll(true);
    setStatus(`Saving all ${results.length} invoices…`);
    try {
      await onSaveAll(results.map(resultToApplyData));
      setApplied(new Set<number>(results.map((_, i) => i)));
      setStatus(`✓ All ${results.length} invoices saved!`);
      setTimeout(() => setStatus(""), 6000);
    } catch (e) {
      setStatus("✗ " + (e instanceof Error ? e.message : "Save failed"));
    } finally {
      setSavingAll(false);
    }
  }, [results, onSaveAll]);

  if (!pendingFiles.length) return null;

  return (
    <div className="mt-2 space-y-3">
      {/* Scan button + status */}
      <div className="flex items-center gap-2 flex-wrap">
        <button
          onClick={scan}
          disabled={scanning}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white rounded-lg text-xs font-semibold transition-colors"
        >
          {scanning ? (
            <><svg className="animate-spin w-3.5 h-3.5" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/>
            </svg>Scanning…</>
          ) : <>🔍 Scan with AI</>}
        </button>
        {status && (
          <span className={`text-xs font-medium ${status.startsWith("✗") ? "text-red-500" : "text-emerald-600"}`}>
            {status}
          </span>
        )}
      </div>

      {/* Multi-invoice results */}
      {results.length > 0 && (
        <div ref={resultsRef} className="space-y-3">
          {/* Bulk save banner — only when multiple invoices */}
          {results.length > 1 && onSaveAll && (
            <div className="flex items-center justify-between bg-blue-50 border border-blue-200 rounded-xl px-4 py-2.5">
              <span className="text-xs text-blue-700 font-medium">
                {results.length} invoices found — save them all at once or click individual cards below.
              </span>
              <button
                onClick={saveAll}
                disabled={savingAll || applied.size === results.length}
                className="ml-3 flex-shrink-0 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-lg text-xs font-semibold transition-colors"
              >
                {savingAll ? "Saving…" : applied.size === results.length ? "✓ All Saved" : `💾 Save All ${results.length} Invoices`}
              </button>
            </div>
          )}
          {results.map((inv, idx) => {
            const category = parseCategory(inv.category ?? inv.hbk_category ?? "");
            const isApplied = applied.has(idx);
            return (
              <div key={idx} className={`border rounded-xl overflow-hidden text-xs transition-all ${isApplied ? "border-emerald-300 bg-emerald-50" : "border-gray-200"}`}>
                {/* Invoice header */}
                <div className="px-4 py-2.5 bg-gray-50 border-b border-gray-200 flex items-center justify-between gap-3 flex-wrap">
                  <div className="flex items-center gap-3 flex-wrap">
                    {results.length > 1 && (
                      <span className="text-[10px] font-bold text-gray-400 bg-gray-200 rounded px-1.5 py-0.5">
                        #{idx + 1} of {results.length}
                      </span>
                    )}
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-100 text-emerald-800 border border-emerald-200">
                      ✦ {CAT_LABELS[category] ?? CAT_LABELS[inv.category ?? ""] ?? inv.category ?? "🏪 Wholesale"}
                    </span>
                    {[
                      { l: "Vendor", v: inv.vendor },
                      { l: "Invoice #", v: inv.invoice_number },
                      { l: "Date", v: inv.date },
                      { l: "Total", v: inv.total != null ? `$${Number(inv.total).toFixed(2)}` : null },
                    ].map(({ l, v }) => v ? (
                      <div key={l} className="flex items-baseline gap-1">
                        <span className="text-[9px] uppercase tracking-widest text-gray-400">{l}:</span>
                        <span className="font-semibold text-gray-800">{v}</span>
                      </div>
                    ) : null)}
                  </div>
                  <button
                    onClick={() => applyOne(idx)}
                    className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-colors ${
                      isApplied
                        ? "bg-emerald-600 text-white cursor-default"
                        : "bg-blue-600 hover:bg-blue-700 text-white"
                    }`}
                    disabled={isApplied}
                  >
                    {isApplied ? "✓ Applied" : "Add to Log →"}
                  </button>
                </div>

                {/* Line items table */}
                {(inv.items ?? []).length > 0 && (
                  <table className="w-full border-collapse">
                    <thead>
                      <tr className="bg-emerald-600 text-white">
                        {["Item", "Qty", "Unit", "Unit Price", "Total", "Category"].map(h => (
                          <th key={h} className={`px-3 py-1.5 font-medium text-[10px] ${["Item","Unit","Category"].includes(h) ? "text-left" : "text-right"}`}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {(inv.items ?? []).map((item, i) => {
                        const normCat = normalizeItemCategory(item.category);
                        return (
                          <tr key={i} className={`border-b border-gray-100 ${i % 2 === 0 ? "bg-white" : "bg-gray-50"}`}>
                            <td className="px-3 py-1.5 text-gray-700">{item.name}</td>
                            <td className="px-3 py-1.5 text-right tabular-nums">{item.qty}</td>
                            <td className="px-3 py-1.5 text-gray-500">{item.unit}</td>
                            <td className="px-3 py-1.5 text-right tabular-nums">
                              {item.unit_price != null ? `$${Number(item.unit_price).toFixed(2)}` : "—"}
                            </td>
                            <td className="px-3 py-1.5 text-right font-semibold tabular-nums">
                              {item.total != null ? `$${Number(item.total).toFixed(2)}` : "—"}
                            </td>
                            <td className="px-3 py-1.5">
                              <span className="px-2 py-0.5 rounded-full font-semibold text-[10px]"
                                style={{ background: CAT_COLORS[normCat] ?? "#f1f5f9" }}>
                                {normCat}
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                    <tfoot>
                      <tr className="bg-gray-50 border-t border-gray-200">
                        <td colSpan={4} className="px-3 py-1.5 text-right text-gray-500 font-medium text-[10px]">
                          {inv.subtotal != null && `Subtotal $${Number(inv.subtotal).toFixed(2)}`}
                          {inv.tax != null && `  Tax $${Number(inv.tax).toFixed(2)}`}
                        </td>
                        <td className="px-3 py-1.5 text-right font-bold text-gray-900">${Number(inv.total ?? 0).toFixed(2)}</td>
                        <td />
                      </tr>
                    </tfoot>
                  </table>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
