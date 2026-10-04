import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { setup, signed } from '../helpers/local-field.mjs';
import { hash as objectHash } from '../../security/local-field-authority.mjs';
import { verifySignature, generateKeypair } from '../../security/ed25519.mjs';
import { canonicalizeArgs } from '../../security/token-manager.mjs';
import { fixedSubstrate, directMatrix, compileRelations, prepareDirect, fingerprint as hash, PROFILE } from '../../local-field/relations/index.mjs';

export function researchFixture(t, { enabled = true, admit = true, actionGrant = true } = {}) {
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
  const grant = actionGrant ? f.grant({ payload_hash: objectHash(content.payload), max_uses: 1 }) : null;
  const passage = () => f.passage(grant, { payload: content.payload, payload_hash: objectHash(content.payload),
    origin: { intent: human_intent.body.query, candidate_id } });
  return { ...f, get runtime() { return f.runtime; }, substrate, matrix, plan, content, candidate_id,
    matrix_candidate_id, grant, issueGrant: f.grant, put, passage, artifact: join(f.root, 'artifacts/hello.txt'), restart: () => f.restart() };
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

function authoritySnapshot(f) {
  const status = f.runtime.status();
  const controls = f.runtime.query(signed({ ...f.stamp(), type: 'query', issuer: 'I-1', view: 'ledger' }, f.human))
    .map(e => JSON.parse(e.detail)).filter(r => ['field', 'grant', 'dependency', 'revocation'].includes(r.body?.type));
  return { field: status.field, bindings: status.bindings, configurations: status.relations.configurations, controls };
}

test('rich typed relation exists without any operational delegation', t => {
  const f = researchFixture(t, { admit: false, actionGrant: false }), before = authoritySnapshot(f);
  f.put();
  assert.equal(f.matrix.relations.length, 8);
  assert.equal(f.content.traversals.length, 5);
  assert.deepEqual(authoritySnapshot(f), before);
  assert.deepEqual(f.runtime.status().bindings, []);
  assert.throws(() => f.runtime.execute(randomUUID(), f.passage()), /NOT_ADMITTED/);
  assert.equal(existsSync(f.artifact), false);
});

test('reasoning and synthesis can finish formation without an execution lease', t => {
  const f = researchFixture(t, { actionGrant: false }), before = authoritySnapshot(f);
  f.put();
  assert.ok(f.content.synthesis.findings.length > 0);
  for (const finding of f.content.synthesis.findings)
    assert.ok(f.content.sources.find(s => s.source_id === finding.source_id).text.includes(finding.text));
  assert.equal(f.content.authority_effect, 'none');
  assert.equal(f.content.traversals.at(-1).return_linkage.status, 'PENDING');
  assert.deepEqual(authoritySnapshot(f), before);
  assert.throws(() => f.runtime.admit(f.passage()), /AUTHORITY_MISSING/);
  assert.equal(f.runtime.status().attempts.length, 0);
  assert.equal(existsSync(f.artifact), false);
});

test('valid derived delegation and ingress admission do not themselves execute', t => {
  const f = researchFixture(t, { actionGrant: false });
  f.put();
  const parent = f.issueGrant({ allow_delegation: true, payload_hash: objectHash(f.content.payload) });
  const child = { ...parent, grant_id: randomUUID(), parent: parent.grant_id, allow_delegation: false, max_uses: 1 };
  f.control('grant', { grant: child, expires_at: new Date(Date.now() + 300000).toISOString() }, f.a, 'node-a');
  const p = signed({ ...f.passage().body, authority_basis: child.grant_id }, f.a);
  const d = f.runtime.admit(p);
  assert.deepEqual(d.authority_lineage, [parent.grant_id, child.grant_id]);
  assert.equal(f.runtime.status().attempts.length, 0);
  assert.equal(existsSync(f.artifact), false);
  assert.equal(f.runtime.inspect(p.body.passage_id).return, null);
});

test('an otherwise valid HLSI grant for another subject cannot release consequence', t => {
  const f = researchFixture(t, { actionGrant: false });
  f.put();
  const grant = f.issueGrant({ subject: 'node-b', payload_hash: objectHash(f.content.payload) });
  const p = signed({ ...f.passage().body, authority_basis: grant.grant_id }, f.a);
  assert.throws(() => f.runtime.admit(p), /AUTHORITY_SUBJECT_MISMATCH/);
  assert.equal(f.runtime.status().attempts.length, 0);
  assert.equal(existsSync(f.artifact), false);
});

test('operational grant expiry after HLSI ingress is checked at the execution crossing', t => {
  const f = researchFixture(t, { actionGrant: false });
  f.put();
  const template = f.issueGrant({ payload_hash: objectHash(f.content.payload) });
  const grant = { ...template, grant_id: randomUUID() }, clock = Date.now;
  const checkedTime = clock() + 200000;
  f.control('grant', { grant, expires_at: new Date(clock() + 100000).toISOString() });
  const p = signed({ ...f.passage().body, authority_basis: grant.grant_id }, f.a);
  f.runtime.admit(p);
  // Deterministic engineering clock; field/configuration/intent stay fresh.
  // This refusal test is not exported as a live occurrence trace.
  Date.now = () => checkedTime;
  try { assert.throws(() => f.runtime.execute(p.body.passage_id, p), /EXPIRED_OR_INVALID_TIME/); }
  finally { Date.now = clock; }
  assert.equal(f.runtime.inspect(p.body.passage_id).execution_authority.status, 'DENIED');
  assert.equal(f.runtime.status().attempts.length, 0);
  assert.equal(existsSync(f.artifact), false);
});

test('operational revocation after HLSI ingress prevents execution', t => {
  const f = researchFixture(t);
  f.put();
  const p = f.passage();
  f.runtime.admit(p);
  f.control('revocation', { grant_id: f.grant.grant_id });
  assert.throws(() => f.runtime.execute(p.body.passage_id, p), /AUTHORITY_REVOKED/);
  assert.equal(f.runtime.status().attempts.length, 0);
  assert.equal(existsSync(f.artifact), false);
});

test('additional enrolled capability does not enlarge operational or source authority', t => {
  const f = researchFixture(t, { actionGrant: false }), before = authoritySnapshot(f);
  const node = { ...f.runtime.status().nodes[0], node_id: 'node-c', principal_id: 'node-c',
    public_key_hex: generateKeypair().publicKey, capabilities: ['create_document', 'compare_sources', 'translate'] };
  for (const key of ['created_at', 'revoked_at']) delete node[key];
  f.control('enrollment', { node });
  assert.equal(f.runtime.status().nodes.length, 3);
  assert.ok(f.runtime.status().nodes[2].capabilities.includes('translate'));
  assert.deepEqual(authoritySnapshot(f), before);
});

test('retaining additional source memory does not change authority state', t => {
  const f = researchFixture(t, { actionGrant: false }), before = authoritySnapshot(f);
  const retained = f.runtime.candidate(signed({ ...f.stamp(), type: 'candidate', source_node: 'node-a',
    candidate_id: randomUUID(), kind: 'observation_claim', content: { sources: f.content.sources } }, f.a));
  assert.deepEqual(retained.body.content.sources, f.content.sources);
  assert.equal(retained.authority_effect, 'none');
  assert.deepEqual(authoritySnapshot(f), before);
});

test('additional realized relation traversals do not accrete authority', t => {
  const f = researchFixture(t, { actionGrant: false }), before = authoritySnapshot(f);
  const ids = new Set();
  for (let i = 0; i < 3; i++) {
    const content = { ...prepareDirect({ matrix: f.matrix, substrate: f.substrate,
      human_intent: f.content.human_intent, sources: f.content.sources, run_id: randomUUID() }),
      matrix_candidate_id: f.matrix_candidate_id };
    const saved = f.runtime.candidate(signed({ ...f.stamp(), type: 'candidate', source_node: 'node-a',
      candidate_id: randomUUID(), kind: 'recommended_action', content }, f.a));
    for (const traversal of saved.body.content.traversals) ids.add(traversal.traversal_id);
  }
  assert.equal(ids.size, 15);
  assert.deepEqual(authoritySnapshot(f), before);
  assert.equal(f.runtime.status().attempts.length, 0);
});

test('persisted formation memory cannot create permission during restart', t => {
  const f = researchFixture(t, { actionGrant: false });
  f.put();
  const before = authoritySnapshot(f);
  f.restart();
  assert.deepEqual(authoritySnapshot(f), before);
  assert.throws(() => f.runtime.admit(f.passage()), /AUTHORITY_MISSING/);
  assert.equal(f.runtime.status().attempts.length, 0);
  assert.equal(existsSync(f.artifact), false);
});

test('delegated operational authority cannot become SourceAuthority through public controls', t => {
  const f = researchFixture(t), before = authoritySnapshot(f);
  assert.throws(() => f.control('grant', { grant: { ...f.grant, grant_id: randomUUID(), parent: null } }, f.a, 'node-a'), /ROOT_REQUIRED/);
  assert.throws(() => f.control('dependency', { name: 'sourcepoint', value: 'node-a' }, f.a, 'node-a'), /DEPENDENCY_CONTROL_INVALID/);
  const node = { ...f.runtime.status().nodes[0], node_id: 'claimed-root', principal_id: 'claimed-root', primary_role: 'root_authority' };
  assert.throws(() => f.control('enrollment', { node }, f.a, 'node-a'), /ROOT_REQUIRED/);
  assert.deepEqual(authoritySnapshot(f), before);
});

test('public claims and forged controls provide no endogenous authority-minting path', t => {
  const f = researchFixture(t, { actionGrant: false }), before = authoritySnapshot(f);
  const claim = f.runtime.candidate(signed({ ...f.stamp(), type: 'candidate', source_node: 'node-a',
    candidate_id: randomUUID(), kind: 'inference', content: { source_authority: 'node-a', self_originated: true } }, f.a));
  assert.equal(claim.authority_effect, 'none');
  assert.throws(() => f.control('source_authority', { principal: 'node-a' }, f.a, 'node-a'), /CONTROL_TYPE_INVALID/);
  assert.throws(() => f.control('dependency', { name: 'sourcepoint', value: 'node-a' }, f.a, 'I-1'), /SIGNATURE_INVALID/);
  assert.deepEqual(authoritySnapshot(f), before);
  assert.equal(f.runtime.grant_itself_authority, undefined);
});
