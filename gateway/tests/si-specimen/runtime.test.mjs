import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { setup, signed } from '../helpers/local-field.mjs';
import { hash as objectHash } from '../../security/local-field-authority.mjs';
import { verifySignature } from '../../security/ed25519.mjs';
import { canonicalizeArgs } from '../../security/token-manager.mjs';
import { fixedSubstrate, directMatrix, compileRelations, prepareDirect, fingerprint as hash, PROFILE } from '../../local-field/relations/index.mjs';

export function researchFixture(t, { enabled = true, admit = true } = {}) {
  const substrate = fixedSubstrate(), matrix = directMatrix('research-direct-runtime', substrate);
  const plan = compileRelations(matrix, substrate);
  const f = setup(t, 'model_runtime', {}, {}, enabled ? { dependencies: { corpus: 'v1', 'si-specimen-001': hash(substrate) } } : {});
  const matrix_candidate_id = randomUUID();
  f.runtime.candidate(signed({ ...f.stamp(), type: 'candidate', source_node: 'node-a',
    candidate_id: matrix_candidate_id, kind: 'proposal',
    content: { profile: PROFILE, kind: 'relation-matrix', matrix, substrate } }, f.a));
  if (admit) f.control('dependency', { name: `relation-plan:${matrix.matrix_id}`, value: plan.plan_hash });
  const sources = [
    { source_id: 'authority', title: 'Authority fixture', uri: 'fixture:authority', text: 'Node capability does not imply authority. Current authority is checked before execution.' },
    { source_id: 'return', title: 'Return fixture', uri: 'fixture:return', text: 'Return preserves receipt and observation linkage. Receipt attribution does not establish truth or settlement.' },
  ];
  const human_intent = signed({ ...f.stamp(), type: 'research_intent', issuer: 'I-1',
    source_node: 'node-a', target_node: 'node-b', target: 'hello.txt', action: 'create_document',
    scope: 'artifact-create', purpose: 'acceptance', query: 'How do authority and Return preserve observations?',
    sources_hash: hash(sources), plan_hash: plan.plan_hash, substrate_hash: plan.substrate_hash }, f.human);
  const run_id = randomUUID();
  const content = { ...prepareDirect({ matrix, substrate, human_intent, sources, run_id }), matrix_candidate_id };
  const candidate_id = randomUUID();
  const put = (value = content) => f.runtime.candidate(signed({ ...f.stamp(), type: 'candidate',
    source_node: 'node-a', candidate_id, kind: 'recommended_action', content: value }, f.a));
  const grant = f.grant({ payload_hash: objectHash(content.payload), max_uses: 1 });
  const passage = () => f.passage(grant, { payload: content.payload, payload_hash: objectHash(content.payload),
    origin: { intent: human_intent.body.query, candidate_id } });
  return { ...f, get runtime() { return f.runtime; }, substrate, matrix, plan, content, candidate_id,
    matrix_candidate_id, grant, put, passage, artifact: join(f.root, 'artifacts/hello.txt'), restart: () => f.restart() };
}

test('compilation and candidate storage cannot self-install a topology', t => {
  const f = researchFixture(t, { admit: false });
  f.put();
  assert.throws(() => f.runtime.admit(f.passage()), /RELATION_CONFIGURATION_NOT_ADMITTED/);
  assert.equal(existsSync(f.artifact), false);
  assert.throws(() => f.control('dependency', { name: `relation-plan:${f.matrix.matrix_id}`, value: f.plan.plan_hash }, f.a, 'node-a'), /DEPENDENCY_CONTROL_INVALID/);
});

test('Direct uses native RIO, fidelity, occurrence, receipt and Return with all eight traversals', t => {
  const f = researchFixture(t);
  f.put();
  const p = f.passage(), decision = f.runtime.admit(p);
  assert.equal(decision.relation_binding.plan_hash, f.plan.plan_hash);
  const returned = f.runtime.execute(p.body.passage_id, p), chain = f.runtime.inspect(p.body.passage_id);
  assert.equal(returned.outcome, 'OBSERVED');
  assert.equal(readFileSync(f.artifact, 'utf8'), f.content.payload.content);
  assert.equal(chain.execution_authority.status, 'AUTHORIZED');
  assert.equal(chain.fidelity.status, 'PASS');
  assert.equal(f.runtime.verify(p.body.passage_id).valid, true);
  assert.equal(chain.relation_run.body.traversals.length, 8);
  assert.equal(chain.relation_run.body.settlement_status, 'UNSETTLED');
  assert.ok(verifySignature(canonicalizeArgs(chain.relation_run.body), chain.relation_run.signature, f.b.publicKey));
  assert.ok(chain.relation_run.body.traversals.every(r => r.return_linkage.return_id === returned.return_id));
  assert.equal(chain.relation_run.body.traversals[5].witness_event.occurrence_id, chain.occurrence.occurrence_id);
  assert.equal(chain.receipt_artifacts.governance.checks.decision.relation_binding.candidate_id, f.candidate_id);
});

test('configuration revocation after ingress blocks the point-of-use consequence', t => {
  const f = researchFixture(t);
  f.put();
  const p = f.passage();
  f.runtime.admit(p);
  f.control('dependency', { name: `relation-plan:${f.matrix.matrix_id}`, value: 'REVOKED' });
  assert.throws(() => f.runtime.execute(p.body.passage_id, p), /RELATION_CONFIGURATION_NOT_ADMITTED/);
  assert.equal(existsSync(f.artifact), false);
  const chain = f.runtime.inspect(p.body.passage_id);
  assert.equal(chain.execution_authority.status, 'DENIED');
  assert.equal(chain.relation_run.body.outcome, 'FIDELITY_HOLD');
  assert.equal(chain.relation_run.body.traversals.length, 5);
});

test('a source signature cannot make altered synthesis or provenance conformant', t => {
  const f = researchFixture(t);
  const changed = structuredClone(f.content);
  changed.synthesis.findings[0].text = 'An unsupported conclusion';
  f.put(changed);
  assert.throws(() => f.runtime.admit(f.passage()), /RELATION_CANDIDATE_MISMATCH/);
  assert.equal(existsSync(f.artifact), false);
});

test('the pinned substrate cannot change at execution time', t => {
  const f = researchFixture(t);
  f.put();
  const p = f.passage();
  f.runtime.admit(p);
  f.control('dependency', { name: 'si-specimen-001', value: 'different-substrate' });
  assert.throws(() => f.runtime.execute(p.body.passage_id, p), /SUBSTRATE_DRIFT/);
  assert.equal(existsSync(f.artifact), false);
});

test('root formation intent and exact action grants remain distinct requirements', t => {
  const f = researchFixture(t);
  const changed = structuredClone(f.content);
  changed.human_intent = signed(changed.human_intent.body, f.a);
  f.put(changed);
  assert.throws(() => f.runtime.admit(f.passage()), /SIGNATURE/);
  assert.equal(existsSync(f.artifact), false);
});

test('an unconfigured field cannot silently treat a tagged specimen as ordinary execution', t => {
  const f = researchFixture(t, { enabled: false });
  f.put();
  assert.throws(() => f.runtime.admit(f.passage()), /RELATION_NOT_CONFIGURED/);
});

test('restart reconstructs the same Return without regenerating permission or effect', t => {
  const f = researchFixture(t);
  f.put();
  const p = f.passage();
  f.runtime.admit(p);
  f.runtime.execute(p.body.passage_id, p);
  const before = f.runtime.inspect(p.body.passage_id);
  f.restart();
  assert.deepEqual(f.runtime.inspect(p.body.passage_id), before);
  assert.equal(f.runtime.verify(p.body.passage_id).valid, true);
  assert.throws(() => f.runtime.execute(p.body.passage_id, p), /NOT_ADMITTED/);
  assert.equal(f.runtime.status().attempts.length, 1);
});

test('a current configuration disposition is recorded separately from the ingress disposition', t => {
  const f = researchFixture(t);
  f.put();
  const p = f.passage(), admitted = f.runtime.admit(p);
  f.control('dependency', { name: `relation-plan:${f.matrix.matrix_id}`, value: f.plan.plan_hash });
  f.runtime.execute(p.body.passage_id, p);
  const chain = f.runtime.inspect(p.body.passage_id);
  assert.notEqual(chain.execution_authority.relation_binding.configuration_admission.body.record_id,
    admitted.relation_binding.configuration_admission.body.record_id);
  assert.equal(chain.execution_authority.relation_binding.plan_hash, admitted.relation_binding.plan_hash);
  assert.equal(f.runtime.verify(p.body.passage_id).valid, true);
});

test('configuration admission cannot replace an action grant', t => {
  const f = researchFixture(t);
  f.put();
  f.control('revocation', { grant_id: f.grant.grant_id });
  assert.throws(() => f.runtime.admit(f.passage()), /AUTHORITY_REVOKED/);
  assert.equal(existsSync(f.artifact), false);
});
