import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { generateKeypair } from "../../security/ed25519.mjs";
import { LocalField } from "../../local-field/index.mjs";
import { fixture } from "../helpers/projection.mjs";
import { signed } from "../helpers/local-field.mjs";

function secondHost(t, f) {
  const c = generateKeypair(),
    root = mkdtempSync(join(tmpdir(), "projection-host-b-"));
  const definition = signed(
    { ...f.definition.body, ...f.stamp(), receiver_node: "node-c" },
    f.human,
  );
  let runtime = new LocalField({
    root,
    anchor: f.anchor,
    receiver: "node-c",
    signingKey: c.secretKey,
    definition,
  });
  const control = (type, values) =>
    runtime.control(
      signed({ ...f.stamp(), type, issuer: "I-1", ...values }, f.human),
    );
  for (const [id, key, role, type] of [
    ["node-a", f.a, "proposer", "model_runtime"],
    ["node-b", f.b, "executor", "local_service"],
    ["node-c", c, "executor", "local_service"],
  ])
    control("enrollment", {
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
  const call = (op, body = {}) =>
    runtime.projection(
      signed(
        {
          ...f.stamp(),
          type: "projection_" + op,
          issuer: "I-1",
          projection_id: f.id,
          ...body,
        },
        f.human,
      ),
    );
  const view = () =>
    runtime.query(
      signed(
        {
          ...f.stamp(),
          type: "query",
          issuer: "I-1",
          view: "projection",
          projection_id: f.id,
        },
        f.human,
      ),
    );
  t.after(() => {
    runtime.close();
    rmSync(root, { recursive: true, force: true });
  });
  return {
    root,
    c,
    control,
    call,
    view,
    get runtime() {
      return runtime;
    },
    restart() {
      runtime.close();
      runtime = new LocalField({
        root,
        anchor: f.anchor,
        receiver: "node-c",
        signingKey: c.secretKey,
      });
    },
  };
}
test("carriage preserves projection identity but Host A admission never authorizes Host B", (t) => {
  const f = fixture(t),
    { d } = f.ready(),
    h = secondHost(t, f);
  f.call("suspend", { reason: "Rebind preparation" });
  const carried = f.view();
  h.call("carry", { carriage: carried });
  assert.equal(h.view().current_binding, null);
  assert.equal(h.view().delegation, null);
  assert.deepEqual(h.view().projection, carried.projection);
  const denied = h.call("rebind", {
    binding_id: randomUUID(),
    host_node: "node-c",
    delegation_ref: d.event_id,
    conditions: {},
    dependencies: { corpus: "v1" },
  });
  assert.equal(denied.status, "DENIED");
  assert.equal(denied.reason, "CARRIAGE_IS_NOT_ADMISSION");
  assert.equal(h.view().current_binding, null);
  assert.equal(h.view().inherited_history.length, carried.events.length);
  assert.equal(existsSync(join(h.root, "artifacts", "Report-17.txt")), false);
  const before = h.view();
  h.restart();
  assert.deepEqual(h.view(), before);
});
test("fresh Host B grant and admission permit rebind without changing projection identity", (t) => {
  const f = fixture(t),
    { g } = f.ready(),
    h = secondHost(t, f);
  f.call("suspend", { reason: "Move to independently governed host" });
  h.call("carry", { carriage: f.view() });
  const next = { ...g, grant_id: randomUUID(), target_node: "node-c" };
  h.control("grant", { grant: next });
  const d = h.call("delegate", { grant_id: next.grant_id });
  const b = h.call("rebind", {
    binding_id: randomUUID(),
    host_node: "node-c",
    delegation_ref: d.event_id,
    conditions: {},
    dependencies: { corpus: "v1" },
  });
  assert.equal(b.status, "ADMITTED");
  const p = f.passage(next, d, b);
  p.body.target_node = "node-c";
  // The signed source expression must be presented independently at the new host.
  h.runtime.candidate(
    signed(
      {
        ...f.stamp(),
        type: "candidate",
        source_node: "node-a",
        candidate_id: p.body.origin.candidate_id,
        kind: "recommended_action",
        content: "Report 17 on Host B",
      },
      f.a,
    ),
  );
  h.runtime.operateProjection(signed(p.body, f.a));
  assert.equal(
    readFileSync(join(h.root, "artifacts", "Report-17.txt"), "utf8"),
    "Report 17\n",
  );
  assert.equal(h.view().projection.projection_id, f.id);
  assert.equal(h.view().current_binding.host_node, "node-c");
  assert.ok(h.runtime.verify(p.body.passage_id).valid);
  assert.equal(f.view().recorded_lifecycle, "SUSPENDED");
});
test("carried history modification and order destruction are rejected", (t) => {
  const f = fixture(t);
  f.ready();
  const h = secondHost(t, f),
    bad = f.view();
  bad.events[0].payload.lifecycle = "OPERATING";
  assert.throws(
    () => h.call("carry", { carriage: bad }),
    /PROJECTION_HISTORY_INTEGRITY/,
  );
  const ordered = f.view();
  ordered.events.reverse();
  assert.throws(
    () => h.call("carry", { carriage: ordered }),
    /PROJECTION_CARRIAGE_ORDER/,
  );
});
test("unfinished Return and pending operation cannot silently renew standing", (t) => {
  const f = fixture(t),
    { p } = f.ready();
  f.runtime.operateProjection(p);
  f.call("expire", { reason: "Withdraw while Return pending" });
  const successor = {
    ...f.core,
    projection_id: randomUUID(),
    constitution_ref: randomUUID(),
    predecessor_ref: f.id,
  };
  assert.throws(
    () => f.call("renew", { successor }),
    /PROJECTION_RENEWAL_STATE/,
  );
  assert.equal(f.view().pending_returns.length, 1);
  assert.equal(f.view().successors.length, 0);
});

test("carriage preserves unresolved native Return without importing host permission", (t) => {
  const f = fixture(t),
    { p } = f.ready();
  f.runtime.operateProjection(p);
  f.call("expire", { reason: "Return must still be acknowledged" });
  const h = secondHost(t, f),
    prior = f.view();
  h.call("carry", { carriage: prior });
  const successor = {
    ...f.core,
    projection_id: randomUUID(),
    constitution_ref: randomUUID(),
    predecessor_ref: f.id,
  };
  assert.throws(
    () => h.call("renew", { successor }),
    /PROJECTION_RENEWAL_STATE/,
  );
  assert.deepEqual(h.view().pending_returns, prior.pending_returns);
  assert.equal(h.view().current_binding, null);
  const c = f.runtime.inspect(p.body.passage_id);
  h.call("return", {
    passage_id: p.body.passage_id,
    return_id: c.return.return_id,
    receipt_id: c.receipt.receipt_id,
  });
  assert.equal(h.view().pending_returns.length, 0);
  h.call("renew", { successor });
  assert.equal(h.view().successors.at(-1), successor.projection_id);
});

test("carriage preserves admitted operation obligations before native Return exists", (t) => {
  const f = fixture(t),
    { p } = f.ready();
  f.runtime.admit(p);
  f.call("expire", { reason: "Do not strand the prior operation" });
  const h = secondHost(t, f);
  h.call("carry", { carriage: f.view() });
  const successor = {
    ...f.core,
    projection_id: randomUUID(),
    constitution_ref: randomUUID(),
    predecessor_ref: f.id,
  };
  assert.throws(
    () => h.call("renew", { successor }),
    /PROJECTION_RENEWAL_STATE/,
  );
  assert.equal(h.view().open_passages[0].passage_id, p.body.passage_id);
  assert.equal(h.view().current_binding, null);
});
