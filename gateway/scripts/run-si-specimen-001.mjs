#!/usr/bin/env node
/** Development-safe specimen driver. The runtime never imports this harness. */
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { createInterface } from 'node:readline';
import { mkdirSync, writeFileSync, readFileSync, mkdtempSync, existsSync, rmSync } from 'node:fs';
import { resolve, join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { randomUUID, createHash } from 'node:crypto';
import { generateKeypair, signPayload, verifySignature } from '../security/ed25519.mjs';
import { canonicalizeArgs, computeArgsHash } from '../security/token-manager.mjs';
import { verifyLocalFieldReceipt, verifyLocalFieldReturn } from '../receipts/receipts.mjs';
import { verifyLedgerEntries } from '../ledger/ledger.mjs';
import { fixedSubstrate, directMatrix, compileRelations, prepareDirect, fingerprint as hash, PROFILE } from '../local-field/relations/index.mjs';

const output = resolve(process.argv[2] || 'si-specimen-001-trace.json');
const work = mkdtempSync(join(tmpdir(), 'si-specimen-001-'));
const gateway = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const human = generateKeypair(), a = generateKeypair(), b = generateKeypair();
const field_id = randomUUID(), returnGrantId = randomUUID(), controls = [];
const substrate = fixedSubstrate(), matrix = directMatrix('si-specimen-001-direct', substrate), plan = compileRelations(matrix, substrate);
const anchor = { principal_id: 'sourcepoint-development-fixture', actor_type: 'human', primary_role: 'root_authority', public_key_hex: human.publicKey };
const stamp = () => ({ field_id, record_id: randomUUID(), issued_at: new Date().toISOString(), expires_at: new Date(Date.now() + 3600000).toISOString() });
const signed = (body, key) => ({ body, signature: signPayload(canonicalizeArgs(body), key.secretKey) });
const policy = (action, agent) => ({ policy_id: `si-specimen-${action}`, policy_version: '0.1', status: 'active',
  scope: { agents: [agent], systems: ['local'] }, action_classes: [{ class_id: action, pattern: action, governance_decision: 'REQUIRE_HUMAN', risk_tier: 'LOW' }] });
const definition = receiver => signed({ ...stamp(), type: 'field', sourcepoint: anchor.principal_id, receiver_node: receiver,
  bilateral_profile: 'local-field-bilateral-v0.1', policy: policy('create_document', 'node-a'),
  return_policy: policy('record_return', 'node-b'), return_authority_basis: returnGrantId,
  dependencies: { 'si-specimen-001': hash(substrate) } }, human);
const nodes = {};
for (const [name, id, key] of [['a', 'node-a', a], ['b', 'node-b', b]]) {
  const directory = join(work, name);
  mkdirSync(directory, { mode: 0o700 });
  writeFileSync(join(directory, 'receiver.key'), key.secretKey, { mode: 0o600 });
  nodes[name] = { directory, config: { state_directory: 'state', anchor, receiver_node: id,
    receiver_key_file: 'receiver.key', definition: definition(id) } };
}
async function start(n) {
  writeFileSync(join(n.directory, 'config.json'), JSON.stringify(n.config), { mode: 0o600 });
  n.child = spawn(process.execPath, ['local-field/cli.mjs', 'serve', join(n.directory, 'config.json')], { cwd: gateway, stdio: ['ignore', 'pipe', 'pipe'] });
  const diagnostics = [];
  n.child.stderr.on('data', data => diagnostics.push(data.toString()));
  const lines = createInterface({ input: n.child.stdout });
  const started = await new Promise((resolveStart, reject) => {
    const timer = setTimeout(() => { n.child.kill('SIGKILL'); reject(new Error('START_TIMEOUT')); }, 10000);
    n.child.once('error', e => { clearTimeout(timer); reject(e); });
    n.child.once('exit', code => { clearTimeout(timer); reject(new Error(`NODE_EXIT:${code} ${diagnostics.join('')}`)); });
    lines.on('line', line => {
      try { const data = JSON.parse(line); if (data.status === 'LISTENING') { clearTimeout(timer); resolveStart(data); } }
      catch { /* ordinary runtime logging is not evidence */ }
    });
  });
  n.url = started.url;
  return started.pid;
}
async function stop(n) {
  if (!n.child || n.child.exitCode !== null || n.child.signalCode !== null) return;
  const done = once(n.child, 'exit'), timeout = setTimeout(() => n.child.kill('SIGKILL'), 5000);
  n.child.kill('SIGTERM');
  try { await done; } finally { clearTimeout(timeout); }
}
async function send(n, route, record, expected = 200) {
  const response = await fetch(n.url + route, { method: 'POST', body: JSON.stringify(record), redirect: 'error', signal: AbortSignal.timeout(10000) });
  const result = await response.json();
  assert.equal(response.status, expected, JSON.stringify(result));
  return result;
}
const query = (n, values = {}) => send(n, '/query', signed({ ...stamp(), type: 'query', issuer: anchor.principal_id, ...values }, human));
async function constitutionalSnapshot(n) {
  const status = await query(n), ledger = await query(n, { view: 'ledger' });
  const governed = new Set(['field', 'enrollment', 'grant', 'revocation', 'dependency']);
  return { field: status.field, nodes: status.nodes, configurations: status.relations.configurations,
    signed_controls: ledger.map(e => JSON.parse(e.detail)).filter(r => governed.has(r.body?.type)) };
}
async function control(type, values) {
  const record = signed({ ...stamp(), type, issuer: anchor.principal_id, ...values }, human);
  controls.push(record);
  for (const n of Object.values(nodes)) await send(n, '/control', record);
  return record;
}
let trace;
try {
  const firstB = await start(nodes.b);
  nodes.a.config.peers = { 'node-b': nodes.b.url };
  const firstA = await start(nodes.a);
  assert.notEqual(firstA, firstB);
  for (const [id, key, kind, actor, role] of [
    ['node-a', a, 'model_runtime', 'ai_agent', 'proposer'], ['node-b', b, 'local_service', 'executor', 'executor'],
  ]) await control('enrollment', { node: { node_id: id, principal_id: id, node_type: kind, actor_type: actor,
    primary_role: role, secondary_roles: [], public_key_hex: key.publicKey, capabilities: ['create_document', 'record_return'],
    interfaces: ['http-json'], custody_boundary: id, status: 'active' } });
  await control('grant', { grant: { grant_id: returnGrantId, subject: 'node-b', target_node: 'node-a',
    action: 'record_return', target: 'return-record', scope: 'attributed-record-only', purpose: 'local-field-return',
    conditions: {}, dependencies: {}, parent: null, allow_delegation: false, max_uses: null } });
  const matrix_candidate_id = randomUUID();
  const proposal = signed({ ...stamp(), type: 'candidate', source_node: 'node-a', candidate_id: matrix_candidate_id,
    kind: 'proposal', content: { profile: PROFILE, kind: 'relation-matrix', matrix, substrate } }, a);
  for (const n of Object.values(nodes)) await send(n, '/candidates', proposal);
  const sources = ['README.md', 'BILATERAL.md'].map((file, i) => ({ source_id: `repository-source-${i + 1}`,
    title: `Local Field ${file}`, uri: `repository:gateway/local-field/${file}`,
    text: readFileSync(join(gateway, 'local-field', file), 'utf8') }));
  const human_intent = signed({ ...stamp(), type: 'research_intent', issuer: anchor.principal_id,
    source_node: 'node-a', target_node: 'node-b', target: 'research-synthesis.txt', action: 'create_document',
    scope: 'research-synthesis-artifact', purpose: 'si-specimen-001',
    query: 'How do authority, occurrence, and Return remain distinct?', sources_hash: hash(sources),
    plan_hash: plan.plan_hash, substrate_hash: plan.substrate_hash }, human);
  const run_id = randomUUID(), candidate_id = randomUUID();
  const content = { ...prepareDirect({ matrix, substrate, human_intent, sources, run_id }), matrix_candidate_id };
  const candidate = signed({ ...stamp(), type: 'candidate', source_node: 'node-a', candidate_id,
    kind: 'recommended_action', content }, a);
  for (const n of Object.values(nodes)) await send(n, '/candidates', candidate);
  const g = { grant_id: randomUUID(), subject: 'node-a', target_node: 'node-b', action: 'create_document',
    target: human_intent.body.target, scope: human_intent.body.scope, purpose: human_intent.body.purpose,
    dependencies: { 'si-specimen-001': hash(substrate) }, conditions: {}, parent: null,
    allow_delegation: false, max_uses: 1, payload_hash: computeArgsHash(content.payload) };
  const passage = () => signed({ ...stamp(), type: 'passage', schema_version: '0.1', passage_id: randomUUID(), intent_id: randomUUID(),
    source_node: 'node-a', subject: 'node-a', target_node: 'node-b', action: g.action, target: g.target,
    payload: content.payload, payload_hash: g.payload_hash, authority_basis: g.grant_id, scope: g.scope, purpose: g.purpose,
    dependencies: g.dependencies, conditions: {}, nonce: randomUUID(), replay: 'single-use', correlation_id: randomUUID(),
    lineage: [g.grant_id], return_requirement: { required: true, to: 'node-a' },
    origin: { intent: human_intent.body.query, candidate_id } }, a);
  const proposal_only = await send(nodes.a, '/dispatch', passage(), 409);
  assert.match(proposal_only.error, /RELATION_CONFIGURATION_NOT_ADMITTED/);
  await control('dependency', { name: `relation-plan:${matrix.matrix_id}`, value: plan.plan_hash });
  const unauthorized_source = await send(nodes.a, '/dispatch', passage(), 409);
  assert.match(unauthorized_source.error, /AUTHORITY_MISSING/);
  await control('grant', { grant: g });
  const p = passage(), target = join(nodes.b.directory, 'state', 'artifacts', g.target);
  assert.equal(existsSync(target), false);
  const source_before = await constitutionalSnapshot(nodes.a), receiver_before = await constitutionalSnapshot(nodes.b);
  const return_admission = await send(nodes.a, '/dispatch', p);
  const source_after = await constitutionalSnapshot(nodes.a), receiver_after = await constitutionalSnapshot(nodes.b);
  assert.deepEqual(source_after, source_before);
  assert.deepEqual(receiver_after, receiver_before);
  const chain = await query(nodes.b, { passage_id: p.body.passage_id });
  const source_chain = await query(nodes.a, { passage_id: p.body.passage_id });
  const observed = readFileSync(target);
  assert.equal(observed.toString('utf8'), content.payload.content);
  assert.equal(chain.occurrence.status, 'OBSERVED');
  assert.equal(chain.execution_authority.status, 'AUTHORIZED');
  assert.equal(chain.fidelity.status, 'PASS');
  assert.equal(chain.relation_run.body.traversals.length, 8);
  assert.equal(chain.relation_run.body.traversals.at(-1).admission_status, 'PENDING');
  assert.equal(source_chain.relation_run.body.traversals.at(-1).admission_status, 'ADMITTED_AS_ATTRIBUTED_RECORD');
  assert.equal(source_chain.relation_run.body.return_ingress.return_id, return_admission.return_id);
  assert.equal(verifySignature(canonicalizeArgs(source_chain.relation_run.body), source_chain.relation_run.signature, a.publicKey), true);
  assert.equal(verifySignature(canonicalizeArgs(chain.relation_run.body), chain.relation_run.signature, b.publicKey), true);
  assert.equal(verifyLocalFieldReceipt(chain.receipt, b.publicKey, { field_id, passage_id: p.body.passage_id, signer_id: 'node-b' }), true);
  assert.equal(verifyLocalFieldReturn(chain.return, b.publicKey, { field_id, signer_id: 'node-b' }), true);
  assert.equal(return_admission.evidence_status, 'NOT_ADMITTED');
  assert.equal(return_admission.settlement_status, 'UNSETTLED');
  const replay = await send(nodes.a, '/dispatch', p, 409);
  // Current authority is checked before nonce reuse: this exact grant has one
  // use, so its exhausted standing is a valid earlier replay refusal.
  assert.equal(replay.error, 'AUTHORITY_SPENT');
  const before = await query(nodes.b);
  assert.equal(before.attempts.length, 1);
  await stop(nodes.a); await stop(nodes.b);
  const secondB = await start(nodes.b);
  nodes.a.config.peers = { 'node-b': nodes.b.url };
  const secondA = await start(nodes.a);
  const reconstructed = await query(nodes.b, { passage_id: p.body.passage_id });
  assert.deepEqual(reconstructed, chain);
  assert.deepEqual(await query(nodes.a, { passage_id: p.body.passage_id }), source_chain);
  const after = await query(nodes.b), ledger = { a: await query(nodes.a, { view: 'ledger' }), b: await query(nodes.b, { view: 'ledger' }) };
  assert.notEqual(firstA, secondA);
  assert.notEqual(firstB, secondB);
  assert.deepEqual(after.nodes, before.nodes);
  assert.equal(after.attempts.length, 1);
  assert.equal(after.relations.substrate_hash, plan.substrate_hash);
  assert.equal(verifyLedgerEntries(ledger.a).valid, true);
  assert.equal(verifyLedgerEntries(ledger.b).valid, true);
  trace = { result: 'SI_SPECIMEN_001_DIRECT_CONFORMANT', profile: PROFILE, run_id, ran_at: new Date().toISOString(),
    evidence_ceiling: 'Development-only keyed LocalField processes; actual bounded file occurrence and attributed Return. No assay, adaptive morphology, whole-host isolation, independent MANTIS witness, truth, settlement, deployment or ratification claim.',
    processes: { a: { initial_pid: firstA, restarted_pid: secondA }, b: { initial_pid: firstB, restarted_pid: secondB } },
    anchor, definition: nodes.b.config.definition, definitions: { a: nodes.a.config.definition, b: nodes.b.config.definition },
    controls, substrate, matrix, plan, proposal, candidate, chain, source_chain, return_admission, ledger,
    return_boundary: { source_before, source_after, receiver_before, receiver_after,
      authority_controls_unchanged: true, home_mutation: 'NOT_INVOKED', successor_mutation: 'NOT_INVOKED' },
    independent_read: { observer: 'driver outside both runtime processes', observation_status: 'OBSERVATION_NOT_EVIDENCE',
      target: g.target, content: observed.toString('utf8'), bytes: observed.length, sha256: createHash('sha256').update(observed).digest('hex') },
    rejections: { proposal_only, unauthorized_source, replay },
    restart: { same_chain: hash(reconstructed) === hash(chain), attempts_before: before.attempts.length, attempts_after: after.attempts.length },
    execution_boundary: { class_1: ['Read public repository source artifacts'], class_2: ['Development keys and identities', 'Two loopback processes', 'Root configuration admission and scoped grants', 'Bounded create-only artifact and external readback', 'Restart, public evidence export and exact temporary cleanup'], class_3_performed: [] },
  };
} finally {
  await stop(nodes.a); await stop(nodes.b);
  rmSync(work, { recursive: true, force: true });
}
trace.cleanup = { sandbox_removed: !existsSync(work), development_key_material_removed: !existsSync(work) };
assert.equal(trace.cleanup.sandbox_removed, true);
mkdirSync(dirname(output), { recursive: true });
const exported = JSON.stringify(trace, null, 2) + '\n';
for (const key of [human, a, b]) assert.equal(exported.includes(key.secretKey), false, 'development private keys must not enter evidence');
writeFileSync(output, exported);
// Separate development trust-anchor artifact for the read-only verifier.
writeFileSync(output + '.root-public-key.txt', human.publicKey + '\n');
console.log(JSON.stringify({ result: trace.result, output, run_id: trace.run_id, passage_id: trace.chain.passage.body.passage_id,
  receipt_id: trace.chain.receipt.receipt_id, return_id: trace.chain.return.return_id }));
