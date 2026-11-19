"use client";

import { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { useAuthGuard } from "@/lib/useAuthGuard";

type MFAStatus = "loading" | "not_enrolled" | "enrolled" | "enrolling" | "verifying";

export default function SecuritySettingsPage() {
  const supabase = useMemo(() => createClient(), []);
  const { ready } = useAuthGuard();

  const [status, setStatus]       = useState<MFAStatus>("loading");
  const [qrCode, setQrCode]       = useState("");
  const [secret, setSecret]       = useState("");
  const [factorId, setFactorId]   = useState("");
  const [code, setCode]           = useState("");
  const [error, setError]         = useState("");
  const [success, setSuccess]     = useState("");
  const [loading, setLoading]     = useState(false);
  const [userEmail, setUserEmail] = useState("");

  useEffect(() => {
    if (!ready) return;
    loadMFAStatus();
  }, [ready]);

  async function loadMFAStatus() {
    setStatus("loading");
    setError("");
    const { data: { user } } = await supabase.auth.getUser();
    setUserEmail(user?.email ?? "");

    const { data, error } = await supabase.auth.mfa.listFactors();
    if (error) { setError(error.message); setStatus("not_enrolled"); return; }

    const totpFactors = data?.totp ?? [];
    const verified = totpFactors.find(f => f.status === "verified");
    setStatus(verified ? "enrolled" : "not_enrolled");
    if (verified) setFactorId(verified.id);
  }

  async function startEnrollment() {
    setLoading(true); setError(""); setCode("");
    const { data, error } = await supabase.auth.mfa.enroll({ factorType: "totp", issuer: "CashCall", friendlyName: "Authenticator" });
    setLoading(false);
    if (error) { setError(error.message); return; }
    setFactorId(data.id);
    setQrCode(data.totp.qr_code);
    setSecret(data.totp.secret);
    setStatus("enrolling");
  }

  async function verifyEnrollment() {
    if (code.length !== 6) { setError("Enter the 6-digit code from your authenticator app."); return; }
    setLoading(true); setError("");
    const { data: challengeData, error: challengeErr } = await supabase.auth.mfa.challenge({ factorId });
    if (challengeErr) { setError(challengeErr.message); setLoading(false); return; }

    const { error: verifyErr } = await supabase.auth.mfa.verify({
      factorId, challengeId: challengeData.id, code,
    });
    setLoading(false);
    if (verifyErr) { setError("Invalid code — try again."); return; }
    setSuccess("✓ MFA enabled! Your account is now protected with two-factor authentication.");
    setStatus("enrolled");
    setQrCode(""); setSecret("");
  }

  async function unenroll() {
    if (!factorId) return;
    const confirmed = window.confirm("Are you sure you want to disable MFA? Your account will be less secure.");
    if (!confirmed) return;
    setLoading(true); setError("");
    const { error } = await supabase.auth.mfa.unenroll({ factorId });
    setLoading(false);
    if (error) { setError(error.message); return; }
    setFactorId(""); setStatus("not_enrolled");
    setSuccess("MFA has been disabled.");
  }

  if (!ready) return (
    <div className="min-h-screen bg-[#060b18] flex items-center justify-center">
      <div className="w-8 h-8 border-2 border-teal-400 border-t-transparent rounded-full animate-spin" />
    </div>
  );

  return (
    <div className="min-h-screen bg-[#060b18]">
      <nav className="bg-[#0a1628] border-b border-white/10 px-4 h-14 flex items-center gap-3 sticky top-0 z-10">
        <Link href="/dashboard" className="text-sm text-gray-400 hover:text-white">← Dashboard</Link>
        <span className="text-gray-600">/</span>
        <span className="text-sm font-semibold text-white">Security Settings</span>
      </nav>

      <main className="max-w-2xl mx-auto px-4 py-8 space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold text-white mb-1">Account Security</h1>
          <p className="text-sm text-gray-400">Protect your restaurant financial data with two-factor authentication.</p>
        </div>

        {/* Account info */}
        <div className="rounded-2xl p-5" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)" }}>
          <div className="text-xs text-gray-500 uppercase tracking-wider mb-1">Signed in as</div>
          <div className="text-sm font-semibold text-white">{userEmail}</div>
        </div>

        {/* MFA card */}
        <div className="rounded-2xl overflow-hidden" style={{ border: "1px solid rgba(255,255,255,0.08)" }}>
          <div className="px-5 py-4 border-b flex items-center justify-between"
            style={{ background: "rgba(255,255,255,0.02)", borderColor: "rgba(255,255,255,0.08)" }}>
            <div className="flex items-center gap-3">
              <span className="text-xl">🔐</span>
              <div>
                <div className="text-sm font-bold text-white">Two-Factor Authentication (TOTP)</div>
                <div className="text-xs text-gray-500">Authenticator app — Google Authenticator, Authy, 1Password</div>
              </div>
            </div>
            <div className="flex-shrink-0">
              {status === "loading" && <div className="w-5 h-5 border-2 border-teal-400 border-t-transparent rounded-full animate-spin" />}
              {status === "enrolled" && (
                <span className="text-xs px-2.5 py-1 rounded-full font-bold" style={{ background: "rgba(0,212,168,0.15)", color: "#00d4a8", border: "1px solid rgba(0,212,168,0.3)" }}>
                  ✅ ENABLED
                </span>
              )}
              {(status === "not_enrolled") && (
                <span className="text-xs px-2.5 py-1 rounded-full font-bold" style={{ background: "rgba(255,255,255,0.06)", color: "#6b7280", border: "1px solid rgba(255,255,255,0.1)" }}>
                  NOT SET UP
                </span>
              )}
            </div>
          </div>

          <div className="p-5 space-y-5">
            {/* Not enrolled */}
            {status === "not_enrolled" && (
              <div className="space-y-4">
                <div className="rounded-xl p-4 space-y-2 text-sm" style={{ background: "rgba(245,158,11,0.06)", border: "1px solid rgba(245,158,11,0.2)" }}>
                  <div className="font-semibold text-amber-400">⚠ MFA is not enabled</div>
                  <div className="text-gray-400 text-xs">
                    Your account is protected only by password. Enable two-factor authentication to require a code from your phone on each login — even if your password is compromised, your financial data stays safe.
                  </div>
                </div>
                <button onClick={startEnrollment} disabled={loading}
                  className="w-full py-3 rounded-xl font-bold text-sm text-gray-900 disabled:opacity-50 transition-opacity hover:opacity-90"
                  style={{ background: "linear-gradient(135deg, #00d4a8, #00b896)" }}>
                  {loading ? "Setting up…" : "Enable Two-Factor Authentication"}
                </button>
              </div>
            )}

            {/* Enrolling — show QR code */}
            {status === "enrolling" && (
              <div className="space-y-5">
                <div className="text-sm text-gray-300">
                  <strong className="text-white">Step 1:</strong> Open your authenticator app (Google Authenticator, Authy, or 1Password) and scan this QR code.
                </div>

                {qrCode && (
                  <div className="flex flex-col items-center gap-4">
                    {/* QR code rendered as an img from the data URI Supabase returns */}
                    <div className="p-4 rounded-2xl bg-white">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={qrCode} alt="MFA QR Code" width={200} height={200} className="block" />
                    </div>
                    <div className="text-center">
                      <div className="text-xs text-gray-500 mb-1">Can't scan? Enter this code manually:</div>
                      <div className="font-mono text-sm text-teal-400 tracking-widest px-3 py-1.5 rounded-lg"
                        style={{ background: "rgba(0,212,168,0.08)", border: "1px solid rgba(0,212,168,0.2)" }}>
                        {secret}
                      </div>
                    </div>
                  </div>
                )}

                <div className="space-y-2">
                  <div className="text-sm text-gray-300">
                    <strong className="text-white">Step 2:</strong> Enter the 6-digit code your app shows.
                  </div>
                  <input
                    type="text"
                    inputMode="numeric"
                    maxLength={6}
                    placeholder="000000"
                    value={code}
                    onChange={e => setCode(e.target.value.replace(/\D/g, ""))}
                    className="w-full text-center text-2xl font-mono tracking-[0.4em] rounded-xl px-4 py-3 text-white placeholder-gray-600 focus:outline-none"
                    style={{ background: "rgba(255,255,255,0.07)", border: "1px solid rgba(0,212,168,0.3)", letterSpacing: "0.4em" }}
                  />
                  <button onClick={verifyEnrollment} disabled={loading || code.length !== 6}
                    className="w-full py-3 rounded-xl font-bold text-sm text-gray-900 disabled:opacity-40 transition-opacity hover:opacity-90"
                    style={{ background: "linear-gradient(135deg, #00d4a8, #00b896)" }}>
                    {loading ? "Verifying…" : "Verify & Enable MFA"}
                  </button>
                </div>
              </div>
            )}

            {/* Enrolled */}
            {status === "enrolled" && (
              <div className="space-y-4">
                <div className="rounded-xl p-4 space-y-1 text-sm" style={{ background: "rgba(0,212,168,0.06)", border: "1px solid rgba(0,212,168,0.2)" }}>
                  <div className="font-semibold text-teal-400">✅ Two-factor authentication is active</div>
                  <div className="text-gray-400 text-xs">
                    Every login requires both your password and a code from your authenticator app. Your financial data has enhanced protection.
                  </div>
                </div>
                <button onClick={unenroll} disabled={loading}
                  className="text-xs text-red-400 hover:text-red-300 underline underline-offset-2 disabled:opacity-50">
                  {loading ? "Disabling…" : "Disable MFA (not recommended)"}
                </button>
              </div>
            )}

            {error && (
              <div className="rounded-xl px-4 py-2.5" style={{ background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.25)" }}>
                <p className="text-xs text-red-400">{error}</p>
              </div>
            )}
            {success && (
              <div className="rounded-xl px-4 py-2.5" style={{ background: "rgba(0,212,168,0.08)", border: "1px solid rgba(0,212,168,0.25)" }}>
                <p className="text-xs text-teal-400">{success}</p>
              </div>
            )}
          </div>
        </div>

        {/* Password section */}
        <div className="rounded-2xl overflow-hidden" style={{ border: "1px solid rgba(255,255,255,0.08)" }}>
          <div className="px-5 py-4 border-b flex items-center gap-3"
            style={{ background: "rgba(255,255,255,0.02)", borderColor: "rgba(255,255,255,0.08)" }}>
            <span className="text-xl">🔑</span>
            <div>
              <div className="text-sm font-bold text-white">Password</div>
              <div className="text-xs text-gray-500">Reset your login password via email</div>
            </div>
          </div>
          <div className="p-5">
            <p className="text-xs text-gray-400 mb-3">
              A password reset link will be sent to <strong className="text-gray-300">{userEmail}</strong>
            </p>
            <button
              onClick={async () => {
                setLoading(true);
                await supabase.auth.resetPasswordForEmail(userEmail, { redirectTo: `${window.location.origin}/reset-password` });
                setLoading(false);
                setSuccess("✓ Password reset link sent — check your email.");
              }}
              disabled={loading || !userEmail}
              className="px-4 py-2 rounded-xl text-sm font-semibold text-white disabled:opacity-40 transition-colors"
              style={{ background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.12)" }}>
              {loading ? "Sending…" : "Send Password Reset Email"}
            </button>
          </div>
        </div>

        {/* Encryption note */}
        <div className="rounded-2xl p-5 text-xs text-gray-500" style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.05)" }}>
          <div className="font-semibold text-gray-400 mb-1">🔒 Data Protection</div>
          All financial data is encrypted at rest (AES-256) and in transit (TLS 1.3). Row-level security ensures your data is isolated and never accessible by other accounts. View our full <Link href="/security" className="text-teal-400 hover:underline">security page</Link>.
        </div>
      </main>
    </div>
  );
}
