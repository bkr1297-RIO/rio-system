/**
 * SPG-M Govern Request Helpers
 *
 * Extracts optional SPG-M review metadata from live /govern requests.
 * This module is non-authorizing and non-executing.
 */

export function extractSpgmReviewFromGovernBody(body = {}) {
  return body.spgmPolicyReview
    || body.spgm_policy_review
    || body.policy_review
    || body.spgm?.policy_review
    || null;
}

export function buildSpgmGovernContext({ body = {}, principal = null, systemMode = "NORMAL" } = {}) {
  return {
    systemMode,
    principal,
    spgmPolicyReview: extractSpgmReviewFromGovernBody(body),
  };
}

export function buildSpgmGovernResponseFields(decision = {}) {
  if (!decision.spgm_policy_context_status) return {};

  return {
    spgm_policy_context_status: decision.spgm_policy_context_status,
    spgm_policy_review_applied: decision.checks?.some(
      (check) => check.check === "spgm_policy_review_context" && check.passed === true
    ) || false,
  };
}
