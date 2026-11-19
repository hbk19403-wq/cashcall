"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Nav from "@/app/components/Nav";
import { createClient } from "@/lib/supabase/client";
import { useAuthGuard } from "@/lib/useAuthGuard";

interface Prefs {
  digest_email: string;
  whatsapp_number: string;
  whatsapp_provider: "twilio" | "meta";
  digest_enabled: boolean;
  digest_time: string;
  report_schedule: "off" | "weekly" | "monthly";
  report_day: number;
  report_format: "email" | "whatsapp" | "both";
  report_email: string;
}

const DEFAULT_PREFS: Prefs = {
  digest_email: "",
  whatsapp_number: "",
  whatsapp_provider: "twilio",
  digest_enabled: false,
  digest_time: "06:00",
  report_schedule: "off",
  report_day: 1,
  report_format: "email",
  report_email: "",
};

export default function NotificationsPage() {
  const supabase = createClient();
  const auth = useAuthGuard();
  const [username, setUsername] = useState("");
  const [prefs, setPrefs] = useState<Prefs>(DEFAULT_PREFS);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [saved, setSaved] = useState(false);
  const [testResult, setTestResult] = useState<"success" | "error" | null>(null);
  const [testMsg, setTestMsg] = useState("");

  useEffect(() => {
    if (!auth.ready) return;
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: profile } = await supabase.from("user_profiles")
        .select("username").eq("user_id", user.id).single();
      setUsername(profile?.username ?? "");

      const { data } = await supabase.from("notification_prefs")
        .select("*").eq("user_id", user.id).single();
      if (data) setPrefs({
        digest_email: data.digest_email ?? "",
        whatsapp_number: data.whatsapp_number ?? "",
        whatsapp_provider: data.whatsapp_provider ?? "twilio",
        digest_enabled: data.digest_enabled ?? false,
        digest_time: data.digest_time ?? "06:00",
        report_schedule: data.report_schedule ?? "off",
        report_day: data.report_day ?? 1,
        report_format: data.report_format ?? "email",
        report_email: data.report_email ?? "",
      });
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auth.ready]);

  async function save() {
    setSaving(true); setSaved(false);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    await supabase.from("notification_prefs").upsert({
      user_id: user.id,
      digest_email: prefs.digest_email || null,
      whatsapp_number: prefs.whatsapp_number || null,
      whatsapp_provider: prefs.whatsapp_provider,
      digest_enabled: prefs.digest_enabled,
      digest_time: prefs.digest_time,
      report_schedule: prefs.report_schedule,
      report_day: prefs.report_day,
      report_format: prefs.report_format,
      report_email: prefs.report_email || null,
      updated_at: new Date().toISOString(),
    }, { onConflict: "user_id" });
    setSaving(false); setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  }

  async function sendTest() {
    const channel = prefs.digest_email || prefs.whatsapp_number;
    if (!channel) return;
    setTesting(true); setTestResult(null); setTestMsg("");
    try {
      const res = await fetch("/api/digest");
      const { digest } = await res.json();
      if (!digest) throw new Error("Could not generate digest — add some sales data first.");

      const provider = prefs.digest_email ? "email" : prefs.whatsapp_provider;
      const to = prefs.digest_email || prefs.whatsapp_number;

      const send = await fetch("/api/whatsapp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ to, message: digest, provider }),
      });
      const data = await send.json();
      if (data.error) throw new Error(data.error);
      setTestResult("success");
      setTestMsg(prefs.digest_email ? `Check ${prefs.digest_email}` : "Check your WhatsApp");
    } catch (e) {
      setTestResult("error");
      setTestMsg(e instanceof Error ? e.message : "Send failed");
    } finally {
      setTesting(false);
    }
  }

  const hasChannel = !!(prefs.digest_email || prefs.whatsapp_number);

  if (!auth.ready) return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: "#060b18" }}>
      <div className="w-7 h-7 border-2 border-emerald-400 border-t-transparent rounded-full animate-spin" />
    </div>
  );

  return (
    <div className="min-h-screen pb-12" style={{ background: "linear-gradient(160deg,#060b18 0%,#0a1628 60%,#0d1f3c 100%)" }}>
      <Nav username={username} role={auth.role ?? ""} />

      <div className="max-w-2xl mx-auto px-4 pt-6 space-y-5">
        <div className="flex items-center gap-3">
          <Link href="/dashboard" className="text-xs text-emerald-400 hover:underline">← Dashboard</Link>
        </div>

        <div>
          <h1 className="text-2xl font-extrabold text-white">Daily Digest</h1>
          <p className="text-sm text-gray-400 mt-1">Get yesterday&apos;s numbers delivered every morning at 6am.</p>
        </div>

        {/* Master toggle */}
        <div className="rounded-2xl border border-white/[0.08] p-5 flex items-center justify-between"
          style={{ background: "rgba(255,255,255,0.03)" }}>
          <div>
            <p className="text-sm font-bold text-white">Enable daily digest</p>
            <p className="text-xs text-gray-400 mt-0.5">Sales · Prime cost · Week-over-week</p>
          </div>
          <label className="relative inline-flex items-center cursor-pointer">
            <input type="checkbox" className="sr-only peer"
              checked={prefs.digest_enabled}
              onChange={e => setPrefs(p => ({ ...p, digest_enabled: e.target.checked }))} />
            <div className="w-11 h-6 rounded-full peer peer-checked:after:translate-x-full after:absolute after:top-0.5 after:left-0.5 after:w-5 after:h-5 after:rounded-full after:transition-all"
              style={{ background: prefs.digest_enabled ? "#00b896" : "rgba(255,255,255,0.1)" }}/>
          </label>
        </div>

        {prefs.digest_enabled && (
          <>
            {/* Email (primary) */}
            <div className="rounded-2xl border border-white/[0.08] p-6 space-y-4"
              style={{ background: "rgba(255,255,255,0.03)" }}>
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl flex items-center justify-center text-xl"
                  style={{ background: "rgba(0,184,150,0.15)" }}>📧</div>
                <div>
                  <h2 className="text-sm font-bold text-white">Email Digest</h2>
                  <p className="text-xs text-gray-400">Styled HTML email, works immediately</p>
                </div>
                {prefs.digest_email && (
                  <span className="ml-auto text-xs text-emerald-400 font-semibold bg-emerald-500/10 px-2 py-1 rounded-lg">Active</span>
                )}
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-400 uppercase tracking-wide block mb-1.5">
                  Email address
                </label>
                <input
                  type="email"
                  placeholder="you@example.com"
                  value={prefs.digest_email}
                  onChange={e => setPrefs(p => ({ ...p, digest_email: e.target.value }))}
                  className="w-full bg-white/[0.05] border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white placeholder-gray-600 focus:outline-none focus:ring-2 focus:ring-emerald-500/50"
                />
              </div>
            </div>

            {/* WhatsApp (optional) */}
            <div className="rounded-2xl border border-white/[0.06] p-6 space-y-4"
              style={{ background: "rgba(255,255,255,0.02)" }}>
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl flex items-center justify-center text-xl"
                  style={{ background: "rgba(37,211,102,0.10)" }}>💬</div>
                <div>
                  <h2 className="text-sm font-bold text-gray-300">WhatsApp <span className="text-gray-500 font-normal text-xs">(optional)</span></h2>
                  <p className="text-xs text-gray-500">Requires Twilio or Meta credentials in Vercel</p>
                </div>
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-1.5">
                  Phone number
                </label>
                <input
                  type="tel"
                  placeholder="+1 (555) 000-0000"
                  value={prefs.whatsapp_number}
                  onChange={e => setPrefs(p => ({ ...p, whatsapp_number: e.target.value }))}
                  className="w-full bg-white/[0.03] border border-white/[0.07] rounded-xl px-4 py-2.5 text-sm text-white placeholder-gray-700 focus:outline-none focus:ring-2 focus:ring-emerald-500/30"
                />
                <p className="text-xs text-gray-600 mt-1">Include country code, e.g. +16045551234</p>
              </div>
              {prefs.whatsapp_number && (
                <div className="grid grid-cols-2 gap-2">
                  {(["twilio", "meta"] as const).map(p => (
                    <button key={p} onClick={() => setPrefs(prev => ({ ...prev, whatsapp_provider: p }))}
                      className={`rounded-xl border px-4 py-2 text-xs font-semibold transition-all ${
                        prefs.whatsapp_provider === p
                          ? "border-emerald-500/40 text-emerald-400 bg-emerald-500/10"
                          : "border-white/[0.07] text-gray-500 hover:border-white/15"
                      }`}>
                      {p === "twilio" ? "Twilio" : "Meta Business"}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Send time */}
            <div className="rounded-2xl border border-white/[0.08] p-5 flex items-center justify-between"
              style={{ background: "rgba(255,255,255,0.03)" }}>
              <div>
                <p className="text-sm font-bold text-white">Delivery time</p>
                <p className="text-xs text-gray-400 mt-0.5">UTC — cron runs every day</p>
              </div>
              <input
                type="time"
                value={prefs.digest_time}
                onChange={e => setPrefs(p => ({ ...p, digest_time: e.target.value }))}
                className="bg-white/[0.05] border border-white/10 rounded-xl px-4 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-emerald-500/50"
              />
            </div>

            {/* Test send */}
            {hasChannel && (
              <div className="flex items-center gap-3">
                <button onClick={sendTest} disabled={testing}
                  className="px-5 py-2.5 rounded-xl text-sm font-semibold text-white border border-emerald-500/30 hover:bg-emerald-500/10 transition-all disabled:opacity-40">
                  {testing ? "Sending…" : "Send test digest now"}
                </button>
                {testResult && (
                  <p className={`text-xs font-semibold ${testResult === "success" ? "text-emerald-400" : "text-red-400"}`}>
                    {testResult === "success" ? "✓ Sent!" : "✗"} {testMsg}
                  </p>
                )}
              </div>
            )}
          </>
        )}

        {/* ── Scheduled P&L Reports ───────────────────────────────────────────── */}
        <div className="mt-2">
          <h1 className="text-2xl font-extrabold text-white">Scheduled P&amp;L Reports</h1>
          <p className="text-sm text-gray-400 mt-1">Get a full profit &amp; loss summary emailed weekly or monthly — revenue, food cost, labor, and prime cost ratio.</p>
        </div>

        <div className="rounded-2xl border border-white/[0.08] p-6 space-y-5" style={{ background: "rgba(255,255,255,0.03)" }}>
          {/* Schedule toggle */}
          <div>
            <label className="text-xs font-semibold text-gray-400 uppercase tracking-wide block mb-2">Report Frequency</label>
            <div className="grid grid-cols-3 gap-2">
              {(["off", "weekly", "monthly"] as const).map(opt => (
                <button key={opt} onClick={() => setPrefs(p => ({ ...p, report_schedule: opt }))}
                  className={`rounded-xl border px-4 py-2.5 text-sm font-semibold transition-all ${
                    prefs.report_schedule === opt
                      ? "border-indigo-500/50 text-indigo-300 bg-indigo-500/15"
                      : "border-white/[0.08] text-gray-500 hover:border-white/20 hover:text-gray-300"
                  }`}>
                  {opt === "off" ? "Off" : opt === "weekly" ? "📅 Weekly" : "📆 Monthly"}
                </button>
              ))}
            </div>
          </div>

          {prefs.report_schedule !== "off" && (
            <>
              {/* Day selector */}
              <div>
                <label className="text-xs font-semibold text-gray-400 uppercase tracking-wide block mb-2">
                  {prefs.report_schedule === "weekly" ? "Send on day" : "Send on day of month"}
                </label>
                {prefs.report_schedule === "weekly" ? (
                  <div className="grid grid-cols-7 gap-1">
                    {["Mon","Tue","Wed","Thu","Fri","Sat","Sun"].map((day, i) => (
                      <button key={day} onClick={() => setPrefs(p => ({ ...p, report_day: i + 1 }))}
                        className={`rounded-lg py-2 text-xs font-semibold transition-all ${
                          prefs.report_day === i + 1
                            ? "bg-indigo-600 text-white"
                            : "bg-white/[0.05] text-gray-400 hover:bg-white/10"
                        }`}>
                        {day}
                      </button>
                    ))}
                  </div>
                ) : (
                  <select value={prefs.report_day} onChange={e => setPrefs(p => ({ ...p, report_day: Number(e.target.value) }))}
                    className="w-full bg-white/[0.05] border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/50">
                    {Array.from({ length: 28 }, (_, i) => i + 1).map(d => (
                      <option key={d} value={d} style={{ background: "#0a1628" }}>Day {d} of each month</option>
                    ))}
                  </select>
                )}
              </div>

              {/* Delivery format */}
              <div>
                <label className="text-xs font-semibold text-gray-400 uppercase tracking-wide block mb-2">Delivery Format</label>
                <div className="grid grid-cols-3 gap-2">
                  {(["email", "whatsapp", "both"] as const).map(fmt => (
                    <button key={fmt} onClick={() => setPrefs(p => ({ ...p, report_format: fmt }))}
                      className={`rounded-xl border px-3 py-2 text-xs font-semibold transition-all ${
                        prefs.report_format === fmt
                          ? "border-indigo-500/50 text-indigo-300 bg-indigo-500/15"
                          : "border-white/[0.08] text-gray-500 hover:border-white/20"
                      }`}>
                      {fmt === "email" ? "📧 Email" : fmt === "whatsapp" ? "💬 WhatsApp" : "📧+💬 Both"}
                    </button>
                  ))}
                </div>
              </div>

              {/* Report email (if different from digest email) */}
              {(prefs.report_format === "email" || prefs.report_format === "both") && (
                <div>
                  <label className="text-xs font-semibold text-gray-400 uppercase tracking-wide block mb-1.5">
                    Report Email <span className="text-gray-600 font-normal">(leave blank to use digest email above)</span>
                  </label>
                  <input type="email" placeholder={prefs.digest_email || "you@example.com"}
                    value={prefs.report_email}
                    onChange={e => setPrefs(p => ({ ...p, report_email: e.target.value }))}
                    className="w-full bg-white/[0.05] border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white placeholder-gray-600 focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
                  />
                </div>
              )}

              {/* What's in the report */}
              <div className="bg-indigo-500/[0.06] border border-indigo-500/20 rounded-xl p-4 space-y-1.5 text-xs text-indigo-200">
                <p className="font-semibold mb-2">Your P&amp;L report will include:</p>
                <p>📊 Total revenue, food cost, labor cost, infrastructure</p>
                <p>🎯 Prime cost ratio with green/yellow/red health indicator</p>
                <p>🛵 Delivery platform breakdown (DoorDash, Uber Eats, Grubhub)</p>
                <p>📈 Week-over-week or month-over-month variance</p>
                <p>💡 AI-generated one-line operational insight</p>
              </div>
            </>
          )}
        </div>

        {/* What's included */}
        <div className="rounded-2xl border border-white/[0.07] p-5" style={{ background: "rgba(0,184,150,0.04)" }}>
          <h3 className="text-xs font-bold text-emerald-400 uppercase tracking-widest mb-3">What&apos;s in your digest</h3>
          <div className="space-y-2 text-sm text-gray-300">
            {[
              "📊 Yesterday's total sales vs same day last week",
              "📍 Per-location breakdown with % change",
              "💰 30-day rolling prime cost %",
              "🤖 One-line AI insight on your numbers",
            ].map(item => <p key={item}>{item}</p>)}
          </div>
        </div>

        {/* Save */}
        <button onClick={save} disabled={saving}
          className="w-full py-3 rounded-2xl font-bold text-sm transition-all disabled:opacity-60"
          style={{ background: "linear-gradient(135deg,#00b896,#007a5e)", color: "#fff" }}>
          {saving ? "Saving…" : saved ? "✓ Saved" : "Save Settings"}
        </button>
      </div>
    </div>
  );
}
