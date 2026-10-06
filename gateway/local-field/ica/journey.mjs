import { randomUUID } from 'node:crypto';
import { writeFileSync,renameSync } from 'node:fs';
import { join } from 'node:path';
import { evaluate,freezeData } from '../meteorology/evaluator.mjs';
import { projectMetascope } from '../meteorology/projection.mjs';
import { ConsequenceSpecimen } from '../consequence/account.mjs';
import { projectConsequence } from '../consequence/projection.mjs';
import { ReferenceWorkspace } from './workspace.mjs';
import { referenceSignals } from './source-replay.mjs';
import { exactData } from '../meteorology/signals.mjs';
const need=(ok,error)=>{if(!ok)throw new Error(error);};
const copy=v=>structuredClone(v);
const issuedViews=new WeakSet();
const PROGRAM=freezeData({kind:'Program',program_id:'bounded-reading-investigation.f0.1',name:'Bounded Research',max_effects:1,max_bytes:4096,
 input:'One bounded FieldoscopyReading',authorization_supplied:false});
export function validateICAView(view){need(issuedViews.has(view),'ISSUED_ICA_VIEW_REQUIRED');return view;}

export class ICAJourney {
 #workspace;#replay;#account;#reading;#previous=null;#register=[];#requests=new Set();#revision=0;#id=randomUUID();#phase='OBSERVATORY';
 #what=false;#why=false;#prepared=null;#delegation=null;#permission=null;#lease=null;#attempt=null;#returned=null;#revocation=null;#orientation=null;#disposition=null;
 constructor(workspace,replay){
  need(workspace instanceof ReferenceWorkspace&&workspace.constructor===ReferenceWorkspace,'NATIVE_REFERENCE_WORKSPACE_REQUIRED');
  exactData(replay,['kind','source_contract','initial','changed','initial_timestamp','changed_timestamp'],'REPLAY_FIELDS');
  need(replay.kind==='ReferenceSignalReplay'&&replay.source_contract==='Timing-only synthetic Calendar/Git replay; no live source connection','REPLAY_FIELDS');
  evaluate(replay.changed,{timestamp:replay.changed_timestamp});
  this.#workspace=workspace;this.#replay=freezeData(copy(replay));this.#reading=evaluate(replay.initial,{timestamp:replay.initial_timestamp});
  this.#account=new ConsequenceSpecimen(workspace.runtime,{objective_id:'Bounded Research note stored and read back',minimum_bytes:1});
  this.#record('ENTER','Enter Observatory',this.#reading,'FieldoscopyReading',this.#reading.reading_id);
  this.#record('PROGRAM_AVAILABLE','See the one bounded Research Office',PROGRAM,'Program',PROGRAM.program_id);
 }
 #record(transition,human_action,artifact,kind,id){this.#register.push(freezeData({entry_id:randomUUID(),timestamp:new Date().toISOString(),transition,human_action,
  artifact_ref:`${kind}:${id}`,machine_artifact:copy(artifact),predecessor:this.#register.at(-1)?.entry_id??null}));}
 #commands(){
  const commands=['what','why'];if(!this.#previous&&!this.#delegation)commands.unshift('refresh');
  if(this.#previous&&!this.#delegation)commands.push('delegate');
  if(this.#permission&&!this.#attempt&&!this.#revocation)commands.push('start');
  if(this.#attempt&&!this.#returned)commands.push('return');
  if(this.#permission&&!this.#revocation)commands.push('revoke');
  if(this.#revocation&&!this.#revocation.acknowledged)commands.push('acknowledge');
  if((this.#returned||this.#disposition&&!this.#permission)&&!this.#orientation)commands.push('keep');
  return commands;
 }
 dispatch(request){
  exactData(request,['action','expected_revision','request_id'],'COMMAND_FIELDS');
  need(typeof request.request_id==='string'&&request.request_id.length>0&&request.request_id.length<=128,'COMMAND_ID');
  need(!this.#requests.has(request.request_id),'REPLAYED_COMMAND');need(request.expected_revision===this.#revision,'STALE_JOURNEY');
  need(typeof request.action==='string'&&this.#commands().includes(request.action),'COMMAND_NOT_AVAILABLE');need(this.#requests.size<64,'REFERENCE_COMMAND_BOUND');
  const action=request.action;this.#requests.add(request.request_id);
  const choice={kind:'HumanChoice',choice_id:request.request_id,action,expected_revision:request.expected_revision,controller:'Explicit local reference controller; not production identity proof'};
  this.#record('HUMAN_CHOICE',action,choice,'HumanChoice',choice.choice_id);
  try {
   if(action==='refresh'){
    this.#previous=this.#reading;this.#reading=evaluate(this.#replay.changed,{timestamp:this.#replay.changed_timestamp});
    this.#record('OBSERVE_CHANGE','Read latest conditions',this.#reading,'FieldoscopyReading',this.#reading.reading_id);
   }else if(action==='what'||action==='why'){
    if(action==='what')this.#what=true;else this.#why=true;
    this.#record(action==='what'?'INSPECT':'EXPLAIN',action==='what'?'What is this?':'Why does it appear?',this.#reading,'FieldoscopyReading',this.#reading.reading_id);
   }else if(action==='delegate'){
    const projection=projectMetascope(this.#reading);
    const note={kind:'BoundedResearchNote',reading_id:this.#reading.reading_id,sources:['CALENDAR','GIT'],candidate_regime:this.#reading.atmospheric_regime,
     interpretation:projection.sections.flatMap(s=>s.lines),unresolved_remainder:this.#reading.unresolved_remainder,forecast_status:'UNCALIBRATED_CANDIDATE',authorization_supplied:false};
    this.#prepared=this.#workspace.prepare(JSON.stringify(note));
    this.#delegation=freezeData({kind:'Delegation',delegation_id:randomUUID(),human_choice_ref:choice.choice_id,reading_ref:this.#reading.reading_id,
     office:'Research',program:'bounded-reading-investigation.f0.1',instrument:'Metascope',grant_ref:this.#prepared.grant_id,
     scope:{source_domains:['CALENDAR','GIT'],input:'One bounded FieldoscopyReading',action:'create_document',target:'research-return.json',max_bytes:4096,max_effects:1,
      further_delegation:false,objective:'Store and read back this bounded research note; no claim that its forecast is true'}});
    this.#record('DELEGATE','Authorize this bounded Research',this.#delegation,'Delegation',this.#delegation.delegation_id);
    try {this.#permission=this.#account.admit(this.#prepared.passage);this.#phase='AUTHORIZED';this.#disposition=this.#permission.disposition;
     this.#record('PASS','Permission for the next transition',this.#permission,'Permission',this.#permission.permission_id);
    }catch(error){const d=this.#workspace.runtime.waistQuery(this.#prepared.passage.body.passage_id).latest;
     if(error.message!=='PERMISSION_REQUIRES_ADMIT'||!['HOLD','DENY'].includes(d?.disposition))throw error;
     this.#disposition=d;this.#phase=d.disposition;this.#record(d.disposition,'Research has not been attempted',d,'ConstitutionalDisposition',d.decision_id);
    }
   }else if(action==='start'){
    this.#lease=this.#account.commit(this.#permission,this.#workspace.commitment(this.#prepared.passage,this.#permission));
    this.#record('COMMIT','Start the bounded Research',this.#lease,'InvocationLease',this.#lease.lease_id);
    this.#attempt=this.#account.invoke(this.#lease,this.#workspace.invocation(this.#prepared.passage,this.#lease));this.#phase='ATTEMPTED';
    this.#record('ATTEMPT','Research attempted its one scoped write',this.#attempt,'Attempt',this.#attempt.attempt_id);
   }else if(action==='return'){
    let evidenceEstablished=false;
    if(this.#workspace.fixture==='unknown'){
     const fault={kind:'ReferenceTransportFault',fault_id:randomUUID(),status:'UNOBSERVABLE',scope:'Declared fixture withholds the independent observation request',physical_partition_proven:false};
     this.#record('OBSERVATION_UNAVAILABLE','The independent readback is unavailable',fault,fault.kind,fault.fault_id);
    }else {
     const observation=this.#account.observe(this.#attempt,this.#workspace.observation(this.#prepared.passage,this.#attempt));
     this.#record('OBSERVE','Read the note back separately',observation,'Observation',observation.observation_id);
     try{
      const evidence=this.#account.admitEvidence(observation);evidenceEstablished=true;this.#record('EVIDENCE','Establish the qualified readback',evidence,'Evidence',evidence.evidence_id);
      const outcome=this.#account.assessOutcome(evidence);this.#record('ASSESS','Check the declared note objective',outcome,'OutcomeAssessment',outcome.assessment_id);
     }catch(error){
      if(error.message!=='INSUFFICIENT_OBSERVATION')throw error;
      this.#record('EVIDENCE_UNESTABLISHED','Readback did not establish the commanded note',observation,'Observation',observation.observation_id);
     }
    }
    this.#returned=this.#account.composeReturn(this.#attempt,{reports:this.#workspace.fixture==='partial'?['ATTEMPT_ACCOUNT','LIMITS_ACCOUNT']:undefined,
     outstanding_obligations:!evidenceEstablished?['Qualified independent readback remains unestablished; any follow-up needs a fresh human choice','Human must decide whether any further research is warranted']:['Forecast remains uncalibrated; human decides what follows']});
    this.#phase=this.#returned.return_completeness==='PARTIAL'?'PARTIAL_RETURN':'RETURNED';this.#record('RETURN','Read Research’s Return',this.#returned,'ReturnArtifact',this.#returned.return_id);
   }else if(action==='revoke'){
    this.#revocation=this.#account.revoke(this.#permission,this.#workspace.revocation(this.#prepared.grant_id));this.#phase='REVOKED';
    this.#record('REVOKE','Withdraw future use of this delegation',this.#revocation,'Revocation',this.#revocation.revocation_id);
   }else if(action==='acknowledge'){
    this.#revocation=this.#account.acknowledge(this.#revocation);this.#record('ACKNOWLEDGE','Check this executor’s acknowledgement',this.#revocation,'Revocation',this.#revocation.revocation_id);
   }else if(action==='keep'){
    this.#orientation=freezeData({kind:'HumanOrientation',orientation_id:randomUUID(),choice:'RETAIN_FOR_ORIENTATION',basis_ref:this.#returned?`ReturnArtifact:${this.#returned.return_id}`:`ConstitutionalDisposition:${this.#disposition.decision_id}`,
     human_choice_ref:choice.choice_id,authorization_supplied:false,standing_change:false,next_action:'None; any new work requires a fresh request'});
    this.#record('REORIENT','Keep this finding for my orientation',this.#orientation,'HumanOrientation',this.#orientation.orientation_id);
   }
  }finally{this.#revision++;this.#persist();}
  return this.view();
 }
 #persist(){const tmp=join(this.#workspace.root,'ica-register.json.tmp');writeFileSync(tmp,JSON.stringify(this.view(),null,2),{mode:0o600});renameSync(tmp,join(this.#workspace.root,'ica-register.json'));}
 view(){
  const consequence=this.#permission?projectConsequence(this.#account.snapshot(this.#returned??this.#attempt??this.#lease??this.#permission)):null;
  const instrument=freezeData({kind:'Instrument',name:'Metascope',...projectMetascope(this.#reading)}),state=consequence?.typed_account;
  const change=this.#previous?{previous_reading_ref:this.#previous.reading_id,current_reading_ref:this.#reading.reading_id,
   metrics:this.#reading.signal_manifest.map(s=>({metric:s.signal_type,before:this.#previous.signal_manifest.find(p=>p.signal_type===s.signal_type).magnitude,now:s.magnitude,direction:s.direction,signal_ref:s.signal_id}))}:null;
  const answers=[
   {question:'Where am I?',answer:'Observatory, inside this bounded ONE reference session. Research is the one available Office.'},
   {question:'What changed?',answer:change?'Calendar space tightened while development activity and review waits rose. These are computed changes in the labeled source replay.':'The initial Calendar/Git frame is visible. Read latest conditions to compare the next frame.'},
   {question:'What is it?',answer:this.#reading.atmospheric_regime==='PRESSURE_DIFFERENTIAL'?'A candidate pressure differential: production activity is outpacing the review-capacity proxy.':'The current reading and its limits are shown by the Metascope.'},
   {question:'Why does it appear?',answer:instrument.sections.find(s=>s.title==='What’s Driving It').lines.join(' ')+' Each contributor links to its scoped signal and extraction window.'},
   {question:'What did I delegate?',answer:this.#delegation?'One Research note about this reading, at most 4096 bytes, written once locally. No further delegation or automatic follow-up.':'No Research has been delegated. Looking at conditions supplies no permission.'},
   {question:'What did Research actually do and establish?',answer:state?.evidence?'A separate readback established the commanded note bytes at that time. The objective concerns that note, not the truth of its forecast.':state?.attempt?'An attempt and executor report exist. Occurrence and the intended objective remain unestablished.':this.#disposition?.disposition==='HOLD'?'Research is waiting for the required authorization basis. No attempt was made.':this.#disposition?.disposition==='DENY'?'Research was denied by the native action policy. No attempt was made.':'No Research attempt has been made.'},
   {question:'What remains unresolved or controllable?',answer:(this.#returned?.return_completeness==='PARTIAL'?'Some required reporting accounts are still missing. ':'')+(this.#revocation?(this.#revocation.acknowledged?'This local executor validated withdrawal of future use under this grant. ':'Withdrawal is recorded; executor acknowledgement is pending. '):'You may withdraw future use of an admitted delegation. ')+(state?.evidence?'This control cannot reverse the earlier observed note. ':'')+'The forecast, actual review capacity and downstream consequences remain unestablished.'},
   {question:'What can I decide next?',answer:this.#orientation?'You retained this finding for orientation. No subsequent work was authorized.':this.#returned?'Keep the finding for orientation or withdraw future use. Any new work needs a fresh request.':'Use the available controls to inspect, delegate, start, or read a Return when its basis exists.'},
  ];
  const view=freezeData({kind:'ICAView',journey_id:this.#id,revision:this.#revision,phase:this.#phase,reference_fixture:this.#workspace.fixture,source_contract:this.#replay.source_contract,
   place:{kind:'Place',name:'Observatory'},office:{kind:'Office',name:'Research'},inhabitant:{kind:'Inhabitant',name:'Local reference human',identity_proof:'NOT_PRODUCTION_AUTHENTICATION'},
   reading:this.#reading,change,instrument,program:PROGRAM,show_what:this.#what,show_why:this.#why,delegation:this.#delegation,disposition:this.#disposition,consequence,
   orientation:this.#orientation,answers,register:[...this.#register],allowed_commands:this.#commands()});
  issuedViews.add(view);return view;
 }
}
export function createICAReference(options){
 need(options&&typeof options==='object','REFERENCE_OPTIONS');
 exactData(options,['root',...['fixture','timestamp'].filter(k=>Object.hasOwn(options,k))],'REFERENCE_OPTIONS');
 const replay=referenceSignals(options.timestamp),workspace=new ReferenceWorkspace(options);let journey;
 try{journey=new ICAJourney(workspace,replay);}catch(error){workspace.close();throw error;}
 return {root:workspace.root,runtime:workspace.runtime,journey,close:()=>workspace.close()};
}
