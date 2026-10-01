import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { setup, signed } from './helpers/local-field.mjs';
import { bilateral } from './helpers/bilateral-field.mjs';
import { randomUUID } from 'node:crypto';
import { computeArgsHash } from '../security/token-manager.mjs';

test('controlled dispatch performs two independent judgments and admits Return only as an attributed record', async (t) => {
  const x = await bilateral(t), p = x.passage(x.grantBoth());
  assert.equal(typeof x.source.dispatch, 'function', 'source-controlled dispatch is required');
  const result = await x.source.dispatch(p);
  const c = x.x.runtime.inspect(p.body.passage_id), a = x.source.inspect(p.body.passage_id);
  assert.equal(c.decision.context, 'INGRESS');
  assert.equal(a.egress.body.context, 'EGRESS');
  assert.notEqual(c.decision.decision_id, a.egress.body.decision_id);
  assert.equal(c.execution_authority.status, 'AUTHORIZED');
  assert.equal(c.fidelity.status, 'PASS');
  assert.equal(c.occurrence.status, 'OBSERVED');
  assert.equal(result.status, 'ADMITTED_AS_ATTRIBUTED_RECORD');
  assert.equal(result.evidence_status, 'NOT_ADMITTED');
  assert.equal(result.settlement_status, 'UNSETTLED');
  assert.equal(result.truth_status, 'UNESTABLISHED');
  assert.equal(result.residue.length > 0, true);
  assert.throws(() => x.source.admitReturn(a.incoming_return), /REPLAY/);
  assert.deepEqual(x.restartSource().inspect(p.body.passage_id).return_ingress, result);
});

test('A egress cannot replace missing B authority and raw ingress cannot bypass controlled egress', async (t) => {
  const x = await bilateral(t), g = x.grantBoth(), p = x.passage(g);
  assert.equal(typeof x.source.dispatch, 'function', 'source-controlled dispatch is required');
  assert.throws(() => x.x.runtime.admit(p), /CONTROLLED_EGRESS_REQUIRED/);
  x.x.control('revocation', { grant_id: g.grant_id });
  await assert.rejects(x.source.dispatch(p), /AUTHORITY_REVOKED/);
  assert.equal(existsSync(join(x.root, 'artifacts', 'hello.txt')), false);
  assert.equal(x.source.inspect(p.body.passage_id).egress.body.status, 'EMIT_AUTHORIZED');
  assert.equal(x.x.runtime.inspect(p.body.passage_id).decision, null);
});

test('missing source warrant emits nothing even if B has authority', async (t) => {
  const x = await bilateral(t), p = x.passage(x.x.grant());
  assert.equal(typeof x.source.dispatch, 'function', 'source-controlled dispatch is required');
  await assert.rejects(x.source.dispatch(p), /AUTHORITY_MISSING/);
  assert.equal(x.x.runtime.status().passages.length, 0);
  assert.equal(x.source.inspect(p.body.passage_id).egress, null);
});

test('independent Return admission refuses forged attribution and signed contradictions in native proof', async (t) => {
  const x = await bilateral(t), p = x.passage(x.grantBoth());
  await x.source.dispatch(p);
  const transit = x.source.inspect(p.body.passage_id).incoming_return;
  const forged = structuredClone(transit);
  forged.body.chain.return.correlation_id = 'wrong-correlation';
  assert.throws(() => x.source.admitReturn(forged), /SIGNATURE/);
  const contradictory = structuredClone(transit.body);
  contradictory.chain.execution_authority.status = 'DENIED';
  assert.throws(() => x.source.admitReturn(signed(contradictory, x.b)), /RETURN_NATIVE_PROOF/);
  const wrongOrigin = structuredClone(transit.body);
  wrongOrigin.chain.passage.body.passage_id = 'a-different-origin';
  assert.throws(() => x.source.admitReturn(signed(wrongOrigin, x.b)), /RETURN_ORIGIN/);
});

test('Return signature and membership without a current Return warrant cannot acquire admission', async (t) => {
  const x = await bilateral(t), p = x.passage(x.grantBoth());
  await x.source.dispatch(p);
  x.sourceControl('revocation', { grant_id: x.x.definition.body.return_authority_basis });
  // A fresh source intent is emitted, but A independently refuses its Return.
  const q = x.passage(x.grantBoth({ target: 'second.txt' }), { target: 'second.txt' });
  await assert.rejects(x.source.dispatch(q), /AUTHORITY_REVOKED/);
  assert.equal(x.source.inspect(q.body.passage_id).return_ingress, null);
  assert.equal(x.x.runtime.inspect(q.body.passage_id).occurrence.status, 'OBSERVED');
});

test('an unfinished dispatch survives restart with residue and no retransmission or new permission', async (t) => {
  const x = await bilateral(t), g = x.grantBoth(), p = x.passage(g);
  x.x.control('revocation', { grant_id: g.grant_id });
  await assert.rejects(x.source.dispatch(p), /REVOKED/);
  const before = x.x.runtime.status();
  x.restartSource();
  assert.equal(x.source.status().outgoing[0].phase, 'UNSETTLED');
  assert.equal(x.source.inspect(p.body.passage_id).dispatch_residue.status, 'UNSETTLED');
  await assert.rejects(x.source.dispatch(p), /REPLAY/);
  assert.deepEqual(x.x.runtime.status(), before);
});

test('bounded Return standing is spent independently at both Return boundaries', async (t) => {
  const x = await bilateral(t, { returnMaxUses: 1 }), p = x.passage(x.grantBoth());
  await x.source.dispatch(p);
  const grantId = x.x.definition.body.return_authority_basis;
  assert.equal(x.source.status().bindings.find(g => g.grant_id === grantId).uses, 1);
  assert.equal(x.x.runtime.status().bindings.find(g => g.grant_id === grantId).uses, 1);
  const q = x.passage(x.grantBoth({ target: 'second.txt' }), { target: 'second.txt' });
  await assert.rejects(x.source.dispatch(q), /AUTHORITY_SPENT/);
});

test('expired enrollment cannot authorize a new passage or an already admitted operation', async (t) => {
  const x = setup(t), g = { ...x.grant(), grant_id: randomUUID() };
  const expires_at = new Date(Date.now() + 3600000).toISOString();
  x.runtime.control(signed({ ...x.stamp(), expires_at, type: 'grant', issuer: 'I-1', grant: g }, x.human));
  const p = x.passage(g, { expires_at });
  x.runtime.admit(p);
  const originalNow = Date.now;
  Date.now = () => originalNow() + 601000;
  t.after(() => { Date.now = originalNow; });
  const current = () => ({ ...x.stamp(), issued_at: new Date(Date.now() - 1000).toISOString(), expires_at: new Date(Date.now() + 600000).toISOString() });
  const q = signed({ ...p.body, ...current(), passage_id: randomUUID(), nonce: randomUUID() }, x.a);
  assert.throws(() => x.runtime.admit(q), /ENROLLMENT_EXPIRED/);
  assert.throws(() => x.runtime.execute(p.body.passage_id, p), /ENROLLMENT_EXPIRED/);
  assert.equal(x.runtime.inspect(p.body.passage_id).execution_authority.status, 'DENIED');
  assert.equal(x.runtime.status().nodes.every(n => n.status === 'expired'), true);
  assert.equal(existsSync(join(x.root, 'artifacts', 'hello.txt')), false);
});

test('maximally JSON-escaped 4096-byte payload completes native Return rather than failing after effect', async (t) => {
  const x = await bilateral(t), payload = { content: '\u0000'.repeat(4096) };
  const p = x.passage(x.grantBoth(), { payload, payload_hash: computeArgsHash(payload) });
  assert.equal(Buffer.byteLength(payload.content), 4096);
  const result = await x.source.dispatch(p);
  assert.equal(result.status, 'ADMITTED_AS_ATTRIBUTED_RECORD');
  assert.equal(x.x.runtime.inspect(p.body.passage_id).occurrence.bytes, 4096);
  assert.equal(x.source.inspect(p.body.passage_id).return_ingress.return_id, x.x.runtime.inspect(p.body.passage_id).return.return_id);
});

test('equal projected file endpoints do not erase different occurrence paths or unsettled residue', async (t) => {
  const x = await bilateral(t), g = x.grantBoth(), p = x.passage(g);
  await x.source.dispatch(p);
  const before = readFileSync(join(x.root, 'artifacts', 'hello.txt'), 'utf8');
  const q = x.passage(g);
  const returned = await x.source.dispatch(q);
  assert.equal(readFileSync(join(x.root, 'artifacts', 'hello.txt'), 'utf8'), before);
  assert.equal(x.x.runtime.inspect(p.body.passage_id).return.outcome, 'OBSERVED');
  assert.equal(x.x.runtime.inspect(q.body.passage_id).return.outcome, 'FAILED');
  assert.equal(x.x.runtime.inspect(q.body.passage_id).occurrence.status, 'UNKNOWN');
  assert.equal(returned.settlement_status, 'UNSETTLED');
  assert.equal(returned.residue.length > 0, true);
});

for (const extra of [{ schema_version: 'future' }, { silent_authority_extension: true }])
  test('bilateral unknown semantics cannot silently expand authority: ' + JSON.stringify(extra), async (t) => {
    const x = await bilateral(t), p = x.passage(x.grantBoth(), extra);
    assert.equal(typeof x.source.dispatch, 'function', 'source-controlled dispatch is required');
    await assert.rejects(x.source.dispatch(p), /SCHEMA|EXTENSION/);
    assert.equal(x.x.runtime.status().passages.length, 0);
  });

test('point-of-use authority is distinct from ingress and fidelity in the native effect proof', (t) => {
  const x = setup(t), p = x.passage(x.grant());
  x.runtime.admit(p);
  x.runtime.execute(p.body.passage_id, p);
  const c = x.runtime.inspect(p.body.passage_id);
  assert.equal(c.execution_authority?.status, 'AUTHORIZED');
  assert.equal(c.fidelity.status, 'PASS');
  assert.equal(new Set([c.decision.decision_id, c.execution_authority.decision_id, c.fidelity.fidelity_id]).size, 3);
  assert.deepEqual(c.receipt_artifacts.execution.result.execution_authority, c.execution_authority);
  assert.equal(x.runtime.verify(p.body.passage_id).valid, true);
});

test('revocation after ingress records denied current authority without an attempt or effect', (t) => {
  const x = setup(t), g = x.grant(), p = x.passage(g);
  x.runtime.admit(p);
  x.control('revocation', { grant_id: g.grant_id });
  assert.throws(() => x.runtime.execute(p.body.passage_id, p), /REVOKED/);
  const c = x.runtime.inspect(p.body.passage_id);
  assert.equal(c.execution_authority?.status, 'DENIED');
  assert.equal(c.decision.status, 'ADMITTED');
  assert.equal(c.attempt, null);
  assert.equal(existsSync(join(x.root, 'artifacts', 'hello.txt')), false);
});
