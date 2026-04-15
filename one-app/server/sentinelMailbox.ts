/**
 * Sentinel Mailbox Integration — Builder Contract v1
 *
 * Extends the existing Sentinel Layer to write through the mailbox system.
 * Sentinel events are written to the sentinel_mailbox with full trace linkage.
 * Events with severity >= WARN are surfaced to Notion.
 *
 * INVARIANTS:
 * 1. Thresholds are governed — changes require human approval (proposal → kernel → gateway)
 * 2. Sentinel events are append-only in the mailbox
 * 3. Events with severity >= WARN are surfaced to Notion
 * 4. Sentinel NEVER executes — it only observes and surfaces signals
 * 5. Thresholds come from DB first, fall back to DEFAULT_SENTINEL_THRESHOLDS
 */

import { nanoid } from "nanoid";
import { eq, and } from "drizzle-orm";
import { getDb } from "./db";
import {
  sentinelThresholds,
  DEFAULT_SENTINEL_THRESHOLDS,
  type SentinelMetricType,
  type SentinelSeverityLevel,
  type SentinelThreshold,
} from "../drizzle/schema";
import { appendToMailbox, generateTraceId } from "./mailbox";

// ─────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────

export interface SentinelObservation {
  metricType: SentinelMetricType;
  baseline: number;
  observed: number;
}

export interface SentinelEvaluation {
  metricType: SentinelMetricType;
  severity: SentinelSeverityLevel;
  baseline: number;
  observed: number;
  delta: number;
  confidence: number;
  thresholds: { INFO: number; WARN: number; CRITICAL: number };
  surfaceToNotion: boolean;
}

export interface ThresholdChangeProposal {
  metricType: SentinelMetricType;
  currentThresholds: { INFO: number; WARN: number; CRITICAL: number };
  proposedThresholds: { INFO: number; WARN: number; CRITICAL: number };
  reason: string;
}

// ─────────────────────────────────────────────────────────────────
// Governed Threshold Management
// ─────────────────────────────────────────────────────────────────

/**
 * Get the active thresholds for a metric type.
 * Reads from DB first (governed), falls back to defaults.
 */
export async function getThresholds(
  metricType: SentinelMetricType
): Promise<{ INFO: number; WARN: number; CRITICAL: number }> {
  const db = await getDb();
  if (!db) {
    return DEFAULT_SENTINEL_THRESHOLDS[metricType];
  }

  const [row] = await db
    .select()
    .from(sentinelThresholds)
    .where(
      and(
        eq(sentinelThresholds.metricType, metricType),
        eq(sentinelThresholds.active, true)
      )
    )
    .limit(1);

  if (row) {
    return {
      INFO: parseFloat(String(row.infoThreshold)),
      WARN: parseFloat(String(row.warnThreshold)),
      CRITICAL: parseFloat(String(row.criticalThreshold)),
    };
  }

  return DEFAULT_SENTINEL_THRESHOLDS[metricType];
}

/**
 * Get all active thresholds (DB + defaults for any missing metrics).
 */
export async function getAllThresholds(): Promise<
  Record<SentinelMetricType, { INFO: number; WARN: number; CRITICAL: number }>
> {
  const db = await getDb();
  const result = { ...DEFAULT_SENTINEL_THRESHOLDS } as Record<
    SentinelMetricType,
    { INFO: number; WARN: number; CRITICAL: number }
  >;

  if (!db) return result;

  const rows = await db
    .select()
    .from(sentinelThresholds)
    .where(eq(sentinelThresholds.active, true));

  for (const row of rows) {
    const metric = row.metricType as SentinelMetricType;
    if (metric in DEFAULT_SENTINEL_THRESHOLDS) {
      result[metric] = {
        INFO: parseFloat(String(row.infoThreshold)),
        WARN: parseFloat(String(row.warnThreshold)),
        CRITICAL: parseFloat(String(row.criticalThreshold)),
      };
    }
  }

  return result;
}

/**
 * Seed default thresholds into the DB (idempotent).
 * Used during system initialization.
 */
export async function seedDefaultThresholds(): Promise<number> {
  const db = await getDb();
  if (!db) return 0;

  let seeded = 0;
  for (const [metric, values] of Object.entries(DEFAULT_SENTINEL_THRESHOLDS)) {
    const [existing] = await db
      .select()
      .from(sentinelThresholds)
      .where(eq(sentinelThresholds.metricType, metric))
      .limit(1);

    if (!existing) {
      await db.insert(sentinelThresholds).values({
        metricType: metric,
        infoThreshold: String(values.INFO),
        warnThreshold: String(values.WARN),
        criticalThreshold: String(values.CRITICAL),
        active: true,
        lastModifiedBy: "system_init",
      });
      seeded++;
    }
  }

  return seeded;
}

/**
 * Create a proposal to change a threshold.
 * This writes to the proposal_mailbox — the change does NOT take effect
 * until it goes through kernel → gateway → human approval.
 *
 * @returns The trace_id of the proposal
 */
export async function proposeThresholdChange(
  proposal: ThresholdChangeProposal
): Promise<string> {
  const traceId = generateTraceId();

  await appendToMailbox({
    mailboxType: "proposal",
    packetType: "proposal_packet",
    sourceAgent: "sentinel",
    targetAgent: null,
    status: "pending",
    payload: {
      type: "sentinel_threshold_change",
      category: "policy",
      risk_tier: "MEDIUM", // Threshold changes are always MEDIUM risk
      metric_type: proposal.metricType,
      current_thresholds: proposal.currentThresholds,
      proposed_thresholds: proposal.proposedThresholds,
      reason: proposal.reason,
      why_it_matters: `Changing sentinel thresholds affects anomaly detection sensitivity for ${proposal.metricType}`,
    },
    traceId,
  });

  return traceId;
}

/**
 * Apply an approved threshold change.
 * ONLY called after gateway enforcement confirms EXECUTED.
 */
export async function applyThresholdChange(
  metricType: SentinelMetricType,
  newThresholds: { INFO: number; WARN: number; CRITICAL: number },
  approvalTraceId: string,
  modifiedBy: string
): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  // Deactivate current threshold
  await db
    .update(sentinelThresholds)
    .set({ active: false })
    .where(
      and(
        eq(sentinelThresholds.metricType, metricType),
        eq(sentinelThresholds.active, true)
      )
    );

  // Insert new governed threshold
  await db.insert(sentinelThresholds).values({
    metricType,
    infoThreshold: String(newThresholds.INFO),
    warnThreshold: String(newThresholds.WARN),
    criticalThreshold: String(newThresholds.CRITICAL),
    active: true,
    approvalTraceId,
    lastModifiedBy: modifiedBy,
  });
}

// ─────────────────────────────────────────────────────────────────
// Sentinel Evaluation (Mailbox-Aware)
// ─────────────────────────────────────────────────────────────────

/**
 * Evaluate an observation against governed thresholds.
 * Returns the severity level and whether to surface to Notion.
 */
export function evaluateObservation(
  observation: SentinelObservation,
  thresholds: { INFO: number; WARN: number; CRITICAL: number }
): SentinelEvaluation {
  const delta = Math.abs(observation.observed - observation.baseline);
  const normalizedDelta =
    observation.baseline !== 0
      ? delta / Math.abs(observation.baseline)
      : observation.observed !== 0
      ? 1.0
      : 0;

  let severity: SentinelSeverityLevel;
  if (normalizedDelta >= thresholds.CRITICAL) {
    severity = "CRITICAL";
  } else if (normalizedDelta >= thresholds.WARN) {
    severity = "WARN";
  } else if (normalizedDelta >= thresholds.INFO) {
    severity = "INFO";
  } else {
    // Below all thresholds — still return INFO for completeness
    severity = "INFO";
  }

  // Confidence is inversely proportional to how close we are to the threshold boundary
  const confidence = Math.min(
    1.0,
    normalizedDelta / (thresholds.INFO || 0.01)
  );

  return {
    metricType: observation.metricType,
    severity,
    baseline: observation.baseline,
    observed: observation.observed,
    delta: normalizedDelta,
    confidence: Math.round(confidence * 100) / 100,
    thresholds,
    surfaceToNotion: severity === "WARN" || severity === "CRITICAL",
  };
}

/**
 * Record a sentinel evaluation to the sentinel_mailbox.
 * If severity >= WARN, also marks for Notion surfacing.
 *
 * @returns The mailbox entry
 */
export async function recordSentinelEvent(
  evaluation: SentinelEvaluation,
  traceId?: string,
  parentPacketId?: string
) {
  const eventTraceId = traceId || generateTraceId();

  const entry = await appendToMailbox({
    mailboxType: "sentinel",
    packetType: "sentinel_event",
    sourceAgent: "sentinel",
    targetAgent: null,
    status: evaluation.severity === "CRITICAL" ? "routed" : "pending",
    payload: {
      event_id: `sent_${nanoid(12)}`,
      metric_type: evaluation.metricType,
      severity: evaluation.severity,
      baseline: evaluation.baseline,
      observed: evaluation.observed,
      delta: evaluation.delta,
      confidence: evaluation.confidence,
      thresholds: evaluation.thresholds,
      surface_to_notion: evaluation.surfaceToNotion,
      timestamp: new Date().toISOString(),
    },
    traceId: eventTraceId,
    parentPacketId: parentPacketId || null,
  });

  return entry;
}

/**
 * Run a full sentinel evaluation sweep across all metrics.
 * Reads thresholds from DB, evaluates observations, writes to mailbox.
 *
 * @param observations - Current metric observations
 * @returns Array of evaluations with mailbox entries
 */
export async function runSentinelMailboxSweep(
  observations: SentinelObservation[]
): Promise<{ evaluation: SentinelEvaluation; entryId: number }[]> {
  const allThresholds = await getAllThresholds();
  const results: { evaluation: SentinelEvaluation; entryId: number }[] = [];

  for (const obs of observations) {
    const thresholds = allThresholds[obs.metricType];
    if (!thresholds) continue;

    const evaluation = evaluateObservation(obs, thresholds);
    const entry = await recordSentinelEvent(evaluation);

    results.push({ evaluation, entryId: entry.id });
  }

  return results;
}
