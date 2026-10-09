import test from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { setup } from './helpers/local-field.mjs';

test('actual write followed by process death returns unresolved attempt and never replays', (t) => {
  const x = setup(t),
    p = x.passage(x.grant()),
    config = join(x.root, 'crash-config.json');
  writeFileSync(
    config,
    JSON.stringify({
      root: x.root,
      anchor: x.anchor,
      receiver: 'node-b',
      signingKey: x.b.secretKey,
      passage: p,
    }),
    { mode: 0o600 },
  );
  x.runtime.close();
  const child = spawnSync(
    process.execPath,
    [
      new URL('./helpers/local-field-crash-worker.mjs', import.meta.url)
        .pathname,
      config,
    ],
    { timeout: 10000, encoding: 'utf8' },
  );
  assert.equal(child.signal, 'SIGKILL', child.stderr);
  assert.equal(
    readFileSync(join(x.root, 'artifacts', 'hello.txt'), 'utf8'),
    p.body.payload.content,
  );
  x.restart();
  const chain = x.runtime.inspect(p.body.passage_id);
  assert.ok(chain.attempt.attempt_id);
  assert.equal(chain.receipt, null);
  assert.equal(chain.occurrence, null);
  assert.equal(chain.return.outcome, 'UNSETTLED_ATTEMPT');
  assert.ok(chain.return.attestation.signature);
  assert.throws(() => x.runtime.execute(p.body.passage_id, p), /NOT_ADMITTED/);
  assert.throws(() => x.runtime.admit(p), /REPLAY/);
});
