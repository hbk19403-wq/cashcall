import Link from "next/link";
import type { Metadata } from "next";
import PublicNav from "@/app/components/PublicNav";

export const metadata: Metadata = {
  title: "Press & Media — CashCall",
  description: "Press releases, media assets, and news coverage for CashCall, the restaurant financial operating system.",
};

const BRAND = "#00d4a8";

const RELEASES = [
  {
    date: "October 2026",
    tag: "Product Launch",
    headline: "CashCall Launches Market Intelligence Feature — Giving Independent Restaurants Real-Time Vendor Price Benchmarks",
    body: "CashCall today announced the launch of Market Intel, a new module that automatically compares each restaurant's invoice prices against live market benchmarks from Sysco, US Foods, Restaurant Depot, and Costco Business Center. The feature flags price spikes and identifies overpay in real time, turning passive invoice data into actionable savings intelligence.",
    quote: { text: "Operators have always known they were sometimes overpaying suppliers — but they never had the data to prove it or negotiate from a position of strength. Market Intel changes that.", author: "HBK, Founder & CEO, CashCall" },
  },
  {
    date: "September 2026",
    tag: "Product Update",
    headline: "CashCall Adds Direct Payroll API Integrations — ADP, QuickBooks, Gusto, and Paychex Now Connect Natively",
    body: "CashCall has replaced manual CSV payroll imports with direct API connections to the four most common payroll providers used by independent restaurant groups. Labor cost data now syncs automatically after each pay period, eliminating one of the last manual data-entry steps in the prime cost calculation workflow.",
    quote: { text: "Payroll is the second-biggest cost in any restaurant. Having it flow automatically into prime cost — without anyone touching a spreadsheet — is a genuine breakthrough for operators running lean teams.", author: "HBK, Founder & CEO, CashCall" },
  },
  {
    date: "July 2026",
    tag: "Company News",
    headline: "CashCall Launches Enterprise-Grade Document Vault for Restaurant Operators",
    body: "CashCall's new Document Vault gives restaurant operators a secure, searchable home for every invoice, contract, health inspection report, and vendor agreement — all encrypted at rest with AES-256 and zero-knowledge architecture. Duplicate invoice detection prevents double-processing with automatic hash comparison on upload.",
    quote: { text: "The average independent restaurant operator has their financial documents scattered across email inboxes, WhatsApp threads, and file cabinet folders. We wanted to fix that entirely.", author: "HBK, Founder & CEO, CashCall" },
  },
  {
    date: "April 2026",
    tag: "Platform Launch",
    headline: "CashCall Emerges From Stealth as the Financial OS for Independent Restaurants",
    body: "CashCall, a new SaaS platform built exclusively for independent and small-group restaurant operators, today announced its public launch. The platform delivers prime cost automation, AI-powered invoice OCR, POS integration, and multi-location analytics in a mobile-first interface designed for operators who don't have a CFO.",
    quote: { text: "Enterprise restaurant chains have multi-million-dollar financial systems. Independent operators have Excel. We built everything in between.", author: "HBK, Founder & CEO, CashCall" },
  },
];

export default function PressPage() {
  return (
    <div className="min-h-screen bg-gray-950 text-white">
      <PublicNav active="/press" />

      <main className="max-w-4xl mx-auto px-6 pt-32 pb-24">

        {/* Hero */}
        <div className="mb-12">
          <p className="text-sm font-semibold mb-3" style={{ color: BRAND }}>Press & Media</p>
          <h1 className="text-4xl sm:text-5xl font-bold leading-tight mb-4">Newsroom</h1>
          <p className="text-gray-400 text-lg max-w-2xl">
            Press releases, product announcements, and media resources for journalists covering restaurant technology and independent restaurant business.
          </p>
        </div>

        {/* Media contact */}
        <div className="rounded-xl p-5 mb-12 border border-white/10 bg-white/3 flex flex-wrap gap-6 items-center justify-between">
          <div>
            <p className="font-semibold mb-1">Media Inquiries</p>
            <p className="text-sm text-gray-400">For press and analyst inquiries, interview requests, or media assets:</p>
          </div>
          <a href="mailto:press@cashcall.io" className="px-5 py-2 rounded-lg text-sm font-bold text-gray-900 hover:opacity-90 transition-opacity" style={{ background: BRAND }}>
            press@cashcall.io →
          </a>
        </div>

        {/* Press releases */}
        <section className="mb-16">
          <h2 className="text-2xl font-bold mb-8">Press Releases</h2>
          <div className="space-y-8">
            {RELEASES.map((r, i) => (
              <article key={i} className="rounded-2xl p-6 border border-white/8 bg-white/3">
                <div className="flex items-center gap-3 mb-3 flex-wrap">
                  <span className="text-xs font-semibold px-2.5 py-1 rounded-full text-gray-900" style={{ background: BRAND }}>{r.tag}</span>
                  <span className="text-xs text-gray-500">{r.date}</span>
                </div>
                <h3 className="text-lg font-bold mb-3 leading-snug">{r.headline}</h3>
                <p className="text-sm text-gray-400 leading-relaxed mb-4">{r.body}</p>
                <blockquote className="border-l-2 pl-4 text-sm text-gray-300 italic" style={{ borderColor: BRAND }}>
                  &ldquo;{r.quote.text}&rdquo;
                  <footer className="mt-1 text-xs text-gray-500 not-italic">— {r.quote.author}</footer>
                </blockquote>
              </article>
            ))}
          </div>
        </section>

        {/* Brand assets */}
        <section className="mb-16">
          <h2 className="text-2xl font-bold mb-4">Brand & Media Assets</h2>
          <p className="text-gray-400 mb-6 text-sm">Approved logos, screenshots, and brand guidelines for editorial use. All assets are provided for press coverage of CashCall only.</p>
          <div className="grid sm:grid-cols-3 gap-4">
            {[
              { icon: "⚡", title: "Logo Package", desc: "SVG + PNG in light/dark variants, horizontal and stacked" },
              { icon: "📸", title: "Product Screenshots", desc: "High-res dashboard, mobile, and feature screenshots" },
              { icon: "🎨", title: "Brand Guidelines", desc: "Color palette, typography, usage rules" },
            ].map(a => (
              <div key={a.title} className="rounded-xl p-5 border border-white/8 bg-white/3">
                <div className="text-2xl mb-2">{a.icon}</div>
                <p className="font-semibold text-sm mb-1">{a.title}</p>
                <p className="text-xs text-gray-400 mb-3">{a.desc}</p>
                <a href="mailto:press@cashcall.io" className="text-xs font-semibold hover:underline" style={{ color: BRAND }}>Request →</a>
              </div>
            ))}
          </div>
        </section>

        {/* Key facts */}
        <section className="rounded-2xl p-8 border" style={{ background: `${BRAND}0d`, borderColor: `${BRAND}25` }}>
          <h2 className="text-xl font-bold mb-6">Company Quick Facts</h2>
          <dl className="grid sm:grid-cols-2 gap-4 text-sm">
            {[
              ["Founded", "2025"],
              ["Headquarters", "United States"],
              ["Product focus", "Independent & small-group restaurant operators"],
              ["Core product", "Restaurant financial OS — prime cost, food cost, payroll, POS integration"],
              ["Key differentiator", "AI invoice OCR + real-time vendor price benchmarking"],
              ["Data security", "AES-256 encryption, zero-knowledge architecture"],
              ["Supported providers", "Clover, Toast, Square, ADP, QuickBooks, Gusto, Paychex"],
              ["Contact", "press@cashcall.io"],
            ].map(([k, v]) => (
              <div key={k} className="flex gap-2">
                <dt className="text-gray-500 min-w-[120px]">{k}:</dt>
                <dd className="text-gray-200 font-medium">{v}</dd>
              </div>
            ))}
          </dl>
        </section>
      </main>

      <Footer />
    </div>
  );
}

function Footer() {
  return (
    <footer className="border-t py-10 px-6 text-center text-xs text-gray-500" style={{ borderColor: "rgba(255,255,255,0.06)" }}>
      <div className="flex items-center justify-center gap-2 mb-2">
        <span className="font-bold" style={{ color: BRAND }}>⚡ CashCall</span>
        <span>Restaurant Financial OS</span>
      </div>
      <p className="text-gray-600">AES-256 encrypted · Zero-knowledge architecture · Built for serious operators</p>
      <div className="flex justify-center gap-6 mt-4 flex-wrap">
        <Link href="/about" className="hover:text-white transition-colors">About</Link>
        <Link href="/press" className="hover:text-white transition-colors">Press</Link>
        <Link href="/investors" className="hover:text-white transition-colors">Investors</Link>
        <Link href="/manual" className="hover:text-white transition-colors">📖 User Manual</Link>
        <Link href="/security" className="hover:text-white transition-colors">🔐 Security</Link>
        <Link href="/login" className="hover:text-white transition-colors">Sign In</Link>
        <Link href="/sandbox" className="hover:text-white transition-colors">Live Demo</Link>
      </div>
    </footer>
  );
}
