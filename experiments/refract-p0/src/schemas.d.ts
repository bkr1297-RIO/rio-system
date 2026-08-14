export type ViewType = "structural" | "temporal" | "relational";
export type EpistemicStatus = "OBSERVATION" | "CANDIDATE" | "UNRESOLVED";
export type EvidenceKind =
  | "SOURCE_PATH"
  | "SOURCE_VALUE"
  | "DERIVED_MEASURE";

export interface Source<T = unknown> {
  source_id: string;
  object_type: string;
  source_type: "json" | "markdown";
  payload: T;
  source_hash: string;
  created_at: string;
  provenance: {
    origin?: string;
    repository?: string;
    ref?: string;
    source_path?: string;
    source_blob_sha?: string;
    raw_sha256?: string;
    immutable: true;
  };
}

export interface Evidence {
  evidence_id: string;
  kind: EvidenceKind;
  source_id: string;
  source_hash: string;
  path?: string;
  line?: number;
  observed_value?: unknown;
  note?: string;
}

export interface Delta {
  delta_id: string;
  dimension: string;
  before?: unknown;
  after?: unknown;
  interpretation: "REPRESENTATIONAL_ONLY" | "DERIVED";
  evidence_refs: string[];
}

export interface UnresolvedDifference {
  unresolved_id: string;
  dimension: string;
  description: string;
  reason:
    | "INSUFFICIENT_EVIDENCE"
    | "CONTRACT_PROHIBITS_INFERENCE"
    | "CONFLICTING_OBSERVATIONS"
    | "REQUIRES_AUTHORIZED_RESOLVER"
    | "OUT_OF_SCOPE";
  evidence_refs: string[];
}

export interface View {
  view_id: string;
  contract_id: string;
  view_type: ViewType;
  source_id: string;
  source_hash: string;
  source_provenance: Source["provenance"];
  epistemic_status: EpistemicStatus;
  claims: Array<{
    claim_id: string;
    dimension: string;
    value: unknown;
    standing: "OBSERVED" | "DERIVED";
    evidence_refs: string[];
  }>;
  deltas: Delta[];
  unresolved_differences: UnresolvedDifference[];
  evidence: Evidence[];
  generated_at: string;
}

export interface ObservationalContract {
  contract_id: string;
  view_type: ViewType;
  observable_dimensions: string[];
  must_preserve: string[];
  may_change: string[];
  must_not_infer: string[];
}
