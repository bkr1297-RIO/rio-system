/**
 * RIO Unified Intent Pipeline
 * ═══════════════════════════════════════════════════════════════
 * One system, one flow, two directions.
 *
 * ALL inputs and outputs flow through:
 *   Intent Packet → Policy → Decision → Execution (if allowed) → Receipt
 *
 * Inbound (classify_message):
 *   External message → Intent Packet → Policy Engine → Decision → Receipt
 *   (classify only — no execution)
 *
 * Outbound (send_email, send_sms, etc.):
 *   Agent/Human draft → Intent Packet → Policy Engine → Decision → Approval → Execution → Receipt
 *   (execute only if approved)
 *
 * Design rules:
 *   - Same rules engine for both directions
 *   - Same decision types: allow, block, require_confirmation (outbound only)
 *   - Same receipt shape for every decision
 *   - No new rules, no new integrations, no logic changes
 *   - Uses existing scanEmail engine + action store + governance ledger
 */

import { createHash } from "crypto";
import { nanoid } from "nanoid";
import {
  createAction,
  claimAction,
  completeAction,
  failAction,
  type RIOAction,
  type ActionSource,
} from "./actionStore";
import {
  scanEmail,
  type ChannelType,
  type StrictnessLevel,
  type EventType,
} from "./emailFirewall";
import { storeGovernedReceipt } from "./firewallGovernance";
import { writeState, readState } from "./continuity";
import { validateAtSubstrate, type SubstrateResult } from "./integritySubstrate";

// ═══════════════════════════════════════════════════════════════
// INTENT PACKET — the universal input format
// ═══════════════════════════════════════════════════════════════

export type IntentDirection = "inbound" | "outbound";

export interface IntentPacket {
  /** Unique intent ID */
  intent_id: string;
  /** Direction: inbound (classify) or outbound (execute) */
  direction: IntentDirection;
  /** Who created this intent */
  source: ActionSource | "external";
  /** Role in the governance model */
  role: "proposer" | "executor" | "observer";
  /** What action to perform */
  action: string;
  /** Action-specific payload */
  data: Record<string, unknown>;
  /** Current status in the pipeline */
  status: "pending" | "policy_check" | "awaiting_confirmation" | "approved" | "executing" | "completed" | "blocked" | "failed";
  /** Channel (for routing to correct policy rules) */
  channel: ChannelType | "telegram";
  /** ISO timestamp */
  timestamp: string;
}

// ═══════════════════════════════════════════════════════════════
// PIPELINE DECISION — unified for both directions
// ═══════════════════════════════════════════════════════════════

export type PipelineDecision = "allow" | "block" | "require_confirmation";

export interface PipelineResult {
  /** The intent that was processed */
  intent: IntentPacket;
  /** The decision made by the policy engine */
  decision: PipelineDecision;
  /** The underlying firewall event type */
  event_type: EventType;
  /** Confidence level */
  confidence: string;
  /** Numeric confidence (0.0-1.0) */
  confidence_score: number;
  /** Rules that matched */
  matched_rules: Array<{
    rule_id: string;
    category: string;
    reason: string;
    action: string;
  }>;
  /** Human-readable reason */
  reason: string;
  /** Suggested edit (for block/flag) */
  suggested_edit: string | null;
  /** Whether execution happened (outbound only) */
  executed: boolean;
  /** Execution result (outbound only, if executed) */
  execution_result: Record<string, unknown> | null;
  /** Receipt from the governance ledger */
  receipt: PipelineReceipt;
  /** The action store entry */
  action_id: string;
  /** Action store receipt ID (from ledger) */
  action_receipt_id: string | null;
}

// ═══════════════════════════════════════════════════════════════
// PIPELINE RECEIPT — identical shape for every decision
// ═══════════════════════════════════════════════════════════════

export interface PipelineReceipt {
  /** Receipt ID */
  intent_id: string;
  /** The decision */
  decision: PipelineDecision;
  /** Direction */
  direction: IntentDirection;
  /** Human-readable reason */
  reason: string;
  /** ISO timestamp */
  timestamp: string;
  /** SHA-256 hash of the intent + decision for integrity */
  hash: string;
}

// ═══════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════

function sha256(data: string): string {
  return createHash("sha256").update(data).digest("hex");
}

/** Map firewall EventType to unified PipelineDecision */
function mapDecision(eventType: EventType, direction: IntentDirection): PipelineDecision {
  switch (eventType) {
    case "BLOCK":
      return "block";
    case "FLAG":
    case "WARN":
      // Outbound: FLAG/WARN means require confirmation before sending
      // Inbound: FLAG/WARN means allow (classify only, no execution to gate)
      return direction === "outbound" ? "require_confirmation" : "allow";
    case "PASS":
    case "OVERRIDE":
      return "allow";
    default:
      return "block"; // fail closed
  }
}

/** Map channel to firewall channel type */
function normalizeChannel(channel: ChannelType | "telegram"): ChannelType {
  // Telegram maps to SMS-like (short text messages)
  if (channel === "telegram") return "sms";
  return channel;
}

/** Build the receipt hash — covers intent + decision for integrity */
function buildReceiptHash(intentId: string, decision: PipelineDecision, reason: string, timestamp: string): string {
  return sha256(JSON.stringify({ intentId, decision, reason, timestamp }));
}

// ═══════════════════════════════════════════════════════════════
// UNIFIED PIPELINE — the single path
// ═══════════════════════════════════════════════════════════════

/**
 * Process an intent through the unified pipeline.
 *
 * Both inbound and outbound flow through the same path:
 *   1. Create Intent Packet
 *   2. Enter action store (pending)
 *   3. Run through policy engine (same rules, same scoring)
 *   4. Make decision (allow / block / require_confirmation)
 *   5. For outbound + allow: execute (via provided executor)
 *   6. Generate receipt (identical shape for both directions)
 *   7. Log to governance ledger
 *
 * @param packet - The intent packet to process
 * @param executor - Optional execution function (outbound only, called if decision is "allow")
 * @param options - Pipeline options
 */
export async function processIntent(
  packet: IntentPacket,
  executor?: (data: Record<string, unknown>) => Promise<Record<string, unknown>>,
  options?: {
    strictness?: StrictnessLevel;
    useLLM?: boolean;
    /** Skip substrate checks (for testing or internal re-processing) */
    skipSubstrate?: boolean;
    /** Provide a nonce (if not provided, one is generated) */
    nonce?: string;
  },
): Promise<PipelineResult> {
  const strictness = options?.strictness ?? "standard";
  const useLLM = options?.useLLM ?? (packet.direction === "inbound"); // LLM for inbound classification, fast rules for outbound gate

  // ─── Step 0: Integrity Substrate ────────────────────────────
  // Runs BEFORE any governance surface sees the message.
  // Checks: nonce, dedup, replay, receipt linkage.
  // If any check fails → BLOCKED and LOGGED at substrate level.
  if (!options?.skipSubstrate) {
    const messageContent = String(packet.data.message || packet.data.body || "");
    const nonce = options?.nonce || `NONCE-${nanoid(16)}`;

    const substrateResult = validateAtSubstrate({
      content: messageContent,
      nonce,
      source: String(packet.source),
      action: packet.action,
      channel: String(packet.channel),
    });

    if (!substrateResult.passed) {
      // Substrate blocked — governance surfaces never see this message
      const blockReason = `Integrity Substrate: ${substrateResult.block_reason}`;
      const receiptTimestamp = new Date().toISOString();

      const blockedReceipt: PipelineReceipt = {
        intent_id: `SUBSTRATE-${nanoid(12)}`,
        decision: "block",
        direction: packet.direction,
        reason: blockReason,
        timestamp: receiptTimestamp,
        hash: buildReceiptHash(`SUBSTRATE-${nanoid(12)}`, "block", blockReason, receiptTimestamp),
      };

      return {
        intent: { ...packet, status: "blocked" },
        decision: "block",
        event_type: "BLOCK",
        confidence: "high",
        confidence_score: 1.0,
        matched_rules: [{
          rule_id: "SUBSTRATE",
          category: "INTEGRITY",
          reason: blockReason,
          action: "BLOCK",
        }],
        reason: blockReason,
        suggested_edit: null,
        executed: false,
        execution_result: null,
        receipt: blockedReceipt,
        action_id: `SUBSTRATE-BLOCKED`,
        action_receipt_id: null,
      };
    }

    // Attach substrate metadata to the packet for downstream tracing
    (packet.data as Record<string, unknown>)._substrate = {
      content_hash: substrateResult.content_hash,
      nonce,
      checks_passed: substrateResult.checks.length,
    };
  }

  // ─── Step 1: Enter action store ──────────────────────────────
  const source = packet.source === "external" ? "human" : packet.source;
  const rioAction = createAction(source as ActionSource, packet.action, {
    ...packet.data,
    _direction: packet.direction,
    _channel: packet.channel,
    _role: packet.role,
  });

  const claimed = claimAction(rioAction.id);
  if (!claimed) {
    throw new Error("PIPELINE_ERROR: Could not claim action — possible race condition");
  }

  // Update intent status
  packet.intent_id = rioAction.id;
  packet.status = "policy_check";

  // ─── Step 2: Run through policy engine ───────────────────────
  const firewallChannel = normalizeChannel(packet.channel);
  const messageText = String(packet.data.message || packet.data.body || "");
  const subject = packet.data.subject ? String(packet.data.subject) : null;
  const recipient = packet.data.recipient || packet.data.to
    ? String(packet.data.recipient || packet.data.to)
    : null;

  const { result: scanResult, receipt: firewallReceipt } = await scanEmail(
    messageText,
    subject,
    recipient,
    strictness,
    useLLM,
    undefined,
    firewallChannel,
  );

  // Store the firewall receipt in the governance ledger
  await storeGovernedReceipt(firewallReceipt);

  // ─── Step 3: Make decision ───────────────────────────────────
  const decision = mapDecision(scanResult.event_type, packet.direction);

  // ─── Step 4: Execute (outbound only, if allowed) ─────────────
  let executed = false;
  let executionResult: Record<string, unknown> | null = null;

  if (packet.direction === "outbound" && decision === "allow" && executor) {
    packet.status = "executing";
    try {
      executionResult = await executor(packet.data);
      executed = true;
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      await failAction(rioAction.id, `Execution failed: ${errMsg}`);

      // Still generate receipt for the failed execution
      const failReceipt: PipelineReceipt = {
        intent_id: rioAction.id,
        decision: "block", // execution failure = effective block
        direction: packet.direction,
        reason: `Execution failed: ${errMsg}`,
        timestamp: new Date().toISOString(),
        hash: buildReceiptHash(rioAction.id, "block", `Execution failed: ${errMsg}`, new Date().toISOString()),
      };

      return {
        intent: { ...packet, status: "failed" },
        decision: "block",
        event_type: scanResult.event_type,
        confidence: scanResult.confidence,
        confidence_score: firewallReceipt.confidence_score ?? 0,
        matched_rules: scanResult.matched_rules.map(r => ({
          rule_id: r.rule_id,
          category: r.category,
          reason: r.reason,
          action: r.action,
        })),
        reason: `Execution failed: ${errMsg}`,
        suggested_edit: null,
        executed: false,
        execution_result: null,
        receipt: failReceipt,
        action_id: rioAction.id,
        action_receipt_id: null,
      };
    }
  }

  // ─── Step 5: Generate receipt ────────────────────────────────
  const reason = decision === "block"
    ? firewallReceipt.reason_display || scanResult.summary || "Blocked by policy"
    : decision === "require_confirmation"
      ? firewallReceipt.reason_display || "Requires human confirmation before execution"
      : "Allowed by policy";

  const receiptTimestamp = new Date().toISOString();
  const pipelineReceipt: PipelineReceipt = {
    intent_id: rioAction.id,
    decision,
    direction: packet.direction,
    reason,
    timestamp: receiptTimestamp,
    hash: buildReceiptHash(rioAction.id, decision, reason, receiptTimestamp),
  };

  // ─── Step 6: Complete action in store ────────────────────────
  const finalStatus = decision === "block" ? "blocked"
    : decision === "require_confirmation" ? "awaiting_confirmation"
    : executed ? "completed"
    : "completed";

  packet.status = finalStatus;

  const resultPayload = {
    decision,
    direction: packet.direction,
    event_type: scanResult.event_type,
    confidence: scanResult.confidence,
    confidence_score: firewallReceipt.confidence_score ?? 0,
    matched_rules: scanResult.matched_rules.length,
    reason,
    executed,
    receipt_hash: pipelineReceipt.hash,
    ...(executionResult ? { execution_result: executionResult } : {}),
  };

  const completed = await completeAction(rioAction.id, resultPayload);

  // ─── Step 7: Update continuity state ─────────────────────────
  try {
    writeState(source as string, {
      last_decision: {
        action_id: rioAction.id,
        decision: scanResult.event_type,
        channel: packet.channel,
        confidence: scanResult.confidence,
        timestamp: receiptTimestamp,
      },
      last_note: `${packet.direction} ${packet.action}: ${decision} (${scanResult.confidence})`,
    });
  } catch { /* non-blocking */ }

  return {
    intent: packet,
    decision,
    event_type: scanResult.event_type,
    confidence: scanResult.confidence,
    confidence_score: firewallReceipt.confidence_score ?? 0,
    matched_rules: scanResult.matched_rules.map(r => ({
      rule_id: r.rule_id,
      category: r.category,
      reason: r.reason,
      action: r.action,
    })),
    reason,
    suggested_edit: firewallReceipt.suggested_edit || null,
    executed,
    execution_result: executionResult,
    receipt: pipelineReceipt,
    action_id: rioAction.id,
    action_receipt_id: completed?.receipt_id || null,
  };
}

// ═══════════════════════════════════════════════════════════════
// CONVENIENCE BUILDERS — create intent packets from raw input
// ═══════════════════════════════════════════════════════════════

/**
 * Build an inbound intent packet (classify_message).
 * Used by Telegram input, check-message API, etc.
 */
export function buildInboundIntent(params: {
  message: string;
  sender: string;
  channel: ChannelType | "telegram";
  source?: ActionSource | "external";
  metadata?: Record<string, unknown>;
}): IntentPacket {
  return {
    intent_id: "", // assigned by action store
    direction: "inbound",
    source: params.source ?? "external",
    role: "proposer",
    action: "classify_message",
    data: {
      message: params.message,
      sender: params.sender,
      ...(params.metadata || {}),
    },
    status: "pending",
    channel: params.channel,
    timestamp: new Date().toISOString(),
  };
}

/**
 * Build an outbound intent packet (send_email, send_sms, etc.).
 * Used by connectors, Jordan, human drafts, etc.
 */
export function buildOutboundIntent(params: {
  action: string;
  source: ActionSource | "external";
  data: Record<string, unknown>;
  channel: ChannelType | "telegram";
  metadata?: Record<string, unknown>;
}): IntentPacket {
  return {
    intent_id: "", // assigned by action store
    direction: "outbound",
    source: params.source,
    role: "proposer",
    action: params.action,
    data: {
      ...params.data,
      ...(params.metadata || {}),
    },
    status: "pending",
    channel: params.channel,
    timestamp: new Date().toISOString(),
  };
}
