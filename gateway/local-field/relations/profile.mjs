import { canonicalizeArgs } from '../../security/token-manager.mjs';
import { signPayload } from '../../security/ed25519.mjs';
import { requireValue, fresh, verifySigned, verifyNodeRecord } from '../../security/local-field-authority.mjs';
import { PROFILE, fingerprint as hash } from './types.mjs';
import { fixedSubstrate } from './substrate.mjs';
import { compileRelations } from './compiler.mjs';
import { prepareDirect, traversal } from './direct.mjs';

/** A LocalField collaborator. Existing root dependency controls admit exact plans;
 * existing RIO/Sentinel owners alone release consequential operations. */
export class RelationRuntime {
  constructor({ store, field, anchor, receiver, signingKey, record }) {
    Object.assign(this, { store, field, anchor, receiver, signingKey, record });
    requireValue(field.dependencies['si-specimen-001'] === hash(fixedSubstrate()), 'SUBSTRATE_DRIFT');
  }
  guard(p) {
    fresh(this.field);
    requireValue(this.field.dependencies['si-specimen-001'] === hash(fixedSubstrate()) &&
      this.store.state('dependency', 'si-specimen-001') === this.field.dependencies['si-specimen-001'], 'SUBSTRATE_DRIFT');
    const candidate = this.store.get('candidate', p.origin.candidate_id), content = candidate?.body?.content;
    requireValue(candidate?.body.kind === 'recommended_action' && content?.profile === PROFILE &&
      content.kind === 'research-synthesis', 'RELATION_CANDIDATE_REQUIRED');
    verifyNodeRecord(this.store, candidate, this.field.field_id);
    requireValue(candidate.body.source_node === p.source_node, 'CANDIDATE_ORIGIN_MISMATCH');
    const plan = compileRelations(content.matrix, content.substrate);
    const name = `relation-plan:${plan.matrix_id}`;
    const admission = this.store.all('dependency').reverse().find(r => r.body.name === name);
    requireValue(admission && admission.body.value === plan.plan_hash &&
      this.store.state('dependency', name) === plan.plan_hash, 'RELATION_CONFIGURATION_NOT_ADMITTED');
    requireValue(admission.body.issuer === this.anchor.principal_id &&
      admission.body.field_id === this.field.field_id, 'RELATION_CONFIGURATION_AUTHORITY');
    verifySigned(admission, this.anchor.public_key_hex);
    fresh(admission.body);
    const proposal = this.store.get('candidate', content.matrix_candidate_id);
    requireValue(proposal?.body.kind === 'proposal' && proposal.body.content?.kind === 'relation-matrix' &&
      proposal.body.content.profile === PROFILE && proposal.body.source_node === p.source_node &&
      hash(proposal.body.content.matrix) === hash(content.matrix) &&
      hash(proposal.body.content.substrate) === hash(content.substrate), 'RELATION_PROPOSAL_REQUIRED');
    verifyNodeRecord(this.store, proposal, this.field.field_id);
    const human = content.human_intent, intent = human?.body;
    verifySigned(human, this.anchor.public_key_hex);
    fresh(intent);
    requireValue(intent.issuer === this.anchor.principal_id && intent.field_id === this.field.field_id &&
      intent.plan_hash === plan.plan_hash && intent.substrate_hash === plan.substrate_hash &&
      intent.query === p.origin.intent && ['source_node', 'target_node', 'target', 'action', 'scope', 'purpose']
        .every(key => intent[key] === p[key]), 'RELATION_HUMAN_INTENT_BINDING');
    const expected = { ...prepareDirect({ matrix: content.matrix, substrate: content.substrate,
      human_intent: human, sources: content.sources, run_id: content.run_id }),
      matrix_candidate_id: content.matrix_candidate_id };
    requireValue(hash(content) === hash(expected), 'RELATION_CANDIDATE_MISMATCH');
    requireValue(hash(p.payload) === hash(content.payload), 'RELATION_PAYLOAD_MISMATCH');
    const prior = this.store.state('relation_passage', content.run_id);
    requireValue(prior === null || prior === p.passage_id, 'RELATION_RUN_REPLAY');
    return {
      profile: PROFILE, matrix_id: plan.matrix_id, plan_hash: plan.plan_hash, substrate_hash: plan.substrate_hash,
      run_id: content.run_id, candidate_id: candidate.body.candidate_id, candidate_hash: hash(candidate.body),
      matrix_candidate_id: content.matrix_candidate_id, human_intent_hash: hash(human),
      sources_hash: hash(content.sources), configuration_admission: admission,
      configuration_status: 'ADMITTED', authority_effect: 'configuration_only',
    };
  }
  admitted(p, binding) {
    this.store.state('relation_passage', binding.run_id, p.passage_id);
  }
  #body(chain, signer = this.receiver) {
    const binding = chain.decision?.relation_binding;
    requireValue(binding && chain.return, 'RELATION_RETURN_REQUIRED');
    const candidate = this.store.get('candidate', binding.candidate_id), content = candidate.body.content;
    // Historical reconstruction uses immutable admitted artifacts. Current grants
    // and configuration revocation cannot erase an already recorded occurrence.
    const plan = compileRelations(content.matrix, content.substrate);
    const linkage = { run_id: content.run_id, passage_id: chain.passage.body.passage_id,
      return_id: chain.return.return_id, status: 'RETURNED', truth_status: 'UNESTABLISHED', settlement_status: 'UNSETTLED' };
    const provenance = { candidate_id: binding.candidate_id, candidate_hash: binding.candidate_hash,
      human_intent_hash: binding.human_intent_hash, sources_hash: binding.sources_hash,
      admission_record_id: binding.configuration_admission.body.record_id };
    const traversals = content.traversals.map(t => ({ ...t, return_linkage: linkage }));
    if (chain.attempt && chain.occurrence && chain.receipt) {
      const artifacts = [
        { attempt: chain.attempt, execution_authority: chain.execution_authority, fidelity: chain.fidelity, occurrence: chain.occurrence },
        { occurrence: chain.occurrence, receipt_id: chain.receipt.receipt_id,
          witness_custody: 'receiver', independent_external_witness: false },
        { receipt: chain.receipt, returned: chain.return },
      ];
      for (const [i, artifact] of artifacts.entries()) traversals.push(traversal(plan.operations[i + 5], artifact,
        content.run_id, provenance, { kind: 'NATIVE_RUNTIME_EVENT', occurrence_id: chain.occurrence.occurrence_id,
          observation_status: chain.occurrence.status, method: chain.occurrence.method || null,
          custody: 'receiver', independent_external_witness: false }, linkage));
      const last = traversals.at(-1);
      last.admission_status = 'PENDING';
      last.witness_event = { kind: 'RETURN_FORMED_EVENT', return_id: chain.return.return_id,
        meaning: 'native Return formed; receiving admission remains unevaluated' };
    }
    return {
      type: 'relation_run', profile: PROFILE, field_id: this.field.field_id,
      signer_id: signer, run_id: content.run_id, passage_id: chain.passage.body.passage_id,
      matrix_id: plan.matrix_id, plan_hash: plan.plan_hash, substrate_hash: plan.substrate_hash,
      configuration_admission: binding.configuration_admission,
      candidate, matrix_candidate: this.store.get('candidate', binding.matrix_candidate_id),
      traversals, outcome: chain.return.outcome, occurrence_status: chain.occurrence?.status || 'NOT_OBSERVED',
      receipt_id: chain.receipt?.receipt_id || null, return_id: chain.return.return_id,
      native_chain_hash: hash({ passage: chain.passage, decision: chain.decision,
        execution_authority: chain.execution_authority, fidelity: chain.fidelity, attempt: chain.attempt,
        occurrence: chain.occurrence, receipt: chain.receipt, returned: chain.return }),
      truth_status: 'UNESTABLISHED', settlement_status: 'UNSETTLED',
      return_completion_status: 'AWAITING_RETURN_ADMISSION',
      returned_at: chain.return.returned_at,
    };
  }
  capture(chain) {
    if (!chain.decision?.relation_binding || !chain.return) return;
    const body = this.#body(chain), id = body.passage_id, prior = this.store.get('relation_run', id);
    if (prior) {
      requireValue(this.verify(chain), 'RELATION_HISTORY_INTEGRITY');
      return prior;
    }
    const run = { body, signature: signPayload(canonicalizeArgs(body), this.signingKey) };
    this.store.transaction(() => this.record('relation_run', id, run));
    return run;
  }
  verifyReceiverRun(native) {
    const source = native?.relation_run, p = native?.passage?.body;
    requireValue(source?.body.profile === PROFILE && p?.source_node === this.receiver &&
      source.body.signer_id === p.target_node, 'RELATION_RETURN_BINDING');
    verifySigned(source, this.store.get('enrollment', p.target_node).body.node.public_key_hex);
    // Attribution cannot replace consistency with local formation artifacts and
    // the separately verified native execution/occurrence/receipt chain.
    requireValue(hash(source.body) === hash(this.#body(native, p.target_node)), 'RELATION_RETURN_CONFORMANCE');
  }
  #returnBody(chain) {
    const incoming = chain.incoming_return, native = incoming?.body?.chain;
    const source = native?.relation_run, admitted = chain.return_ingress;
    requireValue(source?.body.profile === PROFILE && admitted, 'RELATION_RETURN_ADMISSION_REQUIRED');
    const p = native.passage.body, content = source.body.candidate.body.content;
    requireValue(p.source_node === this.receiver && source.body.signer_id === p.target_node &&
      admitted.passage_id === p.passage_id && admitted.return_id === native.return.return_id &&
      admitted.status === 'ADMITTED_AS_ATTRIBUTED_RECORD', 'RELATION_RETURN_BINDING');
    this.verifyReceiverRun(native);
    const candidate = this.store.get('candidate', source.body.candidate.body.candidate_id);
    requireValue(candidate && hash(candidate) === hash(source.body.candidate), 'RELATION_RETURN_CANDIDATE');
    const plan = compileRelations(content.matrix, content.substrate);
    requireValue(source.body.plan_hash === plan.plan_hash && source.body.passage_id === p.passage_id,
      'RELATION_RETURN_PLAN');
    const traversals = structuredClone(source.body.traversals);
    // Only this already-admitted incoming Return can complete the HMI edge.
    const last = traversal(plan.operations[7], { incoming, admission: admitted }, content.run_id,
      { source_run_hash: hash(source), return_transit_hash: hash(incoming) },
      { kind: 'RETURN_INGRESS_EVENT', decision_id: admitted.decision_id, return_id: admitted.return_id,
        evidence_status: admitted.evidence_status, settlement_status: admitted.settlement_status },
      { run_id: content.run_id, passage_id: p.passage_id, return_id: admitted.return_id,
        status: admitted.return_completion_status });
    last.admission_status = admitted.status;
    // A held or unresolved attempt cannot be presented as a full successful
    // circulation merely because its diagnostic Return arrived.
    if (traversals.length === 8) traversals[7] = last;
    else traversals.push(last);
    return { ...source.body, signer_id: this.receiver, traversals, source_run: source,
      return_ingress: admitted, return_transit_hash: hash(incoming),
      truth_status: admitted.truth_status, settlement_status: admitted.settlement_status,
      return_completion_status: admitted.return_completion_status };
  }
  captureReturn(chain) {
    if (!chain.incoming_return?.body?.chain?.relation_run || !chain.return_ingress) return;
    const body = this.#returnBody(chain), id = body.passage_id, prior = this.store.get('relation_run', id);
    if (prior) {
      requireValue(this.verify(chain), 'RELATION_HISTORY_INTEGRITY');
      return prior;
    }
    const run = { body, signature: signPayload(canonicalizeArgs(body), this.signingKey) };
    this.store.transaction(() => this.record('relation_run', id, run));
    return run;
  }
  verify(chain) {
    try {
      const saved = chain.relation_run;
      verifySigned(saved, this.store.get('enrollment', this.receiver).body.node.public_key_hex);
      return hash(saved.body) === hash(chain.return_ingress ? this.#returnBody(chain) : this.#body(chain));
    } catch { return false; }
  }
  status() {
    const controls = this.store.all('dependency').filter(r => r.body.name.startsWith('relation-plan:'));
    const latest = new Map(controls.map(r => [r.body.name, r]));
    return { profile: PROFILE, substrate_hash: hash(fixedSubstrate()),
      configurations: [...latest.values()].map(r => ({ name: r.body.name, value: r.body.value,
        record_id: r.body.record_id, expires_at: r.body.expires_at })),
      runs: this.store.all('relation_run').map(r => ({ run_id: r.body.run_id, passage_id: r.body.passage_id,
        outcome: r.body.outcome, return_id: r.body.return_id, settlement_status: r.body.settlement_status })) };
  }
}
