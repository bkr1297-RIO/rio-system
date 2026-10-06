import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync,rmSync,unlinkSync,writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { request } from 'node:http';
import { createICAReference } from '../../local-field/ica/journey.mjs';
import { startICAHost } from '../../local-field/ica/server.mjs';
import { formClient } from './form-client.mjs';
async function setup(t){const root=mkdtempSync(join(tmpdir(),'ica-review-')),reference=createICAReference({root:join(root,'field')}),host=await startICAHost({reference});
 t.after(async()=>{await host.close();reference.close();rmSync(root,{recursive:true,force:true});});return {reference,host};}
function privateFree(body,id){assert.equal(body.includes(id),false,'No journey ID may leak before authentication');assert.doesNotMatch(body,/name="csrf"|ICAView|machine_artifact|Your eight lived answers/);}
test('malformed Unicode entry keys cannot disclose the private view or control forms',async t=>{
 const {host,reference}=await setup(t),id=reference.journey.view().journey_id,before=reference.runtime.status();
 const r=await fetch(`${host.url}/enter?key=${encodeURIComponent('é'.repeat(64))}`);assert.equal(r.status,401);privateFree(await r.text(),id);assert.deepEqual(reference.runtime.status(),before);
});
test('malformed Unicode session cookies cannot disclose the private account',async t=>{
 const {host,reference}=await setup(t),id=reference.journey.view().journey_id;
 const r=await fetch(host.url,{headers:{cookie:`ica_session=${'é'.repeat(64)}`}});assert.equal(r.status,401);privateFree(await r.text(),id);
});
test('generic pre-authentication URL errors never render an authenticated account',async t=>{
 const {host,reference}=await setup(t),u=new URL(host.url);
 const result=await new Promise((resolve,reject)=>{const q=request({hostname:u.hostname,port:u.port,path:'http://[',headers:{host:u.host}},r=>{let body='';r.setEncoding('utf8');r.on('data',x=>body+=x);r.on('end',()=>resolve({status:r.statusCode,body}));});q.on('error',reject);q.end();});
 assert.ok(result.status>=400&&result.status<500);privateFree(result.body,reference.journey.view().journey_id);
});
for(const fault of ['missing','altered'])test(`actual ${fault} readback returns a truthful unresolved account through the visible forms`,async t=>{
 const {host,reference}=await setup(t),c=await formClient(host);await c.click('refresh');await c.click('delegate');await c.click('start');
 const before=await c.account(),file=join(reference.root,'artifacts','research-return.json'),attempt=before.consequence.typed_account.attempt;
 if(fault==='missing')unlinkSync(file);else writeFileSync(file,'Different bytes outside the delegated write');
 await c.click('return');const after=await c.account(),s=after.consequence.typed_account,native=reference.runtime.waistQuery(s.passage_id);
 assert.equal(native.attempt.attempt_id,attempt.attempt_id);assert.equal(s.occurrence_knowledge,'UNKNOWN');assert.equal(s.evidence,null);assert.equal(s.outcome_assessment.status,'UNRESOLVED');
 assert.equal(s.returned.return_completeness,'COMPLETE');assert.ok(s.returned.outstanding_obligations.some(x=>/readback/i.test(x)));assert.equal(after.allowed_commands.includes('return'),false);
 assert.match(c.html,/Occurrence unknown/);assert.match(c.html,/Return complete:/);assert.doesNotMatch(c.html,/data-claim="OCCURRED"|data-claim="ACHIEVED_OBJECTIVE"/);
 await c.click('keep');assert.equal((await c.account()).orientation.authorization_supplied,false);assert.equal(native.execution.execution_id,attempt.execution_id);
});
