/**
 * SPG-M Intake Processor Tests
 *
 * Tests the non-executing SPG-M intake processor.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  classifySpgmConsequence,
  processSpgmIntake,
} from "../spgm/intake.mjs";

describe("SPG-M Intake Processor", () => {
  it("classifies private reflection as Class 1", () => {
    const result = processSpgmIntake({
      signal: {
        literal_description: "Human reports a recurring symbol during journaling.",
        signal_type: "pattern",
      },
      proposed_use: {
        use_type: "reflect",
        affected_parties: [],
      },
    });

    assert.equal(result.spgm_result.consequence_class, 1);
    assert.equal(result.spgm_result.status, "record");
    assert.equal(result.routing.rio_required, false);
    assert.equal(result.routing.muss_required, false);
    assert.equal(result.next_step, "private_reflection");
  });

  it("routes relational action as Class 3", () => {
    const result = processSpgmIntake({
      signal: {
        literal_description: "Human reports a pattern involving another person.",
        signal_type: "relational",
      },
      proposed_use: {
        use_type: "propose",
        affected_parties: ["other_person"],
      },
    });

    assert.equal(result.spgm_result.consequence_class, 3);
    assert.equal(result.spgm_result.status, "route");
    assert.equal(result.routing.rio_required, true);
    assert.equal(result.routing.muss_required, true);
    assert.equal(result.next_step, "policy_review");
  });

  it("classifies material domains as Class 4", () => {
    assert.equal(classifySpgmConsequence({
      signal: { literal_description: "Signal around a contract." },
      proposed_use: {
        use_type: "classify",
        known_domains: ["contract"],
      },
    }), 4);
  });

  it("classifies system or memory use as Class 5", () => {
    assert.equal(classifySpgmConsequence({
      signal: { literal_description: "Signal should update a pattern log." },
      proposed_use: {
        use_type: "memory",
        pattern_log_requested: true,
      },
    }), 5);
  });

  it("refuses command-style use", () => {
    const result = processSpgmIntake({
      signal: {
        literal_description: "Human reports a signal.",
        signal_type: "pattern",
      },
      proposed_use: {
        use_type: "propose",
        treat_signal_as_command: true,
        affected_parties: ["other_person"],
      },
    });

    assert.equal(result.spgm_result.status, "refuse");
    assert.equal(result.next_step, "containment");
  });

  it("holds when no literal signal is present", () => {
    const result = processSpgmIntake({
      proposed_use: {
        use_type: "reflect",
      },
    });

    assert.equal(result.spgm_result.status, "hold");
    assert.equal(result.spgm_result.fact_symbol_separated, false);
  });

  it("returns a non-executing authority boundary", () => {
    const result = processSpgmIntake({
      signal: { literal_description: "Signal." },
      proposed_use: { use_type: "reflect" },
    });

    assert.match(result.authority_boundary, /non-executing/);
    assert.match(result.authority_boundary, /does not approve/);
  });
});
