import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

test('production LocalField processes circulate Direct, admit Return, and reconstruct after restart', async t => {
  const driver = new URL('../../scripts/run-si-specimen-001.mjs', import.meta.url);
  assert.ok(existsSync(driver), 'real specimen driver must exist');
  const work = mkdtempSync(join(tmpdir(), 'si-specimen-process-test-'));
  t.after(() => rmSync(work, { recursive: true, force: true }));
  const output = join(work, 'trace.json');
  await promisify(execFile)(process.execPath, [driver.pathname, output], { timeout: 30000 });
  const trace = JSON.parse(readFileSync(output, 'utf8'));
  assert.equal(trace.result, 'SI_SPECIMEN_001_DIRECT_CONFORMANT');
  assert.notEqual(trace.processes.a.initial_pid, trace.processes.b.initial_pid);
  assert.notEqual(trace.processes.a.initial_pid, trace.processes.a.restarted_pid);
  assert.notEqual(trace.processes.b.initial_pid, trace.processes.b.restarted_pid);
  assert.equal(trace.chain.relation_run.body.traversals.length, 8);
  assert.deepEqual(trace.source_chain.relation_run.body.traversals.map(r => r.relation_id),
    trace.matrix.relations.map(r => r.relation_id));
  assert.ok(trace.source_chain.relation_run.body.traversals.every(r =>
    r.artifact_reference.startsWith('sha256:') && r.provenance && r.witness_event && r.return_linkage.return_id));
  assert.equal(trace.source_chain.relation_run.body.traversals.at(-1).witness_event.kind, 'RETURN_INGRESS_EVENT');
  assert.equal(trace.source_chain.relation_run.body.traversals.at(-1).admission_status, 'ADMITTED_AS_ATTRIBUTED_RECORD');
  assert.equal(trace.chain.relation_run.body.traversals.at(-1).admission_status, 'PENDING');
  assert.equal(trace.chain.execution_authority.status, 'AUTHORIZED');
  assert.equal(trace.chain.fidelity.status, 'PASS');
  assert.equal(trace.return_admission.evidence_status, 'NOT_ADMITTED');
  assert.equal(trace.return_admission.settlement_status, 'UNSETTLED');
  assert.deepEqual(trace.return_boundary.source_before, trace.return_boundary.source_after);
  assert.deepEqual(trace.return_boundary.receiver_before, trace.return_boundary.receiver_after);
  assert.equal(trace.return_boundary.home_mutation, 'NOT_INVOKED');
  assert.equal(trace.return_boundary.successor_mutation, 'NOT_INVOKED');
  assert.equal(trace.chain.return.to, 'node-a');
  assert.equal(trace.chain.return.status, 'RETURNED');
  assert.equal(trace.independent_read.content, trace.chain.relation_run.body.candidate.body.content.payload.content);
  assert.equal(trace.restart.same_chain, true);
  assert.equal(trace.restart.attempts_before, trace.restart.attempts_after);
  assert.equal(trace.cleanup.sandbox_removed, true);
  assert.match(trace.rejections.proposal_only.error, /RELATION_CONFIGURATION_NOT_ADMITTED/);
  assert.match(trace.rejections.unauthorized_source.error, /AUTHORITY_MISSING/);
  assert.equal(trace.rejections.replay.error, 'AUTHORITY_SPENT');
});
