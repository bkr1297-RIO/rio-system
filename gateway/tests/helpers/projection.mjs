import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { setup, signed } from "./local-field.mjs";
import { hash } from "../../security/local-field-authority.mjs";

export function fixture(t) {
  const f = setup(
    t,
    "model_runtime",
    {},
    {},
    { projection_runtime: { profile: "one.projection-runtime.v0.1" } },
  );
  assert.equal(
    typeof f.runtime.projection,
    "function",
    "Projection lifecycle must be an existing field integration",
  );
  const id = randomUUID();
  const core = {
    projection_id: id,
    sourcepoint_id: "I-1",
    constitution_ref: randomUUID(),
    lineage_ref: "sourcepoint:customer-zero-intent",
    projection_class: "Holo",
    purpose: "ONE project work",
    carrier_node: "node-a",
    conditions: {},
    dependencies: { corpus: "v1" },
    return_obligations: { required: true, to: "I-1" },
    created_at: new Date().toISOString(),
    expires_at: new Date(Date.now() + 1200000).toISOString(),
    renewal_conditions: "New explicit human constitution and delegation",
    predecessor_ref: null,
    exobody_ref: null,
  };
  const call = (op, body = {}, key = f.human) =>
    f.runtime.projection(
      signed(
        {
          ...f.stamp(),
          type: "projection_" + op,
          issuer: "I-1",
          projection_id: id,
          ...body,
        },
        key,
      ),
    );
  const view = () =>
    f.runtime.query(
      signed(
        {
          ...f.stamp(),
          type: "query",
          issuer: "I-1",
          view: "projection",
          projection_id: id,
        },
        f.human,
      ),
    );
  const constitute = () => call("constitute", { projection: core });
  const grant = () =>
    f.grant({
      target: "Report-17.txt",
      scope: "project-work",
      purpose: core.purpose,
      payload_hash: hash({ content: "Report 17\n" }),
      max_uses: 1,
    });
  const delegate = (g) => call("delegate", { grant_id: g.grant_id });
  const bind = (d) =>
    call("bind", {
      binding_id: randomUUID(),
      host_node: "node-b",
      delegation_ref: d.event_id,
      conditions: {},
      dependencies: { corpus: "v1" },
    });
  const passage = (g, d, b) => {
    const candidate = signed(
      {
        ...f.stamp(),
        type: "candidate",
        source_node: "node-a",
        candidate_id: randomUUID(),
        kind: "recommended_action",
        content: "Create the bounded project report",
      },
      f.a,
    );
    f.runtime.candidate(candidate);
    return f.passage(g, {
      target: "Report-17.txt",
      scope: "project-work",
      purpose: core.purpose,
      payload: { content: "Report 17\n" },
      payload_hash: hash({ content: "Report 17\n" }),
      origin: {
        intent: "Customer Zero project report",
        candidate_id: candidate.body.candidate_id,
      },
      projection: {
        projection_id: id,
        delegation_ref: d.event_id,
        binding_ref: b.binding_id,
        expression_ref: candidate.body.candidate_id,
        model_ref: {
          model_id: "engineering-candidate-source",
          runtime_node: "node-a",
        },
      },
    });
  };
  const ready = () => {
    constitute();
    const g = grant(),
      d = delegate(g),
      b = bind(d);
    return { g, d, b, p: passage(g, d, b) };
  };
  return {
    ...f,
    field: f,
    id,
    core,
    call,
    view,
    constitute,
    grant,
    delegate,
    bind,
    passage,
    ready,
  };
}
