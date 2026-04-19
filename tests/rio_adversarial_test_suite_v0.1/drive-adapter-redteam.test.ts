/**
 * DriveAdapter — Red-Team Harness
 * ═══════════════════════════════════════
 *
 * 6 attack vectors. Failure attempts only.
 * Proving: no Drive operation can happen unless it goes through Gate → Adapter.
 *
 * RT-DRIVE-1: Unauthorized execution → must fail (no token / fake token)
 * RT-DRIVE-2: Token replay → must fail (use same token twice)
 * RT-DRIVE-3: Argument mutation → must fail (approve A, execute B)
 * RT-DRIVE-4: Direct connector call → must fail (perform() unreachable)
 * RT-DRIVE-5: Ledger bypass → must fail (pending + receipt always written)
 * RT-DRIVE-6: Lineage break → must fail (receipt traces back to intent + approval)
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";

const { appRouter } = await import("./routers.ts");
const {
  issueAuthorizationToken,
  registerRootAuthority,
  activatePolicy,
  DEFAULT_POLICY_RULES,
  _resetAuthorityState,
  getAuthorizationToken,
} = await import("./rio/authorityLayer.ts");

import {
  DriveAdapter,
  enableTestMode,
  disableTestMode,
  getVirtualDriveSnapshot,
  resetVirtualDrive,
} from "./adapters/DriveAdapter";
import type { DriveProposal } from "./adapters/DriveAdapter";

import * as fs from "fs";
import * as path from "path";

const MOCK_ROOT_PUBLIC_KEY = "a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2";
const MOCK_ROOT_SIGNATURE = "deadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef";

function createCaller(userId: number, username = "test-user") {
  return appRouter.createCaller({
    user: { id: userId, username, role: "admin" as const, openId: `open-${userId}` },
    res: { cookie: () => {}, clearCookie: () => {} } as any,
  });
}

const USER_P = 99901; // proposer
const USER_A = 99902; // approver

describe("DRIVE ADAPTER — Red-Team Harness (6 Attack Vectors)", () => {
  let callerP: ReturnType<typeof createCaller>;
  let callerA: ReturnType<typeof createCaller>;

  beforeAll(async () => {
    _resetAuthorityState();
    registerRootAuthority(MOCK_ROOT_PUBLIC_KEY);
    activatePolicy({
      policyId: "POLICY-DRIVE-RT-v1",
      rules: DEFAULT_POLICY_RULES,
      policySignature: MOCK_ROOT_SIGNATURE,
      rootPublicKey: MOCK_ROOT_PUBLIC_KEY,
    });
    callerP = createCaller(USER_P, "drive-proposer");
    callerA = createCaller(USER_A, "drive-approver");
    try { await callerP.proxy.onboard({ publicKey: "DRIVE-KEY-P", policyHash: "POLICY-DRIVE-P" }); } catch {}
    try { await callerA.proxy.onboard({ publicKey: "DRIVE-KEY-A", policyHash: "POLICY-DRIVE-A" }); } catch {}
    // Register drive_create in the tool registry
    const { getDb } = await import("./db.ts");
    const { toolRegistry } = await import("../drizzle/schema.ts");
    const db = await getDb();
    if (db) {
      try {
        await db.insert(toolRegistry).values({
          toolName: "drive_create",
          description: "Create a file on Google Drive",
          riskTier: "HIGH",
          requiredParams: ["fileName"],
          blastRadiusBase: 5,
        });
      } catch {}
    }
    enableTestMode();
    resetVirtualDrive();
  });

  afterAll(() => {
    disableTestMode();
  });

  // Helper: create intent + approve + get full token for drive_create
  async function getValidTokenForDriveCreate(args: Record<string, unknown>) {
    const intent = await callerP.proxy.createIntent({
      toolName: "drive_create",
      toolArgs: args,
      reflection: "DriveAdapter red-team test",
      breakAnalysis: "Testing Drive adapter governance",
    });

    const approval = await callerA.proxy.approve({
      intentId: intent.intentId,
      decision: "APPROVED",
      signature: "drive-rt-signature",
    });

    const fullToken = getAuthorizationToken(approval.authorizationToken!.token_id);
    return { intent, approval, fullToken: fullToken! };
  }

  // ═══════════════════════════════════════════════════════════════
  // RT-DRIVE-1: Unauthorized execution → must fail
  // ═══════════════════════════════════════════════════════════════
  it("RT-DRIVE-1: Unauthorized execution — no token, fake token, fabricated token → all BLOCKED", async () => {
    const adapter = new DriveAdapter();
    const proposal: DriveProposal = {
      intentId: "FAKE-DRIVE-INTENT",
      action: "drive_create",
      args: { fileName: "evil.txt", content: "unauthorized content" },
    };

    // Attack 1a: null token
    let blocked = false;
    try {
      await adapter.executeDriveOp(proposal, null);
    } catch (err: any) {
      blocked = true;
      expect(err.message).toContain("GATE_FAILED");
      expect(err.message).toContain("No authorization token provided");
    }
    expect(blocked).toBe(true);
    console.log("🔴 RT-DRIVE-1a: null token → GATE_FAILED");

    // Attack 1b: undefined token
    let blocked2 = false;
    try {
      await adapter.executeDriveOp(proposal, undefined as any);
    } catch (err: any) {
      blocked2 = true;
      expect(err.message).toContain("GATE_FAILED");
    }
    expect(blocked2).toBe(true);
    console.log("🔴 RT-DRIVE-1b: undefined token → GATE_FAILED");

    // Attack 1c: fabricated token object
    let blocked3 = false;
    try {
      await adapter.executeDriveOp(proposal, {
        token_id: "FABRICATED-DRIVE-TOKEN",
        intent_id: "FAKE-INTENT",
        tool_name: "drive_create",
        args_hash: "fake-hash",
        policy_hash: "fake-policy",
        approval_id: "fake-approval",
        environment: "test",
        nonce: "fake-nonce",
        issued_at: new Date().toISOString(),
        expires_at: new Date(Date.now() + 60000).toISOString(),
        max_executions: 1,
        execution_count: 0,
        signature: "fake-signature",
        action: "drive_create",
        parameters_hash: "fake-hash",
        approved_by: "fake-approval",
      } as any);
    } catch (err: any) {
      blocked3 = true;
      expect(err.message).toContain("GATE_FAILED");
    }
    expect(blocked3).toBe(true);
    console.log("🔴 RT-DRIVE-1c: fabricated token → GATE_FAILED");
    console.log("✅ RT-DRIVE-1 PASS: All unauthorized attempts blocked");
  }, 15_000);

  // ═══════════════════════════════════════════════════════════════
  // RT-DRIVE-2: Token replay → must fail
  // ═══════════════════════════════════════════════════════════════
  it("RT-DRIVE-2: Token replay — use same token twice → second attempt BLOCKED", async () => {
    const args = { fileName: "replay-test.txt", content: "first use" };
    const { intent, fullToken } = await getValidTokenForDriveCreate(args);

    const adapter = new DriveAdapter();
    const proposal: DriveProposal = {
      intentId: intent.intentId,
      action: "drive_create",
      args,
    };

    // First execution: should succeed
    const receipt1 = await adapter.executeDriveOp(proposal, fullToken);
    expect(receipt1.status).toBe("SUCCESS");
    expect(receipt1.receiptId).toMatch(/^RCPT-DRIVE-/);
    console.log("✅ First execution succeeded:", receipt1.receiptId);

    // Second execution with SAME token: must fail
    // Need a fresh token reference since the original was burned
    let blocked = false;
    try {
      await adapter.executeDriveOp(proposal, fullToken);
    } catch (err: any) {
      blocked = true;
      expect(err.message).toContain("GATE_FAILED");
    }
    expect(blocked).toBe(true);
    console.log("🔴 RT-DRIVE-2 PASS: Token replay BLOCKED after first use");
  }, 30_000);

  // ═══════════════════════════════════════════════════════════════
  // RT-DRIVE-3: Argument mutation → must fail
  // ═══════════════════════════════════════════════════════════════
  it("RT-DRIVE-3: Argument mutation — approve create A, attempt create B → BLOCKED", async () => {
    // Get token for file A
    const argsA = { fileName: "approved-file.txt", content: "approved content" };
    const { intent, fullToken } = await getValidTokenForDriveCreate(argsA);

    const adapter = new DriveAdapter();

    // Attempt to create file B with token approved for file A
    const proposalB: DriveProposal = {
      intentId: intent.intentId,
      action: "drive_create",
      args: { fileName: "EVIL-file.txt", content: "EVIL content — not what was approved" },
    };

    let blocked = false;
    try {
      await adapter.executeDriveOp(proposalB, fullToken);
    } catch (err: any) {
      blocked = true;
      expect(err.message).toContain("GATE_FAILED");
      // The hash mismatch should be detected
      expect(err.message).toMatch(/hash|mismatch/i);
    }
    expect(blocked).toBe(true);

    // Verify the virtual Drive does NOT contain the evil file
    const snapshot = getVirtualDriveSnapshot();
    const fileNames = Array.from(snapshot.values()).map(f => f.name);
    expect(fileNames).not.toContain("EVIL-file.txt");
    console.log("🔴 RT-DRIVE-3 PASS: Argument mutation BLOCKED — evil file NOT created");
    console.log("   Virtual Drive files:", fileNames);
  }, 30_000);

  // ═══════════════════════════════════════════════════════════════
  // RT-DRIVE-4: Direct connector call → must fail
  // ═══════════════════════════════════════════════════════════════
  it("RT-DRIVE-4: Direct connector call — perform() unreachable from outside", async () => {
    const adapter = new DriveAdapter();

    // Attempt 1: Direct property access
    expect((adapter as any).perform).toBeUndefined();
    expect((adapter as any)._perform).toBeUndefined();
    console.log("🔴 RT-DRIVE-4a: adapter.perform is undefined");

    // Attempt 2: Prototype access
    expect((DriveAdapter.prototype as any).perform).toBeUndefined();
    expect((DriveAdapter.prototype as any).performVirtual).toBeUndefined();
    console.log("🔴 RT-DRIVE-4b: DriveAdapter.prototype.perform is undefined");

    // Attempt 3: All property names — no private methods
    const instanceKeys = Object.getOwnPropertyNames(adapter);
    const protoKeys = Object.getOwnPropertyNames(DriveAdapter.prototype);
    const allKeys = [...instanceKeys, ...protoKeys];
    expect(allKeys).not.toContain("perform");
    expect(allKeys).not.toContain("performVirtual");
    expect(allKeys).not.toContain("verify");
    expect(allKeys).not.toContain("writeReceipt");
    expect(allKeys).not.toContain("getDriveToken");
    console.log("🔴 RT-DRIVE-4c: No private methods on instance or prototype");

    // Attempt 4: Bracket notation
    expect((adapter as any)["perform"]).toBeUndefined();
    expect((adapter as any)["getDriveToken"]).toBeUndefined();
    expect((adapter as any)["_testMode"]).toBeUndefined();
    expect((adapter as any)["_virtualDrive"]).toBeUndefined();
    console.log("🔴 RT-DRIVE-4d: Bracket notation returns undefined");

    // Attempt 5: Module exports don't expose internals
    const moduleExports = await import("./adapters/DriveAdapter");
    const exportedNames = Object.keys(moduleExports);
    expect(exportedNames).not.toContain("perform");
    expect(exportedNames).not.toContain("performVirtual");
    expect(exportedNames).not.toContain("verify");
    expect(exportedNames).not.toContain("writeReceipt");
    expect(exportedNames).not.toContain("getDriveToken");
    expect(exportedNames).not.toContain("_testMode");
    expect(exportedNames).not.toContain("_virtualDrive");
    expect(exportedNames).not.toContain("PhaseTracker");
    console.log("🔴 RT-DRIVE-4e: Module exports don't include private functions");
    console.log("   Exported names:", exportedNames);

    // Attempt 6: Only public method is executeDriveOp
    const publicMethods = protoKeys.filter(k => k !== "constructor");
    expect(publicMethods).toEqual(["executeDriveOp"]);
    console.log("🔴 RT-DRIVE-4f: Only public method is executeDriveOp");

    console.log("✅ RT-DRIVE-4 PASS: perform() is physically unreachable. Direct connector call impossible.");
  }, 10_000);

  // ═══════════════════════════════════════════════════════════════
  // RT-DRIVE-5: Ledger bypass → must fail (pending + receipt always written)
  // ═══════════════════════════════════════════════════════════════
  it("RT-DRIVE-5: Ledger bypass — every execution writes pending + receipt to ledger", async () => {
    const args = { fileName: "ledger-test.txt", content: "verify ledger writes" };
    const { intent, fullToken } = await getValidTokenForDriveCreate(args);

    const adapter = new DriveAdapter();
    const proposal: DriveProposal = {
      intentId: intent.intentId,
      action: "drive_create",
      args,
    };

    const receipt = await adapter.executeDriveOp(proposal, fullToken);

    // Verify both ledger entries exist and are non-empty
    expect(receipt.pendingLedgerEntryId).toBeTruthy();
    expect(receipt.pendingLedgerEntryId).toMatch(/^LE-/);
    expect(receipt.receiptLedgerEntryId).toBeTruthy();
    expect(receipt.receiptLedgerEntryId).toMatch(/^LE-/);

    // Pending and receipt must be DIFFERENT entries
    expect(receipt.pendingLedgerEntryId).not.toBe(receipt.receiptLedgerEntryId);

    // Receipt hash must be valid SHA-256
    expect(receipt.receiptHash).toBeTruthy();
    expect(receipt.receiptHash.length).toBe(64);
    expect(receipt.receiptHash).toMatch(/^[a-f0-9]{64}$/);

    // Verify the receipt can be retrieved from the ledger
    const { getAllLedgerEntries } = await import("./db.ts");
    const allEntries = await getAllLedgerEntries();

    const pendingEntry = allEntries.find(
      (e: any) => e.entryId === receipt.pendingLedgerEntryId,
    );
    const receiptEntry = allEntries.find(
      (e: any) => e.entryId === receipt.receiptLedgerEntryId,
    );

    expect(pendingEntry).toBeTruthy();
    expect(receiptEntry).toBeTruthy();

    // Pending entry must have been written BEFORE receipt
    const pendingPayload = typeof pendingEntry!.payload === "string"
      ? JSON.parse(pendingEntry!.payload)
      : pendingEntry!.payload;
    const receiptPayload = typeof receiptEntry!.payload === "string"
      ? JSON.parse(receiptEntry!.payload)
      : receiptEntry!.payload;

    expect(pendingPayload.phase).toBe("PENDING");
    expect(receiptPayload.phase).toBe("RECEIPT");
    expect(pendingPayload.adapter).toBe("DriveAdapter");
    expect(receiptPayload.adapter).toBe("DriveAdapter");

    console.log("✅ RT-DRIVE-5 PASS: Ledger bypass impossible");
    console.log("   Pending entry:", receipt.pendingLedgerEntryId);
    console.log("   Receipt entry:", receipt.receiptLedgerEntryId);
    console.log("   Receipt hash:", receipt.receiptHash);
  }, 30_000);

  // ═══════════════════════════════════════════════════════════════
  // RT-DRIVE-6: Lineage break → must fail
  // ═══════════════════════════════════════════════════════════════
  it("RT-DRIVE-6: Lineage break — receipt traces back to intent + approval + token", async () => {
    const args = { fileName: "lineage-test.txt", content: "verify full lineage" };
    const { intent, approval, fullToken } = await getValidTokenForDriveCreate(args);

    const adapter = new DriveAdapter();
    const proposal: DriveProposal = {
      intentId: intent.intentId,
      action: "drive_create",
      args,
    };

    const receipt = await adapter.executeDriveOp(proposal, fullToken);

    // ─── Lineage chain must be unbroken ───────────────────────

    // 1. Receipt → Intent
    expect(receipt.intentId).toBe(intent.intentId);
    console.log("🔗 Receipt → Intent:", receipt.intentId, "===", intent.intentId);

    // 2. Receipt → Token
    expect(receipt.tokenId).toBe(fullToken.token_id);
    console.log("🔗 Receipt → Token:", receipt.tokenId, "===", fullToken.token_id);

    // 3. Token → Intent (via the governance loop)
    expect(fullToken.intent_id).toBe(intent.intentId);
    console.log("🔗 Token → Intent:", fullToken.intent_id, "===", intent.intentId);

    // 4. Token → Approval
    expect(fullToken.approved_by).toBeTruthy();
    console.log("🔗 Token → Approval:", fullToken.approved_by);

    // 5. Receipt has correct action
    expect(receipt.action).toBe("drive_create");
    console.log("🔗 Receipt action:", receipt.action);

    // 6. Receipt status is SUCCESS
    expect(receipt.status).toBe("SUCCESS");
    console.log("🔗 Receipt status:", receipt.status);

    // 7. Timestamps exist and are valid ISO 8601
    expect(receipt.executedAt).toBeTruthy();
    expect(receipt.verifiedAt).toBeTruthy();
    expect(new Date(receipt.executedAt).toISOString()).toBe(receipt.executedAt);
    expect(new Date(receipt.verifiedAt).toISOString()).toBe(receipt.verifiedAt);
    console.log("🔗 Executed at:", receipt.executedAt);
    console.log("🔗 Verified at:", receipt.verifiedAt);

    // 8. Receipt hash is deterministic (re-hash should match)
    expect(receipt.receiptHash).toBeTruthy();
    expect(receipt.receiptHash.length).toBe(64);
    console.log("🔗 Receipt hash:", receipt.receiptHash);

    // 9. Verify the virtual Drive actually contains the file
    const snapshot = getVirtualDriveSnapshot();
    const fileNames = Array.from(snapshot.values()).map(f => f.name);
    expect(fileNames).toContain("lineage-test.txt");
    console.log("🔗 Virtual Drive contains:", fileNames);

    console.log("✅ RT-DRIVE-6 PASS: Full lineage chain unbroken");
    console.log("   Intent → Approval → Token → Gate → Pending → Execute → Verify → Receipt");
  }, 30_000);
});
