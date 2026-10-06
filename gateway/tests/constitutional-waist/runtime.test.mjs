import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { setTimeout as wait } from 'node:timers/promises';
import { waist } from './helpers.mjs';
import { signed } from '../helpers/local-field.mjs';
import { hash } from '../../security/local-field-authority.mjs';
import { createFieldServer } from '../../local-field/http.mjs';
import { DatabaseSync } from 'node:sqlite';

// These tests catch automatic promotion, missing exact/current authority checks,
// fake occurrence from execution success, passive/collapsed HOLD and API bypasses.
const file = f => join(f.root, 'artifacts', 'hello.txt');
const gate = f => assert.equal(typeof f.runtime.waistQuery, 'function', 'native waist conformance path must exist');
function substituteInvocation(f,p) {
  const db=new DatabaseSync(join(f.root,'field.sqlite'));
  try {const row=db.prepare('SELECT body FROM records WHERE kind=? AND id=?').get('invocation',p.body.passage_id);
    const value=JSON.parse(row.body);value.request.body.source_node='forged-source';
    db.prepare('UPDATE records SET body=? WHERE kind=? AND id=?').run(JSON.stringify(value),'invocation',p.body.passage_id);
  } finally {db.close();}
}

test('ADMIT has no invocation, attempt or filesystem effect; execute cannot bypass commitment', t => {
  const f=waist(t), p=f.candidate(); const d=f.runtime.admit(p);
  assert.equal(d.disposition, 'ADMIT'); gate(f);
  assert.equal(f.view(p).commitment,null); assert.equal(f.view(p).invocation,null);
  assert.equal(f.runtime.inspect(p.body.passage_id).attempt,null); assert.equal(existsSync(file(f)),false);
  assert.throws(()=>f.runtime.execute(p.body.passage_id,p),/WAIST_EXPLICIT_INVOCATION_REQUIRED/);
});
test('HOLD and DENY compress to actuator zero with reconstructable different decisions', t => {
  const f=waist(t); gate(f);
  const g=f.grant({purpose:'ccm:I_AB:outbound'}), h=f.candidate(g), held=f.runtime.admit(h);
  assert.equal(held.disposition,'HOLD');
  const denied=f.candidate(g,{target:'outside-interval.txt'}), d=f.runtime.admit(denied);
  assert.equal(d.disposition,'DENY');
  assert.equal(f.view(h).actuator,0); assert.equal(f.view(denied).actuator,0);
  assert.notEqual(held.decision_id,d.decision_id); assert.equal(f.view(h).decisions[0].disposition,'HOLD');
  assert.equal(f.view(denied).decisions[0].disposition,'DENY'); assert.equal(existsSync(file(f)),false);
});
test('HOLD PROBE retains standing; root repair requires a fresh valid ADMIT before commitment', t => {
  const f=waist(t); gate(f); const g=f.grant({purpose:'ccm:I_AB:outbound'}), p=f.candidate(g);
  const h=f.runtime.admit(p); assert.equal(h.disposition,'HOLD');
  assert.throws(()=>f.commit(p,h),/NOT_ADMITTED/);
  const s=f.runtime.hold(f.stepRecord(p,h)); assert.equal(s.action,'PROBE'); assert.equal(s.consequential,false);
  assert.equal(f.view(p).latest.disposition,'HOLD');
  f.command('standing.transition','I_AB',{interval_id:'I_AB',outbound:'ELIGIBLE',authority_basis:g.grant_id});
  assert.throws(()=>f.commit(p,h),/NOT_ADMITTED/);
  const a=f.runtime.admit(p); assert.equal(a.disposition,'ADMIT'); assert.notEqual(a.decision_id,h.decision_id);
  const c=f.commit(p,a); assert.equal(existsSync(file(f)),false);
  const e=f.runtime.invoke(f.invocation(p,c)); assert.equal(e.kind,'Execution'); assert.equal(e.status,'COMPLETED');
  assert.equal(f.view(p).occurrence,null); assert.equal(f.view(p).observation,null); assert.equal(f.view(p).return,null);
  const r=f.runtime.observe(f.observeRecord(p,e)); assert.equal(r.outcome,'OBSERVED');
  assert.equal(readFileSync(file(f),'utf8'),p.body.payload.content); assert.equal(f.runtime.verify(p.body.passage_id).valid,true);
  const q=f.view(p); assert.deepEqual(q.decisions.map(d=>d.disposition),['HOLD','ADMIT']);
  assert.ok(q.commitment&&q.invocation&&q.attempt&&q.execution&&q.occurrence&&q.observation&&q.return);
  assert.equal(q.evidence,null); assert.equal(q.settlement,'UNESTABLISHED'); assert.equal(q.home_mutation,'NOT_INVOKED');
});
test('DENY cannot be repaired into ADMIT by retry or HOLD action', t => {
  const f=waist(t); gate(f); const p=f.candidate(undefined,{target:'outside-interval.txt'}), d=f.runtime.admit(p);
  assert.equal(d.disposition,'DENY'); assert.equal(f.runtime.admit(p).decision_id,d.decision_id);
  assert.throws(()=>f.runtime.hold(f.stepRecord(p,d)),/NOT_HELD/);
  assert.throws(()=>f.commit(p,d),/NOT_ADMITTED/); assert.equal(existsSync(file(f)),false);
});
test('admitted commitment requires SourcePoint signature and exact decision binding', t => {
  const f=waist(t); gate(f); const p=f.candidate(), d=f.runtime.admit(p);
  assert.throws(()=>f.runtime.control(f.commitRecord(p,d,{},f.a,'node-a')),/ROOT_REQUIRED/);
  assert.throws(()=>f.commit(p,d,{decision_id:'wrong'}),/DECISION_BINDING/);
  assert.equal(f.view(p).commitment,null); assert.equal(existsSync(file(f)),false);
});
test('revoked commitment cannot invoke', t => {
  const f=waist(t); gate(f); const p=f.candidate(), d=f.runtime.admit(p), c=f.commit(p,d);
  f.control('invocation_revoke',{commitment_id:c.commitment_id});
  assert.throws(()=>f.runtime.invoke(f.invocation(p,c)),/COMMITMENT_REVOKED/);
  assert.equal(f.view(p).invocation,null); assert.equal(existsSync(file(f)),false);
});
test('expired commitment cannot invoke', async t => {
  const f=waist(t); gate(f); const p=f.candidate(), d=f.runtime.admit(p);
  const c=f.commit(p,d,{expires_at:new Date(Date.now()+100).toISOString()}); await wait(130);
  assert.throws(()=>f.runtime.invoke(f.invocation(p,c)),/EXPIRED_OR_INVALID_TIME/); assert.equal(existsSync(file(f)),false);
});
for(const mutation of ['payload','subject','scope','target']) test(`invocation cannot substitute ${mutation}`,t=>{
  const f=waist(t); gate(f); const p=f.candidate(), d=f.runtime.admit(p), c=f.commit(p,d);
  const b=structuredClone(p.body); b[mutation]=mutation==='payload'?{content:'substituted'}:'substituted';
  if(mutation==='payload')b.payload_hash=hash(b.payload);
  const changed=signed(b,f.a);
  assert.throws(()=>f.runtime.invoke(f.invocation(changed,c)),/INVOCATION_BINDING/);
  assert.equal(f.view(p).invocation,null); assert.equal(existsSync(file(f)),false);
});
test('dependency changed after admission prevents commitment and invocation', t => {
  const f=waist(t); gate(f); const p=f.candidate(), d=f.runtime.admit(p), c=f.commit(p,d);
  f.control('dependency',{name:'corpus',value:'v2'});
  assert.throws(()=>f.runtime.invoke(f.invocation(p,c)),/DEPENDENCY/);
  assert.equal(f.view(p).invocation,null); assert.equal(existsSync(file(f)),false);
});
test('revoked authority prevents invocation at point of use', t => {
  const f=waist(t); gate(f); const g=f.allow(),p=f.candidate(g),d=f.runtime.admit(p),c=f.commit(p,d);
  f.control('revocation',{grant_id:g.grant_id});
  assert.throws(()=>f.runtime.invoke(f.invocation(p,c)),/REVOKED/); assert.equal(existsSync(file(f)),false);
});
test('execution success is retained when actual readback fails; occurrence remains UNKNOWN', t => {
  const f=waist(t); gate(f); const p=f.candidate(),d=f.runtime.admit(p),c=f.commit(p,d),e=f.runtime.invoke(f.invocation(p,c));
  assert.equal(e.status,'COMPLETED'); assert.equal(f.view(p).occurrence,null);
  rmSync(file(f)); const r=f.runtime.observe(f.observeRecord(p,e));
  assert.equal(f.view(p).execution.status,'COMPLETED'); assert.equal(f.view(p).occurrence.status,'UNKNOWN');
  assert.equal(f.view(p).observation.status,'FAILED'); assert.equal(r.outcome,'FAILED');
  assert.equal(f.runtime.verify(p.body.passage_id).valid,true);
});
test('untrusted occurrence or observation cannot manufacture observation, Evidence or Return', t => {
  const f=waist(t); gate(f); const p=f.candidate(), d=f.runtime.admit(p), c=f.commit(p,d),e=f.runtime.invoke(f.invocation(p,c));
  assert.throws(()=>f.runtime.observe(f.observeRecord(p,e,{occurrence:{status:'OBSERVED'}})),/OBSERVATION_FIELDS/);
  assert.equal(f.view(p).observation,null); assert.equal(f.view(p).return,null);
  f.runtime.observe(f.observeRecord(p,e)); assert.equal(f.view(p).evidence,null);
  assert.throws(()=>f.runtime.control(signed({...f.stamp(),type:'evidence',issuer:'node-a',passage_id:p.body.passage_id},f.a)),/CONTROL_TYPE_INVALID/);
});
test('native root authority is unchanged by rich candidate, HOLD/probe, execution and Return', t => {
  const f=waist(t); gate(f); const g=f.grant({purpose:'ccm:I_AB:outbound'}),p=f.candidate(g);
  const before=f.runtime.status().bindings; assert.equal(before.length,1);
  const h=f.runtime.admit(p); f.runtime.hold(f.stepRecord(p,h));
  assert.deepEqual(f.runtime.status().bindings,before);
  f.command('standing.transition','I_AB',{interval_id:'I_AB',outbound:'ELIGIBLE',authority_basis:g.grant_id}); f.run(p);
  const after=f.runtime.status().bindings;
  assert.deepEqual(after.map(({uses,...standing})=>standing),before.map(({uses,...standing})=>standing));
  assert.equal(after[0].uses,1); assert.equal(f.view(p).source_authority,'I-1');
});
test('revoked source cannot invoke a valid commitment',t=>{
  const f=waist(t);gate(f);const p=f.candidate(),d=f.runtime.admit(p),c=f.commit(p,d);
  f.control('node_revocation',{node_id:'node-a'});
  assert.throws(()=>f.runtime.invoke(f.invocation(p,c)),/NODE_REVOKED/);assert.equal(existsSync(file(f)),false);
});
test('a forged SourcePoint commitment cannot mint or exercise permission',t=>{
  const f=waist(t);gate(f);const p=f.candidate(),d=f.runtime.admit(p);
  assert.throws(()=>f.runtime.control(f.commitRecord(p,d,{},f.a,'I-1')),/SIGNATURE_INVALID/);
  assert.equal(f.view(p).commitment,null);assert.equal(existsSync(file(f)),false);
});
test('observation before execution cannot promote an admitted passage',t=>{
  const f=waist(t);gate(f);const p=f.candidate();f.runtime.admit(p);
  assert.throws(()=>f.runtime.observe(f.observeRecord(p,{execution_id:'invented'})),/NOT_EXECUTED/);
  assert.equal(f.view(p).occurrence,null);assert.equal(f.view(p).return,null);
});
test('restart after execution retains the real effect and returns unsettled account without replay',t=>{
  const f=waist(t);gate(f);const p=f.candidate(),d=f.runtime.admit(p),c=f.commit(p,d);
  const e=f.runtime.invoke(f.invocation(p,c));const content=readFileSync(file(f),'utf8');f.restart();
  assert.equal(readFileSync(file(f),'utf8'),content);assert.equal(f.view(p).execution.execution_id,e.execution_id);
  assert.equal(f.view(p).occurrence,null);assert.equal(f.view(p).observation,null);
  assert.equal(f.view(p).return.outcome,'UNSETTLED_ATTEMPT');
  assert.throws(()=>f.runtime.invoke(f.invocation(p,c)),/NOT_COMMITTED/);
  assert.throws(()=>f.runtime.observe(f.observeRecord(p,e)),/NOT_EXECUTED/);
});
test('HOLD requires a recorded next step before reconsideration and bounds its local work',t=>{
  const f=waist(t);gate(f);const g=f.grant({purpose:'ccm:I_AB:outbound'}),p=f.candidate(g),h=f.runtime.admit(p);
  assert.throws(()=>f.runtime.admit(p),/HOLD_STEP_REQUIRED/);
  for(let i=0;i<32;i++)f.runtime.hold(f.stepRecord(p,h));
  assert.throws(()=>f.runtime.hold(f.stepRecord(p,h)),/HOLD_BUDGET/);assert.equal(existsSync(file(f)),false);
});
test('WITHDRAW ends a held candidate and cannot install topology or execution',t=>{
  const f=waist(t);gate(f);const g=f.grant({purpose:'ccm:I_AB:outbound'}),p=f.candidate(g),h=f.runtime.admit(p);
  f.runtime.hold(f.stepRecord(p,h,'WITHDRAW'));
  f.command('standing.transition','I_AB',{interval_id:'I_AB',outbound:'ELIGIBLE',authority_basis:g.grant_id});
  assert.throws(()=>f.runtime.admit(p),/CANDIDATE_WITHDRAWN/);assert.equal(f.view(p).actuator,0);
});
test('profile dependency cannot be changed to bypass the explicit invocation waist',t=>{
  const f=waist(t);gate(f);const p=f.candidate(),d=f.runtime.admit(p),c=f.commit(p,d);
  f.control('dependency',{name:'constitutional-waist',value:'off'});
  assert.throws(()=>f.runtime.invoke(f.invocation(p,c)),/WAIST_PROFILE_CHANGED/);
  assert.throws(()=>f.runtime.execute(p.body.passage_id,p),/WAIST_EXPLICIT_INVOCATION_REQUIRED/);
  assert.equal(existsSync(file(f)),false);
});
test('restart never regenerates committed permission or replays an unobserved effect', t => {
  const f=waist(t); gate(f); const p=f.candidate(),d=f.runtime.admit(p),c=f.commit(p,d); f.restart();
  assert.throws(()=>f.runtime.invoke(f.invocation(p,c)),/NOT_COMMITTED/);
  assert.equal(existsSync(file(f)),false); assert.equal(f.view(p).return.outcome,'RESTART_HOLD');
});
test('invocation is single-use and another node cannot invoke or observe the passage', t => {
  const f=waist(t); gate(f); const p=f.candidate(),d=f.runtime.admit(p),c=f.commit(p,d);
  assert.throws(()=>f.runtime.invoke(f.invocation(p,c,{source_node:'node-b'},f.b)),/CALLER_MISMATCH/);
  const e=f.runtime.invoke(f.invocation(p,c)); assert.throws(()=>f.runtime.invoke(f.invocation(p,c)),/NOT_COMMITTED/);
  const body=f.observeRecord(p,e).body; body.source_node='node-b';
  assert.throws(()=>f.runtime.observe(signed(body,f.b)),/CALLER_MISMATCH/);
  f.runtime.observe(f.observeRecord(p,e)); assert.equal(f.view(p).attempt.passage_id,p.body.passage_id);
});
test('waist requires uncertainty, obligations and constituted interval binding', t => {
  const f=waist(t); gate(f); const p=f.candidate(undefined,{}, {profile:f.contract.profile,interval_id:'I_AB'});
  assert.throws(()=>f.runtime.admit(p),/WAIST_CONTRACT/); assert.equal(existsSync(file(f)),false);
});
test('an invocation expiring after entry is rejected again at the descriptor guard',t=>{
  const f=waist(t);gate(f);const p=f.candidate(),d=f.runtime.admit(p),c=f.commit(p,d);
  const now=Date.now(), request=f.invocation(p,c,{expires_at:new Date(now+1000).toISOString()}), clock=Date.now;
  Date.now=()=>f.view(p).phase==='INVOKED'?now+2000:now;
  try {assert.throws(()=>f.runtime.invoke(request),/EXPIRED_OR_INVALID_TIME/);}
  finally {Date.now=clock;}
  assert.equal(f.view(p).invocation.request.body.record_id,request.body.record_id);
  assert.equal(f.view(p).attempt,null);assert.equal(f.view(p).phase,'HELD');assert.equal(existsSync(file(f)),false);
});
test('waist formation is carried by the existing canonical signed candidate reference',t=>{
  const f=waist(t);gate(f);const p=f.candidate(),d=f.runtime.admit(p);
  assert.equal(d.disposition,'ADMIT');assert.equal(Object.hasOwn(p.body,'waist'),false);
  const q=f.view(p);assert.equal(q.formation.body.candidate_id,p.body.origin.candidate_id);
  assert.equal(q.formation.body.content.uncertainty,f.contract.uncertainty);
  assert.equal(d.formation_hash,hash(q.formation.body));
});
test('receipt construction rejects substituted invocation history before observation or sealing',t=>{
  const f=waist(t);gate(f);const p=f.candidate(),d=f.runtime.admit(p),c=f.commit(p,d),e=f.runtime.invoke(f.invocation(p,c));
  substituteInvocation(f,p);
  assert.throws(()=>f.runtime.observe(f.observeRecord(p,e)),/CUSTODY|TRACE_BINDING|SIGNATURE/);
  assert.equal(f.runtime.inspect(p.body.passage_id).observation,null);
  assert.equal(f.runtime.inspect(p.body.passage_id).receipt,null);assert.equal(f.runtime.inspect(p.body.passage_id).return,null);
});
test('CCM restart rejects a captured native Return whose derived invocation index was substituted',t=>{
  const f=waist(t);gate(f);const p=f.candidate();f.run(p);f.returned(p);substituteInvocation(f,p);
  assert.throws(()=>f.restart(),/CCM_NATIVE_RETURN_INVALID/);
});
test('historical admission retry reports current revoked eligibility without promoting stale standing',t=>{
  const f=waist(t);gate(f);const g=f.allow(),p=f.candidate(g),d=f.runtime.admit(p);f.control('revocation',{grant_id:g.grant_id});
  const old=f.runtime.admit(p);assert.equal(old.decision_id,d.decision_id);
  assert.equal(old.decision_time_basis,'HISTORICAL_RECORDED_DECISION');assert.equal(old.current_eligibility.status,'DENY');
  assert.throws(()=>f.commit(p,old),/REVOKED/);assert.equal(existsSync(file(f)),false);
});
test('native policy DENY and unmet quorum HOLD cannot be converted to invocation',t=>{
  for(const [policy,expected]of[['AUTO_DENY','DENY'],['REQUIRE_QUORUM','HOLD']]){
    const f=waist(t,{action_classes:[{class_id:'artifact',pattern:'create_document',governance_decision:policy,risk_tier:'LOW'}]});gate(f);
    const p=f.candidate(),d=f.runtime.admit(p);assert.equal(d.disposition,expected);
    if(expected==='HOLD'){f.runtime.hold(f.stepRecord(p,d,'REQUEST_SOURCEPOINT'));assert.equal(f.runtime.admit(p).disposition,'HOLD');}
    assert.throws(()=>f.commit(p,d),/NOT_ADMITTED/);assert.equal(existsSync(file(f)),false);
  }
});
test('HTTP convenience endpoint cannot combine ADMIT and actuation; explicit sequence remains usable', async t=>{
  const f=waist(t);gate(f);const p=f.candidate(),server=createFieldServer(f.runtime);
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));t.after(()=>new Promise(resolve=>server.close(resolve)));
  const post=async(path,body)=>{const r=await fetch(`http://127.0.0.1:${server.address().port}${path}`,{method:'POST',body:JSON.stringify(body)});return {status:r.status,value:await r.json()};};
  assert.equal((await post('/passages',p)).status,409); assert.equal(existsSync(file(f)),false);
  const d=f.view(p).latest, c=(await post('/control',f.commitRecord(p,d))).value;
  const e=await post('/invoke',f.invocation(p,c));assert.equal(e.status,200);
  assert.equal(f.view(p).return,null);const r=await post('/observe',f.observeRecord(p,e.value));assert.equal(r.status,200);
  assert.equal(r.value.outcome,'OBSERVED');
});
