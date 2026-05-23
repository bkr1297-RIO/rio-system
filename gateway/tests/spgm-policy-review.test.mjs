/**
 * SPG-M Policy Review Preview Tests
 *
 * Tests the non-executing SPG-M policy-review preview helper.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { buildSpgmPolicyReviewPreview } from "../spgm/policy-review.mjs";

const policy = {
  status: "active",
  policy_version: "test-spgm-policy-review",
  policy_hash: "test_spgm_policy_review_hash",
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

describe("SPG-M Policy Review Preview", () => {
  it("holds when intent is missing", () => {
    const result = buildSpgmPolicyReviewPreview({ policy, policyReview: spgmReview() });

    assert.equal(result.status, "hold");
    assert.equal(result.mode, "non_executing");
    assert.equal(result.error, "SPGM_POLICY_REVIEW_MISSING_INTENT");
    assert.match(result.authority_boundary, /No action may proceed/);
  });

  it("returns non-executing policy preview without SPG-M metadata", () => {
    const result = buildSpgmPolicyReviewPreview({
      intent: { action: "read_email", agent_id: "bondi", target_environment: "local", confidence: 90 },
      policy,
    });

    assert.equal(result.status, "ok");
    assert.equal(result.mode, "non_executing");
    assert.equal(result.governance.governance_decision, "AUTO_APPROVE");
    assert.equal(result.governance.requires_approval, false);
    assert.equal(result.policy_effect.may_authorize, false);
    assert.equal(result.policy_effect.may_execute, false);
    assert.equal(result.policy_effect.may_write_ledger, false);
  });

  it("escalates preview to REQUIRE_HUMAN when SPG-M review requires RIO", () => {
    const result = buildSpgmPolicyReviewPreview({
      intent: { action: "read_email", agent_id: "bondi", target_environment: "local", confidence: 90 },
      policy,
      policyReview: spgmReview(),
    });

    assert.equal(result.status, "ok");
    assert.equal(result.mode, "non_executing");
    assert.equal(result.governance.governance_decision, "REQUIRE_HUMAN");
    assert.equal(result.governance.requires_approval, true);
    assert.equal(result.governance.spgm_policy_context_status, "escalated_to_review");
    assert.ok(result.governance.checks.some((check) => check.check === "spgm_policy_review_context"));
  });

  it("does not override AUTO_DENY", () => {
    const result = buildSpgmPolicyReviewPreview({
      intent: { action: "self_authorize", agent_id: "bondi", target_environment: "local", confidence: 100 },
      policy,
      policyReview: spgmReview(),
    });

    assert.equal(result.governance.governance_decision, "AUTO_DENY");
    assert.equal(result.governance.status, "blocked");
    assert.equal(result.governance.risk_tier, "CRITICAL");
  });

  it("rejects unsafe SPG-M review metadata without creating authority", () => {
    const result = buildSpgmPolicyReviewPreview({
      intent: { action: "read_email", agent_id: "bondi", target_environment: "local", confidence: 90 },
      policy,
      policyReview: spgmReview({
        policy_effect: {
          may_inform_policy_review: true,
          may_authorize: true,
          may_execute: false,
          may_write_ledger: false,
          may_create_memory: false,
        },
      }),
    });

    assert.equal(result.governance.governance_decision, "AUTO_APPROVE");
    assert.equal(result.governance.spgm_policy_context_status, "rejected_or_contained");
    assert.equal(result.policy_effect.may_authorize, false);
    assert.equal(result.policy_effect.may_execute, false);
  });
});
