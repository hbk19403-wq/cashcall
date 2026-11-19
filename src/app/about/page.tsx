import Link from "next/link";
import type { Metadata } from "next";
import PublicNav from "@/app/components/PublicNav";

export const metadata: Metadata = {
  title: "About Us — CashCall",
  description: "CashCall is the financial operating system built exclusively for independent restaurant operators. Our story, mission, and team.",
};

const BRAND = "#00d4a8";
const BRAND_DIM = "#00d4a820";
const BRAND_BORDER = "#00d4a830";

export default function AboutPage() {
  return (
    <div className="min-h-screen bg-[#07080d] text-white">
      <PublicNav active="/about" />

      <main className="max-w-4xl mx-auto px-6 pt-32 pb-24">

        {/* Hero */}
        <div className="mb-16">
          <p className="text-sm font-semibold mb-3" style={{ color: BRAND }}>Our Story</p>
          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-black leading-tight mb-6">
            Built by operators,<br />
            <span style={{ color: BRAND }}>for operators.</span>
          </h1>
          <p className="text-lg text-slate-400 leading-relaxed max-w-2xl">
            CashCall was born inside a real restaurant group — not a startup lab.
            The founder ran HBK Restaurant Group and kept hitting the same wall: by the time
            the accountant called, the damage was already done. Weeks of food cost overruns,
            unchecked Friday overtime, vendor price creep — all invisible until month-end.
            CashCall is the tool we built to fix that.
          </p>
        </div>

        {/* Origin Story */}
        <section className="rounded-2xl p-8 mb-14 border" style={{ background: BRAND_DIM, borderColor: BRAND_BORDER }}>
          <h2 className="text-xl font-black mb-4" style={{ color: BRAND }}>Where it started</h2>
          <div className="space-y-4 text-slate-300 leading-relaxed">
            <p>
              <strong className="text-white">HBK Restaurant Group</strong> runs multiple locations across New Jersey.
              Like most independent operators, financial reporting was a month-end event — by which point
              a bad week in food cost had already compounded into a bad month in profit.
            </p>
            <p>
              The founder started building internal tools to track prime cost daily. Then invoice OCR to kill
              manual data entry. Then POS sync to pull sales automatically. Then a morning WhatsApp message
              with the previous day&rsquo;s P&L.
            </p>
            <p>
              When other restaurant owners saw those tools and asked &ldquo;how do I get this?&rdquo; — CashCall became a product.
            </p>
          </div>
        </section>

        {/* Mission */}
        <section className="mb-14">
          <h2 className="text-2xl font-black mb-6">Our Mission</h2>
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-7">
            <p className="text-xl text-white leading-relaxed font-semibold">
              To give every independent restaurant operator the same financial clarity that
              enterprise chains spend millions to build —{" "}
              <span style={{ color: BRAND }}>and to deliver it to their phone every morning, automatically.</span>
            </p>
          </div>
        </section>

        {/* The Three Problems */}
        <section className="mb-14">
          <h2 className="text-2xl font-black mb-3">The three problems we solve</h2>
          <p className="text-slate-400 mb-7">Every independent operator we&rsquo;ve talked to has the same three frustrations.</p>
          <div className="space-y-4">
            {[
              {
                icon: "⏰",
                title: "You find out too late",
                body: "By the time the P&L is ready, the problem already happened. Food cost ran 42% for three weeks. Labor overtime went unchecked every Friday. Vendor quietly raised chicken prices $0.53/lb. CashCall tells you tonight what happened today.",
              },
              {
                icon: "📋",
                title: "Manual entry is a second job",
                body: "Chefs and owners spend hours every week manually keying in invoices, pulling sales reports, entering payroll. CashCall connects your POS, reads your invoices via OCR, and pulls your payroll — zero manual entry. Ever.",
              },
              {
                icon: "🔍",
                title: "You can't see where you're bleeding",
                body: "\"Labor is too high\" isn't actionable. Knowing it's specifically Friday dinner shift overtime — at 38%, 3.2 hours over — is. CashCall breaks food cost by category and labor by day and shift so you know exactly where to fix it.",
              },
            ].map((p) => (
              <div key={p.title} className="flex gap-5 p-6 rounded-2xl border border-slate-800 bg-slate-900">
                <div className="text-3xl shrink-0 mt-0.5">{p.icon}</div>
                <div>
                  <h3 className="font-black text-white text-lg mb-2">{p.title}</h3>
                  <p className="text-slate-400 leading-relaxed">{p.body}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* What We Believe */}
        <section className="mb-14">
          <h2 className="text-2xl font-black mb-6">What we believe</h2>
          <div className="grid sm:grid-cols-2 gap-4">
            {[
              { icon: "📱", v: "The phone is the terminal", d: "Restaurant operators don't sit at desks. The daily digest — on WhatsApp, before the first coffee — is more valuable than any dashboard that requires a login." },
              { icon: "🚫", v: "Zero manual entry is non-negotiable", d: "A tool that requires manual data entry is a tool that gets abandoned at month-end crunch. CashCall runs automatically or it doesn't run." },
              { icon: "🔐", v: "Data stays yours", d: "Your financial data is yours. AES-256 encryption, zero-knowledge architecture. We never sell, share, or aggregate your numbers without your explicit consent." },
              { icon: "🎯", v: "Operators over everything", d: "Every feature decision starts with one question: does this help the person on the line at 6pm on a Friday? If not, it doesn't ship." },
              { icon: "⚡", v: "Speed is a feature", d: "A slow tool is no tool. Prime cost in 10 seconds. Invoice OCR in under 60 seconds. Daily digest by 7am. Operators are always mid-service — we design for that." },
              { icon: "🌐", v: "Independence through data", d: "Independents get beaten on purchasing, financing, and benchmarking by chains with scale. CashCall's network gives them collective power they've never had before." },
            ].map((item) => (
              <div key={item.v} className="flex gap-4 p-5 rounded-xl border border-slate-800 bg-slate-900">
                <div className="text-xl shrink-0 mt-0.5">{item.icon}</div>
                <div>
                  <p className="font-bold text-white mb-1">{item.v}</p>
                  <p className="text-sm text-slate-400 leading-relaxed">{item.d}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Team */}
        <section className="mb-14">
          <h2 className="text-2xl font-black mb-2">The team</h2>
          <p className="text-slate-400 mb-8">
            We&rsquo;re a small, focused team of engineers and former restaurant industry professionals.
            We&rsquo;ve worked in kitchens, managed food costs, negotiated vendor contracts, and built software
            at scale. That combination drives every product decision.
          </p>
          <div className="grid sm:grid-cols-3 gap-5">
            {[
              {
                initials: "HBK",
                name: "HBK",
                role: "Founder & CEO",
                bio: "Restaurant operator and entrepreneur behind HBK Restaurant Group. Built CashCall to solve the exact financial visibility problems faced running multi-location operations in New Jersey.",
              },
              {
                initials: "ENG",
                name: "Engineering",
                role: "Product & Technology",
                bio: "Full-stack team with backgrounds in fintech, AI, and data infrastructure. Obsessed with speed and simplicity — prime cost in 10 seconds, OCR in under 60, daily digest by 7am.",
              },
              {
                initials: "OPS",
                name: "Operations",
                role: "Customer Success",
                bio: "Former restaurant GMs and accountants who ensure CashCall maps to how operators actually work — not how consultants think they should. They answer the phone on a Friday night.",
              },
            ].map((t) => (
              <div key={t.initials} className="rounded-2xl p-5 border border-slate-800 bg-slate-900">
                <div
                  className="w-12 h-12 rounded-full flex items-center justify-center font-black text-sm mb-3 text-slate-950"
                  style={{ background: BRAND }}
                >
                  {t.initials}
                </div>
                <p className="font-bold text-white">{t.name}</p>
                <p className="text-xs mb-3" style={{ color: BRAND }}>{t.role}</p>
                <p className="text-xs text-slate-400 leading-relaxed">{t.bio}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Numbers */}
        <section className="mb-14">
          <h2 className="text-2xl font-black mb-6">By the numbers</h2>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {[
              { n: "< 60s", l: "Invoice OCR time" },
              { n: "Daily", l: "P&L digest to phone" },
              { n: "AES-256", l: "Encryption standard" },
              { n: "100%", l: "Independent restaurants" },
            ].map((s) => (
              <div key={s.l} className="rounded-2xl p-5 text-center border border-slate-800 bg-slate-900">
                <p className="text-2xl font-black mb-1" style={{ color: BRAND }}>{s.n}</p>
                <p className="text-xs text-slate-500">{s.l}</p>
              </div>
            ))}
          </div>
        </section>

        {/* CTA */}
        <section className="rounded-2xl p-8 text-center border" style={{ background: BRAND_DIM, borderColor: BRAND_BORDER }}>
          <div className="text-4xl mb-4">⚡</div>
          <h2 className="text-2xl font-black text-white mb-3">Ready to know your numbers?</h2>
          <p className="text-slate-400 mb-7 max-w-md mx-auto">
            Start with the live demo — no signup required. See exactly what a real restaurant P&L
            looks like on CashCall.
          </p>
          <div className="flex justify-center gap-3 flex-wrap">
            <Link
              href="/sandbox"
              className="px-7 py-3 rounded-xl font-black text-slate-950 transition-opacity hover:opacity-90"
              style={{ background: BRAND }}
            >
              Try Live Demo →
            </Link>
            <Link
              href="/trial"
              className="px-7 py-3 rounded-xl font-bold border border-slate-600 hover:border-slate-400 text-white transition-colors"
            >
              Request Access
            </Link>
          </div>
          <p className="text-slate-600 text-xs mt-5">No credit card. No spreadsheets. Just your P&L — every morning.</p>
        </section>
      </main>

      <AboutFooter />
    </div>
  );
}

function AboutFooter() {
  return (
    <footer className="border-t border-slate-800 py-10 px-6 text-center text-xs text-slate-600">
      <div className="flex items-center justify-center gap-2 mb-2">
        <span className="font-bold" style={{ color: BRAND }}>⚡ CashCall</span>
        <span>Restaurant Financial OS</span>
      </div>
      <p className="text-slate-700 mb-4">AES-256 encrypted · Zero-knowledge architecture · Built for serious operators</p>
      <div className="flex justify-center gap-6 flex-wrap">
        <Link href="/" className="hover:text-white transition-colors">Home</Link>
        <Link href="/press" className="hover:text-white transition-colors">Press</Link>
        <Link href="/investors" className="hover:text-white transition-colors">Investors</Link>
        <Link href="/manual" className="hover:text-white transition-colors">User Manual</Link>
        <Link href="/security" className="hover:text-white transition-colors">Security</Link>
        <Link href="/sandbox" className="hover:text-white transition-colors">Live Demo</Link>
        <Link href="/login" className="hover:text-white transition-colors">Sign In</Link>
      </div>
    </footer>
  );
}
