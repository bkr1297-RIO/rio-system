/**
 * RIO Approval System — CBS Section 10
 * ──────────────────────────────────────
 * Manages pending approvals for REQUIRE_CONFIRMATION decisions.
 *
 * Flow:
 *   1. Gateway returns REQUIRE_CONFIRMATION → approval created (PENDING)
 *   2. Approval stored in-memory + logged to Drive (approvals.json)
 *   3. Human approves via /rio/approve endpoint or Telegram
 *   4. Execution resumes with approval receipt
 *
 * Invariants:
 *   - Prefer proposer_id != approver_id
 *   - If same identity, enforce cooldown (CBS Section 10)
 *   - Expired approvals auto-reject
 */

import { randomUUID } from "crypto";
import { loadConfig } from "./rioConfig";
import { addCooldown, isInCooldown } from "./stateExpansion";
import { logApproval } from "./driveSubFiles";
import type { ActionEnvelope, GatewayDecision } from "./standardReceipt";

// ─── Types ────────────────────────────────────────────────────

export interface PendingApproval {
  approval_id: string;
  action_id: string;
  envelope: ActionEnvelope;
  decision: GatewayDecision;
  proposer_id: string;
  status: "PENDING" | "APPROVED" | "REJECTED" | "EXPIRED";
  requested_at: number;       // Unix ms
  expires_at: number;         // Unix ms
  resolved_at: number | null;
  approver_id: string | null;
  receipt_id: string | null;
}

// ─── In-Memory Store ──────────────────────────────────────────

const pendingApprovals = new Map<string, PendingApproval>();

// ─── Public API ───────────────────────────────────────────────

/**
 * Create a pending approval for a REQUIRE_CONFIRMATION decision.
 * Returns the approval_id for tracking.
 */
export async function createPendingApproval(
  envelope: ActionEnvelope,
  decision: GatewayDecision,
): Promise<PendingApproval> {
  const config = loadConfig();
  const now = Date.now();

  const approval: PendingApproval = {
    approval_id: `APR-${randomUUID().replace(/-/g, "").substring(0, 12)}`,
    action_id: envelope.action_id,
    envelope,
    decision,
    proposer_id: envelope.actor.id,
    status: "PENDING",
    requested_at: now,
    expires_at: now + config.approval_expiry_ms,
    resolved_at: null,
    approver_id: null,
    receipt_id: null,
  };

  pendingApprovals.set(approval.approval_id, approval);

  // Log to Drive (non-blocking)
  logApproval({
    action_id: envelope.action_id,
    proposer_id: envelope.actor.id,
    approver_id: null,
    status: "PENDING",
    requested_at: new Date(now).toISOString(),
    resolved_at: null,
    receipt_id: null,
  }).catch(() => { /* fail-silent */ });

  console.log(`[ApprovalSystem] Created: ${approval.approval_id} for action ${envelope.action_id}`);
  return approval;
}

/**
 * Approve a pending approval.
 * Returns the updated approval or null if not found/expired.
 *
 * CBS Section 10: prefer proposer != approver.
 * If same identity, enforce cooldown.
 */
export async function resolveApproval(
  approvalId: string,
  approverId: string,
  action: "APPROVED" | "REJECTED",
): Promise<{ approval: PendingApproval | null; error?: string }> {
  const approval = pendingApprovals.get(approvalId);
  if (!approval) {
    return { approval: null, error: "Approval not found" };
  }

  // Check expiry
  if (Date.now() > approval.expires_at) {
    approval.status = "EXPIRED";
    approval.resolved_at = Date.now();
    pendingApprovals.set(approvalId, approval);

    // Log expiry to Drive
    logApproval({
      action_id: approval.action_id,
      proposer_id: approval.proposer_id,
      approver_id: null,
      status: "EXPIRED",
      requested_at: new Date(approval.requested_at).toISOString(),
      resolved_at: new Date().toISOString(),
      receipt_id: null,
    }).catch(() => {});

    return { approval: null, error: "Approval expired" };
  }

  // Check if already resolved
  if (approval.status !== "PENDING") {
    return { approval: null, error: `Approval already ${approval.status}` };
  }

  // CBS Section 10: same-identity check
  if (approverId === approval.proposer_id) {
    // Check if in cooldown
    if (isInCooldown(approverId, "self_approval")) {
      return {
        approval: null,
        error: "Same-identity approval in cooldown. Wait or use a different approver.",
      };
    }

    // Add cooldown for future self-approvals
    const config = loadConfig();
    addCooldown(
      approverId,
      "self_approval",
      "Constrained Single-Actor Execution",
      config.cooldown_default,
    );

    console.log(`[ApprovalSystem] WARN: Same-identity approval by ${approverId} — cooldown applied`);
  }

  // Resolve
  approval.status = action;
  approval.approver_id = approverId;
  approval.resolved_at = Date.now();
  pendingApprovals.set(approvalId, approval);

  // Log to Drive
  logApproval({
    action_id: approval.action_id,
    proposer_id: approval.proposer_id,
    approver_id: approverId,
    status: action,
    requested_at: new Date(approval.requested_at).toISOString(),
    resolved_at: new Date().toISOString(),
    receipt_id: null,
  }).catch(() => {});

  console.log(`[ApprovalSystem] Resolved: ${approvalId} → ${action} by ${approverId}`);
  return { approval };
}

/**
 * Get all pending approvals.
 * Auto-expires stale entries.
 */
export function getPendingApprovals(): PendingApproval[] {
  const now = Date.now();
  const results: PendingApproval[] = [];

  Array.from(pendingApprovals.entries()).forEach(([id, approval]) => {
    if (approval.status === "PENDING" && now > approval.expires_at) {
      approval.status = "EXPIRED";
      approval.resolved_at = now;
      pendingApprovals.set(id, approval);
    }
    if (approval.status === "PENDING") {
      results.push(approval);
    }
  });

  return results;
}

/**
 * Get approval by ID.
 */
export function getApproval(approvalId: string): PendingApproval | null {
  return pendingApprovals.get(approvalId) ?? null;
}

/**
 * Get all approvals (for history display).
 */
export function getAllApprovals(): PendingApproval[] {
  return Array.from(pendingApprovals.values());
}

/**
 * Reset approval state (for testing).
 */
export function _resetApprovals(): void {
  pendingApprovals.clear();
}
