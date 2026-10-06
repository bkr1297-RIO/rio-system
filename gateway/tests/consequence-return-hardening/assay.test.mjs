import test from 'node:test';
import assert from 'node:assert/strict';
import { HOSTILE_FIXTURES,runHostileFixture } from './fixtures.mjs';
for(const name of HOSTILE_FIXTURES)test(`Reassurance Assay: ${name}`,t=>{
 const result=runHostileFixture(t,name),r=result.returned;
 assert.equal(result.assertions.admission_created_attempt,false);assert.equal(result.assertions.attempt_created_occurrence,false);
 assert.equal(result.assertions.settlement_created,false);assert.equal(result.assertions.original_effect_retained,true);
 assert.ok(result.claimReconstructions.every(c=>c.basis_ref&&c.artifact_kind));
 if(name==='irreversible-revocation'){assert.equal(result.ack.acknowledged,true);assert.equal(result.ack.future_exercise_disabled,true);assert.equal(result.rejected.attempt,null);assert.equal(result.snapshot.assay.ConfidenceCalibration.established,false);}
 if(name==='unknown-occurrence'){assert.equal(result.transport.code,'NETWORK_PARTITION');assert.equal(r.occurrence_knowledge,'UNKNOWN');assert.equal(r.outcome_assessment.status,'UNRESOLVED');assert.equal(r.return_completeness,'PARTIAL');}
 if(name==='complete-unknown'){assert.equal(r.return_completeness,'COMPLETE');assert.equal(r.occurrence_knowledge,'UNKNOWN');assert.equal(r.outcome_assessment.status,'UNRESOLVED');assert.ok(r.outstanding_obligations.length);}
 if(name==='failed-objective'){assert.equal(r.occurrence_knowledge,'KNOWN_OCCURRED');assert.equal(r.outcome_assessment.status,'FAILED_OBJECTIVE');}
});
