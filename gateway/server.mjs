/**
 * RIO Governance Gateway — Server
 *
 * The RIO Gateway sits between AI systems and execution tools.
 * It enforces governance before any action is executed.
 *
 * Pipeline: Intent → Governance → Risk → Authorization → Execution → Receipt → Ledger → Verification
 *
 * Fail mode: CLOSED. If authorization is missing, execution is denied.
 */
import express from "express";
import cors from "cors";
import { loadConfig } from "./governance/config.mjs";
import { initLedger } from "./ledger/ledger-pg.mjs";
import { initIntentStore } from "./governance/intents.mjs";
import routes from "./routes/index.mjs";
import { createToken, verifyToken, optionalAuth, isRegistered, getRegisteredUser } from "./security/oauth.mjs";
import { replayPreventionMiddleware } from "./security/replay-prevention.mjs";
import { initIdentityBinding } from "./security/identity-binding.mjs";
import signerRoutes from "./routes/signers.mjs";
import apiV1Routes from "./routes/api-v1.mjs";
import keyBackupRoutes from "./routes/key-backup.mjs";
import syncRoutes from "./routes/sync.mjs";
import proxyRoutes from "./routes/proxy.mjs";
import { initApiKeys } from "./security/api-keys.mjs";
import { apiKeyAuth } from "./security/api-auth.mjs";
import { rateLimitMiddleware } from "./security/rate-limiter.mjs";
import { initPrincipals, resolvePrincipal, resolvePrincipalByEmail, getPrincipal } from "./security/principals.mjs";
import { initPolicyStore } from "./governance/policy-store.mjs";
import {
  handleGoogleAuthRedirect,
  handleGoogleCallback,
  handleAuthStatus,
  isGoogleOAuthConfigured,
} from "./security/google-oauth.mjs";

const app = express();
const PORT = process.env.RIO_GATEWAY_PORT || process.env.PORT || 4400;

// ---------------------------------------------------------------------------
// Middleware
// ---------------------------------------------------------------------------
app.use(cors());
app.use(express.json());

// Optional auth on all routes — sets req.user if token present
app.use(optionalAuth);

// Principal resolution on all routes — resolves auth credential → principal
// Must run AFTER optionalAuth so req.user is available
app.use(resolvePrincipal);

// Replay prevention on all state-changing POST requests (Fix #2)
app.use(replayPreventionMiddleware);

// Request logging
app.use((req, res, next) => {
  const start = Date.now();
  res.on("finish", () => {
    const duration = Date.now() - start;
    const user = req.user ? ` [${req.user.sub}]` : "";
    console.log(
      `[RIO Gateway]${user} ${req.method} ${req.path} → ${res.statusCode} (${duration}ms)`
    );
  });
  next();
});

// ---------------------------------------------------------------------------
// Initialize
// ---------------------------------------------------------------------------
console.log("=".repeat(60));
console.log("  RIO GOVERNANCE GATEWAY v2.9.0");
console.log("  Governed AI Execution Runtime");
console.log("  Ledger: PostgreSQL (persistent)");
console.log("  Auth: JWT + Ed25519 + API Keys + Google OAuth (PostgreSQL-backed)");
console.log("  Principals: Unified identity model with role enforcement");
console.log("  Hardening: Token Burn + Replay Prevention + Ed25519 Required + Identity Binding");
console.log("  Public API: /api/v1/* with API key auth, rate limiting, OpenAPI docs");
console.log("=".repeat(60));
console.log();

// Load governance configuration — fail closed if missing
try {
  loadConfig();
  console.log("[RIO Gateway] Governance configuration loaded.");
} catch (err) {
  console.error(`[RIO Gateway] FATAL: ${err.message}`);
  console.error("[RIO Gateway] Gateway cannot start without governance configuration.");
  process.exit(1);
}

// Initialize ledger (async — PostgreSQL)
async function start() {
  try {
    await initLedger();
    console.log("[RIO Gateway] Ledger initialized (PostgreSQL).");

    // Initialize intent store (PostgreSQL-backed, shares ledger pool)
    await initIntentStore();
    console.log("[RIO Gateway] Intent store initialized (PostgreSQL).");

    // Initialize identity binding (WS-010: Ed25519 signers from PostgreSQL)
    await initIdentityBinding();
    console.log("[RIO Gateway] Identity binding initialized (PostgreSQL).");

    // ─── Ed25519 Compliance Check ────────────────────────────────
    const ED25519_STARTUP_MODE = process.env.ED25519_MODE || "required";
    if (ED25519_STARTUP_MODE !== "required") {
      console.log();
      console.log("╔══════════════════════════════════════════════════════════════╗");
      console.log("║  ⚠  WARNING: ED25519 SIGNATURE ENFORCEMENT IS NOT ACTIVE    ║");
      console.log("╠══════════════════════════════════════════════════════════════╣");
      console.log(`║  Current ED25519_MODE: ${ED25519_STARTUP_MODE.padEnd(37)}║`);
      console.log("║  Expected:            required                              ║");
      console.log("║                                                              ║");
      console.log("║  System is running in non-compliant mode.                    ║");
      console.log("║  Unsigned approvals are allowed.                             ║");
      console.log("║  This violates PGTC CS-03 (Authorization Protocol).          ║");
      console.log("║                                                              ║");
      console.log("║  To fix: remove ED25519_MODE env var or set to \"required\"   ║");
      console.log("╚══════════════════════════════════════════════════════════════╝");
      console.log();
    } else {
      console.log("[RIO Gateway] Ed25519 mode: REQUIRED ✓ (all approvals must be signed)");
    }

    // Initialize API keys (WS-012: Public API)
    await initApiKeys();
    console.log("[RIO Gateway] API key store initialized (PostgreSQL).");

    // Initialize principal registry (Area 1: Role Enforcement)
    await initPrincipals();
    console.log("[RIO Gateway] Principal registry initialized (PostgreSQL).");

    // Initialize policy store (Area 2: Policy Evaluation Engine)
    await initPolicyStore();
    console.log("[RIO Gateway] Policy store initialized (PostgreSQL).");
  } catch (err) {
    console.error(`[RIO Gateway] FATAL: Could not connect to ledger database: ${err.message}`);
    console.error("[RIO Gateway] Fail-closed: Gateway will not start without a persistent ledger.");
    process.exit(1);
  }

  // ---------------------------------------------------------------------------
  // Auth Routes (before pipeline routes)
  // ---------------------------------------------------------------------------

    // POST /login — Authenticate and receive a JWT token
  // Supports three resolution paths (tried in order):
  //   1. Registered-user lookup (email or legacy alias → bkr1297@gmail.com)
  //   2. Principal-based login (principal_id e.g. I-1, bondi, gateway-exec)
  //   3. Email → principal resolution (any registered email)
  app.post("/login", (req, res) => {
    const { user_id, passphrase } = req.body;
    if (!user_id) {
      return res.status(400).json({ error: "Missing required field: user_id" });
    }

    const expectedPassphrase = process.env.RIO_PASSPHRASE || process.env.RIO_LOGIN_PASSPHRASE || "rio-governed-2026";
    if (passphrase !== expectedPassphrase) {
      return res.status(401).json({ error: "Invalid passphrase." });
    }

    // Path 1: Registered-user lookup (email key, with legacy alias support)
    if (isRegistered(user_id)) {
      const user = getRegisteredUser(user_id);
      // Create token with email as sub and principal_id
      const token = createToken(user_id);
      const principalId = user.principal_id || null;
      console.log(`[RIO Gateway] LOGIN: ${user_id} → ${user.email} authenticated (registered-user, principal: ${principalId})`);
      return res.json({
        status: "authenticated",
        user_id: user.email,
        display_name: user.display_name,
        email: user.email,
        role: user.role,
        principal_id: principalId,
        token,
        expires_in: "24h",
      });
    }

    // Path 2: Principal-based login (e.g. I-1, bondi, gateway-exec)
    const principal = getPrincipal(user_id);
    if (principal && principal.status === "active") {
      const token = createToken(principal.principal_id, {
        email: principal.email || null,
        name: principal.display_name,
        role: principal.primary_role,
        principal_id: principal.principal_id,
        auth_method: "passphrase",
      });
      console.log(`[RIO Gateway] LOGIN: ${user_id} authenticated (principal: ${principal.principal_id}, role: ${principal.primary_role})`);
      return res.json({
        status: "authenticated",
        user_id: principal.principal_id,
        display_name: principal.display_name,
        email: principal.email || null,
        role: principal.primary_role,
        principal_id: principal.principal_id,
        token,
        expires_in: "24h",
      });
    }

    // Path 3: Email → principal resolution
    const emailPrincipal = resolvePrincipalByEmail(user_id);
    if (emailPrincipal && emailPrincipal.status === "active") {
      const token = createToken(emailPrincipal.principal_id, {
        email: emailPrincipal.email || user_id,
        name: emailPrincipal.display_name,
        role: emailPrincipal.primary_role,
        principal_id: emailPrincipal.principal_id,
        auth_method: "passphrase",
      });
      console.log(`[RIO Gateway] LOGIN: ${user_id} → ${emailPrincipal.principal_id} authenticated (email→principal)`);
      return res.json({
        status: "authenticated",
        user_id: emailPrincipal.principal_id,
        display_name: emailPrincipal.display_name,
        email: emailPrincipal.email || user_id,
        role: emailPrincipal.primary_role,
        principal_id: emailPrincipal.principal_id,
        token,
        expires_in: "24h",
      });
    }

    return res.status(403).json({ error: `User not registered: ${user_id}` });
  });

  // GET /whoami — Return current authenticated user
  app.get("/whoami", (req, res) => {
    if (!req.user) {
      return res.status(401).json({
        authenticated: false,
        hint: "POST /login with user_id and passphrase to get a token.",
      });
    }

    res.json({
      authenticated: true,
      user_id: req.user.sub,
      display_name: req.user.name,
      email: req.user.email,
      role: req.user.role,
      principal_id: req.user.principal_id || null,
    });
  });

  // ---------------------------------------------------------------------------
  // Google OAuth Routes (Priority 2: Two humans can log in)
  // ---------------------------------------------------------------------------

  // GET /auth/google — Redirect to Google consent screen
  app.get("/auth/google", handleGoogleAuthRedirect);

  // GET /auth/google/callback — Handle Google's redirect with authorization code
  app.get("/auth/google/callback", (req, res) => {
    handleGoogleCallback(req, res, { createToken, resolvePrincipalByEmail });
  });

  // GET /auth/status — Check OAuth configuration status
  app.get("/auth/status", handleAuthStatus);

  if (isGoogleOAuthConfigured()) {
    console.log("[RIO Gateway] Google OAuth: CONFIGURED");
  } else {
    console.log("[RIO Gateway] Google OAuth: NOT CONFIGURED (passphrase login only)");
    console.log("[RIO Gateway] Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET to enable.");
  }

  // ---------------------------------------------------------------------------
  // Signer Management Routes (WS-010: Identity Binding)
  // ---------------------------------------------------------------------------
  app.use("/api/signers", signerRoutes);

  // ---------------------------------------------------------------------------
  // Key Backup Routes (Encrypted key storage for recovery)
  // ---------------------------------------------------------------------------
  app.use("/api/key-backup", keyBackupRoutes);

  // ---------------------------------------------------------------------------
  // Device Sync Routes (Full state restoration)
  // ---------------------------------------------------------------------------
  app.use("/api/sync", syncRoutes);

  // ---------------------------------------------------------------------------
  // Proxy Onboarding & Kill Switch Routes (WS-013: Jordan's frontend)
  // Also serves GET /api/receipts/recent for the protocol site feed
  // ---------------------------------------------------------------------------
  app.use("/api", proxyRoutes);

  // ---------------------------------------------------------------------------
  // Public API v1 Routes (WS-012)
  // API key auth + rate limiting applied to all /api/v1/* routes
  // ---------------------------------------------------------------------------
  app.use("/api/v1", apiKeyAuth, rateLimitMiddleware, apiV1Routes);

  // ---------------------------------------------------------------------------
  // Pipeline Routes
  // ---------------------------------------------------------------------------
  app.use("/", routes);

  // Root endpoint
  app.get("/", (req, res) => {
    res.json({
      name: "RIO Governance Gateway",
      version: "2.9.0",
      description: "Governed AI Execution Runtime — No Authorization, No Execution.",
      ledger: "PostgreSQL (persistent)",
      auth: "JWT + Ed25519 + Google OAuth",
      google_oauth: isGoogleOAuthConfigured() ? "configured" : "not_configured (passphrase fallback)",
      endpoints: {
        "--- Authentication ---": "---",
        "POST /login": "Authenticate via passphrase and receive JWT token (testing fallback)",
        "GET /auth/google": "Redirect to Google OAuth consent screen",
        "GET /auth/google/callback": "Handle Google OAuth callback (issues JWT)",
        "GET /auth/status": "Check OAuth configuration status",
        "GET /whoami": "Return current authenticated user",
        "--- Governance Pipeline ---": "---",
        "POST /intent": "Submit an intent from any AI agent",
        "POST /govern": "Run policy + risk evaluation on an intent",
        "POST /authorize": "Record human approval or denial (supports Ed25519 signatures)",
        "POST /approvals/:intent_id": "Record approval/denial with principal attribution",
        "GET /approvals/:intent_id": "List all approvals for an intent",
        "POST /execute": "Execute an authorized action (returns execution token)",
        "POST /execute-action": "Full pipeline: execute authorized action, generate receipt, write ledger (one call)",
        "POST /execute-confirm": "Confirm execution result from agent",
        "POST /receipt": "Generate cryptographic receipt",
        "GET /ledger": "View ledger entries",
        "GET /verify": "Verify receipt hash chain integrity",
        "GET /health": "System health check",
        "GET /intents": "List all intents",
        "GET /intent/:id": "Get a specific intent with full pipeline state",
        "POST /api/signers/generate-keypair": "Generate Ed25519 keypair (private key returned ONCE)",
        "POST /api/signers/register": "Register externally-generated Ed25519 public key",
        "GET /api/signers": "List all registered signers",
        "DELETE /api/signers/:signer_id": "Revoke a signer",
        "--- Key Recovery ---": "---",
        "POST /api/key-backup": "Store encrypted key backup",
        "GET /api/key-backup/:signer_id": "Retrieve encrypted key backup for recovery",
        "GET /api/key-backup": "List all key backups",
        "DELETE /api/key-backup/:signer_id": "Delete a key backup",
        "--- Device Sync ---": "---",
        "POST /api/sync": "Full device sync (identity + ledger)",
        "GET /api/sync/health": "Lightweight ledger health check",
        "--- Proxy Onboarding ---": "---",
        "POST /api/onboard": "Register new user/device with Ed25519 key (onboard receipt)",
        "POST /api/kill": "Emergency proxy shutdown (kill switch receipt, requires auth)",
        "GET /api/receipts/recent": "Public recent receipts feed (no auth required)",
        "--- Public API v1 ---": "---",
        "POST /api/v1/intents": "Submit intent (API key or JWT)",
        "GET /api/v1/intents": "List intents",
        "POST /api/v1/intents/:id/govern": "Run governance",
        "POST /api/v1/intents/:id/authorize": "Authorize/deny",
        "POST /api/v1/intents/:id/execute": "Execute authorized intent",
        "POST /api/v1/intents/:id/confirm": "Confirm execution",
        "POST /api/v1/intents/:id/receipt": "Generate receipt",
        "GET /api/v1/ledger": "View ledger entries",
        "GET /api/v1/verify": "Verify hash chain",
        "GET /api/v1/health": "API health check",
        "GET /api/v1/docs": "OpenAPI 3.0 documentation",
        "POST /api/v1/keys": "Create API key (owner only)",
        "GET /api/v1/keys": "List API keys",
        "DELETE /api/v1/keys/:key_id": "Revoke API key",
      },
      fail_mode: "closed",
    });
  });

  // 404 handler
  app.use((req, res) => {
    res.status(404).json({ error: `Route not found: ${req.method} ${req.path}` });
  });

  // Error handler
  app.use((err, req, res, next) => {
    console.error(`[RIO Gateway] Unhandled error: ${err.message}`);
    res.status(500).json({ error: "Internal server error." });
  });

  // ---------------------------------------------------------------------------
  // Start
  // ---------------------------------------------------------------------------
  const server = app.listen(PORT, () => {
    console.log();
    console.log(`[RIO Gateway] Listening on port ${PORT}`);
    console.log(`[RIO Gateway] Health: http://localhost:${PORT}/health`);
    console.log(`[RIO Gateway] Fail mode: CLOSED`);
    console.log(`[RIO Gateway] Ledger: PostgreSQL (persistent, append-only)`);
    console.log(`[RIO Gateway] Auth: JWT sessions + Ed25519 signatures`);
    console.log(`[RIO Gateway] Ed25519 enforcement: ${process.env.ED25519_MODE || "required"}`);
    console.log();
  });
  return server;
}

export { start };

// Auto-start when run directly (not imported by tests)
const isDirectRun = process.argv[1] && import.meta.url === `file://${process.argv[1]}`;
const isTestContext = process.env.NODE_TEST_CONTEXT === "1";
if (isDirectRun || (!isTestContext && !process.argv[1]?.includes('test'))) {
  start();
}
