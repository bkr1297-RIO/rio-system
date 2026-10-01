import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { LocalField } from '../../local-field/index.mjs';
import { createFieldServer } from '../../local-field/http.mjs';
import { setup, signed } from './local-field.mjs';

export async function bilateral(t, { returnMaxUses = null } = {}) {
  const return_policy = {
    policy_id: 'bounded-attributed-return', policy_version: '0.1', status: 'active',
    scope: { agents: ['node-b'], systems: ['local'] },
    action_classes: [{ class_id: 'return', pattern: 'record_return', governance_decision: 'AUTO_APPROVE', risk_tier: 'LOW' }],
  };
  const return_authority_basis = randomUUID();
  const x = setup(t, 'laptop', {}, {}, { bilateral_profile: 'local-field-bilateral-v0.1', return_policy, return_authority_basis });
  const server = createFieldServer(x.runtime);
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const sourceRoot = join(x.root, 'source-a');
  mkdirSync(sourceRoot, { mode: 0o700 });
  const definition = signed({ ...x.definition.body, receiver_node: 'node-a' }, x.human);
  const options = { root: sourceRoot, anchor: x.anchor, receiver: 'node-a', signingKey: x.a.secretKey,
    peers: { 'node-b': `http://127.0.0.1:${server.address().port}` } };
  let source = new LocalField({ ...options, definition });
  const sourceControl = (type, values) => source.control(signed({ ...x.stamp(), type, issuer: 'I-1', ...values }, x.human));
  for (const n of x.runtime.status().nodes) {
    const { created_at, revoked_at, ...node } = n;
    sourceControl('enrollment', { node });
  }
  const returnGrant = { grant_id: return_authority_basis, subject: 'node-b', target_node: 'node-a',
    action: 'record_return', target: 'return-record', scope: 'attributed-record-only', purpose: 'local-field-return',
    dependencies: {}, conditions: {}, parent: null, allow_delegation: false, max_uses: returnMaxUses };
  x.control('grant', { grant: returnGrant }); sourceControl('grant', { grant: returnGrant });
  t.after(() => source.close());
  return { ...x, x, sourceRoot, sourceControl,
    get source() { return source; },
    grantBoth(extra = {}) { const g = x.grant(extra); sourceControl('grant', { grant: g }); return g; },
    passage(g, extra = {}) { return x.passage(g, { schema_version: '0.1', replay: 'single-use',
      return_requirement: { required: true, to: 'node-a' }, ...extra }); },
    restartSource() { source.close(); source = new LocalField(options); return source; },
  };
}
