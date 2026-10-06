import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync,rmSync,readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { createICAReference,ICAJourney } from '../../local-field/ica/journey.mjs';
import { ReferenceWorkspace } from '../../local-field/ica/workspace.mjs';
import { referenceSignals } from '../../local-field/ica/source-replay.mjs';
import { renderICA } from '../../local-field/ica/surface.mjs';
import { startICAHost } from '../../local-field/ica/server.mjs';
import { formClient } from './form-client.mjs';
function root(t){const d=mkdtempSync(join(tmpdir(),'ica-boundary-'));t.after(()=>rmSync(d,{recursive:true,force:true}));return join(d,'field');}
function reference(t){const f=createICAReference({root:root(t)});t.after(()=>f.close());return f;}
test('rendering requires an issued view; serialized claims cannot forge the screen',t=>{
 const f=reference(t),v=f.journey.view();assert.match(renderICA(v,'reference-csrf'),/Observatory/);
 assert.throws(()=>renderICA(JSON.parse(JSON.stringify(v)),'reference-csrf'),/ISSUED_ICA_VIEW_REQUIRED/);
});
test('journey replay is a closed scoped contract, never a raw source envelope',t=>{
 const w=new ReferenceWorkspace({root:root(t)});t.after(()=>w.close());
 for(const raw of ['calendar_descriptions','email_bodies','source_code','pr_bodies','banking_descriptions','biometric_traces'])
  assert.throws(()=>new ICAJourney(w,{...referenceSignals(),[raw]:['RAW_SECRET_SENTINEL']}),/REPLAY_FIELDS/);
});
test('command accessors are rejected without reading hidden content or creating a grant',t=>{
 const f=reference(t);f.journey.dispatch({action:'refresh',request_id:randomUUID(),expected_revision:0});const before=f.runtime.status();let reads=0;
 const cmd={request_id:randomUUID(),expected_revision:1};Object.defineProperty(cmd,'action',{enumerable:true,get(){reads++;return 'delegate';}});
 assert.throws(()=>f.journey.dispatch(cmd),/COMMAND_FIELDS/);assert.equal(reads,0);assert.deepEqual(f.runtime.status(),before);
});
test('reference timestamps are primitive values, with no hidden raw fields',t=>{
 const hidden=new String('2026-10-06T00:00:00.000Z');hidden.pr_body='RAW_SECRET_SENTINEL';
 assert.throws(()=>referenceSignals(hidden),/REFERENCE_TIME_INVALID/);
 const signals=referenceSignals().changed;assert.equal(signals.length,6);
 const fields=['signal_id','metric','magnitude','direction','rate_of_change','observation_window','comparison_window','source_domain','extractor_id','extractor_version','timestamp'].sort();
 for(const s of signals)assert.deepEqual(Object.keys(s).sort(),fields);assert.doesNotMatch(JSON.stringify(signals),/RAW_SECRET_SENTINEL/);
});
test('one Program and Instrument remain explicit in the machine register',t=>{
 const v=reference(t).journey.view();assert.equal(v.program?.kind,'Program');assert.equal(v.program.max_effects,1);
 assert.equal(v.instrument.kind,'Instrument');assert.equal(v.instrument.name,'Metascope');
});
test('GETs, inspection and radar refresh leave every native durable table unchanged',async t=>{
 const f=reference(t),host=await startICAHost({reference:f});t.after(()=>host.close());const c=await formClient(host);
 const dbFile=readdirSync(f.root,{recursive:true}).find(p=>p.endsWith('.sqlite')||p.endsWith('.db'));assert.ok(dbFile,'Native durable database must exist');
 const db=new DatabaseSync(join(f.root,dbFile),{readOnly:true});t.after(()=>db.close());
 const tables=db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all().map(r=>r.name);
 const dump=()=>Object.fromEntries(tables.map(name=>[name,db.prepare(`SELECT * FROM "${name}" ORDER BY rowid`).all()]));
 const before=dump();for(let i=0;i<10;i++){await c.open();await c.account();}await c.click('refresh');await c.click('what');await c.click('why');
 assert.deepEqual(dump(),before);assert.equal((await c.account()).delegation,null);
});
