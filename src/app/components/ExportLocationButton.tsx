"use client";
import { useState } from "react";

export default function ExportLocationButton({ locationId, locationCode }: { locationId: string; locationCode?: string }) {
  const [loading, setLoading] = useState(false);

  const handleExport = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/export/location/${locationId}`);
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        alert(err.error ?? "Export failed");
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      const date = new Date().toISOString().slice(0, 10);
      a.href = url;
      a.download = `CashCall_${locationCode ?? locationId.slice(0, 8)}_${date}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      alert("Export failed: " + (e instanceof Error ? e.message : String(e)));
    } finally {
      setLoading(false);
    }
  };

  return (
    <button
      onClick={handleExport}
      disabled={loading}
      title="Download all location data as Excel"
      className="flex items-center gap-1.5 text-xs font-semibold rounded-xl px-3 py-2 transition-all hover:opacity-80 disabled:opacity-50"
      style={{ background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.12)", color: "#e2e8f0" }}
    >
      {loading ? (
        <span className="w-3.5 h-3.5 border border-teal-400 border-t-transparent rounded-full animate-spin inline-block" />
      ) : (
        <span>⬇</span>
      )}
      {loading ? "Exporting…" : "📊 Export Excel"}
    </button>
  );
}
