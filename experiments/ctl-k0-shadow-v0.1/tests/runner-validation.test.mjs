import assert from "node:assert/strict";
import test from "node:test";
import { parseSingleRunnerDocument, validateRunnerResult } from "../src/invoke-k0-runner.mjs";
import { sha256Canonical } from "../src/stable-json.mjs";

const VERIFIER = "b56c26f968082b76e7d21d992c49fbe0db926f10e9f6cd980c0ccdb8d736d5ca";

function request() {
  return {
    schemaVersion: "ctl-k0.shadow-request/0.1",
    mode: "NON_AUTHORITATIVE_SHADOW",
    requestId: "request-1",
    asOf: "2026-08-19T18:00:00.000Z",
    source: {
      system: "test",
      projectionVersion: "rio-to-k0/0.1",
      sourceRefs: ["ledger:1"],
      captureStartedAt: "2026-08-19T17:59:59.000Z",
      captureCompletedAt: "2026-08-19T18:00:00.000Z",
    },
    verificationInput: { schemaVersion: "ctl-k0.input/0.1", context: { now: "2026-08-19T18:00:00.000Z" } },
  };
}

function validResult(input = request()) {
  const projection = { status: "test-projection" };
  const result = {
    schemaVersion: "ctl-k0.shadow-result/0.1",
    requestId: input.requestId,
    asOf: input.asOf,
    labels: ["NON_AUTHORITATIVE_SHADOW", "NOT_FOR_DECISION_USE"],
    authority: {
      mayAuthorize: false,
      mayBlock: false,
      mayRoute: false,
      mayExecute: false,
      maySettle: false,
    },
    source: structuredClone(input.source),
    semantic: {
      report: {
        schemaVersion: "ctl-k0.report/0.1",
        semanticsStatus: "CHALLENGER_NON_CANONICAL",
        verifierVersion: "0.1.0",
      },
      projection,
      projectionDigest: sha256Canonical(projection),
    },
    implementation: {
      runnerVersion: "0.1.0",
      k0: {
        semanticsVersion: "K0.1",
        packageVersion: "0.1.0",
        sourceCommit: "fff1b024a663a3867f54287dbc859377457f9680",
        admittedMergeCommit: "d7528dc0de20d10fdc03219892cd666e11fdb1b7",
        gitTree: "4637f718c6ba1589d890f45febe67efbdd1b63a8",
        verifierSha256: VERIFIER,
        frozenDirectoryManifestSha256: "0909acd79500c1160d35e611d11a3319dea24b15105047738e1a53d04928c1b1",
        runtimeManifestDigest: "21e190ffb5898ac5d134fe218e90ee41ba3c372943410a72ddbb285454f72f4a",
        runtimeFileSha256: { "src/verifier.ts": VERIFIER },
      },
      inputDigest: sha256Canonical(input.verificationInput),
      assertedHistoryPresent: false,
      assertionBoundary: "test",
    },
  };
  result.implementation.resultDigest = sha256Canonical(result);
  return result;
}

test("valid runner output is accepted only when fully bound", () => {
  const input = request();
  assert.deepEqual(validateRunnerResult(validResult(input), input), validResult(input));
});

test("forged authority, labels, ALLOW fields, bindings, and digests are rejected", () => {
  const input = request();
  for (const mutate of [
    (value) => { value.authority.mayAuthorize = true; },
    (value) => { value.labels = ["NON_AUTHORITATIVE_SHADOW"]; },
    (value) => { value.decision = "ALLOW"; },
    (value) => { value.implementation.k0.verifierSha256 = "wrong"; },
    (value) => { value.semantic.projectionDigest = "wrong"; },
    (value) => { value.implementation.resultDigest = "wrong"; },
  ]) {
    const forged = validResult(input);
    mutate(forged);
    assert.throws(() => validateRunnerResult(forged, input));
  }
});

test("multiple runner documents cannot cross as one result", () => {
  assert.throws(() => parseSingleRunnerDocument('{"a":1}\n{"decision":"ALLOW"}\n'), /multiple JSON documents/u);
});
