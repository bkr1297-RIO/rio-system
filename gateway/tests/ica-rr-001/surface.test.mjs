import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync,rmSync,existsSync,readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createICAReference } from '../../local-field/ica/journey.mjs';
import { formClient } from './form-client.mjs';
let api;try{api=await import('../../local-field/ica/server.mjs');}catch(e){if(e.code!=='ERR_MODULE_NOT_FOUND')throw e;}
async function setup(t,fixture='normal'){
 assert.equal(typeof api?.startICAHost,'function','ICA human form surface must exist');
 const dir=mkdtempSync(join(tmpdir(),'ica-form-')),reference=createICAReference({root:join(dir,'field'),fixture}),host=await api.startICAHost({reference});
 t.after(async()=>{await host.close();reference.close();rmSync(dir,{recursive:true,force:true});});return {host,reference};
}
async function prepare(c){await c.click('refresh');await c.click('what');await c.click('why');return c.click('delegate');}
test('eight lived answers and one closed journey work through visible native forms',async t=>{
 const {host,reference}=await setup(t),c=await formClient(host),before=reference.runtime.status();
 assert.match(c.html,/Observatory/);assert.match(c.html,/not connected to your live/i);
 await c.click('refresh');assert.deepEqual(reference.runtime.status(),before);assert.match(c.html,/Calendar space tightened/);
 await c.click('what');assert.match(c.html,/candidate pressure differential/i);
 await c.click('why');assert.match(c.html,/What’s Driving It/);assert.match(c.html,/Extraction window/);
 await c.click('delegate');assert.match(c.html,/Start this Research/);assert.equal((await c.account()).consequence.typed_account.attempt,null);
 await c.click('start');assert.match(c.html,/cannot yet establish whether/);assert.match(c.html,/Read Research’s Return/);
 await c.click('return');assert.match(c.html,/Return complete:/);assert.match(c.html,/not the truth of its forecast/);
 const v=await c.account();assert.equal(v.answers.length,8);for(const answer of v.answers){assert.ok(c.html.includes(answer.question));assert.ok(c.html.includes(answer.answer));}
 const runtimeBeforeKeep=reference.runtime.status();await c.click('keep');assert.deepEqual(reference.runtime.status(),runtimeBeforeKeep);
 assert.match(c.html,/No subsequent work was authorized/);const reentered=await c.account();await c.open();assert.equal((await c.account()).journey_id,reentered.journey_id);
 assert.doesNotMatch(c.html,/>Undo<|Stopped ✓|Stress Index|SUCCESS\/FAILURE/);
});
for(const [fixture,status,phrase]of[['hold','HOLD','waiting for the required'],['deny','DENY','denied by the native'],['unknown','RETURNED','Occurrence unknown'],['partial','PARTIAL_RETURN','Return is partial']]){
 test(`${fixture} failure path is truthful through the same visible forms`,async t=>{
  const {host,reference}=await setup(t,fixture),c=await formClient(host);await prepare(c);
  if(!['hold','deny'].includes(fixture)){await c.click('start');await c.click('return');}
  const v=await c.account();assert.equal(v.phase,status);assert.match(c.html,new RegExp(phrase,'i'));
  assert.match(c.html,/What remains unresolved or controllable/);assert.match(c.html,/Keep this finding/);
  if(['hold','deny'].includes(fixture)){assert.equal(v.consequence,null);assert.equal(existsSync(join(reference.root,'artifacts','research-return.json')),false);assert.doesNotMatch(c.html,/data-command="start"/);}
  if(fixture==='unknown'){assert.equal(v.consequence.typed_account.returned.return_completeness,'COMPLETE');assert.equal(v.consequence.typed_account.occurrence_knowledge,'UNKNOWN');assert.match(c.html,/Declared fixture/);}
  if(fixture==='partial')assert.match(c.html,/Observation report|Outcome report/);
 });
}
test('withdrawal after Return shows acknowledgement and irreversible limits independently',async t=>{
 const {host,reference}=await setup(t),c=await formClient(host);await prepare(c);await c.click('start');await c.click('return');
 const bytes=readFileSync(join(reference.root,'artifacts','research-return.json'));await c.click('revoke');assert.match(c.html,/acknowledgement is pending/i);
 await c.click('acknowledge');assert.match(c.html,/Acknowledgement confirmed/);assert.match(c.html,/cannot reverse it/);assert.match(c.html,/Further authorized use of this grant/);
 assert.deepEqual(readFileSync(join(reference.root,'artifacts','research-return.json')),bytes);assert.doesNotMatch(c.html,/data-command="start"|>Undo<|Stopped ✓/);
});
test('unauthenticated, cross-origin, forged and replayed forms cannot exercise authority',async t=>{
 const {host,reference}=await setup(t),before=reference.runtime.status();assert.equal((await fetch(host.url)).status,401);
 assert.equal((await fetch(`${host.url}/account.json`)).status,401);
 const c=await formClient(host);await c.click('refresh');
 const body=new URLSearchParams({action:'delegate',expected_revision:String((await c.account()).revision),request_id:randomUUID(),csrf:'forged'});
 const post=(b,origin=host.url)=>fetch(`${host.url}/command`,{method:'POST',headers:{cookie:c.cookie,origin,'content-type':'application/x-www-form-urlencoded'},body:b,redirect:'manual'});
 assert.equal((await post(body)).status,403);assert.equal((await post(body,'https://other.example')).status,403);
 const nativeForm=c.html.match(/<form[^>]*data-command="delegate"[^>]*>([\s\S]*?)<\/form>/)[1];
 const good=new URLSearchParams([...nativeForm.matchAll(/<input type="hidden" name="([^"]+)" value="([^"]*)"/g)].map(m=>[m[1],m[2]]));
 assert.deepEqual(reference.runtime.status(),before);assert.equal((await post(good)).status,303);const admitted=reference.runtime.status();
 assert.equal((await post(good)).status,409);assert.deepEqual(reference.runtime.status(),admitted);
 assert.equal((await post(new URLSearchParams([...good,['raw_calendar_description','secret']]))).status,400);
 assert.equal((await fetch(`${host.url}/command`)).status,401);
});
test('host is loopback-only; no-argument CLI creates no reference or token runtime',async t=>{
 const {host}=await setup(t);assert.match(host.url,/^http:\/\/127\.0\.0\.1:\d+$/);
 const cli=fileURLToPath(new URL('../../scripts/run-ica-rr-001.mjs',import.meta.url));
 const p=spawnSync(process.execPath,[cli],{encoding:'utf8'});assert.equal(p.status,2);assert.match(p.stderr,/Usage/);assert.doesNotMatch(p.stdout,/Token Manager|Token issued/);
});
