import {ResearchDispatch} from '../../local-field/ica/dispatch.mjs';
import type {ResearchDelegation,HumanSettlementWarrant,ConsequentialLease} from '../../local-field/ica/contracts.js';
import type {Permission,Attempt,ReturnArtifact} from '../../local-field/consequence/account.mjs';
declare const owner:ResearchDispatch,delegation:ResearchDelegation,warrant:HumanSettlementWarrant,lease:ConsequentialLease,permission:Permission,attempt:Attempt,returned:ReturnArtifact;
owner.lease(warrant);owner.invoke(lease,delegation);
// @ts-expect-error Permission is not an attributable human invocation warrant
owner.lease(permission);
// @ts-expect-error Human warrant does not construct an exercisable lease
owner.invoke(warrant,delegation);
// @ts-expect-error Attempt cannot become permission to dispatch again
owner.invoke(attempt,delegation);
// @ts-expect-error Return is not permission for the next edge
owner.invoke(returned,delegation);
// @ts-expect-error a structural lease is not the nominal consequential contract
owner.invoke({kind:'ConsequentialLease',lease_id:'copied'},delegation);
