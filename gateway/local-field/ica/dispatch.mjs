/** A specimen contract around native signed human commitment; not a new authority owner. */
import {randomUUID} from 'node:crypto';
import {freezeData} from '../meteorology/evaluator.mjs';
import {exactData} from '../meteorology/signals.mjs';
import {ReferenceWorkspace} from './workspace.mjs';
import {ConsequenceSpecimen} from '../consequence/account.mjs';
import {RESEARCH_OFFICE} from './research.mjs';
const need=(ok,code)=>{if(!ok)throw new Error(code);};
export class ResearchDispatch{
 #workspace;#account;#prepared;#delegations=new WeakSet();#warrants=new WeakMap();#leases=new WeakMap();#spent=new WeakSet();
 constructor(workspace,account,prepared){
  need(workspace?.constructor===ReferenceWorkspace&&account?.constructor===ConsequenceSpecimen,'NATIVE_RESEARCH_OWNER_REQUIRED');
  need(prepared?.passage?.body?.target==='research-return.json'&&prepared.passage.body.action==='create_document','RESEARCH_AUTHORITY_CEILING');
  this.#workspace=workspace;this.#account=account;this.#prepared=prepared;
 }
 delegate(input){
  exactData(input,['human_choice_ref','inhabitant','reading_refs'],'DELEGATION_FIELDS');
  need(typeof input.human_choice_ref==='string'&&input.human_choice_ref.length>0&&input.human_choice_ref.length<=128&&
   typeof input.inhabitant==='string'&&/^research-worker-[1-9][0-9]?$/.test(input.inhabitant)&&Array.isArray(input.reading_refs)&&input.reading_refs.length>0&&input.reading_refs.length<=3&&
   input.reading_refs.every(x=>typeof x==='string'&&x.length>0&&x.length<=128),'DELEGATION_SCOPE');
  const p=this.#prepared.passage.body;
  const d=freezeData({kind:'ResearchDelegation',delegation_id:randomUUID(),sourcepoint:'I-1',office:'Research',inhabitant:input.inhabitant,
   subject:p.subject,reading_refs:[...input.reading_refs],reading_ref:input.reading_refs.at(-1),human_choice_ref:input.human_choice_ref,
   permitted_sources:RESEARCH_OFFICE.permitted_sources,permitted_programs:RESEARCH_OFFICE.permitted_programs,permitted_instruments:RESEARCH_OFFICE.permitted_instruments,
   prohibited_consequences:RESEARCH_OFFICE.non_jurisdiction,delegation_depth:0,issued_at:p.issued_at,expires_at:p.expires_at,
   revocation_semantics:{validation_points:['native commitment','native invocation','descriptor release guard'],scope:'Local native grant only; no physical stop or reversal promise'},
   return_contract:'Three finding accounts, including missing evidence; native note consequence accounted separately',grant_ref:this.#prepared.grant_id,
   scope:{source_domains:['CALENDAR','GIT'],input:'At most three delegated FieldoscopyReadings',action:'create_document',target:'research-return.json',max_bytes:4096,max_effects:1,
    further_delegation:false,objective:'Compare authorized timing history; account for one stored note separately'}});
  this.#delegations.add(d);return d;
 }
 #current(d){
  need(this.#delegations.has(d),'ISSUED_DELEGATION_REQUIRED');need(Date.parse(d.expires_at)>Date.now(),'DELEGATION_EXPIRED');
  const g=this.#workspace.runtime.status().bindings.find(x=>x.grant_id===d.grant_ref);need(g&&!g.revoked,'DELEGATION_REVOKED');
 }
 warrant(delegation,permission,human_choice_ref){
  this.#current(delegation);need(typeof human_choice_ref==='string'&&human_choice_ref.length>0&&human_choice_ref.length<=128,'HUMAN_CHOICE_REQUIRED');
  this.#account.snapshot(permission);need(permission.passage_id===this.#prepared.passage.body.passage_id,'WARRANT_PERMISSION_BINDING');
  const signed=this.#workspace.commitment(this.#prepared.passage,permission);
  const w=freezeData({kind:'HumanSettlementWarrant',warrant_id:signed.body.record_id,human_choice_ref,sourcepoint:'I-1',delegation_id:delegation.delegation_id,
   permission_ref:permission.permission_id,next_transition:'ISSUE_INVOCATION_COMMITMENT',signed_commitment:signed,
   scope:'Specified native invocation commitment only; does not establish occurrence, outcome, Return settlement or successor standing'});
  this.#warrants.set(w,{delegation,permission,signed,used:false});return w;
 }
 lease(warrant){
  const b=this.#warrants.get(warrant);need(b,'ISSUED_WARRANT_REQUIRED');need(!b.used,'WARRANT_ALREADY_EXERCISED');this.#current(b.delegation);
  const native=this.#account.commit(b.permission,b.signed),d=b.delegation;b.used=true;
  const l=freezeData({kind:'ConsequentialLease',lease_id:native.lease_id,issuer:'I-1',holder:d.inhabitant,office:d.office,delegation_id:d.delegation_id,
   subject:d.subject,permitted_action:d.scope.action,target:d.scope.target,scope:d.scope,consequence_class:'BOUNDED_LOCAL_NOTE',conditions:{dependencies:{corpus:'v1'}},
   issued_at:native.commitment.issued_at,expires_at:native.commitment.expires_at,revocation_semantics:native.revocation_semantics,
   subdelegation_rule:'PROHIBITED',return_contract:d.return_contract,provenance:{warrant_ref:warrant.warrant_id,permission_ref:b.permission.permission_id,native_commitment_ref:native.lease_id}});
  this.#leases.set(l,{native,delegation:d});return l;
 }
 invoke(lease,current_delegation){
  const b=this.#leases.get(lease);need(b,'ISSUED_LEASE_REQUIRED');need(!this.#spent.has(lease),'LEASE_ALREADY_EXERCISED');
  need(b.delegation===current_delegation,'CURRENT_DELEGATION_REQUIRED');this.#current(current_delegation);need(Date.parse(lease.expires_at)>Date.now(),'LEASE_EXPIRED');
  const result=this.#account.invoke(b.native,this.#workspace.invocation(this.#prepared.passage,b.native));this.#spent.add(lease);return result;
 }
}
