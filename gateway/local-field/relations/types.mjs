import { hash as objectHash, requireValue } from '../../security/local-field-authority.mjs';

// The existing canonical hash owner requires an object at the root.
export const fingerprint = value => objectHash({ value });
const hash = fingerprint;

export const PROFILE = 'hlsi.si-specimen-001.v0.1';
export const CAPABILITIES = Object.freeze(['HMI', 'CCI', 'Sensorium', 'Memory', 'Reasoner', 'Tool', 'Witness', 'ReturnEngine']);
export const FORBIDDEN_CONVERSIONS = Object.freeze([
  'source_node_id->authority', 'field_id->authority', 'membership->authority',
  'signature->authority', 'authority_basis_reference->valid_authority',
  'successful_delivery->ingress_admission', 'ingress_admission->current_execution_authority',
  'current_execution_authority->execution_fidelity', 'execution_success->occurrence',
  'occurrence->evidence', 'receipt->truth', 'return_attribution->return_truth',
  'return_receipt->settlement', 'prior_permission->current_permission',
  'lineage->authority', 'correlation->admission',
  'capability->authority', 'connectivity->standing', 'signature->truth',
  'proposal->admitted_configuration', 'receipt->settlement',
  'access->jurisdiction', 'request->exercise', 'participation->jurisdiction',
  'relation->inheritance', 'calibration->inheritance', 'observation->evidence',
  'emergent_capability->emergent_sovereignty', 'topology_proposal->topology_authorization',
  'return_arrival->home_mutation', 'boolean_clearance->typed_authority',
  // Empty Throne forbids self-originating SourceAuthority, while explicitly
  // rooted, bounded operational delegation remains usable at its crossing.
  'interval_state->source_authority', 'delegated_authority->source_authority',
  'relation->authority', 'relation->delegation', 'standing->delegation',
  'delegation->execution', 'influence->jurisdiction', 'learning->delegation',
  'persistence->sovereignty', 'observation->return',
  'simulation->evidence', 'simulation->occurrence', 'simulation->authority',
]);
export const TEMPORAL_SCOPE = Object.freeze({
  binding: 'native-passage', start: 'passage.issued_at', end: 'passage.expires_at',
});
export const COORDINATES = Object.freeze({
  authority: 'passage.authority_basis', admission: 'decision',
  fidelity: 'fidelity', witness: 'occurrence', return: 'return', settlement: 'UNSETTLED',
});
export const DIRECT = Object.freeze([
  ['HMI', 'CCI', 'HumanIntent', 'orient'],
  ['CCI', 'Sensorium', 'ResearchRequest', 'collect'],
  ['Sensorium', 'Memory', 'SourceBundle', 'retain'],
  ['Memory', 'Reasoner', 'ResearchContext', 'synthesize'],
  ['Reasoner', 'Tool', 'SynthesisCandidate', 'propose'],
  ['Tool', 'Witness', 'ExecutionChain', 'observe'],
  ['Witness', 'ReturnEngine', 'WitnessRecord', 'return'],
  ['ReturnEngine', 'HMI', 'SynthesisReturn', 'receive'],
].map(Object.freeze));

export function freeze(value) {
  if (value && typeof value === 'object') {
    for (const item of Object.values(value)) freeze(item);
    Object.freeze(value);
  }
  return value;
}
export function exactKeys(value, keys, code) {
  requireValue(value && typeof value === 'object' && !Array.isArray(value) &&
    hash(Object.keys(value).sort()) === hash([...keys].sort()), code);
}
export function identifier(value, code) {
  requireValue(typeof value === 'string' && /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$/.test(value), code);
}

/** Runtime type contract, not a wire protocol or authority owner. */
export function RelationType(value) {
  exactKeys(value, ['relation_id', 'source', 'target', 'artifact_type', 'permitted_use',
    'forbidden_conversions', 'provenance', 'temporal_scope', 'return_requirement', 'coordinates'], 'RELATION_FIELDS');
  identifier(value.relation_id, 'RELATION_ID');
  requireValue(CAPABILITIES.includes(value.source) && CAPABILITIES.includes(value.target), 'RELATION_ENDPOINT');
  requireValue(typeof value.artifact_type === 'string', 'RELATION_TYPE');
  requireValue(Array.isArray(value.permitted_use) && value.permitted_use.length === 1, 'RELATION_USE');
  requireValue(hash(value.forbidden_conversions) === hash(FORBIDDEN_CONVERSIONS), 'RELATION_CONVERSION');
  exactKeys(value.provenance, ['declared_by', 'source_ref'], 'RELATION_PROVENANCE');
  requireValue(value.provenance.declared_by === 'matrix-candidate' && value.provenance.source_ref === PROFILE, 'RELATION_PROVENANCE');
  requireValue(hash(value.temporal_scope) === hash(TEMPORAL_SCOPE), 'RELATION_TEMPORAL_SCOPE');
  requireValue(hash(value.return_requirement) === hash({ required: true, linkage: 'native-passage-return' }), 'RELATION_RETURN');
  requireValue(hash(value.coordinates) === hash(COORDINATES), 'RELATION_COORDINATES');
  return freeze(structuredClone(value));
}

// A Relation/Matrix instance uses the same runtime contract. No parallel types.
export const Relation = RelationType;
export const Matrix = MatrixType;

export function MatrixType(value) {
  exactKeys(value, ['profile', 'matrix_id', 'name', 'substrate_hash', 'nodes', 'relations'], 'MATRIX_FIELDS');
  identifier(value.matrix_id, 'MATRIX_ID');
  requireValue(value.profile === PROFILE && value.name === 'ResearchSynthesis.Direct', 'MATRIX_PROFILE');
  requireValue(Array.isArray(value.nodes) && value.nodes.length === CAPABILITIES.length, 'MATRIX_NODE');
  for (const [i, node] of value.nodes.entries()) {
    exactKeys(node, ['node_id', 'capability', 'standing'], 'MATRIX_NODE');
    requireValue(node.node_id === CAPABILITIES[i] && node.capability === node.node_id &&
      node.standing === 'operational-role-only', 'MATRIX_NODE');
  }
  requireValue(Array.isArray(value.relations) && value.relations.length === DIRECT.length, 'MATRIX_RELATIONS');
  const ids = new Set();
  for (const edge of value.relations) {
    RelationType(edge);
    requireValue(!ids.has(edge.relation_id), 'RELATION_ID_DUPLICATE');
    ids.add(edge.relation_id);
  }
  return freeze(structuredClone(value));
}
