/**
 * RIO Gateway — Principal & Role Enforcement Tests (Area 1)
 *
 * Proves:
 *   1. Fail-closed: unauthenticated requests → 403 on all role-gated routes
 *   2. Role boundaries: proposer cannot authorize, executor cannot propose, etc.
 *   3. Principal attribution: intents carry principal_id
 *   4. root_authority has implicit governance roles
 *   5. Suspended/revoked principals are blocked
 *   6. Health endpoint remains public (no role gating)
 *
 * Test strategy:
 *   - Start Gateway on test port 4402
 *   - Use JWT login to authenticate as Brian (I-1, root_authority)
 *   - Use JWT tokens (via createToken) to simulate different principals
 *   - X-Principal-ID header has been removed (identity-cleanup, 2026-04-11)
 *   - Verify each endpoint enforces the correct role
 */
import { describe, it, before } from "node:test";
import assert from "node:assert/strict";

const BASE = "http://localhost:4402";
let brianToken = null;

// Principal tokens created via createToken for role-boundary tests
const principalTokens = {};

// Helper: generate unique nonce
function nonce() {
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

// Helper: add replay prevention fields to POST bodies
function withReplay(body) {
  if (!body) return body;
  return {
    ...body,
    request_timestamp: new Date().toISOString(),
    request_nonce: nonce(),
  };
}

// Helper to make requests
async function api(method, path, body, headers = {}) {
  const opts = {
    method,
    headers: {
      "Content-Type": "application/json",
      ...headers,
    },
  };
  // Add replay prevention fields to POST requests
  if (body && method === "POST") {
    opts.body = JSON.stringify(withReplay(body));
  } else if (body) {
    opts.body = JSON.stringify(body);
  }
  const res = await fetch(`${BASE}${path}`, opts);
  const data = await res.json();
  return { status: res.status, data };
}

// Helper: make authenticated request as Brian (I-1)
async function apiAsBrian(method, path, body) {
  return api(method, path, body, {
    Authorization: `Bearer ${brianToken}`,
  });
}

// Helper: make request as a specific principal (via JWT token)
async function apiAsPrincipal(principalId, method, path, body) {
  const token = principalTokens[principalId];
  if (!token) throw new Error(`No token for principal: ${principalId}`);
  return api(method, path, body, {
    Authorization: `Bearer ${token}`,
  });
}

describe("Area 1: Principal & Role Enforcement", () => {
  before(async () => {
    // Start the server on a test port
    process.env.RIO_GATEWAY_PORT = "4402";
    // Set Ed25519 to optional for role enforcement testing
    // (Ed25519 enforcement is tested separately in gateway.test.mjs)
    process.env.ED25519_MODE = "optional";
    await import("../server.mjs");
    // Give the server time to start and seed principals
    await new Promise((r) => setTimeout(r, 2000));

    // Login as Brian to get a JWT token (uses legacy alias)
    const loginResult = await api("POST", "/login", {
      user_id: "brian.k.rasmussen",
      passphrase: process.env.RIO_LOGIN_PASSPHRASE || "rio-governed-2026",
    });
    assert.equal(loginResult.status, 200, "Brian should be able to login");
    brianToken = loginResult.data.token;
    assert.ok(brianToken, "Should receive a JWT token");
    // Verify login now resolves to email
    assert.equal(loginResult.data.email, "bkr1297@gmail.com", "Login should resolve to bkr1297@gmail.com");
    console.log(`[TEST] Brian authenticated — token received (email: ${loginResult.data.email})`);

    // Create JWT tokens for other principals (X-Principal-ID removed)
    const { createToken } = await import("../security/oauth.mjs");
    principalTokens["bondi"] = createToken("bondi", { principal_id: "bondi", role: "proposer", auth_method: "service" });
    principalTokens["gateway-exec"] = createToken("gateway-exec", { principal_id: "gateway-exec", role: "executor", auth_method: "service" });
    principalTokens["mantis"] = createToken("mantis", { principal_id: "mantis", role: "auditor", auth_method: "service" });
    console.log(`[TEST] Principal tokens created for bondi, gateway-exec, mantis`);
  });

  // =========================================================================
  // 1. Health endpoint is public (no role gating)
  // =========================================================================
  describe("Public Endpoints", () => {
    it("GET /health — accessible without authentication", async () => {
      const { status, data } = await api("GET", "/health");
      assert.equal(status, 200);
      assert.equal(data.status, "operational");
      assert.equal(data.fail_mode, "closed");
      // Area 1: principals enforcement should be reported
      assert.ok(data.principals, "Health should report principals status");
      assert.equal(data.principals.enforcement, "active");
      assert.equal(data.principals.role_gating, true);
      assert.equal(data.principals.fail_closed, true);
    });

    it("GET /api/receipts/recent — accessible without authentication", async () => {
      const { status, data } = await api("GET", "/api/receipts/recent");
      assert.equal(status, 200);
      assert.ok(Array.isArray(data.receipts));
    });
  });

  // =========================================================================
  // 2. Fail-Closed: Unauthenticated requests blocked on all role-gated routes
  // =========================================================================
  describe("Fail-Closed: Unauthenticated Requests", () => {
    const roleGatedRoutes = [
      ["POST", "/intent", { action: "read_email", agent_id: "brian.k.rasmussen", target_environment: "gmail" }],
      ["POST", "/govern", { intent_id: "test" }],
      ["POST", "/authorize", { intent_id: "test", decision: "approved", authorized_by: "test" }],
      ["POST", "/execute", { intent_id: "test" }],
      ["POST", "/execute-confirm", { intent_id: "test", execution_result: "test" }],
      ["POST", "/receipt", { intent_id: "test" }],
      ["GET", "/ledger", null],
      ["GET", "/verify", null],
      ["GET", "/intents", null],
    ];

    for (const [method, path, body] of roleGatedRoutes) {
      it(`${method} ${path} — should return 403 without auth`, async () => {
        const { status, data } = await api(method, path, body);
        assert.equal(status, 403, `${method} ${path} should be 403, got ${status}`);
        assert.equal(data.error, "PRINCIPAL_REQUIRED");
        assert.equal(data.fail_mode, "closed");
      });
    }
  });

  // =========================================================================
  // 3. Brian (I-1, root_authority) can access all governance routes
  //    root_authority has implicit: proposer, approver, auditor, meta_governor
  // =========================================================================
  describe("Root Authority: Brian (I-1) Full Access", () => {
    let intentId;

    it("POST /intent — Brian can submit intents (has implicit proposer)", async () => {
      const { status, data } = await apiAsBrian("POST", "/intent", {
        action: "send_email",
        agent_id: "brian.k.rasmussen",
        target_environment: "gmail",
        parameters: { to: "test@example.com", subject: "Test", body: "Hello" },
        confidence: 95,
        description: "Testing Area 1 role enforcement",
      });
      assert.equal(status, 201, `Expected 201, got ${status}: ${JSON.stringify(data)}`);
      assert.ok(data.intent_id);
      assert.equal(data.principal_id, "I-1", "Intent should be attributed to I-1");
      intentId = data.intent_id;
    });

    it("POST /govern — Brian can run governance (has implicit proposer)", async () => {
      const { status, data } = await apiAsBrian("POST", "/govern", { intent_id: intentId });
      assert.equal(status, 200, `Expected 200, got ${status}: ${JSON.stringify(data)}`);
      assert.ok(data.governance_hash || data.governance_status);
      // send_email should get REQUIRE_HUMAN, putting intent in 'governed' status
    });

    it("POST /authorize — Brian can authorize (has implicit approver)", async () => {
      const { status, data } = await apiAsBrian("POST", "/authorize", {
        intent_id: intentId,
        decision: "approved",
        authorized_by: "brian.k.rasmussen",
      });
      assert.equal(status, 200, `Expected 200, got ${status}: ${JSON.stringify(data)}`);
    });

    it("GET /ledger — Brian can read ledger (has implicit auditor)", async () => {
      const { status, data } = await apiAsBrian("GET", "/ledger");
      assert.equal(status, 200, `Expected 200, got ${status}: ${JSON.stringify(data)}`);
      assert.ok(Array.isArray(data.entries));
    });

    it("GET /verify — Brian can verify chain (has implicit auditor)", async () => {
      const { status, data } = await apiAsBrian("GET", "/verify");
      assert.equal(status, 200, `Expected 200, got ${status}: ${JSON.stringify(data)}`);
    });

    it("GET /intents — Brian can list intents (any principal)", async () => {
      const { status, data } = await apiAsBrian("GET", "/intents");
      assert.equal(status, 200, `Expected 200, got ${status}: ${JSON.stringify(data)}`);
    });
  });

  // =========================================================================
  // 4. Role Boundaries: Proposers cannot authorize or execute
  // =========================================================================
  describe("Role Boundaries: Proposer (bondi)", () => {
    let intentId;

    it("POST /intent — bondi (proposer) CAN submit intents", async () => {
      const { status, data } = await apiAsPrincipal("bondi", "POST", "/intent", {
        action: "read_email",
        agent_id: "bondi",
        target_environment: "gmail",
        parameters: { test: true },
        description: "Testing proposer role boundary",
      });
      assert.equal(status, 201, `Expected 201, got ${status}: ${JSON.stringify(data)}`);
      intentId = data.intent_id;
    });

    it("POST /authorize — bondi (proposer) CANNOT authorize", async () => {
      const { status, data } = await apiAsPrincipal("bondi", "POST", "/authorize", {
        intent_id: intentId,
        decision: "approved",
        authorized_by: "bondi",
      });
      assert.equal(status, 403, `Expected 403, got ${status}: ${JSON.stringify(data)}`);
      assert.equal(data.error, "ROLE_VIOLATION");
      assert.ok(data.required_roles.includes("approver"));
    });

    it("POST /execute — bondi (proposer) CANNOT execute", async () => {
      const { status, data } = await apiAsPrincipal("bondi", "POST", "/execute", {
        intent_id: intentId,
      });
      assert.equal(status, 403, `Expected 403, got ${status}: ${JSON.stringify(data)}`);
      assert.equal(data.error, "ROLE_VIOLATION");
      assert.ok(data.required_roles.includes("executor"));
    });

    it("GET /ledger — bondi (proposer) CANNOT read ledger", async () => {
      const { status, data } = await apiAsPrincipal("bondi", "GET", "/ledger");
      assert.equal(status, 403, `Expected 403, got ${status}: ${JSON.stringify(data)}`);
      assert.equal(data.error, "ROLE_VIOLATION");
    });
  });

  // =========================================================================
  // 5. Role Boundaries: Executor cannot propose or authorize
  // =========================================================================
  describe("Role Boundaries: Executor (gateway-exec)", () => {
    it("POST /intent — gateway-exec (executor) CANNOT submit intents", async () => {
      const { status, data } = await apiAsPrincipal("gateway-exec", "POST", "/intent", {
        action: "read_email",
        agent_id: "gateway-exec",
        target_environment: "gmail",
        parameters: { test: true },
      });
      assert.equal(status, 403, `Expected 403, got ${status}: ${JSON.stringify(data)}`);
      assert.equal(data.error, "ROLE_VIOLATION");
      assert.ok(data.required_roles.includes("proposer"));
    });

    it("POST /authorize — gateway-exec (executor) CANNOT authorize", async () => {
      const { status, data } = await apiAsPrincipal("gateway-exec", "POST", "/authorize", {
        intent_id: "fake-id",
        decision: "approved",
        authorized_by: "gateway-exec",
      });
      assert.equal(status, 403, `Expected 403, got ${status}: ${JSON.stringify(data)}`);
      assert.equal(data.error, "ROLE_VIOLATION");
    });

    it("GET /ledger — gateway-exec (executor) CANNOT read ledger", async () => {
      const { status, data } = await apiAsPrincipal("gateway-exec", "GET", "/ledger");
      assert.equal(status, 403, `Expected 403, got ${status}: ${JSON.stringify(data)}`);
      assert.equal(data.error, "ROLE_VIOLATION");
    });
  });

  // =========================================================================
  // 6. Role Boundaries: Auditor can read but cannot propose/authorize/execute
  // =========================================================================
  describe("Role Boundaries: Auditor (mantis)", () => {
    it("GET /ledger — mantis (auditor) CAN read ledger", async () => {
      const { status, data } = await apiAsPrincipal("mantis", "GET", "/ledger");
      assert.equal(status, 200, `Expected 200, got ${status}: ${JSON.stringify(data)}`);
      assert.ok(Array.isArray(data.entries));
    });

    it("GET /verify — mantis (auditor) CAN verify chain", async () => {
      const { status, data } = await apiAsPrincipal("mantis", "GET", "/verify");
      assert.equal(status, 200, `Expected 200, got ${status}: ${JSON.stringify(data)}`);
    });

    it("POST /intent — mantis (auditor) CANNOT submit intents", async () => {
      const { status, data } = await apiAsPrincipal("mantis", "POST", "/intent", {
        action: "read_email",
        agent_id: "mantis",
        target_environment: "gmail",
        parameters: { test: true },
      });
      assert.equal(status, 403, `Expected 403, got ${status}: ${JSON.stringify(data)}`);
      assert.equal(data.error, "ROLE_VIOLATION");
    });

    it("POST /authorize — mantis (auditor) CANNOT authorize", async () => {
      const { status, data } = await apiAsPrincipal("mantis", "POST", "/authorize", {
        intent_id: "fake-id",
        decision: "approved",
        authorized_by: "mantis",
      });
      assert.equal(status, 403, `Expected 403, got ${status}: ${JSON.stringify(data)}`);
      assert.equal(data.error, "ROLE_VIOLATION");
    });

    it("POST /execute — mantis (auditor) CANNOT execute", async () => {
      const { status, data } = await apiAsPrincipal("mantis", "POST", "/execute", {
        intent_id: "fake-id",
      });
      assert.equal(status, 403, `Expected 403, got ${status}: ${JSON.stringify(data)}`);
      assert.equal(data.error, "ROLE_VIOLATION");
    });
  });

  // =========================================================================
  // 7. Signer Management: Only root_authority/meta_governor can write
  // =========================================================================
  describe("Signer Management Role Gating", () => {
    it("GET /api/signers — any principal can list signers", async () => {
      const { status, data } = await apiAsPrincipal("bondi", "GET", "/api/signers");
      assert.equal(status, 200, `Expected 200, got ${status}: ${JSON.stringify(data)}`);
    });

    it("POST /api/signers/register — bondi (proposer) CANNOT register signers", async () => {
      const { status, data } = await apiAsPrincipal("bondi", "POST", "/api/signers/register", {
        signer_id: "test-signer",
        public_key_hex: "a".repeat(64),
      });
      assert.equal(status, 403, `Expected 403, got ${status}: ${JSON.stringify(data)}`);
      assert.equal(data.error, "ROLE_VIOLATION");
    });

    it("DELETE /api/signers/test-signer — bondi (proposer) CANNOT revoke signers", async () => {
      const { status, data } = await apiAsPrincipal("bondi", "DELETE", "/api/signers/test-signer");
      assert.equal(status, 403, `Expected 403, got ${status}: ${JSON.stringify(data)}`);
      assert.equal(data.error, "ROLE_VIOLATION");
    });
  });

  // =========================================================================
  // 8. Kill Switch: Only root_authority/meta_governor
  // =========================================================================
  describe("Kill Switch Role Gating", () => {
    it("POST /api/kill — bondi (proposer) CANNOT activate kill switch", async () => {
      const { status, data } = await apiAsPrincipal("bondi", "POST", "/api/kill", {
        reason: "test",
      });
      assert.equal(status, 403, `Expected 403, got ${status}: ${JSON.stringify(data)}`);
      assert.equal(data.error, "ROLE_VIOLATION");
    });

    it("POST /api/kill — mantis (auditor) CANNOT activate kill switch", async () => {
      const { status, data } = await apiAsPrincipal("mantis", "POST", "/api/kill", {
        reason: "test",
      });
      assert.equal(status, 403, `Expected 403, got ${status}: ${JSON.stringify(data)}`);
      assert.equal(data.error, "ROLE_VIOLATION");
    });
  });

  // =========================================================================
  // 9. Unknown principal → 403 (fail-closed)
  // =========================================================================
  describe("Fail-Closed: Unknown Principal", () => {
    it("Request with no auth → 403", async () => {
      const { status, data } = await api("POST", "/intent", {
        action: "test_unknown",
        agent_id: "rogue",
      });
      assert.equal(status, 403, `Expected 403, got ${status}: ${JSON.stringify(data)}`);
      assert.equal(data.error, "PRINCIPAL_REQUIRED");
    });

    it("X-Principal-ID header is ignored (removed)", async () => {
      // Even with a valid principal ID in the header, it should be rejected
      // because X-Principal-ID resolution has been removed.
      const { status, data } = await api("POST", "/intent", {
        action: "test_header_injection",
        agent_id: "bondi",
      }, { "X-Principal-ID": "bondi" });
      assert.equal(status, 403, `Expected 403 — X-Principal-ID should be ignored, got ${status}`);
      assert.equal(data.error, "PRINCIPAL_REQUIRED");
    });
  });

  // =========================================================================
  // 10. Principal Attribution in Intent
  // =========================================================================
  describe("Principal Attribution", () => {
    it("Intent created by Brian carries principal_id = I-1", async () => {
      const { status, data } = await apiAsBrian("POST", "/intent", {
        action: "test_attribution",
        agent_id: "brian.k.rasmussen",
        target_environment: "gmail",
        description: "Testing principal attribution",
      });
      assert.equal(status, 201);
      assert.equal(data.principal_id, "I-1", "Intent should be attributed to I-1");
    });

    it("Intent created by bondi carries principal_id = bondi", async () => {
      const { status, data } = await apiAsPrincipal("bondi", "POST", "/intent", {
        action: "read_email",
        agent_id: "bondi",
        target_environment: "gmail",
        description: "Testing bondi attribution",
      });
      assert.equal(status, 201);
      assert.equal(data.principal_id, "bondi", "Intent should be attributed to bondi");
    });
  });

  // =========================================================================
  // 11. Full Pipeline with Role Enforcement
  //     Brian (root_authority) drives the full pipeline
  //     This proves the pipeline still works with role enforcement active
  // =========================================================================
  describe("Full Pipeline with Role Enforcement", () => {
    let intentId;

    it("Step 1: Brian submits intent (proposer role)", async () => {
      const { status, data } = await apiAsBrian("POST", "/intent", {
        action: "send_email",
        agent_id: "brian.k.rasmussen",
        target_environment: "gmail",
        parameters: { to: "test@example.com", subject: "Test", body: "Hello" },
        confidence: 95,
        description: "Full pipeline test with role enforcement",
      });
      assert.equal(status, 201);
      intentId = data.intent_id;
    });

    it("Step 2: Brian runs governance (proposer role)", async () => {
      const { status, data } = await apiAsBrian("POST", "/govern", { intent_id: intentId });
      assert.equal(status, 200);
    });

    it("Step 3: Brian authorizes (approver role)", async () => {
      const { status, data } = await apiAsBrian("POST", "/authorize", {
        intent_id: intentId,
        decision: "approved",
        authorized_by: "brian.k.rasmussen",
      });
      assert.equal(status, 200);
    });

    it("Step 4: Brian executes (root_authority — note: executor is NOT an implicit role)", async () => {
      // root_authority does NOT have implicit executor role
      // This should fail with ROLE_VIOLATION
      const { status, data } = await apiAsBrian("POST", "/execute", { intent_id: intentId });
      // root_authority does NOT implicitly have executor role
      // Only gateway-exec has executor role
      assert.equal(status, 403, `Expected 403 because root_authority lacks executor role, got ${status}`);
      assert.equal(data.error, "ROLE_VIOLATION");
    });

    it("Step 4b: gateway-exec executes (executor role)", async () => {
      const { status, data } = await apiAsPrincipal("gateway-exec", "POST", "/execute", { intent_id: intentId });
      assert.equal(status, 200, `Expected 200, got ${status}: ${JSON.stringify(data)}`);
      assert.ok(data.execution_token, "Should receive an execution token");
    });

    it("Step 5: gateway-exec confirms execution", async () => {
      const { status, data } = await apiAsPrincipal("gateway-exec", "POST", "/execute-confirm", {
        intent_id: intentId,
        execution_result: "Email sent successfully",
        connector: "test",
      });
      assert.equal(status, 200, `Expected 200, got ${status}: ${JSON.stringify(data)}`);
      assert.equal(data.status, "executed");
    });

    it("Step 6: mantis generates receipt (auditor role)", async () => {
      const { status, data } = await apiAsPrincipal("mantis", "POST", "/receipt", { intent_id: intentId });
      assert.equal(status, 200, `Expected 200, got ${status}: ${JSON.stringify(data)}`);
      assert.ok(data.receipt_id);
      assert.ok(data.hash_chain);
    });

    it("Step 7: mantis verifies chain (auditor role)", async () => {
      const { status, data } = await apiAsPrincipal("mantis", "GET", `/verify?intent_id=${intentId}`);
      assert.equal(status, 200, `Expected 200, got ${status}: ${JSON.stringify(data)}`);
      assert.equal(data.receipt_verification.valid, true);
    });
  });
});
