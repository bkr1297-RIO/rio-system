/** Opt-in consequence accounts. Native LocalField alone owns authority and effects.
 * Evidence here is qualified only for this descriptor-readback specimen. */
import { createHash, randomUUID } from 'node:crypto';
import { LocalField } from '../index.mjs';
import { hash } from '../../security/local-field-authority.mjs';

export const REPORTS=Object.freeze(['ATTEMPT_ACCOUNT','OBSERVATION_ACCOUNT','OUTCOME_ACCOUNT','LIMITS_ACCOUNT']);
const snapshots=new WeakSet();
const immutable=value=>{if(value&&typeof value==='object'){for(const v of Object.values(value))immutable(v);Object.freeze(value);}return value;};
const requireThat=(condition,message)=>{if(!condition)throw new Error(message);};
const fingerprint=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const iso=()=>new Date().toISOString();
export function validateSnapshot(value){requireThat(snapshots.has(value),'ISSUED_SNAPSHOT_REQUIRED');return value;}

export class ConsequenceSpecimen {
  #runtimeSource; #identity; #objective; #issued=new WeakSet(); #accounts=new Map();
  constructor(runtime,objective){
    const owner=typeof runtime==='function'?runtime():runtime;
    requireThat(owner instanceof LocalField&&owner.constructor===LocalField,'NATIVE_WAIST_REQUIRED');
    requireThat(objective&&typeof objective.objective_id==='string'&&objective.objective_id.length>0&&objective.objective_id.length<=128&&
      Number.isSafeInteger(objective.minimum_bytes)&&objective.minimum_bytes>=0&&objective.minimum_bytes<=4096&&
      Object.keys(objective).sort().join(',')==='minimum_bytes,objective_id','OBJECTIVE_CONTRACT_INVALID');
    this.#runtimeSource=runtime;this.#identity=fingerprint(owner.status().field);this.#objective=immutable(structuredClone(objective));
  }
  get #runtime(){const owner=typeof this.#runtimeSource==='function'?this.#runtimeSource():this.#runtimeSource;
    requireThat(owner instanceof LocalField&&owner.constructor===LocalField&&fingerprint(owner.status().field)===this.#identity,'NATIVE_OWNER_CHANGED');return owner;}
  #issue(kind,data){const v=immutable({kind,...structuredClone(data)});this.#issued.add(v);return v;}
  #need(v,kind){requireThat(this.#issued.has(v)&&v.kind===kind,`ISSUED_${kind}_REQUIRED`);return this.#accounts.get(v.passage_id);}
  #native(a){const trace=this.#runtime.waistQuery(a.permission.passage_id);requireThat(trace.latest?.decision_id===a.permission.disposition.decision_id,'NATIVE_DECISION_CHANGED');return trace;}
  admit(passage){
    const d=this.#runtime.admit(passage);requireThat(d.disposition==='ADMIT','PERMISSION_REQUIRES_ADMIT');
    requireThat(!this.#accounts.has(passage.body.passage_id),'ACCOUNT_ALREADY_EXISTS');
    const permission=this.#issue('Permission',{permission_id:randomUUID(),passage_id:passage.body.passage_id,
      disposition:d,basis:d.decision_id,passage_hash:hash(passage.body),next_transition:'ISSUE_INVOCATION_COMMITMENT',
      objective_contract:this.#objective,issued_at:iso()});
    this.#accounts.set(permission.passage_id,{permission,passage:immutable(structuredClone(passage)),lease:null,attempt:null,
      claim:null,observation:null,evidence:null,outcome:null,returned:null,revocation:null});return permission;
  }
  commit(permission,request){
    const a=this.#need(permission,'Permission');
    requireThat(request?.body?.type==='invocation_commit','COMMITMENT_REQUEST_REQUIRED');
    requireThat(request?.body?.passage_id===permission.passage_id&&request.body.decision_id===permission.disposition.decision_id,'COMMITMENT_PERMISSION_BINDING');
    const c=this.#runtime.control(request);
    requireThat(c?.kind==='InvocationCommitment'&&c.passage_hash===permission.passage_hash,'NATIVE_COMMITMENT_REQUIRED');
    const semantics={validation_points:['native invocation acceptance','descriptor release guard'],lease_expiry:c.expires_at,
      propagation_bound:{scope:'local revocation registry',guarantee:'NONE',measured_ms:null},
      unreachable_behavior:'No offline exercise: native registry and current authority must be available',
      already_committed_behavior:'Retained; this control supplies no compensation',acknowledgement_requirement:'Explicit local executor registry validation; no remote delegate acknowledgement claim'};
    a.lease=this.#issue('InvocationLease',{lease_id:c.commitment_id,passage_id:permission.passage_id,permission_id:permission.permission_id,
      next_transition:'ATTEMPT_EXECUTION',commitment:c,revocation_semantics:semantics});return a.lease;
  }
  invoke(lease,request){
    const a=this.#need(lease,'InvocationLease');requireThat(a.lease===lease&&!a.attempt,'LEASE_ALREADY_EXERCISED');
    requireThat(request?.body?.commitment_id===lease.lease_id&&request.body.passage_id===lease.passage_id,'INVOCATION_LEASE_BINDING');
    const e=this.#runtime.invoke(request),native=this.#runtime.inspect(lease.passage_id).attempt;
    requireThat(native&&native.attempt_id===e.attempt_id,'NATIVE_ATTEMPT_REQUIRED');
    a.attempt=this.#issue('Attempt',{attempt_id:native.attempt_id,passage_id:lease.passage_id,invocation_lease_id:lease.lease_id,
      executor:native.executor_node,subject:a.passage.body.subject,requested_effect:{action:native.action,target:native.target,payload_hash:native.payload_hash},
      started_at:native.attempted_at,completed_at:e.completed_at,execution_id:e.execution_id,executor_report:e});
    a.claim=this.#issue('OccurrenceClaim',{claim_id:randomUUID(),passage_id:lease.passage_id,attempt_id:native.attempt_id,
      execution_ref:e.execution_id,report:e.result,knowledge_supplied:false});return a.attempt;
  }
  captureAttempt(lease){
    const a=this.#need(lease,'InvocationLease'),trace=this.#native(a),native=trace.attempt;
    requireThat(a.lease===lease&&native,'NATIVE_ATTEMPT_REQUIRED');
    const e=trace.execution;
    a.attempt=this.#issue('Attempt',{attempt_id:native.attempt_id,passage_id:lease.passage_id,invocation_lease_id:lease.lease_id,
      executor:native.executor_node,subject:a.passage.body.subject,requested_effect:{action:native.action,target:native.target,payload_hash:native.payload_hash},
      started_at:native.attempted_at,completed_at:e?.completed_at??null,execution_id:e?.execution_id??null,executor_report:e??null});
    if(e) a.claim=this.#issue('OccurrenceClaim',{claim_id:randomUUID(),passage_id:lease.passage_id,attempt_id:native.attempt_id,
      execution_ref:e.execution_id,report:e.result,knowledge_supplied:false});
    return a.attempt;
  }
  observe(attempt,request){
    const a=this.#need(attempt,'Attempt');requireThat(request?.body?.passage_id===attempt.passage_id&&request.body.execution_id===attempt.execution_id,'OBSERVATION_ATTEMPT_BINDING');
    this.#runtime.observe(request);const n=this.#native(a).observation;
    requireThat(n&&n.execution_id===attempt.execution_id,'NATIVE_OBSERVATION_REQUIRED');
    a.observation=this.#issue('Observation',{observation_id:n.observation_id,passage_id:attempt.passage_id,attempt_id:attempt.attempt_id,native:n,
      coverage:{status:n.status==='RECORDED'?'COMPLETED':'FAILED',scope:'One descriptor readback at one time; no downstream effects',observed_at:n.measurement.observed_at}});
    return a.observation;
  }
  admitEvidence(observation){
    const a=this.#need(observation,'Observation'),trace=this.#native(a),n=trace.observation,m=n?.measurement;
    requireThat(a.observation===observation&&n.observation_id===observation.observation_id&&fingerprint(n)===fingerprint(observation.native),'OBSERVATION_CUSTODY_CHANGED');
    const expected=createHash('sha256').update(a.passage.body.payload.content).digest('hex');
    requireThat(n.status==='RECORDED'&&m.status==='OBSERVED'&&m.method==='separate_descriptor_read_after_write'&&m.content_hash===expected&&
      m.target===a.passage.body.target&&m.bytes===Buffer.byteLength(a.passage.body.payload.content),'INSUFFICIENT_OBSERVATION');
    a.evidence=this.#issue('Evidence',{evidence_id:randomUUID(),passage_id:observation.passage_id,observation_ref:observation.observation_id,
      attempt_ref:a.attempt.attempt_id,admission_policy:'exact-descriptor-readback.f0.1',admitted_at:iso(),
      scope:'Commanded bytes were observed at the target at observed_at; not permanent or physical-world truth',measurement:m,
      constitutional_standing:'NOT_SUPPLIED'});return a.evidence;
  }
  assessOutcome(evidence){
    const a=this.#need(evidence,'Evidence');requireThat(a.evidence===evidence,'CURRENT_EVIDENCE_REQUIRED');this.#native(a);
    a.outcome=this.#issue('OutcomeAssessment',{assessment_id:randomUUID(),passage_id:evidence.passage_id,evidence_ref:evidence.evidence_id,
      objective_contract:this.#objective,status:evidence.measurement.bytes>=this.#objective.minimum_bytes?'ACHIEVED_OBJECTIVE':'FAILED_OBJECTIVE',
      assessed_at:iso(),scope:'Declared readback-byte objective only'});return a.outcome;
  }
  composeReturn(basis,{reports=REPORTS,outstanding_obligations=[]}={}){
    requireThat(this.#issued.has(basis)&&['Permission','InvocationLease','Attempt'].includes(basis.kind),'ISSUED_Permission_OR_InvocationLease_OR_Attempt_REQUIRED');
    const a=this.#need(basis,basis.kind),trace=this.#native(a),attempt=a.attempt;
    requireThat(!trace.attempt||attempt,'DURABLE_ATTEMPT_ACCOUNT_REQUIRED');
    requireThat(Array.isArray(reports)&&reports.every(x=>REPORTS.includes(x))&&new Set(reports).size===reports.length,'REPORTING_COORDINATES_INVALID');
    requireThat(Array.isArray(outstanding_obligations)&&outstanding_obligations.length<=32&&outstanding_obligations.every(x=>typeof x==='string'&&x.length>0&&x.length<=512),'OBLIGATIONS_INVALID');
    const state=this.#state(a),condition=attempt?.executor_report?.status??(attempt?state.execution_condition:state.lease_condition==='EXPIRED'?'EXPIRED':'UNKNOWN'),
      attemptAccount={status:attempt?'KNOWN':'NOT_ATTEMPTED',attempt_ref:attempt?.attempt_id??null,condition,scope:'Native passage attempt record; absence does not prove external non-occurrence'},
      accounts={ATTEMPT_ACCOUNT:attemptAccount,OBSERVATION_ACCOUNT:{coverage:state.observation_coverage,occurrence_knowledge:state.occurrence_knowledge,evidence:state.evidence},
      OUTCOME_ACCOUNT:state.outcome_assessment,LIMITS_ACCOUNT:{unresolved_remainder:state.unresolved_remainder,outstanding_obligations,control_limits:state.control_limits}};
    a.returned=this.#issue('ReturnArtifact',{return_id:randomUUID(),passage_id:basis.passage_id,
      execution_attempt:attemptAccount,
      executor_receipt:{status:a.claim?'PRESENT':'ABSENT',claim_ref:a.claim?.claim_id??null,scope:'Executor report only'},
      occurrence_knowledge:state.occurrence_knowledge,observation_coverage:state.observation_coverage,outcome_assessment:state.outcome_assessment,
      return_completeness:reports.length===REPORTS.length?'COMPLETE':'PARTIAL',required_reports:REPORTS,
      reporting_accounts:reports.map(coordinate=>({coordinate,account:accounts[coordinate]})),unresolved_remainder:state.unresolved_remainder,
      outstanding_obligations,follow_up_required:state.unresolved_remainder.length>0||outstanding_obligations.length>0,
      provenance:{permission_ref:a.permission.permission_id,lease_ref:a.lease?.lease_id??null,attempt_ref:attempt?.attempt_id??null,
        observation_ref:a.observation?.observation_id??null,evidence_ref:a.evidence?.evidence_id??null,outcome_ref:a.outcome?.assessment_id??null},returned_at:iso()});return a.returned;
  }
  revoke(permission,request){
    const a=this.#need(permission,'Permission');requireThat(request?.body?.type==='revocation'&&request.body.grant_id===a.passage.body.authority_basis,'REVOCATION_SCOPE_INVALID');
    const start=performance.now();const registry_receipt=this.#runtime.control(request);
    const g=this.#runtime.status().bindings.find(x=>x.grant_id===request.body.grant_id);
    requireThat(g?.revoked,'REVOCATION_REGISTRY_REQUIRED');
    a.revocation=this.#issue('Revocation',{revocation_id:request.body.record_id,passage_id:permission.passage_id,grant_id:request.body.grant_id,
      signed_request:request,registry_receipt,requested:true,propagated:true,acknowledged:false,future_exercise_disabled:false,request_ref:request.body.record_id,
      registry_validation_at:iso(),executor:this.#runtime.status().field.receiver,scope:'This revoked grant and its affected lineage through the local native executor; other grants and delegates are not disabled by this claim',
      propagation_measurement:{scope:'signed control call through local registry validation',elapsed_ms:performance.now()-start,guarantee:'NONE'},
      semantics:a.lease?.revocation_semantics??null,original_effect_reversed:false});return a.revocation;
  }
  acknowledge(revocation){
    const a=this.#need(revocation,'Revocation');requireThat(a.revocation===revocation,'CURRENT_REVOCATION_REQUIRED');
    const g=this.#runtime.status().bindings.find(x=>x.grant_id===revocation.grant_id);requireThat(g?.revoked,'EXECUTOR_REVOCATION_NOT_VALIDATED');
    a.revocation=this.#issue('Revocation',{...revocation,acknowledged:true,future_exercise_disabled:true,
      acknowledgement:{executor:this.#runtime.status().field.receiver,validation:'Native revoked registry read; subsequent exercise guard required',validated_at:iso()}});return a.revocation;
  }
  #state(a){
    const unresolved=[];if(!a.evidence)unresolved.push('No admitted observation establishes occurrence exactly as commanded');
    if(!a.outcome)unresolved.push('The declared objective has not been separately assessed');
    unresolved.push('Downstream consequences outside descriptor readback remain unobserved');
    const native=this.#runtime.inspect(a.permission.passage_id);
    const interrupted=!!a.attempt&&!a.attempt.completed_at&&native.return?.outcome==='UNSETTLED_ATTEMPT';
    const attempting=a.attempt&&!a.attempt.completed_at&&!interrupted;
    return {permission:a.permission,lease:a.lease,attempt:a.attempt,occurrence_claim:a.claim,
      lease_condition:a.lease?(Date.parse(a.lease.commitment.expires_at)<=Date.now()?'EXPIRED':'CURRENT'):'UNKNOWN',
      execution_condition:a.attempt?.executor_report?.status??(interrupted?'INTERRUPTED':'UNKNOWN'),native_recovery:interrupted?native.return:null,
      executor_receipt:a.attempt?.executor_report??null,observation:a.observation,evidence:a.evidence,
      occurrence_knowledge:a.evidence?'KNOWN_OCCURRED':'UNKNOWN',observation_coverage:a.observation?.coverage??{status:'UNOBSERVABLE',scope:'Independent observation not obtained'},
      outcome_assessment:a.outcome??{kind:'OutcomeAssessment',status:'UNRESOLVED',assessment_id:null},returned:a.returned,settlement:null,
      revocation:a.revocation,unresolved_remainder:unresolved,control_limits:{compensation_available:false,
        committed_effect:a.attempt?.executor_report?.status==='COMPLETED',irreversible_scope:'No compensation exists through this control; other principals may alter the filesystem'},
      assay:{Detect:{established:!!a.evidence,basis:a.evidence?.evidence_id??null},Interrupt:{established:!!a.revocation?.future_exercise_disabled,scope:'Future authorized exercise under the revoked grant and its affected lineage through the local executor',grant_id:a.revocation?.grant_id??null,basis:a.revocation?.revocation_id??null},
        Reconstruct:{established:true,basis:a.permission.permission_id},ConfidenceCalibration:{established:false,status:'NOT_CALIBRATED'}},attempting:!!attempting};
  }
  snapshot(record){
    requireThat(this.#issued.has(record),'ISSUED_RECORD_REQUIRED');const a=this.#accounts.get(record.passage_id);this.#native(a);
    const v=immutable({kind:'ConsequenceSnapshot',snapshot_id:randomUUID(),timestamp:iso(),passage_id:record.passage_id,...this.#state(a)});snapshots.add(v);return v;
  }
}
