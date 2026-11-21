// Shape checks for manually entered Clover credentials.
// Pure functions (no I/O) so they can be tested without a network or database.

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const CLOVER_MERCHANT_ID_RE = /^[A-Z0-9]{13}$/i;

const WHERE_TO_FIND =
  "The Merchant ID is the 13-character code in your Clover dashboard web address, right after /m/.";

/**
 * Returns an operator-facing error message when the credentials cannot be a
 * Clover Merchant ID + API token pair, or null when the shapes are plausible.
 */
export function checkCloverCredentialShape(merchantIdRaw: string, apiTokenRaw: string): string | null {
  const merchantId = merchantIdRaw.trim();
  const apiToken = apiTokenRaw.trim();

  if (!merchantId) return "Merchant ID is required.";
  if (!apiToken) return "API token is required.";

  if (/\s/.test(merchantId) || /\s/.test(apiToken)) {
    return "Remove the spaces or line breaks inside the Merchant ID and API token, then try again.";
  }

  if (UUID_RE.test(merchantId) && CLOVER_MERCHANT_ID_RE.test(apiToken)) {
    return "These look swapped: the Merchant ID box has an API token and the API Token box has a Merchant ID.";
  }
  if (UUID_RE.test(merchantId)) {
    return `That looks like an API token, not a Merchant ID. ${WHERE_TO_FIND}`;
  }
  if (/^\d+$/.test(merchantId)) {
    return `That looks like your card-processing MID, not your Clover Merchant ID. ${WHERE_TO_FIND}`;
  }
  if (!CLOVER_MERCHANT_ID_RE.test(merchantId)) {
    return `That does not look like a Clover Merchant ID. ${WHERE_TO_FIND}`;
  }
  if (apiToken === merchantId) {
    return "The API token cannot be the same as the Merchant ID.";
  }
  return null;
}

/** Maps Clover's response status for GET /v3/merchants/{id} to an operator-facing error, or null if OK. */
export function cloverVerifyError(status: number): string | null {
  if (status >= 200 && status < 300) return null;
  if (status === 401 || status === 403) {
    return `Clover rejected this Merchant ID and API token pair. Check that the token was created for this merchant and can read merchant, orders and payments. ${WHERE_TO_FIND}`;
  }
  if (status === 404) {
    return `Clover does not recognise this Merchant ID. ${WHERE_TO_FIND}`;
  }
  if (status === 429) {
    return "Clover is rate-limiting requests right now. Nothing was saved. Wait a minute and try again.";
  }
  return `Clover could not be reached (status ${status}). Nothing was saved. Try again in a few minutes.`;
}
