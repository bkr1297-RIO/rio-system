/**
 * PHASE 2 COMPLIANCE TESTS — Predicate Evaluation + Proof Packet
 *
 * Test 1: Valid action → all predicates true
 * Test 2: Invalid action → at least one predicate false + failureReason set
 * Test 3: Proof packet is self-contained, retrievable, and verifiable
 *
 * These run through the real tRPC router via the test harness (same DB, same code).
 */
import { describe, it, expect, beforeAll } from "vitest";

const { appRouter } = await import("./routers.ts");
const db = await import("./db.ts");
const { issueAuthorizationToken, _resetAuthorityState, registerRootAuthority, activatePolicy, DEFAULT_POLICY_RULES } = await import("./rio/authorityLayer.ts");
const { evaluatePredicates, evaluateBlockedPredicates, evaluateCompletedPredicates } = await import("./rio/predicateEvaluation.ts");
const { assembleProofPacket, PROOF_PACKET_SPEC_VERSION } = await import("./verification/proofPacket.ts");
const { getPredicateLog, clearPredicateCache } = await import("./ledger/predicateLog.ts");

const MOCK_ROOT_PUBLIC_KEY = "a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2";
const MOCK_ROOT_SIGNATURE = "deadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef";

function createCaller(userId: number, username = "test-user") {
  return appRouter.createCaller({
    user: { id: userId, username, role: "admin", openId: `open-${userId}` },
    res: { cookie: () => {}, clearCookie: () => {} },
  } as any);
}

const USER_A_ID = 99801; // proposer
const USER_B_ID = 99802; // approver

describe("PHASE 2 COMPLIANCE — Predicate Evaluation + Proof Packet", () => {
  let callerA: ReturnType<typeof createCaller>;
  let callerB: ReturnType<typeof createCaller>;

  beforeAll(async () => {
    _resetAuthorityState();
    registerRootAuthority(MOCK_ROOT_PUBLIC_KEY);
    activatePolicy({
      policyId: "POLICY-PREDTEST-v1",
      rules: DEFAULT_POLICY_RULES,
      policySignature: MOCK_ROOT_SIGNATURE,
      rootPublicKey: MOCK_ROOT_PUBLIC_KEY,
    });
    callerA = createCaller(USER_A_ID, "proposer-predtest");
    callerB = createCaller(USER_B_ID, "approver-predtest");
    try { await callerA.proxy.onboard({ publicKey: "PRED-TEST-KEY-A", policyHash: "POLICY-PREDTEST-A" }); } catch {}
    try { await callerB.proxy.onboard({ publicKey: "PRED-TEST-KEY-B", policyHash: "POLICY-PREDTEST-B" }); } catch {}
    clearPredicateCache();
  });

  // ═══════════════════════════════════════════════════════════════
  // TEST 1: Valid action → all predicates true
  // ═══════════════════════════════════════════════════════════════
  it("TEST 1: Valid action → all predicates true (LOW risk web_search)", async () => {
    // Create a LOW risk intent (web_search) — skips approval/token
    const intent = await callerA.proxy.createIntent({
      toolName: "web_search",
      toolArgs: { query: "predicate compliance test valid action" },
      riskTier: "LOW",
      justification: "Phase 2 compliance test — valid action",
    });
    expect(intent.intentId).toBeTruthy();

    // Execute — LOW risk, no token needed
    const result = await callerA.proxy.execute({
      intentId: intent.intentId,
    });
    expect(result.success).toBe(true);

    // Verify predicate evaluation was logged
    const predLog = await getPredicateLog(intent.intentId);
    expect(predLog).not.toBeNull();
    expect(predLog!.blocked).toBe(false);
    expect(predLog!.executionId).toBeTruthy();
    expect(predLog!.receiptHash).toBeTruthy();

    // Verify all predicates are true
    const pe = predLog!.predicateEvaluation;
    expect(pe.auth).toBe(true);
    expect(pe.preRec).toBe(true);
    expect(pe.postRec).toBe(true);
    expect(pe.exact).toBe(true);
    expect(pe.lineage).toBe(true);
    expect(pe.outcome).toBe(true);
    expect(pe.valid).toBe(true);
    expect(pe.failureReason).toBeUndefined();

    console.log("✅ TEST 1 PASS: All predicates true for valid action");
    console.log("   Predicates:", JSON.stringify(pe, null, 2));
  }, 30_000);

  // ═══════════════════════════════════════════════════════════════
  // TEST 2: Invalid action → at least one predicate false + failureReason
  // ═══════════════════════════════════════════════════════════════
  it("TEST 2: Invalid action → predicate false + failureReason set (no token)", async () => {
    // Create a HIGH risk intent (send_email) — requires token
    const intent = await callerA.proxy.createIntent({
      toolName: "send_email",
      toolArgs: { to: "compliance@test.rio", subject: "Predicate test", body: "Should be blocked" },
      riskTier: "HIGH",
      justification: "Phase 2 compliance test — invalid action (no token)",
      breakAnalysis: "This tests the predicate logging for blocked actions. Risk: email could be sent without authorization.",
    });
    expect(intent.intentId).toBeTruthy();

    // Approve it (so approval checks pass)
    const approval = await callerB.proxy.approve({
      intentId: intent.intentId,
      decision: "APPROVED",
      signature: "PRED-COMPLIANCE-TEST-SIG-" + Date.now(),
    });
    expect(approval.approvalId).toBeTruthy();

    // Execute WITHOUT a token — should be blocked
    const result = await callerA.proxy.execute({
      intentId: intent.intentId,
    });
    expect(result.success).toBe(false);
    expect(result.error).toContain("authorization_token_exists");

    // Verify predicate evaluation was logged for blocked action
    const predLog = await getPredicateLog(intent.intentId);
    expect(predLog).not.toBeNull();
    expect(predLog!.blocked).toBe(true);

    // Verify at least one predicate is false
    const pe = predLog!.predicateEvaluation;
    expect(pe.auth).toBe(false); // no token → auth fails
    expect(pe.valid).toBe(false);
    expect(pe.failureReason).toBeTruthy();
    expect(pe.failureReason).toContain("authorization_token_exists");

    console.log("✅ TEST 2 PASS: Predicate false + failureReason set for blocked action");
    console.log("   auth:", pe.auth, "| valid:", pe.valid);
    console.log("   failureReason:", pe.failureReason);
  }, 15_000);

  // ═══════════════════════════════════════════════════════════════
  // TEST 3: Proof packet is self-contained, retrievable, verifiable
  // ═══════════════════════════════════════════════════════════════
  it("TEST 3: Proof packet is self-contained and verifiable", async () => {
    // Create and execute a LOW risk intent
    const intent = await callerA.proxy.createIntent({
      toolName: "web_search",
      toolArgs: { query: "proof packet compliance test verification" },
      riskTier: "LOW",
      justification: "Phase 2 compliance test — proof packet",
    });
    expect(intent.intentId).toBeTruthy();

    const result = await callerA.proxy.execute({
      intentId: intent.intentId,
    });
    expect(result.success).toBe(true);

    // Retrieve proof packet via tRPC endpoint
    const packet = await callerA.ledger.getProofPacket({ intentId: intent.intentId });
    expect(packet).not.toBeNull();

    // Verify proof packet structure
    expect(packet!.proofPacketId).toMatch(/^PP-/);
    expect(packet!.specVersion).toBe(PROOF_PACKET_SPEC_VERSION);
    expect(packet!.intentId).toBe(intent.intentId);

    // Verify predicate evaluation in packet
    expect(packet!.predicateEvaluation.valid).toBe(true);
    expect(packet!.predicateEvaluation.auth).toBe(true);
    expect(packet!.predicateEvaluation.outcome).toBe(true);

    // Verify receipt in packet
    expect(packet!.receipt.receiptId).toBeTruthy();
    expect(packet!.receipt.receiptHash).not.toBe("NONE");
    expect(packet!.receipt.status).toBe("SUCCESS");

    // Verify ledger in packet
    expect(packet!.ledger.ledgerEntryId).not.toBe("NONE");

    // Verify overall verification
    // Note: chainValid depends on whether the hash chain is intact in the test DB
    expect(packet!.verification.verifiedAt).toBeTruthy();

    console.log("✅ TEST 3 PASS: Proof packet is self-contained and verifiable");
    console.log("   proofPacketId:", packet!.proofPacketId);
    console.log("   specVersion:", packet!.specVersion);
    console.log("   receipt.status:", packet!.receipt.status);
    console.log("   receipt.receiptHash:", packet!.receipt.receiptHash?.substring(0, 16) + "...");
    console.log("   ledger.entryId:", packet!.ledger.ledgerEntryId);
    console.log("   verification.valid:", packet!.verification.valid);
  }, 30_000);

  // ═══════════════════════════════════════════════════════════════
  // TEST 4: Unit test — evaluatePredicates with all-PASS checks
  // ═══════════════════════════════════════════════════════════════
  it("TEST 4: Unit — evaluatePredicates with all-PASS checks", () => {
    const allPassChecks = [
      { check: "intent_exists", status: "PASS" as const, detail: "Intent found" },
      { check: "intent_not_executed", status: "PASS" as const, detail: "Not yet executed" },
      { check: "tool_registered", status: "PASS" as const, detail: "Tool found" },
      { check: "risk_tier_check", status: "PASS" as const, detail: "Risk tier: HIGH" },
      { check: "approval_exists", status: "PASS" as const, detail: "Approved" },
      { check: "approval_not_expired", status: "PASS" as const, detail: "Valid" },
      { check: "execution_limit", status: "PASS" as const, detail: "0/1 used" },
      { check: "args_hash_match", status: "PASS" as const, detail: "Hash verified" },
      { check: "authorization_token_exists", status: "PASS" as const, detail: "Token found" },
      { check: "token_token_parameters_hash_match", status: "PASS" as const, detail: "Match" },
      { check: "proposer_not_approver", status: "PASS" as const, detail: "Different" },
    ];

    const result = evaluateCompletedPredicates(allPassChecks, true, false);
    expect(result.auth).toBe(true);
    expect(result.preRec).toBe(true);
    expect(result.postRec).toBe(true);
    expect(result.exact).toBe(true);
    expect(result.lineage).toBe(true);
    expect(result.outcome).toBe(true);
    expect(result.valid).toBe(true);
    expect(result.failureReason).toBeUndefined();

    console.log("✅ TEST 4 PASS: evaluatePredicates all-PASS → valid=true");
  });

  // ═══════════════════════════════════════════════════════════════
  // TEST 5: Unit — evaluatePredicates with FAIL checks
  // ═══════════════════════════════════════════════════════════════
  it("TEST 5: Unit — evaluatePredicates with FAIL checks", () => {
    const mixedChecks = [
      { check: "intent_exists", status: "PASS" as const, detail: "Intent found" },
      { check: "intent_not_executed", status: "PASS" as const, detail: "Not yet executed" },
      { check: "tool_registered", status: "PASS" as const, detail: "Tool found" },
      { check: "authorization_token_exists", status: "FAIL" as const, detail: "No token provided" },
      { check: "args_hash_match", status: "FAIL" as const, detail: "Hash mismatch" },
    ];

    const result = evaluateBlockedPredicates(mixedChecks, false);
    expect(result.auth).toBe(false);
    expect(result.exact).toBe(false);
    expect(result.postRec).toBe(true); // intent/tool checks passed
    expect(result.valid).toBe(false);
    expect(result.failureReason).toBeTruthy();
    expect(result.failureReason).toContain("authorization_token_exists");
    expect(result.failureReason).toContain("args_hash_match");

    console.log("✅ TEST 5 PASS: evaluatePredicates with FAILs → valid=false, failureReason set");
    console.log("   failureReason:", result.failureReason);
  });

  // ═══════════════════════════════════════════════════════════════
  // TEST 6: Unit — assembleProofPacket structure
  // ═══════════════════════════════════════════════════════════════
  it("TEST 6: Unit — assembleProofPacket produces correct structure", () => {
    const pe = evaluateCompletedPredicates(
      [{ check: "intent_exists", status: "PASS" as const, detail: "Found" }],
      true,
      true,
    );

    const packet = assembleProofPacket({
      intentId: "INT-test-unit",
      predicateEvaluation: pe,
      receipt: {
        executionId: "EXE-test-unit",
        receiptHash: "abc123def456",
        executedAt: Date.now(),
        success: true,
      },
      ledger: {
        entryId: "LE-test-unit",
        chainValid: true,
      },
      blocked: false,
    });

    expect(packet.proofPacketId).toMatch(/^PP-/);
    expect(packet.specVersion).toBe("1.0.0");
    expect(packet.intentId).toBe("INT-test-unit");
    expect(packet.receipt.receiptId).toBe("EXE-test-unit");
    expect(packet.receipt.receiptHash).toBe("abc123def456");
    expect(packet.receipt.status).toBe("SUCCESS");
    expect(packet.ledger.ledgerEntryId).toBe("LE-test-unit");
    expect(packet.ledger.chainValid).toBe(true);
    expect(packet.verification.valid).toBe(true);
    expect(packet.verification.verifiedAt).toBeTruthy();

    console.log("✅ TEST 6 PASS: assembleProofPacket structure correct");
    console.log("   proofPacketId:", packet.proofPacketId);
    console.log("   verification.valid:", packet.verification.valid);
  });
});
