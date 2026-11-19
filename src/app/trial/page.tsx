"use client";
import { useState, useEffect, Suspense } from "react";
import { getAttribution, track } from "@/lib/attribution";
import { useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";
import { generateEncryptionKey, exportKeyToHex, downloadMasterKey, storeSessionKey } from "@/lib/encryption";

type Step = "checking" | "invalid" | "request" | "request_sent" | "account" | "vault" | "plan" | "done";

function TrialPageInner() {
  const params = useSearchParams();
  const router = useRouter();
  const inviteKey = params.get("key") ?? "";

  const [step, setStep] = useState<Step>("checking");
  const [inviteLabel, setInviteLabel] = useState("");
  const [inviteError, setInviteError] = useState("");
  const [form, setForm] = useState({ name: "", email: "", password: "", restaurantName: "", locations: "1" });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // Request access form state
  const [reqForm, setReqForm] = useState({ name: "", email: "", restaurantName: "", locations: "1" });
  const [reqLoading, setReqLoading] = useState(false);
  const [reqError, setReqError] = useState("");

  // Vault
  const [keyHex, setKeyHex] = useState("");
  const [keyConfirmed, setKeyConfirmed] = useState(false);
  const [downloaded, setDownloaded] = useState(false);
  const [cryptoKey, setCryptoKey] = useState<CryptoKey | null>(null);
  const [generating, setGenerating] = useState(false);
  const [keyRevealed, setKeyRevealed] = useState(false);

  // Validate invite key on load
  useEffect(() => {
    if (!inviteKey) { setStep("request"); return; }
    fetch(`/api/invites/validate?key=${encodeURIComponent(inviteKey)}`)
      .then(r => r.json())
      .then(d => {
        if (d.valid) {
          setInviteLabel(d.label ?? "");
          if (d.email) setForm(f => ({ ...f, email: d.email }));
          setStep("account");
        } else {
          setStep("invalid");
          setInviteError(d.error ?? "Invalid invite key.");
        }
      })
      .catch(() => { setStep("invalid"); setInviteError("Could not validate your invite. Please try again."); });
  }, [inviteKey]);

  useEffect(() => { if (step === "vault" && !keyHex) generateKey(); }, [step]);

  async function generateKey() {
    setGenerating(true);
    try {
      const key = await generateEncryptionKey();
      const hex = await exportKeyToHex(key);
      setCryptoKey(key); setKeyHex(hex);
    } catch { setError("Failed to generate encryption key."); }
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
    if (!form.name || !form.email || !form.password || !form.restaurantName) { setError("Please fill in all fields."); return; }
    if (form.password.length < 8) { setError("Password must be at least 8 characters."); return; }
    setLoading(true);
    try {
      const { createClient } = await import("@/lib/supabase/client");
      const supabase = createClient();
      const { error: authError } = await supabase.auth.signUp({
        email: form.email,
        password: form.password,
        options: { data: { full_name: form.name, restaurant_name: form.restaurantName } }
      });
      if (authError) throw authError;
      await fetch("/api/auth/setup-profile", { method: "POST" }).catch(() => {});
      // Claim the invite key
      await fetch("/api/invites/claim", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ key: inviteKey }) }).catch(() => {});
      setStep("vault");
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Sign up failed.");
    }
    setLoading(false);
  }

  async function handleRequestSubmit(e: React.FormEvent) {
    e.preventDefault();
    setReqError("");
    if (!reqForm.email || !reqForm.email.includes("@")) { setReqError("Please enter a valid email address."); return; }
    setReqLoading(true);
    try {
      const res = await fetch("/api/trial/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...reqForm, attribution: getAttribution() }),
      });
      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error || "Request failed");
      track("trial_request");
      setStep("request_sent");
    } catch (e: unknown) {
      setReqError(e instanceof Error ? e.message : "Something went wrong. Please email hello@cashcall.io");
    }
    setReqLoading(false);
  }

  const steps = [
    { id: "account", label: "Account" },
    { id: "vault",   label: "Your Vault" },
    { id: "plan",    label: "Plan" },
    { id: "done",    label: "Done" },
  ];
  const stepIdx = steps.findIndex(s => s.id === step);

  const inputStyle = { background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)" };

  return (
    <div className="min-h-screen flex flex-col items-center justify-start pt-8 pb-16 px-4" style={{ background: "#060b18" }}>
      {/* Header */}
      <div className="mb-8 text-center">
        <Link href="/" className="text-2xl font-bold" style={{ color: "#00d4a8", fontFamily: "var(--font-space)" }}>⚡ CashCall</Link>
        {inviteLabel ? (
          <div className="mt-2 px-4 py-1.5 rounded-full text-xs inline-block"
            style={{ background: "rgba(0,212,168,0.1)", border: "1px solid rgba(0,212,168,0.25)", color: "#00d4a8" }}>
            You've been invited: {inviteLabel}
          </div>
        ) : (
          <div className="text-sm text-gray-500 mt-1">Your private, encrypted restaurant vault</div>
        )}
      </div>

      <div className="w-full max-w-lg">
        {/* ─── CHECKING ─── */}
        {step === "checking" && (
          <div className="text-center py-20 text-gray-400 text-sm animate-pulse">Validating your invite…</div>
        )}

        {/* ─── INVALID KEY (with existing invite that failed) ─── */}
        {step === "invalid" && (
          <div className="rounded-2xl p-8 border text-center" style={{ background: "rgba(239,68,68,0.05)", borderColor: "rgba(239,68,68,0.2)" }}>
            <div className="text-4xl mb-4">🔒</div>
            <h2 className="text-xl font-bold text-white mb-2">Invalid Invite Link</h2>
            <p className="text-red-400 text-sm mb-4">{inviteError}</p>
            <p className="text-gray-500 text-xs mb-6">Your link may have expired or already been used. Request a new invite below.</p>
            <button onClick={() => setStep("request")}
              className="w-full py-3 rounded-xl font-bold text-sm mb-3 transition-all hover:opacity-90"
              style={{ background: "#00d4a8", color: "#060b18" }}>
              Request Access →
            </button>
            <Link href="/" className="text-sm text-gray-500 hover:text-gray-400">← Back to cashcall.io</Link>
          </div>
        )}

        {/* ─── REQUEST ACCESS ─── */}
        {step === "request" && (
          <div className="rounded-2xl p-6 border" style={{ background: "rgba(255,255,255,0.03)", borderColor: "rgba(255,255,255,0.08)" }}>
            <div className="text-center mb-6">
              <div className="text-3xl mb-3">🚀</div>
              <h2 className="text-xl font-bold text-white mb-1">Request Early Access</h2>
              <p className="text-sm text-gray-400">We'll send you a personal invite link within 24 hours.</p>
            </div>
            <div className="mb-5 p-3 rounded-xl flex items-start gap-2" style={{ background: "rgba(0,212,168,0.06)", border: "1px solid rgba(0,212,168,0.15)" }}>
              <span className="text-teal-400 text-sm mt-0.5">✓</span>
              <span className="text-xs text-gray-300"><span className="text-teal-400 font-semibold">CashCall is invite-only.</span> We onboard restaurants personally to ensure every owner gets set up correctly and sees results in week one.</span>
            </div>
            <form onSubmit={handleRequestSubmit} className="space-y-4">
              {[
                { key: "name", label: "Your Name", placeholder: "Alex Chen", type: "text", required: false },
                { key: "email", label: "Email Address *", placeholder: "you@yourrestaurant.com", type: "email", required: true },
                { key: "restaurantName", label: "Restaurant Name", placeholder: "Tampa Bay Kitchen", type: "text", required: false },
              ].map(f => (
                <div key={f.key}>
                  <label className="block text-xs font-medium text-gray-400 mb-1.5">{f.label}</label>
                  <input type={f.type} placeholder={f.placeholder} required={f.required}
                    value={reqForm[f.key as keyof typeof reqForm]}
                    onChange={e => setReqForm(p => ({ ...p, [f.key]: e.target.value }))}
                    className="w-full px-3 py-2.5 rounded-xl text-sm text-white placeholder-gray-600 focus:outline-none"
                    style={inputStyle} />
                </div>
              ))}
              <div>
                <label className="block text-xs font-medium text-gray-400 mb-1.5">How many locations?</label>
                <select value={reqForm.locations} onChange={e => setReqForm(p => ({ ...p, locations: e.target.value }))}
                  className="w-full px-3 py-2.5 rounded-xl text-sm text-white focus:outline-none" style={inputStyle}>
                  <option value="1">1 location</option>
                  <option value="2-5">2–5 locations</option>
                  <option value="6+">6+ locations (Enterprise)</option>
                </select>
              </div>
              {reqError && <div className="text-red-400 text-sm px-3 py-2 rounded-xl" style={{ background: "rgba(239,68,68,0.1)" }}>{reqError}</div>}
              <button type="submit" disabled={reqLoading}
                className="w-full py-3 rounded-xl font-bold text-sm transition-all hover:opacity-90 disabled:opacity-50"
                style={{ background: "#00d4a8", color: "#060b18" }}>
                {reqLoading ? "Sending request…" : "Request My Invite →"}
              </button>
            </form>
            <div className="mt-4 pt-4 border-t text-center" style={{ borderColor: "rgba(255,255,255,0.06)" }}>
              <Link href="/sandbox" className="text-xs text-teal-400 hover:text-teal-300">⚡ Try the live demo first — no signup needed</Link>
            </div>
          </div>
        )}

        {/* ─── REQUEST SENT ─── */}
        {step === "request_sent" && (
          <div className="rounded-2xl p-8 border text-center" style={{ background: "rgba(0,212,168,0.04)", borderColor: "rgba(0,212,168,0.2)" }}>
            <div className="text-5xl mb-4">🎉</div>
            <h2 className="text-xl font-bold text-white mb-2">Request Received!</h2>
            <p className="text-gray-300 text-sm mb-4">
              We'll review your request and send a personal invite link to <span className="text-teal-400 font-semibold">{reqForm.email}</span> within 24 hours.
            </p>
            <div className="rounded-xl p-4 mb-6 text-left space-y-2" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)" }}>
              <p className="text-xs text-gray-400">While you wait, explore what's waiting for you:</p>
              <Link href="/sandbox" className="block text-sm text-teal-400 hover:text-teal-300 py-1">⚡ Try the live sandbox — see your future dashboard →</Link>
              <a href="https://cashcall.io/CashCall_Ecosystem_PitchDeck_2026.pptx" className="block text-sm text-gray-400 hover:text-gray-300 py-1">📊 Download the CashCall overview deck →</a>
            </div>
            <Link href="/"
              className="inline-block py-2.5 px-6 rounded-xl font-semibold text-sm transition-all"
              style={{ background: "rgba(255,255,255,0.08)", color: "white", border: "1px solid rgba(255,255,255,0.1)" }}>
              ← Back to cashcall.io
            </Link>
          </div>
        )}

        {/* ─── STEP INDICATOR (account/vault/plan/done) ─── */}
        {["account","vault","plan","done"].includes(step) && (
          <div className="flex items-center justify-center gap-0 mb-8">
            {steps.map((s, i) => (
              <div key={s.id} className="flex items-center">
                <div className="flex flex-col items-center">
                  <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold transition-all"
                    style={{
                      background: i < stepIdx ? "#00d4a8" : i === stepIdx ? "rgba(0,212,168,0.15)" : "rgba(255,255,255,0.08)",
                      border: `1px solid ${i <= stepIdx ? "#00d4a8" : "rgba(255,255,255,0.1)"}`,
                      color: i < stepIdx ? "#060b18" : i === stepIdx ? "#00d4a8" : "#4b5563",
                    }}>
                    {i < stepIdx ? "✓" : i + 1}
                  </div>
                  <div className="text-xs mt-1 hidden sm:block" style={{ color: i === stepIdx ? "#00d4a8" : "#4b5563" }}>{s.label}</div>
                </div>
                {i < steps.length - 1 && (
                  <div className="w-8 sm:w-16 h-px mx-2" style={{ background: i < stepIdx ? "#00d4a8" : "rgba(255,255,255,0.08)" }} />
                )}
              </div>
            ))}
          </div>
        )}

        {/* ─── ACCOUNT ─── */}
        {step === "account" && (
          <div className="rounded-2xl p-6 border" style={{ background: "rgba(255,255,255,0.03)", borderColor: "rgba(255,255,255,0.08)" }}>
            {/* Trust badge */}
            <div className="flex items-center gap-2 mb-5 p-3 rounded-xl" style={{ background: "rgba(0,212,168,0.05)", border: "1px solid rgba(0,212,168,0.15)" }}>
              <span className="text-lg">🔐</span>
              <div className="text-xs text-gray-300">
                <span className="text-teal-400 font-semibold">Zero-knowledge encryption.</span>{" "}
                Your financial data is encrypted before it leaves your browser. We never see it — ever.
              </div>
            </div>
            <h2 className="text-xl font-bold text-white mb-1">Create your account</h2>
            <p className="text-sm text-gray-400 mb-5">Your private restaurant vault, accessible only to you.</p>
            <form onSubmit={handleAccountSubmit} className="space-y-4">
              {[
                { key: "name", label: "Your Name", placeholder: "Alex Chen", type: "text" },
                { key: "restaurantName", label: "Restaurant Name", placeholder: "Tampa Bay Kitchen", type: "text" },
                { key: "email", label: "Email Address", placeholder: "you@yourrestaurant.com", type: "email" },
                { key: "password", label: "Password (min 8 chars)", placeholder: "••••••••••", type: "password" },
              ].map(f => (
                <div key={f.key}>
                  <label className="block text-xs font-medium text-gray-400 mb-1.5">{f.label}</label>
                  <input type={f.type} placeholder={f.placeholder}
                    value={form[f.key as keyof typeof form]}
                    onChange={e => setForm(p => ({ ...p, [f.key]: e.target.value }))}
                    className="w-full px-3 py-2.5 rounded-xl text-sm text-white placeholder-gray-600 focus:outline-none"
                    style={inputStyle} required />
                </div>
              ))}
              <div>
                <label className="block text-xs font-medium text-gray-400 mb-1.5">How many locations?</label>
                <select value={form.locations} onChange={e => setForm(p => ({ ...p, locations: e.target.value }))}
                  className="w-full px-3 py-2.5 rounded-xl text-sm text-white focus:outline-none" style={inputStyle}>
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
            <div className="mt-5 pt-4 border-t text-center text-xs space-y-1" style={{ borderColor: "rgba(255,255,255,0.06)" }}>
              <div className="text-gray-500">Already have an account? <Link href="/login" className="text-teal-400">Sign in</Link></div>
              <div className="text-gray-600">
                <Link href="/security" className="hover:text-gray-400 transition-colors">🔐 How we protect your data →</Link>
              </div>
            </div>
          </div>
        )}

        {/* ─── VAULT ─── */}
        {step === "vault" && (
          <div className="space-y-4">
            <div className="rounded-2xl p-6 border" style={{ background: "rgba(129,140,248,0.05)", borderColor: "rgba(129,140,248,0.2)" }}>
              <div className="flex items-start gap-3 mb-5">
                <div className="text-2xl">🔐</div>
                <div>
                  <h2 className="text-xl font-bold text-white">Your Encryption Vault</h2>
                  <p className="text-sm text-gray-400 mt-0.5">
                    We generated a 256-bit AES key for your restaurant. It encrypts all your financial data before it leaves your browser. We never see it.
                  </p>
                </div>
              </div>
              <div className="rounded-xl p-4 mb-4" style={{ background: "rgba(0,0,0,0.3)", border: "1px solid rgba(129,140,248,0.15)" }}>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs text-indigo-400 uppercase tracking-wider font-medium">Your AES-256 Encryption Key</span>
                  <button onClick={() => setKeyRevealed(r => !r)} className="text-xs text-gray-400 hover:text-white transition-colors">
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
              <button onClick={handleDownload} disabled={!keyHex || generating}
                className="w-full py-3 rounded-xl font-bold text-sm flex items-center justify-center gap-2 transition-all disabled:opacity-40"
                style={{ background: downloaded ? "rgba(0,212,168,0.15)" : "#818cf8", color: downloaded ? "#00d4a8" : "white", border: downloaded ? "1px solid rgba(0,212,168,0.4)" : "none" }}>
                {downloaded ? "✓ Master Key Downloaded" : "⬇ Download Master Recovery Key (.txt)"}
              </button>
              {downloaded && (
                <div className="mt-3 p-3 rounded-xl text-xs" style={{ background: "rgba(0,212,168,0.08)", border: "1px solid rgba(0,212,168,0.2)", color: "#94a3b8" }}>
                  <strong className="text-white">Save this file</strong> in your password manager or an encrypted USB. This is the ONLY recovery method — we do not store a copy.
                </div>
              )}
            </div>
            <div className="rounded-2xl p-5 border" style={{ background: "rgba(255,255,255,0.02)", borderColor: "rgba(255,255,255,0.06)" }}>
              <div className="text-xs text-gray-400 uppercase tracking-wider mb-3">What zero-knowledge means for you</div>
              <div className="space-y-3">
                {[
                  { icon: "🔒", text: "Your financial data is encrypted before it leaves your browser — we never see plaintext." },
                  { icon: "🚫", text: "We cannot read your data even if compelled. The key is yours alone." },
                  { icon: "🏛", text: "Government subpoena? We hand over encrypted gibberish. Useless without your key." },
                  { icon: "✓", text: "Military-grade AES-256-GCM — the same standard used by the US Department of Defense." },
                ].map((f, i) => (
                  <div key={i} className="flex gap-3 text-sm"><span>{f.icon}</span><span className="text-gray-400">{f.text}</span></div>
                ))}
              </div>
            </div>
            <label className="flex items-start gap-3 cursor-pointer p-3 rounded-xl border"
              style={{ borderColor: keyConfirmed ? "rgba(0,212,168,0.4)" : "rgba(255,255,255,0.08)", background: keyConfirmed ? "rgba(0,212,168,0.05)" : "transparent" }}>
              <input type="checkbox" checked={keyConfirmed} onChange={e => setKeyConfirmed(e.target.checked)} className="mt-0.5 accent-teal-400" />
              <span className="text-sm text-gray-300">I have downloaded and saved my Master Recovery Key. I understand that losing it means permanent loss of access to my data.</span>
            </label>
            <button onClick={() => setStep("plan")} disabled={!downloaded || !keyConfirmed}
              className="w-full py-3 rounded-xl font-bold text-sm transition-all disabled:opacity-30"
              style={{ background: "#00d4a8", color: "#060b18" }}>
              Continue → Choose Your Plan
            </button>
          </div>
        )}

        {/* ─── PLAN ─── */}
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
              <div key={plan.id} className="rounded-2xl p-5 border"
                style={{ background: plan.highlight ? "rgba(0,212,168,0.06)" : "rgba(255,255,255,0.03)", borderColor: plan.highlight ? "rgba(0,212,168,0.35)" : "rgba(255,255,255,0.07)" }}>
                <div className="flex items-center justify-between mb-3">
                  <div><div className="font-bold text-white text-sm">{plan.name}</div><div className="text-xs text-gray-500">{plan.locations}</div></div>
                  <div className="text-xl font-bold" style={{ color: plan.highlight ? "#00d4a8" : "white" }}>
                    {plan.price}<span className="text-sm font-normal text-gray-400">{plan.period}</span>
                  </div>
                </div>
                <ul className="space-y-1.5 mb-4">
                  {plan.features.map(f => (
                    <li key={f} className="flex items-center gap-2 text-xs text-gray-300"><span style={{ color: "#00d4a8" }}>✓</span> {f}</li>
                  ))}
                </ul>
                <button onClick={() => setStep("done")}
                  className="w-full py-2.5 rounded-xl text-sm font-semibold transition-all"
                  style={{ background: plan.highlight ? "#00d4a8" : "rgba(255,255,255,0.08)", color: plan.highlight ? "#060b18" : "white" }}>
                  {plan.id === "enterprise" ? "Contact Sales" : "Start Free Trial"}
                </button>
              </div>
            ))}
          </div>
        )}

        {/* ─── DONE ─── */}
        {step === "done" && (
          <div className="text-center space-y-6">
            <div className="text-6xl">🎉</div>
            <div>
              <h2 className="text-2xl font-bold text-white mb-2">Your vault is ready.</h2>
              <p className="text-gray-400 text-sm">Welcome to CashCall, {form.name || "Chef"}. Your encrypted financial command center is live.</p>
            </div>
            <div className="rounded-2xl p-5 border text-left space-y-2" style={{ background: "rgba(0,212,168,0.05)", borderColor: "rgba(0,212,168,0.2)" }}>
              <div className="text-xs text-teal-400 uppercase tracking-wider mb-2">What's ready right now</div>
              {["📊 Prime Cost dashboard", "🧾 AI Invoice OCR", "⚡ Sales Scan", "👥 Payroll import", "🔐 Encryption vault active"].map(item => (
                <div key={item} className="text-sm text-gray-300">{item}</div>
              ))}
            </div>
            <Link href="/dashboard" className="block w-full py-3.5 rounded-xl font-bold text-base transition-all hover:opacity-90" style={{ background: "#00d4a8", color: "#060b18" }}>
              Enter Your Dashboard →
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}

export default function TrialPage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center" style={{ background: "#060b18" }}><div className="text-gray-400 text-sm animate-pulse">Loading…</div></div>}>
      <TrialPageInner />
    </Suspense>
  );
}
