export type Disposition = 'ADMIT' | 'HOLD' | 'DENY';
export type QueryStatus = 'KNOWN' | 'UNKNOWN' | 'ABSENT' | Disposition;
export type Direction = 'OUTBOUND' | 'INBOUND' | 'CROSS_INTERVAL';
export interface Participant { participant_id: string; participant_kind: 'human'|'node'|'model'|'service'|'office'|'institution'; root_lineage: string; status: 'active' }
export interface Scope { actions: string[]; targets: string[]; inbound_uses: string[]; cross_interval_uses: string[] }
export interface ConstitutedInterval { interval_id: string; endpoint_a: string; endpoint_b: string; relation_type: string; scope: Scope; boundaries: {cross_interval:'EXPLICIT_ONLY'}; dependencies: Record<string,string> }
export interface Standing { outbound: 'OBSERVE_ONLY'|'ELIGIBLE'; inbound: 'UNASSESSED'|'SUPPORTED_FOR_DECLARED_USE'|'HOLD'|'DENY' }
export interface Signed<T> {body:T;signature:string}
export interface ReturnArtifact { return_id:string; passage_id:string; occurrence_ref:string|null; witness_refs:string[]; observation_refs:string[]; evidence_refs:string[]; residue:string[]; lineage_hash:string; returned_at:string }
export interface StandingTransition { interval_id:string; outbound:Standing['outbound']; authority_basis:string|null }
export interface CrossIntervalPassage { passage_id:string; source_interval:string; target_interval:string; payload_ref:string; source_ref:string; relation_type:string; uncertainty:string; dependencies:Record<string,string>; return_contract:{required:true;to:string}; source_predecessor:string; target_predecessor:string }
export type Operation = 'participants.register'|'intervals.constitute'|'standing.transition'|'passage.open'|'return.capture'|'orientation.judge'|'dependencies.refresh'|'cross.open'|'interval.supersede';
export interface Command<T extends object|object[]> {field_id:string;record_id:string;issued_at:string;expires_at:string;type:'ccm_command';profile:'ccm-001.f0.1';issuer:string;operation:Operation;subject_ref:string;predecessor_hash:string;dependencies:Record<string,string>;dependency_hash:string;data:T}
export type EventType = 'ParticipantRegistered'|'IntervalConstituted'|'StandingAdmitted'|'PassageOpened'|'ReturnOpened'|'JudgmentRecorded'|'DependencyChanged'|'CrossIntervalPassageOpened'|'IntervalSuperseded'|'CommandRecorded';
export interface Event {profile:'ccm-001.f0.1';event_id:string;event_type:EventType;subject_ref:string;warrant_ref:string;item_index:number|null;data:object|object[];previous_hash:string;dependency_hash:string;created_at:string;event_hash:string}
// Native grants and native signed Passage/Receipt/Return remain their existing types.
