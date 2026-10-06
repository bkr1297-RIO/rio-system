import { canonicalize, verifyCommitment } from "./canonical.ts";

import type {
  DeltaElement,
  DeltaSet,
  EvidenceAssessment,
  InvariantFinding,
  SuccessionDecision,
  SuccessionDecisionPayload,
  TransitionOccurrenceProtocolAssessment,
  TransitionOccurrenceProtocolInput,
  TransitionOccurrenceReceipt,
  TransitionOccurrenceReceiptPayload,
} from "./types.ts";

export const TOP_RULES = {
  IDENTITY_SEPARATION: "TOP.IDENTITY.SEPARATE_PROMOTION_IDENTIFIERS",
  PROPOSAL_NON_AUTHORITY: "TOP.PROPOSAL.NO_AUTHORITY_OR_STANDING_EFFECT",
  AUTHORITY_INDEPENDENCE: "TOP.AUTHORITY.INDEPENDENT_DERIVATION",
  AUTHORITY_EXACT_BINDING: "TOP.AUTHORITY.EXACT_BINDING",
  ATTEMPT_ADMISSION_PROPOSAL_BINDING: "TOP.ATTEMPT_ADMISSION.PROPOSAL_BOUND",
  CAPABILITY_NON_AUTHORITY: "TOP.CAPABILITY.NOT_AUTHORITY",
  EXECUTION_ADMISSION_BINDING: "TOP.EXECUTION.ATTEMPT_ADMISSION_BOUND",
  EXECUTION_CURRENTNESS: "TOP.EXECUTION.POINT_OF_USE_CURRENTNESS",
  OCCURRENCE_EXECUTION_BINDING: "TOP.OCCURRENCE.EXECUTION_BOUND",
  OCCURRENCE_REQUIRED_FOR_ADMISSION: "TOP.OCCURRENCE.REQUIRED_FOR_ADMISSION",
  OBSERVATION_OCCURRENCE_BINDING: "TOP.OBSERVATION.OCCURRENCE_BOUND",
  OBSERVATION_NO_PROMOTION: "TOP.OBSERVATION.NO_EVIDENCE_TRUTH_OR_SETTLEMENT_EFFECT",
  OBSERVATION_COMPLETENESS: "TOP.OBSERVATION.COMPLETENESS_NOT_INFLATED",
  RECEIPT_OBSERVATION_BINDING: "TOP.RECEIPT.OBSERVATION_BOUND",
  RECEIPT_INTEGRITY: "TOP.RECEIPT.CONTENT_BOUND",
  RECEIPT_NO_PROMOTION: "TOP.RECEIPT.NO_EVIDENCE_TRUTH_OR_SETTLEMENT_EFFECT",
  EVIDENCE_INDEPENDENCE: "TOP.EVIDENCE.INDEPENDENT_ADMISSION",
  EVIDENCE_BINDING: "TOP.EVIDENCE.OBSERVATION_AND_RECEIPT_BOUND",
  EVIDENCE_INTEGRITY: "TOP.EVIDENCE.CONTENT_BOUND",
  EVIDENCE_REQUIRED_FOR_ADMISSION: "TOP.EVIDENCE.REQUIRED_FOR_SUCCESSION_ADMISSION",
  DERIVATION_ACYCLIC: "TOP.DERIVATION.ACYCLIC_INDEPENDENT_ROOTS",
  OCCURRENCE_COVERAGE: "TOP.CARDINALITY.ALL_OCCURRENCES_OBSERVED",
  OBSERVATION_COVERAGE: "TOP.CARDINALITY.ALL_OBSERVATIONS_RECEIPTED",
  DELTA_METROLOGY: "TOP.DELTA.INTENDED_ACTUAL_OBSERVED_DIFFERENTIATED",
  DECISION_AUTHORITY: "TOP.DECISION.INDEPENDENT_AUTHORITY",
  DECISION_BINDING: "TOP.DECISION.EXACT_BINDING",
  DECISION_ATTESTATION: "TOP.DECISION.CONTENT_BOUND",
  DECISION_NON_SELF_AUTHORIZATION: "TOP.DECISION.NO_SELF_AUTHORIZATION",
  ADMISSION_BARRIERS: "TOP.DECISION.ADMISSION_REQUIRES_COMPLETE_DERIVATION",
  NON_ADMISSION_NO_STANDING: "TOP.DECISION.NON_ADMISSION_HAS_NO_STANDING",
  ABSENCE_IS_UNSETTLED: "TOP.DECISION.ABSENCE_IS_UNSETTLED",
  STATE_NON_SELF_INSTALLATION: "TOP.STATE.NO_SELF_INSTALLATION",
} as const;

function receiptPayload(receipt: TransitionOccurrenceReceipt): TransitionOccurrenceReceiptPayload {
  return {
    receiptId: receipt.receiptId,
    transitionId: receipt.transitionId,
    observationRefs: receipt.observationRefs,
    recordedByRef: receipt.recordedByRef,
    recordedAt: receipt.recordedAt,
    claimCeiling: receipt.claimCeiling,
    evidenceAdmissionEffect: receipt.evidenceAdmissionEffect,
    truthEffect: receipt.truthEffect,
    settlementEffect: receipt.settlementEffect,
  };
}

export function successionDecisionPayload(
  decision: SuccessionDecision,
): SuccessionDecisionPayload {
  return {
    decisionId: decision.decisionId,
    transitionId: decision.transitionId,
    subjectRef: decision.subjectRef,
    receiptRefs: decision.receiptRefs,
    evidenceAssessmentRefs: decision.evidenceAssessmentRefs,
    settlementPolicyRef: decision.settlementPolicyRef,
    settlementPolicyVersion: decision.settlementPolicyVersion,
    decisionAuthorityRef: decision.decisionAuthorityRef,
    successionJudgment: decision.successionJudgment,
    disposition: decision.disposition,
    recognizedStanding: decision.recognizedStanding,
    reasons: decision.reasons,
    unresolvedBurdens: decision.unresolvedBurdens,
    decidedAt: decision.decidedAt,
  };
}

export function evidenceAssessmentPayload(
  assessment: EvidenceAssessment,
): Omit<EvidenceAssessment, "integrity"> {
  const { integrity: _integrity, ...payload } = assessment;
  return payload;
}

export function transitionOccurrenceReceiptPayload(
  receipt: TransitionOccurrenceReceipt,
): TransitionOccurrenceReceiptPayload {
  return receiptPayload(receipt);
}

function sortedStrings(values: string[]): string[] {
  return [...values].sort((left, right) => left.localeCompare(right));
}

function equalStrings(left: string[], right: string[]): boolean {
  return canonicalize(sortedStrings(left)) === canonicalize(sortedStrings(right));
}

function deltaKey(element: DeltaElement): string {
  return canonicalize(element);
}

function aggregateDelta(sets: DeltaSet[]): DeltaSet {
  const elements = new Map<string, DeltaElement>();
  for (const set of sets) {
    for (const element of set.elements) {
      elements.set(deltaKey(element), element);
    }
  }

  return {
    profile: "one.transition-delta.f0.1",
    elements: [...elements.values()].sort((left, right) =>
      deltaKey(left).localeCompare(deltaKey(right)),
    ),
  };
}

function deltaDifference(left: DeltaSet, right: DeltaSet): string[] {
  const rightKeys = new Set(right.elements.map(deltaKey));
  return left.elements.map(deltaKey).filter((key) => !rightKeys.has(key)).sort();
}

function dateWithin(value: string, start: string, end: string): boolean {
  const instant = Date.parse(value);
  const lower = Date.parse(start);
  const upper = Date.parse(end);
  return (
    Number.isFinite(instant) &&
    Number.isFinite(lower) &&
    Number.isFinite(upper) &&
    instant >= lower &&
    instant <= upper
  );
}

function graphIsAcyclic(edges: Map<string, string[]>): boolean {
  const visiting = new Set<string>();
  const visited = new Set<string>();

  const visit = (node: string): boolean => {
    if (visiting.has(node)) {
      return false;
    }
    if (visited.has(node)) {
      return true;
    }
    visiting.add(node);
    for (const target of edges.get(node) ?? []) {
      if (edges.has(target) && !visit(target)) {
        return false;
      }
    }
    visiting.delete(node);
    visited.add(node);
    return true;
  };

  return [...edges.keys()].every(visit);
}

function makeFinding(
  code: string,
  passed: boolean,
  message: string,
  artifactRefs: string[],
): InvariantFinding {
  return {
    code,
    status: passed ? "PASS" : "FAIL",
    message,
    artifactRefs,
  };
}

export function assessTransitionOccurrenceProtocol(
  input: TransitionOccurrenceProtocolInput,
): TransitionOccurrenceProtocolAssessment {
  const findings: InvariantFinding[] = [];
  const promotionBarrierFailures = new Set<string>();
  const decisionFailures = new Set<string>();
  const proposal = input.proposal;
  const admission = input.attemptAdmission;
  const authority = input.authorityDerivation;
  const attempts = input.attempts;
  const decision = input.decision;
  const decisionAuthority = input.decisionAuthority;
  const policy = input.settlementPolicy;

  const record = (
    code: string,
    passed: boolean,
    message: string,
    artifactRefs: string[],
    lane: "PROMOTION" | "DECISION" | "INFORMATIONAL" = "PROMOTION",
  ): void => {
    findings.push(makeFinding(code, passed, message, artifactRefs));
    if (!passed && lane === "PROMOTION") {
      promotionBarrierFailures.add(code);
    }
    if (!passed && lane === "DECISION") {
      decisionFailures.add(code);
    }
  };

  const artifactIds = [
    proposal.transitionId,
    proposal.proposalId,
    admission?.attemptAdmissionId,
    admission?.capabilityRef,
    authority?.derivationId,
    ...attempts.map((attempt) => attempt.executionAttemptId),
    ...input.occurrences.map((occurrence) => occurrence.occurrenceId),
    ...input.observations.map((observation) => observation.observationId),
    ...input.receipts.map((receipt) => receipt.receiptId),
    ...input.evidenceAssessments.map((assessment) => assessment.evidenceAssessmentId),
    input.successorState.stateId,
    decisionAuthority?.decisionAuthorityId,
    decision?.decisionId,
  ].filter((value): value is string => Boolean(value));
  const internalArtifactRefs = new Set(artifactIds);
  const externalRefs = (refs: string[]): boolean =>
    refs.length > 0 && refs.every((reference) => !internalArtifactRefs.has(reference));
  const identitySeparated = new Set(artifactIds).size === artifactIds.length;
  record(
    TOP_RULES.IDENTITY_SEPARATION,
    identitySeparated,
    identitySeparated
      ? "Every promotion artifact has a distinct identifier."
      : "At least two constitutionally distinct artifacts reuse an identifier.",
    artifactIds,
  );

  const proposalNonAuthority =
    proposal.authorityEffect === "NONE" && proposal.standingEffect === "NONE";
  record(
    TOP_RULES.PROPOSAL_NON_AUTHORITY,
    proposalNonAuthority,
    proposalNonAuthority
      ? "The proposal supplies neither authority nor standing."
      : "The proposal claims an authority or standing effect.",
    [proposal.proposalId],
  );

  const authorityIndependent = Boolean(
    authority &&
      admission &&
      authority.derivationId !== admission.attemptAdmissionId &&
      authority.derivationId !== admission.capabilityRef &&
      authority.grantRef !== admission.capabilityRef &&
      !internalArtifactRefs.has(authority.grantRef) &&
      externalRefs(authority.sourceArtifactRefs) &&
      !authority.sourceArtifactRefs.includes(authority.derivationId) &&
      !authority.sourceArtifactRefs.includes(admission.attemptAdmissionId) &&
      !authority.revoked,
  );
  record(
    TOP_RULES.AUTHORITY_INDEPENDENCE,
    authorityIndependent,
    authorityIndependent
      ? "Attempt admission authority is derived from independent attributable material."
      : "Attempt admission authority is absent, revoked, self-supplied, or supplied by capability.",
    [authority?.derivationId ?? "MISSING_AUTHORITY", admission?.attemptAdmissionId ?? "MISSING_COMMITMENT"],
  );

  const authorityExact = Boolean(
    authority &&
      authority.actorRef === proposal.actorRef &&
      authority.subjectRef === proposal.subjectRef &&
      authority.action === proposal.action &&
      authority.objectRef === proposal.objectRef &&
      authority.purpose === proposal.purpose &&
      equalStrings(authority.scope, proposal.scope) &&
      dateWithin(proposal.proposedAt, authority.issuedAt, authority.validUntil),
  );
  record(
    TOP_RULES.AUTHORITY_EXACT_BINDING,
    authorityExact,
    authorityExact
      ? "Authority derivation exactly binds actor, subject, action, object, purpose, scope, and time."
      : "Authority derivation does not exactly bind the proposed transition.",
    [authority?.derivationId ?? "MISSING_AUTHORITY", proposal.proposalId],
  );

  const commitmentBound = Boolean(
    admission &&
      authority &&
      admission.transitionId === proposal.transitionId &&
      admission.proposalRef === proposal.proposalId &&
      verifyCommitment(proposal, admission.proposalIntegrity) &&
      admission.authorityDerivationRef === authority.derivationId &&
      admission.actorRef === proposal.actorRef &&
      admission.subjectRef === proposal.subjectRef &&
      admission.action === proposal.action &&
      admission.objectRef === proposal.objectRef &&
      admission.purpose === proposal.purpose &&
      equalStrings(admission.scope, proposal.scope) &&
      canonicalize(admission.payloadIntegrity) === canonicalize(proposal.payloadIntegrity) &&
      canonicalize(admission.authorizedDelta) === canonicalize(proposal.intendedDelta) &&
      admission.policyRef === authority.policyRef &&
      admission.policyVersion === authority.policyVersion &&
      admission.authorityEpoch === authority.authorityEpoch &&
      dateWithin(admission.committedAt, authority.issuedAt, authority.validUntil) &&
      Date.parse(admission.expiresAt) <= Date.parse(authority.validUntil),
  );
  record(
    TOP_RULES.ATTEMPT_ADMISSION_PROPOSAL_BINDING,
    commitmentBound,
    commitmentBound
      ? "Attempt admission binds the exact proposal, authority derivation, payload, delta, and governing context."
      : "Attempt admission is missing or does not exactly bind its independent proposal and authority basis.",
    [proposal.proposalId, admission?.attemptAdmissionId ?? "MISSING_COMMITMENT"],
  );

  const capabilityNonAuthority = Boolean(
    admission &&
      admission.capabilityRef !== admission.authorityDerivationRef &&
      admission.capabilityRef !== authority?.grantRef &&
      admission.capabilityRef !== authority?.derivationId,
  );
  record(
    TOP_RULES.CAPABILITY_NON_AUTHORITY,
    capabilityNonAuthority,
    capabilityNonAuthority
      ? "Capability remains a means and supplies no authority derivation."
      : "Capability is being reused as authority or derivation.",
    [admission?.capabilityRef ?? "MISSING_CAPABILITY", authority?.derivationId ?? "MISSING_AUTHORITY"],
  );

  const attemptsBound = Boolean(
    admission &&
      attempts.length > 0 &&
      attempts.every(
        (attempt) =>
          attempt.transitionId === proposal.transitionId &&
          attempt.attemptAdmissionRef === admission.attemptAdmissionId &&
          attempt.actorRef === admission.actorRef &&
          attempt.capabilityRef === admission.capabilityRef &&
          canonicalize(attempt.payloadIntegrity) ===
            canonicalize(admission.payloadIntegrity),
      ),
  );
  record(
    TOP_RULES.EXECUTION_ADMISSION_BINDING,
    attemptsBound,
    attemptsBound
      ? "Every execution attempt binds the exact admission, actor, capability, and payload."
      : "Execution attempts are absent or at least one is substituted relative to the admission.",
    [
      admission?.attemptAdmissionId ?? "MISSING_ADMISSION",
      ...attempts.map((attempt) => attempt.executionAttemptId),
    ],
  );

  const executionCurrent = Boolean(
    admission &&
      authority &&
      attempts.length > 0 &&
      attempts.every(
        (attempt) =>
          attempt.executionContext.policyRef === admission.policyRef &&
          attempt.executionContext.policyVersion === admission.policyVersion &&
          attempt.executionContext.authorityEpoch === admission.authorityEpoch &&
          attempt.executionContext.policyRef === authority.policyRef &&
          attempt.executionContext.policyVersion === authority.policyVersion &&
          attempt.executionContext.authorityEpoch === authority.authorityEpoch &&
          dateWithin(attempt.startedAt, admission.committedAt, admission.expiresAt) &&
          dateWithin(attempt.startedAt, authority.issuedAt, authority.validUntil) &&
          !authority.revoked,
      ),
  );
  record(
    TOP_RULES.EXECUTION_CURRENTNESS,
    executionCurrent,
    executionCurrent
      ? "Authorization remains exact and current at the point of use."
      : "Authorization-time validity does not survive the execution-time check.",
    [
      ...attempts.map((attempt) => attempt.executionAttemptId),
      admission?.attemptAdmissionId ?? "MISSING_ADMISSION",
    ],
  );

  const attemptIds = new Set(attempts.map((attempt) => attempt.executionAttemptId));
  const occurrenceIds = new Set(input.occurrences.map((occurrence) => occurrence.occurrenceId));
  const occurrencesBound = input.occurrences.every(
    (occurrence) =>
      occurrence.transitionId === proposal.transitionId &&
      attemptIds.has(occurrence.executionRef) &&
      occurrence.standingEffect === "NONE",
  );
  record(
    TOP_RULES.OCCURRENCE_EXECUTION_BINDING,
    occurrencesBound,
    occurrencesBound
      ? "Every occurrence is separately identified and bound to the execution attempt."
      : "At least one occurrence is unbound, cross-transition, or standing-bearing.",
    [...attemptIds, ...occurrenceIds],
  );

  const observationById = new Map(
    input.observations.map((observation) => [observation.observationId, observation]),
  );
  const observationsBound = input.observations.every(
    (observation) =>
      observation.transitionId === proposal.transitionId &&
      observation.occurrenceRefs.length > 0 &&
      observation.occurrenceRefs.every((reference) => occurrenceIds.has(reference)),
  );
  record(
    TOP_RULES.OBSERVATION_OCCURRENCE_BINDING,
    observationsBound,
    observationsBound
      ? "Every observation is attributable to one or more known occurrences."
      : "At least one observation lacks an attributable occurrence basis.",
    input.observations.map((observation) => observation.observationId),
  );

  const observationsNonPromoting = input.observations.every(
    (observation) =>
      observation.claimCeiling === "OBSERVATION_ONLY" &&
      observation.evidenceAdmissionEffect === "NONE" &&
      observation.truthEffect === "NONE" &&
      observation.settlementEffect === "NONE",
  );
  record(
    TOP_RULES.OBSERVATION_NO_PROMOTION,
    observationsNonPromoting,
    observationsNonPromoting
      ? "MANTIS observations supply no evidence, truth, settlement, or standing promotion."
      : "An observation exceeds the observation-only claim ceiling.",
    input.observations.map((observation) => observation.observationId),
  );

  const observationCompletenessHonest = input.observations.every((observation) => {
    if (observation.completeness !== "COMPLETE") {
      return true;
    }
    const covered = input.occurrences.filter((occurrence) =>
      observation.occurrenceRefs.includes(occurrence.occurrenceId),
    );
    const coveredDelta = aggregateDelta(covered.map((occurrence) => occurrence.actualDelta));
    return canonicalize(coveredDelta) === canonicalize(aggregateDelta([observation.observedDelta]));
  });
  record(
    TOP_RULES.OBSERVATION_COMPLETENESS,
    observationCompletenessHonest,
    observationCompletenessHonest
      ? "Observation completeness does not exceed the delta it actually covers."
      : "A partial or divergent observation is represented as complete.",
    input.observations.map((observation) => observation.observationId),
  );

  const receiptsBound = input.receipts.every(
    (receipt) =>
      receipt.transitionId === proposal.transitionId &&
      receipt.observationRefs.length > 0 &&
      receipt.observationRefs.every((reference) => observationById.has(reference)),
  );
  record(
    TOP_RULES.RECEIPT_OBSERVATION_BINDING,
    receiptsBound,
    receiptsBound
      ? "Every MUS receipt binds one or more attributable observations."
      : "At least one receipt lacks an attributable observation basis.",
    input.receipts.map((receipt) => receipt.receiptId),
  );

  const receiptsIntegrity = input.receipts.every((receipt) =>
    verifyCommitment(receiptPayload(receipt), receipt.integrity),
  );
  record(
    TOP_RULES.RECEIPT_INTEGRITY,
    receiptsIntegrity,
    receiptsIntegrity
      ? "Every receipt is deterministically bound to its declared representation."
      : "At least one receipt admission does not reconstruct.",
    input.receipts.map((receipt) => receipt.receiptId),
  );

  const receiptsNonPromoting = input.receipts.every(
    (receipt) =>
      receipt.claimCeiling === "OBSERVATION_REPRESENTATION_ONLY" &&
      receipt.evidenceAdmissionEffect === "NONE" &&
      receipt.truthEffect === "NONE" &&
      receipt.settlementEffect === "NONE",
  );
  record(
    TOP_RULES.RECEIPT_NO_PROMOTION,
    receiptsNonPromoting,
    receiptsNonPromoting
      ? "MUS records observations without manufacturing evidence, truth, settlement, or standing."
      : "A receipt exceeds its representation-only claim ceiling.",
    input.receipts.map((receipt) => receipt.receiptId),
  );

  const receiptById = new Map(input.receipts.map((receipt) => [receipt.receiptId, receipt]));
  const evidenceById = new Map(
    input.evidenceAssessments.map((assessment) => [
      assessment.evidenceAssessmentId,
      assessment,
    ]),
  );
  const evidenceIndependent = input.evidenceAssessments.every(
    (assessment) =>
      externalRefs(assessment.admissionBasisRefs) &&
      !assessment.admissionBasisRefs.includes(assessment.evidenceAssessmentId) &&
      assessment.assessedByRef !== assessment.evidenceAssessmentId &&
      assessment.authorityEffect === "NONE" &&
      assessment.settlementEffect === "NONE" &&
      assessment.claimCeiling === "BOUNDED_CONSEQUENCE_EVIDENCE",
  );
  record(
    TOP_RULES.EVIDENCE_INDEPENDENCE,
    evidenceIndependent,
    evidenceIndependent
      ? "Evidence standing is supplied by an independent admission basis rather than by observation or receipt alone."
      : "An evidence assessment is self-admitting, ungrounded, or exceeds its claim ceiling.",
    input.evidenceAssessments.map((assessment) => assessment.evidenceAssessmentId),
  );

  const evidenceBound = input.evidenceAssessments.every(
    (assessment) =>
      assessment.transitionId === proposal.transitionId &&
      assessment.observationRefs.length > 0 &&
      assessment.receiptRefs.length > 0 &&
      assessment.observationRefs.every((reference) => observationById.has(reference)) &&
      assessment.receiptRefs.every((reference) => receiptById.has(reference)),
  );
  record(
    TOP_RULES.EVIDENCE_BINDING,
    evidenceBound,
    evidenceBound
      ? "Every evidence assessment binds attributable observations and their MUS receipts."
      : "An evidence assessment lacks exact observation or receipt bindings.",
    input.evidenceAssessments.map((assessment) => assessment.evidenceAssessmentId),
  );

  const evidenceIntegrity = input.evidenceAssessments.every((assessment) =>
    verifyCommitment(evidenceAssessmentPayload(assessment), assessment.integrity),
  );
  record(
    TOP_RULES.EVIDENCE_INTEGRITY,
    evidenceIntegrity,
    evidenceIntegrity
      ? "Every evidence assessment is deterministically content-bound."
      : "At least one evidence assessment does not reconstruct.",
    input.evidenceAssessments.map((assessment) => assessment.evidenceAssessmentId),
  );

  const derivationEdges = new Map<string, string[]>();
  if (authority) {
    derivationEdges.set(authority.derivationId, authority.sourceArtifactRefs);
  }
  if (admission) {
    derivationEdges.set(admission.attemptAdmissionId, [
      admission.proposalRef,
      admission.authorityDerivationRef,
    ]);
  }
  for (const assessment of input.evidenceAssessments) {
    derivationEdges.set(assessment.evidenceAssessmentId, [
      ...assessment.admissionBasisRefs,
      ...assessment.observationRefs,
      ...assessment.receiptRefs,
    ]);
  }
  if (decisionAuthority) {
    derivationEdges.set(
      decisionAuthority.decisionAuthorityId,
      decisionAuthority.sourceArtifactRefs,
    );
  }
  if (decision) {
    derivationEdges.set(decision.decisionId, [
      decision.decisionAuthorityRef,
      ...decision.receiptRefs,
      ...decision.evidenceAssessmentRefs,
    ]);
  }
  const derivationAcyclic = graphIsAcyclic(derivationEdges);
  record(
    TOP_RULES.DERIVATION_ACYCLIC,
    derivationAcyclic,
    derivationAcyclic
      ? "The derivation graph terminates at independent roots without circular standing."
      : "A derivation cycle permits artifacts to bootstrap one another's standing.",
    [...derivationEdges.keys()],
  );

  const observedOccurrenceIds = new Set(
    input.observations.flatMap((observation) => observation.occurrenceRefs),
  );
  const allOccurrencesObserved = [...occurrenceIds].every((id) =>
    observedOccurrenceIds.has(id),
  );
  record(
    TOP_RULES.OCCURRENCE_COVERAGE,
    !policy.requireAllOccurrencesObservedForAdmission || allOccurrencesObserved,
    allOccurrencesObserved
      ? "Every occurrence is covered by at least one observation."
      : "At least one occurrence is absent from the observation surface.",
    [...occurrenceIds],
  );

  const receiptedObservationIds = new Set(
    input.receipts.flatMap((receipt) => receipt.observationRefs),
  );
  const allObservationsReceipted = [...observationById.keys()].every((id) =>
    receiptedObservationIds.has(id),
  );
  record(
    TOP_RULES.OBSERVATION_COVERAGE,
    !policy.requireAllObservationsReceiptedForAdmission || allObservationsReceipted,
    allObservationsReceipted
      ? "Every observation is represented by at least one receipt."
      : "At least one observation is absent from the receipt surface.",
    [...observationById.keys()],
  );

  const admittedSupportingEvidence = input.evidenceAssessments.filter(
    (assessment) =>
      assessment.admissionStatus === "ADMITTED" &&
      assessment.verdict === "SUPPORT" &&
      assessment.strength === "STRONG",
  );
  const evidenceObservationRefs = new Set(
    admittedSupportingEvidence.flatMap((assessment) => assessment.observationRefs),
  );
  const evidenceReceiptRefs = new Set(
    admittedSupportingEvidence.flatMap((assessment) => assessment.receiptRefs),
  );
  const evidenceSufficientForAdmission =
    admittedSupportingEvidence.length > 0 &&
    [...observationById.keys()].every((reference) => evidenceObservationRefs.has(reference)) &&
    [...receiptById.keys()].every((reference) => evidenceReceiptRefs.has(reference));
  record(
    TOP_RULES.EVIDENCE_REQUIRED_FOR_ADMISSION,
    evidenceSufficientForAdmission,
    evidenceSufficientForAdmission
      ? "Independently admitted bounded consequence evidence covers every observation and receipt used for succession."
      : "Observation receipts do not independently supply the evidence standing required for succession admission.",
    admittedSupportingEvidence.map((assessment) => assessment.evidenceAssessmentId),
  );

  const authorizedDelta = admission?.authorizedDelta ?? proposal.intendedDelta;
  const occurredDelta = aggregateDelta(input.occurrences.map((occurrence) => occurrence.actualDelta));
  const observedDelta = aggregateDelta(input.observations.map((observation) => observation.observedDelta));
  const missingAuthorized = deltaDifference(authorizedDelta, occurredDelta);
  const unexpectedOccurred = deltaDifference(occurredDelta, authorizedDelta);
  const missingObservation = deltaDifference(occurredDelta, observedDelta);
  const unresolved = observedDelta.elements
    .filter((element) => element.class === "UNRESOLVED")
    .map(deltaKey)
    .sort();
  const deltaExact =
    missingAuthorized.length === 0 &&
    unexpectedOccurred.length === 0 &&
    missingObservation.length === 0 &&
    unresolved.length === 0;
  record(
    TOP_RULES.DELTA_METROLOGY,
    !policy.requireExactDeltaForAdmission || deltaExact,
    deltaExact
      ? "Authorized, occurred, and observed deltas remain distinct and reconcile exactly."
      : "Delta divergence remains a first-class settlement input.",
    [proposal.transitionId],
  );

  const decisionAuthorityValid = Boolean(
    decision &&
      decisionAuthority &&
      !decisionAuthority.revoked &&
      decisionAuthority.action === "DECIDE_SUCCESSION" &&
      decisionAuthority.subjectRefs.includes(input.successorState.stateId) &&
      decisionAuthority.settlementPolicyRef === policy.policyId &&
      decisionAuthority.settlementPolicyVersion === policy.version &&
      externalRefs(decisionAuthority.sourceArtifactRefs) &&
      !decisionAuthority.sourceArtifactRefs.includes(decisionAuthority.decisionAuthorityId) &&
      dateWithin(decision.decidedAt, decisionAuthority.validFrom, decisionAuthority.validUntil),
  );
  record(
    TOP_RULES.DECISION_AUTHORITY,
    decision ? decisionAuthorityValid : true,
    decision
      ? decisionAuthorityValid
        ? "Succession disposition is backed by independent current decision authority."
        : "Succession disposition lacks independent current decision authority."
      : "No decision artifact is present; effective disposition remains UNSETTLED.",
    [decision?.decisionId ?? "NO_DECISION", decisionAuthority?.decisionAuthorityId ?? "NO_DECISION_AUTHORITY"],
    decision ? "DECISION" : "INFORMATIONAL",
  );

  const decisionNotSelfAuthorizing = Boolean(
    !decision ||
      (decisionAuthority &&
        decision.decisionId !== decision.decisionAuthorityRef &&
        decision.decisionId !== decisionAuthority.decisionAuthorityId &&
        decisionAuthority.sourceArtifactRefs.every((reference) => reference !== decision.decisionId)),
  );
  record(
    TOP_RULES.DECISION_NON_SELF_AUTHORIZATION,
    decisionNotSelfAuthorizing,
    decisionNotSelfAuthorizing
      ? "No decision artifact supplies the derivation required for its own standing."
      : "The decision or its authority basis is self-referential.",
    [decision?.decisionId ?? "NO_DECISION", decisionAuthority?.decisionAuthorityId ?? "NO_DECISION_AUTHORITY"],
    decision ? "DECISION" : "INFORMATIONAL",
  );

  const decisionBound = Boolean(
    !decision ||
      (decisionAuthority &&
        decision.transitionId === proposal.transitionId &&
        decision.subjectRef === input.successorState.stateId &&
        decision.settlementPolicyRef === policy.policyId &&
        decision.settlementPolicyVersion === policy.version &&
        decision.decisionAuthorityRef === decisionAuthority.decisionAuthorityId &&
        decision.receiptRefs.every((reference) => receiptById.has(reference)) &&
        decision.evidenceAssessmentRefs.every((reference) => evidenceById.has(reference)) &&
        (decision.disposition !== "ADMIT" ||
          (decision.receiptRefs.length > 0 &&
            decision.evidenceAssessmentRefs.length > 0 &&
            equalStrings(decision.receiptRefs, [...receiptById.keys()]) &&
            equalStrings(
              decision.evidenceAssessmentRefs,
              admittedSupportingEvidence.map(
                (assessment) => assessment.evidenceAssessmentId,
              ),
            )))),
  );
  record(
    TOP_RULES.DECISION_BINDING,
    decisionBound,
    decisionBound
      ? "Decision binds the exact transition, successor, receipts, evidence assessments, policy, and decision authority."
      : "Decision contains a substituted or unavailable binding.",
    [decision?.decisionId ?? "NO_DECISION"],
    decision ? "DECISION" : "INFORMATIONAL",
  );

  const decisionAttested = Boolean(
    !decision ||
      (!policy.requireDecisionAttestation ||
        (decision.integrity &&
          verifyCommitment(successionDecisionPayload(decision), decision.integrity))),
  );
  record(
    TOP_RULES.DECISION_ATTESTATION,
    decisionAttested,
    decisionAttested
      ? "Decision admission reconstructs under the declared hash profile."
      : "Decision attestation is missing or does not reconstruct.",
    [decision?.decisionId ?? "NO_DECISION"],
    decision ? "DECISION" : "INFORMATIONAL",
  );

  const nonAdmissionNoStanding = Boolean(
    !decision || decision.disposition === "ADMIT" || !decision.recognizedStanding,
  );
  record(
    TOP_RULES.NON_ADMISSION_NO_STANDING,
    nonAdmissionNoStanding,
    nonAdmissionNoStanding
      ? "Only an ADMIT control disposition may recognize standing."
      : "A non-admission disposition attempts to recognize standing.",
    [decision?.decisionId ?? "NO_DECISION"],
    decision ? "DECISION" : "INFORMATIONAL",
  );

  const completeObservationForAdmission =
    !policy.requireCompleteObservationForAdmission ||
    (input.observations.length > 0 &&
      input.observations.every((observation) => observation.completeness === "COMPLETE"));
  if (!completeObservationForAdmission) {
    promotionBarrierFailures.add(TOP_RULES.OBSERVATION_COMPLETENESS);
  }

  const occurrencePresent = input.occurrences.length > 0;
  const admissionBarriersClear =
    occurrencePresent &&
    completeObservationForAdmission &&
    promotionBarrierFailures.size === 0;
  record(
    TOP_RULES.OCCURRENCE_REQUIRED_FOR_ADMISSION,
    occurrencePresent,
    occurrencePresent
      ? "At least one occurrence is independently represented for any admission."
      : "An execution attempt produced no occurrence; standing cannot be admitted from attempt alone.",
    [...attemptIds],
    "INFORMATIONAL",
  );

  const decisionAcceptedStructurally = Boolean(
    decision &&
      decisionFailures.size === 0 &&
      decisionAuthorityValid &&
      decisionNotSelfAuthorizing &&
      decisionBound &&
      decisionAttested &&
      nonAdmissionNoStanding,
  );
  const referencedEvidenceSufficient = Boolean(
    decision &&
      decision.evidenceAssessmentRefs.length > 0 &&
      decision.evidenceAssessmentRefs.every((reference) =>
        admittedSupportingEvidence.some(
          (assessment) => assessment.evidenceAssessmentId === reference,
        ),
      ),
  );
  const admissionDecisionCoherent = Boolean(
    !decision ||
      decision.disposition !== "ADMIT" ||
      (decision.successionJudgment === "ESTABLISHED" &&
        decision.recognizedStanding &&
        referencedEvidenceSufficient &&
        admissionBarriersClear),
  );
  record(
    TOP_RULES.ADMISSION_BARRIERS,
    admissionDecisionCoherent,
    admissionDecisionCoherent
      ? "Any ADMIT decision carries an ESTABLISHED judgment and satisfies every declared promotion barrier."
      : "An ADMIT decision attempts to launder an incomplete or invalid path into standing.",
    [decision?.decisionId ?? "NO_DECISION", proposal.transitionId],
    decision ? "DECISION" : "INFORMATIONAL",
  );

  const decisionAccepted = Boolean(
    decisionAcceptedStructurally && admissionDecisionCoherent,
  );
  const effectiveDisposition = decisionAccepted
    ? decision!.disposition === "ADMIT"
      ? "ADMITTED"
      : decision!.disposition === "DENY"
        ? "DENIED"
        : decision!.disposition === "QUARANTINE"
          ? "QUARANTINED"
          : "UNSETTLED"
    : "UNSETTLED";
  const standingRecognized = Boolean(
    decisionAccepted &&
      decision!.disposition === "ADMIT" &&
      decision!.successionJudgment === "ESTABLISHED" &&
      decision!.recognizedStanding &&
      admissionBarriersClear,
  );

  record(
    TOP_RULES.ABSENCE_IS_UNSETTLED,
    Boolean(decision) || effectiveDisposition === "UNSETTLED",
    decision
      ? "A present decision is evaluated on its independent basis."
      : "Decision absence maps to UNSETTLED rather than DENIED.",
    [proposal.transitionId],
    "INFORMATIONAL",
  );

  const stateClaimCoherent =
    input.successorState.claimedStanding === "UNRECOGNIZED" ||
    (standingRecognized && input.successorState.claimedDecisionRef === decision?.decisionId);
  record(
    TOP_RULES.STATE_NON_SELF_INSTALLATION,
    stateClaimCoherent,
    stateClaimCoherent
      ? "Successor state standing, if recognized, is bound to an accepted independent decision."
      : "A structurally valid or physically present state attempts to install its own standing.",
    [input.successorState.stateId, input.successorState.claimedDecisionRef ?? "NO_CLAIMED_DECISION"],
    "INFORMATIONAL",
  );

  const unresolvedBurdens = new Set<string>();
  for (const finding of findings) {
    if (finding.status === "FAIL") {
      unresolvedBurdens.add(finding.code);
    }
  }
  if (!decision) {
    unresolvedBurdens.add("SUCCESSION_DECISION_ABSENT");
  }
  for (const burden of decision?.unresolvedBurdens ?? []) {
    unresolvedBurdens.add(burden);
  }

  return {
    schemaVersion: "one.transition-occurrence-protocol.assessment.f0.1",
    semanticsStatus: "EXPERIMENTAL_REFERENCE_PROTOCOL",
    transitionId: proposal.transitionId,
    decisionPresence: decision ? "PRESENT" : "ABSENT",
    effectiveDisposition,
    decisionAccepted,
    ...(decisionAccepted ? { acceptedDecisionRef: decision!.decisionId } : {}),
    ...(decisionAccepted
      ? { acceptedSuccessionJudgment: decision!.successionJudgment }
      : {}),
    ...(standingRecognized
      ? { recognizedSuccessorRef: input.successorState.stateId }
      : {}),
    standingRecognized,
    occurrenceCount: input.occurrences.length,
    observationCount: input.observations.length,
    receiptCount: input.receipts.length,
    findings,
    deltaSettlementInput: {
      authorized: authorizedDelta,
      occurred: occurredDelta,
      observed: observedDelta,
      missingAuthorized,
      unexpectedOccurred,
      missingObservation,
      unresolved,
    },
    unresolvedBurdens: [...unresolvedBurdens].sort(),
    claimCeiling:
      "This assessment may establish bounded protocol conformance only. It creates no authority, occurrence, evidence, truth, settlement, standing, or production activation.",
  };
}
