/**
 * RIO Client Crypto — Ed25519 Signing & AES-GCM Key Encryption
 *
 * This module provides:
 *   1. Ed25519 keypair generation (via Web Crypto / tweetnacl-compatible)
 *   2. Ed25519 signing of canonical approval payloads
 *   3. AES-GCM encryption/decryption of the private key using a user passphrase
 *   4. Export/import of encrypted key bundles for backup and recovery
 *
 * The private key NEVER leaves the device unencrypted.
 * Encrypted backups can be stored on the server or downloaded as a file.
 */

// ── Hex Utilities ───────────────────────────────────────────────────────────

export function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.substring(i, i + 2), 16);
  }
  return bytes;
}

export function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

// ── Ed25519 Keypair Generation ──────────────────────────────────────────────

/**
 * Generate a new Ed25519 keypair using the Web Crypto API.
 * Returns { publicKey: hex, secretKey: hex }.
 *
 * Note: We use the raw seed (32 bytes) + public key (32 bytes) = 64 bytes
 * for the secret key, matching tweetnacl's format used by the gateway.
 */
export async function generateKeypair(): Promise<{
  publicKey: string;
  secretKey: string;
}> {
  // Generate Ed25519 keypair via Web Crypto
  const keyPair = await crypto.subtle.generateKey("Ed25519", true, [
    "sign",
    "verify",
  ]);

  // Export raw keys
  const publicKeyRaw = new Uint8Array(
    await crypto.subtle.exportKey("raw", keyPair.publicKey)
  );

  // Export private key as PKCS8, then extract the 32-byte seed
  const pkcs8 = new Uint8Array(
    await crypto.subtle.exportKey("pkcs8", keyPair.privateKey)
  );
  // PKCS8 Ed25519 DER: the last 32 bytes are the seed
  const seed = pkcs8.slice(pkcs8.length - 32);

  // tweetnacl format: secretKey = seed (32 bytes) + publicKey (32 bytes) = 64 bytes
  const secretKey = new Uint8Array(64);
  secretKey.set(seed, 0);
  secretKey.set(publicKeyRaw, 32);

  return {
    publicKey: bytesToHex(publicKeyRaw),
    secretKey: bytesToHex(secretKey),
  };
}

// ── Ed25519 Signing ─────────────────────────────────────────────────────────

/**
 * Build the canonical payload string for signing an approval.
 * Must match the gateway's buildSignaturePayload() exactly.
 */
export function buildSignaturePayload(params: {
  intent_id: string;
  action: string;
  decision: string;
  signer_id: string;
  timestamp: string;
}): string {
  return JSON.stringify({
    intent_id: params.intent_id,
    action: params.action,
    decision: params.decision,
    signer_id: params.signer_id,
    timestamp: params.timestamp,
  });
}

/**
 * Sign a payload with an Ed25519 secret key (tweetnacl format: 64 bytes hex = 128 chars).
 * Uses Web Crypto API for the actual signing.
 *
 * @param payload - The canonical JSON string to sign
 * @param secretKeyHex - The 128-char hex secret key (tweetnacl format)
 * @returns The signature as a hex string
 */
export async function signPayload(
  payload: string,
  secretKeyHex: string
): Promise<string> {
  const secretKeyBytes = hexToBytes(secretKeyHex);
  // Extract the 32-byte seed from the tweetnacl-format secret key
  const seed = secretKeyBytes.slice(0, 32);

  // Import the seed as a PKCS8 Ed25519 private key
  // Build PKCS8 DER: prefix + seed
  const pkcs8Prefix = hexToBytes("302e020100300506032b657004220420");
  const pkcs8 = new Uint8Array(pkcs8Prefix.length + seed.length);
  pkcs8.set(pkcs8Prefix, 0);
  pkcs8.set(seed, pkcs8Prefix.length);

  const privateKey = await crypto.subtle.importKey(
    "pkcs8",
    pkcs8.buffer,
    "Ed25519",
    false,
    ["sign"]
  );

  const message = new TextEncoder().encode(payload);
  const signatureBuffer = await crypto.subtle.sign("Ed25519", privateKey, message);
  return bytesToHex(new Uint8Array(signatureBuffer));
}

// ── AES-GCM Encryption for Key Backup ───────────────────────────────────────

/**
 * Derive an AES-256-GCM key from a user passphrase using PBKDF2.
 */
async function deriveEncryptionKey(
  passphrase: string,
  salt: Uint8Array
): Promise<CryptoKey> {
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(passphrase),
    "PBKDF2",
    false,
    ["deriveKey"]
  );

  return crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt: salt.buffer as ArrayBuffer,
      iterations: 600_000, // OWASP-recommended minimum for PBKDF2-SHA256
      hash: "SHA-256",
    },
    keyMaterial,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
}

/**
 * Encrypted key bundle format.
 * This is what gets stored on the server or downloaded as a backup file.
 */
export interface EncryptedKeyBundle {
  /** Version of the encryption format */
  version: 1;
  /** PBKDF2 salt (hex) */
  salt: string;
  /** AES-GCM initialization vector (hex) */
  iv: string;
  /** AES-GCM encrypted secret key (hex) */
  ciphertext: string;
  /** The public key (hex) — not secret, included for identity verification */
  publicKey: string;
  /** Signer ID associated with this key */
  signerId: string;
  /** Timestamp of backup creation */
  createdAt: string;
}

/**
 * Encrypt a secret key with a user-provided passphrase.
 * Returns an EncryptedKeyBundle that can be safely stored or transmitted.
 *
 * @param secretKeyHex - The 128-char hex secret key to encrypt
 * @param publicKeyHex - The 64-char hex public key (stored alongside for identification)
 * @param signerId - The signer ID this key belongs to
 * @param passphrase - The user's passphrase for encryption
 */
export async function encryptSecretKey(
  secretKeyHex: string,
  publicKeyHex: string,
  signerId: string,
  passphrase: string
): Promise<EncryptedKeyBundle> {
  const salt = crypto.getRandomValues(new Uint8Array(32));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveEncryptionKey(passphrase, salt);

  const plaintext = new TextEncoder().encode(secretKeyHex);
  const ciphertext = new Uint8Array(
    await crypto.subtle.encrypt(
      { name: "AES-GCM", iv: iv.buffer as ArrayBuffer },
      key,
      plaintext.buffer as ArrayBuffer
    )
  );

  return {
    version: 1,
    salt: bytesToHex(salt),
    iv: bytesToHex(iv),
    ciphertext: bytesToHex(ciphertext),
    publicKey: publicKeyHex,
    signerId,
    createdAt: new Date().toISOString(),
  };
}

/**
 * Decrypt a secret key from an EncryptedKeyBundle using the user's passphrase.
 *
 * @param bundle - The encrypted key bundle
 * @param passphrase - The user's passphrase
 * @returns The decrypted secret key as a hex string
 * @throws Error if the passphrase is wrong or data is corrupted
 */
export async function decryptSecretKey(
  bundle: EncryptedKeyBundle,
  passphrase: string
): Promise<string> {
  const salt = hexToBytes(bundle.salt);
  const iv = hexToBytes(bundle.iv);
  const ciphertext = hexToBytes(bundle.ciphertext);
  const key = await deriveEncryptionKey(passphrase, salt);

  try {
    const plaintext = new Uint8Array(
      await crypto.subtle.decrypt(
        { name: "AES-GCM", iv: iv.buffer as ArrayBuffer },
        key,
        ciphertext.buffer as ArrayBuffer
      )
    );
    return new TextDecoder().decode(plaintext);
  } catch {
    throw new Error(
      "Decryption failed. Wrong passphrase or corrupted backup."
    );
  }
}

/**
 * Export an encrypted key bundle as a downloadable JSON file.
 */
export function downloadKeyBundle(bundle: EncryptedKeyBundle): void {
  const json = JSON.stringify(bundle, null, 2);
  const blob = new Blob([json], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `rio-key-backup-${bundle.signerId}-${Date.now()}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

/**
 * Import an encrypted key bundle from a file.
 * Returns a Promise that resolves with the parsed bundle.
 */
export function importKeyBundleFromFile(): Promise<EncryptedKeyBundle> {
  return new Promise((resolve, reject) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".json";
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) {
        reject(new Error("No file selected"));
        return;
      }
      try {
        const text = await file.text();
        const bundle = JSON.parse(text) as EncryptedKeyBundle;
        if (bundle.version !== 1 || !bundle.ciphertext || !bundle.salt || !bundle.iv) {
          reject(new Error("Invalid key backup file format"));
          return;
        }
        resolve(bundle);
      } catch (err) {
        reject(new Error("Failed to parse key backup file"));
      }
    };
    input.click();
  });
}
