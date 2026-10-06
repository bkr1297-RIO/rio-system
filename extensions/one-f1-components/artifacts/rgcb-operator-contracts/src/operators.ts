import type {
  ArtifactKind,
  BearingOffer,
  DifferentiationInput,
  DistinctionSet,
  FailureResult,
  Finding,
  HostileFixture,
  IlluminationInput,
  IlluminationView,
  InheritanceInput,
  InheritanceRecord,
  OperatorArtifact,
  OperatorFailure,
  OperatorInputMap,
  OperatorName,
  OperatorResult,
  OrientationInput,
  RelationGraph,
  RelationInput,
  ReturnInput,
  ReturnObject,
  SuccessResult,
  TransformationInput,
  TransformationRecord,
} from "./types.ts";

export const ARTIFACT_KIND_BY_OPERATOR: Readonly<Record<OperatorName, ArtifactKind>> = {
  DIFFERENTIATE: "DistinctionSet",
  RELATE: "RelationGraph",
  TRANSFORM: "TransformationRecord",
  RETURN: "ReturnObject",
  ILLUMINATE: "IlluminationView",
  ORIENT: "BearingOffer",
  INHERIT: "InheritanceRecord",
};

export const FORBIDDEN_ARTIFACT_KEYS: Readonly<Record<OperatorName, readonly string[]>> = {
  DIFFERENTIATE: ["edges", "successorRef", "authorization", "bearing"],
  RELATE: ["successorRef", "delta", "returnObject", "authorization"],
  TRANSFORM: ["delivery", "visibilityState", "evidenceStatus", "inheritedItemRef"],
  RETURN: ["visibilityState", "relationState", "directionalRelations", "truth"],
  ILLUMINATE: ["directionalRelations", "choice", "authorization", "possibilityField"],
  ORIENT: ["choice", "authorization", "executionPlan", "admissionBasisRef", "renewed"],
  INHERIT: ["directionalRelations", "authorityExpansion", "possibilityField", "renewed"],
};

function finding(code: string, message: string, basisRefs: string[] = []): Finding {
  return { code, message, basisRefs: [...basisRefs] };
}

function heldFailure(
  operator: OperatorName,
  inputRef: string,
  reasonCode: string,
  message: string,
  options: Partial<Omit<OperatorFailure,
    "schemaVersion" | "kind" | "operator" | "inputRef" | "standing" | "reasonCode" | "message"
  >> = {},
): FailureResult {
  return {
    ok: false,
    operator,
    failure: {
      schemaVersion: "rgcb.failure.v0.1",
      kind: "OperatorFailure",
      operator,
      inputRef,
      standing: "HELD",
      reasonCode,
      message,
      missingBasis: [...(options.missingBasis ?? [])],
      conflictingBasis: [...(options.conflictingBasis ?? [])],
      partialOutputRefs: [...(options.partialOutputRefs ?? [])],
      actualPartialEffects: [...(options.actualPartialEffects ?? [])],
      uncertainty: [...(options.uncertainty ?? [])],
      residue: [...(options.residue ?? [])],
      repairRoute: [...(options.repairRoute ?? [])],
    },
  };
}

function success<A extends OperatorArtifact>(artifact: A): SuccessResult<A> {
  return { ok: true, operator: artifact.operator, artifact };
}

export function differentiate(input: DifferentiationInput): OperatorResult<DistinctionSet> {
  const snapshot = structuredClone(input);
  if (snapshot.claims.length === 0) {
    return heldFailure("DIFFERENTIATE", snapshot.id, "NO_CLAIMS", "No material was supplied for differentiation.", {
      missingBasis: ["claims"],
      uncertainty: ["No supported distinctions can be established."],
      residue: ["The empty input remains unresolved."],
      repairRoute: ["Supply attributable claims."],
    });
  }

  const incomplete = snapshot.claims.filter(
    (claim) => !claim.sourceRef || !claim.standing || !claim.uncertainty,
  );
  if (incomplete.length > 0) {
    return heldFailure(
      "DIFFERENTIATE",
      snapshot.id,
      "DISTINCTION_BASIS_INCOMPLETE",
      "At least one candidate distinction lacks source, standing, or uncertainty.",
      {
        missingBasis: incomplete.map((claim) => claim.id),
        uncertainty: ["Incomplete candidates were not upgraded into distinctions."],
        residue: incomplete.map((claim) => `${claim.id}:${claim.proposition}`),
        repairRoute: ["Supply source, standing, and uncertainty for every candidate."],
      },
    );
  }

  const duplicatePropositions = new Set<string>();
  const seen = new Map<string, string>();
  for (const claim of snapshot.claims) {
    const signature = `${claim.sourceRef}|${claim.standing}|${claim.uncertainty}`;
    const prior = seen.get(claim.proposition);
    if (prior !== undefined && prior !== signature) duplicatePropositions.add(claim.proposition);
    seen.set(claim.proposition, signature);
  }

  return success({
    schemaVersion: "rgcb.artifact.v0.1",
    artifactId: `differentiate:${snapshot.id}`,
    kind: "DistinctionSet",
    operator: "DIFFERENTIATE",
    claimCeiling: "The listed distinctions are explicit under the declared conservation context; no relation is established.",
    findings: duplicatePropositions.size > 0
      ? [finding(
        "CONFLATION_REJECTED",
        "Textually identical claims retained separate source, standing, and uncertainty.",
        snapshot.claims.map((claim) => claim.id),
      )]
      : [finding("DISTINCTIONS_PRESERVED", "Every supported candidate remains independently attributable.")],
    unresolved: [],
    conservationContext: [...snapshot.conservationContext],
    preservedDimensions: [...snapshot.conservationContext],
    items: snapshot.claims.map((claim) => ({
      id: claim.id,
      proposition: claim.proposition,
      sourceRef: claim.sourceRef!,
      standing: claim.standing!,
      uncertainty: claim.uncertainty!,
    })),
  });
}

export function relate(input: RelationInput): OperatorResult<RelationGraph> {
  const snapshot = structuredClone(input);
  const operandIds = new Set(snapshot.operands.map((operand) => operand.id));
  const missing = [snapshot.sourceRef, snapshot.targetRef].filter((ref) => !operandIds.has(ref));
  if (missing.length > 0) {
    return heldFailure("RELATE", snapshot.id, "RELATION_OPERAND_MISSING", "A requested relation references an absent operand.", {
      missingBasis: missing,
      uncertainty: ["The relation remains undetermined."],
      residue: snapshot.operands.map((operand) => operand.id),
      repairRoute: ["Differentiate and supply every relation operand."],
    });
  }

  const causalPromotionUnsupported = snapshot.requestedRelation === "CAUSES"
    && snapshot.causalBasisRefs.length === 0;
  const edgeType = causalPromotionUnsupported
    ? (snapshot.cooccurrenceObserved ? "CORRELATED" : "UNDETERMINED")
    : snapshot.requestedRelation;

  return success({
    schemaVersion: "rgcb.artifact.v0.1",
    artifactId: `relate:${snapshot.id}`,
    kind: "RelationGraph",
    operator: "RELATE",
    claimCeiling: "The declared edge is supported at its stated relation type; relation does not create identity, authority, or change.",
    findings: causalPromotionUnsupported
      ? [finding(
        "CAUSAL_PROMOTION_REJECTED",
        "Observed cooccurrence was not promoted into causality without causal basis.",
      )]
      : [finding("RELATION_TYPED", "The relation was established at the strongest supported type.", snapshot.causalBasisRefs)],
    unresolved: causalPromotionUnsupported ? ["Causality remains undetermined."] : [],
    operands: snapshot.operands,
    edges: [{
      sourceRef: snapshot.sourceRef,
      targetRef: snapshot.targetRef,
      type: edgeType,
      causality: edgeType === "CAUSES" ? "SUPPORTED" : "UNDETERMINED",
      basisRefs: [...snapshot.causalBasisRefs],
    }],
    rejectedAssertions: causalPromotionUnsupported
      ? [{ relation: "CAUSES", reasonCode: "CAUSAL_BASIS_MISSING" }]
      : [],
  });
}

export function transform(input: TransformationInput): OperatorResult<TransformationRecord> {
  const snapshot = structuredClone(input);
  if (snapshot.path.length === 0) {
    return heldFailure("TRANSFORM", snapshot.id, "TRANSFORMATION_PATH_MISSING", "No transformation path was supplied.", {
      missingBasis: ["path"],
      uncertainty: ["No predecessor-to-successor descent can be reconstructed."],
      residue: [...snapshot.delta, ...snapshot.residue],
      repairRoute: ["Supply an ordered, attributable transformation path."],
    });
  }

  const occurrenceIndex = snapshot.path.findIndex((event) => event.kind.endsWith("OCCURRENCE"));
  const grantIndex = snapshot.path.findIndex((event) => event.kind === "GRANT");
  const unauthorizedOccurrence = snapshot.path.some((event) => event.kind === "UNAUTHORIZED_OCCURRENCE");
  const retroactiveGrant = occurrenceIndex >= 0 && grantIndex > occurrenceIndex;
  const returnPresent = snapshot.path.some((event) => event.kind === "RETURN");

  let disposition: TransformationRecord["disposition"] = "ACCEPTED";
  let lawfulSuccession: TransformationRecord["lawfulSuccession"] = "ESTABLISHED";
  const reasonCodes: string[] = [];
  const findings: Finding[] = [];
  const unresolved = [...snapshot.residue];

  if (snapshot.requiredAuthorization && (unauthorizedOccurrence || retroactiveGrant)) {
    disposition = "REJECTED";
    lawfulSuccession = "BREACHED";
    reasonCodes.push("RETROACTIVE_AUTHORIZATION");
    findings.push(finding(
      "ENDPOINT_LAUNDERING_REJECTED",
      "A later grant did not rewrite an earlier unauthorized occurrence into lawful history.",
      snapshot.path.map((event) => event.id),
    ));
  } else if (!returnPresent) {
    disposition = "HELD";
    lawfulSuccession = "UNESTABLISHED";
    reasonCodes.push("RETURN_OBLIGATION_OPEN");
    findings.push(finding("SUCCESSION_INCOMPLETE", "The transformation path remains open because Return is absent."));
    unresolved.push("Return obligation remains open.");
  } else {
    reasonCodes.push("LAWFUL_PATH_RECONSTRUCTABLE");
    findings.push(finding("DESCENT_RECONSTRUCTABLE", "The declared predecessor, ordered path, delta, and successor remain attributable."));
  }

  return success({
    schemaVersion: "rgcb.artifact.v0.1",
    artifactId: `transform:${snapshot.id}`,
    kind: "TransformationRecord",
    operator: "TRANSFORM",
    claimCeiling: "The declared change path is classified at the stated standing; no Return, observation, evidence, or inheritance is established.",
    findings,
    unresolved,
    predecessorRef: snapshot.predecessorRef,
    successorRef: snapshot.successorRef,
    disposition,
    lawfulSuccession,
    pathPreserved: true,
    path: snapshot.path,
    delta: snapshot.delta,
    residue: snapshot.residue,
    reasonCodes,
  });
}

export function returnAccount(input: ReturnInput): OperatorResult<ReturnObject> {
  const snapshot = structuredClone(input);
  if (!snapshot.sourceRef) {
    return heldFailure("RETURN", snapshot.id, "RETURN_PROVENANCE_MISSING", "The account has no attributable source.", {
      missingBasis: ["sourceRef"],
      uncertainty: ["The account cannot be bound to a source."],
      residue: [snapshot.id],
      repairRoute: ["Bind the account to its originating source."],
    });
  }

  const delivery = snapshot.deliveryAcknowledged ? "EVIDENCED" : "UNRESOLVED";
  const read = snapshot.readAcknowledged ? "EVIDENCED" : "UNRESOLVED";
  const outcome = snapshot.outcomeEvidence ? "EVIDENCED" : "UNRESOLVED";
  const canSettle = snapshot.settlementClaimed && snapshot.deliveryAcknowledged && snapshot.outcomeEvidence;
  const unresolved = [
    !snapshot.deliveryAcknowledged ? "Delivery remains unresolved." : undefined,
    !snapshot.readAcknowledged ? "Read status remains unresolved." : undefined,
    !snapshot.outcomeEvidence ? "Outcome remains unresolved." : undefined,
  ].filter((entry): entry is string => entry !== undefined);
  const inflatedSettlement = snapshot.settlementClaimed && !canSettle;

  return success({
    schemaVersion: "rgcb.artifact.v0.1",
    artifactId: `return:${snapshot.id}`,
    kind: "ReturnObject",
    operator: "RETURN",
    claimCeiling: "This is an attributable account with typed status; it does not equal history or truth.",
    findings: [
      finding(
        "ACCOUNT_FACETS_PRESERVED",
        "Intent, authorization, attempt, provider acceptance, delivery, read, outcome, and settlement remain separate.",
        [snapshot.sourceRef],
      ),
      ...(inflatedSettlement
        ? [finding("SETTLEMENT_PROMOTION_REJECTED", "A settlement claim was held because delivery or outcome evidence was absent.")]
        : []),
    ],
    unresolved,
    sourceRef: snapshot.sourceRef,
    recipientRef: snapshot.recipientRef,
    intended: snapshot.intended ? "DECLARED" : "NOT_DECLARED",
    authorized: snapshot.authorized ? "ESTABLISHED" : "NOT_ESTABLISHED",
    attempted: snapshot.attempted ? "ATTEMPTED" : "NOT_ATTEMPTED",
    providerAcceptance: snapshot.providerAccepted ? "OBSERVED" : "UNOBSERVED",
    delivery,
    read,
    outcome,
    settlement: canSettle ? "SETTLED" : "OPEN",
  });
}

export function illuminate(input: IlluminationInput): OperatorResult<IlluminationView> {
  const snapshot = structuredClone(input);
  if (!snapshot.calibrated || !snapshot.calibrationRef) {
    return heldFailure("ILLUMINATE", snapshot.id, "CALIBRATION_MISSING", "Returned material cannot be illuminated without declared calibration.", {
      missingBasis: ["calibrationRef"],
      uncertainty: ["Visibility and relation remain unknown."],
      residue: snapshot.evidence.map((item) => item.id),
      repairRoute: ["Supply a valid calibration reference."],
    });
  }

  const visible = snapshot.evidence.filter((item) => item.visible);
  const support = visible.some((item) => item.verdict === "SUPPORT");
  const refute = visible.some((item) => item.verdict === "REFUTE");
  const inconclusive = visible.some((item) => item.verdict === "INCONCLUSIVE");
  const visibilityState = visible.length === 0
    ? "OCCLUDED"
    : visible.length === snapshot.evidence.length ? "ILLUMINATED" : "SHADOWED";
  const relationState = support && refute
    ? "CONTRADICTORY"
    : inconclusive ? "UNDETERMINED" : support ? "REINFORCING" : refute ? "DAMPING" : "UNDETERMINED";
  const outcomeState = support && !refute && !inconclusive
    ? "SUPPORTED"
    : refute && !support && !inconclusive ? "REFUTED" : "UNKNOWN";
  const uncertainty = [
    support && refute ? "Conflicting visible evidence prevents outcome promotion." : undefined,
    inconclusive ? "Inconclusive visible evidence prevents outcome promotion." : undefined,
    visibilityState !== "ILLUMINATED" ? "Some or all material is not visible." : undefined,
  ].filter((entry): entry is string => entry !== undefined);

  return success({
    schemaVersion: "rgcb.artifact.v0.1",
    artifactId: `illuminate:${snapshot.id}`,
    kind: "IlluminationView",
    operator: "ILLUMINATE",
    claimCeiling: "The view reports calibrated legibility; visibility does not establish certainty, truth, or bearing.",
    findings: support && refute
      ? [finding("CONTRADICTION_PRESERVED", "Visible evidence remains contradictory; no synthetic outcome was created.", visible.map((item) => item.id))]
      : [finding("VISIBILITY_CLASSIFIED", "Returned material was classified without upgrading visibility into certainty.", visible.map((item) => item.id))],
    unresolved: uncertainty,
    visibilityState,
    relationState,
    outcomeState,
    certainty: uncertainty.length === 0 ? "BOUNDED" : "NOT_ESTABLISHED",
    visibleEvidenceRefs: visible.map((item) => item.id),
  });
}

export function orient(input: OrientationInput): OperatorResult<BearingOffer> {
  const snapshot = structuredClone(input);
  const missing = [
    !snapshot.contextRef ? "contextRef" : undefined,
    !snapshot.purpose ? "purpose" : undefined,
    !snapshot.northRef ? "northRef" : undefined,
  ].filter((entry): entry is string => entry !== undefined);
  if (missing.length > 0) {
    return heldFailure("ORIENT", snapshot.id, "ORIENTATION_BASIS_INCOMPLETE", "A bounded bearing cannot be established without context, purpose, and North.", {
      missingBasis: missing,
      uncertainty: ["No reliable bearing can be offered."],
      residue: [...snapshot.candidateDirections],
      repairRoute: ["Supply the missing orientation basis."],
    });
  }

  const fieldCurrent = snapshot.possibilityFieldStatus === "CURRENT";
  const hasDirections = snapshot.candidateDirections.length > 0;
  const reliable = fieldCurrent && hasDirections;
  const uncertainty = [
    !fieldCurrent ? `Possibility field is ${snapshot.possibilityFieldStatus.toLowerCase()}.` : undefined,
    !hasDirections ? "No candidate direction is presently supported." : undefined,
    !snapshot.authorityBasisPresent ? "No authority basis accompanies this bearing." : undefined,
  ].filter((entry): entry is string => entry !== undefined);

  return success({
    schemaVersion: "rgcb.artifact.v0.1",
    artifactId: `orient:${snapshot.id}`,
    kind: "BearingOffer",
    operator: "ORIENT",
    claimCeiling: "This is bounded directional understanding; it is not choice, admission, authorization, execution, or possibility-field renewal.",
    findings: [
      finding(
        reliable ? "BOUNDED_BEARING_AVAILABLE" : "NO_RELIABLE_BEARING",
        reliable
          ? "Directional relations are offered within the declared current field."
          : "The basis is insufficient for reliable directional recommendation.",
        [snapshot.illuminationRef, snapshot.possibilityFieldRef],
      ),
      finding("AUTHORITY_NOT_INFERRED", "Orientation produced no authority effect."),
      finding("POSSIBILITY_NOT_RECOMPUTED", "Orientation did not create or certify a possibility field."),
    ],
    unresolved: uncertainty,
    status: reliable ? "BOUNDED_BEARING" : "NO_RELIABLE_BEARING",
    referenceFrame: snapshot.northRef!,
    currentPositionRef: snapshot.contextRef!,
    directionalRelations: reliable ? [...snapshot.candidateDirections] : [],
    constraintRefs: [...snapshot.constraints],
    uncertainty,
    validityHorizon: "CURRENT_CONTEXT_ONLY",
    authorityEffect: "NONE",
    possibilityEffect: "NONE",
  });
}

export function inheritMaterial(input: InheritanceInput): OperatorResult<InheritanceRecord> {
  const snapshot = structuredClone(input);
  const basis = snapshot.admissionBasis;
  if (!basis || !basis.valid) {
    return heldFailure("INHERIT", snapshot.id, "NO_ADMISSION_BASIS", "Material may not enter successor context without a valid admission basis.", {
      missingBasis: basis ? [basis.id] : ["admissionBasis"],
      uncertainty: ["Candidate standing remains unchanged."],
      residue: [snapshot.candidate.id],
      repairRoute: ["Obtain a valid, attributable admission basis."],
    });
  }
  if (basis.targetContextRef !== snapshot.predecessorContext.ref) {
    return heldFailure("INHERIT", snapshot.id, "TARGET_CONTEXT_MISMATCH", "The admission basis does not bind the named predecessor context.", {
      conflictingBasis: [basis.targetContextRef, snapshot.predecessorContext.ref],
      uncertainty: ["No successor context was constituted."],
      residue: [snapshot.candidate.id],
      repairRoute: ["Bind admission to the intended context."],
    });
  }
  if (!basis.permittedTypes.includes(snapshot.candidate.type)) {
    return heldFailure("INHERIT", snapshot.id, "STANDING_MISMATCH", "The candidate type is outside the admission basis.", {
      conflictingBasis: [snapshot.candidate.type, ...basis.permittedTypes],
      uncertainty: ["Candidate standing remains unchanged."],
      residue: [snapshot.candidate.id],
      repairRoute: ["Narrow the candidate or obtain a basis covering its type."],
    });
  }
  if (snapshot.candidate.lineageRefs.length === 0) {
    return heldFailure("INHERIT", snapshot.id, "LINEAGE_INCOMPLETE", "The candidate has no reconstructable lineage.", {
      missingBasis: ["candidate.lineageRefs"],
      uncertainty: ["Candidate descent cannot be reconstructed."],
      residue: [snapshot.candidate.id],
      repairRoute: ["Supply attributable lineage before admission."],
    });
  }

  return success({
    schemaVersion: "rgcb.artifact.v0.1",
    artifactId: `inherit:${snapshot.id}`,
    kind: "InheritanceRecord",
    operator: "INHERIT",
    claimCeiling: "The candidate entered the named successor context under this basis; no authority expansion or possibility renewal is established.",
    findings: [
      finding("ADMISSION_BASIS_APPLIED", "Inheritance remained bounded to the declared candidate type and target context.", [basis.id]),
      finding("SOURCE_STANDING_PRESERVED", "The candidate retained its original standing and lineage.", snapshot.candidate.lineageRefs),
      finding("RENEWAL_NOT_INFERRED", "Successor-context constitution did not certify a renewed possibility field."),
    ],
    unresolved: [],
    disposition: "ADMITTED",
    admissionBasisRef: basis.id,
    predecessorContextRef: snapshot.predecessorContext.ref,
    successorContextRef: `${snapshot.predecessorContext.ref}@${snapshot.predecessorContext.version + 1}`,
    inheritedItemRef: snapshot.candidate.id,
    preservedStanding: snapshot.candidate.standing,
    authorityEffect: "NONE",
  });
}

export function executeOperator<O extends OperatorName>(
  operator: O,
  input: OperatorInputMap[O],
): OperatorResult {
  switch (operator) {
    case "DIFFERENTIATE":
      return differentiate(input as DifferentiationInput);
    case "RELATE":
      return relate(input as RelationInput);
    case "TRANSFORM":
      return transform(input as TransformationInput);
    case "RETURN":
      return returnAccount(input as ReturnInput);
    case "ILLUMINATE":
      return illuminate(input as IlluminationInput);
    case "ORIENT":
      return orient(input as OrientationInput);
    case "INHERIT":
      return inheritMaterial(input as InheritanceInput);
  }
}

export function executeFixture(fixture: HostileFixture): OperatorResult {
  return executeOperator(fixture.operator, fixture.input as never);
}
