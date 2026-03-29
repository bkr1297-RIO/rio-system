/**
 * Microsoft OAuth Provider
 *
 * Handles OAuth 2.0 flow for Microsoft 365 / Azure AD.
 * Connects Outlook Mail, Outlook Calendar, and OneDrive.
 *
 * Flow:
 *   1. GET /api/oauth/microsoft/start   → Redirect to Microsoft login
 *   2. GET /api/oauth/microsoft/callback → Exchange code for tokens, store connections
 *   3. POST /api/oauth/microsoft/disconnect → Revoke token, remove connections
 *   4. GET /api/oauth/microsoft/status   → Check connection status
 *
 * Same architecture as google.ts — one consent screen, multiple provider entries
 * in user_connections (outlook_mail, outlook_calendar, onedrive).
 */

import type { Request, Response, Express } from "express";
import { ENV } from "../_core/env";
import { getDb } from "../db";
import { sdk } from "../_core/sdk";
import { userConnections } from "../../drizzle/schema";
import { eq, and } from "drizzle-orm";

// ── Constants ───────────────────────────────────────────────────────────────

const TENANT_ID = ENV.microsoftOAuthTenantId || "common";

const MICROSOFT_AUTH_URL = `https://login.microsoftonline.com/${TENANT_ID}/oauth2/v2.0/authorize`;
const MICROSOFT_TOKEN_URL = `https://login.microsoftonline.com/${TENANT_ID}/oauth2/v2.0/token`;
const MICROSOFT_GRAPH_URL = "https://graph.microsoft.com/v1.0";
const MICROSOFT_REVOKE_URL = `https://login.microsoftonline.com/${TENANT_ID}/oauth2/v2.0/logout`;

// Scopes for Mail, Calendar, Files, and basic profile
const MICROSOFT_SCOPES = [
  "openid",
  "profile",
  "email",
  "offline_access",        // Required for refresh tokens
  "Mail.ReadWrite",
  "Mail.Send",
  "Calendars.ReadWrite",
  "Files.ReadWrite",
  "User.Read",
].join(" ");

// Provider entries stored in user_connections (one per service)
const MICROSOFT_PROVIDERS = ["outlook_mail", "outlook_calendar", "onedrive"] as const;

// ── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Get the authenticated user from the request context.
 * Reuses the same cookie/JWT mechanism as Google OAuth.
 */
async function getAuthenticatedUser(req: Request): Promise<{ id: number; openId: string } | null> {
  try {
    const user = await sdk.authenticateRequest(req);
    if (!user?.openId) return null;

    const db = await getDb();
    if (!db) return null;

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
 * Build the callback URL from the request origin.
 */
function getCallbackUrl(req: Request): string {
  const origin = req.query.origin as string;
  if (origin) {
    return `${origin}/api/oauth/microsoft/callback`;
  }
  const protocol = req.headers["x-forwarded-proto"] || req.protocol;
  const host = req.headers["x-forwarded-host"] || req.headers.host;
  return `${protocol}://${host}/api/oauth/microsoft/callback`;
}

/**
 * Exchange authorization code for tokens.
 */
async function exchangeCodeForTokens(
  code: string,
  redirectUri: string
): Promise<{
  access_token: string;
  refresh_token: string;
  expires_in: number;
  scope: string;
  token_type: string;
}> {
  const body = new URLSearchParams({
    client_id: ENV.microsoftOAuthClientId,
    client_secret: ENV.microsoftOAuthClientSecret,
    code,
    redirect_uri: redirectUri,
    grant_type: "authorization_code",
  });

  const response = await fetch(MICROSOFT_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Microsoft token exchange failed: ${response.status} ${error}`);
  }

  return response.json();
}

/**
 * Refresh an expired access token using the refresh token.
 */
async function refreshAccessToken(refreshToken: string): Promise<{
  access_token: string;
  refresh_token: string;
  expires_in: number;
  scope: string;
}> {
  const body = new URLSearchParams({
    client_id: ENV.microsoftOAuthClientId,
    client_secret: ENV.microsoftOAuthClientSecret,
    refresh_token: refreshToken,
    grant_type: "refresh_token",
    scope: MICROSOFT_SCOPES,
  });

  const response = await fetch(MICROSOFT_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Microsoft token refresh failed: ${response.status} ${error}`);
  }

  return response.json();
}

/**
 * Get the Microsoft user's profile info from Graph API.
 */
async function getMicrosoftUserInfo(accessToken: string): Promise<{
  id: string;
  displayName: string;
  mail: string;
  userPrincipalName: string;
}> {
  const response = await fetch(`${MICROSOFT_GRAPH_URL}/me`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Microsoft Graph /me failed: ${response.status} ${error}`);
  }

  return response.json();
}

/**
 * Get a valid Microsoft access token for a user.
 * Refreshes the token if expired.
 * Returns null if no connection exists or refresh fails.
 */
export async function getValidMicrosoftToken(
  userId: number,
  provider: string = "outlook_mail"
): Promise<string | null> {
  const db = await getDb();
  if (!db) return null;

  const connections = await db
    .select()
    .from(userConnections)
    .where(
      and(
        eq(userConnections.userId, userId),
        eq(userConnections.provider, provider),
        eq(userConnections.status, "connected")
      )
    )
    .limit(1);

  if (connections.length === 0) return null;

  const conn = connections[0];

  // Check if token is still valid (with 5-minute buffer)
  if (conn.tokenExpiresAt && conn.tokenExpiresAt > new Date(Date.now() + 5 * 60 * 1000)) {
    return conn.accessToken;
  }

  // Token expired — try to refresh
  if (!conn.refreshToken) {
    console.warn(`[OAuth Microsoft] No refresh token for user ${userId}, provider ${provider}`);
    return null;
  }

  try {
    console.log(`[OAuth Microsoft] Refreshing token for user ${userId}, provider ${provider}`);
    const tokens = await refreshAccessToken(conn.refreshToken);
    const newExpiresAt = new Date(Date.now() + tokens.expires_in * 1000);

    // Update all Microsoft provider connections with the new token
    for (const p of MICROSOFT_PROVIDERS) {
      await db
        .update(userConnections)
        .set({
          accessToken: tokens.access_token,
          refreshToken: tokens.refresh_token || conn.refreshToken,
          tokenExpiresAt: newExpiresAt,
        })
        .where(
          and(
            eq(userConnections.userId, userId),
            eq(userConnections.provider, p)
          )
        );
    }

    console.log(`[OAuth Microsoft] Token refreshed for user ${userId}`);
    return tokens.access_token;
  } catch (err) {
    console.error(`[OAuth Microsoft] Token refresh failed for user ${userId}:`, err);
    return null;
  }
}

// ── Route Registration ──────────────────────────────────────────────────────

export function registerMicrosoftOAuthRoutes(app: Express) {
  /**
   * GET /api/oauth/microsoft/start
   *
   * Initiates the Microsoft OAuth flow.
   * Requires the user to be authenticated (Manus login).
   */
  app.get("/api/oauth/microsoft/start", async (req: Request, res: Response) => {
    const user = await getAuthenticatedUser(req);
    if (!user) {
      res.redirect(302, "/connect?error=not_authenticated");
      return;
    }

    const callbackUrl = getCallbackUrl(req);
    console.log(`[OAuth Microsoft] Starting OAuth for user ${user.id}, callback: ${callbackUrl}`);

    // Encode state with user info and callback URL
    const state = Buffer.from(
      JSON.stringify({
        userId: user.id,
        openId: user.openId,
        ts: Date.now(),
        callbackUrl,
      })
    ).toString("base64url");

    const authUrl = new URL(MICROSOFT_AUTH_URL);
    authUrl.searchParams.set("client_id", ENV.microsoftOAuthClientId);
    authUrl.searchParams.set("response_type", "code");
    authUrl.searchParams.set("redirect_uri", callbackUrl);
    authUrl.searchParams.set("scope", MICROSOFT_SCOPES);
    authUrl.searchParams.set("state", state);
    authUrl.searchParams.set("response_mode", "query");
    authUrl.searchParams.set("prompt", "consent"); // Always show consent to get refresh token

    res.redirect(302, authUrl.toString());
  });

  /**
   * GET /api/oauth/microsoft/callback
   *
   * Handles the OAuth callback from Microsoft.
   * Exchanges the code for tokens and stores connections.
   */
  app.get("/api/oauth/microsoft/callback", async (req: Request, res: Response) => {
    const { code, state, error: oauthError } = req.query;

    if (oauthError) {
      console.error(`[OAuth Microsoft] Error from Microsoft: ${oauthError}`);
      res.redirect(302, `/connect?error=microsoft_${oauthError}`);
      return;
    }

    if (!code || !state) {
      res.redirect(302, "/connect?error=missing_params");
      return;
    }

    // Decode state
    let stateData: { userId: number; openId: string; ts: number; callbackUrl?: string };
    try {
      stateData = JSON.parse(Buffer.from(state as string, "base64url").toString());
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
      const callbackUrl = stateData.callbackUrl || getCallbackUrl(req);
      console.log(`[OAuth Microsoft] Token exchange using callback URL: ${callbackUrl}`);
      const tokens = await exchangeCodeForTokens(code as string, callbackUrl);
      const msUser = await getMicrosoftUserInfo(tokens.access_token);

      const db = await getDb();
      if (!db) {
        res.redirect(302, "/connect?error=db_unavailable");
        return;
      }

      const expiresAt = new Date(Date.now() + tokens.expires_in * 1000);
      const grantedScopes = tokens.scope || MICROSOFT_SCOPES;
      const email = msUser.mail || msUser.userPrincipalName;

      console.log(`[OAuth Microsoft] User ${stateData.userId} connected as ${email}`);
      console.log(`[OAuth Microsoft] Granted scopes: ${grantedScopes}`);

      // Store a connection for each Microsoft provider
      for (const provider of MICROSOFT_PROVIDERS) {
        const existing = await db
          .select()
          .from(userConnections)
          .where(
            and(
              eq(userConnections.userId, stateData.userId),
              eq(userConnections.provider, provider)
            )
          )
          .limit(1);

        if (existing.length > 0) {
          await db
            .update(userConnections)
            .set({
              accessToken: tokens.access_token,
              refreshToken: tokens.refresh_token || existing[0].refreshToken,
              tokenExpiresAt: expiresAt,
              scopes: grantedScopes,
              providerAccountId: email,
              providerAccountName: msUser.displayName,
              status: "connected",
            })
            .where(eq(userConnections.id, existing[0].id));
        } else {
          await db.insert(userConnections).values({
            userId: stateData.userId,
            provider,
            providerAccountId: email,
            providerAccountName: msUser.displayName,
            accessToken: tokens.access_token,
            refreshToken: tokens.refresh_token || null,
            tokenExpiresAt: expiresAt,
            scopes: grantedScopes,
            status: "connected",
          });
        }
      }

      console.log(`[OAuth Microsoft] All 3 Microsoft providers connected for user ${stateData.userId}`);
      const redirectOrigin = stateData.callbackUrl ? new URL(stateData.callbackUrl).origin : "";
      res.redirect(302, `${redirectOrigin}/connect?success=microsoft`);
    } catch (err) {
      console.error("[OAuth Microsoft] Callback failed:", err);
      const errorRedirectOrigin = stateData.callbackUrl ? new URL(stateData.callbackUrl).origin : "";
      res.redirect(302, `${errorRedirectOrigin}/connect?error=callback_failed`);
    }
  });

  /**
   * POST /api/oauth/microsoft/disconnect
   *
   * Removes all Microsoft connections for the user.
   */
  app.post("/api/oauth/microsoft/disconnect", async (req: Request, res: Response) => {
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
      // Delete all Microsoft connections for this user
      for (const provider of MICROSOFT_PROVIDERS) {
        await db
          .delete(userConnections)
          .where(
            and(
              eq(userConnections.userId, user.id),
              eq(userConnections.provider, provider)
            )
          );
      }

      console.log(`[OAuth Microsoft] All Microsoft connections removed for user ${user.id}`);
      res.json({ success: true, message: "Microsoft apps disconnected" });
    } catch (err) {
      console.error("[OAuth Microsoft] Disconnect failed:", err);
      res.status(500).json({ error: "Disconnect failed" });
    }
  });

  /**
   * GET /api/oauth/microsoft/status
   *
   * Returns the current Microsoft connection status for the authenticated user.
   */
  app.get("/api/oauth/microsoft/status", async (req: Request, res: Response) => {
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
      const connections = await db
        .select({
          provider: userConnections.provider,
          status: userConnections.status,
          providerAccountId: userConnections.providerAccountId,
          providerAccountName: userConnections.providerAccountName,
          connectedAt: userConnections.connectedAt,
        })
        .from(userConnections)
        .where(eq(userConnections.userId, user.id));

      const microsoftConnections = connections.filter((c: { provider: string; status: string; providerAccountId: string | null; providerAccountName: string | null; connectedAt: Date | null }) =>
        MICROSOFT_PROVIDERS.includes(c.provider as (typeof MICROSOFT_PROVIDERS)[number])
      );

      const anyConnected = microsoftConnections.some((c: { status: string }) => c.status === "connected");

      res.json({
        connected: anyConnected,
        email: microsoftConnections[0]?.providerAccountId || null,
        name: microsoftConnections[0]?.providerAccountName || null,
        providers: microsoftConnections.map((c: { provider: string; status: string; connectedAt: Date | null }) => ({
          provider: c.provider,
          status: c.status,
          connectedAt: c.connectedAt,
        })),
      });
    } catch (err) {
      console.error("[OAuth Microsoft] Status check failed:", err);
      res.json({ connected: false, providers: [] });
    }
  });
}
