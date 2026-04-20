/**
 * Browser-side Ed25519 key generation, signing, and encrypted backup/recovery
 * using Web Crypto API. Falls back to ECDSA P-256 if Ed25519 is not supported.
 *
 * Key backup uses AES-256-GCM with PBKDF2 key derivation from a user passphrase.
 * The server never sees the plaintext private key.
 */

function buf2hex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer)).map(b => b.toString(16).padStart(2, "0")).join("");
}

function hex2buf(hex: string): ArrayBuffer {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) bytes[i / 2] = parseInt(hex.substr(i, 2), 16);
  return bytes.buffer;
}

function buf2base64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

function base642buf(base64: string): ArrayBuffer {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

export async function sha256(data: string): Promise<string> {
  const encoded = new TextEncoder().encode(data);
  const hash = await crypto.subtle.digest("SHA-256", encoded);
  return buf2hex(hash);
}

// Try native Ed25519, fall back to ECDSA P-256
let useEd25519 = true;

export async function generateKeyPair(): Promise<{ publicKey: string; privateKey: string }> {
  try {
    const keyPair = await crypto.subtle.generateKey("Ed25519", true, ["sign", "verify"]);
    const pubRaw = await crypto.subtle.exportKey("raw", keyPair.publicKey);
    const privRaw = await crypto.subtle.exportKey("pkcs8", keyPair.privateKey);
    useEd25519 = true;
    return { publicKey: buf2hex(pubRaw), privateKey: buf2hex(privRaw) };
  } catch {
    // Fallback to ECDSA P-256
    useEd25519 = false;
    const keyPair = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]);
    const pubRaw = await crypto.subtle.exportKey("raw", keyPair.publicKey);
    const privRaw = await crypto.subtle.exportKey("pkcs8", keyPair.privateKey);
    return { publicKey: buf2hex(pubRaw), privateKey: buf2hex(privRaw) };
  }
}

export async function signData(privateKeyHex: string, data: string): Promise<string> {
  const encoded = new TextEncoder().encode(data);
  const privBuf = hex2buf(privateKeyHex);

  try {
    if (useEd25519) {
      const key = await crypto.subtle.importKey("pkcs8", privBuf, "Ed25519", false, ["sign"]);
      const sig = await crypto.subtle.sign("Ed25519", key, encoded);
      return buf2hex(sig);
    }
  } catch { /* fallback */ }

  // ECDSA fallback
  const key = await crypto.subtle.importKey("pkcs8", privBuf, { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, key, encoded);
  return buf2hex(sig);
}

// ─── AES-256-GCM Key Backup Encryption ─────────────────────────

/**
 * Derive an AES-256-GCM key from a user passphrase using PBKDF2.
 */
async function deriveKey(passphrase: string, salt: ArrayBuffer): Promise<CryptoKey> {
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(passphrase),
    "PBKDF2",
    false,
    ["deriveKey"]
  );
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", salt, iterations: 600000, hash: "SHA-256" },
    keyMaterial,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
}

/**
 * Encrypt a private key with a user passphrase.
 * Returns base64-encoded encrypted data, IV, and salt.
 */
export async function encryptPrivateKey(
  privateKeyHex: string,
  passphrase: string
): Promise<{ encryptedKey: string; iv: string; salt: string }> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(passphrase, salt.buffer);

  const encrypted = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    new TextEncoder().encode(privateKeyHex)
  );

  return {
    encryptedKey: buf2base64(encrypted),
    iv: buf2base64(iv.buffer),
    salt: buf2base64(salt.buffer),
  };
}

/**
 * Decrypt a private key with a user passphrase.
 * Returns the plaintext private key hex string.
 */
export async function decryptPrivateKey(
  encryptedKey: string,
  iv: string,
  salt: string,
  passphrase: string
): Promise<string> {
  const saltBuf = base642buf(salt);
  const ivBuf = base642buf(iv);
  const encryptedBuf = base642buf(encryptedKey);

  const key = await deriveKey(passphrase, saltBuf);

  const decrypted = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: new Uint8Array(ivBuf) },
    key,
    encryptedBuf
  );

  return new TextDecoder().decode(decrypted);
}

/**
 * Generate a fingerprint of a public key (first 16 chars of SHA-256 hash).
 */
export async function publicKeyFingerprint(publicKeyHex: string): Promise<string> {
  const hash = await sha256(publicKeyHex);
  return hash.substring(0, 16);
}
