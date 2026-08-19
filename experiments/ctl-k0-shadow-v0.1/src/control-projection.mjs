import { sha256Canonical } from "./stable-json.mjs";
import { SHADOW_EFFECT_VECTOR } from "./evaluation-record.mjs";

export function hypotheticalControlProjection(evaluation, policy = { version: "shadow-control/0.1" }) {
  const judgments = evaluation.report?.semantic?.report?.judgments;
  const firedPredicates = [];
  const unresolvedPredicates = [];
  let proposedControl = "NOT_COVERED";

  if (judgments) {
    if (judgments.formation?.status === "MALFORMED") firedPredicates.push("MALFORMED");
    if (judgments.typing?.status === "TYPE_ERROR") firedPredicates.push("TYPE_ERROR");
    if (judgments.definedness?.status === "UNDEFINED") firedPredicates.push("UNDEFINED");
    if (judgments.breach?.status === "PRESENT") firedPredicates.push("BREACH_PRESENT");
    if (judgments.derivationAvailability?.status !== "COMPLETE") unresolvedPredicates.push("DERIVATION_INCOMPLETE");
    if (judgments.admissibility?.status !== "AUTHORIZED") unresolvedPredicates.push("ADMISSIBILITY_NOT_ESTABLISHED");
    proposedControl = firedPredicates.length > 0
      ? "BLOCK"
      : unresolvedPredicates.length > 0
        ? "HOLD"
        : "PASS";
  }

  return {
    schemaVersion: "rio.k0-control-projection/0.1",
    evaluationRef: evaluation.evaluationId,
    policyDigest: sha256Canonical(policy),
    mode: "HYPOTHETICAL_ONLY",
    covered: Boolean(judgments),
    proposedControl,
    firedPredicates,
    unresolvedPredicates,
    telemetryComplete: Object.values(evaluation.telemetryCompleteness).every(Boolean),
    effectVector: SHADOW_EFFECT_VECTOR,
  };
}

export function classifyDisagreement(projection, humanDisposition) {
  let classification = "INSUFFICIENT_DATA";
  if (!projection.telemetryComplete) {
    classification = "INPUT_TELEMETRY_GAP";
  } else if (!humanDisposition || humanDisposition.humanSawK0 !== false) {
    classification = "INSUFFICIENT_DATA";
  } else if (!projection.covered || projection.proposedControl === "NOT_COVERED") {
    classification = "NOT_COVERED";
  } else {
    const machine = { PASS: 0, HOLD: 1, BLOCK: 2 }[projection.proposedControl];
    const human = { APPROVE: 0, HOLD: 1, REVISE: 1, DENY: 2 }[humanDisposition.disposition];
    classification = machine === human
      ? "AGREE"
      : machine > human
        ? "K0_MORE_RESTRICTIVE"
        : "HUMAN_MORE_RESTRICTIVE";
  }
  const core = {
    schemaVersion: "rio.k0-disagreement-record/0.1",
    evaluationRef: projection.evaluationRef,
    controlProjectionRef: sha256Canonical(projection),
    humanDispositionRef: humanDisposition?.dispositionId ?? null,
    classification,
    effectVector: SHADOW_EFFECT_VECTOR,
  };
  return { ...core, disagreementId: sha256Canonical(core) };
}
