import { canonicalizeArgs } from '../../security/token-manager.mjs';
import { requireValue } from '../../security/local-field-authority.mjs';
import { fixedSubstrate } from './substrate.mjs';
import { CAPABILITIES, PROFILE, FORBIDDEN_CONVERSIONS, COORDINATES, TEMPORAL_SCOPE, DIRECT,
  MatrixType, RelationType, identifier, exactKeys, freeze, fingerprint as hash } from './types.mjs';

const STAGES = ['Parse', 'Resolve', 'TypeCheck', 'ConstitutionCheck', 'Plan'];
function checkOperations(operations) {
  requireValue(Array.isArray(operations) && operations.length === DIRECT.length, 'RELATION_TYPE');
  const ids = new Set();
  for (const [i, edge] of operations.entries()) {
    RelationType(edge);
    requireValue(!ids.has(edge.relation_id), 'RELATION_ID_DUPLICATE');
    ids.add(edge.relation_id);
    const [source, target, artifact, use] = DIRECT[i];
    requireValue(edge.source === source && edge.target === target && edge.artifact_type === artifact, 'RELATION_TYPE');
    requireValue(edge.permitted_use[0] === use, 'RELATION_USE');
  }
}

/** Validates a compiler artifact. This cannot admit or install configuration. */
export function RelationalPlan(value) {
  exactKeys(value, ['profile', 'matrix_id', 'matrix_hash', 'substrate_hash', 'stages',
    'configuration_status', 'authority_effect', 'operations', 'plan_hash'], 'PLAN_FIELDS');
  identifier(value.matrix_id, 'MATRIX_ID');
  requireValue(value.profile === PROFILE && value.configuration_status === 'PROPOSED' &&
    value.authority_effect === 'none' && hash(value.stages) === hash(STAGES), 'PLAN_STATUS');
  for (const key of ['matrix_hash', 'substrate_hash', 'plan_hash'])
    requireValue(typeof value[key] === 'string' && /^[a-f0-9]{64}$/.test(value[key]), 'PLAN_HASH');
  checkOperations(value.operations);
  const { plan_hash, ...body } = value;
  requireValue(plan_hash === hash(body), 'PLAN_HASH');
  return freeze(structuredClone(value));
}

export function directMatrix(matrix_id, substrate = fixedSubstrate()) {
  return {
    profile: PROFILE, matrix_id, name: 'ResearchSynthesis.Direct', substrate_hash: hash(substrate),
    nodes: CAPABILITIES.map(id => ({ node_id: id, capability: id, standing: 'operational-role-only' })),
    relations: DIRECT.map(([source, target, artifact_type, use], i) => ({
      relation_id: `${matrix_id}:r${i + 1}`, source, target, artifact_type,
      permitted_use: [use], forbidden_conversions: [...FORBIDDEN_CONVERSIONS],
      provenance: { declared_by: 'matrix-candidate', source_ref: PROFILE },
      temporal_scope: { ...TEMPORAL_SCOPE },
      return_requirement: { required: true, linkage: 'native-passage-return' },
      coordinates: { ...COORDINATES },
    })),
  };
}

/** Parse → Resolve → TypeCheck → ConstitutionCheck → Plan. Pure; no installation. */
export function compileRelations(input, substrate = fixedSubstrate()) {
  requireValue(typeof input !== 'string' || Buffer.byteLength(input) <= 65536, 'MATRIX_RESOURCE_LIMIT');
  const parsed = typeof input === 'string' ? JSON.parse(input) : input;
  requireValue(Buffer.byteLength(canonicalizeArgs(parsed)) <= 65536, 'MATRIX_RESOURCE_LIMIT');
  const matrix = MatrixType(parsed);
  requireValue(hash(substrate) === hash(fixedSubstrate()) && matrix.substrate_hash === hash(substrate), 'SUBSTRATE_DRIFT');
  checkOperations(matrix.relations);
  const body = {
    profile: PROFILE, matrix_id: matrix.matrix_id, matrix_hash: hash(matrix),
    substrate_hash: hash(substrate), stages: [...STAGES],
    configuration_status: 'PROPOSED', authority_effect: 'none',
    operations: matrix.relations.map(edge => ({ ...edge })),
  };
  return RelationalPlan({ ...body, plan_hash: hash(body) });
}
