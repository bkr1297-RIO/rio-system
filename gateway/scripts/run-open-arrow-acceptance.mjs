#!/usr/bin/env node
/** Real engineering acceptance. No runtime module imports this driver.
 * Fixture human keys exercise explicit approved records under Brian's bounded
 * build authorization; they are not Brian's deployed identity or credentials.
 */
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { createInterface } from 'node:readline';
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  readFileSync,
  existsSync,
} from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import { randomUUID, createHash } from 'node:crypto';
import { generateKeypair, signPayload } from '../security/ed25519.mjs';
import {
  canonicalizeArgs,
  computeArgsHash as hash,
} from '../security/token-manager.mjs';
import { verifyLedgerEntries } from '../ledger/ledger.mjs';

const [outputArg, referenceArg] = process.argv.slice(2);
if (!referenceArg)
  throw Error(
    'Usage: node scripts/run-open-arrow-acceptance.mjs OUTPUT.json REFERENCE_CHECKOUT',
  );
const output = resolve(outputArg),
  reference = resolve(referenceArg),
  gateway = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const work = mkdtempSync(join(tmpdir(), 'one-open-arrow-'));
const human = generateKeypair(),
  a = generateKeypair(),
  b = generateKeypair(),
  field_id = randomUUID();
const anchor = {
  principal_id: 'sourcepoint-customer-zero-engineering',
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
const signed = (body, key = human) => ({
  body,
  signature: signPayload(canonicalizeArgs(body), key.secretKey),
});
const rule = 'Nothing leaves this Lab without my explicit approval.';
const definition = signed({
  ...stamp(),
  type: 'field',
  sourcepoint: anchor.principal_id,
  receiver_node: 'commons-boundary',
  policy: {
    policy_id: 'customer-zero-create-only',
    policy_version: '0.1',
    status: 'active',
    scope: { agents: ['lab-node'], systems: ['local'] },
    action_classes: [
      {
        class_id: 'report',
        pattern: 'create_document',
        governance_decision: 'REQUIRE_HUMAN',
        risk_tier: 'LOW',
      },
    ],
  },
  dependencies: { report_profile: 'customer-zero-v0.1' },
  open_arrow: { profile: 'one.open-arrow.customer-zero.v0.1', rule },
});
writeFileSync(join(work, 'receiver.key'), b.secretKey, { mode: 0o600 });
writeFileSync(
  join(work, 'config.json'),
  JSON.stringify({
    state_directory: 'state',
    anchor,
    receiver_node: 'commons-boundary',
    receiver_key_file: 'receiver.key',
    definition,
    open_arrow_library: join(
      reference,
      'extensions/compiled-occurrence-return/open-arrow/index.mjs',
    ),
  }),
  { mode: 0o600 },
);
mkdirSync(join(work, 'Lab'));
const source_file = join(work, 'Lab', 'Report-17.txt');
writeFileSync(
  source_file,
  'Report 17\nCustomer Zero: governed delivery of this bounded engineering report.\n',
);
let child, url;
const logs = [],
  controls = [],
  commands = [];
async function start() {
  child = spawn(
    process.execPath,
    ['local-field/cli.mjs', 'serve', join(work, 'config.json')],
    { cwd: gateway, stdio: ['ignore', 'pipe', 'pipe'] },
  );
  child.stderr.on('data', (x) => logs.push(x.toString()));
  url = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      reject(Error('START_TIMEOUT'));
    }, 10000);
    child.once('exit', (code) => {
      clearTimeout(timer);
      reject(Error('RECEIVER_EXIT:' + code + ':' + logs.slice(-3).join('\n')));
    });
    createInterface({ input: child.stdout }).on('line', (line) => {
      logs.push(line);
      try {
        const d = JSON.parse(line);
        if (d.status === 'LISTENING') {
          clearTimeout(timer);
          resolve(d.url);
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
    signal: AbortSignal.timeout(15000),
  });
  const body = await r.json();
  assert.equal(r.status, expected, JSON.stringify(body));
  return body;
}
async function control(type, extra) {
  const r = signed({ ...stamp(), type, issuer: anchor.principal_id, ...extra });
  controls.push(r);
  return send('/control', r);
}
const query = (extra) =>
  send(
    '/query',
    signed({
      ...stamp(),
      type: 'query',
      issuer: anchor.principal_id,
      ...extra,
    }),
  );
async function command(type, arrow_id, extra) {
  const record = signed({
    ...stamp(),
    type,
    issuer: anchor.principal_id,
    arrow_id,
    ...extra,
  });
  commands.push(record);
  return send('/arrow', record);
}
async function form() {
  const arrow_id = randomUUID(),
    payload = { content: readFileSync(source_file, 'utf8') };
  const request = {
    source_node: 'lab-node',
    subject: 'lab-node',
    target_node: 'commons-boundary',
    action: 'create_document',
    target: 'Report-17.txt',
    payload,
    payload_hash: hash(payload),
    scope: 'lab-to-commons',
    purpose: 'Customer Zero',
    dependencies: { report_profile: 'customer-zero-v0.1' },
    conditions: {},
    return_requirement: { required: true, to: anchor.principal_id },
  };
  const human_expression = signed({
    ...stamp(),
    type: 'human_expression',
    issuer: anchor.principal_id,
    source_node: 'lab-node',
    expression: 'Take Report 17 to the Commons.',
  });
  const proposal = signed(
    {
      ...stamp(),
      type: 'arrow_propose',
      source_node: 'lab-node',
      arrow_id,
      human_expression,
      request,
    },
    a,
  );
  const proposed = await send('/arrow', proposal);
  const held = await query({ view: 'arrow', arrow_id });
  assert.equal(held.phase, 'HOLD');
  return { arrow_id, request, human_expression, proposal, proposed, held };
}
async function approve(f) {
  const r = f.request,
    g = {
      grant_id: randomUUID(),
      subject: r.subject,
      target_node: r.target_node,
      action: r.action,
      target: r.target,
      payload_hash: r.payload_hash,
      scope: r.scope,
      purpose: r.purpose,
      dependencies: r.dependencies,
      conditions: {},
      parent: null,
      allow_delegation: false,
      max_uses: 1,
    };
  await control('grant', { grant: g });
  const passage_id = randomUUID();
  const commit = await command('arrow_commit', f.arrow_id, {
    proposal_hash: f.proposed.integrity,
    grant_id: g.grant_id,
    passage_id,
    decision: 'APPROVE',
    basis:
      'Brian-authorized bounded engineering acceptance; independent fixture human signer',
    adjudication:
      'Explicitly approve only these Report 17 bytes at this Commons target, once',
  });
  const candidate = signed(
    {
      ...stamp(),
      type: 'candidate',
      source_node: 'lab-node',
      candidate_id: randomUUID(),
      kind: 'recommended_action',
      content: {
        text: 'Deliver the human-requested Report 17 after explicit approval.',
        authority_effect: 'NONE',
      },
    },
    a,
  );
  await send('/candidates', candidate);
  const passage = signed(
    {
      ...stamp(),
      type: 'passage',
      ...r,
      passage_id,
      intent_id: randomUUID(),
      authority_basis: g.grant_id,
      nonce: randomUUID(),
      correlation_id: randomUUID(),
      origin: {
        intent: 'Take Report 17 to the Commons.',
        candidate_id: candidate.body.candidate_id,
        arrow_id: f.arrow_id,
        commitment_id: commit.artifact_id,
      },
    },
    a,
  );
  return { g, commit, candidate, passage };
}
async function promote(f, operation, kind, expected = 200) {
  const view = await query({ view: 'arrow', arrow_id: f.arrow_id }),
    source = view.artifacts.find((x) => x.kind === kind);
  const record = signed({
    ...stamp(),
    type: 'arrow_promote',
    issuer: anchor.principal_id,
    arrow_id: f.arrow_id,
    operation,
    source_ref: source.artifact_id,
    source_hash: source.integrity,
    basis: 'Explicit bounded engineering human disposition',
    adjudication: `${operation}: preserve exact readback, custody limits, unknowns and open obligations`,
  });
  commands.push(record);
  return send('/arrow', record, expected);
}
try {
  const first_pid = await start();
  for (const [id, key, type, actor, role] of [
    ['lab-node', a, 'model_runtime', 'ai_agent', 'proposer'],
    ['commons-boundary', b, 'local_service', 'executor', 'executor'],
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
        custody_boundary:
          id === 'lab-node'
            ? 'Lab source'
            : 'Lab private control plane; bounded Commons output',
        status: 'active',
      },
    });
  const success = await form();
  assert.equal(
    existsSync(join(work, 'state', 'artifacts', 'Report-17.txt')),
    false,
  );
  const auth = await approve(success);
  const bypass = structuredClone(auth.passage.body);
  delete bypass.origin.arrow_id;
  delete bypass.origin.commitment_id;
  const bypass_rejection = await send('/passages', signed(bypass, a), 409);
  assert.equal(bypass_rejection.error, 'OPEN_ARROW_COMMITMENT_REQUIRED');
  const returned = await send('/passages', auth.passage);
  assert.equal(returned.outcome, 'OBSERVED');
  const chain = await query({ passage_id: auth.passage.body.passage_id });
  const actual = readFileSync(
    join(work, 'state', 'artifacts', 'Report-17.txt'),
  );
  assert.equal(actual.toString(), success.request.payload.content);
  for (const [operation, kind] of [
    ['QUALIFY', 'Observation'],
    ['JUDGE', 'Evidence'],
    ['SETTLE', 'Judgment'],
    ['RECOGNIZE', 'Settlement'],
  ])
    await promote(success, operation, kind);
  const completed = await query({ view: 'arrow', arrow_id: success.arrow_id });
  assert.equal(completed.successor_standing, 'RECOGNIZED');
  assert.equal(completed.constitutional_success, true);
  assert.equal(completed.intended_world_success, true);
  const replay = await send('/passages', auth.passage, 409);
  assert.match(replay.error, /SPENT|REPLAY/);
  const failure = await form(),
    failureAuth = await approve(failure);
  await send('/passages', failureAuth.passage);
  for (const [operation, kind] of [
    ['QUALIFY', 'Observation'],
    ['JUDGE', 'Evidence'],
    ['SETTLE', 'Judgment'],
  ])
    await promote(failure, operation, kind);
  const forbidden_recognition = await promote(
    failure,
    'RECOGNIZE',
    'Settlement',
    409,
  );
  assert.match(forbidden_recognition.error, /UNESTABLISHED_SUCCESSOR/);
  const failed = await query({ view: 'arrow', arrow_id: failure.arrow_id });
  assert.equal(failed.phase, 'UNSETTLED');
  assert.equal(failed.constitutional_success, true);
  assert.equal(failed.intended_world_success, false);
  assert.equal(
    readFileSync(join(work, 'state', 'artifacts', 'Report-17.txt'), 'utf8'),
    actual.toString(),
  );
  const denied = await form();
  await command('arrow_commit', denied.arrow_id, {
    proposal_hash: denied.proposed.integrity,
    decision: 'DENY',
    basis: 'Explicit fixture human refusal',
    adjudication: 'Keep this proposal in Lab',
  });
  const denial = await query({ view: 'arrow', arrow_id: denied.arrow_id });
  assert.equal(denial.phase, 'DENIED');
  await control('revocation', { grant_id: auth.g.grant_id });
  await stop('SIGKILL');
  const second_pid = await start();
  assert.notEqual(first_pid, second_pid);
  const reconstructed = await query({
    view: 'arrow',
    arrow_id: success.arrow_id,
  });
  assert.deepEqual(reconstructed, completed);
  assert.deepEqual(
    await query({ passage_id: auth.passage.body.passage_id }),
    chain,
  );
  const replay_after_restart = await send('/passages', auth.passage, 409);
  assert.match(replay_after_restart.error, /REVOKED|SPENT|REPLAY/);
  const ledger = await query({ view: 'ledger' });
  assert.equal(verifyLedgerEntries(ledger).valid, true);
  const trace = {
    profile: 'one.open-arrow.customer-zero.v0.1',
    run_id: randomUUID(),
    ran_at: new Date().toISOString(),
    evidence_ceiling:
      'Real local file delivery and failure, separate keyed engineering principals, explicit signed fixture human dispositions, receiver-custody observation; no deployed Brian identity, public delivery, independent witness or successor installation claim',
    anchor,
    definition,
    controls,
    commands,
    source_intent: success.human_expression,
    candidate: auth.candidate,
    proposal: success.proposal,
    chain,
    arrow: completed,
    failure: failed,
    denial,
    ledger,
    status: await query({}),
    runtime: {
      node: process.version,
      platform: process.platform,
      first_pid,
      second_pid,
    },
    independent_read: {
      source_file,
      target_file: join(work, 'state', 'artifacts', 'Report-17.txt'),
      sha256: createHash('sha256').update(actual).digest('hex'),
      bytes: actual.length,
      content: actual.toString(),
    },
    restart: {
      same_identity: true,
      same_artifact_history: true,
      same_return: true,
      no_second_effect: true,
    },
    rejections: {
      bypass_rejection,
      replay,
      forbidden_recognition,
      replay_after_restart,
    },
  };
  mkdirSync(dirname(output), { recursive: true });
  writeFileSync(output, JSON.stringify(trace, null, 2) + '\n');
  console.log(
    JSON.stringify({
      status: 'CUSTOMER_ZERO_TRACE_VERIFIED',
      run_id: trace.run_id,
      arrow_id: success.arrow_id,
      passage_id: auth.passage.body.passage_id,
      receipt_id: chain.receipt.receipt_id,
      return_id: chain.return.return_id,
      output,
    }),
  );
} finally {
  if (child && child.exitCode === null && child.signalCode === null)
    await stop();
  writeFileSync(join(work, 'runtime.log'), logs.join('\n'));
}
