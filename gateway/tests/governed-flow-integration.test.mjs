/**
 * RIO Governance Gateway — Integration Tests: Full Governed Flow
 *
 * Tests the complete governed pipeline via HTTP:
 *   intent → govern → approve → execute → ledger
 *   + proposer ≠ approver enforcement
 *   + denial flow
 *   + unauthenticated access blocked
 *   + Google OAuth status endpoint
 *
 * Run: node --test tests/governed-flow-integration.test.mjs
 *
 * Requires: PostgreSQL running locally with rio_ledger_test database.
 */
import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";

describe("Full Governed Flow (Integration)", async () => {
  let baseUrl;
  let server;
  const PORT = 4405;

  before(async () => {
    // Configure environment for local test database
    process.env.DATABASE_URL = "postgresql://rio_user:rio_pass@localhost:5432/rio_ledger_test";
    process.env.NODE_TEST_CONTEXT = "1";
    process.env.JWT_SECRET = "test-jwt-secret-for-governed-flow";
    process.env.PORT = String(PORT);
    process.env.ED25519_MODE = "optional";
    process.env.RIO_PASSPHRASE = "rio-governed-2026";
    // Clear Google OAuth to test unconfigured state
    delete process.env.GOOGLE_CLIENT_ID;
    delete process.env.GOOGLE_CLIENT_SECRET;
    delete process.env.GOOGLE_REDIRECT_URI;

    baseUrl = `http://localhost:${PORT}`;

    // Dynamic import to start the server
    const gateway = await import("../server.mjs");
    server = await gateway.start();

    // Wait for server to be ready
    for (let i = 0; i < 30; i++) {
      try {
        const res = await fetch(`${baseUrl}/health`);
        if (res.ok) break;
      } catch { /* retry */ }
      await new Promise((r) => setTimeout(r, 200));
    }
  });

  after(() => {
    if (server?.close) server.close();
  });

  // -------------------------------------------------------------------------
  // Helpers
  // -------------------------------------------------------------------------

  /** Login via passphrase (only works for brian.k.rasmussen) */
  async function login(userId) {
    const res = await fetch(`${baseUrl}/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        user_id: userId,
        passphrase: "rio-governed-2026",
      }),
    });
    const data = await res.json();
    return data.token;
  }

  /** Create a JWT for a principal not in REGISTERED_USERS */
  async function createPrincipalToken(principalId, role) {
    const { createToken } = await import("../security/oauth.mjs");
    return createToken(principalId, {
      principal_id: principalId,
      role,
      auth_method: "service",
    });
  }

  /** Authenticated fetch helper */
  async function authFetch(url, options = {}, token) {
    return fetch(url, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
        ...(options.headers || {}),
      },
    });
  }

  // -------------------------------------------------------------------------
  // Auth status
  // -------------------------------------------------------------------------
  it("GET /auth/status returns OAuth configuration status", async () => {
    const res = await fetch(`${baseUrl}/auth/status`);
    const data = await res.json();
    assert.equal(res.status, 200);
    assert.ok("google_oauth" in data);
    assert.ok("passphrase_login" in data);
    assert.equal(data.passphrase_login.enabled, true);
  });

  it("GET /auth/google returns 503 when credentials not set", async () => {
    const res = await fetch(`${baseUrl}/auth/google`);
    assert.equal(res.status, 503);
  });

  // -------------------------------------------------------------------------
  // Full governed flow: intent → govern → approve → execute → ledger
  // -------------------------------------------------------------------------
  let intentId;
  let brianToken;
  let bondiToken;

  it("Step 1: Login as Brian (root_authority) and create Bondi token (proposer)", async () => {
    brianToken = await login("brian.k.rasmussen");
    assert.ok(brianToken, "Brian should receive a JWT token");
    bondiToken = await createPrincipalToken("bondi", "proposer");
    assert.ok(bondiToken, "Bondi should receive a JWT token");

    // Verify whoami for Brian
    const whoami = await authFetch(`${baseUrl}/whoami`, {}, brianToken);
    const data = await whoami.json();
    assert.equal(data.authenticated, true);
    assert.equal(data.user_id, "brian.k.rasmussen");
  });

  it("Step 2: Bondi submits intent (proposer role)", async () => {
    const res = await authFetch(
      `${baseUrl}/intent`,
      {
        method: "POST",
        body: JSON.stringify({
          action: "send_email",
          agent_id: "bondi",
          target_environment: "gmail",
          parameters: { to: "test@example.com", subject: "Test" },
          confidence: 95,
          context: { source: "governed-flow-test" },
          request_timestamp: new Date().toISOString(),
          request_nonce: `test-nonce-${Date.now()}`,
        }),
      },
      bondiToken
    );
    assert.equal(res.status, 201, `Expected 201, got ${res.status}`);
    const data = await res.json();
    intentId = data.intent_id;
    assert.ok(data.intent_id, "Should return an intent_id");
    assert.equal(data.status, "submitted", "Intent should be in submitted status");
  });

  it("Step 3: Govern intent (policy evaluation)", async () => {
    const res = await authFetch(
      `${baseUrl}/govern`,
      {
        method: "POST",
        body: JSON.stringify({
          intent_id: intentId,
          request_timestamp: new Date().toISOString(),
          request_nonce: `test-nonce-govern-${Date.now()}`,
        }),
      },
      bondiToken
    );
    assert.equal(res.status, 200, `Expected 200, got ${res.status}`);
    const data = await res.json();
    assert.equal(data.intent_id, intentId);
    const decision = data.governance_decision || data.governance_status;
    assert.equal(decision, "REQUIRE_HUMAN", "send_email should require human approval");
  });

  it("Step 4: Brian approves via POST /approvals/:intent_id", async () => {
    const res = await authFetch(
      `${baseUrl}/approvals/${intentId}`,
      {
        method: "POST",
        body: JSON.stringify({
          decision: "approved",
          reason: "Governed flow test — approved by root_authority",
          request_timestamp: new Date().toISOString(),
          request_nonce: `test-nonce-approve-${Date.now()}`,
        }),
      },
      brianToken
    );
    assert.equal(res.status, 200, `Expected 200, got ${res.status}`);
    const data = await res.json();
    assert.equal(data.intent_id, intentId);
    assert.equal(data.decision, "approved");
    assert.ok(data.approval_id, "Should return an approval_id");
    assert.ok(data.approver_id, "Should return an approver_id");
  });

  it("Step 5: Verify intent is now authorized", async () => {
    const res = await authFetch(
      `${baseUrl}/intent/${intentId}`,
      { method: "GET" },
      brianToken
    );
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.status, "authorized");
  });

  it("Step 6: Execute the approved intent (as gateway-exec)", async () => {
    const execToken = await createPrincipalToken("gateway-exec", "executor");
    const res = await authFetch(
      `${baseUrl}/execute`,
      {
        method: "POST",
        body: JSON.stringify({
          intent_id: intentId,
          request_timestamp: new Date().toISOString(),
          request_nonce: `test-nonce-execute-${Date.now()}`,
        }),
      },
      execToken
    );
    assert.equal(res.status, 200, `Expected 200, got ${res.status}`);
    const data = await res.json();
    assert.equal(data.intent_id, intentId);
    assert.ok(
      ["execute_now", "executed"].includes(data.status),
      "Should be in execute_now or executed status"
    );
  });

  it("Step 7: Verify ledger has entries for the full flow", async () => {
    const res = await authFetch(
      `${baseUrl}/ledger`,
      { method: "GET" },
      brianToken
    );
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.ok(data.entries, "Should have ledger entries");
    const ourEntries = data.entries.filter((e) => e.intent_id === intentId);
    assert.ok(
      ourEntries.length >= 3,
      `Expected at least 3 ledger entries for intent, got ${ourEntries.length}`
    );
  });

  // -------------------------------------------------------------------------
  // Proposer ≠ Approver enforcement
  // -------------------------------------------------------------------------
  it("Step 8: Proposer ≠ Approver enforcement on /approvals", async () => {
    const intentRes = await authFetch(
      `${baseUrl}/intent`,
      {
        method: "POST",
        body: JSON.stringify({
          action: "send_email",
          agent_id: "bondi",
          target_environment: "gmail",
          parameters: { to: "test@example.com", subject: "Test" },
          confidence: 95,
          context: { source: "proposer-approver-test" },
          request_timestamp: new Date().toISOString(),
          request_nonce: `test-nonce-pa-${Date.now()}`,
        }),
      },
      bondiToken
    );
    const intentData = await intentRes.json();
    const newIntentId = intentData.intent_id;

    // Govern it
    await authFetch(
      `${baseUrl}/govern`,
      {
        method: "POST",
        body: JSON.stringify({
          intent_id: newIntentId,
          request_timestamp: new Date().toISOString(),
          request_nonce: `test-nonce-pa-govern-${Date.now()}`,
        }),
      },
      bondiToken
    );

    // Bondi tries to approve their own intent — should be blocked
    const approveRes = await authFetch(
      `${baseUrl}/approvals/${newIntentId}`,
      {
        method: "POST",
        body: JSON.stringify({
          decision: "approved",
          reason: "Self-approval attempt",
          request_timestamp: new Date().toISOString(),
          request_nonce: `test-nonce-pa-approve-${Date.now()}`,
        }),
      },
      bondiToken
    );

    // Bondi is a proposer, not an approver. The Gateway blocks this at the role level
    // (requireRole('approver') rejects proposers) OR at the invariant level
    // (proposer ≠ approver). Either way, it's 403.
    assert.equal(approveRes.status, 403, "Proposer attempting to approve should be blocked");
    const approveData = await approveRes.json();
    const errLower = (approveData.error || "").toLowerCase();
    const isRoleDenied = errLower.includes("role") || errLower.includes("forbidden") || errLower.includes("insufficient");
    const isInvariantDenied = approveData.invariant === "proposer_ne_approver" || errLower.includes("proposer");
    assert.ok(
      isRoleDenied || isInvariantDenied,
      `Should be blocked by role or proposer≠approver invariant, got: ${JSON.stringify(approveData)}`
    );
  });

  // -------------------------------------------------------------------------
  // Unauthenticated access blocked
  // -------------------------------------------------------------------------
  it("Unauthenticated POST /approvals/:id returns 403", async () => {
    const res = await fetch(`${baseUrl}/approvals/some-intent-id`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ decision: "approved" }),
    });
    assert.equal(res.status, 403);
  });

  it("Unauthenticated GET /approvals/:id returns 403", async () => {
    const res = await fetch(`${baseUrl}/approvals/some-intent-id`, {
      method: "GET",
    });
    assert.equal(res.status, 403);
  });

  // -------------------------------------------------------------------------
  // Denial flow
  // -------------------------------------------------------------------------
  it("Denial flow: intent → govern → deny → execute blocked", async () => {
    const intentRes = await authFetch(
      `${baseUrl}/intent`,
      {
        method: "POST",
        body: JSON.stringify({
          action: "send_email",
          agent_id: "bondi",
          target_environment: "gmail",
          parameters: { to: "suspicious@example.com" },
          confidence: 95,
          context: { source: "denial-test" },
          request_timestamp: new Date().toISOString(),
          request_nonce: `test-nonce-deny-${Date.now()}`,
        }),
      },
      bondiToken
    );
    const intentData = await intentRes.json();
    const denyIntentId = intentData.intent_id;

    // Govern
    await authFetch(
      `${baseUrl}/govern`,
      {
        method: "POST",
        body: JSON.stringify({
          intent_id: denyIntentId,
          request_timestamp: new Date().toISOString(),
          request_nonce: `test-nonce-deny-govern-${Date.now()}`,
        }),
      },
      bondiToken
    );

    // Brian denies
    const denyRes = await authFetch(
      `${baseUrl}/approvals/${denyIntentId}`,
      {
        method: "POST",
        body: JSON.stringify({
          decision: "denied",
          reason: "Suspicious recipient — denied by root_authority",
          request_timestamp: new Date().toISOString(),
          request_nonce: `test-nonce-deny-approve-${Date.now()}`,
        }),
      },
      brianToken
    );
    assert.equal(denyRes.status, 200, "Denial should succeed");
    const denyData = await denyRes.json();
    assert.equal(denyData.decision, "denied");

    // Try to execute — should be blocked
    const execToken = await createPrincipalToken("gateway-exec", "executor");
    {
      const execRes = await authFetch(
        `${baseUrl}/execute`,
        {
          method: "POST",
          body: JSON.stringify({
            intent_id: denyIntentId,
            request_timestamp: new Date().toISOString(),
            request_nonce: `test-nonce-deny-exec-${Date.now()}`,
          }),
        },
        execToken
      );
      assert.equal(execRes.status, 403, "Denied intent should not be executable");
    }
  });

  // -------------------------------------------------------------------------
  // GET /approvals for pending approvals
  // -------------------------------------------------------------------------
  it("GET /approvals returns pending approvals list", async () => {
    const res = await authFetch(
      `${baseUrl}/approvals`,
      { method: "GET" },
      brianToken
    );
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.ok("pending_approvals" in data, "Should have pending_approvals field");
    assert.ok("count" in data, "Should have count field");
  });
});
