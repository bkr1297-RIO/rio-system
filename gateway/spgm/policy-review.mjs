/**
 * SPG-M Policy Review Preview
 *
 * Non-executing preview bridge from SPG-M policy_review metadata into
 * RIO's pure policy engine.
 *
 * This module does not create intents, approve actions, deny actions by itself,
 * issue tokens, execute actions, write ledger entries, generate receipts, or
 * create memory.
 */
import { evaluatePolicy } from "../governance/policy-engine.mjs";

export function buildSpgmPolicyReviewPreview({
  intent,
  policy,
  policyReview,
  systemMode = "NORMAL",
  principal = null,
} = {}) {
  if (!intent || typeof intent !== "object") {
    return {
      status: "hold",
      mode: "non_executing",
      error: "SPGM_POLICY_REVIEW_MISSING_INTENT",
      message: "SPG-M policy review preview requires an intent object.",
      authority_boundary: "No action may proceed from an invalid SPG-M policy review preview.",
    };
  }

  const decision = evaluatePolicy(intent, policy || null, {
    systemMode,
    principal,
    spgmPolicyReview: policyReview || null,
  });

  return {
    status: "ok",
    mode: "non_executing",
    review_type: "spgm_policy_review_preview",
    intent_summary: {
      action: intent.action || null,
      agent_id: intent.agent_id || null,
      target_environment: intent.target_environment || intent.target_system || "local",
    },
    spgm_policy_review_present: Boolean(policyReview),
    governance: {
      governance_decision: decision.governance_decision,
      status: decision.status,
      risk_tier: decision.risk_tier,
      risk_level: decision.risk_level,
      matched_class: decision.matched_class,
      requires_approval: decision.requires_approval,
      reason: decision.reason,
      spgm_policy_context_status: decision.spgm_policy_context_status || null,
      checks: decision.checks || [],
    },
    policy_effect: {
      may_inform_policy_review: true,
      may_create_intent: false,
      may_authorize: false,
      may_execute: false,
      may_issue_token: false,
      may_write_ledger: false,
      may_generate_receipt: false,
      may_create_memory: false,
    },
    authority_boundary: "SPG-M policy review preview may inform RIO review only. It cannot create intents, approve, execute, issue tokens, write ledger entries, generate receipts, or create memory.",
  };
}
