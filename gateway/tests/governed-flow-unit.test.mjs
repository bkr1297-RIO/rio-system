/**
 * RIO Governance Gateway — Unit Tests for Priorities 1 & 2
 *
 * Tests:
 *   1. Google OAuth module (unconfigured + configured)
 *   2. Principal email resolution
 *   3. createToken with direct claims (Mode 2 for Google OAuth)
 *
 * Run: node --test tests/governed-flow-unit.test.mjs
 */
import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";

// ---------------------------------------------------------------------------
// Unit Tests: Google OAuth Module
// ---------------------------------------------------------------------------
describe("Google OAuth Module", async () => {
  let googleOAuth;

  before(async () => {
    delete process.env.GOOGLE_CLIENT_ID;
    delete process.env.GOOGLE_CLIENT_SECRET;
    googleOAuth = await import("../security/google-oauth.mjs");
  });

  it("isGoogleOAuthConfigured returns false when env vars are missing", () => {
    assert.equal(googleOAuth.isGoogleOAuthConfigured(), false);
  });

  it("handleGoogleAuthRedirect returns 503 when not configured", async () => {
    const req = {};
    const res = {
      statusCode: null,
      body: null,
      status(code) { this.statusCode = code; return this; },
      json(data) { this.body = data; },
    };
    googleOAuth.handleGoogleAuthRedirect(req, res);
    assert.equal(res.statusCode, 503);
    assert.ok(res.body.error.includes("not configured"));
  });

  it("handleAuthStatus returns correct status when not configured", () => {
    const req = {};
    const res = {
      body: null,
      json(data) { this.body = data; },
    };
    googleOAuth.handleAuthStatus(req, res);
    assert.equal(res.body.google_oauth.configured, false);
    assert.equal(res.body.passphrase_login.enabled, true);
  });

  it("handleGoogleCallback redirects with error when state is invalid", async () => {
    let redirectUrl = null;
    const req = { query: { code: "test", state: "invalid-state" } };
    const res = {
      statusCode: null,
      body: null,
      status(code) { this.statusCode = code; return this; },
      json(data) { this.body = data; },
      redirect(url) { redirectUrl = url; },
    };
    await googleOAuth.handleGoogleCallback(req, res, {
      createToken: () => "fake-token",
      resolvePrincipalByEmail: () => null,
    });
    assert.ok(redirectUrl, "Should redirect");
    assert.ok(redirectUrl.includes("auth_error"), "Should include auth_error in redirect URL");
  });
});

describe("Google OAuth Module (configured)", async () => {
  before(async () => {
    process.env.GOOGLE_CLIENT_ID = "test-client-id.apps.googleusercontent.com";
    process.env.GOOGLE_CLIENT_SECRET = "test-secret";
    process.env.GOOGLE_REDIRECT_URI = "http://localhost:4400/auth/google/callback";
  });

  after(() => {
    delete process.env.GOOGLE_CLIENT_ID;
    delete process.env.GOOGLE_CLIENT_SECRET;
    delete process.env.GOOGLE_REDIRECT_URI;
  });

  it("environment variables are set correctly", () => {
    assert.equal(process.env.GOOGLE_CLIENT_ID, "test-client-id.apps.googleusercontent.com");
    assert.equal(process.env.GOOGLE_CLIENT_SECRET, "test-secret");
  });
});

// ---------------------------------------------------------------------------
// Unit Tests: Principal Email Resolution
// ---------------------------------------------------------------------------
describe("Principal Email Resolution", async () => {
  let principals;

  before(async () => {
    process.env.DATABASE_URL = "postgresql://rio_user:rio_pass@localhost:5432/rio_ledger_test";
    process.env.JWT_SECRET = "test-jwt-secret-for-governed-flow";
    process.env.ED25519_MODE = "optional";

    principals = await import("../security/principals.mjs");
    await principals.initPrincipals();
  });

  it("resolves Brian's primary email to I-1", () => {
    const principal = principals.resolvePrincipalByEmail("bkr1297@gmail.com");
    assert.ok(principal, "Should resolve bkr1297@gmail.com to a principal");
    assert.equal(principal.principal_id, "I-1");
    assert.equal(principal.primary_role, "root_authority");
  });

  it("resolves riomethod5 email to I-2 (seed email match)", () => {
    const principal = principals.resolvePrincipalByEmail("riomethod5@gmail.com");
    assert.ok(principal, "Should resolve riomethod5@gmail.com to a principal");
    // I-2 owns riomethod5@gmail.com in the seed; the KNOWN_EMAIL_ALIASES
    // fallback to I-1 is only reached if no direct email match exists.
    assert.equal(principal.principal_id, "I-2");
  });

  it("resolves Brian's hotmail email to I-1 (case insensitive)", () => {
    const principal = principals.resolvePrincipalByEmail("RasmussenBR@hotmail.com");
    assert.ok(principal, "Should resolve RasmussenBR@hotmail.com to a principal");
    assert.equal(principal.principal_id, "I-1");
  });

  it("returns null for unknown email", () => {
    const principal = principals.resolvePrincipalByEmail("unknown@example.com");
    assert.equal(principal, null);
  });

  it("returns null for empty email", () => {
    assert.equal(principals.resolvePrincipalByEmail(""), null);
    assert.equal(principals.resolvePrincipalByEmail(null), null);
    assert.equal(principals.resolvePrincipalByEmail(undefined), null);
  });
});

// ---------------------------------------------------------------------------
// Unit Tests: createToken with claims (Mode 2 for Google OAuth)
// ---------------------------------------------------------------------------
describe("createToken with direct claims (Mode 2)", async () => {
  let oauth;

  before(async () => {
    process.env.JWT_SECRET = "test-jwt-secret-for-governed-flow";
    oauth = await import("../security/oauth.mjs");
  });

  it("creates a token with direct claims", () => {
    const token = oauth.createToken("I-1", {
      email: "bkr1297@gmail.com",
      name: "Brian Rasmussen",
      role: "root_authority",
      principal_id: "I-1",
      auth_method: "google_oauth",
      picture: "https://example.com/photo.jpg",
    });
    assert.ok(token, "Token should be created");
    assert.ok(token.split(".").length === 3, "Token should have 3 parts (JWT format)");

    const decoded = oauth.verifyToken(token);
    assert.ok(decoded, "Token should be verifiable");
    assert.equal(decoded.sub, "I-1");
    assert.equal(decoded.email, "bkr1297@gmail.com");
    assert.equal(decoded.name, "Brian Rasmussen");
    assert.equal(decoded.role, "root_authority");
    assert.equal(decoded.principal_id, "I-1");
    assert.equal(decoded.auth_method, "google_oauth");
    assert.equal(decoded.picture, "https://example.com/photo.jpg");
  });

  it("creates a token with legacy alias (Mode 1 — resolves to email)", () => {
    const token = oauth.createToken("brian.k.rasmussen");
    assert.ok(token, "Token should be created");

    const decoded = oauth.verifyToken(token);
    assert.ok(decoded, "Token should be verifiable");
    assert.equal(decoded.sub, "bkr1297@gmail.com", "Legacy alias should resolve to email as sub");
    assert.equal(decoded.email, "bkr1297@gmail.com");
    assert.equal(decoded.principal_id, "I-1", "Should include principal_id");
    assert.equal(decoded.auth_method, "passphrase");
  });

  it("creates a token with email directly (Mode 1)", () => {
    const token = oauth.createToken("bkr1297@gmail.com");
    assert.ok(token, "Token should be created");

    const decoded = oauth.verifyToken(token);
    assert.ok(decoded, "Token should be verifiable");
    assert.equal(decoded.sub, "bkr1297@gmail.com");
    assert.equal(decoded.principal_id, "I-1");
    assert.equal(decoded.auth_method, "passphrase");
  });

  it("returns null for unknown legacy user", () => {
    const token = oauth.createToken("nonexistent.user");
    assert.equal(token, null);
  });
});
