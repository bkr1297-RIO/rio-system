import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { decisionContext, possibility, known } from '../helpers/simulation.mjs';
import { setup, signed } from '../helpers/local-field.mjs';
import { bilateral } from '../helpers/bilateral-field.mjs';
import { generateReceipt, sealLocalFieldReceipt, sealLocalFieldReturn, hashIntent,
  hashGovernance, hashAuthorization, hashExecution } from '../../receipts/receipts.mjs';
import { hash as nativeHash } from '../../security/local-field-authority.mjs';
import { fingerprint as hash, FORBIDDEN_CONVERSIONS } from '../../local-field/relations/types.mjs';
import { directMatrix, compileRelations } from '../../local-field/relations/compiler.mjs';
import { compressPossibilities } from '../../local-field/relations/compression.mjs';
import { fixedSubstrate } from '../../local-field/relations/substrate.mjs';
let api;
try { api = await import('../../local-field/relations/transduction.mjs'); }
catch (e) { if (e.code !== 'ERR_MODULE_NOT_FOUND') throw e; }

function formation(context = decisionContext()) {
  assert.equal(typeof api?.transducePossibilities, 'function', 'pure candidate transduction must exist');
  const a = possibility(context), b = possibility(context, 'possibility-b', { prediction: 'A second scheduling path may produce the report.' });
  const c = possibility(context, 'possibility-c'); c.burden.material_risk = known('A different material risk must remain visible.');
  const artifacts = [a, b, c], compression = compressPossibilities(context, artifacts);
  const selected_class_id = compression.classes[0].class_id;
  const input = { context, artifacts, compression, selected_class_id, human_review: null };
  return { ...input, content: api.transducePossibilities(input) };
}
function fixture(t, { review = true, grant = true, configured = true, policyPatch = {} } = {}) {
  const f = setup(t, 'model_runtime', policyPatch, {}, configured ? {
    dependencies: { corpus: 'v1', 'simulation-transduction-f0.1': hash(fixedSubstrate()) },
  } : {});
  const formed = formation();
  const preliminary = formed.content;
  const human_review = review ? signed({ ...f.stamp(), type: 'simulation_decision_review', issuer: 'I-1', source_node: 'node-a',
    context_hash: preliminary.context_hash, compression_hash: preliminary.compression.compression_hash,
    selected_class_id: preliminary.selected_class_id, surface_hash: hash(preliminary.decision_surface),
    request_hash: hash(preliminary.request) }, f.human) : null;
  const { content: unused, ...inputs } = formed;
  const content = api.transducePossibilities({ ...inputs, human_review });
  return completeFixture(f, formed, content, grant);
}
function completeFixture(f, formed, content, hasGrant) {
  const candidate_id = randomUUID();
  const put = (value = content) => f.runtime.candidate(signed({ ...f.stamp(), type: 'candidate', source_node: 'node-a',
    kind: 'recommended_action', candidate_id, content: value }, f.a));
  const g = hasGrant ? f.grant({ payload_hash: nativeHash(content.payload), max_uses: 1 }) : null;
  const passage = (patch = {}) => f.passage(g, { ...content.request, payload: content.payload, payload_hash: nativeHash(content.payload),
    origin: { candidate_id, intent: formed.context.question }, ...patch });
  return { ...f, get runtime() { return f.runtime; }, formed, content, candidate_id, put, passage,
    artifact: join(f.root, 'artifacts/hello.txt'), restart: () => f.restart() };
}

test('pure transduction retains distinct burdens and supplies only a non-authoritative PassageCandidate', () => {
  const f = formation();
  assert.equal(f.content.kind, 'PassageCandidate');
  assert.equal(f.content.authority_effect, 'none');
  assert.equal(f.content.artifacts.length, 3);
  assert.equal(f.content.compression.classes.length, 2);
  assert.equal(f.content.decision_surface.alternatives.length, 1);
  assert.match(f.content.payload.content, /MODEL_DEPENDENT_POSSIBILITY/);
  assert.match(f.content.payload.content, /different material risk/);
  assert.equal(f.content.human_review, null);
  assert.equal(f.content.request.authority_basis, undefined);
});

test('transduction rejects changed membership, artifacts, selected class and forbidden target constructions', () => {
  const f = formation(), input = { context: f.context, artifacts: f.artifacts, compression: f.compression,
    selected_class_id: f.selected_class_id, human_review: null };
  const compression = structuredClone(f.compression); compression.classes[0].members.pop();
  assert.throws(() => api.transducePossibilities({ ...input, compression }), /COMPRESSION_CONFORMANCE/);
  const artifacts = structuredClone(f.artifacts); artifacts[0].prediction = 'Changed after compression.';
  assert.throws(() => api.transducePossibilities({ ...input, artifacts }), /COMPRESSION_CONFORMANCE/);
  assert.throws(() => api.transducePossibilities({ ...input, selected_class_id: 'unknown' }), /SIMULATION_SELECTION/);
  for (const target_kind of ['Evidence', 'Occurrence', 'Authority', 'ExecutionPermit'])
    assert.throws(() => api.transducePossibilities({ ...input, target_kind }), /TRANSDUCTION_FIELDS/);
});

test('the existing Relation Compiler rejects simulation at the Direct consequential edge', () => {
  const matrix = directMatrix('simulation-conversion');
  matrix.relations[4].artifact_type = 'SimulationArtifact';
  assert.throws(() => compileRelations(matrix), /RELATION_TYPE/);
  for (const conversion of ['simulation->evidence', 'simulation->occurrence', 'simulation->authority']) {
    const m = directMatrix('simulation-prohibition');
    m.relations[4].forbidden_conversions = m.relations[4].forbidden_conversions.filter(c => c !== conversion);
    assert.throws(() => compileRelations(m), /RELATION_CONVERSION/);
  }
});

test('a reviewed simulation proposal cannot supply its own action authority', t => {
  const f = fixture(t, { grant: false }); f.put();
  assert.throws(() => f.runtime.admit(f.passage()), /AUTHORITY_MISSING/);
  assert.equal(f.runtime.status().attempts.length, 0);
  assert.equal(existsSync(f.artifact), false);
  assert.throws(() => f.control('grant', { grant: { grant_id: randomUUID() } }, f.a, 'node-a'), /ROOT_AUTHORITY_REQUIRED|GRANT_/);
});

test('an actual grant cannot substitute for the exact reviewed decision surface', t => {
  const f = fixture(t, { review: false }); f.put();
  assert.throws(() => f.runtime.admit(f.passage()), /SIMULATION_REVIEW_REQUIRED/);
  assert.equal(existsSync(f.artifact), false);
});

test('a model-signed review cannot promote an otherwise well-formed proposal', t => {
  const f = fixture(t), altered = structuredClone(f.content);
  altered.human_review = signed(altered.human_review.body, f.a); f.put(altered);
  assert.throws(() => f.runtime.admit(f.passage()), /SIGNATURE/);
  assert.equal(f.runtime.status().attempts.length, 0);
});

test('RIO receives the preserved decision surface and native execution alone produces occurrence and Return', t => {
  const f = fixture(t); f.put(); const p = f.passage(), d = f.runtime.admit(p);
  assert.equal(d.simulation_binding.authority_effect, 'none');
  assert.equal(d.simulation_binding.candidate_id, f.candidate_id);
  assert.equal(f.runtime.status().attempts.length, 0);
  const returned = f.runtime.execute(p.body.passage_id, p), chain = f.runtime.inspect(p.body.passage_id);
  assert.equal(returned.outcome, 'OBSERVED');
  assert.equal(chain.execution_authority.status, 'AUTHORIZED');
  assert.equal(chain.fidelity.status, 'PASS');
  assert.deepEqual(chain.intent.parameters.decision_surface.burden, f.content.decision_surface.burden);
  assert.equal(chain.intent.parameters.decision_surface.alternatives.length, 1);
  assert.equal(readFileSync(f.artifact, 'utf8'), f.content.payload.content);
  assert.equal(chain.decision.simulation_binding.compression_hash, f.content.compression.compression_hash);
  assert.equal(chain.execution_authority.simulation_binding.review_hash, hash(f.content.human_review));
  assert.equal(f.runtime.verify(p.body.passage_id).valid, true);
  assert.equal(f.content.artifacts[0].occurrence_status, 'NOT_OBSERVED');
  f.restart(); assert.deepEqual(f.runtime.inspect(p.body.passage_id), chain);
  assert.throws(() => f.runtime.execute(p.body.passage_id, p), /NOT_ADMITTED/);
});

test('simulated ADMIT cannot override an actual policy denial', t => {
  const f = fixture(t, { policyPatch: { action_classes: [{ class_id: 'blocked', pattern: 'create_document', governance_decision: 'DENY', risk_tier: 'HIGH' }] } });
  const altered = structuredClone(f.content);
  for (const a of altered.artifacts.slice(0, 2)) a.burden.disposition = known('ADMIT');
  // Recompile and root-review the model claim, so the refusal concerns actual RIO.
  const context = altered.context, artifacts = altered.artifacts, compression = compressPossibilities(context, artifacts);
  const seed = api.transducePossibilities({ context, artifacts, compression, selected_class_id: compression.classes[0].class_id, human_review: null });
  const review = signed({ ...f.stamp(), type: 'simulation_decision_review', issuer: 'I-1', source_node: 'node-a',
    context_hash: seed.context_hash, compression_hash: compression.compression_hash, selected_class_id: seed.selected_class_id,
    surface_hash: hash(seed.decision_surface), request_hash: hash(seed.request) }, f.human);
  const content = api.transducePossibilities({ context, artifacts, compression, selected_class_id: seed.selected_class_id, human_review: review });
  f.put(content);
  const grant = f.grant({ payload_hash: nativeHash(content.payload), max_uses: 1 });
  assert.throws(() => f.runtime.admit(f.passage({ payload: content.payload, payload_hash: nativeHash(content.payload),
    authority_basis: grant.grant_id })), /RIO_DENIED_OR_HELD/);
  assert.equal(existsSync(f.artifact), false);
});

test('changed operation and forged compression cannot traverse a reviewed proposal', t => {
  const f = fixture(t); f.put();
  assert.throws(() => f.runtime.admit(f.passage({ target: 'other.txt' })), /SIMULATION_PASSAGE_BINDING/);
  assert.equal(existsSync(join(f.root, 'artifacts/other.txt')), false);
  const changed = fixture(t); const altered = structuredClone(changed.content); altered.compression.classes[0].members = [];
  changed.put(altered);
  assert.throws(() => changed.runtime.admit(changed.passage()), /COMPRESSION_CONFORMANCE/);
});

test('review expiry after ingress blocks execution without assuming non-occurrence', t => {
  const f = fixture(t), altered = structuredClone(f.content), now = Date.now;
  altered.human_review.body.expires_at = new Date(now() + 10000).toISOString();
  altered.human_review = signed(altered.human_review.body, f.human); f.put(altered);
  const p = f.passage(); f.runtime.admit(p);
  Date.now = () => now() + 20000;
  try { assert.throws(() => f.runtime.execute(p.body.passage_id, p), /EXPIRED_OR_INVALID_TIME/); }
  finally { Date.now = now; }
  assert.equal(f.runtime.inspect(p.body.passage_id).execution_authority.status, 'DENIED');
  assert.equal(f.runtime.status().attempts.length, 0);
  assert.equal(existsSync(f.artifact), false);
});

test('dependency drift and revocation remain current point-of-use requirements', t => {
  for (const control of ['dependency', 'revocation']) {
    const f = fixture(t); f.put(); const p = f.passage(); f.runtime.admit(p);
    if (control === 'dependency') f.control('dependency', { name: 'corpus', value: 'v2' });
    else f.control('revocation', { grant_id: p.body.authority_basis });
    assert.throws(() => f.runtime.execute(p.body.passage_id, p), /DEPENDENCY_CHANGED|AUTHORITY_REVOKED/);
    assert.equal(f.runtime.status().attempts.length, 0);
    assert.equal(existsSync(f.artifact), false);
  }
});

test('opaque authority and occurrence claims stay non-authoritative through public candidate interfaces', t => {
  const f = setup(t, 'model_runtime'), id = randomUUID();
  const before = f.runtime.status();
  f.runtime.candidate(signed({ ...f.stamp(), type: 'candidate', source_node: 'node-a', candidate_id: id,
    kind: 'candidate', content: { kind: 'ExecutionPermit', authority_basis: 'invented', disposition: 'ADMIT', occurrence: 'predicted-success' } }, f.a));
  assert.throws(() => f.runtime.admit(f.passage(null, { origin: { candidate_id: id, intent: 'Claimed permission' } })), /AUTHORITY_MISSING/);
  assert.deepEqual(f.runtime.status().bindings, before.bindings);
  assert.equal(f.runtime.status().attempts.length, 0);
});

test('transduction refuses an oversized report instead of dropping an alternative burden', () => {
  const context = decisionContext(), artifacts = Array.from({ length: 5 }, (_, i) => {
    const a = possibility(context, `large-alternative-${i}`); a.burden.material_risk = known(`Distinct risk ${i}`); return a;
  });
  const compression = compressPossibilities(context, artifacts);
  assert.equal(compression.classes.length, 5);
  assert.throws(() => api.transducePossibilities({ context, artifacts, compression,
    selected_class_id: compression.classes[0].class_id, human_review: null }), /SIMULATION_RESOURCE_LIMIT/);
});

test('the human-constituted formation boundary cannot be bypassed by dropping a model-controlled profile tag', t => {
  const f = fixture(t), changed = structuredClone(f.content);
  delete changed.profile;
  f.put(changed);
  assert.throws(() => f.runtime.admit(f.passage()), /SIMULATION_CANDIDATE_FIELDS/);
  assert.equal(f.runtime.status().attempts.length, 0);
  assert.equal(existsSync(f.artifact), false);
});

test('a source cannot activate a simulation crossing merely by adding its own profile tag', t => {
  const f = fixture(t, { configured: false }); f.put();
  assert.throws(() => f.runtime.admit(f.passage()), /SIMULATION_NOT_CONFIGURED/);
  assert.equal(existsSync(f.artifact), false);
});

test('root configuration revocation remains effective after simulation ingress', t => {
  const f = fixture(t); f.put(); const p = f.passage(); f.runtime.admit(p);
  f.control('dependency', { name: 'simulation-transduction-f0.1', value: 'REVOKED' });
  assert.throws(() => f.runtime.execute(p.body.passage_id, p), /SUBSTRATE_DRIFT/);
  assert.equal(f.runtime.status().attempts.length, 0);
  assert.equal(existsSync(f.artifact), false);
});

test('historical simulation Return reconstructs against the retained candidate and rejects a decision-surface contradiction', t => {
  const f = fixture(t), candidate = f.put(), p = f.passage(); f.runtime.admit(p); f.runtime.execute(p.body.passage_id, p);
  const chain = f.runtime.inspect(p.body.passage_id);
  assert.equal(api.verifySimulationReturn(chain, candidate, { anchor: f.anchor, field: f.definition.body }), true);
  const changed = structuredClone(chain); changed.intent.parameters.decision_surface.burden.material_risk = known('No risk, by model claim.');
  assert.throws(() => api.verifySimulationReturn(changed, candidate, { anchor: f.anchor, field: f.definition.body }), /SIMULATION_RETURN_CONFORMANCE/);
});

test('public Return admission refuses a receiver-resealed receipt whose surface contradicts the reviewed native intent', async t => {
  const f = await bilateral(t, { nodeType: 'model_runtime', fieldPatch: {
    dependencies: { corpus: 'v1', 'simulation-transduction-f0.1': hash(fixedSubstrate()) },
  } });
  const formed = formation(decisionContext({ return_requirement: { required: true, to: 'node-a' } }));
  const review = signed({ ...f.stamp(), type: 'simulation_decision_review', issuer: 'I-1', source_node: 'node-a',
    context_hash: formed.content.context_hash, compression_hash: formed.compression.compression_hash,
    selected_class_id: formed.selected_class_id, surface_hash: hash(formed.content.decision_surface),
    request_hash: hash(formed.content.request) }, f.human);
  const { content: unused, ...inputs } = formed;
  const content = api.transducePossibilities({ ...inputs, human_review: review });
  const candidate_id = randomUUID();
  const candidate = signed({ ...f.stamp(), type: 'candidate', source_node: 'node-a',
    kind: 'recommended_action', candidate_id, content }, f.a);
  f.runtime.candidate(candidate); f.source.candidate(candidate);
  const g = f.grantBoth({ payload_hash: nativeHash(content.payload), max_uses: 1 });
  const p = f.passage(g, { ...content.request, origin: { candidate_id, intent: formed.context.question } });
  const receive = f.runtime.receive.bind(f.runtime);
  f.runtime.receive = transit => {
    const returned = receive(transit), chain = returned.body.chain, a = chain.receipt_artifacts;
    a.intent.parameters.decision_surface.burden.material_risk = known('CONTRADICTORY UNREVIEWED CLAIM');
    chain.receipt = sealLocalFieldReceipt(generateReceipt({
      intent_hash: hashIntent(a.intent), governance_hash: hashGovernance(a.governance),
      authorization_hash: hashAuthorization(a.authorization), execution_hash: hashExecution(a.execution),
      intent_id: p.body.intent_id, action: p.body.action, agent_id: p.body.subject, authorized_by: f.anchor.principal_id,
    }), { field_id: f.field_id, passage_id: p.body.passage_id, signer_id: 'node-b' }, f.b.secretKey);
    const { attestation, ...returnBody } = chain.return;
    chain.return = sealLocalFieldReturn({ ...returnBody, receipt_id: chain.receipt.receipt_id },
      { field_id: f.field_id, signer_id: 'node-b' }, f.b.secretKey);
    return signed(returned.body, f.b);
  };
  await assert.rejects(f.source.dispatch(p), /RETURN_NATIVE_PROOF_INVALID|SIMULATION_RETURN_CONFORMANCE/);
  assert.equal(f.source.inspect(p.body.passage_id).return_ingress, null);
  assert.equal(f.runtime.inspect(p.body.passage_id).occurrence.status, 'OBSERVED');
  assert.equal(readFileSync(join(f.root, 'artifacts/hello.txt'), 'utf8'), content.payload.content);
});
