"use client";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";

export default function TrialExpiredPage() {
  const router = useRouter();

  async function signOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
  }

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
        maxWidth: 480,
        width: "100%",
        background: "rgba(255,255,255,0.04)",
        border: "1px solid rgba(255,255,255,0.08)",
        borderRadius: 24,
        padding: "48px 40px",
        textAlign: "center",
      }}>
        {/* Icon */}
        <div style={{
          width: 72,
          height: 72,
          background: "rgba(239,68,68,0.12)",
          border: "1px solid rgba(239,68,68,0.25)",
          borderRadius: "50%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          margin: "0 auto 24px",
          fontSize: 32,
        }}>⏰</div>

        {/* Brand */}
        <div style={{ marginBottom: 24, display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
          <span style={{ fontSize: 22, }}>⚡</span>
          <span style={{ fontSize: 22, fontWeight: 800, color: "#00d4a8" }}>CashCall</span>
        </div>

        <h1 style={{
          margin: "0 0 12px",
          fontSize: 26,
          fontWeight: 700,
          color: "#fff",
          lineHeight: 1.25,
        }}>
          Your free trial has ended
        </h1>

        <p style={{
          margin: "0 0 32px",
          fontSize: 15,
          color: "rgba(255,255,255,0.55)",
          lineHeight: 1.6,
        }}>
          Your 30-day free trial has expired. Your restaurant data is safe — nothing
          has been deleted. Reach out to unlock your full account and keep your numbers running.
        </p>

        {/* CTA */}
        <Link
          href="/upgrade"
          style={{
            display: "block",
            background: "linear-gradient(135deg, #00d4a8, #00b894)",
            color: "#060b18",
            padding: "16px 32px",
            borderRadius: 14,
            fontSize: 16,
            fontWeight: 800,
            textDecoration: "none",
            marginBottom: 16,
          }}
        >
          Subscribe to Continue →
        </Link>

        <p style={{ margin: "0 0 32px", fontSize: 13, color: "rgba(255,255,255,0.35)" }}>
          Starting at <strong style={{ color: "rgba(255,255,255,0.6)" }}>$99/mo</strong> · Cancel anytime · Secured by Stripe
        </p>

        {/* What you had */}
        <div style={{
          background: "rgba(0,212,168,0.06)",
          border: "1px solid rgba(0,212,168,0.15)",
          borderRadius: 14,
          padding: "20px 24px",
          marginBottom: 32,
          textAlign: "left",
        }}>
          <p style={{ margin: "0 0 12px", fontSize: 13, fontWeight: 600, color: "#00d4a8" }}>
            Your data is preserved:
          </p>
          <ul style={{ margin: 0, padding: "0 0 0 18px", fontSize: 13, color: "rgba(255,255,255,0.5)", lineHeight: 2 }}>
            <li>All sales entries and P&L history</li>
            <li>Invoice & food cost records</li>
            <li>Restaurant locations and settings</li>
            <li>6-month analytics and trends</li>
          </ul>
        </div>

        <button
          onClick={signOut}
          style={{
            background: "none",
            border: "none",
            color: "rgba(255,255,255,0.3)",
            fontSize: 13,
            cursor: "pointer",
            textDecoration: "underline",
          }}
        >
          Sign out
        </button>
      </div>
    </div>
  );
}
