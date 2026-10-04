import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { LocalField } from '../../local-field/index.mjs';
import { setup, signed } from '../helpers/local-field.mjs';
import { computeArgsHash } from '../../security/token-manager.mjs';
import { fixedSubstrate, directMatrix, compileRelations, prepareDirect, fingerprint as hash, PROFILE } from '../../local-field/relations/index.mjs';

async function pair(t, mutate) {
  const substrate = fixedSubstrate(), matrix = directMatrix('return-boundary-direct', substrate), plan = compileRelations(matrix, substrate);
  const returnGrant = randomUUID();
  const f = setup(t, 'model_runtime', {}, {}, {
    bilateral_profile: 'local-field-bilateral-v0.1', return_authority_basis: returnGrant,
    return_policy: { policy_id: 'return-boundary', policy_version: '0.1', status: 'active',
      scope: { agents: ['node-b'], systems: ['local'] },
      action_classes: [{ class_id: 'return', pattern: 'record_return', governance_decision: 'REQUIRE_HUMAN', risk_tier: 'LOW' }] },
    dependencies: { corpus: 'v1', 'si-specimen-001': hash(substrate) },
  });
  const server = createServer(async (req, res) => {
    try {
      const chunks = [];
      for await (const chunk of req) chunks.push(chunk);
      let returned = f.runtime.receive(JSON.parse(Buffer.concat(chunks).toString()));
      mutate(returned.body.chain.relation_run);
      returned = signed(returned.body, f.b);
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify(returned));
    } catch (e) { res.writeHead(409); res.end(JSON.stringify({ error: e.message })); }
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const root = mkdtempSync(join(tmpdir(), 'si-return-source-'));
  const config = { root, anchor: f.anchor, receiver: 'node-a', signingKey: f.a.secretKey,
    definition: signed({ ...f.definition.body, receiver_node: 'node-a' }, f.human),
    peers: { 'node-b': `http://127.0.0.1:${server.address().port}` } };
  let source = new LocalField(config);
  t.after(async () => { source.close(); server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); rmSync(root, { recursive: true, force: true }); });
  const nodeKeys = ['node_id', 'node_type', 'principal_id', 'actor_type', 'primary_role', 'secondary_roles',
    'public_key_hex', 'capabilities', 'interfaces', 'custody_boundary', 'status'];
  for (const node of f.runtime.status().nodes) source.control(signed({ ...f.stamp(), type: 'enrollment', issuer: 'I-1',
    node: Object.fromEntries(nodeKeys.map(key => [key, node[key]])) }, f.human));
  function control(type, values) {
    const record = signed({ ...f.stamp(), type, issuer: 'I-1', ...values }, f.human);
    source.control(record); f.runtime.control(record);
  }
  control('dependency', { name: `relation-plan:${matrix.matrix_id}`, value: plan.plan_hash });
  control('grant', { grant: { grant_id: returnGrant, subject: 'node-b', target_node: 'node-a', action: 'record_return',
    target: 'return-record', scope: 'attributed-record-only', purpose: 'local-field-return', conditions: {}, dependencies: {},
    parent: null, allow_delegation: false, max_uses: null } });
  const matrix_candidate_id = randomUUID(), candidate_id = randomUUID();
  const proposal = signed({ ...f.stamp(), type: 'candidate', source_node: 'node-a', candidate_id: matrix_candidate_id,
    kind: 'proposal', content: { profile: PROFILE, kind: 'relation-matrix', matrix, substrate } }, f.a);
  const sources = [{ source_id: 'return-fixture', title: 'Return boundary', uri: 'fixture:return', text: 'Return attribution does not establish occurrence truth.' }];
  const human_intent = signed({ ...f.stamp(), type: 'research_intent', issuer: 'I-1', source_node: 'node-a', target_node: 'node-b',
    action: 'create_document', target: 'hello.txt', scope: 'artifact-create', purpose: 'acceptance', query: 'Return occurrence truth',
    sources_hash: hash(sources), plan_hash: plan.plan_hash, substrate_hash: plan.substrate_hash }, f.human);
  const content = { ...prepareDirect({ matrix, substrate, human_intent, sources, run_id: randomUUID() }), matrix_candidate_id };
  const candidate = signed({ ...f.stamp(), type: 'candidate', source_node: 'node-a', candidate_id, kind: 'recommended_action', content }, f.a);
  for (const field of [source, f.runtime]) { field.candidate(proposal); field.candidate(candidate); }
  const g = { grant_id: randomUUID(), subject: 'node-a', target_node: 'node-b', action: 'create_document', target: 'hello.txt',
    scope: 'artifact-create', purpose: 'acceptance', dependencies: { corpus: 'v1' }, conditions: {}, parent: null,
    allow_delegation: false, max_uses: 1, payload_hash: computeArgsHash(content.payload) };
  control('grant', { grant: g });
  const p = f.passage(g, { schema_version: '0.1', replay: 'single-use', lineage: [g.grant_id], payload: content.payload,
    payload_hash: g.payload_hash, return_requirement: { required: true, to: 'node-a' }, origin: { intent: human_intent.body.query, candidate_id } });
  return { f, p, get source() { return source; }, resign: body => signed(body, f.b),
    restart() { source.close(); source = new LocalField(config); } };
}

test('a valid receiver signature cannot admit relation claims contradicting the native occurrence', async t => {
  let x;
  x = await pair(t, run => {
    run.body.traversals[5].witness_event.occurrence_id = 'invented-occurrence';
    run.body.native_chain_hash = '0'.repeat(64);
    run.signature = x.resign(run.body).signature;
  });
  await assert.rejects(() => x.source.dispatch(x.p), /RELATION_RETURN_CONFORMANCE/);
  assert.equal(x.source.inspect(x.p.body.passage_id).relation_run, null);
  assert.equal(x.source.inspect(x.p.body.passage_id).return_ingress, null);
  assert.equal(x.source.status().return_ingress_holds.length, 1);
  assert.equal(x.f.runtime.inspect(x.p.body.passage_id).occurrence.status, 'OBSERVED');
  x.restart();
  assert.equal(x.source.status().return_ingress_holds.length, 1);
  assert.equal(x.source.inspect(x.p.body.passage_id).relation_run, null);
  const recovered = x.source.admitReturn(x.f.runtime.inspect(x.p.body.passage_id).return_transit);
  assert.equal(recovered.status, 'ADMITTED_AS_ATTRIBUTED_RECORD');
  assert.equal(x.source.inspect(x.p.body.passage_id).relation_run.body.return_ingress.return_id, recovered.return_id);
  assert.equal(x.f.runtime.status().attempts.length, 1);
});

test('malformed relation proofs are held before admission and cannot poison source recovery', async t => {
  const x = await pair(t, run => { run.signature = 'invalid-run-signature'; });
  await assert.rejects(() => x.source.dispatch(x.p), /SIGNATURE_INVALID/);
  assert.equal(x.source.inspect(x.p.body.passage_id).return_ingress, null);
  x.restart();
  assert.equal(x.source.status().return_ingress_holds.length, 1);
  assert.equal(x.source.inspect(x.p.body.passage_id).relation_run, null);
});
