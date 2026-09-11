import test from "node:test";
import assert from "node:assert/strict";
import { createHash, generateKeyPairSync, sign as nodeSign, verify as nodeVerify } from "node:crypto";
import { readFileSync } from "node:fs";
import vm from "node:vm";

import {
  canonicalizeArgs,
  computeArgsHash,
  issueExecutionToken,
  validateAndBurnToken,
} from "../security/token-manager.mjs";
import { requiresReplayPrevention, validateRequestNonce } from "../security/replay-prevention.mjs";
import { createIntent, updateIntent, updateIntentIfStatus } from "../governance/intents.mjs";

const keypair = generateKeyPairSync("ed25519");
const signPayload = payload => nodeSign(null, Buffer.from(payload), keypair.privateKey).toString("hex");
const verifyPayload = (payload, signature) =>
  nodeVerify(null, Buffer.from(payload), keypair.publicKey, Buffer.from(signature, "hex"));
const hash = value => createHash("sha256").update(JSON.stringify(value)).digest("hex");
const binding = (args, signature) => ({
  tool_name: "send_email",
  args_hash: computeArgsHash(args),
  environment: "repair-test",
  signature,
  verifyFn: verifyPayload,
});

test("recursive canonicalization binds nested values and ignores object insertion order", () => {
  const first = { recipient: { address: "first@example.invalid", labels: ["A", "B"] }, body: "fixture" };
  const reordered = { body: "fixture", recipient: { labels: ["A", "B"], address: "first@example.invalid" } };
  const changed = { recipient: { address: "second@example.invalid", labels: ["A", "B"] }, body: "fixture" };
  assert.equal(canonicalizeArgs(first), canonicalizeArgs(reordered));
  assert.equal(computeArgsHash(first), computeArgsHash(reordered));
  assert.notEqual(computeArgsHash(first), computeArgsHash(changed));
});

test("non-JSON, accessor, hidden, sparse and cyclic argument carriers fail before hashing", () => {
  const cyclic = {}; cyclic.self = cyclic;
  const sparse = []; sparse[1] = "value";
  const hidden = {}; Object.defineProperty(hidden, "secret", { value: "value" });
  let getterCalls = 0;
  const accessor = Object.defineProperty({}, "secret", { enumerable: true, get() { getterCalls++; return "value"; } });
  for (const value of [{ missing: undefined }, { invalid: NaN }, { invalid: 1n }, { when: new Date() },
    { cyclic }, { sparse }, { hidden }, { accessor }]) assert.throws(() => computeArgsHash(value));
  assert.equal(getterCalls, 0);
});

test("issuance requires exact signed single-use bindings", () => {
  const argsHash = computeArgsHash({ body: "fixture" });
  assert.throws(() => issueExecutionToken("intent:string"));
  assert.throws(() => issueExecutionToken({ intent_id: "intent:missing" }));
  assert.throws(() => issueExecutionToken({ intent_id: "intent:unsigned", tool_name: "send_email", args_hash: argsHash, environment: "repair-test" }));
  assert.throws(() => issueExecutionToken({ intent_id: "intent:multi", tool_name: "send_email", args_hash: argsHash,
    environment: "repair-test", max_executions: 2, signFn: signPayload }));
});

test("omitted point-of-use checks fail without burning the token", () => {
  const args = { body: "fixture" };
  const issued = issueExecutionToken({ intent_id: "intent:mandatory", tool_name: "send_email",
    args_hash: computeArgsHash(args), environment: "repair-test", signFn: signPayload });
  const omitted = validateAndBurnToken("intent:mandatory", issued.token);
  assert.equal(omitted.valid, false);
  assert.equal(omitted.checks.binding_inputs_present, false);
  const admitted = validateAndBurnToken("intent:mandatory", issued.token, binding(args, issued.signature));
  assert.equal(admitted.valid, true);
  assert.ok(Object.values(admitted.checks).every(Boolean));
  assert.equal(validateAndBurnToken("intent:mandatory", issued.token, binding(args, issued.signature)).valid, false);
});

test("nested substitution and signature substitution both fail closed", () => {
  const args = { recipient: { address: "first@example.invalid" }, body: "fixture" };
  const issued = issueExecutionToken({ intent_id: "intent:substitution", tool_name: "send_email",
    args_hash: computeArgsHash(args), environment: "repair-test", signFn: signPayload });
  const changed = { recipient: { address: "second@example.invalid" }, body: "fixture" };
  assert.equal(validateAndBurnToken("intent:substitution", issued.token, binding(changed, issued.signature)).valid, false);
  assert.equal(validateAndBurnToken("intent:substitution", issued.token, binding(args, "00")).valid, false);
  assert.equal(validateAndBurnToken("intent:substitution", issued.token, binding(args, issued.signature)).valid, true);
});

test("guarded intent transition admits one local reservation", () => {
  const intent = createIntent({ action: "send_email", agent_id: "fixture", parameters: {} });
  updateIntent(intent.intent_id, { status: "authorized" });
  assert.ok(updateIntentIfStatus(intent.intent_id, "authorized", { status: "executing", execution: { status: "reserved" } }));
  assert.equal(updateIntentIfStatus(intent.intent_id, "authorized", { status: "executing" }), null);
  assert.throws(() => updateIntentIfStatus(intent.intent_id, "executing", {}));
});

test("nonce policy covers direct dispatch and API execution paths", () => {
  for (const path of ["/execute-action", "/api/v1/intents/fixture/execute", "/api/v1/intents/fixture/confirm"])
    assert.equal(requiresReplayPrevention(path), true, path);
  assert.equal(validateRequestNonce({ path: "/execute-action", body: {} }).valid, false);
  const request = { path: "/execute-action", body: { request_timestamp: new Date().toISOString(), request_nonce: "repair:nonce" } };
  assert.equal(validateRequestNonce(request).valid, true);
  assert.equal(validateRequestNonce(request).valid, false);
});

const routes = readFileSync(new URL("../routes/index.mjs", import.meta.url), "utf8");
const apiV1Routes = readFileSync(new URL("../routes/api-v1.mjs", import.meta.url), "utf8");
const marker = 'router.post("/execute-action",';
assert.equal(routes.split(marker).length, 2);
const tail = routes.slice(routes.indexOf(marker));
const routeEnd = tail.indexOf("\n});") + "\n});".length;
assert.ok(routeEnd > 5);
const routeSource = tail.slice(0, routeEnd);
let harnessNumber = 0;

test("every gateway token burn supplies the mandatory signature verifier and exact bindings", () => {
  const calls = [];
  for (const source of [routes, apiV1Routes]) {
    let cursor = 0;
    while ((cursor = source.indexOf("validateAndBurnToken(", cursor)) !== -1) {
      const end = source.indexOf("\n    });", cursor);
      assert.ok(end > cursor);
      calls.push(source.slice(cursor, end));
      cursor = end + 1;
    }
  }
  assert.equal(calls.length, 3);
  for (const call of calls) {
    for (const field of ["tool_name:", "args_hash:", "environment:", "signature:", "verifyFn:"])
      assert.ok(call.includes(field), field);
  }
});

function routeHarness({ action = "send_email", parameters, emailMode = "deferred", smsStatus = "sent" } = {}) {
  const id = `intent:route:${++harnessNumber}`;
  const intent = {
    intent_id: id,
    status: "authorized",
    action,
    agent_id: "fixture:proposer",
    parameters: parameters || (action === "send_email"
      ? { to: "nobody@example.invalid", subject: "fixture", body: "fixture" }
      : { to: "+15555550100", body: "fixture" }),
    governance: {},
    authorization: { authorized_by: "fixture:approver", expires_at: new Date(Date.now() + 60_000).toISOString() },
  };
  let handler; let dispatches = 0; let storedReceipts = 0;
  const pending = [];
  const update = patch => Object.assign(intent, patch);
  const sandbox = {
    router: { post(path, middleware, callback) { assert.equal(path, "/execute-action"); handler = callback; } },
    requireRole: () => () => {}, getIntent: () => intent,
    updateIntent: (_id, patch) => update(patch),
    updateIntentIfStatus: (_id, expected, patch) => intent.status === expected ? update(patch) : null,
    appendEntry: () => ({ entry_id: "fixture:ledger" }), isApprovalExpired: () => false,
    getGatewayKeypair: () => ({ secretKey: keypair.privateKey, publicKey: keypair.publicKey }),
    computeArgsHash, issueExecutionToken, validateAndBurnToken,
    signPayload: (payload, key) => nodeSign(null, Buffer.from(payload), key).toString("hex"),
    verifySignature: (payload, signature, key) => nodeVerify(null, Buffer.from(payload), key, Buffer.from(signature, "hex")),
    evaluateUserPolicy: () => ({ decision: "ALLOW" }), buildPolicyBlock: () => ({ decision: "ALLOW" }),
    sendEmail: () => { dispatches++; if (emailMode === "fail") return Promise.reject(new Error("FIXTURE_SMTP_FAILURE"));
      return new Promise(resolve => pending.push(resolve)); },
    sendSms: async () => { dispatches++; return { status: smsStatus, connector: "MOCK_SMS", detail: "no network" }; },
    hashExecution: hash, hashIntent: hash,
    generateReceipt: () => ({ receipt_id: "fixture:receipt", hash_chain: { receipt_hash: "fixture:hash" } }),
    buildIngestion: value => value, getCurrentHash: () => null,
    buildSignaturePayload: value => JSON.stringify(value), hashPayload: hash,
    storeReceipt: async () => { storedReceipts++; },
    // Token manager captured the surrounding process environment at import;
    // mirror that exact value inside the extracted route context.
    process: { env: { RIO_ENVIRONMENT: process.env.RIO_ENVIRONMENT || process.env.NODE_ENV || "production" } },
    console: { log() {}, warn() {}, error() {} },
  };
  vm.runInNewContext(routeSource, sandbox, { timeout: 1_000, filename: "execute-action-route.mjs" });
  const response = () => ({ code: 200, body: null, status(code) { this.code = code; return this; }, json(body) { this.body = body; return this; } });
  return { intent, pending, dispatches: () => dispatches, storedReceipts: () => storedReceipts,
    invoke: async body => { const res = response(); await handler({ body: { intent_id: id, ...body }, principal: { principal_id: "fixture:proposer" } }, res); return res; } };
}

test("direct route reserves before await so two concurrent requests dispatch once", async () => {
  const fixture = routeHarness();
  const first = fixture.invoke({});
  const second = fixture.invoke({});
  assert.equal(fixture.dispatches(), 1);
  assert.equal((await second).code, 409);
  fixture.pending[0]({ status: "sent", connector: "MOCK_EMAIL", detail: "no network", message_id: "fixture" });
  assert.equal((await first).code, 200);
  assert.equal(fixture.storedReceipts(), 1);
});

test("request delivery substitution and approved external delegation cannot enter direct dispatch", async () => {
  const substituted = routeHarness();
  assert.equal((await substituted.invoke({ delivery_mode: "external" })).code, 409);
  assert.equal(substituted.dispatches(), 0);
  const external = routeHarness({ parameters: { to: "nobody@example.invalid", delivery_mode: "external" } });
  assert.equal((await external.invoke({})).code, 409);
  assert.equal(external.dispatches(), 0);
});

test("connector failure or incomplete send creates no receipt or fallback payload", async () => {
  const failed = routeHarness({ emailMode: "fail" });
  const email = await failed.invoke({});
  assert.equal(email.code, 502);
  assert.equal(email.body.status, "blocked");
  assert.equal("email_payload" in email.body, false);
  assert.equal(failed.storedReceipts(), 0);

  const restricted = routeHarness({ action: "send_sms", smsStatus: "trial_restricted" });
  const sms = await restricted.invoke({});
  assert.equal(sms.code, 502);
  assert.equal(restricted.storedReceipts(), 0);
});

test("unsupported direct action is not simulated into an execution receipt", async () => {
  const fixture = routeHarness({ action: "deploy_production", parameters: {} });
  const response = await fixture.invoke({});
  assert.equal(response.code, 422);
  assert.equal(fixture.dispatches(), 0);
  assert.equal(fixture.storedReceipts(), 0);
});
