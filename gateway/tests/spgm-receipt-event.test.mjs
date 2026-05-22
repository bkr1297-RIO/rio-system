/**
 * SPG-M Receipt Event Handoff Tests
 *
 * Tests non-executing receipt handoff packet construction.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { processSpgmIntake } from "../spgm/intake.mjs";
import {
  buildSpgmReceiptHandoff,
  maybeBuildSpgmReceiptHandoff,
} from "../spgm/receipt-event.mjs";

const relationalPacket = {
  signal: {
    literal_description: "Human reports a relational pattern involving another person.",
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

describe("SPG-M Receipt Event Handoff", () => {
  it("builds a recommended BLOCK handoff for Class 3 route events", () => {
    const intakeResult = processSpgmIntake(relationalPacket);
    const handoff = buildSpgmReceiptHandoff(relationalPacket, intakeResult);

    assert.equal(handoff.status, "recommended");
    assert.equal(handoff.profile, "SPG-M");
    assert.equal(handoff.proof_layer, "rio-receipt-protocol");
    assert.equal(handoff.non_executing, true);
    assert.equal(handoff.receipt_decision_hint, "BLOCK");
    assert.equal(handoff.spgm_result.consequence_class, 3);
    assert.equal(handoff.routing.rio_required, true);
    assert.equal(handoff.routing.muss_required, true);
    assert.equal(handoff.signal.signal_type, "relational");
    assert.equal(handoff.proposed_use.proposed_action, "start_conversation");
    assert.equal(handoff.non_claims.not_action_authorization, true);
  });

  it("returns null for private non-consequential reflection", () => {
    const packet = {
      signal: {
        literal_description: "Human reports a private journaling pattern.",
        signal_type: "pattern",
      },
      proposed_use: {
        use_type: "reflect",
        affected_parties: [],
      },
    };

    const intakeResult = processSpgmIntake(packet);
    assert.equal(intakeResult.receipt_event.recommended, false);
    assert.equal(maybeBuildSpgmReceiptHandoff(packet, intakeResult), null);
  });

  it("attaches receipt_handoff to consequential SPG-M intake output", () => {
    const result = processSpgmIntake(relationalPacket);

    assert.ok(result.receipt_handoff);
    assert.equal(result.receipt_handoff.status, "recommended");
    assert.equal(result.receipt_handoff.receipt_decision_hint, "BLOCK");
    assert.match(result.receipt_handoff.boundary, /does not approve/);
  });
});
