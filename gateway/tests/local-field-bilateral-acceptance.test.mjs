import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

test('bilateral acceptance uses two real processes, native proof, independent Return admission, restart and cleanup', t => {
  const outputRoot = mkdtempSync(join(tmpdir(), 'one-bilateral-test-evidence-'));
  t.after(() => rmSync(outputRoot, { recursive: true, force: true }));
  const output = join(outputRoot, 'trace.json');
  const driver = fileURLToPath(new URL('../scripts/run-local-field-bilateral-acceptance.mjs', import.meta.url));
  const run = spawnSync(process.execPath, [driver, output], { timeout: 30000, encoding: 'utf8' });
  assert.equal(run.status, 0, run.stderr || run.stdout);
  const trace = JSON.parse(readFileSync(output));
  assert.notEqual(trace.runtime.node_a.first_pid, trace.runtime.node_b.first_pid);
  assert.notEqual(trace.runtime.node_a.first_pid, trace.runtime.node_a.second_pid);
  assert.notEqual(trace.runtime.node_b.first_pid, trace.runtime.node_b.second_pid);
  assert.equal(trace.chain.execution_authority.status, 'AUTHORIZED');
  assert.equal(trace.source_chain.return_ingress.status, 'ADMITTED_AS_ATTRIBUTED_RECORD');
  assert.equal(trace.source_chain.return_ingress.settlement_status, 'UNSETTLED');
  assert.equal(trace.chain.receipt.receipt_id, trace.source_chain.incoming_return.body.chain.return.receipt_id);
  assert.equal(trace.independent_read.content, 'ONE Local Field v0.1: this file was proposed as model output. A separate signed grant, RIO decision, and point-of-use fidelity check are required before creation. Its existence must be observed and returned with correlated proof.\n');
  assert.equal(trace.pre_state.exists, false);
  assert.equal(trace.restart.same_completed_lineage, true);
  assert.equal(trace.cleanup.key_material_removed, true);
  assert.equal(trace.cleanup.sandbox_removed, true);
});
