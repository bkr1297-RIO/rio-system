/** Nominal owner-issued artifacts. Serialized JSON is inspectable data, never a capability. */
declare const issued: unique symbol;
interface Issued<K extends string> { readonly kind:K; readonly passage_id:string; readonly [issued]:K }
export type OccurrenceKnowledge='UNKNOWN'|'KNOWN_OCCURRED';
export type ExecutionCondition='COMPLETED'|'FAILED'|'INTERRUPTED'|'EXPIRED'|'UNKNOWN';
export type CoverageCondition='COMPLETED'|'FAILED'|'PARTIAL'|'UNOBSERVABLE';
export interface ObjectiveContract { readonly objective_id:string; readonly minimum_bytes:number }
export interface Permission extends Issued<'Permission'> { readonly permission_id:string; readonly disposition:Readonly<Record<string,unknown>>;
 readonly basis:string; readonly passage_hash:string; readonly next_transition:'ISSUE_INVOCATION_COMMITMENT'; readonly issued_at:string }
export interface RevocationSemantics { readonly validation_points:readonly string[]; readonly lease_expiry:string;
 readonly propagation_bound:{readonly scope:string;readonly guarantee:'NONE';readonly measured_ms:null};readonly unreachable_behavior:string;
 readonly already_committed_behavior:string;readonly acknowledgement_requirement:string }
export interface InvocationLease extends Issued<'InvocationLease'> { readonly lease_id:string; readonly permission_id:string;
 readonly commitment:Readonly<Record<string,unknown>>;readonly next_transition:'ATTEMPT_EXECUTION';readonly revocation_semantics:RevocationSemantics }
export interface Attempt extends Issued<'Attempt'> { readonly attempt_id:string;readonly invocation_lease_id:string;readonly executor:string;readonly subject:string;
 readonly requested_effect:Readonly<Record<string,unknown>>;readonly started_at:string;readonly completed_at:string|null;
 readonly execution_id:string|null;readonly executor_report:Readonly<Record<string,unknown>>|null }
export interface OccurrenceClaim extends Issued<'OccurrenceClaim'> { readonly claim_id:string;readonly attempt_id:string;readonly execution_ref:string;readonly report:Readonly<Record<string,unknown>>;readonly knowledge_supplied:false }
export interface Observation extends Issued<'Observation'> {readonly observation_id:string;readonly attempt_id:string;readonly native:Readonly<Record<string,unknown>>;
 readonly coverage:{readonly status:CoverageCondition;readonly scope:string;readonly observed_at:string} }
export interface Evidence extends Issued<'Evidence'> { readonly evidence_id:string;readonly observation_ref:string;readonly attempt_ref:string;
 readonly admission_policy:'exact-descriptor-readback.f0.1';readonly scope:string;readonly constitutional_standing:'NOT_SUPPLIED';readonly measurement:Readonly<Record<string,unknown>> }
export interface OutcomeAssessment extends Issued<'OutcomeAssessment'> {readonly assessment_id:string;readonly evidence_ref:string;readonly objective_contract:ObjectiveContract;
 readonly status:'ACHIEVED_OBJECTIVE'|'FAILED_OBJECTIVE';readonly assessed_at:string }
export type UnresolvedOutcome={readonly kind:'OutcomeAssessment';readonly status:'UNRESOLVED';readonly assessment_id:null};
export type ReportCoordinate='ATTEMPT_ACCOUNT'|'OBSERVATION_ACCOUNT'|'OUTCOME_ACCOUNT'|'LIMITS_ACCOUNT';
export interface ReturnArtifact extends Issued<'ReturnArtifact'> {readonly return_id:string;readonly execution_attempt:{readonly status:'KNOWN'|'NOT_ATTEMPTED';readonly attempt_ref:string|null;readonly condition:ExecutionCondition};
 readonly executor_receipt:{readonly status:'PRESENT'|'ABSENT';readonly claim_ref:string|null;readonly scope:string};readonly occurrence_knowledge:OccurrenceKnowledge;
 readonly observation_coverage:Readonly<Record<string,unknown>>;readonly outcome_assessment:OutcomeAssessment|UnresolvedOutcome;
 readonly return_completeness:'COMPLETE'|'PARTIAL';readonly required_reports:readonly ReportCoordinate[];readonly reporting_accounts:readonly {readonly coordinate:ReportCoordinate;readonly account:unknown}[];
 readonly unresolved_remainder:readonly string[];readonly outstanding_obligations:readonly string[];readonly follow_up_required:boolean;readonly provenance:Readonly<Record<string,unknown>> }
/** No constructor or promotion operation is supplied by F0.1. */
export interface Settlement extends Issued<'Settlement'> {readonly settlement_id:string;readonly admitted_settlement_basis:string}
export interface Revocation extends Issued<'Revocation'> {readonly revocation_id:string;readonly grant_id:string;readonly requested:true;readonly propagated:true;
 readonly acknowledged:boolean;readonly future_exercise_disabled:boolean;readonly original_effect_reversed:false;readonly semantics:RevocationSemantics|null}
export interface ConsequenceSnapshot {readonly kind:'ConsequenceSnapshot';readonly snapshot_id:string;readonly timestamp:string;readonly passage_id:string;
 readonly permission:Permission;readonly lease:InvocationLease|null;readonly attempt:Attempt|null;readonly occurrence_claim:OccurrenceClaim|null;
 readonly lease_condition:'CURRENT'|'EXPIRED'|'UNKNOWN';readonly execution_condition:ExecutionCondition;readonly native_recovery:Readonly<Record<string,unknown>>|null;readonly executor_receipt:Readonly<Record<string,unknown>>|null;readonly observation:Observation|null;readonly evidence:Evidence|null;
 readonly occurrence_knowledge:OccurrenceKnowledge;readonly observation_coverage:Readonly<Record<string,unknown>>;readonly outcome_assessment:OutcomeAssessment|UnresolvedOutcome;
 readonly returned:ReturnArtifact|null;readonly settlement:null;readonly revocation:Revocation|null;readonly unresolved_remainder:readonly string[];
 readonly control_limits:{readonly compensation_available:false;readonly committed_effect:boolean;readonly irreversible_scope:string};readonly assay:Readonly<Record<string,unknown>>;readonly attempting:boolean }
export class ConsequenceSpecimen {constructor(runtime:unknown,objective:ObjectiveContract);
 admit(passage:unknown):Permission;commit(permission:Permission,request:unknown):InvocationLease;invoke(lease:InvocationLease,request:unknown):Attempt;
 captureAttempt(lease:InvocationLease):Attempt;observe(attempt:Attempt,request:unknown):Observation;admitEvidence(observation:Observation):Evidence;assessOutcome(evidence:Evidence):OutcomeAssessment;
 composeReturn(basis:Permission|InvocationLease|Attempt,options?:{reports?:readonly ReportCoordinate[];outstanding_obligations?:readonly string[]}):ReturnArtifact;
 revoke(permission:Permission,request:unknown):Revocation;acknowledge(revocation:Revocation):Revocation;
 snapshot(record:Permission|InvocationLease|Attempt|Observation|Evidence|OutcomeAssessment|ReturnArtifact|Revocation):ConsequenceSnapshot}
export const REPORTS:readonly ReportCoordinate[];
export function validateSnapshot(value:unknown):ConsequenceSnapshot;
