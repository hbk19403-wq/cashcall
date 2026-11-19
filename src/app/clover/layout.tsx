import type { Metadata, Viewport } from "next";

/**
 * Layout for all /clover/* pages.
 *
 * Clover device sizes:
 *   Station  1024 × 600
 *   Flex      480 × 800  ← smallest; design for this
 *   Mini     1280 × 800
 *
 * Overrides:
 *  • No ChatWidget (the root layout renders it; this layout replaces that
 *    subtree by rendering {children} directly without the widget).
 *  • Tailored viewport and title for Clover's embedded WebView.
 */

export const metadata: Metadata = {
  title: "CashCall × Clover",
  description: "Connect your Clover POS to CashCall for automatic P&L tracking.",
  // Suppress the chat widget launcher on Clover pages
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  // Allow Flex (480px) content to scroll / zoom on tiny screens
  width: "device-width",
  initialScale: 1,
  maximumScale: 2,       // allow pinch-zoom on 480px Flex
  userScalable: true,
  viewportFit: "cover",
};

export default function CloverLayout({ children }: { children: React.ReactNode }) {
  // <html> and <body> are already provided by the root layout.
  // ChatWidget suppresses itself on /clover/* paths via usePathname check.
  return <>{children}</>;
}
