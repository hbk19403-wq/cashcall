"use client";

import { useState } from "react";

interface Props {
  title?: string;          // PDF filename prefix
  contentId?: string;      // id of the element to capture (default: "print-area")
  orientation?: "landscape" | "portrait";
}

export default function PrintPDFButton({
  title = "CashCall-Report",
  contentId = "print-area",
  orientation = "landscape",
}: Props) {
  const [generating, setGenerating] = useState(false);

  const handlePrint = () => {
    window.print();
  };

  const handlePDF = async () => {
    setGenerating(true);
    try {
      // Dynamically import so they don't bloat the server bundle
      const [{ default: jsPDF }, { default: html2canvas }] = await Promise.all([
        import("jspdf"),
        import("html2canvas"),
      ]);

      const element = document.getElementById(contentId);
      if (!element) { alert("Nothing to export."); setGenerating(false); return; }

      // Scale=2 for crisp text
      const canvas = await html2canvas(element, {
        scale: 2,
        useCORS: true,
        backgroundColor: "#ffffff",
        logging: false,
        windowWidth: element.scrollWidth,
        windowHeight: element.scrollHeight,
      });

      const imgData = canvas.toDataURL("image/png");

      const isLandscape = orientation === "landscape";
      const pdf = new jsPDF({
        orientation,
        unit: "mm",
        format: "a4",
      });

      const pageW = isLandscape ? 297 : 210;
      const pageH = isLandscape ? 210 : 297;
      const margin = 8;
      const usableW = pageW - margin * 2;
      const usableH = pageH - margin * 2;

      const imgW = canvas.width;
      const imgH = canvas.height;
      const ratio = imgW / imgH;

      // How many A4 pages needed
      const scaledW = usableW;
      const scaledH = usableW / ratio;
      const totalPages = Math.ceil(scaledH / usableH);

      for (let pg = 0; pg < totalPages; pg++) {
        if (pg > 0) pdf.addPage();

        // Source slice of the original canvas
        const srcY = pg * (imgW / ratio * (usableH / usableW));
        const srcH = imgH / totalPages;

        // Create a temp canvas for this page slice
        const pageCanvas = document.createElement("canvas");
        pageCanvas.width = canvas.width;
        pageCanvas.height = Math.ceil(canvas.height / totalPages);
        const ctx = pageCanvas.getContext("2d");
        if (ctx) {
          ctx.drawImage(canvas, 0, pg * pageCanvas.height, canvas.width, pageCanvas.height, 0, 0, canvas.width, pageCanvas.height);
        }
        const pageImg = pageCanvas.toDataURL("image/png");
        const pageScaledH = (pageCanvas.height * scaledW) / pageCanvas.width;
        pdf.addImage(pageImg, "PNG", margin, margin, scaledW, pageScaledH);
      }

      const dateStr = new Date().toISOString().slice(0, 10);
      pdf.save(`${title.replace(/\s+/g, "-")}_${dateStr}.pdf`);
    } catch (err) {
      console.error("PDF generation failed:", err);
      alert("PDF generation failed. Try using Print → Save as PDF instead.");
    }
    setGenerating(false);
  };

  return (
    <div className="hidden sm:flex items-center gap-2 no-print print-hidden">
      {/* Print button */}
      <button
        onClick={handlePrint}
        className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold transition-all border"
        style={{
          background: "rgba(44,26,14,0.06)",
          border: "1px solid rgba(44,26,14,0.2)",
          color: "#060b18",
        }}
        title="Print this page"
      >
        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
            d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z"/>
        </svg>
        Print
      </button>

      {/* PDF button */}
      <button
        onClick={handlePDF}
        disabled={generating}
        className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold transition-all disabled:opacity-60"
        style={{
          background: "linear-gradient(135deg, #00b896, #00d4a8)",
          color: "white",
        }}
        title="Download as PDF"
      >
        {generating ? (
          <>
            <span className="inline-block w-3 h-3 border-2 border-white/40 border-t-white rounded-full animate-spin" />
            Generating…
          </>
        ) : (
          <>
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/>
            </svg>
            Download PDF
          </>
        )}
      </button>
    </div>
  );
}
