/**
 * Shared currency formatting utilities.
 * Use these instead of defining local fmtUSD / fmtD helpers per-page.
 */

/** Formats as $1,234 (no cents) */
export const fmtUSD = (n: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n);

/** Formats as $1,234.56 (two decimal places) */
export const fmtUSD2 = (n: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2 }).format(n);
