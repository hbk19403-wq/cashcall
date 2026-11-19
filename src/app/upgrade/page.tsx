"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

const PLANS = [
  {
    id: "starter",
    name: "Starter",
    price: 99,
    description: "Perfect for a single location",
    features: [
      "1 restaurant location",
      "Daily food cost tracking",
      "Invoice scanning & OCR",
      "Sales & P&L dashboard",
      "WhatsApp invoice upload",
      "Email invoice forwarding",
      "6-month analytics",
    ],
    highlight: false,
  },
  {
    id: "growth",
    name: "Growth",
    price: 199,
    description: "For multi-location operators",
    features: [
      "Up to 5 restaurant locations",
      "Everything in Starter",
      "Cross-location P&L comparison",
      "Team access (up to 3 users)",
      "Priority support",
      "Custom CSV exports",
    ],
    highlight: true,
  },
];

export default function UpgradePage() {
  const router = useRouter();
  const [loading, setLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleSubscribe(plan: string) {
    setLoading(plan);
    setError(null);
    try {
      const res = await fetch("/api/billing/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Something went wrong");
      if (data.url) window.location.href = data.url;
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to start checkout.");
      setLoading(null);
    }
  }

  return (
    <div style={{
      minHeight: "100vh",
      background: "linear-gradient(135deg, #060b18 0%, #0d1a2e 100%)",
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      padding: "40px 24px",
      fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
    }}>
      {/* Header */}
      <div style={{ textAlign: "center", marginBottom: 48 }}>
        <div style={{ marginBottom: 16, display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
          <span style={{ fontSize: 24 }}>⚡</span>
          <span style={{ fontSize: 24, fontWeight: 800, color: "#00d4a8" }}>CashCall</span>
        </div>
        <h1 style={{ margin: "0 0 12px", fontSize: 32, fontWeight: 800, color: "#fff" }}>
          Choose your plan
        </h1>
        <p style={{ margin: 0, fontSize: 16, color: "rgba(255,255,255,0.5)" }}>
          Your data is safe — subscribe to unlock your full account
        </p>
      </div>

      {/* Plans */}
      <div style={{
        display: "flex",
        gap: 24,
        flexWrap: "wrap",
        justifyContent: "center",
        maxWidth: 760,
        width: "100%",
        marginBottom: 32,
      }}>
        {PLANS.map((plan) => (
          <div key={plan.id} style={{
            flex: "1 1 300px",
            maxWidth: 340,
            background: plan.highlight ? "rgba(0,212,168,0.08)" : "rgba(255,255,255,0.04)",
            border: plan.highlight ? "1.5px solid rgba(0,212,168,0.4)" : "1px solid rgba(255,255,255,0.08)",
            borderRadius: 20,
            padding: "32px 28px",
            position: "relative",
          }}>
            {plan.highlight && (
              <div style={{
                position: "absolute",
                top: -14,
                left: "50%",
                transform: "translateX(-50%)",
                background: "linear-gradient(135deg, #00d4a8, #818cf8)",
                color: "#fff",
                fontSize: 11,
                fontWeight: 700,
                padding: "4px 14px",
                borderRadius: 20,
                letterSpacing: "0.08em",
                textTransform: "uppercase",
              }}>
                Most Popular
              </div>
            )}

            <h2 style={{ margin: "0 0 4px", fontSize: 20, fontWeight: 700, color: "#fff" }}>
              {plan.name}
            </h2>
            <p style={{ margin: "0 0 20px", fontSize: 13, color: "rgba(255,255,255,0.45)" }}>
              {plan.description}
            </p>

            <div style={{ marginBottom: 24 }}>
              <span style={{ fontSize: 42, fontWeight: 800, color: plan.highlight ? "#00d4a8" : "#fff" }}>
                ${plan.price}
              </span>
              <span style={{ fontSize: 14, color: "rgba(255,255,255,0.4)", marginLeft: 4 }}>/mo</span>
            </div>

            <ul style={{ margin: "0 0 28px", padding: "0 0 0 20px", listStyle: "none" }}>
              {plan.features.map((f) => (
                <li key={f} style={{
                  padding: "5px 0",
                  fontSize: 14,
                  color: "rgba(255,255,255,0.65)",
                  paddingLeft: 0,
                  display: "flex",
                  alignItems: "flex-start",
                  gap: 8,
                }}>
                  <span style={{ color: "#00d4a8", flexShrink: 0, marginTop: 1 }}>✓</span>
                  {f}
                </li>
              ))}
            </ul>

            <button
              onClick={() => handleSubscribe(plan.id)}
              disabled={loading !== null}
              style={{
                width: "100%",
                background: plan.highlight
                  ? "linear-gradient(135deg, #00d4a8, #00b894)"
                  : "rgba(255,255,255,0.08)",
                color: plan.highlight ? "#060b18" : "#fff",
                border: plan.highlight ? "none" : "1px solid rgba(255,255,255,0.15)",
                padding: "14px 20px",
                borderRadius: 12,
                fontSize: 15,
                fontWeight: 700,
                cursor: loading !== null ? "not-allowed" : "pointer",
                opacity: loading !== null ? 0.7 : 1,
                transition: "opacity 0.15s",
              }}
            >
              {loading === plan.id ? "Redirecting…" : `Subscribe — $${plan.price}/mo`}
            </button>
          </div>
        ))}
      </div>

      {error && (
        <p style={{
          color: "#ef4444",
          background: "rgba(239,68,68,0.1)",
          border: "1px solid rgba(239,68,68,0.2)",
          borderRadius: 10,
          padding: "12px 20px",
          fontSize: 14,
          marginBottom: 24,
        }}>
          {error}
        </p>
      )}

      {/* Footer */}
      <p style={{ margin: 0, fontSize: 13, color: "rgba(255,255,255,0.3)", textAlign: "center" }}>
        Secured by Stripe · Cancel anytime · Your data is never deleted
      </p>

      <button
        onClick={() => router.push("/login")}
        style={{
          marginTop: 24,
          background: "none",
          border: "none",
          color: "rgba(255,255,255,0.3)",
          fontSize: 13,
          cursor: "pointer",
          textDecoration: "underline",
        }}
      >
        Sign out instead
      </button>
    </div>
  );
}
