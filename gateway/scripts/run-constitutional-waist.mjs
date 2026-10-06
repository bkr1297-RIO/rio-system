#!/usr/bin/env node
/** Real local CLI/HTTP specimen. Runtime code does not depend on this driver. */
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { createInterface } from 'node:readline';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { generateKeypair, signPayload } from '../security/ed25519.mjs';
import { canonicalizeArgs } from '../security/token-manager.mjs';
import { hash } from '../security/local-field-authority.mjs';
import { verifyLedgerEntries } from '../ledger/ledger.mjs';
import { verifyLocalFieldReceipt, verifyLocalFieldReturn, hashExecution, hashIntent, hashGovernance, hashAuthorization } from '../receipts/receipts.mjs';
import { WAIST_PROFILE } from '../local-field/waist.mjs';

const output=resolve(process.argv[2]||'/tmp/constitutional-waist-evidence.json');
assert.equal(process.argv.length<=3,true,'one output path only');
const work=mkdtempSync(join(tmpdir(),'constitutional-waist-'));
const gateway=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const human=generateKeypair(),a=generateKeypair(),b=generateKeypair(),field_id=randomUUID();
const anchor={principal_id:'I-1',actor_type:'human',primary_role:'root_authority',public_key_hex:human.publicKey};
const stamp=()=>({field_id,record_id:randomUUID(),issued_at:new Date().toISOString(),expires_at:new Date(Date.now()+600000).toISOString()});
const signed=(body,key)=>({body,signature:signPayload(canonicalizeArgs(body),key.secretKey)});
const definition=signed({...stamp(),type:'field',sourcepoint:'I-1',receiver_node:'node-b',
  dependencies:{corpus:'v1','ccm-001':'ccm-001.f0.1','constitutional-waist':WAIST_PROFILE},
  policy:{policy_id:'waist-development',policy_version:'0.1',status:'active',scope:{agents:['node-a'],systems:['local']},
    action_classes:[{class_id:'artifact',pattern:'create_document',governance_decision:'REQUIRE_HUMAN',risk_tier:'LOW'}]}},human);
writeFileSync(join(work,'receiver.key'),b.secretKey,{mode:0o600});
writeFileSync(join(work,'config.json'),JSON.stringify({anchor,definition,receiver_node:'node-b',receiver_key_file:'receiver.key',state_directory:'state'}),{mode:0o600});
let child,url,stderr='';
async function start() {
  child=spawn(process.execPath,['local-field/cli.mjs','serve',join(work,'config.json')],{cwd:gateway,stdio:['ignore','pipe','pipe']});
  child.stderr.on('data',data=>{stderr=(stderr+data).slice(-4096);});
  const lines=createInterface({input:child.stdout});
  url=await new Promise((resolveReady,reject)=>{
    const timeout=setTimeout(()=>reject(new Error('CLI_START_TIMEOUT')),10000);
    child.once('exit',()=>{clearTimeout(timeout);reject(new Error('CLI_START_FAILED: '+stderr));});
    lines.on('line',line=>{try {const v=JSON.parse(line);if(v.status==='LISTENING'){clearTimeout(timeout);resolveReady(v.url);}}catch{}});
  });
}
async function stop() { if(child&&child.exitCode===null){const exit=once(child,'exit');child.kill('SIGTERM');await exit;} }
async function post(path,record) {
  const r=await fetch(url+path,{method:'POST',body:JSON.stringify(record),signal:AbortSignal.timeout(10000)});
  const v=await r.json();if(!r.ok)throw new Error(v.error||`HTTP_${r.status}`);return v;
}
const query=(view,extra={})=>post('/query',signed({...stamp(),type:'query',issuer:'I-1',view,...extra},human));
const ccm=(name,...args)=>query('ccm',{query:name,args});
async function command(operation,subject_ref,data){
  const predecessor_hash=(await ccm('ShowLineage',subject_ref)).head||'0'.repeat(64);
  const dependency_hash=(await ccm('DependencySnapshot',{corpus:'v1'})).hash;
  return post('/control',signed({...stamp(),type:'ccm_command',profile:'ccm-001.f0.1',issuer:'I-1',operation,subject_ref,
    predecessor_hash,dependencies:{corpus:'v1'},dependency_hash,data},human));
}
async function candidate(g,target) {
  const candidate_id=randomUUID();
  await post('/candidates',signed({...stamp(),type:'candidate',source_node:'node-a',candidate_id,kind:'proposal',
    content:{profile:WAIST_PROFILE,interval_id:'I_AB',uncertainty:'Create/readback is not exterior truth or settlement.',
      obligations:['independent-readback','native-return']}},a));
  const payload={content:'Constitutional waist: real bounded development effect.\n'};
  const p=signed({...stamp(),type:'passage',passage_id:randomUUID(),intent_id:randomUUID(),source_node:'node-a',subject:'node-a',
    target_node:'node-b',action:'create_document',target,payload,payload_hash:hash(payload),authority_basis:g.grant_id,
    scope:'artifact-create',purpose:'ccm:I_AB:outbound',dependencies:{corpus:'v1'},conditions:{},nonce:randomUUID(),correlation_id:randomUUID(),
    return_requirement:{required:true,to:'I-1'},origin:{intent:'SourcePoint-authorized development specimen',candidate_id}},a);
  await command('passage.open','I_AB',{interval_id:'I_AB',passage:p});return p;
}
try {
  await start();
  for(const [id,key,role]of[['node-a',a,'proposer'],['node-b',b,'executor']])await post('/control',signed({...stamp(),type:'enrollment',issuer:'I-1',
    node:{node_id:id,node_type:id==='node-a'?'laptop':'local_service',principal_id:id,actor_type:'executor',primary_role:role,secondary_roles:[],
      public_key_hex:key.publicKey,capabilities:['create_document'],interfaces:['http-json'],custody_boundary:id,status:'active'}},human));
  await command('participants.register',field_id,['node-a','node-b'].map(participant_id=>({participant_id,participant_kind:'node',root_lineage:'development:sourcepoint',status:'active'})));
  await command('intervals.constitute',field_id,[{interval_id:'I_AB',endpoint_a:'node-a',endpoint_b:'node-b',relation_type:'ResearchSynthesis',
    scope:{actions:['create_document'],targets:['hello.txt'],inbound_uses:['orientation'],cross_interval_uses:['notification']},
    boundaries:{cross_interval:'EXPLICIT_ONLY'},dependencies:{corpus:'v1'}}]);
  const grant={grant_id:randomUUID(),subject:'node-a',target_node:'node-b',action:'create_document',target:'hello.txt',scope:'artifact-create',
    purpose:'ccm:I_AB:outbound',dependencies:{corpus:'v1'},conditions:{},parent:null,allow_delegation:false,max_uses:1};
  await post('/control',signed({...stamp(),type:'grant',issuer:'I-1',grant},human));
  const p=await candidate(grant,'hello.txt'),denied=await candidate(grant,'outside-interval.txt');
  const hold=await post('/admit',p),deny=await post('/admit',denied);
  assert.equal(hold.disposition,'HOLD');assert.equal(deny.disposition,'DENY');
  const view=p=>query('waist',{passage_id:p.body.passage_id});
  const holdBefore=await view(p),denyBefore=await view(denied);
  assert.equal(holdBefore.actuator,0);assert.equal(denyBefore.actuator,0);
  const probe=await post('/hold',signed({...stamp(),type:'hold_action',source_node:'node-a',passage_id:p.body.passage_id,
    decision_id:hold.decision_id,action:'PROBE'},a));
  assert.equal(probe.consequential,false);
  await command('standing.transition','I_AB',{interval_id:'I_AB',outbound:'ELIGIBLE',authority_basis:grant.grant_id});
  assert.equal((await view(p)).latest.disposition,'HOLD');
  const admit=await post('/admit',p);assert.equal(admit.disposition,'ADMIT');assert.notEqual(admit.decision_id,hold.decision_id);
  const commitment=await post('/control',signed({...stamp(),type:'invocation_commit',issuer:'I-1',passage_id:p.body.passage_id,
    passage_hash:hash(p.body),decision_id:admit.decision_id},human));
  const execution=await post('/invoke',signed({...stamp(),type:'invocation',source_node:'node-a',passage_id:p.body.passage_id,
    passage_hash:hash(p.body),commitment_id:commitment.commitment_id,passage:p},a));
  assert.equal(execution.status,'COMPLETED');const unobserved=await view(p);
  assert.equal(unobserved.occurrence,null);assert.equal(unobserved.observation,null);assert.equal(unobserved.return,null);
  const readback=readFileSync(join(work,'state','artifacts','hello.txt'),'utf8');assert.equal(readback,p.body.payload.content);
  const returned=await post('/observe',signed({...stamp(),type:'observation_request',source_node:'node-a',passage_id:p.body.passage_id,execution_id:execution.execution_id},a));
  assert.equal(returned.outcome,'OBSERVED');const trace=await view(p),chain=await query('native',{passage_id:p.body.passage_id}),ledger=await query('ledger');
  assert.equal(verifyLedgerEntries(ledger).valid,true);
  assert.equal(verifyLocalFieldReceipt(chain.receipt,b.publicKey,{field_id,passage_id:p.body.passage_id,signer_id:'node-b'}),true);
  assert.equal(verifyLocalFieldReturn(returned,b.publicKey,{field_id,signer_id:'node-b'}),true);
  const artifacts=chain.receipt_artifacts;
  for(const [name,fn]of[['intent',hashIntent],['governance',hashGovernance],['authorization',hashAuthorization],['execution',hashExecution]])
    assert.equal(chain.receipt.hash_chain[name+'_hash'],fn(artifacts[name]));
  const observation=signed({...stamp(),type:'ccm_observation',source_node:'node-b',interval_id:'I_AB',passage_id:p.body.passage_id,
    subject_hash:hash(p.body),occurrence_ref:chain.occurrence.occurrence_id,content_hash:chain.occurrence.content_hash,
    uncertainty:'Receiver readback witness; truth and settlement remain independently unestablished'},b);
  const custodyReturnId=randomUUID();
  await command('return.capture','I_AB',{interval_id:'I_AB',passage_id:p.body.passage_id,return_id:custodyReturnId,observation});
  const custody=await ccm('WhatChanged',custodyReturnId),lineageBefore=await ccm('ShowLineage','I_AB');
  assert.equal(custody.status,'KNOWN');assert.equal(custody.provenance.valid,true);
  assert.equal(custody.inbound_disposition,'UNASSESSED');assert.equal(custody.home_mutation,'NOT_INVOKED');
  const beforeHash=hash(trace);await stop();await start();assert.equal(hash(await view(p)),beforeHash);
  assert.equal((await ccm('ShowLineage','I_AB')).head,lineageBefore.head);
  assert.equal((await view(denied)).latest.decision_id,deny.decision_id);
  const result={profile:WAIST_PROFILE,predecessor:'fc9c9382f3420691c94c8ec9f9a16be15495d3bb',status:'PASS_WITH_RECORDED_SCOPE_LIMITS',
    runtime:process.version,platform:process.platform,field_id,public_keys:{sourcepoint:human.publicKey,source_node:a.publicKey,receiver:b.publicKey},
    definition,examples:{hold_probe_repair_admit:{hold_before:holdBefore,probe,admit,commitment,execution_before_observation:unobserved,completed:trace},
      deny_no_actuation:denyBefore,compress:{hold:{decision_id:hold.decision_id,disposition:'HOLD',actuator:0},deny:{decision_id:deny.decision_id,disposition:'DENY',actuator:0},
        conclusion:'Actuator equivalence does not imply constitutional equivalence'}},
    native_chain:chain,ledger:await query('ledger'),ccm_return_custody:{return_id:custodyReturnId,custody,observation,lineage:lineageBefore},
    effect:{actual:true,method:'create-only filesystem + separate descriptor read',content:readback,content_hash:hash({content:readback}),
      transient_artifact_removed_after_run:true},verification:{ledger:true,receipt:true,return:true,all_four_receipt_hashes:true,restart_reconstruction:true},
    claim_ceiling:'Bounded Linux LocalField profile; no physical embodiment, exterior truth, Evidence, Settlement, HOME mutation or successor admission'};
  mkdirSync(dirname(output),{recursive:true});writeFileSync(output,JSON.stringify(result,null,2)+'\n');
  console.log(JSON.stringify({status:result.status,output,passage_id:p.body.passage_id,hold_decision:hold.decision_id,admit_decision:admit.decision_id,
    deny_decision:deny.decision_id,receipt_id:chain.receipt.receipt_id,return_id:returned.return_id,restart_reconstruction:true}));
} finally {await stop();rmSync(work,{recursive:true,force:true});}
