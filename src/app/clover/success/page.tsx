"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";

function CloverSuccessContent() {
  const params   = useSearchParams();
  const merchant = params.get("merchant") ?? "your location";

  return (
    <div className="min-h-screen bg-gray-950 text-white flex flex-col items-center justify-center px-6">
      {/* Success icon */}
      <div className="w-20 h-20 rounded-full bg-green-500/15 border-2 border-green-500 flex items-center justify-center mb-8">
        <svg className="w-10 h-10 text-green-400" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
        </svg>
      </div>

      <h1 className="text-3xl font-bold mb-3 text-center">Clover connected!</h1>
      <p className="text-gray-400 text-center max-w-sm mb-10">
        <span className="text-white font-medium">{merchant}</span> is now linked to CashCall.
        Your sales data will sync automatically every day.
      </p>

      {/* What happens next */}
      <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6 max-w-sm w-full mb-8">
        <h2 className="text-sm font-semibold text-gray-300 uppercase tracking-wide mb-4">What happens next</h2>
        <ul className="space-y-3">
          {[
            { icon: "🔄", text: "First sync runs tonight — yesterday's sales will appear on your dashboard." },
            { icon: "📊", text: "P&L and prime cost update automatically each morning." },
            { icon: "🔔", text: "Set up daily digest texts in your notification settings." },
          ].map(({ icon, text }) => (
            <li key={text} className="flex gap-3 text-sm text-gray-400">
              <span className="text-base flex-shrink-0">{icon}</span>
              <span>{text}</span>
            </li>
          ))}
        </ul>
      </div>

      {/* CTAs */}
      <div className="flex flex-col gap-3 w-full max-w-sm">
        <Link href="/dashboard" className="block w-full bg-green-500 hover:bg-green-400 text-black font-bold py-3.5 rounded-xl transition-colors text-center">
          Go to dashboard →
        </Link>
        <Link href="/settings/integrations" className="block w-full bg-gray-800 hover:bg-gray-700 text-white font-semibold py-3.5 rounded-xl transition-colors text-center">
          Manage integrations
        </Link>
      </div>

      <p className="text-gray-600 text-xs mt-10 text-center">
        Need help?{" "}
        <a href="mailto:support@cashcall.io" className="text-gray-500 hover:text-gray-300 transition-colors">
          support@cashcall.io
        </a>
      </p>
    </div>
  );
}

export default function CloverSuccessPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-gray-950 flex items-center justify-center">
        <div className="w-8 h-8 rounded-full border-2 border-green-500 border-t-transparent animate-spin" />
      </div>
    }>
      <CloverSuccessContent />
    </Suspense>
  );
}
