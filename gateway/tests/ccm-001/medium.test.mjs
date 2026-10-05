import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { medium, interval, participant, ZERO } from './helpers.mjs';
import { setup, signed } from '../helpers/local-field.mjs';
import { hash } from '../../security/local-field-authority.mjs';

test('CCM profile is opt-in and does not grant standing to default fields', t => {
 const f=setup(t); assert.throws(()=>f.runtime.ccmQuery('WhatStands','node-a','node-b'),/CCM_NOT_CONFIGURED/);
});
test('interval queries distinguish unknown endpoints, absent relation and independent parallel intervals', t => {
 const f=medium(t);
 assert.equal(f.query('WhatStands','missing','node-b').status,'UNKNOWN');
 assert.equal(f.query('WhatStands','node-b','node-c').status,'ABSENT');
 f.command('intervals.constitute',f.field_id,[interval('I_AB_2')]);
 const r=f.query('WhatStands','node-a','node-b'); assert.deepEqual(r.intervals.map(x=>x.interval_id),['I_AB','I_AB_2']);
 assert.ok(r.intervals.every(x=>x.standing.outbound==='OBSERVE_ONLY'));
});
test('standing requires exact predecessor and current native SourcePoint warrant', t => {
 const f=medium(t); const head=f.query('ShowLineage','I_AB').head;
 const rec=f.record('standing.transition','I_AB',{interval_id:'I_AB',outbound:'ELIGIBLE',authority_basis:'missing'});
 assert.throws(()=>f.runtime.ccmCommand(rec),/AUTHORITY_MISSING/);
 assert.equal(f.query('ShowLineage','I_AB').head,head);
 assert.throws(()=>f.command('standing.transition','I_AB',{interval_id:'I_AB',outbound:'OBSERVE_ONLY',authority_basis:null},{predecessor_hash:ZERO}),/PREDECESSOR/);
 const wrong=signed({...rec.body,issuer:'node-a'},f.a);
 assert.throws(()=>f.runtime.ccmCommand(wrong),/ROOT_REQUIRED/);
});
test('H-01 and H-07 identical payload/shared participant retain interval-specific standing',async t=>{
 const f=medium(t); f.command('intervals.constitute',f.field_id,[interval('I_AB_OBSERVE')]);
 const g=f.allow(),p=f.bind(g); const g2=f.grant({purpose:'ccm:I_AB_OBSERVE:outbound'}), p2=f.bind(g2,'I_AB_OBSERVE');
 assert.equal(hash(p.body.payload),hash(p2.body.payload));
 f.operate(p); assert.throws(()=>f.operate(p2),/INTERVAL_OBSERVE_ONLY/);
 assert.equal(readFileSync(join(f.root,'artifacts/hello.txt'),'utf8'),'ONE local field\n');
 assert.equal(f.query('WhatStands','node-a','node-b').intervals.find(x=>x.interval_id==='I_AB_OBSERVE').standing.outbound,'OBSERVE_ONLY');
});
test('H-03 revoked delegation blocks actual effect',async t=>{
 const f=medium(t),g=f.allow(),p=f.bind(g); f.control('revocation',{grant_id:g.grant_id});
 assert.throws(()=>f.operate(p),/AUTHORITY_REVOKED/); assert.equal(existsSync(join(f.root,'artifacts/hello.txt')),false);
});
test('H-10 dependency drift invalidates decision at point of use',async t=>{
 const f=medium(t),g=f.allow(),p=f.bind(g); f.runtime.admit(p); f.control('dependency',{name:'corpus',value:'v2'});
 assert.throws(()=>f.runtime.execute(p.body.passage_id,p),/DEPENDENCY/);
 assert.equal(existsSync(join(f.root,'artifacts/hello.txt')),false);
});
test('H-12 subject drift and replay cannot change unrelated intervals',t=>{
 const f=medium(t),g=f.allow(),p=f.bind(g);
 const rec=f.record('passage.open','I_AC',{interval_id:'I_AC',passage:p});
 assert.throws(()=>f.runtime.ccmCommand(rec),/INTERVAL_SUBJECT/);
 const replay=f.record('standing.transition','I_AB',{interval_id:'I_AB',outbound:'OBSERVE_ONLY',authority_basis:null});
 f.runtime.ccmCommand(replay); assert.throws(()=>f.runtime.ccmCommand(replay),/REPLAY|PREDECESSOR/);
});
test('H-04 out-of-order Return arrival remains exact and never mutates orientation',t=>{
 const f=medium(t),g=f.allow(),p=f.bind(g),p2=f.bind(g,'I_AB',{target:'second.txt'});
 const r2=f.returned(p2),r1=f.returned(p); assert.notEqual(r1,r2);
 assert.equal(f.query('WhatChanged',r2).passage_id,p2.body.passage_id);
 assert.equal(f.query('WhatChanged',r1).passage_id,p.body.passage_id);
 assert.equal(f.query('WhatStands','node-a','node-b').intervals[0].standing.inbound,'UNASSESSED');
});
test('H-05 denied outbound permits independently judged attributed exterior observation',async t=>{
 const f=medium(t),g=f.grant({purpose:'ccm:I_AB:outbound'}),p=f.bind(g);
 assert.throws(()=>f.operate(p),/INTERVAL_OBSERVE_ONLY/);
 writeFileSync(join(f.root,'external-unlawful.txt'),p.body.payload.content);
 const observed=f.witness(p,'I_AB',{occurrence_ref:'development:external-unlawful.txt',content_hash:hash({content:readFileSync(join(f.root,'external-unlawful.txt'),'utf8')})});
 const r=f.returned(p,'I_AB',observed); f.orient(r);
 const x=f.query('WhatChanged',r); assert.equal(x.inbound_disposition,'ADMIT'); assert.equal(x.outbound_disposition,'DENY');
 assert.equal(x.truth_status,'UNESTABLISHED'); assert.equal(x.home_mutation,'NOT_INVOKED');
});
test('H-06 lawful outbound cannot admit bad-provenance observation',async t=>{
 const f=medium(t),g=f.allow(),p=f.bind(g); f.operate(p);
 const obs=f.witness(p); obs.signature='00'.repeat(64); const r=f.returned(p,'I_AB',obs);
 assert.throws(()=>f.orient(r),/OBSERVATION_PROVENANCE/); f.orient(r,'I_AB','HOLD');
 const x=f.query('WhatChanged',r); assert.equal(x.inbound_disposition,'HOLD'); assert.equal(x.outbound_disposition,'ADMIT');
});
test('H-08 and H-09 context and authority cannot cross via shared endpoints',t=>{
 const f=medium(t),g=f.allow(),p=f.bind(g),r=f.returned(p);
 assert.throws(()=>f.command('context.copy','I_AC',{source_interval:'I_AB',target_interval:'I_AC'}),/OPERATION/);
 assert.throws(()=>f.command('standing.transition','I_AC',{interval_id:'I_AC',outbound:'ELIGIBLE',authority_basis:g.grant_id}),/INTERVAL_AUTHORITY/);
 assert.equal(f.query('CrossIntervalAdmissibility','I_AB','I_AC',hash({r})).status,'HOLD');
});
test('H-02 explicit notification preserves cross-boundary relation without authority propagation',t=>{
 const f=medium(t),g=f.allow(),p=f.bind(g),r=f.returned(p); const payload_ref=f.query('WhatChanged',r).artifact_hash;
 const cross={passage_id:'cross-1',source_interval:'I_AB',target_interval:'I_AC',payload_ref,source_ref:r,
  relation_type:'notification',uncertainty:'qualified claim',dependencies:{corpus:'v1'},return_contract:{required:true,to:'I_AB'},
  source_predecessor:f.query('ShowLineage','I_AB').head,target_predecessor:f.query('ShowLineage','I_AC').head};
 f.command('cross.open','I_AB',cross);
 assert.equal(f.query('CrossIntervalAdmissibility','I_AB','I_AC',payload_ref).status,'ADMIT');
 assert.equal(f.query('WhatStands','node-a','node-c').intervals[0].standing.outbound,'OBSERVE_ONLY');
 assert.equal(f.query('OpenPassages','I_AC').passages[0].direction,'CROSS_INTERVAL');
});
test('H-11 receipt rewrite and direct promotion operations are unavailable',t=>{
 const f=medium(t),g=f.allow(),p=f.bind(g); f.returned(p);
 assert.throws(()=>f.command('receipt.rewrite','I_AB',{disposition:'ADMIT'}),/OPERATION/);
 assert.throws(()=>f.command('authority.mint','I_AB',{}),/OPERATION/);
});
test('historical interval state reconstructs after restart and query results cannot mutate state',t=>{
 const f=medium(t),before=f.query('ShowLineage','I_AB').head;
 f.allow(); const after=f.query('ShowLineage','I_AB').head;
 const view=f.query('WhatStands','node-a','node-b'); view.intervals[0].standing.outbound='CORONATED';
 assert.equal(f.query('WhatStands','node-a','node-b').intervals[0].standing.outbound,'ELIGIBLE');
 assert.equal(f.query('WhatStands','node-a','node-b',{at:before}).intervals[0].standing.outbound,'OBSERVE_ONLY');
 f.restart(); assert.equal(f.query('ShowLineage','I_AB').head,after);
 assert.equal(f.query('UnderWhoseAuthority','I_AB').sourcepoint,'I-1');
});

test('native policy denial remains distinct from interval eligibility', t=>{
 const f=medium(t),g=f.allow(),p=f.bind(g); const before=f.query('ShowLineage','I_AB').head;
 assert.equal(f.query('WhatMayRightfullyFollow','I_AB',p.body).status,'ADMIT');
 assert.equal(existsSync(join(f.root,'artifacts/hello.txt')),false);
 assert.equal(f.query('ShowLineage','I_AB').head,before);
});
test('interval downgrade after native admission prevents point-of-use execution',t=>{
 const f=medium(t),g=f.allow(),p=f.bind(g);f.runtime.admit(p);
 f.command('standing.transition','I_AB',{interval_id:'I_AB',outbound:'OBSERVE_ONLY',authority_basis:null});
 assert.throws(()=>f.runtime.execute(p.body.passage_id,p),/INTERVAL_OBSERVE_ONLY/);
 assert.equal(existsSync(join(f.root,'artifacts/hello.txt')),false);
});
test('an unbound native passage cannot bypass an opted-in CCM profile',t=>{
 const f=medium(t),g=f.allow(),p=f.passage(g,{purpose:'ccm:I_AB:outbound'});
 assert.throws(()=>f.runtime.admit(p),/CCM_PASSAGE_BINDING_REQUIRED/);
});
test('historical hash cursor is global event order even when another interval changes at the same millisecond',t=>{
 const f=medium(t); const mark=f.query('ShowLineage','I_AC').head;
 f.allow();
 assert.equal(f.query('WhatStands','node-a','node-b',{at:mark}).intervals[0].standing.outbound,'OBSERVE_ONLY');
});
test('historical event cursor excludes later events sharing its timestamp', t=>{
 const f=medium(t), original=globalThis.Date, fixed=original.now();
 globalThis.Date=class extends original {constructor(...args){super(...(args.length?args:[fixed]));}static now(){return fixed;}};
 try {
  f.command('intervals.constitute',f.field_id,[interval('same-time-1'),interval('same-time-2')]);
 }finally{globalThis.Date=original;}
 const at=f.query('ShowLineage','same-time-1').head;
 assert.deepEqual(f.query('WhatStands','node-a','node-b',{at}).intervals.map(x=>x.interval_id),['I_AB','same-time-1']);
});
test('dependency change-and-restore cannot resurrect an old bound passage',t=>{
 const f=medium(t),g=f.allow(),p=f.bind(g); assert.equal(f.query('WhatMayRightfullyFollow','I_AB',p.body).status,'ADMIT');
 f.control('dependency',{name:'corpus',value:'v2'});f.control('dependency',{name:'corpus',value:'v1'});
 assert.equal(f.query('WhatMayRightfullyFollow','I_AB',p.body).status,'HOLD');
 assert.throws(()=>f.operate(p),/DEPENDENCY/);
});
test('source warrants are retrievable and bind reconstructed interval lineage',t=>{
 const f=medium(t);const line=f.query('ShowLineage','I_AB'),ref=line.events[0].warrant_ref;
 const artifact=f.query('SourceArtifact',ref);assert.equal(artifact.status,'KNOWN');assert.equal(hash(artifact.record),ref);
 assert.equal(artifact.record.body.issuer,'I-1');assert.ok(artifact.record.body.data.some(x=>x.interval_id==='I_AB'));
});
test('query admission cannot outlive current node enrollment/revocation',t=>{
 const f=medium(t),g=f.allow(),p=f.bind(g);f.control('node_revocation',{node_id:'node-a'});
 assert.equal(f.query('WhatMayRightfullyFollow','I_AB',p.body).status,'DENY');
});
test('malformed Return observation is rejected before any durable mutation',t=>{
 const f=medium(t),g=f.allow(),p=f.bind(g),before=f.query('ShowLineage','I_AB').head;
 assert.throws(()=>f.returned(p,'I_AB','malformed-witness'),/OBSERVATION_SHAPE/);
 assert.equal(f.query('ShowLineage','I_AB').head,before);f.restart();
 assert.equal(f.query('ShowLineage','I_AB').head,before);
});
test('revoked observer cannot supply new admitted provenance, while later revocation preserves earlier history',t=>{
 const f=medium(t),g=f.allow(),p=f.bind(g),r=f.returned(p);f.orient(r);
 f.control('node_revocation',{node_id:'node-b'});
 const p2=f.bind(g,'I_AB',{target:'second.txt'}),r2=f.returned(p2);
 assert.equal(f.query('WhatChanged',r2).provenance.valid,false);
 assert.throws(()=>f.orient(r2),/OBSERVATION_PROVENANCE/);
 f.restart();assert.equal(f.query('WhatChanged',r).provenance.valid,true);
 assert.equal(f.query('WhatChanged',r).inbound_disposition,'ADMIT');
 assert.equal(f.query('WhatChanged',r2).provenance.valid,false);
});
test('historical projections include authority, refreshed dependency standing, passages and supersession',t=>{
 const f=medium(t),g=f.allow(),allowed=f.query('ShowLineage','I_AB').head;
 assert.equal(f.query('UnderWhoseAuthority','I_AB',{at:allowed}).authority_basis,g.grant_id);
 const p=f.bind(g);assert.equal(f.query('OpenPassages','I_AB',{at:allowed}).passages.length,0);
 assert.equal(f.query('OpenPassages','I_AB').passages.length,1);
 f.control('dependency',{name:'corpus',value:'v2'});
 f.command('dependencies.refresh','I_AB',{interval_id:'I_AB',dependencies:{corpus:'v2'}},{dependencies:{corpus:'v2'}});
 const refreshed=f.query('ShowLineage','I_AB').head;
 assert.equal(f.query('WhatStands','node-a','node-b',{at:refreshed}).intervals[0].standing.outbound,'OBSERVE_ONLY');
 f.command('intervals.constitute',f.field_id,[{...interval('I_NEXT'),dependencies:{corpus:'v2'}}],{dependencies:{corpus:'v2'}});
 f.command('interval.supersede','I_AB',{interval_id:'I_AB',successor_id:'I_NEXT'},{dependencies:{corpus:'v2'}});
 const end=f.query('ShowLineage','I_AB').head;
 const historical=f.query('WhatStands','node-a','node-b',{at:end}).intervals.find(x=>x.interval_id==='I_AB');
 assert.equal(historical.status,'superseded');assert.equal(historical.superseded_by,'I_NEXT');
 f.restart();assert.equal(f.query('WhatStands','node-a','node-b',{at:end}).intervals.find(x=>x.interval_id==='I_AB').status,'superseded');
});
test('explicit crossing is historical admission, not permanently current permission',t=>{
 const f=medium(t),g=f.allow(),p=f.bind(g),r=f.returned(p),payload_ref=f.query('WhatChanged',r).artifact_hash;
 f.command('cross.open','I_AB',{passage_id:'cross-current',source_interval:'I_AB',target_interval:'I_AC',payload_ref,source_ref:r,
 relation_type:'notification',uncertainty:'qualified claim',dependencies:{corpus:'v1'},return_contract:{required:true,to:'I_AB'},
 source_predecessor:f.query('ShowLineage','I_AB').head,target_predecessor:f.query('ShowLineage','I_AC').head});
 f.control('dependency',{name:'corpus',value:'v2'});
 assert.equal(f.query('CrossIntervalAdmissibility','I_AB','I_AC',payload_ref).status,'HOLD');
 assert.equal(f.query('CrossIntervalAdmissibility','I_AB','I_AC',payload_ref).original_disposition,'ADMIT');
});
test('supersession cannot point an interval to itself',t=>{
 const f=medium(t);assert.throws(()=>f.command('interval.supersede','I_AB',{interval_id:'I_AB',successor_id:'I_AB'}),/SUCCESSOR/);
});
