/**
 * RIO Gateway — Google OAuth Integration
 *
 * Implements the full Google OAuth 2.0 Authorization Code flow
 * so that two (or more) humans can authenticate to the Gateway.
 *
 * Flow:
 *   1. User visits GET /auth/google
 *   2. Gateway redirects to Google consent screen
 *   3. User approves → Google redirects to GET /auth/google/callback
 *   4. Gateway exchanges authorization code for tokens
 *   5. Gateway fetches user profile (email, name)
 *   6. Gateway maps email → principal (via principals table)
 *   7. Gateway issues JWT session token
 *   8. Gateway redirects to ONE with token in query string
 *
 * Environment variables (placeholders — fill before deployment):
 *   GOOGLE_CLIENT_ID      — Google OAuth Client ID
 *   GOOGLE_CLIENT_SECRET   — Google OAuth Client Secret
 *   GOOGLE_REDIRECT_URI    — Callback URL (defaults to <gateway>/auth/google/callback)
 *   ONE_FRONTEND_URL       — ONE PWA URL for post-login redirect
 *
 * The passphrase-based POST /login is preserved as a fallback for testing.
 *
 * References:
 *   - directives/DIRECTIVE_FIRST_PLATFORM_SLICE.md (Priority 2)
 *   - docs/DECISIONS.md (Decision 1: Gateway is enforcement boundary)
 */
import { createHash, randomBytes } from "node:crypto";

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || "";
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET || "";
const GOOGLE_REDIRECT_URI = process.env.GOOGLE_REDIRECT_URI || "";
const ONE_FRONTEND_URL = process.env.ONE_FRONTEND_URL || "";

const GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GOOGLE_USERINFO_URL = "https://www.googleapis.com/oauth2/v2/userinfo";

// CSRF state tokens (in-memory, short-lived)
const pendingStates = new Map();
const STATE_TTL_MS = 10 * 60 * 1000; // 10 minutes

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Generate a cryptographically random state token for CSRF protection.
 */
function generateState(returnUrl) {
  const state = randomBytes(32).toString("hex");
  pendingStates.set(state, {
    created_at: Date.now(),
    return_url: returnUrl || "/",
  });

  // Clean up expired states
  for (const [key, val] of pendingStates.entries()) {
    if (Date.now() - val.created_at > STATE_TTL_MS) {
      pendingStates.delete(key);
    }
  }

  return state;
}

/**
 * Validate and consume a state token. Returns the stored data or null.
 */
function consumeState(state) {
  const data = pendingStates.get(state);
  if (!data) return null;

  pendingStates.delete(state);

  // Check TTL
  if (Date.now() - data.created_at > STATE_TTL_MS) {
    return null;
  }

  return data;
}

/**
 * Exchange authorization code for tokens via Google's token endpoint.
 */
async function exchangeCodeForTokens(code, redirectUri) {
  const response = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: GOOGLE_CLIENT_ID,
      client_secret: GOOGLE_CLIENT_SECRET,
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
    }),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Google token exchange failed: ${response.status} — ${errorBody}`);
  }

  return response.json();
}

/**
 * Fetch user profile from Google using an access token.
 */
async function fetchGoogleProfile(accessToken) {
  const response = await fetch(GOOGLE_USERINFO_URL, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!response.ok) {
    throw new Error(`Google userinfo failed: ${response.status}`);
  }

  return response.json();
}

// ---------------------------------------------------------------------------
// Route Handlers
// ---------------------------------------------------------------------------

/**
 * Check if Google OAuth is configured (both client ID and secret present).
 */
export function isGoogleOAuthConfigured() {
  return !!(GOOGLE_CLIENT_ID && GOOGLE_CLIENT_SECRET);
}

/**
 * GET /auth/google — Redirect to Google consent screen.
 *
 * Query params:
 *   return_url — Where to redirect after login (default: "/")
 *   redirect_uri — Override the callback URL (for dynamic environments)
 */
export function handleGoogleAuthRedirect(req, res) {
  if (!isGoogleOAuthConfigured()) {
    return res.status(503).json({
      error: "Google OAuth not configured.",
      hint: "Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET environment variables.",
    });
  }

  const returnUrl = req.query.return_url || "/";
  const state = generateState(returnUrl);

  // Allow the frontend to pass its own origin for the redirect URI
  const callbackUri =
    req.query.redirect_uri ||
    GOOGLE_REDIRECT_URI ||
    `${req.protocol}://${req.get("host")}/auth/google/callback`;

  const params = new URLSearchParams({
    client_id: GOOGLE_CLIENT_ID,
    redirect_uri: callbackUri,
    response_type: "code",
    scope: "openid email profile",
    state,
    access_type: "offline",
    prompt: "select_account",
  });

  const authUrl = `${GOOGLE_AUTH_URL}?${params.toString()}`;
  console.log(`[RIO OAuth] Redirecting to Google consent screen (state: ${state.substring(0, 8)}...)`);

  res.redirect(authUrl);
}

/**
 * GET /auth/google/callback — Handle Google's redirect with authorization code.
 *
 * This is the critical path:
 *   1. Validate state (CSRF)
 *   2. Exchange code for tokens
 *   3. Fetch user profile
 *   4. Resolve email → principal
 *   5. Issue JWT
 *   6. Redirect to ONE with token
 */
export async function handleGoogleCallback(req, res, { createToken, resolvePrincipalByEmail }) {
  try {
    const { code, state, error } = req.query;

    // Google may return an error (user denied consent, etc.)
    if (error) {
      console.log(`[RIO OAuth] Google returned error: ${error}`);
      return redirectWithError(res, `Google login failed: ${error}`);
    }

    if (!code || !state) {
      return redirectWithError(res, "Missing authorization code or state.");
    }

    // Validate CSRF state
    const stateData = consumeState(state);
    if (!stateData) {
      console.log(`[RIO OAuth] Invalid or expired state token: ${state.substring(0, 8)}...`);
      return redirectWithError(res, "Invalid or expired login session. Please try again.");
    }

    // Determine the callback URI (must match what was sent to Google)
    const callbackUri =
      GOOGLE_REDIRECT_URI ||
      `${req.protocol}://${req.get("host")}/auth/google/callback`;

    // Exchange code for tokens
    const tokens = await exchangeCodeForTokens(code, callbackUri);
    console.log(`[RIO OAuth] Token exchange successful.`);

    // Fetch user profile
    const profile = await fetchGoogleProfile(tokens.access_token);
    console.log(`[RIO OAuth] Google profile: ${profile.email} (${profile.name})`);

    // Resolve email → principal
    const principal = await resolvePrincipalByEmail(profile.email);
    if (!principal) {
      console.log(`[RIO OAuth] DENIED: No principal found for email ${profile.email}`);
      return redirectWithError(
        res,
        `No RIO principal registered for ${profile.email}. Contact the system administrator.`
      );
    }

    if (principal.status !== "active") {
      console.log(`[RIO OAuth] DENIED: Principal ${principal.principal_id} is ${principal.status}`);
      return redirectWithError(
        res,
        `Principal ${principal.principal_id} is ${principal.status}. Access denied.`
      );
    }

    // Issue JWT token for this principal
    const token = createToken(principal.principal_id, {
      email: profile.email,
      name: profile.name,
      picture: profile.picture,
      google_id: profile.id,
      principal_id: principal.principal_id,
      role: principal.primary_role,
    });

    console.log(`[RIO OAuth] LOGIN: ${profile.email} → principal ${principal.principal_id} (${principal.primary_role})`);

    // Redirect to ONE with token
    const frontendUrl = ONE_FRONTEND_URL || stateData.return_url || "/";
    const separator = frontendUrl.includes("?") ? "&" : "?";
    const redirectUrl = `${frontendUrl}${separator}token=${encodeURIComponent(token)}&principal=${encodeURIComponent(principal.principal_id)}`;

    res.redirect(redirectUrl);
  } catch (err) {
    console.error(`[RIO OAuth] Callback error: ${err.message}`);
    redirectWithError(res, "Authentication failed. Please try again.");
  }
}

/**
 * Redirect to the frontend with an error message.
 */
function redirectWithError(res, message) {
  const frontendUrl = ONE_FRONTEND_URL || "/";
  const separator = frontendUrl.includes("?") ? "&" : "?";
  res.redirect(`${frontendUrl}${separator}auth_error=${encodeURIComponent(message)}`);
}

/**
 * GET /auth/status — Check OAuth configuration status.
 */
export function handleAuthStatus(req, res) {
  res.json({
    google_oauth: {
      configured: isGoogleOAuthConfigured(),
      client_id_set: !!GOOGLE_CLIENT_ID,
      client_secret_set: !!GOOGLE_CLIENT_SECRET,
      redirect_uri: GOOGLE_REDIRECT_URI || "(auto-detect from request)",
      frontend_url: ONE_FRONTEND_URL || "(not set)",
    },
    passphrase_login: {
      enabled: true,
      hint: "POST /login with user_id and passphrase (testing fallback)",
    },
  });
}
