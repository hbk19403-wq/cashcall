"use client";
import { useEffect, useRef, useState, useCallback } from "react";

const TEAL = "#00d4a8";
const DURATION = 120;

interface Scene {
  id: string; start: number; end: number;
  icon: string; label: string;
  title: string; subtitle: string;
  screen: string;
  narration: string; caption: string;
  accentColor: string;
}

const SCENES: Scene[] = [
  {
    id: "hook", start: 0, end: 18, icon: "😤", label: "The Reality",
    title: "You're running your restaurant blind — and it's costing thousands every month.",
    subtitle: "Paper invoices. Delayed P&L. Vendor price hikes you never catch.",
    screen: "hook", accentColor: "#ef4444",
    narration: "If you've spent years running restaurants like we have, you already know the brutal truth: you're operating blind. Paper invoices pile up. Your P&L arrives 45 days late. You don't know your exact food cost until it's already too late — and every day that passes, profit quietly leaks out the back door.",
    caption: "Restaurant owners lose thousands monthly from invisible financial friction.",
  },
  {
    id: "foodcost", start: 18, end: 38, icon: "🥩", label: "Food Cost Blindness",
    title: "You think food cost is 28%. It's actually 34%. That's $4,200 leaking every month.",
    subtitle: "Vendors raise commodity prices silently. You sign invoices without catching it.",
    screen: "foodcost", accentColor: "#f97316",
    narration: "Here's what most restaurant owners don't realize: your vendors are quietly raising commodity prices every single week. Chicken, beef, salmon, produce. You think your food cost is twenty-eight percent. It's actually thirty-four. That six-percent gap is four thousand dollars a month walking out your door.",
    caption: "Vendor price creep is invisible without line-item commodity tracking.",
  },
  {
    id: "invoices", start: 38, end: 58, icon: "🧾", label: "The Manual Pain",
    title: "50+ invoices a month. Manual entry. Payroll 4 days late. Reconciliation takes hours.",
    subtitle: "One typo throws off your entire food cost report. You find out about labor spikes on Monday — the week is already over.",
    screen: "invoices", accentColor: "#dc2626",
    narration: "Every week your team manually keys in fifty or more vendor invoices. One typo — one missed line item — and your entire food cost report is wrong. Meanwhile, payroll data arrives days after your pay period closes. You're reconciling labor from memory. The math never adds up because the data never arrives on time.",
    caption: "Manual invoice entry + delayed payroll = reconciliation nightmares.",
  },
  {
    id: "solution", start: 58, end: 80, icon: "⚡", label: "How It Works",
    title: "Snap a photo. Sync your POS. ADP imports automatically. Zero manual entry — ever.",
    subtitle: "CashCall's AI reads every invoice line item, flags price changes, and pulls payroll and sales automatically.",
    screen: "solution", accentColor: TEAL,
    narration: "CashCall eliminates manual entry entirely. Snap a photo of any vendor invoice — our AI reads every line item, every commodity, every price, and flags any price change from the previous delivery. Your ADP payroll journals auto-import every pay period. And whether you run Clover, Toast, Square, or any POS — your daily sales sync automatically. No spreadsheets. No manual keying. Zero guesswork.",
    caption: "OCR + ADP payroll + any POS = fully automated financial data pipeline.",
  },
  {
    id: "command", start: 80, end: 104, icon: "📊", label: "Financial Command",
    title: "Every morning: food cost to the penny, labor %, net margin — without lifting a finger.",
    subtitle: "Daily. Weekly. Monthly. Quarterly. Prime cost. Vendor price alerts. Full financial clarity on one screen.",
    screen: "command", accentColor: TEAL,
    narration: "Every morning when you open CashCall, you see exactly what happened yesterday. Your net sales, food cost to the penny, labor cost, net margin, and your complete prime cost — food plus labor — against your targets. Drill into weekly trends, monthly performance, and quarterly comparisons. See exactly where you're ahead, and exactly where you're bleeding.",
    caption: "Daily P&L + prime cost + vendor intelligence — complete financial clarity.",
  },
  {
    id: "cta", start: 104, end: 120, icon: "🚀", label: "Take Control",
    title: "Stop guessing. Start commanding your margins with total precision.",
    subtitle: "Test our live guest sandbox before you commit to anything. No credit card. No obligation.",
    screen: "cta", accentColor: TEAL,
    narration: "Built by restaurateurs who lived these exact problems. CashCall gives you the financial command center your operation has always needed. Test-drive it yourself in our live guest sandbox before ever committing. Stop fighting your numbers. Start mastering them. Visit cashcall.io today.",
    caption: "cashcall.io — Guest sandbox live now. No commitment required.",
  },
];

/* ── Scene screens ── */

function HookScreen({ pct }: { pct: number }) {
  const show = (t: number) => pct > t;
  return (
    <div className="absolute inset-0 flex" style={{ background: "#060b18" }}>
      {/* Left: The Problem */}
      <div className="w-1/2 flex flex-col justify-center px-8 py-6"
        style={{ borderRight: "1px solid rgba(239,68,68,0.2)" }}>
        <p className="text-xs font-bold uppercase tracking-widest mb-4" style={{ color: "#ef4444" }}>
          Without CashCall
        </p>
        {[
          { icon: "🗒", label: "Paper Invoices", val: "50+ / month", note: "Manually keyed" },
          { icon: "📉", label: "P&L Report", val: "45 days late", note: "Already irrelevant" },
          { icon: "🥩", label: "Food Cost", val: "~28%?", note: "Actually 34%" },
          { icon: "💸", label: "Monthly Leak", val: "$4,200+", note: "Undetected" },
        ].map((item, i) => (
          <div key={i} className="flex items-center gap-4 mb-3 p-3 rounded-xl transition-all duration-500"
            style={{
              background: "rgba(239,68,68,0.06)", border: "1px solid rgba(239,68,68,0.15)",
              opacity: show(i * 0.15) ? 1 : 0,
              transform: show(i * 0.15) ? "translateX(0)" : "translateX(-16px)",
            }}>
            <span className="text-2xl">{item.icon}</span>
            <div className="flex-1">
              <p className="text-sm font-semibold text-gray-300">{item.label}</p>
              <p className="text-xs text-gray-500">{item.note}</p>
            </div>
            <span className="text-base font-black" style={{ color: "#f87171" }}>{item.val}</span>
          </div>
        ))}
        <div className="mt-2 p-3 rounded-xl text-center" style={{
          opacity: show(0.72) ? 1 : 0, transition: "opacity 0.6s",
          background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.2)"
        }}>
          <p className="text-sm font-black" style={{ color: "#f87171" }}>Result: Flying blind every single day</p>
        </div>
      </div>

      {/* Divider arrow */}
      <div className="flex items-center justify-center w-12 flex-shrink-0">
        <span className="text-3xl font-bold" style={{ color: TEAL, opacity: show(0.5) ? 1 : 0, transition: "opacity 0.6s" }}>→</span>
      </div>

      {/* Right: With CashCall */}
      <div className="flex-1 flex flex-col justify-center px-8 py-6">
        <p className="text-xs font-bold uppercase tracking-widest mb-4" style={{ color: TEAL }}>With CashCall</p>
        {[
          { label: "Food Cost — Exact", val: "28.4% ✓", color: "#4ade80", t: 0.45 },
          { label: "Labor Cost", val: "30.1% ✓", color: "#4ade80", t: 0.55 },
          { label: "Prime Cost", val: "58.5% ✓", color: TEAL, t: 0.63 },
          { label: "Net Profit Today", val: "$1,847 ▲", color: "#22d3ee", t: 0.72 },
        ].map((k) => (
          <div key={k.label} className="flex justify-between items-center p-3 rounded-xl mb-3"
            style={{
              background: `${k.color}0d`, border: `1px solid ${k.color}28`,
              opacity: show(k.t) ? 1 : 0,
              transform: show(k.t) ? "translateX(0)" : "translateX(16px)",
              transition: "all 0.5s ease",
            }}>
            <p className="text-sm text-gray-400">{k.label}</p>
            <p className="text-lg font-black" style={{ color: k.color }}>{k.val}</p>
          </div>
        ))}
        <p className="text-sm font-bold mt-2 text-center" style={{ color: TEAL, opacity: show(0.88) ? 1 : 0, transition: "opacity 0.6s" }}>
          ⚡ Updated right now — always.
        </p>
      </div>
    </div>
  );
}

function FoodCostScreen({ pct }: { pct: number }) {
  const show = (t: number) => pct > t;
  return (
    <div className="absolute inset-0 flex flex-col justify-center px-8 py-4"
      style={{ background: "linear-gradient(135deg, #0d0500, #1a0a00)" }}>
      <div className="mb-4" style={{ opacity: show(0.0) ? 1 : 0, transition: "opacity 0.5s" }}>
        <p className="text-xs uppercase tracking-widest mb-1" style={{ color: "#f97316" }}>CashCall Vendor Intelligence</p>
        <p className="text-2xl font-black text-white">Commodity Price Spikes — Last 30 Days</p>
      </div>

      <div className="space-y-2 mb-4">
        {[
          { item: "Chicken Breast", vendor: "Sysco Foods", was: "$2.89/lb", now: "$3.41/lb", chg: "+18%", color: "#ef4444", t: 0.12 },
          { item: "Ground Beef", vendor: "US Foods", was: "$4.20/lb", now: "$4.70/lb", chg: "+12%", color: "#f97316", t: 0.24 },
          { item: "Atlantic Salmon", vendor: "Sysco Foods", was: "$9.80/lb", now: "$12.05/lb", chg: "+23%", color: "#ef4444", t: 0.36 },
          { item: "Roma Tomatoes", vendor: "FSA Produce", was: "$0.68/lb", now: "$0.82/lb", chg: "+21%", color: "#f97316", t: 0.48 },
        ].map((s) => (
          <div key={s.item} className="flex items-center gap-4 px-4 py-3 rounded-xl"
            style={{
              background: `${s.color}0d`, border: `1px solid ${s.color}2a`,
              opacity: show(s.t) ? 1 : 0, transform: show(s.t) ? "translateX(0)" : "translateX(24px)",
              transition: "all 0.5s ease",
            }}>
            <div className="flex-1">
              <p className="text-base font-bold text-white">{s.item}</p>
              <p className="text-xs text-gray-500">{s.vendor}</p>
            </div>
            <p className="text-sm text-gray-400 line-through w-20 text-right">{s.was}</p>
            <p className="text-base font-bold text-white w-24 text-right">{s.now}</p>
            <span className="text-base font-black px-3 py-1 rounded-lg w-20 text-center"
              style={{ background: `${s.color}1a`, color: s.color }}>{s.chg}</span>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-4" style={{ opacity: show(0.68) ? 1 : 0, transition: "opacity 0.7s" }}>
        <div className="p-4 rounded-xl text-center" style={{ background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.2)" }}>
          <p className="text-sm text-gray-400 mb-1">What you THINK food cost is</p>
          <p className="text-5xl font-black" style={{ color: "#f87171" }}>28%</p>
          <p className="text-sm mt-1" style={{ color: "#f87171" }}>❌ Based on old prices</p>
        </div>
        <div className="p-4 rounded-xl text-center" style={{ background: `${TEAL}0a`, border: `1px solid ${TEAL}28` }}>
          <p className="text-sm text-gray-400 mb-1">What CashCall shows — live</p>
          <p className="text-5xl font-black" style={{ color: TEAL }}>34.1%</p>
          <p className="text-sm mt-1" style={{ color: TEAL }}>✓ Exact, to the penny</p>
        </div>
      </div>
    </div>
  );
}

function InvoiceScreen({ pct }: { pct: number }) {
  const show = (t: number) => pct > t;
  return (
    <div className="absolute inset-0 flex gap-3 p-6"
      style={{ background: "linear-gradient(135deg, #0a0004, #180008)" }}>
      {/* Old Way */}
      <div className="w-1/2 flex flex-col">
        <p className="text-sm font-bold uppercase tracking-widest mb-3" style={{ color: "#dc2626" }}>❌ The Old Way</p>
        {[
          { icon: "📄", text: "Receive paper invoice from Sysco", time: "Mon 7am" },
          { icon: "⌨️", text: "Manually key 38 line items into spreadsheet", time: "Mon 9am" },
          { icon: "⚠️", text: "Typo: $184 entered as $1,840 — unnoticed", time: "All week" },
          { icon: "💼", text: "ADP payroll data arrives Friday", time: "4 days late" },
          { icon: "📊", text: "Monthly reconciliation takes 3 hours", time: "By then: too late" },
        ].map((step, i) => (
          <div key={i} className="flex items-start gap-3 p-3 rounded-xl mb-2"
            style={{
              background: "rgba(220,38,38,0.06)", border: "1px solid rgba(220,38,38,0.15)",
              opacity: show(i * 0.12) ? 1 : 0, transition: `opacity ${0.3 + i * 0.05}s ease`,
            }}>
            <span className="text-xl mt-0.5">{step.icon}</span>
            <div>
              <p className="text-sm text-gray-300">{step.text}</p>
              <p className="text-xs mt-0.5" style={{ color: "#f87171" }}>{step.time}</p>
            </div>
          </div>
        ))}
      </div>

      <div className="w-px self-stretch" style={{ background: "rgba(255,255,255,0.06)" }} />

      {/* CashCall Way */}
      <div className="flex-1 flex flex-col" style={{ opacity: show(0.38) ? 1 : 0, transition: "opacity 0.7s" }}>
        <p className="text-sm font-bold uppercase tracking-widest mb-3" style={{ color: TEAL }}>✓ CashCall Way</p>

        <div className="p-4 rounded-xl text-center mb-3"
          style={{ background: `${TEAL}0d`, border: `1px solid ${TEAL}30` }}>
          <span className="text-4xl">📷</span>
          <p className="text-base font-bold mt-2" style={{ color: TEAL }}>Snap invoice photo</p>
          <p className="text-sm text-gray-400">AI reads every line item instantly</p>
        </div>

        {[
          { icon: "🤖", label: "OCR extracts every line item", detail: "Vendor · SKU · Unit price · Qty", t: 0.42 },
          { icon: "⚡", label: "Price changes flagged instantly", detail: "Chicken ↑18% vs last delivery", t: 0.52 },
          { icon: "💼", label: "ADP payroll auto-imports", detail: "Every pay period — zero manual entry", t: 0.62 },
          { icon: "🏪", label: "Any POS syncs sales live", detail: "Clover · Toast · Square · Any POS", t: 0.72 },
        ].map((item) => (
          <div key={item.label} className="flex items-center gap-3 p-3 rounded-xl mb-2"
            style={{
              background: `${TEAL}08`, border: `1px solid ${TEAL}20`,
              opacity: show(item.t) ? 1 : 0, transition: "opacity 0.5s ease",
            }}>
            <span className="text-xl">{item.icon}</span>
            <div className="flex-1">
              <p className="text-sm font-semibold text-white">{item.label}</p>
              <p className="text-xs text-gray-400">{item.detail}</p>
            </div>
            <span className="text-xs font-black px-2 py-1 rounded-lg" style={{ background: `${TEAL}18`, color: TEAL }}>AUTO</span>
          </div>
        ))}

        <div className="p-3 rounded-xl text-center mt-auto"
          style={{ background: `${TEAL}12`, border: `1px solid ${TEAL}40`, opacity: show(0.86) ? 1 : 0, transition: "opacity 0.6s" }}>
          <p className="text-base font-black" style={{ color: TEAL }}>Zero manual entry. Ever.</p>
        </div>
      </div>
    </div>
  );
}

function SolutionScreen({ pct }: { pct: number }) {
  const show = (t: number) => pct > t;
  return (
    <div className="absolute inset-0 flex flex-col justify-center items-center px-8 py-6"
      style={{ background: "linear-gradient(135deg, #060b18, #041018)" }}>
      <div className="text-center mb-6" style={{ opacity: show(0.05) ? 1 : 0, transition: "opacity 0.6s" }}>
        <p className="text-4xl font-black tracking-tight" style={{ color: TEAL }}>cashcall</p>
        <p className="text-sm text-gray-400 mt-1">Built by restaurateurs — for restaurateurs</p>
      </div>

      {/* Pipeline */}
      <div className="flex items-center gap-2 mb-8 w-full justify-center">
        {[
          { icon: "📷", label: "Invoice OCR", sub: "Snap & extract", color: "#a78bfa", delay: 0.15 },
          { icon: "💼", label: "ADP Payroll", sub: "Auto-import", color: "#60a5fa", delay: 0.28 },
          { icon: "🏪", label: "Any POS", sub: "Clover · Toast · Square", color: "#34d399", delay: 0.41 },
          { icon: "⚡", label: "CashCall", sub: "Live · Encrypted", color: TEAL, delay: 0.54 },
        ].map((int, i) => (
          <div key={i} className="flex items-center">
            <div className="flex flex-col items-center text-center px-4 py-3 rounded-xl"
              style={{
                background: `${int.color}12`, border: `1px solid ${int.color}35`,
                minWidth: 110, opacity: show(int.delay) ? 1 : 0,
                transform: show(int.delay) ? "translateY(0)" : "translateY(12px)",
                transition: "all 0.5s ease",
              }}>
              <span className="text-3xl">{int.icon}</span>
              <p className="text-sm font-bold text-white mt-1">{int.label}</p>
              <p className="text-xs mt-0.5" style={{ color: int.color }}>{int.sub}</p>
            </div>
            {i < 3 && (
              <span className="text-xl mx-2" style={{ color: `${TEAL}60`, opacity: show(int.delay + 0.1) ? 1 : 0, transition: "opacity 0.4s" }}>→</span>
            )}
          </div>
        ))}
      </div>

      {/* Features */}
      <div className="grid grid-cols-3 gap-3 w-full" style={{ opacity: show(0.62) ? 1 : 0, transition: "opacity 0.7s" }}>
        {[
          { icon: "📊", title: "Real-Time P&L", desc: "Food cost to the penny, every day", color: TEAL },
          { icon: "🤖", title: "Invoice AI", desc: "OCR + commodity price alerts", color: "#a78bfa" },
          { icon: "👥", title: "Labor Tracking", desc: "ADP sync + daily labor %", color: "#60a5fa" },
          { icon: "🥩", title: "Vendor Intel", desc: "Price history & spike alerts", color: "#f97316" },
          { icon: "🏪", title: "POS Integration", desc: "Any POS, real-time sales", color: "#34d399" },
          { icon: "🔐", title: "AES-256 Encrypted", desc: "Zero-knowledge, client-side", color: "#6366f1" },
        ].map((m, i) => (
          <div key={i} className="rounded-xl p-3 text-center"
            style={{ background: `${m.color}09`, border: `1px solid ${m.color}25` }}>
            <span className="text-xl">{m.icon}</span>
            <p className="text-sm font-semibold text-white mt-1">{m.title}</p>
            <p className="text-xs text-gray-400 mt-0.5">{m.desc}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

function CommandScreen({ pct }: { pct: number }) {
  const show = (t: number) => pct > t;
  return (
    <div className="absolute inset-0 flex flex-col px-6 py-4"
      style={{ background: "linear-gradient(135deg, #060b18, #04121e)" }}>
      {/* Header */}
      <div className="flex items-center justify-between mb-4" style={{ opacity: show(0.05) ? 1 : 0, transition: "opacity 0.5s" }}>
        <div>
          <p className="text-xs uppercase tracking-widest" style={{ color: TEAL }}>CashCall — Financial Command</p>
          <p className="text-sm font-bold text-white">Thursday, Oct 23, 2026</p>
        </div>
        <div className="flex gap-2">
          {["Daily", "Weekly", "Monthly", "Quarterly"].map((tab, i) => (
            <span key={tab} className="text-xs px-3 py-1 rounded-lg font-semibold"
              style={i === 0 ? { background: TEAL, color: "#000" } : { background: "rgba(255,255,255,0.06)", color: "#666" }}>
              {tab}
            </span>
          ))}
        </div>
      </div>

      {/* KPI Row */}
      <div className="grid grid-cols-4 gap-3 mb-4">
        {[
          { label: "Net Sales", val: "$8,240", sub: "Today", color: TEAL, t: 0.15 },
          { label: "Food Cost", val: "$2,143", sub: "26.0% ✓", color: "#4ade80", t: 0.22 },
          { label: "Labor Cost", val: "$2,268", sub: "27.5% ✓", color: "#60a5fa", t: 0.29 },
          { label: "Net Margin", val: "$1,584", sub: "19.2% ▲", color: "#22d3ee", t: 0.36 },
        ].map((k) => (
          <div key={k.label} className="rounded-xl p-3 text-center"
            style={{
              background: `${k.color}0d`, border: `1px solid ${k.color}2a`,
              opacity: show(k.t) ? 1 : 0, transform: show(k.t) ? "translateY(0)" : "translateY(10px)",
              transition: "all 0.5s ease",
            }}>
            <p className="text-xs text-gray-400 mb-1">{k.label}</p>
            <p className="text-2xl font-black" style={{ color: k.color }}>{k.val}</p>
            <p className="text-xs mt-0.5" style={{ color: k.color }}>{k.sub}</p>
          </div>
        ))}
      </div>

      {/* Prime Cost */}
      <div className="rounded-xl p-4 mb-4"
        style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)", opacity: show(0.42) ? 1 : 0, transition: "opacity 0.7s" }}>
        <div className="flex items-center justify-between mb-3">
          <p className="text-sm font-bold text-white">Prime Cost Breakdown</p>
          <span className="text-xs px-3 py-1 rounded-lg font-bold" style={{ background: "#4ade8018", color: "#4ade80" }}>
            53.5% Prime Cost ✓ — Target &lt;55%
          </span>
        </div>
        <div className="flex gap-1 h-5 rounded-lg overflow-hidden mb-2">
          {[
            { pct: 0.26, color: "#4ade80" },
            { pct: 0.275, color: "#60a5fa" },
            { pct: 0.108, color: "#f97316" },
            { pct: 0.192, color: TEAL },
          ].map((b, i) => (
            <div key={i} className="h-full" style={{ width: `${b.pct * 100}%`, background: b.color }} />
          ))}
        </div>
        <div className="flex gap-4">
          {[
            { l: "Food 26.0%", c: "#4ade80" }, { l: "Labor 27.5%", c: "#60a5fa" },
            { l: "Fixed 10.8%", c: "#f97316" }, { l: "Net 19.2%", c: TEAL },
          ].map((b) => (
            <div key={b.l} className="flex items-center gap-1.5">
              <div className="w-2 h-2 rounded-full" style={{ background: b.c }} />
              <span className="text-xs text-gray-400">{b.l}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Bottom: vendor alerts + weekly */}
      <div className="grid grid-cols-2 gap-3" style={{ opacity: show(0.62) ? 1 : 0, transition: "opacity 0.7s" }}>
        <div className="rounded-xl p-4" style={{ background: "rgba(249,115,22,0.07)", border: "1px solid rgba(249,115,22,0.2)" }}>
          <p className="text-sm font-semibold text-orange-400 mb-3">⚠️ Vendor Price Alerts</p>
          {[
            { item: "Chicken Breast", vendor: "Sysco", chg: "+18%" },
            { item: "Atlantic Salmon", vendor: "Sysco", chg: "+23%" },
            { item: "Roma Tomatoes", vendor: "FSA", chg: "+21%" },
          ].map((a) => (
            <div key={a.item} className="flex justify-between items-center mb-2">
              <div>
                <p className="text-sm text-white font-medium">{a.item}</p>
                <p className="text-xs text-gray-500">{a.vendor}</p>
              </div>
              <span className="text-sm font-black" style={{ color: "#f87171" }}>{a.chg}</span>
            </div>
          ))}
        </div>
        <div className="rounded-xl p-4" style={{ background: `${TEAL}07`, border: `1px solid ${TEAL}25` }}>
          <p className="text-sm font-semibold mb-3" style={{ color: TEAL }}>📈 This Week</p>
          {[
            { label: "Gross Sales", val: "$51,480" },
            { label: "Avg Food Cost", val: "26.3%" },
            { label: "Avg Labor", val: "28.1%" },
            { label: "Net Profit", val: "$9,847" },
          ].map((r) => (
            <div key={r.label} className="flex justify-between items-center mb-2">
              <p className="text-xs text-gray-400">{r.label}</p>
              <p className="text-sm font-bold" style={{ color: TEAL }}>{r.val}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function CTAScreen({ pct }: { pct: number }) {
  const show = (t: number) => pct > t;
  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center text-center px-10"
      style={{ background: "radial-gradient(ellipse at 50% 40%, #051a15 0%, #030c10 60%, #060b18 100%)" }}>
      <div style={{ opacity: show(0.05) ? 1 : 0, transform: show(0.05) ? "scale(1)" : "scale(0.9)", transition: "all 0.7s ease" }}>
        <p className="text-6xl font-black tracking-tight" style={{ color: TEAL }}>cashcall.io</p>
        <p className="text-sm uppercase tracking-widest mt-2 text-gray-400">Financial Command Center for Restaurateurs</p>
      </div>

      <div className="mt-6 max-w-lg" style={{ opacity: show(0.2) ? 1 : 0, transition: "opacity 0.7s" }}>
        <p className="text-3xl font-black text-white leading-tight">Stop guessing your margins.</p>
        <p className="text-3xl font-black leading-tight" style={{ color: TEAL }}>Start commanding them — to the penny.</p>
      </div>

      <div className="grid grid-cols-4 gap-3 mt-6 w-full max-w-2xl" style={{ opacity: show(0.35) ? 1 : 0, transition: "opacity 0.7s" }}>
        {[
          { icon: "📷", text: "Snap invoices", sub: "AI reads everything" },
          { icon: "💼", text: "ADP imports", sub: "Zero payroll entry" },
          { icon: "🏪", text: "Any POS syncs", sub: "Clover·Toast·Square" },
          { icon: "📊", text: "Daily P&L live", sub: "Know by 8am" },
        ].map((f) => (
          <div key={f.text} className="rounded-xl p-4 text-center"
            style={{ background: `${TEAL}0a`, border: `1px solid ${TEAL}25` }}>
            <span className="text-3xl">{f.icon}</span>
            <p className="text-sm font-bold text-white mt-2">{f.text}</p>
            <p className="text-xs text-gray-400 mt-1">{f.sub}</p>
          </div>
        ))}
      </div>

      <div className="flex gap-4 mt-6" style={{ opacity: show(0.55) ? 1 : 0, transition: "opacity 0.7s" }}>
        <a href="/trial"
          className="flex items-center gap-2 px-8 py-3 rounded-xl text-base font-black"
          style={{ background: TEAL, color: "#000", textDecoration: "none" }}>
          📅 Schedule Live Demo
        </a>
        <a href="/sandbox"
          className="flex items-center gap-2 px-8 py-3 rounded-xl text-base font-bold"
          style={{ border: `2px solid ${TEAL}`, color: TEAL, textDecoration: "none" }}>
          🧪 Try Guest Sandbox
        </a>
      </div>

      <p className="text-xs text-gray-600 mt-4" style={{ opacity: show(0.72) ? 1 : 0, transition: "opacity 0.7s" }}>
        AES-256 zero-knowledge encryption · No commitment required · Built by restaurateurs
      </p>
    </div>
  );
}

/* ── Main Component ── */
export default function DemoVideo() {
  const [playing, setPlaying] = useState(false);
  const [time, setTime] = useState(0);
  const [audioOn, setAudioOn] = useState(true);
  const [fullscreen, setFullscreen] = useState(false);
  const [done, setDone] = useState(false);
  const [sceneKey, setSceneKey] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const prevSceneRef = useRef<string>("");
  const speechUnlockedRef = useRef(false);
  const audioOnRef = useRef(audioOn);
  audioOnRef.current = audioOn;

  const currentScene = SCENES.findLast((s) => time >= s.start) ?? SCENES[0];
  const scenePct = currentScene
    ? (time - currentScene.start) / (currentScene.end - currentScene.start)
    : 0;

  const pickVoice = useCallback((): SpeechSynthesisVoice | null => {
    if (typeof window === "undefined" || !window.speechSynthesis) return null;
    const voices = window.speechSynthesis.getVoices();
    return (
      voices.find((v) => v.name.includes("Daniel")) ??
      voices.find((v) => v.name.includes("Aaron")) ??
      voices.find((v) => v.name.includes("Samantha")) ??
      voices.find((v) => v.name.includes("Alex")) ??
      voices.find((v) => v.lang === "en-US" && v.localService) ??
      voices.find((v) => v.lang.startsWith("en")) ??
      null
    );
  }, []);

  // Call ONLY from inside a user gesture click handler to unlock speech
  const startSpeechGesture = useCallback((text: string) => {
    if (!audioOnRef.current || typeof window === "undefined" || !window.speechSynthesis) return;
    window.speechSynthesis.cancel();
    const utter = new SpeechSynthesisUtterance(text);
    utter.rate = 0.88; utter.pitch = 1.0; utter.volume = 1.0;
    const go = () => {
      const v = pickVoice();
      if (v) utter.voice = v;
      window.speechSynthesis.speak(utter);
      speechUnlockedRef.current = true;
    };
    const voices = window.speechSynthesis.getVoices();
    if (voices.length) go(); else { window.speechSynthesis.onvoiceschanged = go; }
  }, [pickVoice]);

  // Call from effects/timers — only works after speech is already unlocked by gesture
  const speakNarration = useCallback((text: string) => {
    if (!speechUnlockedRef.current || !audioOnRef.current) return;
    if (typeof window === "undefined" || !window.speechSynthesis) return;
    window.speechSynthesis.cancel();
    const utter = new SpeechSynthesisUtterance(text);
    utter.rate = 0.88; utter.pitch = 1.0; utter.volume = 1.0;
    const v = pickVoice();
    if (v) utter.voice = v;
    window.speechSynthesis.speak(utter);
  }, [pickVoice]);

  const stopSpeech = useCallback(() => {
    if (typeof window !== "undefined" && window.speechSynthesis) window.speechSynthesis.cancel();
  }, []);

  // Scene change effect — handles scenes 2-6 (scene 1 spoken in click handler)
  useEffect(() => {
    if (currentScene && currentScene.id !== prevSceneRef.current && prevSceneRef.current !== "") {
      prevSceneRef.current = currentScene.id;
      setSceneKey((k) => k + 1);
      if (playing) speakNarration(currentScene.narration);
    }
  }, [currentScene?.id, playing, speakNarration]);

  const toggleFullscreen = useCallback(() => {
    if (!document.fullscreenElement) containerRef.current?.requestFullscreen().catch(() => {});
    else document.exitFullscreen().catch(() => {});
  }, []);

  useEffect(() => {
    const onFs = () => setFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", onFs);
    return () => document.removeEventListener("fullscreenchange", onFs);
  }, []);

  // MUST be called in a user gesture — unlocks speech for the session
  const handlePlay = useCallback(() => {
    prevSceneRef.current = "hook";
    setSceneKey((k) => k + 1);
    startSpeechGesture(SCENES[0].narration);
    setPlaying(true);
  }, [startSpeechGesture]);

  const handleResume = useCallback(() => {
    // Speak current scene narration on resume (also a user gesture)
    if (speechUnlockedRef.current) speakNarration(currentScene.narration);
    setPlaying(true);
  }, [currentScene?.narration, speakNarration]);

  const restart = useCallback(() => {
    stopSpeech();
    speechUnlockedRef.current = false;
    setTime(0); setDone(false); prevSceneRef.current = "";
    setSceneKey((k) => k + 1);
    setTimeout(() => handlePlay(), 80);
  }, [stopSpeech, handlePlay]);

  useEffect(() => {
    if (playing && !done) {
      intervalRef.current = setInterval(() => {
        setTime((t) => {
          const next = parseFloat((t + 0.05).toFixed(2));
          if (next >= DURATION) { setDone(true); setPlaying(false); stopSpeech(); return DURATION; }
          return next;
        });
      }, 50);
    } else {
      if (intervalRef.current) clearInterval(intervalRef.current);
    }
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [playing, done, stopSpeech]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code === "Space") { e.preventDefault(); if (!playing) handleResume(); else setPlaying(false); }
      if (e.code === "KeyF") toggleFullscreen();
      if (e.code === "KeyM") setAudioOn((a) => { if (a) stopSpeech(); return !a; });
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [playing, handleResume, toggleFullscreen, stopSpeech]);

  const progress = time / DURATION;

  return (
    <div
      ref={containerRef}
      className="relative w-full overflow-hidden select-none"
      style={{
        background: "#060b18",
        borderRadius: fullscreen ? 0 : 16,
        aspectRatio: fullscreen ? "auto" : "16/9",
        height: fullscreen ? "100vh" : undefined,
        border: `1px solid ${TEAL}22`,
        boxShadow: `0 0 48px ${TEAL}18`,
        fontFamily: "'Inter', 'Segoe UI', system-ui, sans-serif",
      }}
    >
      {/* Scene */}
      <div key={sceneKey} className="absolute inset-0" style={{ animation: "fadeUp 0.4s ease forwards" }}>
        {currentScene.screen === "hook"     && <HookScreen pct={scenePct} />}
        {currentScene.screen === "foodcost" && <FoodCostScreen pct={scenePct} />}
        {currentScene.screen === "invoices" && <InvoiceScreen pct={scenePct} />}
        {currentScene.screen === "solution" && <SolutionScreen pct={scenePct} />}
        {currentScene.screen === "command"  && <CommandScreen pct={scenePct} />}
        {currentScene.screen === "cta"      && <CTAScreen pct={scenePct} />}
      </div>

      {/* Pause overlay */}
      {!playing && !done && time > 0 && (
        <div className="absolute inset-0 flex items-center justify-center"
          style={{ background: "rgba(6,11,24,0.6)", backdropFilter: "blur(3px)", zIndex: 20 }}>
          <button onClick={handleResume}
            className="flex items-center gap-2 px-6 py-3 rounded-full font-bold text-base cursor-pointer"
            style={{ background: TEAL, color: "#000", border: "none" }}>
            ▶ Resume
          </button>
        </div>
      )}

      {/* Replay overlay */}
      {done && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-4"
          style={{ background: "rgba(6,11,24,0.88)", backdropFilter: "blur(4px)", zIndex: 20 }}>
          <p className="text-2xl font-black" style={{ color: TEAL }}>cashcall.io</p>
          <p className="text-base text-gray-300">Ready to eliminate the guesswork?</p>
          <div className="flex gap-3 mt-2">
            <button onClick={restart}
              className="px-5 py-2 rounded-xl text-sm font-bold cursor-pointer"
              style={{ background: "rgba(255,255,255,0.08)", color: "#ccc", border: "1px solid rgba(255,255,255,0.12)" }}>
              ↺ Watch again
            </button>
            <a href="/sandbox" className="px-5 py-2 rounded-xl text-sm font-bold"
              style={{ background: TEAL, color: "#000", textDecoration: "none" }}>
              🧪 Guest Sandbox
            </a>
            <a href="/trial" className="px-5 py-2 rounded-xl text-sm font-bold"
              style={{ border: `1px solid ${TEAL}`, color: TEAL, textDecoration: "none" }}>
              Schedule Demo →
            </a>
          </div>
        </div>
      )}

      {/* Scene tab strip */}
      <div className="absolute top-0 left-0 right-0 flex items-center gap-1 px-3 pt-2" style={{ zIndex: 10 }}>
        {SCENES.map((s) => {
          const active = s.id === currentScene.id;
          const past = time > s.end;
          return (
            <button key={s.id}
              onClick={() => { setTime(s.start); setDone(false); prevSceneRef.current = ""; setSceneKey((k) => k + 1); if (!playing) setPlaying(true); }}
              className="flex items-center gap-1 px-2 py-1 rounded-lg text-xs transition-all duration-300 cursor-pointer"
              style={{
                background: active ? `${s.accentColor}20` : "rgba(255,255,255,0.03)",
                border: `1px solid ${active ? s.accentColor + "55" : "rgba(255,255,255,0.06)"}`,
                color: active ? s.accentColor : past ? "#444" : "#444",
                fontWeight: active ? 700 : 400,
              }}>
              {s.icon} <span className="hidden sm:inline">{s.label}</span>
            </button>
          );
        })}
      </div>

      {/* Bottom caption */}
      <div className="absolute left-0 right-0 text-center" style={{ bottom: 36, zIndex: 10 }}>
        <p className="text-xs text-gray-500 px-4" style={{ textShadow: "0 1px 8px rgba(0,0,0,0.9)" }}>
          {currentScene.caption}
        </p>
      </div>

      {/* Progress bar */}
      <div className="absolute bottom-0 left-0 right-0 h-1.5 flex" style={{ zIndex: 10 }}>
        {SCENES.map((s) => {
          const segStart = s.start / DURATION;
          const segEnd = s.end / DURATION;
          const fill = Math.max(0, Math.min(1, (progress - segStart) / (segEnd - segStart)));
          return (
            <div key={s.id} className="relative flex-shrink-0"
              style={{ width: `${(segEnd - segStart) * 100}%`, background: "rgba(255,255,255,0.06)", marginRight: 1 }}>
              <div className="absolute inset-y-0 left-0 transition-all duration-75"
                style={{ width: `${fill * 100}%`, background: s.accentColor }} />
            </div>
          );
        })}
      </div>

      {/* Controls */}
      <div className="absolute flex items-center gap-2 px-3 py-1" style={{ bottom: 6, left: 0, right: 0, zIndex: 10 }}>
        <button onClick={() => { if (done) restart(); else if (!playing) handleResume(); else setPlaying(false); }}
          className="w-6 h-6 rounded-full flex items-center justify-center cursor-pointer text-xs"
          style={{ background: `${TEAL}18`, border: `1px solid ${TEAL}35`, color: TEAL }}>
          {done ? "↺" : playing ? "⏸" : "▶"}
        </button>
        <span className="text-xs text-gray-600">{Math.floor(time)}s / {DURATION}s</span>
        <div className="flex-1" />
        <button onClick={() => setAudioOn((a) => { if (a) stopSpeech(); return !a; })}
          className="text-sm cursor-pointer" style={{ background: "none", border: "none", color: audioOn ? TEAL : "#444" }}>
          {audioOn ? "🔊" : "🔇"}
        </button>
        <button onClick={toggleFullscreen} className="text-sm cursor-pointer"
          style={{ background: "none", border: "none", color: "#555" }}>
          {fullscreen ? "⊡" : "⛶"}
        </button>
      </div>

      {/* Initial play button */}
      {!playing && time === 0 && (
        <div className="absolute inset-0 flex flex-col items-center justify-center" style={{ zIndex: 15 }}>
          <button onClick={handlePlay}
            className="flex items-center gap-3 px-10 py-4 rounded-2xl font-black text-lg cursor-pointer"
            style={{ background: TEAL, color: "#000", border: "none", boxShadow: `0 0 32px ${TEAL}55` }}>
            ▶ Watch Demo
          </button>
          <p className="text-xs text-gray-500 mt-3">2 min · Voice narration · Fullscreen (F)</p>
        </div>
      )}

      <style>{`
        @keyframes fadeUp {
          from { opacity: 0; transform: translateY(8px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}
