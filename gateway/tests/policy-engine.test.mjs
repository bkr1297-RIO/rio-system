/**
 * RIO Policy Evaluation Engine — Tests
 *
 * Area 2: Policy Evaluation Engine
 *
 * Tests the pure evaluation function, pattern matching, condition evaluation,
 * risk tiers, governance decisions, system mode overrides, TTL expiration,
 * policy versioning, and full pipeline integration.
 *
 * Run: node --test tests/policy-engine.test.mjs
 */

import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

// ─── Unit Tests: Pattern Matching ───────────────────────────────────

import { matchPattern, evaluateConditions, evaluatePolicy, computeGovernanceHash, isApprovalExpired } from "../governance/policy-engine.mjs";

describe("Pattern Matching", () => {
  it("matches exact action names", () => {
    assert.ok(matchPattern("send_email", "send_email"));
    assert.ok(!matchPattern("send_email", "send_sms"));
  });

  it("matches prefix patterns with _*", () => {
    assert.ok(matchPattern("send_email", "send_*"));
    assert.ok(matchPattern("send_payment", "send_*"));
    assert.ok(!matchPattern("read_email", "send_*"));
  });

  it("matches OR patterns with |", () => {
    assert.ok(matchPattern("read_email", "read_*|list_*"));
    assert.ok(matchPattern("list_files", "read_*|list_*"));
    assert.ok(!matchPattern("send_email", "read_*|list_*"));
  });

  it("matches wildcard *", () => {
    assert.ok(matchPattern("anything", "*"));
    assert.ok(matchPattern("send_email", "*"));
  });

  it("returns false for null/empty inputs", () => {
    assert.ok(!matchPattern(null, "send_*"));
    assert.ok(!matchPattern("send_email", null));
    assert.ok(!matchPattern("", "send_*"));
    assert.ok(!matchPattern("send_email", ""));
  });

  it("matches complex multi-prefix patterns", () => {
    const pattern = "design_*|write_code_*|refactor_*|document_*|prepare_*|stage_*|simulate_*|ask_*|configure_dev_*|configure_staging_*|run_non_destructive_*";
    assert.ok(matchPattern("design_system", pattern));
    assert.ok(matchPattern("write_code_feature", pattern));
    assert.ok(matchPattern("prepare_release", pattern));
    assert.ok(!matchPattern("deploy_production", pattern));
  });
});

// ─── Unit Tests: Condition Evaluation ───────────────────────────────

describe("Condition Evaluation", () => {
  it("returns true when no conditions", () => {
    assert.ok(evaluateConditions({}, null));
    assert.ok(evaluateConditions({}, {}));
    assert.ok(evaluateConditions({}, undefined));
  });

  it("checks attachment_count.max", () => {
    const conditions = { attachment_count: { max: 3 } };
    assert.ok(evaluateConditions({ parameters: { attachment_count: 2 } }, conditions));
    assert.ok(!evaluateConditions({ parameters: { attachment_count: 5 } }, conditions));
  });

  it("checks body_length.max", () => {
    const conditions = { body_length: { max: 100 } };
    assert.ok(evaluateConditions({ parameters: { body: "short" } }, conditions));
    assert.ok(!evaluateConditions({ parameters: { body: "x".repeat(200) } }, conditions));
  });

  it("checks confidence.min", () => {
    const conditions = { confidence: { min: 80 } };
    assert.ok(evaluateConditions({ confidence: 90 }, conditions));
    assert.ok(!evaluateConditions({ confidence: 50 }, conditions));
  });

  it("checks recipient_in with known contacts", () => {
    const conditions = { recipient_in: "known_contacts" };
    assert.ok(evaluateConditions(
      { parameters: { to: "alice@example.com", _known_contacts: ["alice@example.com"] } },
      conditions
    ));
    assert.ok(!evaluateConditions(
      { parameters: { to: "stranger@example.com", _known_contacts: ["alice@example.com"] } },
      conditions
    ));
  });
});

// ─── Unit Tests: Policy Evaluation ──────────────────────────────────

// Load the genesis policy for testing
const genesisPolicy = JSON.parse(
  readFileSync(join(__dirname, "..", "config", "rio", "policy-v2.json"), "utf-8")
);
// Give it a fake hash for testing
genesisPolicy.policy_hash = "test_hash_abc123";
genesisPolicy.status = "active";

describe("Policy Evaluation — Risk Tiers", () => {
  it("classifies read operations as NONE risk / AUTO_APPROVE", () => {
    const result = evaluatePolicy(
      { action: "read_email", agent_id: "bondi", confidence: 90 },
      genesisPolicy
    );
    assert.equal(result.risk_tier, "NONE");
    assert.equal(result.governance_decision, "AUTO_APPROVE");
    assert.equal(result.matched_class, "read_operations");
  });

  it("classifies draft operations as LOW risk / AUTO_APPROVE", () => {
    const result = evaluatePolicy(
      { action: "draft_email", agent_id: "bondi", confidence: 90 },
      genesisPolicy
    );
    assert.equal(result.risk_tier, "LOW");
    assert.equal(result.governance_decision, "AUTO_APPROVE");
    assert.equal(result.matched_class, "draft_operations");
  });

  it("classifies design operations as LOW risk / AUTO_APPROVE", () => {
    const result = evaluatePolicy(
      { action: "design_system", agent_id: "manny", confidence: 90 },
      genesisPolicy
    );
    assert.equal(result.risk_tier, "LOW");
    assert.equal(result.governance_decision, "AUTO_APPROVE");
    assert.equal(result.matched_class, "design_operations");
  });

  it("classifies send_email as MEDIUM risk / REQUIRE_HUMAN", () => {
    const result = evaluatePolicy(
      {
        action: "send_email",
        agent_id: "bondi",
        confidence: 90,
        parameters: { to: "alice@example.com", _known_contacts: ["alice@example.com"] },
      },
      genesisPolicy
    );
    assert.equal(result.risk_tier, "MEDIUM");
    assert.equal(result.governance_decision, "REQUIRE_HUMAN");
    assert.equal(result.requires_approval, true);
  });

  it("classifies deploy operations as HIGH risk / REQUIRE_HUMAN", () => {
    const result = evaluatePolicy(
      { action: "deploy_production", agent_id: "bondi", confidence: 90 },
      genesisPolicy
    );
    assert.equal(result.risk_tier, "HIGH");
    assert.equal(result.governance_decision, "REQUIRE_HUMAN");
  });

  it("classifies destructive operations as CRITICAL risk / REQUIRE_HUMAN", () => {
    const result = evaluatePolicy(
      { action: "delete_repository", agent_id: "bondi", confidence: 90 },
      genesisPolicy
    );
    assert.equal(result.risk_tier, "CRITICAL");
    assert.equal(result.governance_decision, "REQUIRE_HUMAN");
  });

  it("classifies policy changes as CRITICAL risk / REQUIRE_QUORUM", () => {
    const result = evaluatePolicy(
      { action: "change_policy", agent_id: "brian.k.rasmussen", confidence: 90 },
      genesisPolicy
    );
    assert.equal(result.risk_tier, "CRITICAL");
    assert.equal(result.governance_decision, "REQUIRE_QUORUM");
    assert.equal(result.approval_requirement.approvals_required, 2);
  });
});

describe("Policy Evaluation — AUTO_DENY (Invariant Violations)", () => {
  it("denies self_authorize", () => {
    const result = evaluatePolicy(
      { action: "self_authorize", agent_id: "bondi", confidence: 100 },
      genesisPolicy
    );
    assert.equal(result.governance_decision, "AUTO_DENY");
    assert.equal(result.status, "blocked");
  });

  it("denies bypass_governance", () => {
    const result = evaluatePolicy(
      { action: "bypass_governance", agent_id: "manny", confidence: 100 },
      genesisPolicy
    );
    assert.equal(result.governance_decision, "AUTO_DENY");
  });

  it("denies execute_without_approval", () => {
    const result = evaluatePolicy(
      { action: "execute_without_approval", agent_id: "bondi", confidence: 100 },
      genesisPolicy
    );
    assert.equal(result.governance_decision, "AUTO_DENY");
  });
});

describe("Policy Evaluation — Fail-Closed Defaults", () => {
  it("rejects when no policy is provided", () => {
    const result = evaluatePolicy(
      { action: "read_email", agent_id: "bondi" },
      null
    );
    assert.equal(result.governance_decision, "AUTO_DENY");
    assert.equal(result.risk_tier, "CRITICAL");
  });

  it("rejects unknown actions with REQUIRE_HUMAN + HIGH", () => {
    const result = evaluatePolicy(
      { action: "unknown_action_xyz", agent_id: "bondi", confidence: 90 },
      genesisPolicy
    );
    assert.equal(result.governance_decision, "REQUIRE_HUMAN");
    assert.equal(result.risk_tier, "HIGH");
    assert.equal(result.matched_class, "default");
  });

  it("rejects unknown agents", () => {
    const result = evaluatePolicy(
      { action: "read_email", agent_id: "unknown_agent", confidence: 90 },
      genesisPolicy
    );
    assert.equal(result.governance_decision, "AUTO_DENY");
    assert.equal(result.risk_tier, "CRITICAL");
  });

  it("rejects inactive policy", () => {
    const inactivePolicy = { ...genesisPolicy, status: "superseded" };
    const result = evaluatePolicy(
      { action: "read_email", agent_id: "bondi" },
      inactivePolicy
    );
    assert.equal(result.governance_decision, "AUTO_DENY");
  });
});

describe("Policy Evaluation — Confidence Threshold", () => {
  it("upgrades AUTO_APPROVE to REQUIRE_HUMAN when confidence < 80", () => {
    const result = evaluatePolicy(
      { action: "read_email", agent_id: "bondi", confidence: 50 },
      genesisPolicy
    );
    assert.equal(result.governance_decision, "REQUIRE_HUMAN");
    assert.equal(result.risk_tier, "NONE"); // Risk tier stays the same
    const confCheck = result.checks.find(c => c.check === "confidence_threshold");
    assert.ok(confCheck);
    assert.equal(confCheck.passed, false);
  });

  it("keeps AUTO_APPROVE when confidence >= 80", () => {
    const result = evaluatePolicy(
      { action: "read_email", agent_id: "bondi", confidence: 85 },
      genesisPolicy
    );
    assert.equal(result.governance_decision, "AUTO_APPROVE");
  });
});

describe("Policy Evaluation — System Mode Overrides", () => {
  it("ELEVATED mode overrides AUTO_APPROVE to REQUIRE_HUMAN", () => {
    const result = evaluatePolicy(
      { action: "read_email", agent_id: "bondi", confidence: 90 },
      genesisPolicy,
      { systemMode: "ELEVATED" }
    );
    assert.equal(result.governance_decision, "REQUIRE_HUMAN");
    const modeCheck = result.checks.find(c => c.check === "system_mode_override");
    assert.ok(modeCheck);
    assert.equal(modeCheck.original_decision, "AUTO_APPROVE");
  });

  it("ELEVATED mode does NOT override AUTO_DENY", () => {
    const result = evaluatePolicy(
      { action: "self_authorize", agent_id: "bondi", confidence: 100 },
      genesisPolicy,
      { systemMode: "ELEVATED" }
    );
    assert.equal(result.governance_decision, "AUTO_DENY");
  });

  it("LOCKDOWN mode restricts approvers to root_authority only", () => {
    const result = evaluatePolicy(
      { action: "read_email", agent_id: "bondi", confidence: 90 },
      genesisPolicy,
      { systemMode: "LOCKDOWN" }
    );
    assert.equal(result.governance_decision, "REQUIRE_HUMAN");
    assert.deepEqual(result.approval_requirement.required_roles, ["root_authority"]);
  });

  it("MAINTENANCE mode pauses execution", () => {
    const result = evaluatePolicy(
      { action: "read_email", agent_id: "bondi", confidence: 90 },
      genesisPolicy,
      { systemMode: "MAINTENANCE" }
    );
    assert.equal(result.governance_decision, "MAINTENANCE_PAUSED");
  });

  it("NORMAL mode allows AUTO_APPROVE", () => {
    const result = evaluatePolicy(
      { action: "read_email", agent_id: "bondi", confidence: 90 },
      genesisPolicy,
      { systemMode: "NORMAL" }
    );
    assert.equal(result.governance_decision, "AUTO_APPROVE");
  });
});

describe("Policy Evaluation — Approval Requirements", () => {
  it("AUTO_APPROVE requires 0 approvals", () => {
    const result = evaluatePolicy(
      { action: "read_email", agent_id: "bondi", confidence: 90 },
      genesisPolicy
    );
    assert.equal(result.approval_requirement.approvals_required, 0);
  });

  it("REQUIRE_HUMAN requires 1 approval from approver or root_authority", () => {
    const result = evaluatePolicy(
      { action: "deploy_production", agent_id: "bondi", confidence: 90 },
      genesisPolicy
    );
    assert.equal(result.approval_requirement.approvals_required, 1);
    assert.ok(result.approval_requirement.required_roles.includes("approver"));
    assert.ok(result.approval_requirement.required_roles.includes("root_authority"));
  });

  it("REQUIRE_QUORUM requires 2-of-3 from meta_governor or root_authority", () => {
    const result = evaluatePolicy(
      { action: "change_policy", agent_id: "brian.k.rasmussen", confidence: 90 },
      genesisPolicy
    );
    assert.equal(result.approval_requirement.approvals_required, 2);
    assert.equal(result.approval_requirement.quorum_size, 3);
    assert.ok(result.approval_requirement.required_roles.includes("meta_governor"));
  });

  it("AUTO_DENY has -1 approvals (no approval path)", () => {
    const result = evaluatePolicy(
      { action: "self_authorize", agent_id: "bondi", confidence: 100 },
      genesisPolicy
    );
    assert.equal(result.approval_requirement.approvals_required, -1);
  });
});

describe("Policy Evaluation — Approval TTL", () => {
  it("NONE risk has no TTL", () => {
    const result = evaluatePolicy(
      { action: "read_email", agent_id: "bondi", confidence: 90 },
      genesisPolicy
    );
    assert.equal(result.approval_ttl, null);
  });

  it("MEDIUM risk has 3600s TTL", () => {
    const result = evaluatePolicy(
      {
        action: "send_email",
        agent_id: "bondi",
        confidence: 90,
        parameters: { to: "alice@example.com", _known_contacts: ["alice@example.com"] },
      },
      genesisPolicy
    );
    assert.equal(result.approval_ttl, 3600);
  });

  it("HIGH risk has 1800s TTL", () => {
    const result = evaluatePolicy(
      { action: "deploy_production", agent_id: "bondi", confidence: 90 },
      genesisPolicy
    );
    assert.equal(result.approval_ttl, 1800);
  });

  it("CRITICAL risk has 900s TTL", () => {
    const result = evaluatePolicy(
      { action: "delete_repository", agent_id: "bondi", confidence: 90 },
      genesisPolicy
    );
    assert.equal(result.approval_ttl, 900);
  });
});

describe("Approval Expiration Helper", () => {
  it("returns false when no TTL", () => {
    assert.ok(!isApprovalExpired("2026-04-04T00:00:00Z", null));
  });

  it("returns false when within TTL", () => {
    const recentTimestamp = new Date(Date.now() - 100).toISOString();
    assert.ok(!isApprovalExpired(recentTimestamp, 3600));
  });

  it("returns true when past TTL", () => {
    const oldTimestamp = new Date(Date.now() - 5000).toISOString();
    assert.ok(isApprovalExpired(oldTimestamp, 1)); // 1 second TTL, 5 seconds ago
  });
});

describe("Governance Hash", () => {
  it("produces consistent hash for same inputs", () => {
    const params = {
      intent_hash: "abc123",
      policy_hash: "def456",
      policy_version: "2.0.0",
      governance_decision: "AUTO_APPROVE",
      risk_tier: "NONE",
      matched_class: "read_operations",
      timestamp: "2026-04-04T00:00:00Z",
    };
    const hash1 = computeGovernanceHash(params);
    const hash2 = computeGovernanceHash(params);
    assert.equal(hash1, hash2);
    assert.equal(hash1.length, 64); // SHA-256 hex
  });

  it("produces different hash for different inputs", () => {
    const hash1 = computeGovernanceHash({
      intent_hash: "abc123",
      policy_hash: "def456",
      policy_version: "2.0.0",
      governance_decision: "AUTO_APPROVE",
      risk_tier: "NONE",
      matched_class: "read_operations",
      timestamp: "2026-04-04T00:00:00Z",
    });
    const hash2 = computeGovernanceHash({
      intent_hash: "abc123",
      policy_hash: "def456",
      policy_version: "2.0.0",
      governance_decision: "REQUIRE_HUMAN",
      risk_tier: "HIGH",
      matched_class: "deploy_operations",
      timestamp: "2026-04-04T00:00:00Z",
    });
    assert.notEqual(hash1, hash2);
  });
});

describe("Policy Evaluation — Policy Version and Hash Tracking", () => {
  it("includes policy_version in the result", () => {
    const result = evaluatePolicy(
      { action: "read_email", agent_id: "bondi", confidence: 90 },
      genesisPolicy
    );
    assert.equal(result.policy_version, "2.0.0");
  });

  it("includes policy_hash in the result", () => {
    const result = evaluatePolicy(
      { action: "read_email", agent_id: "bondi", confidence: 90 },
      genesisPolicy
    );
    assert.equal(result.policy_hash, "test_hash_abc123");
  });
});

describe("Policy Evaluation — Action Class Priority (First Match Wins)", () => {
  it("send_email with known contact matches send_known_contact before send_generic", () => {
    const result = evaluatePolicy(
      {
        action: "send_email",
        agent_id: "bondi",
        confidence: 90,
        parameters: { to: "alice@example.com", _known_contacts: ["alice@example.com"] },
      },
      genesisPolicy
    );
    assert.equal(result.matched_class, "send_known_contact");
    assert.equal(result.risk_tier, "MEDIUM");
  });

  it("send_email with unknown contact matches send_new_contact", () => {
    const result = evaluatePolicy(
      {
        action: "send_email",
        agent_id: "bondi",
        confidence: 90,
        parameters: { to: "stranger@example.com", _known_contacts: ["alice@example.com"] },
      },
      genesisPolicy
    );
    assert.equal(result.matched_class, "send_new_contact");
    assert.equal(result.risk_tier, "HIGH");
  });
});

// ─── Integration Tests: Full Pipeline with Policy Engine ────────────

const TEST_PORT = 4403;
const BASE_URL = `http://localhost:${TEST_PORT}`;

// Helper: HTTP request
function request(method, path, body, token) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, BASE_URL);
    const options = {
      method,
      hostname: url.hostname,
      port: url.port,
      path: url.pathname,
      headers: { "Content-Type": "application/json" },
    };
    if (token) {
      options.headers["Authorization"] = `Bearer ${token}`;
    }
    const req = http.request(options, (res) => {
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => {
        try {
          resolve({ status: res.statusCode, body: JSON.parse(data) });
        } catch {
          resolve({ status: res.statusCode, body: data });
        }
      });
    });
    req.on("error", reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

// Helper: Login and get JWT
async function login(userId) {
  const passphrase = process.env.RIO_LOGIN_PASSPHRASE || "rio-governed-2026";
  const res = await request("POST", "/login", { user_id: userId, passphrase });
  return res.body.token;
}

describe("Integration: Policy Engine in Gateway Pipeline", () => {
  let server;
  let ownerToken; // brian.k.rasmussen = root_authority (implicit proposer, approver, auditor)

  before(async () => {
    // Start the gateway on test port
    process.env.RIO_GATEWAY_PORT = TEST_PORT;
    process.env.ED25519_MODE = "optional";
    process.env.PG_DATABASE = "rio_ledger_policy_test";

    // Dynamic import to start the server
    const mod = await import("../server.mjs");

    // Wait for server to be ready
    for (let i = 0; i < 30; i++) {
      try {
        const res = await request("GET", "/health");
        if (res.status === 200) break;
      } catch {}
      await new Promise((r) => setTimeout(r, 500));
    }

    // Login as brian.k.rasmussen (root_authority with implicit proposer/approver/auditor)
    ownerToken = await login("brian.k.rasmussen");
    assert.ok(ownerToken, "Login failed — no token returned");
  });

  after(() => {
    // Server will be killed by the test runner
    process.exit(0);
  });

  it("health endpoint shows policy v2 info", async () => {
    const res = await request("GET", "/health");
    assert.equal(res.status, 200);
    assert.ok(res.body.governance.policy_v2);
    assert.ok(res.body.governance.policy_v2.active);
    assert.equal(res.body.governance.policy_v2.version, "2.0.0");
    assert.ok(res.body.governance.policy_v2.action_classes > 0);
    assert.equal(res.body.governance.system_mode, "NORMAL");
  });

  it("read_email → AUTO_APPROVE (NONE risk, no approval needed)", async () => {
    // Submit intent
    const nonce1 = `nonce-${Date.now()}-1`;
    const submitRes = await request("POST", "/intent", {
      action: "read_email",
      agent_id: "bondi",
      target_environment: "gmail",
      parameters: { folder: "inbox" },
      confidence: 90,
      request_timestamp: new Date().toISOString(),
      request_nonce: nonce1,
    }, ownerToken);
    assert.equal(submitRes.status, 201, `Intent creation failed: ${JSON.stringify(submitRes.body)}`);
    const intentId = submitRes.body.intent_id;

    // Govern
    const nonce2 = `nonce-${Date.now()}-2`;
    const governRes = await request("POST", "/govern", {
      intent_id: intentId,
      request_timestamp: new Date().toISOString(),
      request_nonce: nonce2,
    }, ownerToken);
    assert.equal(governRes.status, 200);
    assert.equal(governRes.body.governance_decision, "AUTO_APPROVE", `Unexpected decision: ${JSON.stringify(governRes.body)}`);
    assert.equal(governRes.body.risk_tier, "NONE");
    assert.equal(governRes.body.matched_class, "read_operations");
    assert.ok(governRes.body.policy_version);
    assert.ok(governRes.body.policy_hash);
    assert.ok(governRes.body.governance_hash);
  });

  it("deploy_production → REQUIRE_HUMAN (HIGH risk, needs approval)", async () => {
    const nonce1 = `nonce-${Date.now()}-3`;
    const submitRes = await request("POST", "/intent", {
      action: "deploy_production",
      agent_id: "brian.k.rasmussen",
      target_environment: "github",
      parameters: {},
      confidence: 90,
      request_timestamp: new Date().toISOString(),
      request_nonce: nonce1,
    }, ownerToken);
    assert.equal(submitRes.status, 201, `Intent creation failed: ${JSON.stringify(submitRes.body)}`);
    const intentId = submitRes.body.intent_id;

    const nonce2 = `nonce-${Date.now()}-4`;
    const governRes = await request("POST", "/govern", {
      intent_id: intentId,
      request_timestamp: new Date().toISOString(),
      request_nonce: nonce2,
    }, ownerToken);
    assert.equal(governRes.status, 200);
    assert.equal(governRes.body.governance_decision, "REQUIRE_HUMAN");
    assert.equal(governRes.body.risk_tier, "HIGH");
    assert.equal(governRes.body.matched_class, "deploy_operations");
    assert.equal(governRes.body.requires_approval, true);
    assert.equal(governRes.body.approval_ttl, 1800);
  });

  it("self_authorize → AUTO_DENY (invariant violation, blocked)", async () => {
    const nonce1 = `nonce-${Date.now()}-5`;
    const submitRes = await request("POST", "/intent", {
      action: "self_authorize",
      agent_id: "brian.k.rasmussen",
      target_environment: "local",
      parameters: {},
      confidence: 100,
      request_timestamp: new Date().toISOString(),
      request_nonce: nonce1,
    }, ownerToken);
    assert.equal(submitRes.status, 201, `Intent creation failed: ${JSON.stringify(submitRes.body)}`);
    const intentId = submitRes.body.intent_id;

    const nonce2 = `nonce-${Date.now()}-6`;
    const governRes = await request("POST", "/govern", {
      intent_id: intentId,
      request_timestamp: new Date().toISOString(),
      request_nonce: nonce2,
    }, ownerToken);
    assert.equal(governRes.status, 200);
    assert.equal(governRes.body.governance_decision, "AUTO_DENY");
    assert.equal(governRes.body.risk_tier, "CRITICAL");
  });

  it("unknown action → REQUIRE_HUMAN + HIGH (fail-closed default)", async () => {
    const nonce1 = `nonce-${Date.now()}-7`;
    const submitRes = await request("POST", "/intent", {
      action: "completely_unknown_action",
      agent_id: "brian.k.rasmussen",
      target_environment: "local",
      parameters: {},
      confidence: 90,
      request_timestamp: new Date().toISOString(),
      request_nonce: nonce1,
    }, ownerToken);
    assert.equal(submitRes.status, 201, `Intent creation failed: ${JSON.stringify(submitRes.body)}`);
    const intentId = submitRes.body.intent_id;

    const nonce2 = `nonce-${Date.now()}-8`;
    const governRes = await request("POST", "/govern", {
      intent_id: intentId,
      request_timestamp: new Date().toISOString(),
      request_nonce: nonce2,
    }, ownerToken);
    assert.equal(governRes.status, 200);
    assert.equal(governRes.body.governance_decision, "REQUIRE_HUMAN");
    assert.equal(governRes.body.risk_tier, "HIGH");
    assert.equal(governRes.body.matched_class, "default");
  });

  it("change_policy → REQUIRE_QUORUM (2-of-3 meta-governance)", async () => {
    const nonce1 = `nonce-${Date.now()}-9`;
    const submitRes = await request("POST", "/intent", {
      action: "change_policy",
      agent_id: "brian.k.rasmussen",
      target_environment: "RIO",
      parameters: {},
      confidence: 95,
      request_timestamp: new Date().toISOString(),
      request_nonce: nonce1,
    }, ownerToken);
    assert.equal(submitRes.status, 201, `Intent creation failed: ${JSON.stringify(submitRes.body)}`);
    const intentId = submitRes.body.intent_id;

    const nonce2 = `nonce-${Date.now()}-10`;
    const governRes = await request("POST", "/govern", {
      intent_id: intentId,
      request_timestamp: new Date().toISOString(),
      request_nonce: nonce2,
    }, ownerToken);
    assert.equal(governRes.status, 200);
    assert.equal(governRes.body.governance_decision, "REQUIRE_QUORUM");
    assert.equal(governRes.body.risk_tier, "CRITICAL");
    assert.equal(governRes.body.matched_class, "policy_changes");
    assert.equal(governRes.body.approval_requirement.approvals_required, 2);
    assert.equal(governRes.body.approval_requirement.quorum_size, 3);
  });

  it("low confidence read → upgraded to REQUIRE_HUMAN", async () => {
    const nonce1 = `nonce-${Date.now()}-11`;
    const submitRes = await request("POST", "/intent", {
      action: "read_email",
      agent_id: "bondi",
      target_environment: "gmail",
      parameters: {},
      confidence: 30,
      request_timestamp: new Date().toISOString(),
      request_nonce: nonce1,
    }, ownerToken);
    assert.equal(submitRes.status, 201, `Intent creation failed: ${JSON.stringify(submitRes.body)}`);
    const intentId = submitRes.body.intent_id;

    const nonce2 = `nonce-${Date.now()}-12`;
    const governRes = await request("POST", "/govern", {
      intent_id: intentId,
      request_timestamp: new Date().toISOString(),
      request_nonce: nonce2,
    }, ownerToken);
    assert.equal(governRes.status, 200);
    assert.equal(governRes.body.governance_decision, "REQUIRE_HUMAN");
    // Risk tier stays NONE (the action itself is low risk)
    assert.equal(governRes.body.risk_tier, "NONE");
  });

  it("governance hash is a 64-char hex string (SHA-256)", async () => {
    const nonce1 = `nonce-${Date.now()}-13`;
    const submitRes = await request("POST", "/intent", {
      action: "list_files",
      agent_id: "bondi",
      target_environment: "google_drive",
      parameters: {},
      confidence: 95,
      request_timestamp: new Date().toISOString(),
      request_nonce: nonce1,
    }, ownerToken);
    assert.equal(submitRes.status, 201, `Intent creation failed: ${JSON.stringify(submitRes.body)}`);
    const intentId = submitRes.body.intent_id;

    const nonce2 = `nonce-${Date.now()}-14`;
    const governRes = await request("POST", "/govern", {
      intent_id: intentId,
      request_timestamp: new Date().toISOString(),
      request_nonce: nonce2,
    }, ownerToken);
    assert.equal(governRes.status, 200);
    assert.ok(governRes.body.governance_hash);
    assert.equal(governRes.body.governance_hash.length, 64);
    assert.ok(/^[a-f0-9]{64}$/.test(governRes.body.governance_hash));
  });

  it("unknown agent → AUTO_DENY (agent not in scope)", async () => {
    const nonce1 = `nonce-${Date.now()}-15`;
    const submitRes = await request("POST", "/intent", {
      action: "read_email",
      agent_id: "unknown_rogue_agent",
      target_environment: "gmail",
      parameters: {},
      confidence: 90,
      request_timestamp: new Date().toISOString(),
      request_nonce: nonce1,
    }, ownerToken);
    assert.equal(submitRes.status, 201, `Intent creation failed: ${JSON.stringify(submitRes.body)}`);
    const intentId = submitRes.body.intent_id;

    const nonce2 = `nonce-${Date.now()}-16`;
    const governRes = await request("POST", "/govern", {
      intent_id: intentId,
      request_timestamp: new Date().toISOString(),
      request_nonce: nonce2,
    }, ownerToken);
    assert.equal(governRes.status, 200);
    assert.equal(governRes.body.governance_decision, "AUTO_DENY");
    assert.equal(governRes.body.risk_tier, "CRITICAL");
  });
});
