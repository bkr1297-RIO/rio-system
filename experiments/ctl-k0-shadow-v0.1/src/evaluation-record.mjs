import { K0_CONSTITUTION, PROJECTION_PROFILE_DESCRIPTOR } from "./projection-profile.mjs";
import { sha256Canonical } from "./stable-json.mjs";

export const SHADOW_LABELS = Object.freeze([
  "NON_AUTHORITATIVE_SHADOW",
  "NOT_FOR_DECISION_USE",
]);

export const SHADOW_EFFECT_VECTOR = Object.freeze({
  authorityEffect: "NONE",
  blockingEffect: "NONE",
  executionEffect: "NONE",
  settlementEffect: "NONE",
  businessMutationEffect: "NONE",
  sourceReadAuditEffect: "PRESENT",
  rateLimitEffect: "PRESENT",
});

export function createEvaluationRecord({ snapshot, request, runnerResult = null }) {
  const report = runnerResult?.semantic?.report ?? null;
  const projection = runnerResult?.semantic?.projection ?? null;
  const evaluationCore = {
    schemaVersion: "rio.k0-evaluation-record/0.1",
    recordKind: "K0_EVALUATION",
    stage: "SHADOW",
    captureMode: "POST_FACTO_RETROSPECTIVE",
    labels: SHADOW_LABELS,
    effectVector: SHADOW_EFFECT_VECTOR,
    requestId: request.requestId,
    captureId: snapshot.captureId,
    sourceConsistency: snapshot.consistency,
    sourceEpochStatus: snapshot.epochStatus,
    sourceCoverage: snapshot.pageCoverage,
    inputDigest: sha256Canonical(request.verificationInput),
    reportDigest: report ? sha256Canonical(report) : null,
    semanticProjectionDigest: projection ? sha256Canonical(projection) : null,
    constitutionDigest: sha256Canonical(K0_CONSTITUTION),
    verifierDigest: runnerResult?.implementation?.k0?.verifierSha256 ?? null,
    runnerResultDigest: runnerResult?.implementation?.resultDigest ?? null,
    projectionProfileDigest: sha256Canonical(PROJECTION_PROFILE_DESCRIPTOR),
    humanVisible: false,
    sealedBeforeHumanDisposition: false,
    promotionEligible: false,
    telemetryCompleteness: {
      prospectiveSealing: false,
      humanDispositionLinked: false,
      consequenceLinked: false,
      authorityMaterialAvailable: false,
    },
    projectionRemainder: [
      "Ledger record is an observation, not ActualHistory.",
      "Authorization standing is not established by runtime status or record presence.",
      "Outcome and settlement are not established by intent status or receipt presence.",
      "Source persistence durability is not established by the cache-backed API.",
      ...(snapshot.epochStatus === "ADVANCED_ANCESTRY_UNVERIFIED"
        ? ["Prior chain tip ancestry is not established by this two-read snapshot."]
        : []),
    ],
    request,
    report: runnerResult,
  };
  return {
    ...evaluationCore,
    evaluationId: sha256Canonical(evaluationCore),
  };
}
