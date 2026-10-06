import type {ConsequenceSpecimen,Permission,Attempt} from '../consequence/account.mjs';
import type {ResearchDelegation,HumanSettlementWarrant,ConsequentialLease} from './contracts.js';
export class ResearchDispatch{
 constructor(workspace:unknown,account:ConsequenceSpecimen,prepared:unknown);
 delegate(input:{human_choice_ref:string;inhabitant:string;reading_refs:string[]}):ResearchDelegation;
 warrant(delegation:ResearchDelegation,permission:Permission,human_choice_ref:string):HumanSettlementWarrant;
 lease(warrant:HumanSettlementWarrant):ConsequentialLease;
 invoke(lease:ConsequentialLease,current_delegation:ResearchDelegation):Attempt;
}
