/**
 * RIO Gateway Tests
 *
 * Tests the full governance pipeline:
 *   Intent → Governance → Authorization → Execution → Receipt → Verification
 *
 * Also tests fail-closed behavior:
 *   - Execution without authorization → blocked
 *   - Denied intent → blocked
 *   - Unknown agent → blocked
 */
import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";

const BASE = "http://localhost:4401";
let server;

// Helper to make requests
async function api(method, path, body) {
  const opts = {
    method,
    headers: { "Content-Type": "application/json" },
  };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(`${BASE}${path}`, opts);
  const data = await res.json();
  return { status: res.status, data };
}

describe("RIO Governance Gateway", () => {
  before(async () => {
    // Start the server on a test port
    process.env.RIO_GATEWAY_PORT = "4401";
    await import("../server.mjs");
    // Give the server a moment to start
    await new Promise((r) => setTimeout(r, 500));
  });

  // =========================================================================
  // Health Check
  // =========================================================================
  describe("GET /health", () => {
    it("should return operational status", async () => {
      const { status, data } = await api("GET", "/health");
      assert.equal(status, 200);
      assert.equal(data.status, "operational");
      assert.equal(data.governance.constitution_loaded, true);
      assert.equal(data.governance.policy_loaded, true);
      assert.equal(data.fail_mode, "closed");
    });
  });

  // =========================================================================
  // Full Pipeline — Happy Path
  // =========================================================================
  describe("Full Pipeline (Happy Path)", () => {
    let intentId;

    it("POST /intent — should submit an intent", async () => {
      const { status, data } = await api("POST", "/intent", {
        action: "send_email",
        agent_id: "MANUS",
        target_environment: "dev",
        parameters: { to: "test@example.com", subject: "Test", body: "Hello" },
        confidence: 95,
        description: "Send a test email",
      });
      assert.equal(status, 201);
      assert.ok(data.intent_id);
      assert.equal(data.status, "submitted");
      assert.ok(data.intent_hash);
      intentId = data.intent_id;
    });

    it("POST /govern — should evaluate governance", async () => {
      const { status, data } = await api("POST", "/govern", { intent_id: intentId });
      assert.equal(status, 200);
      assert.equal(data.intent_id, intentId);
      // send_email has external effect → requires approval
      assert.equal(data.requires_approval, true);
      assert.ok(data.governance_hash);
    });

    it("POST /authorize — should record human approval", async () => {
      const { status, data } = await api("POST", "/authorize", {
        intent_id: intentId,
        decision: "approved",
        authorized_by: "brian.rasmussen",
      });
      assert.equal(status, 200);
      assert.equal(data.authorization_status, "authorized");
      assert.ok(data.authorization_hash);
    });

    it("POST /execute — should execute the action", async () => {
      const { status, data } = await api("POST", "/execute", { intent_id: intentId });
      assert.equal(status, 200);
      assert.equal(data.status, "executed");
      assert.ok(data.execution_hash);
    });

    it("POST /receipt — should generate a receipt", async () => {
      const { status, data } = await api("POST", "/receipt", { intent_id: intentId });
      assert.equal(status, 200);
      assert.ok(data.receipt_id);
      assert.ok(data.hash_chain);
      assert.ok(data.hash_chain.intent_hash);
      assert.ok(data.hash_chain.governance_hash);
      assert.ok(data.hash_chain.authorization_hash);
      assert.ok(data.hash_chain.execution_hash);
      assert.ok(data.hash_chain.receipt_hash);
      assert.equal(data.verification.chain_length, 5);
    });

    it("GET /verify — should verify the receipt and chain", async () => {
      const { status, data } = await api("GET", `/verify?intent_id=${intentId}`);
      assert.equal(status, 200);
      assert.equal(data.receipt_verification.valid, true);
      assert.equal(data.ledger_chain_verification.valid, true);
    });

    it("GET /intent/:id — should show full pipeline state", async () => {
      const { status, data } = await api("GET", `/intent/${intentId}`);
      assert.equal(status, 200);
      assert.equal(data.status, "receipted");
      assert.ok(data.governance);
      assert.ok(data.authorization);
      assert.ok(data.execution);
      assert.ok(data.receipt);
    });
  });

  // =========================================================================
  // Fail Closed — Execution Without Authorization
  // =========================================================================
  describe("Fail Closed — No Authorization", () => {
    let intentId;

    it("should block execution of a submitted (ungoverned) intent", async () => {
      const { data: intent } = await api("POST", "/intent", {
        action: "delete_file",
        agent_id: "MANUS",
        parameters: { path: "/important.txt" },
      });
      intentId = intent.intent_id;

      const { status, data } = await api("POST", "/execute", { intent_id: intentId });
      assert.equal(status, 403);
      assert.equal(data.status, "blocked");
    });
  });

  // =========================================================================
  // Fail Closed — Denied Intent
  // =========================================================================
  describe("Fail Closed — Denied Intent", () => {
    let intentId;

    it("should block execution of a denied intent", async () => {
      // Submit
      const { data: intent } = await api("POST", "/intent", {
        action: "deploy_production",
        agent_id: "MANUS",
        target_environment: "production",
        confidence: 90,
      });
      intentId = intent.intent_id;

      // Govern
      await api("POST", "/govern", { intent_id: intentId });

      // Deny
      await api("POST", "/authorize", {
        intent_id: intentId,
        decision: "denied",
        authorized_by: "brian.rasmussen",
      });

      // Try to execute
      const { status, data } = await api("POST", "/execute", { intent_id: intentId });
      assert.equal(status, 403);
      assert.equal(data.status, "blocked");
    });
  });

  // =========================================================================
  // Fail Closed — Unknown Agent
  // =========================================================================
  describe("Fail Closed — Unknown Agent", () => {
    it("should block governance for an unknown agent", async () => {
      const { data: intent } = await api("POST", "/intent", {
        action: "send_email",
        agent_id: "ROGUE_AI",
        target_environment: "production",
      });

      const { status, data } = await api("POST", "/govern", { intent_id: intent.intent_id });
      assert.equal(status, 200);
      assert.equal(data.governance_status, "blocked");
    });
  });

  // =========================================================================
  // Ledger Integrity
  // =========================================================================
  describe("Ledger", () => {
    it("GET /ledger — should return entries", async () => {
      const { status, data } = await api("GET", "/ledger");
      assert.equal(status, 200);
      assert.ok(Array.isArray(data.entries));
      assert.ok(data.total > 0);
      assert.ok(data.chain_tip);
    });

    it("GET /verify — full chain should be valid", async () => {
      const { status, data } = await api("GET", "/verify");
      assert.equal(status, 200);
      assert.equal(data.ledger_chain_verification.valid, true);
    });
  });
});
