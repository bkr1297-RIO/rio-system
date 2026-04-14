/**
 * RIO Standard Receipt + Action Envelope + Adapters
 * ──────────────────────────────────────────────────
 * Canonical Build Spec v1.0 — Sections 1, 2, 4, 7, 12
 *
 * This module defines:
 *   1. ActionEnvelope — full spec shape (Section 1)
 *   2. Envelope validation (Section 2 — Gateway must validate)
 *   3. Gateway decision output (Section 2)
 *   4. StandardReceipt — enriched with action_envelope_hash + policy_version (Section 4)
 *   5. Duplicate protection (Section 12)
 *   6. RIOAdapter interface (Section 7)
 *
 * Does NOT change the core execution loop. These are contracts only.
 */

import { randomUUID, createHash } from "crypto";
import type { CanonicalReceipt } from "./authorityLayer";
import type { LedgerEntry } from "./librarian";

// ═══════════════════════════════════════════════════════════════
// 1. ACTION ENVELOPE — Full Spec Shape (CBS Section 1)
// ═══════════════════════════════════════════════════════════════

/**
 * Actor — who/what initiated the action.
 * Spec: { id, type: "human|ai|system", source, role? }
 */
export interface EnvelopeActor {
  id: string;                                    // e.g. "brian", "gemini-2.5", "rio-system"
  type: "human" | "ai" | "system";
  source: string;                                // e.g. "telegram", "gmail", "one-ui"
  role?: string;                                 // e.g. "owner", "operator", "agent"
}

/**
 * Intent — what the action wants to do.
 * Spec: { type, description? }
 */
export interface EnvelopeIntent {
  type: string;                                  // e.g. "send_email", "send_sms", "system_status"
  description?: string;                          // human-readable description
}

/**
 * Resource — what the action targets.
 * Spec: { type, id }
 */
export interface EnvelopeResource {
  type: string;                                  // e.g. "email", "sms", "system", "file"
  id: string;                                    // e.g. email address, phone number, file path
}

/**
 * Payload — the action's data.
 * Spec: { content, metadata }
 */
export interface EnvelopePayload {
  content: string;                               // primary content (email body, message text, etc.)
  metadata: Record<string, unknown>;             // additional structured data
}

/**
 * Constraints — policy + risk context.
 * Spec: { policies: [], risk_level }
 */
export interface EnvelopeConstraints {
  policies: string[];                            // policy IDs that apply
  risk_level: "low" | "medium" | "high";
}

/**
 * ActionEnvelope — the mandatory input standard.
 * All inputs must be wrapped into this structure before Gateway.
 * CBS Section 1.
 */
export interface ActionEnvelope {
  action_id: string;                             // UUID — unique per action
  timestamp: string;                             // ISO 8601

  actor: EnvelopeActor;
  intent: EnvelopeIntent;
  resource: EnvelopeResource;
  payload: EnvelopePayload;
  constraints: EnvelopeConstraints;

  state_ref: {
    state_hash: string;                          // hash of current system state
  };

  policy_ref: {
    version: string;                             // policy version string
  };
}

// ═══════════════════════════════════════════════════════════════
// ENVELOPE CREATION — wrapInEnvelope (backward-compatible)
// ═══════════════════════════════════════════════════════════════

export type InputSource = "gemini" | "telegram" | "gmail" | "outlook" | "one-ui" | "api" | "scheduled" | "sms";

/**
 * Create a full-spec ActionEnvelope from any input source.
 * This is the normalization layer — all inputs pass through here.
 *
 * Backward-compatible: accepts the old simple params plus new optional fields.
 */
export function wrapInEnvelope(params: {
  // Required (same as before)
  actor: string;
  toolName: string;
  target: string;
  parameters: Record<string, unknown>;
  source: InputSource;
  policyHash: string;
  // New optional fields for full spec compliance
  actorType?: "human" | "ai" | "system";
  actorRole?: string;
  description?: string;
  resourceType?: string;
  content?: string;
  riskLevel?: "low" | "medium" | "high";
  policies?: string[];
  stateHash?: string;
  policyVersion?: string;
}): ActionEnvelope {
  return {
    action_id: randomUUID(),
    timestamp: new Date().toISOString(),

    actor: {
      id: params.actor,
      type: params.actorType ?? (params.source === "gemini" ? "ai" : params.source === "scheduled" ? "system" : "human"),
      source: params.source,
      role: params.actorRole,
    },

    intent: {
      type: params.toolName,
      description: params.description,
    },

    resource: {
      type: params.resourceType ?? inferResourceType(params.toolName),
      id: params.target,
    },

    payload: {
      content: params.content ?? "",
      metadata: params.parameters,
    },

    constraints: {
      policies: params.policies ?? [params.policyHash],
      risk_level: params.riskLevel ?? "low",
    },

    state_ref: {
      state_hash: params.stateHash ?? "",
    },

    policy_ref: {
      version: params.policyVersion ?? "v1",
    },
  };
}

/**
 * Infer resource type from tool name.
 */
function inferResourceType(toolName: string): string {
  if (toolName.includes("email") || toolName.includes("mail")) return "email";
  if (toolName.includes("sms")) return "sms";
  if (toolName.includes("search")) return "web";
  if (toolName.includes("drive")) return "file";
  if (toolName.includes("status") || toolName.includes("health")) return "system";
  return "unknown";
}

// ═══════════════════════════════════════════════════════════════
// 2. ENVELOPE VALIDATION (CBS Section 2 — Gateway must validate)
// ═══════════════════════════════════════════════════════════════

export interface EnvelopeValidationResult {
  valid: boolean;
  errors: string[];
}

/**
 * Validate an ActionEnvelope before Gateway processing.
 * Rejects invalid inputs — no fallback.
 * CBS Section 2: "validate envelope, reject invalid inputs, no fallback"
 */
export function validateEnvelope(envelope: unknown): EnvelopeValidationResult {
  const errors: string[] = [];

  if (!envelope || typeof envelope !== "object") {
    return { valid: false, errors: ["Envelope must be a non-null object"] };
  }

  const e = envelope as Record<string, unknown>;

  // Required top-level fields
  if (!e.action_id || typeof e.action_id !== "string") errors.push("Missing or invalid action_id");
  if (!e.timestamp || typeof e.timestamp !== "string") errors.push("Missing or invalid timestamp");

  // Actor validation
  if (!e.actor || typeof e.actor !== "object") {
    errors.push("Missing or invalid actor object");
  } else {
    const actor = e.actor as Record<string, unknown>;
    if (!actor.id || typeof actor.id !== "string") errors.push("Missing or invalid actor.id");
    if (!["human", "ai", "system"].includes(actor.type as string)) errors.push("actor.type must be human|ai|system");
    if (!actor.source || typeof actor.source !== "string") errors.push("Missing or invalid actor.source");
  }

  // Intent validation
  if (!e.intent || typeof e.intent !== "object") {
    errors.push("Missing or invalid intent object");
  } else {
    const intent = e.intent as Record<string, unknown>;
    if (!intent.type || typeof intent.type !== "string") errors.push("Missing or invalid intent.type");
  }

  // Resource validation
  if (!e.resource || typeof e.resource !== "object") {
    errors.push("Missing or invalid resource object");
  } else {
    const resource = e.resource as Record<string, unknown>;
    if (!resource.type || typeof resource.type !== "string") errors.push("Missing or invalid resource.type");
    if (!resource.id || typeof resource.id !== "string") errors.push("Missing or invalid resource.id");
  }

  // Payload validation
  if (!e.payload || typeof e.payload !== "object") {
    errors.push("Missing or invalid payload object");
  }

  // Constraints validation
  if (!e.constraints || typeof e.constraints !== "object") {
    errors.push("Missing or invalid constraints object");
  } else {
    const constraints = e.constraints as Record<string, unknown>;
    if (!["low", "medium", "high"].includes(constraints.risk_level as string)) {
      errors.push("constraints.risk_level must be low|medium|high");
    }
  }

  // state_ref validation
  if (!e.state_ref || typeof e.state_ref !== "object") {
    errors.push("Missing or invalid state_ref object");
  }

  // policy_ref validation
  if (!e.policy_ref || typeof e.policy_ref !== "object") {
    errors.push("Missing or invalid policy_ref object");
  }

  return { valid: errors.length === 0, errors };
}

// ═══════════════════════════════════════════════════════════════
// 2b. GATEWAY DECISION OUTPUT (CBS Section 2)
// ═══════════════════════════════════════════════════════════════

/**
 * GatewayDecision — the structured output from Gateway evaluation.
 * CBS Section 2: { action_id, result, message, cooldown_ms, requires_confirmation }
 */
export interface GatewayDecision {
  action_id: string;
  result: "ALLOW" | "WARN" | "REQUIRE_CONFIRMATION" | "BLOCK";
  message: string;
  cooldown_ms: number;
  requires_confirmation: boolean;
}

/**
 * Create a GatewayDecision from envelope + policy evaluation.
 */
export function createGatewayDecision(
  envelope: ActionEnvelope,
  result: GatewayDecision["result"],
  message: string,
  cooldownMs: number = 0,
): GatewayDecision {
  return {
    action_id: envelope.action_id,
    result,
    message,
    cooldown_ms: cooldownMs,
    requires_confirmation: result === "REQUIRE_CONFIRMATION",
  };
}

// ═══════════════════════════════════════════════════════════════
// 3. STANDARD RECEIPT — Enriched (CBS Section 4)
// ═══════════════════════════════════════════════════════════════

/**
 * ActionIntent — what was proposed, in plain terms.
 */
export interface ActionIntent {
  type: string;
  target: string;
  parameters: Record<string, unknown>;
  consequential: boolean;
}

/**
 * StandardReceipt — the unified receipt format.
 * Now includes action_envelope_hash and policy_version per CBS Section 4.
 */
export interface StandardReceipt {
  // ─── CBS Section 4 fields ───────────────────────────────────
  receipt_id: string;
  prev_receipt_hash: string;
  action_id: string;                             // from envelope
  action_intent: ActionIntent;
  policy_decision: "ALLOW" | "REQUIRE_APPROVAL" | "DENY";
  approval_status: "APPROVED" | "REJECTED" | "AUTO_APPROVED" | "PENDING";
  execution_status: "EXECUTED" | "BLOCKED" | "FAILED";
  timestamp: string;
  receipt_hash: string;

  // ─── CBS Section 4 additional fields ────────────────────────
  action_envelope_hash: string;                  // SHA-256 of the ActionEnvelope
  policy_version: string;                        // from envelope.policy_ref.version

  // ─── RIO system fields ──────────────────────────────────────
  intent_id: string;
  proposer_id: string;
  approver_id: string;
  token_id: string;
  execution_hash: string;
  policy_hash: string;
  snapshot_hash: string;
  gateway_signature: string;
  ledger_entry_id: string;
  decision_delta_ms: number | null;
  timestamp_proposed: string;
  timestamp_approved: string;
  timestamp_executed: string;

  // ─── Actor context ──────────────────────────────────────────
  actor: EnvelopeActor;
}

/**
 * Compute the SHA-256 hash of an ActionEnvelope.
 */
export function hashEnvelope(envelope: ActionEnvelope): string {
  return createHash("sha256")
    .update(JSON.stringify(envelope))
    .digest("hex");
}

/**
 * Convert a CanonicalReceipt to StandardReceipt.
 * Now accepts envelope for action_envelope_hash + policy_version.
 */
export function toStandardReceipt(
  canonical: CanonicalReceipt,
  actionIntent: ActionIntent,
  policyDecision: "ALLOW" | "REQUIRE_APPROVAL" | "DENY" = "REQUIRE_APPROVAL",
  envelope?: ActionEnvelope,
): StandardReceipt {
  return {
    // CBS Section 4 fields
    receipt_id: canonical.receipt_id,
    prev_receipt_hash: canonical.previous_receipt_hash,
    action_id: envelope?.action_id ?? canonical.intent_id,
    action_intent: actionIntent,
    policy_decision: policyDecision,
    approval_status: canonical.status === "SUCCESS" ? "APPROVED" : "APPROVED",
    execution_status: canonical.status === "SUCCESS" ? "EXECUTED" : "FAILED",
    timestamp: canonical.timestamp_executed,
    receipt_hash: canonical.receipt_hash,

    // CBS Section 4 additional
    action_envelope_hash: envelope ? hashEnvelope(envelope) : "",
    policy_version: envelope?.policy_ref.version ?? "v1",

    // RIO system fields
    intent_id: canonical.intent_id,
    proposer_id: canonical.proposer_id,
    approver_id: canonical.approver_id,
    token_id: canonical.token_id,
    execution_hash: canonical.execution_hash,
    policy_hash: canonical.policy_hash,
    snapshot_hash: canonical.snapshot_hash,
    gateway_signature: canonical.gateway_signature,
    ledger_entry_id: canonical.ledger_entry_id,
    decision_delta_ms: canonical.decision_delta_ms,
    timestamp_proposed: canonical.timestamp_proposed,
    timestamp_approved: canonical.timestamp_approved,
    timestamp_executed: canonical.timestamp_executed,

    // Actor context
    actor: envelope?.actor ?? {
      id: canonical.proposer_id,
      type: "human",
      source: "unknown",
    },
  };
}

/**
 * Convert a StandardReceipt to the Librarian LedgerEntry format.
 * Enriches the entry with action_intent data.
 */
export function toEnrichedLedgerEntry(receipt: StandardReceipt): LedgerEntry & {
  action_type: string;
  action_target: string;
  execution_status: string;
  policy_decision: string;
} {
  return {
    receipt_id: receipt.receipt_id,
    receipt_hash: receipt.receipt_hash,
    previous_receipt_hash: receipt.prev_receipt_hash,
    proposer_id: receipt.proposer_id,
    approver_id: receipt.approver_id,
    decision: receipt.approval_status,
    timestamp: receipt.timestamp,
    action_type: receipt.action_intent.type,
    action_target: receipt.action_intent.target,
    execution_status: receipt.execution_status,
    policy_decision: receipt.policy_decision,
  };
}

// ═══════════════════════════════════════════════════════════════
// 12. DUPLICATE PROTECTION (CBS Section 12)
// ═══════════════════════════════════════════════════════════════

/**
 * In-memory set of recently seen action_ids.
 * Prevents duplicate envelope processing.
 * Bounded to prevent memory leaks.
 */
const MAX_DEDUP_SIZE = 10000;
const seenActionIds = new Set<string>();
const actionIdQueue: string[] = [];

/**
 * Check if an action_id has been seen before.
 * Returns true if duplicate (should reject).
 */
export function isDuplicateAction(actionId: string): boolean {
  if (seenActionIds.has(actionId)) return true;
  return false;
}

/**
 * Record an action_id as seen.
 * Evicts oldest entries when capacity is reached.
 */
export function recordActionId(actionId: string): void {
  if (seenActionIds.has(actionId)) return;

  seenActionIds.add(actionId);
  actionIdQueue.push(actionId);

  // Evict oldest if over capacity
  while (actionIdQueue.length > MAX_DEDUP_SIZE) {
    const oldest = actionIdQueue.shift();
    if (oldest) seenActionIds.delete(oldest);
  }
}

/**
 * Reset dedup state (for testing).
 */
export function _resetDedup(): void {
  seenActionIds.clear();
  actionIdQueue.length = 0;
}

// ═══════════════════════════════════════════════════════════════
// 7. ADAPTER INTERFACE (CBS Section 7)
// ═══════════════════════════════════════════════════════════════

/**
 * RIOAdapter — the contract every input surface must implement.
 * CBS Section 7: toActionEnvelope(event), fromDecision(decision, context)
 *
 * Adapters do NOT:
 *   - evaluate policy
 *   - make decisions
 *
 * They only translate + enforce.
 */
export interface RIOAdapter<TEvent = unknown, TContext = unknown> {
  /** Adapter name for logging/identification */
  name: string;

  /** Convert a native event into an ActionEnvelope */
  toActionEnvelope(event: TEvent): ActionEnvelope;

  /** Convert a GatewayDecision back into a surface-native response */
  fromDecision(decision: GatewayDecision, context: TContext): unknown;
}

// ═══════════════════════════════════════════════════════════════
// BACKWARD-COMPATIBLE HELPERS
// ═══════════════════════════════════════════════════════════════

/**
 * Extract ActionIntent from an ActionEnvelope.
 */
export function envelopeToActionIntent(
  envelope: ActionEnvelope,
  riskTier: string,
): ActionIntent {
  return {
    type: envelope.intent.type,
    target: envelope.resource.id,
    parameters: envelope.payload.metadata,
    consequential: riskTier === "HIGH" || riskTier === "MEDIUM",
  };
}

/**
 * Build ActionIntent from raw intent data (backward compatibility).
 */
export function buildActionIntent(
  toolName: string,
  toolArgs: Record<string, unknown>,
  riskTier: string,
): ActionIntent {
  const target =
    (toolArgs.to as string) ||
    (toolArgs.recipient as string) ||
    (toolArgs.query as string) ||
    (toolArgs.path as string) ||
    (toolArgs.target as string) ||
    "unknown";

  return {
    type: toolName,
    target,
    parameters: toolArgs,
    consequential: riskTier === "HIGH" || riskTier === "MEDIUM",
  };
}
