import { randomUUID } from 'node:crypto';
import { writeFileSync,renameSync,readFileSync } from 'node:fs';
import { join } from 'node:path';
import { evaluate,freezeData } from '../meteorology/evaluator.mjs';
import { projectMetascope } from '../meteorology/projection.mjs';
import { ConsequenceSpecimen } from '../consequence/account.mjs';
import { projectConsequence } from '../consequence/projection.mjs';
import { ReferenceWorkspace } from './workspace.mjs';
import {LocalField} from '../index.mjs';
import { referenceSignals,referenceClearingSignals } from './source-replay.mjs';
import { exactData } from '../meteorology/signals.mjs';
import {RESEARCH_OFFICE,investigate} from './research.mjs';
import {ResearchDispatch} from './dispatch.mjs';
import {RemainderRegister} from './residue.mjs';
import {navigateRoom} from './navigation-room.mjs';
const need=(ok,error)=>{if(!ok)throw new Error(error);};
const copy=v=>structuredClone(v);
const issuedViews=new WeakSet();
const issuedResearchReturns=new WeakSet();
export function validateResearchReturn(value){need(issuedResearchReturns.has(value),'ISSUED_RESEARCH_RETURN_REQUIRED');return value;}
const PROGRAM=freezeData({kind:'Program',program_id:'bounded-reading-investigation.f0.1',name:'Bounded Research',max_effects:1,max_bytes:4096,
 input:'At most three delegated FieldoscopyReadings',authorization_supplied:false});
export function validateICAView(view){need(issuedViews.has(view),'ISSUED_ICA_VIEW_REQUIRED');return view;}

export class ICAJourney {
 #workspace;#replay;#account;#reading;#previous=null;#register=[];#requests=new Set();#revision=0;#id=randomUUID();#phase='OBSERVATORY';
 #what=false;#why=false;#prepared=null;#delegation=null;#permission=null;#lease=null;#attempt=null;#returned=null;#revocation=null;#orientation=null;#disposition=null;
 #dispatch=null;#plannedResearch=null;#research=null;#researchReturn=null;#gate=null;#divergence=null;#history=[];#residue=new RemainderRegister();#worker=1;#replaced=false;#archived=[];
 #reportCandidate=null;#settlement=null;#successor=null;
 constructor(workspace,replay){
  need(workspace instanceof ReferenceWorkspace&&workspace.constructor===ReferenceWorkspace,'NATIVE_REFERENCE_WORKSPACE_REQUIRED');
  exactData(replay,['kind','source_contract','initial','changed','initial_timestamp','changed_timestamp'],'REPLAY_FIELDS');
  need(replay.kind==='ReferenceSignalReplay'&&replay.source_contract==='Timing-only synthetic Calendar/Git replay; no live source connection','REPLAY_FIELDS');
  evaluate(replay.changed,{timestamp:replay.changed_timestamp});
  this.#workspace=workspace;this.#replay=freezeData(copy(replay));this.#reading=evaluate(replay.initial,{timestamp:replay.initial_timestamp});
  this.#history.push(this.#reading);
  this.#account=new ConsequenceSpecimen(workspace.runtime,{objective_id:'Bounded Research note stored and read back',minimum_bytes:1});
  this.#record('ENTER','Enter Observatory',this.#reading,'FieldoscopyReading',this.#reading.reading_id);
  this.#record('PROGRAM_AVAILABLE','See the one bounded Research Office',PROGRAM,'Program',PROGRAM.program_id);
  this.#persist();
 }
 #record(transition,human_action,artifact,kind,id){this.#register.push(freezeData({entry_id:randomUUID(),timestamp:new Date().toISOString(),transition,human_action,
  artifact_ref:`${kind}:${id}`,machine_artifact:copy(artifact),predecessor:this.#register.at(-1)?.entry_id??null}));}
 #expired(){return !!this.#delegation&&Date.parse(this.#delegation.expires_at)<=Date.now();}
 #commands(){
  const commands=['what','why'];if(!this.#previous&&!this.#delegation)commands.unshift('refresh');
  if(this.#previous&&!this.#delegation)commands.push('delegate');
  if(this.#permission&&!this.#attempt&&!this.#revocation&&!this.#expired())commands.push('start');
  if(this.#gate)commands.splice(commands.indexOf('start'),commands.includes('start')?1:0);
  if((this.#attempt||this.#revocation||this.#gate||this.#permission&&this.#expired())&&!this.#returned)commands.push('return');
  if(this.#permission&&!this.#revocation&&!this.#expired())commands.push('revoke');
  if(this.#revocation&&!this.#revocation.acknowledged)commands.push('acknowledge');
  if((this.#returned||this.#disposition&&!this.#permission)&&!this.#orientation)commands.push('keep');
  if(this.#returned?.return_completeness==='COMPLETE'&&this.#researchReturn&&!this.#settlement)commands.push('accept-report');
  if(this.#settlement&&!this.#successor)commands.push('admit-account');
  if(this.#residue.view().items.length)commands.push('perimeter');
  if(this.#workspace.fixture==='model-contradiction'&&this.#previous&&!this.#delegation&&!this.#divergence)commands.push('compare');
  if(this.#workspace.fixture==='occupant-replacement'&&this.#permission&&!this.#attempt&&!this.#replaced)commands.push('replace');
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
    this.#history.push(this.#reading);
    this.#record('OBSERVE_CHANGE','Read latest conditions',this.#reading,'FieldoscopyReading',this.#reading.reading_id);
   }else if(action==='compare'){
    const prior=this.#reading,timestamp=new Date(Date.parse(prior.timestamp)+86400000).toISOString();
    this.#reading=evaluate(referenceClearingSignals(prior.timestamp),{timestamp});this.#history.push(this.#reading);
    this.#record('LATER_EDGE_OBSERVATION','Read the later source frame',this.#reading,'FieldoscopyReading',this.#reading.reading_id);
    this.#divergence=freezeData({kind:'InterpretationDivergence',divergence_id:randomUUID(),prior_reading_ref:prior.reading_id,current_reading_ref:this.#reading.reading_id,
     prior_regime:prior.atmospheric_regime,current_regime:this.#reading.atmospheric_regime,prior_history_rewritten:false,scope:'Synthetic edge conditions cleared; candidate forecast is not established truth',authorization_supplied:false});
    this.#record('DIVERGENCE','The later conditions differ from the candidate outlook',this.#divergence,this.#divergence.kind,this.#divergence.divergence_id);
    this.#residue.retain('UNCERTAINTY_REMAINDER','Candidate outlook and later clearing conditions diverged; retain both readings.',`InterpretationDivergence:${this.#divergence.divergence_id}`,'CHANGED');
   }else if(action==='what'||action==='why'){
    if(action==='what')this.#what=true;else this.#why=true;
    this.#record(action==='what'?'INSPECT':'EXPLAIN',action==='what'?'What is this?':'Why does it appear?',this.#reading,'FieldoscopyReading',this.#reading.reading_id);
   }else if(action==='delegate'){
    const frames=this.#workspace.fixture==='research-unknown'?[this.#reading]:this.#history;
    const planned=investigate(frames,{office:'Research',subject:'node-a',reading_refs:frames.map(r=>r.reading_id),delegation_id:'PLANNING_ONLY'});
    const note={kind:'BoundedResearchNote',reading_id:this.#reading.reading_id,sources:['CALENDAR','GIT'],candidate_regime:this.#reading.atmospheric_regime,
     findings:planned.findings.map(x=>({finding_id:x.finding_id,question:x.question,status:x.status,text:x.text})),
     unresolved_remainder:this.#reading.unresolved_remainder,forecast_status:'UNCALIBRATED_CANDIDATE',authorization_supplied:false};
    this.#prepared=this.#workspace.prepare(JSON.stringify(note));
    this.#record('COMPILE','Form the bounded note request without execution authority',this.#prepared.compilation,'ONEIR',this.#prepared.compilation.ir.ir_id);
    this.#dispatch=new ResearchDispatch(this.#workspace,this.#account,this.#prepared);
    this.#delegation=this.#dispatch.delegate({human_choice_ref:choice.choice_id,inhabitant:`research-worker-${this.#worker}`,reading_refs:frames.map(r=>r.reading_id)});
    this.#plannedResearch=freezeData({...planned,delegation_id:this.#delegation.delegation_id});
    this.#record('DELEGATE','Authorize this bounded Research',this.#delegation,'ResearchDelegation',this.#delegation.delegation_id);
    try {this.#permission=this.#account.admit(this.#prepared.passage);this.#phase='AUTHORIZED';this.#disposition=this.#permission.disposition;
     this.#record('PASS','Permission for the next transition',this.#permission,'Permission',this.#permission.permission_id);
    }catch(error){const d=this.#workspace.runtime.waistQuery(this.#prepared.passage.body.passage_id).latest;
     if(error.message!=='PERMISSION_REQUIRES_ADMIT'||!['HOLD','DENY'].includes(d?.disposition))throw error;
     this.#disposition=d;this.#phase=d.disposition;this.#record(d.disposition,'Research has not been attempted',d,'ConstitutionalDisposition',d.decision_id);
    }
   }else if(action==='start'){
    if(['research-hold','research-deny'].includes(this.#workspace.fixture)){
     const held=this.#workspace.fixture==='research-hold',d=this.#workspace.challenge(this.#prepared,held?'MISSING_SOURCE':'PROHIBITED_CONSEQUENCE');
     need(d.disposition===(held?'HOLD':'DENY'),'NATIVE_RESEARCH_CHALLENGE_REQUIRED');
     this.#gate=freezeData({kind:'ResearchDispatchDecision',decision_id:randomUUID(),disposition:d.disposition,reason:held?'MATERIAL_DEPENDENCY_UNRESOLVED':'AUTHORITY_CEILING_VIOLATION',
      native_disposition:d,scope:'This requested Research consequence only',clearance_condition:held?'Restore the authorized history source, refresh its dependency relation, and request fresh human evaluation; old admission does not revive.':'Request work within the Research charter; this denial does not broaden authority.'});
     this.#phase=d.disposition;this.#record('RESEARCH_DISPATCH_BLOCKED','Explain why this work cannot proceed',this.#gate,this.#gate.kind,this.#gate.decision_id);
     this.#residue.retain(held?'RESOURCE_REMAINDER':'FORECLOSED_OPTION_RECORD',this.#gate.clearance_condition,`ResearchDispatchDecision:${this.#gate.decision_id}`,held?'HELD':'CHANGED');
    }else{
     this.#research=this.#plannedResearch;this.#record('RESEARCH_COMPARE','Compare the authorized signal history',this.#research,'ResearchFindings',this.#research.research_id);
     const warrant=this.#dispatch.warrant(this.#delegation,this.#permission,choice.choice_id);
     this.#record('HUMAN_WARRANT','Authorize the specified invocation commitment',warrant,warrant.kind,warrant.warrant_id);
     this.#lease=this.#dispatch.lease(warrant);this.#record('COMMIT','Start the bounded Research',this.#lease,'ConsequentialLease',this.#lease.lease_id);
     this.#attempt=this.#dispatch.invoke(this.#lease,this.#delegation);this.#phase='ATTEMPTED';
     this.#record('ATTEMPT','Research attempted its one scoped write',this.#attempt,'Attempt',this.#attempt.attempt_id);
    }
   }else if(action==='return'){
    let evidenceEstablished=false;
    if(!this.#attempt){
     this.#record('NO_ATTEMPT','Research reports that no note was attempted',this.#delegation,'ResearchDelegation',this.#delegation.delegation_id);
    }else if(this.#workspace.fixture==='unknown'){
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
    this.#returned=this.#account.composeReturn(this.#attempt??this.#permission,{reports:this.#workspace.fixture==='partial'?['ATTEMPT_ACCOUNT','LIMITS_ACCOUNT']:undefined,
     outstanding_obligations:!evidenceEstablished?['Qualified independent readback remains unestablished; any follow-up needs a fresh human choice','Human must decide whether any further research is warranted']:['Forecast remains uncalibrated; human decides what follows']});
    this.#phase=this.#returned.return_completeness==='PARTIAL'?'PARTIAL_RETURN':'RETURNED';this.#record('RETURN','Read Research’s Return',this.#returned,'ReturnArtifact',this.#returned.return_id);
    this.#returnResearch();
   }else if(action==='revoke'){
    this.#revocation=this.#account.revoke(this.#permission,this.#workspace.revocation(this.#prepared.grant_id));this.#phase='REVOKED';
    this.#record('REVOKE','Withdraw future use of this delegation',this.#revocation,'Revocation',this.#revocation.revocation_id);
   }else if(action==='acknowledge'){
    this.#revocation=this.#account.acknowledge(this.#revocation);this.#record('ACKNOWLEDGE','Check this executor’s acknowledgement',this.#revocation,'Revocation',this.#revocation.revocation_id);
   }else if(action==='replace'){
    const prior_account={returned:this.#researchReturn,settlement:this.#settlement,successor:this.#successor,orientation:this.#orientation};
    this.#revocation=this.#account.revoke(this.#permission,this.#workspace.revocation(this.#prepared.grant_id));
    this.#revocation=this.#account.acknowledge(this.#revocation);
    this.#record('REPLACEMENT_REVOKE','Withdraw the prior inhabitant’s future use',this.#revocation,'Revocation',this.#revocation.revocation_id);
    this.#returned=this.#account.composeReturn(this.#permission,{outstanding_obligations:['Replacement requires a fresh attributable Research delegation']});this.#returnResearch();
    this.#archived.push({delegation:this.#delegation,returned:this.#researchReturn,prior_account});this.#worker++;this.#replaced=true;
    const replacement={kind:'InhabitantReplacement',replacement_id:randomUUID(),office:'Research',prior_inhabitant:this.#delegation.inhabitant,current_inhabitant:`research-worker-${this.#worker}`,
     prior_delegation_ref:this.#delegation.delegation_id,old_rights_revoked:true,new_authorization_supplied:false};
    this.#record('REPLACE_INHABITANT','Replace the Research inhabitant; new work needs fresh delegation',replacement,replacement.kind,replacement.replacement_id);
    this.#delegation=null;this.#permission=null;this.#lease=null;this.#returned=null;this.#revocation=null;this.#researchReturn=null;this.#research=null;this.#disposition=null;this.#phase='OBSERVATORY';
    this.#reportCandidate=null;this.#settlement=null;this.#successor=null;this.#orientation=null;
   }else if(action==='perimeter'){
    this.#residue.move();const tray=this.#residue.view();this.#record('ATTENTION','Move retained remainders without changing standing',tray,tray.kind,this.#id);
   }else if(action==='accept-report'){
    this.#settlement=this.#workspace.reviewReports(this.#reportCandidate,choice.choice_id);
    this.#record('SETTLE_REPORT','Accept this reporting account only',this.#settlement,this.#settlement.kind,this.#settlement.settlement_id);
   }else if(action==='admit-account'){
    this.#successor=this.#workspace.admitReports(this.#settlement,choice.choice_id);
    this.#record('ADMIT_MATERIAL','Admit this account to subsequent orientation without execution rights',this.#successor,this.#successor.kind,this.#successor.artifactId);
   }else if(action==='keep'){
    this.#orientation=freezeData({kind:'HumanOrientation',orientation_id:randomUUID(),choice:'RETAIN_FOR_ORIENTATION',basis_ref:this.#returned?`ReturnArtifact:${this.#returned.return_id}`:`ConstitutionalDisposition:${this.#disposition.decision_id}`,
     human_choice_ref:choice.choice_id,authorization_supplied:false,standing_change:false,next_action:'None; any new work requires a fresh request'});
    this.#record('REORIENT','Keep this finding for my orientation',this.#orientation,'HumanOrientation',this.#orientation.orientation_id);
   }
  }catch(error){
   if(action!=='start'||!['CCM_DEPENDENCY_CHANGED','CCM_DEPENDENCY_REVISION_CHANGED','DEPENDENCY_CHANGED'].includes(error.message))throw error;
   const current=this.#workspace.runtime.ccmQuery('WhatMayRightfullyFollow','I_AB',this.#prepared.passage.body);
   need(current.status==='HOLD'&&/DEPENDENCY/.test(current.reason),'CURRENT_NATIVE_DEPENDENCY_BURDEN_REQUIRED');
   this.#gate=freezeData({kind:'ResearchDispatchDecision',decision_id:randomUUID(),disposition:'HOLD',reason:'MATERIAL_DEPENDENCY_UNRESOLVED',
    native_disposition:null,native_condition:{...current,kind:'NativeCurrentPreflight',passage_id:this.#prepared.passage.body.passage_id,observed_at:new Date().toISOString()},
    scope:'Current native eligibility for this Research dispatch; historical ADMIT remains unchanged',
    clearance_condition:'Restore the authorized history source, refresh its dependency relation, and request fresh human evaluation; old admission does not revive.'});
   this.#phase='HOLD';this.#record('RESEARCH_DISPATCH_BLOCKED','Current source dependency blocks this Research',this.#gate,this.#gate.kind,this.#gate.decision_id);
   this.#residue.retain('RESOURCE_REMAINDER',this.#gate.clearance_condition,`ResearchDispatchDecision:${this.#gate.decision_id}`,'HELD');
  }finally{this.#revision++;this.#persist();}
  return this.view();
 }
 #returnResearch(){
  const basis=`ReturnArtifact:${this.#returned.return_id}`,r=this.#research;
  this.#residue.retain('RESOURCE_REMAINDER','Earlier source history beyond the declared frames is not available.',basis);
  this.#residue.retain('UNCERTAINTY_REMAINDER','Broader history, forecast calibration and downstream consequences remain uncertain.',basis);
  this.#residue.retain('OBLIGATION_REMAINDER','Human decides whether any further investigation is warranted; no follow-up is authorized.',basis);
  if(this.#attempt)this.#residue.retain('FORECLOSED_OPTION_RECORD','No compensating operation exists through this withdrawal control.',`Attempt:${this.#attempt.attempt_id}`);
  const work_condition=this.#revocation?'REVOKED':this.#expired()?'EXPIRED':this.#gate?.disposition==='HOLD'?'HELD_DEPENDENCY':this.#gate?.disposition==='DENY'?'DENIED_CONSEQUENCE':!r?'UNKNOWN':r.findings.some(x=>x.status!=='ESTABLISHED')?(r.findings.some(x=>x.status==='ESTABLISHED')?'PARTIAL':'UNKNOWN'):'ESTABLISHED';
  this.#researchReturn=freezeData({kind:'ResearchReturnArtifact',return_id:randomUUID(),delegation_id:this.#delegation.delegation_id,office:'Research',inhabitant:this.#delegation.inhabitant,
   subject:this.#delegation.subject,requested:'Compare authorized Calendar/Git history and ask whether this has happened before',work_condition,
   attempt_summary:this.#returned.execution_attempt,established_findings:r?.findings.filter(x=>x.status==='ESTABLISHED')??[],
   observation_basis:r?.observation_coverage??null,evidence_basis:this.#returned.provenance.evidence_ref,
   evidence_scope:'Native evidence establishes commanded note bytes only; finding provenance identifies scoped synthetic signals separately',
   occurrence_knowledge:this.#returned.occurrence_knowledge,knowledge:r?.knowledge??'UNKNOWN',outcome_assessment:r?.outcome??'UNRESOLVED',
   uncertainty:r?.findings.filter(x=>x.status!=='ESTABLISHED')??[{question:'INVESTIGATION',status:'UNKNOWN',text:'Research was not completed; the available reporting account records why.'}],
   residue:this.#residue.view().items.map(x=>x.remainder_id),outstanding_obligations:this.#returned.outstanding_obligations,
   follow_up_candidates:[{description:'Seek more history only through a fresh bounded human delegation',authorization_supplied:false}],
   return_completeness:this.#returned.return_completeness,authority_status:this.#revocation?'REVOKED':this.#expired()?'EXPIRED':'NO_FURTHER_DISPATCH_FROM_THIS_RETURN',
   interruption_point:this.#revocation?(this.#attempt?'After one local note attempt; observations and effects remain attributable':'Before any local note attempt'):null,
   provenance:{native_return_ref:this.#returned.return_id,delegation_ref:this.#delegation.delegation_id,research_ref:r?.research_id??null,reading_refs:this.#delegation.reading_refs},settlement_supplied:false});
  issuedResearchReturns.add(this.#researchReturn);
  this.#record('RESEARCH_RETURN','Research returns findings and what remains uncertain',this.#researchReturn,this.#researchReturn.kind,this.#researchReturn.return_id);
  this.#reportCandidate=this.#workspace.captureReports(this.#returned,this.#researchReturn);
 }
 #persist(){const view=this.view();this.#workspace.checkpoint(view);const tmp=join(this.#workspace.root,'ica-register.json.tmp');writeFileSync(tmp,JSON.stringify(view,null,2),{mode:0o600});renameSync(tmp,join(this.#workspace.root,'ica-register.json'));}
 view(){
  const consequence=this.#permission?projectConsequence(this.#account.snapshot(this.#returned??this.#attempt??this.#permission)):null;
  const instrument=freezeData({kind:'Instrument',name:'Metascope',...projectMetascope(this.#reading)}),state=consequence?.typed_account;
  const change=this.#previous?{previous_reading_ref:this.#previous.reading_id,current_reading_ref:this.#reading.reading_id,
   metrics:this.#reading.signal_manifest.map(s=>({metric:s.signal_type,before:this.#previous.signal_manifest.find(p=>p.signal_type===s.signal_type)?.magnitude??null,now:s.magnitude,direction:s.direction,signal_ref:s.signal_id}))}:null;
  const established=this.#research?.findings.filter(f=>f.status==='ESTABLISHED').length??0;
  const answers=[
   {question:'Where am I?',answer:'Observatory, inside this bounded ONE reference session. Research is the one available Office.'},
   {question:'What changed?',answer:this.#divergence?'Later conditions improved: available time rose and review waits fell. Earlier interpretation remains in lineage. These are synthetic source observations.':change?this.#reading.signal_manifest.length<6?'Current signal coverage is incomplete. Available contributors remain visible; missing sources or metrics remain unknown.':this.#reading.atmospheric_regime==='PRESSURE_DIFFERENTIAL'?'Calendar space tightened while development activity and review waits rose. These are computed changes in the labeled source replay.':instrument.sections[0].lines.join(' '):'The initial Calendar/Git frame is visible. Read latest conditions to compare the next frame.'},
   {question:'What is it?',answer:this.#reading.atmospheric_regime==='PRESSURE_DIFFERENTIAL'?'A candidate pressure differential: production activity is outpacing the review-capacity proxy.':'The current reading and its limits are shown by the Metascope.'},
   {question:'Why does it appear?',answer:instrument.sections.find(s=>s.title==='What’s Driving It').lines.join(' ')+' Each contributor links to its scoped signal and extraction window.'},
   {question:'What did I delegate?',answer:this.#delegation?'Compare the authorized Calendar/Git timing history and ask whether this has happened before. One local note, at most 4096 bytes. No further delegation or automatic follow-up.':'No Research has been delegated. Looking at conditions supplies no permission.'},
   {question:'What did Research actually do and establish?',answer:this.#gate?this.#gate.disposition==='HOLD'?'Research is waiting for a materially relevant source dependency. No note attempt was made.':'A proposed consequence outside Research was denied. No lease or note attempt was released.':state?.evidence?'A separate readback established the commanded note bytes at that time. The objective concerns that note, not the truth of its forecast. '+(this.#research?.knowledge==='ESTABLISHED'?'An earlier candidate also appears in the authorized replay; this establishes recurrence in that replay only.':established===2?'Two timing changes are established in the replay; whether this happened earlier remains unknown.':established===1?'One timing finding is established in the replay; other requested findings remain unknown.':'The authorized history cannot establish the central claim.'):state?.attempt?'An attempt and executor report exist. Occurrence and the intended objective remain unestablished.':this.#disposition?.disposition==='HOLD'?'Research is waiting for the required authorization basis. No attempt was made.':this.#disposition?.disposition==='DENY'?'Research was denied by the native action policy. No attempt was made.':'No Research attempt has been made.'},
   {question:'What remains unresolved or controllable?',answer:(this.#returned?.return_completeness==='PARTIAL'?'Some required reporting accounts are still missing. ':'')+(this.#revocation?(this.#revocation.acknowledged?'This local executor validated withdrawal of future use under this grant. ':'Withdrawal is recorded; executor acknowledgement is pending. '):'You may withdraw future use of an admitted delegation. ')+(state?.evidence?'This control cannot reverse the earlier observed note. ':'')+'The forecast, actual review capacity and downstream consequences remain unestablished.'},
   {question:'What can I decide next?',answer:this.#orientation?'You retained this finding for orientation. No subsequent work was authorized.':this.#returned?'Keep the finding for orientation or withdraw future use. Any new work needs a fresh request.':'Use the available controls to inspect, delegate, start, or read a Return when its basis exists.'},
  ];
  const account={kind:'ICAView',journey_id:this.#id,revision:this.#revision,phase:this.#expired()&&!this.#returned?'EXPIRED':this.#phase,reference_fixture:this.#workspace.fixture,source_contract:this.#replay.source_contract,
   place:{kind:'Place',name:'Observatory'},office:RESEARCH_OFFICE,inhabitant:{kind:'Inhabitant',name:'Local reference human',identity_proof:'NOT_PRODUCTION_AUTHENTICATION'},
   research_inhabitant:{kind:'ResearchInhabitant',inhabitant_id:`research-worker-${this.#worker}`,office:'Research',identity_scope:'Local bounded deterministic program, not production identity'},
   research:this.#research,research_return:this.#researchReturn,research_gate:this.#gate,divergence:this.#divergence,archived_research:[...this.#archived],
   perimeter:this.#residue.view(),lumen:{kind:'LumenProjection',state:this.#gate?'OCCLUDED':this.#research?.knowledge==='UNKNOWN'&&this.#research.findings.every(x=>x.status==='UNKNOWN')?'UNKNOWN':this.#reading.unresolved_remainder.length?'SHADOWED':'ILLUMINATED',
    basis_ref:this.#gate?`ResearchDispatchDecision:${this.#gate.decision_id}`:this.#research?.findings.every(x=>x.status==='UNKNOWN')?`ResearchFindings:${this.#research.research_id}`:`FieldoscopyReading:${this.#reading.reading_id}`,scope:'Current visibility and known gaps; not judgment, personal condition or instruction',authorization_supplied:false},
   reading:this.#reading,change,instrument,program:PROGRAM,show_what:this.#what,show_why:this.#why,delegation:this.#delegation,disposition:this.#disposition,consequence,
   compilation:this.#prepared?.compilation??null,settlement:this.#settlement,successor:this.#successor,
   orientation:this.#orientation,answers,register:[...this.#register],allowed_commands:this.#commands()};
  const view=freezeData({...account,navigation:navigateRoom(account)});
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
/** Re-entry restores attributable orientation only. JSON never restores operative handles. */
export function reopenICAReference(options){
 exactData(options,['root'],'REFERENCE_OPTIONS');
 const retained=LocalField.readRetainedRoom(options.root,JSON.parse(readFileSync(join(options.root,'ica-checkpoint.json'),'utf8')));
 const answers=retained.answers.map((a,i)=>i===6?{...a,answer:'This retained account supplies no active control. Prior effects, uncertainty and obligations remain attributable.'}:i===7?{...a,answer:'Inspect the retained account. Any new assignment needs a fresh reference session and explicit human choice.'}:a);
 const consequence=retained.consequence?{...retained.consequence,claims:retained.consequence.claims.map(c=>({...c,text:'At the retained time: '+c.text})),typed_account:{...retained.consequence.typed_account,
  lease_condition:retained.consequence.typed_account.lease&&Date.parse(retained.consequence.typed_account.lease.commitment.expires_at)<=Date.now()?'EXPIRED':'UNKNOWN',
  retained_lease_condition:retained.consequence.typed_account.lease_condition,time_basis:'HISTORICAL_RETAINED_ACCOUNT',current_authority_knowledge:'NOT_ESTABLISHED_BY_REENTRY'}}:null;
 const account={...retained,consequence,answers,allowed_commands:[],reentry:{kind:'RetainedRoomAccount',authority_restored:false,scope:'Authenticated historical account; no lease or delegation is revived. Snapshot freshness after external file rollback is not established.'}};
 const view=freezeData({...account,navigation:navigateRoom(account,{historical:true})});issuedViews.add(view);
 return {root:options.root,journey:{view:()=>view,dispatch:()=>{throw new Error('REENTRY_READ_ONLY');}},close:()=>{}};
}
