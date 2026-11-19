import Link from "next/link";
import type { Metadata } from "next";
import PublicNav from "@/app/components/PublicNav";

export const metadata: Metadata = {
  title: "User Manual — CashCall",
  description: "Complete step-by-step guide to using CashCall: food cost logging, invoice OCR, payroll sync, POS integration, and more.",
};

const BRAND = "#00d4a8";

const SECTIONS = [
  {
    id: "getting-started",
    icon: "🚀",
    title: "Getting Started",
    steps: [
      { n: "1", heading: "Create your account", body: "Go to cashcall.io and click \"Get Started\". Enter your email and choose a password. You'll receive a verification email — click the link inside to activate your account." },
      { n: "2", heading: "Add your first location", body: "After login you'll land on the dashboard. Click \"+ Add Location\" and fill in your restaurant name, address, and state. CashCall supports single-location and multi-location groups — add as many as you operate." },
      { n: "3", heading: "Set your cost targets", body: "Go to Budget → for each location, enter your target food cost %, labor cost %, and infrastructure cost %. CashCall will show variance against these targets in real time." },
      { n: "4", heading: "Try the live demo first", body: "Not ready to enter your own data yet? Visit cashcall.io/sandbox to explore a fully-seeded demo restaurant with 6 months of real data. No login required." },
    ],
  },
  {
    id: "food-cost",
    icon: "🥩",
    title: "Food Cost — Logging & Invoices",
    steps: [
      { n: "→", heading: "Log Entry tab", body: "Go to Location → Food Costs → 📋 Log Entry. Enter your purchase category (Meat & Seafood, Produce, Dairy, etc.), vendor name, amount, and purchase date. Submit to save to your cost log." },
      { n: "→", heading: "AI Invoice OCR (recommended)", body: "Click the camera icon or \"Scan Invoice\" to upload a photo or PDF of any supplier invoice. CashCall's AI reads the document, extracts line items, totals, and category, and pre-fills the form. Review and confirm in under 60 seconds." },
      { n: "→", heading: "Supported invoice formats", body: "CashCall OCR is trained on Sysco, US Foods, Restaurant Depot, Gordon Food Service, PFG, Costco Business, and most regional distributor formats. It also handles handwritten delivery receipts with high accuracy." },
      { n: "→", heading: "This Month tab", body: "See a real-time breakdown of food spend by category for the current month. Color-coded cards show how you're tracking against your food cost % target." },
      { n: "→", heading: "Trends tab", body: "View 6 months of food cost % history as a chart. Identify seasonal patterns, price spikes, and month-over-month movement at a glance." },
      { n: "→", heading: "Price Tracker tab", body: "Compares this month's prices per unit against 1-month, 3-month, and 6-month averages for key commodities you've purchased. Red/orange badges flag items where you're paying significantly more than your own historical average." },
      { n: "→", heading: "🔍 Market Intel tab", body: "Compares your actual invoice prices against live market benchmarks from Sysco, US Foods, Restaurant Depot (benchmark), and Costco Business Center. Items highlighted in red mean you may be overpaying relative to market. Use this when negotiating with vendors." },
    ],
  },
  {
    id: "sales",
    icon: "💰",
    title: "Sales Entry",
    steps: [
      { n: "→", heading: "Daily sales entry", body: "Go to Location → Sales → Enter Today's Sales. Enter food sales, bar/liquor sales, and any other revenue categories. Save each day to build your weekly and monthly totals." },
      { n: "→", heading: "Sales OCR", body: "Upload a photo of your POS daily summary report and CashCall will extract the sales figures automatically. Works with most POS printed reports including Clover, Toast, and Square." },
      { n: "→", heading: "POS auto-sync", body: "Connect your POS (see Integrations section below) and daily sales sync automatically after close. You won't need to enter sales manually once connected." },
    ],
  },
  {
    id: "payroll",
    icon: "👥",
    title: "Payroll & Labor",
    steps: [
      { n: "→", heading: "Manual payroll entry", body: "Go to Location → Payroll → 📥 Import CSV. Export your payroll summary as a CSV from your payroll provider and upload it. CashCall maps employee names, roles, hours, and gross wages automatically." },
      { n: "→", heading: "Direct payroll sync (recommended)", body: "Go to Payroll → 🔗 Connect. Select your payroll provider (ADP, QuickBooks, Gusto, or Paychex), enter your Client ID and API Token from your provider's developer portal, and click Save & Connect. After each pay period, labor data syncs automatically." },
      { n: "→", heading: "Where to find your API credentials", body: "ADP: My Account → Marketplace → My Apps → Credentials. QuickBooks: developer.intuit.com → My Apps → Keys & Credentials. Gusto: app.gusto.com → Developer → API. Paychex: developer.paychex.com → My Applications." },
      { n: "→", heading: "Labor breakdown", body: "CashCall breaks labor by role (FOH, BOH, Management, etc.) and shows hours vs. labor cost % against your target for each pay period." },
    ],
  },
  {
    id: "pos",
    icon: "🖥️",
    title: "POS Integration",
    steps: [
      { n: "→", heading: "Connect your POS", body: "Go to Settings → POS Integrations. Select your system: Clover, Toast, or Square. Enter your Merchant ID and API key/token. CashCall will test the connection and begin pulling daily sales." },
      { n: "→", heading: "Clover", body: "Clover Dashboard → Account & Setup → API Tokens → Generate a new token. Merchant ID is shown in your Clover dashboard URL." },
      { n: "→", heading: "Toast", body: "Toast Web → Integrations → API Access → Create API key. Your Restaurant GUID serves as the Merchant ID." },
      { n: "→", heading: "Square", body: "developer.squareup.com → Applications → your app → OAuth → Access Token. Location ID from Square Dashboard is your Merchant ID." },
      { n: "→", heading: "Sync frequency", body: "CashCall pulls new sales data every night at 2am local time. You can also trigger a manual sync from the POS Integrations page at any time." },
    ],
  },
  {
    id: "documents",
    icon: "📁",
    title: "Document Vault",
    steps: [
      { n: "→", heading: "Upload documents", body: "Go to Location → Documents. Upload any file: invoices, contracts, health inspection reports, vendor agreements, insurance certificates. Supported formats: PDF, JPG, PNG, XLSX, DOCX." },
      { n: "→", heading: "Duplicate detection", body: "CashCall automatically detects duplicate invoices using file hash comparison. If you try to upload a document you've already stored, you'll see a warning before it saves — preventing accidental double-processing." },
      { n: "→", heading: "Security", body: "All documents are encrypted with AES-256 before storage. Only your account can access them. CashCall's zero-knowledge architecture means even our team cannot view your documents." },
    ],
  },
  {
    id: "analytics",
    icon: "📊",
    title: "Analytics & Reporting",
    steps: [
      { n: "→", heading: "Prime cost dashboard", body: "The main dashboard shows your prime cost (food + labor as % of revenue) for the current month, with a trend line vs. prior months. Green = on target. Yellow = approaching limit. Red = over target." },
      { n: "→", heading: "Location comparison", body: "Multi-location operators see a side-by-side card view across all locations, with prime cost badges making it instantly clear which locations need attention." },
      { n: "→", heading: "Analytics deep-dive", body: "Go to Analytics for 6-month charts across food cost %, labor cost %, revenue, and prime cost. Quarter-over-quarter comparison highlights improvement or deterioration trends." },
      { n: "→", heading: "Export to Excel", body: "Click the Export button on any location page to download a full multi-sheet Excel workbook with all data: sales, food costs, payroll, invoices, and analytics summary." },
      { n: "→", heading: "Budget vs. actual", body: "Go to Budget to see this month's actual costs vs. your targets for food, labor, and infrastructure. Variance is shown in dollars and percentage — positive = under target, negative = over." },
    ],
  },
  {
    id: "tips",
    icon: "💡",
    title: "Tips for Best Results",
    steps: [
      { n: "✓", heading: "Scan invoices same-day", body: "The fastest operators scan invoices as delivery drivers hand them over. The 60-second habit prevents backlogs and keeps food cost data current." },
      { n: "✓", heading: "Check Market Intel before vendor calls", body: "Before your weekly or monthly vendor call, pull up the Market Intel tab. It shows where your prices deviate from benchmarks and gives you data to negotiate from." },
      { n: "✓", heading: "Set realistic targets first", body: "Food cost % varies by concept: QSR typically runs 28–32%, full-service 30–35%, fine dining 25–30%. Set your targets to match your concept, not industry averages." },
      { n: "✓", heading: "Connect POS before payroll", body: "Revenue data is the denominator in all cost percentage calculations. Connect your POS first so that food and labor cost percentages are accurate from day one." },
      { n: "✓", heading: "Use the Demo for training", body: "When training new managers, send them to cashcall.io/sandbox — it's a fully functional demo with real data that they can explore without affecting your live numbers." },
    ],
  },
];

export default function ManualPage() {
  return (
    <div className="min-h-screen bg-gray-950 text-white">
      <PublicNav active="/manual" />

      <div className="max-w-5xl mx-auto px-6 pt-32 pb-24 flex gap-8">

        {/* Sidebar — table of contents */}
        <aside className="hidden lg:block w-52 flex-shrink-0">
          <div className="sticky top-28">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-4">Contents</p>
            <nav className="space-y-1">
              {SECTIONS.map(s => (
                <a key={s.id} href={`#${s.id}`}
                  className="flex items-center gap-2 text-sm text-gray-400 hover:text-white py-1.5 transition-colors">
                  <span>{s.icon}</span>
                  <span>{s.title}</span>
                </a>
              ))}
            </nav>
            <div className="mt-8 pt-6 border-t border-white/8">
              <p className="text-xs text-gray-500 mb-3">Need help?</p>
              <a href="mailto:support@cashcall.io" className="text-xs font-semibold hover:underline" style={{ color: BRAND }}>
                support@cashcall.io →
              </a>
            </div>
          </div>
        </aside>

        {/* Main content */}
        <main className="flex-1 min-w-0">
          <div className="mb-12">
            <p className="text-sm font-semibold mb-3" style={{ color: BRAND }}>📖 User Manual</p>
            <h1 className="text-4xl font-bold mb-4">CashCall Complete Guide</h1>
            <p className="text-gray-400 text-lg">
              Everything you need to get your restaurant's finances under control — from first login to advanced analytics.
            </p>
            <div className="flex gap-3 mt-6 flex-wrap">
              <Link href="/sandbox" className="px-5 py-2 rounded-lg text-sm font-bold text-gray-900 hover:opacity-90" style={{ background: BRAND }}>
                Try Live Demo →
              </Link>
              <a href="mailto:support@cashcall.io" className="px-5 py-2 rounded-lg text-sm font-bold border border-white/20 hover:bg-white/5 transition-colors">
                Contact Support
              </a>
            </div>
          </div>

          <div className="space-y-16">
            {SECTIONS.map(section => (
              <section key={section.id} id={section.id}>
                <div className="flex items-center gap-3 mb-6">
                  <span className="text-3xl">{section.icon}</span>
                  <h2 className="text-2xl font-bold">{section.title}</h2>
                </div>
                <div className="space-y-4">
                  {section.steps.map((step, i) => (
                    <div key={i} className="flex gap-4 p-5 rounded-xl border border-white/8 bg-white/3">
                      <span className="flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold text-gray-900 mt-0.5" style={{ background: BRAND }}>
                        {step.n}
                      </span>
                      <div>
                        <p className="font-semibold mb-1">{step.heading}</p>
                        <p className="text-sm text-gray-400 leading-relaxed">{step.body}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            ))}
          </div>

          {/* Support CTA */}
          <div className="mt-16 rounded-2xl p-8 border text-center" style={{ background: `${BRAND}0d`, borderColor: `${BRAND}25` }}>
            <h2 className="text-xl font-bold mb-2">Still have questions?</h2>
            <p className="text-gray-400 mb-5 text-sm">Our support team responds within one business day.</p>
            <div className="flex justify-center gap-3 flex-wrap">
              <a href="mailto:support@cashcall.io" className="px-5 py-2.5 rounded-xl font-bold text-gray-900 hover:opacity-90" style={{ background: BRAND }}>
                Email Support →
              </a>
              <Link href="/sandbox" className="px-5 py-2.5 rounded-xl font-bold border border-white/20 hover:bg-white/5 transition-colors">
                Try the Demo
              </Link>
            </div>
          </div>
        </main>
      </div>

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
