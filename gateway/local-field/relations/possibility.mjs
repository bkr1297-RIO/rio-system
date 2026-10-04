import { canonicalizeArgs } from '../../security/token-manager.mjs';
import { requireValue } from '../../security/local-field-authority.mjs';
import { exactKeys, identifier, freeze, fingerprint } from './types.mjs';

export const SIMULATION_PROFILE = 'hlsi.simulation-transduction.f0.1';
export const SIMULATION_DEPENDENCY = 'simulation-transduction-f0.1';
export const DECISION_DIMENSIONS = Object.freeze(['disposition', 'authority_requirement', 'material_risk',
  'irreversibility', 'uncertainty_disclosure', 'dependency_requirements', 'return_burden', 'benefit', 'alternatives']);
export const SIMULATION_LIMITS = Object.freeze({ artifacts: 32, artifact_bytes: 16384, set_bytes: 32768,
  candidate_bytes: 49152, prediction_bytes: 8192, output_bytes: 4096 });
const digest = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
const text = (value, max = 1024) => typeof value === 'string' && value.trim().length > 0 && Buffer.byteLength(value) <= max;
const list = (value, required = false) => Array.isArray(value) && value.length <= 32 &&
  (!required || value.length > 0) && value.every(x => text(x));

export function bounded(value, max, code = 'SIMULATION_RESOURCE_LIMIT') {
  requireValue(Buffer.byteLength(canonicalizeArgs({ value })) <= max, code);
}

/** K_d is a formation context, never a grant or live policy. */
export function DecisionContext(value) {
  exactKeys(value, ['kind', 'context_id', 'question', 'request', 'required_dimensions', 'assessment_scope'], 'DECISION_CONTEXT_FIELDS');
  requireValue(value.kind === 'DecisionContext', 'DECISION_CONTEXT_TYPE');
  identifier(value.context_id, 'DECISION_CONTEXT_ID');
  requireValue(text(value.question, 1024) && text(value.assessment_scope, 1024), 'DECISION_CONTEXT_TEXT');
  requireValue(fingerprint(value.required_dimensions) === fingerprint(DECISION_DIMENSIONS), 'DECISION_DIMENSIONS');
  const r = value.request;
  exactKeys(r, ['source_node', 'subject', 'target_node', 'action', 'target', 'scope', 'purpose',
    'dependencies', 'conditions', 'return_requirement'], 'DECISION_REQUEST_FIELDS');
  for (const key of ['source_node', 'subject', 'target_node', 'action', 'target', 'scope', 'purpose'])
    requireValue(text(r[key], 256), 'DECISION_REQUEST_BINDING');
  requireValue(r.subject === r.source_node, 'SUBJECT_BINDING');
  for (const key of ['dependencies', 'conditions'])
    requireValue(r[key] && typeof r[key] === 'object' && !Array.isArray(r[key]), 'DEPENDENCIES_REQUIRED');
  exactKeys(r.return_requirement, ['required', 'to'], 'DECISION_RETURN');
  requireValue(r.return_requirement.required === true && text(r.return_requirement.to, 128), 'RETURN_REQUIRED');
  bounded(value, 4096);
  return freeze(structuredClone(value));
}

/** Supplied prediction material. This constructor cannot create world evidence. */
export function SimulationArtifact(value) {
  requireValue(value?.kind === 'SimulationArtifact' && value.profile === SIMULATION_PROFILE &&
    value.epistemic_status === 'MODEL_DEPENDENT_POSSIBILITY' && value.authority_effect === 'none' &&
    value.occurrence_status === 'NOT_OBSERVED' && value.evidence_status === 'NOT_ADMITTED', 'SIMULATION_STANDING');
  exactKeys(value, ['kind', 'profile', 'artifact_id', 'context_hash', 'epistemic_status', 'authority_effect',
    'occurrence_status', 'evidence_status', 'model', 'prediction', 'assumptions', 'metrology',
    'missing_information', 'burden'], 'SIMULATION_FIELDS');
  identifier(value.artifact_id, 'SIMULATION_ID');
  requireValue(digest(value.context_hash), 'SIMULATION_CONTEXT');
  requireValue(text(value.prediction, SIMULATION_LIMITS.prediction_bytes), 'SIMULATION_RESOURCE_LIMIT');
  requireValue(list(value.assumptions, true), 'SIMULATION_ASSUMPTIONS');
  requireValue(list(value.missing_information), 'SIMULATION_MISSING_INFORMATION');
  const model = value.model;
  exactKeys(model, ['model_id', 'version', 'settings_hash', 'input_hash', 'realization'], 'SIMULATION_MODEL');
  requireValue(text(model.model_id, 128) && text(model.version, 64) && text(model.realization, 128) &&
    digest(model.settings_hash) && digest(model.input_hash), 'SIMULATION_MODEL');
  const m = value.metrology;
  exactKeys(m, ['instrument', 'limitations', 'burden_carrier', 'unmeasured'], 'SIMULATION_METROLOGY');
  requireValue(text(m.instrument, 256) && text(m.burden_carrier, 256) &&
    list(m.limitations, true) && list(m.unmeasured), 'SIMULATION_METROLOGY');
  exactKeys(value.burden, DECISION_DIMENSIONS, 'SIMULATION_BURDEN');
  for (const cell of Object.values(value.burden)) {
    exactKeys(cell, ['status', 'value'], 'SIMULATION_CELL');
    requireValue(['KNOWN', 'UNKNOWN', 'CONFLICTING'].includes(cell.status), 'SIMULATION_CELL');
    if (cell.status === 'KNOWN') requireValue(cell.value !== null && cell.value !== undefined, 'SIMULATION_CELL');
    if (cell.status === 'UNKNOWN') requireValue(cell.value === null, 'SIMULATION_CELL');
    if (cell.status === 'CONFLICTING') requireValue(Array.isArray(cell.value) && cell.value.length >= 2 &&
      new Set(cell.value.map(x => canonicalizeArgs({ value: x }))).size >= 2, 'SIMULATION_CELL');
    if (cell.status !== 'KNOWN') requireValue(value.missing_information.length > 0, 'SIMULATION_MISSING_INFORMATION');
    bounded(cell, 2048);
  }
  bounded(value, SIMULATION_LIMITS.artifact_bytes);
  return freeze(structuredClone(value));
}
