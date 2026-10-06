import type {
  DiamondCrossingInput,
  DiamondCrossingRun,
  Diagnostic as SprintCDiagnostic,
  GrantSpecification,
  BasisRevision,
  DependencyObservation,
  RevocationEvent,
  RootAuthorityBasis
} from "../../one-authority-diamond-crossing-f0.1/src/types.ts";

export type Digest = `sha256:${string}`;
export type CompilerPhase =
  | "PARSE"
  | "TYPE_CHECK"
  | "RELATION_CHECK"
  | "AUTHORITY_OBLIGATION_CHECK"
  | "EFFECT_CHECK"
  | "LOWERING_TRACE.LINEAGE"
  | "LOWERING_TRACE.BIND"
  | "DEPENDENCY_LOCK";

export interface SourceSpan {
  start_byte: number;
  end_byte: number;
}

export type TypedValue = string | boolean | Array<string | boolean>;

export interface TypedField {
  kind: "TypedField";
  node_id: string;
  field: string;
  semantic_type: string;
  value: TypedValue;
  source_span: SourceSpan;
}

export interface TypedAST {
  kind: "ProgramAST";
  profile: string;
  ast_id: string;
  program_name: string;
  source_expression_ref: string;
  source_digest: Digest;
  fields: TypedField[];
  ast_digest: Digest;
  authority_effect: "NONE";
  standing_effect: "NONE";
}

export interface CompilerDiagnostic {
  code: string;
  message: string;
  phase: CompilerPhase;
  path: string;
  node_id: string | null;
  span: SourceSpan | null;
  details: Record<string, unknown>;
  authority_effect: "NONE";
  standing_effect: "NONE";
  diagnostic_digest: Digest;
}

export type StageResult<T> =
  | { ok: true; value: T }
  | { ok: false; diagnostic: CompilerDiagnostic };

export interface CompilerIntegrityBlock {
  schema_id: "urn:one:language:f0.1:common:integrity-block";
  schema_version: "0.1.0";
  language_profile: "F0.1";
  kind: "IntegrityBlock";
  algorithm: "sha256";
  digest: Digest;
  canonicalization: "ONE compiler UTF-16-key safe-integer JSON v0.1.0";
  signed: false;
  signature_ref: null;
}

export type IROperation =
  | "INTAKE"
  | "CONDITIONS"
  | "EVALUATE"
  | "ROOT"
  | "CURRENT_AUTHORITY"
  | "AUTHORIZE"
  | "COMMIT"
  | "ADMIT_ATTEMPT"
  | "INSTANTIATE_ATTEMPT";

export interface ONEIRNode {
  node_id: string;
  ordinal: number;
  operation: IROperation | string;
  output_type: string;
  output_value_ref: string;
  input_node_refs: string[];
  source_ast_ref: string;
  time_binding: string | null;
}

export interface AuthorityObligation {
  obligation: "ROOT_BASIS_REQUIRED" | "AUTHORITY_DERIVATION_REQUIRED" | "CURRENT_AUTHORITY_REQUIRED" | string;
  object_ref: string;
  evaluation_at: string | null;
  request_digest: Digest | null;
}

export interface FieldMapping {
  source_field: string;
  ir_path: string;
  diamond_input_path: string;
}

export interface LoweringFieldLineage {
  source_field: string;
  source_span: SourceSpan;
  ast_node_ref: string;
  ir_pointer: string;
  diamond_input_pointer: string;
  diamond_object_ref: string | null;
  derivation_receipt_ref: string | null;
  transform_kind: "IDENTITY" | "DETERMINISTIC_ID" | "RESOLVED_EXTERNAL" | "CONSTRUCTED_CANONICAL" | "AUTHORITY_CEILING_CHECKED";
  losses: string[];
}

export interface SuccessfulCheck {
  phase: "TYPE_CHECK" | "RELATION_CHECK" | "AUTHORITY_OBLIGATION_CHECK" | "EFFECT_CHECK";
  passed: true;
  authority_effect: "NONE";
  standing_effect: "NONE";
}

export interface ONEIRProgram {
  schema_id: "urn:one:language:f0.1:ir:one-ir-program";
  schema_version: "0.1.0";
  language_profile: "F0.1";
  kind: "ONEIRProgram";
  ir_id: string;
  program_name: string;
  operation: "DIAMOND_CROSSING" | string;
  source: { source_ref: string; source_digest: Digest };
  bindings: {
    sourcepoint_ref: string;
    basis_ref: string;
    basis_revision: string;
    basis_digest: Digest;
    authority_ref: string;
    proposal_ref: string;
    candidate_ref: string;
    subject_ref: string;
    action: string;
    object_ref: string;
    payload_digest: Digest;
    intended_delta_digest: Digest;
    purpose: string;
    scope: string[];
    jurisdiction: string;
    context_ref: string;
    policy_ref: string;
    policy_revision: string;
    policy_digest: Digest;
    evidence_plan_ref: string;
    evidence_obligation_refs: string[];
    return_obligation_ref: string;
    proposer_ref: string;
    evaluator_ref: string;
    executor_ref: string;
    predecessor_schema_ids: string[];
  };
  nodes: ONEIRNode[];
  authority_obligations: AuthorityObligation[];
  effect_signature: {
    schema_id: "urn:one:language:f0.1:common:effect-signature";
    schema_version: "0.1.0";
    language_profile: "F0.1";
    kind: "EffectSignature";
    world_effects: string[];
    constitutional_effects: string[];
    epistemic_effects: string[];
    external_effect_allowed: boolean;
    standing_change_allowed: boolean;
    max_consequence: "NONE" | "LOW" | "MEDIUM" | "HIGH" | "CRITICAL" | string;
  };
  times: {
    created_at: string;
    expires_at: string;
    authorization_at: string;
    commitment_at: string;
    point_of_use_at: string;
    attempt_started_at: string;
  };
  field_mappings: FieldMapping[];
  lowering_target: {
    profile: "DIAMOND_CROSSING_F0.1" | string;
    binding_package: "one-authority-diamond-crossing-f0.1" | string;
    entrypoint: "runDiamondCrossing|run_diamond_crossing" | string;
    dependency_lock_digest: Digest;
  };
  lineage: {
    source_expression_ref: string;
    source_digest: Digest;
    typed_ast_ref: string;
    typed_ast_digest: Digest;
    compiler_profile: "ONE_COMPILER_F0.1";
  };
  authority_effect: "NONE";
  standing_effect: "NONE";
  integrity: CompilerIntegrityBlock;
}

export type LoweringReferenceCollection = string | LoweringReferenceCollection[] | { [group: string]: LoweringReferenceCollection };

export interface LoweringRouting {
  authenticated_source_ref: string;
  available_refs: LoweringReferenceCollection;
}

export interface LoweringContext {
  context_id?: string;
  basis: RootAuthorityBasis;
  basis_revision: BasisRevision;
  grant_specification: GrantSpecification;
  dependency_observations: DependencyObservation[];
  revocations: RevocationEvent[];
  use_counts: Record<string, number>;
  routing: LoweringRouting;
  times: {
    authority_evaluation: string;
    authorization: string;
    commitment: string;
    point_of_use: string;
    attempt_started: string;
  };
  predecessor_schema_ids: string[];
  provenance?: Record<string, unknown>;
  dependency_lock_digest?: Digest;
}

export interface DiamondObjectRefs {
  conditions: string;
  evaluation: string;
  grant: string;
  authorization: string;
  commitment: string;
  current_authority: string;
  admission: string;
  attempt: string;
}

export interface LoweringTrace {
  schema_id: "urn:one:language:f0.1:compiler:lowering-trace";
  schema_version: "0.1.0";
  language_profile: "F0.1";
  kind: "LoweringTrace";
  trace_id: string;
  compiler_profile: "ONE_COMPILER_F0.1";
  source: { expression_ref: string; digest: Digest };
  typed_ast: { ast_ref: string; digest: Digest };
  one_ir: { ir_ref: string; digest: Digest };
  diamond_input: { input_ref: string; digest: Digest };
  diamond_trace: { trace_ref: string; digest: Digest };
  diamond_object_refs: DiamondObjectRefs;
  field_mappings: LoweringFieldLineage[];
  checks: SuccessfulCheck[];
  diagnostics: CompilerDiagnostic[];
  authority_effect: "NONE";
  standing_effect: "NONE";
  integrity: CompilerIntegrityBlock;
}

export interface CompilationSuccess {
  source_digest: Digest;
  ast: TypedAST;
  ir: ONEIRProgram;
  diamond_input: DiamondCrossingInput;
  diamond_run: DiamondCrossingRun;
  lowering_trace: LoweringTrace;
}

export type CompilationResult =
  | { ok: true; value: CompilationSuccess }
  | { ok: false; diagnostic: CompilerDiagnostic; ast?: TypedAST; ir?: ONEIRProgram; sprint_c_diagnostic?: SprintCDiagnostic };
