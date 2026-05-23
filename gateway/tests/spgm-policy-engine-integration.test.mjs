/**
 * SPG-M Policy Engine Integration Tests
 *
 * Tests the pure RIO policy engine consuming SPG-M review metadata.
 * SPG-M may only preserve or escalate review. It must never approve.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { evaluatePolicy } from "../governance/policy-engine.mjs";

const policy = {
  status: "active",
  policy_version: "test-spgm-policy",
  policy_hash: "test_spgm_policy_hash",
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
      class_id: "send_operations",
      pattern: "send_*",
      governance_decision: "REQUIRE_HUMAN",
      risk_tier: "MEDIUM",
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
    NONE: { severity: 0 },
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

function spgmReview(overrides = {}) {
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

describe("SPG-M → RIO policy engine bridge", () => {
  it("keeps AUTO_APPROVE when no SPG-M review metadata is present", () => {
    const result = evaluatePolicy(
      { action: "read_email", agent_id: "bondi", target_environment: "local", confidence: 90 },
      policy
    );

    assert.equal(result.governance_decision, "AUTO_APPROVE");
    assert.equal(result.requires_approval, false);
    assert.equal(result.spgm_policy_context_status, undefined);
  });

  it("escalates AUTO_APPROVE to REQUIRE_HUMAN when SPG-M requires RIO review", () => {
    const result = evaluatePolicy(
      { action: "read_email", agent_id: "bondi", target_environment: "local", confidence: 90 },
      policy,
      { spgmPolicyReview: spgmReview() }
    );

    assert.equal(result.governance_decision, "REQUIRE_HUMAN");
    assert.equal(result.status, "requires_approval");
    assert.equal(result.requires_approval, true);
    assert.equal(result.risk_tier, "MEDIUM");
    assert.equal(result.risk_level, "medium");
    assert.equal(result.spgm_policy_context_status, "escalated_to_review");
    assert.ok(result.checks.some((check) => check.check === "spgm_policy_review_context"));
  });

  it("does not downgrade existing REQUIRE_HUMAN", () => {
    const result = evaluatePolicy(
      { action: "send_email", agent_id: "bondi", target_environment: "local", confidence: 90 },
      policy,
      { spgmPolicyReview: spgmReview({ rio_required: false }) }
    );

    assert.equal(result.governance_decision, "REQUIRE_HUMAN");
    assert.equal(result.requires_approval, true);
    assert.equal(result.risk_tier, "MEDIUM");
    assert.equal(result.spgm_policy_context_status, "accepted_as_context");
  });

  it("does not override AUTO_DENY", () => {
    const result = evaluatePolicy(
      { action: "self_authorize", agent_id: "bondi", target_environment: "local", confidence: 100 },
      policy,
      { spgmPolicyReview: spgmReview() }
    );

    assert.equal(result.governance_decision, "AUTO_DENY");
    assert.equal(result.status, "blocked");
    assert.equal(result.risk_tier, "CRITICAL");
  });

  it("rejects unsafe SPG-M review metadata without creating approval", () => {
    const result = evaluatePolicy(
      { action: "read_email", agent_id: "bondi", target_environment: "local", confidence: 90 },
      policy,
      {
        spgmPolicyReview: spgmReview({
          policy_effect: {
            may_inform_policy_review: true,
            may_authorize: true,
            may_execute: false,
            may_write_ledger: false,
            may_create_memory: false,
          },
        }),
      }
    );

    assert.equal(result.governance_decision, "AUTO_APPROVE");
    assert.equal(result.requires_approval, false);
    assert.equal(result.spgm_policy_context_status, "rejected_or_contained");
    assert.ok(result.checks.some((check) => check.check === "spgm_policy_review_context" && check.passed === false));
  });

  it("accepts snake_case SPG-M review context key", () => {
    const result = evaluatePolicy(
      { action: "read_email", agent_id: "bondi", target_environment: "local", confidence: 90 },
      policy,
      { spgm_policy_review: spgmReview() }
    );

    assert.equal(result.governance_decision, "REQUIRE_HUMAN");
    assert.equal(result.spgm_policy_context_status, "escalated_to_review");
  });
});
