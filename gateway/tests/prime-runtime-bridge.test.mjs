import test from "node:test";
import assert from "node:assert/strict";

import {
  executePrimeEcho,
  validateAuthorization,
  validatePrimeIr,
} from "../prime/bridge.mjs";

const IR = {
  source_expression: "7 -> 8 -> 7",
  lexicon_version: "prime-experimental-v0.1",
  symbols: ["7", "8", "7"],
  transitions: [
    { origin: "7", destination: "8", direction: "OUTWARD_TO_BOUNDARY" },
    { origin: "8", destination: "7", direction: "INWARD_FROM_BOUNDARY" },
  ],
  closed_path: true,
};

function approval(overrides = {}) {
  return {
    decision: "approved",
    action: "prime.echo",
    authorized_by: "human-test-authority",
    expires_at: new Date(Date.now() + 60_000).toISOString(),
    ...overrides,
  };
}

test("executes a bounded Prime echo and returns a valid native RIO receipt", () => {
  const result = executePrimeEcho({ ir: IR, authorization: approval() });

  assert.equal(result.status, "RETURNED");
  assert.equal(result.prime.returned_expression, "7 -> 8 -> 7");
  assert.equal(result.runtime.execution.result.effect, "ECHO_ONLY");
  assert.equal(result.runtime.execution.result.external_side_effects, false);
  assert.equal(result.runtime.execution.result.crossing_count, 2);
  assert.equal(result.receipt.action, "prime.echo");
  assert.equal(result.receipt_verification.valid, true);
  assert.equal(result.receipt.policy.decision, "ALLOW");
});

test("fails closed without explicit approval", () => {
  assert.throws(
    () => executePrimeEcho({ ir: IR, authorization: approval({ decision: "denied" }) }),
    /explicit approved authorization/,
  );
});

test("fails closed when authorization scope names another action", () => {
  assert.throws(
    () => executePrimeEcho({ ir: IR, authorization: approval({ action: "email.send" }) }),
    /Authorization action must be prime.echo/,
  );
});

test("fails closed on expired authorization", () => {
  assert.throws(
    () => validateAuthorization(approval({ expires_at: "2020-01-01T00:00:00.000Z" })),
    /expired or invalid/,
  );
});

test("rejects malformed Prime IR before execution", () => {
  assert.throws(
    () => validatePrimeIr({ ...IR, transitions: [] }),
    /transition count does not match/,
  );
});
