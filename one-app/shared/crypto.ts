// Shared types for the HITL crypto operations
export interface BlastRadius {
  score: number;
  affectedSystems: string[];
  reversible: boolean;
}

export interface PreflightCheck {
  check: string;
  status: "PASS" | "FAIL";
  detail: string;
}

export type RiskTier = "LOW" | "MEDIUM" | "HIGH";
export type ProxyStatus = "ACTIVE" | "KILLED" | "SUSPENDED";
export type IntentStatus = "PENDING_APPROVAL" | "APPROVED" | "REJECTED" | "EXECUTED" | "FAILED" | "KILLED";
export type ApprovalDecision = "APPROVED" | "REJECTED";
