import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createICAReference} from '../../local-field/ica/journey.mjs';
import {startICAHost} from '../../local-field/ica/server.mjs';
import {formClient} from './form-client.mjs';
async function setup(t,fixture){const d=mkdtempSync(join(tmpdir(),'ica-full-form-')),r=createICAReference({root:join(d,'field'),fixture}),h=await startICAHost({reference:r});t.after(async()=>{await h.close();r.close();rmSync(d,{recursive:true,force:true});});return {r,c:await formClient(h)};}
test('findings, unknown central claim and retained residue are readable without opening machine JSON',async t=>{
 const {r,c}=await setup(t,'normal');await c.click('refresh');await c.click('delegate');await c.click('start');await c.click('return');
 const front=c.html.split('<details><summary>Paired journey')[0];assert.match(front,/Research findings/);assert.match(front,/We cannot yet tell whether this has happened before/);
 assert.match(front,/Perimeter/);assert.match(front,/Earlier source history/);assert.match(front,/LUMEN/);
 assert.doesNotMatch(front,/>SUCCESS<|Stopped ✓|>Undo</);const before=r.runtime.status(),items=(await c.account()).perimeter.items;
 await c.click('perimeter');assert.deepEqual(r.runtime.status(),before);assert.deepEqual((await c.account()).perimeter.items,items);
 assert.match(c.html,/Retained at the Perimeter/);await c.open();assert.equal((await c.account()).research_return.return_completeness,'COMPLETE');
});
for(const [fixture,phrase] of [['research-unknown','We cannot yet tell'],['research-hold','Restore the authorized history source'],['research-deny','outside Research'],['research-revoke','withdrew|withdrawn'],['research-partial','Two findings established']]){
 test(`${fixture} new burden is explained through actual authenticated forms`,async t=>{
  const {c}=await setup(t,fixture);await c.click('refresh');await c.click('delegate');await c.click('start');
  if(fixture==='research-revoke'){await c.click('revoke');await c.click('acknowledge');}
  await c.click('return');assert.match(c.html,new RegExp(phrase,'i'));assert.doesNotMatch(c.html,/>SUCCESS<|Stopped ✓/);
 });
}
test('occupant replacement requires a visible fresh delegation and exposes stable Office',async t=>{
 const {c}=await setup(t,'occupant-replacement');await c.click('refresh');await c.click('delegate');await c.click('replace');
 assert.match(c.html,/New Research inhabitant/);assert.match(c.html,/fresh delegation/);assert.doesNotMatch(c.html,/data-command="start"/);
 await c.click('delegate');await c.click('start');await c.click('return');assert.equal((await c.account()).research_return.inhabitant,'research-worker-2');
});
test('later source disagreement is readable and keeps earlier candidate available',async t=>{
 const {c}=await setup(t,'model-contradiction');await c.click('refresh');await c.click('compare');assert.match(c.html,/Later conditions differ/);
 assert.match(c.html,/Earlier interpretation remains/);assert.match(c.html,/pressure differential/i);assert.equal((await c.account()).divergence.prior_history_rewritten,false);
});
