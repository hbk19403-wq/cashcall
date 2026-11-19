"use client";

import { useEffect, useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

const FEATURES = [
  { icon: "📊", title: "Real-time P&L", desc: "Prime cost, food %, labor % — all from your Clover sales data, updated daily." },
  { icon: "🧾", title: "AI Invoice Scanning", desc: "Photograph invoices. AI reads every line item and logs food costs automatically." },
  { icon: "📈", title: "Sales Analytics", desc: "Trends, weekly pulse, MoM comparisons — see exactly where you're making and losing money." },
  { icon: "🔔", title: "Daily Digest", desc: "Get a text or email every morning with yesterday's sales, labor cost, and cash position." },
  { icon: "💰", title: "Cost Intelligence", desc: "Spot price spikes, compare vendor quotes, and catch margin bleed before it compounds." },
  { icon: "🏪", title: "Multi-location", desc: "Run multiple restaurants? See all locations on one dashboard with side-by-side comparison." },
];

// Inner component that calls useSearchParams (must be inside <Suspense>)
function CloverInstallContent() {
  const params = useSearchParams();
  const merchantId = params.get("merchant_id") ?? params.get("mid") ?? "";
  const pending    = params.get("pending") === "1";
  const hint       = params.get("hint") ?? "";

  const [user, setUser]       = useState<{ email: string } | null>(null);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(({ data }) => {
      setUser(data.user ? { email: data.user.email ?? "" } : null);
      setChecking(false);
    });
    if (merchantId) sessionStorage.setItem("clover_merchant_id", merchantId);
  }, [merchantId]);

  const connectHref = `/api/pos/clover/connect?source=app_market`;
  const loginHref   = `/login?returnTo=${encodeURIComponent("/clover/connect")}`;
  const signupHref  = `/signup?returnTo=${encodeURIComponent("/clover/connect")}`;

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      {/* Header */}
      <div className="border-b border-gray-800 px-6 py-4 flex items-center gap-3">
        <div className="w-8 h-8 rounded-lg bg-green-500 flex items-center justify-center font-bold text-black text-sm">C</div>
        <span className="font-semibold text-white">CashCall</span>
        <span className="text-gray-500 text-sm ml-1">× Clover POS</span>
      </div>

      {/* Hero */}
      <div className="max-w-2xl mx-auto px-6 pt-16 pb-10 text-center">
        <div className="inline-flex items-center gap-2 bg-green-500/10 border border-green-500/30 rounded-full px-4 py-1.5 text-green-400 text-sm mb-6">
          <span>✓</span> Official Clover App Market Partner
        </div>
        <h1 className="text-4xl font-bold mb-4 leading-tight">
          Turn your Clover data into<br />
          <span className="text-green-400">restaurant intelligence</span>
        </h1>
        <p className="text-gray-400 text-lg mb-10">
          CashCall connects to your Clover POS and gives you a full financial
          dashboard — P&amp;L, prime cost, cash flow, and AI-powered cost control —
          built for independent operators.
        </p>

        {pending && hint === "login" && (
          <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-4 mb-6 text-amber-300 text-sm">
            Please sign in to your CashCall account to complete the Clover connection.
          </div>
        )}

        {checking ? (
          <div className="h-12 flex items-center justify-center text-gray-500 text-sm">Checking your session…</div>
        ) : user ? (
          <div className="space-y-3">
            <p className="text-gray-400 text-sm">Signed in as <span className="text-white">{user.email}</span></p>
            <a href={connectHref} className="block w-full max-w-sm mx-auto bg-green-500 hover:bg-green-400 text-black font-bold py-3.5 rounded-xl transition-colors text-center">
              Connect Clover to CashCall →
            </a>
          </div>
        ) : (
          <div className="space-y-3 max-w-sm mx-auto">
            <a href={signupHref} className="block w-full bg-green-500 hover:bg-green-400 text-black font-bold py-3.5 rounded-xl transition-colors text-center">
              Create free CashCall account →
            </a>
            <a href={loginHref} className="block w-full bg-gray-800 hover:bg-gray-700 text-white font-semibold py-3.5 rounded-xl transition-colors text-center">
              Sign in to existing account
            </a>
            <p className="text-gray-500 text-xs text-center mt-2">Free 14-day trial · No credit card required</p>
          </div>
        )}
      </div>

      {/* Features */}
      <div className="max-w-2xl mx-auto px-6 pb-16">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {FEATURES.map(f => (
            <div key={f.title} className="bg-gray-900 border border-gray-800 rounded-xl p-5">
              <div className="text-2xl mb-2">{f.icon}</div>
              <div className="font-semibold text-white mb-1">{f.title}</div>
              <div className="text-gray-400 text-sm">{f.desc}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Footer */}
      <div className="border-t border-gray-800 px-6 py-6 text-center text-gray-600 text-xs">
        <div className="flex items-center justify-center gap-6 mb-2">
          <Link href="/security" className="hover:text-gray-400 transition-colors">Security</Link>
          <Link href="/about" className="hover:text-gray-400 transition-colors">About</Link>
          <Link href="mailto:support@cashcall.io" className="hover:text-gray-400 transition-colors">Support</Link>
        </div>
        © {new Date().getFullYear()} CashCall · SOC 2 compliant · Your data is never sold
      </div>
    </div>
  );
}

// Default export wraps content in Suspense (required by Next.js when useSearchParams is used)
export default function CloverInstallPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-gray-950 flex items-center justify-center">
        <div className="w-8 h-8 rounded-full border-2 border-green-500 border-t-transparent animate-spin" />
      </div>
    }>
      <CloverInstallContent />
    </Suspense>
  );
}
