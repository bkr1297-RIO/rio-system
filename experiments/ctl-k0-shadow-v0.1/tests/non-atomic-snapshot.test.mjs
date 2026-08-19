import assert from "node:assert/strict";
import test from "node:test";
import { captureStableSnapshot, classifyEpoch } from "../src/stable-snapshot.mjs";
import { projectSnapshot } from "../src/project-k0-envelope.mjs";
import { fixedClock, INTENT, LEDGER_ENTRY } from "./helpers.mjs";

test("changed chain tip holds the capture and emits no K0 requests", async () => {
  let ledgerRead = 0;
  const getJson = async (path) => {
    if (path.includes("intents/")) return structuredClone(INTENT);
    ledgerRead += 1;
    return {
      entries: [structuredClone(LEDGER_ENTRY)],
      total: ledgerRead,
      chain_tip: `tip-${ledgerRead}`,
    };
  };
  const snapshot = await captureStableSnapshot({ getJson, clock: fixedClock(), maxAttempts: 2 });
  assert.equal(snapshot.atomicity, "NON_ATOMIC_SNAPSHOT");
  assert.deepEqual(projectSnapshot(snapshot), []);
});

test("source rewind and equal-height tip changes are explicit", () => {
  assert.equal(classifyEpoch({ total: 10, chainTip: "a" }, { total: 9, chainTip: "b" }), "SOURCE_REWIND");
  assert.equal(classifyEpoch({ total: 10, chainTip: "a" }, { total: 10, chainTip: "b" }), "EPOCH_RUPTURE");
});
