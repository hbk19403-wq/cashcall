"use client";
import { useState, useEffect } from "react";

type Invite = {
  id: string;
  key: string;
  label: string | null;
  email: string | null;
  used_by: string | null;
  used_at: string | null;
  expires_at: string;
  created_at: string;
};

function statusBadge(inv: Invite) {
  if (inv.used_at) return { text: "Used", bg: "rgba(239,68,68,0.12)", color: "#f87171" };
  if (new Date(inv.expires_at) < new Date()) return { text: "Expired", bg: "rgba(107,114,128,0.15)", color: "#6b7280" };
  return { text: "Active", bg: "rgba(0,212,168,0.12)", color: "#00d4a8" };
}

export default function AdminInvitesPage() {
  const [invites, setInvites] = useState<Invite[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [newLabel, setNewLabel] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [generating, setGenerating] = useState(false);
  const [newUrl, setNewUrl] = useState("");
  const [copied, setCopied] = useState("");

  async function load() {
    setLoading(true);
    const r = await fetch("/api/invites/generate");
    if (r.status === 403) { setError("Access denied. Admin only."); setLoading(false); return; }
    const d = await r.json();
    if (d.error) { setError(d.error); } else { setInvites(d.invites ?? []); }
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  async function generate() {
    setGenerating(true); setNewUrl("");
    const r = await fetch("/api/invites/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ label: newLabel.trim() || null, email: newEmail.trim() || null }),
    });
    const d = await r.json();
    if (d.url) { setNewUrl(d.url); setNewLabel(""); setNewEmail(""); load(); }
    else { setError(d.error ?? "Failed to generate invite"); }
    setGenerating(false);
  }

  async function copy(text: string, id: string) {
    await navigator.clipboard.writeText(text);
    setCopied(id);
    setTimeout(() => setCopied(""), 2000);
  }

  const inputStyle = { background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)" };

  if (error === "Access denied. Admin only.") return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: "#060b18" }}>
      <div className="text-red-400 text-sm">Access denied. Admin only.</div>
    </div>
  );

  return (
    <div className="min-h-screen px-4 py-10" style={{ background: "#060b18", maxWidth: 760, margin: "0 auto" }}>
      <div className="mb-8">
        <div className="text-xs text-gray-600 uppercase tracking-wider mb-1">Admin</div>
        <h1 className="text-2xl font-bold text-white">Invite Keys</h1>
        <p className="text-sm text-gray-500 mt-1">Generate a unique trial invite link for each prospective client. Each key is single-use and expires in 30 days.</p>
      </div>

      {/* Generate form */}
      <div className="rounded-2xl p-5 border mb-8" style={{ background: "rgba(0,212,168,0.04)", borderColor: "rgba(0,212,168,0.2)" }}>
        <div className="text-sm font-semibold text-white mb-4">Generate New Invite</div>
        <div className="flex flex-col sm:flex-row gap-3 mb-3">
          <div className="flex-1">
            <label className="block text-xs text-gray-500 mb-1">Label (e.g. "Tampa Bay Kitchen")</label>
            <input value={newLabel} onChange={e => setNewLabel(e.target.value)}
              placeholder="Client or restaurant name"
              className="w-full px-3 py-2 rounded-xl text-sm text-white placeholder-gray-600 focus:outline-none"
              style={inputStyle} />
          </div>
          <div className="flex-1">
            <label className="block text-xs text-gray-500 mb-1">Pre-fill email (optional)</label>
            <input value={newEmail} onChange={e => setNewEmail(e.target.value)}
              type="email" placeholder="client@restaurant.com"
              className="w-full px-3 py-2 rounded-xl text-sm text-white placeholder-gray-600 focus:outline-none"
              style={inputStyle} />
          </div>
        </div>
        <button onClick={generate} disabled={generating}
          className="px-5 py-2.5 rounded-xl text-sm font-bold transition-all disabled:opacity-50"
          style={{ background: "#00d4a8", color: "#060b18" }}>
          {generating ? "Generating…" : "⚡ Generate Invite Link"}
        </button>

        {newUrl && (
          <div className="mt-4 p-4 rounded-xl" style={{ background: "rgba(0,0,0,0.3)", border: "1px solid rgba(0,212,168,0.25)" }}>
            <div className="text-xs text-teal-400 mb-2 font-semibold">✓ Invite created — send this link to your client:</div>
            <div className="flex items-center gap-2">
              <code className="text-xs text-gray-300 break-all flex-1">{newUrl}</code>
              <button onClick={() => copy(newUrl, "new")}
                className="shrink-0 px-3 py-1.5 rounded-lg text-xs font-medium transition-all"
                style={{ background: copied === "new" ? "rgba(0,212,168,0.2)" : "rgba(255,255,255,0.1)", color: copied === "new" ? "#00d4a8" : "white" }}>
                {copied === "new" ? "Copied!" : "Copy"}
              </button>
            </div>
            <div className="mt-2 text-xs text-gray-500">This link expires in 30 days and can only be used once. The client will see a branded signup page and their data will be fully isolated from all other accounts.</div>
          </div>
        )}
      </div>

      {/* Invites table */}
      {loading ? (
        <div className="text-gray-500 text-sm animate-pulse py-8 text-center">Loading invites…</div>
      ) : invites.length === 0 ? (
        <div className="text-gray-600 text-sm py-8 text-center">No invites yet. Generate one above.</div>
      ) : (
        <div className="space-y-2">
          <div className="text-xs text-gray-600 uppercase tracking-wider mb-3">{invites.length} invite{invites.length !== 1 ? "s" : ""}</div>
          {invites.map(inv => {
            const badge = statusBadge(inv);
            const url = `${typeof window !== "undefined" ? window.location.origin : "https://cashcall.io"}/trial?key=${inv.key}`;
            return (
              <div key={inv.id} className="rounded-xl p-4 border flex flex-col sm:flex-row sm:items-center gap-3"
                style={{ background: "rgba(255,255,255,0.02)", borderColor: "rgba(255,255,255,0.07)" }}>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className="text-sm font-medium text-white truncate">{inv.label || <span className="text-gray-500 italic">No label</span>}</span>
                    <span className="px-2 py-0.5 rounded-full text-xs font-medium" style={{ background: badge.bg, color: badge.color }}>{badge.text}</span>
                  </div>
                  <div className="text-xs text-gray-500 truncate">
                    {inv.email && <span className="mr-3">📧 {inv.email}</span>}
                    {inv.used_at ? <span className="text-red-400">Used {new Date(inv.used_at).toLocaleDateString()}</span> : <span>Expires {new Date(inv.expires_at).toLocaleDateString()}</span>}
                  </div>
                  <div className="text-xs text-gray-700 mt-0.5 truncate font-mono">…/trial?key={inv.key.slice(0, 18)}…</div>
                </div>
                {!inv.used_at && new Date(inv.expires_at) >= new Date() && (
                  <button onClick={() => copy(url, inv.id)}
                    className="shrink-0 px-3 py-1.5 rounded-lg text-xs font-medium transition-all"
                    style={{ background: copied === inv.id ? "rgba(0,212,168,0.2)" : "rgba(255,255,255,0.08)", color: copied === inv.id ? "#00d4a8" : "white" }}>
                    {copied === inv.id ? "Copied!" : "Copy Link"}
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
