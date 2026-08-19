#!/usr/bin/env node
import { createReadOnlyClient } from "./http-boundary.mjs";
import { captureStableSnapshot } from "./stable-snapshot.mjs";
import { projectSnapshot } from "./project-k0-envelope.mjs";
import { invokeK0Runner } from "./invoke-k0-runner.mjs";
import { failureRecord, writeShadowRecord } from "./shadow-sink.mjs";

function optionalCheckpoint(env) {
  if (!env.K0_SHADOW_PREVIOUS_TOTAL || !env.K0_SHADOW_PREVIOUS_TIP) return undefined;
  return { total: Number(env.K0_SHADOW_PREVIOUS_TOTAL), chainTip: env.K0_SHADOW_PREVIOUS_TIP };
}

export async function runOnce({ env = process.env, fetchImpl = globalThis.fetch, stream = process.stdout } = {}) {
  const getJson = createReadOnlyClient({
    baseUrl: env.RIO_GATEWAY_BASE_URL,
    apiKey: env.RIO_SHADOW_AUDITOR_API_KEY,
    fetchImpl,
  });
  const snapshot = await captureStableSnapshot({
    getJson,
    limit: Number(env.K0_SHADOW_LIMIT || 100),
    offset: Number(env.K0_SHADOW_OFFSET || 0),
    maxAttempts: Number(env.K0_SHADOW_SNAPSHOT_ATTEMPTS || 3),
    previousCheckpoint: optionalCheckpoint(env),
  });
  writeShadowRecord({
    schemaVersion: "rio.k0-shadow-capture/0.1",
    labels: snapshot.labels,
    status: snapshot.atomicity === "STABLE" ? "CAPTURE_STABLE" : "CAPTURE_HOLD",
    captureId: snapshot.captureId,
    atomicity: snapshot.atomicity,
    epochStatus: snapshot.epochStatus,
    totalBefore: snapshot.totalBefore,
    totalAfter: snapshot.totalAfter,
    chainTipBefore: snapshot.chainTipBefore,
    chainTipAfter: snapshot.chainTipAfter,
    recordCount: snapshot.records.length,
    gatewayEffect: "NONE",
  }, stream);
  if (snapshot.atomicity !== "STABLE") return { snapshot, emitted: 0 };

  const requests = projectSnapshot(snapshot);
  let emitted = 0;
  for (const request of requests) {
    try {
      const payload = env.K0_SHADOW_RUNNER_BIN
        ? await invokeK0Runner(request, { command: env.K0_SHADOW_RUNNER_BIN })
        : request;
      writeShadowRecord(payload, stream);
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
