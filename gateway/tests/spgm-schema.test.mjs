/**
 * SPG-M Intake Schema Tests
 *
 * Tests lightweight validation for the non-executing SPG-M intake path.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  validateSpgmIntake,
  buildInvalidSpgmIntakeResponse,
} from "../spgm/schema.mjs";

describe("SPG-M Intake Schema", () => {
  it("accepts a valid private reflection packet", () => {
    const validation = validateSpgmIntake({
      signal: {
        literal_description: "Human reports a recurring symbol during journaling.",
        signal_type: "pattern",
        recurrence_claimed: true,
      },
      proposed_use: {
        use_type: "reflect",
        affected_parties: [],
        known_domains: ["journal"],
      },
      machine_assistance: {
        used: false,
        role: null,
      },
    });

    assert.equal(validation.valid, true);
    assert.deepEqual(validation.errors, []);
  });

  it("rejects packets without a signal object", () => {
    const validation = validateSpgmIntake({
      proposed_use: { use_type: "reflect" },
    });

    assert.equal(validation.valid, false);
    assert.ok(validation.errors.includes("signal must be an object"));
  });

  it("rejects packets without a literal signal string", () => {
    const validation = validateSpgmIntake({
      signal: { signal_type: "pattern" },
      proposed_use: { use_type: "reflect" },
    });

    assert.equal(validation.valid, false);
    assert.ok(validation.errors.includes("signal.literal_description is required as a string"));
  });

  it("rejects unknown signal types", () => {
    const validation = validateSpgmIntake({
      signal: {
        literal_description: "Signal.",
        signal_type: "unsupported",
      },
      proposed_use: { use_type: "reflect" },
    });

    assert.equal(validation.valid, false);
    assert.ok(validation.errors.some((error) => error.startsWith("signal.signal_type must be one of")));
  });

  it("rejects unknown proposed use types", () => {
    const validation = validateSpgmIntake({
      signal: {
        literal_description: "Signal.",
        signal_type: "pattern",
      },
      proposed_use: { use_type: "execute_now" },
    });

    assert.equal(validation.valid, false);
    assert.ok(validation.errors.some((error) => error.startsWith("proposed_use.use_type must be one of")));
  });

  it("rejects malformed machine assistance fields", () => {
    const validation = validateSpgmIntake({
      signal: {
        literal_description: "Signal.",
        signal_type: "pattern",
      },
      proposed_use: { use_type: "reflect" },
      machine_assistance: {
        used: "yes",
      },
    });

    assert.equal(validation.valid, false);
    assert.ok(validation.errors.includes("machine_assistance.used must be boolean when provided"));
  });

  it("builds non-executing hold response for invalid packets", () => {
    const response = buildInvalidSpgmIntakeResponse(["signal must be an object"]);

    assert.equal(response.spgm_result.status, "hold");
    assert.equal(response.spgm_result.fact_symbol_separated, false);
    assert.equal(response.routing.rio_required, false);
    assert.equal(response.routing.muss_required, false);
    assert.equal(response.next_step, "containment");
    assert.match(response.authority_boundary, /non-executing/);
  });
});
