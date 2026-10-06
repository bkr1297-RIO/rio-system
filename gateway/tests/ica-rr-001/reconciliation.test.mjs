import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync,existsSync,readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {randomUUID} from 'node:crypto';
import {createICAReference} from '../../local-field/ica/journey.mjs';
function setup(t,fixture='normal'){const dir=mkdtempSync(join(tmpdir(),'ica-full-'));const f=createICAReference({root:join(dir,'field'),fixture});t.after(()=>{f.close();rmSync(dir,{recursive:true,force:true});});return f;}
const act=(f,action)=>f.journey.dispatch({action,request_id:randomUUID(),expected_revision:f.journey.view().revision});
function delegate(f){act(f,'refresh');return act(f,'delegate');}
test('normal Research now investigates scoped history with findings separate from note occurrence',t=>{
 const f=setup(t);delegate(f);let v=act(f,'start');assert.ok(v.research);assert.equal(v.research.findings.length,3);
 assert.equal(v.consequence.typed_account.occurrence_knowledge,'UNKNOWN');v=act(f,'return');
 assert.equal(v.research_return.return_completeness,'COMPLETE');assert.equal(v.research_return.knowledge,'UNKNOWN');
 assert.equal(v.research_return.occurrence_knowledge,'KNOWN_OCCURRED');assert.equal(v.research_return.outcome_assessment,'UNRESOLVED');
 const n=JSON.parse(readFileSync(join(f.root,'artifacts','research-return.json'),'utf8'));assert.equal(n.findings.length,3);
 assert.ok(v.register.some(e=>e.machine_artifact.kind==='HumanSettlementWarrant'));assert.ok(v.register.some(e=>e.machine_artifact.kind==='ConsequentialLease'));
});
test('A UNKNOWN completes reporting without fabricating missing history',t=>{
 const f=setup(t,'research-unknown');delegate(f);act(f,'start');const v=act(f,'return');
 assert.equal(v.research_return.knowledge,'UNKNOWN');assert.equal(v.research_return.return_completeness,'COMPLETE');assert.equal(v.research_return.outcome_assessment,'UNRESOLVED');
 assert.ok(v.perimeter.items.some(x=>x.remainder_kind==='UNCERTAINTY_REMAINDER'));assert.equal(v.research.findings.filter(x=>x.status==='ESTABLISHED').length,0);
});
test('B source lost after delegation produces native relevant HOLD without blocking inspection',t=>{
 const f=setup(t,'research-hold');const admitted=delegate(f);assert.equal(admitted.phase,'AUTHORIZED');const v=act(f,'start');
 assert.equal(v.research_gate.disposition,'HOLD');assert.equal(v.research_gate.reason,'MATERIAL_DEPENDENCY_UNRESOLVED');
 const trace=f.runtime.waistQuery(v.research_gate.native_disposition.passage_id);assert.equal(trace.latest.disposition,'HOLD');assert.equal(trace.attempt,null);
 assert.ok(v.research_gate.clearance_condition);assert.equal(existsSync(join(f.root,'artifacts','research-return.json')),false);
 const before=f.runtime.status();act(f,'what');act(f,'why');assert.deepEqual(f.runtime.status(),before);
});
test('C prohibited consequence receives native DENY with no actuator or lease release',t=>{
 const f=setup(t,'research-deny');const initial=f.journey.view().office;delegate(f);const v=act(f,'start');
 assert.equal(v.research_gate.reason,'AUTHORITY_CEILING_VIOLATION');assert.equal(v.research_gate.disposition,'DENY');
 assert.equal(f.runtime.waistQuery(v.research_gate.native_disposition.passage_id).latest.disposition,'DENY');assert.equal(v.consequence.typed_account.attempt,null);
 assert.equal(v.register.some(e=>e.machine_artifact.kind==='ConsequentialLease'),false);assert.deepEqual(v.office,initial);
});
test('D active withdrawal returns interruption without erasing prior attributable findings',t=>{
 const f=setup(t,'research-revoke');delegate(f);act(f,'start');const findings=f.journey.view().research.findings;
 act(f,'revoke');act(f,'acknowledge');const v=act(f,'return');assert.equal(v.research_return.work_condition,'REVOKED');
 assert.deepEqual(v.research.findings,findings);assert.equal(v.consequence.typed_account.revocation.future_exercise_disabled,true);
 assert.ok(v.research_return.interruption_point);assert.ok(existsSync(join(f.root,'artifacts','research-return.json')));
 assert.equal(v.allowed_commands.includes('start'),false);
});
test('E two established findings and one unknown remain distinguishable in a complete Return',t=>{
 const f=setup(t,'research-partial');delegate(f);act(f,'start');const v=act(f,'return');
 assert.equal(v.research_return.established_findings.length,2);assert.equal(v.research_return.uncertainty.length,1);assert.equal(v.research_return.return_completeness,'COMPLETE');
 assert.equal(v.research_return.work_condition,'PARTIAL');assert.ok(v.research_return.residue.length);
});
test('F clearing evidence records divergence and retains prior interpretation without new authority',t=>{
 const f=setup(t,'model-contradiction');act(f,'refresh');const prior=f.journey.view().reading,before=f.runtime.status();const v=act(f,'compare');
 assert.equal(prior.atmospheric_regime,'PRESSURE_DIFFERENTIAL');assert.equal(v.reading.atmospheric_regime,'WARM_FRONT');
 assert.ok(v.register.some(e=>e.machine_artifact.reading_id===prior.reading_id));assert.ok(v.divergence);
 assert.equal(v.divergence.prior_reading_ref,prior.reading_id);assert.equal(v.divergence.prior_history_rewritten,false);assert.deepEqual(f.runtime.status(),before);
});
test('G occupant replacement preserves charter but revokes old rights and needs fresh delegation',t=>{
 const f=setup(t,'occupant-replacement');const old=delegate(f),beforeOffice=old.office;let v=act(f,'replace');
 assert.deepEqual(v.office,beforeOffice);assert.notEqual(v.research_inhabitant.inhabitant_id,old.research_inhabitant.inhabitant_id);
 assert.equal(v.delegation,null);assert.equal(v.allowed_commands.includes('start'),false);assert.ok(f.runtime.status().bindings.find(g=>g.grant_id===old.delegation.grant_ref).revoked);
 v=act(f,'delegate');assert.notEqual(v.delegation.delegation_id,old.delegation.delegation_id);assert.equal(v.delegation.inhabitant,v.research_inhabitant.inhabitant_id);
 act(f,'start');v=act(f,'return');assert.equal(v.research_return.inhabitant,v.research_inhabitant.inhabitant_id);assert.ok(v.register.some(e=>e.transition==='REPLACE_INHABITANT'));
});
test('attention movement and retention preserve all residue, lineage and native standing',t=>{
 const f=setup(t);delegate(f);act(f,'start');act(f,'return');const v=f.journey.view(),items=v.perimeter.items,before=f.runtime.status();
 assert.ok(items.length>=3);act(f,'perimeter');act(f,'keep');const after=f.journey.view();
 assert.deepEqual(after.perimeter.items.map(x=>({id:x.remainder_id,kind:x.remainder_kind,basis:x.basis_ref})),items.map(x=>({id:x.remainder_id,kind:x.remainder_kind,basis:x.basis_ref})));
 assert.deepEqual(f.runtime.status(),before);assert.equal(after.perimeter.authority_effect,'NONE');assert.ok(after.perimeter.events.length);
});
test('LUMEN condition is qualified visibility, never authorization or success',t=>{
 const f=setup(t),before=f.runtime.status();let v=act(f,'refresh');assert.equal(v.lumen.authorization_supplied,false);assert.equal(v.lumen.state,'SHADOWED');
 assert.ok(v.lumen.basis_ref);act(f,'what');assert.deepEqual(f.runtime.status(),before);assert.equal(v.office.authority_supplied,false);
});
test('withdraw before attempt still has an honest complete interruption Return',t=>{
 const f=setup(t);delegate(f);act(f,'revoke');act(f,'acknowledge');const v=act(f,'return');
 assert.equal(v.research_return.work_condition,'REVOKED');assert.equal(v.research_return.return_completeness,'COMPLETE');assert.equal(v.research_return.occurrence_knowledge,'UNKNOWN');
 assert.equal(v.consequence.typed_account.attempt,null);assert.equal(v.consequence.typed_account.settlement,null);
});
test('expired delegation truthfully returns without attempting or gaining future authority',t=>{
 const f=setup(t);const v=delegate(f);t.mock.timers.enable({apis:['Date'],now:Date.parse(v.delegation.expires_at)+1});
 const expired=f.journey.view();assert.equal(expired.phase,'EXPIRED');assert.equal(expired.allowed_commands.includes('start'),false);
 const returned=act(f,'return');assert.equal(returned.research_return.work_condition,'EXPIRED');assert.equal(returned.research_return.occurrence_knowledge,'UNKNOWN');
 assert.equal(returned.consequence.typed_account.attempt,null);assert.equal(returned.research_return.return_completeness,'COMPLETE');
});
test('a witnessed earlier candidate establishes recurrence only in the authorized replay',t=>{
 const f=setup(t,'model-contradiction');act(f,'refresh');act(f,'compare');act(f,'delegate');act(f,'start');const v=act(f,'return');
 assert.equal(v.research_return.knowledge,'ESTABLISHED');assert.equal(v.research_return.established_findings.length,3);
 assert.doesNotMatch(v.answers[5].answer,/whether this happened earlier remains unknown/);
});
