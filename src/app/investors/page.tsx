import Link from "next/link";
import type { Metadata } from "next";
import PublicNav from "@/app/components/PublicNav";

export const metadata: Metadata = {
  title: "Investors — CashCall",
  description: "CashCall investor information — market opportunity, business model, traction, and investment thesis.",
};

const BRAND = "#00d4a8";
const BRAND_DIM = "#00d4a820";
const BRAND_BORDER = "#00d4a830";

export default function InvestorsPage() {
  return (
    <div className="min-h-screen bg-[#07080d] text-white">
      <PublicNav active="/investors" />

      <main className="max-w-5xl mx-auto px-6 pt-32 pb-24">

        {/* Hero */}
        <div className="mb-16 max-w-3xl">
          <p className="text-sm font-semibold mb-3" style={{ color: BRAND }}>Investor Relations</p>
          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-black leading-tight mb-6">
            The financial OS for a<br />
            <span style={{ color: BRAND }}>$1 trillion</span> industry.
          </h1>
          <p className="text-slate-400 text-xl leading-relaxed">
            500,000+ independent restaurants in the US still manage their finances through
            spreadsheets, WhatsApp threads, and month-end accountant calls. CashCall gives
            every operator the same real-time financial clarity that national chains spend
            millions to build — and monetizes that data across four compounding layers.
          </p>
        </div>

        {/* Market */}
        <section className="mb-16">
          <h2 className="text-2xl font-black text-white mb-8">Market Opportunity</h2>
          <div className="grid sm:grid-cols-3 gap-5 mb-8">
            {[
              { n: "$1T+", label: "US restaurant industry revenue", sub: "Annual, $900B food & beverage" },
              { n: "500K+", label: "Independent & small-group operators", sub: "Addressable market — no financial OS" },
              { n: "$2.4B", label: "SAM at $400/location/yr", sub: "Software subscription only" },
            ].map((m) => (
              <div key={m.label} className="rounded-2xl p-6 border text-center" style={{ background: BRAND_DIM, borderColor: BRAND_BORDER }}>
                <p className="text-4xl font-black mb-2" style={{ color: BRAND }}>{m.n}</p>
                <p className="text-sm font-semibold text-white mb-1">{m.label}</p>
                <p className="text-xs text-slate-500">{m.sub}</p>
              </div>
            ))}
          </div>
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6">
            <p className="text-slate-300 leading-relaxed">
              Enterprise chains (McDonald&rsquo;s, Darden, Yum!) have multimillion-dollar ERP and financial systems.
              Independent operators — who represent the <strong className="text-white">majority of US restaurant locations</strong> — have Excel.
              No purpose-built, affordable financial OS has achieved meaningful scale in this segment.
              CashCall is building that layer, and the data it accumulates becomes a compounding moat
              that opens three additional revenue models beyond subscription.
            </p>
          </div>
        </section>

        {/* Ecosystem Architecture */}
        <section className="mb-16">
          <div className="inline-block border rounded-lg px-5 py-2 text-xs font-bold uppercase tracking-widest mb-5" style={{ borderColor: BRAND_BORDER, color: BRAND }}>
            Ecosystem Architecture
          </div>
          <h2 className="text-3xl font-black text-white mb-3">Not just SaaS — a FinTech Ecosystem</h2>
          <p className="text-slate-400 mb-8">Four compounding revenue streams transforming CashCall from a $6× SaaS to an $12× FinTech marketplace.</p>

          {/* 4-Card Grid */}
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-5">
            {/* Core Platform */}
            <div className="rounded-2xl border flex flex-col overflow-hidden" style={{ borderColor: "#00d4a840" }}>
              <div className="px-5 pt-5 pb-4 border-b" style={{ background: "#00d4a80a", borderColor: "#00d4a820" }}>
                <span className="text-[10px] font-bold uppercase tracking-widest" style={{ color: BRAND }}>Core Platform</span>
                <div className="text-2xl mt-3 mb-1" style={{ color: BRAND }}>◆</div>
              </div>
              <div className="p-5 flex flex-col flex-1" style={{ background: "#00d4a806" }}>
                <h3 className="text-white font-black text-base mb-1">SaaS &amp; OCR Engine</h3>
                <p className="font-bold text-sm mb-4" style={{ color: BRAND }}>$80/location/mo</p>
                <p className="text-slate-400 text-xs leading-relaxed flex-1">
                  Daily prime cost dashboard, invoice OCR, POS/payroll sync. The operational data layer that enables every other revenue stream.
                </p>
              </div>
            </div>

            {/* Model A */}
            <div className="rounded-2xl border flex flex-col overflow-hidden" style={{ borderColor: "#3b82f640" }}>
              <div className="px-5 pt-5 pb-4 border-b" style={{ background: "#3b82f60a", borderColor: "#3b82f620" }}>
                <span className="text-[10px] font-bold uppercase tracking-widest text-blue-400">Model A — FinTech</span>
                <div className="text-2xl font-black mt-3 mb-1 text-blue-400">A</div>
              </div>
              <div className="p-5 flex flex-col flex-1" style={{ background: "#3b82f606" }}>
                <h3 className="text-white font-black text-base mb-1">B2B Bill Pay</h3>
                <p className="font-bold text-sm text-blue-400 mb-4">0.5%–1.0% take-rate</p>
                <p className="text-slate-400 text-xs leading-relaxed flex-1">
                  Restaurant operators pay Sysco, US Foods &amp; local vendors directly through CashCall via ACH/virtual card. We capture interchange margin on every transaction.
                </p>
              </div>
            </div>

            {/* Model B */}
            <div className="rounded-2xl border flex flex-col overflow-hidden" style={{ borderColor: "#f59e0b40" }}>
              <div className="px-5 pt-5 pb-4 border-b" style={{ background: "#f59e0b0a", borderColor: "#f59e0b20" }}>
                <span className="text-[10px] font-bold uppercase tracking-widest text-amber-400">Model B — Marketplace</span>
                <div className="text-2xl font-black mt-3 mb-1 text-amber-400">B</div>
              </div>
              <div className="p-5 flex flex-col flex-1" style={{ background: "#f59e0b06" }}>
                <h3 className="text-white font-black text-base mb-1">GPO Vendor Rebates</h3>
                <p className="font-bold text-sm text-amber-400 mb-4">Commission per case</p>
                <p className="text-slate-400 text-xs leading-relaxed flex-1">
                  Aggregated anonymized purchasing volume enables group-buying discounts. We earn a software referral commission on every case ordered through the platform.
                </p>
              </div>
            </div>

            {/* Model C */}
            <div className="rounded-2xl border flex flex-col overflow-hidden" style={{ borderColor: "#a78bfa40" }}>
              <div className="px-5 pt-5 pb-4 border-b" style={{ background: "#a78bfa0a", borderColor: "#a78bfa20" }}>
                <span className="text-[10px] font-bold uppercase tracking-widest text-purple-400">Model C — AI Advisory</span>
                <div className="text-2xl font-black mt-3 mb-1 text-purple-400">C</div>
              </div>
              <div className="p-5 flex flex-col flex-1" style={{ background: "#a78bfa06" }}>
                <h3 className="text-white font-black text-base mb-1">Virtual CFO Add-On</h3>
                <p className="font-bold text-sm text-purple-400 mb-4">+$50–$100/mo premium</p>
                <p className="text-slate-400 text-xs leading-relaxed flex-1">
                  Advanced predictive menu engineering, automated labor scheduling, and benchmark intelligence as a premium AI tier — unlocked after 60 days on platform.
                </p>
              </div>
            </div>
          </div>

          {/* Network Effect bar */}
          <div className="rounded-2xl border p-5 text-center" style={{ borderColor: "#00d4a830", background: "#00d4a808" }}>
            <div className="text-xs uppercase tracking-widest font-bold mb-3 text-slate-400">Network Effect</div>
            <div className="flex flex-wrap justify-center items-center gap-2 text-xs font-bold">
              <span className="px-3 py-1.5 rounded-lg border" style={{ background: "#00d4a812", color: BRAND, borderColor: "#00d4a825" }}>Every new operator</span>
              <span className="text-slate-600">→</span>
              <span className="bg-amber-500/10 text-amber-400 px-3 py-1.5 rounded-lg border border-amber-500/20">enriches price benchmarks</span>
              <span className="text-slate-600">→</span>
              <span className="bg-blue-500/10 text-blue-400 px-3 py-1.5 rounded-lg border border-blue-500/20">improves GPO power</span>
              <span className="text-slate-600">→</span>
              <span className="bg-purple-500/10 text-purple-400 px-3 py-1.5 rounded-lg border border-purple-500/20">generates bill-pay volume</span>
              <span className="text-slate-600">→</span>
              <span className="px-3 py-1.5 rounded-lg border" style={{ background: "#00d4a812", color: BRAND, borderColor: "#00d4a825" }}>increases LTV per operator</span>
            </div>
          </div>
        </section>

        {/* Competitive Moat */}
        <section className="mb-16">
          <h2 className="text-2xl font-black text-white mb-6">Competitive Moat</h2>
          <div className="space-y-3">
            {[
              { icon: "🤖", t: "Restaurant-specific invoice AI", d: "General OCR tools fail on foodservice invoices. CashCall's OCR is trained exclusively on Sysco, US Foods, Restaurant Depot, and Gordon's formats — line items, pack sizes, catch weights, price variances. Competitors without this training can't replicate it without years of data." },
              { icon: "📊", t: "Proprietary vendor price benchmarking network", d: "Every invoice processed adds to a price database no distributor or competitor has. By the time competitors recognize the value, CashCall will have 12-24 months of pricing history across hundreds of restaurants — a structural moat." },
              { icon: "🔗", t: "Deep operational data lock-in", d: "When an operator's invoices, payroll history, POS sales, vendor benchmarks, and 6-month P&L live in CashCall, migration cost is prohibitive. This creates best-in-class retention and predictable recurring revenue from month 2 onward." },
              { icon: "🏦", t: "Data advantage in embedded lending", d: "Banks underwrite restaurants on 3-year tax returns and personal credit. CashCall underwriters see real daily revenue, food cost, and labor cost. This structural information advantage enables better pricing, lower default rates, and deals banks won't touch." },
            ].map((m) => (
              <div key={m.t} className="flex gap-4 p-5 rounded-xl border border-slate-800 bg-slate-900">
                <span className="text-2xl shrink-0">{m.icon}</span>
                <div>
                  <p className="font-bold text-white mb-1">{m.t}</p>
                  <p className="text-sm text-slate-400">{m.d}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Traction */}
        <section className="mb-16">
          <h2 className="text-2xl font-black text-white mb-6">Traction & Milestones</h2>
          <div className="space-y-3">
            {[
              { date: "Q4 2025", event: "Product inception — CashCall built to solve internal financial visibility problems at HBK Restaurant Group" },
              { date: "Q1 2026", event: "Core platform launched: real-time prime cost, food cost logging, AI invoice OCR with line-item capture" },
              { date: "Q2 2026", event: "POS integrations live: Clover, Toast, Square — automated daily sales sync with no manual entry" },
              { date: "Q3 2026", event: "Document Vault launched with duplicate invoice detection; payroll integrations (ADP, QuickBooks Payroll, Gusto, Paychex)" },
              { date: "Q4 2026", event: "Vendor Market Intelligence launched — real-time price benchmarking vs. Sysco, US Foods, Restaurant Depot, Costco market rates" },
              { date: "Q4 2026", event: "Daily P&L digest via WhatsApp and email — automated morning send with profit/loss, food cost %, labor %, and price alerts" },
            ].map((item) => (
              <div key={item.date} className="flex gap-4 items-start">
                <span className="text-xs font-mono px-2.5 py-1 rounded-full border mt-0.5 whitespace-nowrap shrink-0" style={{ borderColor: "#00d4a840", color: BRAND }}>{item.date}</span>
                <p className="text-sm text-slate-300 leading-relaxed">{item.event}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Roadmap */}
        <section className="mb-16">
          <h2 className="text-2xl font-black text-white mb-3">Roadmap</h2>
          <p className="text-slate-400 mb-8">Four unlock phases — each one expanding the revenue surface as the network matures.</p>
          <div className="relative">
            {/* vertical line */}
            <div className="absolute left-[5.5rem] top-0 bottom-0 w-px bg-slate-800 hidden sm:block" />
            <div className="space-y-0">
              {[
                {
                  q: "Q1 2027", status: "target", color: BRAND, borderColor: "#00d4a840", bg: "#00d4a80a",
                  title: "Seed Round Closes · $750K",
                  items: ["25+ active restaurant locations", "Core SaaS fully productized", "Bill Pay integration in beta with 5 pilot operators"],
                },
                {
                  q: "Q2 2027", status: "roadmap", color: "#3b82f6", borderColor: "#3b82f640", bg: "#3b82f60a",
                  title: "Model A Live — B2B Bill Pay",
                  items: ["First transaction revenue — 0.5%–1.0% take on invoice payments", "ACH + virtual card rails integrated", "Sysco & US Foods payment flows live"],
                },
                {
                  q: "Q3 2027", status: "roadmap", color: "#f59e0b", borderColor: "#f59e0b40", bg: "#f59e0b0a",
                  title: "Model B Live — GPO Rebates",
                  items: ["Group purchasing organization partnerships signed", "Commission per case flowing from collective volume", "Price benchmarks across 50+ restaurants driving GPO negotiations"],
                },
                {
                  q: "Q4 2027", status: "roadmap", color: BRAND, borderColor: "#00d4a840", bg: "#00d4a80a",
                  title: "100+ Locations · Series A Prep",
                  items: ["Network effect measurable — operator LTV compounding", "Data asset: 18+ months of proprietary price intelligence", "Series A pitch with proven multi-revenue model"],
                },
                {
                  q: "Q1 2028", status: "roadmap", color: "#a78bfa", borderColor: "#a78bfa40", bg: "#a78bfa0a",
                  title: "Model C Live — Virtual CFO",
                  items: ["AI menu engineering + labor scheduling premium tier", "+$50–$100/mo per location add-on revenue", "Benchmark intelligence across 100+ restaurant network"],
                },
              ].map((r, i) => (
                <div key={r.q} className="flex gap-5 items-start pb-8 last:pb-0">
                  <div className="shrink-0 w-20 text-right">
                    <span className="text-xs font-mono font-bold" style={{ color: r.color }}>{r.q}</span>
                  </div>
                  <div className="relative shrink-0 hidden sm:flex items-center justify-center w-3 mt-0.5">
                    <div className="w-3 h-3 rounded-full border-2 z-10" style={{ borderColor: r.color, background: r.bg }} />
                  </div>
                  <div className="rounded-2xl border p-5 flex-1" style={{ borderColor: r.borderColor, background: r.bg }}>
                    <p className="font-black text-white mb-3">{r.title}</p>
                    <div className="space-y-1.5">
                      {r.items.map((it) => (
                        <div key={it} className="flex items-start gap-2 text-slate-400 text-xs">
                          <span style={{ color: r.color }} className="shrink-0 mt-0.5">→</span>
                          {it}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Competitive Moat Table */}
        <section className="mb-16">
          <div className="inline-block border rounded-lg px-5 py-2 text-xs font-bold uppercase tracking-widest mb-5" style={{ borderColor: BRAND_BORDER, color: BRAND }}>
            Competitive Moat
          </div>
          <h2 className="text-3xl font-black text-white mb-3">Purpose-built for independent operators — not an afterthought in enterprise ERP</h2>
          <div className="overflow-x-auto mt-8">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr>
                  <th className="text-left text-slate-500 font-semibold py-3 pr-4 text-xs">Feature</th>
                  {[
                    { name: "CashCall", highlight: true },
                    { name: "Restaurant365", highlight: false },
                    { name: "MarginEdge", highlight: false },
                    { name: "QuickBooks", highlight: false },
                  ].map((col) => (
                    <th key={col.name} className={`text-center py-3 px-4 text-xs font-bold rounded-t-xl ${col.highlight ? "text-slate-950" : "text-slate-400"}`}
                      style={col.highlight ? { background: BRAND } : {}}>
                      {col.name}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {[
                  { feature: "Daily Prime Cost Alert",      cc: "✓",              r365: "✓",       me: "✓",       qb: "✗" },
                  { feature: "Invoice OCR (< 60 sec)",      cc: "✓",              r365: "Partial", me: "✓",       qb: "✗" },
                  { feature: "AI Insights (Plain English)", cc: "✓",              r365: "✗",       me: "✗",       qb: "✗" },
                  { feature: "B2B Bill Pay Integration",    cc: "✓ (Roadmap)",    r365: "✗",       me: "✗",       qb: "✗" },
                  { feature: "GPO Marketplace Rebates",     cc: "✓ (Roadmap)",    r365: "✗",       me: "✗",       qb: "✗" },
                  { feature: "< 5 min Setup",               cc: "✓",              r365: "✗",       me: "Partial", qb: "✓" },
                  { feature: "Price per Location/mo",       cc: "$80",            r365: "$599+",   me: "$300+",   qb: "$30" },
                  { feature: "Built for Indie Operators",   cc: "✓",              r365: "✗",       me: "Partial", qb: "✗" },
                ].map((row, i) => (
                  <tr key={row.feature} className={i % 2 === 0 ? "bg-slate-900/40" : ""}>
                    <td className="py-3.5 pr-4 text-slate-300 text-xs font-medium border-b border-slate-800/60">{row.feature}</td>
                    {[
                      { val: row.cc,   highlight: true  },
                      { val: row.r365, highlight: false },
                      { val: row.me,   highlight: false },
                      { val: row.qb,   highlight: false },
                    ].map((cell, ci) => {
                      const isCheck = cell.val === "✓" || cell.val.startsWith("✓");
                      const isCross = cell.val === "✗";
                      const isPrice = cell.val.startsWith("$");
                      return (
                        <td key={ci} className={`text-center py-3.5 px-4 text-xs font-bold border-b border-slate-800/60 ${cell.highlight ? "border-l border-r" : ""}`}
                          style={cell.highlight ? { borderLeftColor: "#00d4a820", borderRightColor: "#00d4a820" } : {}}>
                          {cell.highlight ? (
                            <span style={{ color: isCheck ? BRAND : isPrice ? BRAND : "#94a3b8" }}>{cell.val}</span>
                          ) : (
                            <span className={isCross ? "text-red-500" : isCheck ? "text-green-400" : "text-slate-500"}>{cell.val}</span>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="mt-4 rounded-xl border p-4 text-center text-xs font-bold" style={{ borderColor: BRAND_BORDER, background: "#00d4a808", color: BRAND }}>
            CashCall is 4–8× cheaper than nearest competitors · Better AI insights · Faster setup · The only platform with FinTech expansion capability
          </div>
        </section>

        {/* Investment Thesis */}
        <section className="mb-16">
          <h2 className="text-2xl font-black text-white mb-6">Why Now</h2>
          <div className="grid sm:grid-cols-2 gap-4">
            {[
              { icon: "📱", t: "WhatsApp-first generation", d: "Restaurant operators — especially first-gen immigrant entrepreneurs — live on WhatsApp. The daily digest is the natural format for this customer. Legacy software companies aren't building for this." },
              { icon: "🤖", t: "AI invoice OCR is finally good enough", d: "Multimodal models can now read a Sysco invoice reliably. The tech that blocked this category two years ago is solved. First movers who build the training data win the category." },
              { icon: "📉", t: "Post-pandemic cost pressure is permanent", d: "Food inflation, labor costs, and insurance have structurally increased. Operators who don't have real-time financial visibility will not survive the next economic cycle." },
              { icon: "🏦", t: "Restaurant fintech is underbuilt", d: "Square and Toast focused on POS. QuickBooks is generic. No one has built the vertical financial OS — P&L, lending, benchmarking — specifically for independent restaurants. The category is open." },
            ].map((m) => (
              <div key={m.t} className="flex gap-4 p-5 rounded-xl border border-slate-800 bg-slate-900">
                <span className="text-2xl shrink-0">{m.icon}</span>
                <div>
                  <p className="font-bold text-white mb-1">{m.t}</p>
                  <p className="text-sm text-slate-400">{m.d}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Investor Reel Video */}
        <section className="mb-16">
          <div className="text-center mb-4">
            <span className="inline-block border text-xs font-semibold px-4 py-1.5 rounded-full uppercase tracking-widest" style={{ background: "#00d4a810", borderColor: "#00d4a830", color: BRAND }}>
              🎬 Investor Overview — 2 min
            </span>
          </div>
          <div className="rounded-2xl overflow-hidden border bg-slate-900" style={{ borderColor: "#00d4a830" }}>
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
        </section>

        {/* Pitch Deck */}
        <section className="mb-16">
          <h2 className="text-2xl font-black text-white mb-3">Investor Pitch Deck</h2>
          <p className="text-slate-400 mb-6">Full business model, market analysis, traction, and investment thesis — in one deck.</p>
          <div className="rounded-2xl border overflow-hidden" style={{ borderColor: "#00d4a830", background: "#00d4a808" }}>
            {/* Deck preview header */}
            <div className="px-8 py-6 flex flex-col sm:flex-row items-start sm:items-center gap-5 border-b" style={{ borderColor: "#00d4a820" }}>
              <div className="w-14 h-14 rounded-2xl flex items-center justify-center text-3xl flex-shrink-0" style={{ background: "#00d4a815", border: "1px solid #00d4a830" }}>
                📊
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-black text-white text-lg">CashCall — Investor Pitch Deck 2026</p>
                <p className="text-slate-400 text-sm mt-1">Market opportunity · Business model · Traction · Investment thesis · $750K seed round</p>
              </div>
              <div className="flex gap-3 flex-wrap flex-shrink-0">
                <a
                  href="/CashCall_PitchDeck_2026.pdf"
                  download
                  className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl font-bold text-slate-950 hover:opacity-90 transition-opacity text-sm"
                  style={{ background: BRAND }}
                >
                  ⬇ Download PDF
                </a>
                <a
                  href="/CashCall_PitchDeck_2026.pdf"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl font-bold border text-white hover:border-slate-400 transition-colors text-sm"
                  style={{ borderColor: "#00d4a840" }}
                >
                  ↗ Open in browser
                </a>
              </div>
            </div>
            {/* Deck highlights */}
            <div className="px-8 py-5 grid sm:grid-cols-4 gap-4">
              {[
                { n: "14", label: "Slides" },
                { n: "$750K", label: "Seed ask" },
                { n: "16.7%", label: "Equity offered" },
                { n: "4-yr", label: "Location roadmap" },
              ].map((s) => (
                <div key={s.label} className="text-center">
                  <p className="text-xl font-black" style={{ color: BRAND }}>{s.n}</p>
                  <p className="text-xs text-slate-500 mt-0.5">{s.label}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Contact */}
        <section className="rounded-2xl p-8 border" style={{ background: BRAND_DIM, borderColor: BRAND_BORDER }}>
          <h2 className="text-2xl font-black text-white mb-3">Investor Contact</h2>
          <p className="text-slate-400 mb-6 leading-relaxed">
            CashCall is currently in active growth mode, onboarding restaurant groups and refining the product.
            We are selectively taking meetings with investors aligned with our ecosystem vision.
            Reach out directly for a deck, data room access, or a call.
          </p>
          <div className="flex flex-wrap gap-4 mb-6">
            <a
              href="mailto:investors@cashcall.io"
              className="inline-flex items-center gap-2 px-6 py-3 rounded-xl font-bold text-slate-950 hover:opacity-90 transition-opacity"
              style={{ background: BRAND }}
            >
              investors@cashcall.io →
            </a>
            <Link
              href="/about"
              className="inline-flex items-center gap-2 px-6 py-3 rounded-xl font-bold border border-slate-600 hover:border-slate-400 text-white transition-colors"
            >
              About the Team
            </Link>
          </div>
          <p className="text-xs text-slate-600">
            This page contains forward-looking statements and market estimates. Past performance of market analogues
            does not guarantee future results. Investment inquiries are subject to applicable securities laws.
          </p>
        </section>
      </main>

      <InvestorsFooter />
    </div>
  );
}

function InvestorsFooter() {
  return (
    <footer className="border-t border-slate-800 py-10 px-6 text-center text-xs text-slate-600">
      <div className="flex items-center justify-center gap-2 mb-2">
        <span className="font-bold" style={{ color: BRAND }}>⚡ CashCall</span>
        <span>Restaurant Financial OS</span>
      </div>
      <div className="flex justify-center gap-6 mt-4 flex-wrap">
        <Link href="/" className="hover:text-white transition-colors">Home</Link>
        <Link href="/about" className="hover:text-white transition-colors">About</Link>
        <Link href="/press" className="hover:text-white transition-colors">Press</Link>
        <Link href="/security" className="hover:text-white transition-colors">Security</Link>
        <Link href="/sandbox" className="hover:text-white transition-colors">Live Demo</Link>
        <Link href="/login" className="hover:text-white transition-colors">Sign In</Link>
      </div>
    </footer>
  );
}
