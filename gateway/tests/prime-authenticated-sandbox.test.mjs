import test from "node:test";
import assert from "node:assert/strict";
import express from "express";

import { createPrimeRuntimeRouter } from "../routes/prime-runtime.mjs";
import { PrimeSandbox } from "../prime/sandbox.mjs";

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

async function startApp({ authenticated = true } = {}) {
  const sandbox = new PrimeSandbox();
  const requireWrite = authenticated
    ? (_req, _res, next) => next()
    : (_req, res) => res.status(401).json({ error: "Authentication required." });
  const app = express();
  app.use(express.json());
  app.use("/api/v1", createPrimeRuntimeRouter({ sandbox, requireWrite }));
  const server = await new Promise((resolve) => {
    const listener = app.listen(0, "127.0.0.1", () => resolve(listener));
  });
  return { sandbox, server, base: `http://127.0.0.1:${server.address().port}` };
}

async function post(base, path, body) {
  const response = await fetch(`${base}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  return { status: response.status, body: await response.json() };
}

test("authenticated Prime sandbox set and rollback produce verified RIO receipts", async (t) => {
  const { sandbox, server, base } = await startApp();
  t.after(() => server.close());

  const set = await post(base, "/api/v1/prime/execute", {
    ir: IR,
    authorization: approval("prime.sandbox.set"),
    key: "demo.signal",
    value: "7 -> 8 -> 7",
  });
  assert.equal(set.status, 201);
  assert.equal(set.body.operation, "prime.sandbox.set");
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

test("endpoint blocks requests when authentication middleware denies access", async (t) => {
  const { server, base } = await startApp({ authenticated: false });
  t.after(() => server.close());
  const result = await post(base, "/api/v1/prime/execute", {
    ir: IR,
    authorization: approval("prime.sandbox.set"),
    key: "blocked",
    value: "never-written",
  });
  assert.equal(result.status, 401);
  assert.match(result.body.error, /Authentication required/);
});

test("wrong authorization scope fails closed before sandbox mutation", () => {
  const sandbox = new PrimeSandbox();
  assert.throws(
    () => sandbox.set({ ir: IR, authorization: approval("prime.echo"), key: "x", value: "y" }),
    /Authorization action must be prime.sandbox.set/,
  );
  assert.equal(sandbox.get("x"), undefined);
});

test("rollback refuses when state changed after the receipted mutation", () => {
  const sandbox = new PrimeSandbox();
  const set = sandbox.set({ ir: IR, authorization: approval("prime.sandbox.set"), key: "x", value: "one" });
  sandbox.values.set("x", "unreceipted-change");
  assert.throws(
    () => sandbox.rollback({ ir: IR, authorization: approval("prime.sandbox.rollback"), rollback_token: set.execution.rollback_token }),
    /state changed after the receipted mutation/,
  );
});
