/**
 * RIO Gateway — Token Manager (Fix #1: Token Burn + TTL)
 *
 * Prevents execution token replay attacks.
 * Each execution token can be used EXACTLY ONCE, for EXACTLY ONE INTENT.
 *
 * Security guarantees:
 * - Tokens are random UUIDs (unpredictable)
 * - Tokens are bound to a specific intent_id
 * - Tokens expire after a configurable TTL (default 30 min)
 * - Tokens are burned (marked used) on first use
 * - Burned tokens cannot be reused
 * - Expired tokens are automatically cleaned up
 *
 * FAIL CLOSED: Any validation failure rejects the request.
 */

import { randomUUID } from "crypto";

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------
const TOKEN_EXPIRY_SECONDS = parseInt(
  process.env.EXECUTION_TOKEN_EXPIRY_SECONDS || "1800"
); // 30 min default
const CLEANUP_INTERVAL_MS = 5 * 60 * 1000; // Clean up every 5 minutes

// ---------------------------------------------------------------------------
// In-memory token store
// Production: Replace with Redis for horizontal scaling
// ---------------------------------------------------------------------------
const tokenStore = new Map();

// ---------------------------------------------------------------------------
// Issue a new execution token for an intent
// ---------------------------------------------------------------------------
export function issueExecutionToken(intentId) {
  if (!intentId) {
    throw new Error("[RIO Token Manager] Cannot issue token without intent_id");
  }

  const token = randomUUID();
  const now = Date.now();
  const expiresAt = new Date(now + TOKEN_EXPIRY_SECONDS * 1000);

  tokenStore.set(token, {
    intent_id: intentId,
    issued_at: new Date(now).toISOString(),
    expires_at: expiresAt.toISOString(),
    burned: false,
    burned_at: null,
  });

  console.log(
    `[RIO Token Manager] Token issued for intent ${intentId} — expires ${expiresAt.toISOString()}`
  );

  return {
    token,
    expires_at: expiresAt.toISOString(),
  };
}

// ---------------------------------------------------------------------------
// Validate and burn a token (single-use enforcement)
// ---------------------------------------------------------------------------
export function validateAndBurnToken(intentId, tokenString) {
  if (!tokenString) {
    return {
      valid: false,
      reason: "No execution token provided.",
    };
  }

  const entry = tokenStore.get(tokenString);

  // Token doesn't exist
  if (!entry) {
    return {
      valid: false,
      reason: "Execution token not found. It may have expired or never existed.",
    };
  }

  // Token belongs to a different intent
  if (entry.intent_id !== intentId) {
    console.log(
      `[RIO Token Manager] SECURITY: Token used for wrong intent. Expected ${entry.intent_id}, got ${intentId}`
    );
    return {
      valid: false,
      reason:
        "Execution token does not match the specified intent. Tokens are bound to a single intent.",
    };
  }

  // Token already burned (replay attempt)
  if (entry.burned) {
    console.log(
      `[RIO Token Manager] REPLAY BLOCKED: Token for intent ${intentId} already burned at ${entry.burned_at}`
    );
    return {
      valid: false,
      reason: `Execution token has already been used at ${entry.burned_at}. Tokens are single-use.`,
    };
  }

  // Token expired
  const now = new Date();
  const expiresAt = new Date(entry.expires_at);
  if (now > expiresAt) {
    console.log(
      `[RIO Token Manager] EXPIRED: Token for intent ${intentId} expired at ${entry.expires_at}`
    );
    return {
      valid: false,
      reason: `Execution token expired at ${entry.expires_at}. Request a new token via POST /execute.`,
    };
  }

  // --- VALID: Burn the token ---
  entry.burned = true;
  entry.burned_at = now.toISOString();

  console.log(
    `[RIO Token Manager] Token BURNED for intent ${intentId} — single-use enforced`
  );

  return {
    valid: true,
    intent_id: entry.intent_id,
    issued_at: entry.issued_at,
    burned_at: entry.burned_at,
  };
}

// ---------------------------------------------------------------------------
// Get token status (for debugging / health checks)
// ---------------------------------------------------------------------------
export function getTokenStatus(tokenString) {
  const entry = tokenStore.get(tokenString);
  if (!entry) return null;

  const now = new Date();
  const expiresAt = new Date(entry.expires_at);

  return {
    intent_id: entry.intent_id,
    issued_at: entry.issued_at,
    expires_at: entry.expires_at,
    burned: entry.burned,
    burned_at: entry.burned_at,
    expired: now > expiresAt,
  };
}

// ---------------------------------------------------------------------------
// Get active token count (for health endpoint)
// ---------------------------------------------------------------------------
export function getActiveTokenCount() {
  let active = 0;
  const now = new Date();
  for (const entry of tokenStore.values()) {
    if (!entry.burned && new Date(entry.expires_at) > now) {
      active++;
    }
  }
  return active;
}

// ---------------------------------------------------------------------------
// Automatic cleanup — remove expired and burned tokens
// ---------------------------------------------------------------------------
function cleanupTokens() {
  const now = new Date();
  let removed = 0;

  for (const [token, entry] of tokenStore.entries()) {
    const expiresAt = new Date(entry.expires_at);

    // Remove expired tokens
    if (now > expiresAt) {
      tokenStore.delete(token);
      removed++;
      continue;
    }

    // Remove burned tokens after a retention period (1 hour after burn)
    if (entry.burned && entry.burned_at) {
      const burnedAt = new Date(entry.burned_at);
      const retentionMs = 60 * 60 * 1000; // 1 hour
      if (now - burnedAt > retentionMs) {
        tokenStore.delete(token);
        removed++;
      }
    }
  }

  if (removed > 0) {
    console.log(
      `[RIO Token Manager] Cleanup: removed ${removed} expired/burned tokens. Active: ${tokenStore.size}`
    );
  }
}

// Start automatic cleanup
const cleanupTimer = setInterval(cleanupTokens, CLEANUP_INTERVAL_MS);
// Allow process to exit cleanly
if (cleanupTimer.unref) cleanupTimer.unref();

console.log(
  `[RIO Token Manager] Initialized — TTL: ${TOKEN_EXPIRY_SECONDS}s, cleanup every ${CLEANUP_INTERVAL_MS / 1000}s`
);
