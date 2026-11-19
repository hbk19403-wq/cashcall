"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

// ── Types ───────────────────────────────────────────────────────────────────
type Category = "all" | "sales" | "food_inventory" | "payroll" | "tax" | "expenses" | "other";

interface DocRow {
  id: string;
  category: string;
  file_name: string;
  file_path: string;
  file_size: number | null;
  file_type: string | null;
  notes: string | null;
  created_at: string;
}

// ── Category config ─────────────────────────────────────────────────────────
const CATEGORIES: { key: Exclude<Category, "all">; label: string; icon: string; color: string }[] = [
  { key: "sales",          label: "Sales",          icon: "📊", color: "#00d4a8" },
  { key: "food_inventory", label: "Food & Inventory", icon: "🥩", color: "#f97316" },
  { key: "payroll",        label: "Payroll",         icon: "💰", color: "#a78bfa" },
  { key: "tax",            label: "Tax",             icon: "📋", color: "#38bdf8" },
  { key: "expenses",       label: "Expenses",        icon: "💡", color: "#fb7185" },
  { key: "other",          label: "Other",           icon: "📁", color: "#94a3b8" },
];

// ── Helpers ─────────────────────────────────────────────────────────────────
function fmtSize(bytes: number | null): string {
  if (!bytes) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function fileIcon(mime: string | null): string {
  if (!mime) return "📄";
  if (mime === "application/pdf") return "📕";
  if (mime.startsWith("image/")) return "🖼️";
  if (mime.includes("spreadsheet") || mime.includes("excel") || mime.endsWith(".csv")) return "📗";
  if (mime.includes("word") || mime.includes("document")) return "📘";
  if (mime.includes("zip") || mime.includes("archive")) return "🗜️";
  if (mime.startsWith("text/")) return "📄";
  return "📄";
}

function catConfig(key: string) {
  return CATEGORIES.find(c => c.key === key) ?? { label: key, icon: "📁", color: "#94a3b8" };
}

// ── Component ────────────────────────────────────────────────────────────────
export default function DocumentsPage() {
  const { id: locationId } = useParams<{ id: string }>();
  const router = useRouter();
  const supabase = createClient();

  const [docs, setDocs] = useState<DocRow[]>([]);
  const [activeTab, setActiveTab] = useState<Category>("all");
  const [uploadCategory, setUploadCategory] = useState<Exclude<Category, "all">>("sales");
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<string[]>([]);
  const [dragging, setDragging] = useState(false);
  const [loading, setLoading] = useState(true);
  const [locationName, setLocationName] = useState("");
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // ── Auth guard ──────────────────────────────────────────────────────────────
  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.push("/login"); return; }
      const { data: loc } = await supabase.from("locations").select("name").eq("id", locationId).single();
      setLocationName(loc?.name ?? "Location");
      await loadDocs();
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [locationId]);

  // ── Load documents ─────────────────────────────────────────────────────────
  const loadDocs = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("location_documents")
      .select("id, category, file_name, file_path, file_size, file_type, notes, created_at")
      .eq("location_id", locationId)
      .order("created_at", { ascending: false });
    if (!error && data) setDocs(data as DocRow[]);
    setLoading(false);
  }, [supabase, locationId]);

  // ── Upload ─────────────────────────────────────────────────────────────────
  async function handleFiles(files: FileList | File[]) {
    const arr = Array.from(files);
    if (!arr.length) return;
    setUploading(true);
    setUploadProgress([]);

    for (const file of arr) {
      // Duplicate check — same filename in same category
      const { count } = await supabase
        .from("location_documents")
        .select("id", { count: "exact", head: true })
        .eq("location_id", locationId)
        .eq("category", uploadCategory)
        .eq("file_name", file.name);
      if ((count ?? 0) > 0) {
        setUploadProgress(p => [...p, `⚠️ Skipped "${file.name}" — already exists in ${catConfig(uploadCategory).label}`]);
        continue;
      }

      const ts = Date.now();
      const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
      const storagePath = `${locationId}/${uploadCategory}/${ts}_${safeName}`;

      setUploadProgress(p => [...p, `Uploading ${file.name}…`]);

      const { error: storageErr } = await supabase.storage
        .from("location-docs")
        .upload(storagePath, file, { upsert: false });

      if (storageErr) {
        setUploadProgress(p => [...p, `❌ ${file.name}: ${storageErr.message}`]);
        continue;
      }

      const { error: dbErr } = await supabase.from("location_documents").insert({
        location_id: locationId,
        category:    uploadCategory,
        file_name:   file.name,
        file_path:   storagePath,
        file_size:   file.size,
        file_type:   file.type || null,
        uploaded_by: (await supabase.auth.getUser()).data.user?.id,
      });

      if (dbErr) {
        setUploadProgress(p => [...p, `❌ ${file.name}: DB error — ${dbErr.message}`]);
      } else {
        setUploadProgress(p => [...p.slice(0, -1), `✓ ${file.name}`]);
      }
    }

    await loadDocs();
    setUploading(false);
    setTimeout(() => setUploadProgress([]), 4000);
  }

  // ── Download (signed URL) ──────────────────────────────────────────────────
  async function handleDownload(doc: DocRow) {
    setDownloadingId(doc.id);
    const { data, error } = await supabase.storage
      .from("location-docs")
      .createSignedUrl(doc.file_path, 300);
    setDownloadingId(null);
    if (error || !data?.signedUrl) { alert("Could not generate download link."); return; }
    const a = document.createElement("a");
    a.href = data.signedUrl;
    a.download = doc.file_name;
    a.click();
  }

  // ── Delete ─────────────────────────────────────────────────────────────────
  async function handleDelete(doc: DocRow) {
    await supabase.storage.from("location-docs").remove([doc.file_path]);
    await supabase.from("location_documents").delete().eq("id", doc.id);
    setDeleteId(null);
    await loadDocs();
  }

  // ── Drag & drop ────────────────────────────────────────────────────────────
  function onDragOver(e: React.DragEvent) { e.preventDefault(); setDragging(true); }
  function onDragLeave() { setDragging(false); }
  function onDrop(e: React.DragEvent) {
    e.preventDefault(); setDragging(false);
    handleFiles(e.dataTransfer.files);
  }

  // ── Filtered list ─────────────────────────────────────────────────────────
  const filtered = activeTab === "all" ? docs : docs.filter(d => d.category === activeTab);

  // ── Counts per category ───────────────────────────────────────────────────
  const counts = Object.fromEntries(CATEGORIES.map(c => [c.key, docs.filter(d => d.category === c.key).length]));

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div style={{ minHeight: "100vh", background: "#060b18", color: "#e2e8f0", fontFamily: "system-ui, sans-serif" }}>

      {/* ── Top bar ── */}
      <div style={{ background: "rgba(0,0,0,0.4)", borderBottom: "1px solid rgba(255,255,255,0.07)", padding: "0 24px" }}>
        <div style={{ maxWidth: 1100, margin: "0 auto", height: 56, display: "flex", alignItems: "center", gap: 16 }}>
          <span style={{ fontSize: 20, fontWeight: 700, letterSpacing: "-0.5px", color: "#00d4a8" }}>CashCall</span>
          <span style={{ color: "rgba(255,255,255,0.2)" }}>›</span>
          <Link href={`/location/${locationId}`} style={{ fontSize: 13, color: "#94a3b8", textDecoration: "none" }}>{locationName}</Link>
          <span style={{ color: "rgba(255,255,255,0.2)" }}>›</span>
          <span style={{ fontSize: 13, color: "#e2e8f0" }}>Document Vault</span>
        </div>
      </div>

      <div style={{ maxWidth: 1100, margin: "0 auto", padding: "32px 24px" }}>

        {/* ── Page header ── */}
        <div style={{ marginBottom: 32 }}>
          <h1 style={{ fontSize: 28, fontWeight: 700, margin: 0, letterSpacing: "-0.5px" }}>
            📁 Document Vault
          </h1>
          <p style={{ margin: "6px 0 0", fontSize: 14, color: "#64748b" }}>
            Upload and organize receipts, reports, payroll files, tax docs — anything your restaurant needs in one secure place.
          </p>
        </div>

        {/* ── Upload panel ── */}
        <div style={{
          borderRadius: 16,
          background: "rgba(0,212,168,0.04)",
          border: "1px solid rgba(0,212,168,0.15)",
          padding: "20px 24px",
          marginBottom: 28,
        }}>
          <p style={{ margin: "0 0 14px", fontSize: 11, fontWeight: 700, letterSpacing: "0.2em", textTransform: "uppercase", color: "#00d4a8" }}>
            ⬆ Upload Documents
          </p>

          {/* Category selector */}
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 16 }}>
            {CATEGORIES.map(c => (
              <button key={c.key} onClick={() => setUploadCategory(c.key)}
                style={{
                  padding: "6px 14px", borderRadius: 999, fontSize: 13, fontWeight: 600, cursor: "pointer",
                  border: uploadCategory === c.key ? `1.5px solid ${c.color}` : "1.5px solid rgba(255,255,255,0.1)",
                  background: uploadCategory === c.key ? `${c.color}22` : "rgba(255,255,255,0.04)",
                  color: uploadCategory === c.key ? c.color : "#94a3b8",
                  transition: "all 0.15s",
                }}>
                {c.icon} {c.label}
              </button>
            ))}
          </div>

          {/* Drop zone */}
          <div
            onDragOver={onDragOver} onDragLeave={onDragLeave} onDrop={onDrop}
            onClick={() => !uploading && fileRef.current?.click()}
            style={{
              border: `2px dashed ${dragging ? "#00d4a8" : "rgba(255,255,255,0.12)"}`,
              borderRadius: 12,
              padding: "32px 24px",
              textAlign: "center",
              cursor: uploading ? "default" : "pointer",
              background: dragging ? "rgba(0,212,168,0.06)" : "rgba(255,255,255,0.02)",
              transition: "all 0.15s",
            }}>
            <input ref={fileRef} type="file" multiple style={{ display: "none" }}
              accept="*/*"
              onChange={e => e.target.files && handleFiles(e.target.files)} />
            {uploading ? (
              <div>
                <p style={{ margin: 0, fontSize: 15, color: "#00d4a8", fontWeight: 600 }}>Uploading…</p>
                <div style={{ marginTop: 10, fontSize: 13, color: "#94a3b8", lineHeight: 1.8 }}>
                  {uploadProgress.map((msg, i) => <div key={i}>{msg}</div>)}
                </div>
              </div>
            ) : (
              <div>
                <p style={{ margin: "0 0 4px", fontSize: 32 }}>📂</p>
                <p style={{ margin: 0, fontSize: 15, fontWeight: 600, color: "#e2e8f0" }}>
                  Drop files here or click to browse
                </p>
                <p style={{ margin: "4px 0 0", fontSize: 13, color: "#64748b" }}>
                  PDFs, images, Excel, CSV, Word — any format, up to 50 MB each
                </p>
                {uploadProgress.length > 0 && (
                  <div style={{ marginTop: 12, fontSize: 13, color: "#94a3b8", lineHeight: 1.8 }}>
                    {uploadProgress.map((msg, i) => <div key={i}>{msg}</div>)}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* ── Category tabs ── */}
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 20 }}>
          <button onClick={() => setActiveTab("all")}
            style={{
              padding: "7px 16px", borderRadius: 999, fontSize: 13, fontWeight: 600, cursor: "pointer",
              border: activeTab === "all" ? "1.5px solid #00d4a8" : "1.5px solid rgba(255,255,255,0.1)",
              background: activeTab === "all" ? "rgba(0,212,168,0.12)" : "rgba(255,255,255,0.04)",
              color: activeTab === "all" ? "#00d4a8" : "#94a3b8",
            }}>
            All {docs.length > 0 && <span style={{ opacity: 0.7 }}>({docs.length})</span>}
          </button>
          {CATEGORIES.map(c => (
            <button key={c.key} onClick={() => setActiveTab(c.key)}
              style={{
                padding: "7px 16px", borderRadius: 999, fontSize: 13, fontWeight: 600, cursor: "pointer",
                border: activeTab === c.key ? `1.5px solid ${c.color}` : "1.5px solid rgba(255,255,255,0.1)",
                background: activeTab === c.key ? `${c.color}22` : "rgba(255,255,255,0.04)",
                color: activeTab === c.key ? c.color : "#94a3b8",
              }}>
              {c.icon} {c.label} {counts[c.key] > 0 && <span style={{ opacity: 0.7 }}>({counts[c.key]})</span>}
            </button>
          ))}
        </div>

        {/* ── File list ── */}
        {loading ? (
          <div style={{ textAlign: "center", padding: "60px 0", color: "#475569", fontSize: 15 }}>
            Loading documents…
          </div>
        ) : filtered.length === 0 ? (
          <div style={{
            borderRadius: 16, border: "1px dashed rgba(255,255,255,0.1)",
            padding: "60px 24px", textAlign: "center", color: "#475569",
          }}>
            <p style={{ fontSize: 36, margin: 0 }}>📭</p>
            <p style={{ margin: "8px 0 0", fontSize: 15, fontWeight: 600, color: "#64748b" }}>
              {activeTab === "all" ? "No documents yet" : `No ${catConfig(activeTab).label} documents yet`}
            </p>
            <p style={{ margin: "4px 0 0", fontSize: 13 }}>
              Upload files above to get started.
            </p>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
            {filtered.map(doc => {
              const cat = catConfig(doc.category);
              return (
                <div key={doc.id} style={{
                  display: "flex", alignItems: "center", gap: 14,
                  padding: "14px 18px",
                  borderRadius: 12,
                  background: "rgba(255,255,255,0.03)",
                  border: "1px solid rgba(255,255,255,0.07)",
                  transition: "background 0.12s",
                }}>
                  {/* File type icon */}
                  <span style={{ fontSize: 24, flexShrink: 0 }}>{fileIcon(doc.file_type)}</span>

                  {/* Name + meta */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ margin: 0, fontSize: 14, fontWeight: 600, color: "#e2e8f0", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {doc.file_name}
                    </p>
                    <p style={{ margin: "2px 0 0", fontSize: 12, color: "#64748b" }}>
                      {fmtSize(doc.file_size)} · {fmtDate(doc.created_at)}
                    </p>
                  </div>

                  {/* Category badge */}
                  <span style={{
                    padding: "3px 10px", borderRadius: 999, fontSize: 11, fontWeight: 700,
                    background: `${cat.color}18`,
                    border: `1px solid ${cat.color}44`,
                    color: cat.color,
                    flexShrink: 0,
                    whiteSpace: "nowrap",
                  }}>
                    {cat.icon} {cat.label}
                  </span>

                  {/* Actions */}
                  <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
                    <button
                      onClick={() => handleDownload(doc)}
                      disabled={downloadingId === doc.id}
                      style={{
                        padding: "6px 14px", borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: "pointer",
                        border: "1px solid rgba(0,212,168,0.3)",
                        background: "rgba(0,212,168,0.08)",
                        color: "#00d4a8",
                        opacity: downloadingId === doc.id ? 0.5 : 1,
                      }}>
                      {downloadingId === doc.id ? "…" : "⬇ Download"}
                    </button>
                    <button
                      onClick={() => setDeleteId(doc.id)}
                      style={{
                        padding: "6px 10px", borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: "pointer",
                        border: "1px solid rgba(251,113,133,0.2)",
                        background: "rgba(251,113,133,0.06)",
                        color: "#fb7185",
                      }}>
                      🗑
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ── Delete confirm modal ── */}
      {deleteId && (() => {
        const doc = docs.find(d => d.id === deleteId)!;
        return (
          <div style={{
            position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)",
            display: "flex", alignItems: "center", justifyContent: "center", zIndex: 999,
          }}>
            <div style={{
              background: "#0f172a", border: "1px solid rgba(255,255,255,0.1)",
              borderRadius: 16, padding: "28px 32px", maxWidth: 400, width: "90%",
            }}>
              <p style={{ margin: 0, fontSize: 18, fontWeight: 700, color: "#e2e8f0" }}>Delete file?</p>
              <p style={{ margin: "10px 0 0", fontSize: 14, color: "#94a3b8" }}>
                <strong style={{ color: "#e2e8f0" }}>{doc?.file_name}</strong> will be permanently removed and cannot be recovered.
              </p>
              <div style={{ display: "flex", gap: 10, marginTop: 24, justifyContent: "flex-end" }}>
                <button onClick={() => setDeleteId(null)}
                  style={{ padding: "8px 20px", borderRadius: 8, fontSize: 14, fontWeight: 600, cursor: "pointer", border: "1px solid rgba(255,255,255,0.15)", background: "transparent", color: "#94a3b8" }}>
                  Cancel
                </button>
                <button onClick={() => doc && handleDelete(doc)}
                  style={{ padding: "8px 20px", borderRadius: 8, fontSize: 14, fontWeight: 600, cursor: "pointer", border: "none", background: "#ef4444", color: "#fff" }}>
                  Delete
                </button>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
