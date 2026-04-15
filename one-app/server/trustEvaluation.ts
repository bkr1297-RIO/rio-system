/**
 * trustEvaluation.ts — Phase 2E
 * 
 * Evaluates trust policies against proposal category + risk_tier.
 * Determines whether a proposal can be auto-approved via delegation
 * or must be surfaced for human approval.
 * 
 * Trust Levels:
 *   0 = Propose Only (human must approve all)
 *   1 = Safe Internal Actions (auto-approve LOW-risk internal, no external impact)
 *   2 = Bounded Autonomy (auto-approve LOW-risk external within policy limits)
 * 
 * Invariants:
 * - Delegated approvals ALWAYS generate a receipt referencing the trust policy
 * - Anomalies detected by Sentinel ALWAYS surface for human approval
 * - Trust evaluation NEVER bypasses the Gateway /authorize endpoint
 * - Changing a trust policy is itself a governed action
 */

import { findMatchingTrustPolicy, createSentinelEvent, getBaselinePattern } from "./db";
import { nanoid } from "nanoid";

// ─── Types ─────────────────────────────────────────────────────────

export interface TrustEvaluationInput {
  userId: number;
  category: string;
  riskTier: "LOW" | "MEDIUM" | "HIGH";
  proposalId: string;
  /** Is this an internal action (no external impact)? */
  isInternal: boolean;
  /** Current baseline pattern for contrast detection */
  baselinePattern?: {
    approval_rate_14d: number;
    avg_velocity_seconds: number;
    edit_rate: number;
  };
  /** Amount (for financial proposals with budget constraints) */
  amount?: number;
  /** Target (for outreach proposals with allowed_targets constraints) */
  target?: string;
}

export interface TrustEvaluationResult {
  /** Whether the proposal can be auto-approved */
  canAutoApprove: boolean;
  /** Reason for the decision */
  reason: string;
  /** The trust policy that was matched (if any) */
  policyId: string | null;
  /** Trust level applied */
  trustLevelApplied: number;
  /** Whether an anomaly was detected */
  anomalyDetected: boolean;
  /** Contrast flags (if any) */
  contrastFlags: string[];
  /** Sentinel event ID (if anomaly detected) */
  sentinelEventId: string | null;
}

// ─── Anomaly Detection ─────────────────────────────────────────────

interface AnomalyCheckResult {
  anomalyDetected: boolean;
  contrastFlags: string[];
  sentinelEventId: string | null;
}

/**
 * Check for anomalies by comparing current proposal against baseline patterns.
 * If variance exceeds thresholds, create a Sentinel event and flag for human review.
 */
async function checkForAnomalies(
  input: TrustEvaluationInput
): Promise<AnomalyCheckResult> {
  const baseline = input.baselinePattern ?? await getBaselinePattern(input.category);
  const contrastFlags: string[] = [];

  // Only check if we have meaningful baseline data
  if (baseline.approval_rate_14d === 0 && baseline.avg_velocity_seconds === 0) {
    return { anomalyDetected: false, contrastFlags: [], sentinelEventId: null };
  }

  // Check approval rate variance — if recent approval rate is very low, flag
  if (baseline.approval_rate_14d < 0.3 && baseline.approval_rate_14d > 0) {
    contrastFlags.push(`approval_rate_variance_${baseline.approval_rate_14d.toFixed(2)}`);
  }

  // Check edit rate — high edit rate suggests friction
  if (baseline.edit_rate > 0.5) {
    contrastFlags.push(`high_edit_rate_${baseline.edit_rate.toFixed(2)}`);
  }

  if (contrastFlags.length === 0) {
    return { anomalyDetected: false, contrastFlags: [], sentinelEventId: null };
  }

  // Create Sentinel event for the anomaly
  const eventId = `sentinel_${nanoid(16)}`;
  await createSentinelEvent({
    eventId,
    type: "contrast",
    severity: contrastFlags.length > 1 ? "WARN" : "INFO",
    subject: `Trust evaluation contrast for ${input.category}/${input.riskTier}`,
    baseline: baseline,
    observed: { proposalId: input.proposalId, category: input.category, riskTier: input.riskTier },
    delta: { contrastFlags },
    context: { userId: input.userId, isInternal: input.isInternal },
    proposalId: input.proposalId,
    acknowledged: false
  });

  return {
    anomalyDetected: true,
    contrastFlags,
    sentinelEventId: eventId
  };
}

// ─── Trust Policy Evaluation ───────────────────────────────────────

/**
 * Evaluate whether a proposal can be auto-approved based on trust policies.
 * 
 * Evaluation flow (per build packet spec):
 * 1. Check: Does policy exist for this category?
 * 2. Check: Does risk_tier match policy constraint?
 * 3. Check: Does trust_level permit delegation?
 * 4. Check: Are there anomalies? (Sentinel flags deviations)
 * 5. If all pass: AUTO-APPROVE on behalf of human
 * 6. If any fail: SURFACE for human approval
 */
export async function evaluateTrustPolicy(input: TrustEvaluationInput): Promise<TrustEvaluationResult> {
  // Step 1: Find matching trust policy
  const policy = await findMatchingTrustPolicy(input.userId, input.category, input.riskTier);

  if (!policy) {
    return {
      canAutoApprove: false,
      reason: "No trust policy found for this category and risk tier",
      policyId: null,
      trustLevelApplied: 0,
      anomalyDetected: false,
      contrastFlags: [],
      sentinelEventId: null
    };
  }

  // Step 2: Check trust level permits delegation
  if (policy.trustLevel === 0) {
    return {
      canAutoApprove: false,
      reason: "Trust level 0 (Propose Only) — human must approve all",
      policyId: policy.policyId,
      trustLevelApplied: 0,
      anomalyDetected: false,
      contrastFlags: [],
      sentinelEventId: null
    };
  }

  // Step 3: Check trust level vs internal/external
  if (policy.trustLevel === 1 && !input.isInternal) {
    return {
      canAutoApprove: false,
      reason: "Trust level 1 (Safe Internal) — external actions require human approval",
      policyId: policy.policyId,
      trustLevelApplied: 1,
      anomalyDetected: false,
      contrastFlags: [],
      sentinelEventId: null
    };
  }

  // Only LOW risk can be auto-approved
  if (input.riskTier !== "LOW") {
    return {
      canAutoApprove: false,
      reason: `Risk tier ${input.riskTier} requires human approval regardless of trust level`,
      policyId: policy.policyId,
      trustLevelApplied: policy.trustLevel,
      anomalyDetected: false,
      contrastFlags: [],
      sentinelEventId: null
    };
  }

  // Step 4: Check additional conditions
  if (policy.conditions) {
    const conditions = policy.conditions as Record<string, unknown>;
    
    // Check max amount constraint
    if (conditions.max_amount && input.amount && input.amount > (conditions.max_amount as number)) {
      return {
        canAutoApprove: false,
        reason: `Amount ${input.amount} exceeds policy max of ${conditions.max_amount}`,
        policyId: policy.policyId,
        trustLevelApplied: policy.trustLevel,
        anomalyDetected: false,
        contrastFlags: [],
        sentinelEventId: null
      };
    }

    // Check allowed targets constraint
    if (conditions.allowed_targets && input.target) {
      const allowed = conditions.allowed_targets as string[];
      if (!allowed.includes(input.target)) {
        return {
          canAutoApprove: false,
          reason: `Target "${input.target}" not in allowed targets list`,
          policyId: policy.policyId,
          trustLevelApplied: policy.trustLevel,
          anomalyDetected: false,
          contrastFlags: [],
          sentinelEventId: null
        };
      }
    }
  }

  // Step 5: Check for anomalies (Sentinel detection)
  const anomalyCheck = await checkForAnomalies(input);
  if (anomalyCheck.anomalyDetected) {
    return {
      canAutoApprove: false,
      reason: `Anomaly detected — surfacing for human review: ${anomalyCheck.contrastFlags.join(", ")}`,
      policyId: policy.policyId,
      trustLevelApplied: policy.trustLevel,
      anomalyDetected: true,
      contrastFlags: anomalyCheck.contrastFlags,
      sentinelEventId: anomalyCheck.sentinelEventId
    };
  }

  // All checks passed — can auto-approve
  return {
    canAutoApprove: true,
    reason: `Auto-approved via trust policy ${policy.policyId} (level ${policy.trustLevel})`,
    policyId: policy.policyId,
    trustLevelApplied: policy.trustLevel,
    anomalyDetected: false,
    contrastFlags: [],
    sentinelEventId: null
  };
}

/**
 * Build the delegated approval receipt structure per the build packet spec.
 */
export function buildDelegatedReceipt(
  evaluation: TrustEvaluationResult,
  baseline: { approval_rate_14d: number; avg_velocity_seconds: number; edit_rate: number }
) {
  return {
    decision_type: "delegated_auto_approve",
    policy_invoked: evaluation.policyId,
    trust_level_applied: evaluation.trustLevelApplied,
    contrast_flagged: evaluation.contrastFlags.length > 0
      ? evaluation.contrastFlags.join(", ")
      : null,
    baseline: {
      approval_rate_14d: baseline.approval_rate_14d,
      recent_velocity: baseline.avg_velocity_seconds
    },
    anomaly_detected: evaluation.anomalyDetected,
    timestamp: new Date().toISOString()
  };
}
