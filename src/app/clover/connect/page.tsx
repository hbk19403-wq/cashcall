"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * /clover/connect
 *
 * Protected page — only reached after the user has logged in (via the
 * returnTo=/clover/connect flow from /clover). It reads the merchant_id
 * that was stored in sessionStorage on /clover, then immediately redirects
 * to the Clover OAuth connect API route so the OAuth flow starts
 * automatically without the user needing to click anything.
 */
export default function CloverConnectPage() {
  const router = useRouter();

  useEffect(() => {
    // Read the merchant_id that was saved on the /clover landing page
    const merchantId = sessionStorage.getItem("clover_merchant_id") ?? "";
    sessionStorage.removeItem("clover_merchant_id");

    // Build the connect URL — source=app_market tells the callback to
    // redirect to /clover/success instead of /settings/integrations
    const url = new URL("/api/pos/clover/connect", window.location.origin);
    url.searchParams.set("source", "app_market");
    if (merchantId) url.searchParams.set("merchant_id", merchantId);

    // Server-side redirect to Clover OAuth
    window.location.href = url.toString();
  }, []);

  return (
    <div className="min-h-screen bg-gray-950 flex items-center justify-center">
      <div className="text-center">
        <div className="w-10 h-10 rounded-full border-2 border-green-500 border-t-transparent animate-spin mx-auto mb-4" />
        <p className="text-gray-400 text-sm">Connecting to Clover…</p>
      </div>
    </div>
  );
}
