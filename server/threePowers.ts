/**
 * RIO Three-Power Separation Architecture
 * ═══════════════════════════════════════════════════════════════
 * "No component should be trusted because of what it is supposed to do;
 *  each component must be restricted by what it is technically impossible
 *  for it to do."
 *
 * Three powers:
 *   1. OBSERVER  — Full visibility, zero write/execute capability (Mantis)
 *   2. GOVERNOR  — Authorization only, no execution capability (Human Core)
 *   3. EXECUTOR  — Action only, no decision or full observation capability (Gate)
 *
 * Enforced by:
 *   - Typed permission sets (compile-time)
 *   - Runtime RBAC checks (middleware)
 *   - Queue isolation (message flow boundaries)
 *   - Cryptographic signatures (Ed25519 — Governor signs, Executor verifies)
 */

import { createHash, randomUUID } from "crypto";
import { nanoid } from "nanoid";
import * as ed from "@noble/ed25519";
import { createHash as nodeCreateHash } from "crypto";

// Configure noble/ed25519 v3 to use sync sha512
ed.hashes.sha512 = (message: Uint8Array): Uint8Array => {
  return new Uint8Array(nodeCreateHash("sha512").update(message).digest());
};

// ═══════════════════════════════════════════════════════════════
// POWER DEFINITIONS — Typed Permission Sets
// ═══════════════════════════════════════════════════════════════

export const POWER = {
  OBSERVER: "OBSERVER",
  GOVERNOR: "GOVERNOR",
  EXECUTOR: "EXECUTOR",
} as const;

export type PowerRole = (typeof POWER)[keyof typeof POWER];

/**
 * Permission matrix — each power has an explicit set of allowed operations.
 * Anything not listed is FORBIDDEN.
 */
export const PERMISSIONS: Record<PowerRole, {
  canRead: boolean;
  canAssessRisk: boolean;
  canSendSignals: boolean;
  canApprove: boolean;
  canSign: boolean;
  canExecute: boolean;
  canWriteLedger: boolean;
  canReadFullState: boolean;
}> = {
  OBSERVER: {
    canRead: true,
    canAssessRisk: true,
    canSendSignals: true,
    canApprove: false,
    canSign: false,
    canExecute: false,
    canWriteLedger: false,
    canReadFullState: true,
  },
  GOVERNOR: {
    canRead: false,           // Only reads signals from Observer, not raw data
    canAssessRisk: false,     // Risk assessment is Observer's job
    canSendSignals: false,
    canApprove: true,
    canSign: true,
    canExecute: false,        // CRITICAL: Governor cannot execute
    canWriteLedger: false,
    canReadFullState: false,  // Only sees what Observer sends
  },
  EXECUTOR: {
    canRead: false,           // Cannot observe full state
    canAssessRisk: false,
    canSendSignals: false,
    canApprove: false,        // CRITICAL: Executor cannot approve
    canSign: false,           // CRITICAL: Executor cannot sign
    canExecute: true,
    canWriteLedger: true,     // Only Executor writes to ledger after execution
    canReadFullState: false,
  },
} as const;

/**
 * Check if a power is allowed to perform an operation.
 * Returns { allowed: true } or { allowed: false, reason: string }.
 */
export function checkPermission(
  power: PowerRole,
  operation: keyof typeof PERMISSIONS["OBSERVER"],
): { allowed: boolean; reason?: string } {
  const perms = PERMISSIONS[power];
  if (!perms) {
    return { allowed: false, reason: `Unknown power: ${power}` };
  }
  if (!perms[operation]) {
    return {
      allowed: false,
      reason: `${power} is forbidden from ${operation}. This is an infrastructure-level restriction.`,
    };
  }
  return { allowed: true };
}

// ═══════════════════════════════════════════════════════════════
// COMPONENT IDENTITY — Each component has a unique identity
// ═══════════════════════════════════════════════════════════════

export interface ComponentIdentity {
  componentId: string;
  power: PowerRole;
  publicKey: string;       // Ed25519 public key (hex)
  createdAt: number;
}

/**
 * Generate a new Ed25519 keypair for a component.
 * Returns { privateKey, publicKey } as hex strings.
 */
export function generateComponentKeys(): { privateKey: string; publicKey: string } {
  const { secretKey: privateKey, publicKey } = ed.keygen();
  return {
    privateKey: Buffer.from(privateKey).toString("hex"),
    publicKey: Buffer.from(publicKey).toString("hex"),
  };
}

// ═══════════════════════════════════════════════════════════════
// QUEUE MESSAGES — Typed messages between powers
// ═══════════════════════════════════════════════════════════════

/**
 * Observer → Governor: Risk assessment signal.
 * Observer can only SEND signals, never approve or execute.
 */
export interface ObserverSignal {
  signal_id: string;
  source_power: "OBSERVER";
  target_power: "GOVERNOR";
  intent_id: string;
  intent_hash: string;
  risk_level: "LOW" | "MEDIUM" | "HIGH";
  risk_score: number;
  risk_factors: string[];
  recommendation: "AUTO_APPROVE" | "REQUIRE_HUMAN_APPROVAL" | "DENY";
  observed_at: number;
  signal_hash: string;
}

/**
 * Governor → Executor: Signed approval token.
 * Governor can only SIGN and SEND approvals, never execute.
 */
export interface GovernorApproval {
  approval_id: string;
  source_power: "GOVERNOR";
  target_power: "EXECUTOR";
  intent_id: string;
  intent_hash: string;
  action_hash: string;
  decision: "APPROVED" | "REJECTED";
  approver_id: string;
  policy_version: string;
  conditions: string[];
  signed_at: number;
  signature: string;         // Ed25519 signature over the approval payload
  governor_public_key: string; // So Executor can verify
}

/**
 * Executor → Ledger: Execution result with receipt.
 * Executor can only EXECUTE and WRITE to ledger.
 */
export interface ExecutorResult {
  result_id: string;
  source_power: "EXECUTOR";
  intent_id: string;
  intent_hash: string;
  approval_id: string;
  approval_signature: string;
  execution_success: boolean;
  connector_output: unknown;
  receipt_hash: string;
  executed_at: number;
}

// ═══════════════════════════════════════════════════════════════
// IN-MEMORY QUEUES — Simulated message queues between powers
// (In production: Azure Service Bus with scoped RBAC)
// ═══════════════════════════════════════════════════════════════

export interface QueueMessage<T> {
  messageId: string;
  payload: T;
  enqueuedAt: number;
  processedAt: number | null;
}

class PowerQueue<T> {
  private messages: QueueMessage<T>[] = [];
  private allowedSender: PowerRole;
  private allowedReceiver: PowerRole;

  constructor(sender: PowerRole, receiver: PowerRole) {
    this.allowedSender = sender;
    this.allowedReceiver = receiver;
  }

  /**
   * Enqueue a message. Only the designated sender can enqueue.
   * Throws if the wrong power tries to send.
   */
  enqueue(senderPower: PowerRole, payload: T): QueueMessage<T> {
    if (senderPower !== this.allowedSender) {
      throw new Error(
        `QUEUE_VIOLATION: ${senderPower} cannot send to ${this.allowedSender}→${this.allowedReceiver} queue. ` +
        `Only ${this.allowedSender} can send.`
      );
    }
    const msg: QueueMessage<T> = {
      messageId: `MSG-${nanoid(16)}`,
      payload,
      enqueuedAt: Date.now(),
      processedAt: null,
    };
    this.messages.push(msg);
    return msg;
  }

  /**
   * Dequeue the next unprocessed message. Only the designated receiver can dequeue.
   * Throws if the wrong power tries to receive.
   */
  dequeue(receiverPower: PowerRole): QueueMessage<T> | null {
    if (receiverPower !== this.allowedReceiver) {
      throw new Error(
        `QUEUE_VIOLATION: ${receiverPower} cannot receive from ${this.allowedSender}→${this.allowedReceiver} queue. ` +
        `Only ${this.allowedReceiver} can receive.`
      );
    }
    const next = this.messages.find(m => m.processedAt === null);
    if (next) {
      next.processedAt = Date.now();
    }
    return next ?? null;
  }

  /** Peek at pending messages without consuming them */
  pending(): QueueMessage<T>[] {
    return this.messages.filter(m => m.processedAt === null);
  }

  /** Get all messages (for audit) */
  all(): QueueMessage<T>[] {
    return [...this.messages];
  }

  /** Clear queue — for testing only */
  _clear(): void {
    this.messages = [];
  }
}

// The two queues that enforce message flow direction
export const observerToGovernorQueue = new PowerQueue<ObserverSignal>("OBSERVER", "GOVERNOR");
export const governorToExecutorQueue = new PowerQueue<GovernorApproval>("GOVERNOR", "EXECUTOR");

// ═══════════════════════════════════════════════════════════════
// SIGNING — Ed25519 signatures for Governor approvals
// ═══════════════════════════════════════════════════════════════

function canonicalJson(obj: unknown): string {
  if (obj === null || obj === undefined) return JSON.stringify(obj);
  if (typeof obj !== "object") return JSON.stringify(obj);
  if (Array.isArray(obj)) {
    return "[" + obj.map(item => canonicalJson(item)).join(",") + "]";
  }
  const sorted = Object.keys(obj as Record<string, unknown>).sort();
  const pairs = sorted.map(key =>
    JSON.stringify(key) + ":" + canonicalJson((obj as Record<string, unknown>)[key])
  );
  return "{" + pairs.join(",") + "}";
}

function hashString(data: string): string {
  return createHash("sha256").update(data).digest("hex");
}

/**
 * Governor signs an approval payload with Ed25519.
 * Returns the hex-encoded signature.
 */
export function signApproval(
  payload: Omit<GovernorApproval, "signature" | "governor_public_key">,
  governorPrivateKeyHex: string,
): string {
  const canonical = canonicalJson(payload);
  const messageBytes = new TextEncoder().encode(canonical);
  const privateKey = Buffer.from(governorPrivateKeyHex, "hex");
  const signature = ed.sign(messageBytes, privateKey);
  return Buffer.from(signature).toString("hex");
}

/**
 * Executor verifies a Governor's approval signature.
 * Returns true if the signature is valid.
 */
export function verifyApprovalSignature(
  approval: GovernorApproval,
): boolean {
  try {
    const { signature, governor_public_key, ...payload } = approval;
    const canonical = canonicalJson(payload);
    const messageBytes = new TextEncoder().encode(canonical);
    const signatureBytes = Buffer.from(signature, "hex");
    const publicKeyBytes = Buffer.from(governor_public_key, "hex");
    return ed.verify(signatureBytes, messageBytes, publicKeyBytes);
  } catch {
    return false;
  }
}

// ═══════════════════════════════════════════════════════════════
// THREE-POWER ACTORS — Runtime implementations
// ═══════════════════════════════════════════════════════════════

/**
 * OBSERVER — Reads system state, assesses risk, sends signals to Governor.
 * CANNOT: approve, sign, execute, or write to ledger.
 */
export class Observer {
  readonly power = POWER.OBSERVER;
  readonly componentId: string;

  constructor(componentId?: string) {
    this.componentId = componentId ?? `OBS-${nanoid(8)}`;
  }

  /**
   * Assess risk for an intent and produce a signal for the Governor.
   */
  assessRisk(params: {
    intentId: string;
    intentHash: string;
    toolName: string;
    toolArgs: Record<string, unknown>;
    riskTier: "LOW" | "MEDIUM" | "HIGH";
    blastRadiusBase: number;
  }): ObserverSignal {
    // Verify permission
    const perm = checkPermission(this.power, "canAssessRisk");
    if (!perm.allowed) throw new Error(perm.reason);

    const argCount = Object.keys(params.toolArgs).length;
    const risk_score = Math.min(10, params.blastRadiusBase + Math.floor(argCount / 2));

    const risk_factors: string[] = [];
    if (params.riskTier === "HIGH") risk_factors.push("HIGH risk tier tool");
    if (risk_score >= 7) risk_factors.push(`High blast radius: ${risk_score}/10`);
    if (params.toolArgs.to || params.toolArgs.recipient) risk_factors.push("External recipient specified");

    let recommendation: ObserverSignal["recommendation"];
    if (params.riskTier === "LOW") {
      recommendation = "AUTO_APPROVE";
    } else if (params.riskTier === "HIGH") {
      recommendation = "REQUIRE_HUMAN_APPROVAL";
    } else {
      recommendation = risk_score >= 6 ? "REQUIRE_HUMAN_APPROVAL" : "AUTO_APPROVE";
    }

    const signal: Omit<ObserverSignal, "signal_hash"> = {
      signal_id: `SIG-${nanoid(16)}`,
      source_power: "OBSERVER",
      target_power: "GOVERNOR",
      intent_id: params.intentId,
      intent_hash: params.intentHash,
      risk_level: params.riskTier,
      risk_score,
      risk_factors,
      recommendation,
      observed_at: Date.now(),
    };

    const signal_hash = hashString(canonicalJson(signal));

    return { ...signal, signal_hash };
  }

  /**
   * Send a signal to the Governor via the Observer→Governor queue.
   */
  sendSignal(signal: ObserverSignal): QueueMessage<ObserverSignal> {
    const perm = checkPermission(this.power, "canSendSignals");
    if (!perm.allowed) throw new Error(perm.reason);
    return observerToGovernorQueue.enqueue(this.power, signal);
  }

  // ─── FORBIDDEN OPERATIONS ───────────────────────────────────
  // These methods exist to prove they throw, not to be called.

  approve(): never {
    throw new Error(
      `POWER_VIOLATION: OBSERVER cannot approve. ` +
      `"No component should be trusted because of what it is supposed to do; ` +
      `each component must be restricted by what it is technically impossible for it to do."`
    );
  }

  execute(): never {
    throw new Error(
      `POWER_VIOLATION: OBSERVER cannot execute. ` +
      `Observer has READ-ONLY + signal-send capability.`
    );
  }
}

/**
 * GOVERNOR — Receives signals from Observer, makes approval decisions, signs approvals.
 * CANNOT: execute, read full state, or write to ledger.
 */
export class Governor {
  readonly power = POWER.GOVERNOR;
  readonly componentId: string;
  private privateKey: string;
  readonly publicKey: string;

  constructor(privateKeyHex: string, publicKeyHex: string, componentId?: string) {
    this.componentId = componentId ?? `GOV-${nanoid(8)}`;
    this.privateKey = privateKeyHex;
    this.publicKey = publicKeyHex;
  }

  /**
   * Receive the next signal from the Observer→Governor queue.
   */
  receiveSignal(): QueueMessage<ObserverSignal> | null {
    return observerToGovernorQueue.dequeue(this.power);
  }

  /**
   * Make an approval decision and sign it.
   * The Governor can only approve or reject — it cannot execute.
   */
  makeDecision(params: {
    signal: ObserverSignal;
    humanDecision: "APPROVED" | "REJECTED";
    approverId: string;
    policyVersion: string;
    conditions?: string[];
    actionHash: string;
  }): GovernorApproval {
    const perm = checkPermission(this.power, "canApprove");
    if (!perm.allowed) throw new Error(perm.reason);

    const approvalPayload: Omit<GovernorApproval, "signature" | "governor_public_key"> = {
      approval_id: `GAPPR-${nanoid(16)}`,
      source_power: "GOVERNOR",
      target_power: "EXECUTOR",
      intent_id: params.signal.intent_id,
      intent_hash: params.signal.intent_hash,
      action_hash: params.actionHash,
      decision: params.humanDecision,
      approver_id: params.approverId,
      policy_version: params.policyVersion,
      conditions: params.conditions ?? [],
      signed_at: Date.now(),
    };

    // Sign the approval with the Governor's Ed25519 key
    const signature = signApproval(approvalPayload, this.privateKey);

    return {
      ...approvalPayload,
      signature,
      governor_public_key: this.publicKey,
    };
  }

  /**
   * Send a signed approval to the Executor via the Governor→Executor queue.
   */
  sendApproval(approval: GovernorApproval): QueueMessage<GovernorApproval> {
    const perm = checkPermission(this.power, "canSign");
    if (!perm.allowed) throw new Error(perm.reason);
    return governorToExecutorQueue.enqueue(this.power, approval);
  }

  // ─── FORBIDDEN OPERATIONS ───────────────────────────────────

  execute(): never {
    throw new Error(
      `POWER_VIOLATION: GOVERNOR cannot execute. ` +
      `Governor has SIGN + APPROVE capability only.`
    );
  }

  readFullState(): never {
    throw new Error(
      `POWER_VIOLATION: GOVERNOR cannot read full system state. ` +
      `Governor only sees what Observer signals provide.`
    );
  }
}

/**
 * EXECUTOR — Receives signed approvals from Governor, verifies signature, executes action.
 * CANNOT: approve, sign, observe full state, or make decisions.
 */
export class Executor {
  readonly power = POWER.EXECUTOR;
  readonly componentId: string;

  constructor(componentId?: string) {
    this.componentId = componentId ?? `EXEC-${nanoid(8)}`;
  }

  /**
   * Receive the next signed approval from the Governor→Executor queue.
   */
  receiveApproval(): QueueMessage<GovernorApproval> | null {
    return governorToExecutorQueue.dequeue(this.power);
  }

  /**
   * Verify the Governor's signature on an approval before executing.
   * This is the cryptographic enforcement boundary.
   */
  verifyApproval(approval: GovernorApproval): { valid: boolean; reason?: string } {
    if (approval.decision !== "APPROVED") {
      return { valid: false, reason: "Decision is not APPROVED" };
    }

    const signatureValid = verifyApprovalSignature(approval);
    if (!signatureValid) {
      return { valid: false, reason: "SIGNATURE_INVALID: Governor signature verification failed. Execution blocked." };
    }

    return { valid: true };
  }

  /**
   * Execute an action after verifying the Governor's signed approval.
   * Returns the execution result.
   */
  async executeAction(params: {
    approval: GovernorApproval;
    connector: (args: Record<string, unknown>) => Promise<{
      success: boolean;
      output: unknown;
      metadata?: Record<string, unknown>;
    }>;
    toolArgs: Record<string, unknown>;
  }): Promise<ExecutorResult> {
    const perm = checkPermission(this.power, "canExecute");
    if (!perm.allowed) throw new Error(perm.reason);

    // CRITICAL: Verify signature before execution
    const verification = this.verifyApproval(params.approval);
    if (!verification.valid) {
      throw new Error(
        `EXECUTION_BLOCKED: ${verification.reason}. ` +
        `Executor will not execute without a valid Governor signature.`
      );
    }

    // Verify action hash matches what was approved
    const currentActionHash = hashString(canonicalJson(params.toolArgs));
    if (currentActionHash !== params.approval.action_hash) {
      throw new Error(
        `EXECUTION_BLOCKED: Action hash mismatch. ` +
        `Approved: ${params.approval.action_hash}, Current: ${currentActionHash}. ` +
        `Parameters changed after approval.`
      );
    }

    // Execute through connector
    let connectorResult: { success: boolean; output: unknown; metadata?: Record<string, unknown> };
    try {
      connectorResult = await params.connector(params.toolArgs);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      connectorResult = { success: false, output: null, metadata: { error: msg } };
    }

    // Generate receipt hash
    const receiptPayload = canonicalJson({
      intent_id: params.approval.intent_id,
      intent_hash: params.approval.intent_hash,
      approval_id: params.approval.approval_id,
      approval_signature: params.approval.signature,
      execution_success: connectorResult.success,
      executed_at: Date.now(),
    });
    const receipt_hash = hashString(receiptPayload);

    return {
      result_id: `ERES-${nanoid(16)}`,
      source_power: "EXECUTOR",
      intent_id: params.approval.intent_id,
      intent_hash: params.approval.intent_hash,
      approval_id: params.approval.approval_id,
      approval_signature: params.approval.signature,
      execution_success: connectorResult.success,
      connector_output: connectorResult.output,
      receipt_hash,
      executed_at: Date.now(),
    };
  }

  // ─── FORBIDDEN OPERATIONS ───────────────────────────────────

  approve(): never {
    throw new Error(
      `POWER_VIOLATION: EXECUTOR cannot approve. ` +
      `Executor has EXECUTE + LEDGER-WRITE capability only.`
    );
  }

  sign(): never {
    throw new Error(
      `POWER_VIOLATION: EXECUTOR cannot sign. ` +
      `Only the Governor holds signing keys.`
    );
  }

  readFullState(): never {
    throw new Error(
      `POWER_VIOLATION: EXECUTOR cannot read full system state. ` +
      `Executor only sees the approved action payload.`
    );
  }
}

// ═══════════════════════════════════════════════════════════════
// FULL THREE-POWER CLOSED LOOP
// ═══════════════════════════════════════════════════════════════

export interface ThreePowerLoopResult {
  success: boolean;
  stage_reached: "OBSERVATION" | "GOVERNANCE" | "EXECUTION" | "LEDGER" | "COMPLETE";
  error?: string;
  observer_signal?: ObserverSignal;
  governor_approval?: GovernorApproval;
  executor_result?: ExecutorResult;
  ledger_entry?: {
    receipt_hash: string;
    prev_hash: string;
    current_hash: string;
    block_index: number;
  };
}

/**
 * Execute the full three-power closed loop for one intent.
 * This is the finish line for Phase 1.
 *
 * Flow:
 *   1. Observer assesses risk → sends signal to Governor queue
 *   2. Governor receives signal → makes decision → signs approval → sends to Executor queue
 *   3. Executor receives approval → verifies signature → executes action → writes receipt + ledger
 *
 * Each power can ONLY do what its permission set allows.
 * Queue isolation prevents cross-boundary message injection.
 * Ed25519 signatures prevent approval forgery.
 */
export async function executeThreePowerLoop(params: {
  observer: Observer;
  governor: Governor;
  executor: Executor;
  intentId: string;
  intentHash: string;
  toolName: string;
  toolArgs: Record<string, unknown>;
  riskTier: "LOW" | "MEDIUM" | "HIGH";
  blastRadiusBase: number;
  humanDecision: "APPROVED" | "REJECTED";
  approverId: string;
  policyVersion: string;
  connector: (args: Record<string, unknown>) => Promise<{
    success: boolean;
    output: unknown;
    metadata?: Record<string, unknown>;
  }>;
  previousLedgerHash: string;
  blockIndex: number;
}): Promise<ThreePowerLoopResult> {

  // ─── STEP 1: OBSERVER assesses risk ─────────────────────────
  let signal: ObserverSignal;
  try {
    signal = params.observer.assessRisk({
      intentId: params.intentId,
      intentHash: params.intentHash,
      toolName: params.toolName,
      toolArgs: params.toolArgs,
      riskTier: params.riskTier,
      blastRadiusBase: params.blastRadiusBase,
    });
    params.observer.sendSignal(signal);
  } catch (err: unknown) {
    return {
      success: false,
      stage_reached: "OBSERVATION",
      error: err instanceof Error ? err.message : String(err),
    };
  }

  // ─── STEP 2: GOVERNOR receives signal and makes decision ────
  let approval: GovernorApproval;
  try {
    const received = params.governor.receiveSignal();
    if (!received) {
      return {
        success: false,
        stage_reached: "GOVERNANCE",
        error: "No signal in Observer→Governor queue",
        observer_signal: signal,
      };
    }

    // Compute action hash for binding
    const actionHash = hashString(canonicalJson(params.toolArgs));

    approval = params.governor.makeDecision({
      signal: received.payload,
      humanDecision: params.humanDecision,
      approverId: params.approverId,
      policyVersion: params.policyVersion,
      actionHash,
    });

    // If rejected, stop here
    if (approval.decision === "REJECTED") {
      return {
        success: false,
        stage_reached: "GOVERNANCE",
        error: "Intent rejected by Governor",
        observer_signal: signal,
        governor_approval: approval,
      };
    }

    params.governor.sendApproval(approval);
  } catch (err: unknown) {
    return {
      success: false,
      stage_reached: "GOVERNANCE",
      error: err instanceof Error ? err.message : String(err),
      observer_signal: signal,
    };
  }

  // ─── STEP 3: EXECUTOR receives approval and executes ────────
  let executorResult: ExecutorResult;
  try {
    const received = params.executor.receiveApproval();
    if (!received) {
      return {
        success: false,
        stage_reached: "EXECUTION",
        error: "No approval in Governor→Executor queue",
        observer_signal: signal,
        governor_approval: approval,
      };
    }

    executorResult = await params.executor.executeAction({
      approval: received.payload,
      connector: params.connector,
      toolArgs: params.toolArgs,
    });
  } catch (err: unknown) {
    return {
      success: false,
      stage_reached: "EXECUTION",
      error: err instanceof Error ? err.message : String(err),
      observer_signal: signal,
      governor_approval: approval,
    };
  }

  // ─── STEP 4: EXECUTOR writes to ledger ──────────────────────
  const ledgerPayload = canonicalJson({
    block_index: params.blockIndex,
    receipt_hash: executorResult.receipt_hash,
    previous_ledger_hash: params.previousLedgerHash,
    intent_id: executorResult.intent_id,
    approval_id: executorResult.approval_id,
    execution_success: executorResult.execution_success,
    timestamp: executorResult.executed_at,
  });
  const current_hash = hashString(ledgerPayload);

  return {
    success: executorResult.execution_success,
    stage_reached: "COMPLETE",
    observer_signal: signal,
    governor_approval: approval,
    executor_result: executorResult,
    ledger_entry: {
      receipt_hash: executorResult.receipt_hash,
      prev_hash: params.previousLedgerHash,
      current_hash,
      block_index: params.blockIndex,
    },
  };
}

// ═══════════════════════════════════════════════════════════════
// TESTING HELPERS
// ═══════════════════════════════════════════════════════════════

/** Clear all queues — for testing only */
export function _clearQueues(): void {
  observerToGovernorQueue._clear();
  governorToExecutorQueue._clear();
}
