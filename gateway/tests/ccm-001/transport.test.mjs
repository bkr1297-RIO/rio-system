import test from 'node:test';
import assert from 'node:assert/strict';
import { medium } from './helpers.mjs';
import { signed } from '../helpers/local-field.mjs';
import { createFieldServer } from '../../local-field/http.mjs';

test('existing authenticated control/query transport carries CCM without a new authority surface',async t=>{
 const f=medium(t), server=createFieldServer(f.runtime);
 await new Promise(r=>server.listen(0,'127.0.0.1',r)); t.after(()=>new Promise(r=>server.close(r)));
 const post=async(path,record)=>{const r=await fetch(`http://127.0.0.1:${server.address().port}${path}`,{method:'POST',body:JSON.stringify(record)});return {status:r.status,data:await r.json()};};
 const rec=f.record('standing.transition','I_AB',{interval_id:'I_AB',outbound:'OBSERVE_ONLY',authority_basis:null});
 assert.equal((await post('/control',rec)).status,200);
 const q={...f.stamp(),type:'query',issuer:'I-1',view:'ccm',query:'WhatStands',args:['node-a','node-b']};
 const view=await post('/query',signed(q,f.human));assert.equal(view.data.intervals[0].standing.outbound,'OBSERVE_ONLY');
 assert.equal((await post('/query',signed({...q,issuer:'node-a'},f.a))).status,409);
 assert.equal((await post('/control',signed({...rec.body,issuer:'node-a'},f.a))).status,409);
});
