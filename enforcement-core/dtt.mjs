/**
 * RIO Enforcement Core — Delegated Trust Token (DTT)
 *
 * Each token is:
 *   - single-use (nonce)
 *   - time-bound (TTL)
 *   - trace-bound (trace_id)
 *   - bound to full payload hash (intent_hash)
 *
 * Lifecycle: ACTIVE → CONSUMED | EXPIRED
 * FAIL-CLOSED: any validation failure → DENY
 */
import { randomUUID, createHash } from "crypto";

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------
const DEFAULT_TTL_MS = 30 * 60 * 1000; // 30 minutes

// ---------------------------------------------------------------------------
// In-memory token store
// ---------------------------------------------------------------------------
const store = new Map();

// ---------------------------------------------------------------------------
// Utility
// ---------------------------------------------------------------------------
export function sha256(data) {
  return createHash("sha256").update(data).digest("hex");
}

export function canonicalHash(obj) {
  const canonical = JSON.stringify(deepSort(obj));
  return sha256(canonical);
}

/**
 * Recursively sort all object keys for deterministic serialization.
 */
function deepSort(val) {
  if (val === null || val === undefined) return val;
  if (Array.isArray(val)) return val.map(deepSort);
  if (typeof val === "object" && !(val instanceof Date)) {
    const sorted = {};
    for (const key of Object.keys(val).sort()) {
      sorted[key] = deepSort(val[key]);
    }
    return sorted;
  }
  return val;
}

// ---------------------------------------------------------------------------
// Issue a DTT
// ---------------------------------------------------------------------------
/**
 * @param {object} opts
 * @param {string} opts.trace_id   — trace this token is bound to
 * @param {string} opts.intent_hash — sha256(intent + payload)
 * @param {number} [opts.ttl_ms]   — time-to-live in ms (default 30 min)
 * @returns {{ token_id: string, trace_id: string, intent_hash: string, issued_at: string, expires_at: string }}
 */
export function issueToken({ trace_id, intent_hash, ttl_ms = DEFAULT_TTL_MS }) {
  if (!trace_id) throw new Error("DTT: trace_id required");
  if (!intent_hash) throw new Error("DTT: intent_hash required");

  const token_id = randomUUID();
  const nonce = randomUUID();
  const now = Date.now();
  const issued_at = new Date(now).toISOString();
  const expires_at = new Date(now + ttl_ms).toISOString();

  store.set(token_id, {
    trace_id,
    intent_hash,
    nonce,
    status: "ACTIVE",
    issued_at,
    expires_at,
    consumed_at: null,
  });

  return { token_id, trace_id, intent_hash, issued_at, expires_at };
}

// ---------------------------------------------------------------------------
// Validate a DTT (does NOT consume — read-only check)
// ---------------------------------------------------------------------------
/**
 * @param {string} token_id
 * @param {string} trace_id   — must match token.trace_id
 * @param {string} intent_hash — must match token.intent_hash
 * @returns {{ valid: boolean, reason_code: string|null, detail: string|null }}
 */
export function validateToken(token_id, trace_id, intent_hash) {
  // 1. TOKEN_PRESENT
  if (!token_id) {
    return { valid: false, reason_code: "MISSING_TOKEN", detail: "No token provided" };
  }

  const entry = store.get(token_id);

  // 2. TOKEN_VALID — exists
  if (!entry) {
    return { valid: false, reason_code: "INVALID_TOKEN", detail: "Token not found" };
  }

  // 2b. TOKEN_VALID — not consumed
  if (entry.status === "CONSUMED") {
    return { valid: false, reason_code: "TOKEN_USED", detail: `Token consumed at ${entry.consumed_at}` };
  }

  // 2c. TOKEN_VALID — not expired
  if (new Date() > new Date(entry.expires_at)) {
    entry.status = "EXPIRED";
    return { valid: false, reason_code: "INVALID_TOKEN", detail: `Token expired at ${entry.expires_at}` };
  }

  // 3. TRACE_MATCH
  if (entry.trace_id !== trace_id) {
    return { valid: false, reason_code: "TRACE_MISMATCH", detail: `Token trace ${entry.trace_id} != request trace ${trace_id}` };
  }

  // 4. INTENT_BINDING
  if (entry.intent_hash !== intent_hash) {
    return { valid: false, reason_code: "ACT_BINDING_MISMATCH", detail: "Payload hash does not match token binding" };
  }

  return { valid: true, reason_code: null, detail: null };
}

// ---------------------------------------------------------------------------
// Consume (burn) a DTT — single-use enforcement
// ---------------------------------------------------------------------------
export function consumeToken(token_id) {
  const entry = store.get(token_id);
  if (!entry) return false;
  if (entry.status !== "ACTIVE") return false;
  entry.status = "CONSUMED";
  entry.consumed_at = new Date().toISOString();
  return true;
}

// ---------------------------------------------------------------------------
// Helpers for testing
// ---------------------------------------------------------------------------
export function getTokenStatus(token_id) {
  const entry = store.get(token_id);
  return entry ? entry.status : null;
}

export function clearStore() {
  store.clear();
}

/**
 * Issue a token that is already expired (for testing).
 */
export function issueExpiredToken({ trace_id, intent_hash }) {
  const token_id = randomUUID();
  const nonce = randomUUID();
  const past = Date.now() - 60_000; // 1 minute ago
  store.set(token_id, {
    trace_id,
    intent_hash,
    nonce,
    status: "ACTIVE",
    issued_at: new Date(past - 60_000).toISOString(),
    expires_at: new Date(past).toISOString(), // already expired
    consumed_at: null,
  });
  return { token_id, trace_id, intent_hash, issued_at: new Date(past - 60_000).toISOString(), expires_at: new Date(past).toISOString() };
}
