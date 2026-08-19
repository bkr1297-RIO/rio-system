import assert from "node:assert/strict";
import test from "node:test";
import { captureStableSnapshot } from "../src/stable-snapshot.mjs";
import { projectSnapshot } from "../src/project-k0-envelope.mjs";
import { createEvaluationRecord } from "../src/evaluation-record.mjs";
import { classifyDisagreement, hypotheticalControlProjection } from "../src/control-projection.mjs";
import { fixedClock, LEDGER_ENTRY } from "./helpers.mjs";

async function evaluation() {
  const getJson = async () => ({ entries: [structuredClone(LEDGER_ENTRY)], total: 1, chain_tip: "tip-001" });
  const snapshot = await captureStableSnapshot({ getJson, clock: fixedClock() });
  const [request] = projectSnapshot(snapshot);
  return createEvaluationRecord({ snapshot, request });
}

test("every evaluation is shadow-owned, retrospective, and promotion-ineligible", async () => {
  const record = await evaluation();
  assert.deepEqual(record.labels, ["NON_AUTHORITATIVE_SHADOW", "NOT_FOR_DECISION_USE"]);
  assert.equal(record.gatewayEffect, "NONE");
  assert.equal(record.captureMode, "POST_FACTO_RETROSPECTIVE");
  assert.equal(record.humanVisible, false);
  assert.equal(record.sealedBeforeHumanDisposition, false);
  assert.equal(record.promotionEligible, false);
  assert.equal(record.report, null);
  assert.equal(record.sourceConsistency, "CHAIN_TIP_STABLE_NON_ATOMIC");
  assert.deepEqual(record.sourceCoverage, { offset: 0, requestedLimit: 20, returnedCount: 1, total: 1 });
});

test("incomplete telemetry is a gap, not K0-human disagreement", async () => {
  const record = await evaluation();
  const projection = hypotheticalControlProjection(record);
  const disagreement = classifyDisagreement(projection, {
    dispositionId: "human-1",
    humanSawK0: false,
    disposition: "APPROVE",
  });
  assert.equal(projection.mode, "HYPOTHETICAL_ONLY");
  assert.equal(projection.gatewayEffect, "NONE");
  assert.equal(disagreement.classification, "INPUT_TELEMETRY_GAP");
});
