"use client";

import { useState, useCallback, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

async function sendPasswordReset(email: string): Promise<string | null> {
  const supabase = createClient();
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${window.location.origin}/reset-password`,
  });
  return error ? error.message : null;
}

const MAX_ATTEMPTS = 5;
const LOCKOUT_SECONDS = 30;

// Safe MFA error messages
function safeMFAError(msg: string): string {
  if (msg.toLowerCase().includes("invalid") || msg.toLowerCase().includes("expired"))
    return "Invalid or expired code. Please try again.";
  return "Verification failed. Please try again.";
}

// Never expose Supabase's internal error messages to the UI
function safeErrorMessage(msg: string): string {
  const lower = msg.toLowerCase();
  if (lower.includes("email not confirmed"))
    return "EMAIL_NOT_CONFIRMED"; // special sentinel — handled in UI
  if (lower.includes("invalid login") || lower.includes("invalid credentials") || lower.includes("wrong password"))
    return "Invalid email or password. Please try again.";
  if (lower.includes("too many requests") || lower.includes("rate limit"))
    return "Too many login attempts. Please wait a moment and try again.";
  if (lower.includes("network") || lower.includes("fetch"))
    return "Network error. Check your connection and try again.";
  // Generic fallback — never show raw Supabase errors
  return "Login failed. Please check your credentials and try again.";
}

function LoginPageContent() {
  const [email, setEmail]       = useState("");
  const [password, setPassword] = useState("");
  const [error, setError]       = useState("");
  const [loading, setLoading]   = useState(false);
  const [emailNotConfirmed, setEmailNotConfirmed] = useState(false);
  const [resendLoading, setResendLoading] = useState(false);
  const [resendSent, setResendSent] = useState(false);
  const searchParams = useSearchParams();

  useEffect(() => {
    const urlError = searchParams.get("error");
    if (urlError) setError(urlError);
  }, [searchParams]);
  const [attempts, setAttempts] = useState(0);
  const [lockedUntil, setLockedUntil] = useState<number>(0);
  const [resetSent, setResetSent] = useState(false);
  const [resetLoading, setResetLoading] = useState(false);
  // MFA state
  const [showPassword, setShowPassword]   = useState(false);
  const [mfaFactorId, setMfaFactorId]     = useState("");
  const [mfaChallengeId, setMfaChallengeId] = useState("");
  const [mfaCode, setMfaCode]             = useState("");
  const [mfaLoading, setMfaLoading]       = useState(false);
  const [showMfa, setShowMfa]             = useState(false);
  const router = useRouter();
  const supabase = createClient();

  const handleLogin = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();

    // Client-side rate limiting UI
    if (Date.now() < lockedUntil) {
      const secs = Math.ceil((lockedUntil - Date.now()) / 1000);
      setError(`Too many failed attempts. Please wait ${secs}s before trying again.`);
      return;
    }

    // Basic input validation
    const emailTrimmed = email.trim().toLowerCase();
    if (!emailTrimmed || !emailTrimmed.includes("@")) {
      setError("Please enter a valid email address."); return;
    }
    if (password.length < 6) {
      setError("Password must be at least 6 characters."); return;
    }

    setError(""); setLoading(true);
    const { error: authError } = await supabase.auth.signInWithPassword({
      email: emailTrimmed,
      password,
    });
    setLoading(false);

    if (authError) {
      const msg = safeErrorMessage(authError.message);
      if (msg === "EMAIL_NOT_CONFIRMED") {
        setEmailNotConfirmed(true);
        setError("");
        return;
      }
      const newAttempts = attempts + 1;
      setAttempts(newAttempts);
      if (newAttempts >= MAX_ATTEMPTS) {
        setLockedUntil(Date.now() + LOCKOUT_SECONDS * 1000);
        setAttempts(0);
        setError(`Account temporarily locked after ${MAX_ATTEMPTS} failed attempts. Please wait ${LOCKOUT_SECONDS} seconds.`);
      } else {
        setError(msg);
      }
      return;
    }

    // Success — check for MFA
    setAttempts(0);
    const { data: mfaData } = await supabase.auth.mfa.listFactors();
    const verifiedFactor = (mfaData?.totp ?? []).find(f => f.status === "verified");
    if (verifiedFactor) {
      // User has MFA enrolled — start challenge
      const { data: challengeData, error: challengeErr } = await supabase.auth.mfa.challenge({ factorId: verifiedFactor.id });
      if (challengeErr) { setError("MFA challenge failed. Please try again."); return; }
      setMfaFactorId(verifiedFactor.id);
      setMfaChallengeId(challengeData.id);
      setShowMfa(true);
    } else {
      const redirectTo = searchParams.get("redirect") || "/dashboard";
      router.push(redirectTo);
      router.refresh();
    }
  }, [email, password, attempts, lockedUntil, supabase, router, searchParams]);

  const handleMfaVerify = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    if (mfaCode.length !== 6) { setError("Enter the 6-digit code from your authenticator app."); return; }
    setMfaLoading(true); setError("");
    const { error: verifyErr } = await supabase.auth.mfa.verify({
      factorId: mfaFactorId,
      challengeId: mfaChallengeId,
      code: mfaCode,
    });
    setMfaLoading(false);
    if (verifyErr) { setError(safeMFAError(verifyErr.message)); return; }
    const redirectTo = searchParams.get("redirect") || "/dashboard";
    router.push(redirectTo);
    router.refresh();
  }, [mfaCode, mfaFactorId, mfaChallengeId, supabase, router, searchParams]);

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-4 relative overflow-hidden"
      style={{ background: "#060b18" }}>

      {/* Background grid */}
      <div className="absolute inset-0 pointer-events-none opacity-[0.03]"
        style={{ backgroundImage: "radial-gradient(#00d4a8 1px, transparent 1px)", backgroundSize: "32px 32px" }} />

      {/* Glow orbs */}
      <div className="absolute top-1/4 left-1/4 w-96 h-96 rounded-full pointer-events-none"
        style={{ background: "radial-gradient(circle, rgba(0,212,168,0.06) 0%, transparent 70%)" }} />
      <div className="absolute bottom-1/4 right-1/4 w-64 h-64 rounded-full pointer-events-none"
        style={{ background: "radial-gradient(circle, rgba(129,140,248,0.05) 0%, transparent 70%)" }} />

      <div className="relative w-full max-w-sm space-y-6">

        {/* ── MFA verification screen ── */}
        {showMfa && (
          <>
            <div className="flex flex-col items-center gap-3">
              <div className="w-16 h-16 rounded-2xl flex items-center justify-center"
                style={{ background: "rgba(0,212,168,0.15)", border: "1px solid rgba(0,212,168,0.4)" }}>
                <span className="text-3xl">🔐</span>
              </div>
              <div className="text-center">
                <h1 className="text-2xl font-bold" style={{ color: "#00d4a8", fontFamily: "var(--font-space)" }}>Two-Factor Auth</h1>
                <p className="text-gray-500 text-xs tracking-wide mt-0.5">Enter the code from your authenticator app</p>
              </div>
            </div>
            <div className="rounded-2xl p-7 shadow-2xl space-y-5"
              style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(0,212,168,0.15)", backdropFilter: "blur(12px)" }}>
              <form onSubmit={handleMfaVerify} className="space-y-4">
                <div>
                  <label className="text-[10px] font-semibold text-gray-300 uppercase tracking-widest block mb-2">Authentication Code</label>
                  <input
                    type="text"
                    inputMode="numeric"
                    maxLength={6}
                    placeholder="000000"
                    value={mfaCode}
                    autoFocus
                    onChange={e => setMfaCode(e.target.value.replace(/\D/g, ""))}
                    className="w-full text-center text-3xl font-mono tracking-[0.5em] rounded-xl px-4 py-4 text-white placeholder-gray-700 focus:outline-none"
                    style={{ background: "rgba(255,255,255,0.07)", border: "1px solid rgba(0,212,168,0.3)" }}
                  />
                  <p className="text-[10px] text-gray-500 text-center mt-2">From Google Authenticator, Authy, or 1Password</p>
                </div>
                {error && (
                  <div className="rounded-xl px-4 py-2.5" style={{ background: "rgba(220,38,38,0.1)", border: "1px solid rgba(220,38,38,0.3)" }}>
                    <p className="text-red-400 text-xs">{error}</p>
                  </div>
                )}
                <button type="submit" disabled={mfaLoading || mfaCode.length !== 6}
                  className="w-full font-bold rounded-xl py-3 text-sm tracking-wide transition-all disabled:opacity-40"
                  style={{ background: "linear-gradient(135deg, #00d4a8, #00b896)", color: "#0a1628" }}>
                  {mfaLoading ? "Verifying…" : "Verify Code"}
                </button>
                <button type="button" onClick={() => { setShowMfa(false); setMfaCode(""); setError(""); }}
                  className="w-full text-xs text-gray-500 hover:text-gray-300 transition-colors">
                  ← Back to sign in
                </button>
              </form>
            </div>
          </>
        )}

        {/* ── Normal login form ── */}
        {!showMfa && (
        <>

        {/* CashCall brand — links back to landing page */}
        <Link href="/" className="flex flex-col items-center gap-3 group">
          <div className="w-16 h-16 rounded-2xl flex items-center justify-center transition-opacity group-hover:opacity-80"
            style={{ background: "rgba(0,212,168,0.15)", border: "1px solid rgba(0,212,168,0.4)" }}>
            <span className="text-3xl">⚡</span>
          </div>
          <div className="text-center">
            <h1 className="text-3xl font-bold transition-opacity group-hover:opacity-80" style={{ color: "#00d4a8", fontFamily: "var(--font-space)" }}>CashCall</h1>
            <p className="text-gray-500 text-xs tracking-[0.2em] uppercase mt-0.5">Restaurant Financial OS</p>
          </div>
        </Link>

        {/* Card */}
        <div className="rounded-2xl p-7 shadow-2xl space-y-5"
          style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(0,212,168,0.15)", backdropFilter: "blur(12px)" }}>
          <div className="text-center">
            <h2 className="text-white font-semibold text-lg">Welcome back</h2>
            <p className="text-gray-400 text-sm mt-0.5">Sign in to your encrypted vault</p>
          </div>

          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="text-[10px] font-semibold text-gray-300 uppercase tracking-widest">Email</label>
              <input type="email" required autoComplete="email"
                value={email} onChange={e => setEmail(e.target.value)}
                placeholder="you@restaurant.com"
                className="mt-1.5 w-full rounded-xl px-4 py-3 text-white placeholder-gray-600 text-sm focus:outline-none transition-colors"
                style={{ background: "rgba(255,255,255,0.07)", border: "1px solid rgba(232,184,75,0.2)" }}
                onFocus={e => e.target.style.borderColor = "#e8b84b"}
                onBlur={e => e.target.style.borderColor = "rgba(232,184,75,0.2)"}
              />
            </div>
            <div>
              <label className="text-[10px] font-semibold text-gray-300 uppercase tracking-widest">Password</label>
              <div className="relative mt-1.5">
                <input type={showPassword ? "text" : "password"} required autoComplete="current-password"
                  value={password} onChange={e => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full rounded-xl px-4 py-3 pr-11 text-white placeholder-gray-600 text-sm focus:outline-none transition-colors"
                  style={{ background: "rgba(255,255,255,0.07)", border: "1px solid rgba(232,184,75,0.2)" }}
                  onFocus={e => e.target.style.borderColor = "#e8b84b"}
                  onBlur={e => e.target.style.borderColor = "rgba(232,184,75,0.2)"}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(p => !p)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300 transition-colors"
                  tabIndex={-1}
                  title={showPassword ? "Hide password" : "Show password"}>
                  {showPassword ? (
                    <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                    </svg>
                  ) : (
                    <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                      <path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                    </svg>
                  )}
                </button>
              </div>
            </div>

            {emailNotConfirmed && (
              <div className="rounded-xl px-4 py-3 space-y-2" style={{ background: "rgba(249,115,22,0.1)", border: "1px solid rgba(249,115,22,0.3)" }}>
                <p className="text-orange-400 text-xs font-semibold">📧 Check your email</p>
                <p className="text-orange-300 text-xs">Your account isn&apos;t confirmed yet. Click the link in the email we sent you to activate it.</p>
                {resendSent ? (
                  <p className="text-teal-400 text-xs">✓ New confirmation email sent — check your inbox</p>
                ) : (
                  <button type="button" disabled={resendLoading}
                    onClick={async () => {
                      setResendLoading(true);
                      const supabaseClient = createClient();
                      await supabaseClient.auth.resend({
                        type: "signup",
                        email: email.trim().toLowerCase(),
                        options: { emailRedirectTo: "https://cashcall.io/auth/callback" },
                      });
                      setResendLoading(false);
                      setResendSent(true);
                    }}
                    className="text-xs text-orange-400 underline underline-offset-2 hover:text-orange-300 disabled:opacity-50">
                    {resendLoading ? "Sending…" : "Resend confirmation email"}
                  </button>
                )}
              </div>
            )}

            {error && (
              <div className="rounded-xl px-4 py-2.5" style={{ background: "rgba(220,38,38,0.1)", border: "1px solid rgba(220,38,38,0.3)" }}>
                <p className="text-red-400 text-xs">{error}</p>
              </div>
            )}

            <button type="submit" disabled={loading}
              className="w-full font-bold rounded-xl py-3 text-sm tracking-wide transition-all mt-1 disabled:opacity-50"
              style={{ background: "linear-gradient(135deg, #c8921a, #e8b84b)", color: "#1a0d02" }}>
              {loading ? "Signing in…" : "Sign In"}
            </button>

            <div className="text-center pt-1">
              {resetSent ? (
                <p className="text-teal-400 text-xs">✓ Reset link sent — check your inbox</p>
              ) : (
                <button
                  type="button"
                  disabled={resetLoading}
                  onClick={async () => {
                    const emailTrimmed = email.trim().toLowerCase();
                    if (!emailTrimmed || !emailTrimmed.includes("@")) {
                      setError("Enter your email above first, then click Forgot password."); return;
                    }
                    setResetLoading(true);
                    await sendPasswordReset(emailTrimmed);
                    setResetLoading(false);
                    setResetSent(true);
                  }}
                  className="text-xs text-gray-500 hover:text-gray-300 transition-colors underline underline-offset-2 disabled:opacity-50"
                >
                  {resetLoading ? "Sending…" : "Forgot password?"}
                </button>
              )}
            </div>
          </form>
        </div>

        <div className="text-center text-xs text-gray-500 space-y-1">
          <p>New to CashCall? <Link href="/trial" className="text-teal-400 hover:text-teal-300 transition-colors">Request access →</Link></p>
          <p>No account? <Link href="/sandbox" className="text-gray-400 hover:text-white transition-colors">Try the sandbox first</Link></p>
        </div>

        </>
        )}

      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-[#060b18]" />}>
      <LoginPageContent />
    </Suspense>
  );
}
