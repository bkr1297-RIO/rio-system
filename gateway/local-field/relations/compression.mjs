import { canonicalizeArgs } from '../../security/token-manager.mjs';
import { requireValue } from '../../security/local-field-authority.mjs';
import { freeze, fingerprint as hash } from './types.mjs';
import { DecisionContext, SimulationArtifact, SIMULATION_PROFILE, SIMULATION_LIMITS, bounded } from './possibility.mjs';

/** Conservative equality of declared burdens relative to K_d. Not semantic
 * prediction validation, policy evaluation or an authority constructor. */
export function compressPossibilities(context, artifacts) {
  const ctx = DecisionContext(context), context_hash = hash(ctx);
  requireValue(Array.isArray(artifacts) && artifacts.length > 0 &&
    artifacts.length <= SIMULATION_LIMITS.artifacts, 'SIMULATION_RESOURCE_LIMIT');
  bounded(artifacts, SIMULATION_LIMITS.set_bytes);
  const sorted = artifacts.map(SimulationArtifact).sort((a, b) =>
    a.artifact_id < b.artifact_id ? -1 : a.artifact_id > b.artifact_id ? 1 : 0);
  const ids = new Set(), groups = new Map();
  let unresolved_artifact_count = 0;
  for (const a of sorted) {
    requireValue(a.context_hash === context_hash, 'SIMULATION_CONTEXT');
    requireValue(!ids.has(a.artifact_id), 'SIMULATION_ID_DUPLICATE');
    ids.add(a.artifact_id);
    const unresolved = a.missing_information.length > 0 || Object.values(a.burden).some(c => c.status !== 'KNOWN');
    if (unresolved) unresolved_artifact_count++;
    // Compare the complete canonical value, not only a similarity score or hash.
    const basis = { context_hash, burden: a.burden, assumptions: a.assumptions, metrology: a.metrology,
      missing_information: a.missing_information, model: a.model,
      ...(unresolved ? { keep_distinct: a.artifact_id } : {}) };
    const key = canonicalizeArgs(basis);
    if (!groups.has(key)) groups.set(key, {
      class_id: hash(basis), representative_id: a.artifact_id,
      equivalence_status: unresolved ? 'UNRESOLVED_KEEP_DISTINCT' : 'DECLARED_BURDEN_EQUIVALENT',
      burden: a.burden, assumptions: a.assumptions, metrology: a.metrology,
      missing_information: a.missing_information, members: [],
    });
    groups.get(key).members.push({ artifact_id: a.artifact_id, artifact_hash: hash(a),
      model_id: a.model.model_id, model_version: a.model.version,
      model_input_hash: a.model.input_hash, model_settings_hash: a.model.settings_hash });
  }
  const body = { kind: 'CompressedPossibilitySet', profile: SIMULATION_PROFILE, authority_effect: 'none',
    context_hash, artifact_set_hash: hash(sorted), artifact_count: sorted.length,
    unresolved_artifact_count, classes: [...groups.values()] };
  bounded(body, SIMULATION_LIMITS.candidate_bytes);
  return freeze({ ...body, compression_hash: hash(body) });
}
