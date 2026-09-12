import assert from "node:assert/strict";
import test from "node:test";
import { captureStableSnapshot } from "../src/stable-snapshot.mjs";
import { projectSnapshot } from "../src/project-k0-envelope.mjs";
import { canonicalJson } from "../src/stable-json.mjs";
import { fixedClock, LEDGER_ENTRY } from "./helpers.mjs";

test("stable source record projects deterministically without silent promotions", async () => {
  const getJson = async () => ({ entries: [structuredClone(LEDGER_ENTRY)], total: 1, chain_tip: "tip-001" });
  const snapshot = await captureStableSnapshot({ getJson, clock: fixedClock() });
  const [first] = projectSnapshot(snapshot);
  const [second] = projectSnapshot(structuredClone(snapshot));
  assert.equal(canonicalJson(first), canonicalJson(second));
  assert.equal(first.verificationInput.actualHistory, undefined);
  assert.equal(first.verificationInput.authorityBasis, undefined);
  assert.equal(first.verificationInput.attempt, undefined);
  assert.equal(first.verificationInput.settlement, undefined);
  assert.equal(first.verificationInput.observations[0].verdict, "INCONCLUSIVE");
  assert.equal(JSON.stringify(first).includes("sensitive detail"), false);
  assert.equal(JSON.stringify(first).includes("intent-001"), false);
  assert.equal(JSON.stringify(first).includes("bondi"), false);
});

test("unknown runtime actions remain fixed, undefined, and data-minimized", async () => {
  const unknownEntry = { ...LEDGER_ENTRY, action: "private-action-name" };
  const getJson = async () => ({ entries: [structuredClone(unknownEntry)], total: 1, chain_tip: "tip-001" });
  const [request] = projectSnapshot(await captureStableSnapshot({ getJson, clock: fixedClock() }));
  assert.equal(request.verificationInput.program.kind, "RIO_UNMAPPED_ACTION");
  assert.equal(JSON.stringify(request).includes("private-action-name"), false);
});
