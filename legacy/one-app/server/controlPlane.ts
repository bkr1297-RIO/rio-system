/**
 * RIO Control Plane — Closed Loop Runtime
 * ═══════════════════════════════════════════════════════════════
 * Implements Andrew's close_the_loop_control_plane spec:
 *   A1: Canonical Intent Envelope
 *   A2: Verification Layer (separate from governance)
 *   A3: Governance Decision Object
 *   A4: Human Authorization Boundary
 *   A5: Execution Token + Final Preflight Gate
 *   A6: Receipt / Witness Artifact
 *   A7: Ledger Entry (formalized)
 *   A8: Learning Loop Analysis
 *
 * Design Principles:
 *   - Fail closed
 *   - Silence equals refusal
 *   - No implicit authority
 *   - No component may both approve and execute the same action
 *   - Learning is advisory until explicitly promoted
 */

import { createHash, randomUUID } from "crypto";
import { nanoid } from "nanoid";

// ═══════════════════════════════════════════════════════════════
// A1: CANONICAL INTENT ENVELOPE
// ═══════════════════════════════════════════════════════════════

export interface IntentEnvelope {
  intent_id: string;
  request_id: string;
  source_type: "HUMAN" | "AI_AGENT" | "SYSTEM" | "API";
  source_id: string;
  actor_id: string;
  timestamp: number;
  nonce: string;
  action_type: string;
  target: string;
  parameters: Record<string, unknown>;
  context: Record<string, unknown>;
  correlation_id: string | null;
  policy_version_target: string;
  signature: string | null;
  metadata: Record<string, unknown>;
}

/**
 * Canonical JSON serialization — sorts keys recursively for deterministic hashing.
 */
export function canonicalJsonStringify(obj: unknown): string {
  if (obj === null || obj === undefined) return JSON.stringify(obj);
  if (typeof obj !== "object") return JSON.stringify(obj);
  if (Array.isArray(obj)) {
    return "[" + obj.map(item => canonicalJsonStringify(item)).join(",") + "]";
  }
  const sorted = Object.keys(obj as Record<string, unknown>).sort();
  const pairs = sorted.map(key =>
    JSON.stringify(key) + ":" + canonicalJsonStringify((obj as Record<string, unknown>)[key])
  );
  return "{" + pairs.join(",") + "}";
}

export function computeHash(data: string): string {
  return createHash("sha256").update(data).digest("hex");
}

export function hashEnvelope(envelope: IntentEnvelope): string {
  return computeHash(canonicalJsonStringify(envelope));
}

/**
 * Create a canonical intent envelope from raw intent data.
 */
export function createIntentEnvelope(params: {
  intentId: string;
  userId: number;
  sourceType: IntentEnvelope["source_type"];
  toolName: string;
  toolArgs: Record<string, unknown>;
  context?: Record<string, unknown>;
  correlationId?: string;
  policyVersion?: string;
  signature?: string;
}): IntentEnvelope {
  return {
    intent_id: params.intentId,
    request_id: `REQ-${nanoid(16)}`,
    source_type: params.sourceType,
    source_id: params.sourceType === "HUMAN" ? `user:${params.userId}` : `agent:${params.userId}`,
    actor_id: String(params.userId),
    timestamp: Date.now(),
    nonce: randomUUID(),
    action_type: params.toolName,
    target: params.toolName,
    parameters: params.toolArgs,
    context: params.context ?? {},
    correlation_id: params.correlationId ?? null,
    policy_version_target: params.policyVersion ?? "POLICY-v0.3",
    signature: params.signature ?? null,
    metadata: {},
  };
}

// ═══════════════════════════════════════════════════════════════
// A2: VERIFICATION LAYER (separate from governance)
// ═══════════════════════════════════════════════════════════════

export interface VerificationResult {
  verification_id: string;
  intent_hash: string;
  schema_valid: boolean;
  auth_valid: boolean;
  signature_valid: boolean;
  ttl_valid: boolean;
  nonce_valid: boolean;
  replay_check: boolean;
  verified: boolean;
  failure_reasons: string[];
  timestamp: number;
}

// In-memory nonce store for replay protection
const usedNonces = new Set<string>();
const NONCE_TTL_MS = 10 * 60 * 1000; // 10 minutes
const nonceTimestamps = new Map<string, number>();

function cleanExpiredNonces() {
  const now = Date.now();
  for (const [nonce, ts] of Array.from(nonceTimestamps.entries())) {
    if (now - ts > NONCE_TTL_MS) {
      usedNonces.delete(nonce);
      nonceTimestamps.delete(nonce);
    }
  }
}

// Required fields for schema validation
const REQUIRED_ENVELOPE_FIELDS: (keyof IntentEnvelope)[] = [
  "intent_id", "request_id", "source_type", "source_id", "actor_id",
  "timestamp", "nonce", "action_type", "target", "parameters",
];

const INTENT_TTL_MS = 5 * 60 * 1000; // 5 minutes — intents older than this fail TTL check

/**
 * Verify an intent envelope BEFORE governance evaluation.
 * Rejects malformed, expired, replayed, or unauthorized requests.
 */
export function verifyIntentEnvelope(
  envelope: IntentEnvelope,
  options?: {
    requireSignature?: boolean;
    knownActorIds?: string[];
  },
): VerificationResult {
  const verification_id = `VER-${nanoid(16)}`;
  const intent_hash = hashEnvelope(envelope);
  const failures: string[] = [];

  // 1. Schema validation — required fields present and non-empty
  let schema_valid = true;
  for (const field of REQUIRED_ENVELOPE_FIELDS) {
    const val = envelope[field];
    if (val === undefined || val === null || val === "") {
      schema_valid = false;
      failures.push(`Missing or empty required field: ${field}`);
    }
  }
  if (typeof envelope.parameters !== "object" || envelope.parameters === null) {
    schema_valid = false;
    failures.push("parameters must be a non-null object");
  }
  if (!["HUMAN", "AI_AGENT", "SYSTEM", "API"].includes(envelope.source_type)) {
    schema_valid = false;
    failures.push(`Invalid source_type: ${envelope.source_type}`);
  }

  // 2. Auth validation — actor_id is known
  let auth_valid = true;
  if (options?.knownActorIds && !options.knownActorIds.includes(envelope.actor_id)) {
    auth_valid = false;
    failures.push(`Unknown actor_id: ${envelope.actor_id}`);
  }

  // 3. Signature validation
  let signature_valid = true;
  if (options?.requireSignature && (!envelope.signature || envelope.signature.length < 10)) {
    signature_valid = false;
    failures.push("Signature required but missing or too short");
  }

  // 4. TTL validation — timestamp freshness
  const now = Date.now();
  const age = now - envelope.timestamp;
  const ttl_valid = age >= 0 && age <= INTENT_TTL_MS;
  if (!ttl_valid) {
    failures.push(`Intent expired: age=${age}ms, TTL=${INTENT_TTL_MS}ms`);
  }

  // 5. Nonce validation — non-empty
  const nonce_valid = typeof envelope.nonce === "string" && envelope.nonce.length > 0;
  if (!nonce_valid) {
    failures.push("Nonce is missing or empty");
  }

  // 6. Replay check — nonce not already used
  cleanExpiredNonces();
  let replay_check = true;
  if (usedNonces.has(envelope.nonce)) {
    replay_check = false;
    failures.push(`Replay detected: nonce ${envelope.nonce} already used`);
  } else if (nonce_valid) {
    usedNonces.add(envelope.nonce);
    nonceTimestamps.set(envelope.nonce, now);
  }

  const verified = schema_valid && auth_valid && signature_valid && ttl_valid && nonce_valid && replay_check;

  return {
    verification_id,
    intent_hash,
    schema_valid,
    auth_valid,
    signature_valid,
    ttl_valid,
    nonce_valid,
    replay_check,
    verified,
    failure_reasons: failures,
    timestamp: now,
  };
}

// ═══════════════════════════════════════════════════════════════
// A3: GOVERNANCE DECISION OBJECT
// ═══════════════════════════════════════════════════════════════

export interface GovernanceDecision {
  decision_id: string;
  intent_hash: string;
  verification_id: string;
  policy_version: string;
  risk_score: number;
  risk_level: "LOW" | "MEDIUM" | "HIGH";
  decision: "APPROVE" | "DENY" | "REQUIRE_HUMAN_APPROVAL";
  required_approvals: number;
  reasons: string[];
  blocking_conditions: string[];
  timestamp: number;
}

/**
 * Evaluate governance policy against a verified intent envelope.
 * This ONLY runs after verification passes.
 */
export function evaluateGovernance(
  envelope: IntentEnvelope,
  verification: VerificationResult,
  toolMeta: { riskTier: string; blastRadiusBase: number },
): GovernanceDecision {
  if (!verification.verified) {
    throw new Error("GOVERNANCE_ERROR: Cannot evaluate governance on unverified intent");
  }

  const decision_id = `GOV-${nanoid(16)}`;
  const risk_level = toolMeta.riskTier as "LOW" | "MEDIUM" | "HIGH";
  const argCount = Object.keys(envelope.parameters).length;
  const risk_score = Math.min(10, toolMeta.blastRadiusBase + Math.floor(argCount / 2));

  const reasons: string[] = [];
  const blocking_conditions: string[] = [];
  let decision: GovernanceDecision["decision"];
  let required_approvals = 0;

  if (risk_level === "LOW") {
    decision = "APPROVE";
    reasons.push("LOW risk — auto-approved by policy");
  } else if (risk_level === "MEDIUM") {
    decision = "REQUIRE_HUMAN_APPROVAL";
    required_approvals = 1;
    reasons.push("MEDIUM risk — requires human approval");
  } else {
    // HIGH
    decision = "REQUIRE_HUMAN_APPROVAL";
    required_approvals = 1;
    reasons.push("HIGH risk — requires explicit human authorization");
    if (risk_score >= 8) {
      blocking_conditions.push("High blast radius — review carefully");
    }
  }

  return {
    decision_id,
    intent_hash: verification.intent_hash,
    verification_id: verification.verification_id,
    policy_version: envelope.policy_version_target,
    risk_score,
    risk_level,
    decision,
    required_approvals,
    reasons,
    blocking_conditions,
    timestamp: Date.now(),
  };
}

// ═══════════════════════════════════════════════════════════════
// A4: HUMAN AUTHORIZATION BOUNDARY
// ═══════════════════════════════════════════════════════════════

export interface ApprovalRecord {
  approval_id: string;
  decision_id: string;
  intent_hash: string;
  approver_id: string;
  approval_status: "APPROVED" | "REJECTED";
  auth_method: "SIGNATURE" | "SESSION" | "TOKEN";
  approval_artifact: string;  // The signature or token
  timestamp: number;
  notes: string | null;
}

/**
 * Validate that an approval record satisfies the governance decision.
 * Silence equals refusal — no implied approval.
 */
export function validateApproval(
  approval: ApprovalRecord,
  governance: GovernanceDecision,
): { valid: boolean; reasons: string[] } {
  const reasons: string[] = [];

  if (approval.intent_hash !== governance.intent_hash) {
    reasons.push("Approval intent_hash does not match governance intent_hash");
  }
  if (approval.decision_id !== governance.decision_id) {
    reasons.push("Approval decision_id does not match governance decision_id");
  }
  if (approval.approval_status !== "APPROVED") {
    reasons.push(`Approval status is ${approval.approval_status}, not APPROVED`);
  }
  if (!approval.approval_artifact || approval.approval_artifact.length < 10) {
    reasons.push("Approval artifact (signature/token) is missing or too short");
  }

  return { valid: reasons.length === 0, reasons };
}

// ═══════════════════════════════════════════════════════════════
// A5: EXECUTION TOKEN + FINAL PREFLIGHT GATE
// ═══════════════════════════════════════════════════════════════

export interface ExecutionToken {
  token_id: string;
  intent_hash: string;
  action_hash: string;
  policy_version: string;
  ttl: number;          // milliseconds
  issued_at: number;
  expires_at: number;
  nonce: string;
  target: string;
  used: boolean;
}

// In-memory token store
const executionTokens = new Map<string, ExecutionToken>();

/**
 * Issue a single-use execution token after successful approval or auto-approval.
 * Bound to intent hash, action hash, policy version, TTL, nonce, and target.
 */
export function issueExecutionToken(
  envelope: IntentEnvelope,
  governance: GovernanceDecision,
  ttlMs: number = 5 * 60 * 1000, // 5 minutes default
): ExecutionToken {
  const token_id = `ETOK-${nanoid(16)}`;
  const action_hash = computeHash(canonicalJsonStringify({
    action_type: envelope.action_type,
    target: envelope.target,
    parameters: envelope.parameters,
  }));
  const now = Date.now();

  const token: ExecutionToken = {
    token_id,
    intent_hash: governance.intent_hash,
    action_hash,
    policy_version: governance.policy_version,
    ttl: ttlMs,
    issued_at: now,
    expires_at: now + ttlMs,
    nonce: randomUUID(),
    target: envelope.target,
    used: false,
  };

  executionTokens.set(token_id, token);
  return token;
}

/**
 * Final preflight gate — verify execution token before connector call.
 * Returns pass/fail with detailed check results.
 */
export function executeGatePreflight(
  token: ExecutionToken,
  envelope: IntentEnvelope,
  governance: GovernanceDecision,
): { passed: boolean; checks: Array<{ check: string; status: "PASS" | "FAIL"; detail: string }> } {
  const checks: Array<{ check: string; status: "PASS" | "FAIL"; detail: string }> = [];
  const now = Date.now();

  // 1. Token exists and not used
  const storedToken = executionTokens.get(token.token_id);
  const tokenExists = !!storedToken && !storedToken.used;
  checks.push({
    check: "token_valid",
    status: tokenExists ? "PASS" : "FAIL",
    detail: tokenExists ? `Token ${token.token_id} valid and unused` : "Token invalid, missing, or already used",
  });

  // 2. Token not expired
  const notExpired = now < token.expires_at;
  checks.push({
    check: "token_not_expired",
    status: notExpired ? "PASS" : "FAIL",
    detail: notExpired ? `Token expires at ${new Date(token.expires_at).toISOString()}` : "Token expired",
  });

  // 3. Intent hash matches
  const intentMatch = token.intent_hash === governance.intent_hash;
  checks.push({
    check: "intent_hash_match",
    status: intentMatch ? "PASS" : "FAIL",
    detail: intentMatch ? "Intent hash verified" : "Intent hash mismatch — possible tampering",
  });

  // 4. Action hash matches current parameters
  const currentActionHash = computeHash(canonicalJsonStringify({
    action_type: envelope.action_type,
    target: envelope.target,
    parameters: envelope.parameters,
  }));
  const actionMatch = token.action_hash === currentActionHash;
  checks.push({
    check: "action_hash_match",
    status: actionMatch ? "PASS" : "FAIL",
    detail: actionMatch ? "Action hash verified" : "Action hash mismatch — parameters changed after approval",
  });

  // 5. Policy version matches
  const policyMatch = token.policy_version === governance.policy_version;
  checks.push({
    check: "policy_version_match",
    status: policyMatch ? "PASS" : "FAIL",
    detail: policyMatch ? `Policy version: ${token.policy_version}` : "Policy version changed since approval",
  });

  // 6. Target matches
  const targetMatch = token.target === envelope.target;
  checks.push({
    check: "target_match",
    status: targetMatch ? "PASS" : "FAIL",
    detail: targetMatch ? `Target: ${token.target}` : "Target mismatch",
  });

  const passed = checks.every(c => c.status === "PASS");

  // Mark token as used if gate passes (single-use)
  if (passed && storedToken) {
    storedToken.used = true;
  }

  return { passed, checks };
}

// ═══════════════════════════════════════════════════════════════
// A6: RECEIPT / WITNESS ARTIFACT
// ═══════════════════════════════════════════════════════════════

export interface WitnessReceipt {
  receipt_id: string;
  intent_hash: string;
  verification_hash: string;
  decision_hash: string;
  approval_hash: string | null;
  execution_hash: string;
  receipt_hash: string;
  verification_status: "VERIFIED" | "FAILED";
  outcome_status: "SUCCESS" | "FAILURE" | "PARTIAL";
  chain_of_custody: {
    envelope: IntentEnvelope;
    verification: VerificationResult;
    governance: GovernanceDecision;
    approval: ApprovalRecord | null;
    execution_token: ExecutionToken;
    connector_result: {
      success: boolean;
      output: unknown;
      metadata?: Record<string, unknown>;
      executedAt: number;
    };
  };
  timestamp: number;
  signature: string | null;
}

/**
 * Generate a receipt/witness artifact linking all chain-of-custody artifacts.
 */
export function generateWitnessReceipt(params: {
  envelope: IntentEnvelope;
  verification: VerificationResult;
  governance: GovernanceDecision;
  approval: ApprovalRecord | null;
  executionToken: ExecutionToken;
  connectorResult: { success: boolean; output: unknown; metadata?: Record<string, unknown>; executedAt: number };
}): WitnessReceipt {
  const receipt_id = `REC-${nanoid(16)}`;

  const verification_hash = computeHash(canonicalJsonStringify(params.verification));
  const decision_hash = computeHash(canonicalJsonStringify(params.governance));
  const approval_hash = params.approval
    ? computeHash(canonicalJsonStringify(params.approval))
    : null;
  const execution_hash = computeHash(canonicalJsonStringify({
    token_id: params.executionToken.token_id,
    result: params.connectorResult,
  }));

  // The receipt hash covers the entire chain
  const receipt_hash = computeHash(canonicalJsonStringify({
    receipt_id,
    intent_hash: params.verification.intent_hash,
    verification_hash,
    decision_hash,
    approval_hash,
    execution_hash,
  }));

  return {
    receipt_id,
    intent_hash: params.verification.intent_hash,
    verification_hash,
    decision_hash,
    approval_hash,
    execution_hash,
    receipt_hash,
    verification_status: params.verification.verified ? "VERIFIED" : "FAILED",
    outcome_status: params.connectorResult.success ? "SUCCESS" : "FAILURE",
    chain_of_custody: {
      envelope: params.envelope,
      verification: params.verification,
      governance: params.governance,
      approval: params.approval,
      execution_token: params.executionToken,
      connector_result: params.connectorResult,
    },
    timestamp: Date.now(),
    signature: null, // Signed receipts when Ed25519 is available
  };
}

// ═══════════════════════════════════════════════════════════════
// A7: FORMALIZED LEDGER ENTRY
// ═══════════════════════════════════════════════════════════════

export interface FormalLedgerEntry {
  block_index: number;
  receipt_hash: string;
  previous_ledger_hash: string;
  current_hash: string;
  timestamp: number;
  entry_type: string;
  payload: Record<string, unknown>;
}

/**
 * Build a formalized ledger entry from a witness receipt.
 * The actual append to the database is handled by the existing appendLedger function.
 */
export function buildFormalLedgerEntry(
  receipt: WitnessReceipt,
  blockIndex: number,
  previousLedgerHash: string,
): FormalLedgerEntry {
  const payload = {
    receipt_id: receipt.receipt_id,
    intent_hash: receipt.intent_hash,
    verification_hash: receipt.verification_hash,
    decision_hash: receipt.decision_hash,
    approval_hash: receipt.approval_hash,
    execution_hash: receipt.execution_hash,
    outcome_status: receipt.outcome_status,
  };

  const current_hash = computeHash(canonicalJsonStringify({
    block_index: blockIndex,
    receipt_hash: receipt.receipt_hash,
    previous_ledger_hash: previousLedgerHash,
    timestamp: receipt.timestamp,
    payload,
  }));

  return {
    block_index: blockIndex,
    receipt_hash: receipt.receipt_hash,
    previous_ledger_hash: previousLedgerHash,
    current_hash,
    timestamp: receipt.timestamp,
    entry_type: "EXECUTION",
    payload,
  };
}

// ═══════════════════════════════════════════════════════════════
// A8: LEARNING LOOP ANALYSIS
// ═══════════════════════════════════════════════════════════════

export interface LearningAnalysis {
  analysis_id: string;
  period_start: number;
  period_end: number;
  total_intents: number;
  total_executions: number;
  total_approvals: number;
  total_rejections: number;
  metrics: {
    false_positives: number;       // LOW risk that should have been flagged
    false_negatives: number;       // HIGH risk that was auto-approved (should be 0)
    approval_bottlenecks: number;  // Intents stuck in PENDING > 5 min
    execution_failures: number;    // Connector failures
    policy_misses: number;         // Actions that passed policy but failed
    repeated_overrides: number;    // Same tool+args approved multiple times
  };
  recommendations: PolicyRecommendation[];
  replay_inputs: ReplayInput[];
  mutates_live_policy: false;      // Always false — learning is advisory only
  timestamp: number;
}

export interface PolicyRecommendation {
  recommendation_id: string;
  type: "RISK_ADJUSTMENT" | "THRESHOLD_CHANGE" | "NEW_RULE" | "REMOVE_RULE" | "DRIFT_ALERT";
  tool_name: string | null;
  current_value: string;
  suggested_value: string;
  confidence: number;  // 0-1
  evidence: string;
  status: "PENDING_REVIEW";  // Never auto-applied
}

export interface ReplayInput {
  intent_id: string;
  action_type: string;
  original_decision: string;
  original_outcome: string;
  suggested_replay_decision: string;
  reason: string;
}

/**
 * Run learning loop analysis over ledger entries and receipts.
 * Produces recommendations — NEVER auto-changes live policy.
 */
export function runLearningLoopAnalysis(
  ledgerEntries: Array<{
    entryType: string;
    payload: Record<string, unknown>;
    timestamp: number | string;
  }>,
  learningEvents: Array<{
    eventType: string;
    outcome: string;
    context?: Record<string, unknown>;
    createdAt?: Date;
  }>,
): LearningAnalysis {
  const analysis_id = `LEARN-${nanoid(16)}`;
  const now = Date.now();

  // Compute period
  const timestamps = ledgerEntries.map(e => Number(e.timestamp)).filter(t => !isNaN(t));
  const period_start = timestamps.length > 0 ? Math.min(...timestamps) : now;
  const period_end = timestamps.length > 0 ? Math.max(...timestamps) : now;

  // Count by type
  const intentEntries = ledgerEntries.filter(e => e.entryType === "INTENT");
  const executionEntries = ledgerEntries.filter(e => e.entryType === "EXECUTION");
  const approvalEntries = ledgerEntries.filter(e => e.entryType === "APPROVAL");

  const total_intents = intentEntries.length;
  const total_executions = executionEntries.length;

  // Count approvals vs rejections from learning events
  const approvalEvents = learningEvents.filter(e => e.eventType === "APPROVAL");
  const rejectionEvents = learningEvents.filter(e => e.eventType === "REJECTION");
  const total_approvals = approvalEvents.length;
  const total_rejections = rejectionEvents.length;

  // Metrics
  // False negatives: HIGH risk that was auto-approved (should be 0 by design)
  const false_negatives = 0; // By design, HIGH risk always requires approval

  // False positives: LOW risk actions that failed (might indicate they should be higher risk)
  const executionFailures = learningEvents.filter(
    e => e.eventType === "EXECUTION" && e.outcome === "NEGATIVE"
  );
  const false_positives = executionFailures.filter(
    e => (e.context as Record<string, unknown>)?.riskTier === "LOW"
  ).length;

  // Approval bottlenecks: intents that were PENDING for a long time
  // (approximate from ledger timestamps)
  let approval_bottlenecks = 0;
  for (const intent of intentEntries) {
    const intentId = (intent.payload as Record<string, unknown>)?.intentId;
    if (!intentId) continue;
    const matchingApproval = approvalEntries.find(
      a => (a.payload as Record<string, unknown>)?.intentId === intentId
    );
    if (matchingApproval) {
      const delay = Number(matchingApproval.timestamp) - Number(intent.timestamp);
      if (delay > 5 * 60 * 1000) approval_bottlenecks++;
    }
  }

  // Execution failures
  const execution_failures = executionEntries.filter(
    e => (e.payload as Record<string, unknown>)?.failClosed === true ||
         (e.payload as Record<string, unknown>)?.error
  ).length;

  // Policy misses: actions that passed governance but connector failed
  const policy_misses = executionFailures.length;

  // Repeated overrides: same tool approved multiple times
  const toolApprovalCounts = new Map<string, number>();
  for (const a of approvalEntries) {
    const tool = (a.payload as Record<string, unknown>)?.boundToolName as string;
    if (tool) toolApprovalCounts.set(tool, (toolApprovalCounts.get(tool) || 0) + 1);
  }
  const repeated_overrides = Array.from(toolApprovalCounts.values()).filter(c => c > 2).length;

  // Generate recommendations
  const recommendations: PolicyRecommendation[] = [];

  if (false_positives > 0) {
    recommendations.push({
      recommendation_id: `PREC-${nanoid(8)}`,
      type: "RISK_ADJUSTMENT",
      tool_name: null,
      current_value: "LOW",
      suggested_value: "MEDIUM",
      confidence: Math.min(1, false_positives / Math.max(1, total_intents)),
      evidence: `${false_positives} LOW-risk actions failed during execution`,
      status: "PENDING_REVIEW",
    });
  }

  if (approval_bottlenecks > 0) {
    recommendations.push({
      recommendation_id: `PREC-${nanoid(8)}`,
      type: "THRESHOLD_CHANGE",
      tool_name: null,
      current_value: "5min approval window",
      suggested_value: "Consider longer TTL or notification escalation",
      confidence: 0.6,
      evidence: `${approval_bottlenecks} intents waited >5min for approval`,
      status: "PENDING_REVIEW",
    });
  }

  if (execution_failures > 2) {
    recommendations.push({
      recommendation_id: `PREC-${nanoid(8)}`,
      type: "DRIFT_ALERT",
      tool_name: null,
      current_value: "Current connector configuration",
      suggested_value: "Review connector health and external service availability",
      confidence: 0.8,
      evidence: `${execution_failures} execution failures detected in period`,
      status: "PENDING_REVIEW",
    });
  }

  // Replay inputs: suggest replaying failed executions
  const replay_inputs: ReplayInput[] = executionFailures.slice(0, 5).map(e => ({
    intent_id: ((e.context as Record<string, unknown>)?.intentId as string) || "unknown",
    action_type: ((e.context as Record<string, unknown>)?.toolName as string) || "unknown",
    original_decision: "APPROVED",
    original_outcome: "NEGATIVE",
    suggested_replay_decision: "REVIEW",
    reason: "Execution failed — replay to verify if issue is transient or systemic",
  }));

  return {
    analysis_id,
    period_start,
    period_end,
    total_intents,
    total_executions,
    total_approvals,
    total_rejections,
    metrics: {
      false_positives,
      false_negatives,
      approval_bottlenecks,
      execution_failures,
      policy_misses,
      repeated_overrides,
    },
    recommendations,
    replay_inputs,
    mutates_live_policy: false,
    timestamp: now,
  };
}

// ═══════════════════════════════════════════════════════════════
// FULL CLOSED-LOOP ORCHESTRATOR
// ═══════════════════════════════════════════════════════════════

/**
 * Execute the full closed loop for a single intent:
 *   1. Package intent envelope
 *   2. Verify envelope
 *   3. Evaluate governance
 *   4. Check human authorization (if required)
 *   5. Issue execution token
 *   6. Run execution gate preflight
 *   7. Execute action through connector
 *   8. Generate witness receipt
 *   9. Build formal ledger entry
 *
 * Returns the complete chain-of-custody or fails closed at any step.
 */
export interface ClosedLoopResult {
  success: boolean;
  stage_reached: string;
  error?: string;
  envelope?: IntentEnvelope;
  verification?: VerificationResult;
  governance?: GovernanceDecision;
  approval?: ApprovalRecord | null;
  execution_token?: ExecutionToken;
  gate_checks?: Array<{ check: string; status: "PASS" | "FAIL"; detail: string }>;
  receipt?: WitnessReceipt;
  ledger_entry?: FormalLedgerEntry;
}

export async function executeClosedLoop(params: {
  envelope: IntentEnvelope;
  toolMeta: { riskTier: string; blastRadiusBase: number };
  approval: ApprovalRecord | null;
  connector: (toolArgs: Record<string, unknown>) => Promise<{ success: boolean; output: unknown; metadata?: Record<string, unknown>; executedAt: number }>;
  previousLedgerHash: string;
  blockIndex: number;
  verificationOptions?: { requireSignature?: boolean; knownActorIds?: string[] };
}): Promise<ClosedLoopResult> {
  // Step 1: Verify
  const verification = verifyIntentEnvelope(params.envelope, params.verificationOptions);
  if (!verification.verified) {
    return {
      success: false,
      stage_reached: "VERIFICATION",
      error: `Verification failed: ${verification.failure_reasons.join("; ")}`,
      envelope: params.envelope,
      verification,
    };
  }

  // Step 2: Governance
  const governance = evaluateGovernance(params.envelope, verification, params.toolMeta);

  // Step 3: Check human authorization if required
  if (governance.decision === "REQUIRE_HUMAN_APPROVAL") {
    if (!params.approval) {
      return {
        success: false,
        stage_reached: "HUMAN_AUTHORIZATION",
        error: "Human approval required but not provided. Silence equals refusal.",
        envelope: params.envelope,
        verification,
        governance,
      };
    }
    const approvalValidation = validateApproval(params.approval, governance);
    if (!approvalValidation.valid) {
      return {
        success: false,
        stage_reached: "HUMAN_AUTHORIZATION",
        error: `Approval validation failed: ${approvalValidation.reasons.join("; ")}`,
        envelope: params.envelope,
        verification,
        governance,
        approval: params.approval,
      };
    }
  }

  // Step 4: Issue execution token
  const executionToken = issueExecutionToken(params.envelope, governance);

  // Step 5: Final preflight gate
  const gate = executeGatePreflight(executionToken, params.envelope, governance);
  if (!gate.passed) {
    return {
      success: false,
      stage_reached: "EXECUTION_GATE",
      error: `Execution gate failed: ${gate.checks.filter(c => c.status === "FAIL").map(c => c.check).join(", ")}`,
      envelope: params.envelope,
      verification,
      governance,
      approval: params.approval,
      execution_token: executionToken,
      gate_checks: gate.checks,
    };
  }

  // Step 6: Execute action through connector
  let connectorResult: { success: boolean; output: unknown; metadata?: Record<string, unknown>; executedAt: number };
  try {
    connectorResult = await params.connector(params.envelope.parameters);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    connectorResult = { success: false, output: null, metadata: { error: msg }, executedAt: Date.now() };
  }

  // Step 7: Generate witness receipt
  const receipt = generateWitnessReceipt({
    envelope: params.envelope,
    verification,
    governance,
    approval: params.approval,
    executionToken,
    connectorResult,
  });

  // Step 8: Build formal ledger entry
  const ledgerEntry = buildFormalLedgerEntry(receipt, params.blockIndex, params.previousLedgerHash);

  return {
    success: connectorResult.success,
    stage_reached: "COMPLETE",
    envelope: params.envelope,
    verification,
    governance,
    approval: params.approval,
    execution_token: executionToken,
    gate_checks: gate.checks,
    receipt,
    ledger_entry: ledgerEntry,
  };
}

/**
 * Replay a historical decision — read-only analysis, no execution.
 */
export function replayHistoricalDecision(
  envelope: IntentEnvelope,
  toolMeta: { riskTier: string; blastRadiusBase: number },
): { verification: VerificationResult; governance: GovernanceDecision } {
  // Create a fresh envelope with current timestamp for replay
  const replayEnvelope = { ...envelope, timestamp: Date.now(), nonce: randomUUID() };
  const verification = verifyIntentEnvelope(replayEnvelope);
  if (!verification.verified) {
    return { verification, governance: null as unknown as GovernanceDecision };
  }
  const governance = evaluateGovernance(replayEnvelope, verification, toolMeta);
  return { verification, governance };
}

// ═══════════════════════════════════════════════════════════════
// EXPORTS FOR TESTING
// ═══════════════════════════════════════════════════════════════

/** Clear nonce store — for testing only */
export function _clearNonces() {
  usedNonces.clear();
  nonceTimestamps.clear();
}

/** Clear execution tokens — for testing only */
export function _clearTokens() {
  executionTokens.clear();
}
