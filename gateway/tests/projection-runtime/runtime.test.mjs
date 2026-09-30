import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { signed } from "../helpers/local-field.mjs";

import { fixture } from "../helpers/projection.mjs";

test("constitution is distinct immutable source-bound identity without standing", (t) => {
  const f = fixture(t);
  f.constitute();
  const s = f.view();
  assert.equal(s.projection.projection_id, f.id);
  assert.notEqual(f.id, "I-1");
  assert.notEqual(f.id, "node-a");
  assert.equal(s.lifecycle, "CONSTITUTED");
  assert.equal(s.delegation, null);
  assert.equal(s.current_binding, null);
  s.projection.purpose = "tampered";
  assert.equal(f.view().projection.purpose, f.core.purpose);
  assert.throws(() => f.constitute(), /PROJECTION_EXISTS/);
});
test("node cannot constitute delegate bind renew or suspend as SourcePoint", (t) => {
  const f = fixture(t);
  assert.throws(
    () => f.call("constitute", { projection: f.core }, f.a),
    /SIGNATURE_INVALID/,
  );
  f.constitute();
  for (const op of ["delegate", "bind", "renew", "suspend"])
    assert.throws(() => f.call(op, {}, f.a), /SIGNATURE_INVALID/);
});
test("real projection passage uses RIO Sentinel occurrence receipt and attributable Return", (t) => {
  const f = fixture(t),
    { p } = f.ready();
  assert.equal(f.view().lifecycle, "BOUND");
  f.runtime.operateProjection(p);
  assert.equal(
    readFileSync(join(f.root, "artifacts", "Report-17.txt"), "utf8"),
    "Report 17\n",
  );
  const chain = f.runtime.inspect(p.body.passage_id);
  assert.equal(chain.fidelity.status, "PASS");
  assert.equal(chain.occurrence.status, "OBSERVED");
  assert.ok(chain.receipt);
  assert.ok(f.runtime.verify(p.body.passage_id).valid);
  assert.equal(f.view().lifecycle, "RETURNING");
  assert.equal(f.view().pending_returns.length, 1);
  f.call("return", {
    passage_id: p.body.passage_id,
    return_id: chain.return.return_id,
    receipt_id: chain.receipt.receipt_id,
  });
  assert.equal(f.view().lifecycle, "RETURNED");
  assert.equal(f.view().pending_returns.length, 0);
});
test("generic admission cannot bypass constituted projection profile", (t) => {
  const f = fixture(t),
    { p } = f.ready(),
    bad = structuredClone(p.body);
  delete bad.projection;
  assert.throws(
    () => f.runtime.admit(signed(bad, f.a)),
    /PROJECTION_BINDING_REQUIRED/,
  );
  assert.equal(existsSync(join(f.root, "artifacts", "Report-17.txt")), false);
});
test("suspension after admission blocks actual effect and retains identity", (t) => {
  const f = fixture(t),
    { p } = f.ready();
  f.runtime.admit(p);
  f.call("suspend", { reason: "Human hold" });
  assert.throws(
    () => f.runtime.execute(p.body.passage_id, p),
    /PROJECTION_NOT_OPERATIVE/,
  );
  assert.equal(existsSync(join(f.root, "artifacts", "Report-17.txt")), false);
  assert.equal(f.view().projection.projection_id, f.id);
});
test("revocation and dependency drift invalidate projection standing at point of use", (t) => {
  const f = fixture(t),
    { g, p } = f.ready();
  f.runtime.admit(p);
  f.control("revocation", { grant_id: g.grant_id });
  assert.throws(
    () => f.runtime.execute(p.body.passage_id, p),
    /AUTHORITY_REVOKED/,
  );
  assert.equal(existsSync(join(f.root, "artifacts", "Report-17.txt")), false);
});
test("unknown binding or changed projection expression cannot reuse admission", (t) => {
  const f = fixture(t),
    { p } = f.ready();
  const bad = structuredClone(p.body);
  bad.projection.binding_ref = randomUUID();
  assert.throws(
    () => f.runtime.admit(signed(bad, f.a)),
    /PROJECTION_BINDING_MISMATCH/,
  );
  f.runtime.admit(p);
  bad.projection.binding_ref = p.body.projection.binding_ref;
  bad.projection.expression_ref = randomUUID();
  assert.throws(
    () => f.runtime.execute(p.body.passage_id, signed(bad, f.a)),
    /FIDELITY_MUTATION/,
  );
});
test("renewal creates a separate successor after Return and reconstructs on restart", (t) => {
  const f = fixture(t),
    { p } = f.ready();
  f.runtime.operateProjection(p);
  const c = f.runtime.inspect(p.body.passage_id);
  f.call("return", {
    passage_id: p.body.passage_id,
    return_id: c.return.return_id,
    receipt_id: c.receipt.receipt_id,
  });
  const before = f.view(),
    next = {
      ...f.core,
      projection_id: randomUUID(),
      constitution_ref: randomUUID(),
      created_at: new Date().toISOString(),
      predecessor_ref: f.id,
    };
  f.call("renew", { successor: next });
  assert.equal(f.view().lifecycle, "RETURNED");
  assert.equal(f.view().successors[0], next.projection_id);
  const q = () =>
    f.field.runtime.query(
      signed(
        {
          ...f.stamp(),
          type: "query",
          issuer: "I-1",
          view: "projection",
          projection_id: next.projection_id,
        },
        f.human,
      ),
    );
  assert.equal(q().lifecycle, "CONSTITUTED");
  assert.equal(q().delegation, null);
  f.field.restart();
  assert.equal(q().projection.predecessor_ref, f.id);
  assert.deepEqual(f.view().projection, before.projection);
});
test("wrong host denial is independently recorded without changing projection identity", (t) => {
  const f = fixture(t);
  f.constitute();
  const d = f.delegate(f.grant());
  const before = f.view().projection;
  const result = f.call("bind", {
    binding_id: randomUUID(),
    host_node: "unavailable-host",
    delegation_ref: d.event_id,
    conditions: {},
    dependencies: { corpus: "v1" },
  });
  assert.equal(result.status, "DENIED");
  assert.equal(f.view().current_binding, null);
  assert.deepEqual(f.view().projection, before);
  assert.equal(f.view().admissions.at(-1).status, "DENIED");
});
test("query is read-only and expiry remains explicit in reconstructed standing", (t) => {
  const f = fixture(t);
  f.constitute();
  const query = () =>
    f.runtime.query(
      signed(
        { ...f.stamp(), type: "query", issuer: "I-1", view: "ledger" },
        f.human,
      ),
    );
  const prior = query();
  f.view();
  assert.deepEqual(query(), prior);
  f.call("expire", { reason: "Bounded episode complete" });
  assert.equal(f.view().lifecycle, "EXPIRED");
  assert.throws(() => f.delegate(f.grant()), /PROJECTION_TERMINAL/);
});

test("admitted passage remains an obligation through expiry until exact Return", (t) => {
  const f = fixture(t),
    { p } = f.ready();
  f.runtime.admit(p);
  f.call("expire", { reason: "Human withdrew the episode" });
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
  assert.equal(f.view().open_passages[0].passage_id, p.body.passage_id);
  assert.throws(
    () => f.runtime.execute(p.body.passage_id, p),
    /PROJECTION_TERMINAL/,
  );
  const c = f.runtime.inspect(p.body.passage_id);
  assert.equal(c.receipt, null);
  f.call("return", {
    passage_id: p.body.passage_id,
    return_id: c.return.return_id,
    receipt_id: null,
  });
  assert.equal(f.view().open_passages.length, 0);
  assert.equal(f.view().pending_returns.length, 0);
  assert.equal(
    f.call("renew", { successor }).projection_id,
    successor.projection_id,
  );
});

test("suspension cannot redelegate around an admitted but unreturned passage", (t) => {
  const f = fixture(t),
    { p } = f.ready();
  f.runtime.admit(p);
  f.call("suspend", { reason: "Human hold" });
  assert.throws(() => f.delegate(f.grant()), /PROJECTION_DELEGATION_STATE/);
  assert.equal(f.view().open_passages.length, 1);
  assert.throws(
    () => f.runtime.execute(p.body.passage_id, p),
    /PROJECTION_NOT_OPERATIVE/,
  );
  const c = f.runtime.inspect(p.body.passage_id);
  f.call("return", {
    passage_id: p.body.passage_id,
    return_id: c.return.return_id,
    receipt_id: null,
  });
  assert.equal(f.view().lifecycle, "RETURNED");
});
