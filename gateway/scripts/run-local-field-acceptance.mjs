#!/usr/bin/env node
/** Engineering acceptance driver. The runtime never imports this module.
 * Uses distinct ephemeral verification principals, not Brian's production key.
 * Real receiver subprocess, HTTP, SQLite, Ed25519 and observed file creation.
 */
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { createInterface } from 'node:readline';
import { mkdirSync, writeFileSync, readFileSync, mkdtempSync } from 'node:fs';
import { resolve, join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { randomUUID, createHash } from 'node:crypto';
import { generateKeypair, signPayload } from '../security/ed25519.mjs';
import {
  canonicalizeArgs,
  computeArgsHash,
} from '../security/token-manager.mjs';
import { verifyLocalFieldReceipt } from '../receipts/receipts.mjs';
import { verifyLedgerEntries } from '../ledger/ledger.mjs';

const output = resolve(process.argv[2] || 'local-field-trace.json');
const work = mkdtempSync(join(tmpdir(), 'one-field-acceptance-'));
const human = generateKeypair(),
  a = generateKeypair(),
  b = generateKeypair();
const field_id = randomUUID(),
  controls = [],
  logs = [];
const anchor = {
  principal_id: 'sourcepoint-engineering-fixture',
  actor_type: 'human',
  primary_role: 'root_authority',
  public_key_hex: human.publicKey,
};
const stamp = () => ({
  field_id,
  record_id: randomUUID(),
  issued_at: new Date().toISOString(),
  expires_at: new Date(Date.now() + 3600000).toISOString(),
});
const signed = (body, key) => ({
  body,
  signature: signPayload(canonicalizeArgs(body), key.secretKey),
});
const definition = signed(
  {
    ...stamp(),
    type: 'field',
    sourcepoint: anchor.principal_id,
    receiver_node: 'field-node-b',
    policy: {
      policy_id: 'one-field-create-only',
      policy_version: '0.1',
      status: 'active',
      scope: { agents: ['field-node-a'], systems: ['local'] },
      action_classes: [
        {
          class_id: 'bounded-artifact',
          pattern: 'create_document',
          governance_decision: 'REQUIRE_HUMAN',
          risk_tier: 'LOW',
        },
      ],
    },
    dependencies: { build_contract: 'one-local-field-v0.1' },
  },
  human,
);
writeFileSync(join(work, 'receiver.key'), b.secretKey, { mode: 0o600 });
writeFileSync(
  join(work, 'config.json'),
  JSON.stringify({
    state_directory: 'state',
    anchor,
    receiver_node: 'field-node-b',
    receiver_key_file: 'receiver.key',
    definition,
  }),
  { mode: 0o600 },
);
const gateway = resolve(dirname(fileURLToPath(import.meta.url)), '..');
let child, url;
async function start() {
  child = spawn(
    process.execPath,
    ['local-field/cli.mjs', 'serve', join(work, 'config.json')],
    { cwd: gateway, stdio: ['ignore', 'pipe', 'pipe'] },
  );
  child.stderr.on('data', (b) => logs.push(b.toString()));
  const lines = createInterface({ input: child.stdout });
  url = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      reject(new Error('START_TIMEOUT'));
    }, 10000);
    child.once('exit', (code) => {
      clearTimeout(timer);
      reject(new Error(`RECEIVER_EXIT:${code}`));
    });
    lines.on('line', (line) => {
      logs.push(line);
      try {
        const data = JSON.parse(line);
        if (data.status === 'LISTENING') {
          clearTimeout(timer);
          resolve(data.url);
        }
      } catch {}
    });
  });
  return child.pid;
}
async function stop(signal = 'SIGTERM') {
  const done = once(child, 'exit');
  child.kill(signal);
  await done;
}
async function send(path, record, expected = 200) {
  const r = await fetch(url + path, {
      method: 'POST',
      body: JSON.stringify(record),
      signal: AbortSignal.timeout(10000),
    }),
    data = await r.json();
  assert.equal(r.status, expected, JSON.stringify(data));
  return data;
}
async function control(type, extra) {
  const c = signed(
    { ...stamp(), type, issuer: anchor.principal_id, ...extra },
    human,
  );
  controls.push(c);
  return send('/control', c);
}
const query = (extra) =>
  send(
    '/query',
    signed(
      { ...stamp(), type: 'query', issuer: anchor.principal_id, ...extra },
      human,
    ),
  );
try {
  const first_pid = await start();
  for (const [id, key, type, actor, role] of [
    ['field-node-a', a, 'model_runtime', 'ai_agent', 'proposer'],
    ['field-node-b', b, 'local_service', 'executor', 'executor'],
  ])
    await control('enrollment', {
      node: {
        node_id: id,
        principal_id: id,
        node_type: type,
        actor_type: actor,
        primary_role: role,
        secondary_roles: [],
        public_key_hex: key.publicKey,
        capabilities: ['create_document'],
        interfaces: ['http-json'],
        custody_boundary: id,
        status: 'active',
      },
    });
  const modelOutput = JSON.parse(
    readFileSync(
      new URL('../local-field/acceptance-model-output.json', import.meta.url),
      'utf8',
    ),
  );
  const candidate = signed(
    {
      ...stamp(),
      type: 'candidate',
      source_node: 'field-node-a',
      candidate_id: randomUUID(),
      kind: 'recommended_action',
      content: modelOutput,
    },
    a,
  );
  const artifact = await send('/candidates', candidate);
  assert.equal(artifact.authority_effect, 'none');
  const g = {
    grant_id: randomUUID(),
    subject: 'field-node-a',
    target_node: 'field-node-b',
    action: 'create_document',
    target: modelOutput.target,
    scope: 'artifact-create',
    purpose: 'bounded engineering acceptance',
    dependencies: { build_contract: 'one-local-field-v0.1' },
    conditions: {},
    parent: null,
    allow_delegation: false,
    max_uses: null,
  };
  const payload = { content: modelOutput.content };
  const passage = () =>
    signed(
      {
        ...stamp(),
        type: 'passage',
        passage_id: randomUUID(),
        intent_id: randomUUID(),
        source_node: g.subject,
        subject: g.subject,
        target_node: g.target_node,
        action: g.action,
        target: g.target,
        payload,
        payload_hash: computeArgsHash(payload),
        authority_basis: g.grant_id,
        scope: g.scope,
        purpose: g.purpose,
        dependencies: g.dependencies,
        conditions: {},
        nonce: randomUUID(),
        correlation_id: randomUUID(),
        return_requirement: { required: true, to: anchor.principal_id },
        origin: {
          intent:
            "Brian / SourcePoint authorized this isolated Local Field build and real bounded filesystem acceptance. This ephemeral verification anchor is not Brian's deployed identity.",
          candidate_id: candidate.body.candidate_id,
        },
      },
      a,
    );
  const noStanding = await send('/passages', passage(), 409);
  assert.match(noStanding.error, /AUTHORITY_MISSING/);
  await control('grant', { grant: g });
  const p = passage();
  const returned = await send('/passages', p);
  assert.equal(returned.outcome, 'OBSERVED');
  const chain = await query({ passage_id: p.body.passage_id });
  const observed = readFileSync(join(work, 'state', 'artifacts', g.target));
  assert.equal(observed.toString(), payload.content);
  assert.equal(
    verifyLocalFieldReceipt(chain.receipt, b.publicKey, {
      field_id,
      passage_id: p.body.passage_id,
      signer_id: 'field-node-b',
    }),
    true,
  );
  const replay = await send('/passages', p, 409);
  assert.match(replay.error, /REPLAY/);
  await control('revocation', { grant_id: g.grant_id });
  const revoked = await send('/passages', passage(), 409);
  assert.match(revoked.error, /REVOKED/);
  // Kill rather than graceful close: proves stale process lease reclamation and
  // reconstruction from disk, without substituting newly generated identities.
  await stop('SIGKILL');
  const second_pid = await start();
  assert.notEqual(first_pid, second_pid);
  const reconstructed = await query({ passage_id: p.body.passage_id });
  assert.deepEqual(reconstructed, chain);
  const afterRestart = await send('/passages', passage(), 409);
  assert.match(afterRestart.error, /REVOKED/);
  const status = await query({}),
    ledger = await query({ view: 'ledger' });
  assert.equal(verifyLedgerEntries(ledger).valid, true);
  assert.equal(status.nodes.length, 2);
  assert.notEqual(
    status.nodes[0].public_key_hex,
    status.nodes[1].public_key_hex,
  );
  const trace = {
    profile: 'one-local-field-v0.1',
    run_id: randomUUID(),
    ran_at: new Date().toISOString(),
    evidence_ceiling:
      'Real local engineering execution with ephemeral independently keyed principals; no production SourcePoint impersonation, deployment or constitutional ratification.',
    runtime: {
      node: process.version,
      platform: process.platform,
      first_pid,
      second_pid,
    },
    anchor,
    definition,
    controls,
    candidate: artifact,
    chain,
    ledger,
    status,
    independent_read: {
      observer: 'acceptance-driver outside receiver process',
      target: g.target,
      sha256: createHash('sha256').update(observed).digest('hex'),
      bytes: observed.length,
      content: observed.toString(),
    },
    rejections: {
      capability_without_authority: noStanding,
      replay,
      revoked,
      revoked_after_restart: afterRestart,
    },
    restart: {
      same_identity: true,
      same_completed_lineage: true,
      revocation_preserved: true,
    },
    owners: {
      intent: 'gateway/local-field/index.mjs',
      identity: 'gateway/security/principals.mjs + local-field-authority.mjs',
      authority: 'gateway/security/local-field-authority.mjs',
      passage: 'gateway/local-field/http.mjs',
      rio: 'gateway/governance/policy-engine.mjs',
      sentinel: 'gateway/security/token-manager.mjs',
      execution: 'gateway/execution/filesystem-executor.mjs',
      receipt: 'gateway/receipts/receipts.mjs',
      ledger: 'gateway/ledger/local-store.mjs',
      return: 'gateway/local-field/index.mjs',
    },
  };
  mkdirSync(dirname(output), { recursive: true });
  writeFileSync(output, JSON.stringify(trace, null, 2) + '\n');
  console.log(
    JSON.stringify({
      run_id: trace.run_id,
      passage_id: p.body.passage_id,
      receipt_id: chain.receipt.receipt_id,
      return_id: returned.return_id,
      output,
      observed_file: join(work, 'state', 'artifacts', g.target),
      status: 'TRACE_VERIFIED',
    }),
  );
} finally {
  if (child && child.exitCode === null && child.signalCode === null)
    await stop();
  writeFileSync(join(work, 'runtime.log'), logs.join('\n'));
}
