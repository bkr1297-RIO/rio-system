import test from 'node:test';
import assert from 'node:assert/strict';
import { compileResearchExpression, verifyResearchCompilation, evaluateReportingSettlement } from '../../local-field/ica/f1-profile.mjs';
import { computeArgsHash } from '../../security/token-manager.mjs';
const request={source_node:'node-a',subject:'node-a',target_node:'node-b',action:'create_document',target:'research-return.json',payload:{content:'bounded note'},scope:'artifact-create',purpose:'ccm:I_AB:outbound',dependencies:{corpus:'v1'},conditions:{},return_requirement:{required:true,to:'I-1'}};
request.payload_hash=computeArgsHash(request.payload);
const input={expression:'Write the bounded Research return note.',rule:'Nothing leaves this Lab without my explicit approval.',request,sourcepoint:'I-1',field_id:'test-field',proposal_id:'test-proposal',policy_id:'ica-reference-bounded',policy_hash:'a'.repeat(64),issued_at:'2026-10-06T12:00:00.000Z',expires_at:'2026-10-06T12:10:00.000Z'};
test('Research uses the native compiler and conserves all four lowering stages without authority',()=>{
 const c=compileResearchExpression(input); assert.equal(c.frames.length,4); assert.equal(c.oa_ir.authority_effect,'NONE');assert.deepEqual(c.oa_ir.request,request); assert.equal(verifyResearchCompilation(input,c),true);
 const changed=structuredClone(c); changed.oa_ir.request.target='production.json';assert.throws(()=>verifyResearchCompilation(input,changed),/ILLEGAL_LOWERING/);
 assert.throws(()=>compileResearchExpression({...input,request:{...request,target:'production.json'}}),/RESEARCH_TARGET/);
});
const account={profile:'one.ica.reporting-account.f0.1',return_id:'r',research_return_id:'rr',return_completeness:'COMPLETE',required_reports:['ATTEMPT_ACCOUNT','OBSERVATION_ACCOUNT','OUTCOME_ACCOUNT','LIMITS_ACCOUNT'],reports:['ATTEMPT_ACCOUNT','OBSERVATION_ACCOUNT','OUTCOME_ACCOUNT','LIMITS_ACCOUNT'],occurrence_knowledge:'UNKNOWN',outcome_assessment:'UNRESOLVED',residue_refs:['uncertainty-1'],account_digest:'b'.repeat(64),external_side_effects:true,hash_valid:true,lifecycle_ref:'p',sourcepoint_ref:'I-1'};
const decision={review_status:'accepted',sourcepoint_ref:'I-1',account_digest:account.account_digest};
const settlement={human_discernment_status:'ratified',scope:'REPORTING_ACCOUNT_ONLY'};
test('explicitly reviewed complete reporting can settle while occurrence and objective remain unknown',()=>{
 const result=evaluateReportingSettlement(account,{lifecycle_id:'p',sourcepoint_id:'I-1'},decision,settlement);assert.equal(result.status,'SETTLED_RETURN');assert.equal(result.reason_code,'reporting_account_accepted');assert.equal(account.occurrence_knowledge,'UNKNOWN');assert.equal(account.outcome_assessment,'UNRESOLVED');assert.deepEqual(account.residue_refs,['uncertainty-1']);
});
test('partial reporting, silence, wrong scope and wrong digest cannot settle',()=>{
 for(const [a,d,s] of [[{...account,reports:['ATTEMPT_ACCOUNT']},decision,settlement],[account,{},settlement],[account,decision,{...settlement,scope:'OUTCOME'}],[account,{...decision,account_digest:'c'.repeat(64)},settlement]])assert.notEqual(evaluateReportingSettlement(a,{lifecycle_id:'p',sourcepoint_id:'I-1'},d,s).status,'SETTLED_RETURN');
});
