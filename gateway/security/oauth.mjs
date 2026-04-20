/**
 * RIO Security — OAuth / Session Authentication
 *
 * This module provides JWT-based session management for the gateway.
 * In production, this would integrate with Google OAuth or Microsoft OAuth.
 * For the MVP, it provides:
 *   1. A /login endpoint that issues a JWT token
 *   2. Middleware that validates the token on protected routes
 *   3. A /whoami endpoint that returns the current user
 *
 * The JWT secret is loaded from environment variables.
 * If no secret is set, the system generates one at startup (dev mode).
 *
 * OAuth flow (production):
 *   1. User clicks "Login with Google"
 *   2. Redirect to Google OAuth consent screen
 *   3. Google redirects back with auth code
 *   4. Gateway exchanges code for user info (email, name)
 *   5. Gateway issues JWT session token
 *   6. All subsequent requests include the JWT
 *
 * For the MVP, we skip steps 1-4 and issue tokens directly
 * to registered users (Brian) via a simple /login endpoint.
 */
import { createHash, randomBytes } from "node:crypto";

// Simple JWT implementation (no external dependency)
// Format: base64url(header).base64url(payload).base64url(signature)

const JWT_SECRET = process.env.JWT_SECRET || randomBytes(32).toString("hex");
const TOKEN_EXPIRY_HOURS = parseInt(process.env.TOKEN_EXPIRY_HOURS || "24");

// Registered users (MVP — in production this comes from OAuth provider)
// Keyed by email (canonical identity). Legacy alias "brian.k.rasmussen" is
// mapped below so existing clients that still send the old username continue
// to work until they migrate to email-based login.
const REGISTERED_USERS = {
  "bkr1297@gmail.com": {
    email: "bkr1297@gmail.com",
    display_name: "Brian K. Rasmussen",
    role: "owner",
    principal_id: "I-1",
    emails: ["bkr1297@gmail.com", "riomethod5@gmail.com", "RasmussenBR@hotmail.com"],
  },
};

// Legacy alias — allows passphrase login with the old username
const LEGACY_ALIASES = {
  "brian.k.rasmussen": "bkr1297@gmail.com",
};

function base64url(str) {
  return Buffer.from(str)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function base64urlDecode(str) {
  str = str.replace(/-/g, "+").replace(/_/g, "/");
  while (str.length % 4) str += "=";
  return Buffer.from(str, "base64").toString("utf-8");
}

function hmacSign(data) {
  return createHash("sha256")
    .update(data + "." + JWT_SECRET)
    .digest("hex");
}

/**
 * Create a JWT token for a user.
 *
 * Supports two modes:
 *   1. Registered-user: createToken("bkr1297@gmail.com") or legacy alias — looks up REGISTERED_USERS
 *   2. Principal: createToken("I-1", { email, name, role, ... }) — direct claims
 *
 * Mode 2 is used by Google OAuth where we already have the profile info.
 */
export function createToken(userId, claims) {
  let tokenPayload;

  if (claims) {
    // Mode 2: Direct claims from Google OAuth / principal resolution
    tokenPayload = {
      sub: userId,
      email: claims.email,
      name: claims.name,
      role: claims.role,
      principal_id: claims.principal_id || userId,
      picture: claims.picture || null,
      auth_method: claims.auth_method || "google_oauth",
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + TOKEN_EXPIRY_HOURS * 3600,
    };
  } else {
    // Mode 1: Registered-user lookup (keyed by email; legacy aliases resolved)
    const canonicalId = LEGACY_ALIASES[userId] || userId;
    const user = REGISTERED_USERS[canonicalId];
    if (!user) return null;

    tokenPayload = {
      sub: user.email,
      email: user.email,
      name: user.display_name,
      role: user.role,
      principal_id: user.principal_id || null,
      auth_method: "passphrase",
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + TOKEN_EXPIRY_HOURS * 3600,
    };
  }

  const header = base64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const payload = base64url(JSON.stringify(tokenPayload));
  const signature = hmacSign(`${header}.${payload}`);

  return `${header}.${payload}.${signature}`;
}

/**
 * Verify and decode a JWT token.
 * Returns the payload if valid, null if invalid or expired.
 */
export function verifyToken(token) {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null;

    const [header, payload, signature] = parts;
    const expectedSig = hmacSign(`${header}.${payload}`);

    if (signature !== expectedSig) return null;

    const decoded = JSON.parse(base64urlDecode(payload));

    // Check expiry
    if (decoded.exp && decoded.exp < Math.floor(Date.now() / 1000)) {
      return null;
    }

    return decoded;
  } catch {
    return null;
  }
}

/**
 * Express middleware: require authentication.
 * Checks for Bearer token in Authorization header.
 * Sets req.user if valid.
 */
export function requireAuth(req, res, next) {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({
      error: "Authentication required.",
      hint: "Include 'Authorization: Bearer <token>' header. Get a token from POST /login.",
    });
  }

  const token = authHeader.substring(7);
  const user = verifyToken(token);

  if (!user) {
    return res.status(401).json({
      error: "Invalid or expired token.",
      hint: "Re-authenticate via POST /login.",
    });
  }

  req.user = user;
  next();
}

/**
 * Express middleware: optional authentication.
 * Sets req.user if token is present and valid, but doesn't block.
 */
export function optionalAuth(req, res, next) {
  const authHeader = req.headers.authorization;

  if (authHeader && authHeader.startsWith("Bearer ")) {
    const token = authHeader.substring(7);
    const user = verifyToken(token);
    if (user) req.user = user;
  }

  next();
}

/**
 * Get registered user info.
 */
export function getRegisteredUser(userId) {
  const canonicalId = LEGACY_ALIASES[userId] || userId;
  return REGISTERED_USERS[canonicalId] || null;
}

/**
 * Check if a user ID is registered.
 */
export function isRegistered(userId) {
  const canonicalId = LEGACY_ALIASES[userId] || userId;
  return canonicalId in REGISTERED_USERS;
}
