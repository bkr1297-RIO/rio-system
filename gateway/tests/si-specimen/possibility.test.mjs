import test from 'node:test';
import assert from 'node:assert/strict';
import { decisionContext, possibility, known } from '../helpers/simulation.mjs';
let api;
try { api = await import('../../local-field/relations/possibility.mjs'); }
catch (e) { if (e.code !== 'ERR_MODULE_NOT_FOUND') throw e; }
let compression;
try { compression = await import('../../local-field/relations/compression.mjs'); }
catch (e) { if (e.code !== 'ERR_MODULE_NOT_FOUND') throw e; }
const context = decisionContext();
const artifact = () => possibility(context);
const compress = (ctx, artifacts) => {
  assert.equal(typeof compression?.compressPossibilities, 'function', 'burden-preserving compressor must exist');
  return compression.compressPossibilities(ctx, artifacts);
};

test('simulation artifact is immutable model-dependent possibility with no promoted standing', () => {
  assert.equal(typeof api?.SimulationArtifact, 'function', 'typed SimulationArtifact must exist');
  const input = artifact(), result = api.SimulationArtifact(input);
  input.prediction = 'changed';
  assert.equal(result.prediction, 'A create-only report may be written and returned.');
  assert.equal(result.authority_effect, 'none');
  assert.equal(result.occurrence_status, 'NOT_OBSERVED');
  assert.ok(Object.isFrozen(result.burden));
});

test('simulation cannot be reconstructed as evidence, occurrence, authority or an execution permit', () => {
  assert.equal(typeof api?.SimulationArtifact, 'function');
  for (const kind of ['Evidence', 'Occurrence', 'Authority', 'ExecutionPermit'])
    assert.throws(() => api.SimulationArtifact({ ...artifact(), kind }), /SIMULATION_STANDING/);
  assert.throws(() => api.SimulationArtifact({ ...artifact(), evidence_status: 'ADMITTED' }), /SIMULATION_STANDING/);
  assert.throws(() => api.SimulationArtifact({ ...artifact(), authority_basis: 'fabricated' }), /SIMULATION_FIELDS/);
});

test('missing burden and omitted context coordinates cannot count as no burden', () => {
  assert.equal(typeof api?.DecisionContext, 'function');
  const shortened = structuredClone(context); shortened.required_dimensions.pop();
  assert.throws(() => api.DecisionContext(shortened), /DECISION_DIMENSIONS/);
  const absent = artifact(); delete absent.burden.return_burden;
  assert.throws(() => api.SimulationArtifact(absent), /SIMULATION_BURDEN/);
  const unknown = artifact(); unknown.burden.material_risk = { status: 'UNKNOWN', value: null };
  assert.throws(() => api.SimulationArtifact(unknown), /SIMULATION_MISSING_INFORMATION/);
});

test('known equal burdens group while original predictions, identities and provenance remain reconstructable', () => {
  const a = artifact(), b = possibility(context, 'possibility-b', { prediction: 'The same operation may complete via another scheduling path.' });
  const result = compress(context, [a, b]);
  assert.equal(result.classes.length, 1);
  assert.deepEqual(result.classes[0].members.map(m => m.artifact_id), ['possibility-a', 'possibility-b']);
  assert.equal(result.classes[0].equivalence_status, 'DECLARED_BURDEN_EQUIVALENT');
  assert.equal(result.authority_effect, 'none');
  assert.equal(result.artifact_count, 2);
  assert.ok(result.classes[0].members.every(m => m.artifact_hash.length === 64 && m.model_input_hash === a.model.input_hash));
  assert.equal(a.prediction, 'A create-only report may be written and returned.');
});

for (const dimension of context.required_dimensions) test(`compression preserves decision-relevant difference in ${dimension}`, () => {
  const a = artifact(), b = possibility(context, 'possibility-b');
  b.burden[dimension] = known(`different ${dimension}`);
  assert.equal(compress(context, [a, b]).classes.length, 2);
});

test('matching unknowns and conflicts remain separate and visible', () => {
  for (const status of ['UNKNOWN', 'CONFLICTING']) {
    const a = artifact(), b = possibility(context, 'possibility-b');
    for (const x of [a, b]) {
      x.burden.material_risk = { status, value: status === 'UNKNOWN' ? null : ['bounded', 'unbounded'] };
      x.missing_information = ['The material risk is unresolved.'];
    }
    const result = compress(context, [a, b]);
    assert.equal(result.classes.length, 2);
    assert.ok(result.classes.every(c => c.equivalence_status === 'UNRESOLVED_KEEP_DISTINCT'));
    assert.equal(result.unresolved_artifact_count, 2);
  }
});

test('different assumptions, metrology or missing information cannot disappear into one class', () => {
  for (const patch of [ { assumptions: ['A different prerequisite may apply.'] },
    { metrology: { ...artifact().metrology, unmeasured: ['Another excluded burden.'] } },
    { missing_information: ['An additional question remains unanswered.'] } ])
    assert.equal(compress(context, [artifact(), possibility(context, 'possibility-b', patch)]).classes.length, 2);
});

test('compression is reproducible under branch reordering and refuses a different context', () => {
  const a = artifact(), b = possibility(context, 'possibility-b');
  assert.deepEqual(compress(context, [b, a]), compress(context, [a, b]));
  const other = { ...context, question: 'Different decision?' };
  assert.throws(() => compress(other, [a]), /SIMULATION_CONTEXT/);
  assert.throws(() => compress(context, [a, a]), /SIMULATION_ID_DUPLICATE/);
});

test('formation rejects oversized branches, excessive sets and malformed conflicting burdens', () => {
  assert.equal(typeof api?.SimulationArtifact, 'function');
  assert.throws(() => api.SimulationArtifact({ ...artifact(), prediction: 'x'.repeat(9000) }), /SIMULATION_RESOURCE_LIMIT/);
  assert.throws(() => compress(context, Array.from({ length: 33 }, (_, i) => possibility(context, `branch-${i}`))), /SIMULATION_RESOURCE_LIMIT/);
  const bad = artifact(); bad.burden.material_risk = { status: 'CONFLICTING', value: [] }; bad.missing_information = ['Risk unresolved.'];
  assert.throws(() => api.SimulationArtifact(bad), /SIMULATION_CELL/);
});
