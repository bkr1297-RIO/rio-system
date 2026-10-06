export type OperatorName =
  | "DIFFERENTIATE"
  | "RELATE"
  | "TRANSFORM"
  | "RETURN"
  | "ILLUMINATE"
  | "ORIENT"
  | "INHERIT";

export type ArtifactKind =
  | "DistinctionSet"
  | "RelationGraph"
  | "TransformationRecord"
  | "ReturnObject"
  | "IlluminationView"
  | "BearingOffer"
  | "InheritanceRecord";

export interface Finding {
  code: string;
  message: string;
  basisRefs: string[];
}

export interface ArtifactBase<K extends ArtifactKind, O extends OperatorName> {
  schemaVersion: "rgcb.artifact.v0.1";
  artifactId: string;
  kind: K;
  operator: O;
  claimCeiling: string;
  findings: Finding[];
  unresolved: string[];
}

export interface OperatorFailure {
  schemaVersion: "rgcb.failure.v0.1";
  kind: "OperatorFailure";
  operator: OperatorName;
  inputRef: string;
  standing: "HELD";
  reasonCode: string;
  message: string;
  missingBasis: string[];
  conflictingBasis: string[];
  partialOutputRefs: string[];
  actualPartialEffects: string[];
  uncertainty: string[];
  residue: string[];
  repairRoute: string[];
}

export interface SuccessResult<A extends OperatorArtifact = OperatorArtifact> {
  ok: true;
  operator: A["operator"];
  artifact: A;
}

export interface FailureResult {
  ok: false;
  operator: OperatorName;
  failure: OperatorFailure;
}

export type OperatorResult<A extends OperatorArtifact = OperatorArtifact> =
  | SuccessResult<A>
  | FailureResult;

export interface ClaimInput {
  id: string;
  proposition: string;
  sourceRef?: string;
  standing?: string;
  uncertainty?: string;
}

export interface DifferentiationInput {
  id: string;
  conservationContext: string[];
  claims: ClaimInput[];
}

export interface DistinctionItem {
  id: string;
  proposition: string;
  sourceRef: string;
  standing: string;
  uncertainty: string;
}

export interface DistinctionSet extends ArtifactBase<"DistinctionSet", "DIFFERENTIATE"> {
  conservationContext: string[];
  preservedDimensions: string[];
  items: DistinctionItem[];
}

export interface RelationOperand {
  id: string;
  type: string;
}

export type RelationType =
  | "CORRELATED"
  | "CAUSES"
  | "DEPENDENT"
  | "IDENTICAL_TO"
  | "ORTHOGONAL"
  | "UNDETERMINED";

export interface RelationInput {
  id: string;
  operands: RelationOperand[];
  sourceRef: string;
  targetRef: string;
  requestedRelation: RelationType;
  cooccurrenceObserved: boolean;
  causalBasisRefs: string[];
}

export interface RelationGraph extends ArtifactBase<"RelationGraph", "RELATE"> {
  operands: RelationOperand[];
  edges: Array<{
    sourceRef: string;
    targetRef: string;
    type: RelationType;
    causality: "SUPPORTED" | "UNDETERMINED";
    basisRefs: string[];
  }>;
  rejectedAssertions: Array<{
    relation: RelationType;
    reasonCode: string;
  }>;
}

export interface TransformEvent {
  id: string;
  kind: "FORM" | "GRANT" | "AUTHORIZED_OCCURRENCE" | "UNAUTHORIZED_OCCURRENCE" | "RETURN" | "RETURN_BREACH";
}

export interface TransformationInput {
  id: string;
  predecessorRef: string;
  successorRef: string;
  requiredAuthorization: boolean;
  path: TransformEvent[];
  delta: string[];
  residue: string[];
}

export interface TransformationRecord extends ArtifactBase<"TransformationRecord", "TRANSFORM"> {
  predecessorRef: string;
  successorRef: string;
  disposition: "ACCEPTED" | "HELD" | "REJECTED";
  lawfulSuccession: "ESTABLISHED" | "UNESTABLISHED" | "BREACHED";
  pathPreserved: true;
  path: TransformEvent[];
  delta: string[];
  residue: string[];
  reasonCodes: string[];
}

export interface ReturnInput {
  id: string;
  sourceRef?: string;
  recipientRef: string;
  intended: boolean;
  authorized: boolean;
  attempted: boolean;
  providerAccepted: boolean;
  deliveryAcknowledged: boolean;
  readAcknowledged: boolean;
  outcomeEvidence: boolean;
  settlementClaimed: boolean;
}

export interface ReturnObject extends ArtifactBase<"ReturnObject", "RETURN"> {
  sourceRef: string;
  recipientRef: string;
  intended: "DECLARED" | "NOT_DECLARED";
  authorized: "ESTABLISHED" | "NOT_ESTABLISHED";
  attempted: "ATTEMPTED" | "NOT_ATTEMPTED";
  providerAcceptance: "OBSERVED" | "UNOBSERVED";
  delivery: "EVIDENCED" | "UNRESOLVED";
  read: "EVIDENCED" | "UNRESOLVED";
  outcome: "EVIDENCED" | "UNRESOLVED";
  settlement: "SETTLED" | "OPEN";
}

export interface IlluminationEvidence {
  id: string;
  visible: boolean;
  verdict: "SUPPORT" | "REFUTE" | "INCONCLUSIVE";
}

export interface IlluminationInput {
  id: string;
  calibrated: boolean;
  calibrationRef?: string;
  evidence: IlluminationEvidence[];
}

export interface IlluminationView extends ArtifactBase<"IlluminationView", "ILLUMINATE"> {
  visibilityState: "ILLUMINATED" | "SHADOWED" | "OCCLUDED" | "UNKNOWN";
  relationState: "REINFORCING" | "DAMPING" | "CONTRADICTORY" | "UNDETERMINED";
  outcomeState: "SUPPORTED" | "REFUTED" | "UNKNOWN";
  certainty: "BOUNDED" | "NOT_ESTABLISHED";
  visibleEvidenceRefs: string[];
}

export interface OrientationInput {
  id: string;
  illuminationRef: string;
  contextRef?: string;
  purpose?: string;
  northRef?: string;
  possibilityFieldRef: string;
  possibilityFieldStatus: "CURRENT" | "STALE" | "UNKNOWN";
  candidateDirections: string[];
  constraints: string[];
  authorityBasisPresent: boolean;
}

export interface BearingOffer extends ArtifactBase<"BearingOffer", "ORIENT"> {
  status: "BOUNDED_BEARING" | "NO_RELIABLE_BEARING";
  referenceFrame: string;
  currentPositionRef: string;
  directionalRelations: string[];
  constraintRefs: string[];
  uncertainty: string[];
  validityHorizon: "CURRENT_CONTEXT_ONLY";
  authorityEffect: "NONE";
  possibilityEffect: "NONE";
}

export interface InheritanceCandidate {
  id: string;
  type: string;
  sourceRef: string;
  standing: string;
  lineageRefs: string[];
}

export interface AdmissionBasis {
  id: string;
  valid: boolean;
  targetContextRef: string;
  permittedTypes: string[];
}

export interface SuccessorContext {
  ref: string;
  version: number;
  itemRefs: string[];
}

export interface InheritanceInput {
  id: string;
  candidate: InheritanceCandidate;
  predecessorContext: SuccessorContext;
  admissionBasis?: AdmissionBasis;
}

export interface InheritanceRecord extends ArtifactBase<"InheritanceRecord", "INHERIT"> {
  disposition: "ADMITTED";
  admissionBasisRef: string;
  predecessorContextRef: string;
  successorContextRef: string;
  inheritedItemRef: string;
  preservedStanding: string;
  authorityEffect: "NONE";
}

export type OperatorArtifact =
  | DistinctionSet
  | RelationGraph
  | TransformationRecord
  | ReturnObject
  | IlluminationView
  | BearingOffer
  | InheritanceRecord;

export interface OperatorInputMap {
  DIFFERENTIATE: DifferentiationInput;
  RELATE: RelationInput;
  TRANSFORM: TransformationInput;
  RETURN: ReturnInput;
  ILLUMINATE: IlluminationInput;
  ORIENT: OrientationInput;
  INHERIT: InheritanceInput;
}

export interface FixtureExpectation {
  path: string;
  equals: unknown;
}

export interface HostileFixture {
  schemaVersion: "rgcb.fixture.v0.1";
  id: string;
  operator: OperatorName;
  description: string;
  input: OperatorInputMap[OperatorName];
  expected: FixtureExpectation[];
  forbidden: Array<FixtureExpectation & { reason: string }>;
}

export interface FixtureReport {
  id: string;
  operator: OperatorName;
  passed: boolean;
  expectedMismatches: string[];
  forbiddenMatches: string[];
  contractViolations: string[];
  result: OperatorResult;
}
