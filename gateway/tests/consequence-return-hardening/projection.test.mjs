import test from 'node:test';
import assert from 'node:assert/strict';
import { waist } from '../constitutional-waist/helpers.mjs';
import { signed } from '../helpers/local-field.mjs';
import { ConsequenceSpecimen } from '../../local-field/consequence/account.mjs';
import { projectConsequence,renderConsequence,reconstructClaim } from '../../local-field/consequence/projection.mjs';

function fixture(t,minimum_bytes=1){const f=waist(t),g=f.allow(),p=f.candidate(g),s=new ConsequenceSpecimen(f.runtime,{objective_id:'human-readable objective',minimum_bytes}),permission=s.admit(p);return {f,g,p,s,permission};}
const codes=p=>p.claims.map(c=>c.code);
test('permission screen names the lawful next transition and cannot imply an attempt',t=>{
 const {s,permission}=fixture(t),p=projectConsequence(s.snapshot(permission));
 assert.ok(codes(p).includes('AUTHORIZED'));assert.ok(codes(p).includes('RETURN_PENDING'));assert.ok(codes(p).includes('OCCURRENCE_UNKNOWN'));
 assert.ok(!codes(p).includes('ATTEMPTED'));assert.equal(p.controls.length,0);
 const proof=reconstructClaim(p,'AUTHORIZED');assert.equal(proof.artifact.permission_id,permission.permission_id);assert.match(proof.contract,/commitment/i);
 assert.throws(()=>projectConsequence({...s.snapshot(permission)}),/SNAPSHOT/);
 assert.throws(()=>renderConsequence({...p}),/PROJECTION/);
});
test('receipt screen does not turn completed execution into occurred or objective success',t=>{
 const {f,p,s,permission}=fixture(t),lease=s.commit(permission,f.commitRecord(p,permission.disposition)),a=s.invoke(lease,f.invocation(p,lease.commitment));
 const display=projectConsequence(s.snapshot(a));assert.ok(codes(display).includes('ATTEMPTED'));assert.ok(codes(display).includes('EXECUTOR_RECEIPT'));
 assert.ok(codes(display).includes('OCCURRENCE_UNKNOWN'));assert.ok(codes(display).includes('OUTCOME_UNRESOLVED'));assert.ok(!codes(display).includes('OCCURRED'));
 for(const c of display.claims)assert.ok(reconstructClaim(display,c.code).artifact);
});
test('complete Return screen states what is complete even while outcome remains unresolved',t=>{
 const {f,p,s,permission}=fixture(t),l=s.commit(permission,f.commitRecord(p,permission.disposition)),a=s.invoke(l,f.invocation(p,l.commitment)),r=s.composeReturn(a);
 const display=projectConsequence(s.snapshot(r));assert.ok(codes(display).includes('RETURN_COMPLETE'));assert.ok(codes(display).includes('OUTCOME_UNRESOLVED'));
 const proof=reconstructClaim(display,'RETURN_COMPLETE');assert.equal(proof.artifact.return_completeness,'COMPLETE');assert.match(proof.contract,/reporting obligations/);
 assert.match(renderConsequence(display),/Return complete/);assert.doesNotMatch(renderConsequence(display),/Stopped ✓|Undo|onclick/i);
});
test('irreversible revocation shows occurred, objective failure, local future disablement and honest ack scope',t=>{
 const {f,g,p,s,permission}=fixture(t,4096),l=s.commit(permission,f.commitRecord(p,permission.disposition)),a=s.invoke(l,f.invocation(p,l.commitment));
 const o=s.observe(a,f.observeRecord(p,{execution_id:a.execution_id})),e=s.admitEvidence(o);s.assessOutcome(e);s.composeReturn(a);
 const rev=s.revoke(permission,signed({...f.stamp(),type:'revocation',issuer:'I-1',grant_id:g.grant_id},f.human));
 const pending=projectConsequence(s.snapshot(rev));assert.ok(codes(pending).includes('ACKNOWLEDGEMENT_PENDING'));
 assert.ok(!codes(pending).includes('REVOKED_FOR_FUTURE_USE'));const ack=s.acknowledge(rev),display=projectConsequence(s.snapshot(ack));
 for(const code of ['OCCURRED','FAILED_OBJECTIVE','RETURN_COMPLETE','REVOKED_FOR_FUTURE_USE','IRREVERSIBLE_EFFECT','ACKNOWLEDGED'])assert.ok(codes(display).includes(code),code);
 assert.doesNotMatch(renderConsequence(display),/Stopped ✓|Undo/);assert.match(renderConsequence(display),/other principals/i);
 assert.equal(reconstructClaim(display,'OCCURRED').artifact.evidence_id,e.evidence_id);
 assert.equal(reconstructClaim(display,'ACKNOWLEDGED').artifact.acknowledgement.executor,'node-b');
 const assay=display.assay;assert.equal(assay.Detect.established,true);assert.equal(assay.Interrupt.established,true);assert.equal(assay.Reconstruct.established,true);assert.equal(assay.ConfidenceCalibration.established,false);
});
test('projection escapes artifact data and keeps typed account inspectable',t=>{
 const f=waist(t),p=f.candidate(),s=new ConsequenceSpecimen(f.runtime,{objective_id:'<script>alert(1)</script>',minimum_bytes:1}),permission=s.admit(p);
 const display=projectConsequence(s.snapshot(permission)),html=renderConsequence(display);
 assert.doesNotMatch(html,/<script>/);assert.match(html,/&lt;script&gt;/);assert.match(html,/Typed machine account/);
 assert.throws(()=>reconstructClaim(display,'INVENTED'),/CLAIM_NOT_FOUND/);
});
