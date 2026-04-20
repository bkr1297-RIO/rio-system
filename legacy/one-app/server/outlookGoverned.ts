/**
 * RIO Outlook Governed Integration — CBS Section 6
 * ──────────────────────────────────────────────────
 * Inbound: new email → envelope → Gateway → receipt
 * Outbound: intercept send → envelope → Gateway → enforce
 *
 * Uses the OutlookAdapter from adapters.ts.
 * All actions go through the full governance pipeline.
 */

import { randomUUID } from "crypto";
import { OutlookAdapter, type OutlookEvent } from "./adapters";
import { validateEnvelope, type GatewayDecision } from "./standardReceipt";
import { logEnvelope, logDecision, logError, logApproval } from "./driveSubFiles";
import { createPendingApproval } from "./approvalSystem";
import { recordSessionActivity, recordUserAction, setLastActionTimestamp, setLastError } from "./stateExpansion";
import { generateCanonicalReceipt, setLastReceiptHash } from "./authorityLayer";
import { syncToLibrarian } from "./librarian";
import { appendLedger, sha256 } from "./db";

// ─── Types ────────────────────────────────────────────────────

export interface OutlookGovernedResult {
  allowed: boolean;
  decision: GatewayDecision;
  receipt_id: string | null;
  approval_id: string | null;
  error: string | null;
}

// ─── Governed Send Email ──────────────────────────────────────

export async function governedOutlookSend(params: {
  to: string;
  subject: string;
  body: string;
  userId: string;
}): Promise<OutlookGovernedResult> {
  const event: OutlookEvent = {
    action: "send_email",
    to: params.to,
    subject: params.subject,
    body: params.body,
  };

  const envelope = OutlookAdapter.toActionEnvelope(event);

  // Validate envelope
  const validation = validateEnvelope(envelope as unknown);
  if (!validation.valid) {
    const error = `Envelope validation failed: ${validation.errors.join(", ")}`;
    logError(envelope.action_id, "ENVELOPE_VALIDATION", error, { source: "outlook" }).catch(() => {});
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
  recordUserAction(params.userId, "high"); // email send is high risk

  // Gateway evaluation — email sends are HIGH risk → REQUIRE_CONFIRMATION
  const decision: GatewayDecision = {
    action_id: envelope.action_id,
    result: "REQUIRE_CONFIRMATION",
    message: `Outlook email to ${params.to} requires approval (HIGH risk)`,
    cooldown_ms: 0,
    requires_confirmation: true,
  };

  // Log decision to Drive
  logDecision(decision).catch(() => {});

  // Create pending approval
  const approval = await createPendingApproval(envelope, decision);

  // Generate receipt (PENDING_APPROVAL — not yet executed)
  const now = new Date().toISOString();
  const receipt = generateCanonicalReceipt({
    intentId: envelope.action_id,
    proposerId: params.userId,
    approverId: "PENDING",
    tokenId: `TKN-${randomUUID().replace(/-/g, "").substring(0, 12)}`,
    action: "outlook_send_email",
    success: false,
    result: { status: "PENDING_APPROVAL", to: params.to, subject: params.subject },
    executor: "outlook-governed",
    ledgerEntryId: `LE-OUTLOOK-${randomUUID().replace(/-/g, "").substring(0, 8)}`,
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
      tool_name: "outlook_send_email",
      risk_tier: "HIGH",
      decision: "PENDING_APPROVAL",
      actor_id: params.userId,
      approval_id: approval.approval_id,
    });

    syncToLibrarian({
      receipt_id: receipt.receipt_id,
      receipt_hash: receipt.receipt_hash,
      previous_receipt_hash: receipt.previous_receipt_hash,
      proposer_id: params.userId,
      approver_id: "PENDING",
      decision: "PENDING_APPROVAL",
      snapshot_hash: receipt.snapshot_hash,
    }).catch(() => {});
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    setLastError(errorMsg);
    logError(envelope.action_id, "LEDGER_WRITE", errorMsg, { source: "outlook" }).catch(() => {});
  }

  return {
    allowed: false,
    decision,
    receipt_id: receipt.receipt_id,
    approval_id: approval.approval_id,
    error: null,
  };
}

// ─── Governed Read Email ──────────────────────────────────────

export async function governedOutlookRead(params: {
  messageId: string;
  userId: string;
}): Promise<OutlookGovernedResult> {
  const event: OutlookEvent = {
    action: "read_email",
    messageId: params.messageId,
  };

  const envelope = OutlookAdapter.toActionEnvelope(event);

  // Log envelope
  logEnvelope(envelope).catch(() => {});

  // Record session + behavior
  recordSessionActivity(params.userId);
  recordUserAction(params.userId, "low");

  // Low risk — auto-approve
  const decision: GatewayDecision = {
    action_id: envelope.action_id,
    result: "ALLOW",
    message: "Outlook read allowed (LOW risk)",
    cooldown_ms: 0,
    requires_confirmation: false,
  };

  logDecision(decision).catch(() => {});

  // Generate receipt
  const now = new Date().toISOString();
  const receipt = generateCanonicalReceipt({
    intentId: envelope.action_id,
    proposerId: params.userId,
    approverId: params.userId,
    tokenId: `TKN-${randomUUID().replace(/-/g, "").substring(0, 12)}`,
    action: "outlook_read_email",
    success: true,
    result: { status: "READ", messageId: params.messageId },
    executor: "outlook-governed",
    ledgerEntryId: `LE-OUTLOOK-${randomUUID().replace(/-/g, "").substring(0, 8)}`,
    timestampProposed: now,
    timestampApproved: now,
  });

  setLastReceiptHash(receipt.receipt_hash);
  setLastActionTimestamp(now);

  // Write to ledger
  try {
    await appendLedger("ACTION_COMPLETE", {
      receipt_hash: receipt.receipt_hash,
      previous_receipt_hash: receipt.previous_receipt_hash,
      tool_name: "outlook_read_email",
      risk_tier: "LOW",
      decision: "APPROVED",
      actor_id: params.userId,
    });

    syncToLibrarian({
      receipt_id: receipt.receipt_id,
      receipt_hash: receipt.receipt_hash,
      previous_receipt_hash: receipt.previous_receipt_hash,
      proposer_id: params.userId,
      approver_id: params.userId,
      decision: "APPROVED",
      snapshot_hash: receipt.snapshot_hash,
    }).catch(() => {});
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    setLastError(errorMsg);
  }

  return {
    allowed: true,
    decision,
    receipt_id: receipt.receipt_id,
    approval_id: null,
    error: null,
  };
}

// ─── Helper ───────────────────────────────────────────────────

function makeBlockDecision(actionId: string, message: string): GatewayDecision {
  return {
    action_id: actionId,
    result: "BLOCK",
    message,
    cooldown_ms: 0,
    requires_confirmation: false,
  };
}
