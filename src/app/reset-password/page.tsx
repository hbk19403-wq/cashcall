"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

export default function ResetPasswordPage() {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const supabase = createClient();

  // Supabase puts the recovery token in the URL hash; the client library
  // picks it up automatically on mount via onAuthStateChange.
  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event) => { if (event === "PASSWORD_RECOVERY") { /* ready */ } }
    );
    return () => subscription.unsubscribe();
  }, [supabase]);

  const handleReset = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < 8) { setError("Password must be at least 8 characters."); return; }
    if (password !== confirm) { setError("Passwords don't match."); return; }
    setError(""); setLoading(true);
    const { error: err } = await supabase.auth.updateUser({ password });
    setLoading(false);
    if (err) { setError("Failed to update password. The link may have expired — request a new one."); return; }
    setSuccess(true);
    setTimeout(() => router.push("/login"), 2500);
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-4 relative overflow-hidden"
      style={{ background: "#060b18" }}>
      <div className="absolute inset-0 pointer-events-none opacity-[0.03]"
        style={{ backgroundImage: "radial-gradient(#00d4a8 1px, transparent 1px)", backgroundSize: "32px 32px" }} />

      <div className="relative w-full max-w-sm space-y-6">
        <Link href="/" className="flex flex-col items-center gap-3 group">
          <div className="w-16 h-16 rounded-2xl flex items-center justify-center"
            style={{ background: "rgba(0,212,168,0.15)", border: "1px solid rgba(0,212,168,0.4)" }}>
            <span className="text-3xl">⚡</span>
          </div>
          <h1 className="text-3xl font-bold" style={{ color: "#00d4a8", fontFamily: "var(--font-space)" }}>CashCall</h1>
        </Link>

        <div className="rounded-2xl p-7 shadow-2xl space-y-5"
          style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(0,212,168,0.15)", backdropFilter: "blur(12px)" }}>
          <div className="text-center">
            <h2 className="text-white font-semibold text-lg">Set new password</h2>
            <p className="text-gray-400 text-sm mt-0.5">Choose something strong</p>
          </div>

          {success ? (
            <div className="text-center py-4">
              <p className="text-teal-400 font-medium">✓ Password updated!</p>
              <p className="text-gray-500 text-sm mt-1">Redirecting to login…</p>
            </div>
          ) : (
            <form onSubmit={handleReset} className="space-y-4">
              <div>
                <label className="text-[10px] font-semibold text-gray-300 uppercase tracking-widest">New Password</label>
                <input type="password" required minLength={8}
                  value={password} onChange={e => setPassword(e.target.value)}
                  placeholder="Min 8 characters"
                  className="mt-1.5 w-full rounded-xl px-4 py-3 text-white placeholder-gray-600 text-sm focus:outline-none"
                  style={{ background: "rgba(255,255,255,0.07)", border: "1px solid rgba(232,184,75,0.2)" }}
                  onFocus={e => e.target.style.borderColor = "#e8b84b"}
                  onBlur={e => e.target.style.borderColor = "rgba(232,184,75,0.2)"}
                />
              </div>
              <div>
                <label className="text-[10px] font-semibold text-gray-300 uppercase tracking-widest">Confirm Password</label>
                <input type="password" required
                  value={confirm} onChange={e => setConfirm(e.target.value)}
                  placeholder="••••••••"
                  className="mt-1.5 w-full rounded-xl px-4 py-3 text-white placeholder-gray-600 text-sm focus:outline-none"
                  style={{ background: "rgba(255,255,255,0.07)", border: "1px solid rgba(232,184,75,0.2)" }}
                  onFocus={e => e.target.style.borderColor = "#e8b84b"}
                  onBlur={e => e.target.style.borderColor = "rgba(232,184,75,0.2)"}
                />
              </div>

              {error && (
                <div className="rounded-xl px-4 py-2.5" style={{ background: "rgba(220,38,38,0.1)", border: "1px solid rgba(220,38,38,0.3)" }}>
                  <p className="text-red-400 text-xs">{error}</p>
                </div>
              )}

              <button type="submit" disabled={loading}
                className="w-full font-bold rounded-xl py-3 text-sm tracking-wide transition-all disabled:opacity-50"
                style={{ background: "linear-gradient(135deg, #c8921a, #e8b84b)", color: "#1a0d02" }}>
                {loading ? "Updating…" : "Update Password"}
              </button>
            </form>
          )}
        </div>

        <p className="text-center text-xs text-gray-500">
          <Link href="/login" className="text-teal-400 hover:text-teal-300">← Back to login</Link>
        </p>
      </div>
    </div>
  );
}
