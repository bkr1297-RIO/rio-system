/** Specimen data contracts. Runtime capability custody is additionally owner-issued and opaque. */
export type ResearchCondition='ESTABLISHED'|'PARTIAL'|'UNKNOWN'|'UNOBSERVABLE'|'DENIED_SOURCE'|'DENIED_CONSEQUENCE'|'HELD_DEPENDENCY'|'REVOKED'|'EXPIRED';
export type RemainderKind='RESOURCE_REMAINDER'|'OBLIGATION_REMAINDER'|'UNCERTAINTY_REMAINDER'|'FORECLOSED_OPTION_RECORD';
export type Attention='HELD'|'WATCHING'|'UNRESOLVED'|'OWED'|'CHANGED';
declare const warrantBrand:unique symbol;
declare const leaseBrand:unique symbol;
declare const delegationBrand:unique symbol;
export interface ResearchDelegation{readonly [delegationBrand]:true;readonly kind:'ResearchDelegation';readonly delegation_id:string;readonly sourcepoint:string;readonly office:'Research';readonly inhabitant:string;readonly subject:string;readonly issued_at:string;readonly expires_at:string;readonly reading_refs:readonly string[];readonly delegation_depth:0;readonly return_contract:string;}
export interface HumanSettlementWarrant{readonly [warrantBrand]:true;readonly kind:'HumanSettlementWarrant';readonly warrant_id:string;readonly delegation_id:string;readonly human_choice_ref:string;readonly next_transition:'ISSUE_INVOCATION_COMMITMENT';}
export interface ConsequentialLease{readonly [leaseBrand]:true;readonly kind:'ConsequentialLease';readonly lease_id:string;readonly issuer:string;readonly holder:string;readonly office:'Research';readonly subject:string;readonly delegation_id:string;readonly permitted_action:'create_document';readonly target:'research-return.json';readonly consequence_class:'BOUNDED_LOCAL_NOTE';readonly issued_at:string;readonly expires_at:string;readonly subdelegation_rule:'PROHIBITED';readonly return_contract:string;readonly provenance:Readonly<Record<string,string>>;}
export interface ResearchReturn{readonly kind:'ResearchReturnArtifact';readonly return_id:string;readonly delegation_id:string;readonly office:'Research';readonly inhabitant:string;readonly occurrence_knowledge:'KNOWN_OCCURRED'|'UNKNOWN';readonly outcome_assessment:string;readonly return_completeness:'COMPLETE'|'PARTIAL';readonly residue:readonly string[];}
