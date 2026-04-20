/**
 * RIO Gateway — API Key Authentication Middleware (WS-012: Public API)
 *
 * Authenticates requests using API keys passed via X-API-Key header.
 * Works alongside JWT auth — if a valid JWT is present, API key is optional.
 * If both are present, API key takes precedence for rate limiting.
 *
 * Authentication hierarchy:
 *   1. X-API-Key header → validates against api_keys table
 *   2. Authorization: Bearer <jwt> → validates JWT (existing middleware)
 *   3. No auth → limited access (read-only public endpoints)
 *
 * Sets req.apiKey if API key is valid.
 * Sets req.authMethod to "api_key", "jwt", or "none".
 */
import { validateApiKey, hasScope } from "./api-keys.mjs";

/**
 * API key authentication middleware.
 * Checks X-API-Key header and sets req.apiKey if valid.
 * Does NOT block — downstream route handlers decide if auth is required.
 */
export function apiKeyAuth(req, res, next) {
  const apiKey = req.headers["x-api-key"];

  if (apiKey) {
    const keyRecord = validateApiKey(apiKey);
    if (keyRecord) {
      req.apiKey = keyRecord;
      req.authMethod = "api_key";
      // Also set req.user-like fields for compatibility
      if (!req.user) {
        req.user = {
          sub: keyRecord.owner_id,
          role: "api_client",
          auth_method: "api_key",
          key_id: keyRecord.key_id,
        };
      }
    } else {
      // Invalid API key — reject immediately (fail closed)
      return res.status(401).json({
        error: "Invalid API key",
        hint: "Check your X-API-Key header value. Generate keys via POST /api/v1/keys.",
      });
    }
  } else if (req.user) {
    req.authMethod = "jwt";
  } else {
    req.authMethod = "none";
  }

  next();
}

/**
 * Middleware factory: require a specific scope on the API key.
 * JWT-authenticated users with "owner" role bypass scope checks.
 */
export function requireScope(scope) {
  return (req, res, next) => {
    // JWT owner bypasses scope checks
    if (req.authMethod === "jwt" && req.user?.role === "owner") {
      return next();
    }

    // API key must have the required scope
    if (req.authMethod === "api_key") {
      if (hasScope(req.apiKey, scope)) {
        return next();
      }
      return res.status(403).json({
        error: `Insufficient scope. Required: "${scope}".`,
        current_scopes: req.apiKey?.scopes || [],
        hint: "Request a key with the required scope from the key owner.",
      });
    }

    // No auth at all
    return res.status(401).json({
      error: "Authentication required.",
      hint: "Include X-API-Key header or Authorization: Bearer <jwt> header.",
    });
  };
}

/**
 * Middleware: require any form of authentication (API key or JWT).
 */
export function requireAnyAuth(req, res, next) {
  if (req.authMethod === "none") {
    return res.status(401).json({
      error: "Authentication required.",
      methods: {
        api_key: "Include X-API-Key header with a valid API key.",
        jwt: "Include Authorization: Bearer <token> header. Get a token from POST /login.",
      },
    });
  }
  next();
}
