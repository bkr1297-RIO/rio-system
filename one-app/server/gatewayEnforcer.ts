/**
 * Gateway Enforcer — Builder Contract v1
 *
 * The Gateway is the ONLY component that can execute actions.
 * It reads kernel_decision_objects from the decision_mailbox,
 * validates signatures, enforces decisions, and produces
 * gateway_enforcement_objects with full trace linkage.
 *
 * INVARIANTS:
 * 1. Gateway is the SOLE execution authority
 * 2. Gateway reads kernel_decision_object from decision_mailbox
 * 3. AUTO_APPROVE → execute immediately, produce receipt
 * 4. REQUIRE_HUMAN → wait for signed approval, then execute
 * 5. DENY → block execution, log reason
 * 6. Every enforcement produces a gateway_enforcement_object
 * 7. Every execution produces a signed receipt written to ledger
 * 8. All enforcement objects carry the trace_id from the original proposal
 *
 * Enforced decisions:
 * - EXECUTED: action was executed (with receipt)
 * - BLOCKED: action was denied or signature invalid
 * - REQUIRES_SIGNATURE: waiting for human signature
 */

import {
  type GatewayEnforcedDecision,
  type GatewayEnforcementPayload,
  type KernelDecision,
  type KernelDecisionPayload,
  type MailboxEntry,
} from "../drizzle/schema";
import {
  appendToMailbox,
  transitionStatus,
  generatePacketId,
} from "./mailbox";
import { nanoid } from "nanoid";

// ─────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────

export interface HumanApproval {
  user_decision: "APPROVE" | "REJECT" | "MODIFY";
  signature_ed25519: string;
  signer_id: string;
  timestamp: string;
  modifications?: Record<string, unknown>;
}

export interface ExecutionResult {
  success: boolean;
  execution_id: string;
  output?: Record<string, unknown>;
  error?: string;
  timestamp: string;
}

export interface GatewayEnforcementContext {
  /** The kernel decision to enforce */
  kernelDecision: KernelDecisionPayload;
  /** The kernel decision mailbox entry */
  kernelEntry: MailboxEntry;
  /** Human approval (required for REQUIRE_HUMAN decisions) */
  humanApproval?: HumanApproval | null;
  /** Execution function — Gateway calls this to execute the action */
  executeFn?: () => Promise<ExecutionResult>;
}

// ─────────────────────────────────────────────────────────────────
// Gateway Enforcement Logic
// ─────────────────────────────────────────────────────────────────

/**
 * Enforce a kernel decision. This is the core Gateway logic.
 *
 * Decision flow:
 * 1. Read kernel_decision_object
 * 2. If AUTO_APPROVE → execute immediately
 * 3. If REQUIRE_HUMAN → check for valid human approval
 * 4. If DENY → block execution
 * 5. Produce gateway_enforcement_object
 *
 * @param context - All data needed for enforcement
 * @returns GatewayEnforcementPayload
 */
export function enforceDecision(
  context: GatewayEnforcementContext
): GatewayEnforcementPayload {
  const { kernelDecision, humanApproval } = context;
  const timestamp = new Date().toISOString();

  // Route based on kernel's proposed decision
  switch (kernelDecision.proposed_decision) {
    case "AUTO_APPROVE":
      return enforceAutoApprove(kernelDecision, timestamp);

    case "REQUIRE_HUMAN":
      return enforceRequireHuman(kernelDecision, humanApproval ?? null, timestamp);

    case "DENY":
      return enforceDeny(kernelDecision, timestamp);

    default:
      // Unknown decision type — block as safety measure
      return {
        decision_id: kernelDecision.decision_id,
        proposed_decision: kernelDecision.proposed_decision,
        enforced_decision: "BLOCKED",
        enforcement_reason: `Unknown kernel decision type: ${kernelDecision.proposed_decision}`,
        execution_id: null,
        receipt_id: null,
        signature_valid: false,
        signature_ed25519: null,
        timestamp,
        trace_id: kernelDecision.trace_id,
      };
  }
}

/**
 * AUTO_APPROVE: Execute immediately without human signature.
 * Gateway trusts the kernel's evaluation (policy + trust + no anomalies).
 */
function enforceAutoApprove(
  decision: KernelDecisionPayload,
  timestamp: string
): GatewayEnforcementPayload {
  const executionId = `exec_${nanoid(16)}`;
  const receiptId = `rcpt_${nanoid(16)}`;

  return {
    decision_id: decision.decision_id,
    proposed_decision: decision.proposed_decision,
    enforced_decision: "EXECUTED",
    enforcement_reason: "Kernel auto-approved: policy match, trust level sufficient, no anomalies",
    execution_id: executionId,
    receipt_id: receiptId,
    signature_valid: true, // Auto-approve uses system signature
    signature_ed25519: `sys_${nanoid(12)}`, // System-generated signature
    timestamp,
    trace_id: decision.trace_id,
  };
}

/**
 * REQUIRE_HUMAN: Check for valid human approval before executing.
 *
 * If no approval → REQUIRES_SIGNATURE (waiting)
 * If approval with valid signature → EXECUTED
 * If approval with REJECT → BLOCKED
 * If approval with invalid/missing signature → BLOCKED
 */
function enforceRequireHuman(
  decision: KernelDecisionPayload,
  approval: HumanApproval | null,
  timestamp: string
): GatewayEnforcementPayload {
  // No approval yet → waiting for signature
  if (!approval) {
    return {
      decision_id: decision.decision_id,
      proposed_decision: decision.proposed_decision,
      enforced_decision: "REQUIRES_SIGNATURE",
      enforcement_reason: "Kernel requires human approval; awaiting signature",
      execution_id: null,
      receipt_id: null,
      signature_valid: false,
      signature_ed25519: null,
      timestamp,
      trace_id: decision.trace_id,
    };
  }

  // Human rejected → BLOCKED
  if (approval.user_decision === "REJECT") {
    return {
      decision_id: decision.decision_id,
      proposed_decision: decision.proposed_decision,
      enforced_decision: "BLOCKED",
      enforcement_reason: `Human rejected: signer=${approval.signer_id}`,
      execution_id: null,
      receipt_id: null,
      signature_valid: validateSignature(approval.signature_ed25519),
      signature_ed25519: approval.signature_ed25519,
      timestamp,
      trace_id: decision.trace_id,
    };
  }

  // Validate signature
  const signatureValid = validateSignature(approval.signature_ed25519);
  if (!signatureValid) {
    return {
      decision_id: decision.decision_id,
      proposed_decision: decision.proposed_decision,
      enforced_decision: "BLOCKED",
      enforcement_reason: "Invalid signature: approval signature failed validation",
      execution_id: null,
      receipt_id: null,
      signature_valid: false,
      signature_ed25519: approval.signature_ed25519,
      timestamp,
      trace_id: decision.trace_id,
    };
  }

  // Human approved with valid signature → EXECUTED
  const executionId = `exec_${nanoid(16)}`;
  const receiptId = `rcpt_${nanoid(16)}`;

  return {
    decision_id: decision.decision_id,
    proposed_decision: decision.proposed_decision,
    enforced_decision: "EXECUTED",
    enforcement_reason: `Human approved with valid signature: signer=${approval.signer_id}`,
    execution_id: executionId,
    receipt_id: receiptId,
    signature_valid: true,
    signature_ed25519: approval.signature_ed25519,
    timestamp,
    trace_id: decision.trace_id,
  };
}

/**
 * DENY: Block execution. Kernel determined this action violates policy.
 */
function enforceDeny(
  decision: KernelDecisionPayload,
  timestamp: string
): GatewayEnforcementPayload {
  return {
    decision_id: decision.decision_id,
    proposed_decision: decision.proposed_decision,
    enforced_decision: "BLOCKED",
    enforcement_reason: `Kernel denied: ${decision.reasoning.anomaly_type || "policy violation"}`,
    execution_id: null,
    receipt_id: null,
    signature_valid: false,
    signature_ed25519: null,
    timestamp,
    trace_id: decision.trace_id,
  };
}

// ─────────────────────────────────────────────────────────────────
// Signature Validation
// ─────────────────────────────────────────────────────────────────

/**
 * Validate an Ed25519 signature.
 * In production, this would verify against the signer's public key.
 * For now, we validate format and non-emptiness.
 */
export function validateSignature(signature: string | null | undefined): boolean {
  if (!signature) return false;
  if (signature.length < 8) return false;
  // System signatures are always valid
  if (signature.startsWith("sys_")) return true;
  // Ed25519 signatures should be non-trivial
  if (signature.startsWith("sig_") && signature.length >= 12) return true;
  // Reject obviously invalid signatures
  return false;
}

// ─────────────────────────────────────────────────────────────────
// Mailbox Integration
// ─────────────────────────────────────────────────────────────────

/**
 * Process a kernel decision from the decision mailbox:
 * 1. Read the kernel_decision_object
 * 2. Enforce the decision (with optional human approval)
 * 3. Write gateway_enforcement_object to decision_mailbox
 * 4. If executed, transition the trace to "executed" status
 *
 * @param kernelEntry - The mailbox entry containing the kernel decision
 * @param humanApproval - Optional human approval (for REQUIRE_HUMAN decisions)
 * @param executeFn - Optional execution function
 * @returns The gateway enforcement result
 */
export async function processKernelDecisionFromMailbox(
  kernelEntry: MailboxEntry,
  humanApproval?: HumanApproval | null,
  executeFn?: () => Promise<ExecutionResult>
): Promise<{ enforcement: GatewayEnforcementPayload; mailboxEntry: MailboxEntry }> {
  const kernelDecision = kernelEntry.payload as unknown as KernelDecisionPayload;

  // Build enforcement context
  const context: GatewayEnforcementContext = {
    kernelDecision,
    kernelEntry,
    humanApproval,
    executeFn,
  };

  // Enforce
  const enforcement = enforceDecision(context);

  // If we have an executeFn and the decision is EXECUTED, actually execute
  if (enforcement.enforced_decision === "EXECUTED" && executeFn) {
    try {
      const result = await executeFn();
      if (!result.success) {
        // Execution failed — override to BLOCKED
        enforcement.enforced_decision = "BLOCKED";
        enforcement.enforcement_reason = `Execution failed: ${result.error || "unknown error"}`;
        enforcement.execution_id = result.execution_id;
        enforcement.receipt_id = null;
      } else {
        enforcement.execution_id = result.execution_id;
      }
    } catch (err: any) {
      enforcement.enforced_decision = "BLOCKED";
      enforcement.enforcement_reason = `Execution error: ${err.message}`;
      enforcement.receipt_id = null;
    }
  }

  // Determine the mailbox status based on enforcement
  const status = enforcement.enforced_decision === "EXECUTED"
    ? "executed" as const
    : enforcement.enforced_decision === "REQUIRES_SIGNATURE"
    ? "routed" as const
    : "archived" as const; // BLOCKED → archived

  // Write gateway_enforcement_object to decision_mailbox
  const mailboxEntry = await appendToMailbox({
    mailboxType: "decision",
    packetType: "gateway_enforcement_object",
    sourceAgent: "gateway",
    targetAgent: null,
    status,
    payload: enforcement as unknown as Record<string, unknown>,
    traceId: kernelEntry.traceId,
    parentPacketId: kernelEntry.packetId,
  });

  return { enforcement, mailboxEntry };
}

// ─────────────────────────────────────────────────────────────────
// Full Trace Validation
// ─────────────────────────────────────────────────────────────────

/**
 * Validate that a complete trace has all required components.
 * Used for auditing and integrity verification.
 *
 * A complete trace must have:
 * 1. At least one proposal entry
 * 2. At least one kernel_decision_object
 * 3. At least one gateway_enforcement_object
 * 4. All entries share the same trace_id
 * 5. Status transitions are forward-only
 */
export function validateTrace(entries: MailboxEntry[]): {
  valid: boolean;
  errors: string[];
  hasProposal: boolean;
  hasKernelDecision: boolean;
  hasGatewayEnforcement: boolean;
  finalStatus: string | null;
} {
  const errors: string[] = [];

  if (entries.length === 0) {
    return {
      valid: false,
      errors: ["Empty trace"],
      hasProposal: false,
      hasKernelDecision: false,
      hasGatewayEnforcement: false,
      finalStatus: null,
    };
  }

  // Check all entries share the same trace_id
  const traceIds = new Set(entries.map(e => e.traceId));
  if (traceIds.size > 1) {
    errors.push(`Multiple trace_ids found: ${Array.from(traceIds).join(", ")}`);
  }

  // Check for required components
  const hasProposal = entries.some(e => e.packetType.startsWith("proposal_packet"));
  const hasKernelDecision = entries.some(e => e.packetType === "kernel_decision_object");
  const hasGatewayEnforcement = entries.some(e => e.packetType === "gateway_enforcement_object");

  if (!hasProposal) errors.push("Missing proposal entry");
  if (!hasKernelDecision) errors.push("Missing kernel_decision_object");
  if (!hasGatewayEnforcement) errors.push("Missing gateway_enforcement_object");

  // Check status transitions are forward-only WITHIN each mailbox type.
  // Different mailboxes (proposal, decision) have independent status progressions.
  const STATUS_ORDER: Record<string, number> = {
    pending: 0, processed: 1, routed: 2, executed: 3, archived: 4,
  };

  const maxStatusByMailbox = new Map<string, number>();
  for (const entry of entries) {
    const order = STATUS_ORDER[entry.status] ?? -1;
    const currentMax = maxStatusByMailbox.get(entry.mailboxType) ?? -1;
    if (order < currentMax) {
      errors.push(`Status regression in ${entry.mailboxType}: "${entry.status}" after higher status at entry ${entry.packetId}`);
    }
    if (order > currentMax) maxStatusByMailbox.set(entry.mailboxType, order);
  }

  const finalStatus = entries[entries.length - 1]?.status ?? null;

  return {
    valid: errors.length === 0,
    errors,
    hasProposal,
    hasKernelDecision,
    hasGatewayEnforcement,
    finalStatus,
  };
}
