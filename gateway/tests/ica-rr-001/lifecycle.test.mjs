import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
let api;
try { api=await import('../../local-field/ica/journey.mjs'); } catch(e) { if(e.code!=='ERR_MODULE_NOT_FOUND')throw e; }
function setup(t,fixture='normal') {
 assert.equal(typeof api?.createICAReference,'function','ICA bounded journey must exist');
 const dir=mkdtempSync(join(tmpdir(),'ica-test-'));
 const f=api.createICAReference({root:join(dir,'field'),fixture});
 t.after(()=>{f.close();rmSync(dir,{recursive:true,force:true});});return f;
}
export function act(f,action){return f.journey.dispatch({action,request_id:randomUUID(),expected_revision:f.journey.view().revision});}
export function prepare(f){act(f,'refresh');act(f,'what');act(f,'why');return act(f,'delegate');}
test('computed Calendar/Git change changes visibility without authority or effects',t=>{
 const f=setup(t),before=f.runtime.status(),v0=f.journey.view();
 assert.equal(v0.reading.atmospheric_regime,'CLEAR_HORIZON');
 const v=act(f,'refresh');assert.equal(v.reading.atmospheric_regime,'PRESSURE_DIFFERENTIAL');
 assert.notEqual(v.reading.reading_id,v0.reading.reading_id);assert.equal(v.change.metrics.length,6);
 assert.deepEqual(f.runtime.status(),before);assert.equal(existsSync(join(f.root,'artifacts','research-return.json')),false);
 assert.ok(v.instrument.sections.some(s=>s.title==='What We Can’t See Yet'));
});
test('delegation admits named next transition without constructing an attempt',t=>{
 const f=setup(t),v=prepare(f);
 assert.equal(v.phase,'AUTHORIZED');assert.equal(v.consequence.typed_account.permission.next_transition,'ISSUE_INVOCATION_COMMITMENT');
 assert.equal(v.consequence.typed_account.attempt,null);assert.equal(v.delegation.scope.max_effects,1);
 assert.equal(v.delegation.scope.target,'research-return.json');assert.equal(existsSync(join(f.root,'artifacts','research-return.json')),false);
});
test('bounded Research writes one real note; attempt alone leaves occurrence unknown',t=>{
 const f=setup(t);prepare(f);const v=act(f,'start');
 assert.ok(v.consequence.typed_account.attempt);assert.equal(v.consequence.typed_account.occurrence_knowledge,'UNKNOWN');
 assert.equal(v.consequence.typed_account.observation,null);assert.equal(v.consequence.typed_account.settlement,null);
 const note=JSON.parse(readFileSync(join(f.root,'artifacts','research-return.json'),'utf8'));
 assert.equal(note.reading_id,v.delegation.reading_ref);assert.equal(note.sources.join(','),'CALENDAR,GIT');
 assert.ok(note.unresolved_remainder.length);assert.ok(Buffer.byteLength(JSON.stringify(note))<=4096);
 assert.throws(()=>act(f,'start'),/COMMAND_NOT_AVAILABLE/);
});
test('readback and Return are attributable; reentry preserves the same journey',t=>{
 const f=setup(t);prepare(f);act(f,'start');const v=act(f,'return');
 assert.equal(v.consequence.typed_account.returned.return_completeness,'COMPLETE');
 assert.equal(v.consequence.typed_account.occurrence_knowledge,'KNOWN_OCCURRED');assert.equal(v.consequence.typed_account.outcome_assessment.status,'ACHIEVED_OBJECTIVE');
 assert.equal(v.consequence.typed_account.settlement,null);assert.equal(f.journey.view().journey_id,v.journey_id);
 assert.deepEqual(f.journey.view().register,v.register);assert.equal(v.answers.length,8);
 for(const claim of v.consequence.claims)assert.ok(v.consequence.basis_manifest.find(b=>b.id===claim.basis_ref));
 for(const e of v.register)assert.ok(e.artifact_ref&&e.machine_artifact&&e.human_action);
 const before=f.runtime.status();const retained=act(f,'keep');assert.equal(retained.orientation.choice,'RETAIN_FOR_ORIENTATION');assert.deepEqual(f.runtime.status(),before);
});
test('stale commands and repeated acceptance cannot manufacture a second authorization',t=>{
 const f=setup(t);act(f,'refresh');const request={action:'delegate',request_id:randomUUID(),expected_revision:f.journey.view().revision};
 f.journey.dispatch(request);const before=f.runtime.status();assert.throws(()=>f.journey.dispatch(request),/REPLAYED_COMMAND/);
 assert.throws(()=>f.journey.dispatch({...request,request_id:randomUUID()}),/STALE_JOURNEY/);assert.deepEqual(f.runtime.status(),before);
 assert.throws(()=>f.journey.dispatch({action:'delegate',request_id:randomUUID(),expected_revision:f.journey.view().revision,consent:'predicted'}),/COMMAND_FIELDS/);
});
test('inactivity and inspection supply no consent or delegation',t=>{
 const f=setup(t),before=f.runtime.status();for(let i=0;i<10;i++)f.journey.view();act(f,'what');act(f,'why');
 assert.deepEqual(f.runtime.status(),before);assert.equal(f.journey.view().delegation,null);
});
test('revocation before attempt disables future use after real acknowledgement',t=>{
 const f=setup(t);prepare(f);let v=act(f,'revoke');assert.equal(v.consequence.typed_account.revocation.acknowledged,false);
 v=act(f,'acknowledge');assert.equal(v.consequence.typed_account.revocation.future_exercise_disabled,true);
 assert.throws(()=>act(f,'start'),/COMMAND_NOT_AVAILABLE/);assert.equal(existsSync(join(f.root,'artifacts','research-return.json')),false);
 assert.ok(f.runtime.status().bindings.some(b=>b.revoked===true||b.status==='revoked'));
});
test('revocation after observed Return cannot promise reversal',t=>{
 const f=setup(t);prepare(f);act(f,'start');act(f,'return');const bytes=readFileSync(join(f.root,'artifacts','research-return.json'));
 act(f,'revoke');const v=act(f,'acknowledge');assert.deepEqual(readFileSync(join(f.root,'artifacts','research-return.json')),bytes);
 assert.ok(v.consequence.claims.find(c=>c.code==='IRREVERSIBLE_EFFECT'));assert.ok(v.consequence.claims.find(c=>c.code==='REVOKED_FOR_FUTURE_USE'));
 assert.equal(v.consequence.controls.length,0);assert.equal(v.allowed_commands.includes('start'),false);
});
for(const [fixture,expected]of[['hold','HOLD'],['deny','DENY']])test(`${expected} is a real native disposition and creates no attempt`,t=>{
 const f=setup(t,fixture),v=prepare(f);assert.equal(v.phase,expected);assert.equal(v.disposition.disposition,expected);
 const native=f.runtime.waistQuery(v.disposition.passage_id);assert.equal(native.latest.disposition,expected);assert.equal(native.attempt,null);
 assert.equal(v.consequence,null);assert.equal(existsSync(join(f.root,'artifacts','research-return.json')),false);
});
test('partition fixture has receipt but no admitted occurrence; complete Return stays unresolved',t=>{
 const f=setup(t,'unknown');prepare(f);act(f,'start');const v=act(f,'return'),s=v.consequence.typed_account;
 assert.ok(s.occurrence_claim);assert.equal(s.observation,null);assert.equal(s.occurrence_knowledge,'UNKNOWN');assert.equal(s.outcome_assessment.status,'UNRESOLVED');
 assert.equal(s.returned.return_completeness,'COMPLETE');assert.ok(s.returned.outstanding_obligations.length);assert.ok(v.register.find(e=>e.transition==='OBSERVATION_UNAVAILABLE'));
});
test('partial Return names missing reporting obligations without hiding established readback',t=>{
 const f=setup(t,'partial');prepare(f);act(f,'start');const v=act(f,'return'),s=v.consequence.typed_account;
 assert.equal(s.returned.return_completeness,'PARTIAL');assert.equal(s.occurrence_knowledge,'KNOWN_OCCURRED');assert.equal(s.returned.reporting_accounts.length,2);
 assert.equal(v.phase,'PARTIAL_RETURN');assert.match(v.answers[6].answer,/report/i);
});
