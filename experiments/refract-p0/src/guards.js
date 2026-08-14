const FORBIDDEN_PROMOTION_STATUSES = new Set([
  "FACT",
  "PROVEN",
  "TRUE",
  "AUTHORIZED"
]);

const CAUSAL_MARKERS = [
  " causes ",
  " caused ",
  " because ",
  " resulted in ",
  " led to ",
  "\"claim_type\":\"causal_claim\"",
  "\"standing\":\"causal\""
];

export function assertNoPromotion(view) {
  const status = String(view.epistemic_status ?? "").toUpperCase();
  if (FORBIDDEN_PROMOTION_STATUSES.has(status)) {
    throw new Error("HOSTILE_PROMOTION_BLOCKED: epistemic_status=" + status);
  }

  const generated = JSON.stringify({
    claims: view.claims ?? [],
    deltas: view.deltas ?? []
  }).toLowerCase();

  if (generated.includes("\"standing\":\"fact\"")) {
    throw new Error("HOSTILE_PROMOTION_BLOCKED: claim standing FACT is forbidden");
  }
}

export function assertNoForbiddenInference(view, contract) {
  // Source evidence may quote arbitrary language. Only generated claims and deltas are policed here.
  const generated = " " + JSON.stringify({
    claims: view.claims ?? [],
    deltas: view.deltas ?? []
  }).toLowerCase() + " ";

  if (contract.must_not_infer.includes("causal_claim")) {
    for (const marker of CAUSAL_MARKERS) {
      if (generated.includes(marker)) {
        throw new Error("HOSTILE_INFERENCE_BLOCKED: causal marker " + marker.trim());
      }
    }
  }

  if (contract.must_not_infer.includes("authority")) {
    for (const marker of [
      "\"authority\":\"granted\"",
      "\"authorized\":true",
      "\"permission\":\"granted\""
    ]) {
      if (generated.includes(marker)) {
        throw new Error("HOSTILE_INFERENCE_BLOCKED: authority promotion " + marker);
      }
    }
  }

  if (contract.must_not_infer.includes("intent")) {
    for (const marker of ["\"intent\":\"known\"", "\"motive\":\""]) {
      if (generated.includes(marker)) {
        throw new Error("HOSTILE_INFERENCE_BLOCKED: intent inference " + marker);
      }
    }
  }
}

export function validateView(view, contract) {
  if (view.contract_id !== contract.contract_id) {
    throw new Error("VIEW_CONTRACT_MISMATCH");
  }
  if (view.view_type !== contract.view_type) {
    throw new Error("VIEW_TYPE_MISMATCH");
  }
  assertNoPromotion(view);
  assertNoForbiddenInference(view, contract);
  return true;
}
