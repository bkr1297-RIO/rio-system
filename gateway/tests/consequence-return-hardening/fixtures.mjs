/** Bounded synthetic scenarios; native signed controls and actual filesystem effects.
 * The partition adapter is a declared fixture stub, not a production network sensor. */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { waist } from '../constitutional-waist/helpers.mjs';
import { signed } from '../helpers/local-field.mjs';
import { ConsequenceSpecimen } from '../../local-field/consequence/account.mjs';
import { projectConsequence,reconstructClaim } from '../../local-field/consequence/projection.mjs';

export function runHostileFixture(t,name){
 const f=waist(t),g=f.allow(),p=f.candidate(g),s=new ConsequenceSpecimen(f.runtime,{objective_id:'Declared minimum readback bytes',minimum_bytes:name==='failed-objective'?4096:1});
 const permission=s.admit(p),permissionState=s.snapshot(permission),lease=s.commit(permission,f.commitRecord(p,permission.disposition));
 const attempt=s.invoke(lease,f.invocation(p,lease.commitment)),afterAttempt=s.snapshot(attempt),initialBytes=readFileSync(join(f.root,'artifacts','hello.txt'));
 let transport=null,rejected=null,revocation=null,ack=null,observation=null,evidence=null,outcome=null;
 if(['unknown-occurrence','complete-unknown'].includes(name)){
  // Simulated transport partition is separate from execution: only the later read request fails.
  const transportStub={observe(){throw Object.assign(new Error('NETWORK_PARTITION'),{code:'NETWORK_PARTITION'});}};
  try{transportStub.observe(f.observeRecord(p,{execution_id:attempt.execution_id}));}catch(error){transport={kind:'FixtureTransportFault',code:error.code,scope:'Independent observation request withheld by simulated partition',physical_network_partition_proven:false};}
  assert.equal(f.runtime.waistQuery(p.body.passage_id).observation,null);
 }else{
  observation=s.observe(attempt,f.observeRecord(p,{execution_id:attempt.execution_id}));evidence=s.admitEvidence(observation);outcome=s.assessOutcome(evidence);
 }
 if(name==='irreversible-revocation'){
  // Prepare a separately attributable second lawful commitment under the same grant.
  f.command('standing.transition','I_AB',{interval_id:'I_AB',outbound:'ELIGIBLE',authority_basis:g.grant_id});
  const p2=f.candidate(g),d2=f.runtime.admit(p2),c2=f.commit(p2,d2);
  revocation=s.revoke(permission,signed({...f.stamp(),type:'revocation',issuer:'I-1',grant_id:g.grant_id},f.human));
  try{f.runtime.invoke(f.invocation(p2,c2));}catch(error){rejected={reason:error.message,passage_id:p2.body.passage_id,attempt:f.runtime.inspect(p2.body.passage_id).attempt};}
  assert.match(rejected?.reason??'',/REVOKED/);assert.equal(rejected.attempt,null);
  ack=s.acknowledge(revocation);assert.deepEqual(readFileSync(join(f.root,'artifacts','hello.txt')),initialBytes);
 }
 const returned=s.composeReturn(attempt,{reports:name==='unknown-occurrence'?['ATTEMPT_ACCOUNT','LIMITS_ACCOUNT']:undefined,
  outstanding_obligations:transport?['Obtain independent observation when the source is reachable']:['Inspect downstream consequences outside this specimen']});
 const snapshot=s.snapshot(returned),projection=projectConsequence(snapshot);
 const claimReconstructions=projection.claims.map(c=>({code:c.code,basis_ref:c.basis_ref,contract:reconstructClaim(projection,c.code).contract,artifact_kind:reconstructClaim(projection,c.code).artifact.kind}));
 return {name,contract:{irreversibility:'No compensation through this control; not physically irreversible filesystem',partition:'Declared transport fixture stub',independent_observer:'Separate descriptor read by the same enrolled receiver; not a second institution'},
  permissionState,afterAttempt,transport,rejected,revocation,ack,observation,evidence,outcome,returned,snapshot,projection,claimReconstructions,
  assertions:{admission_created_attempt:permissionState.attempt!==null,attempt_created_occurrence:afterAttempt.occurrence_knowledge!=='UNKNOWN',
    original_effect_retained:readFileSync(join(f.root,'artifacts','hello.txt')).equals(initialBytes),settlement_created:snapshot.settlement!==null,
    native_second_attempt:rejected?.attempt??null,receipt_supplies_truth:afterAttempt.occurrence_knowledge!=='UNKNOWN'},
  native:{phase:f.runtime.inspect(p.body.passage_id).phase,bindings:f.runtime.status().bindings,trace:f.runtime.waistQuery(p.body.passage_id)}};
}
export const HOSTILE_FIXTURES=Object.freeze(['irreversible-revocation','unknown-occurrence','complete-unknown','failed-objective']);
