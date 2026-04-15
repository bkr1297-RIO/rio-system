/**
 * Sentinel Layer — Contrast Detection & Invariant Monitoring
 * 
 * The sentinel watches for deviations from expected patterns.
 * It does NOT enforce — it surfaces signals for human review.
 * 
 * Three signal types:
 * 1. Contrast signals — current behavior vs baseline patterns
 * 2. Anomaly signals — statistical outliers in execution data
 * 3. Invariant signals — system rule violations
 * 
 * All signals are recorded in sentinel_events and surfaced in the UI.
 * Critical signals also trigger owner notifications.
 */

import { nanoid } from "nanoid";
import {
  createSentinelEvent,
  listSentinelEvents,
  acknowledgeSentinelEvent,
  getBaselinePattern,
  appendLedger,
  getAllLedgerEntries,
} from "./db";

// ─── Types ───────────────────────────────────────────────────────

export type SignalSeverity = "info" | "warning" | "critical";
export type SignalCategory =
  | "contrast"        // behavior vs baseline
  | "anomaly"         // statistical outlier
  | "invariant"       // system rule violation
  | "velocity"        // rate-of-change anomaly
  | "authorization"   // auth pattern deviation
  | "financial";      // spending pattern deviation

export interface SentinelSignal {
  category: SignalCategory;
  severity: SignalSeverity;
  title: string;
  description: string;
  context: Record<string, unknown>;
  recommendation?: string;
}

export interface ContrastCheck {
  metric: string;
  currentValue: number;
  baselineValue: number;
  thresholdPercent: number;
}

export interface VelocityCheck {
  metric: string;
  windowMinutes: number;
  maxEventsPerWindow: number;
}

// ─── Contrast Detection ──────────────────────────────────────────

/**
 * Check if a metric has deviated significantly from its baseline.
 * Returns a signal if the deviation exceeds the threshold.
 */
export function detectContrast(check: ContrastCheck): SentinelSignal | null {
  if (check.baselineValue === 0) {
    // No baseline yet — can't detect contrast
    if (check.currentValue > 0) {
      return {
        category: "contrast",
        severity: "info",
        title: `New activity: ${check.metric}`,
        description: `First observation of ${check.metric} (value: ${check.currentValue}). No baseline exists yet.`,
        context: { ...check },
        recommendation: "Monitor for pattern establishment.",
      };
    }
    return null;
  }

  const deviationPercent = Math.abs(
    ((check.currentValue - check.baselineValue) / check.baselineValue) * 100
  );

  if (deviationPercent <= check.thresholdPercent) {
    return null; // Within normal range
  }

  const direction = check.currentValue > check.baselineValue ? "above" : "below";
  const severity: SignalSeverity =
    deviationPercent > check.thresholdPercent * 3 ? "critical" :
    deviationPercent > check.thresholdPercent * 1.5 ? "warning" : "info";

  return {
    category: "contrast",
    severity,
    title: `${check.metric} deviation: ${deviationPercent.toFixed(1)}% ${direction} baseline`,
    description: `Current: ${check.currentValue}, Baseline: ${check.baselineValue}, Threshold: ${check.thresholdPercent}%`,
    context: { ...check, deviationPercent, direction },
    recommendation: severity === "critical"
      ? "Immediate review recommended. Auto-approval should be suspended for this category."
      : "Review at next decision cycle.",
  };
}

// ─── Velocity Detection ──────────────────────────────────────────

/**
 * Check if event velocity exceeds the expected rate.
 * Used to detect rapid-fire actions that may indicate automation errors.
 */
export function detectVelocityAnomaly(
  events: { timestamp: number }[],
  check: VelocityCheck
): SentinelSignal | null {
  const windowMs = check.windowMinutes * 60 * 1000;
  const now = Date.now();
  const windowStart = now - windowMs;

  const eventsInWindow = events.filter(e => e.timestamp >= windowStart);

  if (eventsInWindow.length <= check.maxEventsPerWindow) {
    return null; // Within normal velocity
  }

  const severity: SignalSeverity =
    eventsInWindow.length > check.maxEventsPerWindow * 3 ? "critical" :
    eventsInWindow.length > check.maxEventsPerWindow * 1.5 ? "warning" : "info";

  return {
    category: "velocity",
    severity,
    title: `Velocity spike: ${check.metric}`,
    description: `${eventsInWindow.length} events in ${check.windowMinutes}min window (max: ${check.maxEventsPerWindow})`,
    context: {
      metric: check.metric,
      eventsInWindow: eventsInWindow.length,
      maxExpected: check.maxEventsPerWindow,
      windowMinutes: check.windowMinutes,
    },
    recommendation: severity === "critical"
      ? "Execution should be paused until reviewed."
      : "Monitor for continued elevated velocity.",
  };
}

// ─── Invariant Checks ────────────────────────────────────────────

/**
 * Core system invariants that must always hold.
 * Returns signals for any violations found.
 */
export function checkSystemInvariants(state: {
  ledgerEntryCount: number;
  lastLedgerHash: string;
  activeRootAuthority: boolean;
  gatewayReachable: boolean;
  notionConfigured: boolean;
}): SentinelSignal[] {
  const signals: SentinelSignal[] = [];

  // Invariant 1: Ledger must have entries (after genesis)
  if (state.ledgerEntryCount === 0) {
    signals.push({
      category: "invariant",
      severity: "critical",
      title: "Empty ledger detected",
      description: "The governance ledger has zero entries. This should not happen after system initialization.",
      context: { ledgerEntryCount: 0 },
      recommendation: "Check if genesis record exists. System may need re-initialization.",
    });
  }

  // Invariant 2: Root authority must be active
  if (!state.activeRootAuthority) {
    signals.push({
      category: "invariant",
      severity: "critical",
      title: "No active root authority",
      description: "The system has no active root authority. No governance operations can proceed.",
      context: { activeRootAuthority: false },
      recommendation: "Register a root authority immediately.",
    });
  }

  // Invariant 3: Gateway must be reachable
  if (!state.gatewayReachable) {
    signals.push({
      category: "invariant",
      severity: "warning",
      title: "Gateway unreachable",
      description: "The governance gateway is not responding. Execution pipeline is blocked.",
      context: { gatewayReachable: false },
      recommendation: "Check gateway deployment status.",
    });
  }

  return signals;
}

// ─── Authorization Pattern Detection ─────────────────────────────

/**
 * Detect unusual authorization patterns:
 * - Too many approvals in a short window
 * - Approvals outside normal hours
 * - Approval rate variance from baseline
 */
export function detectAuthorizationAnomaly(
  recentApprovals: { timestamp: number; riskTier: string }[],
  config: {
    maxApprovalsPerHour?: number;
    normalHoursStart?: number; // 0-23
    normalHoursEnd?: number;   // 0-23
    baselineApprovalRate?: number; // per hour
  } = {}
): SentinelSignal[] {
  const signals: SentinelSignal[] = [];
  const maxPerHour = config.maxApprovalsPerHour ?? 10;
  const normalStart = config.normalHoursStart ?? 7;
  const normalEnd = config.normalHoursEnd ?? 23;

  // Check velocity
  const oneHourAgo = Date.now() - 3600_000;
  const recentCount = recentApprovals.filter(a => a.timestamp >= oneHourAgo).length;

  if (recentCount > maxPerHour) {
    signals.push({
      category: "authorization",
      severity: recentCount > maxPerHour * 2 ? "critical" : "warning",
      title: `High approval velocity: ${recentCount}/hr`,
      description: `${recentCount} approvals in the last hour (threshold: ${maxPerHour})`,
      context: { recentCount, maxPerHour },
      recommendation: "Verify these approvals are intentional. Consider pausing auto-approvals.",
    });
  }

  // Check for high-risk approvals outside normal hours
  const now = new Date();
  const currentHour = now.getHours();
  const isOutsideHours = currentHour < normalStart || currentHour >= normalEnd;

  if (isOutsideHours) {
    const highRiskRecent = recentApprovals.filter(
      a => a.timestamp >= oneHourAgo && (a.riskTier === "HIGH" || a.riskTier === "CRITICAL")
    );
    if (highRiskRecent.length > 0) {
      signals.push({
        category: "authorization",
        severity: "warning",
        title: `${highRiskRecent.length} high-risk approval(s) outside normal hours`,
        description: `High-risk approvals detected at ${currentHour}:00 (normal hours: ${normalStart}:00-${normalEnd}:00)`,
        context: { currentHour, normalStart, normalEnd, highRiskCount: highRiskRecent.length },
        recommendation: "Verify these approvals were made by the human signer.",
      });
    }
  }

  return signals;
}

// ─── Record & Surface ────────────────────────────────────────────

/**
 * Record a sentinel signal to the database and ledger.
 * Returns the created event ID.
 */
export async function recordSignal(signal: SentinelSignal): Promise<string> {
  const eventId = `sent_${nanoid(12)}`;

  // Map our signal types to the DB schema types
  const typeMap: Record<SignalCategory, "contrast" | "invariant_violation" | "trace_break" | "anomaly" | "system_correction"> = {
    contrast: "contrast",
    anomaly: "anomaly",
    invariant: "invariant_violation",
    velocity: "anomaly",
    authorization: "anomaly",
    financial: "contrast",
  };
  const severityMap: Record<SignalSeverity, "INFO" | "WARN" | "CRITICAL"> = {
    info: "INFO",
    warning: "WARN",
    critical: "CRITICAL",
  };

  await createSentinelEvent({
    eventId,
    type: typeMap[signal.category],
    severity: severityMap[signal.severity],
    subject: signal.title,
    baseline: signal.context,
    observed: signal.context,
    delta: signal.description,
    acknowledged: false,
  });

  await appendLedger("SENTINEL_EVENT", {
    eventId,
    category: signal.category,
    severity: signal.severity,
    title: signal.title,
  });

  return eventId;
}

/**
 * Get all unacknowledged signals, ordered by severity.
 */
export async function getUnacknowledgedSignals() {
  const events = await listSentinelEvents({ acknowledged: false });

  // Sort: critical first, then warning, then info
  const severityOrder: Record<string, number> = { critical: 0, warning: 1, info: 2 };
  return events.sort((a: any, b: any) =>
    (severityOrder[a.severity] ?? 3) - (severityOrder[b.severity] ?? 3)
  );
}

/**
 * Acknowledge a signal (human has reviewed it).
 */
export async function acknowledgeSignal(eventId: string) {
  return acknowledgeSentinelEvent(eventId);
}

/**
 * Run a full sentinel sweep — checks all invariants and patterns.
 * Returns all detected signals.
 */
export async function runSentinelSweep(state: {
  ledgerEntryCount: number;
  lastLedgerHash: string;
  activeRootAuthority: boolean;
  gatewayReachable: boolean;
  notionConfigured: boolean;
  recentApprovals?: { timestamp: number; riskTier: string }[];
}): Promise<SentinelSignal[]> {
  const signals: SentinelSignal[] = [];

  // System invariants
  signals.push(...checkSystemInvariants(state));

  // Authorization patterns
  if (state.recentApprovals && state.recentApprovals.length > 0) {
    signals.push(...detectAuthorizationAnomaly(state.recentApprovals));
  }

  return signals;
}
