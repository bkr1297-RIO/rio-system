import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync,readFileSync,existsSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {randomUUID} from 'node:crypto';
import {createICAReference,reopenICAReference} from '../../local-field/ica/journey.mjs';
import {renderICA} from '../../local-field/ica/surface.mjs';
import {ConsequenceSpecimen} from '../../local-field/consequence/account.mjs';
import {startICAHost} from '../../local-field/ica/server.mjs';
import {formClient} from '../ica-rr-001/form-client.mjs';
function setup(t,fixture='normal'){
 const dir=mkdtempSync(join(tmpdir(),'navigation-room-')),ref=createICAReference({root:join(dir,'field'),fixture});
 t.after(()=>{ref.close();rmSync(dir,{recursive:true,force:true});});return ref;
}
function click(ref,action){return ref.journey.dispatch({action,expected_revision:ref.journey.view().revision,request_id:randomUUID()});}
test('existing room integrates navigation without creating disposition, attempt, or file effects',t=>{
 const ref=setup(t),before=ref.runtime.status(),stored=readFileSync(join(ref.root,'ica-register.json'));
 const view=ref.journey.view();assert.equal(view.navigation?.state,'FLOW');
 assert.equal(view.navigation.authorization_supplied,false);assert.deepEqual(ref.runtime.status(),before);
 assert.deepEqual(readFileSync(join(ref.root,'ica-register.json')),stored);
 const account=new ConsequenceSpecimen(ref.runtime,{objective_id:'No navigation execution',minimum_bytes:1});
 assert.throws(()=>account.admit(view.navigation));assert.deepEqual(ref.runtime.status(),before);
 assert.equal(existsSync(join(ref.root,'artifacts','research-return.json')),false);
});
test('answered orientation yields silently while pull controls and unresolved residue remain',t=>{
 const ref=setup(t);click(ref,'refresh');click(ref,'what');click(ref,'why');
 const view=ref.journey.view();assert.equal(view.navigation?.state,'YIELD');
 const html=renderICA(view,'test-csrf');assert.doesNotMatch(html,/data-navigation-foreground/);
 assert.match(html,/data-command="delegate"/);assert.ok(view.reading.unresolved_remainder.length);
 assert.equal(view.disposition,null);assert.equal(view.consequence,null);
});
test('later contradictory observations reopen descriptive FLOW without erasing earlier lineage',t=>{
 const ref=setup(t,'model-contradiction');for(const action of ['refresh','what','why'])click(ref,action);
 const prior=ref.journey.view();assert.equal(prior.navigation.state,'YIELD');
 const before=ref.runtime.status();click(ref,'compare');const current=ref.journey.view();
 assert.equal(current.navigation.state,'FLOW');assert.notEqual(current.reading.reading_id,prior.reading.reading_id);
 assert.equal(current.divergence.prior_history_rewritten,false);
 assert.ok(current.register.some(e=>e.artifact_ref===`FieldoscopyReading:${prior.reading.reading_id}`));
 assert.deepEqual(ref.runtime.status(),before);assert.equal(current.consequence,null);
});
test('truthful UNKNOWN Return offers human choice; retention yields without new authority',t=>{
 const ref=setup(t,'unknown');for(const action of ['refresh','what','why','delegate','start','return'])click(ref,action);
 let view=ref.journey.view();assert.equal(view.navigation?.state,'RETURN_CHOICE');
 assert.equal(view.research_return.occurrence_knowledge,'UNKNOWN');assert.equal(view.research_return.outcome_assessment,'UNRESOLVED');
 const before=ref.runtime.status();click(ref,'keep');view=ref.journey.view();
 assert.equal(view.navigation.state,'YIELD');assert.deepEqual(ref.runtime.status(),before);
 assert.ok(view.perimeter.items.length);assert.doesNotMatch(renderICA(view,'test-csrf'),/data-navigation-foreground/);
});
for(const fixture of ['normal','unknown']){
 test(`${fixture} separate account admission answers the carrying choice and yields without a tail`,t=>{
  const ref=setup(t,fixture);for(const action of ['refresh','what','why','delegate','start','return','accept-report'])click(ref,action);
  assert.equal(ref.journey.view().navigation.state,'RETURN_CHOICE');
  click(ref,'admit-account');const view=ref.journey.view(),before=ref.runtime.status();
  assert.ok(view.successor);assert.equal(view.orientation,null);
  assert.equal(view.navigation.state,'YIELD');assert.doesNotMatch(renderICA(view,'test-csrf'),/data-navigation-foreground/);
  assert.deepEqual(ref.runtime.status(),before);assert.ok(view.perimeter.items.length);
  if(fixture==='unknown')assert.equal(view.research_return.occurrence_knowledge,'UNKNOWN');
 });
}
test('existing HOLD remains attributable and distinct from navigation choice or yield',t=>{
 const ref=setup(t,'hold');for(const action of ['refresh','what','why','delegate'])click(ref,action);
 const view=ref.journey.view();assert.equal(view.phase,'HOLD');assert.equal(view.navigation?.state,'HOLD');
 assert.equal(view.navigation.authorization_supplied,false);assert.equal(view.consequence,null);
 assert.ok(view.navigation.dependencies[0].basis_refs.length);assert.doesNotMatch(renderICA(view,'test-csrf'),/data-command="start"/);
});
test('historical re-entry does not revive foreground choice, envelope, or passage permission',t=>{
 const ref=setup(t);for(const action of ['refresh','what','why','delegate','start','return'])click(ref,action);
 assert.equal(ref.journey.view().navigation?.state,'RETURN_CHOICE');ref.close();
 const resumed=reopenICAReference({root:ref.root}),v=resumed.journey.view();
 assert.equal(v.navigation.state,'YIELD');assert.equal(v.reentry.authority_restored,false);assert.deepEqual(v.allowed_commands,[]);
 assert.doesNotMatch(renderICA(v,'test-csrf'),/data-navigation-foreground/);resumed.close();
});
test('native HTTP forms preserve UNKNOWN and expose the actual navigation account',async t=>{
 const ref=setup(t,'unknown'),host=await startICAHost({reference:ref});t.after(()=>host.close());
 const c=await formClient(host);for(const action of ['refresh','what','why','delegate','start','return'])await c.click(action);
 const before=ref.runtime.status(),v=await c.account();assert.equal(v.navigation?.state,'RETURN_CHOICE');
 assert.match(c.html,/data-navigation-foreground="RETURN_CHOICE"/);assert.equal(v.research_return.occurrence_knowledge,'UNKNOWN');
 await c.click('keep');assert.equal((await c.account()).navigation.state,'YIELD');
 assert.doesNotMatch(c.html,/data-navigation-foreground/);assert.deepEqual(ref.runtime.status(),before);
});
