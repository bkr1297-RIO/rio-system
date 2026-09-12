import assert from "node:assert/strict";
import test from "node:test";
import { dedupeKey } from "../src/stable-snapshot.mjs";
import { LEDGER_ENTRY } from "./helpers.mjs";

test("replay idempotency key binds entry_id plus ledger_hash rather than database id", () => {
  const withDatabaseId = { ...LEDGER_ENTRY, id: 88 };
  assert.equal(dedupeKey(LEDGER_ENTRY), dedupeKey(withDatabaseId));
  assert.notEqual(dedupeKey(LEDGER_ENTRY), dedupeKey({ ...LEDGER_ENTRY, ledger_hash: "different" }));
});
