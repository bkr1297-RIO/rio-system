import test from "node:test";
import assert from "node:assert/strict";
import express from "express";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { createPrimeRuntimeRouter } from "../routes/prime-runtime.mjs";
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
  return {
    decision: "approved",
    action,
    authorized_by: "human-test-authority",
    expires_at: new Date(Date.now() + 60_000).toISOString(),
  };
}

function workspace(t) {
  const root = mkdtempSync(join(tmpdir(), "prime-workspace-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  return root;
}

async function startApp(t, { authenticated = true, root = workspace(t) } = {}) {
  const sandbox = new PrimeSandbox({ store: new PrimeWorkspaceStore({ root }) });
  const requireWrite = authenticated
    ? (_req, _res, next) => next()
    : (_req, res) => res.status(401).json({ error: "Authentication required." });
  const app = express();
  app.use(express.json());
  app.use("/api/v1", createPrimeRuntimeRouter({ sandbox, requireWrite }));
  const server = await new Promise((resolve) => {
    const listener = app.listen(0, "127.0.0.1", () => resolve(listener));
  });
  t.after(() => server.close());
  return { sandbox, server, base: `http://127.0.0.1:${server.address().port}`, root };
}

async function post(base, path, body) {
  const response = await fetch(`${base}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  return { status: response.status, body: await response.json() };
}

test("authenticated Prime workspace set and rollback produce verified RIO receipts", async (t) => {
  const { sandbox, base } = await startApp(t);

  const set = await post(base, "/api/v1/prime/execute", {
    ir: IR,
    authorization: approval("prime.sandbox.set"),
    key: "demo.signal",
    value: "7 -> 8 -> 7",
  });
  assert.equal(set.status, 201);
  assert.equal(set.body.operation, "prime.sandbox.set");
  assert.equal(set.body.execution.persistent, true);
  assert.equal(set.body.verification.valid, true);
  assert.equal(sandbox.get("demo.signal"), "7 -> 8 -> 7");

  const rollback = await post(base, "/api/v1/prime/rollback", {
    ir: IR,
    authorization: approval("prime.sandbox.rollback"),
    rollback_token: set.body.execution.rollback_token,
  });
  assert.equal(rollback.status, 200);
  assert.equal(rollback.body.operation, "prime.sandbox.rollback");
  assert.equal(rollback.body.verification.valid, true);
  assert.equal(sandbox.get("demo.signal"), undefined);

  const replay = await post(base, "/api/v1/prime/rollback", {
    ir: IR,
    authorization: approval("prime.sandbox.rollback"),
    rollback_token: set.body.execution.rollback_token,
  });
  assert.equal(replay.status, 400);
  assert.match(replay.body.error, /already used/);
});

test("workspace state and rollback capability survive a fresh sandbox instance", (t) => {
  const root = workspace(t);
  const first = new PrimeSandbox({ store: new PrimeWorkspaceStore({ root }) });
  const set = first.set({ ir: IR, authorization: approval("prime.sandbox.set"), key: "durable.signal", value: "formed" });

  const restarted = new PrimeSandbox({ store: new PrimeWorkspaceStore({ root }) });
  assert.equal(restarted.get("durable.signal"), "formed");
  const rollback = restarted.rollback({
    ir: IR,
    authorization: approval("prime.sandbox.rollback"),
    rollback_token: set.execution.rollback_token,
  });
  assert.equal(rollback.verification.valid, true);
  assert.equal(restarted.get("durable.signal"), undefined);

  const restartedAgain = new PrimeSandbox({ store: new PrimeWorkspaceStore({ root }) });
  assert.throws(
    () => restartedAgain.rollback({ ir: IR, authorization: approval("prime.sandbox.rollback"), rollback_token: set.execution.rollback_token }),
    /already used/,
  );
});

test("endpoint blocks requests when authentication middleware denies access", async (t) => {
  const { base } = await startApp(t, { authenticated: false });
  const result = await post(base, "/api/v1/prime/execute", {
    ir: IR,
    authorization: approval("prime.sandbox.set"),
    key: "blocked",
    value: "never-written",
  });
  assert.equal(result.status, 401);
  assert.match(result.body.error, /Authentication required/);
});

test("wrong authorization scope fails closed before workspace mutation", (t) => {
  const sandbox = new PrimeSandbox({ store: new PrimeWorkspaceStore({ root: workspace(t) }) });
  assert.throws(
    () => sandbox.set({ ir: IR, authorization: approval("prime.echo"), key: "x", value: "y" }),
    /Authorization action must be prime.sandbox.set/,
  );
  assert.equal(sandbox.get("x"), undefined);
});

test("rollback refuses when persistent state changed after the receipted mutation", (t) => {
  const sandbox = new PrimeSandbox({ store: new PrimeWorkspaceStore({ root: workspace(t) }) });
  const set = sandbox.set({ ir: IR, authorization: approval("prime.sandbox.set"), key: "x", value: "one" });
  sandbox.store.setValue("x", "unreceipted-change");
  assert.throws(
    () => sandbox.rollback({ ir: IR, authorization: approval("prime.sandbox.rollback"), rollback_token: set.execution.rollback_token }),
    /state changed after the receipted mutation/,
  );
});
