import { digest } from "./hash.ts";
import type { CompilerDiagnostic, CompilerPhase, SourceSpan, StageResult } from "./types.ts";

export const DIAGNOSTIC_MESSAGES: Readonly<Record<string, string>> = Object.freeze({
  PARSE_UNEXPECTED_TOKEN: "Required token or structural delimiter is absent or misplaced.",
  PARSE_DUPLICATE_FIELD: "A singleton source field occurs more than once.",
  PARSE_UNKNOWN_FIELD: "Source contains a field outside the F0.1 subset.",
  TYPE_MISSING_FIELD: "A required field is absent.",
  TYPE_INVALID_PROFILE: "Source profile is not F0.1.",
  TYPE_INVALID_REF: "A required reference or nonempty string binding is empty or malformed.",
  TYPE_INVALID_DIGEST: "Digest is not lowercase sha256: plus 64 hexadecimal digits.",
  TYPE_INVALID_TIMESTAMP: "Timestamp is not a valid explicit ISO-8601 instant in the common runtime domain.",
  TYPE_INVALID_BOOLEAN: "Boolean field is not true or false.",
  TYPE_INVALID_LIST: "List field is not a list of the declared element type.",
  TYPE_INVALID_CONSEQUENCE: "Consequence is outside the closed enum.",
  TYPE_CANONICAL_DOMAIN_INVALID: "Typed AST contains a value outside the compiler canonical JSON domain.",
  TYPE_AST_INVALID: "Supplied Typed AST does not have the closed F0.1 structural shape.",
  TYPE_TIME_ORDER: "Crossing times violate their required order.",
  TYPE_UNSUPPORTED_OPERATION: "LOWER does not identify DIAMOND_CROSSING.",
  IR_SCHEMA_INVALID: "ONE-IR violates its canonical schema.",
  RELATION_BROKEN_EDGE: "A required derivation edge is absent or substituted.",
  RELATION_STAGE_REORDERED: "Fixed graph ordinals were changed.",
  RELATION_FORBIDDEN_PROMOTION: "A node attempts a prohibited type promotion.",
  RELATION_BINDING_MISMATCH: "Related source, IR, or context fields disagree.",
  AUTHORITY_BASIS_UNRESOLVED: "Referenced root basis is absent from immutable context.",
  AUTHORITY_GRANT_UNRESOLVED: "Referenced grant specification is absent from immutable context.",
  AUTHORITY_OBLIGATION_MISSING: "Required authority or liveness obligation is absent.",
  BINDING_SUBSTITUTION: "Authority request field violates its grant binding relation.",
  CACHED_LIVENESS_FORBIDDEN: "Point-of-use liveness is bound to an earlier instant.",
  EFFECT_UNDECLARED: "Graph requests an effect absent from its declaration.",
  EFFECT_WIDENING: "Declared effect exceeds grant or basis ceiling.",
  IR_INTEGRITY_MISMATCH: "IR identity or complete integrity block differs from the compiler-generated seal.",
  SOURCE_DIGEST_MISMATCH: "IR source identity or digest differs from supplied source bytes.",
  AST_SOURCE_MISMATCH: "Typed AST is not the canonical parse of the supplied source bytes.",
  AST_DIGEST_MISMATCH: "IR typed-AST identity or digest differs from supplied AST.",
  PREDECESSOR_ID_REWRITE: "Required Golden Crossing predecessor lineage was rewritten or substituted.",
  LOWERING_TARGET_UNSUPPORTED: "Checked IR targets an unavailable lowering profile.",
  LOWERING_REFERENCE_UNRESOLVED: "A required context, evaluator, executor, policy, evidence, or return-obligation reference is unavailable.",
  LOWERING_BINDING_MISMATCH: "Field-mapping ledger or lowered input differs from checked IR.",
  LOWERING_CONTEXT_INVALID: "External lowering context is not a closed F0.1 context value.",
  DIAMOND_LOWERING_REJECTED: "Frozen Sprint C rejected the lowered input; nested code is preserved.",
  DEPENDENCY_LOCK_MISMATCH: "An immutable dependency or supplied lock assertion differs from the package lock."
});

export function diagnostic(
  code: string,
  phase: CompilerPhase,
  path = "",
  nodeId: string | null = null,
  span: SourceSpan | null = null,
  details: Record<string, unknown> = {}
): CompilerDiagnostic {
  const seed = {
    code,
    message: DIAGNOSTIC_MESSAGES[code] ?? "Compiler rejected the program.",
    phase,
    path,
    node_id: nodeId,
    span,
    details,
    authority_effect: "NONE" as const,
    standing_effect: "NONE" as const
  };
  return { ...seed, diagnostic_digest: digest(seed) };
}

export function fail<T>(
  code: string,
  phase: CompilerPhase,
  path = "",
  nodeId: string | null = null,
  span: SourceSpan | null = null,
  details: Record<string, unknown> = {}
): StageResult<T> {
  return { ok: false, diagnostic: diagnostic(code, phase, path, nodeId, span, details) };
}
