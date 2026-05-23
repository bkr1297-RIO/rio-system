/**
 * SPG-M Policy Adapter
 *
 * Converts SPG-M policy_context into non-authorizing RIO review metadata.
 * This adapter does not evaluate policy, approve actions, deny actions,
 * issue tokens, execute actions, write ledger entries, generate receipts,
 * or create memory.
 */

const REQUIRED_FALSE_POLICY_USE_FLAGS = [
  "may_create_authorization",
  "may_create_execution",
  "may_write_ledger",
  "may_create_memory",
];

const REQUIRED_TRUE_BOUNDARY_FLAGS = [
  "non_executing",
  "signal_not_command",
  "interpretation_provisional",
  "machine_boundary_preserved",
];

function hasObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export function validateSpgmPolicyContext(policyContext = {}) {
  const errors = [];

  if (!hasObject(policyContext)) {
    return {
      valid: false,
      errors: ["policy_context must be an object"],
    };
  }

  if (policyContext.context_type !== "spgm_policy_context") {
    errors.push("policy_context.context_type must be spgm_policy_context");
  }

  if (policyContext.mode !== "non_executing") {
    errors.push("policy_context.mode must be non_executing");
  }

  if (!hasObject(policyContext.policy_use)) {
    errors.push("policy_context.policy_use must be an object");
  } else {
    for (const flag of REQUIRED_FALSE_POLICY_USE_FLAGS) {
      if (policyContext.policy_use[flag] !== false) {
        errors.push(`policy_context.policy_use.${flag} must be false`);
      }
    }
  }

  if (!hasObject(policyContext.boundary_flags)) {
    errors.push("policy_context.boundary_flags must be an object");
  } else {
    for (const flag of REQUIRED_TRUE_BOUNDARY_FLAGS) {
      if (policyContext.boundary_flags[flag] !== true) {
        errors.push(`policy_context.boundary_flags.${flag} must be true`);
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

export function buildSpgmPolicyReviewMetadata(policyContext = {}) {
  const validation = validateSpgmPolicyContext(policyContext);

  if (!validation.valid) {
    return {
      accepted: false,
      context_type: "spgm_policy_review_metadata",
      mode: "non_executing",
      errors: validation.errors,
      policy_effect: {
        may_inform_policy_review: false,
        may_authorize: false,
        may_execute: false,
        may_write_ledger: false,
        may_create_memory: false,
      },
      required_action: "reject_or_contain_context",
    };
  }

  const spgm = policyContext.spgm || {};
  const routing = policyContext.routing || {};
  const boundaryFlags = policyContext.boundary_flags || {};

  return {
    accepted: true,
    context_type: "spgm_policy_review_metadata",
    mode: "non_executing",
    source: policyContext.source || null,
    consequence_class: Number.isInteger(spgm.consequence_class) ? spgm.consequence_class : null,
    spgm_status: spgm.status || "unknown",
    rio_required: routing.rio_required === true,
    muss_required: routing.muss_required === true,
    receipt_event_recommended: boundaryFlags.receipt_event_recommended === true,
    receipt_decision_hint: boundaryFlags.receipt_decision_hint || null,
    gates: spgm.gates || {},
    policy_effect: {
      may_inform_policy_review: true,
      may_authorize: false,
      may_execute: false,
      may_write_ledger: false,
      may_create_memory: false,
    },
    required_action: routing.rio_required === true
      ? "rio_review_required"
      : "available_as_context_only",
    authority_boundary: "SPG-M review metadata may inform RIO policy review, but it cannot authorize, execute, issue tokens, write ledger entries, generate receipts, or create memory.",
  };
}

export function buildSpgmPolicyReviewFromIntakeResult(intakeResult = {}) {
  if (!hasObject(intakeResult.policy_context)) {
    return buildSpgmPolicyReviewMetadata(null);
  }
  return buildSpgmPolicyReviewMetadata(intakeResult.policy_context);
}
