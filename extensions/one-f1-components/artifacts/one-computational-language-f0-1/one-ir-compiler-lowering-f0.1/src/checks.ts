import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { SchemaRegistry } from "../../one-constitutional-language-f0.1/bindings/typescript/src/schema-validator.ts";
import { canonicalValueIssue, normalizeLoweringContext, validAdmissionPointInstant, validCompilerInstant } from "./context.ts";
import { fail } from "./diagnostics.ts";
import { compilerIntegrity, digest, oneIrDigest, oneIrSeed, rawDigest, stableJson, typedAstDigest } from "./hash.ts";
import { authorityRequestSeed, emitOneIR } from "./ir.ts";
import { fieldByName, FIELD_TYPES, parseSource, REQUIRED_FIELDS } from "./parser.ts";
import type { CompilerDiagnostic, LoweringContext, ONEIRProgram, StageResult, TypedAST, TypedField } from "./types.ts";

const DIGEST = /^sha256:[0-9a-f]{64}$/;
const CONSEQUENCES = ["NONE", "LOW", "MEDIUM", "HIGH", "CRITICAL"] as const;
const CONSEQUENCE_RANK: Record<string, number> = { NONE: 0, LOW: 1, MEDIUM: 2, HIGH: 3, CRITICAL: 4 };

const REF_FIELDS = new Set([
  "SOURCE", "BASIS", "AUTHORITY", "PROPOSAL", "CANDIDATE", "SUBJECT", "OBJECT", "JURISDICTION", "CONTEXT",
  "POLICY", "EVIDENCE_PLAN", "RETURN_OBLIGATION", "PROPOSER", "EVALUATOR", "EXECUTOR"
]);
const DIGEST_FIELDS = new Set(["BASIS_DIGEST", "PAYLOAD", "DELTA", "POLICY_DIGEST"]);
const TIMESTAMP_FIELDS = new Set(["CREATED_AT", "EXPIRES_AT", "AUTHORIZATION_AT", "COMMITMENT_AT", "POINT_OF_USE_AT", "ATTEMPT_AT"]);
const BOOLEAN_FIELDS = new Set(["EXTERNAL_EFFECT", "STANDING_EFFECT"]);
const LIST_REF_FIELDS = new Set(["SCOPE", "EVIDENCE_OBLIGATIONS"]);
const LIST_STRING_FIELDS = new Set(["WORLD_EFFECTS", "CONSTITUTIONAL_EFFECTS", "EPISTEMIC_EFFECTS", "PREDECESSORS"]);

const AST_FIELDS = ["kind", "profile", "ast_id", "program_name", "source_expression_ref", "source_digest", "fields", "ast_digest", "authority_effect", "standing_effect"] as const;
const AST_NODE_FIELDS = ["kind", "node_id", "field", "semantic_type", "value", "source_span"] as const;
const SPAN_FIELDS = ["start_byte", "end_byte"] as const;
const IR_ROOT_FIELDS = ["schema_id", "schema_version", "language_profile", "kind", "ir_id", "program_name", "operation", "source", "bindings", "nodes", "authority_obligations", "effect_signature", "times", "field_mappings", "lowering_target", "lineage", "authority_effect", "standing_effect", "integrity"] as const;
const IR_SOURCE_FIELDS = ["source_ref", "source_digest"] as const;
const IR_BINDING_FIELDS = ["sourcepoint_ref", "basis_ref", "basis_revision", "basis_digest", "authority_ref", "proposal_ref", "candidate_ref", "subject_ref", "action", "object_ref", "payload_digest", "intended_delta_digest", "purpose", "scope", "jurisdiction", "context_ref", "policy_ref", "policy_revision", "policy_digest", "evidence_plan_ref", "evidence_obligation_refs", "return_obligation_ref", "proposer_ref", "evaluator_ref", "executor_ref", "predecessor_schema_ids"] as const;
const IR_NODE_FIELDS = ["node_id", "ordinal", "operation", "output_type", "output_value_ref", "input_node_refs", "source_ast_ref", "time_binding"] as const;
const IR_OBLIGATION_FIELDS = ["obligation", "object_ref", "evaluation_at", "request_digest"] as const;
const EFFECT_SIGNATURE_FIELDS = ["schema_id", "schema_version", "language_profile", "kind", "world_effects", "constitutional_effects", "epistemic_effects", "external_effect_allowed", "standing_change_allowed", "max_consequence"] as const;
const IR_TIME_FIELDS = ["created_at", "expires_at", "authorization_at", "commitment_at", "point_of_use_at", "attempt_started_at"] as const;
const IR_MAPPING_FIELDS = ["source_field", "ir_path", "diamond_input_path"] as const;
const IR_TARGET_FIELDS = ["profile", "binding_package", "entrypoint", "dependency_lock_digest"] as const;
const IR_LINEAGE_FIELDS = ["source_expression_ref", "source_digest", "typed_ast_ref", "typed_ast_digest", "compiler_profile"] as const;
const INTEGRITY_FIELDS = ["schema_id", "schema_version", "language_profile", "kind", "algorithm", "digest", "canonicalization", "signed", "signature_ref"] as const;

function compareUtf16(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function pointerPart(value: string): string {
  return value.replace(/~/g, "~0").replace(/\//g, "~1");
}

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function firstUnknown(recordValue: Record<string, unknown>, allowed: readonly string[], base: string): string | null {
  const ceiling = new Set(allowed);
  const extra = Object.keys(recordValue).filter((key) => !ceiling.has(key)).sort(compareUtf16)[0];
  return extra === undefined ? null : `${base}/${pointerPart(extra)}`;
}

function astShapeIssue(value: unknown): { path: string; expected: string } | null {
  if (!record(value)) return { path: "/", expected: "TypedAST object" };
  const unknownRoot = firstUnknown(value, AST_FIELDS, "");
  if (unknownRoot) return { path: unknownRoot, expected: "closed TypedAST fields" };
  for (const key of AST_FIELDS) if (!Object.hasOwn(value, key)) return { path: `/${key}`, expected: "required own TypedAST field" };
  if (value.kind !== "ProgramAST") return { path: "/kind", expected: "ProgramAST" };
  if (value.authority_effect !== "NONE") return { path: "/authority_effect", expected: "NONE" };
  if (value.standing_effect !== "NONE") return { path: "/standing_effect", expected: "NONE" };
  for (const key of ["profile", "ast_id", "program_name", "source_expression_ref", "source_digest", "ast_digest"]) {
    if (typeof value[key] !== "string" || value[key] === "") return { path: `/${key}`, expected: "nonempty string" };
  }
  for (const key of ["source_digest", "ast_digest"]) {
    if (!DIGEST.test(value[key] as string)) return { path: `/${key}`, expected: "lowercase sha256 digest" };
  }
  if (!Array.isArray(value.fields)) return { path: "/fields", expected: "TypedField array" };
  const seen = new Set<string>();
  for (let index = 0; index < value.fields.length; index += 1) {
    const field = value.fields[index];
    if (!record(field)) return { path: `/fields/${index}`, expected: "TypedField object" };
    const unknownField = firstUnknown(field, AST_NODE_FIELDS, `/fields/${index}`);
    if (unknownField) return { path: unknownField, expected: "closed TypedField fields" };
    for (const key of AST_NODE_FIELDS) if (!Object.hasOwn(field, key)) return { path: `/fields/${index}/${key}`, expected: "required own TypedField field" };
    if (field.kind !== "TypedField") return { path: `/fields/${index}/kind`, expected: "TypedField" };
    for (const key of ["node_id", "field", "semantic_type"]) {
      if (typeof field[key] !== "string" || field[key] === "") return { path: `/fields/${index}/${key}`, expected: "nonempty string" };
    }
    const fieldName = field.field as string;
    if (!Object.hasOwn(FIELD_TYPES, fieldName)) return { path: `/fields/${index}/field`, expected: "declared F0.1 field name" };
    if (seen.has(fieldName)) return { path: `/fields/${index}/field`, expected: "unique F0.1 field name" };
    seen.add(fieldName);
    if (field.semantic_type !== FIELD_TYPES[fieldName]) return { path: `/fields/${index}/semantic_type`, expected: FIELD_TYPES[fieldName] };
    const expectedNodeId = `ast-field:${fieldName.toLowerCase()}:${String(index + 1).padStart(2, "0")}`;
    if (field.node_id !== expectedNodeId) return { path: `/fields/${index}/node_id`, expected: expectedNodeId };
    const typedValue = field.value;
    if (!(typeof typedValue === "string" || typeof typedValue === "boolean" || (Array.isArray(typedValue) && typedValue.every((item) => typeof item === "string" || typeof item === "boolean")))) {
      return { path: `/fields/${index}/value`, expected: "typed scalar or flat typed list" };
    }
    if (!record(field.source_span)) return { path: `/fields/${index}/source_span`, expected: "source-span object" };
    const unknownSpan = firstUnknown(field.source_span, SPAN_FIELDS, `/fields/${index}/source_span`);
    if (unknownSpan) return { path: unknownSpan, expected: "closed source-span fields" };
    for (const key of SPAN_FIELDS) if (!Object.hasOwn(field.source_span, key)) return { path: `/fields/${index}/source_span/${key}`, expected: "required own source-span field" };
    const start = field.source_span.start_byte;
    const end = field.source_span.end_byte;
    if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || Number(start) < 0 || Number(end) < Number(start)) return { path: `/fields/${index}/source_span`, expected: "ordered nonnegative safe-integer byte span" };
  }
  return null;
}

function irPreflightIssue(value: unknown): { path: string; keyword: string; reason: string } | null {
  if (!record(value)) return null;
  const issues: Array<{ path: string; keyword: string; reason: string }> = [];
  const closed = (candidate: unknown, allowed: readonly string[], base: string): void => {
    if (!record(candidate)) return;
    const ceiling = new Set(allowed);
    for (const key of Object.keys(candidate)) if (!ceiling.has(key)) issues.push({ path: `${base}/${pointerPart(key)}`, keyword: "additionalProperties", reason: "unknown field" });
  };
  const requiredOwn = (candidate: unknown, required: readonly string[], base: string): void => {
    if (!record(candidate)) return;
    for (const key of required) if (!Object.hasOwn(candidate, key)) issues.push({ path: `${base}/${key}`, keyword: "required", reason: "missing own field" });
  };
  requiredOwn(value, IR_ROOT_FIELDS, "");
  requiredOwn(value.source, IR_SOURCE_FIELDS, "/source");
  requiredOwn(value.bindings, IR_BINDING_FIELDS, "/bindings");
  if (Array.isArray(value.nodes)) value.nodes.forEach((node, index) => requiredOwn(node, IR_NODE_FIELDS, `/nodes/${index}`));
  if (Array.isArray(value.authority_obligations)) value.authority_obligations.forEach((item, index) => requiredOwn(item, IR_OBLIGATION_FIELDS, `/authority_obligations/${index}`));
  requiredOwn(value.effect_signature, EFFECT_SIGNATURE_FIELDS, "/effect_signature");
  requiredOwn(value.times, IR_TIME_FIELDS, "/times");
  if (Array.isArray(value.field_mappings)) value.field_mappings.forEach((item, index) => requiredOwn(item, IR_MAPPING_FIELDS, `/field_mappings/${index}`));
  requiredOwn(value.lowering_target, IR_TARGET_FIELDS, "/lowering_target");
  requiredOwn(value.lineage, IR_LINEAGE_FIELDS, "/lineage");
  requiredOwn(value.integrity, INTEGRITY_FIELDS.filter((key) => key !== "signature_ref"), "/integrity");
  closed(value, IR_ROOT_FIELDS, "");
  closed(value.source, IR_SOURCE_FIELDS, "/source");
  closed(value.bindings, IR_BINDING_FIELDS, "/bindings");
  if (Array.isArray(value.nodes)) value.nodes.forEach((node, index) => closed(node, IR_NODE_FIELDS, `/nodes/${index}`));
  if (Array.isArray(value.authority_obligations)) value.authority_obligations.forEach((item, index) => closed(item, IR_OBLIGATION_FIELDS, `/authority_obligations/${index}`));
  closed(value.effect_signature, EFFECT_SIGNATURE_FIELDS, "/effect_signature");
  closed(value.times, IR_TIME_FIELDS, "/times");
  if (Array.isArray(value.field_mappings)) value.field_mappings.forEach((item, index) => closed(item, IR_MAPPING_FIELDS, `/field_mappings/${index}`));
  closed(value.lowering_target, IR_TARGET_FIELDS, "/lowering_target");
  closed(value.lineage, IR_LINEAGE_FIELDS, "/lineage");
  closed(value.integrity, INTEGRITY_FIELDS, "/integrity");

  const timestamp = (candidate: unknown, path: string, admissionPoint = false): void => {
    if (typeof candidate === "string" && !(admissionPoint ? validAdmissionPointInstant(candidate) : validCompilerInstant(candidate))) issues.push({ path, keyword: "format", reason: "invalid F0.1 instant" });
  };
  const strictDigest = (candidate: unknown, path: string): void => {
    if (typeof candidate === "string" && !DIGEST.test(candidate)) issues.push({ path, keyword: "pattern", reason: "invalid lowercase sha256 digest" });
  };
  if (record(value.source)) strictDigest(value.source.source_digest, "/source/source_digest");
  if (record(value.bindings)) for (const field of ["basis_digest", "payload_digest", "intended_delta_digest", "policy_digest"]) strictDigest(value.bindings[field], `/bindings/${field}`);
  if (Array.isArray(value.authority_obligations)) value.authority_obligations.forEach((item, index) => {
    if (record(item) && item.request_digest !== null) strictDigest(item.request_digest, `/authority_obligations/${index}/request_digest`);
  });
  if (record(value.lowering_target)) strictDigest(value.lowering_target.dependency_lock_digest, "/lowering_target/dependency_lock_digest");
  if (record(value.lineage)) {
    strictDigest(value.lineage.source_digest, "/lineage/source_digest");
    strictDigest(value.lineage.typed_ast_digest, "/lineage/typed_ast_digest");
  }
  if (record(value.integrity)) strictDigest(value.integrity.digest, "/integrity/digest");
  if (record(value.times)) for (const field of IR_TIME_FIELDS) timestamp(value.times[field], `/times/${field}`, field === "point_of_use_at");
  if (Array.isArray(value.nodes)) value.nodes.forEach((node, index) => {
    if (record(node)) timestamp(node.time_binding, `/nodes/${index}/time_binding`, index === 7 || index === 8);
  });
  if (Array.isArray(value.authority_obligations)) value.authority_obligations.forEach((item, index) => {
    if (record(item)) timestamp(item.evaluation_at, `/authority_obligations/${index}/evaluation_at`, index === 3);
  });
  issues.sort((left, right) => compareUtf16(left.path, right.path) || compareUtf16(left.keyword, right.keyword) || compareUtf16(left.reason, right.reason));
  return issues[0] ?? null;
}

function astFailure(code: string, field: TypedField | undefined, details: Record<string, unknown> = {}): StageResult<ONEIRProgram> {
  const name = field?.field ?? String(details.field ?? "");
  return fail(code, "TYPE_CHECK", `/fields/${name}`, field?.node_id ?? null, field?.source_span ?? null, details);
}

function same(left: unknown, right: unknown): boolean {
  return stableJson(left) === stableJson(right);
}

function isObjectRef(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

let schemaRegistry: SchemaRegistry | undefined;
function localRegistry(): SchemaRegistry {
  if (schemaRegistry) return schemaRegistry;
  const sharedRoot = fileURLToPath(new URL("../../one-constitutional-language-f0.1", import.meta.url));
  const registry = new SchemaRegistry(sharedRoot);
  const schema = JSON.parse(readFileSync(new URL("../schemas/ir/one-ir-program.schema.json", import.meta.url), "utf8"));
  registry.schemas.set(schema.$id, schema);
  schemaRegistry = registry;
  return registry;
}

function pointerFromRegistryPath(path: string): string {
  if (path === "$") return "/";
  const parts = path.replace(/^\$\.?/, "").replace(/\[(\d+)\]/g, ".$1").split(".").filter(Boolean);
  return `/${parts.map((part) => part.replace(/~/g, "~0").replace(/\//g, "~1")).join("/")}`;
}

function registrySchemaIssue(ir: ONEIRProgram): { path: string; reason: string; keyword: string } | null {
  const preflight = irPreflightIssue(ir);
  if (preflight) return preflight;
  const registry = localRegistry();
  const unresolved = registry.unresolvedReferences();
  if (unresolved.length > 0) return { path: "/", reason: `unresolved schema reference ${unresolved[0]}`, keyword: "$ref" };
  const errors = registry.validate("urn:one:language:f0.1:ir:one-ir-program", ir)
    .sort((left, right) => compareUtf16(pointerFromRegistryPath(left.path), pointerFromRegistryPath(right.path))
      || compareUtf16(left.keyword, right.keyword)
      || compareUtf16(left.message, right.message));
  const first = errors[0];
  return first ? { path: pointerFromRegistryPath(first.path), reason: first.message, keyword: first.keyword } : null;
}

export function typeCheck(ast: TypedAST, ir: ONEIRProgram): StageResult<ONEIRProgram> {
  const structuralIssue = astShapeIssue(ast);
  if (structuralIssue) return fail("TYPE_AST_INVALID", "TYPE_CHECK", structuralIssue.path, null, null, { expected: structuralIssue.expected });
  const astDomainIssue = canonicalValueIssue(ast);
  if (astDomainIssue) return fail("TYPE_CANONICAL_DOMAIN_INVALID", "TYPE_CHECK", astDomainIssue.path, null, null, { expected: astDomainIssue.expected, container: "TypedAST" });
  const irDomainIssue = canonicalValueIssue(ir);
  if (irDomainIssue) return fail("IR_SCHEMA_INVALID", "TYPE_CHECK", irDomainIssue.path, null, null, { keyword: "canonical-domain" });
  for (const required of REQUIRED_FIELDS) {
    if (!fieldByName(ast, required)) return astFailure("TYPE_MISSING_FIELD", undefined, { field: required });
  }
  if (ast.profile !== "F0.1") return fail("TYPE_INVALID_PROFILE", "TYPE_CHECK", "/profile", null, null, { expected: "F0.1", observed: ast.profile });
  for (const name of REQUIRED_FIELDS) {
    const field = fieldByName(ast, name)!;
    const value = field.value;
    if (REF_FIELDS.has(name) && !isObjectRef(value)) return astFailure("TYPE_INVALID_REF", field, { field: name, observed: value });
    if (DIGEST_FIELDS.has(name) && (typeof value !== "string" || !DIGEST.test(value))) return astFailure("TYPE_INVALID_DIGEST", field, { field: name });
    if (TIMESTAMP_FIELDS.has(name) && (!validCompilerInstant(value) || (name === "POINT_OF_USE_AT" && !validAdmissionPointInstant(value)))) return astFailure("TYPE_INVALID_TIMESTAMP", field, { field: name, observed: value });
    if (BOOLEAN_FIELDS.has(name) && typeof value !== "boolean") return astFailure("TYPE_INVALID_BOOLEAN", field, { field: name, observed: value });
    if (LIST_REF_FIELDS.has(name) && (!Array.isArray(value) || value.length === 0 || value.some((item) => !isObjectRef(item)) || new Set(value).size !== value.length)) return astFailure("TYPE_INVALID_LIST", field, { field: name, element_type: "ObjectRef" });
    if (LIST_STRING_FIELDS.has(name) && (!Array.isArray(value) || (name === "PREDECESSORS" && value.length === 0) || value.some((item) => typeof item !== "string" || item.length === 0) || new Set(value).size !== value.length)) return astFailure("TYPE_INVALID_LIST", field, { field: name, element_type: "String" });
    if (name === "MAX_CONSEQUENCE" && (typeof value !== "string" || !CONSEQUENCES.includes(value as any))) return astFailure("TYPE_INVALID_CONSEQUENCE", field, { field: name, observed: value });
    if (["ACTION", "PURPOSE", "BASIS_REVISION", "POLICY_REVISION"].includes(name) && (typeof value !== "string" || value.length === 0)) return astFailure("TYPE_INVALID_REF", field, { field: name, observed: value });
    if (name === "LOWER" && value !== "DIAMOND_CROSSING") return astFailure("TYPE_UNSUPPORTED_OPERATION", field, { expected: "DIAMOND_CROSSING", observed: value });
  }
  const orderedFields = ["CREATED_AT", "AUTHORIZATION_AT", "COMMITMENT_AT", "POINT_OF_USE_AT", "ATTEMPT_AT", "EXPIRES_AT"];
  const instants = orderedFields.map((name) => Date.parse(fieldByName(ast, name)!.value as string));
  for (let index = 1; index < instants.length; index += 1) {
    const allowed = index === 4 ? instants[index - 1] < instants[index] : instants[index - 1] <= instants[index];
    if (!allowed) {
      const field = fieldByName(ast, orderedFields[index])!;
      return astFailure("TYPE_TIME_ORDER", field, { earlier_field: orderedFields[index - 1], later_field: orderedFields[index] });
    }
  }
  const registryIssue = registrySchemaIssue(ir);
  if (registryIssue) return fail("IR_SCHEMA_INVALID", "TYPE_CHECK", registryIssue.path, null, null, { keyword: registryIssue.keyword });
  return { ok: true, value: ir };
}

interface ExpectedNode {
  node_id: string;
  ordinal: number;
  operation: string;
  output_type: string;
  input_node_refs: string[];
}

const EXPECTED_GRAPH: readonly ExpectedNode[] = Object.freeze([
  { node_id: "n01-proposal", ordinal: 1, operation: "INTAKE", output_type: "ProposalEnvelope", input_node_refs: [] },
  { node_id: "n02-conditions", ordinal: 2, operation: "CONDITIONS", output_type: "CrossingConditions", input_node_refs: ["n01-proposal"] },
  { node_id: "n03-evaluation", ordinal: 3, operation: "EVALUATE", output_type: "EvaluationResult", input_node_refs: ["n01-proposal", "n02-conditions"] },
  { node_id: "n04-root-authority", ordinal: 4, operation: "ROOT", output_type: "AuthorityGrant", input_node_refs: [] },
  { node_id: "n05-preauth-current", ordinal: 5, operation: "CURRENT_AUTHORITY", output_type: "AuthorityLivenessSnapshot", input_node_refs: ["n04-root-authority"] },
  { node_id: "n06-authorization", ordinal: 6, operation: "AUTHORIZE", output_type: "Authorization", input_node_refs: ["n01-proposal", "n03-evaluation", "n04-root-authority", "n05-preauth-current"] },
  { node_id: "n07-commitment", ordinal: 7, operation: "COMMIT", output_type: "Commitment", input_node_refs: ["n01-proposal", "n03-evaluation", "n04-root-authority", "n06-authorization"] },
  { node_id: "n08-pou-current", ordinal: 8, operation: "CURRENT_AUTHORITY", output_type: "AuthorityLivenessSnapshot", input_node_refs: ["n04-root-authority", "n07-commitment"] },
  { node_id: "n09-attempt-admission", ordinal: 9, operation: "ADMIT_ATTEMPT", output_type: "AttemptAdmission", input_node_refs: ["n06-authorization", "n07-commitment", "n08-pou-current"] },
  { node_id: "n10-execution-attempt", ordinal: 10, operation: "INSTANTIATE_ATTEMPT", output_type: "ExecutionAttempt", input_node_refs: ["n09-attempt-admission"] }
]);

export function relationCheck(ir: ONEIRProgram, ast: TypedAST, context: LoweringContext): StageResult<ONEIRProgram> {
  const normalized = normalizeLoweringContext(context);
  if (!normalized.ok) return normalized;
  const canonicalNodes = emitOneIR(ast, normalized.value).nodes;
  if (ir.program_name !== ast.program_name) return fail("RELATION_BINDING_MISMATCH", "RELATION_CHECK", "/program_name", null, null, { expected: ast.program_name, observed: ir.program_name });
  for (let index = 0; index < EXPECTED_GRAPH.length; index += 1) {
    const actual = ir.nodes[index];
    const expected = EXPECTED_GRAPH[index];
    if (actual.ordinal !== expected.ordinal) return fail("RELATION_STAGE_REORDERED", "RELATION_CHECK", `/nodes/${index}/ordinal`, actual.node_id, null, { expected: expected.ordinal, observed: actual.ordinal });
  }
  const attempt = ir.nodes[9];
  if (attempt.input_node_refs.includes("n06-authorization")) return fail("RELATION_FORBIDDEN_PROMOTION", "RELATION_CHECK", "/nodes/9/input_node_refs", attempt.node_id, null, { from_type: "Authorization", to_type: "ExecutionAttempt" });
  for (let index = 0; index < EXPECTED_GRAPH.length; index += 1) {
    const actual = ir.nodes[index];
    const graph = EXPECTED_GRAPH[index];
    const canonical = canonicalNodes[index];
    if (actual.node_id !== graph.node_id || actual.operation !== graph.operation || actual.output_type !== graph.output_type) return fail("RELATION_BROKEN_EDGE", "RELATION_CHECK", `/nodes/${index}`, actual.node_id, null, { expected_node_id: graph.node_id, expected_operation: graph.operation, expected_output_type: graph.output_type });
    if (!same(actual.input_node_refs, graph.input_node_refs)) return fail("RELATION_BROKEN_EDGE", "RELATION_CHECK", `/nodes/${index}/input_node_refs`, actual.node_id, null, { expected: graph.input_node_refs, observed: actual.input_node_refs });
    for (const property of ["output_value_ref", "source_ast_ref", "time_binding"] as const) if (!same(actual[property], canonical[property])) return fail("RELATION_BINDING_MISMATCH", "RELATION_CHECK", `/nodes/${index}/${property}`, actual.node_id, null, { expected: canonical[property], observed: actual[property] });
  }
  return { ok: true, value: ir };
}

function bindingFailure(field: string, expected: unknown, observed: unknown): StageResult<ONEIRProgram> {
  return fail("BINDING_SUBSTITUTION", "AUTHORITY_OBLIGATION_CHECK", `/bindings/${field}`, null, null, { field, expected, observed });
}

export function authorityObligationCheck(ir: ONEIRProgram, context: LoweringContext): StageResult<ONEIRProgram> {
  const normalized = normalizeLoweringContext(context);
  if (!normalized.ok) return normalized;
  context = normalized.value;
  const b = ir.bindings;
  const basis = context.basis;
  const spec = context.grant_specification;
  if (!basis || b.basis_ref !== basis.basis_id) return fail("AUTHORITY_BASIS_UNRESOLVED", "AUTHORITY_OBLIGATION_CHECK", "/bindings/basis_ref", null, null, { basis_ref: b.basis_ref });
  if (!spec || b.authority_ref !== spec.grant_id) return fail("AUTHORITY_GRANT_UNRESOLVED", "AUTHORITY_OBLIGATION_CHECK", "/bindings/authority_ref", null, null, { authority_ref: b.authority_ref });
  const exactBindings: Array<[string, unknown, unknown]> = [
    ["sourcepoint_ref", basis.source_ref, b.sourcepoint_ref],
    ["basis_revision", context.basis_revision.revision, b.basis_revision],
    ["basis_digest", context.basis_revision.digest, b.basis_digest],
    ["subject_ref", spec.subject_ref, b.subject_ref],
    ["action", spec.action, b.action],
    ["object_ref", spec.object_ref, b.object_ref],
    ["payload_digest", spec.payload_digest, b.payload_digest],
    ["purpose", spec.purpose, b.purpose],
    ["jurisdiction", spec.jurisdiction, b.jurisdiction],
    ["proposer_ref", context.routing?.authenticated_source_ref ?? null, b.proposer_ref]
  ];
  for (const [field, expected, observed] of exactBindings) if (!same(expected, observed)) return bindingFailure(field, expected, observed);
  if (!subset(b.scope, spec.scope)) return bindingFailure("scope", spec.scope, b.scope);
  const policyBindings = Array.isArray(spec.dependency_bindings) ? spec.dependency_bindings : [];
  const policyBinding = policyBindings.find((binding) => binding.dependency_kind === "POLICY" && binding.dependency_ref === b.policy_ref);
  if (!policyBinding) return bindingFailure("policy_ref", "bound policy dependency", b.policy_ref);
  if (policyBinding.subject_kind !== "Proposal" || policyBinding.subject_ref !== b.proposal_ref) {
    return fail("BINDING_SUBSTITUTION", "AUTHORITY_OBLIGATION_CHECK", "/bindings/proposal_ref", null, null, {
      field: "policy_dependency_subject",
      expected: { subject_kind: "Proposal", subject_ref: b.proposal_ref },
      observed: { subject_kind: policyBinding.subject_kind, subject_ref: policyBinding.subject_ref }
    });
  }
  if (policyBinding.required_revision !== b.policy_revision) return bindingFailure("policy_revision", policyBinding.required_revision, b.policy_revision);
  if (policyBinding.required_digest !== b.policy_digest) return bindingFailure("policy_digest", policyBinding.required_digest, b.policy_digest);

  const requestDigest = digest(authorityRequestSeed(ir));
  const expected = [
    { obligation: "ROOT_BASIS_REQUIRED", object_ref: b.basis_ref, evaluation_at: null, request_digest: null },
    { obligation: "AUTHORITY_DERIVATION_REQUIRED", object_ref: b.authority_ref, evaluation_at: null, request_digest: requestDigest },
    { obligation: "CURRENT_AUTHORITY_REQUIRED", object_ref: b.authority_ref, evaluation_at: ir.times.authorization_at, request_digest: requestDigest },
    { obligation: "CURRENT_AUTHORITY_REQUIRED", object_ref: b.authority_ref, evaluation_at: ir.times.point_of_use_at, request_digest: requestDigest }
  ];
  if (ir.authority_obligations.length !== expected.length) return fail("AUTHORITY_OBLIGATION_MISSING", "AUTHORITY_OBLIGATION_CHECK", "/authority_obligations", null, null, { expected_count: expected.length, observed_count: ir.authority_obligations.length });
  if (ir.authority_obligations[3].evaluation_at !== ir.times.point_of_use_at) return fail("CACHED_LIVENESS_FORBIDDEN", "AUTHORITY_OBLIGATION_CHECK", "/authority_obligations/3/evaluation_at", null, null, { required_instant: ir.times.point_of_use_at, observed: ir.authority_obligations[3].evaluation_at });
  for (let index = 0; index < expected.length; index += 1) {
    if (!same(ir.authority_obligations[index], expected[index])) return fail("AUTHORITY_OBLIGATION_MISSING", "AUTHORITY_OBLIGATION_CHECK", `/authority_obligations/${index}`, null, null, { expected: expected[index], observed: ir.authority_obligations[index] });
  }
  return { ok: true, value: ir };
}

function subset(child: string[], parent: string[]): boolean {
  const allowed = new Set(parent);
  return child.every((item) => allowed.has(item));
}

export function effectCheck(ir: ONEIRProgram, context: LoweringContext): StageResult<ONEIRProgram> {
  const normalized = normalizeLoweringContext(context);
  if (!normalized.ok) return normalized;
  context = normalized.value;
  const effect = ir.effect_signature;
  if (ir.nodes.some((node) => node.operation === "INSTANTIATE_ATTEMPT") && !effect.world_effects.includes("EXECUTE_BOUNDED_ACTION")) return fail("EFFECT_UNDECLARED", "EFFECT_CHECK", "/effect_signature/world_effects", null, null, { required_effect: "EXECUTE_BOUNDED_ACTION" });
  if (ir.nodes.some((node) => node.operation === "INSTANTIATE_ATTEMPT") && !effect.epistemic_effects.includes("RECORD_ATTEMPT")) return fail("EFFECT_UNDECLARED", "EFFECT_CHECK", "/effect_signature/epistemic_effects", null, null, { required_effect: "RECORD_ATTEMPT" });
  const ceilings = [context.grant_specification.effect_signature, context.basis.effect_signature];
  for (const ceiling of ceilings) {
    const widened = !subset(effect.world_effects, ceiling.world_effects)
      || !subset(effect.constitutional_effects, ceiling.constitutional_effects)
      || !subset(effect.epistemic_effects, ceiling.epistemic_effects)
      || (effect.external_effect_allowed && !ceiling.external_effect_allowed)
      || (effect.standing_change_allowed && !ceiling.standing_change_allowed)
      || CONSEQUENCE_RANK[effect.max_consequence] > CONSEQUENCE_RANK[ceiling.max_consequence];
    if (widened) return fail("EFFECT_WIDENING", "EFFECT_CHECK", "/effect_signature", null, null, { ceiling: ceiling === context.grant_specification.effect_signature ? "grant" : "basis" });
  }
  return { ok: true, value: ir };
}

export function lineageCheck(source: string, ast: TypedAST, ir: ONEIRProgram, context: LoweringContext): StageResult<ONEIRProgram> {
  const normalized = normalizeLoweringContext(context);
  if (!normalized.ok) return normalized;
  context = normalized.value;
  const observedIrDigest = oneIrDigest(ir);
  const expectedIrId = `one-ir:${observedIrDigest.slice(-16)}`;
  const expectedIntegrity = compilerIntegrity(oneIrSeed(ir));
  if (!same(ir.integrity, expectedIntegrity) || ir.ir_id !== expectedIrId) return fail("IR_INTEGRITY_MISMATCH", "LOWERING_TRACE.LINEAGE", "/integrity", null, null, { expected: expectedIntegrity, observed: ir.integrity });
  const sourceDigest = rawDigest(source);
  const expectedSourceRef = `source-expression:${sourceDigest.slice(-16)}`;
  if (ir.source.source_digest !== sourceDigest || ir.lineage.source_digest !== sourceDigest || ast.source_digest !== sourceDigest) return fail("SOURCE_DIGEST_MISMATCH", "LOWERING_TRACE.LINEAGE", "/source/source_digest", null, null, { expected: sourceDigest, observed: ir.source.source_digest });
  const reparsed = parseSource(source);
  if (!reparsed.ok || !same(ast, reparsed.value)) return fail("AST_SOURCE_MISMATCH", "LOWERING_TRACE.LINEAGE", "/typed_ast", null, null, { expected: reparsed.ok ? reparsed.value.ast_digest : null, observed: ast.ast_digest });
  const observedAstDigest = typedAstDigest(ast);
  const expectedAstId = `typed-ast:${observedAstDigest.slice(-16)}`;
  if (ast.ast_digest !== observedAstDigest || ast.ast_id !== expectedAstId || ir.lineage.typed_ast_digest !== observedAstDigest || ir.lineage.typed_ast_ref !== expectedAstId) return fail("AST_DIGEST_MISMATCH", "LOWERING_TRACE.LINEAGE", "/lineage/typed_ast_digest", null, null, { expected: observedAstDigest, observed: ir.lineage.typed_ast_digest });
  if (ast.source_expression_ref !== expectedSourceRef || ir.source.source_ref !== expectedSourceRef || ir.lineage.source_expression_ref !== expectedSourceRef) return fail("SOURCE_DIGEST_MISMATCH", "LOWERING_TRACE.LINEAGE", "/source/source_ref", null, null, { expected: expectedSourceRef, observed: ir.source.source_ref });
  const expectedPredecessors = Array.isArray(context.predecessor_schema_ids) ? context.predecessor_schema_ids : [];
  if (!same(ir.bindings.predecessor_schema_ids, expectedPredecessors)) return fail("PREDECESSOR_ID_REWRITE", "LOWERING_TRACE.LINEAGE", "/bindings/predecessor_schema_ids", null, null, { expected: expectedPredecessors, observed: ir.bindings.predecessor_schema_ids });
  return { ok: true, value: ir };
}

export function checkOneIR(source: string, ast: TypedAST, ir: ONEIRProgram, context: LoweringContext): StageResult<ONEIRProgram> {
  const normalized = normalizeLoweringContext(context);
  if (!normalized.ok) return normalized;
  context = normalized.value;
  const checks = [
    () => typeCheck(ast, ir),
    () => relationCheck(ir, ast, context),
    () => authorityObligationCheck(ir, context),
    () => effectCheck(ir, context),
    () => lineageCheck(source, ast, ir, context)
  ];
  for (const check of checks) {
    const result = check();
    if (!result.ok) return result;
  }
  return { ok: true, value: ir };
}

export function diagnosticFrom(result: StageResult<unknown>): CompilerDiagnostic | null {
  return result.ok ? null : result.diagnostic;
}
