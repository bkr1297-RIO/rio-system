/**
 * SPG-M Policy Bridge Tests
 *
 * Tests the pure RIO-side consumer for SPG-M review metadata.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  validateSpgmPolicyReviewMetadata,
  buildSpgmPolicyBridgeCheck,
  applySpgmPolicyBridge,
} from "../governance/spgm-policy-bridge.mjs";

function basePolicyReview(overrides = {}) {
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

function baseDecision(overrides = {}) {
  return {
    governance_decision: "AUTO_APPROVE",
    status: "auto_approved",
    reason: "Action is within allowed permissions and meets all thresholds.",
    requires_approval: false,
    risk_tier: "LOW",
    risk_level: "low",
    checks: [{ check: "action_class_match", passed: true }],
    ...overrides,
  };
}

describe("SPG-M Policy Bridge", () => {
  it("accepts valid non-executing SPG-M review metadata", () => {
    const validation = validateSpgmPolicyReviewMetadata(basePolicyReview());

    assert.equal(validation.valid, true);
    assert.deepEqual(validation.errors, []);
  });

  it("rejects metadata that can authorize", () => {
    const validation = validateSpgmPolicyReviewMetadata(basePolicyReview({
      policy_effect: {
        may_inform_policy_review: true,
        may_authorize: true,
        may_execute: false,
        may_write_ledger: false,
        may_create_memory: false,
      },
    }));

    assert.equal(validation.valid, false);
    assert.ok(validation.errors.includes("spgm_policy_review.policy_effect.may_authorize must be false"));
  });

  it("rejects executing metadata", () => {
    const validation = validateSpgmPolicyReviewMetadata(basePolicyReview({
      mode: "executing",
    }));

    assert.equal(validation.valid, false);
    assert.ok(validation.errors.includes("spgm_policy_review.mode must be non_executing"));
  });

  it("builds an accepted policy bridge check", () => {
    const check = buildSpgmPolicyBridgeCheck(basePolicyReview());

    assert.equal(check.check, "spgm_policy_review_context");
    assert.equal(check.passed, true);
    assert.equal(check.mode, "non_executing");
    assert.equal(check.rio_required, true);
    assert.equal(check.effect, "review_required");
  });

  it("escalates AUTO_APPROVE to REQUIRE_HUMAN when RIO review is required", () => {
    const bridged = applySpgmPolicyBridge(baseDecision(), basePolicyReview());

    assert.equal(bridged.governance_decision, "REQUIRE_HUMAN");
    assert.equal(bridged.status, "requires_approval");
    assert.equal(bridged.requires_approval, true);
    assert.equal(bridged.risk_tier, "MEDIUM");
    assert.equal(bridged.spgm_policy_context_status, "escalated_to_review");
    assert.ok(bridged.checks.some((check) => check.check === "spgm_policy_review_context"));
  });

  it("does not downgrade existing REQUIRE_HUMAN", () => {
    const bridged = applySpgmPolicyBridge(baseDecision({
      governance_decision: "REQUIRE_HUMAN",
      status: "requires_approval",
      requires_approval: true,
      risk_tier: "HIGH",
      risk_level: "high",
    }), basePolicyReview({ rio_required: false }));

    assert.equal(bridged.governance_decision, "REQUIRE_HUMAN");
    assert.equal(bridged.risk_tier, "HIGH");
    assert.equal(bridged.spgm_policy_context_status, "accepted_as_context");
  });

  it("does not override AUTO_DENY", () => {
    const bridged = applySpgmPolicyBridge(baseDecision({
      governance_decision: "AUTO_DENY",
      status: "blocked",
      requires_approval: false,
      risk_tier: "CRITICAL",
      risk_level: "critical",
    }), basePolicyReview());

    assert.equal(bridged.governance_decision, "AUTO_DENY");
    assert.equal(bridged.status, "blocked");
    assert.equal(bridged.risk_tier, "CRITICAL");
  });

  it("rejects unsafe context without changing the decision", () => {
    const bridged = applySpgmPolicyBridge(baseDecision(), basePolicyReview({
      policy_effect: {
        may_inform_policy_review: true,
        may_authorize: true,
        may_execute: false,
        may_write_ledger: false,
        may_create_memory: false,
      },
    }));

    assert.equal(bridged.governance_decision, "AUTO_APPROVE");
    assert.equal(bridged.spgm_policy_context_status, "rejected_or_contained");
    assert.ok(bridged.checks.some((check) => check.passed === false));
  });

  it("adds a not-present check when no SPG-M review metadata exists", () => {
    const bridged = applySpgmPolicyBridge(baseDecision(), null);

    assert.equal(bridged.governance_decision, "AUTO_APPROVE");
    assert.ok(bridged.checks.some((check) => check.effect === "not_present"));
  });
});
