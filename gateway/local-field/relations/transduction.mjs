import { hash as nativeHash, requireValue, fresh, verifySigned } from '../../security/local-field-authority.mjs';
import { exactKeys, freeze, fingerprint as hash } from './types.mjs';
import { fixedSubstrate } from './substrate.mjs';
import { DecisionContext, SimulationArtifact, SIMULATION_PROFILE, SIMULATION_LIMITS, bounded } from './possibility.mjs';
import { compressPossibilities } from './compression.mjs';

export const isSimulationContent = content => content?.profile === SIMULATION_PROFILE;
const contentKeys = ['kind', 'profile', 'authority_effect', 'implementation_hash', 'context', 'context_hash',
  'artifacts', 'compression', 'selected_class_id', 'human_review', 'decision_surface', 'request', 'payload'];

/** Accountable transduction, not adjudication. No authority/permit constructors
 * are accepted or returned. Raw material is retained under native candidate custody. */
export function transducePossibilities(input) {
  exactKeys(input, ['context', 'artifacts', 'compression', 'selected_class_id', 'human_review'], 'TRANSDUCTION_FIELDS');
  const context = DecisionContext(input.context), artifacts = input.artifacts.map(SimulationArtifact)
    .sort((a, b) => a.artifact_id < b.artifact_id ? -1 : a.artifact_id > b.artifact_id ? 1 : 0);
  const compression = compressPossibilities(context, artifacts);
  requireValue(hash(input.compression) === hash(compression), 'COMPRESSION_CONFORMANCE');
  const selected = compression.classes.find(c => c.class_id === input.selected_class_id);
  requireValue(selected, 'SIMULATION_SELECTION');
  const representative = artifacts.find(a => a.artifact_id === selected.representative_id);
  const decision_surface = {
    epistemic_status: 'MODEL_DEPENDENT_POSSIBILITY', authority_effect: 'none',
    question: context.question, purpose: context.request.purpose, requested_operation: context.request,
    assessment_scope: context.assessment_scope, selected_class_id: selected.class_id,
    prediction: representative.prediction, burden: selected.burden, assumptions: selected.assumptions,
    metrology: selected.metrology, missing_information: selected.missing_information,
    selected_members: selected.members,
    alternatives: compression.classes.filter(c => c.class_id !== selected.class_id),
    provenance: { context_hash: compression.context_hash, artifact_set_hash: compression.artifact_set_hash,
      compression_hash: compression.compression_hash },
    return_status: 'REQUIRED_NATIVE_RETURN; EVIDENCE_AND_SETTLEMENT_UNEVALUATED',
    expiry_basis: 'Current candidate, formation review and native passage times; rechecked at each crossing.',
  };
  // The existing adapter allows 4096 bytes. The report is an explicitly bound
  // projection: repeated member/provenance hashes stay in the full candidate
  // and RIO surface; every alternative's declared burden stays in the report.
  const { selected_members, requested_operation, provenance, expiry_basis, ...report } = decision_surface;
  report.alternatives = decision_surface.alternatives.map(({ members, ...alternative }) => alternative);
  report.decision_surface_ref = `sha256:${hash(decision_surface)}`;
  const payload = { content: 'SIMULATION PREPARES. RIO GOVERNS.\n' +
    'This report contains model-dependent possibilities, not observed exterior outcomes.\n' +
    JSON.stringify(report) + '\n' };
  requireValue(Buffer.byteLength(payload.content) <= SIMULATION_LIMITS.output_bytes, 'SIMULATION_RESOURCE_LIMIT');
  const request = { ...context.request, payload, payload_hash: nativeHash(payload) };
  const result = { kind: 'PassageCandidate', profile: SIMULATION_PROFILE, authority_effect: 'none',
    implementation_hash: hash(fixedSubstrate()), context, context_hash: compression.context_hash,
    artifacts, compression, selected_class_id: selected.class_id, human_review: input.human_review,
    decision_surface, request, payload };
  bounded(result, SIMULATION_LIMITS.candidate_bytes);
  return freeze(structuredClone(result));
}

/** Supplements existing RIO input. `current:false` is restricted to historical
 * Return reconstruction; it never supplies execution standing or permission. */
export function guardSimulationCandidate(p, candidate, { anchor, field, current = true }) {
  const content = candidate?.body?.content;
  requireValue(candidate?.body?.kind === 'recommended_action' && content?.kind === 'PassageCandidate', 'SIMULATION_CANDIDATE_REQUIRED');
  exactKeys(content, contentKeys, 'SIMULATION_CANDIDATE_FIELDS');
  const expected = transducePossibilities({ context: content.context, artifacts: content.artifacts,
    compression: content.compression, selected_class_id: content.selected_class_id, human_review: content.human_review });
  requireValue(content.implementation_hash === hash(fixedSubstrate()), 'SUBSTRATE_DRIFT');
  requireValue(hash(content) === hash(expected), 'SIMULATION_CANDIDATE_CONFORMANCE');
  requireValue(candidate.body.source_node === p.source_node && candidate.body.field_id === p.field_id &&
    candidate.body.candidate_id === p.origin.candidate_id && p.field_id === field.field_id &&
    p.origin.intent === content.context.question && Object.keys(content.request).every(k =>
      hash(p[k]) === hash(content.request[k])), 'SIMULATION_PASSAGE_BINDING');
  const review = content.human_review, r = review?.body;
  requireValue(r?.type === 'simulation_decision_review', 'SIMULATION_REVIEW_REQUIRED');
  exactKeys(review, ['body', 'signature'], 'SIMULATION_REVIEW_FIELDS');
  exactKeys(r, ['type', 'field_id', 'record_id', 'issued_at', 'expires_at', 'issuer', 'source_node',
    'context_hash', 'compression_hash', 'selected_class_id', 'surface_hash', 'request_hash'], 'SIMULATION_REVIEW_FIELDS');
  requireValue(r.issuer === anchor.principal_id && r.field_id === field.field_id && r.source_node === p.source_node &&
    typeof r.record_id === 'string' && r.record_id.length >= 16 && r.context_hash === content.context_hash &&
    r.compression_hash === content.compression.compression_hash && r.selected_class_id === content.selected_class_id &&
    r.surface_hash === hash(content.decision_surface) && r.request_hash === hash(content.request), 'SIMULATION_REVIEW_BINDING');
  verifySigned(review, anchor.public_key_hex);
  if (current) { fresh(field); fresh(candidate.body); fresh(r); }
  return {
    kind: 'SimulationTransductionBinding', profile: SIMULATION_PROFILE, authority_effect: 'none',
    candidate_id: candidate.body.candidate_id, candidate_hash: hash(candidate.body),
    context_hash: content.context_hash, compression_hash: content.compression.compression_hash,
    artifact_set_hash: content.compression.artifact_set_hash, selected_class_id: content.selected_class_id,
    surface_hash: r.surface_hash, request_hash: r.request_hash, implementation_hash: content.implementation_hash,
    review_id: r.record_id, review_hash: hash(review), review_status: 'ROOT_ATTRIBUTED_FORMATION_REVIEW',
    effective_expires_at: new Date(Math.min(Date.parse(p.expires_at), Date.parse(candidate.body.expires_at),
      Date.parse(r.expires_at))).toISOString(),
  };
}

/** A receiver signature attributes the account; it cannot replace local
 * formation material or turn a forecast into an exterior occurrence. */
export function verifySimulationReturn(chain, candidate, options) {
  const binding = guardSimulationCandidate(chain.passage.body, candidate, { ...options, current: false });
  requireValue(hash(chain.decision?.simulation_binding) === hash(binding), 'SIMULATION_RETURN_CONFORMANCE');
  if (chain.execution_authority?.status === 'AUTHORIZED')
    requireValue(hash(chain.execution_authority.simulation_binding) === hash(binding), 'SIMULATION_RETURN_CONFORMANCE');
  const surface = { ...candidate.body.content.decision_surface, expiry: {
    passage: chain.passage.body.expires_at, candidate: candidate.body.expires_at,
    formation_review: candidate.body.content.human_review.body.expires_at,
    effective: binding.effective_expires_at,
  } };
  requireValue(hash(chain.intent?.parameters?.decision_surface) === hash(surface), 'SIMULATION_RETURN_CONFORMANCE');
  return true;
}
