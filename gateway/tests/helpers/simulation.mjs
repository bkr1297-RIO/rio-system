import { hash } from '../../security/local-field-authority.mjs';
import { fingerprint } from '../../local-field/relations/types.mjs';

export const known = value => ({ status: 'KNOWN', value });
export function decisionContext(request = {}) {
  return { kind: 'DecisionContext', context_id: 'decision-example', question: 'Create a bounded possibility report?',
    request: { source_node: 'node-a', subject: 'node-a', target_node: 'node-b', action: 'create_document',
      target: 'hello.txt', scope: 'artifact-create', purpose: 'acceptance',
      dependencies: { corpus: 'v1' }, conditions: {}, return_requirement: { required: true, to: 'I-1' }, ...request },
    required_dimensions: ['disposition', 'authority_requirement', 'material_risk', 'irreversibility',
      'uncertainty_disclosure', 'dependency_requirements', 'return_burden', 'benefit', 'alternatives'],
    assessment_scope: 'Declared fixture burdens only; not a semantic risk or prediction validator.' };
}
export function possibility(context, artifact_id = 'possibility-a', patch = {}) {
  return { kind: 'SimulationArtifact', profile: 'hlsi.simulation-transduction.f0.1', artifact_id,
    context_hash: fingerprint(context), epistemic_status: 'MODEL_DEPENDENT_POSSIBILITY', authority_effect: 'none',
    occurrence_status: 'NOT_OBSERVED', evidence_status: 'NOT_ADMITTED',
    model: { model_id: 'declared-possibility-fixture', version: 'f0.1', settings_hash: hash({ deterministic: true }),
      input_hash: fingerprint(context), realization: 'supplied-possibility' },
    prediction: 'A create-only report may be written and returned.',
    assumptions: ['The target is absent and the bounded adapter remains available.'],
    metrology: { instrument: 'declared fixture burden', limitations: ['No independent model or exterior risk assessment.'],
      burden_carrier: 'development operator', unmeasured: ['Actual future target availability.'] },
    missing_information: [],
    burden: { disposition: known('propose'), authority_requirement: known('Exact current root-scoped operation grant.'),
      material_risk: known('Bounded development report creation.'), irreversibility: known('Create-only; sandbox disposable.'),
      uncertainty_disclosure: known('Prediction may fail; simulation is not evidence.'),
      dependency_requirements: known({ corpus: 'v1' }), return_burden: known('Attributed native Return; settlement remains unevaluated.'),
      benefit: known('Inspect the selected possibility and retained alternatives.'), alternatives: known(['Do not create a report.']) },
    ...patch };
}
