/**
 * SPG-M Policy Adapter Tests
 *
 * Tests conversion of SPG-M policy_context into non-authorizing
 * RIO review metadata.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { processSpgmIntake } from "../spgm/intake.mjs";
import {
  validateSpgmPolicyContext,
  buildSpgmPolicyReviewMetadata,
  buildSpgmPolicyReviewFromIntakeResult,
} from "../spgm/policy-adapter.mjs";

const relationalPacket = {
  signal: {
    literal_description: "Human reports a recurring relational pattern involving another person.",
    signal_type: "relational",
    source_context: "conversation planning",
    recurrence_claimed: true,
  },
  proposed_use: {
    use_type: "propose",
    proposed_action: "start_conversation",
    affected_parties: ["other_person"],
    known_domains: ["relationship"],
  },
  machine_assistance: {
    used: true,
    role: "classification",
  },
};

describe("SPG-M Policy Adapter", () => {
  it("accepts valid SPG-M policy context", () => {
    const intakeResult = processSpgmIntake(relationalPacket);
    const validation = validateSpgmPolicyContext(intakeResult.policy_context);

    assert.equal(validation.valid, true);
    assert.deepEqual(validation.errors, []);
  });

  it("rejects missing policy context", () => {
    const validation = validateSpgmPolicyContext(null);

    assert.equal(validation.valid, false);
    assert.ok(validation.errors.includes("policy_context must be an object"));
  });

  it("rejects policy context that could create authorization", () => {
    const intakeResult = processSpgmIntake(relationalPacket);
    const unsafeContext = structuredClone(intakeResult.policy_context);
    unsafeContext.policy_use.may_create_authorization = true;

    const validation = validateSpgmPolicyContext(unsafeContext);

    assert.equal(validation.valid, false);
    assert.ok(validation.errors.includes("policy_context.policy_use.may_create_authorization must be false"));
  });

  it("rejects policy context that is not non-executing", () => {
    const intakeResult = processSpgmIntake(relationalPacket);
    const unsafeContext = structuredClone(intakeResult.policy_context);
    unsafeContext.mode = "executing";

    const validation = validateSpgmPolicyContext(unsafeContext);

    assert.equal(validation.valid, false);
    assert.ok(validation.errors.includes("policy_context.mode must be non_executing"));
  });

  it("builds accepted review metadata without authority", () => {
    const intakeResult = processSpgmIntake(relationalPacket);
    const review = buildSpgmPolicyReviewMetadata(intakeResult.policy_context);

    assert.equal(review.accepted, true);
    assert.equal(review.context_type, "spgm_policy_review_metadata");
    assert.equal(review.mode, "non_executing");
    assert.equal(review.consequence_class, 3);
    assert.equal(review.rio_required, true);
    assert.equal(review.muss_required, true);
    assert.equal(review.policy_effect.may_inform_policy_review, true);
    assert.equal(review.policy_effect.may_authorize, false);
    assert.equal(review.policy_effect.may_execute, false);
    assert.equal(review.policy_effect.may_write_ledger, false);
    assert.equal(review.policy_effect.may_create_memory, false);
    assert.equal(review.required_action, "rio_review_required");
  });

  it("rejects unsafe review metadata", () => {
    const review = buildSpgmPolicyReviewMetadata({
      context_type: "spgm_policy_context",
      mode: "executing",
      policy_use: {
        may_create_authorization: true,
        may_create_execution: false,
        may_write_ledger: false,
        may_create_memory: false,
      },
      boundary_flags: {
        non_executing: false,
        signal_not_command: true,
        interpretation_provisional: true,
        machine_boundary_preserved: true,
      },
    });

    assert.equal(review.accepted, false);
    assert.equal(review.policy_effect.may_inform_policy_review, false);
    assert.equal(review.policy_effect.may_authorize, false);
    assert.equal(review.required_action, "reject_or_contain_context");
  });

  it("builds review metadata from intake result", () => {
    const intakeResult = processSpgmIntake(relationalPacket);
    const review = buildSpgmPolicyReviewFromIntakeResult(intakeResult);

    assert.equal(review.accepted, true);
    assert.equal(review.source.route, "/spgm/intake");
    assert.match(review.authority_boundary, /cannot authorize/);
  });
});
