"use client";

import { useState, useEffect, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";

type Role = "manager" | "staff";

interface Invitation {
  id: string;
  email: string;
  role: Role;
  location_id: string | null;
  status: "pending" | "accepted" | "revoked";
  expires_at: string;
  created_at: string;
}

const ROLE_INFO: Record<Role, { label: string; desc: string; color: string; bg: string }> = {
  manager: {
    label: "Manager",
    desc: "Can view all data, enter sales, food & labor costs",
    color: "#60a5fa",
    bg: "rgba(96,165,250,0.12)",
  },
  staff: {
    label: "Staff",
    desc: "Can enter daily sales only",
    color: "#a78bfa",
    bg: "rgba(167,139,250,0.12)",
  },
};

export default function TeamPage() {
  const router = useRouter();
  const supabase = createClient();

  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [loading, setLoading] = useState(true);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<Role>("manager");
  const [name, setName] = useState("");
  const [sending, setSending] = useState(false);
  const [successUrl, setSuccessUrl] = useState("");
  const [error, setError] = useState("");

  const loadInvitations = useCallback(async () => {
    const res = await fetch("/api/team/invite");
    if (res.ok) {
      const data = await res.json();
      setInvitations(data.invitations ?? []);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) router.push("/login");
    });
    loadInvitations();
  }, [loadInvitations, router, supabase]);

  const sendInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.includes("@")) { setError("Enter a valid email address."); return; }
    setSending(true); setError(""); setSuccessUrl("");
    const res = await fetch("/api/team/invite", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, role, name }),
    });
    const data = await res.json();
    setSending(false);
    if (!res.ok) { setError(data.error || "Failed to send invite"); return; }
    setSuccessUrl(data.acceptUrl);
    setEmail(""); setName("");
    loadInvitations();
  };

  const revokeInvite = async (id: string) => {
    try {
      await fetch("/api/team/invite", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
    } catch {
      setError("Failed to revoke invitation. Please try again.");
      return;
    }
    loadInvitations();
  };

  const pending = invitations.filter(i => i.status === "pending");
  const accepted = invitations.filter(i => i.status === "accepted");

  return (
    <div className="min-h-screen px-4 py-8" style={{ background: "#060b18" }}>
      <div className="max-w-2xl mx-auto space-y-6">

        {/* Header */}
        <div className="flex items-center gap-3">
          <button onClick={() => router.back()} className="text-gray-500 hover:text-white transition-colors text-sm">← Back</button>
          <div>
            <h1 className="text-2xl font-bold text-white">Team Members</h1>
            <p className="text-gray-500 text-sm mt-0.5">Invite managers and staff to your restaurant</p>
          </div>
        </div>

        {/* Invite Form */}
        <div className="rounded-2xl p-6" style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(0,212,168,0.15)" }}>
          <h2 className="text-white font-semibold mb-4">Send Invitation</h2>
          <form onSubmit={sendInvite} className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest block mb-1.5">Name (optional)</label>
                <input
                  type="text" value={name} onChange={e => setName(e.target.value)}
                  placeholder="Jane Smith"
                  className="w-full rounded-xl px-3 py-2.5 text-white text-sm placeholder-gray-600 focus:outline-none"
                  style={{ background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.1)" }}
                />
              </div>
              <div>
                <label className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest block mb-1.5">Email *</label>
                <input
                  type="email" required value={email} onChange={e => setEmail(e.target.value)}
                  placeholder="jane@restaurant.com"
                  className="w-full rounded-xl px-3 py-2.5 text-white text-sm placeholder-gray-600 focus:outline-none"
                  style={{ background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.1)" }}
                />
              </div>
            </div>

            {/* Role picker */}
            <div>
              <label className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest block mb-2">Role</label>
              <div className="grid grid-cols-2 gap-2">
                {(["manager", "staff"] as Role[]).map(r => {
                  const ri = ROLE_INFO[r];
                  const selected = role === r;
                  return (
                    <button key={r} type="button" onClick={() => setRole(r)}
                      className="rounded-xl p-3 text-left transition-all"
                      style={{
                        background: selected ? ri.bg : "rgba(255,255,255,0.04)",
                        border: `1px solid ${selected ? ri.color + "50" : "rgba(255,255,255,0.08)"}`,
                      }}>
                      <p className="text-sm font-bold" style={{ color: selected ? ri.color : "#9ca3af" }}>{ri.label}</p>
                      <p className="text-[10px] text-gray-500 mt-0.5">{ri.desc}</p>
                    </button>
                  );
                })}
              </div>
            </div>

            {error && (
              <div className="rounded-xl px-4 py-2.5" style={{ background: "rgba(220,38,38,0.1)", border: "1px solid rgba(220,38,38,0.3)" }}>
                <p className="text-red-400 text-xs">{error}</p>
              </div>
            )}

            {successUrl && (
              <div className="rounded-xl p-3" style={{ background: "rgba(0,212,168,0.08)", border: "1px solid rgba(0,212,168,0.25)" }}>
                <p className="text-teal-400 text-xs font-semibold mb-1">✓ Invitation sent!</p>
                <p className="text-gray-400 text-[10px] mb-2">Share this link if the email doesn't arrive:</p>
                <div className="flex items-center gap-2">
                  <code className="text-[10px] text-teal-300 break-all flex-1">{successUrl}</code>
                  <button type="button" onClick={() => navigator.clipboard.writeText(successUrl)}
                    className="text-[10px] text-teal-400 border border-teal-800 rounded px-2 py-1 hover:bg-teal-900/30 flex-shrink-0">
                    Copy
                  </button>
                </div>
              </div>
            )}

            <button type="submit" disabled={sending}
              className="w-full font-bold rounded-xl py-2.5 text-sm transition-all disabled:opacity-40"
              style={{ background: "linear-gradient(135deg, #00d4a8, #00b896)", color: "#0a1628" }}>
              {sending ? "Sending…" : "Send Invitation"}
            </button>
          </form>
        </div>

        {/* Pending Invitations */}
        {pending.length > 0 && (
          <div className="rounded-2xl p-5" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)" }}>
            <h2 className="text-white font-semibold text-sm mb-3">Pending ({pending.length})</h2>
            <div className="space-y-2">
              {pending.map(inv => {
                const ri = ROLE_INFO[inv.role];
                const isExpired = new Date(inv.expires_at) < new Date();
                return (
                  <div key={inv.id} className="flex items-center justify-between rounded-xl px-3 py-2.5"
                    style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.06)" }}>
                    <div>
                      <p className="text-white text-sm font-medium">{inv.email}</p>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-[9px] font-bold px-1.5 py-0.5 rounded" style={{ background: ri.bg, color: ri.color }}>{ri.label}</span>
                        {isExpired
                          ? <span className="text-[9px] text-red-400">Expired</span>
                          : <span className="text-[9px] text-gray-500">Expires {new Date(inv.expires_at).toLocaleDateString()}</span>
                        }
                      </div>
                    </div>
                    <button onClick={() => revokeInvite(inv.id)}
                      className="text-[10px] text-gray-500 hover:text-red-400 transition-colors px-2 py-1 rounded border border-transparent hover:border-red-900">
                      Revoke
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Accepted Members */}
        {accepted.length > 0 && (
          <div className="rounded-2xl p-5" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)" }}>
            <h2 className="text-white font-semibold text-sm mb-3">Team Members ({accepted.length})</h2>
            <div className="space-y-2">
              {accepted.map(inv => {
                const ri = ROLE_INFO[inv.role];
                return (
                  <div key={inv.id} className="flex items-center gap-3 rounded-xl px-3 py-2.5"
                    style={{ background: "rgba(0,212,168,0.05)", border: "1px solid rgba(0,212,168,0.12)" }}>
                    <div className="w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold"
                      style={{ background: ri.bg, color: ri.color }}>
                      {inv.email[0].toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-white text-sm font-medium truncate">{inv.email}</p>
                      <span className="text-[9px] font-bold" style={{ color: ri.color }}>{ri.label}</span>
                    </div>
                    <span className="text-[9px] text-teal-500">✓ Active</span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {!loading && invitations.length === 0 && (
          <div className="text-center py-12">
            <p className="text-4xl mb-3">👥</p>
            <p className="text-gray-500 text-sm">No team invitations yet.<br />Send your first invite above.</p>
          </div>
        )}
      </div>
    </div>
  );
}
