/**
 * RIO OAuth Module Index
 *
 * Registers all provider-specific OAuth routes.
 * Currently supports:
 *   - Google (Gmail, Drive, Calendar)
 *   - GitHub (Issues, PRs, Commits)
 *
 * Future:
 *   - Microsoft (Outlook, OneDrive)
 *   - Slack
 */

import type { Express } from "express";
import { registerGoogleOAuthRoutes } from "./google";
import { registerGitHubOAuthRoutes } from "./github";
import { registerMicrosoftOAuthRoutes } from "./microsoft";

export function registerProviderOAuthRoutes(app: Express) {
  registerGoogleOAuthRoutes(app);
  console.log("[RIO OAuth] Google OAuth routes registered");

  registerGitHubOAuthRoutes(app);
  console.log("[RIO OAuth] GitHub OAuth routes registered");

  registerMicrosoftOAuthRoutes(app);
  console.log("[RIO OAuth] Microsoft OAuth routes registered");
}
