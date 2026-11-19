"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

export default function BillingSuccessPage() {
  const router = useRouter();

  // Auto-redirect to dashboard after 5 seconds
  useEffect(() => {
    const t = setTimeout(() => router.push("/dashboard"), 5000);
    return () => clearTimeout(t);
  }, [router]);

  return (
    <div style={{
      minHeight: "100vh",
      background: "linear-gradient(135deg, #060b18 0%, #0d1a2e 100%)",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      padding: "24px",
      fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
    }}>
      <div style={{
        maxWidth: 440,
        width: "100%",
        background: "rgba(255,255,255,0.04)",
        border: "1px solid rgba(0,212,168,0.2)",
        borderRadius: 24,
        padding: "48px 40px",
        textAlign: "center",
      }}>
        {/* Success icon */}
        <div style={{
          width: 72,
          height: 72,
          background: "rgba(0,212,168,0.12)",
          border: "1px solid rgba(0,212,168,0.3)",
          borderRadius: "50%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          margin: "0 auto 24px",
          fontSize: 32,
        }}>
          ✅
        </div>

        <div style={{ marginBottom: 20, display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
          <span style={{ fontSize: 20 }}>⚡</span>
          <span style={{ fontSize: 20, fontWeight: 800, color: "#00d4a8" }}>CashCall</span>
        </div>

        <h1 style={{ margin: "0 0 12px", fontSize: 26, fontWeight: 800, color: "#fff" }}>
          You&apos;re all set!
        </h1>
        <p style={{ margin: "0 0 32px", fontSize: 15, color: "rgba(255,255,255,0.55)", lineHeight: 1.6 }}>
          Your subscription is active. All your data is here and ready.
          Taking you to the dashboard in a moment…
        </p>

        <Link
          href="/dashboard"
          style={{
            display: "block",
            background: "linear-gradient(135deg, #00d4a8, #00b894)",
            color: "#060b18",
            padding: "16px 32px",
            borderRadius: 14,
            fontSize: 16,
            fontWeight: 800,
            textDecoration: "none",
          }}
        >
          Go to Dashboard →
        </Link>
      </div>
    </div>
  );
}
