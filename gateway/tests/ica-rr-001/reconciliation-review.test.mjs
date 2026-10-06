import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync,existsSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {randomUUID} from 'node:crypto';
import {investigate} from '../../local-field/ica/research.mjs';
import {referenceSignals} from '../../local-field/ica/source-replay.mjs';
import {evaluate} from '../../local-field/meteorology/evaluator.mjs';
import {ICAJourney,createICAReference} from '../../local-field/ica/journey.mjs';
import {ReferenceWorkspace} from '../../local-field/ica/workspace.mjs';
import {renderICA} from '../../local-field/ica/surface.mjs';
const delegate=readings=>({office:'Research',subject:'node-a',delegation_id:'explicit-test-manifest',reading_refs:readings.map(r=>r.reading_id)});
test('duplicate observation does not establish prior recurrence',()=>{
 const f=referenceSignals(),r=evaluate(f.changed,{timestamp:f.changed_timestamp}),result=investigate([r,r],delegate([r]));
 assert.equal(result.knowledge,'UNKNOWN');assert.equal(result.outcome,'UNRESOLVED');assert.equal(result.findings.find(x=>x.question==='PRIOR_RECURRENCE').status,'UNKNOWN');
 assert.equal(result.observation_coverage.frames,1);
});
test('different observations at the same timestamp do not establish earlier recurrence',()=>{
 const f=referenceSignals(),a=evaluate(f.changed,{timestamp:f.changed_timestamp}),b=evaluate(f.initial,{timestamp:f.changed_timestamp});
 assert.equal(investigate([a,b],delegate([a,b])).findings.find(x=>x.question==='PRIOR_RECURRENCE').status,'UNKNOWN');
});
for(const [domain,known,missing]of [['CALENDAR','CALENDAR_CHANGE','GIT_CHANGE'],['GIT','GIT_CHANGE','CALENDAR_CHANGE']]){
 test(`valid ${domain}-only history reports its supported finding and missing counterpart`,()=>{
  const f=referenceSignals(),r=[evaluate(f.initial.filter(s=>s.source_domain===domain),{timestamp:f.initial_timestamp}),evaluate(f.changed.filter(s=>s.source_domain===domain),{timestamp:f.changed_timestamp})];
  const result=investigate(r,delegate(r));assert.equal(result.findings.find(x=>x.question===known).status,'ESTABLISHED');assert.equal(result.findings.find(x=>x.question===missing).status,'UNKNOWN');
  assert.equal(result.knowledge,'UNKNOWN');assert.equal(result.findings.length,3);
 });
}
test('ordinary native dependency rejection becomes a scoped blocked account and honest Return',t=>{
 const d=mkdtempSync(join(tmpdir(),'ica-review-')),w=new ReferenceWorkspace({root:join(d,'field')}),journey=new ICAJourney(w,referenceSignals());t.after(()=>{w.close();rmSync(d,{recursive:true,force:true});});
 const act=action=>journey.dispatch({action,request_id:randomUUID(),expected_revision:journey.view().revision});
 act('refresh');const permitted=act('delegate');w.challenge(w.prepare('{}'),'MISSING_SOURCE');
 const blocked=act('start');assert.equal(blocked.phase,'HOLD');assert.equal(blocked.research_gate.reason,'MATERIAL_DEPENDENCY_UNRESOLVED');
 assert.equal(blocked.research_gate.native_condition.status,'HOLD');assert.equal(blocked.research_gate.native_condition.reason,'CCM_DEPENDENCY_CHANGED');
 assert.equal(blocked.allowed_commands.includes('start'),false);assert.equal(blocked.allowed_commands.includes('return'),true);
 assert.match(renderICA(blocked,'test'),/Restore the authorized history source/);
 assert.equal(w.runtime.waistQuery(permitted.disposition.passage_id).attempt,null);assert.equal(existsSync(join(w.root,'artifacts','research-return.json')),false);
 const before=w.runtime.status();act('what');act('why');assert.deepEqual(w.runtime.status(),before);
 const returned=act('return');assert.equal(returned.research_return.work_condition,'HELD_DEPENDENCY');assert.equal(returned.research_return.return_completeness,'COMPLETE');
 assert.equal(returned.research_return.occurrence_knowledge,'UNKNOWN');
});
test('replacement banner acknowledges the fresh current delegation after it exists',t=>{
 const d=mkdtempSync(join(tmpdir(),'ica-review-banner-')),f=createICAReference({root:join(d,'field'),fixture:'occupant-replacement'});t.after(()=>{f.close();rmSync(d,{recursive:true,force:true});});
 const act=action=>f.journey.dispatch({action,request_id:randomUUID(),expected_revision:f.journey.view().revision});act('refresh');act('delegate');act('replace');
 assert.match(renderICA(f.journey.view(),'test'),/needs a fresh delegation/);act('delegate');
 const banner=renderICA(f.journey.view(),'test').split('<section aria-label="Research scope">')[0];assert.match(banner,/received a fresh delegation/);assert.doesNotMatch(banner,/needs a fresh delegation/);
});
test('a denied consequence does not claim that source access was denied',t=>{
 const d=mkdtempSync(join(tmpdir(),'ica-review-deny-')),f=createICAReference({root:join(d,'field'),fixture:'research-deny'});t.after(()=>{f.close();rmSync(d,{recursive:true,force:true});});
 const act=action=>f.journey.dispatch({action,request_id:randomUUID(),expected_revision:f.journey.view().revision});act('refresh');act('delegate');act('start');const v=act('return');
 assert.equal(v.research_return.work_condition,'DENIED_CONSEQUENCE');
});
test('partial Calendar history remains truthful through the whole human Return',t=>{
 const d=mkdtempSync(join(tmpdir(),'ica-review-partial-')),w=new ReferenceWorkspace({root:join(d,'field')}),base=referenceSignals();
 const replay={...base,initial:base.initial.filter(s=>s.source_domain==='CALENDAR'),changed:base.changed.filter(s=>s.source_domain==='CALENDAR')};
 const j=new ICAJourney(w,replay);t.after(()=>{w.close();rmSync(d,{recursive:true,force:true});});
 const act=action=>j.dispatch({action,request_id:randomUUID(),expected_revision:j.view().revision});const changed=act('refresh');
 assert.doesNotMatch(changed.answers[1].answer,/development activity and review waits rose/);act('delegate');act('start');const v=act('return');
 assert.equal(v.research_return.established_findings.length,1);assert.doesNotMatch(v.answers[5].answer,/Two timing changes/);assert.match(renderICA(v,'test'),/Git frames.*missing/);
});
test('newly available source keeps its previous value unknown rather than crashing inspection',t=>{
 const d=mkdtempSync(join(tmpdir(),'ica-review-new-source-')),w=new ReferenceWorkspace({root:join(d,'field')}),base=referenceSignals();
 const j=new ICAJourney(w,{...base,initial:base.initial.filter(s=>s.source_domain==='CALENDAR')});t.after(()=>{w.close();rmSync(d,{recursive:true,force:true});});
 const v=j.dispatch({action:'refresh',request_id:randomUUID(),expected_revision:0});assert.equal(v.change.metrics.find(x=>x.metric==='review_latency').before,null);
});
