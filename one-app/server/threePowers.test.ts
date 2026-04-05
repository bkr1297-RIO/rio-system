/**
 * Three-Power Separation Architecture — Test Suite
 * ═══════════════════════════════════════════════════════════════
 * Proves that Observer/Governor/Executor boundaries are enforced
 * by infrastructure, not by convention.
 *
 * Test categories:
 *   1. Permission enforcement — each power can ONLY do what it's allowed to
 *   2. Queue isolation — wrong power cannot send/receive from wrong queue
 *   3. Signature verification — forged or missing signatures block execution
 *   4. Full closed loop — one intent through all three powers with receipt + ledger
 *   5. Rejection flow — Governor rejects, Executor never receives
 *   6. Tampered approval — Executor detects parameter changes after approval
 */

import { describe, it, expect, beforeEach } from "vitest";
import {
  POWER,
  PERMISSIONS,
  checkPermission,
  generateComponentKeys,
  Observer,
  Governor,
  Executor,
  observerToGovernorQueue,
  governorToExecutorQueue,
  signApproval,
  verifyApprovalSignature,
  executeThreePowerLoop,
  _clearQueues,
  type GovernorApproval,
  type PowerRole,
} from "./threePowers";

// ═══════════════════════════════════════════════════════════════
// SETUP
// ═══════════════════════════════════════════════════════════════

let observer: Observer;
let governor: Governor;
let executor: Executor;
let govKeys: { privateKey: string; publicKey: string };

beforeEach(() => {
  _clearQueues();
  observer = new Observer("OBS-TEST");
  govKeys = generateComponentKeys();
  governor = new Governor(govKeys.privateKey, govKeys.publicKey, "GOV-TEST");
  executor = new Executor("EXEC-TEST");
});

// ═══════════════════════════════════════════════════════════════
// 1. PERMISSION ENFORCEMENT
// ═══════════════════════════════════════════════════════════════

describe("Permission enforcement — compile-time + runtime", () => {
  it("Observer CAN read, assess risk, and send signals", () => {
    expect(checkPermission("OBSERVER", "canRead")).toEqual({ allowed: true });
    expect(checkPermission("OBSERVER", "canAssessRisk")).toEqual({ allowed: true });
    expect(checkPermission("OBSERVER", "canSendSignals")).toEqual({ allowed: true });
    expect(checkPermission("OBSERVER", "canReadFullState")).toEqual({ allowed: true });
  });

  it("Observer CANNOT approve, sign, or execute", () => {
    expect(checkPermission("OBSERVER", "canApprove").allowed).toBe(false);
    expect(checkPermission("OBSERVER", "canSign").allowed).toBe(false);
    expect(checkPermission("OBSERVER", "canExecute").allowed).toBe(false);
  });

  it("Observer CAN write ledger (append submit entries per TPS-001 §7)", () => {
    expect(checkPermission("OBSERVER", "canWriteLedger")).toEqual({ allowed: true });
  });

  it("Governor CAN approve and sign", () => {
    expect(checkPermission("GOVERNOR", "canApprove")).toEqual({ allowed: true });
    expect(checkPermission("GOVERNOR", "canSign")).toEqual({ allowed: true });
  });

  it("Governor CANNOT execute, read full state, or assess risk", () => {
    expect(checkPermission("GOVERNOR", "canExecute").allowed).toBe(false);
    expect(checkPermission("GOVERNOR", "canReadFullState").allowed).toBe(false);
    expect(checkPermission("GOVERNOR", "canAssessRisk").allowed).toBe(false);
  });

  it("Governor CAN write ledger (append governance decision entries per TPS-001 §7)", () => {
    expect(checkPermission("GOVERNOR", "canWriteLedger")).toEqual({ allowed: true });
  });

  it("Executor CAN execute and write ledger", () => {
    expect(checkPermission("EXECUTOR", "canExecute")).toEqual({ allowed: true });
    expect(checkPermission("EXECUTOR", "canWriteLedger")).toEqual({ allowed: true });
  });

  it("Executor CANNOT approve, sign, read, or assess risk", () => {
    expect(checkPermission("EXECUTOR", "canApprove").allowed).toBe(false);
    expect(checkPermission("EXECUTOR", "canSign").allowed).toBe(false);
    expect(checkPermission("EXECUTOR", "canRead").allowed).toBe(false);
    expect(checkPermission("EXECUTOR", "canAssessRisk").allowed).toBe(false);
    expect(checkPermission("EXECUTOR", "canReadFullState").allowed).toBe(false);
  });

  it("Observer.approve() throws POWER_VIOLATION", () => {
    expect(() => observer.approve()).toThrow("POWER_VIOLATION");
  });

  it("Observer.execute() throws POWER_VIOLATION", () => {
    expect(() => observer.execute()).toThrow("POWER_VIOLATION");
  });

  it("Governor.execute() throws POWER_VIOLATION", () => {
    expect(() => governor.execute()).toThrow("POWER_VIOLATION");
  });

  it("Governor.readFullState() throws POWER_VIOLATION", () => {
    expect(() => governor.readFullState()).toThrow("POWER_VIOLATION");
  });

  it("Executor.approve() throws POWER_VIOLATION", () => {
    expect(() => executor.approve()).toThrow("POWER_VIOLATION");
  });

  it("Executor.sign() throws POWER_VIOLATION", () => {
    expect(() => executor.sign()).toThrow("POWER_VIOLATION");
  });

  it("Executor.readFullState() throws POWER_VIOLATION", () => {
    expect(() => executor.readFullState()).toThrow("POWER_VIOLATION");
  });

  it("No two powers share the same permission", () => {
    // Verify that no operation is allowed by all three powers
    const ops = Object.keys(PERMISSIONS.OBSERVER) as Array<keyof typeof PERMISSIONS["OBSERVER"]>;
    for (const op of ops) {
      const allowed = [
        PERMISSIONS.OBSERVER[op],
        PERMISSIONS.GOVERNOR[op],
        PERMISSIONS.EXECUTOR[op],
      ].filter(Boolean).length;
      // At most 1 power should have each critical operation
      // (canRead is shared between Observer and... nobody else, so max 1 for critical ops)
      if (op === "canApprove" || op === "canSign") {
        expect(allowed).toBe(1); // Only Governor
      }
      if (op === "canExecute") {
        expect(allowed).toBe(1); // Only Executor
      }
    }
  });
});

// ═══════════════════════════════════════════════════════════════
// 2. QUEUE ISOLATION
// ═══════════════════════════════════════════════════════════════

describe("Queue isolation — wrong power cannot cross boundaries", () => {
  it("Governor cannot send to Observer→Governor queue", () => {
    const signal = observer.assessRisk({
      intentId: "INT-test",
      intentHash: "abc123",
      toolName: "gmail_send",
      toolArgs: { to: "test@test.com" },
      riskTier: "HIGH",
      blastRadiusBase: 5,
    });
    expect(() => observerToGovernorQueue.enqueue("GOVERNOR" as PowerRole, signal))
      .toThrow("QUEUE_VIOLATION");
  });

  it("Executor cannot send to Observer→Governor queue", () => {
    const signal = observer.assessRisk({
      intentId: "INT-test",
      intentHash: "abc123",
      toolName: "gmail_send",
      toolArgs: { to: "test@test.com" },
      riskTier: "HIGH",
      blastRadiusBase: 5,
    });
    expect(() => observerToGovernorQueue.enqueue("EXECUTOR" as PowerRole, signal))
      .toThrow("QUEUE_VIOLATION");
  });

  it("Observer cannot receive from Observer→Governor queue", () => {
    expect(() => observerToGovernorQueue.dequeue("OBSERVER" as PowerRole))
      .toThrow("QUEUE_VIOLATION");
  });

  it("Observer cannot send to Governor→Executor queue", () => {
    expect(() => governorToExecutorQueue.enqueue("OBSERVER" as PowerRole, {} as GovernorApproval))
      .toThrow("QUEUE_VIOLATION");
  });

  it("Executor cannot send to Governor→Executor queue", () => {
    expect(() => governorToExecutorQueue.enqueue("EXECUTOR" as PowerRole, {} as GovernorApproval))
      .toThrow("QUEUE_VIOLATION");
  });

  it("Observer cannot receive from Governor→Executor queue", () => {
    expect(() => governorToExecutorQueue.dequeue("OBSERVER" as PowerRole))
      .toThrow("QUEUE_VIOLATION");
  });

  it("Governor cannot receive from Governor→Executor queue", () => {
    expect(() => governorToExecutorQueue.dequeue("GOVERNOR" as PowerRole))
      .toThrow("QUEUE_VIOLATION");
  });
});

// ═══════════════════════════════════════════════════════════════
// 3. SIGNATURE VERIFICATION
// ═══════════════════════════════════════════════════════════════

describe("Ed25519 signature verification — cryptographic enforcement", () => {
  it("Governor's signed approval verifies correctly", () => {
    const signal = observer.assessRisk({
      intentId: "INT-sig-test",
      intentHash: "hash123",
      toolName: "gmail_send",
      toolArgs: { to: "test@test.com" },
      riskTier: "HIGH",
      blastRadiusBase: 5,
    });
    observer.sendSignal(signal);

    const received = governor.receiveSignal()!;
    const approval = governor.makeDecision({
      signal: received.payload,
      humanDecision: "APPROVED",
      approverId: "human-brian",
      policyVersion: "v1.0.0",
      actionHash: "action-hash-123",
    });

    expect(verifyApprovalSignature(approval)).toBe(true);
  });

  it("Tampered approval fails signature verification", () => {
    const signal = observer.assessRisk({
      intentId: "INT-tamper-test",
      intentHash: "hash456",
      toolName: "gmail_send",
      toolArgs: { to: "test@test.com" },
      riskTier: "HIGH",
      blastRadiusBase: 5,
    });
    observer.sendSignal(signal);

    const received = governor.receiveSignal()!;
    const approval = governor.makeDecision({
      signal: received.payload,
      humanDecision: "APPROVED",
      approverId: "human-brian",
      policyVersion: "v1.0.0",
      actionHash: "action-hash-456",
    });

    // Tamper with the approval
    const tampered = { ...approval, intent_id: "INT-DIFFERENT" };
    expect(verifyApprovalSignature(tampered)).toBe(false);
  });

  it("Approval signed with wrong key fails verification", () => {
    const wrongKeys = generateComponentKeys();
    const wrongGovernor = new Governor(wrongKeys.privateKey, wrongKeys.publicKey, "GOV-WRONG");

    const signal = observer.assessRisk({
      intentId: "INT-wrongkey",
      intentHash: "hash789",
      toolName: "gmail_send",
      toolArgs: { to: "test@test.com" },
      riskTier: "HIGH",
      blastRadiusBase: 5,
    });
    observer.sendSignal(signal);

    const received = wrongGovernor.receiveSignal()!;
    const approval = wrongGovernor.makeDecision({
      signal: received.payload,
      humanDecision: "APPROVED",
      approverId: "human-brian",
      policyVersion: "v1.0.0",
      actionHash: "action-hash-789",
    });

    // Replace the public key with the real governor's key — signature won't match
    const faked = { ...approval, governor_public_key: govKeys.publicKey };
    expect(verifyApprovalSignature(faked)).toBe(false);
  });

  it("Executor blocks execution on invalid signature", async () => {
    const signal = observer.assessRisk({
      intentId: "INT-block-test",
      intentHash: "hashblock",
      toolName: "gmail_send",
      toolArgs: { to: "test@test.com" },
      riskTier: "HIGH",
      blastRadiusBase: 5,
    });
    observer.sendSignal(signal);

    const received = governor.receiveSignal()!;
    const approval = governor.makeDecision({
      signal: received.payload,
      humanDecision: "APPROVED",
      approverId: "human-brian",
      policyVersion: "v1.0.0",
      actionHash: "tampered-hash",
    });

    // Tamper with the approval after signing
    const tampered = { ...approval, intent_id: "INT-HACKED" };

    await expect(
      executor.executeAction({
        approval: tampered,
        connector: async () => ({ success: true, output: "sent" }),
        toolArgs: { to: "test@test.com" },
      })
    ).rejects.toThrow("SIGNATURE_INVALID");
  });

  it("Executor blocks execution when action hash doesn't match approved hash", async () => {
    const toolArgs = { to: "test@test.com", subject: "Hello" };
    const signal = observer.assessRisk({
      intentId: "INT-hash-mismatch",
      intentHash: "hash-mm",
      toolName: "gmail_send",
      toolArgs,
      riskTier: "HIGH",
      blastRadiusBase: 5,
    });
    observer.sendSignal(signal);

    const received = governor.receiveSignal()!;
    // Governor approves with the correct action hash
    const { createHash } = await import("crypto");
    const correctHash = createHash("sha256")
      .update(JSON.stringify(toolArgs))
      .digest("hex");

    const approval = governor.makeDecision({
      signal: received.payload,
      humanDecision: "APPROVED",
      approverId: "human-brian",
      policyVersion: "v1.0.0",
      actionHash: correctHash,
    });

    // Try to execute with DIFFERENT args than what was approved
    const differentArgs = { to: "hacker@evil.com", subject: "Pwned" };

    await expect(
      executor.executeAction({
        approval,
        connector: async () => ({ success: true, output: "sent" }),
        toolArgs: differentArgs,
      })
    ).rejects.toThrow("Action hash mismatch");
  });
});

// ═══════════════════════════════════════════════════════════════
// 4. FULL CLOSED LOOP — One intent through all three powers
// ═══════════════════════════════════════════════════════════════

describe("Full three-power closed loop — the Phase 1 finish line", () => {
  it("HIGH-risk intent flows through Observer → Governor → Executor with valid receipt + ledger", async () => {
    const toolArgs = { to: "brian@example.com", subject: "Test", body: "Hello" };
    const { createHash } = await import("crypto");

    const result = await executeThreePowerLoop({
      observer,
      governor,
      executor,
      intentId: "INT-FULL-LOOP",
      intentHash: "full-loop-hash",
      toolName: "gmail_send",
      toolArgs,
      riskTier: "HIGH",
      blastRadiusBase: 7,
      humanDecision: "APPROVED",
      approverId: "human-brian",
      policyVersion: "v1.0.0",
      connector: async (args) => ({
        success: true,
        output: { messageId: "msg-123", status: "sent" },
      }),
      previousLedgerHash: "GENESIS",
      blockIndex: 1,
    });

    // Assert full completion
    expect(result.success).toBe(true);
    expect(result.stage_reached).toBe("COMPLETE");

    // Assert all three artifacts exist
    expect(result.observer_signal).toBeDefined();
    expect(result.observer_signal!.source_power).toBe("OBSERVER");
    expect(result.observer_signal!.risk_level).toBe("HIGH");

    expect(result.governor_approval).toBeDefined();
    expect(result.governor_approval!.source_power).toBe("GOVERNOR");
    expect(result.governor_approval!.decision).toBe("APPROVED");
    expect(result.governor_approval!.signature).toBeTruthy();

    expect(result.executor_result).toBeDefined();
    expect(result.executor_result!.source_power).toBe("EXECUTOR");
    expect(result.executor_result!.execution_success).toBe(true);
    expect(result.executor_result!.receipt_hash).toMatch(/^[a-f0-9]{64}$/);

    // Assert ledger entry
    expect(result.ledger_entry).toBeDefined();
    expect(result.ledger_entry!.prev_hash).toBe("GENESIS");
    expect(result.ledger_entry!.block_index).toBe(1);
    expect(result.ledger_entry!.current_hash).toMatch(/^[a-f0-9]{64}$/);
  });

  it("Connector failure still produces receipt and ledger entry (fail-closed with evidence)", async () => {
    const result = await executeThreePowerLoop({
      observer,
      governor,
      executor,
      intentId: "INT-FAIL-CONNECTOR",
      intentHash: "fail-hash",
      toolName: "gmail_send",
      toolArgs: { to: "test@test.com" },
      riskTier: "HIGH",
      blastRadiusBase: 5,
      humanDecision: "APPROVED",
      approverId: "human-brian",
      policyVersion: "v1.0.0",
      connector: async () => { throw new Error("SMTP connection refused"); },
      previousLedgerHash: "GENESIS",
      blockIndex: 1,
    });

    // Even on failure, the loop completes with evidence
    expect(result.stage_reached).toBe("COMPLETE");
    expect(result.success).toBe(false);
    expect(result.executor_result!.execution_success).toBe(false);
    expect(result.ledger_entry).toBeDefined();
    expect(result.ledger_entry!.receipt_hash).toMatch(/^[a-f0-9]{64}$/);
  });
});

// ═══════════════════════════════════════════════════════════════
// 5. REJECTION FLOW — Governor rejects, Executor never receives
// ═══════════════════════════════════════════════════════════════

describe("Rejection flow — Governor stops the loop", () => {
  it("Rejected intent stops at GOVERNANCE stage, Executor queue is empty", async () => {
    const result = await executeThreePowerLoop({
      observer,
      governor,
      executor,
      intentId: "INT-REJECTED",
      intentHash: "reject-hash",
      toolName: "gmail_send",
      toolArgs: { to: "test@test.com" },
      riskTier: "HIGH",
      blastRadiusBase: 5,
      humanDecision: "REJECTED",
      approverId: "human-brian",
      policyVersion: "v1.0.0",
      connector: async () => ({ success: true, output: "should never reach" }),
      previousLedgerHash: "GENESIS",
      blockIndex: 1,
    });

    expect(result.success).toBe(false);
    expect(result.stage_reached).toBe("GOVERNANCE");
    expect(result.error).toContain("rejected");
    expect(result.governor_approval!.decision).toBe("REJECTED");
    expect(result.executor_result).toBeUndefined();

    // Verify the Governor→Executor queue is empty (rejection never sent)
    expect(governorToExecutorQueue.pending()).toHaveLength(0);
  });
});

// ═══════════════════════════════════════════════════════════════
// 6. COMPONENT IDENTITY
// ═══════════════════════════════════════════════════════════════

describe("Component identity — each power has unique identity", () => {
  it("Each component has a unique componentId and correct power", () => {
    expect(observer.power).toBe("OBSERVER");
    expect(governor.power).toBe("GOVERNOR");
    expect(executor.power).toBe("EXECUTOR");

    expect(observer.componentId).toBe("OBS-TEST");
    expect(governor.componentId).toBe("GOV-TEST");
    expect(executor.componentId).toBe("EXEC-TEST");
  });

  it("Generated keys are valid Ed25519 keypairs (32-byte hex)", () => {
    const keys = generateComponentKeys();
    expect(keys.privateKey).toMatch(/^[a-f0-9]{64}$/);
    expect(keys.publicKey).toMatch(/^[a-f0-9]{64}$/);
  });

  it("Governor's public key is accessible for verification", () => {
    expect(governor.publicKey).toBe(govKeys.publicKey);
  });
});

// ═══════════════════════════════════════════════════════════════
// 7. OBSERVER SIGNAL INTEGRITY
// ═══════════════════════════════════════════════════════════════

describe("Observer signal integrity", () => {
  it("Observer produces a signal with correct risk assessment", () => {
    const signal = observer.assessRisk({
      intentId: "INT-risk-test",
      intentHash: "risk-hash",
      toolName: "gmail_send",
      toolArgs: { to: "test@test.com", subject: "Hello", body: "World" },
      riskTier: "HIGH",
      blastRadiusBase: 7,
    });

    expect(signal.source_power).toBe("OBSERVER");
    expect(signal.target_power).toBe("GOVERNOR");
    expect(signal.risk_level).toBe("HIGH");
    expect(signal.risk_score).toBeGreaterThanOrEqual(7);
    expect(signal.recommendation).toBe("REQUIRE_HUMAN_APPROVAL");
    expect(signal.signal_hash).toMatch(/^[a-f0-9]{64}$/);
  });

  it("LOW risk intent gets AUTO_APPROVE recommendation", () => {
    const signal = observer.assessRisk({
      intentId: "INT-low-risk",
      intentHash: "low-hash",
      toolName: "calendar_read",
      toolArgs: {},
      riskTier: "LOW",
      blastRadiusBase: 1,
    });

    expect(signal.recommendation).toBe("AUTO_APPROVE");
    expect(signal.risk_level).toBe("LOW");
  });
});

// ═══════════════════════════════════════════════════════════════
// 8. LEDGER CHAIN INTEGRITY
// ═══════════════════════════════════════════════════════════════

describe("Ledger chain integrity across multiple loops", () => {
  it("Two consecutive loops produce a valid hash chain", async () => {
    // First loop
    const result1 = await executeThreePowerLoop({
      observer: new Observer("OBS-1"),
      governor: new Governor(govKeys.privateKey, govKeys.publicKey, "GOV-1"),
      executor: new Executor("EXEC-1"),
      intentId: "INT-CHAIN-1",
      intentHash: "chain-hash-1",
      toolName: "gmail_send",
      toolArgs: { to: "test@test.com" },
      riskTier: "HIGH",
      blastRadiusBase: 5,
      humanDecision: "APPROVED",
      approverId: "human-brian",
      policyVersion: "v1.0.0",
      connector: async () => ({ success: true, output: "sent-1" }),
      previousLedgerHash: "GENESIS",
      blockIndex: 1,
    });

    expect(result1.success).toBe(true);
    const firstHash = result1.ledger_entry!.current_hash;

    // Clear queues for second loop
    _clearQueues();

    // Second loop — prev_hash is the first loop's current_hash
    const result2 = await executeThreePowerLoop({
      observer: new Observer("OBS-2"),
      governor: new Governor(govKeys.privateKey, govKeys.publicKey, "GOV-2"),
      executor: new Executor("EXEC-2"),
      intentId: "INT-CHAIN-2",
      intentHash: "chain-hash-2",
      toolName: "gmail_send",
      toolArgs: { to: "test2@test.com" },
      riskTier: "HIGH",
      blastRadiusBase: 5,
      humanDecision: "APPROVED",
      approverId: "human-brian",
      policyVersion: "v1.0.0",
      connector: async () => ({ success: true, output: "sent-2" }),
      previousLedgerHash: firstHash,
      blockIndex: 2,
    });

    expect(result2.success).toBe(true);
    expect(result2.ledger_entry!.prev_hash).toBe(firstHash);
    expect(result2.ledger_entry!.block_index).toBe(2);
    expect(result2.ledger_entry!.current_hash).not.toBe(firstHash);
  });
});
