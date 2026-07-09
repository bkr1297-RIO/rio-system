export interface IntentPayload {
  raw_signal: string;
  governance_status: string;
  drafting_authorized: boolean;
}

export interface Space16Grid {
  absence_flag_active: boolean;
}

export interface ValidationResult {
  is_valid: boolean;
  reason: string;
}

export interface SignatureBlock {
  method: string;
  value: string;
  signed_at: string;
  verification_status: string;
}

export interface ContentHash {
  algorithm: string;
  value: string;
}

export interface GovernedPacket {
  trace_id: string;
  content_hash: ContentHash;
  target_commit_hash: string;
  signature_block: SignatureBlock;
  grid: Space16Grid;
}

export interface SentinelTraceReceipt {
  trace_id: string;
  batch: string;
  status: string;
  timestamp: string;
}

export interface SourcePointAuthority {
  authority_id: string;
}

export interface MUSLedgerReceipt {
  trace_id: string;
  signature_block: SignatureBlock;
  content_hash: ContentHash;
  source_point_authority?: SourcePointAuthority;
}
