/**
 * RIO OAuth Module Index
 *
 * Registers all provider-specific OAuth routes.
 * Currently supports:
 *   - Google (Gmail, Drive, Calendar)
 *
 * Future:
 *   - GitHub
 *   - Microsoft (Outlook, OneDrive)
 *   - Slack
 */

import type { Express } from "express";
import { registerGoogleOAuthRoutes } from "./google";

export function registerProviderOAuthRoutes(app: Express) {
  registerGoogleOAuthRoutes(app);
  console.log("[RIO OAuth] Google OAuth routes registered");

  // Future providers:
  // registerGitHubOAuthRoutes(app);
  // registerMicrosoftOAuthRoutes(app);
}
