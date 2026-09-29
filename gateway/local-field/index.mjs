import { randomUUID } from 'node:crypto';
import { join, resolve } from 'node:path';
import { LocalStore } from '../ledger/local-store.mjs';
import { OpenArrow } from './open-arrow.mjs';
import {
  canonicalizeArgs,
  issueExecutionToken,
  validateAndBurnToken,
} from '../security/token-manager.mjs';
import { signPayload, verifySignature } from '../security/ed25519.mjs';
import {
  hash,
  requireValue,
  fresh,
  verifySigned,
  validateNode,
  nodeAt,
  verifyNodeRecord,
  resolveGrant,
} from '../security/local-field-authority.mjs';
import { evaluatePolicy } from '../governance/policy-engine.mjs';
import {
  createFilesystemExecutor,
  validateArtifactOperation,
} from '../execution/filesystem-executor.mjs';
import {
  generateReceipt,
  verifyLocalFieldReceipt,
  sealLocalFieldReceipt,
  sealLocalFieldReturn,
  verifyLocalFieldReturn,
  hashIntent,
  hashGovernance,
  hashAuthorization,
  hashExecution,
} from '../receipts/receipts.mjs';

const stamp = () => new Date().toISOString();
const clone = (x) => structuredClone(x);

/** Coordinates existing gateway owners; transport carries records, never permission. */
export class LocalField {
  #store;
  #anchor;
  #field;
  #receiver;
  #signingKey;
  #executor;
  #tokens = new Map();
  #closed = false;
  #arrow;
  constructor({ root, anchor, receiver, signingKey, definition, openArrow }) {
    requireValue(
      root &&
        anchor?.actor_type === 'human' &&
        anchor.primary_role === 'root_authority' &&
        /^[0-9a-f]{64}$/.test(anchor.public_key_hex),
      'SOURCEPOINT_ROOT_REQUIRED',
    );
    this.#anchor = clone(anchor);
    this.#receiver = receiver;
    this.#signingKey = signingKey;
    this.#store = new LocalStore(resolve(root));
    try {
      let saved = this.#store.get('field', 'definition');
      if (!saved) {
        requireValue(
          definition?.body?.type === 'field' &&
            definition.body.sourcepoint === anchor.principal_id &&
            definition.body.receiver_node === receiver,
          'FIELD_DEFINITION_REQUIRED',
        );
        verifySigned(definition, anchor.public_key_hex);
        fresh(definition.body);
        requireValue(
          definition.body.policy?.status === 'active' &&
            definition.body.dependencies &&
            typeof definition.body.dependencies === 'object',
          'FIELD_POLICY_REQUIRED',
        );
        this.#store.transaction(() => {
          this.#store.insert('anchor', 'sourcepoint', anchor);
          this.#store.insert('field', 'definition', definition);
          for (const [key, value] of Object.entries(
            definition.body.dependencies,
          ))
            this.#store.state('dependency', key, value);
          this.#store.append({
            intent_id: definition.body.record_id,
            action: 'field.constitute',
            agent_id: anchor.principal_id,
            status: 'constituted',
            detail: JSON.stringify(definition),
          });
        });
        saved = definition;
      }
      requireValue(
        hash(this.#store.get('anchor', 'sourcepoint')) === hash(anchor),
        'ROOT_SUBSTITUTION',
      );
      verifySigned(saved, anchor.public_key_hex);
      requireValue(
        saved.body.receiver_node === receiver,
        'RECEIVER_SUBSTITUTION',
      );
      this.#field = clone(saved.body);
      if (this.#field.open_arrow)
        this.#arrow = new OpenArrow({
          store: this.#store,
          field: this.#field,
          anchor: this.#anchor,
          receiver,
          signingKey,
          library: openArrow,
        });
      for (const enrolled of this.#store.all('enrollment'))
        verifySigned(enrolled, anchor.public_key_hex);
      const receiverEnrollment = this.#store.get('enrollment', receiver);
      if (receiverEnrollment)
        requireValue(
          verifySignature(
            'local-field-receiver',
            signPayload('local-field-receiver', signingKey),
            receiverEnrollment.body.node.public_key_hex,
          ),
          'RECEIVER_KEY_MISMATCH',
        );
      this.#store.acquireLease();
      this.#executor = createFilesystemExecutor({
        root: join(resolve(root), 'artifacts'),
        guard: (operation, permit) =>
          this.#store.transaction(() => this.#release(operation, permit)),
      });
      this.#recover();
      if (this.#arrow)
        for (const r of this.#store.all('passage'))
          this.#arrow.capture(this.inspect(r.body.passage_id));
    } catch (e) {
      this.#store.close();
      throw e;
    }
  }
  #record(kind, id, value, status = kind) {
    this.#store.insert(kind, id, value);
    return this.#store.append({
      intent_id:
        value.passage_id ||
        value.body?.passage_id ||
        value.body?.record_id ||
        id,
      action: kind,
      agent_id: this.#receiver,
      status,
      detail: JSON.stringify(value),
    });
  }
  #controlSignature(record) {
    const b = record?.body;
    requireValue(b?.field_id === this.#field.field_id, 'FIELD_MISMATCH');
    fresh(b);
    const issuer =
      b.issuer === this.#anchor.principal_id
        ? this.#anchor
        : nodeAt(this.#store, b.issuer);
    verifySigned(record, issuer.public_key_hex);
    requireValue(
      typeof b.record_id === 'string' && b.record_id.length >= 16,
      'CONTROL_ID_REQUIRED',
    );
    return b;
  }
  control(record) {
    canonicalizeArgs(record);
    record = clone(record);
    const b = this.#controlSignature(record),
      root = b.issuer === this.#anchor.principal_id;
    return this.#store.transaction(() => {
      this.#store.useNonce('control', b.record_id);
      if (b.type === 'enrollment') {
        requireValue(root, 'ROOT_REQUIRED');
        validateNode(b.node);
        requireValue(
          b.node.node_id !== this.#anchor.principal_id,
          'SOURCE_IS_NOT_NODE',
        );
        requireValue(
          !this.#store.get('enrollment', b.node.node_id),
          'NODE_ALREADY_ENROLLED',
        );
        requireValue(
          !this.#store
            .all('enrollment')
            .some((e) => e.body.node.public_key_hex === b.node.public_key_hex),
          'NODE_KEY_MUST_BE_DISTINCT',
        );
        requireValue(
          b.node.public_key_hex !== this.#anchor.public_key_hex,
          'ROOT_KEY_IS_NOT_NODE_KEY',
        );
        this.#record('enrollment', b.node.node_id, record);
      } else if (b.type === 'grant') {
        const g = b.grant;
        requireValue(
          g && typeof g.grant_id === 'string' && g.grant_id.length >= 16,
          'GRANT_ID_REQUIRED',
        );
        for (const key of [
          'subject',
          'action',
          'target',
          'target_node',
          'scope',
          'purpose',
        ])
          requireValue(
            typeof g[key] === 'string' && g[key].length > 0,
            'GRANT_SCOPE_REQUIRED',
          );
        requireValue(
          g.conditions && hash(g.conditions) === hash({}),
          'UNSUPPORTED_CONDITIONS',
        );
        requireValue(
          g.dependencies &&
            typeof g.dependencies === 'object' &&
            !Array.isArray(g.dependencies),
          'GRANT_DEPENDENCIES_REQUIRED',
        );
        requireValue(
          g.max_uses === null ||
            (Number.isInteger(g.max_uses) && g.max_uses > 0),
          'GRANT_USE_LIMIT_INVALID',
        );
        requireValue(
          typeof g.allow_delegation === 'boolean' &&
            (g.parent === null || typeof g.parent === 'string'),
          'GRANT_LINEAGE_INVALID',
        );
        nodeAt(this.#store, g.subject);
        nodeAt(this.#store, g.target_node);
        if (g.parent) {
          const p = this.#store.get('grant', g.parent);
          requireValue(
            p?.body.grant.allow_delegation && p.body.grant.subject === b.issuer,
            'DELEGATION_NOT_ALLOWED',
          );
          requireValue(
            Date.parse(b.expires_at) <= Date.parse(p.body.expires_at),
            'DELEGATION_EXPIRY_EXPANSION',
          );
          resolveGrant(
            this.#store,
            g.parent,
            { ...g, subject: b.issuer },
            this.#anchor,
            this.#field.field_id,
          );
        } else requireValue(root, 'ROOT_REQUIRED');
        this.#record('grant', g.grant_id, record);
      } else if (b.type === 'revocation' || b.type === 'supersession') {
        const prior = this.#store.get('grant', b.grant_id);
        requireValue(
          prior && (root || prior.body.issuer === b.issuer),
          'REVOCATION_AUTHORITY_REQUIRED',
        );
        this.#store.state(
          b.type === 'revocation' ? 'grant_revoked' : 'grant_superseded',
          b.grant_id,
          b.record_id,
        );
        this.#record('revocation', b.record_id, record);
      } else if (b.type === 'node_revocation') {
        requireValue(root, 'ROOT_REQUIRED');
        nodeAt(this.#store, b.node_id);
        this.#store.state('node_revoked', b.node_id, b.record_id);
        this.#record('revocation', b.record_id, record);
      } else if (b.type === 'dependency') {
        requireValue(
          root && typeof b.name === 'string' && typeof b.value === 'string',
          'DEPENDENCY_CONTROL_INVALID',
        );
        this.#store.state('dependency', b.name, b.value);
        this.#record('dependency', b.record_id, record);
      } else throw new Error('CONTROL_TYPE_INVALID');
      return {
        status: 'RECORDED',
        record_id: b.record_id,
        authority_effect: b.type === 'enrollment' ? 'membership_only' : b.type,
      };
    });
  }
  candidate(record) {
    requireValue(record?.body?.type === 'candidate', 'CANDIDATE_REQUIRED');
    canonicalizeArgs(record);
    record = clone(record);
    verifyNodeRecord(this.#store, record, this.#field.field_id);
    requireValue(
      [
        'proposal',
        'candidate',
        'inference',
        'draft',
        'observation_claim',
        'recommended_action',
      ].includes(record.body.kind),
      'CANDIDATE_KIND_INVALID',
    );
    requireValue(
      typeof record.body.candidate_id === 'string' &&
        record.body.candidate_id.length >= 16,
      'CANDIDATE_ID_REQUIRED',
    );
    const artifact = {
      ...record,
      authority_effect: 'none',
      content_hash: hash({ content: record.body.content }),
    };
    this.#store.transaction(() => {
      this.#store.useNonce('candidate', record.body.record_id);
      this.#record('candidate', record.body.candidate_id, artifact);
    });
    return clone(artifact);
  }
  #request(record) {
    requireValue(record?.body?.type === 'passage', 'PASSAGE_REQUIRED');
    canonicalizeArgs(record);
    const p = record.body,
      node = verifyNodeRecord(this.#store, record, this.#field.field_id);
    requireValue(p.subject === p.source_node, 'SUBJECT_BINDING');
    requireValue(
      [node.primary_role, ...node.secondary_roles].includes('proposer'),
      'PROPOSER_ROLE_REQUIRED',
    );
    requireValue(p.target_node === this.#receiver, 'TARGET_NODE_MISMATCH');
    const receiver = nodeAt(this.#store, this.#receiver);
    requireValue(
      receiver.primary_role === 'executor' &&
        receiver.capabilities.includes(p.action) &&
        node.capabilities.includes(p.action),
      'CAPABILITY_MISSING',
    );
    requireValue(
      verifySignature(
        'local-field-receiver',
        signPayload('local-field-receiver', this.#signingKey),
        receiver.public_key_hex,
      ),
      'RECEIVER_KEY_MISMATCH',
    );
    for (const key of ['passage_id', 'intent_id', 'nonce', 'correlation_id'])
      requireValue(
        typeof p[key] === 'string' && p[key].length >= 16,
        `PASSAGE_${key.toUpperCase()}_REQUIRED`,
      );
    requireValue(
      p.return_requirement?.required === true &&
        p.return_requirement.to === this.#anchor.principal_id,
      'RETURN_REQUIRED',
    );
    requireValue(
      p.dependencies &&
        typeof p.dependencies === 'object' &&
        !Array.isArray(p.dependencies) &&
        p.conditions,
      'DEPENDENCIES_REQUIRED',
    );
    requireValue(p.payload_hash === hash(p.payload), 'PAYLOAD_HASH_MISMATCH');
    requireValue(
      p.origin &&
        typeof p.origin.intent === 'string' &&
        p.origin.intent.length > 0,
      'SOURCE_INTENT_REQUIRED',
    );
    if (
      ['model_runtime', 'agent_runtime'].includes(node.node_type) ||
      node.actor_type === 'ai_agent'
    )
      requireValue(p.origin.candidate_id, 'MODEL_CANDIDATE_REQUIRED');
    if (p.origin.candidate_id) {
      const c = this.#store.get('candidate', p.origin.candidate_id);
      requireValue(
        c && c.body.source_node === p.source_node,
        'CANDIDATE_ORIGIN_MISMATCH',
      );
    }
    validateArtifactOperation(p);
    this.#arrow?.guard(p);
    return p;
  }
  #decision(record) {
    const p = this.#request(record);
    const lineage = resolveGrant(
      this.#store,
      p.authority_basis,
      p,
      this.#anchor,
      this.#field.field_id,
    );
    const intent = {
      intent_id: p.intent_id,
      action: p.action,
      agent_id: p.subject,
      parameters: { ...p.payload, target: p.target, passage: p },
      timestamp: p.issued_at,
      target_environment: 'local',
    };
    const policy = evaluatePolicy(
      intent,
      { ...this.#field.policy, policy_hash: hash(this.#field.policy) },
      { systemMode: 'NORMAL' },
    );
    requireValue(
      ['REQUIRE_HUMAN', 'AUTO_APPROVE'].includes(policy.governance_decision),
      'RIO_DENIED_OR_HELD',
    );
    return { intent, lineage, policy };
  }
  admit(record) {
    canonicalizeArgs(record);
    record = clone(record);
    const p = record.body;
    let createdToken = false;
    try {
      return this.#store.transaction(() => {
        const { intent, lineage, policy } = this.#decision(record);
        this.#store.useNonce(`passage:${p.source_node}`, p.nonce);
        requireValue(
          !this.#store.get('passage', p.passage_id),
          'REPLAY_PASSAGE_ID',
        );
        const decision = {
          decision_id: randomUUID(),
          passage_id: p.passage_id,
          status: 'ADMITTED',
          passage_hash: hash(p),
          policy,
          authority_lineage: lineage.map((g) => g.body.grant.grant_id),
          issued_at: stamp(),
          owner: 'gateway/governance/policy-engine.mjs',
        };
        const token = issueExecutionToken({
          intent_id: p.intent_id,
          approval_id: p.authority_basis,
          tool_name: p.action,
          args_hash: hash(p),
          environment: this.#field.field_id,
          signFn: (s) => signPayload(s, this.#signingKey),
        });
        this.#tokens.set(p.passage_id, token);
        createdToken = true;
        this.#record('passage', p.passage_id, record);
        this.#record('intent', p.passage_id, intent);
        this.#record('decision', p.passage_id, decision);
        this.#store.state('phase', p.passage_id, 'ADMITTED');
        this.#arrow?.admitted(p, decision);
        return clone(decision);
      });
    } catch (e) {
      if (createdToken) this.#tokens.delete(p?.passage_id);
      // Invalid/unknown-node traffic is bounded diagnostic data, not an admitted passage.
      const denial = {
        denial_id: randomUUID(),
        passage_id: typeof p?.passage_id === 'string' ? p.passage_id : null,
        status: 'DENIED',
        reason: e.message,
        at: stamp(),
      };
      this.#store.transaction(() =>
        this.#record('denial', denial.denial_id, denial),
      );
      throw e;
    }
  }
  #release(operation, permit) {
    const id = permit?.passage_id,
      record = permit?.record;
    requireValue(
      id && this.#store.state('phase', id) === 'ADMITTED',
      'NOT_ADMITTED',
    );
    const decision = this.#store.get('decision', id),
      p = record?.body;
    requireValue(
      p?.passage_id === id &&
        hash(p) === decision.passage_hash &&
        hash(operation) === hash(p),
      'FIDELITY_MUTATION',
    );
    const { lineage, policy } = this.#decision(record);
    requireValue(
      hash(policy) === hash(decision.policy),
      'FIDELITY_POLICY_CHANGED',
    );
    const token = this.#tokens.get(id);
    requireValue(token, 'FIDELITY_TOKEN_MISSING');
    const receiver = nodeAt(this.#store, this.#receiver);
    const check = validateAndBurnToken(p.intent_id, token.token, {
      tool_name: p.action,
      args_hash: hash(operation),
      environment: this.#field.field_id,
      signature: token.signature,
      verifyFn: (message, signature) =>
        verifySignature(message, signature, receiver.public_key_hex),
    });
    requireValue(check.valid, `FIDELITY_TOKEN:${check.reason}`);
    for (const g of lineage) {
      const gid = g.body.grant.grant_id;
      this.#store.state('uses', gid, (this.#store.state('uses', gid) || 0) + 1);
    }
    const fidelity = {
      fidelity_id: randomUUID(),
      passage_id: id,
      status: 'PASS',
      decision_id: decision.decision_id,
      passage_hash: hash(operation),
      checks: check.checks,
      checked_at: stamp(),
    };
    this.#record('fidelity', id, fidelity);
    this.#record('attempt', id, {
      attempt_id: randomUUID(),
      passage_id: id,
      action: p.action,
      target: p.target,
      payload_hash: p.payload_hash,
      attempted_at: stamp(),
      executor_node: this.#receiver,
    });
    this.#store.state('phase', id, 'ATTEMPTED');
    this.#tokens.delete(id);
  }
  execute(id, record) {
    requireValue(this.#store.state('phase', id) === 'ADMITTED', 'NOT_ADMITTED');
    canonicalizeArgs(record);
    record = clone(record);
    // Authenticate the original signer before a failure may alter that passage.
    // An unrelated enrolled node must not be able to force someone else's HOLD.
    const original = this.#store.get('passage', id).body;
    requireValue(
      record?.body?.source_node === original.source_node &&
        record.body.passage_id === id,
      'EXECUTION_CALLER_MISMATCH',
    );
    verifySigned(
      record,
      this.#store.get('enrollment', original.source_node).body.node
        .public_key_hex,
    );
    // The adapter calls its guard immediately before open/create. The guard commits
    // the durable attempt and consumes standing before any external mutation.
    const permit = { passage_id: id, record };
    const operation = clone(record.body);
    let result, occurrence;
    try {
      result = this.#executor.execute(operation, { ...permit, commit: true });
      occurrence = this.#executor.observe(operation);
    } catch (e) {
      if (this.#store.state('phase', id) !== 'ATTEMPTED') {
        this.#store.transaction(() => {
          this.#record('fidelity_failure', randomUUID(), {
            passage_id: id,
            status: 'FAIL',
            reason: e.message,
            checked_at: stamp(),
          });
          this.#store.state('phase', id, 'HELD');
          this.#return(id, 'FIDELITY_HOLD', null, e.message);
        });
        this.#arrow?.capture(this.inspect(id));
        throw e;
      }
      result = { status: 'FAILED', reason: e.message };
      occurrence = {
        occurrence_id: randomUUID(),
        status: 'UNKNOWN',
        target: operation.target,
        observed_at: stamp(),
        reason:
          'Execution or observation failed; non-occurrence is not inferred',
      };
    }
    const returned = this.#complete(id, result, occurrence);
    this.#arrow?.capture(this.inspect(id));
    return returned;
  }
  #complete(id, result, occurrence) {
    return this.#store.transaction(() => {
      const record = this.#store.get('passage', id),
        p = record.body,
        decision = this.#store.get('decision', id),
        intent = this.#store.get('intent', id);
      this.#record('occurrence', id, occurrence);
      const governance = {
        intent_id: p.intent_id,
        status: decision.status,
        risk_level: decision.policy.risk_tier,
        requires_approval: true,
        checks: { decision },
      };
      const authorization = {
        intent_id: p.intent_id,
        decision: 'approved',
        authorized_by: this.#anchor.principal_id,
        timestamp: decision.issued_at,
        conditions: {
          lineage: decision.authority_lineage.map((g) =>
            this.#store.get('grant', g),
          ),
          passage_hash: decision.passage_hash,
        },
      };
      const execution = {
        intent_id: p.intent_id,
        action: p.action,
        connector: 'gateway/execution/filesystem-executor.mjs',
        timestamp: stamp(),
        result: {
          adapter: result,
          attempt: this.#store.get('attempt', id),
          occurrence,
          fidelity: this.#store.get('fidelity', id),
          provenance: {
            proposed: p.source_node,
            admitted: this.#receiver,
            attempted: this.#receiver,
            observed: this.#receiver,
            returned: this.#receiver,
          },
          correlation_id: p.correlation_id,
        },
      };
      const receipt = sealLocalFieldReceipt(
        generateReceipt({
          intent_hash: hashIntent(intent),
          governance_hash: hashGovernance(governance),
          authorization_hash: hashAuthorization(authorization),
          execution_hash: hashExecution(execution),
          intent_id: p.intent_id,
          action: p.action,
          agent_id: p.subject,
          authorized_by: this.#anchor.principal_id,
          ingestion: {
            source: 'local-field',
            channel: 'signed-passage',
            source_message_id: id,
          },
          policy: {
            evaluated: true,
            decision: 'ALLOW',
            policy_pack: this.#field.policy.policy_id,
            rules_triggered: ['EXACT_HUMAN_GRANT', 'POINT_OF_USE_FIDELITY'],
          },
        }),
        {
          field_id: this.#field.field_id,
          passage_id: id,
          signer_id: this.#receiver,
        },
        this.#signingKey,
      );
      const artifacts = { intent, governance, authorization, execution };
      this.#record('receipt_artifacts', id, artifacts);
      this.#record('receipt', id, receipt);
      const outcome =
        result.status === 'COMPLETED' && occurrence.status === 'OBSERVED'
          ? 'OBSERVED'
          : 'FAILED';
      this.#store.state('phase', id, 'COMPLETED');
      return this.#return(id, outcome, receipt.receipt_id);
    });
  }
  #return(id, outcome, receiptId = null, reason = null) {
    const p = this.#store.get('passage', id).body;
    const returned = sealLocalFieldReturn(
      {
        return_id: randomUUID(),
        passage_id: id,
        intent_id: p.intent_id,
        correlation_id: p.correlation_id,
        to: p.return_requirement.to,
        status: 'RETURNED',
        outcome,
        receipt_id: receiptId,
        reason,
        returned_at: stamp(),
      },
      { field_id: this.#field.field_id, signer_id: this.#receiver },
      this.#signingKey,
    );
    this.#record('return', id, returned);
    return clone(returned);
  }
  #recover() {
    this.#store.transaction(() => {
      for (const signed of this.#store.all('passage')) {
        const id = signed.body.passage_id,
          phase = this.#store.state('phase', id);
        if (['ADMITTED', 'ATTEMPTED'].includes(phase)) {
          this.#store.state('phase', id, 'HELD');
          this.#return(
            id,
            phase === 'ATTEMPTED' ? 'UNSETTLED_ATTEMPT' : 'RESTART_HOLD',
            null,
            'No permission regenerated and no effect replayed',
          );
        }
      }
    });
  }
  inspect(id) {
    const kinds = [
      'passage',
      'intent',
      'decision',
      'fidelity',
      'attempt',
      'occurrence',
      'receipt_artifacts',
      'receipt',
      'return',
    ];
    return Object.fromEntries(kinds.map((k) => [k, this.#store.get(k, id)]));
  }
  verify(id, supplied = null) {
    try {
      const saved = this.inspect(id),
        c = supplied || saved,
        a = c.receipt_artifacts,
        r = c.receipt;
      const key = this.#store.get('enrollment', this.#receiver).body.node
        .public_key_hex;
      const valid =
        hash(c) === hash(saved) &&
        verifyLocalFieldReceipt(r, key, {
          field_id: this.#field.field_id,
          passage_id: id,
          signer_id: this.#receiver,
        }) &&
        verifyLocalFieldReturn(c.return, key, {
          field_id: this.#field.field_id,
          signer_id: this.#receiver,
        }) &&
        r.hash_chain.intent_hash === hashIntent(a.intent) &&
        r.hash_chain.governance_hash === hashGovernance(a.governance) &&
        r.hash_chain.authorization_hash ===
          hashAuthorization(a.authorization) &&
        r.hash_chain.execution_hash === hashExecution(a.execution) &&
        hash(c.decision) === hash(a.governance.checks.decision) &&
        hash(c.occurrence) === hash(a.execution.result.occurrence) &&
        c.return.passage_id === c.passage.body.passage_id &&
        c.return.receipt_id === r.receipt_id;
      return { valid, passage_id: id };
    } catch {
      return { valid: false, passage_id: id };
    }
  }
  status() {
    return {
      open_arrows: this.#arrow?.status() || [],
      field: {
        field_id: this.#field.field_id,
        sourcepoint: this.#anchor.principal_id,
        receiver: this.#receiver,
      },
      nodes: this.#store.all('enrollment').map((r) => ({
        ...r.body.node,
        created_at: r.body.issued_at,
        revoked_at:
          this.#store.get(
            'revocation',
            this.#store.state('node_revoked', r.body.node.node_id),
          )?.body.issued_at || null,
        status: this.#store.state('node_revoked', r.body.node.node_id)
          ? 'revoked'
          : 'active',
      })),
      bindings: this.#store.all('grant').map((r) => ({
        grant_id: r.body.grant.grant_id,
        subject: r.body.grant.subject,
        target_node: r.body.grant.target_node,
        parent: r.body.grant.parent,
        revoked: Boolean(
          this.#store.state('grant_revoked', r.body.grant.grant_id),
        ),
        superseded: Boolean(
          this.#store.state('grant_superseded', r.body.grant.grant_id),
        ),
        uses: this.#store.state('uses', r.body.grant.grant_id) || 0,
        ...this.#bindingState(r),
        expires_at: r.body.expires_at,
      })),
      passages: this.#store.all('passage').map((r) => ({
        passage_id: r.body.passage_id,
        phase: this.#store.state('phase', r.body.passage_id),
      })),
      decisions: this.#store.all('decision'),
      holds: this.#store.all('denial'),
      fidelity: this.#store.all('fidelity'),
      fidelity_failures: this.#store.all('fidelity_failure'),
      occurrences: this.#store.all('occurrence'),
      attempts: this.#store.all('attempt'),
      receipts: this.#store.all('receipt'),
      revocations: this.#store.all('revocation'),
      returns: this.#store.all('return'),
    };
  }
  #bindingState(record) {
    try {
      nodeAt(this.#store, record.body.grant.subject);
      nodeAt(this.#store, record.body.grant.target_node);
      resolveGrant(
        this.#store,
        record.body.grant.grant_id,
        record.body.grant,
        this.#anchor,
        this.#field.field_id,
      );
      return { status: 'active', reason: null };
    } catch (e) {
      return { status: 'inactive', reason: e.message };
    }
  }
  query(record) {
    const b = record?.body;
    requireValue(
      b?.type === 'query' && b.field_id === this.#field.field_id,
      'QUERY_INVALID',
    );
    fresh(b);
    const key =
      b.issuer === this.#anchor.principal_id
        ? this.#anchor.public_key_hex
        : nodeAt(this.#store, b.issuer).public_key_hex;
    verifySigned(record, key);
    requireValue(b.issuer === this.#anchor.principal_id, 'QUERY_ROOT_REQUIRED');
    if (b.view === 'arrow') {
      requireValue(this.#arrow, 'OPEN_ARROW_NOT_CONFIGURED');
      return this.#arrow.view(b.arrow_id);
    }
    if (b.view === 'ledger') return this.#store.ledger();
    return b.passage_id ? this.inspect(b.passage_id) : this.status();
  }
  assertTransport(record, surface) {
    const node = verifyNodeRecord(this.#store, record, this.#field.field_id);
    requireValue(
      node.interfaces.includes(surface),
      'NODE_INTERFACE_NOT_ALLOWED',
    );
  }
  arrow(record) {
    requireValue(this.#arrow, 'OPEN_ARROW_NOT_CONFIGURED');
    return clone(this.#arrow.handle(record));
  }
  assertControlTransport(record, surface) {
    const body = this.#controlSignature(record);
    if (body.issuer !== this.#anchor.principal_id)
      requireValue(
        nodeAt(this.#store, body.issuer).interfaces.includes(surface),
        'NODE_INTERFACE_NOT_ALLOWED',
      );
  }
  close() {
    if (!this.#closed) {
      this.#executor?.close();
      this.#store.close();
      this.#closed = true;
    }
  }
}
