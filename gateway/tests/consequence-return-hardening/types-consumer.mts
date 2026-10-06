// Compile-only consumer of the actual runtime import path.
import {ConsequenceSpecimen} from '../../local-field/consequence/account.mjs';
import type {Permission,InvocationLease,Attempt,OccurrenceClaim,Observation,Evidence,OutcomeAssessment,ReturnArtifact,Settlement} from '../../local-field/consequence/account.mjs';
declare const permission:Permission,lease:InvocationLease,attempt:Attempt,claim:OccurrenceClaim,observation:Observation,evidence:Evidence,assessment:OutcomeAssessment,returned:ReturnArtifact;
const account=new ConsequenceSpecimen({}, {objective_id:'goal',minimum_bytes:1});
account.invoke(lease,{});account.admitEvidence(observation);account.assessOutcome(evidence);account.composeReturn(lease);
// @ts-expect-error structural objects cannot substitute issued leases
account.invoke({kind:'InvocationLease'},{});
// @ts-expect-error Permission does not construct Attempt
const falseAttempt:Attempt=permission;
// @ts-expect-error Attempt does not construct Observation
account.admitEvidence(attempt);
// @ts-expect-error receipt/claim does not construct Evidence
const falseEvidence:Evidence=claim;
// @ts-expect-error Evidence does not construct OutcomeAssessment
const falseOutcome:OutcomeAssessment=evidence;
// @ts-expect-error Return does not construct Settlement
const falseSettlement:Settlement=returned;
// @ts-expect-error returned artifact is not an invocation lease
account.invoke(returned,{});
void assessment;
