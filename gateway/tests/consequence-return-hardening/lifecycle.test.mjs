import test from 'node:test';
import fs from 'node:fs';
import { syncBuiltinESMExports } from 'node:module';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { signed } from '../helpers/local-field.mjs';
import { waist } from '../constitutional-waist/helpers.mjs';
import { projectConsequence } from '../../local-field/consequence/projection.mjs';
import { ConsequenceSpecimen, REPORTS } from '../../local-field/consequence/account.mjs';

// Removing native calls/current-state checks or promoting receipts to evidence must fail these tests.
export function scenario(t, minimum_bytes = 1) {
  const f=waist(t), g=f.allow(), p=f.candidate(g);
  const s=new ConsequenceSpecimen(f.runtime,{objective_id:'readback-byte-objective',minimum_bytes});
  const permission=s.admit(p), lease=s.commit(permission,f.commitRecord(p,permission.disposition));
  return {f,g,p,s,permission,lease,run:()=>s.invoke(lease,f.invocation(p,lease.commitment))};
}
const path=f=>join(f.root,'artifacts','hello.txt');

test('ADMIT declares only commitment transition and creates no attempt or effect',t=>{
  const f=waist(t), p=f.candidate(),s=new ConsequenceSpecimen(f.runtime,{objective_id:'goal',minimum_bytes:1});
  const permission=s.admit(p);
  assert.equal(permission.next_transition,'ISSUE_INVOCATION_COMMITMENT');
  assert.equal(s.snapshot(permission).attempt,null);
  assert.equal(f.runtime.inspect(p.body.passage_id).attempt,null);
  assert.throws(()=>s.invoke(permission,{}),/InvocationLease/);
});

test('attempt and receipt cannot construct occurrence or outcome or settlement',t=>{
  const {f,s,lease,run}=scenario(t),a=run(),v=s.snapshot(a);
  assert.equal(a.kind,'Attempt'); assert.equal(a.invocation_lease_id,lease.lease_id);
  assert.equal(v.executor_receipt.status,'COMPLETED'); assert.equal(v.occurrence_knowledge,'UNKNOWN');
  assert.equal(v.outcome_assessment.status,'UNRESOLVED'); assert.equal(v.settlement,null);
  assert.equal(f.runtime.waistQuery(a.passage_id).occurrence,null);
  assert.throws(()=>s.admitEvidence(a),/Observation/);
  assert.throws(()=>s.assessOutcome(a),/Evidence/);
});

test('foreign and structural copies cannot cross lifecycle boundaries',t=>{
  const a=scenario(t), b=scenario(t); const attempt=a.run();
  assert.throws(()=>a.s.invoke({...a.lease},{}),/InvocationLease/);
  assert.throws(()=>b.s.composeReturn(attempt),/Attempt/);
  assert.throws(()=>a.s.admitEvidence({kind:'Observation',status:'OBSERVED'}),/Observation/);
  assert.throws(()=>a.s.commit(a.permission,{body:{}}));
  assert.equal(a.f.runtime.status().attempts.length,1);
});

test('partition before observation keeps a present executor receipt and UNKNOWN occurrence',t=>{
  const {s,run}=scenario(t),a=run();
  // Partition fixture withholds the independent observation operation; receipt survives.
  const r=s.composeReturn(a,{reports:REPORTS,outstanding_obligations:['Obtain independent observation when reachable']});
  assert.equal(r.execution_attempt.status,'KNOWN'); assert.equal(r.executor_receipt.status,'PRESENT');
  assert.equal(r.occurrence_knowledge,'UNKNOWN'); assert.equal(r.outcome_assessment.status,'UNRESOLVED');
  assert.equal(r.observation_coverage.status,'UNOBSERVABLE');
});

test('complete reporting can coexist with UNKNOWN outcome and outstanding consequences',t=>{
  const {s,run}=scenario(t),a=run(),r=s.composeReturn(a,{reports:REPORTS,outstanding_obligations:['Observe later']});
  assert.equal(r.return_completeness,'COMPLETE'); assert.equal(r.occurrence_knowledge,'UNKNOWN');
  assert.equal(r.outcome_assessment.status,'UNRESOLVED'); assert.ok(r.outstanding_obligations.length);
  assert.ok(r.unresolved_remainder.length); assert.equal(s.snapshot(r).settlement,null);
  const partial=s.composeReturn(a,{reports:['ATTEMPT_ACCOUNT']});assert.equal(partial.return_completeness,'PARTIAL');
});

test('independent occurrence basis is explicitly admitted; objective assessment is another operation',t=>{
  const {f,p,s,run}=scenario(t,4096),a=run();
  const o=s.observe(a,f.observeRecord(p,{execution_id:a.execution_id}));
  assert.equal(s.snapshot(a).occurrence_knowledge,'UNKNOWN');
  const e=s.admitEvidence(o); assert.equal(e.kind,'Evidence');
  assert.equal(s.snapshot(a).occurrence_knowledge,'KNOWN_OCCURRED');
  assert.equal(s.snapshot(a).outcome_assessment.status,'UNRESOLVED');
  const outcome=s.assessOutcome(e); assert.equal(outcome.status,'FAILED_OBJECTIVE');
  assert.equal(readFileSync(path(f),'utf8'),p.body.payload.content);
});

test('mismatched readback cannot establish occurrence exactly as commanded',t=>{
  const {f,p,s,run}=scenario(t),a=run();writeFileSync(path(f),'different');
  const o=s.observe(a,f.observeRecord(p,{execution_id:a.execution_id}));
  assert.throws(()=>s.admitEvidence(o),/INSUFFICIENT_OBSERVATION/);
  assert.equal(s.snapshot(a).occurrence_knowledge,'UNKNOWN');
});

test('explicit objective assessment can establish success without settling Return',t=>{
  const {f,p,s,run}=scenario(t),a=run(),o=s.observe(a,f.observeRecord(p,{execution_id:a.execution_id}));
  const e=s.admitEvidence(o),outcome=s.assessOutcome(e),r=s.composeReturn(a);
  assert.equal(outcome.status,'ACHIEVED_OBJECTIVE');assert.equal(r.return_completeness,'COMPLETE');
  assert.equal(s.snapshot(r).settlement,null);assert.equal(f.runtime.waistQuery(p.body.passage_id).settlement,'UNESTABLISHED');
});

test('revocation disables future native exercise while existing effect remains and ack is separate',t=>{
  const {f,g,p,s,permission,lease,run}=scenario(t),a=run(),before=readFileSync(path(f));
  f.command('standing.transition','I_AB',{interval_id:'I_AB',outbound:'ELIGIBLE',authority_basis:g.grant_id});
  const other=f.candidate(g),d=f.runtime.admit(other),c=f.commit(other,d);
  const request={...f.stamp(),type:'revocation',issuer:'I-1',grant_id:g.grant_id};
  const rev=s.revoke(permission,signed(request,f.human));
  assert.equal(rev.requested,true);assert.equal(rev.propagated,true);assert.equal(rev.acknowledged,false);
  assert.equal(rev.future_exercise_disabled,false);
  assert.throws(()=>f.runtime.invoke(f.invocation(other,c)),/REVOKED/);
  const ack=s.acknowledge(rev);assert.equal(ack.future_exercise_disabled,true);assert.equal(ack.acknowledged,true);
  assert.deepEqual(readFileSync(path(f)),before);assert.equal(s.snapshot(a).control_limits.compensation_available,false);
  assert.equal(lease.revocation_semantics.propagation_bound.guarantee,'NONE');
  assert.equal(s.snapshot(a).occurrence_knowledge,'UNKNOWN');
});

for (const name of ['inactivity','repeated acceptance','predicted choice']) test(`${name} supplies no authorization or delegation`,t=>{
  const {f,s,permission}=scenario(t);const before=f.runtime.status();
  for(let i=0;i<8;i++)s.snapshot(permission);
  const after=f.runtime.status();assert.deepEqual(after.bindings,before.bindings);assert.equal(after.attempts.length,0);
  assert.throws(()=>s.commit(permission,{body:{type:'predicted-human-choice'}}));
  assert.equal(f.runtime.status().attempts.length,0);
});

test('input validation rejects malformed objectives and reporting coordinates',t=>{
  const {f,s,run}=scenario(t);assert.throws(()=>new ConsequenceSpecimen(f.runtime,{objective_id:'x',minimum_bytes:-1}));
  const a=run();assert.throws(()=>s.composeReturn(a,{reports:['UNKNOWN_REPORT']}));
  assert.throws(()=>s.composeReturn(a,{reports:['ATTEMPT_ACCOUNT','ATTEMPT_ACCOUNT']}));
  assert.throws(()=>s.composeReturn(a,{outstanding_obligations:['']}));
});

test('commit rejects other signed control types before any native side effect',t=>{
 const {f,p,s,permission}=scenario(t),before=f.runtime.status().dependencies;
 const wrong=signed({...f.stamp(),type:'dependency',issuer:'I-1',name:'corpus',value:'v2',passage_id:p.body.passage_id,decision_id:permission.disposition.decision_id},f.human);
 assert.throws(()=>s.commit(permission,wrong),/COMMITMENT_REQUEST_REQUIRED/);
 assert.deepEqual(f.runtime.status().dependencies,before);
});

test('expired lease is reported in its own coordinate and creates no attempt',async t=>{
 const f=waist(t),p=f.candidate(),s=new ConsequenceSpecimen(f.runtime,{objective_id:'goal',minimum_bytes:1}),permission=s.admit(p);
 const l=s.commit(permission,f.commitRecord(p,permission.disposition,{expires_at:new Date(Date.now()+150).toISOString()}));
 await new Promise(r=>setTimeout(r,180));assert.equal(s.snapshot(l).lease_condition,'EXPIRED');assert.ok(projectConsequence(s.snapshot(l)).claims.some(c=>c.code==='LEASE_EXPIRED'));
 assert.throws(()=>s.invoke(l,f.invocation(p,l.commitment)),/EXPIRED/);assert.equal(s.snapshot(l).attempt,null);
});

test('native durable attempt can be shown ATTEMPTING before the descriptor effect',t=>{
 const {f,s,lease,run}=scenario(t);let during=null;
 const prior=fs.openSync;
 fs.openSync=(name,...args)=>{if(typeof name==='string'&&name.startsWith('/proc/self/fd/')&&(args[0]&fs.constants.O_CREAT)){
   const captured=s.captureAttempt(lease);during=s.snapshot(captured);
  }return prior(name,...args);};syncBuiltinESMExports();
 try{run();}finally{fs.openSync=prior;syncBuiltinESMExports();}
 assert.equal(during.attempting,true);assert.ok(projectConsequence(during).claims.some(c=>c.code==='ATTEMPTING'));assert.equal(during.occurrence_knowledge,'UNKNOWN');assert.equal(during.executor_receipt,null);
 assert.equal(s.snapshot(lease).attempting,false);assert.equal(f.runtime.status().attempts.length,1);
});

test('native recovery preserves INTERRUPTED separately from UNKNOWN occurrence and complete reporting',t=>{
 const f=waist(t),p=f.candidate(),s=new ConsequenceSpecimen(()=>f.runtime,{objective_id:'goal',minimum_bytes:1});
 const permission=s.admit(p),lease=s.commit(permission,f.commitRecord(p,permission.disposition));let captured;
 const prior=fs.openSync;
 fs.openSync=(name,...args)=>{if(typeof name==='string'&&name.startsWith('/proc/self/fd/')&&(args[0]&fs.constants.O_CREAT)){
   captured=s.captureAttempt(lease);f.restart();throw new Error('SIMULATED_EXECUTOR_INTERRUPTION');
  }return prior(name,...args);};syncBuiltinESMExports();
 try{assert.throws(()=>s.invoke(lease,f.invocation(p,lease.commitment)));}finally{fs.openSync=prior;syncBuiltinESMExports();}
 const v=s.snapshot(captured),r=s.composeReturn(captured);assert.equal(v.execution_condition,'INTERRUPTED');assert.ok(projectConsequence(v).claims.some(c=>c.code==='EXECUTION_INTERRUPTED'));assert.equal(v.attempting,false);
 assert.equal(v.occurrence_knowledge,'UNKNOWN');assert.equal(r.execution_attempt.condition,'INTERRUPTED');assert.equal(r.return_completeness,'COMPLETE');
 assert.equal(f.runtime.status().attempts.length,1);
});

test('Interrupt can be established without Detect or ConfidenceCalibration',t=>{
 const {f,g,s,permission,run}=scenario(t),a=run();
 const rev=s.revoke(permission,signed({...f.stamp(),type:'revocation',issuer:'I-1',grant_id:g.grant_id},f.human));s.acknowledge(rev);
 const v=s.snapshot(a);assert.equal(v.assay.Detect.established,false);assert.equal(v.assay.Interrupt.established,true);
 assert.equal(v.assay.Reconstruct.established,true);assert.equal(v.assay.ConfidenceCalibration.established,false);
 assert.equal(v.occurrence_knowledge,'UNKNOWN');
});

test('structural runtime impostor cannot mint lifecycle artifacts',()=>{
 const fake={waistQuery(){},status(){return {field:{field_id:'fake'}};}};
 assert.throws(()=>new ConsequenceSpecimen(fake,{objective_id:'goal',minimum_bytes:1}),/NATIVE_WAIST_REQUIRED/);
});
