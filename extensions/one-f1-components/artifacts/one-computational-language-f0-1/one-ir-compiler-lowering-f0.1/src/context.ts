import { fileURLToPath } from "node:url";
import { SchemaRegistry } from "../../one-constitutional-language-f0.1/bindings/typescript/src/schema-validator.ts";
import { fail } from "./diagnostics.ts";
import type { LoweringContext, StageResult } from "./types.ts";

const MAX_SAFE_INTEGER = Number.MAX_SAFE_INTEGER;
const DIGEST = /^sha256:[0-9a-f]{64}$/;
const ISO_INSTANT = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,3}))?(?:Z|([+-])(\d{2}):(\d{2}))$/;
const MIN_UTC_MILLIS = -62_135_596_800_000;
const MAX_UTC_MILLIS = 253_402_300_799_999;

let sharedRegistry: SchemaRegistry | undefined;
function sharedSchemas(): SchemaRegistry {
  if (!sharedRegistry) sharedRegistry = new SchemaRegistry(fileURLToPath(new URL("../../one-constitutional-language-f0.1", import.meta.url)));
  return sharedRegistry;
}

function sharedSchemaValid(schemaId: string, value: unknown): boolean {
  try {
    return sharedSchemas().validate(schemaId, value).length === 0;
  } catch {
    return false;
  }
}

export function validCompilerInstant(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const match = ISO_INSTANT.exec(value);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const hour = Number(match[4]);
  const minute = Number(match[5]);
  const second = Number(match[6]);
  const offsetHour = match[9] === undefined ? 0 : Number(match[9]);
  const offsetMinute = match[10] === undefined ? 0 : Number(match[10]);
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  const utcMillis = Date.parse(value);
  return year >= 1 && month >= 1 && month <= 12 && day >= 1 && day <= days[month - 1]
    && hour <= 23 && minute <= 59 && second <= 59 && offsetHour <= 23 && offsetMinute <= 59
    && Number.isFinite(utcMillis) && utcMillis >= MIN_UTC_MILLIS && utcMillis <= MAX_UTC_MILLIS;
}

export function validAdmissionPointInstant(value: unknown): value is string {
  if (!validCompilerInstant(value)) return false;
  const match = ISO_INSTANT.exec(value)!;
  const [year, month, day, hour, minute, second] = match.slice(1, 7).map(Number);
  const fractionMillis = Number((match[7] ?? "").padEnd(3, "0") || "0");
  const localMillisOfDay = ((hour * 60 + minute) * 60 + second) * 1000 + fractionMillis;
  const civilHeadroom = !(year === 9999 && month === 12 && day === 31 && localMillisOfDay > 86_339_999);
  return civilHeadroom && Date.parse(value) <= MAX_UTC_MILLIS - 60_000;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function firstUnpairedSurrogateUnit(value: string): number | null {
  for (let index = 0; index < value.length; index += 1) {
    const unit = value.charCodeAt(index);
    if (unit >= 0xd800 && unit <= 0xdbff) {
      const next = value.charCodeAt(index + 1);
      if (!(next >= 0xdc00 && next <= 0xdfff)) return unit;
      index += 1;
    } else if (unit >= 0xdc00 && unit <= 0xdfff) return unit;
  }
  return null;
}

function hasUnpairedSurrogate(value: string): boolean {
  return firstUnpairedSurrogateUnit(value) !== null;
}

function invalidUnicodeKeySegment(value: string): string {
  const unit = firstUnpairedSurrogateUnit(value);
  return `@invalid-unicode-key-${unit!.toString(16).padStart(4, "0")}`;
}

function pointerPart(value: string): string {
  return value.replace(/~/g, "~0").replace(/\//g, "~1");
}

export interface CanonicalValueIssue { path: string; expected: string }

export function canonicalValueIssue(value: unknown, path = "", ancestors = new Set<object>()): CanonicalValueIssue | null {
  if (value === null || typeof value === "boolean") return null;
  if (typeof value === "string") return hasUnpairedSurrogate(value) ? { path: path || "/", expected: "Unicode scalar string" } : null;
  if (typeof value === "number") return Number.isSafeInteger(value) && Math.abs(value) <= MAX_SAFE_INTEGER
    ? null
    : { path: path || "/", expected: "safe integral JSON number" };
  if (typeof value === "object" && value !== null && ancestors.has(value)) return { path: path || "/", expected: "acyclic JSON value" };
  if (Array.isArray(value)) {
    ancestors.add(value);
    for (let index = 0; index < value.length; index += 1) {
      const issue = canonicalValueIssue(value[index], `${path}/${index}`, ancestors);
      if (issue) {
        ancestors.delete(value);
        return issue;
      }
    }
    ancestors.delete(value);
    return null;
  }
  if (!isRecord(value)) return { path: path || "/", expected: "JSON object, array, or scalar" };
  ancestors.add(value);
  for (const key of Object.keys(value).sort()) {
    if (hasUnpairedSurrogate(key)) {
      ancestors.delete(value);
      return { path: `${path}/${invalidUnicodeKeySegment(key)}`, expected: "Unicode scalar object key" };
    }
    const issue = canonicalValueIssue(value[key], `${path}/${pointerPart(key)}`, ancestors);
    if (issue) {
      ancestors.delete(value);
      return issue;
    }
  }
  ancestors.delete(value);
  return null;
}

type ContextIssue = CanonicalValueIssue;

function requiredRecord(parent: Record<string, unknown>, key: string, base = ""): ContextIssue | null {
  return Object.hasOwn(parent, key) && isRecord(parent[key]) ? null : { path: `${base}/${key}`, expected: "object" };
}

function closedFields(record: Record<string, unknown>, allowed: readonly string[], base: string): ContextIssue | null {
  const ceiling = new Set(allowed);
  const extra = Object.keys(record).sort().find((key) => !ceiling.has(key));
  return extra === undefined ? null : { path: `${base}/${pointerPart(extra)}`, expected: "closed object fields" };
}

function requiredOwnFields(record: Record<string, unknown>, required: readonly string[], base: string): ContextIssue | null {
  const missing = required.filter((key) => !Object.hasOwn(record, key)).sort()[0];
  return missing === undefined ? null : { path: `${base}/${missing}`, expected: "required own field" };
}

function requiredString(parent: Record<string, unknown>, key: string, base: string): ContextIssue | null {
  return Object.hasOwn(parent, key) && typeof parent[key] === "string" && parent[key] !== "" ? null : { path: `${base}/${key}`, expected: "nonempty string" };
}

function requiredDigest(parent: Record<string, unknown>, key: string, base: string): ContextIssue | null {
  return Object.hasOwn(parent, key) && typeof parent[key] === "string" && DIGEST.test(parent[key] as string) ? null : { path: `${base}/${key}`, expected: "lowercase sha256 digest" };
}

function requiredInstant(parent: Record<string, unknown>, key: string, base: string): ContextIssue | null {
  return Object.hasOwn(parent, key) && validCompilerInstant(parent[key]) ? null : { path: `${base}/${key}`, expected: "valid explicit ISO-8601 instant in the common UTC range" };
}

function requiredBoolean(parent: Record<string, unknown>, key: string, base: string): ContextIssue | null {
  return Object.hasOwn(parent, key) && typeof parent[key] === "boolean" ? null : { path: `${base}/${key}`, expected: "boolean" };
}

function requiredStringList(parent: Record<string, unknown>, key: string, base: string, nonempty = false): ContextIssue | null {
  const value = parent[key];
  return Object.hasOwn(parent, key) && Array.isArray(value) && (!nonempty || value.length > 0) && value.every((item) => typeof item === "string" && item !== "") && new Set(value).size === value.length
    ? null
    : { path: `${base}/${key}`, expected: nonempty ? "nonempty string array" : "string array" };
}

function effectIssue(parent: Record<string, unknown>, key: string, base: string): ContextIssue | null {
  const path = `${base}/${key}`;
  const value = parent[key];
  if (!isRecord(value)) return { path, expected: "effect-signature object" };
  const fields = closedFields(value, ["schema_id", "schema_version", "language_profile", "kind", "world_effects", "constitutional_effects", "epistemic_effects", "external_effect_allowed", "standing_change_allowed", "max_consequence"], path);
  if (fields) return fields;
  const required = requiredOwnFields(value, ["schema_id", "schema_version", "language_profile", "kind", "world_effects", "constitutional_effects", "epistemic_effects", "external_effect_allowed", "standing_change_allowed", "max_consequence"], path);
  if (required) return required;
  for (const field of ["world_effects", "constitutional_effects", "epistemic_effects"]) {
    const issue = requiredStringList(value, field, path);
    if (issue) return issue;
  }
  for (const field of ["external_effect_allowed", "standing_change_allowed"]) {
    const issue = requiredBoolean(value, field, path);
    if (issue) return issue;
  }
  return typeof value.max_consequence === "string" && ["NONE", "LOW", "MEDIUM", "HIGH", "CRITICAL"].includes(value.max_consequence)
    ? null
    : { path: `${path}/max_consequence`, expected: "closed consequence enum" };
}

function dependencyBindingIssue(value: unknown, path: string): ContextIssue | null {
  if (!isRecord(value)) return { path, expected: "dependency-binding object" };
  const fields = closedFields(value, ["schema_id", "schema_version", "language_profile", "kind", "binding_id", "dependency_kind", "dependency_ref", "subject_kind", "subject_ref", "binding_mode", "required_revision", "required_digest", "validity_condition"], path);
  if (fields) return fields;
  const required = requiredOwnFields(value, ["schema_id", "schema_version", "language_profile", "kind", "binding_id", "dependency_kind", "dependency_ref", "subject_kind", "subject_ref", "binding_mode", "required_revision", "required_digest", "validity_condition"], path);
  if (required) return required;
  for (const field of ["binding_id", "dependency_kind", "dependency_ref", "binding_mode", "required_revision", "required_digest", "validity_condition"]) {
    const issue = requiredString(value, field, path);
    if (issue) return issue;
  }
  return requiredDigest(value, "required_digest", path);
}

function contextIssue(value: unknown): ContextIssue | null {
  const domain = canonicalValueIssue(value);
  if (domain) return domain;
  if (!isRecord(value)) return { path: "/", expected: "LoweringContext object" };
  const topLevelFields = closedFields(value, ["context_id", "basis", "basis_revision", "grant_specification", "dependency_observations", "revocations", "use_counts", "routing", "times", "predecessor_schema_ids", "provenance", "dependency_lock_digest"], "");
  if (topLevelFields) return topLevelFields;
  const topRequired = requiredOwnFields(value, ["basis", "basis_revision", "grant_specification", "dependency_observations", "revocations", "use_counts", "routing", "times", "predecessor_schema_ids"], "");
  if (topRequired) return topRequired;
  for (const field of ["basis", "basis_revision", "grant_specification", "routing"]) {
    const issue = requiredRecord(value, field);
    if (issue) return issue;
  }
  const basis = value.basis as Record<string, unknown>;
  const basisFields = closedFields(basis, ["schema_id", "schema_version", "language_profile", "kind", "basis_id", "basis_kind", "source_ref", "constitution_ref", "domain", "scope_ceiling", "jurisdiction", "effect_signature", "valid_from", "valid_until", "dependency_bindings", "lineage_ref", "integrity"], "/basis");
  if (basisFields) return basisFields;
  const basisRequired = requiredOwnFields(basis, ["schema_id", "schema_version", "language_profile", "kind", "basis_id", "basis_kind", "source_ref", "constitution_ref", "domain", "scope_ceiling", "jurisdiction", "effect_signature", "valid_from", "valid_until", "dependency_bindings", "lineage_ref", "integrity"], "/basis");
  if (basisRequired) return basisRequired;
  for (const field of ["basis_id", "basis_kind", "source_ref", "constitution_ref", "domain", "jurisdiction", "valid_from"]) {
    const issue = requiredString(basis, field, "/basis");
    if (issue) return issue;
  }
  if (!(basis.valid_until === null || typeof basis.valid_until === "string")) return { path: "/basis/valid_until", expected: "string or null" };
  const basisFrom = requiredInstant(basis, "valid_from", "/basis");
  if (basisFrom) return basisFrom;
  if (basis.valid_until !== null && !validCompilerInstant(basis.valid_until)) return { path: "/basis/valid_until", expected: "valid explicit ISO-8601 instant in the common UTC range or null" };
  for (const field of ["scope_ceiling"]) {
    const issue = requiredStringList(basis, field, "/basis", true);
    if (issue) return issue;
  }
  const basisEffect = effectIssue(basis, "effect_signature", "/basis");
  if (basisEffect) return basisEffect;
  if (!Array.isArray(basis.dependency_bindings)) return { path: "/basis/dependency_bindings", expected: "dependency-binding array" };
  for (let index = 0; index < basis.dependency_bindings.length; index += 1) {
    const issue = dependencyBindingIssue(basis.dependency_bindings[index], `/basis/dependency_bindings/${index}`);
    if (issue) return issue;
  }
  if (!isRecord(basis.lineage_ref)) return { path: "/basis/lineage_ref", expected: "lineage-ref object" };
  const lineageFields = closedFields(basis.lineage_ref, ["schema_id", "schema_version", "language_profile", "kind", "lineage_id", "predecessor_refs", "source_schema_ids", "source_versions", "adapter_receipt_refs", "integrity_digest"], "/basis/lineage_ref");
  if (lineageFields) return lineageFields;
  const lineageRequired = requiredOwnFields(basis.lineage_ref, ["schema_id", "schema_version", "language_profile", "kind", "lineage_id", "predecessor_refs", "source_schema_ids", "source_versions", "adapter_receipt_refs", "integrity_digest"], "/basis/lineage_ref");
  if (lineageRequired) return lineageRequired;
  const lineageDigest = requiredDigest(basis.lineage_ref, "integrity_digest", "/basis/lineage_ref");
  if (lineageDigest) return lineageDigest;
  if (!isRecord(basis.integrity)) return { path: "/basis/integrity", expected: "integrity-block object" };
  const integrityFields = closedFields(basis.integrity, ["schema_id", "schema_version", "language_profile", "kind", "algorithm", "digest", "canonicalization", "signed", "signature_ref"], "/basis/integrity");
  if (integrityFields) return integrityFields;
  const integrityRequired = requiredOwnFields(basis.integrity, ["schema_id", "schema_version", "language_profile", "kind", "algorithm", "digest", "canonicalization", "signed"], "/basis/integrity");
  if (integrityRequired) return integrityRequired;
  const basisIntegrityDigest = requiredDigest(basis.integrity, "digest", "/basis/integrity");
  if (basisIntegrityDigest) return basisIntegrityDigest;
  if (!sharedSchemaValid("urn:one:language:f0.1:authority:root-authority-basis", basis)) return { path: "/basis", expected: "schema-valid RootAuthorityBasis" };

  const revision = value.basis_revision as Record<string, unknown>;
  const revisionFields = closedFields(revision, ["revision", "digest"], "/basis_revision");
  if (revisionFields) return revisionFields;
  const revisionRequired = requiredOwnFields(revision, ["revision", "digest"], "/basis_revision");
  if (revisionRequired) return revisionRequired;
  const revisionRef = requiredString(revision, "revision", "/basis_revision");
  if (revisionRef) return revisionRef;
  const revisionDigest = requiredDigest(revision, "digest", "/basis_revision");
  if (revisionDigest) return revisionDigest;

  const grant = value.grant_specification as Record<string, unknown>;
  const grantFields = closedFields(grant, ["grant_id", "subject_ref", "action", "object_ref", "payload_digest", "purpose", "scope", "jurisdiction", "effect_signature", "valid_from", "valid_until", "delegable", "use_profile", "dependency_bindings", "derivation_ref", "issued_by_ref", "issued_at"], "/grant_specification");
  if (grantFields) return grantFields;
  const grantRequired = requiredOwnFields(grant, ["grant_id", "subject_ref", "action", "object_ref", "payload_digest", "purpose", "scope", "jurisdiction", "effect_signature", "valid_from", "valid_until", "delegable", "use_profile", "dependency_bindings", "derivation_ref", "issued_by_ref", "issued_at"], "/grant_specification");
  if (grantRequired) return grantRequired;
  for (const field of ["grant_id", "subject_ref", "action", "object_ref", "payload_digest", "purpose", "jurisdiction", "valid_from", "valid_until", "derivation_ref", "issued_by_ref", "issued_at"]) {
    const issue = requiredString(grant, field, "/grant_specification");
    if (issue) return issue;
  }
  const grantScope = requiredStringList(grant, "scope", "/grant_specification", true);
  if (grantScope) return grantScope;
  const grantEffect = effectIssue(grant, "effect_signature", "/grant_specification");
  if (grantEffect) return grantEffect;
  if (!sharedSchemaValid("urn:one:language:f0.1:common:effect-signature", grant.effect_signature)) return { path: "/grant_specification/effect_signature", expected: "schema-valid EffectSignature" };
  const delegable = requiredBoolean(grant, "delegable", "/grant_specification");
  if (delegable) return delegable;
  if (typeof grant.use_profile !== "string" || !["ATOMIC", "SINGLE_USE", "BOUNDED_LEASE"].includes(grant.use_profile)) return { path: "/grant_specification/use_profile", expected: "closed use-profile enum" };
  if (!Array.isArray(grant.dependency_bindings)) return { path: "/grant_specification/dependency_bindings", expected: "dependency-binding array" };
  for (let index = 0; index < grant.dependency_bindings.length; index += 1) {
    const issue = dependencyBindingIssue(grant.dependency_bindings[index], `/grant_specification/dependency_bindings/${index}`);
    if (issue) return issue;
    if (!sharedSchemaValid("urn:one:language:f0.1:common:dependency-binding", grant.dependency_bindings[index])) return { path: `/grant_specification/dependency_bindings/${index}`, expected: "schema-valid DependencyBinding" };
  }
  const grantDependencyKeys = new Set<string>();
  for (let index = 0; index < grant.dependency_bindings.length; index += 1) {
    const binding = grant.dependency_bindings[index] as Record<string, unknown>;
    const key = `${binding.dependency_kind as string}\u0000${binding.dependency_ref as string}`;
    if (grantDependencyKeys.has(key)) return { path: `/grant_specification/dependency_bindings/${index}/dependency_ref`, expected: "unique dependency kind and reference" };
    grantDependencyKeys.add(key);
  }
  for (const field of ["valid_from", "valid_until", "issued_at"]) {
    const issue = requiredInstant(grant, field, "/grant_specification");
    if (issue) return issue;
  }
  const grantPayload = requiredDigest(grant, "payload_digest", "/grant_specification");
  if (grantPayload) return grantPayload;

  for (const [field, required] of [["dependency_observations", ["binding_ref", "dependency_ref", "observed_revision", "observed_digest", "observed_at"]], ["revocations", ["event_id", "grant_ref", "effective_at", "reason_code", "issued_by_ref", "authority_ref", "integrity_digest"]]] as const) {
    const rows = value[field];
    if (!Array.isArray(rows)) return { path: `/${field}`, expected: "object array" };
    for (let index = 0; index < rows.length; index += 1) {
      if (!isRecord(rows[index])) return { path: `/${field}/${index}`, expected: "object" };
      const rowFields = closedFields(rows[index], field === "dependency_observations"
        ? ["binding_ref", "dependency_ref", "observed_revision", "observed_digest", "observed_at", "compatibility_assertion_ref", "profile_disposition"]
        : ["event_id", "grant_ref", "effective_at", "reason_code", "issued_by_ref", "authority_ref", "integrity_digest"], `/${field}/${index}`);
      if (rowFields) return rowFields;
      const rowRequired = requiredOwnFields(rows[index], required, `/${field}/${index}`);
      if (rowRequired) return rowRequired;
      for (const key of required) {
        const issue = requiredString(rows[index], key, `/${field}/${index}`);
        if (issue) return issue;
      }
      const instantField = field === "dependency_observations" ? "observed_at" : "effective_at";
      const instantIssue = requiredInstant(rows[index], instantField, `/${field}/${index}`);
      if (instantIssue) return instantIssue;
      const digestField = field === "dependency_observations" ? "observed_digest" : "integrity_digest";
      const digestIssue = requiredDigest(rows[index], digestField, `/${field}/${index}`);
      if (digestIssue) return digestIssue;
      if (field === "dependency_observations") {
        const compatibility = Object.hasOwn(rows[index], "compatibility_assertion_ref") ? rows[index].compatibility_assertion_ref : undefined;
        if (!(compatibility === undefined || compatibility === null || (typeof compatibility === "string" && compatibility !== ""))) return { path: `/${field}/${index}/compatibility_assertion_ref`, expected: "nonempty string or null" };
        const disposition = Object.hasOwn(rows[index], "profile_disposition") ? rows[index].profile_disposition : undefined;
        if (!(disposition === undefined || disposition === null || disposition === "SATISFIED" || disposition === "UNSATISFIED")) return { path: `/${field}/${index}/profile_disposition`, expected: "SATISFIED, UNSATISFIED, or null" };
      }
    }
  }

  const observedBindings = new Set<string>();
  for (let index = 0; index < (value.dependency_observations as Array<Record<string, unknown>>).length; index += 1) {
    const bindingRef = (value.dependency_observations as Array<Record<string, unknown>>)[index].binding_ref as string;
    if (observedBindings.has(bindingRef)) return { path: `/dependency_observations/${index}/binding_ref`, expected: "unique dependency observation binding_ref" };
    observedBindings.add(bindingRef);
  }

  const bindingIds = [
    `binding:basis:${basis.basis_id}:${grant.grant_id}`,
    ...(basis.dependency_bindings as Array<Record<string, unknown>>).map((binding) => binding.binding_id),
    ...(grant.dependency_bindings as Array<Record<string, unknown>>).map((binding) => binding.binding_id)
  ];
  if (new Set(bindingIds).size !== bindingIds.length) return { path: "/grant_specification/dependency_bindings", expected: "binding IDs distinct from each other and the synthetic root-basis binding" };

  if (!isRecord(value.use_counts)) return { path: "/use_counts", expected: "safe nonnegative integer map" };
  for (const key of Object.keys(value.use_counts).sort()) {
    const count = value.use_counts[key];
    if (typeof count !== "number" || !Number.isSafeInteger(count) || count < 0) return { path: `/use_counts/${pointerPart(key)}`, expected: "safe nonnegative integer" };
  }

  const routing = value.routing as Record<string, unknown>;
  const routingFields = closedFields(routing, ["authenticated_source_ref", "available_refs"], "/routing");
  if (routingFields) return routingFields;
  const routingRequired = requiredOwnFields(routing, ["authenticated_source_ref", "available_refs"], "/routing");
  if (routingRequired) return routingRequired;
  const authenticated = requiredString(routing, "authenticated_source_ref", "/routing");
  if (authenticated) return authenticated;
  if (!Object.hasOwn(routing, "available_refs")) return { path: "/routing/available_refs", expected: "nested string collection" };
  const visitRefs = (item: unknown, path: string): ContextIssue | null => {
    if (typeof item === "string" && item !== "") return null;
    if (Array.isArray(item)) {
      for (let index = 0; index < item.length; index += 1) {
        const issue = visitRefs(item[index], `${path}/${index}`);
        if (issue) return issue;
      }
      return null;
    }
    if (isRecord(item)) {
      for (const key of Object.keys(item).sort()) {
        const issue = visitRefs(item[key], `${path}/${pointerPart(key)}`);
        if (issue) return issue;
      }
      return null;
    }
    return { path, expected: "nested string collection" };
  };
  const routingIssue = visitRefs(routing.available_refs, "/routing/available_refs");
  if (routingIssue) return routingIssue;

  if (!isRecord(value.times)) return { path: "/times", expected: "object" };
  const timeFields = closedFields(value.times, ["authority_evaluation", "authorization", "commitment", "point_of_use", "attempt_started"], "/times");
  if (timeFields) return timeFields;
  const timesRequired = requiredOwnFields(value.times, ["authority_evaluation", "authorization", "commitment", "point_of_use", "attempt_started"], "/times");
  if (timesRequired) return timesRequired;
  for (const field of ["authority_evaluation", "authorization", "commitment", "point_of_use", "attempt_started"]) {
    const issue = requiredInstant(value.times, field, "/times");
    if (issue) return issue;
  }
  if (!validAdmissionPointInstant(value.times.point_of_use)) return { path: "/times/point_of_use", expected: "instant with a representable 60-second admission window" };
  if (!Array.isArray(value.predecessor_schema_ids) || !value.predecessor_schema_ids.every((item) => typeof item === "string" && item !== "") || new Set(value.predecessor_schema_ids).size !== value.predecessor_schema_ids.length) return { path: "/predecessor_schema_ids", expected: "unique string array" };
  if (Object.hasOwn(value, "context_id") && (typeof value.context_id !== "string" || value.context_id === "")) return { path: "/context_id", expected: "nonempty string" };
  if (Object.hasOwn(value, "provenance") && !isRecord(value.provenance)) return { path: "/provenance", expected: "object" };
  if (Object.hasOwn(value, "provenance") && isRecord(value.provenance) && Object.hasOwn(value.provenance, "dependency_lock_digest") && (typeof value.provenance.dependency_lock_digest !== "string" || !DIGEST.test(value.provenance.dependency_lock_digest))) return { path: "/provenance/dependency_lock_digest", expected: "lowercase sha256 digest" };
  if (Object.hasOwn(value, "dependency_lock_digest") && (typeof value.dependency_lock_digest !== "string" || !DIGEST.test(value.dependency_lock_digest))) return { path: "/dependency_lock_digest", expected: "lowercase sha256 digest" };
  return null;
}

function normalizeValue(value: unknown): unknown {
  if (typeof value === "number") return value === 0 ? 0 : value;
  if (Array.isArray(value)) return value.map(normalizeValue);
  if (isRecord(value)) return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, normalizeValue(item)]));
  return value;
}

export function normalizeLoweringContext(value: unknown): StageResult<LoweringContext> {
  const issue = contextIssue(value);
  if (issue) return fail("LOWERING_CONTEXT_INVALID", "LOWERING_TRACE.BIND", issue.path, null, null, { expected: issue.expected });
  return { ok: true, value: normalizeValue(value) as LoweringContext };
}
