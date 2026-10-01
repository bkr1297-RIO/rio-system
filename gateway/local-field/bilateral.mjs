import { randomUUID } from 'node:crypto';
import { canonicalizeArgs } from '../security/token-manager.mjs';
import { signPayload } from '../security/ed25519.mjs';
import { hash, requireValue, fresh, verifySigned, nodeAt, verifyNodeRecord, resolveGrant } from '../security/local-field-authority.mjs';
import { evaluatePolicy } from '../governance/policy-engine.mjs';
import { verifyLocalFieldReceipt, verifyLocalFieldReturn, hashIntent, hashGovernance, hashAuthorization, hashExecution } from '../receipts/receipts.mjs';

const now = () => new Date().toISOString();
export const MAX_RECORD_BYTES = 65536;
export const MAX_RETURN_BYTES = 8 * 1024 * 1024;
const encodedBytes = x => Buffer.byteLength(JSON.stringify(x));
const envelopeKeys = new Set(['type','field_id','record_id','issued_at','expires_at','schema_version','passage_id','intent_id','source_node','subject','target_node','action','target','payload','payload_hash','authority_basis','scope','purpose','dependencies','conditions','nonce','replay','correlation_id','return_requirement','origin','lineage']);

/** Optional bilateral profile of the existing Local Field coordinator. All
 * records use its LocalStore/native ledger and canonical policy/receipt owners.
 * This is not a per-node governor, a transport permission or a new proof type.
 */
export class Bilateral {
  constructor({ store, field, anchor, receiver, signingKey, peers = {}, decide, record }) {
    Object.assign(this, { store, field, anchor, receiver, signingKey, decide, record });
    requireValue(field.return_policy?.status === 'active', 'RETURN_POLICY_REQUIRED');
    requireValue(encodedBytes(field) <= MAX_RECORD_BYTES, 'FIELD_RESOURCE_LIMIT');
    requireValue(typeof field.return_authority_basis === 'string' && field.return_authority_basis.length >= 16, 'RETURN_AUTHORITY_BASIS_REQUIRED');
    this.peers = Object.fromEntries(Object.entries(peers).map(([node, address]) => {
      const u = new URL(address);
      requireValue(u.protocol === 'http:' && u.hostname === '127.0.0.1' && Number(u.port) > 0 &&
        !u.username && !u.password && u.pathname === '/' && !u.search && !u.hash, 'LOOPBACK_PEER_REQUIRED');
      return [node, u.origin];
    }));
  }
  envelope(p) {
    requireValue(p.schema_version === '0.1' && p.replay === 'single-use', 'PASSAGE_SCHEMA_OR_REPLAY_UNSUPPORTED');
    requireValue(Object.keys(p).every(k => envelopeKeys.has(k)), 'PASSAGE_EXTENSION_UNSUPPORTED');
    requireValue(p.return_requirement?.required === true && p.return_requirement.to === p.source_node &&
      Object.keys(p.return_requirement).every(k => ['required','to'].includes(k)), 'RETURN_ROUTE_INVALID');
    requireValue(Object.keys(p.origin || {}).every(k => ['intent','candidate_id'].includes(k)), 'ORIGIN_EXTENSION_UNSUPPORTED');
    if (p.lineage !== undefined)
      requireValue(Array.isArray(p.lineage) && p.lineage.every(x => typeof x === 'string'), 'LINEAGE_INVALID');
  }
  signed(body) { return { body, signature: signPayload(canonicalizeArgs(body), this.signingKey) }; }
  transit(record, supplied) {
    requireValue(supplied?.body?.type === 'passage_transit', 'CONTROLLED_EGRESS_REQUIRED');
    verifyNodeRecord(this.store, supplied, this.field.field_id);
    const t = supplied.body, p = record.body, e = t.egress_decision;
    requireValue(t.source_node === p.source_node && hash(t.passage) === hash(record), 'TRANSIT_PASSAGE_MISMATCH');
    verifySigned(e, nodeAt(this.store, p.source_node).public_key_hex);
    fresh(e.body);
    requireValue(e.body.field_id === this.field.field_id && e.body.source_node === p.source_node &&
      e.body.passage_id === p.passage_id && e.body.passage_hash === hash(p) &&
      e.body.context === 'EGRESS' && e.body.status === 'EMIT_AUTHORIZED' &&
      e.body.target_node === this.receiver && Date.parse(t.expires_at) <= Date.parse(p.expires_at), 'EGRESS_BINDING_INVALID');
  }
  async dispatch(record) {
    canonicalizeArgs(record);
    record = structuredClone(record);
    const p = record.body;
    let transit;
    try {
      transit = this.store.transaction(() => {
        const { policy, lineage } = this.decide(record, { egress: true });
        requireValue(p.source_node === this.receiver, 'SOURCE_CUSTODY_MISMATCH');
        requireValue(this.peers[p.target_node], 'PEER_ROUTE_MISSING');
        this.store.useNonce(`egress:${p.source_node}`, p.nonce);
        requireValue(!this.store.get('outgoing', p.passage_id), 'REPLAY_PASSAGE_ID');
        const egress = this.signed({ type: 'egress_decision', field_id: this.field.field_id,
          source_node: this.receiver, target_node: p.target_node, passage_id: p.passage_id,
          decision_id: randomUUID(), context: 'EGRESS', status: 'EMIT_AUTHORIZED',
          passage_hash: hash(p), authority_lineage: lineage.map(g => g.body.grant.grant_id),
          policy, owner: 'gateway/governance/policy-engine.mjs', issued_at: now(), expires_at: p.expires_at });
        const outgoing = this.signed({ type: 'passage_transit', field_id: this.field.field_id,
          source_node: this.receiver, record_id: randomUUID(), issued_at: now(), expires_at: p.expires_at,
          passage: record, egress_decision: egress });
        requireValue(encodedBytes(outgoing) <= MAX_RECORD_BYTES, 'TRANSIT_RESOURCE_LIMIT');
        this.record('outgoing', p.passage_id, record);
        this.record('egress', p.passage_id, egress);
        this.record('outgoing_transit', p.passage_id, outgoing);
        this.record('dispatch_attempt', p.passage_id, { passage_id: p.passage_id, attempted_at: now(),
          route: this.peers[p.target_node] + '/receive', node: this.receiver });
        for (const g of lineage) { const id = g.body.grant.grant_id; this.store.state('uses', id, (this.store.state('uses', id) || 0) + 1); }
        this.store.state('outgoing_phase', p.passage_id, 'EMISSION_ATTEMPTED');
        return outgoing;
      });
      // No asynchronous gap between the persisted current warrant and initiating
      // this owned network crossing. Direct user networking is outside this scope.
      const response = await fetch(this.peers[p.target_node] + '/receive', { method: 'POST',
        headers: { 'content-type': 'application/json' }, body: JSON.stringify(transit),
        redirect: 'error', signal: AbortSignal.timeout(10000) });
      let bytes = 0; const chunks = [];
      for await (const chunk of response.body) {
        bytes += chunk.length; requireValue(bytes <= MAX_RETURN_BYTES, 'RETURN_RESOURCE_LIMIT'); chunks.push(chunk);
      }
      const returned = JSON.parse(Buffer.concat(chunks).toString('utf8'));
      requireValue(response.ok, returned.error || 'REMOTE_INGRESS_REFUSED');
      return this.admitReturn(returned);
    } catch (e) {
      this.store.transaction(() => {
        const id = randomUUID();
        this.record('egress_hold', id, { passage_id: p?.passage_id || null, context: 'EGRESS', status: 'HELD', reason: e.message, at: now(), emission_attempted: Boolean(transit) });
        if (transit) this.store.state('outgoing_phase', p.passage_id, 'UNSETTLED');
      });
      throw e;
    }
  }
  returnDecision(p, context) {
    nodeAt(this.store, p.source_node); nodeAt(this.store, p.target_node);
    const intent = { intent_id: p.intent_id, action: 'record_return', agent_id: p.target_node,
      target_environment: 'local', parameters: { passage_id: p.passage_id, to: p.source_node, context } };
    const policy = evaluatePolicy(intent, { ...this.field.return_policy, policy_hash: hash(this.field.return_policy) }, { systemMode: 'NORMAL' });
    requireValue(['AUTO_APPROVE','REQUIRE_HUMAN'].includes(policy.governance_decision), 'RETURN_POLICY_REFUSED');
    const lineage = resolveGrant(this.store, this.field.return_authority_basis, {
      subject: p.target_node, target_node: p.source_node, action: 'record_return', target: 'return-record',
      scope: 'attributed-record-only', purpose: 'local-field-return', dependencies: {}, conditions: {},
    }, this.anchor, this.field.field_id);
    for (const g of lineage) {
      const id = g.body.grant.grant_id;
      this.store.state('uses', id, (this.store.state('uses', id) || 0) + 1);
    }
    return { decision_id: randomUUID(), passage_id: p.passage_id, context, status: 'EMIT_AUTHORIZED',
      authority_basis: { grant_id: this.field.return_authority_basis, authority_lineage: lineage.map(g => g.body.grant.grant_id),
        field_definition: this.field.record_id, passage_hash: hash(p), return_requirement: p.return_requirement },
      policy, checked_at: now(), owner: 'gateway/governance/policy-engine.mjs', authority_effect: 'none' };
  }
  returnBudget({ record, transit, intent, lineage, policy }) {
    // Native chain embeds the request, policy and standing several times.
    // Budget from actual immutable inputs, not a fabricated pre-effect receipt.
    // Sixteen copies conservatively cover all native/transport projections;
    // one record of fixed overhead covers generated IDs, hashes and observation.
    const p = record.body;
    const returnLineage = resolveGrant(this.store, this.field.return_authority_basis, {
      subject: p.target_node, target_node: p.source_node, action: 'record_return', target: 'return-record',
      scope: 'attributed-record-only', purpose: 'local-field-return', dependencies: {}, conditions: {},
    }, this.anchor, this.field.field_id);
    const bound = 16 * encodedBytes({ record, transit, intent, lineage, policy, returnLineage, return_policy: this.field.return_policy }) + MAX_RECORD_BYTES;
    requireValue(bound <= MAX_RETURN_BYTES, 'RETURN_BUDGET_UNSUPPORTED');
    return { passage_id: p.passage_id, encoded_upper_bound: bound, transport_limit: MAX_RETURN_BYTES };
  }
  emitReturn(chain) {
    return this.store.transaction(() => {
      const p = chain.passage.body, decision = this.returnDecision(p, 'RETURN_EGRESS');
      const transit = this.signed({ type: 'return_transit', field_id: this.field.field_id, record_id: randomUUID(),
        source_node: this.receiver, target_node: p.source_node, issued_at: now(),
        expires_at: new Date(Date.now() + 600000).toISOString(), return_egress: decision, chain });
      requireValue(encodedBytes(transit) <= this.store.get('return_budget', p.passage_id).encoded_upper_bound, 'RETURN_BUDGET_EXCEEDED');
      this.record('return_egress', p.passage_id, decision);
      this.record('return_transit', p.passage_id, transit);
      return transit;
    });
  }
  admitReturn(transit) {
    try { return this.#admitReturn(transit); }
    catch (e) {
      this.store.transaction(() => this.record('return_ingress_hold', randomUUID(), {
        passage_id: transit?.body?.chain?.passage?.body?.passage_id || null,
        context: 'RETURN_INGRESS', status: 'HELD', reason: e.message, at: now(), authority_effect: 'none',
      }));
      throw e;
    }
  }
  #admitReturn(transit) {
    requireValue(encodedBytes(transit) <= MAX_RETURN_BYTES, 'RETURN_RESOURCE_LIMIT');
    canonicalizeArgs(transit);
    transit = structuredClone(transit);
    const b = transit?.body;
    requireValue(b?.type === 'return_transit' && b.target_node === this.receiver, 'RETURN_TRANSIT_INVALID');
    const node = verifyNodeRecord(this.store, transit, this.field.field_id);
    const c = b.chain, p = c?.passage?.body, id = p?.passage_id;
    const original = this.store.get('outgoing', id);
    requireValue(original && hash(c.passage) === hash(original), 'RETURN_ORIGIN_MISMATCH');
    requireValue(b.source_node === p.target_node && p.source_node === this.receiver, 'RETURN_CUSTODY_MISMATCH');
    const key = node.public_key_hex, r = c.return;
    requireValue(verifyLocalFieldReturn(r, key, { field_id: this.field.field_id, signer_id: p.target_node }) &&
      r.passage_id === id && r.intent_id === p.intent_id && r.correlation_id === p.correlation_id && r.to === this.receiver,
      'RETURN_INTEGRITY_OR_CORRELATION_INVALID');
    requireValue(b.return_egress?.context === 'RETURN_EGRESS' && b.return_egress.status === 'EMIT_AUTHORIZED' &&
      b.return_egress.passage_id === id && b.return_egress.authority_effect === 'none' &&
      b.return_egress.authority_basis?.passage_hash === hash(p), 'RETURN_EGRESS_INVALID');
    requireValue(c.decision?.context === 'INGRESS' && c.decision.status === 'ADMITTED' &&
      c.decision.passage_id === id && c.decision.passage_hash === hash(p), 'RETURN_INGRESS_PROOF_INVALID');
    if (r.receipt_id) {
      const a = c.receipt_artifacts;
      requireValue(verifyLocalFieldReceipt(c.receipt, key, { field_id: this.field.field_id, passage_id: id, signer_id: p.target_node }) &&
        c.receipt.receipt_id === r.receipt_id && a &&
        c.receipt.hash_chain.intent_hash === hashIntent(a.intent) &&
        c.receipt.hash_chain.governance_hash === hashGovernance(a.governance) &&
        c.receipt.hash_chain.authorization_hash === hashAuthorization(a.authorization) &&
        c.receipt.hash_chain.execution_hash === hashExecution(a.execution) &&
        hash(c.decision) === hash(a.governance.checks.decision) &&
        hash(c.execution_authority) === hash(a.execution.result.execution_authority) &&
        hash(c.fidelity) === hash(a.execution.result.fidelity) &&
        hash(c.attempt) === hash(a.execution.result.attempt) &&
        hash(c.occurrence) === hash(a.execution.result.occurrence), 'RETURN_NATIVE_PROOF_INVALID');
    } else requireValue(r.outcome !== 'OBSERVED', 'RETURN_OCCURRENCE_WITHOUT_PROOF');
    return this.store.transaction(() => {
      this.store.useNonce('return_ingress', r.return_id);
      requireValue(!this.store.get('return_ingress', id), 'REPLAY_RETURN');
      const current = this.returnDecision(p, 'RETURN_INGRESS');
      const decision = { ...current, return_id: r.return_id, correlation_id: p.correlation_id,
        return_hash: hash(transit), status: 'ADMITTED_AS_ATTRIBUTED_RECORD',
        truth_status: 'UNESTABLISHED', observation_status: 'ATTRIBUTED_CLAIM',
        evidence_status: 'NOT_ADMITTED', settlement_status: 'UNSETTLED',
        return_completion_status: 'RETURNED_WITH_RESIDUE',
        residue: ['Observation is not independently admitted evidence', 'Evidence and settlement prerequisites remain unevaluated'] };
      this.record('incoming_return', id, transit);
      this.record('return_ingress', id, decision);
      this.store.state('outgoing_phase', id, 'RETURN_ADMITTED');
      return structuredClone(decision);
    });
  }
  recover() {
    this.store.transaction(() => {
      for (const r of this.store.all('outgoing')) {
        const id = r.body.passage_id;
        if (this.store.state('outgoing_phase', id) !== 'RETURN_ADMITTED') {
          this.store.state('outgoing_phase', id, 'UNSETTLED');
          if (!this.store.get('dispatch_residue', id))
            this.record('dispatch_residue', id, { passage_id: id, status: 'UNSETTLED',
              reason: 'Restart never retransmits or regenerates permission; remote effect may have occurred', at: now() });
        }
      }
    });
  }
}
