import test from "node:test";
import assert from "node:assert/strict";
import { fixture } from "../helpers/projection.mjs";
import { signed } from "../helpers/local-field.mjs";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { randomUUID } from "node:crypto";

test("dependency mutation after admission holds effect and Mission Control shows drift", (t) => {
  const f = fixture(t),
    { p } = f.ready();
  f.runtime.admit(p);
  f.control("dependency", { name: "corpus", value: "v2" });
  assert.throws(
    () => f.runtime.execute(p.body.passage_id, p),
    /DEPENDENCY_CHANGED/,
  );
  assert.equal(existsSync(join(f.root, "artifacts", "Report-17.txt")), false);
  assert.deepEqual(f.view().dependency_drift, ["corpus"]);
  assert.ok(f.view().conflicts.length);
});
test("same grant cannot be attached to multiple projections or widen declared purpose", (t) => {
  const f = fixture(t);
  f.constitute();
  const g = f.grant();
  f.delegate(g);
  const next = {
    ...f.core,
    projection_id: randomUUID(),
    constitution_ref: randomUUID(),
  };
  const call = (type, body) =>
    f.runtime.projection(
      signed(
        {
          ...f.stamp(),
          type,
          issuer: "I-1",
          projection_id: next.projection_id,
          ...body,
        },
        f.human,
      ),
    );
  call("projection_constitute", { projection: next });
  assert.throws(
    () => call("projection_delegate", { grant_id: g.grant_id }),
    /PROJECTION_GRANT_ALREADY_BOUND/,
  );
  const wide = f.field.grant({ purpose: "Unrelated authority" });
  assert.throws(
    () => call("projection_delegate", { grant_id: wide.grant_id }),
    /PROJECTION_DELEGATION_MISMATCH/,
  );
});
test("expired projection core never obtains runtime standing from fresh commands", (t) => {
  const f = fixture(t);
  f.core.created_at = new Date(Date.now() - 120000).toISOString();
  f.core.expires_at = new Date(Date.now() - 60000).toISOString();
  f.constitute();
  assert.equal(f.view().lifecycle, "EXPIRED");
  assert.throws(() => f.delegate(f.grant()), /PROJECTION_EXPIRED/);
});
test("Return correlation cannot acknowledge a different originating passage", (t) => {
  const f = fixture(t),
    { p } = f.ready();
  f.runtime.operateProjection(p);
  const c = f.runtime.inspect(p.body.passage_id);
  assert.throws(
    () =>
      f.call("return", {
        passage_id: randomUUID(),
        return_id: c.return.return_id,
        receipt_id: c.receipt.receipt_id,
      }),
    /PROJECTION_RETURN_BINDING/,
  );
  assert.equal(f.view().pending_returns.length, 1);
});

test("fresh delegation clears previous host admission and requires a new binding", (t) => {
  const f = fixture(t),
    { p } = f.ready();
  f.call("suspend", { reason: "SourcePoint changes the delegation" });
  const replacement = f.grant(),
    delegation = f.delegate(replacement);
  assert.equal(f.view().current_binding, null);
  assert.equal(f.view().lifecycle, "DELEGATED");
  assert.throws(() => f.runtime.admit(p), /PROJECTION_NOT_OPERATIVE/);
  const binding = f.bind(delegation),
    next = f.passage(replacement, delegation, binding);
  f.runtime.operateProjection(next);
  assert.equal(
    f.runtime.inspect(next.body.passage_id).occurrence.status,
    "OBSERVED",
  );
});
