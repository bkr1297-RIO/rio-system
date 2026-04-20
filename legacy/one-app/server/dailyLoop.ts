/**
 * dailyLoop.ts — Phase 2B
 * 
 * Night batch proposer and follow-up detection.
 * 
 * Core rules:
 * - Runs as a scheduled batch (not real-time)
 * - Scans recent executions for follow-up opportunities
 * - Generates follow-up proposals via LLM
 * - All proposals surface in Notion for human decision — NEVER auto-queued
 * - Follow-ups are proposals, not actions — they require the same approval flow
 * 
 * Invariants:
 * - No proposal auto-queues for approval
 * - No proposal auto-executes
 * - All proposals go through the same governance pipeline
 * - The daily loop is a PROPOSER, not an EXECUTOR
 */

import { getDb, appendLedger } from "./db";
import { proposalPackets, ledger } from "../drizzle/schema";
import { eq, and, desc, gte, inArray } from "drizzle-orm";
import { invokeLLM } from "./_core/llm";
import { createProposalFromResearch } from "./proposalGenerator";
import { writeProposalToNotion, type ProposalForNotion } from "./notionProposalWriter";
import { rerankProposals } from "./flowControl";
import { ENV } from "./_core/env";

// ─── Types ────────────────────────────────────────────────────────

export interface FollowUpCandidate {
  proposalId: string;
  type: string;
  category: string;
  status: string;
  receiptId: string | null;
  executedAt: number;
  aftermath: unknown;
}

export interface DailyLoopResult {
  scannedCount: number;
  followUpCandidates: number;
  proposalsGenerated: number;
  errors: string[];
}

// ─── Follow-Up Detection ──────────────────────────────────────────

/**
 * Scan recent executed proposals for follow-up opportunities.
 * 
 * Criteria:
 * - Executed in the last 7 days
 * - No existing follow-up proposal for this parent
 * - Type is outreach or task (analysis/financial don't typically need follow-up)
 * - Aftermath doesn't indicate "worked" (if aftermath exists)
 */
export async function detectFollowUpCandidates(lookbackDays: number = 7): Promise<FollowUpCandidate[]> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const cutoff = new Date(Date.now() - lookbackDays * 24 * 60 * 60 * 1000);

  // Get recently executed proposals
  const executed = await db
    .select()
    .from(proposalPackets)
    .where(
      and(
        eq(proposalPackets.status, "executed"),
        gte(proposalPackets.updatedAt, cutoff),
        inArray(proposalPackets.type, ["outreach", "task"]),
      )
    )
    .orderBy(desc(proposalPackets.updatedAt));

  // Filter out those that already have follow-ups
  const candidates: FollowUpCandidate[] = [];
  for (const p of executed) {
    // Check if a follow-up already exists for this proposal
    const existingFollowUp = await db
      .select()
      .from(proposalPackets)
      .where(
        and(
          eq(proposalPackets.type, "follow_up"),
          eq(proposalPackets.category, `follow_up:${p.proposalId}`),
        )
      );

    if (existingFollowUp.length > 0) continue;

    // Check aftermath — skip if already marked as "worked"
    const aftermath = p.aftermath as { human?: { result?: string } } | null;
    if (aftermath?.human?.result === "worked") continue;

    candidates.push({
      proposalId: p.proposalId,
      type: p.type,
      category: p.category,
      status: p.status,
      receiptId: p.receiptId,
      executedAt: p.updatedAt.getTime(),
      aftermath: p.aftermath,
    });
  }

  return candidates;
}

// ─── Follow-Up Proposal Generation ───────────────────────────────

/**
 * Generate a follow-up proposal for a previously executed action.
 * Uses LLM to determine appropriate follow-up based on the original action.
 * 
 * Returns the new proposal ID, or null if LLM determines no follow-up needed.
 */
export async function generateFollowUpProposal(
  candidate: FollowUpCandidate,
  createdBy: string = "daily_loop"
): Promise<string | null> {
  // Build context for LLM
  const prompt = `You are analyzing a previously executed action to determine if a follow-up is needed.

Original action:
- Type: ${candidate.type}
- Category: ${candidate.category}
- Executed: ${new Date(candidate.executedAt).toISOString()}
- Receipt: ${candidate.receiptId || "none"}
- Aftermath: ${JSON.stringify(candidate.aftermath) || "none recorded"}

Determine if a follow-up action is appropriate. Consider:
1. For outreach: Was there a response? Should we follow up?
2. For tasks: Was the task completed successfully? Any next steps?
3. Time elapsed since execution
4. Whether aftermath indicates the action worked

If a follow-up IS needed, provide the follow-up content.
If NO follow-up is needed, respond with "NO_FOLLOW_UP_NEEDED".`;

  try {
    const response = await invokeLLM({
      messages: [
        { role: "system", content: "You are a follow-up detection system for a governed AI proxy. Your job is to identify when follow-up actions are appropriate and generate proposal content. Be conservative — only suggest follow-ups when there's a clear reason." },
        { role: "user", content: prompt },
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "follow_up_decision",
          strict: true,
          schema: {
            type: "object",
            properties: {
              needs_follow_up: { type: "boolean", description: "Whether a follow-up is needed" },
              reason: { type: "string", description: "Why or why not a follow-up is needed" },
              follow_up_content: { type: "string", description: "The follow-up proposal content, if needed" },
              urgency: { type: "string", enum: ["low", "medium", "high"], description: "How urgent the follow-up is" },
            },
            required: ["needs_follow_up", "reason", "follow_up_content", "urgency"],
            additionalProperties: false,
          },
        },
      },
    });

    const rawContent = response.choices?.[0]?.message?.content;
    if (!rawContent) return null;
    const content = typeof rawContent === "string" ? rawContent : JSON.stringify(rawContent);

    const decision = JSON.parse(content);
    if (!decision.needs_follow_up) return null;

    // Generate the follow-up proposal through the standard pipeline
    const { packet } = await createProposalFromResearch({
      content: decision.follow_up_content,
      type: "follow_up",
      category: `follow_up:${candidate.proposalId}`,
      target: candidate.category,
      context: `Follow-up for ${candidate.type} action (${candidate.proposalId}). Reason: ${decision.reason}`,
      createdBy,
    });

    // Write to Notion if configured
    if (ENV.notionApiToken && ENV.notionDecisionLogDbId) {
      try {
        const notionPageId = await writeProposalToNotion({
          proposalId: packet.proposalId,
          type: packet.type,
          category: packet.category,
          riskTier: packet.riskTier,
          riskFactors: packet.riskFactors,
          proposal: packet.proposal,
          whyItMatters: packet.whyItMatters,
          reasoning: packet.reasoning,
          baselinePattern: packet.baselinePattern,
        });

        // Update DB with Notion page ID
        const db = await getDb();
        if (db) {
          await db
            .update(proposalPackets)
            .set({ notionPageId, status: "proposed" })
            .where(eq(proposalPackets.proposalId, packet.proposalId));
        }
      } catch (err) {
        console.error(`[dailyLoop] Notion write failed for follow-up ${packet.proposalId}:`, err);
      }
    }

    // Log to ledger
    await appendLedger("PROPOSAL_CREATED", {
      proposal_id: packet.proposalId,
      type: "follow_up",
      category: `follow_up:${candidate.proposalId}`,
      parent_proposal_id: candidate.proposalId,
      created_by: createdBy,
      source: "daily_loop",
      timestamp: Date.now(),
    });

    return packet.proposalId;
  } catch (err) {
    console.error(`[dailyLoop] Follow-up generation failed for ${candidate.proposalId}:`, err);
    return null;
  }
}

// ─── Night Batch Runner ──────────────────────────────────────────

/**
 * Run the nightly batch process.
 * 
 * Steps:
 * 1. Detect follow-up candidates from recent executions
 * 2. Generate follow-up proposals for each candidate
 * 3. Rerank all proposals (flow control)
 * 4. Log results to ledger
 * 
 * Invariant: All proposals surface in Notion for human decision.
 * Nothing is auto-queued or auto-approved.
 */
export async function runNightBatch(createdBy: string = "daily_loop"): Promise<DailyLoopResult> {
  const result: DailyLoopResult = {
    scannedCount: 0,
    followUpCandidates: 0,
    proposalsGenerated: 0,
    errors: [],
  };

  try {
    // Step 1: Detect follow-up candidates
    const candidates = await detectFollowUpCandidates();
    result.scannedCount = candidates.length;
    result.followUpCandidates = candidates.length;

    // Step 2: Generate follow-up proposals
    for (const candidate of candidates) {
      try {
        const proposalId = await generateFollowUpProposal(candidate, createdBy);
        if (proposalId) {
          result.proposalsGenerated++;
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        result.errors.push(`Follow-up for ${candidate.proposalId}: ${msg}`);
      }
    }

    // Step 3: Rerank all proposals
    await rerankProposals();

    // Step 4: Log batch result to ledger
    await appendLedger("PROPOSAL_CREATED", {
      source: "daily_loop_batch",
      scanned: result.scannedCount,
      candidates: result.followUpCandidates,
      generated: result.proposalsGenerated,
      errors: result.errors.length,
      timestamp: Date.now(),
    });

  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    result.errors.push(`Batch error: ${msg}`);
  }

  return result;
}

/**
 * Check if the daily loop should run (simple time-based check).
 * Returns true if it's between 2-4 AM in the configured timezone.
 */
export function isNightBatchWindow(now: Date = new Date()): boolean {
  const hour = now.getUTCHours();
  // Default: run between 2-4 AM UTC (adjustable)
  return hour >= 2 && hour < 4;
}
