import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { setup, signed } from './helpers/local-field.mjs';
let createFieldServer;
try {
  ({ createFieldServer } = await import('../local-field/http.mjs'));
} catch (e) {
  if (e.code !== 'ERR_MODULE_NOT_FOUND') throw e;
}

test('real HTTP passage requires signed admission, executes and returns queryable lineage', async (t) => {
  const x = setup(t);
  assert.equal(typeof createFieldServer, 'function');
  const server = createFieldServer(x.runtime);
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  t.after(() => new Promise((r) => server.close(r)));
  const send = async (path, body) => {
    const r = await fetch(`http://127.0.0.1:${server.address().port}${path}`, {
      method: 'POST',
      body: JSON.stringify(body),
    });
    return { status: r.status, data: await r.json() };
  };
  const p = x.passage(x.grant());
  assert.equal(
    (await send('/execute', { passage_id: p.body.passage_id, record: p }))
      .status,
    409,
  );
  assert.equal(existsSync(join(x.root, 'artifacts', 'hello.txt')), false);
  assert.equal((await send('/passages', p)).data.outcome, 'OBSERVED');
  const q = signed(
    {
      ...x.stamp(),
      type: 'query',
      issuer: 'I-1',
      passage_id: p.body.passage_id,
    },
    x.human,
  );
  assert.equal(
    (await send('/query', q)).data.return.correlation_id,
    p.body.correlation_id,
  );
  assert.equal((await send('/passages', p)).status, 409);
  const forged = signed({ ...q.body, issuer: 'I-1' }, x.a);
  assert.equal((await send('/query', forged)).status, 409);
});

test('HTTP exposes no raw adapter, unsigned telemetry or cross-origin browser path', async (t) => {
  const x = setup(t);
  assert.equal(typeof createFieldServer, 'function');
  const server = createFieldServer(x.runtime);
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  t.after(() => new Promise((r) => server.close(r)));
  const url = `http://127.0.0.1:${server.address().port}`;
  assert.equal((await fetch(url + '/execute')).status, 405);
  assert.equal(
    (await fetch(url + '/query', { method: 'POST', body: '{}' })).status,
    409,
  );
  assert.equal(
    (await fetch(url + '/raw-adapter', { method: 'POST', body: '{}' })).status,
    404,
  );
  assert.equal(
    (
      await fetch(url + '/query', {
        method: 'POST',
        headers: { Origin: 'https://untrusted.example' },
        body: '{}',
      })
    ).status,
    403,
  );
  assert.equal(
    (await fetch(url + '/query', { method: 'POST', body: 'x'.repeat(65537) }))
      .status,
    413,
  );
});

test('delegated controls obey the issuer communication surface', async (t) => {
  const x = setup(t, 'laptop', {}, { interfaces: ['in-process'] }),
    g = x.grant({ allow_delegation: true });
  const server = createFieldServer(x.runtime);
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  t.after(() => new Promise((r) => server.close(r)));
  const c = signed(
    {
      ...x.stamp(),
      type: 'grant',
      issuer: 'node-a',
      expires_at: new Date(Date.now() + 300000).toISOString(),
      grant: { ...g, grant_id: randomUUID(), parent: g.grant_id },
    },
    x.a,
  );
  const r = await fetch(`http://127.0.0.1:${server.address().port}/control`, {
    method: 'POST',
    body: JSON.stringify(c),
  });
  assert.equal(r.status, 409);
  assert.equal((await r.json()).error, 'NODE_INTERFACE_NOT_ALLOWED');
});
