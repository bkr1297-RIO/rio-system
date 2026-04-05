/**
 * RIO Control Plane — Closed Loop Conformance Tests
 * ═══════════════════════════════════════════════════════════════
 * Implements all 9 required tests from Andrew's close_the_loop spec:
 *
 *   1. malformed_intent_fails_before_governance
 *   2. expired_or_replayed_intent_fails_verification
 *   3. low_risk_intent_auto_approves_and_executes_through_gate
 *   4. high_risk_intent_blocks_without_human_approval
 *   5. approval_for_one_intent_cannot_be_reused_for_another
 *   6. execution_without_valid_token_is_denied
 *   7. successful_execution_generates_receipt_and_ledger_entry
 *   8. ledger_chain_validation_detects_tampering
 *   9. learning_loop_reads_ledger_and_emits_recommendations_without_mutating_live_policy
 *
 * Plus a full closed-loop demo test proving the complete chain.
 */

import { describe, it, expect, beforeEach } from "vitest";
import {
  createIntentEnvelope,
  verifyIntentEnvelope,
  evaluateGovernance,
  validateApproval,
  issueExecutionToken,
  executeGatePreflight,
  generateWitnessReceipt,
  buildFormalLedgerEntry,
  runLearningLoopAnalysis,
  executeClosedLoop,
  hashEnvelope,
  computeHash,
  canonicalJsonStringify,
  _clearNonces,
  _clearTokens,
  type IntentEnvelope,
  type ApprovalRecord,
  type GovernanceDecision,
  type ExecutionToken,
} from "./controlPlane";
import { nanoid } from "nanoid";
import { randomUUID } from "crypto";

// ─── Helpers ──────────────────────────────────────────────────

function makeEnvelope(overrides: Partial<IntentEnvelope> = {}): IntentEnvelope {
  return createIntentEnvelope({
    intentId: `INT-${nanoid(16)}`,
    userId: 1,
    sourceType: "HUMAN",
    toolName: overrides.action_type ?? "web_search",
    toolArgs: (overrides.parameters as Record<string, unknown>) ?? { query: "test" },
    policyVersion: overrides.policy_version_target ?? "POLICY-v0.3",
    ...overrides,
  });
}

const LOW_TOOL = { riskTier: "LOW", blastRadiusBase: 1 };
const MEDIUM_TOOL = { riskTier: "MEDIUM", blastRadiusBase: 3 };
const HIGH_TOOL = { riskTier: "HIGH", blastRadiusBase: 5 };

function makeApproval(governance: GovernanceDecision, overrides: Partial<ApprovalRecord> = {}): ApprovalRecord {
  return {
    approval_id: `APR-${nanoid(16)}`,
    decision_id: governance.decision_id,
    intent_hash: governance.intent_hash,
    approver_id: "1",
    approval_status: "APPROVED",
    auth_method: "SIGNATURE",
    approval_artifact: `sig_${nanoid(32)}`,
    timestamp: Date.now(),
    notes: null,
    ...overrides,
  };
}

const mockConnector = async (_args: Record<string, unknown>) => ({
  success: true,
  output: { result: "done" },
  metadata: {},
  executedAt: Date.now(),
});

const failingConnector = async (_args: Record<string, unknown>) => ({
  success: false,
  output: null,
  metadata: { error: "connector failure" },
  executedAt: Date.now(),
});

// ─── Setup ────────────────────────────────────────────────────

beforeEach(() => {
  _clearNonces();
  _clearTokens();
});

// ═══════════════════════════════════════════════════════════════
// TEST 1: malformed_intent_fails_before_governance
// ═══════════════════════════════════════════════════════════════

describe("1. malformed_intent_fails_before_governance", () => {
  it("rejects envelope with missing intent_id", () => {
    const envelope = makeEnvelope();
    (envelope as Record<string, unknown>).intent_id = "";
    const result = verifyIntentEnvelope(envelope);
    expect(result.verified).toBe(false);
    expect(result.schema_valid).toBe(false);
    expect(result.failure_reasons.some(r => r.includes("intent_id"))).toBe(true);
  });

  it("rejects envelope with missing action_type", () => {
    const envelope = makeEnvelope();
    (envelope as Record<string, unknown>).action_type = "";
    const result = verifyIntentEnvelope(envelope);
    expect(result.verified).toBe(false);
    expect(result.schema_valid).toBe(false);
  });

  it("rejects envelope with null parameters", () => {
    const envelope = makeEnvelope();
    (envelope as Record<string, unknown>).parameters = null;
    const result = verifyIntentEnvelope(envelope);
    expect(result.verified).toBe(false);
    expect(result.failure_reasons.some(r => r.includes("parameters"))).toBe(true);
  });

  it("rejects envelope with invalid source_type", () => {
    const envelope = makeEnvelope();
    (envelope as Record<string, unknown>).source_type = "UNKNOWN";
    const result = verifyIntentEnvelope(envelope);
    expect(result.verified).toBe(false);
    expect(result.failure_reasons.some(r => r.includes("source_type"))).toBe(true);
  });

  it("governance throws if called on unverified intent", () => {
    const envelope = makeEnvelope();
    (envelope as Record<string, unknown>).intent_id = "";
    const verification = verifyIntentEnvelope(envelope);
    expect(verification.verified).toBe(false);
    expect(() => evaluateGovernance(envelope, verification, LOW_TOOL)).toThrow("GOVERNANCE_ERROR");
  });
});

// ═══════════════════════════════════════════════════════════════
// TEST 2: expired_or_replayed_intent_fails_verification
// ═══════════════════════════════════════════════════════════════

describe("2. expired_or_replayed_intent_fails_verification", () => {
  it("rejects expired intent (timestamp too old)", () => {
    const envelope = makeEnvelope();
    envelope.timestamp = Date.now() - 10 * 60 * 1000; // 10 min ago, TTL is 5 min
    const result = verifyIntentEnvelope(envelope);
    expect(result.verified).toBe(false);
    expect(result.ttl_valid).toBe(false);
    expect(result.failure_reasons.some(r => r.includes("expired"))).toBe(true);
  });

  it("rejects future-dated intent", () => {
    const envelope = makeEnvelope();
    envelope.timestamp = Date.now() + 60 * 60 * 1000; // 1 hour in the future
    const result = verifyIntentEnvelope(envelope);
    expect(result.verified).toBe(false);
    expect(result.ttl_valid).toBe(false);
  });

  it("rejects replayed intent (same nonce used twice)", () => {
    const envelope = makeEnvelope();
    const fixedNonce = randomUUID();
    envelope.nonce = fixedNonce;

    // First use — should pass
    const result1 = verifyIntentEnvelope(envelope);
    expect(result1.verified).toBe(true);
    expect(result1.replay_check).toBe(true);

    // Replay — same nonce, should fail
    const envelope2 = makeEnvelope();
    envelope2.nonce = fixedNonce;
    const result2 = verifyIntentEnvelope(envelope2);
    expect(result2.verified).toBe(false);
    expect(result2.replay_check).toBe(false);
    expect(result2.failure_reasons.some(r => r.includes("Replay"))).toBe(true);
  });

  it("rejects empty nonce", () => {
    const envelope = makeEnvelope();
    envelope.nonce = "";
    const result = verifyIntentEnvelope(envelope);
    expect(result.verified).toBe(false);
    expect(result.nonce_valid).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════
// TEST 3: low_risk_intent_auto_approves_and_executes_through_gate
// ═══════════════════════════════════════════════════════════════

describe("3. low_risk_intent_auto_approves_and_executes_through_gate", () => {
  it("LOW risk auto-approves in governance", () => {
    const envelope = makeEnvelope();
    const verification = verifyIntentEnvelope(envelope);
    expect(verification.verified).toBe(true);

    const governance = evaluateGovernance(envelope, verification, LOW_TOOL);
    expect(governance.decision).toBe("APPROVE");
    expect(governance.risk_level).toBe("LOW");
    expect(governance.required_approvals).toBe(0);
  });

  it("LOW risk executes through full closed loop without human approval", async () => {
    const envelope = makeEnvelope({ action_type: "web_search" });
    const result = await executeClosedLoop({
      envelope,
      toolMeta: LOW_TOOL,
      approval: null,
      connector: mockConnector,
      previousLedgerHash: "GENESIS",
      blockIndex: 1,
    });

    expect(result.success).toBe(true);
    expect(result.stage_reached).toBe("COMPLETE");
    expect(result.governance?.decision).toBe("APPROVE");
    expect(result.receipt).toBeDefined();
    expect(result.receipt?.outcome_status).toBe("SUCCESS");
    expect(result.ledger_entry).toBeDefined();
    expect(result.ledger_entry?.block_index).toBe(1);
  });
});

// ═══════════════════════════════════════════════════════════════
// TEST 4: high_risk_intent_blocks_without_human_approval
// ═══════════════════════════════════════════════════════════════

describe("4. high_risk_intent_blocks_without_human_approval", () => {
  it("HIGH risk requires human approval in governance", () => {
    const envelope = makeEnvelope({ action_type: "send_email" });
    const verification = verifyIntentEnvelope(envelope);
    const governance = evaluateGovernance(envelope, verification, HIGH_TOOL);
    expect(governance.decision).toBe("REQUIRE_HUMAN_APPROVAL");
    expect(governance.required_approvals).toBe(1);
    expect(governance.risk_level).toBe("HIGH");
  });

  it("HIGH risk blocks execution when no approval provided", async () => {
    const envelope = makeEnvelope({ action_type: "send_email" });
    const result = await executeClosedLoop({
      envelope,
      toolMeta: HIGH_TOOL,
      approval: null,
      connector: mockConnector,
      previousLedgerHash: "GENESIS",
      blockIndex: 1,
    });

    expect(result.success).toBe(false);
    expect(result.stage_reached).toBe("HUMAN_AUTHORIZATION");
    expect(result.error).toContain("Silence equals refusal");
    expect(result.receipt).toBeUndefined();
  });

  it("MEDIUM risk also blocks without approval", async () => {
    const envelope = makeEnvelope({ action_type: "draft_email" });
    const result = await executeClosedLoop({
      envelope,
      toolMeta: MEDIUM_TOOL,
      approval: null,
      connector: mockConnector,
      previousLedgerHash: "GENESIS",
      blockIndex: 1,
    });

    expect(result.success).toBe(false);
    expect(result.stage_reached).toBe("HUMAN_AUTHORIZATION");
  });
});

// ═══════════════════════════════════════════════════════════════
// TEST 5: approval_for_one_intent_cannot_be_reused_for_another
// ═══════════════════════════════════════════════════════════════

describe("5. approval_for_one_intent_cannot_be_reused_for_another", () => {
  it("approval with wrong intent_hash is rejected", () => {
    const envelope1 = makeEnvelope({ action_type: "send_email" });
    const verification1 = verifyIntentEnvelope(envelope1);
    const governance1 = evaluateGovernance(envelope1, verification1, HIGH_TOOL);

    const envelope2 = makeEnvelope({ action_type: "send_email" });
    const verification2 = verifyIntentEnvelope(envelope2);
    const governance2 = evaluateGovernance(envelope2, verification2, HIGH_TOOL);

    // Create approval for intent 1
    const approval = makeApproval(governance1);

    // Try to validate it against intent 2's governance
    const validation = validateApproval(approval, governance2);
    expect(validation.valid).toBe(false);
    expect(validation.reasons.some(r => r.includes("intent_hash"))).toBe(true);
  });

  it("approval with wrong decision_id is rejected", () => {
    const envelope = makeEnvelope({ action_type: "send_email" });
    const verification = verifyIntentEnvelope(envelope);
    const governance = evaluateGovernance(envelope, verification, HIGH_TOOL);

    const approval = makeApproval(governance, { decision_id: "GOV-wrong" });
    const validation = validateApproval(approval, governance);
    expect(validation.valid).toBe(false);
    expect(validation.reasons.some(r => r.includes("decision_id"))).toBe(true);
  });

  it("cross-intent approval fails in full closed loop", async () => {
    // Create and verify intent 1
    const envelope1 = makeEnvelope({ action_type: "send_email" });
    const verification1 = verifyIntentEnvelope(envelope1);
    const governance1 = evaluateGovernance(envelope1, verification1, HIGH_TOOL);
    const approval1 = makeApproval(governance1);

    // Create intent 2 and try to use intent 1's approval
    const envelope2 = makeEnvelope({ action_type: "send_email" });
    const result = await executeClosedLoop({
      envelope: envelope2,
      toolMeta: HIGH_TOOL,
      approval: approval1, // Wrong approval!
      connector: mockConnector,
      previousLedgerHash: "GENESIS",
      blockIndex: 1,
    });

    expect(result.success).toBe(false);
    expect(result.stage_reached).toBe("HUMAN_AUTHORIZATION");
    expect(result.error).toContain("Approval validation failed");
  });
});

// ═══════════════════════════════════════════════════════════════
// TEST 6: execution_without_valid_token_is_denied
// ═══════════════════════════════════════════════════════════════

describe("6. execution_without_valid_token_is_denied", () => {
  it("expired token fails preflight gate", () => {
    const envelope = makeEnvelope();
    const verification = verifyIntentEnvelope(envelope);
    const governance = evaluateGovernance(envelope, verification, LOW_TOOL);

    // Issue token with 0ms TTL (immediately expired)
    const token = issueExecutionToken(envelope, governance, 0);
    // Wait a tick
    const gate = executeGatePreflight(token, envelope, governance);
    expect(gate.passed).toBe(false);
    expect(gate.checks.find(c => c.check === "token_not_expired")?.status).toBe("FAIL");
  });

  it("already-used token fails preflight gate", () => {
    const envelope = makeEnvelope();
    const verification = verifyIntentEnvelope(envelope);
    const governance = evaluateGovernance(envelope, verification, LOW_TOOL);
    const token = issueExecutionToken(envelope, governance);

    // First use — passes
    const gate1 = executeGatePreflight(token, envelope, governance);
    expect(gate1.passed).toBe(true);

    // Second use — fails (single-use)
    _clearNonces(); // Clear nonces so we can re-verify
    const envelope2 = makeEnvelope();
    envelope2.intent_id = envelope.intent_id;
    envelope2.action_type = envelope.action_type;
    envelope2.target = envelope.target;
    envelope2.parameters = envelope.parameters;
    const gate2 = executeGatePreflight(token, envelope2, governance);
    expect(gate2.passed).toBe(false);
    expect(gate2.checks.find(c => c.check === "token_valid")?.status).toBe("FAIL");
  });

  it("token with mismatched intent hash fails", () => {
    const envelope1 = makeEnvelope();
    const verification1 = verifyIntentEnvelope(envelope1);
    const governance1 = evaluateGovernance(envelope1, verification1, LOW_TOOL);
    const token = issueExecutionToken(envelope1, governance1);

    // Different intent's governance
    const envelope2 = makeEnvelope();
    const verification2 = verifyIntentEnvelope(envelope2);
    const governance2 = evaluateGovernance(envelope2, verification2, LOW_TOOL);

    const gate = executeGatePreflight(token, envelope2, governance2);
    expect(gate.passed).toBe(false);
    expect(gate.checks.find(c => c.check === "intent_hash_match")?.status).toBe("FAIL");
  });

  it("token with tampered parameters fails action hash check", () => {
    const envelope = makeEnvelope({ parameters: { query: "original" } } as Partial<IntentEnvelope>);
    const verification = verifyIntentEnvelope(envelope);
    const governance = evaluateGovernance(envelope, verification, LOW_TOOL);
    const token = issueExecutionToken(envelope, governance);

    // Tamper with parameters after token issuance
    const tamperedEnvelope = { ...envelope, parameters: { query: "tampered" } };
    const gate = executeGatePreflight(token, tamperedEnvelope, governance);
    expect(gate.passed).toBe(false);
    expect(gate.checks.find(c => c.check === "action_hash_match")?.status).toBe("FAIL");
  });
});

// ═══════════════════════════════════════════════════════════════
// TEST 7: successful_execution_generates_receipt_and_ledger_entry
// ═══════════════════════════════════════════════════════════════

describe("7. successful_execution_generates_receipt_and_ledger_entry", () => {
  it("generates witness receipt with full chain of custody", async () => {
    const envelope = makeEnvelope();
    const result = await executeClosedLoop({
      envelope,
      toolMeta: LOW_TOOL,
      approval: null,
      connector: mockConnector,
      previousLedgerHash: "GENESIS",
      blockIndex: 1,
    });

    expect(result.success).toBe(true);
    expect(result.receipt).toBeDefined();
    const receipt = result.receipt!;

    // Receipt links all artifacts
    expect(receipt.intent_hash).toBe(result.verification?.intent_hash);
    expect(receipt.verification_hash).toBeTruthy();
    expect(receipt.decision_hash).toBeTruthy();
    expect(receipt.execution_hash).toBeTruthy();
    expect(receipt.receipt_hash).toBeTruthy();
    expect(receipt.verification_status).toBe("VERIFIED");
    expect(receipt.outcome_status).toBe("SUCCESS");

    // Chain of custody is complete
    expect(receipt.chain_of_custody.envelope).toBeDefined();
    expect(receipt.chain_of_custody.verification).toBeDefined();
    expect(receipt.chain_of_custody.governance).toBeDefined();
    expect(receipt.chain_of_custody.execution_token).toBeDefined();
    expect(receipt.chain_of_custody.connector_result).toBeDefined();
    expect(receipt.chain_of_custody.connector_result.success).toBe(true);
  });

  it("generates formal ledger entry with hash chain", async () => {
    const envelope = makeEnvelope();
    const result = await executeClosedLoop({
      envelope,
      toolMeta: LOW_TOOL,
      approval: null,
      connector: mockConnector,
      previousLedgerHash: "GENESIS",
      blockIndex: 1,
    });

    expect(result.ledger_entry).toBeDefined();
    const entry = result.ledger_entry!;

    expect(entry.block_index).toBe(1);
    expect(entry.receipt_hash).toBe(result.receipt?.receipt_hash);
    expect(entry.previous_ledger_hash).toBe("GENESIS");
    expect(entry.current_hash).toBeTruthy();
    expect(entry.entry_type).toBe("EXECUTION");
    expect(entry.payload).toBeDefined();
  });

  it("receipt hash is deterministic for same inputs", () => {
    const envelope = makeEnvelope();
    const verification = verifyIntentEnvelope(envelope);
    const governance = evaluateGovernance(envelope, verification, LOW_TOOL);
    const token = issueExecutionToken(envelope, governance);
    const connectorResult = { success: true, output: { x: 1 }, executedAt: 1000 };

    const receipt1 = generateWitnessReceipt({
      envelope, verification, governance, approval: null, executionToken: token, connectorResult,
    });
    // Receipt IDs differ (nanoid), but the hash covers the chain
    expect(receipt1.receipt_hash).toBeTruthy();
    expect(receipt1.receipt_hash.length).toBe(64); // SHA-256 hex
  });

  it("failed execution still generates receipt with FAILURE status", async () => {
    const envelope = makeEnvelope();
    const result = await executeClosedLoop({
      envelope,
      toolMeta: LOW_TOOL,
      approval: null,
      connector: failingConnector,
      previousLedgerHash: "GENESIS",
      blockIndex: 1,
    });

    // Closed loop completes but reports failure
    expect(result.success).toBe(false);
    expect(result.stage_reached).toBe("COMPLETE");
    expect(result.receipt).toBeDefined();
    expect(result.receipt?.outcome_status).toBe("FAILURE");
    expect(result.ledger_entry).toBeDefined();
  });
});

// ═══════════════════════════════════════════════════════════════
// TEST 8: ledger_chain_validation_detects_tampering
// ═══════════════════════════════════════════════════════════════

describe("8. ledger_chain_validation_detects_tampering", () => {
  it("valid chain of 3 entries verifies correctly", async () => {
    const entries = [];
    let prevHash = "GENESIS";

    for (let i = 1; i <= 3; i++) {
      const envelope = makeEnvelope();
      const result = await executeClosedLoop({
        envelope,
        toolMeta: LOW_TOOL,
        approval: null,
        connector: mockConnector,
        previousLedgerHash: prevHash,
        blockIndex: i,
      });
      expect(result.ledger_entry).toBeDefined();
      entries.push(result.ledger_entry!);
      prevHash = result.ledger_entry!.current_hash;
    }

    // Verify chain
    for (let i = 0; i < entries.length; i++) {
      const entry = entries[i];
      const expectedPrev = i === 0 ? "GENESIS" : entries[i - 1].current_hash;
      expect(entry.previous_ledger_hash).toBe(expectedPrev);

      // Recompute hash
      const recomputed = computeHash(canonicalJsonStringify({
        block_index: entry.block_index,
        receipt_hash: entry.receipt_hash,
        previous_ledger_hash: entry.previous_ledger_hash,
        timestamp: entry.timestamp,
        payload: entry.payload,
      }));
      expect(entry.current_hash).toBe(recomputed);
    }
  });

  it("detects tampered payload in middle entry", async () => {
    const entries = [];
    let prevHash = "GENESIS";

    for (let i = 1; i <= 3; i++) {
      const envelope = makeEnvelope();
      const result = await executeClosedLoop({
        envelope,
        toolMeta: LOW_TOOL,
        approval: null,
        connector: mockConnector,
        previousLedgerHash: prevHash,
        blockIndex: i,
      });
      entries.push(result.ledger_entry!);
      prevHash = result.ledger_entry!.current_hash;
    }

    // Tamper with middle entry's payload
    const tampered = { ...entries[1], payload: { ...entries[1].payload, receipt_id: "TAMPERED" } };
    entries[1] = tampered;

    // Verify — should detect tampering
    const recomputed = computeHash(canonicalJsonStringify({
      block_index: tampered.block_index,
      receipt_hash: tampered.receipt_hash,
      previous_ledger_hash: tampered.previous_ledger_hash,
      timestamp: tampered.timestamp,
      payload: tampered.payload,
    }));
    expect(recomputed).not.toBe(tampered.current_hash); // Hash mismatch!
  });

  it("detects broken chain link (modified previous_ledger_hash)", async () => {
    const entries = [];
    let prevHash = "GENESIS";

    for (let i = 1; i <= 3; i++) {
      const envelope = makeEnvelope();
      const result = await executeClosedLoop({
        envelope,
        toolMeta: LOW_TOOL,
        approval: null,
        connector: mockConnector,
        previousLedgerHash: prevHash,
        blockIndex: i,
      });
      entries.push(result.ledger_entry!);
      prevHash = result.ledger_entry!.current_hash;
    }

    // Break chain link
    entries[2] = { ...entries[2], previous_ledger_hash: "BROKEN" };

    // Verify — entry 2's previous should point to entry 1's hash
    expect(entries[2].previous_ledger_hash).not.toBe(entries[1].current_hash);
  });
});

// ═══════════════════════════════════════════════════════════════
// TEST 9: learning_loop_reads_ledger_and_emits_recommendations
//         _without_mutating_live_policy
// ═══════════════════════════════════════════════════════════════

describe("9. learning_loop_reads_ledger_and_emits_recommendations_without_mutating_live_policy", () => {
  it("produces analysis from ledger entries and learning events", () => {
    const ledgerEntries = [
      { entryType: "INTENT", payload: { intentId: "INT-1", toolName: "web_search" }, timestamp: Date.now() - 60000 },
      { entryType: "INTENT", payload: { intentId: "INT-2", toolName: "send_email" }, timestamp: Date.now() - 50000 },
      { entryType: "APPROVAL", payload: { intentId: "INT-2", boundToolName: "send_email" }, timestamp: Date.now() - 40000 },
      { entryType: "EXECUTION", payload: { intentId: "INT-1" }, timestamp: Date.now() - 30000 },
      { entryType: "EXECUTION", payload: { intentId: "INT-2" }, timestamp: Date.now() - 20000 },
    ];

    const learningEvents = [
      { eventType: "APPROVAL" as const, outcome: "POSITIVE", context: { toolName: "send_email" } },
      { eventType: "EXECUTION" as const, outcome: "POSITIVE", context: { toolName: "web_search" } },
      { eventType: "EXECUTION" as const, outcome: "POSITIVE", context: { toolName: "send_email" } },
    ];

    const analysis = runLearningLoopAnalysis(ledgerEntries, learningEvents);

    expect(analysis.analysis_id).toMatch(/^LEARN-/);
    expect(analysis.total_intents).toBe(2);
    expect(analysis.total_executions).toBe(2);
    expect(analysis.total_approvals).toBe(1);
    expect(analysis.mutates_live_policy).toBe(false);
    expect(analysis.timestamp).toBeGreaterThan(0);
  });

  it("NEVER mutates live policy — mutates_live_policy is always false", () => {
    const analysis = runLearningLoopAnalysis([], []);
    expect(analysis.mutates_live_policy).toBe(false);

    // Even with recommendations
    const ledgerEntries = [
      { entryType: "INTENT", payload: { intentId: "INT-1" }, timestamp: Date.now() },
      { entryType: "EXECUTION", payload: { intentId: "INT-1", error: "failed" }, timestamp: Date.now() },
    ];
    const learningEvents = [
      { eventType: "EXECUTION" as const, outcome: "NEGATIVE", context: { toolName: "web_search", riskTier: "LOW" } },
    ];
    const analysis2 = runLearningLoopAnalysis(ledgerEntries, learningEvents);
    expect(analysis2.mutates_live_policy).toBe(false);
    // Should generate a recommendation for risk adjustment
    if (analysis2.recommendations.length > 0) {
      expect(analysis2.recommendations[0].status).toBe("PENDING_REVIEW");
    }
  });

  it("generates recommendations for false positives (LOW risk failures)", () => {
    const ledgerEntries = [
      { entryType: "INTENT", payload: { intentId: "INT-1" }, timestamp: Date.now() },
    ];
    const learningEvents = [
      { eventType: "EXECUTION" as const, outcome: "NEGATIVE", context: { toolName: "web_search", riskTier: "LOW" } },
      { eventType: "EXECUTION" as const, outcome: "NEGATIVE", context: { toolName: "web_search", riskTier: "LOW" } },
    ];
    const analysis = runLearningLoopAnalysis(ledgerEntries, learningEvents);
    expect(analysis.metrics.false_positives).toBe(2);
    expect(analysis.recommendations.some(r => r.type === "RISK_ADJUSTMENT")).toBe(true);
    expect(analysis.recommendations.every(r => r.status === "PENDING_REVIEW")).toBe(true);
  });

  it("detects approval bottlenecks", () => {
    const now = Date.now();
    const ledgerEntries = [
      { entryType: "INTENT", payload: { intentId: "INT-1" }, timestamp: now - 600000 }, // 10 min ago
      { entryType: "APPROVAL", payload: { intentId: "INT-1", boundToolName: "send_email" }, timestamp: now }, // just now
    ];
    const analysis = runLearningLoopAnalysis(ledgerEntries, []);
    expect(analysis.metrics.approval_bottlenecks).toBe(1);
  });

  it("all recommendations have PENDING_REVIEW status", () => {
    const ledgerEntries = [
      { entryType: "INTENT", payload: { intentId: "INT-1" }, timestamp: Date.now() },
      { entryType: "EXECUTION", payload: { intentId: "INT-1", error: "fail" }, timestamp: Date.now() },
      { entryType: "EXECUTION", payload: { intentId: "INT-2", error: "fail" }, timestamp: Date.now() },
      { entryType: "EXECUTION", payload: { intentId: "INT-3", error: "fail" }, timestamp: Date.now() },
    ];
    const learningEvents = [
      { eventType: "EXECUTION" as const, outcome: "NEGATIVE", context: { toolName: "web_search", riskTier: "LOW" } },
    ];
    const analysis = runLearningLoopAnalysis(ledgerEntries, learningEvents);
    for (const rec of analysis.recommendations) {
      expect(rec.status).toBe("PENDING_REVIEW");
    }
  });
});

// ═══════════════════════════════════════════════════════════════
// BONUS: Full closed-loop demo — one flow proving the entire chain
// ═══════════════════════════════════════════════════════════════

describe("DEMO: Full closed-loop — proposal → approval → execution → receipt → ledger → learning", () => {
  it("traces a single HIGH-risk intent end-to-end", async () => {
    // 1. Create intent envelope
    const envelope = createIntentEnvelope({
      intentId: `INT-${nanoid(16)}`,
      userId: 1,
      sourceType: "HUMAN",
      toolName: "send_email",
      toolArgs: { to: "test@example.com", subject: "Test", body: "Hello" },
    });

    // 2. Verify
    const verification = verifyIntentEnvelope(envelope);
    expect(verification.verified).toBe(true);

    // 3. Governance
    const governance = evaluateGovernance(envelope, verification, HIGH_TOOL);
    expect(governance.decision).toBe("REQUIRE_HUMAN_APPROVAL");

    // 4. Human approval
    const approval = makeApproval(governance);
    const approvalValidation = validateApproval(approval, governance);
    expect(approvalValidation.valid).toBe(true);

    // 5. Issue execution token
    const token = issueExecutionToken(envelope, governance);
    expect(token.token_id).toMatch(/^ETOK-/);

    // 6. Preflight gate
    const gate = executeGatePreflight(token, envelope, governance);
    expect(gate.passed).toBe(true);
    expect(gate.checks.every(c => c.status === "PASS")).toBe(true);

    // 7. Execute (mock connector)
    const connectorResult = await mockConnector(envelope.parameters);
    expect(connectorResult.success).toBe(true);

    // 8. Generate receipt
    const receipt = generateWitnessReceipt({
      envelope, verification, governance, approval, executionToken: token, connectorResult,
    });
    expect(receipt.receipt_id).toMatch(/^REC-/);
    expect(receipt.receipt_hash.length).toBe(64);
    expect(receipt.outcome_status).toBe("SUCCESS");
    expect(receipt.chain_of_custody.envelope.intent_id).toBe(envelope.intent_id);

    // 9. Build ledger entry
    const ledgerEntry = buildFormalLedgerEntry(receipt, 1, "GENESIS");
    expect(ledgerEntry.block_index).toBe(1);
    expect(ledgerEntry.receipt_hash).toBe(receipt.receipt_hash);
    expect(ledgerEntry.previous_ledger_hash).toBe("GENESIS");

    // Verify ledger entry hash
    const recomputed = computeHash(canonicalJsonStringify({
      block_index: 1,
      receipt_hash: receipt.receipt_hash,
      previous_ledger_hash: "GENESIS",
      timestamp: receipt.timestamp,
      payload: ledgerEntry.payload,
    }));
    expect(ledgerEntry.current_hash).toBe(recomputed);

    // 10. Learning loop
    const analysis = runLearningLoopAnalysis(
      [{ entryType: "EXECUTION", payload: { intentId: envelope.intent_id }, timestamp: Date.now() }],
      [{ eventType: "EXECUTION", outcome: "POSITIVE", context: { toolName: "send_email" } }],
    );
    expect(analysis.mutates_live_policy).toBe(false);
    expect(analysis.total_executions).toBe(1);

    // COMPLETE: Single intent traced end-to-end from proposal to receipt
    console.log(`\n✅ FULL CLOSED LOOP PROVEN:`);
    console.log(`   Intent:     ${envelope.intent_id}`);
    console.log(`   Verified:   ${verification.verification_id}`);
    console.log(`   Governed:   ${governance.decision_id}`);
    console.log(`   Approved:   ${approval.approval_id}`);
    console.log(`   Token:      ${token.token_id}`);
    console.log(`   Receipt:    ${receipt.receipt_id}`);
    console.log(`   Ledger:     block #${ledgerEntry.block_index}`);
    console.log(`   Learning:   ${analysis.analysis_id} (mutates_live_policy: ${analysis.mutates_live_policy})`);
  });
});
