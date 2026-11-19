import type { Metadata, Viewport } from "next";
import { Inter, Space_Grotesk } from "next/font/google";
import "./globals.css";
import ChatWidget from "@/app/components/ChatWidget";
import Attribution from "@/app/components/Attribution";
import { ToastProvider } from "@/lib/toast";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

const spaceGrotesk = Space_Grotesk({
  subsets: ["latin"],
  variable: "--font-space",
  display: "swap",
  weight: ["400", "500", "600", "700"],
});

const SITE_TITLE = "CashCall — Restaurant Financial Command Center";
const SITE_DESCRIPTION =
  "Prime cost automation, AI invoice intelligence, zero-knowledge encryption. The financial OS for serious restaurant operators.";

export const metadata: Metadata = {
  metadataBase: new URL("https://cashcall.io"),
  title: SITE_TITLE,
  description: SITE_DESCRIPTION,
  manifest: "/manifest.json",
  // Link previews (LinkedIn, Facebook, WhatsApp, iMessage, X)
  openGraph: {
    type: "website",
    siteName: "CashCall",
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
    images: [
      {
        url: "/og-image.png",
        width: 1200,
        height: 630,
        alt: "CashCall — Know if you made money today. Not in 3 weeks.",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
    images: ["/og-image.png"],
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "CashCall",
  },
  formatDetection: { telephone: true },
  icons: {
    apple: [
      { url: "/icons/icon-152.png", sizes: "152x152" },
      { url: "/icons/icon-192.png", sizes: "192x192" },
    ],
    icon: [
      { url: "/icons/icon-192.png", sizes: "192x192" },
      { url: "/icons/icon-512.png", sizes: "512x512" },
    ],
  },
};

export const viewport: Viewport = {
  themeColor: "#00d4a8",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} ${spaceGrotesk.variable}`}>
      <head>
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="apple-mobile-web-app-title" content="CashCall" />
        <link rel="apple-touch-icon" href="/icons/icon-152.png" />
      </head>
      <body className="bg-gray-950 text-white antialiased font-sans">
        <ToastProvider>
          {children}
          <ChatWidget />
          <Attribution />
        </ToastProvider>
      </body>
    </html>
  );
}
