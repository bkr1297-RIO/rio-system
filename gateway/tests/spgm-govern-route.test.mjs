/**
 * SPG-M Govern Bridge Route Tests
 *
 * Tests the live /govern bridge handler for optional SPG-M review metadata.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { handleSpgmGovernRequest } from "../routes/spgm-govern.mjs";

function baseIntent(overrides = {}) {
  return {
    intent_id: "intent-1",
    action: "read_email",
    agent_id: "bondi",
    target_environment: "local",
    status: "submitted",
    confidence: 90,
    ...overrides,
  };
}

function baseDecision(overrides = {}) {
  return {
    governance_decision: "REQUIRE_HUMAN",
    status: "requires_approval",
    reason: "SPG-M context requires RIO review before execution.",
    risk_tier: "MEDIUM",
    risk_level: "medium",
    matched_class: "read_operations",
    requires_approval: true,
    approval_requirement: { approvals_required: 1 },
    approval_ttl: 3600,
    policy_version: "test-policy",
    policy_hash: "test-policy-hash",
    spgm_policy_context_status: "escalated_to_review",
    checks: [
      { check: "action_class_match", passed: true },
      { check: "spgm_policy_review_context", passed: true },
    ],
    ...overrides,
  };
}

function reviewMetadata() {
  return {
    accepted: true,
    context_type: "spgm_policy_review_metadata",
    mode: "non_executing",
    rio_required: true,
    policy_effect: {
      may_authorize: false,
      may_execute: false,
      may_write_ledger: false,
      may_create_memory: false,
    },
  };
}

function deps(overrides = {}) {
  const calls = {
    updated: null,
    appended: null,
    evaluatedContext: null,
  };

  return {
    calls,
    getIntentFn: () => baseIntent(),
    updateIntentFn: (intentId, patch) => { calls.updated = { intentId, patch }; },
    evaluatePolicyFn: (intent, policy, context) => {
      calls.evaluatedContext = context;
      return baseDecision();
    },
    getActivePolicyFn: () => ({ policy_version: "test-policy", policy_hash: "test-policy-hash" }),
    getSystemModeFn: () => "NORMAL",
    appendEntryFn: (entry) => { calls.appended = entry; },
    hashIntentFn: () => "intent-hash",
    ...overrides,
  };
}

describe("SPG-M govern bridge handler", () => {
  it("passes through when no SPG-M metadata is present", () => {
    const result = handleSpgmGovernRequest({
      body: { intent_id: "intent-1" },
      ...deps(),
    });

    assert.equal(result.handled, false);
  });

  it("requires intent_id when SPG-M metadata is present", () => {
    const result = handleSpgmGovernRequest({
      body: { policy_review: reviewMetadata() },
      ...deps(),
    });

    assert.equal(result.handled, true);
    assert.equal(result.statusCode, 400);
    assert.match(result.body.error, /intent_id/);
  });

  it("returns 404 when intent is missing", () => {
    const result = handleSpgmGovernRequest({
      body: { intent_id: "missing", policy_review: reviewMetadata() },
      ...deps({ getIntentFn: () => null }),
    });

    assert.equal(result.handled, true);
    assert.equal(result.statusCode, 404);
  });

  it("returns conflict unless intent is submitted", () => {
    const result = handleSpgmGovernRequest({
      body: { intent_id: "intent-1", policy_review: reviewMetadata() },
      ...deps({ getIntentFn: () => baseIntent({ status: "authorized" }) }),
    });

    assert.equal(result.handled, true);
    assert.equal(result.statusCode, 409);
  });

  it("runs governance with SPG-M review metadata", () => {
    const injected = deps();
    const result = handleSpgmGovernRequest({
      body: { intent_id: "intent-1", policy_review: reviewMetadata() },
      principal: { principal_id: "test-principal" },
      ...injected,
    });

    assert.equal(result.handled, true);
    assert.equal(result.statusCode, 200);
    assert.equal(result.body.governance_decision, "REQUIRE_HUMAN");
    assert.equal(result.body.spgm_policy_context_status, "escalated_to_review");
    assert.equal(result.body.spgm_policy_review_applied, true);
    assert.equal(injected.calls.evaluatedContext.spgmPolicyReview.accepted, true);
    assert.equal(injected.calls.updated.patch.status, "governed");
    assert.equal(injected.calls.updated.patch.governance.spgm_review_metadata_present, true);
    assert.equal(injected.calls.appended.status, "governed");
  });

  it("preserves blocked status when policy denies", () => {
    const injected = deps({
      evaluatePolicyFn: () => baseDecision({
        governance_decision: "AUTO_DENY",
        status: "blocked",
        requires_approval: false,
        risk_tier: "CRITICAL",
        risk_level: "critical",
      }),
    });

    const result = handleSpgmGovernRequest({
      body: { intent_id: "intent-1", policy_review: reviewMetadata() },
      ...injected,
    });

    assert.equal(result.statusCode, 200);
    assert.equal(result.body.governance_decision, "AUTO_DENY");
    assert.equal(injected.calls.updated.patch.status, "blocked");
  });
});
