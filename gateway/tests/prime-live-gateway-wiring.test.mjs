import test from "node:test";
import assert from "node:assert/strict";
import express from "express";

import apiV1BridgeRoutes from "../routes/spgm-api-v1-govern.mjs";
import { primeSandbox } from "../prime/sandbox.mjs";

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
    authorized_by: "human-live-wiring-test",
    expires_at: new Date(Date.now() + 60_000).toISOString(),
  };
}

async function startApp({ authenticated = true } = {}) {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    if (authenticated) {
      req.authMethod = "jwt";
      req.user = { sub: "I-1", role: "owner" };
    } else {
      req.authMethod = "none";
    }
    next();
  });
  app.use("/api/v1", apiV1BridgeRoutes);
  const server = await new Promise((resolve) => {
    const listener = app.listen(0, "127.0.0.1", () => resolve(listener));
  });
  return { server, base: `http://127.0.0.1:${server.address().port}` };
}

async function post(base, path, body) {
  const response = await fetch(`${base}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  return { status: response.status, body: await response.json() };
}

test("mounted API v1 bridge executes and rolls back the reversible Prime action", async (t) => {
  const { server, base } = await startApp();
  t.after(() => server.close());

  const key = `live.${Date.now()}`;
  const set = await post(base, "/api/v1/prime/execute", {
    ir: IR,
    authorization: approval("prime.sandbox.set"),
    key,
    value: "bounded consequence",
  });

  assert.equal(set.status, 201);
  assert.equal(set.body.operation, "prime.sandbox.set");
  assert.equal(set.body.verification.valid, true);
  assert.equal(primeSandbox.get(key), "bounded consequence");

  const rollback = await post(base, "/api/v1/prime/rollback", {
    ir: IR,
    authorization: approval("prime.sandbox.rollback"),
    rollback_token: set.body.execution.rollback_token,
  });

  assert.equal(rollback.status, 200);
  assert.equal(rollback.body.operation, "prime.sandbox.rollback");
  assert.equal(rollback.body.verification.valid, true);
  assert.equal(primeSandbox.get(key), undefined);
});

test("mounted API v1 bridge rejects unauthenticated Prime consequence", async (t) => {
  const { server, base } = await startApp({ authenticated: false });
  t.after(() => server.close());

  const response = await post(base, "/api/v1/prime/execute", {
    ir: IR,
    authorization: approval("prime.sandbox.set"),
    key: "blocked.signal",
    value: "must not cross",
  });

  assert.equal(response.status, 401);
  assert.match(response.body.error, /Authentication required/);
});
