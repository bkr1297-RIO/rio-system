import { parseSource } from '../../../artifacts/one-computational-language-f0-1/one-ir-compiler-lowering-f0.1/src/parser.ts';
import { normalizeLoweringContext } from '../../../artifacts/one-computational-language-f0-1/one-ir-compiler-lowering-f0.1/src/context.ts';
import { emitOneIR } from '../../../artifacts/one-computational-language-f0-1/one-ir-compiler-lowering-f0.1/src/ir.ts';
import { checkOneIR } from '../../../artifacts/one-computational-language-f0-1/one-ir-compiler-lowering-f0.1/src/checks.ts';
import {
  digest,
  stableJson,
  compilerIntegrity,
} from '../../../artifacts/one-computational-language-f0-1/one-ir-compiler-lowering-f0.1/src/hash.ts';
import { commit } from '../../../artifacts/transition-occurrence-protocol/src/canonical.ts';
import {
  assessTransitionOccurrenceProtocol,
  evidenceAssessmentPayload,
  successionDecisionPayload,
  transitionOccurrenceReceiptPayload,
} from '../../../artifacts/transition-occurrence-protocol/src/protocol.ts';

export const PROFILE = 'one.open-arrow.customer-zero.v0.1';
export const RESEARCH_PROFILE = 'one.ica.compiled-note.f0.1';
export const RULE = 'Nothing leaves this Lab without my explicit approval.';
const freeze = (x) => {
  if (x && typeof x === 'object') {
    Object.values(x).forEach(freeze);
    Object.freeze(x);
  }
  return x;
};
const demand = (ok, code) => {
  if (!ok) throw new Error(code);
};
const same = (a, b) => stableJson(a) === stableJson(b);
const lifecycles = {
  HumanExpression: ['RECEIVED'], TypedAST: ['FORMED'], ONEIR: ['COMPILED'],
  OAIR: ['COMPILED'], Proposal: ['PROPOSED'], Hold: ['HELD'],
  HumanCommit: ['COMMITTED', 'DENIED'], Commitment: ['COMMITTED'],
  Dispatch: ['ADMITTED'], Decision: ['ADMITTED'], Fidelity: ['CHECKED'],
  ExecutionAttempt: ['ATTEMPTED'], Occurrence: ['RECORDED'],
  Observation: ['RETURNED'], Receipt: ['RETURNED'], FieldReturn: ['RETURNED'],
  Promotion: ['RECORDED'], Denied: ['RETURNED'], Evidence: ['QUALIFIED'],
  Judgment: ['JUDGED'], Settlement: ['SETTLED_BOUNDED', 'UNSETTLED'],
  Successor: ['RECOGNIZED'],
};
const object = (x) => x !== null && typeof x === 'object' && !Array.isArray(x);
const closed = (x, keys) => object(x) && Object.keys(x).sort().join(',') === [...keys].sort().join(',');
const nonempty = (x) => typeof x === 'string' && x.length > 0;
function validateRequest(r, sourcepoint) {
  demand(
    closed(r, ['source_node', 'subject', 'target_node', 'action', 'target',
      'payload', 'payload_hash', 'scope', 'purpose', 'dependencies', 'conditions', 'return_requirement']) &&
    ['source_node', 'subject', 'target_node', 'scope', 'purpose'].every(k => nonempty(r[k])) &&
    closed(r.payload, ['content']) && typeof r.payload.content === 'string' &&
    Buffer.byteLength(r.payload.content, 'utf8') <= 4096 &&
    /^[0-9a-f]{64}$/.test(r.payload_hash) && r.payload_hash === digest(r.payload).slice(7) &&
    object(r.dependencies) && Object.values(r.dependencies).every(nonempty) &&
    closed(r.conditions, []) && closed(r.return_requirement, ['required', 'to']) &&
    r.return_requirement.required === true && nonempty(r.return_requirement.to) &&
    r.return_requirement.to === sourcepoint,
    'OPEN_ARROW_REQUEST_INVALID',
  );
}
export function assertConserved(before, after) {
  for (const axis of [
    'Subject',
    'Scope',
    'Authority',
    'Standing',
    'Dependencies',
    'Uncertainty',
    'Lineage',
    'Effects',
  ])
    demand(
      Object.hasOwn(after, axis) && same(before[axis], after[axis]),
      'CONSERVATION_LOSS:' + axis,
    );
  return true;
}
export function artifact(
  kind,
  arrow_id,
  body,
  parent_refs,
  standing,
  created_at,
) {
  demand(
    standing &&
      Object.keys(standing).sort().join(',') ===
        'Authority,Epistemic,Fidelity,Lifecycle',
    'STANDING_AXES_REQUIRED',
  );
  const authoritative = ['HumanCommit', 'Commitment', 'Dispatch'];
  demand(
    standing.Authority ===
      (authoritative.includes(kind) ? 'HUMAN_BOUND' : 'NONE'),
    'ILLEGAL_STANDING_PROMOTION',
  );
  const epistemic = {
    HumanExpression: 'ASSERTION',
    TypedAST: 'ASSERTION',
    ONEIR: 'ASSERTION',
    OAIR: 'PROPOSAL',
    Proposal: 'PROPOSAL',
    Hold: 'NO_CLAIM',
    HumanCommit: 'ATTESTATION',
    Commitment: 'PROPOSAL',
    Dispatch: 'NO_CLAIM',
    Decision: 'OBSERVATION',
    Fidelity: 'OBSERVATION',
    ExecutionAttempt: 'OBSERVATION',
    Occurrence: 'OBSERVATION',
    Observation: 'OBSERVATION',
    Receipt: 'ATTESTATION',
    FieldReturn: 'ATTESTATION',
    Promotion: 'ATTESTATION',
    Denied: 'NO_CLAIM',
    Evidence: 'EVIDENCE',
    Judgment: 'JUDGMENT',
    Settlement: 'JUDGMENT',
    Successor: 'JUDGMENT',
  };
  demand(
    epistemic[kind] &&
      standing.Epistemic === epistemic[kind] &&
      lifecycles[kind]?.includes(standing.Lifecycle) &&
      ['EXACT', 'PARTIAL'].includes(standing.Fidelity),
    'ILLEGAL_STANDING_PROMOTION',
  );
  const value = structuredClone({
    profile: PROFILE,
    kind,
    arrow_id,
    body,
    parent_refs,
    standing,
    created_at,
  });
  const integrity = digest(value);
  return freeze({
    ...value,
    artifact_id: `oa:${kind}:${integrity.slice(7)}`,
    integrity,
  });
}
const edges = new Set([
  'Proposal:Commitment',
  'Observation:Evidence',
  'Evidence:Judgment',
  'Judgment:Settlement',
  'Settlement:Successor',
]);
export function assertPromotion(from, to, disposition) {
  demand(
    edges.has(`${from}:${to}`) &&
      typeof disposition?.basis === 'string' &&
      disposition.basis.length > 0 &&
      typeof disposition?.adjudication === 'string' &&
      disposition.adjudication.length > 0,
    'ILLEGAL_STANDING_PROMOTION',
  );
  // This checks graph syntax only. The runtime MUST authenticate, freshness-check
  // and bind the human disposition before producing any operative artifact.
  return true;
}

/** Compile obligations with the native compiler; never run the reference Diamond.
 * Planned instants/references are not attestations of future human decisions.
 */
export function compileExpression(supplied) {
  return compileBoundedExpression(supplied, 'Take Report 17 to the Commons.', 'Report-17.txt', 'CUSTOMER_ZERO_TARGET', PROFILE);
}
export function compileResearchExpression(supplied) {
  return compileBoundedExpression(supplied, 'Write the bounded Research return note.', 'research-return.json', 'RESEARCH_TARGET', RESEARCH_PROFILE);
}
function compileBoundedExpression(supplied, expression, target, targetError, profile) {
  const x = structuredClone(supplied),
    r = x.request;
  demand(
    x.expression === expression,
    'ILLEGAL_STANDING_PROMOTION:UNSUPPORTED_EXPRESSION',
  );
  demand(x.rule === RULE, 'RULE_MISMATCH');
  validateRequest(r, x.sourcepoint);
  demand(
    r?.action === 'create_document' &&
      r.target === target &&
      r.subject === r.source_node,
    targetError,
  );
  const t = x.issued_at,
    next = new Date(Date.parse(t) + 1).toISOString(),
    gid = `planned:${x.proposal_id}`;
  const effect = {
    schema_id: 'urn:one:language:f0.1:common:effect-signature',
    schema_version: '0.1.0',
    language_profile: 'F0.1',
    kind: 'EffectSignature',
    world_effects: ['EXECUTE_BOUNDED_ACTION'],
    constitutional_effects: [],
    epistemic_effects: ['RECORD_ATTEMPT'],
    external_effect_allowed: true,
    standing_change_allowed: false,
    max_consequence: 'LOW',
  };
  const basisId = `field:${x.field_id}`,
    basisHash = digest({
      field_id: x.field_id,
      sourcepoint: x.sourcepoint,
      rule: x.rule,
      policy: x.policy_hash,
    });
  const binding = {
    schema_id: 'urn:one:language:f0.1:common:dependency-binding',
    schema_version: '0.1.0',
    language_profile: 'F0.1',
    kind: 'DependencyBinding',
    binding_id: `policy:${x.proposal_id}`,
    dependency_kind: 'POLICY',
    dependency_ref: x.policy_id,
    subject_kind: 'Proposal',
    subject_ref: x.proposal_id,
    binding_mode: 'EXACT',
    required_revision: '0.1',
    required_digest: `sha256:${x.policy_hash}`,
    validity_condition: 'exact constituted field policy',
  };
  const context = {
    basis: {
      schema_id: 'urn:one:language:f0.1:authority:root-authority-basis',
      schema_version: '0.1.0',
      language_profile: 'F0.1',
      kind: 'RootAuthorityBasis',
      basis_id: basisId,
      basis_kind: 'HUMAN_CONSTITUTIVE_ACT',
      source_ref: x.sourcepoint,
      constitution_ref: `field-definition:${x.field_id}`,
      domain: 'ONE',
      scope_ceiling: [r.scope],
      jurisdiction: x.field_id,
      effect_signature: effect,
      valid_from: t,
      valid_until: x.expires_at,
      dependency_bindings: [],
      lineage_ref: {
        schema_id: 'urn:one:language:f0.1:common:lineage-ref',
        schema_version: '0.1.0',
        language_profile: 'F0.1',
        kind: 'LineageRef',
        lineage_id: `lineage:${x.proposal_id}`,
        predecessor_refs: [`field-definition:${x.field_id}`],
        source_schema_ids: ['local-field-v0.1'],
        source_versions: ['0.1'],
        adapter_receipt_refs: [],
        integrity_digest: basisHash,
      },
      integrity: compilerIntegrity({ basisId, basisHash }),
    },
    basis_revision: { revision: '0.1', digest: basisHash },
    grant_specification: {
      grant_id: gid,
      subject_ref: r.subject,
      action: r.action,
      object_ref: r.target,
      payload_digest: `sha256:${r.payload_hash}`,
      purpose: r.purpose,
      scope: [r.scope],
      jurisdiction: x.field_id,
      effect_signature: effect,
      valid_from: t,
      valid_until: x.expires_at,
      delegable: false,
      use_profile: 'SINGLE_USE',
      dependency_bindings: [binding],
      derivation_ref: `obligation:${gid}`,
      issued_by_ref: x.sourcepoint,
      issued_at: t,
    },
    dependency_observations: [],
    revocations: [],
    use_counts: {},
    routing: {
      authenticated_source_ref: x.sourcepoint,
      available_refs: [basisId, x.policy_id, x.proposal_id],
    },
    times: {
      authority_evaluation: t,
      authorization: t,
      commitment: t,
      point_of_use: t,
      attempt_started: next,
    },
    predecessor_schema_ids: ['local-field-v0.1'],
    provenance: {
      authority_effect: 'NONE',
      standing_effect: 'NONE',
      time_basis: 'PLANNED_OBLIGATIONS_ONLY',
    },
  };
  const fields = {
    SOURCE: x.sourcepoint,
    BASIS: basisId,
    BASIS_REVISION: '0.1',
    BASIS_DIGEST: basisHash,
    AUTHORITY: gid,
    PROPOSAL: x.proposal_id,
    CANDIDATE: `candidate:${x.proposal_id}`,
    SUBJECT: r.subject,
    ACTION: r.action,
    OBJECT: r.target,
    PAYLOAD: `sha256:${r.payload_hash}`,
    DELTA: digest({ target: r.target, payload: r.payload_hash }),
    PURPOSE: r.purpose,
    SCOPE: [r.scope],
    JURISDICTION: x.field_id,
    CONTEXT: `context:${x.proposal_id}`,
    POLICY: x.policy_id,
    POLICY_REVISION: '0.1',
    POLICY_DIGEST: `sha256:${x.policy_hash}`,
    EVIDENCE_PLAN: 'separate-descriptor-read',
    EVIDENCE_OBLIGATIONS: ['exact-bytes', 'bounded-custody'],
    RETURN_OBLIGATION: x.sourcepoint,
    PROPOSER: x.sourcepoint,
    EVALUATOR: 'gateway/governance/policy-engine.mjs',
    EXECUTOR: r.target_node,
    WORLD_EFFECTS: effect.world_effects,
    CONSTITUTIONAL_EFFECTS: [],
    EPISTEMIC_EFFECTS: effect.epistemic_effects,
    EXTERNAL_EFFECT: true,
    STANDING_EFFECT: false,
    MAX_CONSEQUENCE: 'LOW',
    CREATED_AT: t,
    EXPIRES_AT: x.expires_at,
    AUTHORIZATION_AT: t,
    COMMITMENT_AT: t,
    POINT_OF_USE_AT: t,
    ATTEMPT_AT: next,
    PREDECESSORS: ['local-field-v0.1'],
    LOWER: 'DIAMOND_CROSSING',
  };
  const value = (v) =>
    Array.isArray(v) ? `[${v.map(value).join(',')}]` : JSON.stringify(v);
  const source = `ONE F0.1;\nPROGRAM customer_zero {\n${Object.entries(fields)
    .map(([k, v]) => `  ${k} ${value(v)};`)
    .join('\n')}\n}\n`;
  const parsed = parseSource(source);
  demand(parsed.ok, parsed.diagnostic?.code);
  const normalized = normalizeLoweringContext(context);
  demand(
    normalized.ok,
    normalized.diagnostic?.code + ':' + normalized.diagnostic?.path,
  );
  const ir = emitOneIR(parsed.value, normalized.value),
    checked = checkOneIR(source, parsed.value, ir, normalized.value);
  demand(checked.ok, checked.diagnostic?.code + ':' + checked.diagnostic?.path);
  const standing = {
    Epistemic: 'PROPOSAL',
    Authority: 'NONE',
    Lifecycle: 'PROPOSED',
    Fidelity: 'EXACT',
  };
  const conservation = {
    Subject: { sourcepoint: x.sourcepoint, node: r.subject, target: r.target },
    Scope: { scope: r.scope, purpose: r.purpose, field: x.field_id },
    Authority: {
      standing: 'NONE',
      required: 'EXPLICIT_HUMAN_COMMIT',
      planned_ref: gid,
    },
    Standing: standing,
    Dependencies: {
      dependencies: r.dependencies,
      conditions: r.conditions,
      policy_hash: x.policy_hash,
    },
    Uncertainty: [
      'Delivery is not yet attempted',
      'Observation is bounded to receiver custody',
      'No public delivery or independent witness claim',
    ],
    Lineage: {
      proposal_id: x.proposal_id,
      human_expression: x.expression,
      rule: x.rule,
      source_digest: ir.source.source_digest,
      ast_digest: parsed.value.ast_digest,
      ir_digest: ir.integrity.digest,
    },
    Effects: {
      action: r.action,
      target: r.target,
      payload_hash: r.payload_hash,
      return_requirement: r.return_requirement,
      create_only: true,
      future_authority: 'NONE',
    },
  };
  const oa_ir = {
    profile,
    kind: 'OAIR',
    request: r,
    standing,
    conservation: structuredClone(conservation),
    native_ir_ref: ir.ir_id,
    authority_effect: 'NONE',
    time_basis: 'PLANNED_OBLIGATIONS_ONLY',
  };
  assertConserved(conservation, oa_ir.conservation);
  // Sidecars retain distinctions the frozen native representation cannot add.
  // Native AST/IR identities stay exact; no extension mutates their schema.
  const frames = [
    ['HumanExpression', digest(x)],
    ['TypedAST', parsed.value.ast_digest],
    ['ONEIR', ir.integrity.digest],
    ['OAIR', digest(oa_ir)],
  ].map(([stage, artifact_ref]) => ({
    stage,
    artifact_ref,
    conservation: structuredClone(conservation),
  }));
  for (let n = 1; n < frames.length; n++)
    assertConserved(frames[n - 1].conservation, frames[n].conservation);
  return freeze({
    source,
    ast: parsed.value,
    ir,
    oa_ir,
    frames,
    checks: [
      'TYPE_CHECK',
      'RELATION_CHECK',
      'AUTHORITY_OBLIGATION_CHECK',
      'EFFECT_CHECK',
      'LINEAGE_CHECK',
    ],
  });
}
export function verifyCompilation(input, candidate) {
  return verifyBoundedCompilation(input, candidate, compileExpression);
}
export function verifyResearchCompilation(input, candidate) {
  return verifyBoundedCompilation(input, candidate, compileResearchExpression);
}
function verifyBoundedCompilation(input, candidate, compile) {
  demand(candidate.frames?.length === 4, 'CONSERVATION_FRAMES_REQUIRED');
  for (let n = 1; n < candidate.frames.length; n++)
    assertConserved(
      candidate.frames[n - 1].conservation,
      candidate.frames[n].conservation,
    );
  const expected = compile(input);
  demand(same(candidate, expected), 'ILLEGAL_LOWERING');
  return true;
}

/** Normalization view over the native Local Field receipt. Its TOP observation
 * receipt binds the original execution receipt; it is not a new truth source.
 * The caller authenticates each external root disposition before this pure call.
 */
export function qualifyAccount(chain, ids, disposition, sourcepoint) {
  const p = chain.passage.body,
    a = chain.attempt,
    observed = chain.occurrence;
  demand(a && chain.receipt && chain.return, 'OCCURRENCE_ACCOUNT_REQUIRED');
  const native = chain.receipt_artifacts,
    grant = native.authorization.conditions.lineage.at(-1);
  const ok =
    observed.status === 'OBSERVED' &&
    native.execution.result.adapter.status === 'COMPLETED';
  const empty = () => ({ profile: 'one.transition-delta.f0.1', elements: [] });
  const delta = {
    profile: 'one.transition-delta.f0.1',
    elements: [
      { class: 'NEW', path: p.target, after: commit(p.payload.content) },
    ],
  };
  const proposal = {
    schemaVersion: 'one.transition-proposal.f0.1',
    kind: 'TransitionProposal',
    proposalId: `top-proposal:${ids.arrow_id}`,
    transitionId: ids.arrow_id,
    actorRef: p.subject,
    subjectRef: p.target,
    action: p.action,
    objectRef: p.target,
    purpose: p.purpose,
    scope: [p.scope],
    payloadIntegrity: commit(p.payload),
    intendedDelta: delta,
    proposedAt: p.issued_at,
    authorityEffect: 'NONE',
    standingEffect: 'NONE',
  };
  const authority = {
    schemaVersion: 'one.authority-derivation.f0.1',
    kind: 'AuthorityDerivation',
    derivationId: `top-authority:${ids.arrow_id}`,
    grantRef: p.authority_basis,
    actorRef: p.subject,
    subjectRef: p.target,
    action: p.action,
    objectRef: p.target,
    purpose: p.purpose,
    scope: [p.scope],
    conditions: ['EXACT_SIGNED_HUMAN_COMMIT', 'CURRENT_RIO_AND_SENTINEL'],
    policyRef: chain.decision.policy.policy_id || 'local-field-policy',
    policyVersion: '0.1',
    authorityEpoch: p.field_id,
    issuedAt: grant.body.issued_at,
    validUntil: grant.body.expires_at,
    revoked: false,
    sourceArtifactRefs: [
      `human-commit:${ids.commitment_ref}`,
      `field-root:${sourcepoint}`,
    ],
  };
  const admission = {
    schemaVersion: 'one.attempt-admission.f0.1',
    kind: 'AttemptAdmission',
    attemptAdmissionId: chain.fidelity.fidelity_id,
    transitionId: ids.arrow_id,
    proposalRef: proposal.proposalId,
    proposalIntegrity: commit(proposal),
    authorityDerivationRef: authority.derivationId,
    capabilityRef: `consumed:${chain.decision.decision_id}`,
    actorRef: p.subject,
    subjectRef: p.target,
    action: p.action,
    objectRef: p.target,
    purpose: p.purpose,
    scope: [p.scope],
    payloadIntegrity: proposal.payloadIntegrity,
    authorizedDelta: delta,
    policyRef: authority.policyRef,
    policyVersion: authority.policyVersion,
    authorityEpoch: authority.authorityEpoch,
    committedAt: chain.decision.issued_at,
    expiresAt: new Date(
      Math.min(Date.parse(p.expires_at), Date.parse(grant.body.expires_at)),
    ).toISOString(),
  };
  const occurrenceRef = `top-occurrence:${observed.occurrence_id}`;
  const observation = {
    schemaVersion: 'one.transition-observation.f0.1',
    kind: 'Observation',
    observationId: ids.observation_ref,
    transitionId: ids.arrow_id,
    occurrenceRefs: ok ? [occurrenceRef] : [],
    observerRef: p.target_node,
    completeness: ok ? 'COMPLETE' : 'UNCERTAIN',
    observedDelta: ok
      ? delta
      : {
          profile: 'one.transition-delta.f0.1',
          elements: [
            {
              class: 'UNRESOLVED',
              path: p.target,
              note: 'Failure does not prove non-occurrence',
            },
          ],
        },
    observedAt: observed.observed_at,
    claimCeiling: 'OBSERVATION_ONLY',
    evidenceAdmissionEffect: 'NONE',
    truthEffect: 'NONE',
    settlementEffect: 'NONE',
  };
  const receipt = {
    schemaVersion: 'one.transition-occurrence-receipt.f0.1',
    kind: 'TransitionOccurrenceReceipt',
    receiptId: `observation-projection:${chain.receipt.receipt_id}`,
    transitionId: ids.arrow_id,
    observationRefs: [observation.observationId],
    recordedByRef: p.target_node,
    recordedAt: chain.return.returned_at,
    claimCeiling: 'OBSERVATION_REPRESENTATION_ONLY',
    evidenceAdmissionEffect: 'NONE',
    truthEffect: 'NONE',
    settlementEffect: 'NONE',
  };
  receipt.integrity = commit(transitionOccurrenceReceiptPayload(receipt));
  const evidence = {
    schemaVersion: 'one.evidence-assessment.f0.1',
    kind: 'EvidenceAssessment',
    evidenceAssessmentId: `top-evidence:${disposition.body.record_id}`,
    transitionId: ids.arrow_id,
    observationRefs: [observation.observationId],
    receiptRefs: [receipt.receiptId],
    proposition:
      'The exact report bytes were observed at the bounded Commons target after this attempt; same receiver custody only',
    verdict: ok ? 'SUPPORT' : 'INCONCLUSIVE',
    strength: ok ? 'STRONG' : 'WEAK',
    admissionStatus: 'ADMITTED',
    admissionBasisRefs: [`human-disposition:${disposition.body.record_id}`],
    assessedByRef: sourcepoint,
    assessedAt: disposition.body.issued_at,
    claimCeiling: 'BOUNDED_CONSEQUENCE_EVIDENCE',
    authorityEffect: 'NONE',
    settlementEffect: 'NONE',
  };
  evidence.integrity = commit(evidenceAssessmentPayload(evidence));
  const input = {
    schemaVersion: 'one.transition-occurrence-protocol.input.f0.1',
    evaluationTime: disposition.body.issued_at,
    proposal,
    authorityDerivation: authority,
    attemptAdmission: admission,
    attempts: [
      {
        schemaVersion: 'one.execution-attempt.f0.1',
        kind: 'ExecutionAttempt',
        executionAttemptId: a.attempt_id,
        transitionId: ids.arrow_id,
        attemptAdmissionRef: admission.attemptAdmissionId,
        actorRef: p.subject,
        capabilityRef: admission.capabilityRef,
        payloadIntegrity: proposal.payloadIntegrity,
        executionContext: {
          policyRef: authority.policyRef,
          policyVersion: authority.policyVersion,
          authorityEpoch: authority.authorityEpoch,
        },
        startedAt: a.attempted_at,
        status: ok ? 'ACCEPTED' : 'FAILED',
        standingEffect: 'NONE',
      },
    ],
    occurrences: ok
      ? [
          {
            schemaVersion: 'one.transition-occurrence.f0.1',
            kind: 'TransitionOccurrence',
            occurrenceId: occurrenceRef,
            transitionId: ids.arrow_id,
            executionRef: a.attempt_id,
            effectType: 'BOUNDED_FILE_CREATE_OBSERVED',
            subjectRef: p.target,
            actualDelta: delta,
            occurredAt: observed.observed_at,
            standingEffect: 'NONE',
          },
        ]
      : [],
    observations: [observation],
    receipts: [receipt],
    evidenceAssessments: [evidence],
    successorState: {
      schemaVersion: 'one.successor-state-ref.f0.1',
      kind: 'SuccessorStateRef',
      stateId: `report-state:${ids.arrow_id}`,
      transitionRef: ids.arrow_id,
      structuralValidity: ok ? 'VALID' : 'UNKNOWN',
      physicalPresence: ok,
      claimedStanding: 'UNRECOGNIZED',
    },
    settlementPolicy: {
      schemaVersion: 'one.settlement-policy.f0.1',
      kind: 'SettlementPolicy',
      policyId: PROFILE,
      version: '0.1',
      requireCompleteObservationForAdmission: true,
      requireAllOccurrencesObservedForAdmission: true,
      requireAllObservationsReceiptedForAdmission: true,
      requireExactDeltaForAdmission: true,
      requireDecisionAttestation: true,
    },
  };
  return {
    input,
    assessment: assessTransitionOccurrenceProtocol(input),
    native_receipt_ref: chain.receipt.receipt_id,
    occurrence_claim: ok ? 'OBSERVED_BOUNDED' : 'UNKNOWN',
  };
}
export function judgeAccount(input) {
  const assessment = assessTransitionOccurrenceProtocol(structuredClone(input));
  const burdens = assessment.findings
    .filter((f) => f.status === 'FAIL')
    .map((f) => f.code);
  return {
    judgment:
      burdens.length === 0 && assessment.occurrenceCount > 0
        ? 'ESTABLISHED'
        : 'UNESTABLISHED',
    burdens,
    assessment,
  };
}
export function recognizeAccount(supplied, disposition, sourcepoint) {
  const input = structuredClone(supplied),
    b = disposition.body;
  demand(
    judgeAccount(input).judgment === 'ESTABLISHED',
    'UNESTABLISHED_SUCCESSOR',
  );
  input.evaluationTime = b.issued_at;
  input.decisionAuthority = {
    schemaVersion: 'one.decision-authority.f0.1',
    kind: 'DecisionAuthority',
    decisionAuthorityId: `decision-authority:${b.record_id}`,
    actorRef: sourcepoint,
    action: 'DECIDE_SUCCESSION',
    subjectRefs: [input.successorState.stateId],
    settlementPolicyRef: input.settlementPolicy.policyId,
    settlementPolicyVersion: input.settlementPolicy.version,
    authorityEpoch: input.authorityDerivation.authorityEpoch,
    validFrom: b.issued_at,
    validUntil: b.expires_at,
    revoked: false,
    sourceArtifactRefs: [`human-disposition:${b.record_id}`],
  };
  const decision = {
    schemaVersion: 'one.succession-decision.f0.1',
    kind: 'SuccessionDecision',
    decisionId: `succession:${b.record_id}`,
    transitionId: input.proposal.transitionId,
    subjectRef: input.successorState.stateId,
    receiptRefs: input.receipts.map((x) => x.receiptId),
    evidenceAssessmentRefs: input.evidenceAssessments.map(
      (x) => x.evidenceAssessmentId,
    ),
    settlementPolicyRef: input.settlementPolicy.policyId,
    settlementPolicyVersion: input.settlementPolicy.version,
    decisionAuthorityRef: input.decisionAuthority.decisionAuthorityId,
    successionJudgment: 'ESTABLISHED',
    disposition: 'ADMIT',
    recognizedStanding: true,
    reasons: [b.adjudication],
    unresolvedBurdens: [],
    decidedAt: b.issued_at,
  };
  decision.integrity = commit(successionDecisionPayload(decision));
  input.decision = decision;
  const assessment = assessTransitionOccurrenceProtocol(input);
  demand(
    assessment.standingRecognized,
    'SUCCESSOR_REJECTED:' + assessment.unresolvedBurdens.join(','),
  );
  return {
    input,
    assessment,
    installation_effect: 'NONE',
    future_authority: 'NONE',
  };
}
