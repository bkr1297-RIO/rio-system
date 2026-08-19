import assert from "node:assert/strict";
import test from "node:test";
import { captureStableSnapshot } from "../src/stable-snapshot.mjs";
import { projectSnapshot } from "../src/project-k0-envelope.mjs";
import { canonicalJson } from "../src/stable-json.mjs";
import { fixedClock, INTENT, LEDGER_ENTRY } from "./helpers.mjs";

test("stable source record projects deterministically without silent promotions", async () => {
  const getJson = async (path) => path.includes("intents/")
    ? structuredClone(INTENT)
    : { entries: [structuredClone(LEDGER_ENTRY)], total: 1, chain_tip: "tip-001" };
  const snapshot = await captureStableSnapshot({ getJson, clock: fixedClock() });
  const [first] = projectSnapshot(snapshot);
  const [second] = projectSnapshot(structuredClone(snapshot));
  assert.equal(canonicalJson(first), canonicalJson(second));
  assert.equal(first.verificationInput.actualHistory, undefined);
  assert.equal(first.verificationInput.authorityBasis, undefined);
  assert.equal(first.verificationInput.attempt, undefined);
  assert.equal(first.verificationInput.settlement.status, "OPEN");
  assert.equal(first.verificationInput.observations[0].verdict, "INCONCLUSIVE");
  assert.equal(JSON.stringify(first).includes("private@example.com"), false);
  assert.equal(JSON.stringify(first).includes("sensitive detail"), false);
});
