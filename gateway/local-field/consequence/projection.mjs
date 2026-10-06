/** Human claims reference machine contracts; serialized projections carry no authority. */
import { randomUUID } from 'node:crypto';
import { validateSnapshot } from './account.mjs';
const projections=new WeakSet();
const freeze=v=>{if(v&&typeof v==='object'){Object.values(v).forEach(freeze);Object.freeze(v);}return v;};
const escape=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function projectConsequence(snapshot){
 const v=validateSnapshot(snapshot),claims=[],manifest=[];
 function claim(code,text,artifact,id,contract){const ref=`${artifact.kind}:${id}`;claims.push({code,text,basis_ref:ref,basis_kind:artifact.kind,basis_id:id,contract});
  if(!manifest.some(x=>x.id===ref))manifest.push({id:ref,artifact_kind:artifact.kind,artifact_id:id,artifact});}
 claim('AUTHORIZED','Permission was recorded for a root-signed invocation commitment. Execution requires a separate request and current authority checks.',v.permission,v.permission.permission_id,'Historical ADMIT and exact passage basis authorize ISSUE_INVOCATION_COMMITMENT, not execution.');
 if(v.lease_condition==='EXPIRED')claim('LEASE_EXPIRED','The invocation lease has expired. A historical permission does not authorize a new attempt.',v.lease,v.lease.lease_id,'Lease expiry compared against snapshot time; native invocation also revalidates expiry.');
 if(v.execution_condition==='INTERRUPTED')claim('EXECUTION_INTERRUPTED','The runtime recovered an interrupted attempt without establishing occurrence or replaying the effect.',v,v.snapshot_id,'Native recovery Return reports UNSETTLED_ATTEMPT; no completed executor report establishes occurrence.');
 if(v.attempt)claim(v.attempting?'ATTEMPTING':'ATTEMPTED',v.attempting?'An attributable execution attempt is in progress.':'An attributable execution attempt was recorded.',v.attempt,v.attempt.attempt_id,'Native durable attempt; an attempt does not establish occurrence.');
 if(v.occurrence_claim)claim('EXECUTOR_RECEIPT',`The executor reported ${v.executor_receipt.status.toLowerCase()}. This report does not establish that the action occurred.`,v.occurrence_claim,v.occurrence_claim.claim_id,'Executor receipt is present; receipt is not independent truth.');
 if(v.evidence)claim('OCCURRED','The commanded bytes were observed at the target in a separate readback. This establishes that observation at that time.',v.evidence,v.evidence.evidence_id,'Explicitly admitted exact-descriptor-readback.f0.1 basis; no permanent or downstream occurrence claim.');
 else claim('OCCURRENCE_UNKNOWN','We cannot yet establish whether the commanded action occurred.',v,v.snapshot_id,'No admitted observation basis; UNKNOWN is neither success nor failure.');
 if(v.outcome_assessment.status==='UNRESOLVED')claim('OUTCOME_UNRESOLVED','The intended objective has not been established.',v,v.snapshot_id,'Objective assessment requires its own explicit operation and declared criterion.');
 else claim(v.outcome_assessment.status,v.outcome_assessment.status==='FAILED_OBJECTIVE'?'The commanded effect was observed, but the declared objective was not achieved.':'The declared readback objective was achieved.',v.outcome_assessment,v.outcome_assessment.assessment_id,'Separate assessment against the previously declared readback-byte objective; not inferred from occurrence.');
 if(v.returned)claim(v.returned.return_completeness==='COMPLETE'?'RETURN_COMPLETE':'RETURN_PENDING',v.returned.return_completeness==='COMPLETE'?'Return complete: all required reporting obligations are discharged. Uncertainty and follow-up obligations may remain.':'Return pending: some required reporting accounts are missing.',v.returned,v.returned.return_id,'Completeness concerns required reporting obligations, not occurrence, objective success or settlement.');
 else claim('RETURN_PENDING','Return pending: no reporting account has been returned.',v,v.snapshot_id,'No ReturnArtifact exists; no settlement is inferred.');
 if(v.revocation){
  claim('REVOCATION_REQUESTED','An authorized revocation request was recorded.',v.revocation,v.revocation.revocation_id,'Native control verified the signed grant-scoped request; request is distinct from acknowledgement.');
  claim('REVOCATION_PROPAGATED','The revocation was recorded in this executor’s local registry.',v.revocation,v.revocation.revocation_id,'Signed native revocation and validated local registry; no remote propagation or physical cessation claim.');
  if(v.revocation.acknowledged)claim('ACKNOWLEDGED','Acknowledgement confirmed: the local executor registry has validated the revocation.',v.revocation,v.revocation.revocation_id,'Acknowledgement concerns this local registry validation, not every delegate stopping.');
  else claim('ACKNOWLEDGEMENT_PENDING','Executor acknowledgement is pending. Sending revocation does not prove that a delegate has stopped.',v.revocation,v.revocation.revocation_id,'No explicit executor validation acknowledgement yet.');
  if(v.revocation.future_exercise_disabled)claim('REVOKED_FOR_FUTURE_USE','Further authorized use of this grant and its affected lineage through this local executor is disabled after its revocation check.',v.revocation,v.revocation.revocation_id,'Native point-of-use validation prevents subsequent authorized exercise under this revoked grant and its affected lineage. This does not disable other grants, reverse effects or bound physical cessation.');
 }
 if(v.evidence&&v.control_limits.committed_effect)claim('IRREVERSIBLE_EFFECT','The earlier action was observed. This control cannot reverse it; other principals may still alter the filesystem.',v.evidence,v.evidence.evidence_id,'No compensating operation exists through this control. This fixture does not prove physical irreversibility.');
 const p=freeze({kind:'ConsequenceProjection',projection_id:randomUUID(),snapshot_ref:v.snapshot_id,claims,basis_manifest:manifest,
  controls:[],assay:v.assay,limits:v.unresolved_remainder,typed_account:v});projections.add(p);return p;
}
export function reconstructClaim(projection,code){
 if(!projections.has(projection))throw new Error('ISSUED_PROJECTION_REQUIRED');
 const c=projection.claims.find(c=>c.code===code);if(!c)throw new Error('CLAIM_NOT_FOUND');
 return freeze({claim:c.code,contract:c.contract,artifact:projection.basis_manifest.find(x=>x.id===c.basis_ref).artifact});
}
export function renderConsequence(projection){
 if(!projections.has(projection))throw new Error('ISSUED_PROJECTION_REQUIRED');
 const rows=projection.claims.map(c=>`<li><strong>${escape(c.code.replaceAll('_',' ').toLowerCase().replace(/^./,s=>s.toUpperCase()))}</strong><p>${escape(c.text)}</p><details><summary>What establishes this claim</summary><p>${escape(c.contract)}</p><code>${escape(c.basis_ref)}</code></details></li>`).join('');
 return `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Consequence / Return F0.1</title><style>body{margin:0;background:#0d1722;color:#e5edf7;font:16px/1.55 system-ui}main{max-width:850px;margin:40px auto;padding:24px}h1{font-size:30px}ul{list-style:none;padding:0}li{padding:18px 22px;margin:12px 0;border:1px solid #365069;border-radius:12px;background:#142436}strong{color:#82d6df}p{margin:8px 0}summary{cursor:pointer;color:#b1c6d8}code,pre{font:12px/1.5 monospace;overflow-wrap:anywhere;white-space:pre-wrap}footer{color:#9eb2c7}</style><main><p>BOUNDED REFERENCE SPECIMEN · F0.1</p><h1>What can we establish?</h1><p>Permission, execution, observation, outcome and Return have separate accounts.</p><ul>${rows}</ul><h2>What remains unresolved</h2><ul>${projection.limits.map(x=>`<li>${escape(x)}</li>`).join('')}</ul><details><summary>Typed machine account and claim lineage</summary><pre>${escape(JSON.stringify(projection.typed_account,null,2))}</pre></details><footer>Candidate implementation evidence. Confidence is uncalibrated. This display supplies no authorization or settlement.</footer></main></html>`;
}
