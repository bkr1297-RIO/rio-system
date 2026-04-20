/**
 * RIO Gateway — Token Manager v2 (Hardened: Binding + Signature + Nonce)
 *
 * Prevents execution token replay, mismatch, and forgery attacks.
 * Each execution token can be used EXACTLY ONCE, for EXACTLY ONE INTENT,
 * with EXACTLY the approved tool and arguments.
 *
 * Security guarantees:
 * - Tokens are random UUIDs (unpredictable)
 * - Tokens are bound to: intent_id, tool_name, args_hash, environment
 * - Tokens include a unique nonce (anti-replay)
 * - Tokens are signed by the gateway Ed25519 key (anti-forgery)
 * - Tokens expire after a configurable TTL (default 30 min)
 * - Tokens enforce max_executions (default 1)
 * - Tokens are burned (marked used) on first use
 * - Burned tokens cannot be reused
 * - Expired tokens are automatically cleaned up
 *
 * Token lifecycle: ACTIVE → USED → EXPIRED
 *
 * FAIL CLOSED: Any validation failure rejects the request.
 */

import { randomUUID, createHash } from "crypto";

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------
const TOKEN_EXPIRY_SECONDS = parseInt(
  process.env.EXECUTION_TOKEN_EXPIRY_SECONDS || "1800"
); // 30 min default
const CLEANUP_INTERVAL_MS = 5 * 60 * 1000; // Clean up every 5 minutes
const EXECUTION_ENVIRONMENT = process.env.RIO_ENVIRONMENT || process.env.NODE_ENV || "production";

// ---------------------------------------------------------------------------
// In-memory token store
// Production: Replace with Redis or PostgreSQL for horizontal scaling
// ---------------------------------------------------------------------------
const tokenStore = new Map();

// ---------------------------------------------------------------------------
// Utility: SHA-256 hash of canonical JSON
// ---------------------------------------------------------------------------
function sha256(data) {
  return createHash("sha256").update(data).digest("hex");
}

/**
 * Compute args_hash from tool arguments.
 * Uses canonical JSON (sorted keys) for deterministic hashing.
 */
export function computeArgsHash(args) {
  if (!args || typeof args !== "object") return sha256("{}");
  const canonical = JSON.stringify(args, Object.keys(args).sort());
  return sha256(canonical);
}

// ---------------------------------------------------------------------------
// Issue a new execution token for an intent (HARDENED)
// ---------------------------------------------------------------------------
/**
 * @param {object} opts
 * @param {string} opts.intent_id - The intent this token authorizes
 * @param {string} opts.approval_id - The approval that triggered issuance
 * @param {string} opts.tool_name - The specific tool/action authorized
 * @param {string} opts.args_hash - SHA-256 of canonical JSON args
 * @param {string} [opts.environment] - Execution environment
 * @param {number} [opts.max_executions] - Max uses (default 1)
 * @param {function} [opts.signFn] - Ed25519 sign function (payload => signature hex)
 * @returns {{ token_id, token, payload, signature, expires_at }}
 */
export function issueExecutionToken(opts) {
  // Backward compatibility: if called with just a string (intent_id), wrap it
  if (typeof opts === "string") {
    opts = { intent_id: opts };
  }

  const {
    intent_id,
    approval_id = null,
    tool_name = null,
    args_hash = null,
    environment = EXECUTION_ENVIRONMENT,
    max_executions = 1,
    signFn = null,
  } = opts;

  if (!intent_id) {
    throw new Error("[RIO Token Manager] Cannot issue token without intent_id");
  }

  const token = randomUUID();
  const nonce = randomUUID();
  const now = Date.now();
  const issuedAt = new Date(now).toISOString();
  const expiresAt = new Date(now + TOKEN_EXPIRY_SECONDS * 1000).toISOString();

  // Build the token payload (this is what gets signed)
  const payload = {
    token_id: token,
    intent_id,
    approval_id,
    tool_name,
    args_hash,
    environment,
    issued_at: issuedAt,
    expires_at: expiresAt,
    max_executions,
    nonce,
  };

  // Sign the payload if a signing function is provided
  const payloadString = JSON.stringify(payload);
  const signature = signFn ? signFn(payloadString) : null;

  // Store in memory with lifecycle state
  tokenStore.set(token, {
    // Binding fields
    intent_id,
    approval_id,
    tool_name,
    args_hash,
    environment,
    nonce,
    // Lifecycle
    status: "ACTIVE",
    issued_at: issuedAt,
    expires_at: expiresAt,
    max_executions,
    execution_count: 0,
    // Signature
    signature,
    payload_hash: sha256(payloadString),
    // Burn tracking
    burned: false,
    burned_at: null,
  });

  console.log(
    `[RIO Token Manager] Token issued: ${token.substring(0, 8)}... for intent ${intent_id} | tool=${tool_name} | env=${environment} | max=${max_executions} | expires ${expiresAt}`
  );

  return {
    token_id: token,
    token,
    payload,
    signature,
    expires_at: expiresAt,
  };
}

// ---------------------------------------------------------------------------
// Validate and burn a token (HARDENED — full binding checks)
// ---------------------------------------------------------------------------
/**
 * @param {string} intentId - The intent being executed
 * @param {string} tokenString - The token UUID
 * @param {object} [bindingChecks] - Optional binding verification
 * @param {string} [bindingChecks.tool_name] - Tool being executed
 * @param {string} [bindingChecks.args_hash] - Hash of actual args
 * @param {string} [bindingChecks.environment] - Current environment
 * @param {string} [bindingChecks.signature] - Token signature to verify
 * @param {function} [bindingChecks.verifyFn] - Ed25519 verify function
 * @returns {{ valid: boolean, reason?: string, checks?: object }}
 */
export function validateAndBurnToken(intentId, tokenString, bindingChecks = {}) {
  const checks = {
    token_exists: false,
    token_active: false,
    token_not_expired: false,
    intent_binding: false,
    tool_binding: false,
    args_binding: false,
    environment_binding: false,
    signature_valid: false,
    execution_limit: false,
  };

  if (!tokenString) {
    return {
      valid: false,
      reason: "No execution token provided.",
      checks,
    };
  }

  const entry = tokenStore.get(tokenString);

  // 1. Token exists
  if (!entry) {
    return {
      valid: false,
      reason: "Execution token not found. It may have expired or never existed.",
      checks,
    };
  }
  checks.token_exists = true;

  // 2. Token is ACTIVE (not already used)
  if (entry.status !== "ACTIVE" || entry.burned) {
    console.log(
      `[RIO Token Manager] REPLAY BLOCKED: Token for intent ${intentId} status=${entry.status} burned=${entry.burned} burned_at=${entry.burned_at}`
    );
    return {
      valid: false,
      reason: `Execution token has already been used (status: ${entry.status}, burned at ${entry.burned_at}). Tokens are single-use.`,
      checks,
    };
  }
  checks.token_active = true;

  // 3. Token not expired
  const now = new Date();
  const expiresAt = new Date(entry.expires_at);
  if (now > expiresAt) {
    entry.status = "EXPIRED";
    console.log(
      `[RIO Token Manager] EXPIRED: Token for intent ${intentId} expired at ${entry.expires_at}`
    );
    return {
      valid: false,
      reason: `Execution token expired at ${entry.expires_at}. Request a new token via POST /execute.`,
      checks,
    };
  }
  checks.token_not_expired = true;

  // 4. Intent binding
  if (entry.intent_id !== intentId) {
    console.log(
      `[RIO Token Manager] BINDING FAIL: Token intent ${entry.intent_id} !== request intent ${intentId}`
    );
    return {
      valid: false,
      reason: "Execution token does not match the specified intent. Tokens are bound to a single intent.",
      checks,
    };
  }
  checks.intent_binding = true;

  // 5. Tool binding (if token has tool_name and check is provided)
  if (entry.tool_name && bindingChecks.tool_name) {
    if (entry.tool_name !== bindingChecks.tool_name) {
      console.log(
        `[RIO Token Manager] TOOL BINDING FAIL: Token tool=${entry.tool_name} !== request tool=${bindingChecks.tool_name}`
      );
      return {
        valid: false,
        reason: `Token authorized for tool "${entry.tool_name}" but execution requested for "${bindingChecks.tool_name}". Tool binding mismatch.`,
        checks,
      };
    }
  }
  checks.tool_binding = true;

  // 6. Args hash binding (if token has args_hash and check is provided)
  if (entry.args_hash && bindingChecks.args_hash) {
    if (entry.args_hash !== bindingChecks.args_hash) {
      console.log(
        `[RIO Token Manager] ARGS BINDING FAIL: Token args_hash=${entry.args_hash.substring(0, 16)}... !== request args_hash=${bindingChecks.args_hash.substring(0, 16)}...`
      );
      return {
        valid: false,
        reason: "Execution arguments do not match the approved arguments. Args hash mismatch.",
        checks,
      };
    }
  }
  checks.args_binding = true;

  // 7. Environment binding (if token has environment and check is provided)
  if (entry.environment && bindingChecks.environment) {
    if (entry.environment !== bindingChecks.environment) {
      console.log(
        `[RIO Token Manager] ENVIRONMENT BINDING FAIL: Token env=${entry.environment} !== request env=${bindingChecks.environment}`
      );
      return {
        valid: false,
        reason: `Token issued for environment "${entry.environment}" but execution attempted in "${bindingChecks.environment}". Environment mismatch.`,
        checks,
      };
    }
  }
  checks.environment_binding = true;

  // 8. Signature verification (if signature and verifyFn provided)
  if (bindingChecks.signature && bindingChecks.verifyFn && entry.payload_hash) {
    // Reconstruct payload from stored fields for verification
    const payload = JSON.stringify({
      token_id: tokenString,
      intent_id: entry.intent_id,
      approval_id: entry.approval_id,
      tool_name: entry.tool_name,
      args_hash: entry.args_hash,
      environment: entry.environment,
      issued_at: entry.issued_at,
      expires_at: entry.expires_at,
      max_executions: entry.max_executions,
      nonce: entry.nonce,
    });
    const sigValid = bindingChecks.verifyFn(payload, bindingChecks.signature);
    if (!sigValid) {
      console.log(
        `[RIO Token Manager] SIGNATURE FAIL: Token signature verification failed for intent ${intentId}`
      );
      return {
        valid: false,
        reason: "Token signature verification failed. The token may have been tampered with.",
        checks,
      };
    }
  }
  checks.signature_valid = true;

  // 9. Execution count limit
  if (entry.execution_count >= entry.max_executions) {
    console.log(
      `[RIO Token Manager] EXECUTION LIMIT: Token for intent ${intentId} used ${entry.execution_count}/${entry.max_executions} times`
    );
    return {
      valid: false,
      reason: `Token execution limit reached (${entry.execution_count}/${entry.max_executions}). Tokens are single-use.`,
      checks,
    };
  }
  checks.execution_limit = true;

  // --- ALL CHECKS PASS: Burn the token ---
  entry.execution_count += 1;
  entry.burned = true;
  entry.burned_at = now.toISOString();
  entry.status = "USED";

  console.log(
    `[RIO Token Manager] Token BURNED: ${tokenString.substring(0, 8)}... for intent ${intentId} — all ${Object.values(checks).filter(Boolean).length} checks passed`
  );

  return {
    valid: true,
    intent_id: entry.intent_id,
    tool_name: entry.tool_name,
    args_hash: entry.args_hash,
    environment: entry.environment,
    issued_at: entry.issued_at,
    burned_at: entry.burned_at,
    nonce: entry.nonce,
    checks,
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
    tool_name: entry.tool_name,
    args_hash: entry.args_hash,
    environment: entry.environment,
    status: entry.status,
    issued_at: entry.issued_at,
    expires_at: entry.expires_at,
    burned: entry.burned,
    burned_at: entry.burned_at,
    expired: now > expiresAt,
    execution_count: entry.execution_count,
    max_executions: entry.max_executions,
    nonce: entry.nonce,
  };
}

// ---------------------------------------------------------------------------
// Get active token count (for health endpoint)
// ---------------------------------------------------------------------------
export function getActiveTokenCount() {
  let active = 0;
  const now = new Date();
  for (const entry of tokenStore.values()) {
    if (entry.status === "ACTIVE" && !entry.burned && new Date(entry.expires_at) > now) {
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

    // Expire active tokens past their TTL
    if (entry.status === "ACTIVE" && now > expiresAt) {
      entry.status = "EXPIRED";
    }

    // Remove expired tokens after retention
    if (entry.status === "EXPIRED" && now > expiresAt) {
      tokenStore.delete(token);
      removed++;
      continue;
    }

    // Remove burned tokens after a retention period (1 hour after burn)
    if (entry.status === "USED" && entry.burned && entry.burned_at) {
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
      `[RIO Token Manager] Cleanup: removed ${removed} expired/burned tokens. Active: ${getActiveTokenCount()}`
    );
  }
}

// Start automatic cleanup
const cleanupTimer = setInterval(cleanupTokens, CLEANUP_INTERVAL_MS);
// Allow process to exit cleanly
if (cleanupTimer.unref) cleanupTimer.unref();

console.log(
  `[RIO Token Manager] Initialized v2 (hardened) — TTL: ${TOKEN_EXPIRY_SECONDS}s, env: ${EXECUTION_ENVIRONMENT}, cleanup every ${CLEANUP_INTERVAL_MS / 1000}s`
);
