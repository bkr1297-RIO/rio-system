import {
  requireValue as demand,
  hash,
} from "../security/local-field-authority.mjs";
export const PROJECTION_PROFILE = "one.projection-runtime.v0.1";
export const LIFECYCLES = [
  "UNCONSTITUTED",
  "CONSTITUTED",
  "DELEGATED",
  "BOUND",
  "OPERATING",
  "SUSPENDED",
  "REBINDING",
  "RETURNING",
  "RETURNED",
  "EXPIRED",
];
export const terminal = (state) => ["RETURNED", "EXPIRED"].includes(state);
export const object = (x) =>
  x !== null && typeof x === "object" && !Array.isArray(x);
export const text = (x) => typeof x === "string" && x.length > 0;
export function validateProjection(p, root) {
  const keys = [
    "projection_id",
    "sourcepoint_id",
    "constitution_ref",
    "lineage_ref",
    "projection_class",
    "purpose",
    "carrier_node",
    "conditions",
    "dependencies",
    "return_obligations",
    "created_at",
    "expires_at",
    "renewal_conditions",
    "predecessor_ref",
    "exobody_ref",
  ];
  demand(
    object(p) && Object.keys(p).sort().join(",") === [...keys].sort().join(","),
    "PROJECTION_CORE_INVALID",
  );
  demand(
    keys.slice(0, 7).every((k) => text(p[k])) &&
      p.projection_class === "Holo" &&
      p.sourcepoint_id === root.principal_id,
    "PROJECTION_SOURCE_BINDING",
  );
  demand(
    p.projection_id.length >= 16 &&
      p.projection_id !== p.sourcepoint_id &&
      p.projection_id !== p.carrier_node,
    "PROJECTION_ID_SEPARATION",
  );
  demand(
    object(p.conditions) &&
      hash(p.conditions) === hash({}) &&
      object(p.dependencies) &&
      Object.values(p.dependencies).every(text),
    "PROJECTION_CONSTRAINTS_INVALID",
  );
  demand(
    object(p.return_obligations) &&
      Object.keys(p.return_obligations).sort().join(",") === "required,to" &&
      p.return_obligations.required === true &&
      p.return_obligations.to === root.principal_id,
    "PROJECTION_RETURN_REQUIRED",
  );
  demand(
    Number.isFinite(Date.parse(p.created_at)) &&
      Number.isFinite(Date.parse(p.expires_at)) &&
      Date.parse(p.created_at) <= Date.now() &&
      Date.parse(p.expires_at) > Date.parse(p.created_at),
    "PROJECTION_TIME_INVALID",
  );
  demand(
    text(p.renewal_conditions) &&
      (p.predecessor_ref === null || text(p.predecessor_ref)) &&
      (p.exobody_ref === null || text(p.exobody_ref)),
    "PROJECTION_LINEAGE_INVALID",
  );
}
