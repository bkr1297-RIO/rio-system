import test from "node:test";
import assert from "node:assert/strict";
import primeRouter, { handlePrimeExecute } from "../routes/prime-api-v1.mjs";

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

function authorization(overrides = {}) {
  return {
    decision: "approved",
    action: "prime.echo",
    authorized_by: "human-root",
    expires_at: new Date(Date.now() + 60_000).toISOString(),
    ...overrides,
  };
}

function responseRecorder() {
  return {
    statusCode: null,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.body = body;
      return this;
    },
  };
}

test("router exposes POST /prime/execute", () => {
  const layer = primeRouter.stack.find((entry) => entry.route?.path === "/prime/execute");
  assert.ok(layer);
  assert.deepEqual(layer.route.methods, { post: true });
});

test("authenticated executor receives verified Prime runtime return", () => {
  const req = {
    body: { ir: IR, authorization: authorization() },
    principal: { principal_id: "gateway-exec", primary_role: "executor", status: "active" },
  };
  const res = responseRecorder();

  handlePrimeExecute(req, res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.status, "RETURNED");
  assert.equal(res.body.prime.returned_expression, "7 -> 8 -> 7");
  assert.equal(res.body.runtime.execution.result.external_side_effects, false);
  assert.equal(res.body.receipt_verification.valid, true);
  assert.equal(res.body.authenticated_principal, "gateway-exec");
  assert.equal(res.body.route, "/api/v1/prime/execute");
});

test("malformed IR fails closed with 400", () => {
  const req = {
    body: { ir: { symbols: [] }, authorization: authorization() },
    principal: { principal_id: "gateway-exec" },
  };
  const res = responseRecorder();

  handlePrimeExecute(req, res);

  assert.equal(res.statusCode, 400);
  assert.equal(res.body.error, "PRIME_IR_INVALID");
  assert.equal(res.body.fail_mode, "closed");
});

test("denied authorization fails closed with 403", () => {
  const req = {
    body: { ir: IR, authorization: authorization({ decision: "denied" }) },
    principal: { principal_id: "gateway-exec" },
  };
  const res = responseRecorder();

  handlePrimeExecute(req, res);

  assert.equal(res.statusCode, 403);
  assert.equal(res.body.error, "PRIME_AUTHORIZATION_INVALID");
  assert.equal(res.body.fail_mode, "closed");
});
