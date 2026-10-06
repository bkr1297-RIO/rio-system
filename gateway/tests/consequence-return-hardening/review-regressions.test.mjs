import test from 'node:test';
import assert from 'node:assert/strict';
import { waist } from '../constitutional-waist/helpers.mjs';
import { signed } from '../helpers/local-field.mjs';
import { ConsequenceSpecimen } from '../../local-field/consequence/account.mjs';
import { projectConsequence,reconstructClaim } from '../../local-field/consequence/projection.mjs';
function setup(t){const f=waist(t),g=f.allow(),p=f.candidate(g),s=new ConsequenceSpecimen(f.runtime,{objective_id:'goal',minimum_bytes:1}),permission=s.admit(p),lease=s.commit(permission,f.commitRecord(p,permission.disposition));return {f,g,p,s,permission,lease};}

test('review: equal UUIDs across artifact kinds reconstruct the correct revocation',t=>{
 const {f,g,p,s,permission,lease}=setup(t);s.invoke(lease,f.invocation(p,lease.commitment));
 const rev=s.revoke(permission,signed({...f.stamp(),record_id:permission.permission_id,type:'revocation',issuer:'I-1',grant_id:g.grant_id},f.human));s.acknowledge(rev);
 const projection=projectConsequence(s.snapshot(permission));
 for(const code of ['REVOCATION_REQUESTED','REVOCATION_PROPAGATED','ACKNOWLEDGED','REVOKED_FOR_FUTURE_USE']){
  const proof=reconstructClaim(projection,code);assert.equal(proof.artifact.kind,'Revocation');assert.equal(proof.artifact.grant_id,g.grant_id);
 }
 assert.equal(reconstructClaim(projection,'AUTHORIZED').artifact.kind,'Permission');
});

test('review: completed native capture preserves executor receipt in Return and projection',t=>{
 const {f,p,s,lease}=setup(t);s.invoke(lease,f.invocation(p,lease.commitment));const captured=s.captureAttempt(lease),r=s.composeReturn(captured);
 assert.equal(r.executor_receipt.status,'PRESENT');assert.ok(r.executor_receipt.claim_ref);
 assert.ok(projectConsequence(s.snapshot(r)).claims.some(c=>c.code==='EXECUTOR_RECEIPT'));
 assert.equal(r.occurrence_knowledge,'UNKNOWN');
});

test('review: revocation describes only the revoked grant; another lawful grant still works',t=>{
 const {f,g,p,s,permission,lease}=setup(t);s.invoke(lease,f.invocation(p,lease.commitment));
 const rev=s.revoke(permission,signed({...f.stamp(),type:'revocation',issuer:'I-1',grant_id:g.grant_id},f.human));s.acknowledge(rev);
 const otherGrant=f.allow('I_AB',{target:'lawful.txt'}),otherPassage=f.candidate(otherGrant,{target:'lawful.txt'}),d=f.runtime.admit(otherPassage),c=f.commit(otherPassage,d);
 const execution=f.runtime.invoke(f.invocation(otherPassage,c));assert.equal(execution.status,'COMPLETED');
 const projection=projectConsequence(s.snapshot(permission)),claim=projection.claims.find(c=>c.code==='REVOKED_FOR_FUTURE_USE');
 assert.match(claim.text,/this grant/);assert.match(claim.contract,/other grants/);
 assert.equal(projection.assay.Interrupt.grant_id,g.grant_id);assert.match(projection.assay.Interrupt.scope,/grant/);
});

test('review: expired no-attempt lease can produce COMPLETE Return with UNKNOWN occurrence',async t=>{
 const f=waist(t),p=f.candidate(),s=new ConsequenceSpecimen(f.runtime,{objective_id:'goal',minimum_bytes:1}),permission=s.admit(p);
 const l=s.commit(permission,f.commitRecord(p,permission.disposition,{expires_at:new Date(Date.now()+250).toISOString()}));
 await new Promise(r=>setTimeout(r,280));assert.throws(()=>s.invoke(l,f.invocation(p,l.commitment)),/EXPIRED/);
 const r=s.composeReturn(l,{outstanding_obligations:['Request fresh permission if another attempt is desired']});
 assert.equal(r.execution_attempt.status,'NOT_ATTEMPTED');assert.equal(r.execution_attempt.condition,'EXPIRED');
 assert.equal(r.execution_attempt.attempt_ref,null);assert.equal(r.executor_receipt.status,'ABSENT');assert.equal(r.return_completeness,'COMPLETE');
 assert.equal(r.occurrence_knowledge,'UNKNOWN');assert.equal(r.outcome_assessment.status,'UNRESOLVED');assert.equal(s.snapshot(r).settlement,null);
 assert.ok(projectConsequence(s.snapshot(r)).claims.some(c=>c.code==='RETURN_COMPLETE'));
});
