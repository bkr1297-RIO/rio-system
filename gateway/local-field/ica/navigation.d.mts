export interface Movement{readonly movement_id:string;readonly purpose:string;}
export interface SourceArtifact<T extends string=string,S extends string=string>{readonly source_id:string;readonly source_type:T;readonly standing:S;readonly content:string;readonly basis_refs:readonly string[];}
export interface SourceView<T extends string=string,S extends string=string>{readonly kind:'SourceView';readonly source_ref:string;readonly source_type:T;readonly standing:S;readonly source:SourceArtifact<T,S>;}
export interface ContributionBurden{readonly material_new_information:boolean;readonly material_new_distinction:boolean;readonly unresolved_relevant_contradiction:boolean;readonly changed_dependency:boolean;readonly newly_relevant_risk:boolean;readonly human_choice_pending:boolean;readonly requested_continuation:boolean;}
export interface Contribution{readonly contribution_id:string;readonly movement_id:string;readonly source_ref:string;readonly burden:ContributionBurden;readonly basis_refs:readonly string[];}
export interface Relation{readonly relation_id:string;readonly from_ref:string;readonly to_ref:string;readonly basis_refs:readonly string[];}
export interface Dependency{readonly dependency_id:string;readonly relevant:boolean;readonly necessary:boolean;readonly status:'SATISFIED'|'UNRESOLVED';readonly description:string;readonly clearance_condition:string;readonly basis_refs:readonly string[];}
export interface NavigationContext{
 readonly context_id:string;readonly envelope:{readonly valid:boolean;readonly basis_ref:string};
 readonly sources:readonly SourceArtifact[];readonly relevant_source_refs:readonly string[];readonly relations:readonly Relation[];
 readonly constraints:readonly string[];readonly open_questions:readonly string[];readonly possibilities:readonly string[];readonly prior_returns:readonly string[];
 readonly dependencies:readonly Dependency[];readonly choice:{readonly requires_human_valuation:boolean;readonly authored_choice_ref:string|null;readonly question:string|null;readonly basis_refs:readonly string[]};readonly delivered_contribution_refs:readonly string[];
}
export interface Orientation{readonly relevant:readonly SourceView[];readonly relations:readonly Relation[];readonly constraints:readonly SourceView[];readonly open_questions:readonly SourceView[];readonly possibilities:readonly SourceView[];readonly prior_returns:readonly SourceView[];}
declare const outcomeBrand:unique symbol;
interface OutcomeBase{readonly [outcomeBrand]:true;readonly kind:'HumanNavigationOutcome';readonly profile:'human-navigation.f0.1';readonly outcome_id:string;readonly movement_ref:string;readonly context_ref:string;readonly authorization_supplied:false;readonly standing_change:false;readonly direction_selected:false;readonly human_sufficiency_judged:false;}
export interface Flow extends OutcomeBase{readonly state:'FLOW';readonly orientation:Orientation;readonly contributions:readonly {readonly contribution_ref:string;readonly burden:ContributionBurden;readonly basis_refs:readonly string[];readonly view:SourceView}[];}
export interface NavigationHold extends OutcomeBase{readonly state:'HOLD';readonly reason:'CURRENT_ENVELOPE_UNAVAILABLE'|'MATERIAL_DEPENDENCY_UNRESOLVED';readonly dependencies:readonly Dependency[];}
export interface ReturnChoice extends OutcomeBase{readonly state:'RETURN_CHOICE';readonly reason:'IRREDUCIBLE_HUMAN_VALUATION';readonly choice:{readonly author:'HUMAN';readonly question:string;readonly basis_refs:readonly string[]};}
export interface Yield extends OutcomeBase{readonly state:'YIELD';readonly reason:'NO_MATERIAL_COUNTERPART_CONTRIBUTION';}
export type NavigationOutcome=Flow|NavigationHold|ReturnChoice|Yield;
export interface NavigationProjection{readonly kind:'NavigationProjection';readonly outcome_ref:string;readonly state:NavigationOutcome['state'];readonly lines:readonly string[];}
export function BEHOLD<const T extends string,const S extends string>(source:SourceArtifact<T,S>):SourceView<T,S>;
export function ORIENT(movement:Movement,context:NavigationContext):Orientation;
export function ENOUGH_C(context:NavigationContext,movement:Movement,candidates:readonly Contribution[]):boolean;
export function RETURN_CHOICE(movement:Movement,context:NavigationContext):ReturnChoice;
export function YIELD(movement:Movement,context:NavigationContext,candidates:readonly Contribution[]):Yield;
export function controlNavigation(movement:Movement,context:NavigationContext,candidates:readonly Contribution[]):NavigationOutcome;
export function projectNavigation(outcome:NavigationOutcome):NavigationProjection;
export function renderNavigation(outcome:NavigationOutcome):string;
