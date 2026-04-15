/**
 * Reflection + Aftermath Model
 * 
 * Three signal types per the build packet:
 * 1. aftermath_auto — system-measured outcomes (execution time, error rate, cost)
 * 2. aftermath_inferred — LLM-derived observations from execution context
 * 3. aftermath_human — Brian's explicit feedback (thumbs up/down, notes)
 * 
 * These signals feed the learning loop but NEVER auto-modify policy.
 * Policy changes are always governed actions requiring human approval.
 * 
 * Invariant: Reflection informs proposals, never auto-executes changes.
 */

import { nanoid } from "nanoid";
import {
  getProposalPacket,
  updateProposalAftermath,
  appendLedger,
  getExecution,
  getExecutionByIntentId,
} from "./db";
import { invokeLLM } from "./_core/llm";

// ─── Types ───────────────────────────────────────────────────────

export interface AftermathAuto {
  executionTimeMs?: number;
  errorOccurred: boolean;
  errorMessage?: string;
  costCents?: number;
  retryCount?: number;
  outputSizeBytes?: number;
  gatewayLatencyMs?: number;
}

export interface AftermathInferred {
  summary: string;
  sentiment: "positive" | "neutral" | "negative" | "mixed";
  keyObservations: string[];
  suggestedImprovements: string[];
  confidenceScore: number; // 0-1
}

export interface AftermathHuman {
  rating: "thumbs_up" | "thumbs_down" | "neutral";
  note?: string;
  wouldRepeat: boolean;
  timestamp: number;
}

export interface ReflectionReport {
  proposalId: string;
  auto: AftermathAuto | null;
  inferred: AftermathInferred | null;
  human: AftermathHuman | null;
  overallAssessment: "success" | "partial" | "failure" | "pending";
  generatedAt: number;
}

// ─── Automatic Aftermath ─────────────────────────────────────────

/**
 * Collect automatic aftermath data from execution records.
 * This is purely system-measured — no LLM involved.
 */
export function collectAutoAftermath(execution: {
  startedAt?: number;
  completedAt?: number;
  status: string;
  error?: string;
  result?: Record<string, unknown>;
}): AftermathAuto {
  const executionTimeMs =
    execution.startedAt && execution.completedAt
      ? execution.completedAt - execution.startedAt
      : undefined;

  return {
    executionTimeMs,
    errorOccurred: execution.status === "failed" || !!execution.error,
    errorMessage: execution.error,
    retryCount: (execution.result as any)?.retryCount ?? 0,
  };
}

// ─── Inferred Aftermath ──────────────────────────────────────────

/**
 * Generate inferred aftermath using LLM analysis of execution context.
 * The LLM observes but NEVER recommends policy changes directly.
 */
export async function generateInferredAftermath(context: {
  proposalType: string;
  proposalCategory: string;
  action: string;
  executionResult: Record<string, unknown>;
  autoAftermath: AftermathAuto;
}): Promise<AftermathInferred> {
  const response = await invokeLLM({
    messages: [
      {
        role: "system",
        content: `You are an execution analyst for the RIO governance system. 
Analyze the execution outcome and provide observations.
NEVER recommend policy changes — only observe what happened.
Return JSON matching this schema:
{
  "summary": "one-sentence summary of what happened",
  "sentiment": "positive|neutral|negative|mixed",
  "keyObservations": ["observation 1", "observation 2"],
  "suggestedImprovements": ["improvement 1"],
  "confidenceScore": 0.0-1.0
}`,
      },
      {
        role: "user",
        content: `Analyze this execution:
Type: ${context.proposalType}
Category: ${context.proposalCategory}
Action: ${context.action}
Execution time: ${context.autoAftermath.executionTimeMs ?? "unknown"}ms
Error: ${context.autoAftermath.errorOccurred ? context.autoAftermath.errorMessage : "none"}
Result: ${JSON.stringify(context.executionResult).slice(0, 500)}`,
      },
    ],
    response_format: {
      type: "json_schema",
      json_schema: {
        name: "aftermath_inferred",
        strict: true,
        schema: {
          type: "object",
          properties: {
            summary: { type: "string" },
            sentiment: { type: "string", enum: ["positive", "neutral", "negative", "mixed"] },
            keyObservations: { type: "array", items: { type: "string" } },
            suggestedImprovements: { type: "array", items: { type: "string" } },
            confidenceScore: { type: "number" },
          },
          required: ["summary", "sentiment", "keyObservations", "suggestedImprovements", "confidenceScore"],
          additionalProperties: false,
        },
      },
    },
  });

  const content = response.choices?.[0]?.message?.content;
  if (!content) {
    return {
      summary: "Unable to generate inferred aftermath",
      sentiment: "neutral",
      keyObservations: [],
      suggestedImprovements: [],
      confidenceScore: 0,
    };
  }

  try {
    return JSON.parse(typeof content === "string" ? content : JSON.stringify(content));
  } catch {
    return {
      summary: "Failed to parse LLM response",
      sentiment: "neutral",
      keyObservations: [],
      suggestedImprovements: [],
      confidenceScore: 0,
    };
  }
}

// ─── Human Aftermath ─────────────────────────────────────────────

/**
 * Record human feedback on a proposal outcome.
 * This is Brian's explicit signal — the most authoritative aftermath.
 */
export async function recordHumanAftermath(
  proposalId: string,
  feedback: AftermathHuman
): Promise<void> {
  const proposal = await getProposalPacket(proposalId);
  const existingAftermath = (proposal?.aftermath as Record<string, unknown>) ?? {};
  await updateProposalAftermath(proposalId, {
    ...existingAftermath,
    human: feedback,
  });

  await appendLedger("PROPOSAL_EXECUTED", {
    proposalId,
    aftermathType: "human",
    rating: feedback.rating,
    wouldRepeat: feedback.wouldRepeat,
    note: feedback.note,
  });
}

// ─── Full Reflection Report ──────────────────────────────────────

/**
 * Build a complete reflection report for a proposal.
 * Combines all three aftermath signals.
 */
export async function buildReflectionReport(proposalId: string): Promise<ReflectionReport | null> {
  const proposal = await getProposalPacket(proposalId);
  if (!proposal) return null;

  // Parse stored aftermath data from the single JSON column
  let auto: AftermathAuto | null = null;
  let inferred: AftermathInferred | null = null;
  let human: AftermathHuman | null = null;

  const aftermath = proposal.aftermath as Record<string, unknown> | null;
  if (aftermath) {
    try { if (aftermath.auto) auto = aftermath.auto as AftermathAuto; } catch {}
    try { if (aftermath.inferred) inferred = aftermath.inferred as AftermathInferred; } catch {}
    try { if (aftermath.human) human = aftermath.human as AftermathHuman; } catch {}
  }

  // Determine overall assessment
  let overallAssessment: ReflectionReport["overallAssessment"] = "pending";
  if (proposal.status === "executed") {
    if (human?.rating === "thumbs_up") {
      overallAssessment = "success";
    } else if (human?.rating === "thumbs_down") {
      overallAssessment = "failure";
    } else if (auto?.errorOccurred) {
      overallAssessment = "failure";
    } else if (inferred?.sentiment === "positive") {
      overallAssessment = "success";
    } else if (inferred?.sentiment === "negative") {
      overallAssessment = "partial";
    } else {
      overallAssessment = "success"; // Executed without errors = success by default
    }
  } else if (proposal.status === "rejected" || proposal.status === "failed") {
    overallAssessment = "failure";
  }

  return {
    proposalId,
    auto,
    inferred,
    human,
    overallAssessment,
    generatedAt: Date.now(),
  };
}

/**
 * Run the full aftermath collection pipeline for a completed proposal.
 * 1. Collect auto aftermath from execution data
 * 2. Generate inferred aftermath via LLM
 * 3. Store both (human feedback comes separately)
 */
export async function runAftermathPipeline(
  proposalId: string,
  executionData: {
    startedAt?: number;
    completedAt?: number;
    status: string;
    error?: string;
    result?: Record<string, unknown>;
  }
): Promise<{ auto: AftermathAuto; inferred: AftermathInferred }> {
  const proposal = await getProposalPacket(proposalId);
  if (!proposal) throw new Error(`Proposal ${proposalId} not found`);

  // Step 1: Auto aftermath
  const auto = collectAutoAftermath(executionData);

  // Step 2: Inferred aftermath
  const inferred = await generateInferredAftermath({
    proposalType: proposal.type,
    proposalCategory: proposal.category,
    action: proposal.type,
    executionResult: executionData.result ?? {},
    autoAftermath: auto,
  });

  // Step 3: Store both in the single aftermath JSON column
  const existingProposal = await getProposalPacket(proposalId);
  const existingAftermath = (existingProposal?.aftermath as Record<string, unknown>) ?? {};
  await updateProposalAftermath(proposalId, {
    ...existingAftermath,
    auto,
    inferred,
  });

  return { auto, inferred };
}
