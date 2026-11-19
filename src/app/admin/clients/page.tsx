"use client";
import { useState, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

/* ─── Types ─────────────────────────────────────────────────────────── */
type Location = {
  id: string; name: string; state: string; address: string;
  created_at: string; sales_entries: number; food_entries: number;
};
type Subscription = {
  status: string; // trial | active | cancelled | expired
  monthly_amount: number;
  subscription_ends_at: string | null;
  notes: string | null;
};
type Client = {
  id: string; email: string; name: string | null;
  joined_at: string; last_sign_in: string | null; email_confirmed: boolean;
  locations: Location[]; total_sales_entries: number; total_food_entries: number;
  status: "active" | "onboarded" | "signed_up";
  subscription: Subscription | null;
  trial_expires_at: string | null;
};
type Invite = {
  id: string; key: string; label: string | null; email: string | null;
  used_by: string | null; used_at: string | null; expires_at: string; created_at: string;
  status: "converted" | "pending" | "expired";
};
type AccessRequest = {
  id: string; name: string | null; email: string; restaurant_name: string | null;
  locations: string | null; status: "pending" | "approved" | "rejected";
  notes: string | null; created_at: string; reviewed_at: string | null; invite_key: string | null;
};

/* ─── Helpers ────────────────────────────────────────────────────────── */
function fmt(d: string | null) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}
function daysSince(d: string | null) {
  if (!d) return null;
  return Math.floor((Date.now() - new Date(d).getTime()) / 86400000);
}
function relativeTime(d: string | null) {
  if (!d) return "never";
  const n = daysSince(d)!;
  if (n === 0) return "today";
  if (n === 1) return "yesterday";
  if (n < 30) return `${n}d ago`;
  if (n < 365) return `${Math.floor(n / 30)}mo ago`;
  return `${Math.floor(n / 365)}y ago`;
}
function isAtRisk(c: Client) {
  return (c.status === "active" || c.status === "onboarded") && daysSince(c.last_sign_in)! > 14;
}

/* ─── Status configs ─────────────────────────────────────────────────── */
const SC = {
  active:    { label: "Active",    bg: "rgba(0,212,168,.12)", color: "#00d4a8" },
  onboarded: { label: "Onboarded", bg: "rgba(99,102,241,.15)", color: "#818cf8" },
  signed_up: { label: "Signed Up", bg: "rgba(245,158,11,.12)", color: "#fbbf24" },
  at_risk:   { label: "At Risk",   bg: "rgba(239,68,68,.12)",  color: "#f87171" },
} as const;
const IC = {
  converted: { label: "Converted", bg: "rgba(0,212,168,.12)",  color: "#00d4a8" },
  pending:   { label: "Pending",   bg: "rgba(99,102,241,.12)", color: "#818cf8" },
  expired:   { label: "Expired",   bg: "rgba(107,114,128,.15)",color: "#6b7280" },
} as const;

/* ─── Invite Modal ───────────────────────────────────────────────────── */
function InviteModal({ onClose, defaultEmail = "", existingKey, onSent }:{
  onClose: () => void; defaultEmail?: string; existingKey?: string; onSent?: () => void;
}) {
  const [email, setEmail] = useState(defaultEmail);
  const [label, setLabel] = useState("");
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [err, setErr] = useState("");

  async function send() {
    if (!email.includes("@")) { setErr("Enter a valid email."); return; }
    setSending(true); setErr("");

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 20000); // 20s UI timeout

    try {
      const r = await fetch("/api/admin/send-invite", {
        method: "POST",
        signal: controller.signal,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, label: label || undefined, existingKey }),
      });
      clearTimeout(timeout);

      let d: { error?: string; ok?: boolean } = {};
      try { d = await r.json(); } catch { /* non-JSON body */ }

      setSending(false);
      if (!r.ok) { setErr(d.error || `Send failed (${r.status}). Check that RESEND_API_KEY is configured.`); return; }
      setSent(true); onSent?.();
    } catch (e: unknown) {
      clearTimeout(timeout);
      setSending(false);
      const msg = e instanceof Error && e.name === "AbortError"
        ? "Request timed out — check server logs."
        : "Network error. Try again.";
      setErr(msg);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4"
      style={{ background: "rgba(0,0,0,.75)", backdropFilter: "blur(6px)" }}>
      <div className="w-full max-w-md rounded-2xl p-7 shadow-2xl"
        style={{ background: "#0d1420", border: "1px solid rgba(0,212,168,.2)" }}>
        {sent ? (
          <div className="text-center py-4">
            <div className="text-4xl mb-3">✉️</div>
            <div className="text-white font-bold text-lg mb-1">Invite sent!</div>
            <div className="text-gray-400 text-sm mb-6">Emailed to <strong className="text-white">{email}</strong></div>
            <button onClick={onClose} className="w-full py-3 rounded-xl text-sm font-semibold"
              style={{ background: "rgba(0,212,168,.12)", color: "#00d4a8" }}>Done</button>
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-white font-bold text-lg">{existingKey ? "Resend Invite" : "Send Invite"}</h2>
              <button onClick={onClose} className="text-gray-500 hover:text-white text-xl leading-none">✕</button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Email</label>
                <input type="email" value={email} onChange={e => setEmail(e.target.value)}
                  placeholder="owner@restaurant.com" autoFocus
                  className="mt-1.5 w-full rounded-xl px-4 py-3 text-white placeholder-gray-600 text-sm focus:outline-none"
                  style={{ background: "rgba(255,255,255,.07)", border: "1px solid rgba(0,212,168,.2)" }} />
              </div>
              {!existingKey && (
                <div>
                  <label className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
                    Label <span className="text-gray-600 normal-case font-normal">(optional)</span>
                  </label>
                  <input type="text" value={label} onChange={e => setLabel(e.target.value)}
                    placeholder="e.g. Mario's Bistro"
                    className="mt-1.5 w-full rounded-xl px-4 py-3 text-white placeholder-gray-600 text-sm focus:outline-none"
                    style={{ background: "rgba(255,255,255,.07)", border: "1px solid rgba(255,255,255,.08)" }} />
                </div>
              )}
              {existingKey && (
                <div className="rounded-xl px-4 py-3 text-xs"
                  style={{ background: "rgba(99,102,241,.1)", border: "1px solid rgba(99,102,241,.2)", color: "#818cf8" }}>
                  Reusing key: <strong>{existingKey}</strong>
                </div>
              )}
              {err && (
                <div className="text-red-400 text-xs rounded-xl px-4 py-2.5"
                  style={{ background: "rgba(220,38,38,.1)", border: "1px solid rgba(220,38,38,.3)" }}>{err}</div>
              )}
              <div className="flex gap-3 pt-1">
                <button onClick={onClose} className="flex-1 py-3 rounded-xl text-sm font-medium text-gray-500 hover:text-white transition-colors"
                  style={{ background: "rgba(255,255,255,.05)" }}>Cancel</button>
                <button onClick={send} disabled={sending}
                  className="flex-1 py-3 rounded-xl text-sm font-bold transition-all disabled:opacity-50"
                  style={{ background: "linear-gradient(135deg,#c8921a,#e8b84b)", color: "#1a0d02" }}>
                  {sending ? "Sending…" : "Send ✉️"}
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

/* ─── Status pill ────────────────────────────────────────────────────── */
function Pill({ label, bg, color }: { label: string; bg: string; color: string }) {
  return (
    <span className="px-2 py-0.5 rounded-full text-xs font-semibold shrink-0"
      style={{ background: bg, color }}>{label}</span>
  );
}

/* ─── Sort indicator ─────────────────────────────────────────────────── */
function SortIcon({ col, sort }: { col: string; sort: { col: string; asc: boolean } }) {
  if (sort.col !== col) return <span className="text-gray-700 ml-1">↕</span>;
  return <span className="ml-1" style={{ color: "#00d4a8" }}>{sort.asc ? "↑" : "↓"}</span>;
}

/* ─── Clients Tab ────────────────────────────────────────────────────── */
function ClientsTab({ clients, onInvite }: { clients: Client[]; onInvite: (email: string) => void }) {
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"all"|"active"|"onboarded"|"signed_up"|"at_risk">("all");
  const [sort, setSort] = useState<{ col: string; asc: boolean }>({ col: "joined", asc: false });
  const [expandedId, setExpandedId] = useState<string | null>(null);

  function toggleSort(col: string) {
    setSort(s => s.col === col ? { col, asc: !s.asc } : { col, asc: false });
  }

  const filtered = useMemo(() => {
    let list = clients.filter(c => {
      const q = search.toLowerCase();
      const matchSearch = !q || c.email.toLowerCase().includes(q)
        || (c.name ?? "").toLowerCase().includes(q)
        || c.locations.some(l => l.name.toLowerCase().includes(q));
      const risk = isAtRisk(c);
      const matchFilter = filter === "all" ? true
        : filter === "at_risk" ? risk
        : c.status === filter;
      return matchSearch && matchFilter;
    });

    list = [...list].sort((a, b) => {
      let av: number | string = 0, bv: number | string = 0;
      if (sort.col === "name")  { av = (a.name ?? a.email).toLowerCase(); bv = (b.name ?? b.email).toLowerCase(); }
      if (sort.col === "joined"){ av = new Date(a.joined_at).getTime(); bv = new Date(b.joined_at).getTime(); }
      if (sort.col === "login") { av = a.last_sign_in ? new Date(a.last_sign_in).getTime() : 0; bv = b.last_sign_in ? new Date(b.last_sign_in).getTime() : 0; }
      if (sort.col === "sales") { av = a.total_sales_entries; bv = b.total_sales_entries; }
      if (sort.col === "locs")  { av = a.locations.length; bv = b.locations.length; }
      const cmp = typeof av === "string" ? av.localeCompare(bv as string) : (av as number) - (bv as number);
      return sort.asc ? cmp : -cmp;
    });
    return list;
  }, [clients, search, filter, sort]);

  const filterCounts = useMemo(() => ({
    all: clients.length,
    active: clients.filter(c => c.status === "active").length,
    onboarded: clients.filter(c => c.status === "onboarded").length,
    signed_up: clients.filter(c => c.status === "signed_up").length,
    at_risk: clients.filter(isAtRisk).length,
  }), [clients]);

  const FILTERS: { key: typeof filter; label: string; color?: string }[] = [
    { key: "all",      label: `All (${filterCounts.all})` },
    { key: "active",   label: `Active (${filterCounts.active})`,   color: "#00d4a8" },
    { key: "onboarded",label: `Onboarded (${filterCounts.onboarded})`, color: "#818cf8" },
    { key: "signed_up",label: `Signed Up (${filterCounts.signed_up})`, color: "#fbbf24" },
    { key: "at_risk",  label: `⚠️ At Risk (${filterCounts.at_risk})`, color: "#f87171" },
  ];

  const TH = ({ col, label }: { col: string; label: string }) => (
    <th className="text-left py-2 px-3 text-xs font-semibold text-gray-500 uppercase tracking-wider cursor-pointer select-none hover:text-gray-300 transition-colors whitespace-nowrap"
      onClick={() => toggleSort(col)}>
      {label}<SortIcon col={col} sort={sort} />
    </th>
  );

  return (
    <div>
      {/* Search + filters */}
      <div className="flex flex-col sm:flex-row gap-3 mb-4">
        <div className="relative flex-1">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 text-sm">🔍</span>
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search by name, email, or restaurant…"
            className="w-full pl-9 pr-4 py-2.5 rounded-xl text-sm text-white placeholder-gray-600 focus:outline-none"
            style={{ background: "rgba(255,255,255,.06)", border: "1px solid rgba(255,255,255,.1)" }} />
        </div>
      </div>
      <div className="flex flex-wrap gap-2 mb-5">
        {FILTERS.map(f => (
          <button key={f.key} onClick={() => setFilter(f.key)}
            className="px-3 py-1.5 rounded-full text-xs font-semibold transition-all"
            style={filter === f.key
              ? { background: f.color ? `${f.color}22` : "rgba(0,212,168,.15)", color: f.color ?? "#00d4a8", border: `1px solid ${f.color ?? "#00d4a8"}55` }
              : { background: "rgba(255,255,255,.04)", color: "#6b7280", border: "1px solid rgba(255,255,255,.07)" }}>
            {f.label}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <div className="text-center py-16 text-gray-600 text-sm">No clients match your search.</div>
      ) : (
        <div className="rounded-2xl overflow-hidden" style={{ border: "1px solid rgba(255,255,255,.07)" }}>
          <table className="w-full">
            <thead style={{ background: "rgba(255,255,255,.03)", borderBottom: "1px solid rgba(255,255,255,.06)" }}>
              <tr>
                <TH col="name"  label="Client" />
                <th className="text-left py-2 px-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Status</th>
                <TH col="locs"  label="Locations" />
                <TH col="sales" label="Sales" />
                <TH col="login" label="Last Login" />
                <TH col="joined" label="Joined" />
                <th className="py-2 px-3" />
              </tr>
            </thead>
            <tbody>
              {filtered.map((c, i) => {
                const risk = isAtRisk(c);
                const sc = SC[c.status];
                const expanded = expandedId === c.id;
                const ds = daysSince(c.last_sign_in);
                return (
                  <>
                    <tr key={c.id}
                      className="cursor-pointer transition-colors"
                      style={{ background: expanded ? "rgba(0,212,168,.04)" : i % 2 === 0 ? "rgba(255,255,255,.015)" : "transparent", borderBottom: "1px solid rgba(255,255,255,.04)" }}
                      onClick={() => setExpandedId(expanded ? null : c.id)}>
                      <td className="py-3 px-3">
                        <div className="flex items-center gap-2.5">
                          <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold shrink-0"
                            style={{ background: risk ? "rgba(239,68,68,.15)" : "rgba(0,212,168,.12)", color: risk ? "#f87171" : "#00d4a8" }}>
                            {(c.name ?? c.email)[0].toUpperCase()}
                          </div>
                          <div>
                            <div className="text-sm font-semibold text-white leading-none mb-0.5 flex items-center gap-1.5">
                              {c.name ?? c.email.split("@")[0]}
                              {risk && <span title="No activity in 14+ days" className="text-xs">⚠️</span>}
                            </div>
                            <div className="text-xs text-gray-500">{c.email}</div>
                          </div>
                        </div>
                      </td>
                      <td className="py-3 px-3">
                        {risk
                          ? <Pill label="At Risk" bg={SC.at_risk.bg} color={SC.at_risk.color} />
                          : <Pill label={sc.label} bg={sc.bg} color={sc.color} />}
                      </td>
                      <td className="py-3 px-3 text-sm text-white font-medium">{c.locations.length || <span className="text-gray-600">—</span>}</td>
                      <td className="py-3 px-3 text-sm text-white font-medium">{c.total_sales_entries || <span className="text-gray-600">—</span>}</td>
                      <td className="py-3 px-3">
                        <span className={`text-xs ${ds !== null && ds > 14 ? "text-red-400" : ds !== null && ds <= 1 ? "text-teal-400" : "text-gray-400"}`}>
                          {relativeTime(c.last_sign_in)}
                        </span>
                      </td>
                      <td className="py-3 px-3 text-xs text-gray-500">{fmt(c.joined_at)}</td>
                      <td className="py-3 px-3">
                        <button onClick={e => { e.stopPropagation(); onInvite(c.email); }}
                          className="px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-all"
                          style={{ background: "rgba(232,184,75,.1)", color: "#e8b84b", border: "1px solid rgba(232,184,75,.2)" }}>
                          ✉️
                        </button>
                      </td>
                    </tr>
                    {expanded && (
                      <tr key={`${c.id}-exp`} style={{ background: "rgba(0,212,168,.02)", borderBottom: "1px solid rgba(255,255,255,.04)" }}>
                        <td colSpan={7} className="px-5 py-4">
                          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs mb-4">
                            <div><span className="text-gray-500">Email</span><div className="text-gray-300 mt-0.5 break-all">{c.email}</div></div>
                            <div><span className="text-gray-500">Joined</span><div className="text-gray-300 mt-0.5">{fmt(c.joined_at)}</div></div>
                            <div><span className="text-gray-500">Last Login</span><div className={`mt-0.5 ${ds !== null && ds > 14 ? "text-red-400" : "text-gray-300"}`}>{fmt(c.last_sign_in)}{ds !== null && ds > 14 ? ` (${ds}d ago ⚠️)` : ""}</div></div>
                            <div><span className="text-gray-500">Confirmed</span><div className="mt-0.5" style={{ color: c.email_confirmed ? "#00d4a8" : "#f87171" }}>{c.email_confirmed ? "✓ Yes" : "✗ No"}</div></div>
                          </div>
                          {c.locations.length > 0 && (
                            <div className="space-y-2">
                              <div className="text-xs text-gray-500 uppercase tracking-wider mb-1">Restaurants</div>
                              {c.locations.map(l => (
                                <div key={l.id} className="flex items-center justify-between rounded-xl px-4 py-3"
                                  style={{ background: "rgba(255,255,255,.03)", border: "1px solid rgba(255,255,255,.06)" }}>
                                  <div>
                                    <div className="text-sm text-white font-medium">{l.name}</div>
                                    <div className="text-xs text-gray-500">{[l.address, l.state].filter(Boolean).join(", ") || "—"}</div>
                                  </div>
                                  <div className="flex gap-6 text-right text-xs">
                                    <div><div className="text-white font-semibold">{l.sales_entries}</div><div className="text-gray-600">sales</div></div>
                                    <div><div className="text-white font-semibold">{l.food_entries}</div><div className="text-gray-600">invoices</div></div>
                                    <div><div className="text-gray-400">{fmt(l.created_at)}</div><div className="text-gray-600">added</div></div>
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                          {c.locations.length === 0 && (
                            <div className="text-xs text-yellow-600 py-2">⚠️ No restaurant set up yet — may need follow-up.</div>
                          )}
                        </td>
                      </tr>
                    )}
                  </>
                );
              })}
            </tbody>
          </table>
          <div className="px-4 py-2.5 text-xs text-gray-600" style={{ borderTop: "1px solid rgba(255,255,255,.04)" }}>
            Showing {filtered.length} of {clients.length} clients
          </div>
        </div>
      )}
    </div>
  );
}

/* ─── Pipeline Tab ───────────────────────────────────────────────────── */
function PipelineTab({ pipeline, onInvite, onRefresh }: {
  pipeline: Invite[]; onInvite: (email: string, key: string) => void; onRefresh: () => void;
}) {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all"|"pending"|"expired"|"converted">("all");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkSending, setBulkSending] = useState(false);
  const [bulkResult, setBulkResult] = useState<string>("");
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const filtered = useMemo(() => pipeline.filter(inv => {
    const q = search.toLowerCase();
    const matchQ = !q || (inv.email ?? "").toLowerCase().includes(q) || (inv.label ?? "").toLowerCase().includes(q) || inv.key.toLowerCase().includes(q);
    const matchS = statusFilter === "all" || inv.status === statusFilter;
    return matchQ && matchS;
  }), [pipeline, search, statusFilter]);

  const resendable = filtered.filter(i => i.status !== "converted" && i.email);
  const allSelected = resendable.length > 0 && resendable.every(i => selected.has(i.id));

  function toggleAll() {
    if (allSelected) setSelected(new Set());
    else setSelected(new Set(resendable.map(i => i.id)));
  }
  function toggle(id: string) {
    setSelected(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  }

  async function copyLink(key: string, id: string) {
    await navigator.clipboard.writeText(`https://cashcall.io/trial?key=${key}`);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  }

  async function bulkResend() {
    const targets = filtered.filter(i => selected.has(i.id) && i.email);
    if (!targets.length) return;
    setBulkSending(true); setBulkResult("");
    let ok = 0, fail = 0;
    for (const inv of targets) {
      try {
        const controller = new AbortController();
        const t = setTimeout(() => controller.abort(), 20000);
        const r = await fetch("/api/admin/send-invite", {
          method: "POST",
          signal: controller.signal,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email: inv.email, existingKey: inv.key }),
        });
        clearTimeout(t);
        r.ok ? ok++ : fail++;
      } catch { fail++; }
    }
    setBulkSending(false);
    setBulkResult(`✓ ${ok} sent${fail ? `, ${fail} failed` : ""}`);
    setSelected(new Set());
    setTimeout(() => setBulkResult(""), 4000);
  }

  const counts = { all: pipeline.length, pending: pipeline.filter(i => i.status === "pending").length, converted: pipeline.filter(i => i.status === "converted").length, expired: pipeline.filter(i => i.status === "expired").length };

  return (
    <div>
      {/* Search + filter */}
      <div className="flex flex-col sm:flex-row gap-3 mb-4">
        <div className="relative flex-1">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 text-sm">🔍</span>
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search by email, label, or key…"
            className="w-full pl-9 pr-4 py-2.5 rounded-xl text-sm text-white placeholder-gray-600 focus:outline-none"
            style={{ background: "rgba(255,255,255,.06)", border: "1px solid rgba(255,255,255,.1)" }} />
        </div>
      </div>
      <div className="flex flex-wrap gap-2 mb-4">
        {(["all","pending","converted","expired"] as const).map(s => (
          <button key={s} onClick={() => setStatusFilter(s)}
            className="px-3 py-1.5 rounded-full text-xs font-semibold transition-all capitalize"
            style={statusFilter === s
              ? { background: "rgba(0,212,168,.15)", color: "#00d4a8", border: "1px solid rgba(0,212,168,.3)" }
              : { background: "rgba(255,255,255,.04)", color: "#6b7280", border: "1px solid rgba(255,255,255,.07)" }}>
            {s === "all" ? `All (${counts.all})` : s === "pending" ? `Pending (${counts.pending})` : s === "converted" ? `Converted (${counts.converted})` : `Expired (${counts.expired})`}
          </button>
        ))}
      </div>

      {/* Bulk actions bar */}
      {(resendable.length > 0) && (
        <div className="flex items-center gap-3 px-4 py-3 rounded-xl mb-4"
          style={{ background: "rgba(255,255,255,.04)", border: "1px solid rgba(255,255,255,.08)" }}>
          <input type="checkbox" checked={allSelected} onChange={toggleAll}
            className="w-4 h-4 accent-teal-400 cursor-pointer" />
          <span className="text-xs text-gray-400">{selected.size > 0 ? `${selected.size} selected` : "Select all with email"}</span>
          {selected.size > 0 && (
            <>
              <button onClick={bulkResend} disabled={bulkSending}
                className="ml-auto px-4 py-1.5 rounded-lg text-xs font-semibold transition-all disabled:opacity-50"
                style={{ background: "linear-gradient(135deg,#c8921a,#e8b84b)", color: "#1a0d02" }}>
                {bulkSending ? "Sending…" : `Resend (${selected.size}) ✉️`}
              </button>
            </>
          )}
          {bulkResult && <span className="text-xs font-semibold" style={{ color: "#00d4a8" }}>{bulkResult}</span>}
        </div>
      )}

      {/* Invite list */}
      <div className="space-y-2">
        {filtered.length === 0 ? (
          <div className="text-center py-16 text-gray-600 text-sm">No invites found.</div>
        ) : filtered.map(inv => {
          const ic = IC[inv.status];
          const canSelect = inv.status !== "converted" && !!inv.email;
          return (
            <div key={inv.id} className="rounded-xl border flex items-center gap-3 px-4 py-3.5 transition-all"
              style={{ background: selected.has(inv.id) ? "rgba(0,212,168,.04)" : "rgba(255,255,255,.02)", borderColor: selected.has(inv.id) ? "rgba(0,212,168,.2)" : "rgba(255,255,255,.07)" }}>
              <input type="checkbox" checked={selected.has(inv.id)} disabled={!canSelect}
                onChange={() => canSelect && toggle(inv.id)}
                className="w-4 h-4 accent-teal-400 cursor-pointer disabled:opacity-30 shrink-0" />
              <div className="w-2 h-2 rounded-full shrink-0" style={{ background: ic.color }} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                  <span className="text-sm font-medium text-white truncate max-w-xs">
                    {inv.label || <span className="text-gray-500 italic">No label</span>}
                  </span>
                  <Pill label={ic.label} bg={ic.bg} color={ic.color} />
                </div>
                <div className="text-xs text-gray-500 flex flex-wrap gap-x-3">
                  {inv.email && <span>📧 {inv.email}</span>}
                  <span className="font-mono text-gray-600">{inv.key}</span>
                  {inv.used_at
                    ? <span className="text-teal-400">Converted {fmt(inv.used_at)}</span>
                    : inv.status === "expired"
                    ? <span className="text-gray-600">Expired {fmt(inv.expires_at)}</span>
                    : <span>Expires {fmt(inv.expires_at)}</span>}
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button onClick={() => copyLink(inv.key, inv.id)}
                  className="px-3 py-1.5 rounded-lg text-xs font-medium transition-all"
                  style={{ background: copiedId === inv.id ? "rgba(0,212,168,.15)" : "rgba(255,255,255,.05)", color: copiedId === inv.id ? "#00d4a8" : "#6b7280", border: "1px solid rgba(255,255,255,.08)" }}>
                  {copiedId === inv.id ? "Copied!" : "🔗 Link"}
                </button>
                {inv.status !== "converted" && (
                  <button onClick={() => onInvite(inv.email ?? "", inv.key)}
                    className="px-3 py-1.5 rounded-lg text-xs font-semibold transition-all"
                    style={{ background: "rgba(232,184,75,.1)", color: "#e8b84b", border: "1px solid rgba(232,184,75,.2)" }}>
                    {inv.email ? "Resend" : "Send"} ✉️
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ─── Funnel Tab ─────────────────────────────────────────────────────── */
function FunnelTab({ clients, pipeline }: { clients: Client[]; pipeline: Invite[] }) {
  const stages = [
    { label: "Invites Created", count: pipeline.length, color: "#60a5fa", icon: "🎟️" },
    { label: "Emails Sent", count: pipeline.filter(i => i.email).length, color: "#818cf8", icon: "✉️" },
    { label: "Signed Up", count: pipeline.filter(i => i.status === "converted").length + clients.length, color: "#f59e0b", icon: "👤" },
    { label: "Set Up Restaurant", count: clients.filter(c => c.locations.length > 0).length, color: "#00d4a8", icon: "🍽️" },
    { label: "Entered Sales Data", count: clients.filter(c => c.total_sales_entries > 0).length, color: "#22c55e", icon: "📊" },
  ];
  const max = stages[0].count || 1;
  const convRate = clients.length > 0 && pipeline.length > 0
    ? Math.round((clients.filter(c => c.total_sales_entries > 0).length / pipeline.length) * 100)
    : 0;

  return (
    <div className="max-w-2xl mx-auto">
      <div className="mb-8 text-center">
        <div className="text-4xl font-bold mb-1" style={{ color: "#00d4a8" }}>{convRate}%</div>
        <div className="text-sm text-gray-500">invite → active client conversion rate</div>
      </div>
      <div className="space-y-4">
        {stages.map((s, i) => {
          const pct = Math.round((s.count / max) * 100);
          const dropPct = i > 0 ? Math.round(((stages[i-1].count - s.count) / (stages[i-1].count || 1)) * 100) : null;
          return (
            <div key={s.label}>
              {dropPct !== null && dropPct > 0 && (
                <div className="text-center text-xs text-gray-600 my-1 flex items-center justify-center gap-2">
                  <div className="h-px flex-1" style={{ background: "rgba(255,255,255,.05)" }} />
                  <span>↓ {dropPct}% drop-off</span>
                  <div className="h-px flex-1" style={{ background: "rgba(255,255,255,.05)" }} />
                </div>
              )}
              <div className="rounded-xl p-4" style={{ background: "rgba(255,255,255,.03)", border: "1px solid rgba(255,255,255,.07)" }}>
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <span>{s.icon}</span>
                    <span className="text-sm font-medium text-gray-300">{s.label}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-xs text-gray-500">{pct}% of top</span>
                    <span className="text-xl font-bold text-white">{s.count}</span>
                  </div>
                </div>
                <div className="h-2 rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,.06)" }}>
                  <div className="h-full rounded-full transition-all duration-700"
                    style={{ width: `${pct}%`, background: s.color }} />
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Conversion breakdown */}
      <div className="mt-8 grid grid-cols-3 gap-3">
        {[
          { label: "Invite → Signup", num: pipeline.filter(i => i.status === "converted").length, den: pipeline.filter(i => i.email).length },
          { label: "Signup → Onboarded", num: clients.filter(c => c.locations.length > 0).length, den: clients.length },
          { label: "Onboarded → Active", num: clients.filter(c => c.total_sales_entries > 0).length, den: clients.filter(c => c.locations.length > 0).length },
        ].map(s => {
          const rate = s.den ? Math.round((s.num / s.den) * 100) : 0;
          return (
            <div key={s.label} className="rounded-xl p-4 text-center" style={{ background: "rgba(255,255,255,.03)", border: "1px solid rgba(255,255,255,.07)" }}>
              <div className="text-2xl font-bold mb-0.5" style={{ color: rate >= 70 ? "#00d4a8" : rate >= 40 ? "#fbbf24" : "#f87171" }}>
                {rate}%
              </div>
              <div className="text-xs text-gray-500">{s.label}</div>
              <div className="text-xs text-gray-700 mt-1">{s.num}/{s.den}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ─── Billing Tab ────────────────────────────────────────────────────── */
const SUB_STATUS: Record<string, { label: string; bg: string; color: string }> = {
  trial:     { label: "Trial",      bg: "rgba(99,102,241,.15)", color: "#818cf8" },
  active:    { label: "Active ✓",   bg: "rgba(0,212,168,.12)",  color: "#00d4a8" },
  cancelled: { label: "Cancelled",  bg: "rgba(239,68,68,.12)",  color: "#f87171" },
  expired:   { label: "Expired",    bg: "rgba(107,114,128,.15)",color: "#6b7280" },
};

function BillingTab({ clients, onRefresh }: { clients: Client[]; onRefresh: () => void }) {
  const [search, setSearch] = useState("");
  const [updating, setUpdating] = useState<string | null>(null);
  const [editModal, setEditModal] = useState<Client | null>(null);

  // Status filter
  const [filter, setFilter] = useState<"all"|"trial"|"active"|"cancelled"|"expired">("all");

  const filtered = useMemo(() => clients.filter(c => {
    const q = search.toLowerCase();
    const matchSearch = !q || c.email.toLowerCase().includes(q) || (c.name ?? "").toLowerCase().includes(q);
    const subStatus = c.subscription?.status ?? "trial";
    const trialExpired = c.trial_expires_at && new Date(c.trial_expires_at) < new Date() && subStatus === "trial";
    const effectiveStatus = trialExpired ? "expired" : subStatus;
    const matchFilter = filter === "all" || effectiveStatus === filter;
    return matchSearch && matchFilter;
  }), [clients, search, filter]);

  // KPIs
  const mrr = clients.reduce((sum, c) => sum + (c.subscription?.monthly_amount ?? 0), 0);
  const paying = clients.filter(c => c.subscription?.status === "active").length;
  const trialActive = clients.filter(c => {
    const s = c.subscription?.status ?? "trial";
    return s === "trial" && c.trial_expires_at && new Date(c.trial_expires_at) > new Date();
  }).length;
  const trialExpired = clients.filter(c => {
    const s = c.subscription?.status ?? "trial";
    return s === "trial" && c.trial_expires_at && new Date(c.trial_expires_at) < new Date();
  }).length;

  async function updateSub(client: Client, status: string, amount?: number, notes?: string) {
    setUpdating(client.id);
    try {
      await fetch("/api/admin/subscriptions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: client.email,
          user_id: client.id,
          status,
          monthly_amount: amount ?? client.subscription?.monthly_amount ?? 0,
          notes: notes ?? client.subscription?.notes,
          subscription_starts_at: status === "active" ? new Date().toISOString() : undefined,
        }),
      });
      onRefresh();
    } catch { /* ignore */ }
    setUpdating(null);
  }

  return (
    <div>
      {/* KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        {[
          { label: "Monthly Revenue",   value: `$${mrr.toLocaleString()}`, color: "#00d4a8" },
          { label: "Paying Clients",    value: paying,                     color: "#818cf8" },
          { label: "Active Trials",     value: trialActive,                color: "#60a5fa" },
          { label: "Expired Trials",    value: trialExpired,               color: trialExpired > 0 ? "#f87171" : "#6b7280" },
        ].map(k => (
          <div key={k.label} className="rounded-2xl p-4"
            style={{ background: "rgba(255,255,255,.03)", border: "1px solid rgba(255,255,255,.07)" }}>
            <div className="text-2xl font-bold leading-none mb-1.5" style={{ color: k.color }}>{k.value}</div>
            <div className="text-xs text-gray-400">{k.label}</div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2 mb-4">
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search clients…"
          className="flex-1 min-w-48 rounded-xl px-4 py-2 text-sm text-white placeholder-gray-600"
          style={{ background: "rgba(255,255,255,.06)", border: "1px solid rgba(255,255,255,.09)" }} />
        <div className="flex gap-1">
          {(["all","trial","active","cancelled","expired"] as const).map(f => (
            <button key={f} onClick={() => setFilter(f)}
              className="px-3 py-2 rounded-xl text-xs font-medium capitalize"
              style={filter === f ? { background: "rgba(0,212,168,.15)", color: "#00d4a8" } : { color: "#6b7280" }}>
              {f}
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      <div className="rounded-2xl overflow-hidden" style={{ border: "1px solid rgba(255,255,255,.07)" }}>
        <table className="w-full">
          <thead>
            <tr style={{ background: "rgba(255,255,255,.03)" }}>
              {["Client","Trial Expires","Status","MRR","Actions"].map(h => (
                <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.map((c, i) => {
              const subStatus = c.subscription?.status ?? "trial";
              const trialExp = c.trial_expires_at ? new Date(c.trial_expires_at) : null;
              const trialExpired = trialExp && trialExp < new Date() && subStatus === "trial";
              const effectiveStatus = trialExpired ? "expired" : subStatus;
              const cfg = SUB_STATUS[effectiveStatus] ?? SUB_STATUS.trial;
              const daysLeft = trialExp ? Math.ceil((trialExp.getTime() - Date.now()) / 86400000) : null;

              return (
                <tr key={c.id}
                  style={{ borderTop: i > 0 ? "1px solid rgba(255,255,255,.05)" : "none",
                    background: trialExpired ? "rgba(239,68,68,.03)" : "transparent" }}>
                  <td className="px-4 py-3">
                    <div className="text-sm font-medium text-white">{c.name || c.email}</div>
                    {c.name && <div className="text-xs text-gray-600">{c.email}</div>}
                  </td>
                  <td className="px-4 py-3">
                    {trialExp ? (
                      <div className={`text-xs ${trialExpired ? "text-red-400" : daysLeft && daysLeft <= 5 ? "text-yellow-400" : "text-gray-400"}`}>
                        {trialExpired
                          ? `Expired ${fmt(c.trial_expires_at)}`
                          : `${daysLeft}d left (${fmt(c.trial_expires_at)})`}
                      </div>
                    ) : <span className="text-gray-600 text-xs">—</span>}
                  </td>
                  <td className="px-4 py-3">
                    <Pill label={cfg.label} bg={cfg.bg} color={cfg.color} />
                    {c.subscription?.notes && (
                      <div className="text-xs text-gray-600 mt-1 max-w-32 truncate">{c.subscription.notes}</div>
                    )}
                  </td>
                  <td className="px-4 py-3 text-sm text-white">
                    {c.subscription?.monthly_amount ? `$${c.subscription.monthly_amount}/mo` : <span className="text-gray-600">—</span>}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex gap-1.5">
                      {effectiveStatus !== "active" && (
                        <button
                          onClick={() => setEditModal(c)}
                          disabled={updating === c.id}
                          className="px-3 py-1.5 rounded-lg text-xs font-semibold"
                          style={{ background: "rgba(0,212,168,.1)", color: "#00d4a8" }}>
                          {updating === c.id ? "…" : "Activate"}
                        </button>
                      )}
                      {effectiveStatus === "active" && (
                        <button
                          onClick={() => updateSub(c, "cancelled")}
                          disabled={updating === c.id}
                          className="px-3 py-1.5 rounded-lg text-xs font-semibold"
                          style={{ background: "rgba(239,68,68,.1)", color: "#f87171" }}>
                          Cancel
                        </button>
                      )}
                      <button
                        onClick={() => setEditModal(c)}
                        className="px-3 py-1.5 rounded-lg text-xs text-gray-500 hover:text-white"
                        style={{ background: "rgba(255,255,255,.05)" }}>
                        Edit
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-12 text-center text-gray-600 text-sm">No clients match.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Edit modal */}
      {editModal && (
        <EditSubModal
          client={editModal}
          onClose={() => setEditModal(null)}
          onSave={async (status, amount, notes) => {
            await updateSub(editModal, status, amount, notes);
            setEditModal(null);
          }}
        />
      )}
    </div>
  );
}

function EditSubModal({ client, onClose, onSave }: {
  client: Client;
  onClose: () => void;
  onSave: (status: string, amount: number, notes: string) => Promise<void>;
}) {
  const [status, setStatus] = useState(client.subscription?.status ?? "trial");
  const [amount, setAmount] = useState(client.subscription?.monthly_amount ?? 0);
  const [notes, setNotes] = useState(client.subscription?.notes ?? "");
  const [saving, setSaving] = useState(false);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4"
      style={{ background: "rgba(0,0,0,.75)", backdropFilter: "blur(6px)" }}>
      <div className="w-full max-w-sm rounded-2xl p-6 shadow-2xl"
        style={{ background: "#0d1420", border: "1px solid rgba(0,212,168,.2)" }}>
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-white font-bold">Edit Subscription</h2>
          <button onClick={onClose} className="text-gray-500 hover:text-white">✕</button>
        </div>
        <div className="text-sm text-gray-400 mb-4">{client.name || client.email}</div>
        <div className="space-y-3">
          <div>
            <label className="text-xs text-gray-500 uppercase tracking-wider">Status</label>
            <select value={status} onChange={e => setStatus(e.target.value)}
              className="mt-1.5 w-full rounded-xl px-3 py-2.5 text-white text-sm"
              style={{ background: "rgba(255,255,255,.07)", border: "1px solid rgba(255,255,255,.1)" }}>
              {["trial","active","cancelled","expired"].map(s => (
                <option key={s} value={s} style={{ background: "#0d1420" }}>{s}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs text-gray-500 uppercase tracking-wider">Monthly Amount ($)</label>
            <input type="number" value={amount} onChange={e => setAmount(Number(e.target.value))} min={0}
              className="mt-1.5 w-full rounded-xl px-3 py-2.5 text-white text-sm"
              style={{ background: "rgba(255,255,255,.07)", border: "1px solid rgba(255,255,255,.1)" }} />
          </div>
          <div>
            <label className="text-xs text-gray-500 uppercase tracking-wider">Notes</label>
            <input type="text" value={notes} onChange={e => setNotes(e.target.value)} placeholder="e.g. Paid via Venmo"
              className="mt-1.5 w-full rounded-xl px-3 py-2.5 text-white text-sm"
              style={{ background: "rgba(255,255,255,.07)", border: "1px solid rgba(255,255,255,.1)" }} />
          </div>
          <div className="flex gap-3 pt-1">
            <button onClick={onClose} className="flex-1 py-2.5 rounded-xl text-sm text-gray-500"
              style={{ background: "rgba(255,255,255,.05)" }}>Cancel</button>
            <button
              disabled={saving}
              onClick={async () => { setSaving(true); await onSave(status, amount, notes); setSaving(false); }}
              className="flex-1 py-2.5 rounded-xl text-sm font-bold"
              style={{ background: "linear-gradient(135deg,#c8921a,#e8b84b)", color: "#1a0d02" }}>
              {saving ? "Saving…" : "Save"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ─── Requests Tab ───────────────────────────────────────────────────── */
const RC = {
  pending:  { label: "Pending",  bg: "rgba(251,191,36,.12)", color: "#fbbf24" },
  approved: { label: "Approved", bg: "rgba(0,212,168,.12)",  color: "#00d4a8" },
  rejected: { label: "Rejected", bg: "rgba(239,68,68,.12)",  color: "#f87171" },
} as const;

function RequestsTab({ requests, onRefresh }: { requests: AccessRequest[]; onRefresh: () => void }) {
  const [acting, setActing] = useState<string | null>(null);
  const [filter, setFilter] = useState<"all"|"pending"|"approved"|"rejected">("pending");
  const [noteModal, setNoteModal] = useState<{ id: string; action: "approve"|"reject" } | null>(null);
  const [note, setNote] = useState("");

  const filtered = requests.filter(r => filter === "all" || r.status === filter);
  const pendingCount = requests.filter(r => r.status === "pending").length;

  async function doAction(requestId: string, action: "approve"|"reject", noteText?: string) {
    setActing(requestId);
    const endpoint = action === "approve" ? "/api/admin/approve-request" : "/api/admin/reject-request";
    try {
      const r = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ requestId, note: noteText || undefined }),
      });
      const d = await r.json();
      if (!r.ok) alert(d.error || "Action failed");
      else { onRefresh(); setNoteModal(null); setNote(""); }
    } catch { alert("Network error"); }
    setActing(null);
  }

  return (
    <div className="space-y-4">
      {/* Note/confirm modal */}
      {noteModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4"
          style={{ background: "rgba(0,0,0,.75)", backdropFilter: "blur(6px)" }}>
          <div className="w-full max-w-md rounded-2xl p-7 shadow-2xl"
            style={{ background: "#0d1420", border: "1px solid rgba(0,212,168,.2)" }}>
            <h2 className="text-white font-bold text-lg mb-4">
              {noteModal.action === "approve" ? "✅ Approve & Send Invite" : "❌ Reject Request"}
            </h2>
            <p className="text-gray-400 text-sm mb-4">
              {noteModal.action === "approve"
                ? "This will generate a 30-day invite key and email it to the requester from contact@cashcall.io."
                : "This will mark the request as rejected. No email will be sent."}
            </p>
            <textarea
              value={note} onChange={e => setNote(e.target.value)}
              placeholder="Internal note (optional)…"
              rows={3}
              className="w-full rounded-xl px-4 py-3 text-white placeholder-gray-600 text-sm focus:outline-none resize-none mb-4"
              style={{ background: "rgba(255,255,255,.07)", border: "1px solid rgba(255,255,255,.1)" }}
            />
            <div className="flex gap-3">
              <button onClick={() => { setNoteModal(null); setNote(""); }}
                className="flex-1 py-3 rounded-xl text-sm font-medium text-gray-500 hover:text-white transition-colors"
                style={{ background: "rgba(255,255,255,.05)" }}>Cancel</button>
              <button
                onClick={() => doAction(noteModal.id, noteModal.action, note)}
                disabled={acting === noteModal.id}
                className="flex-1 py-3 rounded-xl text-sm font-bold transition-all disabled:opacity-50"
                style={noteModal.action === "approve"
                  ? { background: "linear-gradient(135deg,#00d4a8,#00b890)", color: "#030f0b" }
                  : { background: "rgba(239,68,68,.2)", color: "#f87171", border: "1px solid rgba(239,68,68,.3)" }}>
                {acting === noteModal.id ? "Processing…" : noteModal.action === "approve" ? "Approve & Send ✉️" : "Reject"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Filter bar */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex gap-1 p-1 rounded-xl w-fit" style={{ background: "rgba(255,255,255,.04)" }}>
          {(["all","pending","approved","rejected"] as const).map(f => (
            <button key={f} onClick={() => setFilter(f)}
              className="px-4 py-1.5 rounded-lg text-xs font-medium transition-all capitalize"
              style={filter === f ? { background: "rgba(0,212,168,.15)", color: "#00d4a8" } : { color: "#6b7280" }}>
              {f === "all" ? `All (${requests.length})` : f === "pending" ? `Pending (${pendingCount})` : f === "approved" ? `Approved (${requests.filter(r=>r.status==="approved").length})` : `Rejected (${requests.filter(r=>r.status==="rejected").length})`}
            </button>
          ))}
        </div>
        {pendingCount > 0 && (
          <div className="text-xs font-semibold px-3 py-1.5 rounded-xl"
            style={{ background: "rgba(251,191,36,.12)", color: "#fbbf24" }}>
            ⚡ {pendingCount} awaiting approval
          </div>
        )}
      </div>

      {filtered.length === 0 ? (
        <div className="text-center py-16 rounded-2xl" style={{ background: "rgba(255,255,255,.03)", border: "1px solid rgba(255,255,255,.06)" }}>
          <p className="text-4xl mb-3">{filter === "pending" ? "🎯" : "📬"}</p>
          <p className="text-gray-500 text-sm">
            {filter === "pending" ? "No pending requests — you're all caught up!" : `No ${filter} requests yet.`}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map(req => {
            const rc = RC[req.status];
            const isPending = req.status === "pending";
            const isWorking = acting === req.id;
            return (
              <div key={req.id} className="rounded-2xl p-5"
                style={{ background: "rgba(255,255,255,.03)", border: `1px solid ${isPending ? "rgba(251,191,36,.15)" : "rgba(255,255,255,.07)"}` }}>
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <span className="text-white font-semibold text-sm">{req.name || req.email.split("@")[0]}</span>
                      <Pill label={rc.label} bg={rc.bg} color={rc.color} />
                    </div>
                    <p className="text-gray-400 text-xs mb-2">{req.email}</p>
                    <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-500">
                      {req.restaurant_name && req.restaurant_name !== "Not specified" && (
                        <span>🍽️ {req.restaurant_name}</span>
                      )}
                      {req.locations && <span>📍 {req.locations} location{req.locations === "1" ? "" : "s"}</span>}
                      <span>🕐 {relativeTime(req.created_at)}</span>
                      {req.reviewed_at && <span>✓ reviewed {relativeTime(req.reviewed_at)}</span>}
                    </div>
                    {req.notes && (
                      <div className="mt-2 text-xs text-gray-500 italic">Note: {req.notes}</div>
                    )}
                    {req.invite_key && (
                      <div className="mt-2 flex items-center gap-2">
                        <span className="text-[10px] font-semibold text-teal-400 uppercase tracking-wider">Invite key:</span>
                        <code className="text-[10px] text-teal-300">{req.invite_key}</code>
                      </div>
                    )}
                  </div>
                  {isPending && (
                    <div className="flex gap-2 shrink-0">
                      <button
                        onClick={() => setNoteModal({ id: req.id, action: "reject" })}
                        disabled={isWorking}
                        className="px-3 py-1.5 rounded-lg text-xs font-semibold transition-all disabled:opacity-40"
                        style={{ background: "rgba(239,68,68,.1)", color: "#f87171", border: "1px solid rgba(239,68,68,.2)" }}>
                        Reject
                      </button>
                      <button
                        onClick={() => setNoteModal({ id: req.id, action: "approve" })}
                        disabled={isWorking}
                        className="px-4 py-1.5 rounded-lg text-xs font-bold transition-all disabled:opacity-40"
                        style={{ background: "linear-gradient(135deg,#00d4a8,#00b890)", color: "#030f0b" }}>
                        {isWorking ? "…" : "Approve ✉️"}
                      </button>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ─── Main Page ──────────────────────────────────────────────────────── */
export default function AdminPage() {
  const router = useRouter();
  const [clients, setClients] = useState<Client[]>([]);
  const [pipeline, setPipeline] = useState<Invite[]>([]);
  const [accessRequests, setAccessRequests] = useState<AccessRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [tab, setTab] = useState<"requests"|"clients"|"pipeline"|"funnel"|"billing">("requests");
  const [modal, setModal] = useState<{ email?: string; key?: string } | null>(null);

  async function load() {
    setLoading(true);
    try {
      const r = await fetch("/api/admin/clients");
      if (r.status === 403 || r.status === 401) {
        // Session expired or not an admin — redirect to login
        router.replace("/login?redirect=/admin/clients");
        return;
      }
      const d = await r.json();
      if (d.error) { setError(d.error); }
      else {
        setClients(d.clients ?? []);
        setPipeline(d.pipeline ?? []);
        setAccessRequests(d.accessRequests ?? []);
      }
    } catch { setError("Failed to load"); }
    setLoading(false);
  }
  useEffect(() => { load(); }, []);

  if (error === "Unauthorized") return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: "#060b18" }}>
      <div className="text-center">
        <div className="text-red-400 text-sm mb-3">Access denied. Admin only.</div>
        <button onClick={() => router.replace("/login?redirect=/admin/clients")}
          className="text-xs text-gray-500 hover:text-white underline">Sign in with an admin account</button>
      </div>
    </div>
  );

  /* KPI calculations */
  const atRiskCount = clients.filter(isAtRisk).length;
  const activeThisWeek = clients.filter(c => daysSince(c.last_sign_in) !== null && daysSince(c.last_sign_in)! <= 7).length;
  const newThisMonth  = clients.filter(c => daysSince(c.joined_at) !== null && daysSince(c.joined_at)! <= 30).length;
  const openInvites   = pipeline.filter(i => i.status === "pending").length;
  const pendingRequests = accessRequests.filter(r => r.status === "pending").length;

  const mrr = clients.reduce((sum, c) => sum + (c.subscription?.monthly_amount ?? 0), 0);

  const TABS = [
    { key: "requests", label: `Requests${pendingRequests > 0 ? ` 🔴${pendingRequests}` : " (0)"}` },
    { key: "clients",  label: `Clients (${clients.length})` },
    { key: "pipeline", label: `Pipeline (${pipeline.length})` },
    { key: "funnel",   label: "Funnel" },
    { key: "billing",  label: `Billing${mrr > 0 ? ` $${mrr}/mo` : ""}` },
  ] as const;

  return (
    <div className="min-h-screen py-10 px-4" style={{ background: "#060b18" }}>
      <div style={{ maxWidth: 960, margin: "0 auto" }}>

        {/* Invite Modal */}
        {modal && (
          <InviteModal
            defaultEmail={modal.email ?? ""}
            existingKey={modal.key}
            onClose={() => setModal(null)}
            onSent={load}
          />
        )}

        {/* Header */}
        <div className="flex items-start justify-between gap-4 mb-8">
          <div>
            <div className="text-xs text-gray-600 uppercase tracking-widest mb-1 font-medium">CashCall Admin</div>
            <h1 className="text-2xl font-bold text-white tracking-tight">Client Management</h1>
            <p className="text-sm text-gray-500 mt-1">All clients, invites, and conversion data in one place.</p>
          </div>
          <div className="flex gap-2 shrink-0">
            <button onClick={() => setModal({})}
              className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold transition-all"
              style={{ background: "linear-gradient(135deg,#c8921a,#e8b84b)", color: "#1a0d02" }}>
              ✉️ Send Invite
            </button>
            <Link href="/admin/invites"
              className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition-all"
              style={{ background: "rgba(0,212,168,.1)", color: "#00d4a8", border: "1px solid rgba(0,212,168,.2)" }}>
              + New Key
            </Link>
          </div>
        </div>

        {/* KPI Cards */}
        {!loading && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-8">
            {[
              { label: "Access Requests",  value: pendingRequests, color: pendingRequests > 0 ? "#fbbf24" : "#6b7280", sub: "pending approval", highlight: pendingRequests > 0 },
              { label: "Active Last 7d",  value: activeThisWeek, color: "#00d4a8", sub: `of ${clients.length} total`, highlight: false },
              { label: "Open Invites",    value: openInvites,    color: "#60a5fa", sub: "awaiting signup", highlight: false },
              { label: "At Risk",         value: atRiskCount,    color: atRiskCount > 0 ? "#f87171" : "#6b7280", sub: "14d+ no login", highlight: atRiskCount > 0 },
            ].map(k => (
              <div key={k.label} className="rounded-2xl p-4 flex flex-col justify-between"
                style={{ background: "rgba(255,255,255,.03)", border: `1px solid ${k.highlight ? "rgba(251,191,36,.2)" : "rgba(255,255,255,.07)"}` }}>
                <div className="text-3xl font-bold leading-none mb-2" style={{ color: k.color }}>{k.value}</div>
                <div>
                  <div className="text-xs font-semibold text-gray-300">{k.label}</div>
                  <div className="text-xs text-gray-600 mt-0.5">{k.sub}</div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Tabs */}
        <div className="flex gap-1 mb-6 p-1 rounded-xl w-fit" style={{ background: "rgba(255,255,255,.04)" }}>
          {TABS.map(t => (
            <button key={t.key} onClick={() => setTab(t.key)}
              className="px-5 py-2 rounded-lg text-sm font-medium transition-all"
              style={tab === t.key
                ? { background: "rgba(0,212,168,.15)", color: "#00d4a8" }
                : { color: "#6b7280" }}>
              {t.label}
            </button>
          ))}
        </div>

        {/* Tab content */}
        {loading ? (
          <div className="text-center py-24 text-gray-600 animate-pulse">Loading…</div>
        ) : tab === "requests" ? (
          <RequestsTab requests={accessRequests} onRefresh={load} />
        ) : tab === "clients" ? (
          <ClientsTab clients={clients} onInvite={email => setModal({ email })} />
        ) : tab === "pipeline" ? (
          <PipelineTab
            pipeline={pipeline}
            onInvite={(email, key) => setModal({ email, key })}
            onRefresh={load}
          />
        ) : tab === "billing" ? (
          <BillingTab clients={clients} onRefresh={load} />
        ) : (
          <FunnelTab clients={clients} pipeline={pipeline} />
        )}

      </div>
    </div>
  );
}
