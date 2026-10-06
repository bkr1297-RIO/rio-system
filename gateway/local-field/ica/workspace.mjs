/** Explicit local reference authority. Existing native owners perform all authority checks. */
import { mkdirSync,existsSync,writeFileSync,renameSync } from 'node:fs';
import {join} from 'node:path';
import { randomUUID } from 'node:crypto';
import { LocalField } from '../index.mjs';
import { generateKeypair,signPayload } from '../../security/ed25519.mjs';
import { canonicalizeArgs,computeArgsHash } from '../../security/token-manager.mjs';
import { hash } from '../../security/local-field-authority.mjs';
import {compileResearchExpression,verifyResearchCompilation,REPORTING_PROFILE} from './f1-profile.mjs';
export const FIXTURES=Object.freeze(['normal','unknown','hold','deny','partial','research-unknown','research-hold','research-deny','research-revoke','research-partial','model-contradiction','occupant-replacement']);
export class ReferenceWorkspace {
 #human=generateKeypair();#source=generateKeypair();#receiver=generateKeypair();#field=randomUUID();#policyHash;
 constructor({root,fixture='normal'}){
  if(!FIXTURES.includes(fixture))throw new Error('REFERENCE_FIXTURE_INVALID');
  if(typeof root!=='string'||!root||existsSync(root))throw new Error('FRESH_REFERENCE_ROOT_REQUIRED');
  this.root=root;this.fixture=fixture;mkdirSync(root,{recursive:true,mode:0o700});
  const anchor={principal_id:'I-1',actor_type:'human',primary_role:'root_authority',public_key_hex:this.#human.publicKey};
  const definition=this.#signed({...this.#stamp(),type:'field',sourcepoint:'I-1',receiver_node:'node-b',
   policy:{policy_id:'ica-reference-bounded',policy_version:'0.1',status:'active',scope:{agents:['node-a'],systems:['local']},
    action_classes:[{class_id:'artifact',pattern:'create_document',governance_decision:fixture==='deny'?'AUTO_DENY':fixture==='hold'?'REQUIRE_QUORUM':'REQUIRE_HUMAN',risk_tier:'LOW'}]},
   dependencies:{corpus:'v1','ccm-001':'ccm-001.f0.1','constitutional-waist':'constitutional-waist.f0.1','f1-reporting-account':REPORTING_PROFILE}},this.#human);
  this.runtime=new LocalField({root,anchor,receiver:'node-b',signingKey:this.#receiver.secretKey,definition});
  this.#policyHash=hash(definition.body.policy);
  for(const [id,key,role]of[['node-a',this.#source,'proposer'],['node-b',this.#receiver,'executor']])this.#control('enrollment',{node:{node_id:id,node_type:'local_service',principal_id:id,
   actor_type:'executor',primary_role:role,secondary_roles:[],public_key_hex:key.publicKey,capabilities:['create_document'],interfaces:['http-json'],custody_boundary:id,status:'active'}});
  this.#ccm('participants.register',this.#field,['node-a','node-b'].map(id=>({participant_id:id,participant_kind:'node',root_lineage:'development:ica-reference-sourcepoint',status:'active'})));
  this.#ccm('intervals.constitute',this.#field,[{interval_id:'I_AB',endpoint_a:'node-a',endpoint_b:'node-b',relation_type:'ResearchSynthesis',
   scope:{actions:['create_document'],targets:['research-return.json'],inbound_uses:['orientation'],cross_interval_uses:[]},boundaries:{cross_interval:'EXPLICIT_ONLY'},dependencies:{corpus:'v1'}}]);
 }
 #stamp(){return {field_id:this.#field,record_id:randomUUID(),issued_at:new Date().toISOString(),expires_at:new Date(Date.now()+600000).toISOString()};}
 #signed(body,key=this.#source){return {body,signature:signPayload(canonicalizeArgs(body),key.secretKey)};}
 #control(type,values){return this.runtime.control(this.#signed({...this.#stamp(),type,issuer:'I-1',...values},this.#human));}
 #ccm(operation,subject_ref,data){return this.runtime.ccmCommand(this.#signed({...this.#stamp(),type:'ccm_command',profile:'ccm-001.f0.1',issuer:'I-1',operation,subject_ref,
  predecessor_hash:this.runtime.ccmQuery('ShowLineage',subject_ref).head||'0'.repeat(64),dependencies:{corpus:'v1'},dependency_hash:this.runtime.ccmQuery('DependencySnapshot',{corpus:'v1'}).hash,data},this.#human));}
 prepare(content){
  if(typeof content!=='string'||Buffer.byteLength(content)>4096)throw new Error('RESEARCH_NOTE_BOUND');
  const g={grant_id:randomUUID(),subject:'node-a',target_node:'node-b',action:'create_document',target:'research-return.json',scope:'artifact-create',purpose:'ccm:I_AB:outbound',
   dependencies:{corpus:'v1'},conditions:{},parent:null,allow_delegation:false,max_uses:1};
  const grant=this.#control('grant',{grant:g});this.#ccm('standing.transition','I_AB',{interval_id:'I_AB',outbound:'ELIGIBLE',authority_basis:g.grant_id});
  const candidate_id=randomUUID(),times=this.#stamp(),payload={content};
  const compiler_input={expression:'Write the bounded Research return note.',rule:'Nothing leaves this Lab without my explicit approval.',sourcepoint:'I-1',field_id:this.#field,
   proposal_id:candidate_id,policy_id:'ica-reference-bounded',policy_hash:this.#policyHash,issued_at:times.issued_at,expires_at:times.expires_at,
   request:{source_node:'node-a',subject:'node-a',target_node:'node-b',action:'create_document',target:g.target,payload,payload_hash:computeArgsHash(payload),scope:g.scope,purpose:g.purpose,dependencies:g.dependencies,conditions:{},return_requirement:{required:true,to:'I-1'}}};
  const compilation=compileResearchExpression(compiler_input);verifyResearchCompilation(compiler_input,compilation);
  const candidate=this.runtime.candidate(this.#signed({...this.#stamp(),type:'candidate',source_node:'node-a',candidate_id,kind:'proposal',compiler_input,compilation,
   content:{profile:'constitutional-waist.f0.1',interval_id:'I_AB',uncertainty:'Research note only; forecasting truth and downstream consequences remain unestablished.',obligations:['independent-readback','native-return']}}));
  const passage=this.#signed({...this.#stamp(),type:'passage',passage_id:randomUUID(),intent_id:randomUUID(),...compilation.oa_ir.request,authority_basis:g.grant_id,
   nonce:randomUUID(),correlation_id:randomUUID(),origin:{intent:'Explicit local reference human choice: bounded Research',candidate_id}});
  this.#ccm('passage.open','I_AB',{interval_id:'I_AB',passage});return {grant,grant_id:g.grant_id,candidate,passage,compilation};
 }
 captureReports(returned,research){return this.#control('reporting_capture',{profile:REPORTING_PROFILE,candidate_id:randomUUID(),content:{profile:REPORTING_PROFILE,returned,research}});}
 reviewReports(candidate,choice_id){return this.#control('reporting_review',{profile:REPORTING_PROFILE,candidate_id:candidate.body.candidate_id,account_digest:candidate.content_hash,human_choice_ref:choice_id,scope:'REPORTING_ACCOUNT_ONLY',review_status:'accepted'});}
 admitReports(settlement,choice_id){return this.#control('reporting_admission',{profile:REPORTING_PROFILE,settlement_ref:settlement.settlement_id,human_choice_ref:choice_id,target_context_ref:`ica:${this.#field}:orientation`,scope:'REPORTING_ACCOUNT_MATERIAL_ONLY'});}
 checkpoint(view){const record=this.#signed({...this.#stamp(),type:'room_checkpoint',profile:'ica-rr-001.f1',view,view_hash:hash(view)},this.#human);const tmp=join(this.root,'ica-checkpoint.json.tmp');writeFileSync(tmp,JSON.stringify(record),{mode:0o600});renameSync(tmp,join(this.root,'ica-checkpoint.json'));}
 commitment(p,permission){return this.#signed({...this.#stamp(),type:'invocation_commit',issuer:'I-1',passage_id:p.body.passage_id,passage_hash:hash(p.body),decision_id:permission.disposition.decision_id},this.#human);}
 invocation(p,lease){return this.#signed({...this.#stamp(),type:'invocation',source_node:'node-a',passage_id:p.body.passage_id,passage_hash:hash(p.body),commitment_id:lease.lease_id,passage:p});}
 observation(p,attempt){return this.#signed({...this.#stamp(),type:'observation_request',source_node:'node-a',passage_id:p.body.passage_id,execution_id:attempt.execution_id});}
 revocation(grant_id){return this.#signed({...this.#stamp(),type:'revocation',issuer:'I-1',grant_id},this.#human);}
 challenge(prepared,kind){
  if(!['MISSING_SOURCE','PROHIBITED_CONSEQUENCE'].includes(kind))throw new Error('DECLARED_CHALLENGE_REQUIRED');
  const body={...prepared.passage.body,...this.#stamp(),passage_id:randomUUID(),intent_id:randomUUID(),nonce:randomUUID(),correlation_id:randomUUID(),
   target:kind==='PROHIBITED_CONSEQUENCE'?'production-state.json':prepared.passage.body.target};
  const passage=this.#signed(body);this.#ccm('passage.open','I_AB',{interval_id:'I_AB',passage});
  if(kind==='MISSING_SOURCE')this.#control('dependency',{name:'corpus',value:'SOURCE_UNAVAILABLE'});
  return this.runtime.admit(passage);
 }
 close(){this.runtime.close();}
}
