import { canonicalJson } from "./stable-json.mjs";
import { SHADOW_EFFECT_VECTOR } from "./evaluation-record.mjs";

export function writeShadowRecord(record, stream = process.stdout) {
  stream.write(`${canonicalJson(record)}\n`);
}

export function failureRecord(stage, error, source = {}) {
  return {
    schemaVersion: "rio.k0-shadow-failure/0.1",
    labels: ["NON_AUTHORITATIVE_SHADOW", "NOT_FOR_DECISION_USE"],
    status: "SHADOW_FAILURE_ISOLATED",
    stage,
    error: error instanceof Error ? error.message : String(error),
    source,
    effectVector: SHADOW_EFFECT_VECTOR,
  };
}
