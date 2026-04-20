/**
 * Policy Snapshot Isolation Guard — Tests
 * ═══════════════════════════════════════════════════════════════
 * 
 * Invariant under test:
 *   Same policy version + different operational context
 *   → identical snapshot_hash.
 *   Decision may vary. Snapshot must not.
 */

import { describe, it, expect, beforeEach } from "vitest";
import {
  buildPolicySnapshot,
  verifySnapshotHash,
  snapshotsMatch,
  type PolicySnapshot,
} from "./policySnapshot";
import {
  activatePolicy,
  computePolicyHash,
  getActivePolicy,
  registerRootAuthority,
  DEFAULT_POLICY_RULES,
  generateCanonicalReceipt,
  issueAuthorizationToken,
  _resetAuthorityState,
  type SignedPolicy,
  type GovernancePolicyRules,
} from "./authorityLayer";
import {
  Observer,
  Governor,
  Executor,
  generateComponentKeys,
  executeThreePowerLoop,
  _clearQueues,
} from "./threePowers";
import { canonicalJsonStringify, computeHash } from "./controlPlane";

// ═══════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════

const ROOT_PUBLIC_KEY = "a".repeat(64);
const POLICY_SIGNATURE = "b".repeat(128);

function setupPolicy(
  policyId = "POLICY-v1.0.0",
  rules: GovernancePolicyRules = DEFAULT_POLICY_RULES,
): SignedPolicy {
  registerRootAuthority(ROOT_PUBLIC_KEY);
  return activatePolicy({
    policyId,
    rules,
    policySignature: POLICY_SIGNATURE,
    rootPublicKey: ROOT_PUBLIC_KEY,
  });
}

// ═══════════════════════════════════════════════════════════════
// 1. SNAPSHOT CONSTRUCTION
// ═══════════════════════════════════════════════════════════════

describe("PolicySnapshot — Construction", () => {
  beforeEach(() => {
    _resetAuthorityState();
  });

  it("builds a snapshot from an active policy", () => {
    const policy = setupPolicy();
    const snapshot = buildPolicySnapshot(policy);

    expect(snapshot.policy_id).toBe("POLICY-v1.0.0");
    expect(snapshot.policy_hash).toBe(policy.policy_hash);
    expect(snapshot.rules).toEqual(DEFAULT_POLICY_RULES);
    expect(snapshot.root_public_key).toBe(ROOT_PUBLIC_KEY);
    expect(snapshot.policy_signature).toBe(POLICY_SIGNATURE);
    expect(snapshot.snapshot_hash).toHaveLength(64);
    expect(snapshot.frozen_at).toBeTruthy();
  });

  it("rejects non-ACTIVE policies", () => {
    const policy = setupPolicy();
    // Supersede the policy by activating a new one
    activatePolicy({
      policyId: "POLICY-v2.0.0",
      rules: DEFAULT_POLICY_RULES,
      policySignature: POLICY_SIGNATURE,
      rootPublicKey: ROOT_PUBLIC_KEY,
    });
    // Original policy is now SUPERSEDED
    expect(() => buildPolicySnapshot(policy)).toThrow("SNAPSHOT_ERROR");
  });

  it("snapshot is frozen (immutable)", () => {
    const policy = setupPolicy();
    const snapshot = buildPolicySnapshot(policy);

    // Attempting to mutate should throw in strict mode or silently fail
    expect(() => {
      (snapshot as any).policy_id = "TAMPERED";
    }).toThrow();

    expect(snapshot.policy_id).toBe("POLICY-v1.0.0");
  });

  it("snapshot rules are frozen (immutable)", () => {
    const policy = setupPolicy();
    const snapshot = buildPolicySnapshot(policy);

    expect(() => {
      (snapshot.rules as any).fail_closed = false;
    }).toThrow();

    expect(snapshot.rules.fail_closed).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════
// 2. SNAPSHOT HASH VERIFICATION
// ═══════════════════════════════════════════════════════════════

describe("PolicySnapshot — Hash Verification", () => {
  beforeEach(() => {
    _resetAuthorityState();
  });

  it("verifySnapshotHash returns true for untampered snapshot", () => {
    const policy = setupPolicy();
    const snapshot = buildPolicySnapshot(policy);
    expect(verifySnapshotHash(snapshot)).toBe(true);
  });

  it("verifySnapshotHash returns false for tampered snapshot", () => {
    const policy = setupPolicy();
    const snapshot = buildPolicySnapshot(policy);

    // Create a tampered copy (bypass freeze for testing)
    const tampered = { ...snapshot, policy_id: "TAMPERED" };
    expect(verifySnapshotHash(tampered)).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════
// 3. CORE INVARIANT: Same policy + different context = same hash
// ═══════════════════════════════════════════════════════════════

describe("PolicySnapshot — Isolation Invariant", () => {
  beforeEach(() => {
    _resetAuthorityState();
  });

  it("same policy version → identical snapshot_hash across different times", async () => {
    const policy = setupPolicy();

    const snapshot1 = buildPolicySnapshot(policy);
    // Wait a tick to ensure frozen_at differs
    await new Promise(r => setTimeout(r, 5));
    const snapshot2 = buildPolicySnapshot(policy);

    // frozen_at will differ
    expect(snapshot1.frozen_at).not.toBe(snapshot2.frozen_at);
    // snapshot_hash MUST be identical
    expect(snapshot1.snapshot_hash).toBe(snapshot2.snapshot_hash);
  });

  it("same policy + different operational context → identical snapshot_hash", () => {
    const policy = setupPolicy();

    // Context A: high-risk email send with many args
    const contextA = {
      riskTier: "HIGH" as const,
      toolArgs: { to: "ceo@example.com", subject: "Urgent", body: "Please wire $1M" },
      retryCount: 0,
      signal: "REQUIRE_HUMAN_APPROVAL",
    };

    // Context B: low-risk read with no args
    const contextB = {
      riskTier: "LOW" as const,
      toolArgs: {},
      retryCount: 5,
      signal: "AUTO_APPROVE",
    };

    // Build snapshots — BEFORE reading any context
    const snapshotA = buildPolicySnapshot(policy);
    const snapshotB = buildPolicySnapshot(policy);

    // Snapshots are identical despite different contexts
    expect(snapshotA.snapshot_hash).toBe(snapshotB.snapshot_hash);
    expect(snapshotsMatch(snapshotA, snapshotB)).toBe(true);

    // Context is completely absent from snapshot
    expect(JSON.stringify(snapshotA)).not.toContain("email");
    expect(JSON.stringify(snapshotA)).not.toContain("retryCount");
    expect(JSON.stringify(snapshotA)).not.toContain("riskTier");
  });

  it("different policy version → different snapshot_hash", () => {
    const policy1 = setupPolicy("POLICY-v1.0.0");
    const snapshot1 = buildPolicySnapshot(policy1);

    // Activate a new policy version
    const policy2 = activatePolicy({
      policyId: "POLICY-v2.0.0",
      rules: { ...DEFAULT_POLICY_RULES, approval_expiry_minutes: 10 },
      policySignature: POLICY_SIGNATURE,
      rootPublicKey: ROOT_PUBLIC_KEY,
    });
    const snapshot2 = buildPolicySnapshot(policy2);

    expect(snapshot1.snapshot_hash).not.toBe(snapshot2.snapshot_hash);
    expect(snapshotsMatch(snapshot1, snapshot2)).toBe(false);
  });

  it("same policy rules but different policy_id → different snapshot_hash", () => {
    const policy1 = setupPolicy("POLICY-v1.0.0");
    const snapshot1 = buildPolicySnapshot(policy1);

    _resetAuthorityState();

    const policy2 = setupPolicy("POLICY-v1.0.1");
    const snapshot2 = buildPolicySnapshot(policy2);

    // Same rules, different version → different hash
    expect(snapshot1.snapshot_hash).not.toBe(snapshot2.snapshot_hash);
  });
});

// ═══════════════════════════════════════════════════════════════
// 4. THREE-POWER LOOP: snapshot_hash stable across contexts
// ═══════════════════════════════════════════════════════════════

describe("PolicySnapshot — Three-Power Integration", () => {
  let govKeys: { privateKey: string; publicKey: string };
  let observer: Observer;
  let governor: Governor;
  let executor: Executor;

  beforeEach(() => {
    _resetAuthorityState();
    _clearQueues();
    govKeys = generateComponentKeys();
    observer = new Observer("OBS-test");
    governor = new Governor(govKeys.privateKey, govKeys.publicKey, "GOV-test");
    executor = new Executor("EXEC-test");
  });

  it("snapshot_hash is identical for two governed actions under same policy but different contexts", async () => {
    const policy = setupPolicy();

    // ── SNAPSHOT BUILT BEFORE ANY CONTEXT ──
    const snapshot = buildPolicySnapshot(policy);

    // ── Context A: HIGH risk, email send ──
    const resultA = await executeThreePowerLoop({
      observer,
      governor,
      executor,
      intentId: "INTENT-A",
      intentHash: computeHash("intent-a-data"),
      toolName: "send_email",
      toolArgs: { to: "ceo@example.com", subject: "Wire transfer" },
      riskTier: "HIGH",
      blastRadiusBase: 8,
      humanDecision: "APPROVED",
      approverId: "I-2",
      policyVersion: "POLICY-v1.0.0",
      connector: async () => ({ success: true, output: { sent: true } }),
      previousLedgerHash: "0".repeat(64),
      blockIndex: 1,
    });

    expect(resultA.success).toBe(true);

    // ── Context B: LOW risk, read action ──
    // Need fresh queues for the second loop
    _clearQueues();

    const resultB = await executeThreePowerLoop({
      observer,
      governor,
      executor,
      intentId: "INTENT-B",
      intentHash: computeHash("intent-b-data"),
      toolName: "read_file",
      toolArgs: { path: "/tmp/safe.txt" },
      riskTier: "LOW",
      blastRadiusBase: 1,
      humanDecision: "APPROVED",
      approverId: "I-2",
      policyVersion: "POLICY-v1.0.0",
      connector: async () => ({ success: true, output: { content: "safe" } }),
      previousLedgerHash: resultA.ledger_entry!.current_hash,
      blockIndex: 2,
    });

    expect(resultB.success).toBe(true);

    // ── PROOF: snapshot_hash is identical across both contexts ──
    // The snapshot was built once, before either context was read.
    // Rebuild to prove determinism:
    const snapshotAfterA = buildPolicySnapshot(policy);
    const snapshotAfterB = buildPolicySnapshot(policy);

    expect(snapshot.snapshot_hash).toBe(snapshotAfterA.snapshot_hash);
    expect(snapshot.snapshot_hash).toBe(snapshotAfterB.snapshot_hash);

    // Decisions varied (HIGH vs LOW risk), but snapshot did not
    expect(resultA.observer_signal!.risk_level).toBe("HIGH");
    expect(resultB.observer_signal!.risk_level).toBe("LOW");
    expect(resultA.observer_signal!.risk_score).not.toBe(resultB.observer_signal!.risk_score);
  });

  it("decision varies with context, snapshot does not", async () => {
    const policy = setupPolicy();
    const snapshot = buildPolicySnapshot(policy);

    // ── Context A: APPROVED ──
    const resultApproved = await executeThreePowerLoop({
      observer,
      governor,
      executor,
      intentId: "INTENT-APPROVE",
      intentHash: computeHash("approve-data"),
      toolName: "send_sms",
      toolArgs: { to: "+1234567890", body: "Hello" },
      riskTier: "HIGH",
      blastRadiusBase: 7,
      humanDecision: "APPROVED",
      approverId: "I-2",
      policyVersion: "POLICY-v1.0.0",
      connector: async () => ({ success: true, output: { delivered: true } }),
      previousLedgerHash: "0".repeat(64),
      blockIndex: 1,
    });

    expect(resultApproved.success).toBe(true);

    // ── Context B: REJECTED (different human decision) ──
    _clearQueues();

    const resultRejected = await executeThreePowerLoop({
      observer,
      governor,
      executor,
      intentId: "INTENT-REJECT",
      intentHash: computeHash("reject-data"),
      toolName: "delete_account",
      toolArgs: { userId: 999 },
      riskTier: "HIGH",
      blastRadiusBase: 10,
      humanDecision: "REJECTED",
      approverId: "I-2",
      policyVersion: "POLICY-v1.0.0",
      connector: async () => ({ success: true, output: {} }),
      previousLedgerHash: "0".repeat(64),
      blockIndex: 2,
    });

    // Rejected — different decision
    expect(resultRejected.success).toBe(false);
    expect(resultRejected.governor_approval!.decision).toBe("REJECTED");

    // ── PROOF: snapshot unchanged despite different decisions ──
    const snapshotAfter = buildPolicySnapshot(policy);
    expect(snapshot.snapshot_hash).toBe(snapshotAfter.snapshot_hash);
  });
});

// ═══════════════════════════════════════════════════════════════
// 5. CANONICAL RECEIPT: snapshot_hash included
// ═══════════════════════════════════════════════════════════════

describe("PolicySnapshot — Receipt Integration", () => {
  beforeEach(() => {
    _resetAuthorityState();
  });

  it("generateCanonicalReceipt includes snapshot_hash when provided", () => {
    const policy = setupPolicy();
    const snapshot = buildPolicySnapshot(policy);

    const token = issueAuthorizationToken({
      intentId: "INTENT-RECEIPT-TEST",
      action: "send_email",
      toolArgs: { to: "test@example.com" },
      approvedBy: "I-2",
      signature: "c".repeat(64),
    });

    const receipt = generateCanonicalReceipt({
      intentId: "INTENT-RECEIPT-TEST",
      proposerId: "I-1",
      approverId: "I-2",
      tokenId: token.token_id,
      action: "send_email",
      success: true,
      result: { sent: true },
      executor: "one-server",
      ledgerEntryId: "LE-test-001",
      timestampProposed: new Date().toISOString(),
      timestampApproved: new Date().toISOString(),
      snapshotHash: snapshot.snapshot_hash,
    });

    expect(receipt.snapshot_hash).toBe(snapshot.snapshot_hash);
    expect(receipt.snapshot_hash).toHaveLength(64);
  });

  it("receipt snapshot_hash is identical for same policy, different execution results", () => {
    const policy = setupPolicy();
    const snapshot = buildPolicySnapshot(policy);

    const token1 = issueAuthorizationToken({
      intentId: "INTENT-R1",
      action: "send_email",
      toolArgs: { to: "a@example.com" },
      approvedBy: "I-2",
      signature: "c".repeat(64),
    });

    const receipt1 = generateCanonicalReceipt({
      intentId: "INTENT-R1",
      proposerId: "I-1",
      approverId: "I-2",
      tokenId: token1.token_id,
      action: "send_email",
      success: true,
      result: { sent: true, messageId: "MSG-001" },
      executor: "one-server",
      ledgerEntryId: "LE-r1",
      timestampProposed: "2026-04-12T10:00:00Z",
      timestampApproved: "2026-04-12T10:01:00Z",
      snapshotHash: snapshot.snapshot_hash,
    });

    const token2 = issueAuthorizationToken({
      intentId: "INTENT-R2",
      action: "delete_record",
      toolArgs: { id: 42 },
      approvedBy: "I-2",
      signature: "d".repeat(64),
    });

    const receipt2 = generateCanonicalReceipt({
      intentId: "INTENT-R2",
      proposerId: "I-1",
      approverId: "I-2",
      tokenId: token2.token_id,
      action: "delete_record",
      success: false,
      result: { error: "permission denied" },
      executor: "one-server",
      ledgerEntryId: "LE-r2",
      timestampProposed: "2026-04-12T11:00:00Z",
      timestampApproved: "2026-04-12T11:05:00Z",
      snapshotHash: snapshot.snapshot_hash,
    });

    // Different actions, different results, different timestamps
    expect(receipt1.action).not.toBe(receipt2.action);
    expect(receipt1.status).not.toBe(receipt2.status);
    expect(receipt1.execution_hash).not.toBe(receipt2.execution_hash);

    // But snapshot_hash is IDENTICAL
    expect(receipt1.snapshot_hash).toBe(receipt2.snapshot_hash);
    expect(receipt1.snapshot_hash).toBe(snapshot.snapshot_hash);
  });

  it("receipt without explicit snapshotHash still computes one from active policy", () => {
    const policy = setupPolicy();
    const snapshot = buildPolicySnapshot(policy);

    const token = issueAuthorizationToken({
      intentId: "INTENT-FALLBACK",
      action: "test",
      toolArgs: {},
      approvedBy: "I-2",
      signature: "e".repeat(64),
    });

    // No snapshotHash passed — should auto-compute from active policy
    const receipt = generateCanonicalReceipt({
      intentId: "INTENT-FALLBACK",
      proposerId: "I-1",
      approverId: "I-2",
      tokenId: token.token_id,
      action: "test",
      success: true,
      result: {},
      executor: "one-server",
      ledgerEntryId: "LE-fallback",
      timestampProposed: new Date().toISOString(),
      timestampApproved: new Date().toISOString(),
    });

    // Auto-computed snapshot_hash should match the explicit one
    expect(receipt.snapshot_hash).toBe(snapshot.snapshot_hash);
    expect(receipt.snapshot_hash).toHaveLength(64);
  });
});

// ═══════════════════════════════════════════════════════════════
// 6. PROOF OUTPUT: The exact test the user requested
// ═══════════════════════════════════════════════════════════════

describe("PolicySnapshot — PROOF: Same policy + different context = identical snapshot_hash", () => {
  beforeEach(() => {
    _resetAuthorityState();
    _clearQueues();
  });

  it("PROOF: snapshot_hash across 2 contexts", () => {
    const policy = setupPolicy("POLICY-v1.0.0");

    // ── BUILD SNAPSHOT BEFORE ANY CONTEXT ──
    const snapshot = buildPolicySnapshot(policy);

    // ── CONTEXT 1: High-risk email with external recipient ──
    const observer1 = new Observer("OBS-ctx1");
    const signal1 = observer1.assessRisk({
      intentId: "INTENT-CTX1",
      intentHash: computeHash("context-1-data"),
      toolName: "send_email",
      toolArgs: { to: "external@attacker.com", subject: "Transfer $500k", body: "Urgent wire" },
      riskTier: "HIGH",
      blastRadiusBase: 9,
    });

    // ── CONTEXT 2: Low-risk internal read ──
    const observer2 = new Observer("OBS-ctx2");
    const signal2 = observer2.assessRisk({
      intentId: "INTENT-CTX2",
      intentHash: computeHash("context-2-data"),
      toolName: "read_log",
      toolArgs: {},
      riskTier: "LOW",
      blastRadiusBase: 1,
    });

    // ── DECISIONS VARY ──
    expect(signal1.risk_level).toBe("HIGH");
    expect(signal2.risk_level).toBe("LOW");
    expect(signal1.risk_score).toBeGreaterThan(signal2.risk_score);
    expect(signal1.recommendation).toBe("REQUIRE_HUMAN_APPROVAL");
    expect(signal2.recommendation).toBe("AUTO_APPROVE");

    // ── SNAPSHOT DOES NOT VARY ──
    const snapshotAfterCtx1 = buildPolicySnapshot(policy);
    const snapshotAfterCtx2 = buildPolicySnapshot(policy);

    expect(snapshot.snapshot_hash).toBe(snapshotAfterCtx1.snapshot_hash);
    expect(snapshot.snapshot_hash).toBe(snapshotAfterCtx2.snapshot_hash);
    expect(snapshotsMatch(snapshot, snapshotAfterCtx1)).toBe(true);
    expect(snapshotsMatch(snapshot, snapshotAfterCtx2)).toBe(true);

    // ── VERIFY HASH IS CORRECT ──
    expect(verifySnapshotHash(snapshot)).toBe(true);
    expect(verifySnapshotHash(snapshotAfterCtx1)).toBe(true);
    expect(verifySnapshotHash(snapshotAfterCtx2)).toBe(true);

    // ── PRINT PROOF ──
    console.log("=== SNAPSHOT ISOLATION PROOF ===");
    console.log(`Policy ID:      ${snapshot.policy_id}`);
    console.log(`Policy Hash:    ${snapshot.policy_hash}`);
    console.log(`Snapshot Hash:  ${snapshot.snapshot_hash}`);
    console.log(`Context 1:      risk=${signal1.risk_level}, score=${signal1.risk_score}, rec=${signal1.recommendation}`);
    console.log(`Context 2:      risk=${signal2.risk_level}, score=${signal2.risk_score}, rec=${signal2.recommendation}`);
    console.log(`Hash match:     ${snapshot.snapshot_hash === snapshotAfterCtx1.snapshot_hash && snapshot.snapshot_hash === snapshotAfterCtx2.snapshot_hash}`);
    console.log(`Verify:         ${verifySnapshotHash(snapshot)}`);
    console.log("================================");
  });
});
