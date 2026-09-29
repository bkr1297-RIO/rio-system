import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { randomUUID } from 'node:crypto';
import { setup, signed } from '../helpers/local-field.mjs';
import { hash } from '../../security/local-field-authority.mjs';
if (!process.env.ONE_REFERENCE_ROOT) throw new Error('ONE_REFERENCE_ROOT_REQUIRED: point to the authorized private reference checkout');
const lib = await import(pathToFileURL(process.env.ONE_REFERENCE_ROOT).href.replace(/\/$/, '') + '/extensions/compiled-occurrence-return/open-arrow/index.mjs');
const profile = { profile: lib.PROFILE, rule: lib.RULE };
function fixture(t) {
  const f = setup(
    t,
    'laptop',
    {},
    {},
    { open_arrow: profile },
    { openArrow: lib },
  );
  assert.equal(
    typeof f.runtime.arrow,
    'function',
    'Local Field must enforce Open Arrow',
  );
  const request = {
    source_node: 'node-a',
    subject: 'node-a',
    target_node: 'node-b',
    action: 'create_document',
    target: 'Report-17.txt',
    payload: { content: 'Report 17\nCustomer Zero engineering artifact.\n' },
    scope: 'lab-to-commons',
    purpose: 'Customer Zero',
    dependencies: { corpus: 'v1' },
    conditions: {},
    return_requirement: { required: true, to: 'I-1' },
  };
  request.payload_hash = hash(request.payload);
  const human_expression = signed(
    {
      ...f.stamp(),
      type: 'human_expression',
      issuer: 'I-1',
      source_node: 'node-a',
      expression: 'Take Report 17 to the Commons.',
    },
    f.human,
  );
  const arrow_id = randomUUID();
  const proposal = signed(
    {
      ...f.stamp(),
      type: 'arrow_propose',
      source_node: 'node-a',
      arrow_id,
      human_expression,
      request,
    },
    f.a,
  );
  const view = () =>
    f.runtime.query(
      signed(
        { ...f.stamp(), type: 'query', issuer: 'I-1', view: 'arrow', arrow_id },
        f.human,
      ),
    );
  const call = (type, body, key = f.human) =>
    f.runtime.arrow(
      signed({ ...f.stamp(), type, issuer: 'I-1', arrow_id, ...body }, key),
    );
  const form = () => f.runtime.arrow(proposal);
  const get = (kind) => view().artifacts.find((x) => x.kind === kind);
  const commit = () => {
    const g = f.grant({
      ...request,
      max_uses: 1,
      payload_hash: request.payload_hash,
    });
    const passage_id = randomUUID();
    const out = call('arrow_commit', {
      proposal_hash: get('Proposal').integrity,
      grant_id: g.grant_id,
      passage_id,
      decision: 'APPROVE',
      basis: 'Explicit fixture human approval',
      adjudication: 'Exact report bytes and Commons target reviewed',
    });
    const p = f.passage(g, {
      ...request,
      passage_id,
      origin: {
        intent: 'Take Report 17 to the Commons.',
        candidate_id: null,
        arrow_id,
        commitment_id: out.artifact_id,
      },
    });
    return { g, p, out };
  };
  const promote = (operation, kind, extra = {}) =>
    call('arrow_promote', {
      operation,
      source_ref: get(kind).artifact_id,
      source_hash: get(kind).integrity,
      basis: 'Engineering human disposition',
      adjudication: 'Reviewed bounded receipt and observation',
      ...extra,
    });
  return {
    ...f,
    field: f,
    request,
    human_expression,
    arrow_id,
    proposal,
    view,
    call,
    form,
    get,
    commit,
    promote,
  };
}
test('Customer Zero remains held until exact approval then performs a real passage', (t) => {
  const f = fixture(t);
  f.form();
  assert.equal(f.view().phase, 'HOLD');
  assert.equal(existsSync(join(f.root, 'artifacts', 'Report-17.txt')), false);
  const { p } = f.commit();
  f.runtime.admit(p);
  f.runtime.execute(p.body.passage_id, p);
  assert.equal(
    readFileSync(join(f.root, 'artifacts', 'Report-17.txt'), 'utf8'),
    f.request.payload.content,
  );
  assert.ok(f.get('Observation'));
  assert.equal(f.get('Evidence'), undefined);
  assert.ok(f.runtime.verify(p.body.passage_id).valid);
});
test('generic passage endpoint cannot bypass HumanCommit with a broad valid grant', (t) => {
  const f = fixture(t);
  f.form();
  const g = f.grant({ ...f.request });
  const p = f.passage(g, { ...f.request });
  assert.throws(() => f.runtime.admit(p), /OPEN_ARROW_COMMITMENT_REQUIRED/);
  assert.equal(existsSync(join(f.root, 'artifacts', 'Report-17.txt')), false);
});
test('malformed proposal payloads fail before any formation or commitment is persisted', (t) => {
  const f = fixture(t);
  for (const payload of [{ content: 123 }, { content: 'report', extra: true }, { content: 'é'.repeat(2049) }]) {
    const bad = structuredClone(f.proposal.body);
    bad.request.payload = payload;
    bad.request.payload_hash = hash(payload);
    assert.throws(() => f.runtime.arrow(signed(bad, f.a)), /PAYLOAD_INVALID|OPEN_ARROW_REQUEST_INVALID/);
    assert.throws(() => f.view(), /OPEN_ARROW_UNKNOWN/);
    assert.throws(() => f.call('arrow_commit', { decision: 'APPROVE' }), /OPEN_ARROW_UNKNOWN/);
  }
  assert.equal(existsSync(join(f.root, 'artifacts', 'Report-17.txt')), false);
});
test('node cannot forge human expression or HumanCommit', (t) => {
  const f = fixture(t);
  const forged = structuredClone(f.proposal);
  forged.body.human_expression = signed(f.human_expression.body, f.a);
  assert.throws(
    () => f.runtime.arrow(signed(forged.body, f.a)),
    /SIGNATURE_INVALID/,
  );
  f.form();
  assert.throws(
    () =>
      f.call(
        'arrow_commit',
        { proposal_hash: f.get('Proposal').integrity, decision: 'APPROVE' },
        f.a,
      ),
    /SIGNATURE_INVALID/,
  );
});
test('target or payload cannot change after commitment or admission', (t) => {
  const f = fixture(t);
  f.form();
  const { p } = f.commit();
  const bad = structuredClone(p.body);
  bad.target = 'other.txt';
  assert.throws(
    () => f.runtime.admit(signed(bad, f.a)),
    /OPEN_ARROW_REQUEST_MUTATION/,
  );
  f.runtime.admit(p);
  bad.target = p.body.target;
  bad.payload.content = 'altered';
  bad.payload_hash = hash(bad.payload);
  assert.throws(
    () => f.runtime.execute(p.body.passage_id, signed(bad, f.a)),
    /FIDELITY_MUTATION/,
  );
});
test('revocation between approval and use still blocks the action', (t) => {
  const f = fixture(t);
  f.form();
  const { p, g } = f.commit();
  f.runtime.admit(p);
  f.control('revocation', { grant_id: g.grant_id });
  assert.throws(
    () => f.runtime.execute(p.body.passage_id, p),
    /AUTHORITY_REVOKED/,
  );
});
test('distinct explicit promotions create evidence judgment settlement successor with immutable history', (t) => {
  const f = fixture(t);
  f.form();
  const { p } = f.commit();
  f.runtime.admit(p);
  f.runtime.execute(p.body.passage_id, p);
  const old = JSON.stringify(f.get('Observation'));
  assert.throws(
    () => f.promote('RECOGNIZE', 'Observation'),
    /ILLEGAL_STANDING_PROMOTION/,
  );
  f.promote('QUALIFY', 'Observation');
  assert.notEqual(
    f.get('Evidence').artifact_id,
    f.get('Observation').artifact_id,
  );
  f.promote('JUDGE', 'Evidence');
  f.promote('SETTLE', 'Judgment');
  f.promote('RECOGNIZE', 'Settlement');
  assert.equal(f.view().successor_standing, 'RECOGNIZED');
  assert.equal(f.view().constitutional_success, true);
  assert.equal(f.view().intended_world_success, true);
  assert.equal(JSON.stringify(f.get('Observation')), old);
  assert.equal(f.get('Successor').standing.Authority, 'NONE');
  const prior = f.view();
  f.field.restart();
  assert.deepEqual(f.view(), prior);
  assert.throws(() => f.field.runtime.admit(p), /REPLAY|AUTHORITY_SPENT/);
});
test('real adapter failure returns unknown effect and cannot promote to recognized successor', (t) => {
  const f = fixture(t);
  f.form();
  const { p } = f.commit();
  writeFileSync(
    join(f.root, 'artifacts', 'Report-17.txt'),
    'Existing unrelated bytes',
  );
  f.runtime.admit(p);
  f.runtime.execute(p.body.passage_id, p);
  assert.equal(f.get('Observation').body.outcome, 'UNKNOWN');
  f.promote('QUALIFY', 'Observation');
  f.promote('JUDGE', 'Evidence');
  f.promote('SETTLE', 'Judgment');
  assert.equal(f.view().constitutional_success, true);
  assert.equal(f.view().intended_world_success, false);
  assert.throws(
    () => f.promote('RECOGNIZE', 'Settlement'),
    /UNESTABLISHED_SUCCESSOR/,
  );
  assert.equal(
    readFileSync(join(f.root, 'artifacts', 'Report-17.txt'), 'utf8'),
    'Existing unrelated bytes',
  );
});
test('denial is a correct terminal non-action and never dispatches', (t) => {
  const f = fixture(t);
  f.form();
  f.call('arrow_commit', {
    proposal_hash: f.get('Proposal').integrity,
    decision: 'DENY',
    basis: 'Human refused',
    adjudication: 'Keep in Lab',
  });
  assert.equal(f.view().phase, 'DENIED');
  assert.equal(f.view().constitutional_success, true);
  assert.equal(f.view().intended_world_success, false);
  assert.equal(existsSync(join(f.root, 'artifacts', 'Report-17.txt')), false);
});
export { fixture };
test('promotion needs exact source hash basis and fresh independent human disposition', (t) => {
  const f = fixture(t);
  f.form();
  const { p } = f.commit();
  f.runtime.admit(p);
  f.runtime.execute(p.body.passage_id, p);
  const source = f.get('Observation');
  const base = {
    operation: 'QUALIFY',
    source_ref: source.artifact_id,
    source_hash: source.integrity,
    basis: 'Human qualification',
    adjudication: 'Bounded readback',
  };
  assert.throws(
    () =>
      f.call('arrow_promote', {
        ...base,
        source_hash: 'sha256:' + '0'.repeat(64),
      }),
    /SOURCE_BINDING/,
  );
  assert.throws(
    () => f.call('arrow_promote', { ...base, basis: '' }),
    /ILLEGAL_STANDING_PROMOTION/,
  );
  assert.throws(() => f.call('arrow_promote', base, f.a), /SIGNATURE_INVALID/);
  assert.throws(
    () =>
      f.call('arrow_promote', { ...base, expires_at: '2000-01-01T00:00:00Z' }),
    /EXPIRED/,
  );
  assert.equal(f.get('Evidence'), undefined);
});
test('missing library fails closed for a constituted Open Arrow field', (t) => {
  assert.throws(
    () => setup(t, 'laptop', {}, {}, { open_arrow: profile }),
    /OPEN_ARROW_DEPENDENCY_REQUIRED/,
  );
});
test('inspection after a fidelity hold is read-only', (t) => {
  const f = fixture(t);
  f.form();
  const { p, g } = f.commit();
  f.runtime.admit(p);
  f.control('revocation', { grant_id: g.grant_id });
  assert.throws(
    () => f.runtime.execute(p.body.passage_id, p),
    /AUTHORITY_REVOKED/,
  );
  const ledger = () =>
    f.runtime.query(
      signed(
        { ...f.stamp(), type: 'query', issuer: 'I-1', view: 'ledger' },
        f.human,
      ),
    );
  const before = ledger();
  f.view();
  assert.deepEqual(ledger(), before);
});
test('HTTP arrow route returns HOLD and a generic signed passage still cannot bypass it', async (t) => {
  const f = fixture(t),
    { createFieldServer } = await import('../../local-field/http.mjs');
  const server = createFieldServer(f.runtime);
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  t.after(() => server.close());
  const post = async (path, body) => {
    const r = await fetch(`http://127.0.0.1:${server.address().port}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    return { status: r.status, body: await r.json() };
  };
  assert.equal((await post('/arrow', f.proposal)).status, 200);
  const g = f.grant({ ...f.request });
  assert.equal(
    (await post('/passages', f.passage(g, { ...f.request }))).body.error,
    'OPEN_ARROW_COMMITMENT_REQUIRED',
  );
});
