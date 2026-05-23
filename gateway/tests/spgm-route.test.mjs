/**
 * SPG-M Route Tests
 *
 * Tests the non-executing /spgm routes in isolation with a mock principal.
 */
import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import express from "express";
import spgmRoutes from "../routes/spgm.mjs";

let server;
let baseUrl;

const previewPolicy = {
  status: "active",
  policy_version: "test-spgm-route-policy",
  policy_hash: "test_spgm_route_policy_hash",
  scope: {
    agents: ["bondi"],
    systems: ["local"],
  },
  action_classes: [
    {
      class_id: "read_operations",
      pattern: "read_*",
      governance_decision: "AUTO_APPROVE",
      risk_tier: "LOW",
    },
    {
      class_id: "blocked_operations",
      pattern: "self_authorize|bypass_governance",
      governance_decision: "AUTO_DENY",
      risk_tier: "CRITICAL",
      description: "Invariant violation.",
    },
  ],
  risk_tiers: {
    LOW: { severity: 1 },
    MEDIUM: { severity: 2 },
    HIGH: { severity: 3 },
    CRITICAL: { severity: 4 },
  },
  approval_requirements: {
    AUTO_APPROVE: { approvals_required: 0, required_roles: [] },
    AUTO_DENY: { approvals_required: -1, required_roles: [] },
    REQUIRE_HUMAN: { approvals_required: 1, required_roles: ["approver", "root_authority"] },
  },
  expiration_rules: {
    LOW: null,
    MEDIUM: 3600,
    HIGH: 1800,
    CRITICAL: 900,
  },
};

function reviewMetadata(overrides = {}) {
  return {
    accepted: true,
    context_type: "spgm_policy_review_metadata",
    mode: "non_executing",
    consequence_class: 3,
    spgm_status: "route",
    rio_required: true,
    muss_required: true,
    receipt_event_recommended: true,
    receipt_decision_hint: "BLOCK",
    policy_effect: {
      may_inform_policy_review: true,
      may_authorize: false,
      may_execute: false,
      may_write_ledger: false,
      may_create_memory: false,
    },
    required_action: "rio_review_required",
    ...overrides,
  };
}

function buildTestApp() {
  const app = express();
  app.use(express.json());

  // Mock resolved principal for route-level testing only.
  app.use((req, res, next) => {
    req.principal = {
      principal_id: "test-proposer",
      primary_role: "proposer",
      secondary_roles: [],
      status: "active",
    };
    next();
  });

  app.use("/spgm", spgmRoutes);
  return app;
}

async function get(path) {
  const res = await fetch(`${baseUrl}${path}`);
  const data = await res.json();
  return { status: res.status, data };
}

async function post(path, body) {
  const res = await fetch(`${baseUrl}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  return { status: res.status, data };
}

describe("SPG-M Routes", () => {
  before(async () => {
    const app = buildTestApp();
    await new Promise((resolve) => {
      server = app.listen(0, "127.0.0.1", () => resolve());
    });
    const { port } = server.address();
    baseUrl = `http://127.0.0.1:${port}`;
  });

  after(async () => {
    if (server) {
      await new Promise((resolve) => server.close(resolve));
    }
  });

  it("reports non-executing SPG-M status", async () => {
    const { status, data } = await get("/spgm/status");

    assert.equal(status, 200);
    assert.equal(data.module, "SPG-M");
    assert.equal(data.status, "available");
    assert.equal(data.mode, "non_executing");
    assert.equal(data.capabilities.intake_validation, true);
    assert.equal(data.capabilities.receipt_handoff_metadata, true);
    assert.equal(data.capabilities.policy_review_preview, true);
    assert.ok(data.not_capable_of.includes("execution"));
    assert.ok(data.not_capable_of.includes("ledger_write"));
    assert.match(data.authority_boundary, /cannot approve/);
  });

  it("returns non-executing private reflection result", async () => {
    const { status, data } = await post("/spgm/intake", {
      signal: {
        literal_description: "Human reports a recurring symbol during private journaling.",
        signal_type: "pattern",
      },
      proposed_use: {
        use_type: "reflect",
        affected_parties: [],
      },
      machine_assistance: {
        used: false,
        role: null,
      },
    });

    assert.equal(status, 200);
    assert.equal(data.status, "ok");
    assert.equal(data.mode, "non_executing");
    assert.equal(data.spgm_result.consequence_class, 1);
    assert.equal(data.spgm_result.status, "record");
    assert.equal(data.routing.rio_required, false);
    assert.equal(data.receipt_event.recommended, false);
    assert.equal(data.policy_review.accepted, true);
    assert.equal(data.policy_review.policy_effect.may_authorize, false);
    assert.equal(data.policy_review.policy_effect.may_execute, false);
  });

  it("routes relational output without execution authority", async () => {
    const { status, data } = await post("/spgm/intake", {
      signal: {
        literal_description: "Human reports a recurring relational pattern involving another person.",
        signal_type: "relational",
      },
      proposed_use: {
        use_type: "propose",
        proposed_action: "start_conversation",
        affected_parties: ["other_person"],
        known_domains: ["relationship"],
      },
      machine_assistance: {
        used: true,
        role: "classification",
      },
    });

    assert.equal(status, 200);
    assert.equal(data.mode, "non_executing");
    assert.equal(data.spgm_result.consequence_class, 3);
    assert.equal(data.spgm_result.status, "route");
    assert.equal(data.routing.rio_required, true);
    assert.equal(data.routing.muss_required, true);
    assert.equal(data.receipt_event.recommended, true);
    assert.equal(data.receipt_event.decision_hint, "BLOCK");
    assert.equal(data.policy_review.accepted, true);
    assert.equal(data.policy_review.required_action, "rio_review_required");
    assert.equal(data.policy_review.policy_effect.may_authorize, false);
    assert.match(data.authority_boundary, /does not approve/);
  });

  it("previews RIO policy review with SPG-M escalation", async () => {
    const { status, data } = await post("/spgm/policy-review", {
      intent: {
        action: "read_email",
        agent_id: "bondi",
        target_environment: "local",
        confidence: 90,
      },
      policy: previewPolicy,
      policy_review: reviewMetadata(),
    });

    assert.equal(status, 200);
    assert.equal(data.status, "ok");
    assert.equal(data.mode, "non_executing");
    assert.equal(data.review_type, "spgm_policy_review_preview");
    assert.equal(data.governance.governance_decision, "REQUIRE_HUMAN");
    assert.equal(data.governance.spgm_policy_context_status, "escalated_to_review");
    assert.equal(data.policy_effect.may_authorize, false);
    assert.equal(data.policy_effect.may_execute, false);
    assert.equal(data.policy_effect.may_write_ledger, false);
  });

  it("holds SPG-M policy review preview without an intent", async () => {
    const { status, data } = await post("/spgm/policy-review", {
      policy: previewPolicy,
      policy_review: reviewMetadata(),
    });

    assert.equal(status, 400);
    assert.equal(data.status, "hold");
    assert.equal(data.mode, "non_executing");
    assert.equal(data.error, "SPGM_POLICY_REVIEW_MISSING_INTENT");
  });

  it("fails closed on invalid intake packets", async () => {
    const { status, data } = await post("/spgm/intake", {
      proposed_use: {
        use_type: "reflect",
      },
    });

    assert.equal(status, 400);
    assert.equal(data.status, "hold");
    assert.equal(data.mode, "non_executing");
    assert.equal(data.error, "SPGM_INTAKE_VALIDATION_FAILED");
    assert.ok(Array.isArray(data.errors));
    assert.equal(data.spgm_result.status, "hold");
    assert.equal(data.next_step, "containment");
  });
});
