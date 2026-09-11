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
// Utility: SHA-256 hash of strict canonical JSON
// ---------------------------------------------------------------------------
function sha256(data) {
  return createHash("sha256").update(data).digest("hex");
}

function canonicalJson(value, stack = new Set()) {
  if (value === null) return "null";
  if (typeof value === "string" || typeof value === "boolean") return JSON.stringify(value);
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new TypeError("Token arguments must contain only finite JSON numbers");
    return JSON.stringify(value);
  }
  if (typeof value !== "object") {
    throw new TypeError(`Token arguments cannot contain ${typeof value} values`);
  }
  if (stack.has(value)) throw new TypeError("Token arguments cannot contain cycles");
  stack.add(value);
  try {
    if (Array.isArray(value)) {
      const keys = Object.keys(value);
      if (keys.length !== value.length || keys.some((key, index) => key !== String(index))) {
        throw new TypeError("Token argument arrays must be dense and cannot have extra members");
      }
      if (Reflect.ownKeys(value).some(key => typeof key !== "string" || (key !== "length" && !keys.includes(key)))) {
        throw new TypeError("Token argument arrays cannot have hidden or symbol members");
      }
      return `[${value.map(item => canonicalJson(item, stack)).join(",")}]`;
    }
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) {
      throw new TypeError("Token arguments must be plain JSON objects");
    }
    const keys = Reflect.ownKeys(value);
    if (keys.some(key => typeof key !== "string")) {
      throw new TypeError("Token argument objects cannot have symbol members");
    }
    for (const key of keys) {
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (!descriptor?.enumerable || !("value" in descriptor)) {
        throw new TypeError("Token argument objects cannot have hidden or accessor members");
      }
    }
    return `{${keys.sort().map(key => `${JSON.stringify(key)}:${canonicalJson(value[key], stack)}`).join(",")}}`;
  } finally {
    stack.delete(value);
  }
}

/** Canonicalize one exact plain-JSON argument object, recursively. */
export function canonicalizeArgs(args) {
  if (args === null || typeof args !== "object" || Array.isArray(args)) {
    throw new TypeError("Token arguments must be a plain JSON object");
  }
  return canonicalJson(args);
}

/** Compute a content identity over every nested argument field. */
export function computeArgsHash(args) {
  return sha256(canonicalizeArgs(args));
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
 * @param {string} [opts.environment] - Execution environment (required after default resolution)
 * @param {number} [opts.max_executions] - Must be exactly 1
 * @param {function} opts.signFn - Ed25519 sign function (payload => signature)
 * @returns {{ token_id, token, payload, signature, expires_at }}
 */
export function issueExecutionToken(opts) {
  if (!opts || typeof opts !== "object" || Array.isArray(opts)) {
    throw new TypeError("[RIO Token Manager] Token issuance requires an exact options object");
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

  if (typeof intent_id !== "string" || !intent_id) throw new Error("[RIO Token Manager] Cannot issue token without intent_id");
  if (typeof tool_name !== "string" || !tool_name) throw new Error("[RIO Token Manager] Cannot issue token without tool_name");
  if (typeof args_hash !== "string" || !/^[0-9a-f]{64}$/.test(args_hash)) throw new Error("[RIO Token Manager] Cannot issue token without a SHA-256 args_hash");
  if (typeof environment !== "string" || !environment) throw new Error("[RIO Token Manager] Cannot issue token without environment");
  if (max_executions !== 1) throw new Error("[RIO Token Manager] F0.1 execution tokens are single-use");
  if (typeof signFn !== "function") throw new Error("[RIO Token Manager] Cannot issue unsigned execution token");

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

  // Every execution token is signed; unsigned issuance is forbidden.
  const payloadString = JSON.stringify(payload);
  const signature = signFn(payloadString);
  if (typeof signature !== "string" || !signature) {
    throw new Error("[RIO Token Manager] Signing function returned no signature");
  }

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
 * @param {object} bindingChecks - Required point-of-use binding verification
 * @param {string} bindingChecks.tool_name - Tool being executed
 * @param {string} bindingChecks.args_hash - Hash of actual args
 * @param {string} bindingChecks.environment - Current environment
 * @param {string} bindingChecks.signature - Exact issued token signature
 * @param {function} bindingChecks.verifyFn - Ed25519 verify function
 * @returns {{ valid: boolean, reason?: string, checks?: object }}
 */
export function validateAndBurnToken(intentId, tokenString, bindingChecks) {
  const checks = {
    binding_inputs_present: false,
    token_exists: false,
    token_active: false,
    token_not_expired: false,
    intent_binding: false,
    tool_binding: false,
    args_binding: false,
    environment_binding: false,
    payload_integrity: false,
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

  const bindingInputsPresent = bindingChecks && typeof bindingChecks === "object" &&
    typeof bindingChecks.tool_name === "string" && bindingChecks.tool_name.length > 0 &&
    typeof bindingChecks.args_hash === "string" && /^[0-9a-f]{64}$/.test(bindingChecks.args_hash) &&
    typeof bindingChecks.environment === "string" && bindingChecks.environment.length > 0 &&
    typeof bindingChecks.signature === "string" && bindingChecks.signature.length > 0 &&
    typeof bindingChecks.verifyFn === "function";
  if (!bindingInputsPresent) {
    return { valid: false, reason: "All point-of-use token binding and signature checks are required.", checks };
  }
  checks.binding_inputs_present = true;

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

  // 5. Tool binding
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
  checks.tool_binding = true;

  // 6. Args hash binding
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
  checks.args_binding = true;

  // 7. Environment binding
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
  checks.environment_binding = true;

  // 8. Stored-payload integrity and exact signature verification
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
  if (sha256(payload) !== entry.payload_hash) {
    return { valid: false, reason: "Stored execution token payload failed its integrity check.", checks };
  }
  checks.payload_integrity = true;
  let sigValid = false;
  try {
    sigValid = bindingChecks.signature === entry.signature && bindingChecks.verifyFn(payload, entry.signature);
  } catch {
    sigValid = false;
  }
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
