import { readFileSync } from "node:fs";
import { compilerIntegrity, digest, oneIrSeed, rawDigest } from "./hash.ts";
import { fieldByName, fieldValue } from "./parser.ts";
import type { Digest, FieldMapping, LoweringContext, ONEIRNode, ONEIRProgram, TypedAST } from "./types.ts";

export const FIELD_MAPPINGS: readonly FieldMapping[] = Object.freeze([
  { source_field: "SOURCE", ir_path: "/bindings/sourcepoint_ref", diamond_input_path: "/basis/source_ref" },
  { source_field: "BASIS", ir_path: "/bindings/basis_ref", diamond_input_path: "/basis/basis_id" },
  { source_field: "BASIS_REVISION", ir_path: "/bindings/basis_revision", diamond_input_path: "/basis_revision/revision" },
  { source_field: "BASIS_DIGEST", ir_path: "/bindings/basis_digest", diamond_input_path: "/basis_revision/digest" },
  { source_field: "AUTHORITY", ir_path: "/bindings/authority_ref", diamond_input_path: "/grant_specification/grant_id" },
  { source_field: "PROPOSAL", ir_path: "/bindings/proposal_ref", diamond_input_path: "/proposal/proposal_id" },
  { source_field: "CANDIDATE", ir_path: "/bindings/candidate_ref", diamond_input_path: "/proposal/candidate_ref" },
  { source_field: "SUBJECT", ir_path: "/bindings/subject_ref", diamond_input_path: "/proposal/subject_ref" },
  { source_field: "ACTION", ir_path: "/bindings/action", diamond_input_path: "/proposal/action" },
  { source_field: "OBJECT", ir_path: "/bindings/object_ref", diamond_input_path: "/proposal/object_ref" },
  { source_field: "PAYLOAD", ir_path: "/bindings/payload_digest", diamond_input_path: "/proposal/payload_digest" },
  { source_field: "DELTA", ir_path: "/bindings/intended_delta_digest", diamond_input_path: "/proposal/intended_delta_digest" },
  { source_field: "PURPOSE", ir_path: "/bindings/purpose", diamond_input_path: "/proposal/purpose" },
  { source_field: "SCOPE", ir_path: "/bindings/scope", diamond_input_path: "/proposal/scope" },
  { source_field: "JURISDICTION", ir_path: "/bindings/jurisdiction", diamond_input_path: "/proposal/jurisdiction" },
  { source_field: "CONTEXT", ir_path: "/bindings/context_ref", diamond_input_path: "/proposal/context_ref" },
  { source_field: "POLICY", ir_path: "/bindings/policy_ref", diamond_input_path: "/proposal/policy_ref" },
  { source_field: "POLICY_REVISION", ir_path: "/bindings/policy_revision", diamond_input_path: "/grant_specification/dependency_bindings/0/required_revision" },
  { source_field: "POLICY_DIGEST", ir_path: "/bindings/policy_digest", diamond_input_path: "/grant_specification/dependency_bindings/0/required_digest" },
  { source_field: "EVIDENCE_PLAN", ir_path: "/bindings/evidence_plan_ref", diamond_input_path: "/proposal/evidence_plan_ref" },
  { source_field: "EVIDENCE_OBLIGATIONS", ir_path: "/bindings/evidence_obligation_refs", diamond_input_path: "/proposal/evidence_obligation_refs" },
  { source_field: "RETURN_OBLIGATION", ir_path: "/bindings/return_obligation_ref", diamond_input_path: "/proposal/return_obligation_ref" },
  { source_field: "PROPOSER", ir_path: "/bindings/proposer_ref", diamond_input_path: "/proposal/proposed_by_ref" },
  { source_field: "EVALUATOR", ir_path: "/bindings/evaluator_ref", diamond_input_path: "/evaluator_ref" },
  { source_field: "EXECUTOR", ir_path: "/bindings/executor_ref", diamond_input_path: "/executor_ref" },
  { source_field: "WORLD_EFFECTS", ir_path: "/effect_signature/world_effects", diamond_input_path: "/grant_specification/effect_signature/world_effects" },
  { source_field: "CONSTITUTIONAL_EFFECTS", ir_path: "/effect_signature/constitutional_effects", diamond_input_path: "/grant_specification/effect_signature/constitutional_effects" },
  { source_field: "EPISTEMIC_EFFECTS", ir_path: "/effect_signature/epistemic_effects", diamond_input_path: "/grant_specification/effect_signature/epistemic_effects" },
  { source_field: "EXTERNAL_EFFECT", ir_path: "/effect_signature/external_effect_allowed", diamond_input_path: "/grant_specification/effect_signature/external_effect_allowed" },
  { source_field: "STANDING_EFFECT", ir_path: "/effect_signature/standing_change_allowed", diamond_input_path: "/grant_specification/effect_signature/standing_change_allowed" },
  { source_field: "MAX_CONSEQUENCE", ir_path: "/effect_signature/max_consequence", diamond_input_path: "/grant_specification/effect_signature/max_consequence" },
  { source_field: "CREATED_AT", ir_path: "/times/created_at", diamond_input_path: "/proposal/created_at" },
  { source_field: "EXPIRES_AT", ir_path: "/times/expires_at", diamond_input_path: "/proposal/expires_at" },
  { source_field: "AUTHORIZATION_AT", ir_path: "/times/authorization_at", diamond_input_path: "/authorization_at" },
  { source_field: "COMMITMENT_AT", ir_path: "/times/commitment_at", diamond_input_path: "/commitment_at" },
  { source_field: "POINT_OF_USE_AT", ir_path: "/times/point_of_use_at", diamond_input_path: "/point_of_use_at" },
  { source_field: "ATTEMPT_AT", ir_path: "/times/attempt_started_at", diamond_input_path: "/attempt_started_at" },
  { source_field: "PREDECESSORS", ir_path: "/bindings/predecessor_schema_ids", diamond_input_path: "/predecessor_schema_ids" },
  { source_field: "LOWER", ir_path: "/operation", diamond_input_path: "/" }
]);

export function fieldMappings(context: LoweringContext, policyRef: string): FieldMapping[] {
  const dependencies = Array.isArray(context?.grant_specification?.dependency_bindings)
    ? context.grant_specification.dependency_bindings
    : [];
  const index = dependencies.findIndex(
    (binding) => binding.dependency_kind === "POLICY" && binding.dependency_ref === policyRef
  );
  const policyIndex = index >= 0 ? index : 0;
  return FIELD_MAPPINGS.map((mapping) => {
    if (mapping.source_field === "POLICY_REVISION") return { ...mapping, diamond_input_path: `/grant_specification/dependency_bindings/${policyIndex}/required_revision` };
    if (mapping.source_field === "POLICY_DIGEST") return { ...mapping, diamond_input_path: `/grant_specification/dependency_bindings/${policyIndex}/required_digest` };
    return { ...mapping };
  });
}

function stringValue(ast: TypedAST, field: string): string {
  const value = fieldValue(ast, field);
  return typeof value === "string" ? value : "";
}

function booleanValue(ast: TypedAST, field: string): boolean {
  return fieldValue(ast, field) === true;
}

function listValue(ast: TypedAST, field: string): string[] {
  const value = fieldValue(ast, field);
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

export function contextDependencyLockDigest(context: LoweringContext): Digest {
  void context;
  return rawDigest(readFileSync(new URL("../DEPENDENCY_LOCK.json", import.meta.url)));
}

export function authorityRequestSeed(ir: Pick<ONEIRProgram, "bindings">): unknown {
  return {
    subject_ref: ir.bindings.subject_ref,
    action: ir.bindings.action,
    object_ref: ir.bindings.object_ref,
    payload_digest: ir.bindings.payload_digest,
    purpose: ir.bindings.purpose,
    scope: ir.bindings.scope,
    jurisdiction: ir.bindings.jurisdiction,
    context_ref: ir.bindings.context_ref
  };
}

function nodes(ast: TypedAST, values: Record<string, string>): ONEIRNode[] {
  const astRef = (field: string): string => fieldByName(ast, field)?.node_id ?? ast.ast_id;
  return [
    { node_id: "n01-proposal", ordinal: 1, operation: "INTAKE", output_type: "ProposalEnvelope", output_value_ref: values.proposal, input_node_refs: [], source_ast_ref: astRef("PROPOSAL"), time_binding: values.created },
    { node_id: "n02-conditions", ordinal: 2, operation: "CONDITIONS", output_type: "CrossingConditions", output_value_ref: `conditions-for:${values.proposal}`, input_node_refs: ["n01-proposal"], source_ast_ref: astRef("POLICY"), time_binding: values.created },
    { node_id: "n03-evaluation", ordinal: 3, operation: "EVALUATE", output_type: "EvaluationResult", output_value_ref: `evaluation-for:${values.proposal}`, input_node_refs: ["n01-proposal", "n02-conditions"], source_ast_ref: astRef("EVALUATOR"), time_binding: values.authorization },
    { node_id: "n04-root-authority", ordinal: 4, operation: "ROOT", output_type: "AuthorityGrant", output_value_ref: values.authority, input_node_refs: [], source_ast_ref: astRef("AUTHORITY"), time_binding: null },
    { node_id: "n05-preauth-current", ordinal: 5, operation: "CURRENT_AUTHORITY", output_type: "AuthorityLivenessSnapshot", output_value_ref: `current-preauth:${values.authority}`, input_node_refs: ["n04-root-authority"], source_ast_ref: astRef("AUTHORIZATION_AT"), time_binding: values.authorization },
    { node_id: "n06-authorization", ordinal: 6, operation: "AUTHORIZE", output_type: "Authorization", output_value_ref: `authorization-for:${values.proposal}`, input_node_refs: ["n01-proposal", "n03-evaluation", "n04-root-authority", "n05-preauth-current"], source_ast_ref: astRef("AUTHORIZATION_AT"), time_binding: values.authorization },
    { node_id: "n07-commitment", ordinal: 7, operation: "COMMIT", output_type: "Commitment", output_value_ref: `commitment-for:${values.proposal}`, input_node_refs: ["n01-proposal", "n03-evaluation", "n04-root-authority", "n06-authorization"], source_ast_ref: astRef("COMMITMENT_AT"), time_binding: values.commitment },
    { node_id: "n08-pou-current", ordinal: 8, operation: "CURRENT_AUTHORITY", output_type: "AuthorityLivenessSnapshot", output_value_ref: `current-point-of-use:${values.authority}`, input_node_refs: ["n04-root-authority", "n07-commitment"], source_ast_ref: astRef("POINT_OF_USE_AT"), time_binding: values.pointOfUse },
    { node_id: "n09-attempt-admission", ordinal: 9, operation: "ADMIT_ATTEMPT", output_type: "AttemptAdmission", output_value_ref: `attempt-admission-for:${values.proposal}`, input_node_refs: ["n06-authorization", "n07-commitment", "n08-pou-current"], source_ast_ref: astRef("POINT_OF_USE_AT"), time_binding: values.pointOfUse },
    { node_id: "n10-execution-attempt", ordinal: 10, operation: "INSTANTIATE_ATTEMPT", output_type: "ExecutionAttempt", output_value_ref: `execution-attempt-for:${values.proposal}`, input_node_refs: ["n09-attempt-admission"], source_ast_ref: astRef("ATTEMPT_AT"), time_binding: values.attempt }
  ];
}

export function emitOneIR(ast: TypedAST, context: LoweringContext): ONEIRProgram {
  const bindings: ONEIRProgram["bindings"] = {
    sourcepoint_ref: stringValue(ast, "SOURCE"),
    basis_ref: stringValue(ast, "BASIS"),
    basis_revision: stringValue(ast, "BASIS_REVISION"),
    basis_digest: stringValue(ast, "BASIS_DIGEST") as Digest,
    authority_ref: stringValue(ast, "AUTHORITY"),
    proposal_ref: stringValue(ast, "PROPOSAL"),
    candidate_ref: stringValue(ast, "CANDIDATE"),
    subject_ref: stringValue(ast, "SUBJECT"),
    action: stringValue(ast, "ACTION"),
    object_ref: stringValue(ast, "OBJECT"),
    payload_digest: stringValue(ast, "PAYLOAD") as Digest,
    intended_delta_digest: stringValue(ast, "DELTA") as Digest,
    purpose: stringValue(ast, "PURPOSE"),
    scope: listValue(ast, "SCOPE"),
    jurisdiction: stringValue(ast, "JURISDICTION"),
    context_ref: stringValue(ast, "CONTEXT"),
    policy_ref: stringValue(ast, "POLICY"),
    policy_revision: stringValue(ast, "POLICY_REVISION"),
    policy_digest: stringValue(ast, "POLICY_DIGEST") as Digest,
    evidence_plan_ref: stringValue(ast, "EVIDENCE_PLAN"),
    evidence_obligation_refs: listValue(ast, "EVIDENCE_OBLIGATIONS"),
    return_obligation_ref: stringValue(ast, "RETURN_OBLIGATION"),
    proposer_ref: stringValue(ast, "PROPOSER"),
    evaluator_ref: stringValue(ast, "EVALUATOR"),
    executor_ref: stringValue(ast, "EXECUTOR"),
    predecessor_schema_ids: listValue(ast, "PREDECESSORS")
  };
  const times: ONEIRProgram["times"] = {
    created_at: stringValue(ast, "CREATED_AT"),
    expires_at: stringValue(ast, "EXPIRES_AT"),
    authorization_at: stringValue(ast, "AUTHORIZATION_AT"),
    commitment_at: stringValue(ast, "COMMITMENT_AT"),
    point_of_use_at: stringValue(ast, "POINT_OF_USE_AT"),
    attempt_started_at: stringValue(ast, "ATTEMPT_AT")
  };
  const requestDigest = digest(authorityRequestSeed({ bindings }));
  const draft: ONEIRProgram = {
    schema_id: "urn:one:language:f0.1:ir:one-ir-program",
    schema_version: "0.1.0",
    language_profile: "F0.1",
    kind: "ONEIRProgram",
    ir_id: "",
    program_name: ast.program_name,
    operation: stringValue(ast, "LOWER"),
    source: { source_ref: ast.source_expression_ref, source_digest: ast.source_digest },
    bindings,
    nodes: nodes(ast, {
      proposal: bindings.proposal_ref,
      authority: bindings.authority_ref,
      created: times.created_at,
      authorization: times.authorization_at,
      commitment: times.commitment_at,
      pointOfUse: times.point_of_use_at,
      attempt: times.attempt_started_at
    }),
    authority_obligations: [
      { obligation: "ROOT_BASIS_REQUIRED", object_ref: bindings.basis_ref, evaluation_at: null, request_digest: null },
      { obligation: "AUTHORITY_DERIVATION_REQUIRED", object_ref: bindings.authority_ref, evaluation_at: null, request_digest: requestDigest },
      { obligation: "CURRENT_AUTHORITY_REQUIRED", object_ref: bindings.authority_ref, evaluation_at: times.authorization_at, request_digest: requestDigest },
      { obligation: "CURRENT_AUTHORITY_REQUIRED", object_ref: bindings.authority_ref, evaluation_at: times.point_of_use_at, request_digest: requestDigest }
    ],
    effect_signature: {
      schema_id: "urn:one:language:f0.1:common:effect-signature",
      schema_version: "0.1.0",
      language_profile: "F0.1",
      kind: "EffectSignature",
      world_effects: listValue(ast, "WORLD_EFFECTS"),
      constitutional_effects: listValue(ast, "CONSTITUTIONAL_EFFECTS"),
      epistemic_effects: listValue(ast, "EPISTEMIC_EFFECTS"),
      external_effect_allowed: booleanValue(ast, "EXTERNAL_EFFECT"),
      standing_change_allowed: booleanValue(ast, "STANDING_EFFECT"),
      max_consequence: stringValue(ast, "MAX_CONSEQUENCE")
    },
    times,
    field_mappings: fieldMappings(context, bindings.policy_ref),
    lowering_target: {
      profile: "DIAMOND_CROSSING_F0.1",
      binding_package: "one-authority-diamond-crossing-f0.1",
      entrypoint: "runDiamondCrossing|run_diamond_crossing",
      dependency_lock_digest: contextDependencyLockDigest(context)
    },
    lineage: {
      source_expression_ref: ast.source_expression_ref,
      source_digest: ast.source_digest,
      typed_ast_ref: ast.ast_id,
      typed_ast_digest: ast.ast_digest,
      compiler_profile: "ONE_COMPILER_F0.1"
    },
    authority_effect: "NONE",
    standing_effect: "NONE",
    integrity: compilerIntegrity(null)
  };
  draft.integrity = compilerIntegrity(oneIrSeed(draft));
  draft.ir_id = `one-ir:${draft.integrity.digest.slice(-16)}`;
  return draft;
}
