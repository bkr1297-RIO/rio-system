// All tests validate: /specs/canonical/RIO_CANONICAL_SPEC_v1.0.md

import { describe, expect, it, vi, beforeAll } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";
import {
  registerRootAuthority,
  activatePolicy,
  DEFAULT_POLICY_RULES,
  _resetAuthorityState,
  getAuthorizationToken,
} from "./authorityLayer";

/**
 * CONFORMANCE TEST: Concurrency Race Condition
 * ─────────────────────────────────────────────
 * INVARIANT: Single-use token enforcement under concurrent execution.
 *
 * A token with max_executions: 1 must permit exactly one execution,
 * even when multiple execution requests arrive simultaneously.
 *
 * SETUP: Single send_email intent, approved, token issued (max_executions: 1).
 * TEST:  Fire 5 concurrent execute calls with the same token.
 * PASS:  Exactly 1 succeeds, exactly 4 fail, token is burned.
 * FAIL:  More than 1 succeeds (double-execution).
 */

const MOCK_ROOT_PUBLIC_KEY = "a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2";
const MOCK_ROOT_SIGNATURE = "deadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef";

// ─── In-memory mocks ───

vi.mock("./db", async (importOriginal) => {
  const actual = await importOriginal() as Record<string, unknown>;

  const proxyUsers = new Map<string, any>();
  const intents = new Map<string, any>();
  const approvals = new Map<string, any>();
  const executions = new Map<string, any>();
  const ledgerEntries: any[] = [];
  const tools = [
    { id: 1, toolName: "send_email", description: "Send an email", riskTier: "HIGH", requiredParams: JSON.stringify(["to", "subject", "body"]), blastRadiusBase: 7, enabled: 1 },
  ];

  let intentCounter = 0;
  let approvalCounter = 0;
  let executionCounter = 0;

  return {
    ...actual,
    getDb: vi.fn().mockResolvedValue({}),
    upsertUser: vi.fn().mockResolvedValue(undefined),
    getUserByOpenId: vi.fn().mockResolvedValue(undefined),
    sha256: (data: string) => require("crypto").createHash("sha256").update(data).digest("hex"),

    getProxyUser: vi.fn(async (userId: number) => proxyUsers.get(String(userId))),
    createProxyUser: vi.fn(async (userId: number, publicKey: string, policyHash: string) => {
      const user = {
        id: proxyUsers.size + 1, userId, publicKey, policyHash,
        seedVersion: "SEED-v1.0.0", status: "ACTIVE",
        onboardedAt: new Date(), killedAt: null, killReason: null,
      };
      proxyUsers.set(String(userId), user);
      return user;
    }),
    killProxyUser: vi.fn(async (userId: number, reason: string) => {
      const user = proxyUsers.get(String(userId));
      if (user) { user.status = "KILLED"; user.killReason = reason; user.killedAt = new Date(); }
    }),

    getToolByName: vi.fn(async (name: string) => tools.find(t => t.toolName === name)),
    getAllTools: vi.fn(async () => tools),

    createIntent: vi.fn(async (userId: number, toolName: string, toolArgs: Record<string, unknown>, riskTier: string, blastRadius: any, reflection?: string) => {
      intentCounter++;
      const argsHash = require("crypto").createHash("sha256").update(JSON.stringify({ toolName, toolArgs })).digest("hex");
      const intent = {
        id: intentCounter, intentId: `INT-CRC-${intentCounter}`, userId, toolName,
        toolArgs: JSON.stringify(toolArgs), riskTier, argsHash,
        blastRadius: JSON.stringify(blastRadius), reflection: reflection || null,
        sourceConversationId: null,
        status: riskTier === "LOW" ? "APPROVED" : "PENDING_APPROVAL",
        createdAt: new Date(),
      };
      intents.set(intent.intentId, intent);
      return intent;
    }),
    getIntent: vi.fn(async (intentId: string) => intents.get(intentId)),
    getUserIntents: vi.fn(async (userId: number) => Array.from(intents.values()).filter(i => i.userId === userId).slice(-20)),
    updateIntentStatus: vi.fn(async (intentId: string, status: string) => {
      const intent = intents.get(intentId);
      if (intent) intent.status = status;
    }),

    createApproval: vi.fn(async (intentId: string, userId: number, decision: string, signature: string, boundToolName: string, boundArgsHash: string, expiresAt: number, maxExecutions: number) => {
      approvalCounter++;
      const approval = {
        id: approvalCounter, approvalId: `APR-CRC-${approvalCounter}`, intentId, userId,
        decision, signature, boundToolName, boundArgsHash, expiresAt, maxExecutions,
        executionCount: 0, createdAt: new Date(),
      };
      approvals.set(approval.approvalId, approval);
      return approval;
    }),
    getApprovalForIntent: vi.fn(async (intentId: string) => {
      return Array.from(approvals.values()).find(a => a.intentId === intentId) || null;
    }),
    incrementApprovalExecution: vi.fn(async (approvalId: string) => {
      const a = approvals.get(approvalId);
      if (a) a.executionCount++;
    }),
    getUserApprovals: vi.fn(async () => Array.from(approvals.values()).slice(-10)),

    createExecution: vi.fn(async (intentId: string, approvalId: string | null, result: any, receiptHash: string, preflightResults: any) => {
      executionCounter++;
      const exec = {
        id: executionCounter, executionId: `EXE-CRC-${executionCounter}`, intentId, approvalId,
        result: JSON.stringify(result), receiptHash, receiptPayload: null,
        preflightResults: JSON.stringify(preflightResults), executedAt: new Date(),
      };
      executions.set(exec.executionId, exec);
      return exec;
    }),
    getExecution: vi.fn(async (executionId: string) => executions.get(executionId) || null),
    getExecutionByIntentId: vi.fn(async (intentId: string) => {
      return Array.from(executions.values()).find(e => e.intentId === intentId) || null;
    }),
    updateExecutionReceiptHash: vi.fn(async (executionId: string, receiptHash: string, receiptPayload?: string) => {
      const exec = executions.get(executionId);
      if (exec) { exec.receiptHash = receiptHash; if (receiptPayload) exec.receiptPayload = receiptPayload; }
    }),

    appendLedger: vi.fn(async (entryType: string, payload: any) => {
      const crypto = require("crypto");
      const prevHash = ledgerEntries.length > 0 ? ledgerEntries[ledgerEntries.length - 1].hash : "GENESIS";
      const entryId = `LED-CRC-${ledgerEntries.length + 1}`;
      const timestamp = Date.now();
      const hash = crypto.createHash("sha256").update(JSON.stringify({ entryId, entryType, payload, prevHash, timestamp })).digest("hex");
      const entry = { id: ledgerEntries.length + 1, entryId, entryType, payload: JSON.stringify(payload), hash, prevHash, timestamp: String(timestamp), createdAt: new Date() };
      ledgerEntries.push(entry);
      return entry;
    }),
    getLastLedgerEntry: vi.fn(async () => ledgerEntries.length > 0 ? ledgerEntries[ledgerEntries.length - 1] : null),
    getAllLedgerEntries: vi.fn(async () => [...ledgerEntries]),
    getLedgerEntriesSince: vi.fn(async () => [...ledgerEntries]),
    verifyHashChain: vi.fn(async () => ({ valid: true, entries: ledgerEntries.length, errors: [] })),

    createLearningEvent: vi.fn(async () => undefined),
    getUserLearningEvents: vi.fn(async () => []),
    getRecentLearningContext: vi.fn(async () => []),
    saveKeyBackup: vi.fn(), getKeyBackup: vi.fn().mockResolvedValue(null), deleteKeyBackup: vi.fn(),
    createConversation: vi.fn(), getConversation: vi.fn().mockResolvedValue(null),
    getUserConversations: vi.fn(async () => []), updateConversationMessages: vi.fn(),
    addIntentToConversation: vi.fn(), closeConversation: vi.fn(),
    getAllNodeConfigs: vi.fn(async () => []), getActiveNodeConfigs: vi.fn(async () => []),
    getNodeConfig: vi.fn().mockResolvedValue(null),

    getPrincipalByUserId: vi.fn(async (userId: number) => ({
      principalId: `PRI-CRC-${userId}`, userId,
      displayName: userId === 1 ? "Proposer" : "Approver",
      principalType: "human",
      roles: ["proposer", "approver", "executor", "auditor", "meta"],
      status: "active",
    })),
    getOrCreatePrincipal: vi.fn(async (userId: number) => ({
      principalId: `PRI-CRC-${userId}`, userId,
      displayName: userId === 1 ? "Proposer" : "Approver",
      principalType: "human",
      roles: ["proposer", "approver", "executor", "auditor", "meta"],
      status: "active",
    })),
    getPrincipalById: vi.fn(async () => null),
    listPrincipals: vi.fn(async () => []),
    assignRole: vi.fn(), removeRole: vi.fn(), updatePrincipalStatus: vi.fn(),
    principalHasRole: vi.fn(async () => true),

    createNotification: vi.fn(async () => undefined),
    getUserNotifications: vi.fn(async () => []),
    getUnreadNotificationCount: vi.fn(async () => 0),
    markNotificationRead: vi.fn(), markAllNotificationsRead: vi.fn(),

    getActivePolicyRulesForTool: vi.fn(async () => []),
    createPolicyRule: vi.fn(), getUserPolicyRules: vi.fn(async () => []),
    getAllPolicyRules: vi.fn(async () => []),
    updatePolicyRule: vi.fn(), deletePolicyRule: vi.fn(), togglePolicyRule: vi.fn(),
    getSystemComponents: vi.fn(async () => []), getSystemComponent: vi.fn(async () => null),
    expireStaleIntents: vi.fn(async () => 0),
    batchApproveIntents: vi.fn(async () => []),
    getApprovalMetrics: vi.fn(async () => ({ queueSize: 0, avgTimeToApprovalMs: 0, oldestPendingAgeMs: 0, totalApproved: 0, totalRejected: 0, totalExpired: 0 })),
  };
});

vi.mock("./connectors", async (importOriginal) => {
  const actual = await importOriginal() as Record<string, unknown>;
  return {
    ...actual,
    dispatchExecution: vi.fn(async (toolName: string) => {
      if (toolName === "send_email") {
        return {
          success: true,
          output: { messageId: `MSG-CRC-${Date.now()}`, status: "delivered" },
          metadata: { connector: "send_email", transport: "test" },
          executedAt: Date.now(),
        };
      }
      return { success: false, error: `NO_CONNECTOR: ${toolName}`, output: null, metadata: {}, executedAt: Date.now() };
    }),
  };
});

function createAuthContext(userId: number, openId: string, name: string): TrpcContext {
  return {
    user: {
      id: userId, openId, email: `${openId}@example.com`, name,
      loginMethod: "manus", role: "user",
      createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date(),
    },
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { clearCookie: vi.fn() } as unknown as TrpcContext["res"],
  };
}

// ═══════════════════════════════════════════════════════════════
// CONFORMANCE TEST: CONCURRENCY RACE CONDITION
// ═══════════════════════════════════════════════════════════════

describe("CONFORMANCE: Concurrency Race Condition", () => {
  const proposerCtx = createAuthContext(1, "proposer-crc", "Alice (Proposer)");
  const approverCtx = createAuthContext(2, "approver-crc", "Bob (Approver)");

  let intentId: string;
  let tokenId: string;

  beforeAll(() => {
    _resetAuthorityState();
    registerRootAuthority(MOCK_ROOT_PUBLIC_KEY);
    activatePolicy({
      policyId: "POLICY-CRC-v1.0.0",
      rules: DEFAULT_POLICY_RULES,
      policySignature: MOCK_ROOT_SIGNATURE,
      rootPublicKey: MOCK_ROOT_PUBLIC_KEY,
    });
  });

  it("SETUP: Onboard proposer", async () => {
    const caller = appRouter.createCaller(proposerCtx);
    const result = await caller.proxy.onboard({
      publicKey: "proposer-crc-key-001",
      policyHash: "crc-test-policy-hash",
    });
    expect(result.success).toBe(true);
  });

  it("STEP 1: Create and authorize send_email", async () => {
    const proposerCaller = appRouter.createCaller(proposerCtx);
    const approverCaller = appRouter.createCaller(approverCtx);

    // Create intent
    const intent = await proposerCaller.proxy.createIntent({
      toolName: "send_email",
      toolArgs: { to: "brian@example.com", subject: "Race Test", body: "Concurrency test." },
      breakAnalysis: "Testing concurrent execution of single-use token.",
    });
    expect(intent).toBeDefined();
    expect(intent!.status).toBe("PENDING_APPROVAL");
    intentId = intent!.intentId;

    // Approve
    const approval = await approverCaller.proxy.approve({
      intentId,
      decision: "APPROVED",
      signature: "crc-approver-signature-001",
      expiresInSeconds: 300,
      maxExecutions: 1,
    });
    expect(approval).toBeDefined();
    expect(approval!.decision).toBe("APPROVED");

    const authToken = (approval as any).authorizationToken;
    expect(authToken).toBeDefined();
    expect(authToken.token_id).toMatch(/^ATOK-/);
    expect(authToken.max_executions).toBe(1);
    tokenId = authToken.token_id;

    // Verify token exists in store
    const stored = getAuthorizationToken(tokenId);
    expect(stored).not.toBeNull();
    expect(stored!.execution_count).toBe(0);
  });

  it("STEP 2: Fire 5 concurrent execution requests with the same token", async () => {
    const N = 5;
    const caller = appRouter.createCaller(proposerCtx);

    // Fire all N requests simultaneously
    const promises = Array.from({ length: N }, () =>
      caller.proxy.execute({ intentId, tokenId })
    );

    const results = await Promise.allSettled(promises);

    // Classify outcomes
    const outcomes = results.map((r, i) => {
      if (r.status === "fulfilled") {
        return {
          request: i + 1,
          success: r.value.success,
          error: r.value.error ?? null,
          preflightResults: r.value.preflightResults ?? [],
        };
      } else {
        return {
          request: i + 1,
          success: false,
          error: r.reason?.message ?? "Promise rejected",
          preflightResults: [],
        };
      }
    });

    const successes = outcomes.filter(o => o.success);
    const failures = outcomes.filter(o => !o.success);

    // ═══ VERDICT ═══
    console.log("\n=== CONCURRENCY RACE CONDITION RESULTS ===");
    console.log(`Total requests: ${N}`);
    console.log(`Successes: ${successes.length}`);
    console.log(`Failures: ${failures.length}`);

    for (const o of outcomes) {
      console.log(`  Request ${o.request}: ${o.success ? "SUCCESS" : "BLOCKED"} — ${o.error || "executed"}`);
      if (!o.success && o.preflightResults.length > 0) {
        const failed = o.preflightResults.filter((c: any) => c.status === "FAIL");
        console.log(`    Failed checks: ${failed.map((c: any) => c.check).join(", ")}`);
      }
    }

    // Token should be burned
    const tokenAfter = getAuthorizationToken(tokenId);
    console.log(`Token after execution: ${tokenAfter ? "STILL EXISTS" : "BURNED"}`);

    // ASSERTIONS
    // Exactly 1 success
    expect(successes.length).toBe(1);

    // Exactly N-1 failures
    expect(failures.length).toBe(N - 1);

    // Token burned
    expect(tokenAfter).toBeNull();
  });
});
