export type Id = string;

export interface IntegrityBlock {
  algorithm: string;
  digest: string;
  canonicalization: string;
}

export type DeltaClass =
  | "PRESERVED"
  | "LOST"
  | "ATTENUATED"
  | "NEW"
  | "CHANGED"
  | "UNOBSERVED"
  | "UNRESOLVED";

export interface DeltaElement {
  class: DeltaClass;
  path: string;
  before?: IntegrityBlock;
  after?: IntegrityBlock;
  note?: string;
}

export interface DeltaSet {
  profile: "one.transition-delta.f0.1";
  elements: DeltaElement[];
}

export interface TransitionProposal {
  schemaVersion: "one.transition-proposal.f0.1";
  kind: "TransitionProposal";
  proposalId: Id;
  transitionId: Id;
  actorRef: Id;
  subjectRef: Id;
  action: string;
  objectRef: Id;
  purpose: string;
  scope: string[];
  payloadIntegrity: IntegrityBlock;
  intendedDelta: DeltaSet;
  proposedAt: string;
  authorityEffect: "NONE";
  standingEffect: "NONE";
}

export interface AuthorityDerivation {
  schemaVersion: "one.authority-derivation.f0.1";
  kind: "AuthorityDerivation";
  derivationId: Id;
  grantRef: Id;
  actorRef: Id;
  subjectRef: Id;
  action: string;
  objectRef: Id;
  purpose: string;
  scope: string[];
  conditions: string[];
  policyRef: Id;
  policyVersion: string;
  authorityEpoch: string;
  issuedAt: string;
  validUntil: string;
  revoked: boolean;
  sourceArtifactRefs: Id[];
  integrity?: IntegrityBlock;
}

export interface AttemptAdmission {
  schemaVersion: "one.attempt-admission.f0.1";
  kind: "AttemptAdmission";
  attemptAdmissionId: Id;
  transitionId: Id;
  proposalRef: Id;
  proposalIntegrity: IntegrityBlock;
  authorityDerivationRef: Id;
  capabilityRef: Id;
  actorRef: Id;
  subjectRef: Id;
  action: string;
  objectRef: Id;
  purpose: string;
  scope: string[];
  payloadIntegrity: IntegrityBlock;
  authorizedDelta: DeltaSet;
  policyRef: Id;
  policyVersion: string;
  authorityEpoch: string;
  committedAt: string;
  expiresAt: string;
}

export interface ExecutionContext {
  policyRef: Id;
  policyVersion: string;
  authorityEpoch: string;
}

export interface ExecutionAttempt {
  schemaVersion: "one.execution-attempt.f0.1";
  kind: "ExecutionAttempt";
  executionAttemptId: Id;
  transitionId: Id;
  attemptAdmissionRef: Id;
  actorRef: Id;
  capabilityRef: Id;
  payloadIntegrity: IntegrityBlock;
  executionContext: ExecutionContext;
  startedAt: string;
  status: "ATTEMPTED" | "ACCEPTED" | "PARTIAL" | "FAILED";
  standingEffect: "NONE";
}

export interface TransitionOccurrence {
  schemaVersion: "one.transition-occurrence.f0.1";
  kind: "TransitionOccurrence";
  occurrenceId: Id;
  transitionId: Id;
  executionRef: Id;
  effectType: string;
  subjectRef: Id;
  actualDelta: DeltaSet;
  occurredAt: string;
  standingEffect: "NONE";
}

export type ObservationCompleteness = "COMPLETE" | "PARTIAL" | "UNCERTAIN";

export interface Observation {
  schemaVersion: "one.transition-observation.f0.1";
  kind: "Observation";
  observationId: Id;
  transitionId: Id;
  occurrenceRefs: Id[];
  observerRef: Id;
  completeness: ObservationCompleteness;
  observedDelta: DeltaSet;
  observedAt: string;
  claimCeiling: "OBSERVATION_ONLY";
  evidenceAdmissionEffect: "NONE";
  truthEffect: "NONE";
  settlementEffect: "NONE";
}

export interface TransitionOccurrenceReceiptPayload {
  receiptId: Id;
  transitionId: Id;
  observationRefs: Id[];
  recordedByRef: Id;
  recordedAt: string;
  claimCeiling: "OBSERVATION_REPRESENTATION_ONLY";
  evidenceAdmissionEffect: "NONE";
  truthEffect: "NONE";
  settlementEffect: "NONE";
}

export interface TransitionOccurrenceReceipt
  extends TransitionOccurrenceReceiptPayload {
  schemaVersion: "one.transition-occurrence-receipt.f0.1";
  kind: "TransitionOccurrenceReceipt";
  integrity: IntegrityBlock;
}

export interface SuccessorStateRef {
  schemaVersion: "one.successor-state-ref.f0.1";
  kind: "SuccessorStateRef";
  stateId: Id;
  transitionRef: Id;
  structuralValidity: "VALID" | "INVALID" | "UNKNOWN";
  physicalPresence: boolean;
  claimedStanding: "RECOGNIZED" | "UNRECOGNIZED";
  claimedDecisionRef?: Id;
}

export interface SettlementPolicy {
  schemaVersion: "one.settlement-policy.f0.1";
  kind: "SettlementPolicy";
  policyId: Id;
  version: string;
  requireCompleteObservationForAdmission: boolean;
  requireAllOccurrencesObservedForAdmission: boolean;
  requireAllObservationsReceiptedForAdmission: boolean;
  requireExactDeltaForAdmission: boolean;
  requireDecisionAttestation: boolean;
}

export interface DecisionAuthority {
  schemaVersion: "one.decision-authority.f0.1";
  kind: "DecisionAuthority";
  decisionAuthorityId: Id;
  actorRef: Id;
  action: "DECIDE_SUCCESSION";
  subjectRefs: Id[];
  settlementPolicyRef: Id;
  settlementPolicyVersion: string;
  authorityEpoch: string;
  validFrom: string;
  validUntil: string;
  revoked: boolean;
  sourceArtifactRefs: Id[];
  integrity?: IntegrityBlock;
}

export type SuccessionJudgment = "ESTABLISHED" | "BREACHED" | "UNESTABLISHED";

export type DecisionDisposition = "ADMIT" | "DENY" | "QUARANTINE" | "HOLD";

export type EffectiveDisposition = "ADMITTED" | "DENIED" | "QUARANTINED" | "UNSETTLED";

export interface EvidenceAssessment {
  schemaVersion: "one.evidence-assessment.f0.1";
  kind: "EvidenceAssessment";
  evidenceAssessmentId: Id;
  transitionId: Id;
  observationRefs: Id[];
  receiptRefs: Id[];
  proposition: string;
  verdict: "SUPPORT" | "REFUTE" | "INCONCLUSIVE";
  strength: "WEAK" | "PARTIAL" | "STRONG";
  admissionStatus: "ADMITTED" | "REJECTED" | "UNASSESSED";
  admissionBasisRefs: Id[];
  assessedByRef: Id;
  assessedAt: string;
  claimCeiling: "BOUNDED_CONSEQUENCE_EVIDENCE";
  authorityEffect: "NONE";
  settlementEffect: "NONE";
  integrity: IntegrityBlock;
}

export interface SuccessionDecisionPayload {
  decisionId: Id;
  transitionId: Id;
  subjectRef: Id;
  receiptRefs: Id[];
  evidenceAssessmentRefs: Id[];
  settlementPolicyRef: Id;
  settlementPolicyVersion: string;
  decisionAuthorityRef: Id;
  successionJudgment: SuccessionJudgment;
  disposition: DecisionDisposition;
  recognizedStanding: boolean;
  reasons: string[];
  unresolvedBurdens: string[];
  decidedAt: string;
}

export interface SuccessionDecision extends SuccessionDecisionPayload {
  schemaVersion: "one.succession-decision.f0.1";
  kind: "SuccessionDecision";
  integrity?: IntegrityBlock;
}

export interface TransitionOccurrenceProtocolInput {
  schemaVersion: "one.transition-occurrence-protocol.input.f0.1";
  evaluationTime: string;
  proposal: TransitionProposal;
  authorityDerivation?: AuthorityDerivation;
  attemptAdmission?: AttemptAdmission;
  attempts: ExecutionAttempt[];
  occurrences: TransitionOccurrence[];
  observations: Observation[];
  receipts: TransitionOccurrenceReceipt[];
  evidenceAssessments: EvidenceAssessment[];
  successorState: SuccessorStateRef;
  settlementPolicy: SettlementPolicy;
  decisionAuthority?: DecisionAuthority;
  decision?: SuccessionDecision;
}

export type InvariantStatus = "PASS" | "FAIL" | "NOT_APPLICABLE";

export interface InvariantFinding {
  code: string;
  status: InvariantStatus;
  message: string;
  artifactRefs: Id[];
}

export interface DeltaSettlementInput {
  authorized: DeltaSet;
  occurred: DeltaSet;
  observed: DeltaSet;
  missingAuthorized: string[];
  unexpectedOccurred: string[];
  missingObservation: string[];
  unresolved: string[];
}

export interface TransitionOccurrenceProtocolAssessment {
  schemaVersion: "one.transition-occurrence-protocol.assessment.f0.1";
  semanticsStatus: "EXPERIMENTAL_REFERENCE_PROTOCOL";
  transitionId: Id;
  decisionPresence: "PRESENT" | "ABSENT";
  effectiveDisposition: EffectiveDisposition;
  decisionAccepted: boolean;
  acceptedDecisionRef?: Id;
  acceptedSuccessionJudgment?: SuccessionJudgment;
  recognizedSuccessorRef?: Id;
  standingRecognized: boolean;
  occurrenceCount: number;
  observationCount: number;
  receiptCount: number;
  findings: InvariantFinding[];
  deltaSettlementInput: DeltaSettlementInput;
  unresolvedBurdens: string[];
  claimCeiling: string;
}
