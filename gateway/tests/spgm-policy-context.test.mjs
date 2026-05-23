/**
 * SPG-M Policy Context Tests
 *
 * Tests non-executing policy context generation for SPG-M intake results.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { processSpgmIntake } from "../spgm/intake.mjs";
import {
  buildSpgmPolicyContext,
  maybeBuildSpgmPolicyContext,
} from "../spgm/policy-context.mjs";

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

describe("SPG-M Policy Context", () => {
  it("builds policy context from consequential SPG-M intake", () => {
    const intakeResult = processSpgmIntake(relationalPacket);
    const context = buildSpgmPolicyContext(relationalPacket, intakeResult);

    assert.equal(context.context_type, "spgm_policy_context");
    assert.equal(context.status, "prepared");
    assert.equal(context.mode, "non_executing");
    assert.equal(context.spgm.consequence_class, 3);
    assert.equal(context.routing.rio_required, true);
    assert.equal(context.routing.muss_required, true);
    assert.equal(context.receipt_handoff_present, true);
    assert.equal(context.boundary_flags.receipt_decision_hint, "BLOCK");
  });

  it("preserves non-authority policy use flags", () => {
    const intakeResult = processSpgmIntake(relationalPacket);
    const context = maybeBuildSpgmPolicyContext(relationalPacket, intakeResult);

    assert.equal(context.policy_use.may_inform_policy_review, true);
    assert.equal(context.policy_use.may_create_authorization, false);
    assert.equal(context.policy_use.may_create_execution, false);
    assert.equal(context.policy_use.may_write_ledger, false);
    assert.equal(context.policy_use.may_create_memory, false);
    assert.match(context.authority_boundary, /cannot approve/);
  });

  it("is attached to SPG-M intake output", () => {
    const result = processSpgmIntake(relationalPacket);

    assert.ok(result.policy_context);
    assert.equal(result.policy_context.context_type, "spgm_policy_context");
    assert.equal(result.policy_context.source.route, "/spgm/intake");
    assert.equal(result.policy_context.boundary_flags.non_executing, true);
  });

  it("returns null without an SPG-M result", () => {
    assert.equal(maybeBuildSpgmPolicyContext(relationalPacket, {}), null);
  });
});
