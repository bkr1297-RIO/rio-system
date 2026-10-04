import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, symlinkSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { computeArgsHash } from '../security/token-manager.mjs';
import { LocalField } from '../local-field/index.mjs';
import { LocalStore } from '../ledger/local-store.mjs';
import { verifyLocalFieldReturn } from '../receipts/receipts.mjs';
import { setup, signed } from './helpers/local-field.mjs';

test('an ordinary passage may omit its optional candidate ID through execution and historical verification', t => {
  const x = setup(t, 'laptop'), p = x.passage(x.grant(), { origin: { intent: 'human-originated ordinary request' } });
  const id = p.body.passage_id;
  assert.equal(x.runtime.admit(p).status, 'ADMITTED');
  assert.equal(x.runtime.execute(id, p).outcome, 'OBSERVED');
  assert.equal(x.runtime.verify(id).valid, true);
  const chain = x.runtime.inspect(id);
  x.restart();
  assert.deepEqual(x.runtime.inspect(id), chain);
  assert.equal(x.runtime.verify(id).valid, true);
});

test('01 valid enrolled passage creates an actual observed artifact with native receipt', (t) => {
  const x = setup(t),
    p = x.passage(x.grant());
  const d = x.runtime.admit(p);
  assert.equal(d.status, 'ADMITTED');
  assert.equal(existsSync(join(x.root, 'artifacts', 'hello.txt')), false);
  const r = x.runtime.execute(p.body.passage_id, p);
  assert.equal(r.status, 'RETURNED');
  assert.equal(
    readFileSync(join(x.root, 'artifacts', 'hello.txt'), 'utf8'),
    'ONE local field\n',
  );
  const chain = x.runtime.inspect(p.body.passage_id);
  assert.equal(chain.occurrence.status, 'OBSERVED');
  assert.equal(chain.receipt.verification.chain_length, 5);
  assert.equal(x.runtime.verify(p.body.passage_id).valid, true);
});
test('02 unknown node is rejected without effect', (t) => {
  const x = setup(t),
    p = x.passage(x.grant(), { source_node: 'unknown', subject: 'unknown' });
  assert.throws(() => x.runtime.admit(p), /UNKNOWN_NODE/);
});
test('03 invalid signature and changed integrity are rejected', (t) => {
  const x = setup(t),
    p = x.passage(x.grant());
  p.body.payload.content = 'changed';
  assert.throws(() => x.runtime.admit(p), /SIGNATURE/);
});
test('04 expired passage is rejected', (t) => {
  const x = setup(t),
    p = x.passage(x.grant(), { expires_at: '2000-01-01T00:00:00.000Z' });
  assert.throws(() => x.runtime.admit(p), /EXPIRED/);
});
test('05 replayed passage cannot produce a second effect', (t) => {
  const x = setup(t),
    p = x.passage(x.grant());
  x.runtime.admit(p);
  x.runtime.execute(p.body.passage_id, p);
  assert.throws(() => x.runtime.admit(p), /REPLAY/);
  assert.throws(() => x.runtime.execute(p.body.passage_id, p), /NOT_ADMITTED/);
});
test('06 revoking authority rejects equivalent later passage at runtime', (t) => {
  const x = setup(t),
    g = x.grant();
  x.control('revocation', { grant_id: g.grant_id });
  assert.throws(() => x.runtime.admit(x.passage(g)), /REVOKED/);
});
test('07 changed target after admission fails point-of-use fidelity', (t) => {
  const x = setup(t),
    g = x.grant(),
    p = x.passage(g);
  x.runtime.admit(p);
  const changed = signed({ ...p.body, target: 'elsewhere.txt' }, x.a);
  assert.throws(
    () => x.runtime.execute(p.body.passage_id, changed),
    /FIDELITY/,
  );
  assert.equal(existsSync(join(x.root, 'artifacts', 'hello.txt')), false);
});
test('08 changed dependency after admission fails point-of-use fidelity', (t) => {
  const x = setup(t),
    p = x.passage(x.grant());
  x.runtime.admit(p);
  x.control('dependency', { name: 'corpus', value: 'v2' });
  assert.throws(() => x.runtime.execute(p.body.passage_id, p), /DEPENDENCY/);
  assert.equal(existsSync(join(x.root, 'artifacts', 'hello.txt')), false);
});
test('09 capability and enrollment without authority cannot execute', (t) => {
  const x = setup(t);
  assert.throws(() => x.runtime.admit(x.passage(null)), /AUTHORITY/);
});
test('10 model candidate is non-authoritative and cannot directly execute', (t) => {
  const x = setup(t, 'model_runtime'),
    c = signed(
      {
        ...x.stamp(),
        type: 'candidate',
        source_node: 'node-a',
        candidate_id: randomUUID(),
        kind: 'recommended_action',
        content: {
          action: 'create_document',
          target: 'hello.txt',
          content: 'ONE local field\n',
        },
      },
      x.a,
    );
  const stored = x.runtime.candidate(c);
  assert.equal(stored.authority_effect, 'none');
  assert.throws(() => x.runtime.admit(c), /PASSAGE/);
  assert.equal(existsSync(join(x.root, 'artifacts', 'hello.txt')), false);
  const p = x.passage(x.grant(), {
    origin: { intent: 'bounded acceptance', candidate_id: c.body.candidate_id },
  });
  x.runtime.admit(p);
  assert.equal(x.runtime.execute(p.body.passage_id, p).status, 'RETURNED');
});
test('11 receipt cannot manufacture or rewrite a persisted RIO decision', (t) => {
  const x = setup(t),
    p = x.passage(x.grant());
  x.runtime.admit(p);
  x.runtime.execute(p.body.passage_id, p);
  const original = x.runtime.inspect(p.body.passage_id);
  const altered = structuredClone(original);
  altered.decision.status = 'DENIED';
  assert.equal(x.runtime.verify(p.body.passage_id, altered).valid, false);
  assert.equal(
    x.runtime.inspect(p.body.passage_id).decision.status,
    'ADMITTED',
  );
});
test('12 node A cannot impersonate node B by changing its identifier', (t) => {
  const x = setup(t),
    p = x.passage(x.grant(), { source_node: 'node-b', subject: 'node-b' });
  assert.throws(() => x.runtime.admit(p), /SIGNATURE/);
});
test('13 Return resolves to exact passage and originating correlation', (t) => {
  const x = setup(t),
    p = x.passage(x.grant());
  x.runtime.admit(p);
  const r = x.runtime.execute(p.body.passage_id, p);
  assert.equal(r.passage_id, p.body.passage_id);
  assert.equal(r.correlation_id, p.body.correlation_id);
  assert.equal(r.to, 'I-1');
});
test('14 persisted identities grants revocations and completed lineage survive restart', (t) => {
  const x = setup(t),
    g = x.grant(),
    p = x.passage(g);
  x.runtime.admit(p);
  const r = x.runtime.execute(p.body.passage_id, p);
  x.control('revocation', { grant_id: g.grant_id });
  x.restart();
  assert.equal(x.runtime.status().field.field_id, x.field_id);
  assert.equal(x.runtime.status().nodes.length, 2);
  assert.equal(
    x.runtime.inspect(p.body.passage_id).return.return_id,
    r.return_id,
  );
  assert.throws(() => x.runtime.admit(x.passage(g)), /REVOKED/);
  assert.equal(x.runtime.verify(p.body.passage_id).valid, true);
});
test('revocation after admission is checked at point of use', (t) => {
  const x = setup(t),
    g = x.grant(),
    p = x.passage(g);
  x.runtime.admit(p);
  x.control('revocation', { grant_id: g.grant_id });
  assert.throws(() => x.runtime.execute(p.body.passage_id, p), /REVOKED/);
});
test('control replay is rejected and wrong field cannot enroll', (t) => {
  const x = setup(t),
    c = signed(
      {
        ...x.stamp(),
        type: 'dependency',
        issuer: 'I-1',
        name: 'corpus',
        value: 'v2',
      },
      x.human,
    );
  x.runtime.control(c);
  assert.throws(() => x.runtime.control(c), /REPLAY/);
  assert.throws(
    () =>
      x.runtime.control(
        signed(
          { ...c.body, record_id: randomUUID(), field_id: 'other' },
          x.human,
        ),
      ),
    /FIELD/,
  );
});
test('restart with substituted root is refused', (t) => {
  const x = setup(t);
  assert.throws(
    () =>
      new LocalField({
        root: x.root,
        anchor: { ...x.anchor, public_key_hex: x.a.publicKey },
        receiver: 'node-b',
        signingKey: x.b.secretKey,
      }),
    /ROOT/,
  );
});
test('single-use grant permits one action across separate passages', (t) => {
  const x = setup(t),
    g = x.grant({ max_uses: 1 }),
    p = x.passage(g);
  x.runtime.admit(p);
  x.runtime.execute(p.body.passage_id, p);
  assert.throws(() => x.runtime.admit(x.passage(g)), /SPENT/);
});
test('filesystem rejects traversal and existing symlink without external effect', (t) => {
  const x = setup(t),
    g = x.grant({ target: '../escape.txt' });
  assert.throws(
    () => x.runtime.admit(x.passage(g, { target: '../escape.txt' })),
    /TARGET/,
  );
  const p = x.passage(x.grant());
  symlinkSync(
    join(x.root, 'outside.txt'),
    join(x.root, 'artifacts', 'hello.txt'),
  );
  x.runtime.admit(p);
  const r = x.runtime.execute(p.body.passage_id, p);
  assert.equal(r.outcome, 'FAILED');
  assert.equal(existsSync(join(x.root, 'outside.txt')), false);
});
test('unfinished admitted passage is held after restart without regenerated permission', (t) => {
  const x = setup(t),
    p = x.passage(x.grant());
  x.runtime.admit(p);
  x.restart();
  assert.throws(() => x.runtime.execute(p.body.passage_id, p), /NOT_ADMITTED/);
  assert.equal(
    x.runtime.inspect(p.body.passage_id).return.outcome,
    'RESTART_HOLD',
  );
});

test('receiver seals receipt with its own enrolled key and alteration fails', (t) => {
  const x = setup(t),
    p = x.passage(x.grant());
  x.runtime.admit(p);
  x.runtime.execute(p.body.passage_id, p);
  const c = x.runtime.inspect(p.body.passage_id);
  assert.equal(c.receipt.local_field_attestation.signer_id, 'node-b');
  assert.equal(c.receipt.local_field_attestation.signature.length, 128);
  c.receipt.local_field_attestation.signature = '00'.repeat(64);
  assert.equal(x.runtime.verify(p.body.passage_id, c).valid, false);
});
test('second runtime cannot reconstruct active owner as if it had stopped', (t) => {
  const x = setup(t);
  assert.throws(
    () =>
      new LocalField({
        root: x.root,
        anchor: x.anchor,
        receiver: 'node-b',
        signingKey: x.b.secretKey,
      }),
    /RUNTIME_ALREADY_ACTIVE/,
  );
});
test('node revocation blocks previously admitted operation', (t) => {
  const x = setup(t),
    p = x.passage(x.grant());
  x.runtime.admit(p);
  x.control('node_revocation', { node_id: 'node-a' });
  assert.throws(() => x.runtime.execute(p.body.passage_id, p), /NODE_REVOKED/);
});
test('changed payload after admission is rejected even when sender signs again', (t) => {
  const x = setup(t),
    p = x.passage(x.grant());
  x.runtime.admit(p);
  const payload = { content: 'changed' };
  assert.throws(
    () =>
      x.runtime.execute(
        p.body.passage_id,
        signed(
          { ...p.body, payload, payload_hash: computeArgsHash(payload) },
          x.a,
        ),
      ),
    /FIDELITY/,
  );
});
test('unsupported grant conditions are never treated as satisfied', (t) => {
  const x = setup(t);
  assert.throws(
    () => x.grant({ conditions: { unimplemented: 'required' } }),
    /UNSUPPORTED_CONDITIONS/,
  );
});

test('model node cannot omit the non-authoritative candidate boundary', (t) => {
  const x = setup(t, 'model_runtime');
  assert.throws(
    () => x.runtime.admit(x.passage(x.grant())),
    /MODEL_CANDIDATE_REQUIRED/,
  );
});
test('ancestor revocation invalidates derived delegation at point of use', (t) => {
  const x = setup(t),
    parent = x.grant({ allow_delegation: true }),
    child = {
      ...parent,
      grant_id: randomUUID(),
      parent: parent.grant_id,
      allow_delegation: false,
    };
  const ancestorExpiry = x.stamp().expires_at;
  x.control(
    'grant',
    { grant: child, expires_at: new Date(Date.now() + 300000).toISOString() },
    x.a,
    'node-a',
  );
  const p = x.passage(child);
  x.runtime.admit(p);
  x.control('revocation', { grant_id: parent.grant_id });
  assert.throws(
    () => x.runtime.execute(p.body.passage_id, p),
    /AUTHORITY_REVOKED/,
  );
});
test('two admissions cannot spend one single-use grant twice', (t) => {
  const x = setup(t),
    g = x.grant({ max_uses: 1 }),
    a = x.passage(g),
    b = x.passage(g);
  x.runtime.admit(a);
  x.runtime.admit(b);
  x.runtime.execute(a.body.passage_id, a);
  assert.throws(
    () => x.runtime.execute(b.body.passage_id, b),
    /AUTHORITY_SPENT/,
  );
});
test('superseded authority is rejected without changing source code', (t) => {
  const x = setup(t),
    g = x.grant();
  x.control('supersession', { grant_id: g.grant_id });
  assert.throws(() => x.runtime.admit(x.passage(g)), /AUTHORITY_SUPERSEDED/);
});
test('rejected duplicate admission cannot destroy the original permission', (t) => {
  const x = setup(t),
    p = x.passage(x.grant());
  x.runtime.admit(p);
  assert.throws(() => x.runtime.admit(p), /REPLAY/);
  assert.equal(x.runtime.execute(p.body.passage_id, p).outcome, 'OBSERVED');
});

test('another enrolled node cannot force an admitted passage into HOLD', (t) => {
  const x = setup(t),
    p = x.passage(x.grant());
  x.runtime.admit(p);
  const forged = signed(
    { ...p.body, source_node: 'node-b', subject: 'node-b' },
    x.b,
  );
  assert.throws(
    () => x.runtime.execute(p.body.passage_id, forged),
    /EXECUTION_CALLER_MISMATCH/,
  );
  assert.equal(x.runtime.execute(p.body.passage_id, p).outcome, 'OBSERVED');
});

test('RIO policy conditions evaluate actual executor content', (t) => {
  const x = setup(t, 'laptop', {
    action_classes: [
      {
        class_id: 'short-only',
        pattern: 'create_document',
        conditions: { body_length: { max: 5 } },
        governance_decision: 'REQUIRE_HUMAN',
        risk_tier: 'LOW',
      },
      {
        class_id: 'oversized-denied',
        pattern: 'create_document',
        governance_decision: 'AUTO_DENY',
        risk_tier: 'HIGH',
      },
    ],
  });
  assert.throws(
    () => x.runtime.admit(x.passage(x.grant())),
    /RIO_DENIED_OR_HELD/,
  );
  assert.equal(existsSync(join(x.root, 'artifacts', 'hello.txt')), false);
});

test('non-proposer role cannot cross by holding capability and grant', (t) => {
  const x = setup(t, 'laptop', {}, { primary_role: 'auditor' });
  assert.throws(
    () => x.runtime.admit(x.passage(x.grant())),
    /PROPOSER_ROLE_REQUIRED/,
  );
});

test('wrong receiver key cannot corrupt recovery Return', (t) => {
  const x = setup(t),
    p = x.passage(x.grant());
  x.runtime.admit(p);
  x.runtime.close();
  assert.throws(
    () =>
      new LocalField({
        root: x.root,
        anchor: x.anchor,
        receiver: 'node-b',
        signingKey: x.a.secretKey,
      }),
    /RECEIVER_KEY_MISMATCH/,
  );
  x.restart();
  const returned = x.runtime.inspect(p.body.passage_id).return;
  assert.equal(
    verifyLocalFieldReturn(returned, x.b.publicKey, {
      field_id: x.field_id,
      signer_id: 'node-b',
    }),
    true,
  );
});

test('stale lease from prior boot does not mistake reused PID for original receiver', (t) => {
  const x = setup(t);
  x.runtime.close();
  const store = new LocalStore(x.root);
  store.state('runtime', 'lease', {
    pid: process.pid,
    token: 'old-token',
    boot_id: 'prior-boot',
    start_time: '1',
  });
  store.close();
  x.restart();
  assert.equal(x.runtime.status().field.field_id, x.field_id);
});
