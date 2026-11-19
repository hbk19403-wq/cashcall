"use client";
import { useState } from "react";
import Link from "next/link";
import CashCallChat from "./CashCallChat";
import PublicNav from "./PublicNav";

// ── WhatsApp Daily Digest Mockup ──────────────────────────────────────────────
function DigestPhone({ profit = true }: { profit?: boolean }) {
  return (
    <div className="relative mx-auto" style={{ width: 300 }}>
      {/* phone shell */}
      <div className="relative bg-[#111] rounded-[2.4rem] border-2 border-slate-700 shadow-2xl overflow-hidden" style={{ height: 580 }}>
        {/* notch */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-28 h-7 bg-[#111] rounded-b-2xl z-10" />
        {/* status bar */}
        <div className="flex justify-between items-center px-6 pt-3 pb-1 text-[10px] text-white/60">
          <span>9:07</span>
          <span>●●●</span>
        </div>
        {/* whatsapp header */}
        <div className="bg-[#075E54] flex items-center gap-3 px-4 py-3">
          <div className="w-9 h-9 rounded-full bg-emerald-400 flex items-center justify-center text-[#075E54] font-black text-sm">⚡</div>
          <div>
            <div className="text-white font-semibold text-sm">CashCall</div>
            <div className="text-emerald-200 text-[10px]">Daily P&amp;L Digest</div>
          </div>
        </div>
        {/* chat bg */}
        <div className="bg-[#0b141a] flex-1 px-3 py-4 space-y-3 overflow-hidden" style={{ minHeight: 460 }}>
          {/* date stamp */}
          <div className="text-center">
            <span className="bg-[#182229] text-slate-400 text-[10px] px-3 py-1 rounded-full">Tuesday, Nov 5</span>
          </div>
          {/* message bubble */}
          <div className="bg-[#202c33] rounded-2xl rounded-tl-sm p-4 text-xs space-y-3 max-w-[260px]">
            <div className="text-emerald-300 font-bold text-[11px] tracking-wide">⚡ CASHCALL · THE CORNER TABLE</div>

            <div className={`rounded-xl p-3 ${profit ? "bg-emerald-500/15 border border-emerald-500/30" : "bg-red-500/15 border border-red-500/30"}`}>
              <div className="text-[10px] text-slate-400 mb-1">Yesterday — Monday, Nov 4</div>
              <div className={`text-xl font-black ${profit ? "text-emerald-400" : "text-red-400"}`}>
                {profit ? "+$1,847" : "−$423"}
              </div>
              <div className={`text-[10px] font-semibold ${profit ? "text-emerald-300" : "text-red-300"}`}>
                {profit ? "✅ NET PROFIT · 18.4% margin" : "🔴 NET LOSS · food cost spiked"}
              </div>
            </div>

            <div className="space-y-2">
              <div className="text-[10px] text-slate-400 font-semibold uppercase tracking-wide">Where your money went</div>
              <div className="flex justify-between items-center">
                <span className="text-slate-300">🍽️ Food cost</span>
                <span className="text-emerald-400 font-bold">27.3% ✓</span>
              </div>
              <div className="w-full bg-slate-700 rounded-full h-1">
                <div className="bg-emerald-500 h-1 rounded-full" style={{ width: "47%" }} />
              </div>
              <div className="flex justify-between items-center">
                <span className="text-slate-300">👥 Labor</span>
                <span className="text-emerald-400 font-bold">31.4% ✓</span>
              </div>
              <div className="w-full bg-slate-700 rounded-full h-1">
                <div className="bg-emerald-500 h-1 rounded-full" style={{ width: "54%" }} />
              </div>
              <div className="flex justify-between items-center">
                <span className="text-slate-300">🏗️ Overhead</span>
                <span className="text-slate-300 font-bold">$1,240</span>
              </div>
            </div>

            <div className="bg-amber-500/10 border border-amber-500/20 rounded-lg p-2">
              <div className="text-amber-300 text-[10px] font-semibold">⚠️ Price Alert</div>
              <div className="text-slate-300 text-[10px] mt-0.5">Chicken breast +18% vs last week — $307 extra this week</div>
            </div>

            <div className="text-[10px] text-slate-500 flex items-center justify-between pt-1">
              <span>cashcall.io/dashboard →</span>
              <span className="text-emerald-400">✓✓</span>
            </div>
          </div>
        </div>
      </div>
      {/* glow */}
      <div className="absolute inset-0 rounded-[2.4rem] bg-emerald-500/5 blur-xl -z-10 scale-110" />
    </div>
  );
}

// ── Section: Demo Video ───────────────────────────────────────────────────────
function VideoSection() {
  return (
    <section className="py-16 border-t border-slate-800/60 bg-slate-950/40">
      <div className="max-w-4xl mx-auto px-6">
        <div className="text-center mb-10">
          <div className="inline-flex items-center gap-2 bg-slate-800 border border-slate-700 text-slate-400 text-xs font-semibold px-4 py-1.5 rounded-full mb-4 uppercase tracking-widest">
            <span className="w-1.5 h-1.5 bg-red-400 rounded-full" />
            See it in action
          </div>
          <h2 className="text-2xl sm:text-3xl font-black text-white leading-tight mb-3">
            CashCall in 60 seconds
          </h2>
          <p className="text-slate-500 text-base max-w-xl mx-auto">
            From invoice scan to daily P&amp;L — watch how restaurant owners get their numbers before breakfast.
          </p>
        </div>

        {/* Video player */}
        <div className="relative rounded-2xl overflow-hidden border border-slate-700/60 shadow-2xl shadow-black/60"
          style={{ background: "linear-gradient(135deg, #0f1117 0%, #0a0d13 100%)" }}>
          {/* top bar chrome */}
          <div className="flex items-center gap-2 px-4 py-3 bg-slate-900/80 border-b border-slate-800/60">
            <div className="w-3 h-3 rounded-full bg-red-500/70" />
            <div className="w-3 h-3 rounded-full bg-amber-500/70" />
            <div className="w-3 h-3 rounded-full bg-emerald-500/70" />
            <div className="flex-1 ml-3 bg-slate-800 rounded-md px-3 py-1 text-slate-500 text-xs font-mono">
              cashcall.io/dashboard
            </div>
          </div>
          <video
            src="https://lhwepylnuurjbarkfugo.supabase.co/storage/v1/object/public/media/cashcall_demo.mp4"
            poster="/cashcall_thumb_demo.png"
            controls
            playsInline
            preload="metadata"
            className="w-full block"
            style={{ maxHeight: 520 }}
          />
        </div>

        {/* sub-line */}
        <p className="text-center text-slate-600 text-xs mt-5">
          Real product · Real data · No script
        </p>
      </div>
    </section>
  );
}

// ── Section: Pain ─────────────────────────────────────────────────────────────
function PainSection() {
  return (
    <section className="py-24 border-t border-slate-800/60">
      <div className="max-w-4xl mx-auto px-6 text-center">
        <div className="inline-block bg-red-500/10 border border-red-500/20 text-red-400 text-xs font-semibold px-4 py-1.5 rounded-full mb-6 uppercase tracking-widest">
          The Real Problem
        </div>
        <h2 className="text-3xl sm:text-4xl lg:text-5xl font-black text-white leading-tight mb-6">
          You find out you lost $12,000
          <span className="text-red-400"> three weeks</span> after it happened.
        </h2>
        <p className="text-slate-400 text-lg max-w-2xl mx-auto mb-14 leading-relaxed">
          By the time your accountant runs the numbers, the vendor already overcharged you five times,
          the overtime already ran unchecked every Friday, and the price spike already killed your margin for the month.
        </p>

        {/* Timeline */}
        <div className="grid grid-cols-3 gap-4 max-w-3xl mx-auto">
          {[
            { week: "Week 1", icon: "🩸", color: "red", label: "You're bleeding", sub: "Food cost at 42%. You have no idea." },
            { week: "Week 2", icon: "🩸", color: "red", label: "Still bleeding", sub: "Labor ran overtime 4 shifts. Still no idea." },
            { week: "Week 3", icon: "📋", color: "slate", label: "Accountant calls", sub: "\"You lost $12,000 last month.\" Too late." },
          ].map((item) => (
            <div key={item.week} className={`rounded-2xl p-5 border ${item.color === "red" ? "bg-red-500/5 border-red-500/20" : "bg-slate-900 border-slate-700"}`}>
              <div className="text-2xl mb-2">{item.icon}</div>
              <div className={`text-xs font-bold uppercase tracking-widest mb-1 ${item.color === "red" ? "text-red-400" : "text-slate-500"}`}>{item.week}</div>
              <div className="text-white font-bold text-sm mb-1">{item.label}</div>
              <div className="text-slate-500 text-xs leading-relaxed">{item.sub}</div>
            </div>
          ))}
        </div>

        <div className="mt-10 text-slate-400 text-base">
          CashCall fixes this. You know <span className="text-white font-bold">tonight</span> what happened today.
        </div>
      </div>
    </section>
  );
}

// ── Section: Daily Digest ─────────────────────────────────────────────────────
function DigestSection() {
  const [isProfit, setIsProfit] = useState(true);
  return (
    <section id="digest" className="py-24 bg-slate-950/60 border-t border-slate-800/60">
      <div className="max-w-6xl mx-auto px-6">
        <div className="grid lg:grid-cols-2 gap-16 items-center">
          <div>
            <div className="inline-block bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-semibold px-4 py-1.5 rounded-full mb-6 uppercase tracking-widest">
              Daily P&amp;L Digest
            </div>
            <h2 className="text-3xl sm:text-4xl font-black text-white leading-tight mb-5">
              Every morning, your P&amp;L lands on your phone.<br />
              <span className="text-emerald-400">Before your first coffee.</span>
            </h2>
            <p className="text-slate-400 text-lg leading-relaxed mb-8">
              Did you make money yesterday? How much? Where did it go?
              CashCall sends you a plain-English summary via WhatsApp or email —
              every single day, automatically.
            </p>
            <div className="space-y-4 mb-8">
              {[
                { icon: "✅", title: "Profit or loss — in one number", sub: "NET PROFIT: +$1,847 or NET LOSS: −$423. Clear." },
                { icon: "🍽️", title: "Food cost % for the day", sub: "28.3% vs your 28% target. Know if food is eating your margin." },
                { icon: "👥", title: "Labor cost % for the day", sub: "31.4% vs your 32% target. Catch overtime before the week ends." },
                { icon: "⚠️", title: "Price spike alert", sub: "Vendor raised chicken $0.53/lb? You know by morning." },
              ].map((item) => (
                <div key={item.title} className="flex gap-4 items-start">
                  <div className="w-9 h-9 rounded-xl bg-slate-800 flex items-center justify-center text-lg flex-shrink-0">{item.icon}</div>
                  <div>
                    <div className="text-white font-semibold text-sm">{item.title}</div>
                    <div className="text-slate-500 text-sm">{item.sub}</div>
                  </div>
                </div>
              ))}
            </div>
            <div className="flex items-center gap-3 text-sm text-slate-500">
              <span>Toggle preview:</span>
              <button
                onClick={() => setIsProfit(true)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${isProfit ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/40" : "bg-slate-800 text-slate-500 border border-slate-700"}`}
              >
                Good day ✅
              </button>
              <button
                onClick={() => setIsProfit(false)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${!isProfit ? "bg-red-500/20 text-red-400 border border-red-500/40" : "bg-slate-800 text-slate-500 border border-slate-700"}`}
              >
                Bad day 🔴
              </button>
            </div>
          </div>
          <div className="flex justify-center lg:justify-end">
            <DigestPhone profit={isProfit} />
          </div>
        </div>
      </div>
    </section>
  );
}

// ── Section: Zero Manual Entry ────────────────────────────────────────────────
function AutoSection() {
  return (
    <section id="auto" className="py-24 border-t border-slate-800/60">
      <div className="max-w-5xl mx-auto px-6">
        <div className="text-center mb-16">
          <div className="inline-block bg-teal-500/10 border border-teal-500/20 text-teal-400 text-xs font-semibold px-4 py-1.5 rounded-full mb-6 uppercase tracking-widest">
            Zero Manual Entry
          </div>
          <h2 className="text-3xl sm:text-4xl font-black text-white leading-tight mb-4">
            Your data flows in automatically.<br />
            <span className="text-teal-400">You just run your restaurant.</span>
          </h2>
          <p className="text-slate-400 text-lg max-w-2xl mx-auto">
            No spreadsheets. No typing in sales at the end of the night. No chasing invoices.
            Every system you already use connects directly.
          </p>
        </div>

        {/* Flow diagram */}
        <div className="grid sm:grid-cols-3 gap-6 mb-10">
          {[
            {
              icon: "🖥️",
              label: "POS System",
              color: "teal",
              items: ["Clover", "Toast", "Square"],
              desc: "Sales sync automatically every day. Zero entry.",
            },
            {
              icon: "🧾",
              label: "Invoices",
              color: "teal",
              items: ["Sysco", "US Foods", "Restaurant Depot"],
              desc: "Snap a photo. OCR reads every line item in seconds.",
            },
            {
              icon: "👥",
              label: "Payroll",
              color: "teal",
              items: ["ADP", "Gusto", "Intuit"],
              desc: "Payroll data flows into labor cost automatically.",
            },
          ].map((item) => (
            <div key={item.label} className="bg-slate-900 border border-slate-800 hover:border-teal-500/30 rounded-2xl p-6 transition-colors">
              <div className="text-3xl mb-4">{item.icon}</div>
              <div className="text-teal-400 text-xs font-bold uppercase tracking-widest mb-2">{item.label}</div>
              <div className="flex flex-wrap gap-2 mb-4">
                {item.items.map((s) => (
                  <span key={s} className="text-xs bg-slate-800 border border-slate-700 text-slate-300 px-2.5 py-1 rounded-lg">{s}</span>
                ))}
              </div>
              <p className="text-slate-400 text-sm leading-relaxed">{item.desc}</p>
            </div>
          ))}
        </div>

        {/* Arrow */}
        <div className="text-center text-slate-600 text-3xl mb-10">↓</div>

        {/* Result */}
        <div className="bg-gradient-to-r from-emerald-500/10 to-teal-500/10 border border-emerald-500/20 rounded-2xl p-8 text-center">
          <div className="text-4xl mb-3">⚡</div>
          <div className="text-white font-black text-xl mb-2">CashCall builds your P&amp;L automatically</div>
          <div className="text-slate-400">Real-time dashboard + morning digest. No manual entry. Ever.</div>
        </div>
      </div>
    </section>
  );
}

// ── Section: Weekly Loss Map ──────────────────────────────────────────────────
function WeeklyLossSection() {
  return (
    <section id="weekly" className="py-24 bg-slate-950/60 border-t border-slate-800/60">
      <div className="max-w-6xl mx-auto px-6">
        <div className="grid lg:grid-cols-2 gap-16 items-center">
          {/* UI mockup */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden">
            {/* header */}
            <div className="bg-slate-950 border-b border-slate-800 px-5 py-4 flex items-center justify-between">
              <div className="text-white font-bold text-sm">📅 Week of Nov 4–10</div>
              <div className="text-red-400 text-xs font-semibold bg-red-500/10 border border-red-500/20 px-2.5 py-1 rounded-full">🩸 2 issues</div>
            </div>
            <div className="p-5 space-y-4">
              {/* Food */}
              <div>
                <div className="flex justify-between items-center mb-2">
                  <span className="text-slate-300 text-sm font-semibold">🍽️ Food Cost</span>
                  <span className="text-red-400 text-sm font-bold">32.1% · +4.1% over target</span>
                </div>
                <div className="w-full bg-slate-800 rounded-full h-2 mb-2">
                  <div className="bg-red-500 h-2 rounded-full" style={{ width: "66%" }} />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { item: "Protein / Meat", pct: "15.1%", flag: "⚠️" },
                    { item: "Produce", pct: "8.4%", flag: "✓" },
                    { item: "Dairy", pct: "4.2%", flag: "⚠️" },
                    { item: "Dry goods", pct: "4.4%", flag: "✓" },
                  ].map((r) => (
                    <div key={r.item} className="bg-slate-800/60 rounded-lg px-3 py-2 flex justify-between text-xs">
                      <span className="text-slate-400">{r.flag} {r.item}</span>
                      <span className={r.flag === "⚠️" ? "text-red-400 font-bold" : "text-emerald-400 font-bold"}>{r.pct}</span>
                    </div>
                  ))}
                </div>
              </div>
              {/* Labor */}
              <div>
                <div className="flex justify-between items-center mb-2">
                  <span className="text-slate-300 text-sm font-semibold">👥 Labor Cost</span>
                  <span className="text-emerald-400 text-sm font-bold">29.8% · ✅ on target</span>
                </div>
                <div className="w-full bg-slate-800 rounded-full h-2 mb-2">
                  <div className="bg-emerald-500 h-2 rounded-full" style={{ width: "51%" }} />
                </div>
                <div className="grid grid-cols-7 gap-1">
                  {[
                    { day: "M", pct: 28, ok: true },
                    { day: "T", pct: 31, ok: true },
                    { day: "W", pct: 27, ok: true },
                    { day: "T", pct: 29, ok: true },
                    { day: "F", pct: 38, ok: false },
                    { day: "S", pct: 26, ok: true },
                    { day: "S", pct: 30, ok: true },
                  ].map((d, i) => (
                    <div key={i} className="text-center">
                      <div className={`rounded mx-auto mb-1 ${d.ok ? "bg-emerald-500/30" : "bg-red-500/40"}`} style={{ height: `${d.pct * 1.2}px`, width: "100%" }} />
                      <div className="text-[10px] text-slate-500">{d.day}</div>
                      <div className={`text-[9px] font-bold ${d.ok ? "text-emerald-400" : "text-red-400"}`}>{d.pct}%</div>
                    </div>
                  ))}
                </div>
                <div className="bg-amber-500/10 border border-amber-500/20 rounded-lg px-3 py-2 mt-2 text-xs text-amber-300">
                  ⚠️ Friday: labor spiked to 38% — 3.2 hrs overtime on dinner shift
                </div>
              </div>
            </div>
          </div>

          {/* copy */}
          <div>
            <div className="inline-block bg-red-500/10 border border-red-500/20 text-red-400 text-xs font-semibold px-4 py-1.5 rounded-full mb-6 uppercase tracking-widest">
              Weekly Loss Breakdown
            </div>
            <h2 className="text-3xl sm:text-4xl font-black text-white leading-tight mb-5">
              See exactly where you're bleeding money.
              <span className="text-red-400"> Every week.</span>
            </h2>
            <p className="text-slate-400 text-lg leading-relaxed mb-8">
              CashCall breaks down your costs by category, by day, by shift —
              so you know it's Friday overtime killing your margin,
              not just "labor is too high."
            </p>
            <div className="space-y-4">
              {[
                { icon: "🍽️", title: "Food cost by category", sub: "Protein, produce, dairy, dry goods — see which category is over budget and by how much." },
                { icon: "👥", title: "Labor by day and shift", sub: "Which day ran overtime? Which shift? Drill to the hour." },
                { icon: "📊", title: "Week-over-week comparison", sub: "Is it getting better or worse? Trend it across 4 weeks." },
              ].map((item) => (
                <div key={item.title} className="flex gap-4 items-start">
                  <div className="w-9 h-9 rounded-xl bg-slate-800 flex items-center justify-center text-lg flex-shrink-0">{item.icon}</div>
                  <div>
                    <div className="text-white font-semibold text-sm">{item.title}</div>
                    <div className="text-slate-500 text-sm">{item.sub}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

// ── Section: Price Tracker ────────────────────────────────────────────────────
function PriceTrackerSection() {
  return (
    <section id="prices" className="py-24 border-t border-slate-800/60">
      <div className="max-w-6xl mx-auto px-6">
        <div className="grid lg:grid-cols-2 gap-16 items-center">
          {/* copy */}
          <div>
            <div className="inline-block bg-amber-500/10 border border-amber-500/20 text-amber-400 text-xs font-semibold px-4 py-1.5 rounded-full mb-6 uppercase tracking-widest">
              Price Tracker &amp; Vendor Intelligence
            </div>
            <h2 className="text-3xl sm:text-4xl font-black text-white leading-tight mb-5">
              Know when your vendor raised prices
              <span className="text-amber-400"> before it hits your P&amp;L.</span>
            </h2>
            <p className="text-slate-400 text-lg leading-relaxed mb-8">
              Every invoice you scan gets tracked. CashCall compares every line item against your 1-month, 3-month, and 6-month history —
              and flags spikes the moment they appear, not a month later.
            </p>
            <div className="space-y-4">
              {[
                { icon: "📈", title: "Automatic price history", sub: "Every vendor. Every item. Every invoice. Tracked automatically." },
                { icon: "🚨", title: "Spike alerts on every delivery", sub: "Chicken breast up $0.53/lb? You know before you unbox the order." },
                { icon: "🏪", title: "Vendor comparison", sub: "Is Sysco cheaper than US Foods for the same item this week? We tell you." },
                { icon: "💰", title: "Weekly dollar impact", sub: "Not just the % — the actual extra dollars that spike will cost you this week." },
              ].map((item) => (
                <div key={item.title} className="flex gap-4 items-start">
                  <div className="w-9 h-9 rounded-xl bg-slate-800 flex items-center justify-center text-lg flex-shrink-0">{item.icon}</div>
                  <div>
                    <div className="text-white font-semibold text-sm">{item.title}</div>
                    <div className="text-slate-500 text-sm">{item.sub}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Price tracker table mockup */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden">
            <div className="bg-slate-950 border-b border-slate-800 px-5 py-4">
              <div className="text-white font-bold text-sm">📈 Vendor Price Intelligence</div>
              <div className="text-slate-500 text-xs mt-0.5">Updated on every invoice scan</div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-slate-800">
                    <th className="text-left px-4 py-3 text-slate-500 font-semibold">Item</th>
                    <th className="text-right px-3 py-3 text-slate-500 font-semibold">This week</th>
                    <th className="text-right px-3 py-3 text-slate-500 font-semibold">Last month</th>
                    <th className="text-right px-3 py-3 text-slate-500 font-semibold">Change</th>
                    <th className="text-right px-4 py-3 text-slate-500 font-semibold">Impact</th>
                  </tr>
                </thead>
                <tbody>
                  {[
                    { item: "Chicken Breast", vendor: "Sysco", now: "$3.42/lb", prev: "$2.89", chg: "+18.3%", impact: "+$307", bad: true },
                    { item: "Beef Tenderloin", vendor: "US Foods", now: "$18.90/lb", prev: "$16.40", chg: "+15.2%", impact: "+$113", bad: true },
                    { item: "Avocados", vendor: "US Foods", now: "$1.85/ea", prev: "$1.42", chg: "+30.3%", impact: "+$103", bad: true },
                    { item: "Roma Tomatoes", vendor: "Rest. Depot", now: "$19.20/cs", prev: "$18.40", chg: "−4.3%", impact: "+$32", bad: false },
                    { item: "Heavy Cream", vendor: "Sysco", now: "$4.10/qt", prev: "$4.10", chg: "0.0%", impact: "$0", bad: false },
                  ].map((row, i) => (
                    <tr key={i} className={`border-b border-slate-800/50 ${row.bad ? "bg-red-500/3" : ""}`}>
                      <td className="px-4 py-3">
                        <div className="text-white font-semibold">{row.item}</div>
                        <div className="text-slate-600 text-[10px]">{row.vendor}</div>
                      </td>
                      <td className="text-right px-3 py-3 text-slate-300 font-mono">{row.now}</td>
                      <td className="text-right px-3 py-3 text-slate-500 font-mono">{row.prev}</td>
                      <td className={`text-right px-3 py-3 font-bold font-mono ${row.bad ? "text-red-400" : "text-emerald-400"}`}>{row.chg}</td>
                      <td className={`text-right px-4 py-3 font-bold font-mono ${row.bad ? "text-red-400" : "text-slate-400"}`}>{row.impact}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="bg-red-500/8 border-t border-red-500/20">
                    <td colSpan={4} className="px-4 py-3 text-red-300 font-semibold text-xs">Total weekly price impact</td>
                    <td className="text-right px-4 py-3 text-red-400 font-black text-sm">+$555</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

// ── Section: All In One ───────────────────────────────────────────────────────
function AllInOneSection() {
  return (
    <section id="features" className="py-24 bg-slate-950/60 border-t border-slate-800/60">
      <div className="max-w-5xl mx-auto px-6">
        <div className="text-center mb-16">
          <div className="inline-block bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-semibold px-4 py-1.5 rounded-full mb-6 uppercase tracking-widest">
            One Portal. Everything.
          </div>
          <h2 className="text-3xl sm:text-4xl font-black text-white leading-tight mb-4">
            Tremendous value. Immediate clarity.
          </h2>
          <p className="text-slate-400 text-lg max-w-2xl mx-auto">
            No point paying for 5 tools when one portal replaces all of them —
            and tells you more than all of them combined.
          </p>
        </div>

        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[
            { icon: "📱", title: "Daily P&L to your phone", sub: "WhatsApp or email. Every morning. Profit or loss — to the dollar.", color: "emerald" },
            { icon: "🔄", title: "Zero manual entry", sub: "POS sync, invoice OCR, payroll connect. Data flows in automatically.", color: "teal" },
            { icon: "🩸", title: "Weekly loss breakdown", sub: "Food by category. Labor by day and shift. Know exactly where you're bleeding.", color: "red" },
            { icon: "📈", title: "Price tracker", sub: "Every vendor item tracked. Spike alerts on every delivery. Dollar impact shown.", color: "amber" },
            { icon: "🏪", title: "Vendor intelligence", sub: "Compare vendors. See who's cheaper this week for the same item.", color: "amber" },
            { icon: "📊", title: "Full P&L dashboard", sub: "Real-time numbers. Not month-end. Not week-end. Right now.", color: "emerald" },
          ].map((f) => {
            const colors: Record<string, string> = {
              emerald: "border-emerald-500/20 hover:border-emerald-500/40",
              teal: "border-teal-500/20 hover:border-teal-500/40",
              red: "border-red-500/20 hover:border-red-500/40",
              amber: "border-amber-500/20 hover:border-amber-500/40",
            };
            const iconBg: Record<string, string> = {
              emerald: "bg-emerald-500/10",
              teal: "bg-teal-500/10",
              red: "bg-red-500/10",
              amber: "bg-amber-500/10",
            };
            return (
              <div key={f.title} className={`bg-slate-900 border ${colors[f.color]} rounded-2xl p-6 transition-colors`}>
                <div className={`w-11 h-11 ${iconBg[f.color]} rounded-xl flex items-center justify-center text-2xl mb-4`}>{f.icon}</div>
                <div className="text-white font-bold mb-2">{f.title}</div>
                <div className="text-slate-500 text-sm leading-relaxed">{f.sub}</div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

// ── Section: Ecosystem ────────────────────────────────────────────────────────
function EcosystemSection() {
  return (
    <section id="ecosystem" className="py-24 border-t border-slate-800/60">
      <div className="max-w-5xl mx-auto px-6">

        {/* Header */}
        <div className="text-center mb-16">
          <div className="inline-block bg-slate-800 border border-slate-700 text-slate-400 text-xs font-semibold px-4 py-1.5 rounded-full mb-6 uppercase tracking-widest">
            🌐 The CashCall Ecosystem
          </div>
          <h2 className="text-3xl sm:text-4xl font-black text-white leading-tight mb-4">
            One core. Three compounding revenue models.
          </h2>
          <p className="text-slate-400 text-lg max-w-2xl mx-auto">
            CashCall starts as the financial OS for independent restaurants — and grows into a platform
            where data, purchasing power, and capital become compounding advantages for every operator in the network.
          </p>
        </div>

        {/* Core */}
        <div className="relative mb-6">
          <div className="bg-emerald-500/8 border-2 border-emerald-500/40 rounded-3xl p-8">
            <div className="flex items-start justify-between flex-wrap gap-4 mb-6">
              <div>
                <span className="inline-block bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 text-[11px] font-bold uppercase tracking-widest px-3 py-1 rounded-full mb-3">⚡ Core Model — Live Now</span>
                <h3 className="text-white font-black text-2xl">Financial Intelligence Platform</h3>
                <p className="text-slate-400 mt-2 max-w-xl">
                  The foundation. Every restaurant connected shares their financial data with CashCall — and gets back
                  real-time P&L, price alerts, and the daily digest that tells them if they made money today.
                </p>
              </div>
              <div className="text-right shrink-0">
                <div className="text-emerald-400 font-black text-xl">SaaS Subscription</div>
                <div className="text-slate-500 text-sm">Monthly per-location fee</div>
              </div>
            </div>
            <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {[
                { icon: "📱", t: "Daily P&L to phone", d: "WhatsApp/email every morning before coffee" },
                { icon: "🧾", t: "Invoice OCR", d: "Snap a photo — all line items captured in seconds" },
                { icon: "🖥️", t: "POS auto-sync", d: "Clover, Toast, Square — sales flow in daily" },
                { icon: "📊", t: "Prime cost live", d: "Food + labor cost % updated in real time" },
              ].map((f) => (
                <div key={f.t} className="bg-slate-900/80 border border-emerald-500/10 rounded-2xl p-4">
                  <div className="text-xl mb-2">{f.icon}</div>
                  <div className="text-white font-bold text-sm mb-1">{f.t}</div>
                  <div className="text-slate-500 text-xs leading-relaxed">{f.d}</div>
                </div>
              ))}
            </div>
          </div>
          {/* connector line */}
          <div className="flex justify-center py-3">
            <div className="w-0.5 h-8 bg-gradient-to-b from-emerald-500/40 to-slate-700/40" />
          </div>
        </div>

        {/* 3 Revenue Models */}
        <div className="grid sm:grid-cols-3 gap-5 mb-16">
          {/* Model A — B2B Bill Pay */}
          <div className="bg-slate-900 border border-blue-500/20 rounded-2xl p-6 flex flex-col">
            <span className="inline-block bg-blue-500/10 text-blue-400 border border-blue-500/20 text-[10px] font-bold uppercase tracking-widest px-2.5 py-1 rounded-full mb-4 self-start">Model A · FinTech</span>
            <div className="text-3xl mb-3">💳</div>
            <h3 className="text-white font-black text-lg mb-2">B2B Bill Pay</h3>
            <p className="text-slate-400 text-sm leading-relaxed mb-4 flex-1">
              Restaurants pay Sysco, US Foods, and local vendors directly through CashCall via ACH
              or virtual card. We capture interchange margin on every transaction.
            </p>
            <div className="space-y-2 mb-4">
              {[
                "Pay any vendor invoice directly in-platform",
                "ACH & virtual card — zero friction for operators",
                "0.5%–1.0% take-rate on every payment processed",
                "Unlocks Month 6+ — after invoice history builds",
              ].map((pt) => (
                <div key={pt} className="flex items-start gap-2 text-slate-400 text-xs">
                  <span className="text-blue-400 flex-shrink-0 mt-0.5">→</span>
                  {pt}
                </div>
              ))}
            </div>
            <div className="bg-slate-800 rounded-xl p-3 text-center">
              <div className="text-blue-400 font-bold text-sm">0.5%–1.0% take-rate</div>
              <div className="text-slate-500 text-xs">Per invoice payment volume</div>
            </div>
          </div>

          {/* Model B — GPO Vendor Rebates */}
          <div className="bg-slate-900 border border-amber-500/20 rounded-2xl p-6 flex flex-col">
            <span className="inline-block bg-amber-500/10 text-amber-400 border border-amber-500/20 text-[10px] font-bold uppercase tracking-widest px-2.5 py-1 rounded-full mb-4 self-start">Model B · Marketplace</span>
            <div className="text-3xl mb-3">🤝</div>
            <h3 className="text-white font-black text-lg mb-2">GPO Vendor Rebates</h3>
            <p className="text-slate-400 text-sm leading-relaxed mb-4 flex-1">
              Aggregated anonymized purchasing volume enables group-buying discounts across the network.
              We earn a software referral commission on every case ordered through the platform.
            </p>
            <div className="space-y-2 mb-4">
              {[
                "500 restaurants buy chicken — CashCall negotiates collectively",
                "Price benchmarks: is your Sysco deal fair vs. peers?",
                "Commission earned per case ordered through CashCall GPO",
                "Unlocks Year 2 — network scale drives negotiating power",
              ].map((pt) => (
                <div key={pt} className="flex items-start gap-2 text-slate-400 text-xs">
                  <span className="text-amber-400 flex-shrink-0 mt-0.5">→</span>
                  {pt}
                </div>
              ))}
            </div>
            <div className="bg-slate-800 rounded-xl p-3 text-center">
              <div className="text-amber-400 font-bold text-sm">Commission per case</div>
              <div className="text-slate-500 text-xs">On group purchasing volume</div>
            </div>
          </div>

          {/* Model C — AI Advisory / Virtual CFO */}
          <div className="bg-slate-900 border border-purple-500/20 rounded-2xl p-6 flex flex-col">
            <span className="inline-block bg-purple-500/10 text-purple-400 border border-purple-500/20 text-[10px] font-bold uppercase tracking-widest px-2.5 py-1 rounded-full mb-4 self-start">Model C · AI Advisory</span>
            <div className="text-3xl mb-3">🧠</div>
            <h3 className="text-white font-black text-lg mb-2">Virtual CFO Add-On</h3>
            <p className="text-slate-400 text-sm leading-relaxed mb-4 flex-1">
              Advanced predictive menu engineering, automated labor scheduling, and benchmark intelligence
              as a premium AI tier — unlocked after 60 days on platform.
            </p>
            <div className="space-y-2 mb-4">
              {[
                "AI-driven menu engineering — margin per dish, ranked",
                "Automated labor scheduling optimized for prime cost",
                "Anonymous network benchmarks: food %, labor % by market",
                "Unlocks Month 9+ — premium tier on top of core SaaS",
              ].map((pt) => (
                <div key={pt} className="flex items-start gap-2 text-slate-400 text-xs">
                  <span className="text-purple-400 flex-shrink-0 mt-0.5">→</span>
                  {pt}
                </div>
              ))}
            </div>
            <div className="bg-slate-800 rounded-xl p-3 text-center">
              <div className="text-purple-400 font-bold text-sm">+$50–$100/mo premium</div>
              <div className="text-slate-500 text-xs">On top of core subscription</div>
            </div>
          </div>
        </div>

        {/* Flywheel */}
        <div className="bg-slate-900 border border-slate-700 rounded-2xl p-8 text-center">
          <div className="text-slate-400 text-sm uppercase tracking-widest font-semibold mb-4">The Network Effect</div>
          <div className="flex flex-wrap justify-center items-center gap-3 text-sm font-bold">
            <span className="bg-emerald-500/10 text-emerald-400 px-4 py-2 rounded-xl border border-emerald-500/20">More operators join</span>
            <span className="text-slate-600">→</span>
            <span className="bg-blue-500/10 text-blue-400 px-4 py-2 rounded-xl border border-blue-500/20">Richer price benchmarks</span>
            <span className="text-slate-600">→</span>
            <span className="bg-amber-500/10 text-amber-400 px-4 py-2 rounded-xl border border-amber-500/20">Stronger GPO power</span>
            <span className="text-slate-600">→</span>
            <span className="bg-purple-500/10 text-purple-400 px-4 py-2 rounded-xl border border-purple-500/20">More bill-pay volume</span>
            <span className="text-slate-600">→</span>
            <span className="bg-emerald-500/10 text-emerald-400 px-4 py-2 rounded-xl border border-emerald-500/20">Higher LTV per operator</span>
          </div>
          <p className="text-slate-600 text-xs mt-4">Every new restaurant makes the platform more valuable for all others.</p>
        </div>

        {/* Investor Reel Video */}
        <div className="mt-12">
          <div className="text-center mb-4">
            <span className="inline-block bg-slate-800 border border-slate-700 text-slate-400 text-xs font-semibold px-4 py-1.5 rounded-full uppercase tracking-widest">
              🎬 Investor Overview — 2 min
            </span>
          </div>
          <div className="rounded-2xl overflow-hidden border border-slate-700 bg-slate-900">
            <video
              src="https://lhwepylnuurjbarkfugo.supabase.co/storage/v1/object/public/media/cashcall_investor_reel_v2.mp4"
              poster="/cashcall_thumb_investor.png"
              controls
              playsInline
              preload="metadata"
              className="w-full block"
              style={{ maxHeight: 480 }}
            />
          </div>
        </div>

        {/* Learn more */}
        <div className="text-center mt-10">
          <Link href="/investors" className="inline-flex items-center gap-2 border border-slate-700 hover:border-slate-500 text-slate-400 hover:text-white text-sm font-semibold px-6 py-3 rounded-xl transition-colors">
            Full business model & investor details →
          </Link>
        </div>
      </div>
    </section>
  );
}

// ── Section: Competitive ──────────────────────────────────────────────────────
function CompetitiveSection() {
  const BRAND = "#00d4a8";
  const rows = [
    { feature: "Daily Prime Cost Alert",      cc: "✓",           r365: "✓",       me: "✓",       qb: "✗" },
    { feature: "Invoice OCR (< 60 sec)",      cc: "✓",           r365: "Partial", me: "✓",       qb: "✗" },
    { feature: "AI Insights (Plain English)", cc: "✓",           r365: "✗",       me: "✗",       qb: "✗" },
    { feature: "B2B Bill Pay Integration",    cc: "✓ Roadmap",   r365: "✗",       me: "✗",       qb: "✗" },
    { feature: "GPO Marketplace Rebates",     cc: "✓ Roadmap",   r365: "✗",       me: "✗",       qb: "✗" },
    { feature: "< 5 min Setup",               cc: "✓",           r365: "✗",       me: "Partial", qb: "✓" },
    { feature: "Price per Location/mo",       cc: "$80",         r365: "$599+",   me: "$300+",   qb: "$30" },
    { feature: "Built for Indie Operators",   cc: "✓",           r365: "✗",       me: "Partial", qb: "✗" },
  ];
  return (
    <section id="compare" className="py-24 bg-slate-950/60 border-t border-slate-800/60">
      <div className="max-w-5xl mx-auto px-6">
        <div className="inline-block border rounded-lg px-5 py-2 text-xs font-bold uppercase tracking-widest mb-6" style={{ borderColor: "#00d4a830", color: BRAND }}>
          Competitive Moat
        </div>
        <h2 className="text-3xl sm:text-4xl font-black text-white mb-4 leading-tight">
          Purpose-built for independent operators —<br className="hidden sm:block" />
          <span style={{ color: BRAND }}> not an afterthought in enterprise ERP</span>
        </h2>
        <p className="text-slate-400 mb-10 max-w-2xl">Restaurant365 costs $599+/mo. MarginEdge $300+. Neither has AI insights, bill pay, or GPO rebates. CashCall does — at $80.</p>

        <div className="overflow-x-auto">
          <table className="w-full text-sm border-collapse min-w-[600px]">
            <thead>
              <tr>
                <th className="text-left text-slate-500 font-semibold py-3 pr-4 text-xs w-48">Feature</th>
                {[
                  { name: "CashCall", highlight: true },
                  { name: "Restaurant365", highlight: false },
                  { name: "MarginEdge", highlight: false },
                  { name: "QuickBooks", highlight: false },
                ].map((col) => (
                  <th key={col.name} className={`text-center py-3 px-4 text-xs font-bold ${col.highlight ? "text-slate-950 rounded-t-xl" : "text-slate-400"}`}
                    style={col.highlight ? { background: BRAND } : {}}>
                    {col.name}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, i) => (
                <tr key={row.feature} className={i % 2 === 0 ? "bg-slate-900/50" : ""}>
                  <td className="py-4 pr-4 text-slate-300 text-xs font-medium border-b border-slate-800/60">{row.feature}</td>
                  {[
                    { val: row.cc,   hi: true  },
                    { val: row.r365, hi: false },
                    { val: row.me,   hi: false },
                    { val: row.qb,   hi: false },
                  ].map((cell, ci) => {
                    const isCheck = cell.val.startsWith("✓");
                    const isCross = cell.val === "✗";
                    const isPrice = cell.val.startsWith("$");
                    return (
                      <td key={ci} className={`text-center py-4 px-4 text-xs font-bold border-b border-slate-800/60 ${cell.hi ? "border-l border-r" : ""}`}
                        style={cell.hi ? { borderLeftColor: "#00d4a820", borderRightColor: "#00d4a820" } : {}}>
                        {cell.hi ? (
                          <span style={{ color: isCheck || isPrice ? BRAND : "#94a3b8" }}>{cell.val}</span>
                        ) : (
                          <span className={isCross ? "text-red-500/80" : isCheck ? "text-green-400" : "text-slate-400"}>{cell.val}</span>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="mt-5 rounded-xl border p-4 text-center text-xs font-bold" style={{ borderColor: "#00d4a830", background: "#00d4a808", color: BRAND }}>
          CashCall is 4–8× cheaper than nearest competitors · Better AI insights · Faster setup · The only platform with FinTech expansion capability
        </div>
      </div>
    </section>
  );
}

// ── Section: CTA / Final ──────────────────────────────────────────────────────
function CTASection() {
  return (
    <section id="cta" className="py-28 border-t border-slate-800/60">
      <div className="max-w-3xl mx-auto px-6 text-center">
        <div className="text-6xl mb-6">⚡</div>
        <h2 className="text-4xl sm:text-5xl font-black text-white leading-tight mb-6">
          Stop finding out you lost money
          <span className="text-emerald-400"> three weeks later.</span>
        </h2>
        <p className="text-slate-400 text-xl leading-relaxed mb-10">
          Join restaurant owners who know their P&amp;L before breakfast.
          Every morning. Automatically. No entry required.
        </p>
        <div className="flex flex-col sm:flex-row gap-4 justify-center mb-8">
          <Link
            href="/trial"
            className="bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black text-lg px-10 py-4 rounded-2xl transition-all shadow-lg shadow-emerald-500/20 hover:shadow-emerald-500/40"
          >
            Get My Daily Digest →
          </Link>
          <Link
            href="/sandbox"
            className="border border-slate-700 hover:border-slate-500 text-white font-bold text-lg px-10 py-4 rounded-2xl transition-colors"
          >
            See Live Demo
          </Link>
        </div>
        <p className="text-slate-600 text-sm">No credit card. No setup fee. Request access and we'll onboard you this week.</p>

        {/* social proof */}
        <div className="mt-16 grid grid-cols-3 gap-6 max-w-xl mx-auto">
          {[
            { num: "< 10 min", label: "to go live" },
            { num: "Daily", label: "P&L to your phone" },
            { num: "$0", label: "manual entry" },
          ].map((s) => (
            <div key={s.label} className="bg-slate-900 border border-slate-800 rounded-2xl py-5 px-3">
              <div className="text-2xl font-black text-emerald-400 mb-1">{s.num}</div>
              <div className="text-slate-500 text-xs">{s.label}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ── Main Hero ─────────────────────────────────────────────────────────────────
function HeroSection() {
  return (
    <section className="pt-20 pb-16 sm:pt-28 sm:pb-24">
      <div className="max-w-6xl mx-auto px-6">
        <div className="grid lg:grid-cols-2 gap-16 items-center">
          {/* Left copy */}
          <div>
            <div className="inline-flex items-center gap-2 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-semibold px-4 py-2 rounded-full mb-8">
              <span className="w-1.5 h-1.5 bg-emerald-400 rounded-full animate-pulse" />
              Live on your phone every morning
            </div>
            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-black text-white leading-[1.08] tracking-tight mb-6">
              Know if you made money
              <span className="text-emerald-400"> today.</span>
              <br />
              <span className="text-slate-400">Not in 3 weeks.</span>
            </h1>
            <p className="text-slate-400 text-xl leading-relaxed mb-8 max-w-xl">
              CashCall sends your daily P&amp;L to your phone every morning —
              profit or loss, food cost %, labor cost %, and price spike alerts.
              Automatically. Zero manual entry.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 mb-10">
              <Link
                href="/trial"
                className="bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black text-lg px-8 py-4 rounded-2xl transition-all shadow-lg shadow-emerald-500/20 hover:shadow-emerald-500/40 text-center"
              >
                Get My Daily Digest →
              </Link>
              <Link
                href="/sandbox"
                className="border border-slate-700 hover:border-slate-500 text-white font-bold text-lg px-8 py-4 rounded-2xl transition-colors text-center"
              >
                See Live Demo
              </Link>
            </div>
            {/* quick proof */}
            <div className="flex flex-wrap gap-5 text-sm text-slate-500">
              <span className="flex items-center gap-1.5"><span className="text-emerald-400">✓</span> POS auto-sync</span>
              <span className="flex items-center gap-1.5"><span className="text-emerald-400">✓</span> Invoice OCR</span>
              <span className="flex items-center gap-1.5"><span className="text-emerald-400">✓</span> Zero manual entry</span>
              <span className="flex items-center gap-1.5"><span className="text-emerald-400">✓</span> Live in &lt;10 min</span>
            </div>
          </div>

          {/* Right: phone mockup */}
          <div className="flex justify-center lg:justify-end">
            <DigestPhone profit={true} />
          </div>
        </div>
      </div>
    </section>
  );
}

// ── Root Export ───────────────────────────────────────────────────────────────
export default function LandingPage() {
  return (
    <div className="bg-[#07080d] min-h-screen text-white font-sans">
      <PublicNav active="/" />

      <HeroSection />
      <VideoSection />
      <PainSection />
      <DigestSection />
      <AutoSection />
      <WeeklyLossSection />
      <PriceTrackerSection />
      <AllInOneSection />
      <EcosystemSection />
      <CompetitiveSection />
      <CTASection />

      {/* Footer */}
      <footer className="border-t border-slate-800/60 py-10">
        <div className="max-w-6xl mx-auto px-6 flex flex-col sm:flex-row items-center justify-between gap-4 text-sm text-slate-600">
          <div>⚡ <span className="text-slate-400 font-bold">CashCall</span> — Restaurant Financial OS</div>
          <div className="flex gap-6">
            <Link href="/security" className="hover:text-slate-400 transition">Security</Link>
            <Link href="/press" className="hover:text-slate-400 transition">Press</Link>
            <Link href="/sandbox" className="hover:text-slate-400 transition">Demo</Link>
          </div>
        </div>
      </footer>

      {/* AI Chat */}
      <CashCallChat />
    </div>
  );
}
