/**
 * Learning Engine — Minimum Viable Learning Loop
 * 
 * CONSTRAINTS (hard rules):
 * - Learning is ADVISORY ONLY
 * - DOES NOT bypass approval
 * - DOES NOT auto-execute based on learning
 * - DOES NOT change routing logic
 * 
 * PURPOSE:
 * Reduce unnecessary pauses over time while keeping full governance intact.
 * Tracks approval/rejection patterns per action signature and provides
 * an advisory risk score that can inform (but never override) governance.
 */

import { createHash } from "crypto";
import { insertLearningEvent, getLearningStats } from "./db";

// ─── Action Signature ────────────────────────────────────────────
// A hash of action_type + target that groups similar actions together.
// e.g., "send_email:jordanrasmussen12@gmail.com" → SHA-256 hash

export function computeActionSignature(actionType: string, target: string): string {
  const input = `${actionType}:${target}`.toLowerCase().trim();
  return createHash("sha256").update(input).digest("hex").slice(0, 32);
}

// ─── Record Decision ─────────────────────────────────────────────
// Called after every approval/decline to store the learning event.

export async function recordDecision(params: {
  actionType: string;
  target: string;
  decision: "APPROVED" | "REJECTED" | "BLOCKED";
  intentId?: string;
  userId?: number;
  context?: Record<string, unknown>;
}): Promise<{ eventId: string; actionSignature: string; advisoryRiskScore: number }> {
  const actionSignature = computeActionSignature(params.actionType, params.target);
  
  // Get current advisory risk score BEFORE recording (so we store the score at decision time)
  const currentRisk = await getAdvisoryRiskScore(actionSignature);
  
  const eventId = await insertLearningEvent({
    actionSignature,
    riskScore: currentRisk,
    decision: params.decision,
    eventType: params.decision === "APPROVED" ? "APPROVAL" : "REJECTION",
    intentId: params.intentId,
    userId: params.userId,
    context: params.context,
  });

  // Compute the NEW advisory risk score after this decision
  const newRisk = await getAdvisoryRiskScore(actionSignature);

  console.log(
    `[Learning] Recorded ${params.decision} for ${params.actionType}:${params.target} ` +
    `(sig=${actionSignature.slice(0, 8)}..., risk=${currentRisk}→${newRisk}, eventId=${eventId})`
  );

  return { eventId, actionSignature, advisoryRiskScore: newRisk };
}

// ─── Advisory Risk Score ─────────────────────────────────────────
// Computes a risk score (0-100) based on historical decisions.
// 
// Algorithm:
// - Start at 50 (neutral)
// - Each APPROVED event lowers risk by 3 (min 10)
// - Each REJECTED event raises risk by 5 (max 90)
// - Each BLOCKED event raises risk by 10 (max 90)
// - Score is clamped to [10, 90] — never fully trusted, never fully blocked
//
// This is ADVISORY ONLY. The governance engine uses this as a signal,
// but NEVER auto-approves or auto-rejects based on it.

const BASE_RISK = 50;
const APPROVAL_ADJUSTMENT = -3;   // Each approval lowers risk slightly
const REJECTION_ADJUSTMENT = 5;   // Each rejection raises risk more
const BLOCKED_ADJUSTMENT = 10;    // Each block raises risk significantly
const MIN_RISK = 10;              // Never fully trusted
const MAX_RISK = 90;              // Never fully blocked (human always decides)

export async function getAdvisoryRiskScore(actionSignature: string): Promise<number> {
  const stats = await getLearningStats(actionSignature);
  
  if (stats.totalEvents === 0) {
    return BASE_RISK; // No history — neutral risk
  }

  let score = BASE_RISK;
  score += stats.approvedCount * APPROVAL_ADJUSTMENT;
  score += stats.rejectedCount * REJECTION_ADJUSTMENT;
  score += stats.blockedCount * BLOCKED_ADJUSTMENT;

  // Clamp to [MIN_RISK, MAX_RISK]
  return Math.max(MIN_RISK, Math.min(MAX_RISK, Math.round(score)));
}

// ─── Get Learning Summary ────────────────────────────────────────
// Returns a human-readable summary for a given action signature.

export async function getLearningSummary(actionType: string, target: string): Promise<{
  actionSignature: string;
  advisoryRiskScore: number;
  totalEvents: number;
  approvedCount: number;
  rejectedCount: number;
  blockedCount: number;
  trend: "TRUSTED" | "NEUTRAL" | "RISKY";
}> {
  const actionSignature = computeActionSignature(actionType, target);
  const stats = await getLearningStats(actionSignature);
  const advisoryRiskScore = await getAdvisoryRiskScore(actionSignature);

  let trend: "TRUSTED" | "NEUTRAL" | "RISKY" = "NEUTRAL";
  if (advisoryRiskScore < 35) trend = "TRUSTED";
  else if (advisoryRiskScore > 65) trend = "RISKY";

  return {
    actionSignature,
    advisoryRiskScore,
    totalEvents: stats.totalEvents,
    approvedCount: stats.approvedCount,
    rejectedCount: stats.rejectedCount,
    blockedCount: stats.blockedCount,
    trend,
  };
}
