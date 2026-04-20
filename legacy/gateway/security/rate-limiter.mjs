/**
 * RIO Gateway — Rate Limiter (WS-012: Public API)
 *
 * Sliding window rate limiter for API key-authenticated requests.
 * Uses in-memory counters with per-key limits.
 *
 * Rate limits:
 *   - Per API key: configurable (default 100 req/min)
 *   - Global fallback: 30 req/min for unauthenticated requests
 *   - Exempt: JWT-authenticated requests (internal users)
 *
 * Headers returned:
 *   - X-RateLimit-Limit: max requests per window
 *   - X-RateLimit-Remaining: requests remaining
 *   - X-RateLimit-Reset: seconds until window resets
 *   - Retry-After: seconds to wait (on 429 only)
 */

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------
const WINDOW_MS = 60 * 1000; // 1 minute sliding window
const GLOBAL_LIMIT = parseInt(process.env.RATE_LIMIT_GLOBAL || "30");
const CLEANUP_INTERVAL_MS = 5 * 60 * 1000; // Clean up every 5 min

// ---------------------------------------------------------------------------
// In-memory rate limit store
// key -> { timestamps: number[], limit: number }
// ---------------------------------------------------------------------------
const rateLimitStore = new Map();

/**
 * Get the rate limit bucket key for a request.
 * API key requests use the key_id; others use IP.
 */
function getBucketKey(req) {
  if (req.apiKey) {
    return `apikey:${req.apiKey.key_id}`;
  }
  // Fallback to IP for unauthenticated requests
  const ip = req.headers["x-forwarded-for"]?.split(",")[0]?.trim() || req.ip;
  return `ip:${ip}`;
}

/**
 * Get the rate limit for a request.
 */
function getLimit(req) {
  if (req.apiKey) {
    return req.apiKey.rate_limit || 100;
  }
  return GLOBAL_LIMIT;
}

/**
 * Check and update rate limit for a request.
 * Returns { allowed, limit, remaining, resetMs }
 */
function checkRateLimit(bucketKey, limit) {
  const now = Date.now();
  const windowStart = now - WINDOW_MS;

  let bucket = rateLimitStore.get(bucketKey);
  if (!bucket) {
    bucket = { timestamps: [], limit };
    rateLimitStore.set(bucketKey, bucket);
  }

  // Remove timestamps outside the window
  bucket.timestamps = bucket.timestamps.filter((t) => t > windowStart);

  // Check if under limit
  if (bucket.timestamps.length >= limit) {
    const oldestInWindow = bucket.timestamps[0];
    const resetMs = oldestInWindow + WINDOW_MS - now;
    return {
      allowed: false,
      limit,
      remaining: 0,
      resetMs: Math.max(0, resetMs),
    };
  }

  // Record this request
  bucket.timestamps.push(now);

  return {
    allowed: true,
    limit,
    remaining: limit - bucket.timestamps.length,
    resetMs: WINDOW_MS,
  };
}

// ---------------------------------------------------------------------------
// Express Middleware
// ---------------------------------------------------------------------------

/**
 * Rate limiting middleware for the public API.
 * JWT-authenticated requests (internal users) are exempt.
 * API key requests are rate-limited per key.
 * Unauthenticated requests are rate-limited per IP.
 */
export function rateLimitMiddleware(req, res, next) {
  // JWT-authenticated internal users are exempt from rate limiting
  if (req.user && !req.apiKey) {
    return next();
  }

  const bucketKey = getBucketKey(req);
  const limit = getLimit(req);
  const result = checkRateLimit(bucketKey, limit);

  // Set rate limit headers on all responses
  res.set("X-RateLimit-Limit", String(result.limit));
  res.set("X-RateLimit-Remaining", String(result.remaining));
  res.set(
    "X-RateLimit-Reset",
    String(Math.ceil(result.resetMs / 1000))
  );

  if (!result.allowed) {
    const retryAfter = Math.ceil(result.resetMs / 1000);
    res.set("Retry-After", String(retryAfter));

    console.log(
      `[RIO Rate Limiter] RATE LIMITED: ${bucketKey} — ${result.limit} req/min exceeded`
    );

    return res.status(429).json({
      error: "Rate limit exceeded",
      limit: result.limit,
      window: "1 minute",
      retry_after_seconds: retryAfter,
      hint: "Reduce request frequency or upgrade your API key tier.",
    });
  }

  next();
}

// ---------------------------------------------------------------------------
// Stats
// ---------------------------------------------------------------------------
export function getRateLimitStats() {
  return {
    tracked_buckets: rateLimitStore.size,
    window_ms: WINDOW_MS,
    global_limit: GLOBAL_LIMIT,
  };
}

// ---------------------------------------------------------------------------
// Cleanup — remove stale buckets
// ---------------------------------------------------------------------------
function cleanup() {
  const now = Date.now();
  const windowStart = now - WINDOW_MS;
  let removed = 0;

  for (const [key, bucket] of rateLimitStore.entries()) {
    bucket.timestamps = bucket.timestamps.filter((t) => t > windowStart);
    if (bucket.timestamps.length === 0) {
      rateLimitStore.delete(key);
      removed++;
    }
  }

  if (removed > 0) {
    console.log(
      `[RIO Rate Limiter] Cleanup: removed ${removed} stale bucket(s). Active: ${rateLimitStore.size}`
    );
  }
}

const cleanupTimer = setInterval(cleanup, CLEANUP_INTERVAL_MS);
if (cleanupTimer.unref) cleanupTimer.unref();

console.log(
  `[RIO Rate Limiter] Initialized — global limit: ${GLOBAL_LIMIT} req/min, window: ${WINDOW_MS / 1000}s`
);
