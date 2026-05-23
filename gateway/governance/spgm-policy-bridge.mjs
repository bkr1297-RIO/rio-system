/**
 * SPG-M Policy Bridge
 *
 * Pure RIO-side consumer for SPG-M policy review metadata.
 *
 * This module does not evaluate full RIO policy, approve actions,
 * deny actions by itself, execute actions, issue tokens, write ledger entries,
 * generate receipts, or create memory.
 *
 * It can only:
 * - validate SPG-M review metadata as non-authorizing context,
 * - add audit checks,
 * - conservatively upgrade AUTO_APPROVE to REQUIRE_HUMAN when SPG-M marks
 *   RIO review required.
 */

const GOVERNANCE_DECISIONS = Object.freeze({
  AUTO_APPROVE: "AUTO_APPROVE",
  AUTO_DENY: "AUTO_DENY",
  REQUIRE_HUMAN: "REQUIRE_HUMAN",
  REQUIRE_QUORUM: "REQUIRE_QUORUM",
  REQUIRE_UNANIMOUS: "REQUIRE_UNANIMOUS",
  MAINTENANCE_PAUSED: "MAINTENANCE_PAUSED",
});

const RISK_ORDER = Object.freeze(["NONE", "LOW", "MEDIUM", "HIGH", "CRITICAL"]);

function maxRisk(currentRisk, minimumRisk) {
  const currentIndex = RISK_ORDER.indexOf(currentRisk);
  const minimumIndex = RISK_ORDER.indexOf(minimumRisk);
  if (currentIndex === -1) return minimumRisk;
  if (minimumIndex === -1) return currentRisk;
  return RISK_ORDER[Math.max(currentIndex, minimumIndex)];
}

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export function validateSpgmPolicyReviewMetadata(policyReview = {}) {
  const errors = [];

  if (!isObject(policyReview)) {
    return {
      valid: false,
      errors: ["spgm_policy_review must be an object"],
    };
  }

  if (policyReview.context_type !== "spgm_policy_review_metadata") {
    errors.push("spgm_policy_review.context_type must be spgm_policy_review_metadata");
  }

  if (policyReview.mode !== "non_executing") {
    errors.push("spgm_policy_review.mode must be non_executing");
  }

  if (policyReview.accepted !== true) {
    errors.push("spgm_policy_review.accepted must be true");
  }

  if (!isObject(policyReview.policy_effect)) {
    errors.push("spgm_policy_review.policy_effect must be an object");
  } else {
    if (policyReview.policy_effect.may_authorize !== false) {
      errors.push("spgm_policy_review.policy_effect.may_authorize must be false");
    }
    if (policyReview.policy_effect.may_execute !== false) {
      errors.push("spgm_policy_review.policy_effect.may_execute must be false");
    }
    if (policyReview.policy_effect.may_write_ledger !== false) {
      errors.push("spgm_policy_review.policy_effect.may_write_ledger must be false");
    }
    if (policyReview.policy_effect.may_create_memory !== false) {
      errors.push("spgm_policy_review.policy_effect.may_create_memory must be false");
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

export function buildSpgmPolicyBridgeCheck(policyReview = {}) {
  const validation = validateSpgmPolicyReviewMetadata(policyReview);

  if (!validation.valid) {
    return {
      check: "spgm_policy_review_context",
      passed: false,
      effect: "ignored_or_contained",
      errors: validation.errors,
    };
  }

  return {
    check: "spgm_policy_review_context",
    passed: true,
    mode: "non_executing",
    consequence_class: policyReview.consequence_class ?? null,
    spgm_status: policyReview.spgm_status || "unknown",
    rio_required: policyReview.rio_required === true,
    muss_required: policyReview.muss_required === true,
    receipt_event_recommended: policyReview.receipt_event_recommended === true,
    effect: policyReview.rio_required === true
      ? "review_required"
      : "context_only",
  };
}

export function applySpgmPolicyBridge(governanceDecision = {}, policyReview = null) {
  if (!policyReview) {
    return {
      ...governanceDecision,
      checks: [
        ...(governanceDecision.checks || []),
        {
          check: "spgm_policy_review_context",
          passed: true,
          effect: "not_present",
        },
      ],
    };
  }

  const check = buildSpgmPolicyBridgeCheck(policyReview);
  const checks = [...(governanceDecision.checks || []), check];

  if (!check.passed) {
    return {
      ...governanceDecision,
      checks,
      spgm_policy_context_status: "rejected_or_contained",
    };
  }

  if (
    policyReview.rio_required === true &&
    governanceDecision.governance_decision === GOVERNANCE_DECISIONS.AUTO_APPROVE
  ) {
    return {
      ...governanceDecision,
      governance_decision: GOVERNANCE_DECISIONS.REQUIRE_HUMAN,
      status: "requires_approval",
      reason: "SPG-M context requires RIO review before execution.",
      requires_approval: true,
      risk_tier: maxRisk(governanceDecision.risk_tier, "MEDIUM"),
      risk_level: maxRisk(governanceDecision.risk_tier, "MEDIUM").toLowerCase(),
      checks,
      spgm_policy_context_status: "escalated_to_review",
    };
  }

  return {
    ...governanceDecision,
    checks,
    spgm_policy_context_status: "accepted_as_context",
  };
}
