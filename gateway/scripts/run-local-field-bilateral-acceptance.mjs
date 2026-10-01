#!/usr/bin/env node
/** Real development-only A→B→A acceptance. Never imported by the runtime. */
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { createInterface } from 'node:readline';
import { mkdirSync, writeFileSync, readFileSync, mkdtempSync, existsSync, rmSync } from 'node:fs';
import { resolve, join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { randomUUID, createHash } from 'node:crypto';
import { generateKeypair, signPayload } from '../security/ed25519.mjs';
import { canonicalizeArgs, computeArgsHash } from '../security/token-manager.mjs';
import { verifyLocalFieldReceipt, verifyLocalFieldReturn } from '../receipts/receipts.mjs';
import { verifyLedgerEntries } from '../ledger/ledger.mjs';

const output = resolve(process.argv[2] || 'local-field-bilateral-trace.json');
const work = mkdtempSync(join(tmpdir(), 'one-bilateral-acceptance-'));
const gateway = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const human = generateKeypair(), a = generateKeypair(), b = generateKeypair();
const field_id = randomUUID(), returnGrantId = randomUUID(), controls = [], logs = [];
const anchor = { principal_id: 'sourcepoint-engineering-fixture', actor_type: 'human', primary_role: 'root_authority', public_key_hex: human.publicKey };
const stamp = () => ({ field_id, record_id: randomUUID(), issued_at: new Date().toISOString(), expires_at: new Date(Date.now() + 3600000).toISOString() });
const signed = (body, key) => ({ body, signature: signPayload(canonicalizeArgs(body), key.secretKey) });
const policy = (action, agent) => ({ policy_id: 'bounded-' + action, policy_version: '0.1', status: 'active',
  scope: { agents: [agent], systems: ['local'] }, action_classes: [{ class_id: action, pattern: action, governance_decision: 'REQUIRE_HUMAN', risk_tier: 'LOW' }] });
const definition = receiver => signed({ ...stamp(), type: 'field', sourcepoint: anchor.principal_id, receiver_node: receiver,
  bilateral_profile: 'local-field-bilateral-v0.1', policy: policy('create_document', 'field-node-a'),
  return_policy: policy('record_return', 'field-node-b'), return_authority_basis: returnGrantId,
  dependencies: { build_contract: 'one-local-field-v0.1' } }, human);
const definitions = { a: definition('field-node-a'), b: definition('field-node-b') };
const nodes = {};
for (const [name, id, key] of [['a','field-node-a',a],['b','field-node-b',b]]) {
  const directory = join(work, name); mkdirSync(directory, { mode: 0o700 });
  writeFileSync(join(directory, 'receiver.key'), key.secretKey, { mode: 0o600 });
  nodes[name] = { id, directory, config: { state_directory: 'state', anchor, receiver_node: id,
    receiver_key_file: 'receiver.key', definition: definitions[name] } };
}
async function start(n) {
  writeFileSync(join(n.directory, 'config.json'), JSON.stringify(n.config), { mode: 0o600 });
  n.child = spawn(process.execPath, ['local-field/cli.mjs','serve',join(n.directory,'config.json')], { cwd: gateway, stdio: ['ignore','pipe','pipe'] });
  n.child.stderr.on('data', x => logs.push(x.toString()));
  const lines = createInterface({ input: n.child.stdout });
  const started = await new Promise((resolveStart, reject) => {
    const timer = setTimeout(() => { n.child.kill('SIGKILL'); reject(new Error('START_TIMEOUT')); }, 10000);
    n.child.once('exit', code => { clearTimeout(timer); reject(new Error('NODE_EXIT:' + code)); });
    lines.on('line', line => { logs.push(line); try { const d = JSON.parse(line); if (d.status === 'LISTENING') { clearTimeout(timer); resolveStart(d); } } catch {} });
  });
  n.url = started.url; return started.pid;
}
async function stop(n, signal = 'SIGTERM') {
  if (!n.child || n.child.exitCode !== null || n.child.signalCode !== null) return;
  const done = once(n.child, 'exit'); n.child.kill(signal); await done;
}
async function send(n, path, record, expected = 200) {
  const response = await fetch(n.url + path, { method: 'POST', body: JSON.stringify(record), redirect: 'error', signal: AbortSignal.timeout(10000) });
  const result = await response.json(); assert.equal(response.status, expected, JSON.stringify(result)); return result;
}
const query = (n, extra = {}) => send(n, '/query', signed({ ...stamp(), type: 'query', issuer: anchor.principal_id, ...extra }, human));
async function control(type, values, targets = [nodes.a,nodes.b]) {
  const c = signed({ ...stamp(), type, issuer: anchor.principal_id, ...values }, human); controls.push(c);
  for (const n of targets) await send(n, '/control', c); return c;
}
let trace;
try {
  const firstB = await start(nodes.b);
  nodes.a.config.peers = { 'field-node-b': nodes.b.url };
  const firstA = await start(nodes.a);
  assert.notEqual(firstA, firstB);
  for (const [id,key,kind,actor,role] of [
    ['field-node-a',a,'model_runtime','ai_agent','proposer'], ['field-node-b',b,'local_service','executor','executor'],
  ]) await control('enrollment', { node: { node_id: id, principal_id: id, node_type: kind, actor_type: actor,
    primary_role: role, secondary_roles: [], public_key_hex: key.publicKey, capabilities: ['create_document','record_return'],
    interfaces: ['http-json'], custody_boundary: id, status: 'active' } });
  await control('grant', { grant: { grant_id: returnGrantId, subject: 'field-node-b', target_node: 'field-node-a', action: 'record_return',
    target: 'return-record', scope: 'attributed-record-only', purpose: 'local-field-return', dependencies: {}, conditions: {}, parent: null, allow_delegation: false, max_uses: null } });
  const modelOutput = JSON.parse(readFileSync(new URL('../local-field/acceptance-model-output.json', import.meta.url)));
  const candidate = signed({ ...stamp(), type: 'candidate', source_node: 'field-node-a', candidate_id: randomUUID(), kind: 'recommended_action', content: modelOutput }, a);
  const candidateA = await send(nodes.a, '/candidates', candidate), candidateB = await send(nodes.b, '/candidates', candidate);
  assert.equal(candidateA.authority_effect, 'none'); assert.equal(candidateB.authority_effect, 'none');
  const directModel = await send(nodes.a, '/dispatch', candidate, 409); assert.match(directModel.error, /PASSAGE/);
  const g = { grant_id: randomUUID(), subject: 'field-node-a', target_node: 'field-node-b', action: 'create_document',
    target: modelOutput.target, scope: 'artifact-create', purpose: 'bounded engineering acceptance', dependencies: { build_contract: 'one-local-field-v0.1' }, conditions: {}, parent: null, allow_delegation: false, max_uses: null };
  const payload = { content: modelOutput.content };
  const passage = () => signed({ ...stamp(), type: 'passage', schema_version: '0.1', replay: 'single-use',
    passage_id: randomUUID(), intent_id: randomUUID(), source_node: g.subject, subject: g.subject, target_node: g.target_node,
    action: g.action, target: g.target, payload, payload_hash: computeArgsHash(payload), authority_basis: g.grant_id,
    scope: g.scope, purpose: g.purpose, dependencies: g.dependencies, conditions: {}, nonce: randomUUID(), correlation_id: randomUUID(),
    return_requirement: { required: true, to: 'field-node-a' },
    origin: { intent: 'Brian / SourcePoint authorized this isolated Local Field engineering build; ephemeral fixture root is not Brian deployed identity.', candidate_id: candidate.body.candidate_id } }, a);
  const noStanding = await send(nodes.a, '/dispatch', passage(), 409); assert.match(noStanding.error, /AUTHORITY_MISSING/);
  const grantRecord = await control('grant', { grant: g });
  const p = passage(), target = join(nodes.b.directory, 'state', 'artifacts', g.target);
  const pre_state = { target, exists: existsSync(target), checked_at: new Date().toISOString() }; assert.equal(pre_state.exists, false);
  const returned = await send(nodes.a, '/dispatch', p);
  assert.equal(returned.status, 'ADMITTED_AS_ATTRIBUTED_RECORD'); assert.equal(returned.evidence_status, 'NOT_ADMITTED'); assert.equal(returned.settlement_status, 'UNSETTLED');
  const chain = await query(nodes.b, { passage_id: p.body.passage_id }), source_chain = await query(nodes.a, { passage_id: p.body.passage_id });
  const observed = readFileSync(target); assert.equal(observed.toString(), payload.content);
  assert.equal(verifyLocalFieldReceipt(chain.receipt, b.publicKey, { field_id, passage_id: p.body.passage_id, signer_id: 'field-node-b' }), true);
  assert.equal(verifyLocalFieldReturn(chain.return, b.publicKey, { field_id, signer_id: 'field-node-b' }), true);
  const replay = await send(nodes.a, '/dispatch', p, 409); assert.match(replay.error, /REPLAY/);
  const revokedB = await control('revocation', { grant_id: g.grant_id }, [nodes.b]);
  const independentIngress = await send(nodes.a, '/dispatch', passage(), 409); assert.match(independentIngress.error, /REVOKED/);
  await control('revocation', { grant_id: g.grant_id }, [nodes.a]);
  const revokedA = await send(nodes.a, '/dispatch', passage(), 409); assert.match(revokedA.error, /REVOKED/);
  const before = { a: await query(nodes.a), b: await query(nodes.b) };
  await stop(nodes.a, 'SIGKILL'); await stop(nodes.b, 'SIGKILL');
  const secondB = await start(nodes.b); nodes.a.config.peers = { 'field-node-b': nodes.b.url }; const secondA = await start(nodes.a);
  assert.notEqual(firstA, secondA); assert.notEqual(firstB, secondB);
  const reconstructed = { a: await query(nodes.a, { passage_id: p.body.passage_id }), b: await query(nodes.b, { passage_id: p.body.passage_id }) };
  assert.deepEqual(reconstructed.a, source_chain); assert.deepEqual(reconstructed.b, chain);
  const after = { a: await query(nodes.a), b: await query(nodes.b) };
  for (const n of ['a','b']) { assert.deepEqual(after[n].field, before[n].field); assert.deepEqual(after[n].nodes, before[n].nodes); assert.deepEqual(after[n].bindings, before[n].bindings); }
  const postRestartRevoked = await send(nodes.a, '/dispatch', passage(), 409); assert.match(postRestartRevoked.error, /REVOKED/);
  const ledger = { a: await query(nodes.a, { view: 'ledger' }), b: await query(nodes.b, { view: 'ledger' }) };
  assert.equal(verifyLedgerEntries(ledger.a).valid, true); assert.equal(verifyLedgerEntries(ledger.b).valid, true);
  trace = { profile: 'local-field-bilateral-v0.1', run_id: randomUUID(), ran_at: new Date().toISOString(),
    evidence_ceiling: 'Real loopback engineering execution, independently keyed services and external readback; no production identity, MANTIS independence, truth, evidence admission, settlement, deployment or constitutional ratification claim.',
    runtime: { node: process.version, platform: process.platform, node_a: { first_pid: firstA, second_pid: secondA }, node_b: { first_pid: firstB, second_pid: secondB } },
    anchor, definitions, controls, grant_record: grantRecord, candidate: candidateA, candidate_b: candidateB, chain, source_chain,
    ledger, status: after, pre_state,
    independent_read: { observer: 'acceptance-driver outside both node processes', status: 'OBSERVATION_NOT_EVIDENCE',
      target: g.target, sha256: createHash('sha256').update(observed).digest('hex'), bytes: observed.length, content: observed.toString() },
    rejections: { direct_model: directModel, capability_without_authority: noStanding, replay, authorized_egress_not_ingress: independentIngress,
      revoked_at_source: revokedA, revoked_after_restart: postRestartRevoked, target_revocation: revokedB },
    restart: { before, reconstructed, after, same_identity: true, same_authority_bindings: true, same_completed_lineage: true, revocation_preserved: true },
    execution_boundary: { class_1: ['Read existing canonical owners and model fixture'], class_2: ['Development-only identities, private sandbox keys/configuration', 'Two loopback subprocesses, real create-only artifact, readback', 'Root-signed enrollment/grants/revocations, process kill/restart, evidence export and exact sandbox cleanup'], class_3_performed: [], unauthorized_class_3_actions: 'NONE' },
  };
} finally {
  await stop(nodes.a); await stop(nodes.b);
  rmSync(work, { recursive: true, force: true });
}
trace.cleanup = { sandbox_removed: !existsSync(work), key_material_removed: !existsSync(work), status: 'COMPLETED' };
assert.equal(trace.cleanup.sandbox_removed, true);
mkdirSync(dirname(output), { recursive: true }); writeFileSync(output, JSON.stringify(trace, null, 2) + '\n');
console.log(JSON.stringify({ status: 'BILATERAL_TRACE_VERIFIED', output, run_id: trace.run_id, passage_id: trace.chain.passage.body.passage_id,
  receipt_id: trace.chain.receipt.receipt_id, return_id: trace.chain.return.return_id, cleanup: trace.cleanup.status }));
