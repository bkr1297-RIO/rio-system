import test from 'node:test';
import assert from 'node:assert/strict';

let relations;
try { relations = await import('../../local-field/relations/index.mjs'); }
catch (e) { if (e.code !== 'ERR_MODULE_NOT_FOUND') throw e; }
function fixture() {
  assert.equal(typeof relations?.compileRelations, 'function', 'executable relation compiler must exist');
  const substrate = relations.fixedSubstrate();
  const matrix = relations.directMatrix('research-direct-conformance', substrate);
  return { substrate, matrix };
}

test('Direct compiles eight fixed roles into typed operations without installing them', () => {
  const { substrate, matrix } = fixture();
  const plan = relations.compileRelations(JSON.stringify(matrix), substrate);
  assert.deepEqual(plan.stages, ['Parse', 'Resolve', 'TypeCheck', 'ConstitutionCheck', 'Plan']);
  assert.deepEqual(substrate.components.map(c => c.id), ['HMI', 'CCI', 'Sensorium', 'Memory', 'Reasoner', 'Tool', 'Witness', 'ReturnEngine']);
  assert.equal(plan.operations.length, 8);
  assert.equal(plan.authority_effect, 'none');
  assert.equal(plan.configuration_status, 'PROPOSED');
  assert.equal(plan.operations.at(-1).target, 'HMI');
  assert.ok(Object.isFrozen(plan.operations[0]));
});

test('same declared inputs compile reproducibly, independently of object key order', () => {
  const { substrate, matrix } = fixture();
  const reordered = Object.fromEntries(Object.entries(matrix).reverse());
  assert.equal(relations.compileRelations(matrix, substrate).plan_hash, relations.compileRelations(reordered, substrate).plan_hash);
});

test('unknown endpoints and duplicate relation identities cannot enter a plan', () => {
  const { substrate, matrix } = fixture();
  matrix.relations[0].target = 'unregistered-owner';
  assert.throws(() => relations.compileRelations(matrix, substrate), /RELATION_ENDPOINT/);
  matrix.relations[0].target = 'CCI';
  matrix.relations[1].relation_id = matrix.relations[0].relation_id;
  assert.throws(() => relations.compileRelations(matrix, substrate), /RELATION_ID/);
});

test('artifact types and declared topology are checked, not merely copied into telemetry', () => {
  const { substrate, matrix } = fixture();
  matrix.relations[4].artifact_type = 'Occurrence';
  assert.throws(() => relations.compileRelations(matrix, substrate), /RELATION_TYPE/);
  matrix.relations[4].artifact_type = 'SynthesisCandidate';
  matrix.relations[0].target = 'Reasoner';
  assert.throws(() => relations.compileRelations(matrix, substrate), /RELATION_TYPE/);
});

test('each relation must retain its Return obligation and constitutional coordinates', () => {
  const { substrate, matrix } = fixture();
  matrix.relations[2].return_requirement.required = false;
  assert.throws(() => relations.compileRelations(matrix, substrate), /RELATION_RETURN/);
  matrix.relations[2].return_requirement.required = true;
  delete matrix.relations[5].coordinates.fidelity;
  assert.throws(() => relations.compileRelations(matrix, substrate), /RELATION_COORDINATES/);
});

test('operational roles and signatures cannot be promoted to jurisdiction or truth', () => {
  const { substrate, matrix } = fixture();
  matrix.relations[3].permitted_use.push('authorize');
  assert.throws(() => relations.compileRelations(matrix, substrate), /RELATION_USE/);
  matrix.relations[3].permitted_use.pop();
  matrix.relations[7].forbidden_conversions = [];
  assert.throws(() => relations.compileRelations(matrix, substrate), /RELATION_CONVERSION/);
  matrix.relations[7].forbidden_conversions = [...relations.FORBIDDEN_CONVERSIONS];
  matrix.nodes[0].jurisdiction = 'root_authority';
  assert.throws(() => relations.compileRelations(matrix, substrate), /MATRIX_NODE/);
});

test('versions, settings, initial state and budgets are all fixed substrate controls', () => {
  const { substrate, matrix } = fixture();
  for (const mutate of [
    s => { s.components[4].version = 'different'; },
    s => { s.components[4].settings.strategy = 'uncontrolled'; },
    s => { s.initial_state.memory = 'prior-run'; },
    s => { s.budgets.max_sources += 1; },
  ]) {
    const changed = structuredClone(substrate);
    mutate(changed);
    assert.throws(() => relations.compileRelations(matrix, changed), /SUBSTRATE_DRIFT/);
  }
});

test('unsupported or oversized declarations fail closed without producing a plan', () => {
  const { substrate, matrix } = fixture();
  matrix.name = 'ResearchSynthesis.Adaptive';
  assert.throws(() => relations.compileRelations(matrix, substrate), /MATRIX_PROFILE/);
  assert.throws(() => relations.compileRelations(' '.repeat(65537), substrate), /MATRIX_RESOURCE_LIMIT/);
});

test('Relation, Matrix and RelationalPlan expose immutable runtime contracts, not authority', () => {
  const { substrate, matrix } = fixture();
  assert.equal(typeof relations.Relation, 'function');
  assert.equal(typeof relations.Matrix, 'function');
  assert.equal(typeof relations.RelationalPlan, 'function');
  assert.deepEqual(relations.Relation(matrix.relations[0]), matrix.relations[0]);
  assert.deepEqual(relations.Matrix(matrix), matrix);
  const plan = relations.compileRelations(matrix, substrate);
  assert.deepEqual(relations.RelationalPlan(plan), plan);
  assert.throws(() => relations.RelationalPlan({ ...plan, authority_effect: 'root_authority' }), /PLAN_STATUS/);
  assert.throws(() => relations.RelationalPlan({ ...plan, configuration_status: 'ADMITTED' }), /PLAN_STATUS/);
  assert.throws(() => relations.RelationalPlan({ ...plan, plan_hash: '0'.repeat(64) }), /PLAN_HASH/);
});

test('relation temporal scope cannot replace or outlive its native passage boundary', () => {
  const { substrate, matrix } = fixture();
  assert.deepEqual(matrix.relations[0].temporal_scope, {
    binding: 'native-passage', start: 'passage.issued_at', end: 'passage.expires_at',
  });
  matrix.relations[0].temporal_scope.end = 'forever';
  assert.throws(() => relations.compileRelations(matrix, substrate), /RELATION_TEMPORAL_SCOPE/);
  delete matrix.relations[0].temporal_scope;
  assert.throws(() => relations.compileRelations(matrix, substrate), /RELATION_FIELDS/);
});

test('relation participation and calibration cannot accrete inheritance or Boolean clearance', () => {
  const { substrate, matrix } = fixture();
  for (const forbidden of ['relation->inheritance', 'calibration->inheritance',
    'participation->jurisdiction', 'observation->evidence', 'return_arrival->home_mutation']) {
    assert.ok(matrix.relations[0].forbidden_conversions.includes(forbidden), forbidden);
  }
  matrix.relations[0].permitted_use = ['inherit_authority'];
  assert.throws(() => relations.compileRelations(matrix, substrate), /RELATION_USE/);
  matrix.relations[0].permitted_use = ['orient'];
  matrix.nodes[0].inheritance = 'root_authority';
  assert.throws(() => relations.compileRelations(matrix, substrate), /MATRIX_NODE/);
  delete matrix.nodes[0].inheritance;
  matrix.relations[0].has_sovereign_clearance = true;
  assert.throws(() => relations.compileRelations(matrix, substrate), /RELATION_FIELDS/);
});

test('a Matrix without its required Return-to-HMI path cannot compile', () => {
  const { substrate, matrix } = fixture();
  matrix.relations.pop();
  assert.throws(() => relations.compileRelations(matrix, substrate), /MATRIX_RELATIONS/);
});

test('header distinguishes delegated operation from self-originating SourceAuthority', () => {
  const { substrate, matrix } = fixture();
  for (const conversion of ['interval_state->source_authority', 'delegated_authority->source_authority',
    'relation->authority', 'standing->delegation', 'delegation->execution', 'influence->jurisdiction',
    'learning->delegation', 'persistence->sovereignty', 'observation->return']) {
    assert.ok(matrix.relations.every(r => r.forbidden_conversions.includes(conversion)), conversion);
  }
  matrix.nodes[0].standing = 'self-originated-source-authority';
  assert.throws(() => relations.compileRelations(matrix, substrate), /MATRIX_NODE/);
});
