/**
 * RIO Gateway — Replay Prevention (Fix #2: Nonce + Timestamp Validation)
 *
 * Prevents request replay attacks on all state-changing endpoints.
 * Every POST to /intent, /govern, /authorize, /execute, /execute-confirm
 * MUST include request_timestamp and request_nonce.
 *
 * Security guarantees:
 * - Each nonce can only be used once (deduplication)
 * - Timestamps must be within a configurable window (default 5 min)
 * - Future timestamps rejected (with 10s clock skew tolerance)
 * - Expired nonces automatically cleaned up
 *
 * FAIL CLOSED: Any validation failure rejects the request.
 */

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------
const REQUEST_WINDOW_SECONDS = parseInt(
  process.env.REQUEST_WINDOW_SECONDS || "300"
); // 5 min default
const CLOCK_SKEW_TOLERANCE_MS = 10 * 1000; // 10 seconds
const NONCE_RETENTION_HOURS = parseInt(
  process.env.NONCE_RETENTION_HOURS || "24"
);
const CLEANUP_INTERVAL_MS = 60 * 60 * 1000; // Clean up every hour

// ---------------------------------------------------------------------------
// In-memory nonce store
// Production: Replace with Redis + TTL for horizontal scaling
// ---------------------------------------------------------------------------
const nonceStore = new Map(); // nonce -> { path, timestamp, used_at }

// Endpoints that require replay prevention (all state-changing POSTs)
const PROTECTED_ENDPOINTS = new Set([
  "/intent",
  "/govern",
  "/authorize",
  "/execute",
  "/execute-confirm",
  "/receipt",
]);

// ---------------------------------------------------------------------------
// Validate request nonce and timestamp
// ---------------------------------------------------------------------------
export function validateRequestNonce(req) {
  const path = req.path;

  // Only enforce on protected endpoints
  if (!PROTECTED_ENDPOINTS.has(path)) {
    return { valid: true, reason: "Endpoint not protected by replay prevention." };
  }

  const { request_timestamp, request_nonce } = req.body || {};

  // --- Require both fields ---
  if (!request_timestamp) {
    return {
      valid: false,
      reason:
        "Missing required field: request_timestamp. All state-changing requests must include a timestamp.",
    };
  }

  if (!request_nonce) {
    return {
      valid: false,
      reason:
        "Missing required field: request_nonce. All state-changing requests must include a unique nonce.",
    };
  }

  // --- Validate timestamp ---
  const requestTime = new Date(request_timestamp);
  if (isNaN(requestTime.getTime())) {
    return {
      valid: false,
      reason: `Invalid request_timestamp format: "${request_timestamp}". Use ISO 8601 format.`,
    };
  }

  const now = Date.now();
  const requestMs = requestTime.getTime();

  // Check if timestamp is too old
  const maxAgeMs = REQUEST_WINDOW_SECONDS * 1000;
  if (now - requestMs > maxAgeMs) {
    return {
      valid: false,
      reason: `Request timestamp is too old. Must be within ${REQUEST_WINDOW_SECONDS} seconds. Received: ${request_timestamp}`,
    };
  }

  // Check if timestamp is in the future (beyond clock skew tolerance)
  if (requestMs - now > CLOCK_SKEW_TOLERANCE_MS) {
    return {
      valid: false,
      reason: `Request timestamp is in the future (beyond ${CLOCK_SKEW_TOLERANCE_MS / 1000}s tolerance). Received: ${request_timestamp}`,
    };
  }

  // --- Validate nonce uniqueness ---
  const nonceKey = `${path}:${request_nonce}`;

  if (nonceStore.has(nonceKey)) {
    const existing = nonceStore.get(nonceKey);
    console.log(
      `[RIO Replay Prevention] REPLAY BLOCKED: Nonce "${request_nonce}" already used on ${path} at ${existing.used_at}`
    );
    return {
      valid: false,
      reason: `Nonce "${request_nonce}" has already been used on ${path}. Each request must have a unique nonce.`,
    };
  }

  // --- VALID: Record the nonce ---
  nonceStore.set(nonceKey, {
    path,
    timestamp: request_timestamp,
    used_at: new Date(now).toISOString(),
  });

  return {
    valid: true,
    nonce: request_nonce,
    timestamp: request_timestamp,
  };
}

// ---------------------------------------------------------------------------
// Express middleware for replay prevention
// ---------------------------------------------------------------------------
export function replayPreventionMiddleware(req, res, next) {
  // Only apply to POST requests
  if (req.method !== "POST") {
    return next();
  }

  const result = validateRequestNonce(req);

  if (!result.valid) {
    console.log(
      `[RIO Replay Prevention] REJECTED ${req.method} ${req.path}: ${result.reason}`
    );
    return res.status(400).json({
      error: "Replay prevention check failed",
      reason: result.reason,
      hint: "Include request_timestamp (ISO 8601) and request_nonce (unique UUID) in request body.",
    });
  }

  next();
}

// ---------------------------------------------------------------------------
// Get nonce store stats (for health endpoint)
// ---------------------------------------------------------------------------
export function getReplayPreventionStats() {
  return {
    tracked_nonces: nonceStore.size,
    retention_hours: NONCE_RETENTION_HOURS,
    request_window_seconds: REQUEST_WINDOW_SECONDS,
  };
}

// ---------------------------------------------------------------------------
// Automatic cleanup — remove expired nonces
// ---------------------------------------------------------------------------
function cleanupNonces() {
  const now = Date.now();
  const retentionMs = NONCE_RETENTION_HOURS * 60 * 60 * 1000;
  let removed = 0;

  for (const [key, entry] of nonceStore.entries()) {
    const usedAt = new Date(entry.used_at).getTime();
    if (now - usedAt > retentionMs) {
      nonceStore.delete(key);
      removed++;
    }
  }

  if (removed > 0) {
    console.log(
      `[RIO Replay Prevention] Cleanup: removed ${removed} expired nonces. Active: ${nonceStore.size}`
    );
  }
}

// Start automatic cleanup
const cleanupTimer = setInterval(cleanupNonces, CLEANUP_INTERVAL_MS);
if (cleanupTimer.unref) cleanupTimer.unref();

console.log(
  `[RIO Replay Prevention] Initialized — window: ${REQUEST_WINDOW_SECONDS}s, retention: ${NONCE_RETENTION_HOURS}h`
);
