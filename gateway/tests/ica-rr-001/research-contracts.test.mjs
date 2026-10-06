import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync,existsSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {randomUUID} from 'node:crypto';
import {ReferenceWorkspace} from '../../local-field/ica/workspace.mjs';
import {ConsequenceSpecimen} from '../../local-field/consequence/account.mjs';
import {referenceSignals} from '../../local-field/ica/source-replay.mjs';
import {evaluate} from '../../local-field/meteorology/evaluator.mjs';
let research,dispatch;
try{research=await import('../../local-field/ica/research.mjs');dispatch=await import('../../local-field/ica/dispatch.mjs');}catch(e){if(e.code!=='ERR_MODULE_NOT_FOUND')throw e;}
function setup(t){
 assert.equal(typeof dispatch?.ResearchDispatch,'function','An explicit Research dispatch contract must exist');
 const dir=mkdtempSync(join(tmpdir(),'ica-contract-')),workspace=new ReferenceWorkspace({root:join(dir,'field')});
 t.after(()=>{workspace.close();rmSync(dir,{recursive:true,force:true});});
 const replay=referenceSignals(),readings=[evaluate(replay.initial,{timestamp:replay.initial_timestamp}),evaluate(replay.changed,{timestamp:replay.changed_timestamp})];
 const prepared=workspace.prepare('{"bounded":"research"}'),account=new ConsequenceSpecimen(workspace.runtime,{objective_id:'Bounded note',minimum_bytes:1});
 const owner=new dispatch.ResearchDispatch(workspace,account,prepared);
 const delegation=owner.delegate({human_choice_ref:randomUUID(),inhabitant:'research-worker-1',reading_refs:readings.map(r=>r.reading_id)});
 return {workspace,readings,prepared,account,owner,delegation};
}
test('authorized history establishes two changes but cannot establish earlier recurrence',t=>{
 const f=setup(t),r=research.investigate(f.readings,f.delegation);
 assert.equal(r.findings.filter(x=>x.status==='ESTABLISHED').length,2);
 assert.equal(r.findings.find(x=>x.question==='PRIOR_RECURRENCE').status,'UNKNOWN');
 assert.equal(r.knowledge,'UNKNOWN');assert.equal(r.outcome,'UNRESOLVED');
 for(const finding of r.findings){assert.ok(finding.provenance.reading_refs.length);assert.equal(finding.provenance.source_contract,'SCOPED_SYNTHETIC_SIGNALS');}
 assert.equal(existsSync(join(f.workspace.root,'artifacts','research-return.json')),false);
});
test('research rejects unlisted reading and hidden raw content',t=>{
 const f=setup(t),foreign=structuredClone(f.readings);foreign[0].reading_id='unlisted';
 assert.throws(()=>research.investigate(foreign,f.delegation),/READING|MANIFEST/);
 const raw=structuredClone(f.readings);raw[0].pr_body='private';assert.throws(()=>research.investigate(raw,f.delegation),/READING|FIELDS/);
});
test('warrant authorizes native commitment only; lease requires attributable owner custody',t=>{
 const f=setup(t),p=f.account.admit(f.prepared.passage),w=f.owner.warrant(f.delegation,p,randomUUID());
 assert.equal(w.kind,'HumanSettlementWarrant');assert.equal(f.workspace.runtime.waistQuery(p.passage_id).attempt,null);
 assert.throws(()=>f.owner.lease(structuredClone(w)),/ISSUED_WARRANT/);
 const l=f.owner.lease(w);assert.equal(l.kind,'ConsequentialLease');assert.equal(l.office,'Research');assert.equal(l.holder,'research-worker-1');
 assert.equal(l.subdelegation_rule,'PROHIBITED');assert.ok(l.revocation_semantics.validation_points.length);
 assert.equal(f.workspace.runtime.waistQuery(p.passage_id).attempt,null);
 assert.throws(()=>f.owner.invoke(structuredClone(l),f.delegation),/ISSUED_LEASE/);
 const attempt=f.owner.invoke(l,f.delegation);assert.ok(attempt.attempt_id);assert.equal(f.account.snapshot(attempt).occurrence_knowledge,'UNKNOWN');
 assert.throws(()=>f.owner.invoke(l,f.delegation),/EXERCISED/);
});
test('wrong inhabitant or foreign owner cannot dispatch an existing lease',t=>{
 const f=setup(t),p=f.account.admit(f.prepared.passage),l=f.owner.lease(f.owner.warrant(f.delegation,p,randomUUID()));
 assert.throws(()=>f.owner.invoke(l,{...f.delegation,inhabitant:'research-worker-2'}),/DELEGATION/);
 const other=new dispatch.ResearchDispatch(f.workspace,f.account,f.prepared);
 assert.throws(()=>other.invoke(l,f.delegation),/ISSUED_LEASE/);assert.equal(f.workspace.runtime.waistQuery(p.passage_id).attempt,null);
});
test('native revocation validated before exercise blocks a previously issued lease',t=>{
 const f=setup(t),p=f.account.admit(f.prepared.passage),l=f.owner.lease(f.owner.warrant(f.delegation,p,randomUUID()));
 f.account.revoke(p,f.workspace.revocation(f.prepared.grant_id));assert.throws(()=>f.owner.invoke(l,f.delegation),/REVOKED/);
 assert.equal(f.workspace.runtime.waistQuery(p.passage_id).attempt,null);
});
test('elapsed lease cannot dispatch even when its signature and prior admission remain valid',t=>{
 const f=setup(t),p=f.account.admit(f.prepared.passage),l=f.owner.lease(f.owner.warrant(f.delegation,p,randomUUID()));
 t.mock.timers.enable({apis:['Date'],now:Date.parse(l.expires_at)+1});
 assert.throws(()=>f.owner.invoke(l,f.delegation),/LEASE_EXPIRED|DELEGATION_EXPIRED/);assert.equal(f.workspace.runtime.waistQuery(p.passage_id).attempt,null);
});
