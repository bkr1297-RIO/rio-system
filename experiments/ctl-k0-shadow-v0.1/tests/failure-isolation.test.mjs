import assert from "node:assert/strict";
import test from "node:test";
import { failureRecord } from "../src/shadow-sink.mjs";
import { SHADOW_LABELS } from "../src/evaluation-record.mjs";

test("observer failure has no decision or business-mutation effect", () => {
  const failure = failureRecord("K0_RUNNER", new Error("runner unavailable"), { requestId: "r1" });
  assert.equal(failure.status, "SHADOW_FAILURE_ISOLATED");
  assert.equal(failure.effectVector.businessMutationEffect, "NONE");
  assert.equal(failure.effectVector.rateLimitEffect, "PRESENT");
  assert.deepEqual(failure.labels, ["NON_AUTHORITATIVE_SHADOW", "NOT_FOR_DECISION_USE"]);
  assert.deepEqual(failure.labels, SHADOW_LABELS);
});
