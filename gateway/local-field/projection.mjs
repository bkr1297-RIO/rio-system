import { randomUUID } from "node:crypto";
import { canonicalizeArgs } from "../security/token-manager.mjs";
import { signPayload, verifySignature } from "../security/ed25519.mjs";
import {
  hash,
  requireValue as demand,
  fresh,
  verifySigned,
  nodeAt,
  resolveGrant,
} from "../security/local-field-authority.mjs";
import {
  PROJECTION_PROFILE,
  terminal,
  text,
  object,
  validateProjection,
} from "./projection-profile.mjs";

/** Projection is a composition of existing standing, not a new principal/root. */
export class ProjectionRuntime {
  #s;
  #f;
  #a;
  #receiver;
  #key;
  constructor({ store, field, anchor, receiver, signingKey }) {
    demand(
      field.projection_runtime?.profile === PROJECTION_PROFILE,
      "PROJECTION_PROFILE_INVALID",
    );
    this.#s = store;
    this.#f = field;
    this.#a = anchor;
    this.#receiver = receiver;
    this.#key = signingKey;
  }
  #root(record) {
    const b = record?.body;
    demand(
      b?.field_id === this.#f.field_id && b.issuer === this.#a.principal_id,
      "PROJECTION_ROOT_REQUIRED",
    );
    verifySigned(record, this.#a.public_key_hex);
    fresh(b);
    demand(
      text(b.record_id) && b.record_id.length >= 16 && text(b.projection_id),
      "PROJECTION_COMMAND_INVALID",
    );
    return b;
  }
  #core(id) {
    const r = this.#s.get("projection", id);
    demand(r, "PROJECTION_UNKNOWN");
    verifySigned(r.constitution_record, this.#a.public_key_hex);
    const original =
      r.constitution_record.body.projection ||
      r.constitution_record.body.successor;
    demand(
      hash(original) === hash(r.projection),
      "PROJECTION_HISTORY_INTEGRITY",
    );
    validateProjection(r.projection, this.#a);
    return r;
  }
  #verifyEvent(e, core) {
    const { attestation, ...body } = e;
    const node = this.#s.get("enrollment", attestation?.issuer)?.body.node;
    demand(
      e.profile === PROJECTION_PROFILE &&
        e.projection_id === core.projection_id &&
        e.core_hash === hash(core) &&
        node &&
        verifySignature(
          canonicalizeArgs(body),
          attestation.signature,
          node.public_key_hex,
        ),
      "PROJECTION_HISTORY_INTEGRITY",
    );
    return e;
  }
  #events(id) {
    const r = this.#core(id);
    return this.#s
      .all("projection_event")
      .filter((e) => e.projection_id === id)
      .map((e) => this.#verifyEvent(e, r.projection));
  }
  #event(id, operation, payload, command = null) {
    const events = this.#events(id),
      p = this.#core(id).projection;
    const e = {
      profile: PROJECTION_PROFILE,
      event_id: randomUUID(),
      projection_id: id,
      core_hash: hash(p),
      operation,
      payload,
      command,
      previous_event_ref: events.at(-1)?.event_id || null,
      created_at: new Date().toISOString(),
    };
    const sealed = {
      ...e,
      attestation: {
        issuer: this.#receiver,
        signature: signPayload(canonicalizeArgs(e), this.#key),
      },
    };
    this.#s.insert("projection_event", e.event_id, sealed);
    this.#s.append({
      intent_id: id,
      action: "projection." + operation,
      agent_id: this.#receiver,
      status: payload.lifecycle || payload.status || operation,
      detail: JSON.stringify(sealed),
    });
    return sealed;
  }
  #constitute(record, p, carriage = null) {
    validateProjection(p, this.#a);
    demand(!this.#s.get("projection", p.projection_id), "PROJECTION_EXISTS");
    demand(p.projection_id !== this.#receiver, "PROJECTION_ID_SEPARATION");
    nodeAt(this.#s, p.carrier_node);
    demand(
      p.sourcepoint_id === this.#a.principal_id,
      "PROJECTION_SOURCE_BINDING",
    );
    const original = carriage?.constitution_record || record;
    this.#s.insert("projection", p.projection_id, {
      projection: p,
      constitution_record: original,
      inherited_history: carriage
        ? [...carriage.inherited_history, ...carriage.events]
        : [],
      carriage_record: carriage ? record : null,
    });
    return this.#event(
      p.projection_id,
      carriage ? "CARRIED" : "CONSTITUTED",
      {
        lifecycle:
          carriage?.lifecycle && terminal(carriage.lifecycle)
            ? carriage.lifecycle
            : "CONSTITUTED",
        from_lifecycle: "UNCONSTITUTED",
        carriage_authority: "NONE",
      },
      record,
    );
  }
  #state(id) {
    const r = this.#core(id),
      events = this.#events(id);
    let lifecycle = "UNCONSTITUTED",
      delegation = null,
      binding = null;
    const pending = new Map(),
      open = new Map(),
      successors = [];
    const obligations = (e) => {
      if (e.operation === "OPERATING")
        open.set(e.payload.passage_id, {
          passage_id: e.payload.passage_id,
          decision_id: e.payload.decision_id,
          host_node: e.attestation.issuer,
        });
      if (e.operation === "RETURN_ACCOUNT") {
        open.delete(e.payload.passage_id);
        pending.set(e.payload.passage_id, e.payload);
      }
      if (["RETURNED", "RETURN_ACKNOWLEDGED"].includes(e.operation)) {
        pending.delete(e.payload.passage_id);
        open.delete(e.payload.passage_id);
      }
    };
    // Carried standing stays inactive, but unresolved obligations travel with identity.
    for (const e of r.inherited_history) {
      this.#verifyEvent(e, r.projection);
      obligations(e);
    }
    for (const e of events) {
      if (e.payload.lifecycle) lifecycle = e.payload.lifecycle;
      if (e.operation === "DELEGATED") {
        delegation = e;
        binding = null;
      }
      if (e.operation === "BOUND") binding = e.payload.binding;
      if (e.operation === "REBINDING") binding = null;
      obligations(e);
      if (e.operation === "RENEWED") successors.push(e.payload.successor_ref);
    }
    return {
      projection: r.projection,
      constitution_record: r.constitution_record,
      inherited_history: r.inherited_history,
      events,
      recorded_lifecycle: lifecycle,
      delegation,
      current_binding: binding,
      open_passages: [...open.values()],
      pending_returns: [...pending.values()],
      successors,
      admissions: events
        .filter((e) => e.operation === "HOST_ADMISSION")
        .map((e) => ({ ...e.payload, admission_id: e.event_id })),
    };
  }
  #active(s) {
    demand(!terminal(s.recorded_lifecycle), "PROJECTION_TERMINAL");
    demand(
      Date.parse(s.projection.expires_at) > Date.now(),
      "PROJECTION_EXPIRED",
    );
  }
  #delegation(s) {
    demand(s.delegation, "PROJECTION_DELEGATION_REQUIRED");
    const gid = s.delegation.payload.grant_id,
      g = this.#s.get("grant", gid);
    demand(g, "AUTHORITY_MISSING");
    resolveGrant(this.#s, gid, g.body.grant, this.#a, this.#f.field_id);
    return g;
  }
  #bind(record, rebind) {
    const b = record.body,
      s = this.#state(b.projection_id);
    demand(
      text(b.binding_id) &&
        b.binding_id.length >= 16 &&
        text(b.host_node) &&
        text(b.delegation_ref) &&
        object(b.conditions) &&
        object(b.dependencies),
      "PROJECTION_BIND_REQUEST_INVALID",
    );
    if (rebind && !terminal(s.recorded_lifecycle))
      this.#event(
        b.projection_id,
        "REBINDING",
        { lifecycle: "REBINDING", requested_host: b.host_node },
        record,
      );
    let reason = null,
      g;
    try {
      this.#active(s);
      demand(
        !["OPERATING", "RETURNING"].includes(s.recorded_lifecycle) &&
          s.pending_returns.length === 0 &&
          s.open_passages.length === 0,
        "PROJECTION_RETURN_PENDING",
      );
      demand(b.host_node === this.#receiver, "HOST_ADMISSION_TARGET_MISMATCH");
      const host = nodeAt(this.#s, b.host_node);
      demand(host.primary_role === "executor", "HOST_EXECUTOR_REQUIRED");
      demand(
        s.delegation?.event_id === b.delegation_ref,
        "CARRIAGE_IS_NOT_ADMISSION",
      );
      g = this.#delegation(s);
      demand(
        g.body.grant.target_node === b.host_node,
        "AUTHORITY_TARGET_NODE_MISMATCH",
      );
      demand(
        hash(b.conditions) === hash(s.projection.conditions) &&
          hash(b.dependencies) === hash(s.projection.dependencies),
        "PROJECTION_BIND_CONSTRAINT_MISMATCH",
      );
      demand(
        host.capabilities.includes(g.body.grant.action),
        "CAPABILITY_MISSING",
      );
      demand(
        !this.#s
          .all("projection_event")
          .some((e) => e.payload?.binding?.binding_id === b.binding_id),
        "PROJECTION_BINDING_REPLAY",
      );
    } catch (e) {
      reason = e.message;
    }
    const admission = this.#event(
      b.projection_id,
      "HOST_ADMISSION",
      {
        status: reason ? "DENIED" : "ADMITTED",
        host_node: b.host_node,
        delegation_ref: b.delegation_ref,
        binding_id: b.binding_id,
        reason,
      },
      record,
    );
    if (reason)
      return {
        status: "DENIED",
        admission_id: admission.event_id,
        reason,
        projection_id: b.projection_id,
      };
    const binding = {
      binding_id: b.binding_id,
      projection_id: b.projection_id,
      host_node: b.host_node,
      delegation_ref: b.delegation_ref,
      host_admission_ref: admission.event_id,
      grant_id: g.body.grant.grant_id,
      conditions: b.conditions,
      dependencies: b.dependencies,
    };
    this.#event(
      b.projection_id,
      "BOUND",
      { lifecycle: "BOUND", binding },
      record,
    );
    return { ...binding, status: "ADMITTED" };
  }
  handle(raw) {
    canonicalizeArgs(raw);
    const record = structuredClone(raw),
      b = this.#root(record);
    return this.#s.transaction(() => {
      this.#s.useNonce("projection", b.record_id);
      if (b.type === "projection_constitute") {
        demand(
          b.projection?.projection_id === b.projection_id &&
            b.projection.predecessor_ref === null,
          "PROJECTION_CONSTITUTION_BINDING",
        );
        return this.#constitute(record, b.projection);
      }
      if (b.type === "projection_carry") {
        const x = b.carriage,
          p = x?.projection;
        demand(
          p?.projection_id === b.projection_id &&
            Array.isArray(x.events) &&
            x.events.length > 0 &&
            Array.isArray(x.inherited_history),
          "PROJECTION_CARRIAGE_INVALID",
        );
        verifySigned(x.constitution_record, this.#a.public_key_hex);
        demand(
          hash(
            x.constitution_record.body.projection ||
              x.constitution_record.body.successor,
          ) === hash(p),
          "PROJECTION_CARRIAGE_CORE_MISMATCH",
        );
        const heads = new Map(),
          seen = new Set();
        for (const e of [...x.inherited_history, ...x.events]) {
          this.#verifyEvent(e, p);
          const issuer = e.attestation.issuer;
          demand(
            !seen.has(e.event_id) &&
              e.previous_event_ref === (heads.get(issuer) || null),
            "PROJECTION_CARRIAGE_ORDER",
          );
          heads.set(issuer, e.event_id);
          seen.add(e.event_id);
        }
        const lifecycle = x.events.filter((e) => e.payload.lifecycle).at(-1)
          ?.payload.lifecycle;
        demand(lifecycle === x.recorded_lifecycle, "PROJECTION_CARRIAGE_STATE");
        return this.#constitute(record, p, { ...x, lifecycle });
      }
      const s = this.#state(b.projection_id);
      if (b.type === "projection_bind" || b.type === "projection_rebind")
        return this.#bind(record, b.type === "projection_rebind");
      if (b.type === "projection_delegate") {
        this.#active(s);
        demand(
          ["CONSTITUTED", "DELEGATED", "SUSPENDED", "REBINDING"].includes(
            s.recorded_lifecycle,
          ) &&
            !s.pending_returns.length &&
            !s.open_passages.length,
          "PROJECTION_DELEGATION_STATE",
        );
        const g = this.#s.get("grant", b.grant_id);
        demand(g, "AUTHORITY_MISSING");
        resolveGrant(
          this.#s,
          b.grant_id,
          g.body.grant,
          this.#a,
          this.#f.field_id,
        );
        const p = s.projection,
          v = g.body.grant;
        demand(
          v.subject === p.carrier_node &&
            v.purpose === p.purpose &&
            hash(v.conditions) === hash(p.conditions) &&
            hash(v.dependencies) === hash(p.dependencies),
          "PROJECTION_DELEGATION_MISMATCH",
        );
        demand(
          Date.parse(g.body.expires_at) <= Date.parse(p.expires_at),
          "PROJECTION_EXPIRY_EXPANSION",
        );
        demand(
          !this.#s.state("projection_grant", b.grant_id),
          "PROJECTION_GRANT_ALREADY_BOUND",
        );
        this.#s.state("projection_grant", b.grant_id, b.projection_id);
        return this.#event(
          b.projection_id,
          "DELEGATED",
          {
            lifecycle: "DELEGATED",
            grant_id: b.grant_id,
            authority_envelope: v,
            signed_grant: g,
            predecessor_delegation_ref: s.delegation?.event_id || null,
          },
          record,
        );
      }
      if (b.type === "projection_suspend") {
        this.#active(s);
        demand(text(b.reason), "PROJECTION_REASON_REQUIRED");
        return this.#event(
          b.projection_id,
          "SUSPENDED",
          { lifecycle: "SUSPENDED", reason: b.reason },
          record,
        );
      }
      if (b.type === "projection_expire") {
        demand(
          !terminal(s.recorded_lifecycle) && text(b.reason),
          "PROJECTION_TERMINAL",
        );
        return this.#event(
          b.projection_id,
          "EXPIRED",
          {
            lifecycle: "EXPIRED",
            reason: b.reason,
            pending_return_refs: s.pending_returns.map((x) => x.return_id),
          },
          record,
        );
      }
      if (b.type === "projection_return") {
        const account = s.pending_returns.find(
          (x) => x.passage_id === b.passage_id,
        );
        demand(
          account &&
            account.return_id === b.return_id &&
            account.receipt_id === b.receipt_id,
          "PROJECTION_RETURN_BINDING",
        );
        const remaining = s.pending_returns.length - 1 + s.open_passages.length;
        return this.#event(
          b.projection_id,
          remaining ? "RETURN_ACKNOWLEDGED" : "RETURNED",
          {
            ...account,
            lifecycle: remaining
              ? terminal(s.recorded_lifecycle)
                ? s.recorded_lifecycle
                : "RETURNING"
              : "RETURNED",
          },
          record,
        );
      }
      if (b.type === "projection_renew") {
        demand(
          terminal(s.recorded_lifecycle) &&
            s.pending_returns.length === 0 &&
            s.open_passages.length === 0,
          "PROJECTION_RENEWAL_STATE",
        );
        const p = b.successor;
        demand(
          p?.predecessor_ref === b.projection_id &&
            p.projection_id !== b.projection_id &&
            p.constitution_ref !== s.projection.constitution_ref,
          "PROJECTION_SUCCESSOR_REQUIRED",
        );
        validateProjection(p, this.#a);
        demand(Date.parse(p.expires_at) > Date.now(), "PROJECTION_EXPIRED");
        const next = this.#constitute(record, p);
        this.#event(
          b.projection_id,
          "RENEWED",
          {
            successor_ref: p.projection_id,
            successor_constitution_ref: next.event_id,
            predecessor_terminal_ref:
              s.events.filter((e) => terminal(e.payload.lifecycle)).at(-1)
                ?.event_id || null,
          },
          record,
        );
        return next;
      }
      throw new Error("PROJECTION_OPERATION_INVALID");
    });
  }
  guard(p) {
    demand(object(p.projection), "PROJECTION_BINDING_REQUIRED");
    const x = p.projection,
      s = this.#state(x.projection_id);
    this.#active(s);
    demand(
      ["BOUND", "OPERATING"].includes(s.recorded_lifecycle),
      "PROJECTION_NOT_OPERATIVE",
    );
    const b = s.current_binding;
    demand(
      b &&
        b.binding_id === x.binding_ref &&
        b.host_node === this.#receiver &&
        b.delegation_ref === x.delegation_ref &&
        s.delegation?.event_id === x.delegation_ref,
      "PROJECTION_BINDING_MISMATCH",
    );
    demand(
      s.projection.carrier_node === p.source_node &&
        p.subject === p.source_node &&
        b.grant_id === p.authority_basis,
      "PROJECTION_PASSAGE_AUTHORITY_MISMATCH",
    );
    const lineage = resolveGrant(
      this.#s,
      b.grant_id,
      p,
      this.#a,
      this.#f.field_id,
    );
    demand(
      lineage.length > 0 &&
        hash(p.dependencies) === hash(b.dependencies) &&
        hash(p.conditions) === hash(b.conditions),
      "PROJECTION_CONSTRAINT_MISMATCH",
    );
    const candidate = this.#s.get("candidate", x.expression_ref);
    demand(
      candidate &&
        candidate.body.source_node === p.source_node &&
        p.origin.candidate_id === x.expression_ref &&
        object(x.model_ref) &&
        text(x.model_ref.model_id) &&
        x.model_ref.runtime_node === p.source_node &&
        ![x.projection_id, this.#a.principal_id, this.#receiver].includes(
          x.model_ref.model_id,
        ),
      "PROJECTION_EXPRESSION_BINDING",
    );
    if (s.recorded_lifecycle === "OPERATING")
      demand(
        s.events.findLast((e) => e.operation === "OPERATING")?.payload
          .passage_id === p.passage_id,
        "PROJECTION_OPERATION_OPEN",
      );
    return true;
  }
  admitted(p, decision) {
    this.#event(p.projection.projection_id, "OPERATING", {
      lifecycle: "OPERATING",
      passage_id: p.passage_id,
      decision_id: decision.decision_id,
      expression_ref: p.projection.expression_ref,
      model_ref: p.projection.model_ref,
    });
  }
  capture(chain) {
    const id = chain.passage?.body.projection?.projection_id;
    if (!id || !chain.return) return;
    const s = this.#state(id),
      pid = chain.passage.body.passage_id;
    if (
      s.events.some(
        (e) => e.operation === "RETURN_ACCOUNT" && e.payload.passage_id === pid,
      )
    )
      return;
    this.#s.transaction(() =>
      this.#event(id, "RETURN_ACCOUNT", {
        lifecycle: terminal(s.recorded_lifecycle)
          ? s.recorded_lifecycle
          : "RETURNING",
        passage_id: pid,
        decision_id: chain.decision?.decision_id || null,
        fidelity_id: chain.fidelity?.fidelity_id || null,
        attempt_id: chain.attempt?.attempt_id || null,
        occurrence_id: chain.occurrence?.occurrence_id || null,
        occurrence_status:
          chain.occurrence?.status ||
          (chain.attempt ? "UNKNOWN" : "NOT_ATTEMPTED"),
        receipt_id: chain.receipt?.receipt_id || null,
        return_id: chain.return.return_id,
        native_return: chain.return,
        projection_authority_effect: "NONE",
      }),
    );
  }
  view(id) {
    const s = this.#state(id);
    let lifecycle = s.recorded_lifecycle,
      reason = null;
    if (
      !terminal(lifecycle) &&
      Date.parse(s.projection.expires_at) <= Date.now()
    ) {
      lifecycle = "EXPIRED";
      reason = "PROJECTION_EXPIRED";
    }
    if (s.delegation)
      try {
        this.#delegation(s);
      } catch (e) {
        reason = e.message;
        if (
          ["DELEGATED", "BOUND", "OPERATING", "REBINDING"].includes(lifecycle)
        )
          lifecycle = "SUSPENDED";
      }
    const drift = Object.entries(s.projection.dependencies)
      .filter(([k, v]) => this.#s.state("dependency", k) !== v)
      .map(([k]) => k);
    if (drift.length) {
      reason = "DEPENDENCY_CHANGED";
      if (["BOUND", "OPERATING", "DELEGATED", "REBINDING"].includes(lifecycle))
        lifecycle = "SUSPENDED";
    }
    return structuredClone({
      ...s,
      profile: PROJECTION_PROFILE,
      lifecycle,
      delegation_status: { active: !!s.delegation && !reason, reason },
      dependency_drift: drift,
      conflicts: reason ? [{ reason, requires_human_decision: true }] : [],
      authority_effect: "NONE",
      visibility_effect: "NONE",
    });
  }
  status() {
    return this.#s.all("projection").map((r) => {
      const v = this.view(r.projection.projection_id);
      return {
        projection: v.projection,
        lifecycle: v.lifecycle,
        recorded_lifecycle: v.recorded_lifecycle,
        delegation_status: v.delegation_status,
        current_binding: v.current_binding,
        admissions: v.admissions,
        open_passages: v.open_passages,
        pending_returns: v.pending_returns,
        dependency_drift: v.dependency_drift,
        conflicts: v.conflicts,
        successors: v.successors,
        visibility_effect: "NONE",
      };
    });
  }
}
