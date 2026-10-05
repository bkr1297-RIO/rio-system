// Development-only specimen construction. Runtime core does not import this module.
import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';
import { statSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { medium, participant, interval } from './helpers.mjs';
import { hash } from '../../security/local-field-authority.mjs';
export function populated(t, participants, intervals) {
 const f=medium(t), ids=['node-a','node-b','node-c',...Array.from({length:participants-3},(_,i)=>`participant-${i}`)];
 const start=performance.now();
 for(let i=3;i<ids.length;i+=128)f.command('participants.register',f.field_id,ids.slice(i,i+128).map(participant));
 const targets=ids.slice(1);
 for(let i=0;i<intervals-2;i+=128){
  const xs=Array.from({length:Math.min(128,intervals-2-i)},(_,j)=>interval(i+j===0?'I_AB_OBSERVE':i+j===1?'I_BC':`scale-${i+j}`,i+j===1?'node-b':'node-a',i+j===0?'node-b':i+j===1?'node-c':targets[(i+j)%targets.length]));
  f.command('intervals.constitute',f.field_id,xs);
 }
 const write_ms=performance.now()-start;
 const samples=[];let count=0;
 for(const target of targets)count+=f.query('WhatStands','node-a',target).intervals.length;
 count+=f.query('WhatStands','node-b','node-c').intervals.length;assert.equal(count,intervals);
 for(let i=0;i<1000;i++){const at=performance.now();f.query('WhatStands','node-a',targets[i%targets.length]);samples.push(performance.now()-at);}
 samples.sort((a,b)=>a-b);
 const lineage_at=performance.now(); const line=f.query('ShowLineage','I_AB');assert.ok(line.head);const lineage_ms=performance.now()-lineage_at;
 const storage=()=>['field.sqlite','field.sqlite-wal','field.sqlite-shm'].reduce((n,p)=>n+(existsSync(join(f.root,p))?statSync(join(f.root,p)).size:0),0);
 const metrics={participants,active_intervals:intervals,interval_constitution_ms:write_ms,ledger_interval_writes_per_second:(intervals-2)/(write_ms/1000),
  query_ms:{p50:samples[500],p95:samples[950],p99:samples[990],samples:1000},lineage_reconstruction_ms:lineage_ms,sqlite_bytes:storage(),
  memory_rss_bytes:process.memoryUsage().rss,resource_budgets:{command_bytes:65536,batch_items:128,query_samples:1000},root_mode:'DEVELOPMENT_KEYS_ONLY'};
 return {f,ids,metrics,storage};
}
export function hostileControls(f) {
 const cases=[];const run=(id_,fn)=>{fn();cases.push({id:id_,status:'PASS'});};
 let g,p,r;
 run('H-01',()=>{
  g=f.allow();p=f.bind(g);assert.equal(f.query('WhatMayRightfullyFollow','I_AB',p.body).status,'ADMIT');f.operate(p);
  const g2=f.grant({purpose:'ccm:I_AB_OBSERVE:outbound'}),p2=f.bind(g2,'I_AB_OBSERVE');
  assert.equal(hash(p2.body.payload),hash(p.body.payload));assert.throws(()=>f.operate(p2),/INTERVAL_OBSERVE_ONLY/);
  r=f.returned(p);f.orient(r);assert.equal(f.query('WhatChanged',r).inbound_disposition,'ADMIT');
 });
 run('H-02',()=>{
  const payload_ref=f.query('WhatChanged',r).artifact_hash;
  f.command('cross.open','I_AB',{passage_id:'scale-cross',source_interval:'I_AB',target_interval:'I_AC',payload_ref,source_ref:r,
   relation_type:'notification',uncertainty:'qualified, not established truth',dependencies:{corpus:'v1'},return_contract:{required:true,to:'I_AB'},
   source_predecessor:f.query('ShowLineage','I_AB').head,target_predecessor:f.query('ShowLineage','I_AC').head});
  assert.equal(f.query('CrossIntervalAdmissibility','I_AB','I_AC',payload_ref).status,'ADMIT');
  assert.equal(f.query('WhatStands','node-a','node-c').intervals.find(i=>i.interval_id==='I_AC').standing.outbound,'OBSERVE_ONLY');
 });
 run('H-03',()=>{const revoked=f.allow(),candidate=f.bind(revoked);f.control('revocation',{grant_id:revoked.grant_id});assert.throws(()=>f.operate(candidate),/AUTHORITY_REVOKED/);});
 run('H-04',()=>{
  const a=f.bind(g),b=f.bind(g),rb=f.returned(b),ra=f.returned(a);
  assert.equal(f.query('WhatChanged',rb).passage_id,b.body.passage_id);assert.equal(f.query('WhatChanged',ra).passage_id,a.body.passage_id);
 });
 let illegalReturn;
 run('H-05',()=>{
  const bad=f.grant({purpose:'ccm:I_AB_OBSERVE:outbound'}),candidate=f.bind(bad,'I_AB_OBSERVE');
  assert.throws(()=>f.operate(candidate),/INTERVAL_OBSERVE_ONLY/);
  writeFileSync(join(f.root,'external-unlawful.txt'),candidate.body.payload.content);
  const witness=f.witness(candidate,'I_AB_OBSERVE',{occurrence_ref:'development:external-unlawful.txt',content_hash:hash({content:readFileSync(join(f.root,'external-unlawful.txt'),'utf8')})});
  illegalReturn=f.returned(candidate,'I_AB_OBSERVE',witness);f.orient(illegalReturn,'I_AB_OBSERVE');
  const view=f.query('WhatChanged',illegalReturn);assert.equal(view.outbound_disposition,'DENY');assert.equal(view.inbound_disposition,'ADMIT');assert.equal(view.truth_status,'UNESTABLISHED');
 });
 let badEvidenceReturn,neitherReturn;
 run('DOUBLE_ARROW_NEITHER',()=>{
  const denied=f.grant({purpose:'ccm:I_AB_OBSERVE:outbound'}),candidate=f.bind(denied,'I_AB_OBSERVE');assert.throws(()=>f.operate(candidate),/INTERVAL_OBSERVE_ONLY/);
  const obs=f.witness(candidate,'I_AB_OBSERVE');obs.signature='00'.repeat(64);neitherReturn=f.returned(candidate,'I_AB_OBSERVE',obs);f.orient(neitherReturn,'I_AB_OBSERVE','HOLD');
  const x=f.query('WhatChanged',neitherReturn);assert.equal(x.outbound_disposition,'DENY');assert.equal(x.inbound_disposition,'HOLD');
 });
 run('H-06',()=>{
  const lawful=f.allow('I_AB',{target:'lawful.txt'}),candidate=f.bind(lawful,'I_AB',{target:'lawful.txt'});f.operate(candidate);
  const witness=f.witness(candidate);witness.signature='00'.repeat(64);badEvidenceReturn=f.returned(candidate,'I_AB',witness);
  assert.throws(()=>f.orient(badEvidenceReturn),/OBSERVATION_PROVENANCE/);f.orient(badEvidenceReturn,'I_AB','HOLD');
  assert.equal(f.query('WhatChanged',badEvidenceReturn).outbound_disposition,'ADMIT');
 });
 run('H-07',()=>{assert.equal(hash(p.body.payload),hash(f.passage(g).body.payload));assert.equal(f.query('WhatChanged',illegalReturn).outbound_disposition,'DENY');});
 run('H-08',()=>assert.throws(()=>f.command('context.copy','I_AC',{source_interval:'I_AB'}),/CCM_OPERATION/));
 run('H-09',()=>assert.throws(()=>f.command('standing.transition','I_AC',{interval_id:'I_AC',outbound:'ELIGIBLE',authority_basis:g.grant_id}),/CCM_INTERVAL_AUTHORITY/));
 run('H-11',()=>assert.throws(()=>f.command('receipt.rewrite','I_AB',{disposition:'ADMIT'}),/CCM_OPERATION/));
 run('H-12',()=>assert.throws(()=>f.command('passage.open','I_AC',{interval_id:'I_AC',passage:p}),/CCM_INTERVAL_SUBJECT/));
 run('NETWORK_POSITION',()=>{
  assert.throws(()=>f.command('standing.transition','I_BC',{interval_id:'I_BC',outbound:'ELIGIBLE',authority_basis:g.grant_id}),/CCM_INTERVAL_AUTHORITY/);
  assert.equal(f.query('WhatStands','node-b','node-c').intervals[0].standing.outbound,'OBSERVE_ONLY');
 });
 run('H-10',()=>{
  const fresh=f.allow(),candidate=f.bind(fresh);f.runtime.admit(candidate);const at=performance.now();
  f.control('dependency',{name:'corpus',value:'v2'});assert.throws(()=>f.runtime.execute(candidate.body.passage_id,candidate),/DEPENDENCY/);
  cases.push({id:'STALE_DETECTION',status:'PASS',latency_ms:performance.now()-at});
 });
 return {cases,examples:{
  WhatStands:f.query('WhatStands','node-a','node-b').intervals.filter(i=>['I_AB','I_AB_OBSERVE'].includes(i.interval_id)),
  WhyDoesItStand:f.query('WhyDoesItStand','I_AB'),UnderWhoseAuthority:f.query('UnderWhoseAuthority','I_AB'),
  OpenPassages:f.query('OpenPassages','I_AC'),WhatMayRightfullyFollow:f.query('WhatMayRightfullyFollow','I_AB',p.body),
  ShowLineage:f.query('ShowLineage','I_AB'),source_warrants:[...new Set(f.query('ShowLineage','I_AB').events.map(e=>e.warrant_ref))].map(ref=>({ref,...f.query('SourceArtifact',ref)})),
  native_proof:f.runtime.inspect(p.body.passage_id),native_proof_verification:f.runtime.verify(p.body.passage_id),anchor:f.anchor,field_definition:f.definition,WhatChanged:f.query('WhatChanged',r),
  CrossIntervalAdmissibility:f.query('CrossIntervalAdmissibility','I_AB','I_AC',f.query('WhatChanged',r).artifact_hash),
  double_arrow:{lawful_supported:f.query('WhatChanged',r),unlawful_supported:f.query('WhatChanged',illegalReturn),lawful_unsupported:f.query('WhatChanged',badEvidenceReturn),unlawful_unsupported:f.query('WhatChanged',neitherReturn)}
 }};
}
