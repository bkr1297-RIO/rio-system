import assert from 'node:assert/strict';
import {
  mkdtempSync,
  readFileSync,
  existsSync,
  rmSync,
  symlinkSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { generateKeypair, signPayload } from '../../security/ed25519.mjs';
import {
  canonicalizeArgs,
  computeArgsHash,
} from '../../security/token-manager.mjs';

// Missing identity, current-standing, fidelity, or persistence checks must turn
// these real effects into failures. No adapter, signature or storage mocks.
let api;
try {
  api = await import('../../local-field/index.mjs');
} catch (e) {
  if (e.code !== 'ERR_MODULE_NOT_FOUND') throw e;
}

function signed(body, key) {
  return {
    body,
    signature: signPayload(canonicalizeArgs(body), key.secretKey),
  };
}
function setup(t, nodeType = 'laptop', policyPatch = {}, sourcePatch = {}) {
  assert.equal(
    typeof api?.LocalField,
    'function',
    'LocalField runtime boundary must exist',
  );
  const root = mkdtempSync(join(tmpdir(), 'one-field-'));
  const human = generateKeypair(),
    a = generateKeypair(),
    b = generateKeypair();
  const anchor = {
    principal_id: 'I-1',
    actor_type: 'human',
    primary_role: 'root_authority',
    public_key_hex: human.publicKey,
  };
  const field_id = randomUUID();
  const stamp = () => ({
    field_id,
    record_id: randomUUID(),
    issued_at: new Date().toISOString(),
    expires_at: new Date(Date.now() + 600000).toISOString(),
  });
  const definition = signed(
    {
      ...stamp(),
      type: 'field',
      sourcepoint: anchor.principal_id,
      receiver_node: 'node-b',
      policy: {
        policy_id: 'local-field-bounded',
        policy_version: '0.1',
        status: 'active',
        scope: { agents: ['node-a'], systems: ['local'] },
        action_classes: [
          {
            class_id: 'artifact',
            pattern: 'create_document',
            governance_decision: 'REQUIRE_HUMAN',
            risk_tier: 'LOW',
          },
        ],
        ...policyPatch,
      },
      dependencies: { corpus: 'v1' },
    },
    human,
  );
  let runtime = new api.LocalField({
    root,
    anchor,
    receiver: 'node-b',
    signingKey: b.secretKey,
    definition,
  });
  const control = (type, values, key = human, issuer = 'I-1') =>
    runtime.control(signed({ ...stamp(), type, issuer, ...values }, key));
  for (const [id, key, kind, role] of [
    ['node-a', a, nodeType, 'proposer'],
    ['node-b', b, 'local_service', 'executor'],
  ]) {
    control('enrollment', {
      node: {
        node_id: id,
        node_type: kind,
        principal_id: id,
        actor_type: kind === 'model_runtime' ? 'ai_agent' : 'executor',
        primary_role: role,
        secondary_roles: [],
        public_key_hex: key.publicKey,
        capabilities: ['create_document'],
        interfaces: ['http-json'],
        custody_boundary: id,
        status: 'active',
        ...(id === 'node-a' ? sourcePatch : {}),
      },
    });
  }
  const grant = (extra = {}) => {
    const g = {
      grant_id: randomUUID(),
      subject: 'node-a',
      target_node: 'node-b',
      action: 'create_document',
      target: 'hello.txt',
      scope: 'artifact-create',
      purpose: 'acceptance',
      dependencies: { corpus: 'v1' },
      conditions: {},
      parent: null,
      allow_delegation: false,
      max_uses: null,
      ...extra,
    };
    control('grant', { grant: g });
    return g;
  };
  const passage = (g, extra = {}) => {
    const p = {
      ...stamp(),
      type: 'passage',
      passage_id: randomUUID(),
      intent_id: randomUUID(),
      source_node: 'node-a',
      subject: 'node-a',
      target_node: 'node-b',
      action: 'create_document',
      target: 'hello.txt',
      payload: { content: 'ONE local field\n' },
      payload_hash: computeArgsHash({ content: 'ONE local field\n' }),
      authority_basis: g?.grant_id || 'missing',
      scope: 'artifact-create',
      purpose: 'acceptance',
      dependencies: { corpus: 'v1' },
      conditions: {},
      nonce: randomUUID(),
      correlation_id: randomUUID(),
      return_requirement: { required: true, to: 'I-1' },
      origin: {
        intent: 'SourcePoint-authorized bounded engineering acceptance',
        candidate_id: null,
      },
      ...extra,
    };
    return signed(p, a);
  };
  t.after(() => {
    runtime.close();
    rmSync(root, { recursive: true, force: true });
  });
  return {
    root,
    human,
    a,
    b,
    anchor,
    definition,
    field_id,
    stamp,
    control,
    grant,
    passage,
    get runtime() {
      return runtime;
    },
    restart() {
      runtime.close();
      runtime = new api.LocalField({
        root,
        anchor,
        receiver: 'node-b',
        signingKey: b.secretKey,
      });
      return runtime;
    },
  };
}

export { setup, signed };
