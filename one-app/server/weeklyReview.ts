/**
 * Weekly Review Loop — Builder Contract v1 (Phase 2I)
 *
 * Night batch generates weekly review packets that aggregate:
 * - Decisions made (auto + human)
 * - Outcomes (executed, blocked, expired)
 * - Sentinel events (anomalies, warnings, critical)
 * - Trust receipts (policy applications)
 *
 * Reflection prompts follow: Pattern → Contrast → Open Interpretation
 * Human response options: keep, adjust, watch, ignore
 * "Adjust" responses create proposal packets (routed through normal approval flow)
 *
 * INVARIANT: Weekly review NEVER auto-executes. All adjustments go through proposals.
 */

import { desc, eq, and, gte, lte, sql } from "drizzle-orm";
import { getDb } from "./db";
import {
  mailboxEntries,
  sentinelEvents,
  ledger,
} from "../drizzle/schema";
import { appendToMailbox, generateTraceId } from "./mailbox";

// ─────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────

export interface WeeklyReviewPacket {
  review_id: string;
  period: { start: string; end: string };
  totals: {
    proposals_submitted: number;
    auto_approved: number;
    human_approved: number;
    denied: number;
    blocked: number;
    expired: number;
  };
  highlights: {
    type: string;
    description: string;
    trace_id: string;
    significance: "high" | "medium" | "low";
  }[];
  mismatches: {
    type: string;
    expected: string;
    observed: string;
    trace_id: string;
  }[];
  trust_exceptions: {
    policy_id: string;
    exception_type: string;
    count: number;
  }[];
  reflection_prompts: ReflectionPrompt[];
  suggested_adjustments: SuggestedAdjustment[];
}

export interface ReflectionPrompt {
  prompt_id: string;
  category: "pattern" | "contrast" | "open_interpretation";
  question: string;
  context: string;
  data_reference: string | null;
}

export interface SuggestedAdjustment {
  adjustment_id: string;
  category: string;
  description: string;
  current_value: string;
  suggested_value: string;
  rationale: string;
}

export type HumanResponseOption = "keep" | "adjust" | "watch" | "ignore";

export interface ReviewResponse {
  prompt_id: string;
  response: HumanResponseOption;
  comment?: string;
}

// ─────────────────────────────────────────────────────────────────
// Night Batch: Generate Weekly Review Packet
// ─────────────────────────────────────────────────────────────────

export async function generateWeeklyReviewPacket(
  periodStart?: Date,
  periodEnd?: Date
): Promise<WeeklyReviewPacket> {
  const end = periodEnd || new Date();
  const start = periodStart || new Date(end.getTime() - 7 * 24 * 60 * 60 * 1000);

  const reviewId = `review_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

  // Gather data from mailboxes
  const totals = await gatherTotals(start, end);
  const highlights = await gatherHighlights(start, end);
  const mismatches = await gatherMismatches(start, end);
  const trustExceptions = await gatherTrustExceptions(start, end);

  // Generate reflection prompts based on the data
  const reflectionPrompts = generateReflectionPrompts(
    reviewId,
    totals,
    highlights,
    mismatches,
    trustExceptions
  );

  // Generate suggested adjustments
  const suggestedAdjustments = generateSuggestedAdjustments(
    reviewId,
    totals,
    highlights,
    trustExceptions
  );

  const packet: WeeklyReviewPacket = {
    review_id: reviewId,
    period: { start: start.toISOString(), end: end.toISOString() },
    totals,
    highlights,
    mismatches,
    trust_exceptions: trustExceptions,
    reflection_prompts: reflectionPrompts,
    suggested_adjustments: suggestedAdjustments,
  };

  return packet;
}

// ─────────────────────────────────────────────────────────────────
// Write Review Packet to Mailbox
// ─────────────────────────────────────────────────────────────────

export async function publishWeeklyReview(
  packet: WeeklyReviewPacket
): Promise<{ traceId: string; packetId: string }> {
  const traceId = generateTraceId();

  const entry = await appendToMailbox({
    mailboxType: "proposal",
    packetType: "weekly_review_packet",
    sourceAgent: "night_batch",
    targetAgent: "human",
    status: "pending",
    payload: packet as unknown as Record<string, unknown>,
    traceId,
  });

  // Also write individual reflection prompts as separate mailbox entries
  for (const prompt of packet.reflection_prompts) {
    await appendToMailbox({
      mailboxType: "proposal",
      packetType: "reflection_prompt",
      sourceAgent: "night_batch",
      targetAgent: "human",
      status: "pending",
      payload: prompt as unknown as Record<string, unknown>,
      traceId,
      parentPacketId: entry.packetId,
    });
  }

  return { traceId, packetId: entry.packetId };
}

// ─────────────────────────────────────────────────────────────────
// Process Human Responses
// ─────────────────────────────────────────────────────────────────

export async function processReviewResponse(
  response: ReviewResponse,
  reviewTraceId: string
): Promise<{ action: string; proposalTraceId?: string }> {
  // Record the response in the mailbox
  await appendToMailbox({
    mailboxType: "proposal",
    packetType: "review_response",
    sourceAgent: "human",
    targetAgent: "system",
    status: "processed",
    payload: {
      prompt_id: response.prompt_id,
      response: response.response,
      comment: response.comment || null,
      responded_at: new Date().toISOString(),
    },
    traceId: reviewTraceId,
  });

  switch (response.response) {
    case "keep":
      return { action: "acknowledged" };

    case "watch":
      // Create a sentinel watch entry
      await appendToMailbox({
        mailboxType: "sentinel",
        packetType: "watch_request",
        sourceAgent: "human",
        targetAgent: "sentinel",
        status: "pending",
        payload: {
          prompt_id: response.prompt_id,
          comment: response.comment || null,
          watch_until: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
        },
        traceId: reviewTraceId,
      });
      return { action: "watch_created" };

    case "adjust": {
      // Create a proposal packet — routed through normal approval flow
      const proposalTraceId = generateTraceId();
      await appendToMailbox({
        mailboxType: "proposal",
        packetType: "proposal_packet",
        sourceAgent: "human",
        targetAgent: "system",
        status: "pending",
        payload: {
          type: "review_adjustment",
          origin: "weekly_review",
          prompt_id: response.prompt_id,
          comment: response.comment || null,
          risk_tier: "MEDIUM", // All review adjustments are MEDIUM risk
          requires_approval: true,
        },
        traceId: proposalTraceId,
      });
      return { action: "proposal_created", proposalTraceId };
    }

    case "ignore":
      return { action: "ignored" };

    default:
      return { action: "unknown" };
  }
}

// ─────────────────────────────────────────────────────────────────
// Data Gathering (from mailboxes)
// ─────────────────────────────────────────────────────────────────

async function gatherTotals(
  start: Date,
  end: Date
): Promise<WeeklyReviewPacket["totals"]> {
  const db = await getDb();
  if (!db) {
    return {
      proposals_submitted: 0,
      auto_approved: 0,
      human_approved: 0,
      denied: 0,
      blocked: 0,
      expired: 0,
    };
  }

  // Count proposals in the period
  const proposals = await db
    .select()
    .from(mailboxEntries)
    .where(
      and(
        eq(mailboxEntries.mailboxType, "proposal"),
        eq(mailboxEntries.packetType, "proposal_packet"),
        gte(mailboxEntries.createdAt, start),
        lte(mailboxEntries.createdAt, end)
      )
    );

  // Count decisions in the period
  const decisions = await db
    .select()
    .from(mailboxEntries)
    .where(
      and(
        eq(mailboxEntries.mailboxType, "decision"),
        gte(mailboxEntries.createdAt, start),
        lte(mailboxEntries.createdAt, end)
      )
    );

  let autoApproved = 0;
  let humanApproved = 0;
  let denied = 0;
  let blocked = 0;

  for (const d of decisions) {
    const payload = d.payload as Record<string, any>;
    const decision = payload?.proposed_decision || payload?.enforced_decision;
    if (decision === "AUTO_APPROVE") autoApproved++;
    else if (decision === "EXECUTED") humanApproved++;
    else if (decision === "DENY") denied++;
    else if (decision === "BLOCKED") blocked++;
  }

  return {
    proposals_submitted: proposals.length,
    auto_approved: autoApproved,
    human_approved: humanApproved,
    denied,
    blocked,
    expired: 0, // Would need TTL tracking
  };
}

async function gatherHighlights(
  start: Date,
  end: Date
): Promise<WeeklyReviewPacket["highlights"]> {
  const db = await getDb();
  if (!db) return [];

  // Get sentinel events as highlights
  const events = await db
    .select()
    .from(sentinelEvents)
    .where(
      and(
        gte(sentinelEvents.createdAt, start),
        lte(sentinelEvents.createdAt, end)
      )
    )
    .orderBy(desc(sentinelEvents.createdAt))
    .limit(10);

  return events.map((e) => ({
    type: e.type,
    description: `${e.severity} ${e.type}: ${e.subject}`,
    trace_id: e.eventId,
    significance: e.severity === "CRITICAL"
      ? "high" as const
      : e.severity === "WARN"
      ? "medium" as const
      : "low" as const,
  }));
}

async function gatherMismatches(
  start: Date,
  end: Date
): Promise<WeeklyReviewPacket["mismatches"]> {
  const db = await getDb();
  if (!db) return [];

  // Look for blocked gateway enforcements (expected execution, got blocked)
  const blocked = await db
    .select()
    .from(mailboxEntries)
    .where(
      and(
        eq(mailboxEntries.mailboxType, "decision"),
        eq(mailboxEntries.packetType, "gateway_enforcement_object"),
        gte(mailboxEntries.createdAt, start),
        lte(mailboxEntries.createdAt, end)
      )
    );

  return blocked
    .filter((b) => {
      const payload = b.payload as Record<string, any>;
      return payload?.enforced_decision === "BLOCKED";
    })
    .map((b) => {
      const payload = b.payload as Record<string, any>;
      return {
        type: "enforcement_mismatch",
        expected: payload?.proposed_decision || "EXECUTED",
        observed: "BLOCKED",
        trace_id: b.traceId,
      };
    });
}

async function gatherTrustExceptions(
  start: Date,
  end: Date
): Promise<WeeklyReviewPacket["trust_exceptions"]> {
  const db = await getDb();
  if (!db) return [];

  // Look for REQUIRE_HUMAN decisions where trust would normally auto-approve
  const decisions = await db
    .select()
    .from(mailboxEntries)
    .where(
      and(
        eq(mailboxEntries.mailboxType, "decision"),
        eq(mailboxEntries.packetType, "kernel_decision_object"),
        gte(mailboxEntries.createdAt, start),
        lte(mailboxEntries.createdAt, end)
      )
    );

  const exceptions: Record<string, { type: string; count: number }> = {};

  for (const d of decisions) {
    const payload = d.payload as Record<string, any>;
    if (payload?.proposed_decision === "REQUIRE_HUMAN") {
      const key = payload?.baseline_pattern || "unknown";
      if (!exceptions[key]) {
        exceptions[key] = { type: "human_override_required", count: 0 };
      }
      exceptions[key].count++;
    }
  }

  return Object.entries(exceptions).map(([policyId, data]) => ({
    policy_id: policyId,
    exception_type: data.type,
    count: data.count,
  }));
}

// ─────────────────────────────────────────────────────────────────
// Reflection Prompt Generation
// ─────────────────────────────────────────────────────────────────

export function generateReflectionPrompts(
  reviewId: string,
  totals: WeeklyReviewPacket["totals"],
  highlights: WeeklyReviewPacket["highlights"],
  mismatches: WeeklyReviewPacket["mismatches"],
  trustExceptions: WeeklyReviewPacket["trust_exceptions"]
): ReflectionPrompt[] {
  const prompts: ReflectionPrompt[] = [];
  const promptId = (n: number) => `${reviewId}_prompt_${n}`;

  // Pattern prompt — based on totals
  const totalDecisions = totals.auto_approved + totals.human_approved + totals.denied + totals.blocked;
  if (totalDecisions > 0) {
    const autoRate = totalDecisions > 0
      ? ((totals.auto_approved / totalDecisions) * 100).toFixed(0)
      : "0";
    prompts.push({
      prompt_id: promptId(1),
      category: "pattern",
      question: `This week, ${autoRate}% of decisions were auto-approved. ${totals.denied > 0 ? `${totals.denied} were denied.` : ""} Does this pattern match your expectations for how the system should be operating?`,
      context: `Total decisions: ${totalDecisions}, Auto: ${totals.auto_approved}, Human: ${totals.human_approved}, Denied: ${totals.denied}`,
      data_reference: null,
    });
  }

  // Contrast prompt — based on mismatches
  if (mismatches.length > 0) {
    prompts.push({
      prompt_id: promptId(2),
      category: "contrast",
      question: `${mismatches.length} enforcement mismatch(es) occurred this week — actions were blocked that were expected to execute. Should the trust policies be adjusted, or were these blocks correct?`,
      context: mismatches.map((m) => `Expected ${m.expected}, got ${m.observed} (trace: ${m.trace_id})`).join("; "),
      data_reference: mismatches[0]?.trace_id || null,
    });
  }

  // Open interpretation prompt — based on highlights
  if (highlights.length > 0) {
    const highSignificance = highlights.filter((h) => h.significance === "high");
    if (highSignificance.length > 0) {
      prompts.push({
        prompt_id: promptId(3),
        category: "open_interpretation",
        question: `${highSignificance.length} high-significance event(s) were flagged this week. What do you think these indicate about the system's current state?`,
        context: highSignificance.map((h) => h.description).join("; "),
        data_reference: highSignificance[0]?.trace_id || null,
      });
    }
  }

  // Trust exception prompt
  if (trustExceptions.length > 0) {
    const totalExceptions = trustExceptions.reduce((sum, e) => sum + e.count, 0);
    prompts.push({
      prompt_id: promptId(4),
      category: "pattern",
      question: `${totalExceptions} trust exception(s) required human intervention this week. Are the current trust levels set correctly, or should some be adjusted?`,
      context: trustExceptions.map((e) => `${e.policy_id}: ${e.count} exceptions`).join("; "),
      data_reference: null,
    });
  }

  // Always include at least one open interpretation prompt
  if (prompts.filter((p) => p.category === "open_interpretation").length === 0) {
    prompts.push({
      prompt_id: promptId(5),
      category: "open_interpretation",
      question: "Looking at this week's activity overall, is there anything you'd like the system to handle differently going forward?",
      context: `Proposals: ${totals.proposals_submitted}, Highlights: ${highlights.length}, Mismatches: ${mismatches.length}`,
      data_reference: null,
    });
  }

  return prompts;
}

// ─────────────────────────────────────────────────────────────────
// Suggested Adjustments
// ─────────────────────────────────────────────────────────────────

export function generateSuggestedAdjustments(
  reviewId: string,
  totals: WeeklyReviewPacket["totals"],
  highlights: WeeklyReviewPacket["highlights"],
  trustExceptions: WeeklyReviewPacket["trust_exceptions"]
): SuggestedAdjustment[] {
  const adjustments: SuggestedAdjustment[] = [];
  const adjId = (n: number) => `${reviewId}_adj_${n}`;

  // If denial rate is high, suggest reviewing policies
  const totalDecisions = totals.auto_approved + totals.human_approved + totals.denied + totals.blocked;
  if (totalDecisions > 0 && totals.denied / totalDecisions > 0.3) {
    adjustments.push({
      adjustment_id: adjId(1),
      category: "policy",
      description: "High denial rate detected — review policy alignment",
      current_value: `${((totals.denied / totalDecisions) * 100).toFixed(0)}% denial rate`,
      suggested_value: "Review and potentially relax overly strict policies",
      rationale: "A denial rate above 30% may indicate policies are too restrictive for current operations",
    });
  }

  // If many trust exceptions, suggest trust level adjustment
  if (trustExceptions.length > 0) {
    const totalExceptions = trustExceptions.reduce((sum, e) => sum + e.count, 0);
    if (totalExceptions > 5) {
      adjustments.push({
        adjustment_id: adjId(2),
        category: "trust",
        description: "Frequent trust exceptions — consider trust level adjustment",
        current_value: `${totalExceptions} exceptions across ${trustExceptions.length} policies`,
        suggested_value: "Evaluate increasing trust level for frequently-excepted policies",
        rationale: "Repeated human interventions on the same policy suggest the trust level may be too conservative",
      });
    }
  }

  // If critical highlights, suggest sentinel threshold review
  const criticalHighlights = highlights.filter((h) => h.significance === "high");
  if (criticalHighlights.length > 3) {
    adjustments.push({
      adjustment_id: adjId(3),
      category: "sentinel",
      description: "Multiple critical events — review sentinel thresholds",
      current_value: `${criticalHighlights.length} critical events this week`,
      suggested_value: "Review whether thresholds are calibrated correctly",
      rationale: "Too many critical alerts may indicate thresholds are too sensitive or there is a systemic issue",
    });
  }

  return adjustments;
}
