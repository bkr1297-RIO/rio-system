/**
 * RIO Security — Ed25519 Signature System
 *
 * This module provides Ed25519 key generation, signing, and verification
 * for the RIO authorization system. Every approval must be signed with
 * the approver's private key, and the gateway verifies the signature
 * against the registered public key before accepting the authorization.
 *
 * Key management:
 *   - Brian's keypair is generated once and stored securely.
 *   - The public key is registered in the authorized_signers table.
 *   - The private key is held by the approver (Brian) and never stored
 *     on the gateway in production. For the MVP, it is stored in an
 *     environment variable or local file.
 *
 * Signature payload:
 *   The signer signs a canonical JSON string containing:
 *   { intent_id, action, decision, signer_id, timestamp }
 */
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

// Node.js 18+ has Ed25519 in crypto via subtle or via tweetnacl
// We use tweetnacl for simplicity and portability.
let nacl;
try {
  nacl = (await import("tweetnacl")).default;
} catch {
  // Fallback: try require
  const { createRequire } = await import("node:module");
  const require = createRequire(import.meta.url);
  nacl = require("tweetnacl");
}

const __dirname = dirname(fileURLToPath(import.meta.url));
const KEYS_DIR = join(__dirname, "..", "data", "keys");

/**
 * Generate a new Ed25519 keypair.
 * Returns { publicKey: hex, secretKey: hex }
 */
export function generateKeypair() {
  const pair = nacl.sign.keyPair();
  return {
    publicKey: Buffer.from(pair.publicKey).toString("hex"),
    secretKey: Buffer.from(pair.secretKey).toString("hex"),
  };
}

/**
 * Generate and save Brian's keypair to disk (one-time setup).
 * In production, the private key would be on Brian's device only.
 */
export function generateAndSaveKeypair(signerId) {
  mkdirSync(KEYS_DIR, { recursive: true });
  const pair = generateKeypair();

  const pubFile = join(KEYS_DIR, `${signerId}.pub.hex`);
  const secFile = join(KEYS_DIR, `${signerId}.sec.hex`);

  writeFileSync(pubFile, pair.publicKey);
  writeFileSync(secFile, pair.secretKey);

  console.log(`[RIO Ed25519] Keypair generated for ${signerId}`);
  console.log(`[RIO Ed25519] Public key:  ${pubFile}`);
  console.log(`[RIO Ed25519] Private key: ${secFile} (KEEP SECRET)`);

  return pair;
}

/**
 * Load a keypair from disk.
 */
export function loadKeypair(signerId) {
  const pubFile = join(KEYS_DIR, `${signerId}.pub.hex`);
  const secFile = join(KEYS_DIR, `${signerId}.sec.hex`);

  if (!existsSync(pubFile) || !existsSync(secFile)) {
    return null;
  }

  return {
    publicKey: readFileSync(pubFile, "utf-8").trim(),
    secretKey: readFileSync(secFile, "utf-8").trim(),
  };
}

/**
 * Build the canonical payload string for signing.
 */
export function buildSignaturePayload({ intent_id, action, decision, signer_id, timestamp }) {
  return JSON.stringify({
    intent_id,
    action,
    decision,
    signer_id,
    timestamp,
  });
}

/**
 * Sign a payload with an Ed25519 secret key.
 * @param {string} payload - The canonical JSON string to sign
 * @param {string} secretKeyHex - The 128-char hex secret key
 * @returns {string} The signature as a hex string
 */
export function signPayload(payload, secretKeyHex) {
  const secretKey = Buffer.from(secretKeyHex, "hex");
  const message = Buffer.from(payload, "utf-8");
  const signature = nacl.sign.detached(message, secretKey);
  return Buffer.from(signature).toString("hex");
}

/**
 * Verify an Ed25519 signature.
 * @param {string} payload - The canonical JSON string that was signed
 * @param {string} signatureHex - The signature as a hex string
 * @param {string} publicKeyHex - The 64-char hex public key
 * @returns {boolean} True if the signature is valid
 */
export function verifySignature(payload, signatureHex, publicKeyHex) {
  try {
    const message = Buffer.from(payload, "utf-8");
    const signature = Buffer.from(signatureHex, "hex");
    const publicKey = Buffer.from(publicKeyHex, "hex");
    return nacl.sign.detached.verify(message, signature, publicKey);
  } catch (err) {
    console.error(`[RIO Ed25519] Verification error: ${err.message}`);
    return false;
  }
}

/**
 * Hash a payload with SHA-256 (for the authorization_hash in the receipt).
 */
export function hashPayload(payload) {
  return createHash("sha256").update(payload).digest("hex");
}
