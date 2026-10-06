import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync,rmSync,readFileSync,writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import * as api from '../../local-field/ica/journey.mjs';
import { renderICA } from '../../local-field/ica/surface.mjs';
const act=(f,a)=>f.journey.dispatch({action:a,expected_revision:f.journey.view().revision,request_id:randomUUID()});
test('restart retains authenticated orientation, residue and lineage without reviving any authority handle',t=>{
 const dir=mkdtempSync(join(tmpdir(),'f1-reentry-')),root=join(dir,'field');t.after(()=>rmSync(dir,{recursive:true,force:true}));
 let f=api.createICAReference({root});for(const a of ['refresh','delegate','start','return','revoke','acknowledge','accept-report','admit-account'])act(f,a);
 const before=f.journey.view(),bytes=readFileSync(join(root,'artifacts','research-return.json'));f.close();
 assert.equal(typeof api.reopenICAReference,'function');f=api.reopenICAReference({root});t.after(()=>f.close());const after=f.journey.view();
 assert.equal(after.journey_id,before.journey_id);assert.deepEqual(after.register,before.register);assert.deepEqual(after.perimeter,before.perimeter);assert.deepEqual(after.allowed_commands,[]);
 assert.equal(after.reentry.authority_restored,false);assert.equal(after.consequence.typed_account.revocation.future_exercise_disabled,true);
 assert.throws(()=>act(f,'start'),/REENTRY_READ_ONLY/);assert.deepEqual(readFileSync(join(root,'artifacts','research-return.json')),bytes);
 assert.match(renderICA(after,'test'),/Retained account|retained account/);
});
test('unsigned display cache tampering cannot replace the native authenticated checkpoint',t=>{
 const dir=mkdtempSync(join(tmpdir(),'f1-cache-')),root=join(dir,'field');t.after(()=>rmSync(dir,{recursive:true,force:true}));
 let f=api.createICAReference({root});act(f,'refresh');const before=f.journey.view();f.close();writeFileSync(join(root,'ica-register.json'),JSON.stringify({...before,phase:'AUTHORIZED'}));
 assert.equal(typeof api.reopenICAReference,'function');f=api.reopenICAReference({root});t.after(()=>f.close());assert.equal(f.journey.view().phase,before.phase);
});
