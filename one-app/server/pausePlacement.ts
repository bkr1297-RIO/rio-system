/**
 * RIO Pause Placement Model
 * ═══════════════════════════════════════════════════════════════
 * Every action passes through EXACTLY ONE pause:
 *   A) Intake   — pre-approved via rule, auto-execute, no user interruption
 *   B) Pre-Exec — ask user each time, 15-min timeout
 *   C) Sentinel — fallback intercept for external actions, 1-hour timeout
 *
 * Decision tree (route_action):
 *   1. Identify source → in_rio_system = source in [RIO_UI, RIO_API]
 *   2. Check intake rules (only if in_rio_system)
 *   3. Route to exactly one pause type
 *
 * Uses EXISTING components:
 *   - processIntent (intentPipeline) for policy evaluation
 *   - approvalSystem for PENDING approvals
 *   - connectors for execution
 *   - librarian for Drive persistence
 *   - authorityLayer for receipts
 *
 * NO new data models. PauseRecord = existing receipt. LedgerEntry = existing ledger.
 */

import { randomUUID } from "crypto";
import {
  processIntent,
  buildOutboundIntent,
  type IntentPacket,
  type PipelineResult,
} from "./intentPipeline";
import {
  createPendingApproval,
  resolveApproval,
  getApproval,
  type PendingApproval,
} from "./approvalSystem";
import {
  wrapInEnvelope,
  type ActionEnvelope,
  type GatewayDecision,
} from "./standardReceipt";
import { logEnvelope, logDecision, logError } from "./driveSubFiles";
import { loadConfig } from "./rioConfig";
import { generateCanonicalReceipt } from "./authorityLayer";
import { appendLedger } from "./db";
import { syncToLibrarian } from "./librarian";

// ═══════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════

/** Pause types — exactly one per action */
export type PauseType = "INTAKE" | "PRE_EXEC" | "SENTINEL";

/** Action sources that are "inside" the RIO system */
const RIO_SOURCES = ["RIO_UI", "RIO_API"] as const;
export type RIOSource = typeof RIO_SOURCES[number];

/** External sources that trigger Sentinel */
export type ExternalSource = "SMTP" | "API" | "FILE_SYSTEM" | "WEBHOOK" | "UNKNOWN";

/** Unified action source */
export type ActionSource = RIOSource | ExternalSource | string;

/** The action to be governed */
export interface Action {
  id: string;
  type: string;             // SEND_EMAIL, API_CALL, FILE_WRITE, etc.
  recipient?: string;       // For emails
  endpoint?: string;        // For API calls
  path?: string;            // For file writes
  subject?: string;         // For emails
  body?: string;            // Content
  data?: Record<string, unknown>; // Full payload
  timestamp: string;
}

/** IntakeRule — pre-approved automation rule */
export interface IntakeRule {
  id: string;
  name: string;
  action_type: string;      // Must match action.type
  conditions: Record<string, unknown>;   // Matching criteria
  constraints: Record<string, unknown>;  // Limits (frequency, recipients, etc.)
  approved_by: string;      // User who approved this rule
  approved_at: string;      // ISO timestamp
  active: boolean;
  use_count: number;
  last_used: string | null;
}

/** Result from route_action */
export interface PauseResult {
  action_id: string;
  pause_type: PauseType;
  status: "ACTION_EXECUTED" | "ACTION_REJECTED" | "ACTION_BLOCKED" | "CONSTRAINT_VIOLATION" | "AWAITING_APPROVAL" | "TIMEOUT";
  receipt: PipelineResult | null;
  approval_id: string | null;
  intake_rule_id: string | null;
  message: string;
  timestamp: string;
}

// ═══════════════════════════════════════════════════════════════
// CONFIGURATION
// ═══════════════════════════════════════════════════════════════

export const PAUSE_CONFIG = {
  PRE_EXEC_APPROVAL_TIMEOUT: 900_000,     // 15 minutes in ms
  SENTINEL_APPROVAL_TIMEOUT: 3_600_000,   // 1 hour in ms
  MAX_RULE_CONDITIONS: 10,
  MAX_RULE_CONSTRAINTS: 10,
  MAX_RULE_DESTINATIONS: 100,
} as const;

// ═══════════════════════════════════════════════════════════════
// INTAKE RULE STORE (in-memory)
// ═══════════════════════════════════════════════════════════════

const intakeRules = new Map<string, IntakeRule>();

/** Add or update an intake rule */
export function addIntakeRule(rule: Omit<IntakeRule, "id" | "use_count" | "last_used">): IntakeRule {
  const id = `RULE-${randomUUID().replace(/-/g, "").substring(0, 12)}`;
  const fullRule: IntakeRule = {
    ...rule,
    id,
    use_count: 0,
    last_used: null,
  };
  intakeRules.set(id, fullRule);
  console.log(`[PausePlacement] IntakeRule added: ${id} — ${rule.name} (${rule.action_type})`);
  return fullRule;
}

/** Remove an intake rule */
export function removeIntakeRule(ruleId: string): boolean {
  return intakeRules.delete(ruleId);
}

/** Get all active intake rules */
export function getActiveRules(): IntakeRule[] {
  return Array.from(intakeRules.values()).filter(r => r.active);
}

/** Get all intake rules (including inactive) */
export function getAllRules(): IntakeRule[] {
  return Array.from(intakeRules.values());
}

/** Get a specific rule by ID */
export function getRule(ruleId: string): IntakeRule | null {
  return intakeRules.get(ruleId) ?? null;
}

/**
 * Find a matching intake rule for an action.
 * Match criteria: action_type must match, rule must be active.
 * Conditions are checked against action data.
 */
export function findMatchingIntakeRule(action: Action): IntakeRule | null {
  for (const rule of Array.from(intakeRules.values())) {
    if (!rule.active) continue;
    if (rule.action_type !== action.type) continue;

    // Check conditions against action data
    if (!checkConditions(rule.conditions, action)) continue;

    return rule;
  }
  return null;
}

/**
 * Check if action matches rule conditions.
 * Conditions are key-value pairs that must all match.
 * Supports: exact match, wildcard "*", array "includes".
 */
function checkConditions(conditions: Record<string, unknown>, action: Action): boolean {
  for (const [key, expected] of Object.entries(conditions)) {
    if (expected === "*") continue; // wildcard matches anything

    const actual = (action as unknown as Record<string, unknown>)[key]
      ?? action.data?.[key];

    if (actual === undefined) return false;

    // Array condition: action value must be in the array
    if (Array.isArray(expected)) {
      if (!expected.includes(actual)) return false;
      continue;
    }

    // Exact match
    if (actual !== expected) return false;
  }
  return true;
}

/**
 * Check if action violates rule constraints.
 * Returns null if OK, or a string describing the violation.
 */
function checkConstraints(rule: IntakeRule, action: Action): string | null {
  const constraints = rule.constraints;

  // Max frequency: check use_count
  if (typeof constraints.max_frequency === "number") {
    if (rule.use_count >= constraints.max_frequency) {
      return `Frequency limit exceeded: ${rule.use_count} >= ${constraints.max_frequency}`;
    }
  }

  // Allowed recipients
  if (Array.isArray(constraints.allowed_recipients) && action.recipient) {
    if (!constraints.allowed_recipients.includes(action.recipient)) {
      return `Recipient ${action.recipient} not in allowed list`;
    }
  }

  // Max body length
  if (typeof constraints.max_body_length === "number" && action.body) {
    if (action.body.length > constraints.max_body_length) {
      return `Body length ${action.body.length} exceeds max ${constraints.max_body_length}`;
    }
  }

  return null; // No violation
}

// ═══════════════════════════════════════════════════════════════
// PAUSE TRACKING (invariant: exactly one pause per action)
// ═══════════════════════════════════════════════════════════════

const pausedActions = new Map<string, PauseType>();

/** Record that an action has been paused. Returns false if already paused. */
function recordPause(actionId: string, pauseType: PauseType): boolean {
  if (pausedActions.has(actionId)) {
    console.warn(`[PausePlacement] INVARIANT: action ${actionId} already has pause ${pausedActions.get(actionId)}, rejecting ${pauseType}`);
    return false;
  }
  pausedActions.set(actionId, pauseType);
  return true;
}

/** Check if an action already has a pause */
export function hasPause(actionId: string): PauseType | null {
  return pausedActions.get(actionId) ?? null;
}

/** Get pause stats */
export function getPauseStats(): { total: number; byType: Record<PauseType, number> } {
  const byType: Record<string, number> = { INTAKE: 0, PRE_EXEC: 0, SENTINEL: 0 };
  let total = 0;
  Array.from(pausedActions.values()).forEach(type => {
    total++;
    byType[type] = (byType[type] || 0) + 1;
  });
  return { total, byType: byType as unknown as Record<PauseType, number> };
}

// ═══════════════════════════════════════════════════════════════
// ROUTE_ACTION — the decision tree
// ═══════════════════════════════════════════════════════════════

/**
 * Route an action through the Pause Placement Model.
 *
 * Decision tree:
 *   1. Identify source → in_rio_system
 *   2. Check intake rules (only if in_rio_system)
 *   3. Route to exactly one pause type
 *
 * @param action - The action to govern
 * @param source - Where the action originated
 * @param userId - The user who initiated (for approval tracking)
 * @param executor - Optional execution function (called if approved)
 */
export async function routeAction(
  action: Action,
  source: ActionSource,
  userId: string,
  executor?: (data: Record<string, unknown>) => Promise<Record<string, unknown>>,
): Promise<PauseResult> {
  const actionId = action.id || `ACT-${randomUUID().replace(/-/g, "").substring(0, 12)}`;
  action.id = actionId;

  console.log(`[PausePlacement] route_action: id=${actionId} type=${action.type} source=${source}`);

  // ─── STEP 1: Identify source ────────────────────────────────
  const inRioSystem = (RIO_SOURCES as readonly string[]).includes(source);

  // ─── STEP 2: Check Intake Rules (only if in RIO) ────────────
  let intakeRule: IntakeRule | null = null;
  if (inRioSystem) {
    intakeRule = findMatchingIntakeRule(action);
  }
  // External sources: skip rule check entirely

  // ─── STEP 3: Route to pause type ────────────────────────────
  if (intakeRule && inRioSystem) {
    // PATH A: INTAKE PAUSE
    return handleIntakePause(action, intakeRule, userId, executor);
  } else if (inRioSystem && !intakeRule) {
    // PATH B: PRE-EXECUTION PAUSE
    return handlePreExecutionPause(action, userId, executor);
  } else {
    // PATH C: SENTINEL PAUSE (in_rio_system === false)
    return handleSentinelPause(action, source, userId, executor);
  }
}

// ═══════════════════════════════════════════════════════════════
// PATH A: INTAKE PAUSE
// ═══════════════════════════════════════════════════════════════

/**
 * Intake Pause — action has a pre-approved rule, auto-execute.
 * No user interruption. Verify rule → check constraints → execute → log.
 */
async function handleIntakePause(
  action: Action,
  rule: IntakeRule,
  userId: string,
  executor?: (data: Record<string, unknown>) => Promise<Record<string, unknown>>,
): Promise<PauseResult> {
  const timestamp = new Date().toISOString();

  // Record pause (invariant: exactly one)
  if (!recordPause(action.id, "INTAKE")) {
    return {
      action_id: action.id,
      pause_type: "INTAKE",
      status: "ACTION_REJECTED",
      receipt: null,
      approval_id: null,
      intake_rule_id: rule.id,
      message: "INVARIANT VIOLATION: action already has a pause",
      timestamp,
    };
  }

  console.log(`[PausePlacement] PATH A: INTAKE — rule=${rule.id} (${rule.name})`);

  // 1. Verify rule is active
  if (!rule.active) {
    return {
      action_id: action.id,
      pause_type: "INTAKE",
      status: "CONSTRAINT_VIOLATION",
      receipt: null,
      approval_id: null,
      intake_rule_id: rule.id,
      message: `Rule ${rule.id} is inactive`,
      timestamp,
    };
  }

  // 2. Check constraints
  const violation = checkConstraints(rule, action);
  if (violation) {
    return {
      action_id: action.id,
      pause_type: "INTAKE",
      status: "CONSTRAINT_VIOLATION",
      receipt: null,
      approval_id: null,
      intake_rule_id: rule.id,
      message: `Constraint violation: ${violation}`,
      timestamp,
    };
  }

  // 3. Run through policy engine (still validates content)
  const intent = buildOutboundIntent({
    action: action.type.toLowerCase(),
    source: "human",
    data: {
      to: action.recipient,
      subject: action.subject,
      body: action.body,
      ...action.data,
      _pause_type: "INTAKE",
      _intake_rule_id: rule.id,
    },
    channel: action.type === "SEND_EMAIL" ? "email" : "sms",
  });

  const pipelineResult = await processIntent(intent, executor, {
    strictness: "standard",
    useLLM: false,
    skipSubstrate: true,
  });

  // 4. Update rule usage stats
  rule.use_count++;
  rule.last_used = timestamp;
  intakeRules.set(rule.id, rule);

  // 5. Log envelope to Drive (non-blocking)
  const envelope = wrapInEnvelope({
    actor: userId,
    toolName: action.type.toLowerCase(),
    target: action.recipient || "system",
    parameters: action.data || {},
    source: "one-ui",
    policyHash: "intake-rule",
    riskLevel: "low",
  });
  (envelope as unknown as Record<string, unknown>).pause_type = "INTAKE";
  logEnvelope(envelope).catch(() => {});

  const executed = pipelineResult.decision === "allow" && pipelineResult.executed;

  return {
    action_id: action.id,
    pause_type: "INTAKE",
    status: executed ? "ACTION_EXECUTED" : pipelineResult.decision === "block" ? "ACTION_BLOCKED" : "ACTION_EXECUTED",
    receipt: pipelineResult,
    approval_id: null,
    intake_rule_id: rule.id,
    message: executed
      ? `Intake: auto-executed via rule ${rule.name}`
      : `Intake: policy decision = ${pipelineResult.decision}`,
    timestamp,
  };
}

// ═══════════════════════════════════════════════════════════════
// PATH B: PRE-EXECUTION PAUSE
// ═══════════════════════════════════════════════════════════════

/**
 * Pre-Execution Pause — no matching rule, ask user for approval.
 * Creates a PauseRecord (pending approval), waits for user decision.
 * Timeout: 15 minutes → auto-reject.
 */
export async function handlePreExecutionPause(
  action: Action,
  userId: string,
  executor?: (data: Record<string, unknown>) => Promise<Record<string, unknown>>,
): Promise<PauseResult> {
  const timestamp = new Date().toISOString();

  // Record pause (invariant: exactly one)
  if (!recordPause(action.id, "PRE_EXEC")) {
    return {
      action_id: action.id,
      pause_type: "PRE_EXEC",
      status: "ACTION_REJECTED",
      receipt: null,
      approval_id: null,
      intake_rule_id: null,
      message: "INVARIANT VIOLATION: action already has a pause",
      timestamp,
    };
  }

  console.log(`[PausePlacement] PATH B: PRE_EXEC — action=${action.id} type=${action.type}`);

  // 1. Create ActionEnvelope
  const envelope = wrapInEnvelope({
    actor: userId,
    toolName: action.type.toLowerCase(),
    target: action.recipient || "system",
    parameters: action.data || { to: action.recipient, subject: action.subject, body: action.body },
    source: "one-ui",
    policyHash: "pre-exec",
    riskLevel: "medium",
  });
  (envelope as unknown as Record<string, unknown>).pause_type = "PRE_EXEC";

  // 2. Create Gateway decision (REQUIRE_CONFIRMATION)
  const decision: GatewayDecision = {
    action_id: action.id,
    result: "REQUIRE_CONFIRMATION",
    message: `Pre-Execution Pause: ${action.type} requires your approval`,
    cooldown_ms: 0,
    requires_confirmation: true,
  };

  // 3. Create pending approval
  const approval = await createPendingApproval(envelope, decision);

  // Override expiry to 15 minutes for Pre-Exec
  (approval as unknown as Record<string, unknown>).expires_at = Date.now() + PAUSE_CONFIG.PRE_EXEC_APPROVAL_TIMEOUT;

  // 4. Log to Drive
  logEnvelope(envelope).catch(() => {});
  logDecision(decision).catch(() => {});

  // 5. Return AWAITING_APPROVAL — caller must poll or wait for approval
  return {
    action_id: action.id,
    pause_type: "PRE_EXEC",
    status: "AWAITING_APPROVAL",
    receipt: null,
    approval_id: approval.approval_id,
    intake_rule_id: null,
    message: `Pre-Execution Pause: awaiting approval (${approval.approval_id}). Timeout: 15 minutes.`,
    timestamp,
  };
}

// ═══════════════════════════════════════════════════════════════
// PATH C: SENTINEL PAUSE
// ═══════════════════════════════════════════════════════════════

/**
 * Sentinel Pause — action from OUTSIDE RIO system.
 * BLOCK immediately → create synthetic intent → approval → execute or permanently delete.
 * Timeout: 1 hour → auto-reject.
 */
export async function handleSentinelPause(
  action: Action,
  source: ActionSource,
  userId: string,
  executor?: (data: Record<string, unknown>) => Promise<Record<string, unknown>>,
): Promise<PauseResult> {
  const timestamp = new Date().toISOString();

  // Record pause (invariant: exactly one)
  if (!recordPause(action.id, "SENTINEL")) {
    return {
      action_id: action.id,
      pause_type: "SENTINEL",
      status: "ACTION_BLOCKED",
      receipt: null,
      approval_id: null,
      intake_rule_id: null,
      message: "INVARIANT VIOLATION: action already has a pause",
      timestamp,
    };
  }

  console.log(`[PausePlacement] PATH C: SENTINEL — action=${action.id} source=${source} type=${action.type}`);

  // 1. BLOCK immediately (action is queued, not executed)
  console.log(`[PausePlacement] SENTINEL: BLOCKED action ${action.id} from ${source}`);

  // 2. Create synthetic intent (wraps external action as RIO envelope)
  const envelope = wrapInEnvelope({
    actor: `external:${source}`,
    toolName: action.type.toLowerCase(),
    target: action.recipient || "system",
    parameters: action.data || { to: action.recipient, subject: action.subject, body: action.body },
    source: (source === "SMTP" ? "gmail" : source === "API" ? "api" : source === "WEBHOOK" ? "api" : "api") as import("./standardReceipt").InputSource,
    policyHash: "sentinel",
    riskLevel: "high",
  });
  (envelope as unknown as Record<string, unknown>).pause_type = "SENTINEL";

  // 3. Create Gateway decision (BLOCK with approval path)
  const decision: GatewayDecision = {
    action_id: action.id,
    result: "BLOCK",
    message: `SENTINEL: Unplanned action detected from ${source} — approve or permanently block`,
    cooldown_ms: 0,
    requires_confirmation: true,
  };

  // 4. Create pending approval with 1-hour timeout
  const approval = await createPendingApproval(envelope, decision);
  (approval as unknown as Record<string, unknown>).expires_at = Date.now() + PAUSE_CONFIG.SENTINEL_APPROVAL_TIMEOUT;

  // 5. Log to Drive
  logEnvelope(envelope).catch(() => {});
  logDecision(decision).catch(() => {});
  logError(
    action.id,
    "SENTINEL_INTERCEPT",
    `Unplanned action from ${source}: ${action.type}`,
    { source, action_type: action.type, recipient: action.recipient },
  ).catch(() => {});

  // 6. Return AWAITING_APPROVAL
  return {
    action_id: action.id,
    pause_type: "SENTINEL",
    status: "AWAITING_APPROVAL",
    receipt: null,
    approval_id: approval.approval_id,
    intake_rule_id: null,
    message: `SENTINEL: Action blocked from ${source}. Awaiting emergency approval (${approval.approval_id}). Timeout: 1 hour.`,
    timestamp,
  };
}

// ═══════════════════════════════════════════════════════════════
// APPROVAL RESOLUTION — execute after approval
// ═══════════════════════════════════════════════════════════════

/**
 * Execute an action after its approval has been resolved.
 * Called when a Pre-Exec or Sentinel approval is APPROVED.
 *
 * Uses existing processIntent pipeline for execution.
 */
export async function executeAfterApproval(
  approvalId: string,
  action: Action,
  executor?: (data: Record<string, unknown>) => Promise<Record<string, unknown>>,
): Promise<PauseResult> {
  const approval = getApproval(approvalId);
  if (!approval) {
    return {
      action_id: action.id,
      pause_type: "PRE_EXEC",
      status: "ACTION_REJECTED",
      receipt: null,
      approval_id: approvalId,
      intake_rule_id: null,
      message: "Approval not found",
      timestamp: new Date().toISOString(),
    };
  }

  if (approval.status !== "APPROVED") {
    const status = approval.status === "REJECTED" ? "ACTION_REJECTED"
      : approval.status === "EXPIRED" ? "TIMEOUT"
      : "ACTION_BLOCKED";
    const pauseType = ((approval.envelope as unknown as Record<string, unknown>).pause_type as PauseType) || "PRE_EXEC";
    const now = new Date().toISOString();
    const ledgerEntryId = `LE-REJECT-${Date.now()}`;

    // ─── Generate rejection receipt (matches APPROVED flow) ───
    const receipt = generateCanonicalReceipt({
      intentId: action.id || `REJECT-${approvalId}`,
      proposerId: approval.proposer_id,
      approverId: approval.approver_id || "system",
      tokenId: `PAUSE-REJECT-${approvalId}`,
      action: `${action.type}_${approval.status}`,
      success: false,
      result: {
        status: approval.status,
        pause_type: pauseType,
        approval_id: approvalId,
        reason: `Action ${approval.status.toLowerCase()} via pause placement`,
      },
      executor: "pause-placement-system",
      ledgerEntryId,
      timestampProposed: now,
      timestampApproved: now,
    });

    // ─── Append to ledger ───
    appendLedger("EXECUTION", {
      type: `PAUSE_${approval.status}`,
      intent_id: action.id || `REJECT-${approvalId}`,
      pause_type: pauseType,
      approval_id: approvalId,
      proposer_id: approval.proposer_id,
      approver_id: approval.approver_id || "system",
      decision: approval.status,
      receipt_id: receipt.receipt_id,
      receipt_hash: receipt.receipt_hash,
      previous_receipt_hash: receipt.previous_receipt_hash,
      snapshot_hash: receipt.snapshot_hash,
      timestamp: now,
    }).catch((err) => {
      console.error(`[PausePlacement] Ledger write failed for ${approval.status}:`, err);
    });

    // ─── Sync to Drive (non-blocking) ───
    syncToLibrarian({
      receipt_id: receipt.receipt_id,
      receipt_hash: receipt.receipt_hash,
      previous_receipt_hash: receipt.previous_receipt_hash,
      proposer_id: approval.proposer_id,
      approver_id: approval.approver_id || "system",
      decision: approval.status === "REJECTED" ? "REJECTED" : "EXPIRED",
      snapshot_hash: receipt.snapshot_hash,
    }).catch((err) => {
      console.error(`[PausePlacement] Drive sync failed for ${approval.status}:`, err);
    });

    console.log(`[PausePlacement] ${approval.status} receipt generated: ${receipt.receipt_id}, synced to Drive`);

    return {
      action_id: action.id,
      pause_type: pauseType,
      status,
      receipt: {
        decision: "block",
        executed: false,
        receipt: receipt,
        receipt_id: receipt.receipt_id,
        receipt_hash: receipt.receipt_hash,
      } as unknown as PipelineResult,
      approval_id: approvalId,
      intake_rule_id: null,
      message: `${pauseType}: ${approval.status} — receipt ${receipt.receipt_id} synced to Drive`,
      timestamp: now,
    };
  }

  // Execute through existing pipeline
  const intent = buildOutboundIntent({
    action: action.type.toLowerCase(),
    source: "human",
    data: {
      to: action.recipient,
      subject: action.subject,
      body: action.body,
      ...action.data,
      _pause_type: ((approval.envelope as unknown as Record<string, unknown>).pause_type) || "PRE_EXEC",
      _approval_id: approvalId,
    },
    channel: action.type === "SEND_EMAIL" ? "email" : "sms",
  });

  const pipelineResult = await processIntent(intent, executor, {
    strictness: "standard",
    useLLM: false,
    skipSubstrate: true,
  });

  const pauseType = (((approval.envelope as unknown as Record<string, unknown>).pause_type) as PauseType) || "PRE_EXEC";
  const executed = pipelineResult.decision === "allow" && pipelineResult.executed;

  return {
    action_id: action.id,
    pause_type: pauseType,
    status: executed ? "ACTION_EXECUTED" : pipelineResult.decision === "block" ? "ACTION_BLOCKED" : "ACTION_EXECUTED",
    receipt: pipelineResult,
    approval_id: approvalId,
    intake_rule_id: null,
    message: `${pauseType}: Approved and ${executed ? "executed" : "processed"} by ${approval.approver_id}`,
    timestamp: new Date().toISOString(),
  };
}

// ═══════════════════════════════════════════════════════════════
// SENTINEL HOOK — for email send boundary
// ═══════════════════════════════════════════════════════════════

/**
 * Sentinel intercept hook for outbound email.
 * Called at the email send boundary (connectors.ts).
 *
 * If the action did NOT originate from RIO → trigger Sentinel pause.
 * If the action DID originate from RIO → pass through (already governed).
 *
 * Phase 1 scope: outbound email only.
 */
export async function sentinelEmailHook(
  to: string,
  subject: string,
  body: string,
  source: ActionSource,
  userId: string,
): Promise<{ intercepted: boolean; result?: PauseResult }> {
  const inRioSystem = (RIO_SOURCES as readonly string[]).includes(source);

  if (inRioSystem) {
    // Already governed by RIO — pass through
    return { intercepted: false };
  }

  // External source — SENTINEL intercept
  const action: Action = {
    id: `ACT-${randomUUID().replace(/-/g, "").substring(0, 12)}`,
    type: "SEND_EMAIL",
    recipient: to,
    subject,
    body,
    data: { to, subject, body },
    timestamp: new Date().toISOString(),
  };

  const result = await handleSentinelPause(action, source, userId);
  return { intercepted: true, result };
}

// ═══════════════════════════════════════════════════════════════
// TESTING HELPERS
// ═══════════════════════════════════════════════════════════════

/** Reset all state (for testing) */
export function _resetPausePlacement(): void {
  intakeRules.clear();
  pausedActions.clear();
}
