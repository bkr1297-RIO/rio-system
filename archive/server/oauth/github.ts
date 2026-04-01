/**
 * GitHub OAuth 2.0 Flow for RIO User Connections
 *
 * Handles the complete OAuth lifecycle:
 *   1. /api/oauth/github/start    — Redirect to GitHub authorization screen
 *   2. /api/oauth/github/callback — Exchange code for token, store in DB
 *   3. Disconnect (revoke + delete from DB)
 *
 * Scopes requested:
 *   - repo: Full repository access (issues, PRs, commits)
 *   - read:user: Read user profile
 *   - user:email: Read user email
 */

import type { Express, Request, Response } from "express";
import { ENV } from "../_core/env";
import { getDb } from "../db";
import { userConnections } from "../../drizzle/schema";
import { eq, and } from "drizzle-orm";
import { sdk } from "../_core/sdk";

// ── Constants ──────────────────────────────────────────────────────────────

const GITHUB_AUTH_URL = "https://github.com/login/oauth/authorize";
const GITHUB_TOKEN_URL = "https://github.com/login/oauth/access_token";
const GITHUB_USER_URL = "https://api.github.com/user";
const GITHUB_REVOKE_URL = "https://api.github.com/applications";

// Scopes for repo access, user profile, and email
const GITHUB_SCOPES = "repo read:user user:email";

const GITHUB_PROVIDER = "github" as const;

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
 * Build the GitHub OAuth callback URL from the request.
 * Prefers the explicit `origin` query parameter passed by the frontend.
 */
function getCallbackUrl(req: Request): string {
  const originParam = typeof req.query.origin === "string" ? req.query.origin : null;
  if (originParam) {
    try {
      const url = new URL(originParam);
      return `${url.origin}/api/oauth/github/callback`;
    } catch {
      // fall through
    }
  }
  const protocol = req.headers["x-forwarded-proto"] || req.protocol || "https";
  const host = req.headers["x-forwarded-host"] || req.headers.host || "localhost:3000";
  return `${protocol}://${host}/api/oauth/github/callback`;
}

// ── Token Exchange ─────────────────────────────────────────────────────────

interface GitHubTokenResponse {
  access_token: string;
  token_type: string;
  scope: string;
}

async function exchangeCodeForToken(code: string, redirectUri: string): Promise<GitHubTokenResponse> {
  const response = await fetch(GITHUB_TOKEN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({
      client_id: ENV.githubOAuthClientId,
      client_secret: ENV.githubOAuthClientSecret,
      code,
      redirect_uri: redirectUri,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`GitHub token exchange failed: ${response.status} ${error}`);
  }

  const data = await response.json();

  if (data.error) {
    throw new Error(`GitHub token exchange error: ${data.error_description || data.error}`);
  }

  return data;
}

interface GitHubUser {
  id: number;
  login: string;
  name: string | null;
  email: string | null;
  avatar_url: string;
}

async function getGitHubUser(accessToken: string): Promise<GitHubUser> {
  const response = await fetch(GITHUB_USER_URL, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/json",
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to get GitHub user info: ${response.status}`);
  }

  return response.json();
}

/**
 * Get the user's primary email from GitHub (may not be in profile).
 */
async function getGitHubEmail(accessToken: string): Promise<string | null> {
  try {
    const response = await fetch("https://api.github.com/user/emails", {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: "application/json",
      },
    });

    if (!response.ok) return null;

    const emails = await response.json();
    const primary = emails.find((e: any) => e.primary && e.verified);
    return primary?.email || emails[0]?.email || null;
  } catch {
    return null;
  }
}

// ── Token Validation ──────────────────────────────────────────────────────

/**
 * Get a valid access token for a user's GitHub connection.
 * GitHub OAuth tokens don't expire (unless revoked), so no refresh needed.
 */
export async function getValidGitHubToken(userId: number): Promise<string | null> {
  const db = await getDb();
  if (!db) return null;

  const connections = await db.select()
    .from(userConnections)
    .where(and(
      eq(userConnections.userId, userId),
      eq(userConnections.provider, GITHUB_PROVIDER),
      eq(userConnections.status, "connected"),
    ))
    .limit(1);

  if (connections.length === 0) return null;

  return connections[0].accessToken;
}

// ── Route Registration ─────────────────────────────────────────────────────

export function registerGitHubOAuthRoutes(app: Express) {
  /**
   * GET /api/oauth/github/start
   *
   * Redirects the authenticated user to GitHub's authorization screen.
   */
  app.get("/api/oauth/github/start", async (req: Request, res: Response) => {
    const user = await getAuthenticatedUser(req);
    if (!user) {
      res.status(401).json({ error: "You must be logged in to connect GitHub." });
      return;
    }

    const callbackUrl = getCallbackUrl(req);

    // Encode user info AND the callback URL in state for the callback.
    // This ensures the redirect_uri matches during token exchange even
    // when deployed behind proxies that change the host header.
    const state = Buffer.from(JSON.stringify({
      userId: user.id,
      openId: user.openId,
      ts: Date.now(),
      callbackUrl,
    })).toString("base64url");

    const params = new URLSearchParams({
      client_id: ENV.githubOAuthClientId,
      redirect_uri: callbackUrl,
      scope: GITHUB_SCOPES,
      state,
    });

    const authUrl = `${GITHUB_AUTH_URL}?${params.toString()}`;
    console.log(`[OAuth GitHub] Redirecting user ${user.id} to GitHub authorization screen`);
    res.redirect(302, authUrl);
  });

  /**
   * GET /api/oauth/github/callback
   *
   * GitHub redirects here after the user grants (or denies) authorization.
   * Exchanges the code for a token and stores it in user_connections.
   */
  app.get("/api/oauth/github/callback", async (req: Request, res: Response) => {
    const code = req.query.code as string | undefined;
    const state = req.query.state as string | undefined;
    const error = req.query.error as string | undefined;

    // User denied authorization
    if (error) {
      console.log(`[OAuth GitHub] User denied authorization: ${error}`);
      res.redirect(302, "/connect?error=github_denied");
      return;
    }

    if (!code || !state) {
      res.redirect(302, "/connect?error=github_missing_params");
      return;
    }

    // Decode state
    let stateData: { userId: number; openId: string; ts: number; callbackUrl?: string };
    try {
      stateData = JSON.parse(Buffer.from(state, "base64url").toString());
    } catch {
      res.redirect(302, "/connect?error=github_invalid_state");
      return;
    }

    // Verify state is recent (within 10 minutes)
    if (Date.now() - stateData.ts > 10 * 60 * 1000) {
      res.redirect(302, "/connect?error=github_expired_state");
      return;
    }

    try {
      // Use the callback URL from state (stored during /start) to ensure
      // the redirect_uri matches exactly what was sent to GitHub originally.
      const callbackUrl = stateData.callbackUrl || getCallbackUrl(req);
      console.log(`[OAuth GitHub] Token exchange using callback URL: ${callbackUrl}`);
      const tokens = await exchangeCodeForToken(code, callbackUrl);
      const githubUser = await getGitHubUser(tokens.access_token);

      // Get email (may not be in profile)
      const email = githubUser.email || await getGitHubEmail(tokens.access_token);

      const db = await getDb();
      if (!db) {
        res.redirect(302, "/connect?error=db_unavailable");
        return;
      }

      const grantedScopes = tokens.scope || GITHUB_SCOPES;
      const displayName = githubUser.name || githubUser.login;
      const accountId = email || githubUser.login;

      console.log(`[OAuth GitHub] User ${stateData.userId} connected as ${githubUser.login} (${email})`);
      console.log(`[OAuth GitHub] Granted scopes: ${grantedScopes}`);

      // Check if connection already exists
      const existing = await db.select()
        .from(userConnections)
        .where(and(
          eq(userConnections.userId, stateData.userId),
          eq(userConnections.provider, GITHUB_PROVIDER),
        ))
        .limit(1);

      if (existing.length > 0) {
        // Update existing connection
        await db.update(userConnections)
          .set({
            accessToken: tokens.access_token,
            scopes: grantedScopes,
            providerAccountId: accountId,
            providerAccountName: displayName,
            status: "connected",
          })
          .where(eq(userConnections.id, existing[0].id));
      } else {
        // Insert new connection
        await db.insert(userConnections).values({
          userId: stateData.userId,
          provider: GITHUB_PROVIDER,
          providerAccountId: accountId,
          providerAccountName: displayName,
          accessToken: tokens.access_token,
          refreshToken: null, // GitHub tokens don't use refresh tokens
          tokenExpiresAt: null, // GitHub tokens don't expire
          scopes: grantedScopes,
          status: "connected",
        });
      }

      console.log(`[OAuth GitHub] GitHub connected for user ${stateData.userId}`);
      const redirectOrigin = stateData.callbackUrl ? new URL(stateData.callbackUrl).origin : "";
      res.redirect(302, `${redirectOrigin}/connect?success=github`);
    } catch (err) {
      console.error("[OAuth GitHub] Callback failed:", err);
      const errorRedirectOrigin = stateData.callbackUrl ? new URL(stateData.callbackUrl).origin : "";
      res.redirect(302, `${errorRedirectOrigin}/connect?error=github_callback_failed`);
    }
  });

  /**
   * POST /api/oauth/github/disconnect
   *
   * Revokes the GitHub token and removes the connection for the user.
   */
  app.post("/api/oauth/github/disconnect", async (req: Request, res: Response) => {
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
      // Get the connection to find the token to revoke
      const connections = await db.select()
        .from(userConnections)
        .where(and(
          eq(userConnections.userId, user.id),
          eq(userConnections.provider, GITHUB_PROVIDER),
        ))
        .limit(1);

      // Revoke the token at GitHub (best effort)
      if (connections.length > 0 && connections[0].accessToken) {
        try {
          // GitHub token revocation requires Basic auth with client_id:client_secret
          const basicAuth = Buffer.from(
            `${ENV.githubOAuthClientId}:${ENV.githubOAuthClientSecret}`
          ).toString("base64");

          await fetch(
            `${GITHUB_REVOKE_URL}/${ENV.githubOAuthClientId}/token`,
            {
              method: "DELETE",
              headers: {
                Authorization: `Basic ${basicAuth}`,
                "Content-Type": "application/json",
                Accept: "application/json",
              },
              body: JSON.stringify({ access_token: connections[0].accessToken }),
            }
          );
          console.log(`[OAuth GitHub] Token revoked for user ${user.id}`);
        } catch (revokeErr) {
          console.warn(`[OAuth GitHub] Token revocation failed (non-critical):`, revokeErr);
        }
      }

      // Delete the GitHub connection
      await db.delete(userConnections)
        .where(and(
          eq(userConnections.userId, user.id),
          eq(userConnections.provider, GITHUB_PROVIDER),
        ));

      console.log(`[OAuth GitHub] GitHub connection removed for user ${user.id}`);
      res.json({ success: true, message: "GitHub disconnected" });
    } catch (err) {
      console.error("[OAuth GitHub] Disconnect failed:", err);
      res.status(500).json({ error: "Disconnect failed" });
    }
  });

  /**
   * GET /api/oauth/github/status
   *
   * Returns the current GitHub connection status for the authenticated user.
   */
  app.get("/api/oauth/github/status", async (req: Request, res: Response) => {
    const user = await getAuthenticatedUser(req);
    if (!user) {
      res.json({ connected: false });
      return;
    }

    const db = await getDb();
    if (!db) {
      res.json({ connected: false });
      return;
    }

    try {
      const connections = await db.select({
        status: userConnections.status,
        providerAccountId: userConnections.providerAccountId,
        providerAccountName: userConnections.providerAccountName,
        connectedAt: userConnections.connectedAt,
      })
        .from(userConnections)
        .where(and(
          eq(userConnections.userId, user.id),
          eq(userConnections.provider, GITHUB_PROVIDER),
        ))
        .limit(1);

      if (connections.length === 0) {
        res.json({ connected: false });
        return;
      }

      const conn = connections[0];
      res.json({
        connected: conn.status === "connected",
        username: conn.providerAccountName,
        email: conn.providerAccountId,
        status: conn.status,
        connectedAt: conn.connectedAt,
      });
    } catch (err) {
      console.error("[OAuth GitHub] Status check failed:", err);
      res.json({ connected: false });
    }
  });
}
