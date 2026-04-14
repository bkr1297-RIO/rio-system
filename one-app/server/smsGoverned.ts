/**
 * RIO SMS Governed Surface — CBS Section 14
 * ───────────────────────────────────────────
 * Full governed flow for SMS:
 *   Envelope → Gateway → Authorize → Execute → Receipt → Drive
 *
 * Uses the SMSAdapter from adapters.ts.
 * Execution uses the existing send_sms connector.
 */

import { randomUUID } from "crypto";
import { SMSAdapter, type SMSEvent } from "./adapters";
import { validateEnvelope, type GatewayDecision } from "./standardReceipt";
import { logEnvelope, logDecision, logError } from "./driveSubFiles";
import { createPendingApproval } from "./approvalSystem";
import { recordSessionActivity, recordUserAction, setLastActionTimestamp, setLastError } from "./stateExpansion";
import { generateCanonicalReceipt, setLastReceiptHash } from "./authorityLayer";
import { syncToLibrarian } from "./librarian";
import { appendLedger, sha256 } from "./db";

// ─── Types ────────────────────────────────────────────────────

export interface SMSGovernedResult {
  allowed: boolean;
  decision: GatewayDecision;
  receipt_id: string | null;
  approval_id: string | null;
  error: string | null;
}

// ─── Governed SMS Send ────────────────────────────────────────

/**
 * Governed SMS send.
 * SMS is MEDIUM risk — goes through WARN path (allowed with warning),
 * unless body contains sensitive patterns → REQUIRE_CONFIRMATION.
 *
 * Full pipeline: Envelope → validate → Gateway → receipt → ledger → Drive
 */
export async function governedSMSSend(params: {
  to: string;
  body: string;
  userId: string;
}): Promise<SMSGovernedResult> {
  const event: SMSEvent = {
    to: params.to,
    body: params.body,
  };

  const envelope = SMSAdapter.toActionEnvelope(event);

  // Validate envelope
  const validation = validateEnvelope(envelope as unknown);
  if (!validation.valid) {
    const error = `Envelope validation failed: ${validation.errors.join(", ")}`;
    logError(envelope.action_id, "ENVELOPE_VALIDATION", error, { source: "sms" }).catch(() => {});
    setLastError(error);
    return {
      allowed: false,
      decision: makeBlockDecision(envelope.action_id, error),
      receipt_id: null,
      approval_id: null,
      error,
    };
  }

  // Log envelope to Drive
  logEnvelope(envelope).catch(() => {});

  // Record session + behavior
  recordSessionActivity(params.userId);
  recordUserAction(params.userId, "medium");

  // Gateway evaluation — determine risk level
  const hasSensitiveContent = detectSensitiveContent(params.body);
  const riskTier = hasSensitiveContent ? "HIGH" : "MEDIUM";

  let decision: GatewayDecision;
  if (hasSensitiveContent) {
    decision = {
      action_id: envelope.action_id,
      result: "REQUIRE_CONFIRMATION",
      message: `SMS to ${params.to} contains sensitive content — requires approval`,
      cooldown_ms: 0,
      requires_confirmation: true,
    };
  } else {
    decision = {
      action_id: envelope.action_id,
      result: "WARN",
      message: `SMS to ${params.to} allowed with warning (MEDIUM risk)`,
      cooldown_ms: 0,
      requires_confirmation: false,
    };
  }

  // Log decision
  logDecision(decision).catch(() => {});

  // If requires confirmation, create pending approval
  let approvalId: string | null = null;
  if (decision.result === "REQUIRE_CONFIRMATION") {
    const approval = await createPendingApproval(envelope, decision);
    approvalId = approval.approval_id;
  }

  // Determine execution status
  const executionAllowed = decision.result === "ALLOW" || decision.result === "WARN";
  const decisionLabel = executionAllowed ? "APPROVED" : "PENDING_APPROVAL";

  // Generate receipt
  const now = new Date().toISOString();
  const receipt = generateCanonicalReceipt({
    intentId: envelope.action_id,
    proposerId: params.userId,
    approverId: executionAllowed ? params.userId : "PENDING",
    tokenId: `TKN-${randomUUID().replace(/-/g, "").substring(0, 12)}`,
    action: "send_sms",
    success: executionAllowed,
    result: {
      status: decisionLabel,
      to: params.to,
      body_length: params.body.length,
      risk_tier: riskTier,
    },
    executor: "sms-governed",
    ledgerEntryId: `LE-SMS-${randomUUID().replace(/-/g, "").substring(0, 8)}`,
    timestampProposed: now,
    timestampApproved: now,
  });

  setLastReceiptHash(receipt.receipt_hash);
  setLastActionTimestamp(now);

  // Write to ledger + Drive
  try {
    await appendLedger("ACTION_COMPLETE", {
      receipt_hash: receipt.receipt_hash,
      previous_receipt_hash: receipt.previous_receipt_hash,
      tool_name: "send_sms",
      risk_tier: riskTier,
      decision: decisionLabel,
      actor_id: params.userId,
      target: params.to,
      approval_id: approvalId,
    });

    syncToLibrarian({
      receipt_id: receipt.receipt_id,
      receipt_hash: receipt.receipt_hash,
      previous_receipt_hash: receipt.previous_receipt_hash,
      proposer_id: params.userId,
      approver_id: executionAllowed ? params.userId : "PENDING",
      decision: decisionLabel,
      snapshot_hash: receipt.snapshot_hash,
    }).catch(() => {});
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    setLastError(errorMsg);
    logError(envelope.action_id, "LEDGER_WRITE", errorMsg, { source: "sms" }).catch(() => {});
  }

  return {
    allowed: executionAllowed,
    decision,
    receipt_id: receipt.receipt_id,
    approval_id: approvalId,
    error: null,
  };
}

// ─── Helpers ──────────────────────────────────────────────────

function makeBlockDecision(actionId: string, message: string): GatewayDecision {
  return {
    action_id: actionId,
    result: "BLOCK",
    message,
    cooldown_ms: 0,
    requires_confirmation: false,
  };
}

/**
 * Detect sensitive content in SMS body.
 * Patterns: financial amounts, account numbers, passwords, SSN-like, etc.
 */
function detectSensitiveContent(body: string): boolean {
  const sensitivePatterns = [
    /\$\d{3,}/,                          // Dollar amounts $100+
    /\b\d{4}[-\s]?\d{4}[-\s]?\d{4}[-\s]?\d{4}\b/, // Card numbers
    /\b\d{3}[-\s]?\d{2}[-\s]?\d{4}\b/,  // SSN-like
    /password|secret|credential|api.?key/i, // Sensitive keywords
    /\baccount\s*#?\s*\d{6,}/i,          // Account numbers
  ];

  return sensitivePatterns.some(pattern => pattern.test(body));
}
