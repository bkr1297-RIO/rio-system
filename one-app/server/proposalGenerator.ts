/**
 * proposalGenerator.ts — Phase 2A
 * 
 * Transforms research output into structured proposal packets.
 * Uses LLM for structured output matching the proposal packet schema.
 * 
 * Flow: Research data → LLM structured extraction → ProposalPacket → DB + Notion
 * 
 * Invariants:
 * - Proposals are NEVER auto-queued for approval
 * - All proposals surface in Notion for human decision
 * - Execution requires human signature via /authorize
 */

import { invokeLLM } from "./_core/llm";
import { nanoid } from "nanoid";
import { getBaselinePattern, createProposalPacket } from "./db";
import type { InsertProposalPacket } from "../drizzle/schema";

// ─── Types ─────────────────────────────────────────────────────────

export interface ResearchInput {
  /** Raw research data — could be text, structured data, or a summary */
  content: string;
  /** What type of proposal should be generated */
  type: "outreach" | "task" | "analysis" | "financial" | "follow_up";
  /** Category for trust policy matching and ranking */
  category: string;
  /** Optional: who/what is the target of this proposal */
  target?: string;
  /** Optional: additional context for the LLM */
  context?: string;
  /** Optional: who created this research (agent name or principal ID) */
  createdBy?: string;
}

export interface ProposalPacketOutput {
  proposalId: string;
  type: string;
  category: string;
  riskTier: "LOW" | "MEDIUM" | "HIGH";
  riskFactors: string[];
  baselinePattern: {
    approval_rate_14d: number;
    avg_velocity_seconds: number;
    edit_rate: number;
  };
  proposal: {
    title?: string;
    subject?: string;
    body: string;
    action_needed?: string;
    draft_email?: string;
  };
  whyItMatters: string;
  reasoning: string;
}

// ─── LLM Structured Extraction ─────────────────────────────────────

const PROPOSAL_SYSTEM_PROMPT = `You are a proposal generator for the RIO governance system. Your job is to transform research data into structured proposal packets.

Rules:
- Be specific and actionable in the proposal body
- Risk tier must be LOW, MEDIUM, or HIGH based on:
  - LOW: internal actions, no external impact, easily reversible
  - MEDIUM: external actions with bounded impact (e.g., sending an email to a known contact)
  - HIGH: financial actions, irreversible actions, actions affecting many people
- Risk factors must explain WHY this risk tier was chosen
- "why_it_matters" should be a concise 1-2 sentence explanation of business value
- "reasoning" should explain the AI's logic for proposing this specific action
- For outreach proposals, include subject, body, and draft_email
- For other proposals, include title, body, and action_needed

CRITICAL: You are generating a PROPOSAL. The human will review and decide. Never assume approval.`;

const PROPOSAL_JSON_SCHEMA = {
  type: "json_schema" as const,
  json_schema: {
    name: "proposal_packet",
    strict: true,
    schema: {
      type: "object",
      properties: {
        risk_tier: {
          type: "string",
          enum: ["LOW", "MEDIUM", "HIGH"],
          description: "Risk assessment tier"
        },
        risk_factors: {
          type: "array",
          items: { type: "string" },
          description: "Reasons for the risk tier assessment"
        },
        proposal: {
          type: "object",
          properties: {
            title: { type: "string", description: "Proposal title (for non-outreach)" },
            subject: { type: "string", description: "Email subject (for outreach)" },
            body: { type: "string", description: "Main proposal content" },
            action_needed: { type: "string", description: "What action is being proposed (for non-outreach)" },
            draft_email: { type: "string", description: "Draft email text (for outreach)" }
          },
          required: ["body"],
          additionalProperties: false
        },
        why_it_matters: {
          type: "string",
          description: "1-2 sentence business value explanation"
        },
        reasoning: {
          type: "string",
          description: "AI reasoning for proposing this action"
        }
      },
      required: ["risk_tier", "risk_factors", "proposal", "why_it_matters", "reasoning"],
      additionalProperties: false
    }
  }
};

/**
 * Generate a structured proposal packet from research input.
 * Uses LLM for risk assessment and proposal structuring.
 * Returns the proposal packet ready for DB insertion and Notion writing.
 */
export async function generateProposalFromResearch(input: ResearchInput): Promise<ProposalPacketOutput> {
  // Get baseline pattern for contrast detection
  const baseline = await getBaselinePattern(input.category);

  const userPrompt = `Generate a structured proposal packet from the following research:

Type: ${input.type}
Category: ${input.category}
${input.target ? `Target: ${input.target}` : ""}
${input.context ? `Context: ${input.context}` : ""}

Research Data:
${input.content}

Baseline Pattern (recent 14-day stats for this category):
- Approval rate: ${baseline.approval_rate_14d.toFixed(2)}
- Average velocity: ${baseline.avg_velocity_seconds}s
- Edit rate: ${baseline.edit_rate.toFixed(2)}

Generate the proposal packet with appropriate risk assessment.`;

  const response = await invokeLLM({
    messages: [
      { role: "system", content: PROPOSAL_SYSTEM_PROMPT },
      { role: "user", content: userPrompt }
    ],
    response_format: PROPOSAL_JSON_SCHEMA
  });

  const rawContent = response.choices?.[0]?.message?.content;
  if (!rawContent) throw new Error("LLM returned empty response for proposal generation");
  const content = typeof rawContent === "string" ? rawContent : JSON.stringify(rawContent);

  const parsed = JSON.parse(content);
  const proposalId = `proposal_${nanoid(16)}`;

  return {
    proposalId,
    type: input.type,
    category: input.category,
    riskTier: parsed.risk_tier,
    riskFactors: parsed.risk_factors,
    baselinePattern: baseline,
    proposal: parsed.proposal,
    whyItMatters: parsed.why_it_matters,
    reasoning: parsed.reasoning
  };
}

/**
 * Create a proposal packet in the database from a generated output.
 * Does NOT write to Notion — that's handled by notionProposalWriter.
 * Does NOT auto-queue for approval — surfaces in Notion for human decision.
 */
export async function saveProposalToDb(packet: ProposalPacketOutput, createdBy: string = "system") {
  const dbData: Omit<InsertProposalPacket, "id" | "createdAt" | "updatedAt"> = {
    proposalId: packet.proposalId,
    type: packet.type as any,
    category: packet.category,
    riskTier: packet.riskTier as any,
    riskFactors: packet.riskFactors,
    baselinePattern: packet.baselinePattern,
    proposal: packet.proposal,
    whyItMatters: packet.whyItMatters,
    reasoning: packet.reasoning,
    status: "proposed",
    createdBy
  };

  return createProposalPacket(dbData);
}

/**
 * Full pipeline: research → LLM → DB.
 * Returns the saved proposal packet.
 * Notion writing is a separate step (notionProposalWriter).
 */
export async function createProposalFromResearch(input: ResearchInput) {
  const packet = await generateProposalFromResearch(input);
  const saved = await saveProposalToDb(packet, input.createdBy ?? "system");
  return { packet, saved };
}
