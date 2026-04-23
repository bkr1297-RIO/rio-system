/**
 * RIO User Policy Layer — Placeholder (v0.0)
 *
 * This module provides the integration point for user-defined policy
 * evaluation. It is called BEFORE execution, AFTER authorization checks pass.
 *
 * Current behavior: always returns { decision: "ALLOW" }.
 * No logic. No rules. No blocking. No delay.
 *
 * When the Policy Layer is activated, this function will evaluate
 * the intent against user-defined policy packs and return a decision
 * that may restrict (but never expand) the authorization already granted.
 *
 * Invariant: Context can only restrict; it must never grant or expand permission.
 *
 * @module governance/user-policy
 * @version 0.0.0 — placeholder only
 */

/**
 * Evaluate an intent against user-defined policy.
 *
 * @param {object} intent - The authorized intent about to be executed
 * @param {object} context - Execution context (principal, environment, etc.)
 * @returns {{ decision: "ALLOW" | "DENY", rules: string[], policy_pack: string | null }}
 */
export function evaluateUserPolicy(intent, context) {
  // ──────────────────────────────────────────────────────────────────
  // PLACEHOLDER — always ALLOW, no evaluation logic.
  // This function exists solely as a stable integration point.
  // When the Policy Layer is activated, real evaluation will happen here.
  // ──────────────────────────────────────────────────────────────────
  return {
    decision: "ALLOW",
    rules: [],
    policy_pack: null,
  };
}

/**
 * Build the policy block for inclusion in receipts.
 *
 * @param {object} policyResult - Result from evaluateUserPolicy()
 * @returns {object} Policy block for the receipt
 */
export function buildPolicyBlock(policyResult) {
  return {
    evaluated: true,
    decision: policyResult?.decision || "ALLOW",
    rules: policyResult?.rules || [],
    policy_pack: policyResult?.policy_pack || null,
  };
}
