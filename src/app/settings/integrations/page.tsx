"use client";

import { useEffect, useState, useMemo, useCallback } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { createClient } from "@/lib/supabase/client";
import { useAuthGuard } from "@/lib/useAuthGuard";

interface Location { id: string; name: string; code: string; state: string; }
interface PosConn {
  id: string; location_id: string; provider: string;
  merchant_id?: string; access_token?: string; environment: string;
  client_id?: string; api_token?: string; // legacy fallbacks
  oauth_access_token?: string; oauth_merchant_id?: string;
  last_synced?: string | null; sync_status?: string; sync_error?: string | null;
  needs_reconnect?: boolean; consecutive_errors?: number;
}
interface PayrollConn {
  id: string; location_id: string; provider: string;
  provider_name?: string; employee_count?: number;
  last_synced?: string | null; sync_error?: string | null; status?: string;
}
interface DeliveryConn {
  id?: string; location_id: string; provider: string;
  store_id?: string; last_synced?: string | null; sync_status?: string;
}
interface LaborSchedConn {
  id?: string; location_id: string; provider: string;
  location_code?: string; last_synced?: string | null; sync_status?: string; sync_error?: string | null;
}

const MANUAL_POS = [
  { key: "toast",      label: "Toast",      logo: "🍞" },
  { key: "revel",      label: "Revel",      logo: "🟣" },
  { key: "lightspeed", label: "Lightspeed", logo: "⚡" },
  { key: "spoton",     label: "SpotOn",     logo: "🎯" },
  { key: "other",      label: "Other POS",  logo: "📡" },
];

function IntegrationsContent() {
  const supabase = useMemo(() => createClient(), []);
  const { ready } = useAuthGuard();
  const searchParams = useSearchParams();
  const successParam = searchParams.get("success");
  const errorParam   = searchParams.get("error");
  const merchantParam = searchParams.get("merchant");

  const [locations, setLocations]         = useState<Location[]>([]);
  const [posConns, setPosConns]           = useState<PosConn[]>([]);
  const [payrollConns, setPayrollConns]   = useState<PayrollConn[]>([]);
  const [deliveryConns, setDeliveryConns] = useState<DeliveryConn[]>([]);
  const [laborSchedConns, setLaborSchedConns] = useState<LaborSchedConn[]>([]);
  const [syncing, setSyncing]             = useState<Record<string, boolean>>({});
  const [saving,  setSaving]              = useState<Record<string, boolean>>({});
  const [msg, setMsg]                     = useState<Record<string, string>>({});
  const [forms, setForms]                 = useState<Record<string, { merchant_id: string; access_token: string; environment: string; provider: string }>>({});
  const [delivForms, setDelivForms]       = useState<Record<string, { api_key: string; store_id: string; provider: string }>>({});
  const [delivManual, setDelivManual]     = useState<Record<string, { gross: string; commission_pct: string; month: string; tab: "manual" | "api" }>>({});
  const [delivMonthlySales, setDelivMonthlySales] = useState<Record<string, { gross_sales: number; commission_pct: number; net_sales: number; updated_at: string }>>({});
  const [laborForms, setLaborForms]       = useState<Record<string, { api_key: string; location_code: string }>>({});
  const [maghilForms, setMaghilForms]     = useState<Record<string, { store_id: string; api_key: string }>>({});
  const [banner, setBanner]               = useState<{ type: "ok" | "err"; text: string } | null>(null);

  // Handle success/error from OAuth callbacks
  useEffect(() => {
    if (successParam === "gusto")       setBanner({ type: "ok",  text: "✓ Gusto connected! Click 'Sync Now' to pull payroll data." });
    else if (successParam === "quickbooks") setBanner({ type: "ok", text: "✓ QuickBooks connected! Click 'Sync Now' to pull payroll data." });
    else if (successParam === "clover") setBanner({ type: "ok",  text: `✓ Clover connected${merchantParam ? ` (${decodeURIComponent(merchantParam)})` : ""}! Sales will sync nightly.` });
    else if (successParam === "square") setBanner({ type: "ok",  text: `✓ Square connected${merchantParam ? ` (${decodeURIComponent(merchantParam)})` : ""}! Sales will sync nightly.` });
    else if (errorParam === "clover_not_configured") setBanner({ type: "err", text: "✗ Clover isn't configured yet — contact support@cashcall.io to get it enabled for your account." });
    else if (errorParam === "square_not_configured") setBanner({ type: "err", text: "✗ Square isn't configured yet — contact support@cashcall.io to get it enabled for your account." });
    else if (errorParam)                setBanner({ type: "err", text: "✗ Connection error: " + decodeURIComponent(errorParam) });
  }, [successParam, errorParam, merchantParam]);

  const showMsg = (key: string, m: string) => {
    setMsg(p => ({ ...p, [key]: m }));
    setTimeout(() => setMsg(p => ({ ...p, [key]: "" })), 5000);
  };

  const loadData = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { data: locs } = await supabase.from("locations").select("id,name,code,state")
      .in("app", ["cashcall", "hbk"]).eq("user_id", user.id).order("name");
    setLocations(locs ?? []);
    const init: typeof forms = {};
    for (const l of (locs ?? [])) {
      init[l.id] = { merchant_id: "", access_token: "", environment: "production", provider: "toast" };
    }
    setForms(init);

    const { data: pc } = await supabase.from("pos_connections").select("*");
    setPosConns(pc ?? []);

    const { data: pay } = await supabase.from("payroll_connections").select("*");
    setPayrollConns(pay ?? []);

    const { data: deliv } = await supabase.from("delivery_connections").select("*");
    setDeliveryConns(deliv ?? []);

    // Load manual monthly delivery sales
    const { data: dms } = await supabase
      .from("delivery_monthly_sales")
      .select("location_id,provider,month,gross_sales,commission_pct,net_sales,updated_at")
      .order("month", { ascending: false });
    if (dms) {
      const dmsMap: typeof delivMonthlySales = {};
      for (const row of dms) {
        const curMonthStr = new Date().toISOString().slice(0, 7);
        if (row.month === curMonthStr) {
          dmsMap[`${row.location_id}_${row.provider}`] = {
            gross_sales: row.gross_sales,
            commission_pct: row.commission_pct,
            net_sales: row.net_sales,
            updated_at: row.updated_at,
          };
        }
      }
      setDelivMonthlySales(dmsMap);
    }

    const { data: labSched } = await supabase.from("labor_scheduler_connections").select("*");
    setLaborSchedConns(labSched ?? []);

    // Init delivery + labor forms
    const dInit: typeof delivForms = {};
    const lInit: typeof laborForms = {};
    const mInit: typeof maghilForms = {};
    for (const l of (locs ?? [])) {
      dInit[l.id + "_doordash"] = { api_key: "", store_id: "", provider: "doordash" };
      dInit[l.id + "_ubereats"] = { api_key: "", store_id: "", provider: "ubereats" };
      dInit[l.id + "_grubhub"]  = { api_key: "", store_id: "", provider: "grubhub"  };
      lInit[l.id] = { api_key: "", location_code: "" };
      mInit[l.id] = { store_id: "", api_key: "" };
    }
    setDelivForms(dInit);
    setLaborForms(lInit);
    setMaghilForms(mInit);

    // Pre-fill forms from saved manual connections
    setForms(prev => {
      const next = { ...prev };
      for (const c of (pc ?? [])) {
        if (c.provider !== "clover") {
          next[c.location_id] = {
            merchant_id: c.merchant_id ?? c.client_id ?? "",
            access_token: "••••••••",
            environment: c.environment ?? "production",
            provider: c.provider,
          };
        }
      }
      return next;
    });
  }, [supabase]);

  useEffect(() => { loadData(); }, [loadData]);

  const getPosConn    = (locId: string, prov: string) => posConns.find(c => c.location_id === locId && c.provider === prov);
  const getPayrollConn  = (locId: string, prov: string) => payrollConns.find(c => c.location_id === locId && c.provider === prov);
  const getDeliveryConn = (locId: string, prov: string) => deliveryConns.find(c => c.location_id === locId && c.provider === prov);
  const getLaborSched   = (locId: string) => laborSchedConns.find(c => c.location_id === locId && c.provider === "7shifts");

  async function saveDeliveryConn(locId: string, provider: string) {
    const key  = `${locId}_${provider}`;
    const form = delivForms[key];
    if (!form?.api_key?.trim() || !form?.store_id?.trim()) { showMsg(key, "⚠ API Key and Store ID required"); return; }
    setSaving(p => ({ ...p, [key]: true }));
    const res = await fetch("/api/delivery/connect", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ location_id: locId, provider, api_key: form.api_key, store_id: form.store_id }),
    });
    setSaving(p => ({ ...p, [key]: false }));
    if (!res.ok) { showMsg(key, "✗ Failed to save"); return; }
    showMsg(key, "✓ Saved! Syncing demo data…");
    // Load existing connections fresh
    const { data: deliv } = await supabase.from("delivery_connections").select("*");
    setDeliveryConns(deliv ?? []);
  }

  async function saveManualDelivery(locId: string, provider: string) {
    const key     = `${locId}_${provider}`;
    const curMonth = new Date().toISOString().slice(0, 7);
    const mKey    = `${locId}_${provider}_manual`;
    const form    = delivManual[mKey] ?? { gross: "", commission_pct: "27", month: curMonth, tab: "manual" as const };
    const gross   = parseFloat(form.gross);
    const commPct = parseFloat(form.commission_pct);
    if (!gross || isNaN(gross) || gross < 0) { showMsg(key, "⚠ Enter a valid gross sales amount"); return; }
    if (isNaN(commPct) || commPct < 0 || commPct > 100) { showMsg(key, "⚠ Enter a valid commission % (0–100)"); return; }
    setSaving(p => ({ ...p, [mKey]: true }));
    const res = await fetch("/api/delivery/manual", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        location_id: locId,
        provider,
        month: form.month || curMonth,
        gross_sales: gross,
        commission_pct: commPct,
      }),
    });
    setSaving(p => ({ ...p, [mKey]: false }));
    const json = await res.json() as { ok?: boolean; net_sales?: number; error?: string };
    if (!json.ok) { showMsg(key, `✗ ${json.error ?? "Save failed"}`); return; }
    const net = json.net_sales ?? 0;
    showMsg(key, `✓ Saved — Net: $${net.toLocaleString("en-US", { minimumFractionDigits: 2 })}`);
    // Update local state immediately
    setDelivMonthlySales(p => ({
      ...p,
      [`${locId}_${provider}`]: {
        gross_sales: gross,
        commission_pct: commPct,
        net_sales: net,
        updated_at: new Date().toISOString(),
      },
    }));
  }

  async function syncDelivery(locId: string, provider: string) {
    const key = `${locId}_${provider}_sync`;
    setSyncing(p => ({ ...p, [key]: true }));
    const end = new Date().toISOString().slice(0, 10);
    const start = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
    const res = await fetch(`/api/delivery/${provider}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ location_id: locId, start_date: start, end_date: end }),
    });
    setSyncing(p => ({ ...p, [key]: false }));
    const json = await res.json() as { days_synced?: number; demo?: boolean; error?: string };
    showMsg(`${locId}_${provider}`, json.error ? `✗ ${json.error}` : `✓ ${json.days_synced} days synced${json.demo ? " (demo)" : ""}`);
  }

  async function saveLaborConn(locId: string) {
    const form = laborForms[locId];
    if (!form?.api_key?.trim() || !form?.location_code?.trim()) { showMsg(locId + "_7shifts", "⚠ API Key and Location ID required"); return; }
    setSaving(p => ({ ...p, [locId + "_7shifts"]: true }));
    const res = await fetch("/api/labor/connect", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ location_id: locId, provider: "7shifts", api_key: form.api_key, location_code: form.location_code }),
    });
    setSaving(p => ({ ...p, [locId + "_7shifts"]: false }));
    if (!res.ok) { showMsg(locId + "_7shifts", "✗ Failed to save"); return; }
    showMsg(locId + "_7shifts", "✓ Saved!");
    const { data: labSched } = await supabase.from("labor_scheduler_connections").select("*");
    setLaborSchedConns(labSched ?? []);
  }

  async function sync7Shifts(locId: string) {
    const key = locId + "_7shifts_sync";
    setSyncing(p => ({ ...p, [key]: true }));
    const end   = new Date().toISOString().slice(0, 10);
    const start = new Date(Date.now() - 14 * 86400000).toISOString().slice(0, 10);
    const res = await fetch("/api/labor/sevenShifts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ location_id: locId, start_date: start, end_date: end }),
    });
    setSyncing(p => ({ ...p, [key]: false }));
    const json = await res.json() as { totalActualHours?: number; demo?: boolean; error?: string };
    showMsg(locId + "_7shifts", json.error ? `✗ ${json.error}` : `✓ ${json.totalActualHours?.toFixed(0)} actual hours synced${json.demo ? " (demo)" : ""}`);
  }
  const setField = (locId: string, field: string, value: string) =>
    setForms(p => ({ ...p, [locId]: { ...p[locId], [field]: value } }));

  // Maghil POS — API key save
  const saveMaghilConn = async (locId: string) => {
    const f = maghilForms[locId];
    if (!f?.store_id?.trim()) { showMsg(locId + "_maghil", "⚠ Store ID required"); return; }
    if (!f?.api_key?.trim())  { showMsg(locId + "_maghil", "⚠ API Key required");  return; }
    setSaving(p => ({ ...p, [locId + "_maghil"]: true }));
    const res = await fetch("/api/pos/maghil/connect", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ location_id: locId, store_id: f.store_id.trim(), api_key: f.api_key.trim() }),
    });
    setSaving(p => ({ ...p, [locId + "_maghil"]: false }));
    const json = await res.json() as { ok?: boolean; error?: string };
    if (!json.ok) { showMsg(locId + "_maghil", `✗ ${json.error ?? "Save failed"}`); return; }
    showMsg(locId + "_maghil", "✓ Connected!");
    loadData();
  };

  // Manual save for Toast/Square
  const handleManualSave = async (locId: string) => {
    const f = forms[locId];
    if (!f?.merchant_id.trim()) { showMsg(locId + "_pos", "⚠ ID is required"); return; }
    if (!f.access_token.trim() || f.access_token === "••••••••") { showMsg(locId + "_pos", "⚠ Enter your API token"); return; }
    setSaving(p => ({ ...p, [locId]: true }));
    const { error } = await supabase.from("pos_connections").upsert({
      location_id: locId, provider: f.provider,
      merchant_id: f.merchant_id.trim(), access_token: f.access_token.trim(),
      environment: f.environment, updated_at: new Date().toISOString(),
    }, { onConflict: "location_id,provider" });
    setSaving(p => ({ ...p, [locId]: false }));
    if (error) { showMsg(locId + "_pos", "✗ " + error.message); return; }
    showMsg(locId + "_pos", "✓ Connected!");
    loadData();
  };

  // POS sync
  const handlePosSync = async (locId: string, provider: string) => {
    const key = locId + "_" + provider;
    setSyncing(p => ({ ...p, [key]: true }));
    showMsg(key, "⏳ Syncing last 7 days…");
    try {
      const res = await fetch(`/api/pos/${provider}/sync?location_id=${locId}&days=7`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Sync failed");
      showMsg(key, `✓ Synced ${json.rows_upserted ?? 0} day(s) of sales`);
      loadData();
    } catch (e) {
      showMsg(key, "✗ " + (e instanceof Error ? e.message : "Sync failed"));
    } finally {
      setSyncing(p => ({ ...p, [key]: false }));
    }
  };

  // Clover demo sync — generates realistic data for client presentations
  const handleDemoSync = async (locId: string) => {
    const key = locId + "_clover_demo";
    setSyncing(p => ({ ...p, [key]: true }));
    showMsg(locId + "_clover", "⏳ Pulling from Clover sandbox…");
    try {
      const res = await fetch("/api/pos/clover/demo-sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ location_id: locId, days: 7 }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Demo sync failed");
      showMsg(locId + "_clover", json.message ?? `✓ Synced ${json.days_synced} days — $${json.total_sales?.toLocaleString()} total`);
      loadData();
    } catch (e) {
      showMsg(locId + "_clover", "✗ " + (e instanceof Error ? e.message : "Demo sync failed"));
    } finally {
      setSyncing(p => ({ ...p, [key]: false }));
    }
  };

  // Payroll sync
  const handlePayrollSync = async (locId: string, provider: string) => {
    const key = locId + "_pay_" + provider;
    setSyncing(p => ({ ...p, [key]: true }));
    showMsg(key, "⏳ Pulling payroll data…");
    try {
      const res = await fetch(`/api/payroll/${provider}/sync`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ location_id: locId, months_back: 3 }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Sync failed");
      showMsg(key, `✓ ${json.message ?? `Synced ${json.synced} payroll records`}`);
      loadData();
    } catch (e) {
      showMsg(key, "✗ " + (e instanceof Error ? e.message : "Sync failed"));
    } finally {
      setSyncing(p => ({ ...p, [key]: false }));
    }
  };

  if (!ready) return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#060b18" }}>
      <div style={{ width: 32, height: 32, border: "2px solid #00d4a8", borderTopColor: "transparent", borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );

  return (
    <div style={{ minHeight: "100vh", background: "#060b18", color: "rgba(255,255,255,0.85)" }}>
      {/* Nav */}
      <nav style={{
        background: "rgba(6,11,24,0.95)", backdropFilter: "blur(12px)",
        borderBottom: "1px solid rgba(255,255,255,0.08)",
        padding: "0 20px", height: 56,
        display: "flex", alignItems: "center", gap: 12,
        position: "sticky", top: 0, zIndex: 10,
      }}>
        <Link href="/dashboard" style={{ color: "#00d4a8", textDecoration: "none", fontSize: 13, fontWeight: 600 }}>← Dashboard</Link>
        <span style={{ color: "rgba(255,255,255,0.2)" }}>/</span>
        <span style={{ fontWeight: 700, fontSize: 14, color: "#fff" }}>Integrations</span>
        <span style={{
          marginLeft: 6, fontSize: 11, background: "rgba(0,212,168,0.15)",
          color: "#00d4a8", padding: "2px 10px", borderRadius: 20, fontWeight: 600,
        }}>POS · Payroll · Delivery · Scheduling</span>
      </nav>

      <main style={{ maxWidth: 900, margin: "0 auto", padding: "32px 20px 80px", display: "flex", flexDirection: "column", gap: 40 }}>

        {/* OAuth result banner */}
        {banner && (
          <div className={`rounded-xl px-4 py-3 text-sm font-medium ${
            banner.type === "ok"
              ? "bg-green-50 text-green-800 border border-green-200"
              : "bg-red-50 text-red-800 border border-red-200"
          }`}>
            {banner.text}
            <button onClick={() => setBanner(null)} className="ml-3 opacity-60 hover:opacity-100">×</button>
          </div>
        )}

        {/* ── POS Section ─────────────────────────────────────────────────────── */}
        <section>
          <div className="rounded-2xl p-6 mb-4" style={{ background: "linear-gradient(135deg,#060b18,#0d1f3c)" }}>
            <h2 className="text-lg font-bold text-white mb-1">Point-of-Sale</h2>
            <p className="text-gray-400 text-sm">Connect your POS and sales sync automatically — cash, card, delivery apps, all mapped.</p>
          </div>

          <div className="grid gap-4">
            {locations.map(loc => {
              const cloverConn = getPosConn(loc.id, "clover");
              const cloverKey  = loc.id + "_clover";
              const squareConn = getPosConn(loc.id, "square");
              const squareKey  = loc.id + "_square";

              return (
                <div key={loc.id} className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
                  <div className="px-6 py-3 border-b border-gray-100 bg-gray-50 flex items-center justify-between">
                    <span className="font-semibold text-sm text-gray-800">{loc.name}</span>
                    <span className="text-xs text-gray-400">{loc.code} · {loc.state}</span>
                  </div>

                  <div className="px-6 py-5 grid gap-4" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))" }}>

                    {/* Clover — OAuth */}
                    <div className="rounded-xl border p-4 space-y-3" style={{ borderColor: cloverConn ? "#bbf7d0" : "#e5e7eb", background: cloverConn ? "#f0fdf4" : "white" }}>
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="text-xl">🍀</span>
                          <span className="font-semibold text-sm text-gray-800">Clover</span>
                        </div>
                        {cloverConn
                          ? <span className="text-xs font-medium text-green-700 bg-green-100 px-2 py-0.5 rounded-full">Connected</span>
                          : <span className="text-xs text-gray-400">OAuth</span>
                        }
                      </div>
                      {cloverConn ? (
                        <>
                          <p className="text-[11px] text-gray-500">
                            Merchant: <code className="text-gray-700">{cloverConn.oauth_merchant_id || cloverConn.merchant_id || cloverConn.client_id || "—"}</code>
                          </p>
                          {cloverConn.needs_reconnect && (
                            <div className="mt-1 mb-1 flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-[11px] font-semibold"
                              style={{ background: "#fef2f2", color: "#b91c1c", border: "1px solid #fca5a5" }}>
                              ⚠️ Token expired — click <strong>Reconnect</strong> to restore nightly syncs
                            </div>
                          )}
                          {cloverConn.last_synced && (
                            <p className="text-[11px] text-gray-400">
                              Last sync: {new Date(cloverConn.last_synced).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                            </p>
                          )}
                          <div className="flex gap-2 flex-wrap">
                            <button onClick={() => handlePosSync(loc.id, "clover")} disabled={syncing[cloverKey]}
                              className="flex-1 px-3 py-1.5 rounded-lg text-xs font-semibold disabled:opacity-50 transition"
                              style={{ background: "#dcfce7", color: "#15803d" }}>
                              {syncing[cloverKey] ? "⏳ Syncing…" : "🔄 Sync 7 Days"}
                            </button>
                            <button onClick={() => handleDemoSync(loc.id)} disabled={syncing[loc.id + "_clover_demo"]}
                              title="Pull live data from Clover sandbox — use during client demos"
                              className="px-3 py-1.5 rounded-lg text-xs font-semibold disabled:opacity-50 transition"
                              style={{ background: "#fef3c7", color: "#92400e" }}>
                              {syncing[loc.id + "_clover_demo"] ? "⏳" : "🎬 Live Demo"}
                            </button>
                            <a href={`/api/pos/clover/connect?location_id=${loc.id}`}
                              className="px-3 py-1.5 rounded-lg text-xs font-semibold text-gray-500 bg-gray-100 hover:bg-gray-200 transition">
                              Reconnect
                            </a>
                          </div>
                          {msg[cloverKey] && (
                            <p className={`text-[11px] font-medium ${msg[cloverKey].startsWith("✓") ? "text-green-600" : msg[cloverKey].startsWith("⏳") ? "text-blue-500" : "text-red-500"}`}>
                              {msg[cloverKey]}
                            </p>
                          )}
                        </>
                      ) : (
                        <>
                          <p className="text-[11px] text-gray-400">One-click OAuth — no credentials to copy-paste</p>
                          <a href={`/api/pos/clover/connect?location_id=${loc.id}`}
                            className="block w-full text-center px-3 py-2 rounded-lg text-xs font-bold text-white transition"
                            style={{ background: "#1a1a2e" }}>
                            Connect Clover →
                          </a>
                        </>
                      )}
                    </div>

                    {/* Square — OAuth */}
                    <div className="rounded-xl border p-4 space-y-3" style={{ borderColor: squareConn ? "#bbf7d0" : "#e5e7eb", background: squareConn ? "#f0fdf4" : "white" }}>
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="text-xl">◼</span>
                          <span className="font-semibold text-sm text-gray-800">Square</span>
                        </div>
                        {squareConn
                          ? <span className="text-xs font-medium text-green-700 bg-green-100 px-2 py-0.5 rounded-full">Connected</span>
                          : <span className="text-xs text-gray-400">OAuth</span>
                        }
                      </div>
                      {squareConn ? (
                        <>
                          <p className="text-[11px] text-gray-500">
                            Merchant: <code className="text-gray-700">{squareConn.oauth_merchant_id || squareConn.merchant_id || squareConn.client_id || "—"}</code>
                          </p>
                          {squareConn.last_synced && (
                            <p className="text-[11px] text-gray-400">
                              Last sync: {new Date(squareConn.last_synced).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                            </p>
                          )}
                          <div className="flex gap-2 flex-wrap">
                            <button onClick={() => handlePosSync(loc.id, "square")} disabled={syncing[squareKey]}
                              className="flex-1 px-3 py-1.5 rounded-lg text-xs font-semibold disabled:opacity-50 transition"
                              style={{ background: "#dcfce7", color: "#15803d" }}>
                              {syncing[squareKey] ? "⏳ Syncing…" : "🔄 Sync 7 Days"}
                            </button>
                            <a href={`/api/pos/square/connect?location_id=${loc.id}`}
                              className="px-3 py-1.5 rounded-lg text-xs font-semibold text-gray-500 bg-gray-100 hover:bg-gray-200 transition">
                              Reconnect
                            </a>
                          </div>
                          {msg[squareKey] && (
                            <p className={`text-[11px] font-medium ${msg[squareKey].startsWith("✓") ? "text-green-600" : msg[squareKey].startsWith("⏳") ? "text-blue-500" : "text-red-500"}`}>
                              {msg[squareKey]}
                            </p>
                          )}
                        </>
                      ) : (
                        <>
                          <p className="text-[11px] text-gray-400">One-click OAuth — no credentials to copy-paste</p>
                          <a href={`/api/pos/square/connect?location_id=${loc.id}`}
                            className="block w-full text-center px-3 py-2 rounded-lg text-xs font-bold text-white transition"
                            style={{ background: "#006aff" }}>
                            Connect Square →
                          </a>
                        </>
                      )}
                    </div>

                    {/* Maghil — API key */}
                    {(() => {
                      const maghilConn = getPosConn(loc.id, "maghil");
                      const maghilKey  = loc.id + "_maghil";
                      const mf = maghilForms[loc.id] ?? { store_id: "", api_key: "" };
                      return (
                        <div className="rounded-xl border p-4 space-y-3" style={{ borderColor: maghilConn ? "#bbf7d0" : "#e5e7eb", background: maghilConn ? "#f0fdf4" : "white" }}>
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <span className="text-xl">🧾</span>
                              <span className="font-semibold text-sm text-gray-800">Maghil POS</span>
                            </div>
                            {maghilConn
                              ? <span className="text-xs font-medium text-green-700 bg-green-100 px-2 py-0.5 rounded-full">Connected</span>
                              : <span className="text-xs text-gray-400">API key</span>
                            }
                          </div>
                          {maghilConn ? (
                            <>
                              <p className="text-[11px] text-gray-500">
                                Store ID: <code className="text-gray-700">{maghilConn.merchant_id || "—"}</code>
                              </p>
                              {maghilConn.last_synced && (
                                <p className="text-[11px] text-gray-400">
                                  Last sync: {new Date(maghilConn.last_synced).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                                </p>
                              )}
                              <div className="flex gap-2 flex-wrap">
                                <button onClick={() => handlePosSync(loc.id, "maghil")} disabled={syncing[maghilKey]}
                                  className="flex-1 px-3 py-1.5 rounded-lg text-xs font-semibold disabled:opacity-50 transition"
                                  style={{ background: "#dcfce7", color: "#15803d" }}>
                                  {syncing[maghilKey] ? "⏳ Syncing…" : "🔄 Sync 7 Days"}
                                </button>
                              </div>
                              {msg[maghilKey] && (
                                <p className={`text-[11px] font-medium ${msg[maghilKey].startsWith("✓") ? "text-green-600" : msg[maghilKey].startsWith("⏳") ? "text-blue-500" : "text-red-500"}`}>
                                  {msg[maghilKey]}
                                </p>
                              )}
                            </>
                          ) : (
                            <>
                              <input type="text"
                                value={mf.store_id}
                                onChange={e => setMaghilForms(p => ({ ...p, [loc.id]: { ...p[loc.id], store_id: e.target.value } }))}
                                placeholder="Store ID (e.g. 5445456760)"
                                className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-amber-300" />
                              <input type="password"
                                value={mf.api_key}
                                onChange={e => setMaghilForms(p => ({ ...p, [loc.id]: { ...p[loc.id], api_key: e.target.value } }))}
                                placeholder="API Key"
                                className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-amber-300" />
                              <button
                                onClick={() => saveMaghilConn(loc.id)}
                                disabled={saving[loc.id + "_maghil"]}
                                className="w-full px-3 py-2 rounded-lg text-xs font-bold text-white disabled:opacity-50 transition"
                                style={{ background: "#060b18" }}>
                                {saving[loc.id + "_maghil"] ? "Connecting…" : "Connect Maghil →"}
                              </button>
                              {msg[maghilKey] && (
                                <p className={`text-[11px] font-medium ${msg[maghilKey].startsWith("✓") ? "text-green-600" : "text-red-500"}`}>
                                  {msg[maghilKey]}
                                </p>
                              )}
                            </>
                          )}
                        </div>
                      );
                    })()}

                    {/* Toast & other manual POS */}
                    {MANUAL_POS.map(p => {
                      const conn = getPosConn(loc.id, p.key);
                      const f    = forms[loc.id] ?? { merchant_id: "", access_token: "", environment: "production", provider: p.key };
                      const isActive = f.provider === p.key || (!f.provider && p.key === "toast");
                      const syncKey = loc.id + "_" + p.key;

                      return (
                        <div key={p.key} className="rounded-xl border p-4 space-y-3" style={{ borderColor: conn ? "#bbf7d0" : "#e5e7eb", background: conn ? "#f0fdf4" : "white" }}>
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <span className="text-xl">{p.logo}</span>
                              <span className="font-semibold text-sm text-gray-800">{p.label}</span>
                            </div>
                            {conn
                              ? <span className="text-xs font-medium text-green-700 bg-green-100 px-2 py-0.5 rounded-full">Connected</span>
                              : <span className="text-xs text-gray-400">API key</span>
                            }
                          </div>
                          <input type="text"
                            value={(forms[loc.id]?.provider === p.key || !forms[loc.id]?.provider) ? forms[loc.id]?.merchant_id ?? "" : ""}
                            onChange={e => { setField(loc.id, "provider", p.key); setField(loc.id, "merchant_id", e.target.value); }}
                            placeholder={p.key === "toast" ? "Restaurant GUID" : "Location ID"}
                            className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-amber-300" />
                          <input type="password"
                            value={(forms[loc.id]?.provider === p.key || !forms[loc.id]?.provider) ? forms[loc.id]?.access_token ?? "" : ""}
                            onChange={e => { setField(loc.id, "provider", p.key); setField(loc.id, "access_token", e.target.value); }}
                            onFocus={e => { if (e.target.value === "••••••••") { setField(loc.id, "provider", p.key); setField(loc.id, "access_token", ""); }}}
                            placeholder="API Token"
                            className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-amber-300" />
                          <div className="flex gap-2">
                            <button onClick={() => { setField(loc.id, "provider", p.key); handleManualSave(loc.id); }}
                              disabled={saving[loc.id]}
                              className="flex-1 px-3 py-1.5 rounded-lg text-xs font-semibold text-white disabled:opacity-50"
                              style={{ background: "#060b18" }}>
                              {saving[loc.id] ? "Saving…" : conn ? "Update" : "Connect"}
                            </button>
                            {conn && (
                              <button onClick={() => handlePosSync(loc.id, p.key)} disabled={syncing[syncKey]}
                                className="px-3 py-1.5 rounded-lg text-xs font-semibold disabled:opacity-50"
                                style={{ background: "#dcfce7", color: "#15803d" }}>
                                {syncing[syncKey] ? "⏳" : "🔄"}
                              </button>
                            )}
                          </div>
                          {msg[syncKey] && (
                            <p className={`text-[11px] font-medium ${msg[syncKey].startsWith("✓") ? "text-green-600" : "text-red-500"}`}>{msg[syncKey]}</p>
                          )}
                          {msg[loc.id + "_pos"] && forms[loc.id]?.provider === p.key && (
                            <p className={`text-[11px] font-medium ${msg[loc.id + "_pos"].startsWith("✓") ? "text-green-600" : "text-red-500"}`}>{msg[loc.id + "_pos"]}</p>
                          )}
                        </div>
                      );
                    })}

                  </div>
                </div>
              );
            })}
          </div>
        </section>

        {/* ── Payroll Section ──────────────────────────────────────────────────── */}
        <section>
          <div className="rounded-2xl p-6 mb-4" style={{ background: "linear-gradient(135deg,#0f172a,#1e3a5f)" }}>
            <h2 className="text-lg font-bold text-white mb-1">Payroll</h2>
            <p className="text-gray-400 text-sm">Connect your payroll provider and labor costs auto-populate — no more manual entry each pay period.</p>
          </div>

          <div className="grid gap-4">
            {locations.map(loc => {
              const gustoConn = getPayrollConn(loc.id, "gusto");
              const qbConn    = getPayrollConn(loc.id, "quickbooks");

              return (
                <div key={loc.id} className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
                  <div className="px-6 py-3 border-b border-gray-100 bg-gray-50 flex items-center justify-between">
                    <span className="font-semibold text-sm text-gray-800">{loc.name}</span>
                    <span className="text-xs text-gray-400">{loc.code} · {loc.state}</span>
                  </div>

                  <div className="px-6 py-5 grid gap-5 sm:grid-cols-2">

                    {/* Gusto */}
                    {(() => {
                      const conn  = gustoConn;
                      const key   = loc.id + "_pay_gusto";
                      return (
                        <div className="rounded-xl border p-4 space-y-3" style={{ borderColor: conn ? "#bbf7d0" : "#e5e7eb", background: conn ? "#f0fdf4" : "white" }}>
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <span className="text-xl">🌿</span>
                              <div>
                                <p className="font-semibold text-sm text-gray-800">Gusto</p>
                                <p className="text-[10px] text-gray-400">Full payroll sync via OAuth</p>
                              </div>
                            </div>
                            {conn
                              ? <span className="text-xs font-medium text-green-700 bg-green-100 px-2 py-0.5 rounded-full">Connected</span>
                              : <span className="text-xs text-gray-400">OAuth</span>
                            }
                          </div>
                          {conn ? (
                            <>
                              <p className="text-[11px] text-gray-600 font-medium">{conn.provider_name}</p>
                              {conn.employee_count != null && (
                                <p className="text-[11px] text-gray-400">{conn.employee_count} employees</p>
                              )}
                              {conn.last_synced && (
                                <p className="text-[11px] text-gray-400">
                                  Last sync: {new Date(conn.last_synced).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                                </p>
                              )}
                              {conn.sync_error && (
                                <p className="text-[11px] text-red-500">⚠ {conn.sync_error.slice(0, 60)}</p>
                              )}
                              <div className="flex gap-2 flex-wrap">
                                <button onClick={() => handlePayrollSync(loc.id, "gusto")} disabled={syncing[key]}
                                  className="flex-1 px-3 py-2 rounded-lg text-xs font-bold disabled:opacity-50 transition"
                                  style={{ background: "#dcfce7", color: "#15803d" }}>
                                  {syncing[key] ? "⏳ Pulling…" : "🔄 Sync Payroll"}
                                </button>
                                <a href={`/api/payroll/gusto/connect?location_id=${loc.id}`}
                                  className="px-3 py-2 rounded-lg text-xs font-semibold text-gray-500 bg-gray-100 hover:bg-gray-200 transition">
                                  Reconnect
                                </a>
                              </div>
                              {msg[key] && (
                                <p className={`text-[11px] font-medium ${msg[key].startsWith("✓") ? "text-green-600" : msg[key].startsWith("⏳") ? "text-blue-500" : "text-red-500"}`}>{msg[key]}</p>
                              )}
                            </>
                          ) : (
                            <>
                              <ul className="text-[11px] text-gray-400 space-y-0.5">
                                <li>✓ Pulls processed payroll runs</li>
                                <li>✓ Auto-populates labor cost in P&amp;L</li>
                                <li>✓ Refreshes token automatically</li>
                              </ul>
                              <a href={`/api/payroll/gusto/connect?location_id=${loc.id}`}
                                className="block w-full text-center px-3 py-2 rounded-lg text-xs font-bold text-white transition"
                                style={{ background: "#1a1a2e" }}>
                                Connect Gusto →
                              </a>
                            </>
                          )}
                        </div>
                      );
                    })()}

                    {/* QuickBooks */}
                    {(() => {
                      const conn = qbConn;
                      const key  = loc.id + "_pay_quickbooks";
                      return (
                        <div className="rounded-xl border p-4 space-y-3" style={{ borderColor: conn ? "#bbf7d0" : "#e5e7eb", background: conn ? "#f0fdf4" : "white" }}>
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <span className="text-xl">📊</span>
                              <div>
                                <p className="font-semibold text-sm text-gray-800">QuickBooks</p>
                                <p className="text-[10px] text-gray-400">Payroll journal entries via OAuth</p>
                              </div>
                            </div>
                            {conn
                              ? <span className="text-xs font-medium text-green-700 bg-green-100 px-2 py-0.5 rounded-full">Connected</span>
                              : <span className="text-xs text-gray-400">OAuth</span>
                            }
                          </div>
                          {conn ? (
                            <>
                              <p className="text-[11px] text-gray-600 font-medium">{conn.provider_name}</p>
                              {conn.last_synced && (
                                <p className="text-[11px] text-gray-400">
                                  Last sync: {new Date(conn.last_synced).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                                </p>
                              )}
                              {conn.sync_error && (
                                <p className="text-[11px] text-red-500">⚠ {conn.sync_error.slice(0, 60)}</p>
                              )}
                              <div className="flex gap-2 flex-wrap">
                                <button onClick={() => handlePayrollSync(loc.id, "quickbooks")} disabled={syncing[key]}
                                  className="flex-1 px-3 py-2 rounded-lg text-xs font-bold disabled:opacity-50 transition"
                                  style={{ background: "#dcfce7", color: "#15803d" }}>
                                  {syncing[key] ? "⏳ Pulling…" : "🔄 Sync Payroll"}
                                </button>
                                <a href={`/api/payroll/quickbooks/connect?location_id=${loc.id}`}
                                  className="px-3 py-2 rounded-lg text-xs font-semibold text-gray-500 bg-gray-100 hover:bg-gray-200 transition">
                                  Reconnect
                                </a>
                              </div>
                              {msg[key] && (
                                <p className={`text-[11px] font-medium ${msg[key].startsWith("✓") ? "text-green-600" : msg[key].startsWith("⏳") ? "text-blue-500" : "text-red-500"}`}>{msg[key]}</p>
                              )}
                            </>
                          ) : (
                            <>
                              <ul className="text-[11px] text-gray-400 space-y-0.5">
                                <li>✓ Reads payroll journal entries</li>
                                <li>✓ Maps wage accounts to labor cost</li>
                                <li>✓ 90-day history on first sync</li>
                              </ul>
                              <a href={`/api/payroll/quickbooks/connect?location_id=${loc.id}`}
                                className="block w-full text-center px-3 py-2 rounded-lg text-xs font-bold text-white transition"
                                style={{ background: "#1a1a2e" }}>
                                Connect QuickBooks →
                              </a>
                            </>
                          )}
                        </div>
                      );
                    })()}

                  </div>
                </div>
              );
            })}
          </div>
        </section>

        {/* ── Delivery Platforms Section ───────────────────────────────────────── */}
        <section>
          <div className="rounded-2xl p-6 mb-4" style={{ background: "linear-gradient(135deg,#0d1a2e,#1a0d2e)" }}>
            <h2 className="text-lg font-bold text-white mb-1">🛵 Delivery Platforms</h2>
            <p className="text-gray-400 text-sm">Pull DoorDash, Uber Eats, and Grubhub orders directly into your P&amp;L — gross sales, commissions, and net automatically calculated.</p>
          </div>
          <div className="grid gap-4">
            {locations.map(loc => (
              <div key={loc.id} className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
                <div className="px-6 py-3 border-b border-gray-100 bg-gray-50 flex items-center justify-between">
                  <span className="font-semibold text-sm text-gray-800">{loc.name}</span>
                  <span className="text-xs text-gray-400">{loc.code}</span>
                </div>
                <div className="px-6 py-5 grid gap-4" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))" }}>
                  {[
                    { provider: "doordash",  label: "DoorDash",  emoji: "🔴", color: "#ef4444", bg: "#fef2f2", brd: "#fecaca", defComm: "25" },
                    { provider: "ubereats",  label: "Uber Eats", emoji: "🟢", color: "#16a34a", bg: "#f0fdf4", brd: "#bbf7d0", defComm: "30" },
                    { provider: "grubhub",   label: "Grubhub",   emoji: "🟠", color: "#f97316", bg: "#fff7ed", brd: "#fed7aa", defComm: "15" },
                  ].map(({ provider, label, emoji, color, bg, brd, defComm }) => {
                    const conn = getDeliveryConn(loc.id, provider);
                    const fKey = `${loc.id}_${provider}`;
                    const mKey = `${loc.id}_${provider}_manual`;
                    const curMonth = new Date().toISOString().slice(0, 7);
                    const manForm = delivManual[mKey] ?? { gross: "", commission_pct: defComm, month: curMonth, tab: "manual" as const };
                    const saved = delivMonthlySales[`${loc.id}_${provider}`];
                    const activeTab = manForm.tab ?? "manual";
                    const hasData = !!saved;
                    return (
                      <div key={provider} className="rounded-xl border p-4 space-y-3"
                        style={{ borderColor: hasData ? brd : conn?.store_id ? brd : "#e5e7eb", background: hasData ? bg : conn?.store_id ? bg : "white" }}>
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <span className="text-lg">{emoji}</span>
                            <div>
                              <p className="font-semibold text-sm text-gray-800">{label}</p>
                              <p className="text-[10px] text-gray-400">Net = Gross − Commission</p>
                            </div>
                          </div>
                          {hasData
                            ? <span className="text-[10px] font-medium px-2 py-0.5 rounded-full" style={{ background: bg, color }}>✓ This Month</span>
                            : conn?.store_id
                              ? <span className="text-[10px] font-medium px-2 py-0.5 rounded-full" style={{ background: bg, color }}>API</span>
                              : null}
                        </div>

                        {/* Tab switcher */}
                        <div className="flex rounded-lg overflow-hidden border border-gray-200 text-[10px] font-semibold">
                          <button
                            onClick={() => setDelivManual(p => ({ ...p, [mKey]: { ...manForm, tab: "manual" } }))}
                            className="flex-1 py-1 transition"
                            style={{ background: activeTab === "manual" ? "#f8fafc" : "white", color: activeTab === "manual" ? "#111" : "#9ca3af", borderRight: "1px solid #e5e7eb" }}>
                            ✏️ Manual Entry
                          </button>
                          <button
                            onClick={() => setDelivManual(p => ({ ...p, [mKey]: { ...manForm, tab: "api" } }))}
                            className="flex-1 py-1 transition"
                            style={{ background: activeTab === "api" ? "#f8fafc" : "white", color: activeTab === "api" ? "#111" : "#9ca3af" }}>
                            🔗 API Connect
                          </button>
                        </div>

                        {activeTab === "manual" ? (
                          <>
                            {hasData && (
                              <div className="rounded-lg p-2 space-y-0.5" style={{ background: bg }}>
                                <p className="text-[11px] font-semibold text-gray-700">This month ({curMonth})</p>
                                <p className="text-[11px] text-gray-500">Gross: <span className="font-medium text-gray-800">${saved.gross_sales.toLocaleString("en-US",{minimumFractionDigits:2})}</span> · Commission: {saved.commission_pct}% · Net: <span className="font-bold" style={{ color }}>${saved.net_sales.toLocaleString("en-US",{minimumFractionDigits:2})}</span></p>
                              </div>
                            )}
                            <div className="grid grid-cols-2 gap-2">
                              <div>
                                <label className="text-[10px] text-gray-500 font-medium block mb-1">Gross Sales ($)</label>
                                <input
                                  type="number" min="0" step="0.01"
                                  placeholder="e.g. 4200"
                                  value={manForm.gross}
                                  onChange={e => setDelivManual(p => ({ ...p, [mKey]: { ...manForm, gross: e.target.value } }))}
                                  className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-blue-300"
                                />
                              </div>
                              <div>
                                <label className="text-[10px] text-gray-500 font-medium block mb-1">Commission %</label>
                                <input
                                  type="number" min="0" max="100" step="0.5"
                                  placeholder={defComm}
                                  value={manForm.commission_pct}
                                  onChange={e => setDelivManual(p => ({ ...p, [mKey]: { ...manForm, commission_pct: e.target.value } }))}
                                  className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-blue-300"
                                />
                              </div>
                            </div>
                            {manForm.gross && !isNaN(parseFloat(manForm.gross)) && (
                              <p className="text-[11px] text-gray-500">
                                Net: <span className="font-bold" style={{ color }}>
                                  ${(parseFloat(manForm.gross) * (1 - parseFloat(manForm.commission_pct || "0") / 100)).toLocaleString("en-US",{minimumFractionDigits:2})}
                                </span>
                              </p>
                            )}
                            <button
                              onClick={() => saveManualDelivery(loc.id, provider)}
                              disabled={saving[mKey]}
                              className="w-full px-3 py-1.5 rounded-lg text-xs font-bold text-white disabled:opacity-50 transition"
                              style={{ background: color }}>
                              {saving[mKey] ? "Saving…" : `Save ${label} Sales →`}
                            </button>
                            {msg[fKey] && <p className={`text-[11px] font-medium ${msg[fKey].startsWith("✓") ? "text-green-600" : "text-red-500"}`}>{msg[fKey]}</p>}
                          </>
                        ) : (
                          <>
                            {conn?.store_id ? (
                              <>
                                <p className="text-[11px] text-gray-500">Store ID: {conn.store_id}</p>
                                {conn.last_synced && <p className="text-[11px] text-gray-400">Last sync: {new Date(conn.last_synced).toLocaleDateString()}</p>}
                                <button onClick={() => syncDelivery(loc.id, provider)}
                                  disabled={syncing[`${loc.id}_${provider}_sync`]}
                                  className="w-full px-3 py-1.5 rounded-lg text-xs font-bold text-white disabled:opacity-50 transition"
                                  style={{ background: color }}>
                                  {syncing[`${loc.id}_${provider}_sync`] ? "⏳ Syncing…" : "🔄 Sync Last 30 Days"}
                                </button>
                              </>
                            ) : (
                              <>
                                <input
                                  type="password"
                                  placeholder={`${label} API Key`}
                                  value={delivForms[fKey]?.api_key ?? ""}
                                  onChange={e => setDelivForms(p => ({ ...p, [fKey]: { ...p[fKey], api_key: e.target.value, store_id: p[fKey]?.store_id ?? "", provider } }))}
                                  className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-xs focus:outline-none"
                                />
                                <input
                                  type="text"
                                  placeholder="Store / Restaurant ID"
                                  value={delivForms[fKey]?.store_id ?? ""}
                                  onChange={e => setDelivForms(p => ({ ...p, [fKey]: { ...p[fKey], store_id: e.target.value, api_key: p[fKey]?.api_key ?? "", provider } }))}
                                  className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-xs focus:outline-none"
                                />
                                <button
                                  onClick={() => saveDeliveryConn(loc.id, provider)}
                                  disabled={saving[fKey]}
                                  className="w-full px-3 py-1.5 rounded-lg text-xs font-bold text-white disabled:opacity-50 transition"
                                  style={{ background: color }}>
                                  {saving[fKey] ? "Saving…" : `Connect ${label} API →`}
                                </button>
                              </>
                            )}
                            {msg[fKey] && <p className={`text-[11px] font-medium ${msg[fKey].startsWith("✓") ? "text-green-600" : "text-red-500"}`}>{msg[fKey]}</p>}
                          </>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* ── 7shifts Labor Scheduler Section ─────────────────────────────────── */}
        <section>
          <div className="rounded-2xl p-6 mb-4" style={{ background: "linear-gradient(135deg,#0d1f1a,#1a2e1a)" }}>
            <h2 className="text-lg font-bold text-white mb-1">📅 Labor Scheduler — 7shifts</h2>
            <p className="text-gray-400 text-sm">Pull scheduled vs actual hours by role (FOH/BOH). Know your labor cost variance during the week — not after payroll runs.</p>
          </div>
          <div className="grid gap-4">
            {locations.map(loc => {
              const conn = getLaborSched(loc.id);
              const form = laborForms[loc.id] ?? { api_key: "", location_code: "" };
              const msgKey = loc.id + "_7shifts";
              return (
                <div key={loc.id} className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
                  <div className="px-6 py-3 border-b border-gray-100 bg-gray-50 flex items-center justify-between">
                    <span className="font-semibold text-sm text-gray-800">{loc.name}</span>
                    {conn?.location_code
                      ? <span className="text-xs font-medium text-teal-700 bg-teal-50 px-2 py-0.5 rounded-full">Connected</span>
                      : <span className="text-xs text-gray-400">API Key</span>}
                  </div>
                  <div className="px-6 py-5">
                    {conn?.location_code ? (
                      <div className="space-y-3">
                        <div className="flex gap-4 text-sm">
                          <div className="bg-teal-50 rounded-lg px-4 py-2">
                            <p className="text-xs text-gray-500">Location ID</p>
                            <p className="font-semibold text-gray-800">{conn.location_code}</p>
                          </div>
                          {conn.last_synced && (
                            <div className="bg-gray-50 rounded-lg px-4 py-2">
                              <p className="text-xs text-gray-500">Last Sync</p>
                              <p className="font-semibold text-gray-800">{new Date(conn.last_synced).toLocaleDateString()}</p>
                            </div>
                          )}
                        </div>
                        {conn.sync_error && <p className="text-xs text-red-500">⚠ {conn.sync_error.slice(0, 80)}</p>}
                        <div className="flex gap-3">
                          <button onClick={() => sync7Shifts(loc.id)} disabled={syncing[loc.id + "_7shifts_sync"]}
                            className="px-4 py-2 rounded-lg text-xs font-bold text-white bg-teal-600 hover:bg-teal-700 disabled:opacity-50 transition">
                            {syncing[loc.id + "_7shifts_sync"] ? "⏳ Syncing…" : "🔄 Sync Last 2 Weeks"}
                          </button>
                          <button onClick={async () => {
                            await fetch("/api/labor/connect", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ location_id: loc.id, provider: "7shifts" }) });
                            const { data } = await supabase.from("labor_scheduler_connections").select("*");
                            setLaborSchedConns(data ?? []);
                          }} className="px-3 py-2 rounded-lg text-xs text-gray-500 bg-gray-100 hover:bg-gray-200 transition">
                            Disconnect
                          </button>
                        </div>
                        {msg[msgKey] && <p className={`text-xs font-medium ${msg[msgKey].startsWith("✓") ? "text-teal-600" : "text-red-500"}`}>{msg[msgKey]}</p>}
                      </div>
                    ) : (
                      <div className="grid sm:grid-cols-2 gap-4">
                        <div className="space-y-3">
                          <div>
                            <label className="text-xs text-gray-500 font-medium">7shifts API Key</label>
                            <input type="password" placeholder="eyJ..." value={form.api_key}
                              onChange={e => setLaborForms(p => ({ ...p, [loc.id]: { ...p[loc.id], api_key: e.target.value } }))}
                              className="mt-1 w-full border border-gray-200 rounded-lg px-3 py-2 text-xs focus:outline-none focus:ring-1 focus:ring-teal-500"
                            />
                          </div>
                          <div>
                            <label className="text-xs text-gray-500 font-medium">Location ID <span className="text-gray-400">(from 7shifts Settings)</span></label>
                            <input type="text" placeholder="12345" value={form.location_code}
                              onChange={e => setLaborForms(p => ({ ...p, [loc.id]: { ...p[loc.id], location_code: e.target.value } }))}
                              className="mt-1 w-full border border-gray-200 rounded-lg px-3 py-2 text-xs focus:outline-none focus:ring-1 focus:ring-teal-500"
                            />
                          </div>
                          <button onClick={() => saveLaborConn(loc.id)} disabled={saving[msgKey]}
                            className="w-full px-3 py-2 rounded-lg text-xs font-bold text-white bg-teal-600 hover:bg-teal-700 disabled:opacity-50 transition">
                            {saving[msgKey] ? "Saving…" : "Connect 7shifts →"}
                          </button>
                          {msg[msgKey] && <p className="text-xs text-red-500">{msg[msgKey]}</p>}
                        </div>
                        <div className="bg-teal-50 rounded-xl p-4 space-y-2 text-xs text-teal-800">
                          <p className="font-semibold">What you get:</p>
                          <ul className="space-y-1">
                            <li>✓ Scheduled vs actual hours by day</li>
                            <li>✓ FOH vs BOH labor breakdown</li>
                            <li>✓ Overtime risk alerts mid-week</li>
                            <li>✓ Labor cost projection before payroll</li>
                          </ul>
                          <a href="https://support.7shifts.com/article/122-api-access" target="_blank" rel="noreferrer"
                            className="block mt-2 text-teal-600 underline">
                            Get your 7shifts API key →
                          </a>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        {/* ── Email Invoice Forwarding Section ─────────────────────────────────── */}
        <section>
          <div className="rounded-2xl p-6 mb-4" style={{ background: "linear-gradient(135deg,#1a0d1a,#1a1a0d)" }}>
            <h2 className="text-lg font-bold text-white mb-1">📧 Email Invoice Forwarding</h2>
            <p className="text-gray-400 text-sm">Forward any invoice email directly to your unique CashCall address — no scanning, no uploading. Claude reads it automatically.</p>
          </div>
          <div className="grid gap-4">
            {locations.map(loc => {
              const slug = `loc-${loc.code?.toLowerCase() ?? loc.id.slice(0, 6)}-${loc.id.slice(-4)}`;
              const emailAddr = `${slug}@invoices.cashcall.io`;
              return (
                <div key={loc.id} className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
                  <div className="px-6 py-3 border-b border-gray-100 bg-gray-50 flex items-center justify-between">
                    <span className="font-semibold text-sm text-gray-800">{loc.name}</span>
                    <span className="text-xs text-gray-400">Unique Invoice Email</span>
                  </div>
                  <div className="px-6 py-5 space-y-4">
                    <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-start gap-3">
                      <span className="text-2xl mt-0.5">📬</span>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs text-amber-700 font-semibold mb-1">Your unique invoice address</p>
                        <code className="block text-sm font-mono text-amber-900 bg-amber-100 px-3 py-1.5 rounded-lg break-all">{emailAddr}</code>
                        <button
                          onClick={() => { navigator.clipboard.writeText(emailAddr); showMsg(loc.id + "_email", "✓ Copied to clipboard!"); }}
                          className="mt-2 text-xs text-amber-700 underline hover:text-amber-900">
                          Copy address
                        </button>
                        {msg[loc.id + "_email"] && <p className="text-xs text-green-600 mt-1">{msg[loc.id + "_email"]}</p>}
                      </div>
                    </div>
                    <div className="grid sm:grid-cols-3 gap-3 text-center">
                      {[
                        { step: "1", label: "Get invoice email from Sysco, vendor, etc." },
                        { step: "2", label: "Forward it to your unique CashCall address" },
                        { step: "3", label: "Claude reads & categorizes it automatically" },
                      ].map(({ step, label }) => (
                        <div key={step} className="bg-gray-50 rounded-lg p-3">
                          <div className="w-6 h-6 bg-gray-200 rounded-full text-xs font-bold text-gray-600 mx-auto mb-2 flex items-center justify-center">{step}</div>
                          <p className="text-xs text-gray-600">{label}</p>
                        </div>
                      ))}
                    </div>
                    <p className="text-xs text-gray-400">
                      Works with Sysco, US Foods, Restaurant Depot, and any vendor that emails invoices as PDF attachments.
                      No setup required — just start forwarding.
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        {/* Sync log */}
        <SyncLog supabase={supabase} locations={locations} />
      </main>
    </div>
  );
}

function SyncLog({ supabase, locations }: { supabase: ReturnType<typeof createClient>; locations: Location[] }) {
  const [log, setLog] = useState<{ id: string; location_id: string; sync_date: string; rows_upserted: number; error: string | null; synced_at: string }[]>([]);

  useEffect(() => {
    supabase.from("pos_sync_log").select("*").order("synced_at", { ascending: false }).limit(20)
      .then(({ data }) => setLog(data ?? []));
  }, []);

  if (!log.length) return null;

  return (
    <div className="bg-[#0d1117] rounded-2xl border border-white/10 overflow-hidden">
      <div className="px-5 py-3 border-b border-white/10">
        <h3 className="text-sm font-semibold text-white">Recent POS Sync History</h3>
      </div>
      <table className="w-full text-xs">
        <thead className="border-b border-white/10">
          <tr>
            {["Location", "Synced At", "Sales Date", "Rows", "Status"].map(h => (
              <th key={h} className="text-left px-4 py-2 text-gray-400 font-semibold">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-white/5">
          {log.map(row => {
            const loc = locations.find(l => l.id === row.location_id);
            return (
              <tr key={row.id} className="hover:bg-white/5">
                <td className="px-4 py-2 font-medium text-white">{loc?.name ?? "—"}</td>
                <td className="px-4 py-2 text-gray-400">{new Date(row.synced_at).toLocaleString()}</td>
                <td className="px-4 py-2 text-gray-300">{row.sync_date}</td>
                <td className="px-4 py-2 tabular-nums text-gray-300">{row.rows_upserted}</td>
                <td className="px-4 py-2">
                  {row.error
                    ? <span className="text-red-400">✗ {row.error.slice(0, 60)}</span>
                    : <span className="text-emerald-400">✓ OK</span>}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export default function IntegrationsPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="w-8 h-8 border-2 border-amber-400 border-t-transparent rounded-full animate-spin" />
      </div>
    }>
      <IntegrationsContent />
    </Suspense>
  );
}
