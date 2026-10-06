import { randomUUID } from 'node:crypto';
import { canonicalizeArgs } from '../../security/token-manager.mjs';
import { hash, requireValue as demand, fresh, verifySigned, verifyNodeRecord, resolveGrant } from '../../security/local-field-authority.mjs';
import { PROFILE, ZERO, LIMITS, EVENTS, exact, id, digest, dependencies, Participant, ConstitutedInterval } from './types.mjs';

const copy = x => structuredClone(x);
const pair = (a,b) => JSON.stringify([a,b]);
const eventHash = e => { const {event_hash,...body}=e; return hash(body); };
const rootKeys = ['field_id','record_id','issued_at','expires_at','type','profile','issuer','operation','subject_ref','predecessor_hash','dependencies','dependency_hash','data'];

/** A LocalField profile/view. Native root, ledger, policy, grants and execution remain owners. */
export class ConstitutionalMedium {
 #store; #field; #anchor; #rootCheck; #inspect; #verify; #preflight;
 #dependencyValues; #dependencyRevisions = {}; #revocations = new Map(); #ledgerPositions = new Map();
 #ordinals = new Map(); #events = new Map(); #commands = new Map(); #heads = new Map(); #lineage = new Map();
 #participants = new Map(); #intervals = new Map(); #pairs = new Map();
 #passages = new Map(); #returns = new Map(); #crossings = new Map();
 constructor({store,field,anchor,rootCheck,inspect,verify,preflight}) {
  this.#store=store;this.#field=field;this.#anchor=anchor;
  this.#rootCheck=rootCheck; this.#inspect=inspect; this.#verify=verify; this.#preflight=preflight;
  demand(field.dependencies['ccm-001']===PROFILE,'CCM_PROFILE');
  this.#replay();
 }
 #replay() {
  const commands=new Map(this.#store.all('ccm_command').map(r=>[hash(r),r]));
  const events=this.#store.all('ccm_event');
  const native=this.#store.ledger();
  this.#dependencyValues=copy(this.#field.dependencies);
  const dependencyNonces=new Set();
  for(const [position,entry] of native.entries()) {
   if(entry.action==='dependency'){
    const r=JSON.parse(entry.detail);demand(!dependencyNonces.has(r.body.record_id),'CCM_DEPENDENCY_REPLAY');dependencyNonces.add(r.body.record_id);
    fresh(r.body,Date.parse(entry.timestamp));this.dependencyChanged(r,false);
   }
   if(entry.action==='revocation'){
    const r=JSON.parse(entry.detail);
    if(r.body.type==='node_revocation'){
     verifySigned(r,this.#anchor.public_key_hex);demand(r.body.issuer===this.#anchor.principal_id&&r.body.field_id===this.#field.field_id,'CCM_REVOCATION_CUSTODY');
     if(!this.#revocations.has(r.body.node_id))this.#revocations.set(r.body.node_id,[]);
     this.#revocations.get(r.body.node_id).push(position);
    }
   }
   if(entry.action==='ccm_event')this.#ledgerPositions.set(JSON.parse(entry.detail).event_hash,position);
  }
  const ledger=native.filter(e=>e.action==='ccm_event');
  demand(events.length===ledger.length,'CCM_LEDGER_CUSTODY');
  for(const r of commands.values()) {
   exact(r.body,rootKeys,'CCM_COMMAND_FIELDS');
   demand(r.body.type==='ccm_command'&&EVENTS[r.body.operation]&&r.body.profile===PROFILE&&r.body.field_id===this.#field.field_id&&r.body.issuer===this.#anchor.principal_id,'CCM_ROOT_REQUIRED');
   verifySigned(r,this.#anchor.public_key_hex); this.#commands.set(hash(r),r);
  }
  const used=new Set(),nonces=new Set();
  for(let i=0;i<events.length;) {
   const first=events[i],r=commands.get(first.warrant_ref),b=r?.body;
   demand(b,'CCM_EVENT_SOURCE');demand(!used.has(first.warrant_ref)&&!nonces.has(b.record_id),'CCM_COMMAND_REPLAY');
   used.add(first.warrant_ref);nonces.add(b.record_id);
   demand(b.predecessor_hash===(this.#heads.get(b.subject_ref)||ZERO),'CCM_EVENT_PREDECESSOR');
   const expected=Array.isArray(b.data)?[
    ...b.data.map((d,item_index)=>({subject_ref:d.interval_id||d.participant_id,data:d,item_index,event_type:EVENTS[b.operation],previous_hash:ZERO})),
    {subject_ref:b.subject_ref,data:{operation:b.operation,count:b.data.length},item_index:null,event_type:'CommandRecorded',previous_hash:b.predecessor_hash}
   ]:[{subject_ref:b.subject_ref,data:b.data,item_index:null,event_type:EVENTS[b.operation],previous_hash:b.predecessor_hash},
    ...(b.operation==='cross.open'?[{subject_ref:b.data.target_interval,data:b.data,item_index:null,event_type:EVENTS[b.operation],previous_hash:b.data.target_predecessor}]:[])];
   for(const wanted of expected){
   const e=events[i];demand(e&&e.warrant_ref===first.warrant_ref,'CCM_EVENT_SOURCE');
   demand(hash(e)===hash(JSON.parse(ledger[i].detail))&&e.event_hash===eventHash(e),'CCM_EVENT_INTEGRITY');
   demand(e.subject_ref===wanted.subject_ref&&e.event_type===wanted.event_type&&e.item_index===wanted.item_index&&hash(e.data)===hash(wanted.data),'CCM_EVENT_SOURCE');
   demand(e.previous_hash===wanted.previous_hash,'CCM_EVENT_PREDECESSOR');
   fresh(b,Date.parse(e.created_at));demand(e.dependency_hash===b.dependency_hash,'CCM_EVENT_DEPENDENCY');
   demand(e.previous_hash===(this.#heads.get(e.subject_ref)||ZERO),'CCM_EVENT_PREDECESSOR');
   if(e.event_type==='ReturnOpened')this.#nativeReturn(e.data.passage_id);
   if(e.event_type==='JudgmentRecorded'&&e.data.disposition==='ADMIT')demand(this.#returns.get(e.data.return_id)?.provenance.valid,'CCM_OBSERVATION_PROVENANCE');
   this.#project(e);
   i++;
   }
  }
  demand(used.size===commands.size,'CCM_COMMAND_CUSTODY');
  for(const [name,value] of Object.entries(this.#dependencyValues))demand(this.#store.state('dependency',name)===value,'CCM_DEPENDENCY_CUSTODY');
 }
 dependencyChanged(record,checkState=true) {
  const b=record?.body;demand(b?.type==='dependency'&&b.field_id===this.#field.field_id&&b.issuer===this.#anchor.principal_id,'CCM_DEPENDENCY_CUSTODY');
  verifySigned(record,this.#anchor.public_key_hex);
  demand(typeof b.name==='string'&&typeof b.value==='string','CCM_DEPENDENCY_CUSTODY');
  if(checkState)demand(this.#store.state('dependency',b.name)===b.value,'CCM_DEPENDENCY_CUSTODY');
  this.#dependencyValues[b.name]=b.value;this.#dependencyRevisions[b.name]=b.record_id;
 }
 #nativeReturn(passageId){demand(this.#verify(passageId).valid,'CCM_NATIVE_RETURN_INVALID');}
 #snapshot(deps) {
  dependencies(deps);const revisions={},values={};
  for(const name of Object.keys(deps).sort()){
   values[name]=this.#dependencyValues[name]??null;
   demand(this.#store.state('dependency',name)===values[name],'CCM_DEPENDENCY_CUSTODY');
   revisions[name]=this.#dependencyRevisions[name]||this.#field.record_id;
  }
  return {values,revisions,hash:hash({values,revisions})};
 }
 #currentInterval(x) {
  this.#current(x.dependencies);
  demand(x.dependency_hash===this.#snapshot(x.dependencies).hash,'CCM_DEPENDENCY_REVISION_CHANGED');
 }
 #current(deps) {
  dependencies(deps);
  for(const [k,v] of Object.entries(deps))demand(this.#store.state('dependency',k)===v,'CCM_DEPENDENCY_CHANGED');
 }
 #interval(id_) { const x=this.#intervals.get(id_);demand(x&&x.status==='active','CCM_INTERVAL_UNKNOWN_OR_SUPERSEDED');return x; }
 #scopeGrant(x, grantId) {
  const g=this.#store.get('grant',grantId)?.body?.grant;
  demand(g,'AUTHORITY_MISSING');
  demand(g.subject===x.endpoint_a&&g.target_node===x.endpoint_b&&g.purpose===`ccm:${x.interval_id}:outbound`,'CCM_INTERVAL_AUTHORITY');
  demand(x.scope.actions.includes(g.action)&&x.scope.targets.includes(g.target),'CCM_INTERVAL_SCOPE');
  resolveGrant(this.#store,grantId,g,this.#anchor,this.#field.field_id);
  return g;
 }
 #observation(r, intervalId, passage, at=Date.now(),position=null) {
  try {
   const b=r?.body;
   demand(b?.type==='ccm_observation' && b.field_id===this.#field.field_id&&b.interval_id===intervalId&&
    b.passage_id===passage.body.passage_id&&b.subject_hash===hash(passage.body),'CCM_OBSERVATION_SUBJECT');
   const enrollment=this.#store.get('enrollment',b.source_node),node=enrollment?.body?.node;
   demand(node&&node.node_id!==passage.body.source_node,'CCM_OBSERVATION_SOURCE');
   verifySigned(enrollment,this.#anchor.public_key_hex);fresh(enrollment.body,at);
   demand(position===null?!this.#store.state('node_revoked',b.source_node):!(this.#revocations.get(b.source_node)||[]).some(p=>p<=position),'NODE_REVOKED');
   verifySigned(r,node.public_key_hex); fresh(b,at);
   digest(b.content_hash); demand(typeof b.occurrence_ref==='string'&&b.occurrence_ref.length>0&&typeof b.uncertainty==='string','CCM_OBSERVATION_BURDEN');
   return {valid:true,reason:null};
  }catch(e){return {valid:false,reason:e.message};}
 }
 #validate(b) {
  const d=b.data, op=b.operation;
  if(op==='participants.register'){
   demand(b.subject_ref===this.#field.field_id&&Array.isArray(d)&&d.length>0&&d.length<=LIMITS.batch_items,'CCM_BATCH');
   const seen=new Set();for(const p of d){Participant(p);demand(!seen.has(p.participant_id)&&!this.#participants.has(p.participant_id),'CCM_PARTICIPANT_EXISTS');seen.add(p.participant_id);}
   return;
  }
  if(op==='intervals.constitute'){
   demand(b.subject_ref===this.#field.field_id&&Array.isArray(d)&&d.length>0&&d.length<=LIMITS.batch_items,'CCM_BATCH');
   const seen=new Set();for(const x of d){ConstitutedInterval(x);demand(!seen.has(x.interval_id)&&!this.#intervals.has(x.interval_id),'CCM_INTERVAL_EXISTS');
    demand(this.#participants.has(x.endpoint_a)&&this.#participants.has(x.endpoint_b),'CCM_PARTICIPANT_UNKNOWN');this.#current(x.dependencies);demand(hash(x.dependencies)===hash(b.dependencies),'CCM_DEPENDENCY_BINDING');seen.add(x.interval_id);}
   return;
  }
  const x=this.#interval(b.subject_ref);if(op!=='dependencies.refresh')this.#currentInterval(x);
  if(!['dependencies.refresh','cross.open'].includes(op))demand(hash(b.dependencies)===hash(x.dependencies),'CCM_DEPENDENCY_BINDING');
  if(op==='dependencies.refresh'){
   exact(d,['interval_id','dependencies'],'CCM_DEPENDENCY_FIELDS');demand(d.interval_id===x.interval_id,'CCM_INTERVAL_SUBJECT');this.#current(d.dependencies);
   demand(hash(d.dependencies)===hash(b.dependencies),'CCM_DEPENDENCY_BINDING');
  }else if(op==='standing.transition'){
   exact(d,['interval_id','outbound','authority_basis'],'CCM_STANDING_FIELDS');
   demand(d.interval_id===x.interval_id,'CCM_INTERVAL_SUBJECT');
   demand(['OBSERVE_ONLY','ELIGIBLE'].includes(d.outbound),'CCM_STANDING');
   if(d.outbound==='ELIGIBLE')this.#scopeGrant(x,d.authority_basis);
   else demand(d.authority_basis===null,'CCM_STANDING');
  }else if(op==='passage.open'){
   exact(d,['interval_id','passage'],'CCM_PASSAGE_FIELDS');const p=d.passage?.body;
   demand(d.interval_id===x.interval_id&&p?.purpose===`ccm:${x.interval_id}:outbound`&&p.source_node===x.endpoint_a&&p.target_node===x.endpoint_b,'CCM_INTERVAL_SUBJECT');
   verifyNodeRecord(this.#store,d.passage,this.#field.field_id); id(p.passage_id);
   demand(p.subject===p.source_node&&p.payload_hash===hash(p.payload),'CCM_PASSAGE_BINDING');
   demand(!this.#passages.has(p.passage_id),'CCM_PASSAGE_EXISTS');
  }else if(op==='return.capture'){
   exact(d,['interval_id','passage_id','return_id','observation'],'CCM_RETURN_FIELDS');
   const p=this.#passages.get(d.passage_id);
   demand(d.interval_id===x.interval_id&&p?.interval_id===x.interval_id,'CCM_RETURN_SUBJECT'); id(d.return_id);
   demand(!this.#returns.has(d.return_id)&&![...x.returns].some(r=>this.#returns.get(r).passage_id===d.passage_id),'CCM_RETURN_EXISTS');
   demand(d.observation&&typeof d.observation==='object'&&!Array.isArray(d.observation),'CCM_OBSERVATION_SHAPE');hash(d.observation);
   this.#nativeReturn(d.passage_id);
  }else if(op==='orientation.judge'){
   exact(d,['interval_id','return_id','disposition','declared_use','reason'],'CCM_JUDGMENT_FIELDS');
   const r=this.#returns.get(d.return_id);
   demand(d.interval_id===x.interval_id&&r?.interval_id===x.interval_id,'CCM_RETURN_SUBJECT');
   demand(['ADMIT','HOLD','DENY'].includes(d.disposition)&&typeof d.reason==='string'&&d.reason.length>0,'CCM_JUDGMENT');
   demand(x.scope.inbound_uses.includes(d.declared_use),'CCM_INBOUND_SCOPE');
   demand(r.inbound_disposition==='UNASSESSED','CCM_JUDGMENT_IMMUTABLE');
   if(d.disposition==='ADMIT')demand(r.provenance.valid,'CCM_OBSERVATION_PROVENANCE');
  }else if(op==='cross.open'){
   exact(d,['passage_id','source_interval','target_interval','payload_ref','source_ref','relation_type','uncertainty','dependencies','return_contract','source_predecessor','target_predecessor'],'CCM_CROSS_FIELDS');
   const target=this.#interval(d.target_interval),r=this.#returns.get(d.source_ref);
   id(d.passage_id);digest(d.payload_ref);this.#current(d.dependencies);this.#currentInterval(target);
   demand(hash(d.dependencies)===hash(b.dependencies),'CCM_DEPENDENCY_BINDING');
   for(const endpoint of [x,target])for(const [k,v] of Object.entries(endpoint.dependencies))demand(d.dependencies[k]===v,'CCM_DEPENDENCY_BINDING');
   demand(d.source_interval===x.interval_id&&target.interval_id!==x.interval_id,'CCM_CROSS_SUBJECT');
   demand(r?.interval_id===x.interval_id&&hash(r.artifact)===d.payload_ref,'CCM_CROSS_PROVENANCE');
   demand(x.scope.cross_interval_uses.includes(d.relation_type)&&target.scope.cross_interval_uses.includes(d.relation_type),'CCM_CROSS_SCOPE');
   demand(d.source_predecessor===this.#heads.get(x.interval_id)&&d.target_predecessor===this.#heads.get(target.interval_id),'CCM_CROSS_PREDECESSOR');
   demand(typeof d.uncertainty==='string'&&d.return_contract?.required===true&&d.return_contract.to===x.interval_id,'CCM_CROSS_RETURN_BURDEN');
   demand(!this.#crossings.has(d.passage_id),'CCM_CROSS_EXISTS');
  }else if(op==='interval.supersede'){
   exact(d,['interval_id','successor_id'],'CCM_SUCCESSOR_FIELDS');demand(d.interval_id===x.interval_id&&d.successor_id!==x.interval_id&&this.#intervals.get(d.successor_id)?.status==='active','CCM_SUCCESSOR');
  }
 }
 apply(record) {
  canonicalizeArgs(record);demand(Buffer.byteLength(JSON.stringify(record))<=LIMITS.command_bytes,'CCM_RESOURCE_LIMIT');record=copy(record);
  const b=this.#rootCheck(record);demand(b.issuer===this.#anchor.principal_id,'CCM_ROOT_REQUIRED');
  exact(b,rootKeys,'CCM_COMMAND_FIELDS');
  demand(b.type==='ccm_command'&&b.profile===PROFILE&&EVENTS[b.operation],'CCM_OPERATION');
  id(b.subject_ref);digest(b.predecessor_hash);digest(b.dependency_hash);this.#current(b.dependencies);
  demand(b.dependency_hash===this.#snapshot(b.dependencies).hash,'CCM_DEPENDENCY_REVISION_CHANGED');
  demand(this.#store.state('dependency','ccm-001')===PROFILE,'CCM_PROFILE_CHANGED');fresh(this.#field);
  demand(b.predecessor_hash===(this.#heads.get(b.subject_ref)||ZERO),'CCM_PREDECESSOR');
  this.#validate(b);
  const warrant_ref=hash(record), events=[],heads=new Map();
  const emit=(subject_ref,event_type,data,item_index=null)=>{
   const e={profile:PROFILE,event_id:randomUUID(),event_type,subject_ref,warrant_ref,item_index,data,
    previous_hash:heads.get(subject_ref)||this.#heads.get(subject_ref)||ZERO,dependency_hash:b.dependency_hash,created_at:new Date().toISOString()};
   e.event_hash=eventHash(e);heads.set(subject_ref,e.event_hash);events.push(e);
  };
  if(Array.isArray(b.data)){
   b.data.forEach((d,i)=>emit(d.interval_id||d.participant_id,EVENTS[b.operation],d,i));
   emit(b.subject_ref,'CommandRecorded',{operation:b.operation,count:b.data.length});
  }else{
   emit(b.subject_ref,EVENTS[b.operation],b.data);
   if(b.operation==='cross.open')emit(b.data.target_interval,EVENTS[b.operation],b.data);
  }
  this.#store.transaction(()=>{
   this.#store.useNonce('ccm_command',b.record_id);this.#store.insert('ccm_command',warrant_ref,record);
   for(const e of events){this.#store.insert('ccm_event',e.event_id,e);this.#store.append({intent_id:e.event_id,action:'ccm_event',agent_id:b.issuer,status:e.event_type,detail:JSON.stringify(e)});}
  });
  this.#commands.set(warrant_ref,record);for(const e of events)this.#project(e);
  return {status:'RECORDED',warrant_ref,event_refs:events.map(e=>e.event_hash),authority_effect:'no_new_authority'};
 }
 #project(e) {
  this.#ordinals.set(e.event_hash,this.#events.size);this.#events.set(e.event_hash,e);this.#heads.set(e.subject_ref,e.event_hash);
  if(!this.#lineage.has(e.subject_ref))this.#lineage.set(e.subject_ref,[]);this.#lineage.get(e.subject_ref).push(e.event_hash);
  const d=e.data;
  switch(e.event_type){
   case 'ParticipantRegistered':this.#participants.set(d.participant_id,d);break;
   case 'IntervalConstituted':{
    const x={...d,standing:{outbound:'OBSERVE_ONLY',inbound:'UNASSESSED'},authority_source:this.#anchor.principal_id,
     authority_basis:null,dependency_hash:e.dependency_hash,constituted_by:e.warrant_ref,lineage_head:e.event_hash,open_passages:[],returns:[],residue:[],status:'active',created_at:e.created_at,superseded_by:null};
    this.#intervals.set(d.interval_id,x);const k=pair(d.endpoint_a,d.endpoint_b);if(!this.#pairs.has(k))this.#pairs.set(k,[]);this.#pairs.get(k).push(d.interval_id);break;
   }
   case 'DependencyChanged':{const x=this.#intervals.get(d.interval_id);x.dependencies=d.dependencies;x.dependency_hash=e.dependency_hash;x.standing.outbound='OBSERVE_ONLY';x.authority_basis=null;break;}
   case 'StandingAdmitted':{const x=this.#intervals.get(d.interval_id);x.standing.outbound=d.outbound;x.authority_basis=d.authority_basis;break;}
   case 'PassageOpened':{this.#passages.set(d.passage.body.passage_id,{...d,opened_by:e.warrant_ref});this.#intervals.get(d.interval_id).open_passages.push(d.passage.body.passage_id);break;}
   case 'ReturnOpened':{
    const p=this.#passages.get(d.passage_id), provenance=this.#observation(d.observation,d.interval_id,p.passage,Date.parse(e.created_at),this.#ledgerPositions.get(e.event_hash)??null);
    const artifact={return_id:d.return_id,passage_id:d.passage_id,occurrence_ref:d.observation?.body?.occurrence_ref||null,
     witness_refs:[],observation_refs:[hash(d.observation||{})],evidence_refs:[],residue:['Attribution is not truth; independent evidence and settlement are not inferred'],
     lineage_hash:e.previous_hash,returned_at:e.created_at};
    this.#returns.set(d.return_id,{...d,artifact,provenance,inbound_disposition:'UNASSESSED',judgment_ref:null});
    this.#intervals.get(d.interval_id).returns.push(d.return_id);break;
   }
   case 'JudgmentRecorded':{
    const r=this.#returns.get(d.return_id);r.inbound_disposition=d.disposition;r.judgment_ref=e.warrant_ref;
    this.#intervals.get(d.interval_id).standing.inbound=d.disposition==='ADMIT'?'SUPPORTED_FOR_DECLARED_USE':d.disposition;
    break;
   }
   case 'CrossIntervalPassageOpened':{
    this.#crossings.set(d.passage_id,{...d,warrant_ref:e.warrant_ref,dependency_hash:e.dependency_hash});const x=this.#intervals.get(e.subject_ref);
    if(!x.open_passages.includes(d.passage_id))x.open_passages.push(d.passage_id);break;
   }
   case 'IntervalSuperseded':{const x=this.#intervals.get(d.interval_id);x.status='superseded';x.superseded_by=d.successor_id;break;}
  }
  const x=this.#intervals.get(e.subject_ref);if(x)x.lineage_head=e.event_hash;
 }
 guard(p) {
  fresh(this.#field);
  demand(this.#store.state('dependency','ccm-001')===PROFILE,'CCM_PROFILE_CHANGED');
  const binding=this.#passages.get(p.passage_id);demand(binding&&hash(binding.passage.body)===hash(p),'CCM_PASSAGE_BINDING_REQUIRED');
  verifyNodeRecord(this.#store,binding.passage,this.#field.field_id);
  const x=this.#interval(binding.interval_id);this.#currentInterval(x);
  demand(this.#commands.get(binding.opened_by).body.dependency_hash===this.#snapshot(x.dependencies).hash,'CCM_DEPENDENCY_REVISION_CHANGED');
  demand(x.scope.actions.includes(p.action)&&x.scope.targets.includes(p.target),'CCM_INTERVAL_SCOPE');
  demand(x.standing.outbound==='ELIGIBLE','CCM_INTERVAL_OBSERVE_ONLY');
  demand(p.authority_basis===x.authority_basis,'CCM_INTERVAL_AUTHORITY');
  this.#scopeGrant(x,p.authority_basis);
  return {interval_id:x.interval_id,predecessor_hash:x.lineage_head};
 }
 #historic(id_,at) {
  const current=this.#intervals.get(id_);if(!current||!at)return current;
  const bound=typeof at==='object'?at.at:at;
  const target=this.#events.get(bound);const timestamp=target?target.created_at:bound;
  demand(target||Number.isFinite(Date.parse(timestamp)),'CCM_HISTORY_CURSOR');
  let x=null;
  for(const h of this.#lineage.get(id_)||[]){const e=this.#events.get(h);
   if(target ? this.#ordinals.get(h)>this.#ordinals.get(bound) : Date.parse(e.created_at)>Date.parse(timestamp))break;
   if(e.event_type==='IntervalConstituted')x={...copy(e.data),standing:{outbound:'OBSERVE_ONLY',inbound:'UNASSESSED'},authority_source:this.#anchor.principal_id,
    authority_basis:null,dependency_hash:e.dependency_hash,constituted_by:e.warrant_ref,lineage_head:h,open_passages:[],returns:[],residue:[],status:'active',created_at:e.created_at,superseded_by:null};
   if(x&&e.event_type==='StandingAdmitted'){x.standing.outbound=e.data.outbound;x.authority_basis=e.data.authority_basis;}
   if(x&&e.event_type==='DependencyChanged'){x.dependencies=copy(e.data.dependencies);x.dependency_hash=e.dependency_hash;x.standing.outbound='OBSERVE_ONLY';x.authority_basis=null;}
   if(x&&e.event_type==='PassageOpened')x.open_passages.push(e.data.passage.body.passage_id);
   if(x&&e.event_type==='CrossIntervalPassageOpened')x.open_passages.push(e.data.passage_id);
   if(x&&e.event_type==='ReturnOpened')x.returns.push(e.data.return_id);
   if(x&&e.event_type==='IntervalSuperseded'){x.status='superseded';x.superseded_by=e.data.successor_id;}
   if(x&&e.event_type==='JudgmentRecorded')x.standing.inbound=e.data.disposition==='ADMIT'?'SUPPORTED_FOR_DECLARED_USE':e.data.disposition;
   if(x)x.lineage_head=h;
   if(target&&h===bound)break;
  }return x;
 }
 query(name,...args) {
  let out;
  if(name==='SourceArtifact'){const record=this.#commands.get(args[0]);out=record?{status:'KNOWN',record}:{status:'UNKNOWN'};}
  else if(name==='DependencySnapshot'){out=this.#snapshot(args[0]);}
  else if(name==='WhatStands'){
   const [a,b,at]=args;
   if(!this.#participants.has(a)||!this.#participants.has(b))out={status:'UNKNOWN',intervals:[]};
   else {const xs=(this.#pairs.get(pair(a,b))||[]).map(id_=>this.#historic(id_,at)).filter(Boolean).sort((a,b)=>a.interval_id.localeCompare(b.interval_id));
    out={status:xs.length?'KNOWN':'ABSENT',intervals:xs};}
  }else if(name==='ShowLineage'){
   const refs=this.#lineage.get(args[0])||[];out={status:refs.length?'KNOWN':'UNKNOWN',head:refs.at(-1)||null,
    events:refs.map(h=>{const e=this.#events.get(h);return {event_hash:h,event_type:e.event_type,previous_hash:e.previous_hash,warrant_ref:e.warrant_ref,dependency_hash:e.dependency_hash,created_at:e.created_at};})};
  }else if(name==='WhyDoesItStand'||name==='UnderWhoseAuthority'){
   const x=this.#historic(args[0],args[1]);out=x?{status:'KNOWN',interval_id:x.interval_id,sourcepoint:this.#anchor.principal_id,
    constitution_ref:this.#intervals.get(args[0]).constituted_by,authority_basis:x.authority_basis||null,standing:x.standing,lineage_head:x.lineage_head}:{status:'UNKNOWN'};
  }else if(name==='OpenPassages'){
   const x=this.#historic(args[0],args[1]);out={status:x?'KNOWN':'UNKNOWN',passages:x?x.open_passages.map(id_=>{
    const c=this.#crossings.get(id_);return c?{passage_id:id_,direction:'CROSS_INTERVAL',source:c.source_interval,target:c.target_interval,return_contract:c.return_contract}:
     {passage_id:id_,direction:'OUTBOUND',status:args[1]?(x.returns.some(r=>this.#returns.get(r).passage_id===id_)?'RETURNED':'OPEN'):(this.#inspect(id_).return||x.returns.some(r=>this.#returns.get(r).passage_id===id_))?'RETURNED':'OPEN'};
   }).filter(p=>p.status!=='RETURNED'):[]};
  }else if(name==='WhatMayRightfullyFollow'){
   try{const [intervalId,p,at]=args;demand(!at,'CCM_HISTORICAL_EXECUTION_ELIGIBILITY_UNKNOWN');demand(this.#intervals.has(intervalId),'CCM_INTERVAL_UNKNOWN');demand(this.#passages.get(p.passage_id)?.interval_id===intervalId,'CCM_INTERVAL_SUBJECT');this.guard(p);
    const result=this.#preflight(this.#passages.get(p.passage_id).passage);
    out={status:'ADMIT',policy:result.policy,execution:'NOT_INVOKED',claim:'CURRENT_PREFLIGHT_ONLY'};
   }catch(e){out={status:/UNKNOWN/.test(e.message)?'UNKNOWN':/DEPENDENCY|EXPIRED|OBSERVE_ONLY/.test(e.message)?'HOLD':'DENY',reason:e.message,execution:'NOT_INVOKED'};}
  }else if(name==='WhatChanged'){
   const r=this.#returns.get(args[0]);if(!r)out={status:'UNKNOWN'};
   else {const native=this.#inspect(r.passage_id), disposition=native.decision?.status;
    out={status:'KNOWN',interval_id:r.interval_id,return_id:r.return_id,passage_id:r.passage_id,artifact_hash:hash(r.artifact),artifact:r.artifact,
     provenance:r.provenance,outbound_disposition:disposition==='ADMITTED'?'ADMIT':disposition || native.denials?.length ?'DENY':'UNASSESSED',inbound_disposition:r.inbound_disposition,
     judgment_ref:r.judgment_ref,truth_status:'UNESTABLISHED',evidence_status:r.inbound_disposition==='ADMIT'?'SOURCEPOINT_QUALIFIED_CLAIM':'NOT_ADMITTED',
     settlement_status:'UNSETTLED',home_mutation:'NOT_INVOKED'};}
  }else if(name==='CrossIntervalAdmissibility'){
   const [a,b,payload]=args;
   const c=[...this.#crossings.values()].find(c=>c.source_interval===a&&c.target_interval===b&&c.payload_ref===payload);
   if(!this.#intervals.has(a)||!this.#intervals.has(b))out={status:'UNKNOWN'};
   else if(!c)out={status:'HOLD',reason:'EXPLICIT_CROSS_INTERVAL_PASSAGE_REQUIRED'};
   else{try{fresh(this.#field);demand(this.#store.state('dependency','ccm-001')===PROFILE,'CCM_PROFILE_CHANGED');
    this.#currentInterval(this.#interval(a));this.#currentInterval(this.#interval(b));this.#current(c.dependencies);
    demand(c.dependency_hash===this.#snapshot(c.dependencies).hash,'CCM_DEPENDENCY_REVISION_CHANGED');fresh(this.#commands.get(c.warrant_ref).body);
    out={status:'ADMIT',original_disposition:'ADMIT',passage_id:c.passage_id,authority_effect:'none'};
   }catch(e){out={status:'HOLD',original_disposition:'ADMIT',passage_id:c.passage_id,reason:e.message,authority_effect:'none'};}}
  }else throw new Error('CCM_QUERY_UNKNOWN');
  return copy(out);
 }
}
