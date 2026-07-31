import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { PrimeSandbox } from "../prime/sandbox.mjs";
import { PrimeWorkspaceStore } from "../prime/workspace-store.mjs";

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

function approval(action) {
  return { decision: "approved", action, authorized_by: "human-test-authority", expires_at: new Date(Date.now() + 60_000).toISOString() };
}

test("returned receipt is the exact proof atomically persisted with committed state", () => {
  const root = mkdtempSync(join(tmpdir(), "prime-proof-coupling-"));
  try {
    const store = new PrimeWorkspaceStore({ root });
    const sandbox = new PrimeSandbox({ store });
    const result = sandbox.set({ ir: IR, authorization: approval("prime.sandbox.set"), key: "proof.signal", value: "committed" });

    const proof = store.getProof(result.execution.durable_proof_id);
    assert.ok(proof);
    assert.deepEqual(proof.receipt, result.receipt);
    assert.deepEqual(proof.verification, result.verification);
    assert.equal(proof.revision, result.execution.workspace_revision);
    assert.equal(store.get("proof.signal"), "committed");
    assert.equal(store.snapshot().latest_proof_id, result.execution.durable_proof_id);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("set and rollback each advance one proof-bound workspace revision", () => {
  const root = mkdtempSync(join(tmpdir(), "prime-proof-revisions-"));
  try {
    const sandbox = new PrimeSandbox({ store: new PrimeWorkspaceStore({ root }) });
    const set = sandbox.set({ ir: IR, authorization: approval("prime.sandbox.set"), key: "proof.signal", value: "current" });
    const rollback = sandbox.rollback({ ir: IR, authorization: approval("prime.sandbox.rollback"), rollback_token: set.execution.rollback_token });

    const recovered = new PrimeWorkspaceStore({ root });
    const state = recovered.snapshot();
    assert.equal(state.revision, 2);
    assert.equal(state.latest_proof_id, rollback.execution.durable_proof_id);
    assert.deepEqual(state.proofs[set.execution.durable_proof_id].receipt, set.receipt);
    assert.deepEqual(state.proofs[rollback.execution.durable_proof_id].receipt, rollback.receipt);
    assert.equal(state.rollbacks[set.execution.rollback_token].rollback_proof_id, rollback.execution.durable_proof_id);
    assert.equal(recovered.get("proof.signal"), undefined);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("canonical state without its declared durable proof fails closed on recovery", () => {
  const root = mkdtempSync(join(tmpdir(), "prime-proof-torn-state-"));
  try {
    const sandbox = new PrimeSandbox({ store: new PrimeWorkspaceStore({ root }) });
    const result = sandbox.set({ ir: IR, authorization: approval("prime.sandbox.set"), key: "proof.signal", value: "committed" });
    const path = join(root, "prime-workspace-state.json");
    const state = JSON.parse(readFileSync(path, "utf8"));
    delete state.proofs[result.execution.durable_proof_id];
    writeFileSync(path, `${JSON.stringify(state, null, 2)}\n`);

    assert.throws(() => new PrimeWorkspaceStore({ root }), /missing durable proof/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("proof record claiming a different revision fails closed on recovery", () => {
  const root = mkdtempSync(join(tmpdir(), "prime-proof-torn-proof-"));
  try {
    const sandbox = new PrimeSandbox({ store: new PrimeWorkspaceStore({ root }) });
    const result = sandbox.set({ ir: IR, authorization: approval("prime.sandbox.set"), key: "proof.signal", value: "committed" });
    const path = join(root, "prime-workspace-state.json");
    const state = JSON.parse(readFileSync(path, "utf8"));
    state.proofs[result.execution.durable_proof_id].revision = 999;
    writeFileSync(path, `${JSON.stringify(state, null, 2)}\n`);

    assert.throws(() => new PrimeWorkspaceStore({ root }), /missing durable proof/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
