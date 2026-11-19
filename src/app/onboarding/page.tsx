"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

const US_STATES = [
  "AL","AK","AZ","AR","CA","CO","CT","DE","FL","GA","HI","ID","IL","IN","IA",
  "KS","KY","LA","ME","MD","MA","MI","MN","MS","MO","MT","NE","NV","NH","NJ",
  "NM","NY","NC","ND","OH","OK","OR","PA","RI","SC","SD","TN","TX","UT","VT",
  "VA","WA","WV","WI","WY","DC",
];

type Step = "setup" | "welcome" | "location" | "pos" | "digest" | "done" | "error";

function ProgressDots({ step }: { step: Step }) {
  const steps: Step[] = ["welcome", "location", "pos", "digest", "done"];
  const idx = steps.indexOf(step);
  return (
    <div className="flex items-center justify-center gap-2 mb-8">
      {steps.map((s, i) => (
        <div key={s} className="flex items-center gap-2">
          <div
            className="w-2 h-2 rounded-full transition-all duration-300"
            style={{
              background: i <= idx ? "#00d4a8" : "rgba(255,255,255,0.15)",
              transform: i === idx ? "scale(1.4)" : "scale(1)",
            }}
          />
          {i < steps.length - 1 && (
            <div className="w-8 h-px" style={{ background: i < idx ? "#00d4a8" : "rgba(255,255,255,0.1)" }} />
          )}
        </div>
      ))}
    </div>
  );
}

export default function OnboardingPage() {
  const router = useRouter();
  const [step, setStep] = useState<Step>("setup");
  const [locationCount, setLocationCount] = useState<"single" | "multi" | null>(null);
  const [saving, setSaving] = useState(false);
  const [locationId, setLocationId] = useState<string | null>(null);
  const [emailSlug, setEmailSlug] = useState<string | null>(null);
  const [form, setForm] = useState({
    name: "",
    state: "",
    tax_rate: "",
    address: "",
    location_type: "restaurant" as "restaurant" | "bar_restaurant",
  });
  const [formError, setFormError] = useState("");

  // Digest setup
  const [whatsappNumber, setWhatsappNumber] = useState("");
  const [digestEmail, setDigestEmail] = useState("");
  const [savingDigest, setSavingDigest] = useState(false);
  const [digestSaved, setDigestSaved] = useState(false);

  // POS connect state
  const [posConnecting, setPosConnecting] = useState(false);

  // Step 0: auto-create user profile
  useEffect(() => {
    fetch("/api/auth/setup-profile", { method: "POST" })
      .then(r => r.json())
      .then(data => {
        if (data.ok) setStep("welcome");
        else setStep("error");
      })
      .catch(() => setStep("error"));
  }, []);

  async function handleCreateLocation() {
    setFormError("");
    if (!form.name.trim()) { setFormError("Restaurant name is required."); return; }
    if (!form.state) { setFormError("Please select a state."); return; }

    setSaving(true);
    try {
      const res = await fetch("/api/locations/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name,
          state: form.state,
          tax_rate: String(parseFloat(form.tax_rate || "0") / 100),
          address: form.address,
          location_type: form.location_type,
        }),
      });
      const data = await res.json();
      if (data.ok) {
        setLocationId(data.location_id ?? null);
        setEmailSlug(data.email_slug ?? null);
        setStep("pos");
      } else {
        setFormError(data.error || "Failed to create location.");
      }
    } catch {
      setFormError("Network error. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  async function handleSaveDigest() {
    if (!whatsappNumber && !digestEmail) {
      setStep("done");
      return;
    }
    setSavingDigest(true);
    try {
      await fetch("/api/settings/notifications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          whatsapp_number: whatsappNumber || null,
          digest_email: digestEmail || null,
          digest_enabled: !!(whatsappNumber || digestEmail),
          whatsapp_provider: "twilio",
        }),
      });
      setDigestSaved(true);
      setTimeout(() => setStep("done"), 800);
    } catch {
      setStep("done");
    } finally {
      setSavingDigest(false);
    }
  }

  function field(label: string, el: React.ReactNode) {
    return (
      <div>
        <label className="block text-xs font-semibold text-gray-400 mb-1.5 uppercase tracking-wide">{label}</label>
        {el}
      </div>
    );
  }

  const inputClass = "w-full rounded-xl px-4 py-3 text-sm text-white outline-none transition-all focus:ring-2 focus:ring-teal-500/40";
  const inputStyle = {
    background: "rgba(255,255,255,0.06)",
    border: "1px solid rgba(255,255,255,0.1)",
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-4 py-12"
      style={{ background: "#060b18" }}>

      {/* Logo */}
      <div className="flex items-center gap-2 mb-10">
        <div className="w-9 h-9 rounded-xl flex items-center justify-center"
          style={{ background: "rgba(0,212,168,0.15)", border: "1px solid rgba(0,212,168,0.3)" }}>
          <span className="text-xl">⚡</span>
        </div>
        <span className="text-white font-bold text-lg tracking-tight">CashCall</span>
      </div>

      <div className="w-full max-w-md">

        {/* ── STEP: SETUP (loading) ── */}
        {step === "setup" && (
          <div className="text-center space-y-5">
            <div className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto animate-pulse"
              style={{ background: "rgba(0,212,168,0.1)", border: "1px solid rgba(0,212,168,0.3)" }}>
              <span className="text-3xl">⚡</span>
            </div>
            <div>
              <h1 className="text-2xl font-bold text-white">Setting up your vault…</h1>
              <p className="text-gray-400 text-sm mt-2">Creating your CashCall account — just a moment.</p>
            </div>
            <div className="flex justify-center gap-1.5">
              {[0,1,2].map(i => (
                <div key={i} className="w-2 h-2 rounded-full animate-bounce"
                  style={{ background: "#00d4a8", animationDelay: `${i * 0.15}s` }} />
              ))}
            </div>
          </div>
        )}

        {/* ── STEP: WELCOME — 1 or multi? ── */}
        {step === "welcome" && (
          <div className="space-y-6">
            <ProgressDots step="welcome" />
            <div className="text-center mb-6">
              <h1 className="text-2xl sm:text-3xl font-bold text-white">Welcome to CashCall</h1>
              <p className="text-gray-400 text-sm mt-2">Let's set up your financial dashboard. How many locations do you manage?</p>
            </div>

            <div className="grid grid-cols-1 gap-3">
              <button
                onClick={() => { setLocationCount("single"); setStep("location"); }}
                className="group rounded-2xl p-6 text-left transition-all hover:scale-[1.02]"
                style={{ background: "rgba(0,212,168,0.06)", border: "1px solid rgba(0,212,168,0.2)" }}>
                <div className="flex items-start gap-4">
                  <div className="w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0 text-2xl"
                    style={{ background: "rgba(0,212,168,0.12)" }}>🏪</div>
                  <div>
                    <h3 className="font-bold text-white text-base">Single location</h3>
                    <p className="text-gray-400 text-sm mt-0.5">One restaurant, one dashboard. Perfect for independent owners.</p>
                  </div>
                  <span className="ml-auto text-teal-400 text-lg self-center">→</span>
                </div>
              </button>

              <button
                onClick={() => { setLocationCount("multi"); setStep("location"); }}
                className="group rounded-2xl p-6 text-left transition-all hover:scale-[1.02]"
                style={{ background: "rgba(129,140,248,0.06)", border: "1px solid rgba(129,140,248,0.2)" }}>
                <div className="flex items-start gap-4">
                  <div className="w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0 text-2xl"
                    style={{ background: "rgba(129,140,248,0.12)" }}>🏢</div>
                  <div>
                    <h3 className="font-bold text-white text-base">Multiple locations</h3>
                    <p className="text-gray-400 text-sm mt-0.5">Chain or franchise? Get a unified view across all your restaurants.</p>
                  </div>
                  <span className="ml-auto text-indigo-400 text-lg self-center">→</span>
                </div>
              </button>
            </div>
          </div>
        )}

        {/* ── STEP: LOCATION DETAILS ── */}
        {step === "location" && (
          <div className="space-y-6">
            <ProgressDots step="location" />
            <div className="text-center mb-6">
              <h1 className="text-2xl font-bold text-white">
                {locationCount === "multi" ? "Add your first location" : "Set up your restaurant"}
              </h1>
              <p className="text-gray-400 text-sm mt-2">
                {locationCount === "multi"
                  ? "Start with one — you can add more from Settings."
                  : "Tell us about your restaurant."}
              </p>
            </div>

            <div className="rounded-2xl p-6 space-y-5"
              style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)" }}>

              {/* Venue type toggle */}
              <div>
                <label className="block text-xs font-semibold text-gray-400 mb-2 uppercase tracking-wide">Venue Type *</label>
                <div className="grid grid-cols-2 gap-2">
                  {([
                    { value: "restaurant", emoji: "🍽️", label: "Restaurant", desc: "Food-focused" },
                    { value: "bar_restaurant", emoji: "🍹", label: "Bar & Restaurant", desc: "Full bar program" },
                  ] as const).map(opt => (
                    <button key={opt.value} type="button"
                      onClick={() => setForm(f => ({ ...f, location_type: opt.value }))}
                      className="rounded-xl p-3 text-left transition-all"
                      style={form.location_type === opt.value
                        ? { background: "rgba(0,212,168,0.12)", border: "2px solid #00d4a8" }
                        : { background: "rgba(255,255,255,0.04)", border: "2px solid rgba(255,255,255,0.08)" }}>
                      <div className="text-lg mb-0.5">{opt.emoji}</div>
                      <div className="text-sm font-semibold text-white">{opt.label}</div>
                      <div className="text-xs text-gray-400">{opt.desc}</div>
                    </button>
                  ))}
                </div>
              </div>

              {field("Restaurant name *",
                <input
                  className={inputClass}
                  style={inputStyle}
                  placeholder="e.g. The Spice House"
                  value={form.name}
                  onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                  autoFocus
                />
              )}

              {field("Address (optional)",
                <input
                  className={inputClass}
                  style={inputStyle}
                  placeholder="123 Main St, City"
                  value={form.address}
                  onChange={e => setForm(f => ({ ...f, address: e.target.value }))}
                />
              )}

              <div className="grid grid-cols-2 gap-4">
                {field("State *",
                  <select
                    className={inputClass}
                    style={{ ...inputStyle, appearance: "none", WebkitAppearance: "none", color: "#fff", background: "#1a2035" }}
                    value={form.state}
                    onChange={e => setForm(f => ({ ...f, state: e.target.value }))}>
                    <option value="" style={{ background: "#1a2035", color: "#9ca3af" }}>Select…</option>
                    {US_STATES.map(s => <option key={s} value={s} style={{ background: "#1a2035", color: "#fff" }}>{s}</option>)}
                  </select>
                )}

                {field("Sales tax %",
                  <input
                    className={inputClass}
                    style={inputStyle}
                    type="number"
                    step="0.1"
                    min="0"
                    max="20"
                    placeholder="e.g. 8.25"
                    value={form.tax_rate}
                    onChange={e => setForm(f => ({ ...f, tax_rate: e.target.value }))}
                  />
                )}
              </div>

              {formError && (
                <p className="text-sm rounded-lg px-3 py-2"
                  style={{ color: "#f87171", background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.2)" }}>
                  {formError}
                </p>
              )}
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => setStep("welcome")}
                className="px-5 py-3 rounded-xl text-sm font-medium text-gray-400 transition-colors hover:text-white"
                style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}>
                ← Back
              </button>
              <button
                onClick={handleCreateLocation}
                disabled={saving}
                className="flex-1 py-3 rounded-xl text-sm font-bold transition-all hover:opacity-90 disabled:opacity-50"
                style={{ background: "#00d4a8", color: "#060b18" }}>
                {saving ? "Creating…" : "Continue →"}
              </button>
            </div>
          </div>
        )}

        {/* ── STEP: POS CONNECT ── */}
        {step === "pos" && (
          <div className="space-y-6">
            <ProgressDots step="pos" />
            <div className="text-center mb-2">
              <h1 className="text-2xl font-bold text-white">Connect your POS</h1>
              <p className="text-gray-400 text-sm mt-2">
                CashCall syncs sales automatically — no more Z-report photos.
              </p>
            </div>

            <div className="space-y-3">
              {[
                { id: "clover", name: "Clover", emoji: "🍀", desc: "OAuth — connects in one click", href: "/api/pos/clover/oauth" },
                { id: "toast",  name: "Toast",  emoji: "🍞", desc: "API key required",             href: "/settings/integrations?connect=toast" },
                { id: "square", name: "Square", emoji: "⬛", desc: "OAuth — connects in one click", href: "/api/pos/square/oauth" },
              ].map(pos => (
                <a key={pos.id} href={pos.href}
                  onClick={() => setPosConnecting(true)}
                  className="flex items-center gap-4 rounded-2xl p-4 transition-all hover:scale-[1.01] block"
                  style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)" }}>
                  <div className="w-11 h-11 rounded-xl flex items-center justify-center text-2xl flex-shrink-0"
                    style={{ background: "rgba(0,212,168,0.1)" }}>
                    {pos.emoji}
                  </div>
                  <div className="flex-1">
                    <div className="font-semibold text-white text-sm">{pos.name}</div>
                    <div className="text-xs text-gray-400 mt-0.5">{pos.desc}</div>
                  </div>
                  <span className="text-teal-400 text-sm font-medium">Connect →</span>
                </a>
              ))}
            </div>

            {/* Email ingest card */}
            <div className="rounded-2xl p-4"
              style={{ background: "rgba(0,212,168,0.05)", border: "1px solid rgba(0,212,168,0.15)" }}>
              <div className="flex items-start gap-3">
                <span className="text-xl">📧</span>
                <div className="flex-1">
                  <div className="text-sm font-semibold text-white mb-1">Email your invoices directly</div>
                  <div className="text-xs text-gray-400 mb-2">
                    Forward any invoice to your unique address — CashCall OCRs it automatically.
                  </div>
                  {emailSlug ? (
                    <div className="rounded-lg px-3 py-2 font-mono text-xs"
                      style={{ background: "rgba(0,0,0,0.3)", border: "1px solid rgba(0,212,168,0.2)", color: "#00d4a8" }}>
                      {emailSlug}@invoices.cashcall.io
                    </div>
                  ) : (
                    <div className="rounded-lg px-3 py-2 font-mono text-xs text-gray-500"
                      style={{ background: "rgba(0,0,0,0.3)", border: "1px solid rgba(255,255,255,0.08)" }}>
                      Available after location is confirmed
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => setStep("location")}
                className="px-5 py-3 rounded-xl text-sm font-medium text-gray-400 transition-colors hover:text-white"
                style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}>
                ← Back
              </button>
              <button
                onClick={() => setStep("digest")}
                className="flex-1 py-3 rounded-xl text-sm font-bold transition-all hover:opacity-90"
                style={{ background: "#00d4a8", color: "#060b18" }}>
                {posConnecting ? "Continue after connecting →" : "Skip for now →"}
              </button>
            </div>
          </div>
        )}

        {/* ── STEP: DIGEST SETUP ── */}
        {step === "digest" && (
          <div className="space-y-6">
            <ProgressDots step="digest" />
            <div className="text-center mb-2">
              <h1 className="text-2xl font-bold text-white">Morning digest</h1>
              <p className="text-gray-400 text-sm mt-2">
                Get your prime cost, price creep alerts, and invoice summary every morning.
              </p>
            </div>

            {/* Preview card */}
            <div className="rounded-2xl p-4"
              style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)" }}>
              <div className="text-xs text-gray-500 uppercase tracking-wider mb-3">Preview — what you'll receive</div>
              <div className="font-mono text-xs leading-relaxed space-y-1"
                style={{ color: "#94a3b8" }}>
                <div className="font-bold text-white">⚡ CashCall Daily Brief — {form.name || "Your Restaurant"}</div>
                <div className="text-gray-500">📅 Mon, Nov 11</div>
                <div>&nbsp;</div>
                <div style={{ color: "#fbbf24" }}>🟡 Prime Cost: 63.2% (-1.4% vs last week)</div>
                <div style={{ color: "#f87171" }}>🔴 Price Creep: Chicken Breast +$0.47/lb = -$340/mo</div>
                <div style={{ color: "#34d399" }}>✅ 3 invoices processed automatically</div>
                <div>&nbsp;</div>
                <div className="text-gray-600">Reply INVOICE · Reply STOP</div>
              </div>
            </div>

            <div className="rounded-2xl p-5 space-y-4"
              style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)" }}>

              {field("WhatsApp number (recommended)",
                <div className="flex gap-2">
                  <input
                    className={inputClass}
                    style={inputStyle}
                    type="tel"
                    placeholder="+1 (555) 000-0000"
                    value={whatsappNumber}
                    onChange={e => setWhatsappNumber(e.target.value)}
                  />
                </div>
              )}

              {field("Email digest (optional)",
                <input
                  className={inputClass}
                  style={inputStyle}
                  type="email"
                  placeholder="you@restaurant.com"
                  value={digestEmail}
                  onChange={e => setDigestEmail(e.target.value)}
                />
              )}
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => setStep("pos")}
                className="px-5 py-3 rounded-xl text-sm font-medium text-gray-400 transition-colors hover:text-white"
                style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}>
                ← Back
              </button>
              <button
                onClick={handleSaveDigest}
                disabled={savingDigest}
                className="flex-1 py-3 rounded-xl text-sm font-bold transition-all hover:opacity-90 disabled:opacity-50"
                style={{ background: "#00d4a8", color: "#060b18" }}>
                {savingDigest ? "Saving…" : digestSaved ? "Saved ✓" : (whatsappNumber || digestEmail) ? "Set Up Digest →" : "Skip for now →"}
              </button>
            </div>
          </div>
        )}

        {/* ── STEP: DONE ── */}
        {step === "done" && (
          <div className="text-center space-y-6">
            <ProgressDots step="done" />
            <div className="w-20 h-20 rounded-2xl flex items-center justify-center mx-auto"
              style={{ background: "rgba(0,212,168,0.12)", border: "2px solid rgba(0,212,168,0.4)" }}>
              <span className="text-4xl">✅</span>
            </div>

            {/* Founder welcome */}
            <div className="rounded-2xl p-5 text-left"
              style={{ background: "rgba(0,212,168,0.05)", border: "1px solid rgba(0,212,168,0.2)" }}>
              <div className="flex items-start gap-3 mb-3">
                <div className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 font-bold text-sm"
                  style={{ background: "rgba(0,212,168,0.2)", color: "#00d4a8" }}>
                  HB
                </div>
                <div>
                  <div className="text-sm font-semibold text-white">From the founder</div>
                  <div className="text-xs text-gray-500 mt-0.5">HBK · CashCall</div>
                </div>
              </div>
              <p className="text-sm text-gray-300 leading-relaxed">
                "Welcome. I built CashCall because I was tired of finding out my food cost was 72% a week after the fact.
                Your first morning digest will arrive tomorrow — and if anything looks wrong, reply directly to the WhatsApp message.
                I personally review every piece of feedback during beta."
              </p>
            </div>

            <div>
              <h1 className="text-2xl font-bold text-white">You're all set!</h1>
              <p className="text-gray-400 text-sm mt-2">
                {locationCount === "multi"
                  ? "Your first location is ready. Add more from Settings → Locations."
                  : "Your restaurant is configured. Heading to your dashboard…"}
              </p>
            </div>

            {/* What's next checklist */}
            <div className="rounded-2xl p-4 text-left space-y-2.5"
              style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)" }}>
              <div className="text-xs text-gray-500 uppercase tracking-wider mb-1">Your setup checklist</div>
              {[
                { done: true,  label: "Restaurant created" },
                { done: true,  label: "Encryption vault active" },
                { done: !!(whatsappNumber || digestEmail), label: "Morning digest configured" },
                { done: false, label: "Upload your first invoice", link: "/invoices/upload" },
                { done: false, label: "Connect your POS",         link: "/settings/integrations" },
              ].map((item, i) => (
                <div key={i} className="flex items-center gap-3 text-sm">
                  <span className={item.done ? "text-teal-400" : "text-gray-600"}>
                    {item.done ? "✓" : "○"}
                  </span>
                  {item.link && !item.done
                    ? <Link href={item.link} className="text-teal-400 hover:underline">{item.label}</Link>
                    : <span className={item.done ? "text-gray-300" : "text-gray-500"}>{item.label}</span>
                  }
                </div>
              ))}
            </div>

            <button
              onClick={() => router.push("/dashboard")}
              className="w-full py-3 rounded-xl text-sm font-bold transition-all hover:opacity-90"
              style={{ background: "#00d4a8", color: "#060b18" }}>
              Go to Dashboard →
            </button>
          </div>
        )}

        {/* ── STEP: ERROR ── */}
        {step === "error" && (
          <div className="text-center space-y-6">
            <div className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto"
              style={{ background: "rgba(249,115,22,0.1)", border: "1px solid rgba(249,115,22,0.3)" }}>
              <span className="text-3xl">⚠️</span>
            </div>
            <div>
              <h1 className="text-2xl font-bold text-white">Setup issue</h1>
              <p className="text-gray-400 text-sm mt-2">
                We couldn't finish setting up your account. This sometimes happens when email confirmation is still pending.
              </p>
            </div>
            <div className="rounded-xl p-4 text-sm text-left"
              style={{ background: "rgba(249,115,22,0.08)", border: "1px solid rgba(249,115,22,0.25)", color: "#fb923c" }}>
              <p className="font-semibold mb-1">If you just signed up:</p>
              <p className="text-xs text-gray-400">Check your email for a confirmation link, then come back and sign in.</p>
            </div>
            <div className="flex gap-3">
              <Link href="/login"
                className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-center transition-all"
                style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)", color: "white" }}>
                Sign In
              </Link>
              <button
                onClick={() => {
                  setStep("setup");
                  fetch("/api/auth/setup-profile", { method: "POST" })
                    .then(r => r.json())
                    .then(d => { if (d.ok) setStep("welcome"); else setStep("error"); })
                    .catch(() => setStep("error"));
                }}
                className="flex-1 py-2.5 rounded-xl text-sm font-semibold transition-all"
                style={{ background: "#00d4a8", color: "#060b18" }}>
                Retry
              </button>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
