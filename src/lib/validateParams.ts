/**
 * Validates and sanitizes URL search parameters used in DB queries.
 * All functions throw on invalid input to prevent malformed date queries.
 */

const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])-01$/;
const CURRENT_YEAR = new Date().getFullYear();
const MIN_YEAR = 2020;
const MAX_YEAR = CURRENT_YEAR + 2;

/**
 * Validates a month string in "YYYY-MM-01" format.
 * Falls back to the current month if invalid.
 */
export function validateMonth(raw: string | undefined | null): string {
  if (raw && MONTH_RE.test(raw)) {
    const y = parseInt(raw.slice(0, 4));
    if (y >= MIN_YEAR && y <= MAX_YEAR) return raw;
  }
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
}

/**
 * Validates a year number (e.g. from ?year=2026).
 * Falls back to current year if out of range.
 */
export function validateYear(raw: string | undefined | null): number {
  const y = parseInt(raw ?? "");
  if (!isNaN(y) && y >= MIN_YEAR && y <= MAX_YEAR) return y;
  return CURRENT_YEAR;
}

/**
 * Sanitizes a free-text label used as a JSONB key.
 * Strips leading/trailing whitespace, limits length, removes special characters
 * that could be misused as object key injection vectors.
 */
export function sanitizeLabel(raw: string): string {
  return raw
    .trim()
    .slice(0, 80)                         // max 80 chars
    .replace(/[<>'"`;\\]/g, "")           // strip XSS/injection chars
    .replace(/^(__proto__|constructor|prototype)$/i, ""); // block prototype pollution
}

/**
 * Validates that a numeric input is a finite positive number.
 */
export function sanitizeAmount(raw: string | number | undefined): number {
  const n = parseFloat(String(raw ?? 0));
  if (!isFinite(n) || n < 0) return 0;
  return Math.round(n * 100) / 100; // max 2 decimal places
}
