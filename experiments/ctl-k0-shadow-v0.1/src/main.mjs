#!/usr/bin/env node
import { createReadOnlyClient } from "./http-boundary.mjs";
import { captureStableSnapshot } from "./stable-snapshot.mjs";
import { projectSnapshot } from "./project-k0-envelope.mjs";
import { invokeK0Runner } from "./invoke-k0-runner.mjs";
import { failureRecord, writeShadowRecord } from "./shadow-sink.mjs";
import { createEvaluationRecord, SHADOW_EFFECT_VECTOR } from "./evaluation-record.mjs";

function optionalCheckpoint(env) {
  if (!env.K0_SHADOW_PREVIOUS_TOTAL || !env.K0_SHADOW_PREVIOUS_TIP) return undefined;
  return { total: Number(env.K0_SHADOW_PREVIOUS_TOTAL), chainTip: env.K0_SHADOW_PREVIOUS_TIP };
}

function boundedInteger(raw, fallback, min, max, name) {
  const value = raw === undefined ? fallback : Number(raw);
  if (!Number.isInteger(value) || value < min || value > max) {
    throw new Error(`${name} must be an integer from ${min} through ${max}.`);
  }
  return value;
}

export async function runOnce({ env = process.env, fetchImpl = globalThis.fetch, stream = process.stdout } = {}) {
  const getJson = createReadOnlyClient({
    baseUrl: env.RIO_GATEWAY_BASE_URL,
    bearerToken: env.RIO_SHADOW_AUDITOR_BEARER_TOKEN,
    fetchImpl,
  });
  const snapshot = await captureStableSnapshot({
    getJson,
    limit: boundedInteger(env.K0_SHADOW_LIMIT, 20, 1, 20, "K0_SHADOW_LIMIT"),
    offset: boundedInteger(env.K0_SHADOW_OFFSET, 0, 0, Number.MAX_SAFE_INTEGER, "K0_SHADOW_OFFSET"),
    maxAttempts: boundedInteger(env.K0_SHADOW_SNAPSHOT_ATTEMPTS, 3, 1, 3, "K0_SHADOW_SNAPSHOT_ATTEMPTS"),
    previousCheckpoint: optionalCheckpoint(env),
  });
  writeShadowRecord({
    schemaVersion: "rio.k0-shadow-capture/0.1",
    labels: snapshot.labels,
    status: snapshot.consistency === "CHAIN_TIP_STABLE_NON_ATOMIC"
      && !["SOURCE_REWIND", "EPOCH_RUPTURE"].includes(snapshot.epochStatus)
      ? "CAPTURE_STABLE_NON_ATOMIC"
      : "CAPTURE_HOLD",
    captureId: snapshot.captureId,
    consistency: snapshot.consistency,
    epochStatus: snapshot.epochStatus,
    totalBefore: snapshot.totalBefore,
    totalAfter: snapshot.totalAfter,
    chainTipBefore: snapshot.chainTipBefore,
    chainTipAfter: snapshot.chainTipAfter,
    recordCount: snapshot.records.length,
    pageCoverage: snapshot.pageCoverage,
    effectVector: SHADOW_EFFECT_VECTOR,
  }, stream);
  if (snapshot.consistency !== "CHAIN_TIP_STABLE_NON_ATOMIC"
      || ["SOURCE_REWIND", "EPOCH_RUPTURE"].includes(snapshot.epochStatus)) {
    return { snapshot, emitted: 0 };
  }

  const requests = projectSnapshot(snapshot);
  let emitted = 0;
  for (const request of requests) {
    try {
      const payload = env.K0_SHADOW_RUNNER_BIN
        ? await invokeK0Runner(request, { command: env.K0_SHADOW_RUNNER_BIN })
        : null;
      writeShadowRecord(createEvaluationRecord({ snapshot, request, runnerResult: payload }), stream);
      emitted += 1;
    } catch (error) {
      writeShadowRecord(failureRecord("K0_RUNNER", error, { requestId: request.requestId }), stream);
    }
  }
  return { snapshot, emitted };
}

const isDirect = process.argv[1] && import.meta.url === `file://${process.argv[1]}`;
if (isDirect) {
  runOnce().catch((error) => {
    writeShadowRecord(failureRecord("CAPTURE", error));
    process.exitCode = 1;
  });
}
