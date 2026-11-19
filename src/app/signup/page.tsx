"use client";
import { useState, useEffect } from "react";
import Link from "next/link";
import { generateEncryptionKey, exportKeyToHex, downloadMasterKey, storeSessionKey } from "@/lib/encryption";

type Step = "account" | "vault" | "plan" | "done";

function StepIndicator({ current, steps }: { current: Step; steps: { id: Step; label: string }[] }) {
  const idx = steps.findIndex(s => s.id === current);
  return (
    <div className="flex items-center justify-center gap-0 mb-8">
      {steps.map((s, i) => (
        <div key={s.id} className="flex items-center">
          <div className="flex flex-col items-center">
            <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold transition-all"
              style={{
                background: i < idx ? "#00d4a8" : i === idx ? "rgba(0,212,168,0.15)" : "rgba(255,255,255,0.08)",
                border: `1px solid ${i <= idx ? "#00d4a8" : "rgba(255,255,255,0.1)"}`,
                color: i < idx ? "#060b18" : i === idx ? "#00d4a8" : "#4b5563",
              }}>
              {i < idx ? "✓" : i + 1}
            </div>
            <div className="text-xs mt-1 hidden sm:block" style={{ color: i === idx ? "#00d4a8" : "#4b5563" }}>{s.label}</div>
          </div>
          {i < steps.length - 1 && (
            <div className="w-8 sm:w-16 h-px mx-2" style={{ background: i < idx ? "#00d4a8" : "rgba(255,255,255,0.08)" }} />
          )}
        </div>
      ))}
    </div>
  );
}

export default function SignupPage() {
  const [step, setStep] = useState<Step>("account");
  const [form, setForm] = useState({ name: "", email: "", password: "", restaurantName: "", locations: "1" });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // Vault
  const [keyHex, setKeyHex] = useState("");
  const [keyConfirmed, setKeyConfirmed] = useState(false);
  const [downloaded, setDownloaded] = useState(false);
  const [cryptoKey, setCryptoKey] = useState<CryptoKey | null>(null);
  const [generating, setGenerating] = useState(false);
  const [keyRevealed, setKeyRevealed] = useState(false);

  const steps = [
    { id: "account" as Step, label: "Account" },
    { id: "vault" as Step, label: "Your Vault" },
    { id: "plan" as Step, label: "Plan" },
    { id: "done" as Step, label: "Done" },
  ];

  async function generateKey() {
    setGenerating(true);
    try {
      const key = await generateEncryptionKey();
      const hex = await exportKeyToHex(key);
      setCryptoKey(key);
      setKeyHex(hex);
    } catch (e) {
      setError("Failed to generate encryption key. Please use a modern browser.");
    }
    setGenerating(false);
  }

  async function handleDownload() {
    if (!cryptoKey) return;
    await downloadMasterKey(cryptoKey, form.restaurantName || "My Restaurant");
    setDownloaded(true);
    if (keyHex) storeSessionKey(keyHex);
  }

  async function handleAccountSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!form.name || !form.email || !form.password || !form.restaurantName) {
      setError("Please fill in all fields.");
      return;
    }
    if (form.password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    setLoading(true);
    // Supabase sign-up
    try {
      const { createClient } = await import("@/lib/supabase/client");
      const supabase = createClient();
      const { error: authError } = await supabase.auth.signUp({
        email: form.email,
        password: form.password,
        options: {
          data: { full_name: form.name, restaurant_name: form.restaurantName },
          emailRedirectTo: "https://cashcall.io/auth/callback",
        },
      });
      if (authError) throw authError;
      // Auto-create owner profile so dashboard works immediately
      await fetch("/api/auth/setup-profile", { method: "POST" }).catch(() => {});
      setStep("vault");
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "";
      if (
        msg.toLowerCase().includes("rate limit") ||
        msg.toLowerCase().includes("too many") ||
        msg.toLowerCase().includes("over_email_send_rate_limit")
      ) {
        setError("Too many sign-up attempts right now. Please wait a few minutes and try again, or contact support@cashcall.io.");
      } else if (msg.toLowerCase().includes("already registered") || msg.toLowerCase().includes("user already exists")) {
        setError("An account with this email already exists. Try signing in instead.");
      } else {
        setError(msg || "Sign up failed. Please try again.");
      }
    }
    setLoading(false);
  }

  // Auto-generate key when arriving at vault step
  useEffect(() => {
    if (step === "vault" && !keyHex) generateKey();
  }, [step]);

  return (
    <div className="min-h-screen flex flex-col items-center justify-start pt-8 pb-16 px-4" style={{ background: "#060b18" }}>
      {/* Header */}
      <div className="mb-8 text-center">
        <Link href="/" className="text-2xl font-bold" style={{ color: "#00d4a8", fontFamily: "var(--font-space)" }}>⚡ CashCall</Link>
        <div className="text-sm text-gray-500 mt-1">Create your zero-knowledge encrypted restaurant vault</div>
      </div>

      <div className="w-full max-w-lg">
        <StepIndicator current={step} steps={steps} />

        {/* ─── ACCOUNT STEP ─── */}
        {step === "account" && (
          <div className="rounded-2xl p-6 border" style={{ background: "rgba(255,255,255,0.03)", borderColor: "rgba(255,255,255,0.08)" }}>
            <h2 className="text-xl font-bold text-white mb-1">Create your account</h2>
            <p className="text-sm text-gray-400 mb-5">Your restaurant portal, built just for you.</p>
            <form onSubmit={handleAccountSubmit} className="space-y-4">
              {[
                { key: "name", label: "Your Name", placeholder: "Alex Chen", type: "text" },
                { key: "restaurantName", label: "Restaurant Name", placeholder: "Tampa Bay Kitchen", type: "text" },
                { key: "email", label: "Email Address", placeholder: "you@yourrestaurant.com", type: "email" },
                { key: "password", label: "Password (min 8 chars)", placeholder: "••••••••••", type: "password" },
              ].map(f => (
                <div key={f.key}>
                  <label className="block text-xs font-medium text-gray-400 mb-1.5">{f.label}</label>
                  <input
                    type={f.type}
                    placeholder={f.placeholder}
                    value={form[f.key as keyof typeof form]}
                    onChange={e => setForm(p => ({ ...p, [f.key]: e.target.value }))}
                    className="w-full px-3 py-2.5 rounded-xl text-sm text-white placeholder-gray-600 focus:outline-none"
                    style={{
                      background: "rgba(255,255,255,0.06)",
                      border: "1px solid rgba(255,255,255,0.1)",
                    }}
                    required
                  />
                </div>
              ))}
              <div>
                <label className="block text-xs font-medium text-gray-400 mb-1.5">How many locations?</label>
                <select
                  value={form.locations}
                  onChange={e => setForm(p => ({ ...p, locations: e.target.value }))}
                  className="w-full px-3 py-2.5 rounded-xl text-sm text-white focus:outline-none"
                  style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)" }}>
                  <option value="1">1 location</option>
                  <option value="2-5">2–5 locations</option>
                  <option value="6+">6+ locations (Enterprise)</option>
                </select>
              </div>
              {error && <div className="text-red-400 text-sm px-3 py-2 rounded-xl" style={{ background: "rgba(239,68,68,0.1)" }}>{error}</div>}
              <button type="submit" disabled={loading}
                className="w-full py-3 rounded-xl font-bold text-sm transition-all hover:opacity-90 disabled:opacity-50"
                style={{ background: "#00d4a8", color: "#060b18" }}>
                {loading ? "Creating account…" : "Continue → Create Your Vault"}
              </button>
            </form>
            <div className="mt-4 text-center text-xs text-gray-500">
              Already have an account? <Link href="/login" className="text-teal-400 hover:text-teal-300">Sign in</Link>
            </div>
          </div>
        )}

        {/* ─── VAULT STEP (AES-256) ─── */}
        {step === "vault" && (
          <div className="space-y-4">
            <div className="rounded-2xl p-6 border" style={{ background: "rgba(129,140,248,0.05)", borderColor: "rgba(129,140,248,0.2)" }}>
              <div className="flex items-start gap-3 mb-5">
                <div className="text-2xl">🔐</div>
                <div>
                  <h2 className="text-xl font-bold text-white">Your Encryption Vault</h2>
                  <p className="text-sm text-gray-400 mt-0.5">
                    We just generated a 256-bit AES key for your restaurant. This key encrypts
                    all your financial data before it leaves your browser. We never see it.
                  </p>
                </div>
              </div>

              {/* Key display */}
              <div className="rounded-xl p-4 mb-4" style={{ background: "rgba(0,0,0,0.3)", border: "1px solid rgba(129,140,248,0.15)" }}>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs text-indigo-400 uppercase tracking-wider font-medium">Your AES-256 Encryption Key</span>
                  <button onClick={() => setKeyRevealed(r => !r)}
                    className="text-xs text-gray-400 hover:text-white transition-colors">
                    {keyRevealed ? "Hide" : "Reveal"}
                  </button>
                </div>
                {generating ? (
                  <div className="text-xs text-gray-500 animate-pulse py-2">Generating cryptographic key…</div>
                ) : (
                  <div className="font-mono text-xs break-all leading-relaxed"
                    style={{ color: keyRevealed ? "#818cf8" : "transparent", textShadow: keyRevealed ? "none" : "0 0 8px #818cf8", filter: keyRevealed ? "none" : "blur(4px)" }}>
                    {keyHex || "—"}
                  </div>
                )}
              </div>

              {/* Download button */}
              <button onClick={handleDownload} disabled={!keyHex || generating}
                className="w-full py-3 rounded-xl font-bold text-sm flex items-center justify-center gap-2 transition-all disabled:opacity-40"
                style={{
                  background: downloaded ? "rgba(0,212,168,0.15)" : "#818cf8",
                  color: downloaded ? "#00d4a8" : "white",
                  border: downloaded ? "1px solid rgba(0,212,168,0.4)" : "none",
                }}>
                {downloaded ? "✓ Master Key Downloaded" : "⬇ Download Master Recovery Key (.txt)"}
              </button>

              {downloaded && (
                <div className="mt-3 p-3 rounded-xl text-xs"
                  style={{ background: "rgba(0,212,168,0.08)", border: "1px solid rgba(0,212,168,0.2)", color: "#94a3b8" }}>
                  <strong className="text-white">Next:</strong> Save this file in your password manager or an encrypted USB drive.
                  This is the ONLY way to recover your data. We do not store a copy.
                </div>
              )}
            </div>

            {/* Security facts */}
            <div className="rounded-2xl p-5 border" style={{ background: "rgba(255,255,255,0.02)", borderColor: "rgba(255,255,255,0.06)" }}>
              <div className="text-xs text-gray-400 uppercase tracking-wider mb-3">What zero-knowledge means for you</div>
              <div className="space-y-3">
                {[
                  { icon: "🔒", text: "Your financial data is encrypted before it leaves your browser — we never see plaintext." },
                  { icon: "🚫", text: "We cannot read your data even if compelled by a court order. The key is yours alone." },
                  { icon: "🏛", text: "Government subpoena? We hand over encrypted gibberish. Useless without your key." },
                  { icon: "✓", text: "Military-grade AES-256-GCM — the same standard used by the US Department of Defense." },
                ].map((f, i) => (
                  <div key={i} className="flex gap-3 text-sm">
                    <span className="text-base">{f.icon}</span>
                    <span className="text-gray-400">{f.text}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Confirm + continue */}
            <label className="flex items-start gap-3 cursor-pointer p-3 rounded-xl border"
              style={{ borderColor: keyConfirmed ? "rgba(0,212,168,0.4)" : "rgba(255,255,255,0.08)", background: keyConfirmed ? "rgba(0,212,168,0.05)" : "transparent" }}>
              <input type="checkbox" checked={keyConfirmed} onChange={e => setKeyConfirmed(e.target.checked)}
                className="mt-0.5 accent-teal-400" />
              <span className="text-sm text-gray-300">
                I have downloaded and saved my Master Recovery Key. I understand that losing it means permanent loss of access to my data.
              </span>
            </label>

            <button onClick={() => setStep("plan")}
              disabled={!downloaded || !keyConfirmed}
              className="w-full py-3 rounded-xl font-bold text-sm transition-all disabled:opacity-30"
              style={{ background: "#00d4a8", color: "#060b18" }}>
              Continue → Choose Your Plan
            </button>
          </div>
        )}

        {/* ─── PLAN STEP ─── */}
        {step === "plan" && (
          <div className="space-y-4">
            <div className="text-center mb-4">
              <h2 className="text-xl font-bold text-white">Choose your plan</h2>
              <p className="text-sm text-gray-400 mt-1">30-day free trial · Cancel anytime · No credit card required to start</p>
            </div>

            {[
              { id: "starter", name: "Starter", price: "$99", period: "/month", locations: "1 location", features: ["Prime Cost Card", "AI Invoice OCR", "Sales Photo Scan", "Payroll Import", "Zero-Knowledge Vault", "Weekly P&L Email"], highlight: false },
              { id: "growth", name: "Growth", price: "$199", period: "/month", locations: "Up to 5 locations", features: ["Everything in Starter", "Multi-location Dashboard", "Cross-location Analytics", "Vendor Price Intelligence", "Priority Support"], highlight: true },
              { id: "enterprise", name: "Enterprise", price: "Let's talk", period: "", locations: "Unlimited locations", features: ["Everything in Growth", "White-label branding", "Custom integrations", "Dedicated account manager"], highlight: false },
            ].map(plan => (
              <div key={plan.id} className="rounded-2xl p-5 border cursor-pointer transition-all"
                style={{
                  background: plan.highlight ? "rgba(0,212,168,0.06)" : "rgba(255,255,255,0.03)",
                  borderColor: plan.highlight ? "rgba(0,212,168,0.35)" : "rgba(255,255,255,0.07)",
                }}>
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <div className="font-bold text-white text-sm">{plan.name}</div>
                    <div className="text-xs text-gray-500">{plan.locations}</div>
                  </div>
                  <div className="text-right">
                    <div className="text-xl font-bold" style={{ color: plan.highlight ? "#00d4a8" : "white", fontFamily: "var(--font-space)" }}>
                      {plan.price}<span className="text-sm font-normal text-gray-400">{plan.period}</span>
                    </div>
                  </div>
                </div>
                <ul className="space-y-1.5">
                  {plan.features.map(f => (
                    <li key={f} className="flex items-center gap-2 text-xs text-gray-300">
                      <span style={{ color: "#00d4a8" }}>✓</span> {f}
                    </li>
                  ))}
                </ul>
                <button onClick={() => setStep("done")}
                  className="w-full mt-4 py-2.5 rounded-xl text-sm font-semibold transition-all"
                  style={{
                    background: plan.highlight ? "#00d4a8" : "rgba(255,255,255,0.08)",
                    color: plan.highlight ? "#060b18" : "white",
                  }}>
                  {plan.id === "enterprise" ? "Contact Sales" : "Start Free Trial"}
                </button>
              </div>
            ))}

            <div className="text-center">
              <div className="text-xs text-gray-500 mt-2">
                💳 Billing powered by Stripe · Secure payment processing · Cancel anytime
              </div>
              <div className="inline-block mt-2 px-3 py-1 rounded-full text-xs"
                style={{ background: "rgba(240,180,41,0.1)", color: "#f0b429", border: "1px solid rgba(240,180,41,0.2)" }}>
                Stripe billing coming soon · Free trial starts now
              </div>
            </div>
          </div>
        )}

        {/* ─── DONE ─── */}
        {step === "done" && (
          <div className="text-center space-y-6">
            <div className="text-6xl">🎉</div>
            <div>
              <h2 className="text-2xl font-bold text-white mb-2">Your vault is ready.</h2>
              <p className="text-gray-400 text-sm">
                Welcome to CashCall, {form.name || "Chef"}. Your encrypted financial command center is live.
              </p>
            </div>

            <div className="rounded-2xl p-5 border text-left space-y-3"
              style={{ background: "rgba(0,212,168,0.05)", borderColor: "rgba(0,212,168,0.2)" }}>
              <div className="text-xs text-teal-400 uppercase tracking-wider mb-2">What's ready right now</div>
              {[
                "📊 Prime Cost dashboard — connect your sales",
                "🧾 Invoice OCR — photograph your next invoice",
                "⚡ Sales Scan — snap a photo of your POS Z-report",
                "👥 Payroll — import your ADP or QuickBooks CSV",
                "🔐 Vault — your encryption key is active for this session",
              ].map(item => (
                <div key={item} className="flex items-start gap-2 text-sm text-gray-300">
                  <span>{item.split(" ")[0]}</span>
                  <span>{item.split(" ").slice(1).join(" ")}</span>
                </div>
              ))}
            </div>

            <Link href="/dashboard"
              className="block w-full py-3.5 rounded-xl font-bold text-base transition-all hover:opacity-90"
              style={{ background: "#00d4a8", color: "#060b18" }}>
              Enter Your Dashboard →
            </Link>

            <Link href="/login" className="block text-sm text-gray-500 hover:text-gray-300 transition-colors">
              Already verified? Sign in instead
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
