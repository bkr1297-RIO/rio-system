import assert from "node:assert/strict";
import test from "node:test";
import { failureRecord } from "../src/shadow-sink.mjs";

test("observer failure is explicitly isolated from gateway effect", () => {
  const failure = failureRecord("K0_RUNNER", new Error("runner unavailable"), { requestId: "r1" });
  assert.equal(failure.status, "SHADOW_FAILURE_ISOLATED");
  assert.equal(failure.gatewayEffect, "NONE");
  assert.deepEqual(failure.labels, ["NON_AUTHORITATIVE_SHADOW", "NOT_FOR_DECISION_USE"]);
});
