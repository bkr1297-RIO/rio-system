/**
 * PGTC Test Utilities
 * ═══════════════════════════════════════════════════════════════
 * Helpers for creating packets, tokens, and mutation scenarios.
 */

import { createHash, createHmac, randomUUID } from "crypto";
import type { PGTCPacket, PGTCToken } from "./system";

const SIGNING_SECRET = "pgtc-test-signing-secret-v1";

function sha256(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}

function hmacSign(data: string): string {
  return createHmac("sha256", SIGNING_SECRET).update(data).digest("hex");
}

/**
 * Create a valid, canonical PGTC packet with proper signature.
 */
export function createPacket(overrides?: Partial<PGTCPacket>): PGTCPacket {
  const base: PGTCPacket = {
    intent_id: `INT-${randomUUID()}`,
    action: "send_email",
    target: "test@example.com",
    parameters: { subject: "Test", body: "Hello from PGTC" },
    nonce: `NONCE-${randomUUID()}`,
    timestamp: Date.now(),
    actor_id: "1",
    source_type: "HUMAN",
    signature: "", // Will be computed below
    // Schema-aligned defaults (Task 3)
    packet_id: `PKT-${randomUUID()}`,
    packet_version: "0.1",
    hash_alg: "SHA-256",
    canon_alg: "JCS",
    ...overrides,
  };

  // Compute canonical signature if not overridden
  if (!overrides?.signature) {
    const sigPayload = JSON.stringify({
      intent_id: base.intent_id,
      action: base.action,
      target: base.target,
      parameters: base.parameters,
      nonce: base.nonce,
      timestamp: base.timestamp,
    });
    base.signature = hmacSign(sigPayload);
  }

  return base;
}

/**
 * Create a valid PGTC token bound to a specific packet.
 */
export function createToken(
  packet: PGTCPacket,
  overrides?: Partial<PGTCToken>,
): PGTCToken {
  const intentHash = sha256(JSON.stringify({
    intent_id: packet.intent_id,
    action: packet.action,
    target: packet.target,
    parameters: packet.parameters,
    nonce: packet.nonce,
  }));

  const actionHash = sha256(JSON.stringify({
    action: packet.action,
    target: packet.target,
    parameters: packet.parameters,
  }));

  const now = Date.now();
  const ttl = 30_000; // 30 seconds

  return {
    token_id: `TKN-${randomUUID()}`,
    intent_hash: intentHash,
    action_hash: actionHash,
    nonce: packet.nonce,
    issued_at: now,
    expires_at: now + ttl,
    ttl,
    policy_version: "PGTC-v1.0",
    target: packet.target,
    used: false,
    ...overrides,
  };
}

/**
 * Create an expired token (TTL already elapsed).
 */
export function createExpiredToken(packet: PGTCPacket): PGTCToken {
  const token = createToken(packet);
  token.issued_at = Date.now() - 60_000;
  token.expires_at = Date.now() - 30_000;
  return token;
}

/**
 * Create a token with an invalid signature (wrong intent hash).
 */
export function createMisboundToken(packet: PGTCPacket): PGTCToken {
  const token = createToken(packet);
  token.intent_hash = sha256("WRONG_INTENT_DATA");
  return token;
}

/**
 * Tamper with a packet after signing (mutate parameters).
 */
export function tamperPacket(packet: PGTCPacket, mutations: Partial<PGTCPacket>): PGTCPacket {
  return { ...packet, ...mutations };
  // Signature is NOT recomputed — this is intentional tampering
}

/**
 * Reuse a nonce from a previous packet in a new packet.
 */
export function reuseNonce(originalPacket: PGTCPacket): PGTCPacket {
  return createPacket({
    nonce: originalPacket.nonce, // Same nonce
    intent_id: `INT-replay-${randomUUID()}`,
  });
}

/**
 * Create a packet with an invalid signature.
 */
export function createBadSignaturePacket(): PGTCPacket {
  return createPacket({
    signature: "INVALID_SIGNATURE_0000000000000000",
  });
}

/**
 * Create a packet for a specific action class.
 */
export function createActionPacket(action: string, overrides?: Partial<PGTCPacket>): PGTCPacket {
  return createPacket({ action, ...overrides });
}
