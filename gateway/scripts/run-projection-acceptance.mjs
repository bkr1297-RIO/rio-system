#!/usr/bin/env node
/** Real two-process integration; engineering keys, never production Brian keys. */
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { createInterface } from "node:readline";
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  readFileSync,
  existsSync,
  rmSync,
} from "node:fs";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";
import { randomUUID, createHash } from "node:crypto";
import { generateKeypair, signPayload } from "../security/ed25519.mjs";
import {
  canonicalizeArgs,
  computeArgsHash as hash,
} from "../security/token-manager.mjs";
import { verifyLedgerEntries } from "../ledger/ledger.mjs";

const [outArg, refArg] = process.argv.slice(2);
if (!outArg || !refArg)
  throw Error(
    "Usage: run-projection-acceptance.mjs OUTPUT.json AUTHORIZED_REFERENCE_CHECKOUT",
  );
const output = resolve(outArg),
  reference = resolve(refArg),
  gateway = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const work = mkdtempSync(join(tmpdir(), "one-projection-")),
  human = generateKeypair(),
  a = generateKeypair(),
  b = generateKeypair(),
  c = generateKeypair();
const field_id = randomUUID(),
  projection_id = randomUUID(),
  run_id = randomUUID();
const anchor = {
  principal_id: "sourcepoint-customer-zero-engineering",
  actor_type: "human",
  primary_role: "root_authority",
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
const controls = [],
  commands = [],
  hosts = [];
const rule = "Nothing leaves this Lab without my explicit approval.";
for (const [id, key] of [
  ["host-a", b],
  ["host-b", c],
]) {
  const directory = join(work, id);
  mkdirSync(directory);
  const definition = signed({
    ...stamp(),
    type: "field",
    sourcepoint: anchor.principal_id,
    receiver_node: id,
    policy: {
      policy_id: "projection-customer-zero",
      policy_version: "0.1",
      status: "active",
      scope: { agents: ["lab-node"], systems: ["local"] },
      action_classes: [
        {
          class_id: "report",
          pattern: "create_document",
          governance_decision: "REQUIRE_HUMAN",
          risk_tier: "LOW",
        },
      ],
    },
    dependencies: { report_profile: "customer-zero-v0.1" },
    open_arrow: { profile: "one.open-arrow.customer-zero.v0.1", rule },
    projection_runtime: { profile: "one.projection-runtime.v0.1" },
  });
  writeFileSync(join(directory, "receiver.key"), key.secretKey, {
    mode: 0o600,
  });
  writeFileSync(
    join(directory, "config.json"),
    JSON.stringify({
      state_directory: "state",
      anchor,
      receiver_node: id,
      receiver_key_file: "receiver.key",
      definition,
      open_arrow_library: join(
        reference,
        "extensions/compiled-occurrence-return/open-arrow/index.mjs",
      ),
    }),
    { mode: 0o600 },
  );
  hosts.push({
    id,
    key,
    directory,
    definition,
    child: null,
    url: null,
    logs: [],
  });
}
async function start(h) {
  h.child = spawn(
    process.execPath,
    ["local-field/cli.mjs", "serve", join(h.directory, "config.json")],
    { cwd: gateway, stdio: ["ignore", "pipe", "pipe"] },
  );
  h.child.stderr.on("data", (x) => h.logs.push(x.toString()));
  h.url = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      h.child.kill("SIGKILL");
      reject(Error("RECEIVER_START_TIMEOUT"));
    }, 10000);
    h.child.once("exit", (code) => {
      clearTimeout(timer);
      reject(Error("RECEIVER_EXIT:" + code + ":" + h.logs.slice(-2).join("")));
    });
    createInterface({ input: h.child.stdout }).on("line", (line) => {
      h.logs.push(line);
      try {
        const x = JSON.parse(line);
        if (x.status === "LISTENING") {
          clearTimeout(timer);
          resolve(x.url);
        }
      } catch {}
    });
  });
  return h.child.pid;
}
async function stop(h, signal = "SIGTERM") {
  if (!h.child || h.child.exitCode !== null) return;
  const end = once(h.child, "exit");
  h.child.kill(signal);
  await end;
  h.child = null;
}
async function send(h, path, record, status = 200) {
  const r = await fetch(h.url + path, {
    method: "POST",
    body: JSON.stringify(record),
    signal: AbortSignal.timeout(15000),
  });
  const x = await r.json();
  assert.equal(r.status, status, JSON.stringify(x));
  return x;
}
async function control(h, type, extra) {
  const r = signed({ ...stamp(), type, issuer: anchor.principal_id, ...extra });
  controls.push({ host: h.id, record: r });
  return send(h, "/control", r);
}
async function command(h, type, extra = {}) {
  const r = signed({
    ...stamp(),
    type: "projection_" + type,
    issuer: anchor.principal_id,
    projection_id,
    ...extra,
  });
  commands.push({ host: h.id, record: r });
  return send(h, "/projection", r);
}
const query = (h, extra = {}) =>
  send(
    h,
    "/query",
    signed({
      ...stamp(),
      type: "query",
      issuer: anchor.principal_id,
      ...extra,
    }),
  );
const view = (h) => query(h, { view: "projection", projection_id });
try {
  const [A, B] = hosts,
    first_pid = await start(A),
    b_pid = await start(B);
  for (const h of hosts)
    for (const [id, key, type, role] of [
      ["lab-node", a, "model_runtime", "proposer"],
      ["host-a", b, "local_service", "executor"],
      ["host-b", c, "local_service", "executor"],
    ])
      await control(h, "enrollment", {
        node: {
          node_id: id,
          principal_id: id,
          node_type: type,
          actor_type: role === "proposer" ? "ai_agent" : "executor",
          primary_role: role,
          secondary_roles: [],
          public_key_hex: key.publicKey,
          capabilities: ["create_document"],
          interfaces: ["http-json"],
          custody_boundary: id,
          status: "active",
        },
      });
  const core = {
    projection_id,
    sourcepoint_id: anchor.principal_id,
    constitution_ref: randomUUID(),
    lineage_ref:
      "Brian-SourcePoint-ONE:Customer-Zero-authorized-engineering-build",
    projection_class: "Holo",
    purpose: "ONE project work",
    carrier_node: "lab-node",
    conditions: {},
    dependencies: { report_profile: "customer-zero-v0.1" },
    return_obligations: { required: true, to: anchor.principal_id },
    created_at: new Date().toISOString(),
    expires_at: new Date(Date.now() + 7200000).toISOString(),
    renewal_conditions: "New explicit human constitution and new delegation",
    predecessor_ref: null,
    exobody_ref: null,
  };
  await command(A, "constitute", { projection: core });
  const source_file = join(work, "Report-17.txt");
  writeFileSync(
    source_file,
    "Report 17\nCustomer Zero Holo: governed ONE project delivery.\n",
  );
  const payload = { content: readFileSync(source_file, "utf8") },
    request = {
      source_node: "lab-node",
      subject: "lab-node",
      target_node: "host-a",
      action: "create_document",
      target: "Report-17.txt",
      payload,
      payload_hash: hash(payload),
      scope: "ONE-project-report",
      purpose: core.purpose,
      dependencies: core.dependencies,
      conditions: {},
      return_requirement: core.return_obligations,
    };
  const source_intent = signed({
      ...stamp(),
      type: "human_expression",
      issuer: anchor.principal_id,
      source_node: "lab-node",
      expression: "Take Report 17 to the Commons.",
    }),
    arrow_id = randomUUID();
  const proposal = signed(
    {
      ...stamp(),
      type: "arrow_propose",
      source_node: "lab-node",
      arrow_id,
      human_expression: source_intent,
      request,
    },
    a,
  );
  const formed = await send(A, "/arrow", proposal);
  assert.equal((await query(A, { view: "arrow", arrow_id })).phase, "HOLD");
  const grant = {
    grant_id: randomUUID(),
    subject: "lab-node",
    target_node: "host-a",
    action: request.action,
    target: request.target,
    payload_hash: request.payload_hash,
    scope: request.scope,
    purpose: request.purpose,
    dependencies: request.dependencies,
    conditions: {},
    parent: null,
    allow_delegation: false,
    max_uses: 1,
  };
  await control(A, "grant", { grant });
  const delegation = await command(A, "delegate", { grant_id: grant.grant_id });
  const binding = await command(A, "bind", {
    binding_id: randomUUID(),
    host_node: "host-a",
    delegation_ref: delegation.event_id,
    conditions: {},
    dependencies: core.dependencies,
  });
  assert.equal(binding.status, "ADMITTED");
  const passage_id = randomUUID();
  const commitRecord = signed({
    ...stamp(),
    type: "arrow_commit",
    issuer: anchor.principal_id,
    arrow_id,
    proposal_hash: formed.integrity,
    grant_id: grant.grant_id,
    passage_id,
    decision: "APPROVE",
    basis:
      "Brian-authorized engineering Customer Zero passage; independent root fixture signer",
    adjudication:
      "Approve these exact report bytes, projection standing and Host A target once",
  });
  const commitment = await send(A, "/arrow", commitRecord);
  const candidate = signed(
    {
      ...stamp(),
      type: "candidate",
      source_node: "lab-node",
      candidate_id: randomUUID(),
      kind: "recommended_action",
      content: {
        text: "Deliver Report 17 with explicitly bounded Holo delegation",
        authority_effect: "NONE",
      },
    },
    a,
  );
  await send(A, "/candidates", candidate);
  const passage = signed(
    {
      ...stamp(),
      type: "passage",
      ...request,
      passage_id,
      intent_id: randomUUID(),
      authority_basis: grant.grant_id,
      nonce: randomUUID(),
      correlation_id: randomUUID(),
      origin: {
        intent: "Take Report 17 to the Commons.",
        candidate_id: candidate.body.candidate_id,
        arrow_id,
        commitment_id: commitment.artifact_id,
      },
      projection: {
        projection_id,
        delegation_ref: delegation.event_id,
        binding_ref: binding.binding_id,
        expression_ref: candidate.body.candidate_id,
        model_ref: {
          model_id: "engineering-model-output-artifact",
          runtime_node: "lab-node",
        },
      },
    },
    a,
  );
  const bypass = structuredClone(passage.body);
  delete bypass.projection;
  const bypass_rejection = await send(A, "/admit", signed(bypass, a), 409);
  assert.equal(bypass_rejection.error, "PROJECTION_BINDING_REQUIRED");
  assert.equal(
    existsSync(join(A.directory, "state/artifacts/Report-17.txt")),
    false,
  );
  await send(A, "/projection", passage);
  const chain = await query(A, { passage_id });
  assert.equal(chain.fidelity.status, "PASS");
  assert.equal(chain.occurrence.status, "OBSERVED");
  const bytes = readFileSync(
    join(A.directory, "state/artifacts/Report-17.txt"),
  );
  assert.equal(bytes.toString(), payload.content);
  const returning = await view(A);
  assert.equal(returning.lifecycle, "RETURNING");
  await command(A, "return", {
    passage_id,
    return_id: chain.return.return_id,
    receipt_id: chain.receipt.receipt_id,
  });
  const returned = await view(A);
  assert.equal(returned.lifecycle, "RETURNED");
  const successor = {
    ...core,
    projection_id: randomUUID(),
    constitution_ref: randomUUID(),
    created_at: new Date().toISOString(),
    predecessor_ref: projection_id,
  };
  await command(A, "renew", { successor });
  const next = await query(A, {
    view: "projection",
    projection_id: successor.projection_id,
  });
  assert.equal(next.lifecycle, "CONSTITUTED");
  assert.equal(next.delegation, null);
  // Renewed standing receives its own newly issued grant; it inherits no binding.
  const newGrant = { ...grant, grant_id: randomUUID() };
  await control(A, "grant", { grant: newGrant });
  const successorDelegation = await command(A, "delegate", {
    projection_id: successor.projection_id,
    grant_id: newGrant.grant_id,
  });
  const successorBinding = await command(A, "bind", {
    projection_id: successor.projection_id,
    binding_id: randomUUID(),
    host_node: "host-a",
    delegation_ref: successorDelegation.event_id,
    conditions: {},
    dependencies: core.dependencies,
  });
  // A second actual admission is suspended before effect: its Return has no receipt.
  const heldArrowId = randomUUID(),
    heldPassageId = randomUUID();
  const heldSource = signed({
    ...stamp(),
    type: "human_expression",
    issuer: anchor.principal_id,
    source_node: "lab-node",
    expression: "Take Report 17 to the Commons.",
  });
  const heldProposal = signed(
    {
      ...stamp(),
      type: "arrow_propose",
      source_node: "lab-node",
      arrow_id: heldArrowId,
      human_expression: heldSource,
      request,
    },
    a,
  );
  const heldFormed = await send(A, "/arrow", heldProposal);
  const heldCommitRecord = signed({
    ...stamp(),
    type: "arrow_commit",
    issuer: anchor.principal_id,
    arrow_id: heldArrowId,
    proposal_hash: heldFormed.integrity,
    grant_id: newGrant.grant_id,
    passage_id: heldPassageId,
    decision: "APPROVE",
    basis: "Explicit successor episode, subject to live human suspension",
    adjudication: "Exact report action only; no prior permission inherited",
  });
  const heldCommit = await send(A, "/arrow", heldCommitRecord);
  const heldCandidate = signed(
    {
      ...stamp(),
      type: "candidate",
      source_node: "lab-node",
      candidate_id: randomUUID(),
      kind: "recommended_action",
      content: {
        text: "Report 17 successor proposal",
        authority_effect: "NONE",
      },
    },
    a,
  );
  await send(A, "/candidates", heldCandidate);
  const heldPassage = signed(
    {
      ...stamp(),
      type: "passage",
      ...request,
      passage_id: heldPassageId,
      intent_id: randomUUID(),
      authority_basis: newGrant.grant_id,
      nonce: randomUUID(),
      correlation_id: randomUUID(),
      origin: {
        intent: "Take Report 17 to the Commons.",
        candidate_id: heldCandidate.body.candidate_id,
        arrow_id: heldArrowId,
        commitment_id: heldCommit.artifact_id,
      },
      projection: {
        projection_id: successor.projection_id,
        delegation_ref: successorDelegation.event_id,
        binding_ref: successorBinding.binding_id,
        expression_ref: heldCandidate.body.candidate_id,
        model_ref: {
          model_id: "engineering-model-output-artifact",
          runtime_node: "lab-node",
        },
      },
    },
    a,
  );
  await send(A, "/admit", heldPassage);
  await command(A, "suspend", {
    projection_id: successor.projection_id,
    reason: "Human paused successor before consequence",
  });
  const heldResult = await send(
    A,
    "/execute",
    { passage_id: heldPassageId, record: heldPassage },
    409,
  );
  assert.equal(heldResult.error, "PROJECTION_NOT_OPERATIVE");
  const heldChain = await query(A, { passage_id: heldPassageId });
  assert.equal(heldChain.attempt, null);
  assert.equal(heldChain.receipt, null);
  await command(A, "return", {
    projection_id: successor.projection_id,
    passage_id: heldPassageId,
    return_id: heldChain.return.return_id,
    receipt_id: null,
  });
  const held = {
    chain: heldChain,
    projection: await query(A, {
      view: "projection",
      projection_id: successor.projection_id,
    }),
    source_intent: heldSource,
    proposal: heldProposal,
    commit_record: heldCommitRecord,
    candidate: heldCandidate,
    result: heldResult,
  };
  await command(B, "carry", { carriage: await view(A) });
  const beforeB = await view(B);
  assert.equal(beforeB.current_binding, null);
  assert.equal(beforeB.delegation, null);
  const denied = await command(B, "rebind", {
    binding_id: randomUUID(),
    host_node: "host-b",
    delegation_ref: delegation.event_id,
    conditions: {},
    dependencies: core.dependencies,
  });
  assert.equal(denied.status, "DENIED");
  assert.equal(denied.reason, "PROJECTION_TERMINAL");
  const hostB = await view(B);
  assert.deepEqual(hostB.projection, core);
  assert.equal(hostB.current_binding, null);
  assert.equal(
    existsSync(join(B.directory, "state/artifacts/Report-17.txt")),
    false,
  );
  const afterA = await view(A);
  assert.equal(afterA.successors[0], successor.projection_id);
  await control(A, "revocation", { grant_id: newGrant.grant_id });
  const statusA = await query(A),
    statusB = await query(B),
    ledgerA = await query(A, { view: "ledger" }),
    ledgerB = await query(B, { view: "ledger" });
  assert.ok(verifyLedgerEntries(ledgerA).valid);
  assert.ok(verifyLedgerEntries(ledgerB).valid);
  await stop(A, "SIGKILL");
  const second_pid = await start(A);
  assert.notEqual(first_pid, second_pid);
  assert.deepEqual(await view(A), afterA);
  const reconstructed = await query(A, { passage_id });
  assert.deepEqual(reconstructed.return, chain.return);
  assert.equal(
    readFileSync(join(A.directory, "state/artifacts/Report-17.txt")).toString(),
    payload.content,
  );
  const trace = {
    profile: "one.projection-runtime.v0.1",
    run_id,
    ran_at: new Date().toISOString(),
    evidence_ceiling:
      "Actual engineering Holo/HTTP/file/restart integration, same-custody observation; independently keyed local processes. No production Brian key, public delivery, installation or federation proof.",
    anchor,
    definition: A.definition,
    host_b_definition: B.definition,
    controls: controls.filter((x) => x.host === "host-a").map((x) => x.record),
    host_b_controls: controls
      .filter((x) => x.host === "host-b")
      .map((x) => x.record),
    commands,
    source_intent,
    proposal,
    commit_record: commitRecord,
    candidate,
    chain,
    returning,
    projection: afterA,
    successor: await query(A, {
      view: "projection",
      projection_id: successor.projection_id,
    }),
    host_b: hostB,
    host_b_denial: denied,
    bypass_rejection,
    arrow: await query(A, { view: "arrow", arrow_id }),
    held,
    status_a: statusA,
    status_b: statusB,
    ledger_a: ledgerA,
    ledger_b: ledgerB,
    independent_read: {
      bytes: bytes.length,
      sha256: createHash("sha256").update(bytes).digest("hex"),
      source_unchanged: readFileSync(source_file, "utf8") === payload.content,
    },
    restart: {
      first_pid,
      second_pid,
      host_b_pid: b_pid,
      same_projection_history: true,
      same_return: true,
      no_second_effect: true,
    },
  };
  mkdirSync(dirname(output), { recursive: true });
  writeFileSync(output, JSON.stringify(trace, null, 2) + "\n");
  console.log(
    JSON.stringify({
      status: "PROJECTION_CUSTOMER_ZERO_TRACE_VERIFIED",
      run_id,
      projection_id,
      successor_id: successor.projection_id,
      passage_id,
      receipt_id: chain.receipt.receipt_id,
      return_id: chain.return.return_id,
      host_b_decision: denied.admission_id,
      output,
    }),
  );
} finally {
  for (const h of hosts) await stop(h);
  rmSync(work, { recursive: true, force: true });
}
