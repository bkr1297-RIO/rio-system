import { COOKIE_NAME, ONE_YEAR_MS } from "@shared/const";
import type { Express, Request, Response } from "express";
import * as db from "../db";
import { getSessionCookieOptions } from "./cookies";
import { sdk } from "./sdk";

function getQueryParam(req: Request, key: string): string | undefined {
  const value = req.query[key];
  return typeof value === "string" ? value : undefined;
}

/**
 * Parse the state parameter to extract the redirect URI and optional return path.
 * Supports two formats:
 *   1. JSON: { redirectUri, returnPath } (new format with return path)
 *   2. Plain base64-encoded redirect URI (legacy format)
 */
function parseState(state: string): { redirectUri: string; returnPath: string } {
  try {
    const decoded = atob(state);
    // Try JSON first
    const parsed = JSON.parse(decoded);
    if (parsed && typeof parsed.redirectUri === "string") {
      return {
        redirectUri: parsed.redirectUri,
        returnPath: typeof parsed.returnPath === "string" ? parsed.returnPath : "/",
      };
    }
  } catch {
    // Not JSON — treat as plain redirect URI (legacy)
  }

  try {
    return { redirectUri: atob(state), returnPath: "/" };
  } catch {
    return { redirectUri: "", returnPath: "/" };
  }
}

export function registerOAuthRoutes(app: Express) {
  app.get("/api/oauth/callback", async (req: Request, res: Response) => {
    const code = getQueryParam(req, "code");
    const state = getQueryParam(req, "state");

    if (!code || !state) {
      res.status(400).json({ error: "code and state are required" });
      return;
    }

    try {
      const tokenResponse = await sdk.exchangeCodeForToken(code, state);
      const userInfo = await sdk.getUserInfo(tokenResponse.accessToken);

      if (!userInfo.openId) {
        res.status(400).json({ error: "openId missing from user info" });
        return;
      }

      await db.upsertUser({
        openId: userInfo.openId,
        name: userInfo.name || null,
        email: userInfo.email ?? null,
        loginMethod: userInfo.loginMethod ?? userInfo.platform ?? null,
        lastSignedIn: new Date(),
      });

      const sessionToken = await sdk.createSessionToken(userInfo.openId, {
        name: userInfo.name || "",
        expiresInMs: ONE_YEAR_MS,
      });

      const cookieOptions = getSessionCookieOptions(req);
      res.cookie(COOKIE_NAME, sessionToken, { ...cookieOptions, maxAge: ONE_YEAR_MS });

      // Redirect using the full origin from state to preserve cookie scope
      const { redirectUri, returnPath } = parseState(state);
      const safePath = returnPath.startsWith("/") ? returnPath : "/";

      // Extract the origin from the redirectUri so the redirect goes back to
      // the same origin the user started from (preserves cookie domain)
      let redirectTarget = safePath;
      try {
        if (redirectUri) {
          const origin = new URL(redirectUri).origin;
          if (origin && origin !== "null") {
            redirectTarget = `${origin}${safePath}`;
          }
        }
      } catch {
        // If redirectUri is malformed, fall back to relative path
      }

      console.log(`[OAuth] Callback success, redirecting to: ${redirectTarget}`);
      res.redirect(302, redirectTarget);
    } catch (error) {
      console.error("[OAuth] Callback failed", error);
      res.status(500).json({ error: "OAuth callback failed" });
    }
  });
}
