/** Shown ONLY when printing — hidden on screen */
export default function PrintHeader({
  title,
  subtitle,
  date,
}: {
  title: string;
  subtitle?: string;
  date?: string;
}) {
  const today = date ?? new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
  return (
    <div className="print-header hidden" style={{ fontFamily: "var(--font-sans)" }}>
      <div>
        <p style={{ fontSize: "7pt", color: "#c8921a", fontWeight: 700, letterSpacing: "0.2em", textTransform: "uppercase", marginBottom: 2 }}>
          SSV Group · House of Biryanis &amp; Kebabs
        </p>
        <p style={{ fontSize: "14pt", fontWeight: 800, color: "#2c1a0e", margin: 0, fontFamily: "var(--font-serif)" }}>{title}</p>
        {subtitle && <p style={{ fontSize: "9pt", color: "#6b7280", marginTop: 1 }}>{subtitle}</p>}
      </div>
      <div style={{ textAlign: "right" }}>
        <p style={{ fontSize: "8pt", color: "#6b7280" }}>Generated: {today}</p>
        <p style={{ fontSize: "7pt", color: "#9ca3af" }}>Confidential · CashCall</p>
      </div>
    </div>
  );
}
