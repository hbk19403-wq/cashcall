/**
 * CashCall Zero-Knowledge Encryption
 * AES-256-GCM client-side encryption.
 * The raw key NEVER leaves the client's browser.
 * The server stores only encrypted ciphertext — completely unreadable without the key.
 */

const ALGO = "AES-GCM";
const KEY_LENGTH = 256;

// ── Key Generation ────────────────────────────────────────────────────────────

/** Generate a new cryptographically random AES-256 key. */
export async function generateEncryptionKey(): Promise<CryptoKey> {
  return crypto.subtle.generateKey(
    { name: ALGO, length: KEY_LENGTH },
    true,           // extractable — needed to export for download
    ["encrypt", "decrypt"]
  );
}

/** Export a CryptoKey to raw bytes (for download / storage). */
export async function exportKeyToBytes(key: CryptoKey): Promise<Uint8Array> {
  const raw = await crypto.subtle.exportKey("raw", key);
  return new Uint8Array(raw);
}

/** Export a CryptoKey to a hex string (for display / download). */
export async function exportKeyToHex(key: CryptoKey): Promise<string> {
  const bytes = await exportKeyToBytes(key);
  return Array.from(bytes as Uint8Array).map(b => b.toString(16).padStart(2, "0")).join("");
}

/** Import a hex string back into a CryptoKey. */
export async function importKeyFromHex(hex: string): Promise<CryptoKey> {
  const hexPairs = hex.match(/.{1,2}/g) ?? [];
  const bytes = new Uint8Array(hexPairs.map(b => parseInt(b, 16)));
  return crypto.subtle.importKey("raw", bytes, { name: ALGO, length: KEY_LENGTH }, false, ["encrypt", "decrypt"]);
}

// ── Encrypt / Decrypt ─────────────────────────────────────────────────────────

/** Encrypt a string. Returns base64(iv + ciphertext). */
export async function encrypt(plaintext: string, key: CryptoKey): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encoded = new TextEncoder().encode(plaintext);
  const ciphertext = await crypto.subtle.encrypt({ name: ALGO, iv }, key, encoded);
  const result = new Uint8Array(iv.length + ciphertext.byteLength);
  result.set(iv, 0);
  result.set(new Uint8Array(ciphertext), iv.length);
  return btoa(Array.from(result as Uint8Array).map(b => String.fromCharCode(b)).join(""));
}

/** Decrypt a base64(iv + ciphertext) string. */
export async function decrypt(ciphertextB64: string, key: CryptoKey): Promise<string> {
  const bytes = Uint8Array.from(atob(ciphertextB64), c => c.charCodeAt(0));
  const iv = bytes.slice(0, 12);
  const ciphertext = bytes.slice(12);
  const plaintext = await crypto.subtle.decrypt({ name: ALGO, iv }, key, ciphertext);
  return new TextDecoder().decode(plaintext);
}

/** Encrypt a JSON object. */
export async function encryptJSON(data: object, key: CryptoKey): Promise<string> {
  return encrypt(JSON.stringify(data), key);
}

/** Decrypt and parse a JSON object. */
export async function decryptJSON<T = unknown>(ciphertextB64: string, key: CryptoKey): Promise<T> {
  const json = await decrypt(ciphertextB64, key);
  return JSON.parse(json) as T;
}

// ── Key File Download ─────────────────────────────────────────────────────────

/** Generate the Master Recovery Key .txt content for download. */
export async function generateMasterKeyFile(key: CryptoKey, restaurantName: string): Promise<string> {
  const hex = await exportKeyToHex(key);
  const date = new Date().toISOString();
  return [
    "=======================================================",
    "   CashCall Master Recovery Key",
    "=======================================================",
    "",
    `Restaurant: ${restaurantName}`,
    `Generated:  ${date}`,
    "",
    "⚠️  CRITICAL SECURITY NOTICE ⚠️",
    "",
    "This key encrypts ALL of your restaurant's financial data.",
    "CashCall CANNOT read your data — even if requested by law.",
    "Only this key can unlock your vault.",
    "",
    "KEEP THIS FILE:",
    "  • In a password manager (1Password, Bitwarden, etc.)",
    "  • On an encrypted USB drive stored offline",
    "  • NEVER in email, cloud storage, or chat",
    "",
    "If you lose this key, your data is PERMANENTLY inaccessible.",
    "We cannot recover it. There is no backdoor.",
    "",
    "=======================================================",
    "   YOUR ENCRYPTION KEY (AES-256-GCM)",
    "=======================================================",
    "",
    hex,
    "",
    "=======================================================",
    "   To restore access:",
    "   Settings → Vault → Restore Key → paste key above",
    "=======================================================",
  ].join("\n");
}

/** Trigger download of the Master Recovery Key file. */
export async function downloadMasterKey(key: CryptoKey, restaurantName: string): Promise<void> {
  const content = await generateMasterKeyFile(key, restaurantName);
  const blob = new Blob([content], { type: "text/plain" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `CashCall-MasterKey-${restaurantName.replace(/[^a-zA-Z0-9]/g, "_")}.txt`;
  a.click();
  URL.revokeObjectURL(url);
}

// ── Session Key Storage (sessionStorage only — never persisted) ──────────────

const SESSION_KEY = "cashcall_session_key_hex";

/** Store the hex key in sessionStorage for this browser session only. */
export function storeSessionKey(hex: string): void {
  try {
    sessionStorage.setItem(SESSION_KEY, hex);
  } catch {
    // sessionStorage unavailable — no-op, user will need to re-enter key
  }
}

/** Retrieve the hex key from sessionStorage. */
export function getSessionKeyHex(): string | null {
  try {
    return sessionStorage.getItem(SESSION_KEY);
  } catch {
    return null;
  }
}

/** Clear the session key (on logout). */
export function clearSessionKey(): void {
  try {
    sessionStorage.removeItem(SESSION_KEY);
  } catch {
    // no-op
  }
}

/** Load a key from sessionStorage and return as CryptoKey. Returns null if not stored. */
export async function loadSessionKey(): Promise<CryptoKey | null> {
  const hex = getSessionKeyHex();
  if (!hex) return null;
  try {
    return await importKeyFromHex(hex);
  } catch {
    return null;
  }
}
