import {BEHOLD,ORIENT,controlNavigation,projectNavigation} from '../../local-field/ica/navigation.mjs';
import type {NavigationContext,Movement,NavigationOutcome} from '../../local-field/ica/navigation.mjs';
import type {Permission} from '../../local-field/consequence/account.mjs';
import type {HumanSettlementWarrant} from '../../local-field/ica/contracts.js';
declare const m:Movement,c:NavigationContext;
const feeling=BEHOLD({source_id:'f',source_type:'Feeling',standing:'SELF_REPORTED',content:'I feel uncertain.',basis_refs:['human:self']});
const sourceType:'Feeling'=feeling.source_type;
const standing:'SELF_REPORTED'=feeling.standing;
// @ts-expect-error foregrounding cannot promote a feeling into an observation
const promoted:'Observation'=feeling.source_type;
const o=ORIENT(m,c),result=controlNavigation(m,c,[]),projection=projectNavigation(result);
// @ts-expect-error orientation has no selected direction
o.selected_direction;
// @ts-expect-error navigation output is not passage permission
const permission:Permission=result;
// @ts-expect-error human navigation is not a human settlement warrant
const warrant:HumanSettlementWarrant=result;
// @ts-expect-error renderer accepts only owner-issued typed outcomes
projectNavigation({state:'YIELD'});
function exhaustive(r:NavigationOutcome){switch(r.state){case 'FLOW':return r.contributions;case 'HOLD':return r.dependencies;case 'RETURN_CHOICE':return r.choice;case 'YIELD':return r.reason;default:{const missing:never=r;return missing;}}}
void sourceType;void standing;void promoted;void permission;void warrant;void projection;void exhaustive;
