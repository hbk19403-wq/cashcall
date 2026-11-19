"use client";

export default function PrintButton() {
  return (
    <button
      onClick={() => window.print()}
      className="text-xs bg-[#00d4a8]/20 border border-[#00d4a8]/40 text-[#00d4a8] rounded-lg px-3 py-2 hover:bg-[#00d4a8]/30 transition-colors print:hidden"
    >
      🖨️ Print
    </button>
  );
}
