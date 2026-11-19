import type { Config } from "tailwindcss";
// CashCall — dark-themed SaaS. Primary: teal #00d4a8, Secondary: indigo #818cf8
const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        // iOS: -apple-system → SF Pro   Android: Roboto   Web fallback: Inter
        sans:  [
          "var(--font-inter)",
          "-apple-system",
          "BlinkMacSystemFont",
          "Roboto",
          "Segoe UI",
          "system-ui",
          "sans-serif",
        ],
        serif: ["var(--font-playfair)", "Georgia", "serif"],
        // Mono for numbers / data (tabular figures)
        mono:  [
          "ui-monospace",
          "SF Mono",
          "Roboto Mono",
          "Consolas",
          "monospace",
        ],
      },

      // ── Type scale (based on iOS Dynamic Type / MD3 Type System) ────────────
      fontSize: {
        // Display — hero numbers (e.g. $12,450)
        "display":    ["2rem",   { lineHeight: "1.15", letterSpacing: "-0.03em", fontWeight: "700" }],
        // Title large — page headings
        "title-lg":   ["1.375rem", { lineHeight: "1.2",  letterSpacing: "-0.02em", fontWeight: "700" }],
        // Title medium — card headings
        "title-md":   ["1.125rem", { lineHeight: "1.3",  letterSpacing: "-0.01em", fontWeight: "600" }],
        // Title small — section labels
        "title-sm":   ["0.9375rem",{ lineHeight: "1.35", letterSpacing: "0em",     fontWeight: "600" }],
        // Body large — primary body text
        "body-lg":    ["1rem",     { lineHeight: "1.5",  letterSpacing: "0em",     fontWeight: "400" }],
        // Body medium — default body
        "body-md":    ["0.875rem", { lineHeight: "1.5",  letterSpacing: "0.01em",  fontWeight: "400" }],
        // Body small — secondary / helper text
        "body-sm":    ["0.8125rem",{ lineHeight: "1.45", letterSpacing: "0.01em",  fontWeight: "400" }],
        // Label — caps labels, nav items
        "label-lg":   ["0.875rem", { lineHeight: "1.4",  letterSpacing: "0.04em",  fontWeight: "500" }],
        "label-sm":   ["0.75rem",  { lineHeight: "1.4",  letterSpacing: "0.06em",  fontWeight: "600" }],
        // Caption
        "caption":    ["0.6875rem",{ lineHeight: "1.4",  letterSpacing: "0.03em",  fontWeight: "400" }],
      },

      colors: {
        // ── Brand palette (HBK) ─────────────────────────────────────────────
        brand: {
          50:  "#fdf4ee",
          100: "#f9e4cf",
          200: "#f0d5b8",
          300: "#e5b98a",
          400: "#d9975a",
          500: "#e07b39",    // warm terracotta — primary CTA
          600: "#c96830",
          700: "#a85228",
          800: "#7d3c1d",
          900: "#4a2210",
        },

        // ── Semantic surface tokens ──────────────────────────────────────────
        // Background layers (lightest → darkest)
        hbk: {
          "bg":         "#f5f0e8",   // warm cream — page background
          "surface":    "#ffffff",   // pure white — cards
          "surface-2":  "#faf8f4",   // off-white — nested cards / inputs
          "surface-3":  "#f0ece3",   // soft tan — dividers / inactive tabs
          "overlay":    "rgba(26,13,2,0.60)",  // scrim / modal overlay

          // Primary — dark espresso brown (headers, primary text)
          "primary":    "#2c1a0e",
          "on-primary": "#ffffff",

          // Secondary — warm gold (highlights, active indicators)
          "secondary":  "#e8b84b",
          "on-secondary":"#1a0d02",

          // Accent — rich amber (CTAs, links)
          "accent":     "#c8921a",
          "on-accent":  "#ffffff",

          // Semantic states
          "success":    "#16a34a",
          "on-success": "#ffffff",
          "warning":    "#d97706",
          "on-warning": "#ffffff",
          "error":      "#dc2626",
          "on-error":   "#ffffff",
          "info":       "#0ea5e9",
          "on-info":    "#ffffff",

          // Text hierarchy
          "text-primary":   "#1a0d02",   // near-black — headings
          "text-secondary": "#5c4a38",   // medium brown — body
          "text-tertiary":  "#8c7a6b",   // warm grey-brown — captions
          "text-disabled":  "#bdb1a7",   // muted — disabled states
          "text-inverse":   "#ffffff",   // on dark surfaces
          "text-on-gold":   "#1a0d02",   // on gold/amber bg
        },
      },

      // ── Elevation / Shadow (MD3-style) ──────────────────────────────────────
      boxShadow: {
        "elevation-1": "0 1px 2px rgba(26,13,2,0.08), 0 1px 3px rgba(26,13,2,0.06)",
        "elevation-2": "0 2px 8px rgba(26,13,2,0.10), 0 1px 3px rgba(26,13,2,0.08)",
        "elevation-3": "0 4px 16px rgba(26,13,2,0.12), 0 2px 6px rgba(26,13,2,0.08)",
        "elevation-4": "0 8px 24px rgba(26,13,2,0.15), 0 3px 8px rgba(26,13,2,0.10)",
        // Colored shadows for CTAs
        "cta":         "0 4px 14px rgba(200,146,26,0.35)",
        "cta-lg":      "0 6px 20px rgba(200,146,26,0.45)",
      },

      // ── Border radius (iOS HIG / MD3) ────────────────────────────────────────
      borderRadius: {
        "xs":   "4px",
        "sm":   "8px",
        "md":   "12px",
        "lg":   "16px",
        "xl":   "20px",
        "2xl":  "24px",
        "3xl":  "32px",
        "pill": "9999px",
      },

      // ── Spacing additions ────────────────────────────────────────────────────
      spacing: {
        "safe-top":    "env(safe-area-inset-top, 0px)",
        "safe-bottom": "env(safe-area-inset-bottom, 16px)",
        "safe-left":   "env(safe-area-inset-left, 0px)",
        "safe-right":  "env(safe-area-inset-right, 0px)",
        "tap":         "44px",   // iOS minimum tap target
        "tap-md":      "48px",   // MD3 minimum touch target
        "bottom-nav":  "80px",   // height of bottom nav bar
      },

      // ── Animation ────────────────────────────────────────────────────────────
      transitionTimingFunction: {
        "ios":  "cubic-bezier(0.25, 0.46, 0.45, 0.94)",
        "md3":  "cubic-bezier(0.2, 0, 0, 1)",
        "spring": "cubic-bezier(0.34, 1.56, 0.64, 1)",
      },
      transitionDuration: {
        "fast":   "150ms",
        "normal": "250ms",
        "slow":   "400ms",
      },
    },
  },
  plugins: [],
};

export default config;
