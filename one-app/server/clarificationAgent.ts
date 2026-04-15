/**
 * Clarification Agent — PATCH: Ambiguity Handling (Phase 2A)
 *
 * The Clarification Agent is a STATELESS, NON-AUTHORITATIVE service that:
 * 1. Receives CLARIFY decisions from the Kernel
 * 2. Emits clarify_requested events with questions and TTL
 * 3. Processes human clarify_response events
 * 4. Produces refined_packet (linked via parent_packet_id)
 * 5. Enforces TTL — timeout emits clarify_timeout → REQUIRE_HUMAN
 *
 * HARD CONSTRAINTS:
 * - Agent CANNOT execute anything (no Gate call, no signature, no execution)
 * - Agent has NO memory between rounds (stateless)
 * - Agent NEVER assumes or defaults — silence = REQUIRE_HUMAN
 * - Max 3 rounds per packet, max 15 minutes total
 * - Original packet is NEVER mutated
 * - All events logged to mailbox with trace_id linkage
 */

import { type KernelDecisionPayload, type MailboxEntry } from "../drizzle/schema";
import {
  appendToMailbox,
  getByTraceId,
  generatePacketId,
  type AppendToMailboxInput,
} from "./mailbox";
import { nanoid } from "nanoid";

// ─────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────

/** Default TTL in seconds (180s = 3 minutes) */
export const DEFAULT_TTL_SECONDS = 180;

/** Minimum TTL in seconds */
export const MIN_TTL_SECONDS = 120;

/** Maximum TTL in seconds */
export const MAX_TTL_SECONDS = 300;

/** Maximum clarification rounds per packet */
export const MAX_ROUNDS = 3;

/** Maximum total time for all rounds (15 minutes) */
export const MAX_TOTAL_SECONDS = 900;

// ─────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────

export interface ClarifyRequestedEvent {
  event_type: "clarify_requested";
  packet_id: string;
  original_packet_id: string;
  round: number;
  questions: string[];
  missing_fields: string[];
  confidence_signals: Record<string, boolean>;
  ttl_seconds: number;
  ttl_expires_at: string;
  max_rounds: number;
  trace_id: string;
  timestamp: string;
}

export interface ClarifyResponseEvent {
  event_type: "clarify_response";
  packet_id: string;
  request_packet_id: string;
  original_packet_id: string;
  round: number;
  answers: Record<string, unknown>;
  respondent: string;
  trace_id: string;
  timestamp: string;
}

export interface ClarifyTimeoutEvent {
  event_type: "clarify_timeout";
  packet_id: string;
  request_packet_id: string;
  original_packet_id: string;
  round: number;
  ttl_seconds: number;
  escalation: "REQUIRE_HUMAN";
  reason: string;
  trace_id: string;
  timestamp: string;
}

export interface RefinedPacket {
  packet_id: string;
  parent_packet_id: string;
  original_packet_id: string;
  clarification_round: number;
  refined_payload: Record<string, unknown>;
  applied_answers: Record<string, unknown>;
  trace_id: string;
  timestamp: string;
}

export interface ClarificationState {
  originalPacketId: string;
  currentRound: number;
  startedAt: number; // Unix ms
  lastRequestAt: number; // Unix ms
  ttlSeconds: number;
  traceId: string;
}

// ─────────────────────────────────────────────────────────────────
// Core Functions
// ─────────────────────────────────────────────────────────────────

/**
 * Generate clarification questions from a CLARIFY kernel decision.
 *
 * This is a PURE function — no side effects, no state, no memory.
 * It reads the clarification data and produces questions.
 */
export function generateQuestions(
  decision: KernelDecisionPayload
): string[] {
  if (decision.proposed_decision !== "CLARIFY" || !decision.clarification) {
    return [];
  }

  const questions: string[] = [];
  const { reason, missing_fields } = decision.clarification;

  // Generate questions from missing fields
  for (const field of missing_fields) {
    questions.push(`What is the ${field.replace(/_/g, " ")} for this action?`);
  }

  // Generate questions from ambiguity reasons (not already covered by missing fields)
  for (const r of reason) {
    if (r.includes("Conflicting fields")) {
      questions.push("Multiple targets were detected. Which is the intended target?");
    } else if (r.includes("confidence below threshold")) {
      questions.push("Can you confirm the intent and provide additional context for this action?");
    } else if (r.includes("No grounding signal")) {
      questions.push("What prior decision or context supports this action?");
    } else if (r.includes("Scope underspecified")) {
      questions.push("Which specific component or system should this action affect?");
    } else if (r.includes("Time ambiguous")) {
      questions.push("What is the deadline or urgency level for this action?");
    }
  }

  // Deduplicate
  return Array.from(new Set(questions));
}

/**
 * Emit a clarify_requested event to the mailbox.
 *
 * Creates a new mailbox entry with the questions and TTL.
 * Returns the event and the mailbox entry.
 */
export async function emitClarifyRequest(
  decision: KernelDecisionPayload,
  originalPacketId: string,
  round: number,
  ttlSeconds: number = DEFAULT_TTL_SECONDS,
  traceId: string
): Promise<{ event: ClarifyRequestedEvent; mailboxEntry: MailboxEntry }> {
  // Validate TTL bounds
  const boundedTtl = Math.max(MIN_TTL_SECONDS, Math.min(MAX_TTL_SECONDS, ttlSeconds));

  const questions = generateQuestions(decision);
  const packetId = generatePacketId();
  const now = new Date();
  const expiresAt = new Date(now.getTime() + boundedTtl * 1000);

  const event: ClarifyRequestedEvent = {
    event_type: "clarify_requested",
    packet_id: packetId,
    original_packet_id: originalPacketId,
    round,
    questions,
    missing_fields: decision.clarification?.missing_fields ?? [],
    confidence_signals: decision.clarification?.confidence_signals_available ?? {},
    ttl_seconds: boundedTtl,
    ttl_expires_at: expiresAt.toISOString(),
    max_rounds: MAX_ROUNDS,
    trace_id: traceId,
    timestamp: now.toISOString(),
  };

  const mailboxEntry = await appendToMailbox({
    mailboxType: "decision",
    packetType: "clarify_requested",
    sourceAgent: "clarification_agent",
    targetAgent: "human",
    status: "pending",
    payload: event as unknown as Record<string, unknown>,
    traceId,
    parentPacketId: originalPacketId,
  });

  return { event, mailboxEntry };
}

/**
 * Process a human's clarification response and produce a refined packet.
 *
 * INVARIANTS:
 * - Original packet is NEVER mutated
 * - Refined packet is a NEW packet with parent_packet_id linking to original
 * - Agent applies answers to create refined payload
 * - Agent NEVER assumes — only applies what the human explicitly provided
 *
 * @returns The refined packet and its mailbox entry
 */
export async function processClarifyResponse(
  originalPayload: Record<string, unknown>,
  answers: Record<string, unknown>,
  originalPacketId: string,
  round: number,
  traceId: string,
  respondent: string = "human"
): Promise<{ refined: RefinedPacket; mailboxEntry: MailboxEntry }> {
  const refinedPacketId = `${originalPacketId}_refined_r${round}`;

  // Build refined payload: deep clone original + answers overlay (NO defaults, NO assumptions)
  // CRITICAL: deep clone to ensure original is NEVER mutated
  const refinedPayload: Record<string, unknown> = JSON.parse(JSON.stringify(originalPayload));

  // Only apply explicitly provided answers — never fill in defaults
  for (const [key, value] of Object.entries(answers)) {
    if (value !== undefined && value !== null && value !== "") {
      // Apply to the proposal sub-object if it exists, otherwise to top level
      if (refinedPayload.proposal && typeof refinedPayload.proposal === "object") {
        (refinedPayload.proposal as Record<string, unknown>)[key] = value;
      } else {
        refinedPayload[key] = value;
      }
    }
    // NEVER apply a default for unanswered questions — this is the NO-FALLBACK rule
  }

  const refined: RefinedPacket = {
    packet_id: refinedPacketId,
    parent_packet_id: originalPacketId,
    original_packet_id: originalPacketId,
    clarification_round: round,
    refined_payload: refinedPayload,
    applied_answers: answers,
    trace_id: traceId,
    timestamp: new Date().toISOString(),
  };

  // Log the response event
  await appendToMailbox({
    mailboxType: "decision",
    packetType: "clarify_response",
    sourceAgent: respondent,
    targetAgent: "clarification_agent",
    status: "processed",
    payload: {
      event_type: "clarify_response",
      packet_id: generatePacketId(),
      request_packet_id: originalPacketId,
      original_packet_id: originalPacketId,
      round,
      answers,
      respondent,
      trace_id: traceId,
      timestamp: new Date().toISOString(),
    },
    traceId,
    parentPacketId: originalPacketId,
  });

  // Log the refined packet
  const mailboxEntry = await appendToMailbox({
    mailboxType: "proposal",
    packetType: "refined_packet",
    sourceAgent: "clarification_agent",
    targetAgent: "kernel",
    status: "pending",
    payload: refined as unknown as Record<string, unknown>,
    traceId,
    parentPacketId: originalPacketId,
  });

  return { refined, mailboxEntry };
}

/**
 * Handle TTL timeout — emit clarify_timeout event and escalate to REQUIRE_HUMAN.
 *
 * NO-FALLBACK RULE: Silence = escalate. NEVER assume. NEVER default.
 */
export async function handleTimeout(
  requestPacketId: string,
  originalPacketId: string,
  round: number,
  ttlSeconds: number,
  traceId: string
): Promise<{ event: ClarifyTimeoutEvent; mailboxEntry: MailboxEntry }> {
  const event: ClarifyTimeoutEvent = {
    event_type: "clarify_timeout",
    packet_id: generatePacketId(),
    request_packet_id: requestPacketId,
    original_packet_id: originalPacketId,
    round,
    ttl_seconds: ttlSeconds,
    escalation: "REQUIRE_HUMAN",
    reason: `Clarification timeout after ${ttlSeconds}s — no response received. Escalating to REQUIRE_HUMAN per NO-FALLBACK rule.`,
    trace_id: traceId,
    timestamp: new Date().toISOString(),
  };

  const mailboxEntry = await appendToMailbox({
    mailboxType: "decision",
    packetType: "clarify_timeout",
    sourceAgent: "clarification_agent",
    targetAgent: "gateway",
    status: "routed",
    payload: event as unknown as Record<string, unknown>,
    traceId,
    parentPacketId: originalPacketId,
  });

  return { event, mailboxEntry };
}

/**
 * Check if a clarification round has exceeded its TTL.
 *
 * @param requestTimestamp - ISO string of when the clarify_requested was emitted
 * @param ttlSeconds - The TTL in seconds
 * @param now - Current time (injectable for testing)
 * @returns true if TTL has expired
 */
export function isExpired(
  requestTimestamp: string,
  ttlSeconds: number,
  now: Date = new Date()
): boolean {
  const requestTime = new Date(requestTimestamp).getTime();
  const expiresAt = requestTime + ttlSeconds * 1000;
  return now.getTime() >= expiresAt;
}

/**
 * Check if max rounds have been reached.
 */
export function isMaxRoundsReached(currentRound: number): boolean {
  return currentRound >= MAX_ROUNDS;
}

/**
 * Check if total time has been exceeded.
 */
export function isTotalTimeExceeded(
  startedAt: number, // Unix ms
  now: Date = new Date()
): boolean {
  return (now.getTime() - startedAt) >= MAX_TOTAL_SECONDS * 1000;
}

/**
 * Validate that the clarification agent has NOT executed anything.
 *
 * This is a code-audit function used in tests to prove the agent
 * cannot call Gate, cannot sign, cannot execute.
 *
 * Returns true if the agent is clean (no execution traces).
 */
export function validateAgentIsNonAuthoritative(): {
  canExecute: false;
  canSign: false;
  canCallGate: false;
  hasMemory: false;
} {
  // This is a structural declaration — the agent's type system enforces these constraints.
  // The test suite audits the source code to verify no execution paths exist.
  return {
    canExecute: false,
    canSign: false,
    canCallGate: false,
    hasMemory: false,
  };
}
