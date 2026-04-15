/**
 * Dashboard Sections — Builder Contract v1
 *
 * 8 read-only sections that compose the ONE Command Center dashboard.
 * All data flows FROM mailboxes — the dashboard NEVER writes or executes.
 *
 * Sections:
 * 1. Current State — Gateway, Signer, Policy, Trust, Night Loop, Sentinel, Ledger status
 * 2. Needs Decision — top 3-5 ranked + ALL MEDIUM/HIGH risk + anomaly-flagged
 * 3. Auto Executed / Delegated — trust-policy-driven actions with receipt_id
 * 4. Sentinel / Integrity — active issues, anomalies, invariant violations, trace breaks
 * 5. Memory Reconciliation — Gemini instance differences
 * 6. Background Queue — searchable archive, visible=false items
 * 7. Preferences / Trust Policies — generation vs governed distinction
 * 8. Weekly Review Prompt — reflection invitations
 *
 * INVARIANT: Dashboard is read-only. No execution from dashboard.
 */

import { desc, eq, and, sql, like, or } from "drizzle-orm";
import { getDb } from "./db";
import {
  mailboxEntries,
  sentinelEvents,
  sentinelThresholds,
  trustPolicies,
  ledger,
  proposalPackets,
  type MailboxEntry,
} from "../drizzle/schema";

// ─────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────

export interface Section1_CurrentState {
  gateway: { status: "online" | "offline" | "degraded"; lastCheck: string };
  signer: { status: "active" | "inactive"; publicKey: string | null };
  policy: { activeCount: number; lastUpdated: string | null };
  trust: { level: number; lastEvaluated: string | null };
  nightLoop: { lastRun: string | null; nextRun: string | null; status: "idle" | "running" | "error" };
  sentinel: { activeAlerts: number; lastSweep: string | null };
  ledger: { entryCount: number; lastHash: string | null; chainValid: boolean };
}

export interface Section2_NeedsDecision {
  proposals: {
    packetId: string;
    traceId: string;
    title: string;
    riskTier: string;
    category: string;
    createdAt: string;
    anomalyFlagged: boolean;
    kernelDecision: string | null;
  }[];
  totalPending: number;
}

export interface Section3_AutoExecuted {
  actions: {
    packetId: string;
    traceId: string;
    title: string;
    executedAt: string;
    receiptId: string | null;
    trustLevel: number;
    policyName: string | null;
  }[];
  totalAutoExecuted: number;
}

export interface Section4_SentinelIntegrity {
  activeIssues: {
    eventId: string;
    type: string;
    severity: string;
    subject: string;
    createdAt: string;
    acknowledged: boolean;
  }[];
  anomalyCount: number;
  invariantViolations: number;
  traceBreaks: number;
}

export interface Section5_MemoryReconciliation {
  instances: {
    name: string;
    lastSync: string | null;
    divergences: number;
    status: "synced" | "diverged" | "unknown";
  }[];
}

export interface Section6_BackgroundQueue {
  items: {
    packetId: string;
    traceId: string;
    packetType: string;
    sourceAgent: string;
    status: string;
    createdAt: string;
    summary: string;
  }[];
  totalArchived: number;
}

export interface Section7_TrustPolicies {
  policies: {
    id: number;
    name: string;
    riskTier: string;
    trustLevel: number;
    autoApprove: boolean;
    governed: boolean;
    lastUpdated: string;
  }[];
  totalPolicies: number;
}

export interface Section8_WeeklyReview {
  lastReview: {
    reviewId: string;
    period: string;
    completedAt: string | null;
    responseCount: number;
  } | null;
  pendingPrompts: {
    promptId: string;
    category: string;
    question: string;
    createdAt: string;
  }[];
  nextReviewDate: string | null;
}

// ─────────────────────────────────────────────────────────────────
// Section 1: Current State
// ─────────────────────────────────────────────────────────────────

export async function getSection1_CurrentState(): Promise<Section1_CurrentState> {
  const db = await getDb();
  const now = new Date().toISOString();

  if (!db) {
    return {
      gateway: { status: "offline", lastCheck: now },
      signer: { status: "inactive", publicKey: null },
      policy: { activeCount: 0, lastUpdated: null },
      trust: { level: 0, lastEvaluated: null },
      nightLoop: { lastRun: null, nextRun: null, status: "idle" },
      sentinel: { activeAlerts: 0, lastSweep: null },
      ledger: { entryCount: 0, lastHash: null, chainValid: false },
    };
  }

  // Ledger state
  const [ledgerCount] = await db
    .select({ count: sql<number>`count(*)` })
    .from(ledger);
  const [lastLedgerEntry] = await db
    .select()
    .from(ledger)
    .orderBy(desc(ledger.id))
    .limit(1);

  // Sentinel alerts
  const [alertCount] = await db
    .select({ count: sql<number>`count(*)` })
    .from(sentinelEvents)
    .where(eq(sentinelEvents.acknowledged, false));

  // Active policies
  const [policyCount] = await db
    .select({ count: sql<number>`count(*)` })
    .from(trustPolicies)
    .where(eq(trustPolicies.active, true));

  const [lastPolicy] = await db
    .select()
    .from(trustPolicies)
    .orderBy(desc(trustPolicies.updatedAt))
    .limit(1);

  // Night loop — check for recent night batch entries in mailbox
  const [lastNightBatch] = await db
    .select()
    .from(mailboxEntries)
    .where(eq(mailboxEntries.packetType, "night_batch_result"))
    .orderBy(desc(mailboxEntries.createdAt))
    .limit(1);

  // Last sentinel sweep
  const [lastSweep] = await db
    .select()
    .from(mailboxEntries)
    .where(eq(mailboxEntries.packetType, "sentinel_event"))
    .orderBy(desc(mailboxEntries.createdAt))
    .limit(1);

  return {
    gateway: { status: "online", lastCheck: now },
    signer: { status: "active", publicKey: null }, // Populated from proxy_users at runtime
    policy: {
      activeCount: Number(policyCount?.count ?? 0),
      lastUpdated: lastPolicy?.updatedAt?.toISOString() ?? null,
    },
    trust: { level: 1, lastEvaluated: now }, // Default trust level
    nightLoop: {
      lastRun: lastNightBatch?.createdAt?.toISOString() ?? null,
      nextRun: null, // Calculated from cron schedule
      status: "idle",
    },
    sentinel: {
      activeAlerts: Number(alertCount?.count ?? 0),
      lastSweep: lastSweep?.createdAt?.toISOString() ?? null,
    },
    ledger: {
      entryCount: Number(ledgerCount?.count ?? 0),
      lastHash: lastLedgerEntry?.hash ?? null,
      chainValid: true, // Verified by separate integrity check
    },
  };
}

// ─────────────────────────────────────────────────────────────────
// Section 2: Needs Decision
// ─────────────────────────────────────────────────────────────────

export async function getSection2_NeedsDecision(): Promise<Section2_NeedsDecision> {
  const db = await getDb();
  if (!db) return { proposals: [], totalPending: 0 };

  // Get pending proposals from the proposal mailbox
  const pendingProposals = await db
    .select()
    .from(mailboxEntries)
    .where(
      and(
        eq(mailboxEntries.mailboxType, "proposal"),
        eq(mailboxEntries.status, "pending")
      )
    )
    .orderBy(desc(mailboxEntries.createdAt))
    .limit(20);

  // Also check for kernel decisions that require human approval
  const requiresHuman = await db
    .select()
    .from(mailboxEntries)
    .where(
      and(
        eq(mailboxEntries.mailboxType, "decision"),
        eq(mailboxEntries.packetType, "kernel_decision_object"),
        eq(mailboxEntries.status, "pending")
      )
    )
    .orderBy(desc(mailboxEntries.createdAt))
    .limit(20);

  const proposals = pendingProposals.map((p) => {
    const payload = p.payload as Record<string, any>;
    const kernelMatch = requiresHuman.find((k) => k.traceId === p.traceId);
    const kernelPayload = kernelMatch?.payload as Record<string, any> | undefined;

    return {
      packetId: p.packetId,
      traceId: p.traceId,
      title: payload?.title || payload?.type || "Untitled proposal",
      riskTier: payload?.risk_tier || "UNKNOWN",
      category: payload?.category || "general",
      createdAt: p.createdAt.toISOString(),
      anomalyFlagged: !!payload?.anomaly_flag,
      kernelDecision: kernelPayload?.proposed_decision ?? null,
    };
  });

  // Sort: MEDIUM/HIGH risk first, then anomaly-flagged, then by date
  const riskOrder: Record<string, number> = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3, UNKNOWN: 4 };
  proposals.sort((a, b) => {
    const riskDiff = (riskOrder[a.riskTier] ?? 4) - (riskOrder[b.riskTier] ?? 4);
    if (riskDiff !== 0) return riskDiff;
    if (a.anomalyFlagged !== b.anomalyFlagged) return a.anomalyFlagged ? -1 : 1;
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  });

  return {
    proposals: proposals.slice(0, 10), // Top 10
    totalPending: pendingProposals.length,
  };
}

// ─────────────────────────────────────────────────────────────────
// Section 3: Auto Executed / Delegated
// ─────────────────────────────────────────────────────────────────

export async function getSection3_AutoExecuted(): Promise<Section3_AutoExecuted> {
  const db = await getDb();
  if (!db) return { actions: [], totalAutoExecuted: 0 };

  // Get gateway enforcement objects with EXECUTED status
  const executed = await db
    .select()
    .from(mailboxEntries)
    .where(
      and(
        eq(mailboxEntries.mailboxType, "decision"),
        eq(mailboxEntries.packetType, "gateway_enforcement_object"),
        eq(mailboxEntries.status, "executed")
      )
    )
    .orderBy(desc(mailboxEntries.createdAt))
    .limit(20);

  const actions = executed.map((e) => {
    const payload = e.payload as Record<string, any>;
    return {
      packetId: e.packetId,
      traceId: e.traceId,
      title: payload?.enforcement_reason || "Auto-executed action",
      executedAt: e.processedAt?.toISOString() || e.createdAt.toISOString(),
      receiptId: payload?.receipt_id ?? null,
      trustLevel: payload?.trust_level_applied ?? 0,
      policyName: payload?.policy_name ?? null,
    };
  });

  const [totalCount] = await db
    .select({ count: sql<number>`count(*)` })
    .from(mailboxEntries)
    .where(
      and(
        eq(mailboxEntries.mailboxType, "decision"),
        eq(mailboxEntries.packetType, "gateway_enforcement_object"),
        eq(mailboxEntries.status, "executed")
      )
    );

  return {
    actions,
    totalAutoExecuted: Number(totalCount?.count ?? 0),
  };
}

// ─────────────────────────────────────────────────────────────────
// Section 4: Sentinel / Integrity
// ─────────────────────────────────────────────────────────────────

export async function getSection4_SentinelIntegrity(): Promise<Section4_SentinelIntegrity> {
  const db = await getDb();
  if (!db) return { activeIssues: [], anomalyCount: 0, invariantViolations: 0, traceBreaks: 0 };

  const events = await db
    .select()
    .from(sentinelEvents)
    .where(eq(sentinelEvents.acknowledged, false))
    .orderBy(desc(sentinelEvents.createdAt))
    .limit(50);

  const activeIssues = events.map((e) => ({
    eventId: e.eventId,
    type: e.type,
    severity: e.severity,
    subject: e.subject,
    createdAt: e.createdAt.toISOString(),
    acknowledged: e.acknowledged,
  }));

  const anomalyCount = events.filter((e) => e.type === "anomaly").length;
  const invariantViolations = events.filter((e) => e.type === "invariant_violation").length;
  const traceBreaks = events.filter((e) => e.type === "trace_break").length;

  return { activeIssues, anomalyCount, invariantViolations, traceBreaks };
}

// ─────────────────────────────────────────────────────────────────
// Section 5: Memory Reconciliation
// ─────────────────────────────────────────────────────────────────

export async function getSection5_MemoryReconciliation(): Promise<Section5_MemoryReconciliation> {
  // Memory reconciliation tracks Gemini instance differences.
  // This reads from the mailbox for any memory_reconciliation entries.
  const db = await getDb();
  if (!db) {
    return {
      instances: [
        { name: "Gemini Primary", lastSync: null, divergences: 0, status: "unknown" },
        { name: "Gemini Secondary", lastSync: null, divergences: 0, status: "unknown" },
      ],
    };
  }

  const reconciliationEntries = await db
    .select()
    .from(mailboxEntries)
    .where(eq(mailboxEntries.packetType, "memory_reconciliation"))
    .orderBy(desc(mailboxEntries.createdAt))
    .limit(10);

  if (reconciliationEntries.length === 0) {
    return {
      instances: [
        { name: "Gemini Primary", lastSync: null, divergences: 0, status: "unknown" },
      ],
    };
  }

  const latest = reconciliationEntries[0];
  const payload = latest.payload as Record<string, any>;

  return {
    instances: (payload?.instances || []).map((inst: any) => ({
      name: inst.name || "Unknown",
      lastSync: inst.lastSync || null,
      divergences: inst.divergences || 0,
      status: inst.status || "unknown",
    })),
  };
}

// ─────────────────────────────────────────────────────────────────
// Section 6: Background Queue
// ─────────────────────────────────────────────────────────────────

export async function getSection6_BackgroundQueue(
  search?: string,
  limit = 20
): Promise<Section6_BackgroundQueue> {
  const db = await getDb();
  if (!db) return { items: [], totalArchived: 0 };

  // Background queue = archived mailbox entries
  let query = db
    .select()
    .from(mailboxEntries)
    .where(eq(mailboxEntries.status, "archived"))
    .orderBy(desc(mailboxEntries.createdAt))
    .limit(limit);

  const items = await query;

  const filtered = search
    ? items.filter((i) => {
        const payload = i.payload as Record<string, any>;
        const searchLower = search.toLowerCase();
        return (
          i.packetType.toLowerCase().includes(searchLower) ||
          i.sourceAgent.toLowerCase().includes(searchLower) ||
          JSON.stringify(payload).toLowerCase().includes(searchLower)
        );
      })
    : items;

  const [totalCount] = await db
    .select({ count: sql<number>`count(*)` })
    .from(mailboxEntries)
    .where(eq(mailboxEntries.status, "archived"));

  return {
    items: filtered.map((i) => {
      const payload = i.payload as Record<string, any>;
      return {
        packetId: i.packetId,
        traceId: i.traceId,
        packetType: i.packetType,
        sourceAgent: i.sourceAgent,
        status: i.status,
        createdAt: i.createdAt.toISOString(),
        summary: payload?.title || payload?.type || i.packetType,
      };
    }),
    totalArchived: Number(totalCount?.count ?? 0),
  };
}

// ─────────────────────────────────────────────────────────────────
// Section 7: Preferences / Trust Policies
// ─────────────────────────────────────────────────────────────────

export async function getSection7_TrustPolicies(): Promise<Section7_TrustPolicies> {
  const db = await getDb();
  if (!db) return { policies: [], totalPolicies: 0 };

  const policies = await db
    .select()
    .from(trustPolicies)
    .orderBy(desc(trustPolicies.updatedAt))
    .limit(50);

  return {
    policies: policies.map((p) => ({
      id: p.id,
      name: p.category, // category serves as the policy name
      riskTier: p.riskTier,
      trustLevel: p.trustLevel,
      autoApprove: p.trustLevel >= 1 && p.riskTier === "LOW", // Derived from trust level + risk
      governed: true, // All policies are governed by definition
      lastUpdated: p.updatedAt.toISOString(),
    })),
    totalPolicies: policies.length,
  };
}

// ─────────────────────────────────────────────────────────────────
// Section 8: Weekly Review Prompt
// ─────────────────────────────────────────────────────────────────

export async function getSection8_WeeklyReview(): Promise<Section8_WeeklyReview> {
  const db = await getDb();
  if (!db) return { lastReview: null, pendingPrompts: [], nextReviewDate: null };

  // Check for weekly review entries in the mailbox
  const reviewEntries = await db
    .select()
    .from(mailboxEntries)
    .where(eq(mailboxEntries.packetType, "weekly_review_packet"))
    .orderBy(desc(mailboxEntries.createdAt))
    .limit(1);

  const lastReview = reviewEntries.length > 0
    ? (() => {
        const payload = reviewEntries[0].payload as Record<string, any>;
        return {
          reviewId: payload?.review_id || reviewEntries[0].packetId,
          period: payload?.period || "unknown",
          completedAt: reviewEntries[0].processedAt?.toISOString() ?? null,
          responseCount: payload?.response_count ?? 0,
        };
      })()
    : null;

  // Get pending reflection prompts
  const promptEntries = await db
    .select()
    .from(mailboxEntries)
    .where(
      and(
        eq(mailboxEntries.packetType, "reflection_prompt"),
        eq(mailboxEntries.status, "pending")
      )
    )
    .orderBy(desc(mailboxEntries.createdAt))
    .limit(10);

  const pendingPrompts = promptEntries.map((p) => {
    const payload = p.payload as Record<string, any>;
    return {
      promptId: p.packetId,
      category: payload?.category || "general",
      question: payload?.question || "Reflection prompt",
      createdAt: p.createdAt.toISOString(),
    };
  });

  // Calculate next review date (next Sunday)
  const now = new Date();
  const daysUntilSunday = (7 - now.getDay()) % 7 || 7;
  const nextSunday = new Date(now);
  nextSunday.setDate(now.getDate() + daysUntilSunday);
  nextSunday.setHours(9, 0, 0, 0);

  return {
    lastReview,
    pendingPrompts,
    nextReviewDate: nextSunday.toISOString(),
  };
}

// ─────────────────────────────────────────────────────────────────
// Full Dashboard (all 8 sections)
// ─────────────────────────────────────────────────────────────────

export interface FullDashboard {
  section1: Section1_CurrentState;
  section2: Section2_NeedsDecision;
  section3: Section3_AutoExecuted;
  section4: Section4_SentinelIntegrity;
  section5: Section5_MemoryReconciliation;
  section6: Section6_BackgroundQueue;
  section7: Section7_TrustPolicies;
  section8: Section8_WeeklyReview;
  generatedAt: string;
  readOnly: true; // INVARIANT: dashboard never executes
}

export async function getFullDashboard(): Promise<FullDashboard> {
  const [s1, s2, s3, s4, s5, s6, s7, s8] = await Promise.all([
    getSection1_CurrentState(),
    getSection2_NeedsDecision(),
    getSection3_AutoExecuted(),
    getSection4_SentinelIntegrity(),
    getSection5_MemoryReconciliation(),
    getSection6_BackgroundQueue(),
    getSection7_TrustPolicies(),
    getSection8_WeeklyReview(),
  ]);

  return {
    section1: s1,
    section2: s2,
    section3: s3,
    section4: s4,
    section5: s5,
    section6: s6,
    section7: s7,
    section8: s8,
    generatedAt: new Date().toISOString(),
    readOnly: true,
  };
}
