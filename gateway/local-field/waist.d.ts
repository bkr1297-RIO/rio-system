/** Describes native records; these data interfaces are not authority constructors.
 * Admission, commitment and invocation are enforced by LocalField at runtime. */
export type Disposition = 'ADMIT' | 'HOLD' | 'DENY';
export type HoldAction = 'PROBE' | 'RECALIBRATE' | 'REQUEST_SOURCEPOINT' | 'REPAIR_LINEAGE' | 'WAIT' | 'REPLAN' | 'WITHDRAW';
export interface Signed<T> { readonly body: T; readonly signature: string }
export interface Stamp { readonly field_id: string; readonly record_id: string; readonly issued_at: string; readonly expires_at: string }
export interface WaistContract { readonly profile: 'constitutional-waist.f0.1'; readonly interval_id: string;
  readonly uncertainty: string; readonly obligations: readonly string[] }
export interface NativeFormation extends Stamp { readonly type:'candidate'; readonly source_node:string;
  readonly candidate_id:string; readonly kind:'proposal'; readonly content:WaistContract }
export interface Passage extends Stamp { readonly type: 'passage'; readonly passage_id: string; readonly intent_id: string;
  readonly source_node: string; readonly subject: string; readonly target_node: string; readonly action: 'create_document';
  readonly target: string; readonly payload: {readonly content: string}; readonly payload_hash: string;
  readonly authority_basis: string; readonly scope: string; readonly purpose: string;
  readonly dependencies: Readonly<Record<string,string>>; readonly conditions: Readonly<Record<string,unknown>>;
  readonly nonce: string; readonly correlation_id: string; readonly origin: Readonly<Record<string,unknown>>;
  readonly return_requirement: {readonly required: true; readonly to: string} }
export interface DispositionRecord { readonly kind: 'Disposition'; readonly decision_id: string; readonly passage_id: string;
  readonly passage_hash: string; readonly disposition: Disposition; readonly previous_decision_id: string|null;
  readonly native_decision_id: string|null; readonly reason: string|null; readonly source_authority: string;
  readonly formation_ref: string; readonly formation_hash: string }
export interface CommitmentRequest extends Stamp { readonly type: 'invocation_commit'; readonly issuer: string;
  readonly passage_id: string; readonly passage_hash: string; readonly decision_id: string }
export interface InvocationCommitment { readonly kind: 'InvocationCommitment'; readonly commitment_id: string;
  readonly passage_id: string; readonly passage_hash: string; readonly decision_id: string;
  readonly warrant: Signed<CommitmentRequest>; readonly authority_basis: string; readonly issued_at: string; readonly expires_at: string }
export interface InvocationRequest extends Stamp { readonly type: 'invocation'; readonly source_node: string;
  readonly passage_id: string; readonly passage_hash: string; readonly commitment_id: string; readonly passage: Signed<Passage> }
export interface InvocationRecord { readonly kind: 'Invocation'; readonly invocation_id: string;
  readonly passage_id: string; readonly commitment_id: string; readonly request: Signed<InvocationRequest> }
export interface NativeAttempt { readonly attempt_id: string; readonly passage_id: string; readonly action: string;
  readonly target: string; readonly payload_hash: string; readonly executor_node: string; readonly attempted_at: string }
export interface ExecutionRecord { readonly kind: 'Execution'; readonly execution_id: string; readonly passage_id: string;
  readonly attempt_id: string; readonly status: 'COMPLETED'|'FAILED'; readonly result: Readonly<Record<string,unknown>> }
export interface ObservationRequest extends Stamp { readonly type: 'observation_request'; readonly source_node: string;
  readonly passage_id: string; readonly execution_id: string }
export interface Readback { readonly occurrence_id: string; readonly status: 'OBSERVED'|'MISMATCH'|'UNKNOWN';
  readonly target: string; readonly observed_at: string; readonly content_hash?: string; readonly reason?: string }
export interface ObservationRecord { readonly kind: 'Observation'; readonly observation_id: string; readonly passage_id: string;
  readonly execution_id: string; readonly status: 'RECORDED'|'FAILED'; readonly measurement: Readback;
  readonly request: Signed<ObservationRequest> }
/** Keeps the existing native occurrence name: an account based on identified readback,
 * not a claim that physical WORLD truth is supplied by a type or receipt. */
export interface NativeOccurrenceAccount extends Readback { readonly observation_ref: string }
export interface HoldRequest extends Stamp { readonly type: 'hold_action'; readonly source_node: string;
  readonly passage_id: string; readonly decision_id: string; readonly action: HoldAction }
export interface HoldStep { readonly kind: 'HoldStep'; readonly step_id: string; readonly passage_id: string;
  readonly decision_id: string; readonly action: HoldAction; readonly consequential: false; readonly request: Signed<HoldRequest> }
export interface WaistTrace { readonly formation:Signed<NativeFormation>|null; readonly decisions: readonly DispositionRecord[]; readonly hold_steps: readonly HoldStep[];
  readonly commitment: InvocationCommitment|null; readonly invocation: InvocationRecord|null; readonly attempt: NativeAttempt|null;
  readonly execution: ExecutionRecord|null; readonly observation: ObservationRecord|null; readonly occurrence: NativeOccurrenceAccount|null;
  readonly actuator: 0|1; readonly evidence: null; readonly settlement: 'UNESTABLISHED'; readonly home_mutation: 'NOT_INVOKED' }
