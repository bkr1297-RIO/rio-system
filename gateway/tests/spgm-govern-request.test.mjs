/**
 * SPG-M Govern Request Helper Tests
 *
 * Tests extraction of optional SPG-M review metadata from live /govern bodies.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  extractSpgmReviewFromGovernBody,
  buildSpgmGovernContext,
  buildSpgmGovernResponseFields,
} from "../spgm/govern-request.mjs";

const review = {
  accepted: true,
  context_type: "spgm_policy_review_metadata",
  mode: "non_executing",
  rio_required: true,
};

describe("SPG-M Govern Request Helpers", () => {
  it("extracts camelCase SPG-M review metadata", () => {
    assert.equal(extractSpgmReviewFromGovernBody({ spgmPolicyReview: review }), review);
  });

  it("extracts snake_case SPG-M review metadata", () => {
    assert.equal(extractSpgmReviewFromGovernBody({ spgm_policy_review: review }), review);
  });

  it("extracts generic policy_review metadata", () => {
    assert.equal(extractSpgmReviewFromGovernBody({ policy_review: review }), review);
  });

  it("extracts nested SPG-M policy review metadata", () => {
    assert.equal(extractSpgmReviewFromGovernBody({ spgm: { policy_review: review } }), review);
  });

  it("returns null when no SPG-M review exists", () => {
    assert.equal(extractSpgmReviewFromGovernBody({ intent_id: "intent-1" }), null);
  });

  it("builds /govern context with principal and mode", () => {
    const principal = { principal_id: "test-principal" };
    const context = buildSpgmGovernContext({
      body: { spgmPolicyReview: review },
      principal,
      systemMode: "NORMAL",
    });

    assert.equal(context.systemMode, "NORMAL");
    assert.equal(context.principal, principal);
    assert.equal(context.spgmPolicyReview, review);
  });

  it("omits response fields when SPG-M did not affect governance", () => {
    assert.deepEqual(buildSpgmGovernResponseFields({ checks: [] }), {});
  });

  it("adds response fields when SPG-M bridge status exists", () => {
    const fields = buildSpgmGovernResponseFields({
      spgm_policy_context_status: "escalated_to_review",
      checks: [{ check: "spgm_policy_review_context", passed: true }],
    });

    assert.equal(fields.spgm_policy_context_status, "escalated_to_review");
    assert.equal(fields.spgm_policy_review_applied, true);
  });
});
