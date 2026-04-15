/**
 * Kernel Evaluator — Builder Contract v1
 *
 * The Kernel is the decision suggestion engine. It reads from mailboxes,
 * evaluates policy + trust + anomalies, and produces a kernel_decision_object.
 *
 * INVARIANTS:
 * 1. Kernel NEVER executes — only proposes decisions
 * 2. Kernel reads proposal_mailbox for pending proposals
 * 3. Kernel queries Ledger for baseline patterns (past 14 days)
 * 4. Kernel reads Policy Mailbox for current trust rules
 * 5. Kernel queries Sentinel Mailbox for active anomalies
 * 6. Kernel writes kernel_decision_object to decision_mailbox
 *
 * Decision outcomes:
 * - AUTO_APPROVE: policy + trust allow automatic execution
 * - REQUIRE_HUMAN: human must sign before Gateway executes
 * - DENY: policy explicitly blocks this action
 */

import {
  type KernelDecision,
  type KernelDecisionPayload,
  type MailboxEntry,
  SENTINEL_THRESHOLDS,
} from "../drizzle/schema";
import {
  appendToMailbox,
  readMailbox,
  getByTraceId,
  generatePacketId,
  type AppendToMailboxInput,
} from "./mailbox";
import { nanoid } from "nanoid";

// ─────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────

export interface ProposalPayload {
  id: string;
  type: string;
  category: string;
  risk_tier: "LOW" | "MEDIUM" | "HIGH";
  baseline_pattern?: {
    approval_rate_14d: number;
    avg_velocity_seconds: number;
    edit_rate: number;
  };
  proposal: Record<string, unknown>;
  why_it_matters: string;
  reasoning: string;
  timestamp: string;
}

export interface TrustPolicyRecord {
  category: string;
  riskTier: "LOW" | "MEDIUM" | "HIGH";
  trustLevel: number; // 0 = propose only, 1 = safe internal, 2 = bounded autonomy
  conditions?: {
    max_amount?: number;
    allowed_targets?: string[];
    time_window?: string;
    max_daily_count?: number;
  };
  active: boolean;
}

export interface SentinelAnomalyRecord {
  severity: "INFO" | "WARN" | "CRITICAL";
  metric_type: string;
  baseline: number;
  observed: number;
  delta: number;
  confidence: number;
}

export interface BaselinePattern {
  approval_rate_14d: number;
  recent_velocity_seconds: number;
  edit_rate: number;
}

export interface KernelEvaluationContext {
  /** The proposal being evaluated */
  proposal: ProposalPayload;
  /** Matching trust policy (if any) */
  trustPolicy: TrustPolicyRecord | null;
  /** Active anomalies from sentinel mailbox */
  activeAnomalies: SentinelAnomalyRecord[];
  /** Baseline pattern from ledger (past 14 days) */
  baseline: BaselinePattern | null;
  /** Current observed state for variance calculation */
  observedState?: {
    approval_rate_delta: number;
    velocity_delta_seconds: number;
    edit_rate_delta: number;
  };
}

// ─────────────────────────────────────────────────────────────────
// Kernel Decision Logic
// ─────────────────────────────────────────────────────────────────

/**
 * Evaluate a proposal and produce a kernel_decision_object.
 *
 * Decision flow (from Builder Contract pseudocode):
 * 1. Check if policy exists for this category + risk_tier
 * 2. Check trust level for this category
 * 3. Check for active anomalies
 * 4. Calculate variance from baseline
 * 5. Produce proposed_decision with full reasoning
 *
 * @param context - All the data the kernel needs to make a decision
 * @returns KernelDecisionPayload ready to be written to decision_mailbox
 */
export function evaluateProposal(context: KernelEvaluationContext): KernelDecisionPayload {
  const { proposal, trustPolicy, activeAnomalies, baseline, observedState } = context;
  const decisionId = `decision_${nanoid(16)}`;
  const timestamp = new Date().toISOString();

  // Step 1: Policy check
  const policyMatch = trustPolicy !== null && trustPolicy.active;
  const policyName = policyMatch
    ? `${trustPolicy!.category}_${trustPolicy!.riskTier.toLowerCase()}_trust${trustPolicy!.trustLevel}`
    : null;

  // Step 2: Trust level check
  const trustLevelApplied = trustPolicy?.trustLevel ?? 0;
  const trustLevelOk = trustLevelApplied >= 0; // Always true if policy exists

  // Step 3: Anomaly check
  const hasCriticalAnomaly = activeAnomalies.some(a => a.severity === "CRITICAL");
  const hasWarnAnomaly = activeAnomalies.some(a => a.severity === "WARN");
  const anomalyFlag = hasCriticalAnomaly || hasWarnAnomaly;
  const anomalyType = hasCriticalAnomaly
    ? "critical"
    : hasWarnAnomaly
    ? "contrast"
    : undefined;

  // Step 4: Constraints check
  const constraintsOk = checkConstraints(proposal, trustPolicy);

  // Step 5: Calculate confidence based on anomaly severity
  let confidence = 1.0;
  if (hasCriticalAnomaly) confidence = 0.99;
  else if (hasWarnAnomaly) confidence = 0.95;
  else if (activeAnomalies.length > 0) confidence = 0.90;

  // Step 6: Determine proposed decision
  const proposedDecision = determineDecision({
    riskTier: proposal.risk_tier,
    trustLevel: trustLevelApplied,
    policyMatch,
    constraintsOk,
    hasCriticalAnomaly,
    hasWarnAnomaly,
  });

  // Build the kernel decision object
  const kernelDecision: KernelDecisionPayload = {
    decision_id: decisionId,
    packet_id: proposal.id,
    proposed_decision: proposedDecision,
    reasoning: {
      policy_match: policyMatch,
      policy_name: policyName,
      trust_level_ok: trustLevelOk,
      trust_level_applied: trustLevelApplied,
      constraints_ok: constraintsOk,
      anomaly_flag: anomalyFlag,
      anomaly_type: anomalyType,
    },
    baseline_pattern: baseline
      ? {
          approval_rate_14d: baseline.approval_rate_14d,
          recent_velocity_seconds: baseline.recent_velocity_seconds,
          edit_rate: baseline.edit_rate,
        }
      : null,
    observed_state: observedState ?? null,
    confidence,
    timestamp,
    trace_id: proposal.id, // Will be overridden by caller with actual trace_id
  };

  return kernelDecision;
}

/**
 * Determine the proposed decision based on all evaluation factors.
 *
 * Decision matrix (from Builder Contract):
 * - DENY: critical anomaly detected, or policy explicitly blocks
 * - REQUIRE_HUMAN: no policy match, or MEDIUM/HIGH risk, or trust=0, or WARN anomaly
 * - AUTO_APPROVE: LOW risk + trust >= 1 + policy match + no anomalies + constraints ok
 */
function determineDecision(factors: {
  riskTier: "LOW" | "MEDIUM" | "HIGH";
  trustLevel: number;
  policyMatch: boolean;
  constraintsOk: boolean;
  hasCriticalAnomaly: boolean;
  hasWarnAnomaly: boolean;
}): KernelDecision {
  const { riskTier, trustLevel, policyMatch, constraintsOk, hasCriticalAnomaly, hasWarnAnomaly } = factors;

  // Rule 1: Critical anomaly → DENY
  if (hasCriticalAnomaly) {
    return "DENY";
  }

  // Rule 2: HIGH risk → always REQUIRE_HUMAN (no auto-approve for HIGH)
  if (riskTier === "HIGH") {
    return "REQUIRE_HUMAN";
  }

  // Rule 3: No policy match → REQUIRE_HUMAN (default safe)
  if (!policyMatch) {
    return "REQUIRE_HUMAN";
  }

  // Rule 4: Constraints violated → REQUIRE_HUMAN
  if (!constraintsOk) {
    return "REQUIRE_HUMAN";
  }

  // Rule 5: WARN anomaly → REQUIRE_HUMAN (surface to human)
  if (hasWarnAnomaly) {
    return "REQUIRE_HUMAN";
  }

  // Rule 6: Trust level 0 → always REQUIRE_HUMAN
  if (trustLevel === 0) {
    return "REQUIRE_HUMAN";
  }

  // Rule 7: MEDIUM risk + trust level 1 → REQUIRE_HUMAN (trust=1 only covers LOW internal)
  if (riskTier === "MEDIUM" && trustLevel < 2) {
    return "REQUIRE_HUMAN";
  }

  // Rule 8: LOW risk + trust >= 1 + policy match + no anomalies → AUTO_APPROVE
  if (riskTier === "LOW" && trustLevel >= 1) {
    return "AUTO_APPROVE";
  }

  // Rule 9: MEDIUM risk + trust >= 2 + policy match + no anomalies → AUTO_APPROVE
  if (riskTier === "MEDIUM" && trustLevel >= 2) {
    return "AUTO_APPROVE";
  }

  // Default: REQUIRE_HUMAN (fail-safe)
  return "REQUIRE_HUMAN";
}

/**
 * Check if the proposal satisfies the trust policy constraints.
 */
function checkConstraints(
  proposal: ProposalPayload,
  policy: TrustPolicyRecord | null
): boolean {
  if (!policy || !policy.conditions) return true;

  const conditions = policy.conditions;

  // Check max_amount for financial proposals
  if (conditions.max_amount !== undefined) {
    const amount = (proposal.proposal as any)?.amount;
    if (amount !== undefined && amount > conditions.max_amount) {
      return false;
    }
  }

  // Check allowed_targets for outreach proposals
  if (conditions.allowed_targets && conditions.allowed_targets.length > 0) {
    const target = (proposal.proposal as any)?.target || (proposal.proposal as any)?.recipient;
    if (target && !conditions.allowed_targets.some(t => target.includes(t))) {
      return false;
    }
  }

  return true;
}

// ─────────────────────────────────────────────────────────────────
// Mailbox Integration
// ─────────────────────────────────────────────────────────────────

/**
 * Process a proposal from the proposal mailbox:
 * 1. Read the proposal payload
 * 2. Gather context (trust policy, anomalies, baseline)
 * 3. Evaluate and produce kernel_decision_object
 * 4. Write to decision_mailbox
 *
 * @param proposalEntry - The mailbox entry containing the proposal
 * @param trustPolicy - The matching trust policy (looked up by caller)
 * @param activeAnomalies - Active sentinel anomalies (looked up by caller)
 * @param baseline - Baseline pattern from ledger (looked up by caller)
 * @returns The kernel decision mailbox entry
 */
export async function processProposalFromMailbox(
  proposalEntry: MailboxEntry,
  trustPolicy: TrustPolicyRecord | null,
  activeAnomalies: SentinelAnomalyRecord[],
  baseline: BaselinePattern | null
): Promise<{ decision: KernelDecisionPayload; mailboxEntry: MailboxEntry }> {
  const proposalPayload = proposalEntry.payload as unknown as ProposalPayload;

  // Build evaluation context
  const context: KernelEvaluationContext = {
    proposal: proposalPayload,
    trustPolicy,
    activeAnomalies,
    baseline,
  };

  // Evaluate
  const decision = evaluateProposal(context);

  // Override trace_id with the actual trace from the proposal
  decision.trace_id = proposalEntry.traceId;

  // Write kernel_decision_object to decision_mailbox
  const mailboxEntry = await appendToMailbox({
    mailboxType: "decision",
    packetType: "kernel_decision_object",
    sourceAgent: "kernel",
    targetAgent: "gateway",
    status: "pending",
    payload: decision as unknown as Record<string, unknown>,
    traceId: proposalEntry.traceId,
    parentPacketId: proposalEntry.packetId,
  });

  // Also transition the proposal entry to "processed"
  await appendToMailbox({
    mailboxType: "proposal",
    packetType: "proposal_packet_processed",
    sourceAgent: "kernel",
    status: "processed",
    payload: {
      ...proposalEntry.payload as Record<string, unknown>,
      _kernel_decision_id: decision.decision_id,
    },
    traceId: proposalEntry.traceId,
    parentPacketId: proposalEntry.packetId,
  });

  return { decision, mailboxEntry };
}

// ─────────────────────────────────────────────────────────────────
// Variance Calculation (for Sentinel integration)
// ─────────────────────────────────────────────────────────────────

/**
 * Calculate variance between baseline and observed values.
 * Used by both Kernel (for decision confidence) and Sentinel (for anomaly detection).
 */
export function calculateVariance(
  baseline: number,
  observed: number
): { delta: number; ratio: number; severity: "INFO" | "WARN" | "CRITICAL" | null } {
  if (baseline === 0) {
    return { delta: observed, ratio: observed === 0 ? 0 : Infinity, severity: null };
  }

  const delta = Math.abs(observed - baseline);
  const ratio = delta / baseline;

  // Determine severity using the velocity_variance thresholds as default
  let severity: "INFO" | "WARN" | "CRITICAL" | null = null;
  if (ratio >= SENTINEL_THRESHOLDS.velocity_variance.CRITICAL) {
    severity = "CRITICAL";
  } else if (ratio >= SENTINEL_THRESHOLDS.velocity_variance.WARN) {
    severity = "WARN";
  } else if (ratio >= SENTINEL_THRESHOLDS.velocity_variance.INFO) {
    severity = "INFO";
  }

  return { delta, ratio, severity };
}

/**
 * Calculate variance for a specific metric type using its own thresholds.
 */
export function calculateMetricVariance(
  metricType: keyof typeof SENTINEL_THRESHOLDS,
  baseline: number,
  observed: number
): { delta: number; ratio: number; severity: "INFO" | "WARN" | "CRITICAL" | null } {
  if (baseline === 0) {
    return { delta: observed, ratio: observed === 0 ? 0 : Infinity, severity: null };
  }

  const delta = Math.abs(observed - baseline);
  const ratio = delta / baseline;
  const thresholds = SENTINEL_THRESHOLDS[metricType];

  let severity: "INFO" | "WARN" | "CRITICAL" | null = null;
  if (ratio >= thresholds.CRITICAL) {
    severity = "CRITICAL";
  } else if (ratio >= thresholds.WARN) {
    severity = "WARN";
  } else if (ratio >= thresholds.INFO) {
    severity = "INFO";
  }

  return { delta, ratio, severity };
}
