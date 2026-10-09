import { canonicalizeArgs } from '../security/token-manager.mjs';
import { signPayload, verifySignature } from '../security/ed25519.mjs';
import { validateArtifactOperation } from '../execution/filesystem-executor.mjs';
import {
  hash,
  requireValue as demand,
  fresh,
  verifySigned,
  verifyNodeRecord,
  resolveGrant,
} from '../security/local-field-authority.mjs';

const stamp = () => new Date().toISOString();
const standing = (
  Epistemic,
  Lifecycle,
  Authority = 'NONE',
  Fidelity = 'EXACT',
) => ({ Epistemic, Authority, Lifecycle, Fidelity });
const requestKeys = [
  'source_node',
  'subject',
  'target_node',
  'action',
  'target',
  'payload',
  'payload_hash',
  'scope',
  'purpose',
  'dependencies',
  'conditions',
  'return_requirement',
];
export class OpenArrow {
  #s;
  #f;
  #a;
  #receiver;
  #key;
  #lib;
  #verified = new Map();
  constructor({ store, field, anchor, receiver, signingKey, library }) {
    demand(
      library?.PROFILE === field.open_arrow.profile &&
        field.open_arrow.rule === library.RULE,
      'OPEN_ARROW_DEPENDENCY_REQUIRED',
    );
    this.#s = store;
    this.#f = field;
    this.#a = anchor;
    this.#receiver = receiver;
    this.#key = signingKey;
    this.#lib = library;
  }
  #root(record) {
    const b = record?.body;
    demand(
      b?.field_id === this.#f.field_id && b.issuer === this.#a.principal_id,
      'OPEN_ARROW_HUMAN_REQUIRED',
    );
    verifySigned(record, this.#a.public_key_hex);
    fresh(b);
    demand(
      typeof b.record_id === 'string' && b.record_id.length >= 16,
      'CONTROL_ID_REQUIRED',
    );
    return b;
  }
  #all(id) {
    return this.#s
      .all('arrow_artifact')
      .filter((x) => x.arrow_id === id)
      .map((x) => {
        const fingerprint = hash(x);
        if (this.#verified.get(x.artifact_id) === fingerprint) return x;
        const { attestation, ...a } = x;
        const node = this.#s.get('enrollment', this.#receiver)?.body.node;
        demand(
          attestation?.issuer === this.#receiver &&
            node &&
            verifySignature(
              canonicalizeArgs(a),
              attestation.signature,
              node.public_key_hex,
            ),
          'OPEN_ARROW_HISTORY_INTEGRITY',
        );
        const expected = this.#lib.artifact(
          a.kind,
          a.arrow_id,
          a.body,
          a.parent_refs,
          a.standing,
          a.created_at,
        );
        demand(hash(a) === hash(expected), 'OPEN_ARROW_HISTORY_INTEGRITY');
        this.#verified.set(x.artifact_id, fingerprint);
        return x;
      });
  }
  #get(id, kind) {
    return this.#all(id).find((x) => x.kind === kind);
  }
  #add(kind, id, body, parents, s) {
    const a = this.#lib.artifact(kind, id, body, parents, s, stamp());
    const entry = {
      ...a,
      attestation: {
        issuer: this.#receiver,
        signature: signPayload(canonicalizeArgs(a), this.#key),
      },
    };
    this.#s.insert('arrow_artifact', a.artifact_id, entry);
    this.#verified.set(a.artifact_id, hash(entry));
    this.#s.append({
      intent_id: id,
      action: `open-arrow.${kind}`,
      agent_id: this.#receiver,
      status: s.Lifecycle,
      detail: JSON.stringify(entry),
    });
    return entry;
  }
  #promotion(from, to, record) {
    this.#lib.assertPromotion(from.kind, to.kind, record.body);
    this.#add(
      'Promotion',
      from.arrow_id,
      {
        from_ref: from.artifact_id,
        from_hash: from.integrity,
        to_ref: to.artifact_id,
        to_hash: to.integrity,
        disposition: record,
        basis: record.body.basis,
        adjudication: record.body.adjudication,
      },
      [from.artifact_id, to.artifact_id],
      standing('ATTESTATION', 'RECORDED'),
    );
  }
  handle(raw) {
    canonicalizeArgs(raw);
    const record = structuredClone(raw),
      b = record.body;
    if (b?.type === 'arrow_propose') return this.#propose(record);
    this.#root(record);
    return this.#s.transaction(() => {
      this.#s.useNonce('arrow', b.record_id);
      demand(this.#get(b.arrow_id, 'Proposal'), 'OPEN_ARROW_UNKNOWN');
      if (b.type === 'arrow_commit') return this.#commit(record);
      demand(b.type === 'arrow_promote', 'OPEN_ARROW_TYPE_INVALID');
      return this.#promote(record);
    });
  }
  #propose(record) {
    const b = record.body,
      node = verifyNodeRecord(this.#s, record, this.#f.field_id);
    demand(node.primary_role === 'proposer', 'PROPOSER_ROLE_REQUIRED');
    const expression = this.#root(b.human_expression);
    demand(
      expression.type === 'human_expression' &&
        expression.source_node === b.source_node,
      'HUMAN_EXPRESSION_BINDING',
    );
    demand(
      typeof b.arrow_id === 'string' && b.arrow_id.length >= 16,
      'OPEN_ARROW_ID_REQUIRED',
    );
    const r = b.request;
    demand(
      r &&
        Object.keys(r).sort().join(',') === [...requestKeys].sort().join(',') &&
        r.source_node === b.source_node &&
        r.subject === b.source_node &&
        r.target_node === this.#receiver &&
        r.payload_hash === hash(r.payload),
      'OPEN_ARROW_REQUEST_INVALID',
    );
    validateArtifactOperation(r);
    demand(
      r.return_requirement?.required === true &&
        r.return_requirement.to === this.#a.principal_id,
      'RETURN_REQUIRED',
    );
    const input = {
      expression: expression.expression,
      rule: this.#f.open_arrow.rule,
      proposal_id: b.arrow_id,
      field_id: this.#f.field_id,
      sourcepoint: this.#a.principal_id,
      issued_at: b.issued_at,
      expires_at: b.expires_at,
      policy_id: this.#f.policy.policy_id,
      policy_hash: hash(this.#f.policy),
      request: r,
    };
    const c = this.#lib.compileExpression(input);
    return this.#s.transaction(() => {
      this.#s.useNonce('arrow', b.record_id);
      demand(!this.#get(b.arrow_id, 'Proposal'), 'OPEN_ARROW_REPLAY');
      const e = this.#add(
        'HumanExpression',
        b.arrow_id,
        {
          record: b.human_expression,
          source_record: record,
          compiler_input: input,
          frame: c.frames[0],
        },
        [],
        standing('ASSERTION', 'RECEIVED'),
      );
      const ast = this.#add(
        'TypedAST',
        b.arrow_id,
        { source: c.source, ast: c.ast, frame: c.frames[1] },
        [e.artifact_id],
        standing('ASSERTION', 'FORMED'),
      );
      const ir = this.#add(
        'ONEIR',
        b.arrow_id,
        { ir: c.ir, checks: c.checks, frame: c.frames[2] },
        [ast.artifact_id],
        standing('ASSERTION', 'COMPILED'),
      );
      const oa = this.#add(
        'OAIR',
        b.arrow_id,
        c.oa_ir,
        [ir.artifact_id],
        standing('PROPOSAL', 'COMPILED'),
      );
      const proposal = this.#add(
        'Proposal',
        b.arrow_id,
        {
          request: r,
          oa_ir_ref: oa.artifact_id,
          human_expression_ref: e.artifact_id,
        },
        [oa.artifact_id],
        standing('PROPOSAL', 'PROPOSED'),
      );
      this.#add(
        'Hold',
        b.arrow_id,
        {
          reason: 'EXPLICIT_HUMAN_COMMIT_REQUIRED',
          proposal_ref: proposal.artifact_id,
        },
        [proposal.artifact_id],
        standing('NO_CLAIM', 'HELD'),
      );
      return proposal;
    });
  }
  #commit(record) {
    const b = record.body,
      id = b.arrow_id,
      p = this.#get(id, 'Proposal');
    demand(!this.#get(id, 'HumanCommit'), 'OPEN_ARROW_ALREADY_DISPOSITIONED');
    demand(p.integrity === b.proposal_hash, 'OPEN_ARROW_PROPOSAL_MUTATION');
    demand(
      ['APPROVE', 'DENY'].includes(b.decision),
      'EXPLICIT_HUMAN_COMMIT_REQUIRED',
    );
    this.#lib.assertPromotion('Proposal', 'Commitment', b);
    if (b.decision === 'DENY') {
      const h = this.#add(
        'HumanCommit',
        id,
        { disposition: record },
        [p.artifact_id],
        standing('ATTESTATION', 'DENIED', 'HUMAN_BOUND'),
      );
      return this.#add(
        'Denied',
        id,
        {
          reason: b.adjudication,
          occurred: false,
          coverage: 'No passage admitted or attempted for this arrow',
        },
        [h.artifact_id],
        standing('NO_CLAIM', 'RETURNED'),
      );
    }
    const r = p.body.request;
    const lineage = resolveGrant(
        this.#s,
        b.grant_id,
        r,
        this.#a,
        this.#f.field_id,
      ),
      g = lineage.at(-1);
    demand(
      g.body.issuer === this.#a.principal_id &&
        g.body.grant.parent === null &&
        g.body.grant.max_uses === 1 &&
        g.body.grant.allow_delegation === false &&
        g.body.grant.payload_hash === r.payload_hash,
      'OPEN_ARROW_EXACT_SINGLE_USE_GRANT_REQUIRED',
    );
    demand(
      typeof b.passage_id === 'string' && b.passage_id.length >= 16,
      'PASSAGE_ID_REQUIRED',
    );
    const h = this.#add(
      'HumanCommit',
      id,
      { disposition: record },
      [p.artifact_id],
      standing('ATTESTATION', 'COMMITTED', 'HUMAN_BOUND'),
    );
    const c = this.#add(
      'Commitment',
      id,
      {
        proposal_ref: p.artifact_id,
        proposal_hash: p.integrity,
        grant_id: b.grant_id,
        passage_id: b.passage_id,
        human_commit_ref: h.artifact_id,
        request_hash: hash(r),
      },
      [p.artifact_id, h.artifact_id],
      standing('PROPOSAL', 'COMMITTED', 'HUMAN_BOUND'),
    );
    this.#promotion(p, c, record);
    return c;
  }
  guard(p) {
    const id = p?.origin?.arrow_id,
      c = id && this.#get(id, 'Commitment');
    demand(
      c && p.origin.commitment_id === c.artifact_id,
      'OPEN_ARROW_COMMITMENT_REQUIRED',
    );
    const proposal = this.#get(id, 'Proposal'),
      r = proposal.body.request;
    const actual = Object.fromEntries(requestKeys.map((k) => [k, p[k]]));
    demand(
      hash(actual) === hash(r) &&
        p.passage_id === c.body.passage_id &&
        p.authority_basis === c.body.grant_id,
      'OPEN_ARROW_REQUEST_MUTATION',
    );
    const e = this.#get(id, 'HumanExpression');
    fresh(e.body.source_record.body);
    fresh(e.body.record.body);
    const h = this.#get(id, 'HumanCommit');
    this.#root(h.body.disposition);
    const recompiled = this.#lib.compileExpression(e.body.compiler_input),
      oa = this.#get(id, 'OAIR');
    const ast = this.#get(id, 'TypedAST'),
      ir = this.#get(id, 'ONEIR');
    this.#lib.verifyCompilation(e.body.compiler_input, {
      source: ast.body.source,
      ast: ast.body.ast,
      ir: ir.body.ir,
      oa_ir: oa.body,
      checks: ir.body.checks,
      frames: [
        e.body.frame,
        ast.body.frame,
        ir.body.frame,
        recompiled.frames[3],
      ],
    });
    this.#lib.assertConserved(
      recompiled.oa_ir.conservation,
      oa.body.conservation,
    );
    demand(
      hash(recompiled.oa_ir) === hash(oa.body),
      'OPEN_ARROW_LOWERING_MUTATION',
    );
  }
  admitted(p, decision) {
    const id = p.origin.arrow_id,
      c = this.#get(id, 'Commitment');
    return this.#add(
      'Dispatch',
      id,
      {
        passage_id: p.passage_id,
        decision_id: decision.decision_id,
        admitted_at: decision.issued_at,
        passage_hash: decision.passage_hash,
      },
      [c.artifact_id],
      standing('NO_CLAIM', 'ADMITTED', 'HUMAN_BOUND'),
    );
  }
  capture(chain) {
    const id = chain.passage?.body.origin?.arrow_id;
    if (!id || !chain.return || this.#get(id, 'FieldReturn')) return;
    const c = this.#get(id, 'Commitment');
    demand(c, 'OPEN_ARROW_COMMITMENT_REQUIRED');
    this.#s.transaction(() => {
      let refs = [c.artifact_id];
      for (const [kind, data] of [
        ['Decision', chain.decision],
        ['Fidelity', chain.fidelity],
        ['ExecutionAttempt', chain.attempt],
        ['Occurrence', chain.occurrence],
      ]) {
        if (data) {
          const a = this.#add(
            kind,
            id,
            data,
            refs,
            standing(
              'OBSERVATION',
              {
                Decision: 'ADMITTED',
                Fidelity: 'CHECKED',
                ExecutionAttempt: 'ATTEMPTED',
                Occurrence: 'RECORDED',
              }[kind],
              'NONE',
              data.status === 'UNKNOWN' ? 'PARTIAL' : 'EXACT',
            ),
          );
          refs = [a.artifact_id];
        }
      }
      const obs = this.#add(
        'Observation',
        id,
        {
          passage_id: chain.passage.body.passage_id,
          outcome:
            chain.occurrence?.status ||
            (chain.attempt ? 'UNKNOWN' : 'NOT_ATTEMPTED'),
          observation: chain.occurrence,
          claim_ceiling: 'BOUNDED_RECEIVER_CUSTODY_ONLY',
          evidence_effect: 'NONE',
        },
        refs,
        standing(
          'OBSERVATION',
          'RETURNED',
          'NONE',
          chain.occurrence?.status === 'OBSERVED' ? 'EXACT' : 'PARTIAL',
        ),
      );
      const receipt = this.#add(
        'Receipt',
        id,
        { chain },
        [obs.artifact_id],
        standing('ATTESTATION', 'RETURNED'),
      );
      this.#add(
        'FieldReturn',
        id,
        { return: chain.return, receipt_ref: receipt.artifact_id },
        [receipt.artifact_id],
        standing('ATTESTATION', 'RETURNED'),
      );
    });
  }
  #promote(record) {
    const b = record.body,
      id = b.arrow_id;
    const kinds = {
      QUALIFY: ['Observation', 'Evidence'],
      JUDGE: ['Evidence', 'Judgment'],
      SETTLE: ['Judgment', 'Settlement'],
      RECOGNIZE: ['Settlement', 'Successor'],
    };
    const edge = kinds[b.operation];
    demand(edge, 'ILLEGAL_STANDING_PROMOTION');
    const from = this.#get(id, edge[0]);
    demand(
      from &&
        from.artifact_id === b.source_ref &&
        from.integrity === b.source_hash,
      'ILLEGAL_STANDING_PROMOTION:SOURCE_BINDING',
    );
    this.#lib.assertPromotion(...edge, b);
    demand(!this.#get(id, edge[1]), 'PROMOTION_ALREADY_RECORDED');
    let body, s;
    if (b.operation === 'QUALIFY') {
      const chain = this.#get(id, 'Receipt').body.chain;
      body = this.#lib.qualifyAccount(
        chain,
        {
          arrow_id: id,
          observation_ref: from.artifact_id,
          commitment_ref: this.#get(id, 'HumanCommit').artifact_id,
        },
        record,
        this.#a.principal_id,
      );
      s = standing(
        'EVIDENCE',
        'QUALIFIED',
        'NONE',
        body.occurrence_claim === 'OBSERVED_BOUNDED' ? 'EXACT' : 'PARTIAL',
      );
    } else if (b.operation === 'JUDGE') {
      body = this.#lib.judgeAccount(from.body.input);
      s = standing(
        'JUDGMENT',
        'JUDGED',
        'NONE',
        body.judgment === 'ESTABLISHED' ? 'EXACT' : 'PARTIAL',
      );
    } else if (b.operation === 'SETTLE') {
      const check = this.#lib.judgeAccount(
        this.#get(id, 'Evidence').body.input,
      );
      demand(hash(check) === hash(from.body), 'SETTLEMENT_JUDGMENT_MUTATION');
      body = {
        judgment_ref: from.artifact_id,
        judgment: check.judgment,
        status:
          check.judgment === 'ESTABLISHED' ? 'SETTLED_BOUNDED' : 'UNSETTLED',
        open_obligations: check.burdens,
        receipt_ref: this.#get(id, 'Receipt').artifact_id,
        return_ref: this.#get(id, 'FieldReturn').artifact_id,
        closure: 'PROFILE_ACCOUNT_ONLY',
        future_authority: 'NONE',
      };
      s = standing(
        'JUDGMENT',
        body.status,
        'NONE',
        check.judgment === 'ESTABLISHED' ? 'EXACT' : 'PARTIAL',
      );
    } else {
      demand(from.body.status === 'SETTLED_BOUNDED', 'UNESTABLISHED_SUCCESSOR');
      body = this.#lib.recognizeAccount(
        this.#get(id, 'Evidence').body.input,
        record,
        this.#a.principal_id,
      );
      s = standing('JUDGMENT', 'RECOGNIZED');
    }
    const out = this.#add(edge[1], id, body, [from.artifact_id], s);
    this.#promotion(from, out, record);
    return out;
  }
  view(id) {
    const artifacts = this.#all(id);
    demand(artifacts.length, 'OPEN_ARROW_UNKNOWN');
    const get = (k) => artifacts.find((a) => a.kind === k),
      last = artifacts.at(-1);
    return {
      profile: this.#lib.PROFILE,
      arrow_id: id,
      field_id: this.#f.field_id,
      phase: get('Denied')
        ? 'DENIED'
        : get('Successor')
          ? 'RECOGNIZED'
          : get('Settlement')?.body.status ||
            (get('FieldReturn') && 'RETURNED') ||
            (get('Commitment') && 'COMMITTED') ||
            'HOLD',
      constitutional_success: Boolean(get('Denied') || get('Settlement')),
      intended_world_success: get('Observation')?.body.outcome === 'OBSERVED',
      successor_standing: get('Successor') ? 'RECOGNIZED' : 'UNRECOGNIZED',
      installation_effect: 'NONE',
      artifacts,
      tip: last.artifact_id,
    };
  }
  status() {
    return [
      ...new Set(this.#s.all('arrow_artifact').map((x) => x.arrow_id)),
    ].map((id) => {
      const { artifacts, ...view } = this.view(id);
      return view;
    });
  }
}
