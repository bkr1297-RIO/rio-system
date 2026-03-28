/**
 * Google OAuth 2.0 Flow for RIO User Connections
 *
 * Handles the complete OAuth lifecycle:
 *   1. /api/oauth/google/start   — Redirect to Google consent screen
 *   2. /api/oauth/google/callback — Exchange code for tokens, store in DB
 *   3. Token refresh when access_token expires
 *   4. Disconnect (revoke + delete from DB)
 *
 * Scopes requested:
 *   - Gmail: send, read, modify
 *   - Google Drive: file management
 *   - Google Calendar: event management
 *   - User profile: email, openid
 */

import type { Express, Request, Response } from "express";
import { ENV } from "../_core/env";
import { getDb } from "../db";
import { userConnections } from "../../drizzle/schema";
import { eq, and } from "drizzle-orm";
import { sdk } from "../_core/sdk";

// ── Constants ──────────────────────────────────────────────────────────────

const GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GOOGLE_USERINFO_URL = "https://www.googleapis.com/oauth2/v2/userinfo";
const GOOGLE_REVOKE_URL = "https://oauth2.googleapis.com/revoke";

// Scopes for Gmail, Drive, Calendar
const GOOGLE_SCOPES = [
  "openid",
  "email",
  "profile",
  "https://www.googleapis.com/auth/gmail.send",
  "https://www.googleapis.com/auth/gmail.readonly",
  "https://www.googleapis.com/auth/drive",
  "https://www.googleapis.com/auth/calendar",
  "https://www.googleapis.com/auth/calendar.events",
].join(" ");

// Provider IDs for the user_connections table
const GOOGLE_PROVIDERS = ["gmail", "google_drive", "google_calendar"] as const;

// ── Helpers ────────────────────────────────────────────────────────────────

/**
 * Get the authenticated Manus user from the request.
 * Returns null if not authenticated.
 */
async function getAuthenticatedUser(req: Request): Promise<{ openId: string; id: number } | null> {
  try {
    const user = await sdk.authenticateRequest(req);
    if (!user?.openId) return null;

    const db = await getDb();
    if (!db) return null;

    // Look up the user's numeric ID
    const { users } = await import("../../drizzle/schema");
    const result = await db.select({ id: users.id, openId: users.openId })
      .from(users)
      .where(eq(users.openId, user.openId))
      .limit(1);

    if (result.length === 0) return null;
    return { openId: user.openId, id: result[0].id };
  } catch {
    return null;
  }
}

/**
 * Build the Google OAuth callback URL from the request.
 * Prefers the explicit `origin` query parameter passed by the frontend,
 * which ensures the callback URL matches the domain the user sees.
 * Falls back to request headers for backwards compatibility.
 */
function getCallbackUrl(req: Request): string {
  // Prefer explicit origin from frontend (most reliable in deployed environments)
  const originParam = typeof req.query.origin === "string" ? req.query.origin : null;
  if (originParam) {
    try {
      const url = new URL(originParam);
      return `${url.origin}/api/oauth/google/callback`;
    } catch {
      // Invalid URL, fall through to header-based detection
    }
  }

  // Fallback: construct from request headers
  const protocol = req.headers["x-forwarded-proto"] || req.protocol || "https";
  const host = req.headers["x-forwarded-host"] || req.headers.host || "localhost:3000";
  return `${protocol}://${host}/api/oauth/google/callback`;
}

// ── Token Exchange ─────────────────────────────────────────────────────────

interface GoogleTokens {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  token_type: string;
  scope: string;
  id_token?: string;
}

async function exchangeCodeForTokens(code: string, redirectUri: string): Promise<GoogleTokens> {
  const response = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: ENV.googleOAuthClientId,
      client_secret: ENV.googleOAuthClientSecret,
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Google token exchange failed: ${response.status} ${error}`);
  }

  return response.json();
}

interface GoogleUserInfo {
  id: string;
  email: string;
  name: string;
  picture?: string;
}

async function getGoogleUserInfo(accessToken: string): Promise<GoogleUserInfo> {
  const response = await fetch(GOOGLE_USERINFO_URL, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!response.ok) {
    throw new Error(`Failed to get Google user info: ${response.status}`);
  }

  return response.json();
}

// ── Token Refresh ──────────────────────────────────────────────────────────

export async function refreshGoogleToken(refreshToken: string): Promise<{ access_token: string; expires_in: number }> {
  const response = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      refresh_token: refreshToken,
      client_id: ENV.googleOAuthClientId,
      client_secret: ENV.googleOAuthClientSecret,
      grant_type: "refresh_token",
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Google token refresh failed: ${response.status} ${error}`);
  }

  return response.json();
}

/**
 * Get a valid access token for a user's Google connection.
 * Automatically refreshes if expired.
 */
export async function getValidGoogleToken(userId: number, provider: string): Promise<string | null> {
  const db = await getDb();
  if (!db) return null;

  const connections = await db.select()
    .from(userConnections)
    .where(and(
      eq(userConnections.userId, userId),
      eq(userConnections.provider, provider),
      eq(userConnections.status, "connected"),
    ))
    .limit(1);

  if (connections.length === 0) return null;

  const conn = connections[0];

  // Check if token is expired (with 5-minute buffer)
  const now = new Date();
  const expiresAt = conn.tokenExpiresAt;
  const isExpired = expiresAt && expiresAt.getTime() < now.getTime() + 5 * 60 * 1000;

  if (!isExpired && conn.accessToken) {
    return conn.accessToken;
  }

  // Token expired — try to refresh
  if (!conn.refreshToken) {
    // No refresh token, mark as expired
    await db.update(userConnections)
      .set({ status: "expired" })
      .where(eq(userConnections.id, conn.id));
    return null;
  }

  try {
    const refreshed = await refreshGoogleToken(conn.refreshToken);

    const newExpiresAt = new Date(Date.now() + refreshed.expires_in * 1000);

    await db.update(userConnections)
      .set({
        accessToken: refreshed.access_token,
        tokenExpiresAt: newExpiresAt,
        status: "connected",
      })
      .where(eq(userConnections.id, conn.id));

    return refreshed.access_token;
  } catch (error) {
    console.error(`[OAuth Google] Token refresh failed for user ${userId}:`, error);
    await db.update(userConnections)
      .set({ status: "expired" })
      .where(eq(userConnections.id, conn.id));
    return null;
  }
}

// ── Route Registration ─────────────────────────────────────────────────────

export function registerGoogleOAuthRoutes(app: Express) {
  /**
   * GET /api/oauth/google/start
   *
   * Redirects the authenticated user to Google's consent screen.
   * The user must be logged in to Manus first.
   */
  app.get("/api/oauth/google/start", async (req: Request, res: Response) => {
    // Verify the user is authenticated with Manus
    const user = await getAuthenticatedUser(req);
    if (!user) {
      res.status(401).json({ error: "You must be logged in to connect Google apps." });
      return;
    }

    const callbackUrl = getCallbackUrl(req);

    // Encode user info in state for the callback
    const state = Buffer.from(JSON.stringify({
      userId: user.id,
      openId: user.openId,
      ts: Date.now(),
    })).toString("base64url");

    const params = new URLSearchParams({
      client_id: ENV.googleOAuthClientId,
      redirect_uri: callbackUrl,
      response_type: "code",
      scope: GOOGLE_SCOPES,
      access_type: "offline",       // Get refresh_token
      prompt: "consent",            // Always show consent to get refresh_token
      state,
    });

    const authUrl = `${GOOGLE_AUTH_URL}?${params.toString()}`;
    console.log(`[OAuth Google] Redirecting user ${user.id} to Google consent screen`);
    res.redirect(302, authUrl);
  });

  /**
   * GET /api/oauth/google/callback
   *
   * Google redirects here after the user grants (or denies) consent.
   * Exchanges the code for tokens and stores them in user_connections.
   */
  app.get("/api/oauth/google/callback", async (req: Request, res: Response) => {
    const code = req.query.code as string | undefined;
    const state = req.query.state as string | undefined;
    const error = req.query.error as string | undefined;

    // User denied consent
    if (error) {
      console.log(`[OAuth Google] User denied consent: ${error}`);
      res.redirect(302, "/connect?error=denied");
      return;
    }

    if (!code || !state) {
      res.redirect(302, "/connect?error=missing_params");
      return;
    }

    // Decode state
    let stateData: { userId: number; openId: string; ts: number };
    try {
      stateData = JSON.parse(Buffer.from(state, "base64url").toString());
    } catch {
      res.redirect(302, "/connect?error=invalid_state");
      return;
    }

    // Verify state is recent (within 10 minutes)
    if (Date.now() - stateData.ts > 10 * 60 * 1000) {
      res.redirect(302, "/connect?error=expired_state");
      return;
    }

    try {
      const callbackUrl = getCallbackUrl(req);
      const tokens = await exchangeCodeForTokens(code, callbackUrl);
      const googleUser = await getGoogleUserInfo(tokens.access_token);

      const db = await getDb();
      if (!db) {
        res.redirect(302, "/connect?error=db_unavailable");
        return;
      }

      const expiresAt = new Date(Date.now() + tokens.expires_in * 1000);
      const grantedScopes = tokens.scope || GOOGLE_SCOPES;

      console.log(`[OAuth Google] User ${stateData.userId} connected as ${googleUser.email}`);
      console.log(`[OAuth Google] Granted scopes: ${grantedScopes}`);

      // Store a connection for each Google provider (gmail, drive, calendar)
      // All share the same tokens since they come from one consent screen
      for (const provider of GOOGLE_PROVIDERS) {
        // Check if connection already exists
        const existing = await db.select()
          .from(userConnections)
          .where(and(
            eq(userConnections.userId, stateData.userId),
            eq(userConnections.provider, provider),
          ))
          .limit(1);

        if (existing.length > 0) {
          // Update existing connection
          await db.update(userConnections)
            .set({
              accessToken: tokens.access_token,
              refreshToken: tokens.refresh_token || existing[0].refreshToken,
              tokenExpiresAt: expiresAt,
              scopes: grantedScopes,
              providerAccountId: googleUser.email,
              providerAccountName: googleUser.name,
              status: "connected",
            })
            .where(eq(userConnections.id, existing[0].id));
        } else {
          // Insert new connection
          await db.insert(userConnections).values({
            userId: stateData.userId,
            provider,
            providerAccountId: googleUser.email,
            providerAccountName: googleUser.name,
            accessToken: tokens.access_token,
            refreshToken: tokens.refresh_token || null,
            tokenExpiresAt: expiresAt,
            scopes: grantedScopes,
            status: "connected",
          });
        }
      }

      console.log(`[OAuth Google] All 3 Google providers connected for user ${stateData.userId}`);
      res.redirect(302, "/connect?success=google");
    } catch (err) {
      console.error("[OAuth Google] Callback failed:", err);
      res.redirect(302, "/connect?error=callback_failed");
    }
  });

  /**
   * POST /api/oauth/google/disconnect
   *
   * Revokes the Google token and removes all Google connections for the user.
   */
  app.post("/api/oauth/google/disconnect", async (req: Request, res: Response) => {
    const user = await getAuthenticatedUser(req);
    if (!user) {
      res.status(401).json({ error: "Not authenticated" });
      return;
    }

    const db = await getDb();
    if (!db) {
      res.status(500).json({ error: "Database unavailable" });
      return;
    }

    try {
      // Get one of the connections to find the token to revoke
      const connections = await db.select()
        .from(userConnections)
        .where(and(
          eq(userConnections.userId, user.id),
          eq(userConnections.provider, "gmail"),
        ))
        .limit(1);

      // Revoke the token at Google (best effort)
      if (connections.length > 0 && connections[0].accessToken) {
        try {
          await fetch(`${GOOGLE_REVOKE_URL}?token=${connections[0].accessToken}`, {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
          });
          console.log(`[OAuth Google] Token revoked for user ${user.id}`);
        } catch (revokeErr) {
          console.warn(`[OAuth Google] Token revocation failed (non-critical):`, revokeErr);
        }
      }

      // Delete all Google connections for this user
      for (const provider of GOOGLE_PROVIDERS) {
        await db.delete(userConnections)
          .where(and(
            eq(userConnections.userId, user.id),
            eq(userConnections.provider, provider),
          ));
      }

      console.log(`[OAuth Google] All Google connections removed for user ${user.id}`);
      res.json({ success: true, message: "Google apps disconnected" });
    } catch (err) {
      console.error("[OAuth Google] Disconnect failed:", err);
      res.status(500).json({ error: "Disconnect failed" });
    }
  });

  /**
   * GET /api/oauth/google/status
   *
   * Returns the current Google connection status for the authenticated user.
   */
  app.get("/api/oauth/google/status", async (req: Request, res: Response) => {
    const user = await getAuthenticatedUser(req);
    if (!user) {
      res.json({ connected: false, providers: [] });
      return;
    }

    const db = await getDb();
    if (!db) {
      res.json({ connected: false, providers: [] });
      return;
    }

    try {
      const connections = await db.select({
        provider: userConnections.provider,
        status: userConnections.status,
        providerAccountId: userConnections.providerAccountId,
        providerAccountName: userConnections.providerAccountName,
        connectedAt: userConnections.connectedAt,
      })
        .from(userConnections)
        .where(eq(userConnections.userId, user.id));

      const googleConnections = connections.filter(c =>
        GOOGLE_PROVIDERS.includes(c.provider as typeof GOOGLE_PROVIDERS[number])
      );

      const anyConnected = googleConnections.some(c => c.status === "connected");

      res.json({
        connected: anyConnected,
        email: googleConnections[0]?.providerAccountId || null,
        name: googleConnections[0]?.providerAccountName || null,
        providers: googleConnections.map(c => ({
          provider: c.provider,
          status: c.status,
          connectedAt: c.connectedAt,
        })),
      });
    } catch (err) {
      console.error("[OAuth Google] Status check failed:", err);
      res.json({ connected: false, providers: [] });
    }
  });
}
