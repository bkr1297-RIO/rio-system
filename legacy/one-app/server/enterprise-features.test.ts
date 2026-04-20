import { describe, it, expect, vi, beforeAll } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";
import {
  registerRootAuthority,
  activatePolicy,
  DEFAULT_POLICY_RULES,
  _resetAuthorityState,
} from "./authorityLayer";

/**
 * Enterprise Features Test Suite
 *
 * Tests for:
 * 1. Intent TTL / expiration
 * 2. Batch approval
 * 3. Expire stale intents
 * 4. Approval SLA metrics
 * 5. Versioned receipt schema (protocolVersion) — requires full token flow
 */

const MOCK_ROOT_PUBLIC_KEY = "a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2";
const MOCK_ROOT_SIGNATURE = "deadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef";

// Mock the db module with full in-memory state
vi.mock("./db", async (importOriginal) => {
  const actual = await importOriginal() as Record<string, unknown>;

  const proxyUsers = new Map<string, any>();
  const intents = new Map<string, any>();
  const approvals = new Map<string, any>();
  const executions = new Map<string, any>();
  const ledgerEntries: any[] = [];
  const learningEvents: any[] = [];
  const tools = [
    { id: 1, toolName: "echo", description: "Echo a message", riskTier: "LOW", requiredParams: JSON.stringify(["message"]), blastRadiusBase: 1, enabled: 1 },
    { id: 2, toolName: "send_email", description: "Send an email", riskTier: "HIGH", requiredParams: JSON.stringify(["to", "subject", "body"]), blastRadiusBase: 7, enabled: 1 },
    { id: 3, toolName: "send_sms", description: "Send a text", riskTier: "MEDIUM", requiredParams: JSON.stringify(["to", "message"]), blastRadiusBase: 5, enabled: 1 },
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

    createIntent: vi.fn(async (userId: number, toolName: string, toolArgs: Record<string, unknown>, riskTier: string, blastRadius: any, reflection?: string, expiresAt?: number | null) => {
      intentCounter++;
      const argsHash = require("crypto").createHash("sha256").update(JSON.stringify(toolArgs)).digest("hex");
      const intent = {
        id: intentCounter, intentId: `INT-ENT-${intentCounter}`, userId, toolName,
        toolArgs: JSON.stringify(toolArgs), riskTier, argsHash,
        blastRadius: JSON.stringify(blastRadius), reflection: reflection || null,
        sourceConversationId: null,
        status: riskTier === "LOW" ? "APPROVED" : "PENDING_APPROVAL",
        expiresAt: expiresAt ?? null, createdAt: new Date(),
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

    expireStaleIntents: vi.fn(async () => {
      let count = 0;
      const now = Date.now();
      for (const intent of intents.values()) {
        if (intent.status === "PENDING_APPROVAL" && intent.expiresAt && Number(intent.expiresAt) <= now) {
          intent.status = "EXPIRED";
          count++;
        }
      }
      return count;
    }),

    batchApproveIntents: vi.fn(async (intentIds: string[], userId: number, decision: string, signature: string, expiresAt: number, maxExecutions: number) => {
      const results: any[] = [];
      for (const intentId of intentIds) {
        const intent = intents.get(intentId);
        if (!intent || intent.status !== "PENDING_APPROVAL") continue;
        approvalCounter++;
        const approval = {
          id: approvalCounter, approvalId: `APR-ENT-${approvalCounter}`,
          intentId, userId, decision, signature,
          boundToolName: intent.toolName, boundArgsHash: intent.argsHash,
          expiresAt, maxExecutions, executionCount: 0, createdAt: new Date(),
        };
        approvals.set(approval.approvalId, approval);
        intent.status = decision;
        results.push({ approvalId: approval.approvalId, intentId });
      }
      return results;
    }),

    getApprovalMetrics: vi.fn(async (userId: number) => {
      const userIntents = Array.from(intents.values()).filter(i => i.userId === userId);
      const pending = userIntents.filter(i => i.status === "PENDING_APPROVAL");
      const approved = userIntents.filter(i => i.status === "APPROVED" || i.status === "EXECUTED");
      const rejected = userIntents.filter(i => i.status === "REJECTED");
      const expired = userIntents.filter(i => i.status === "EXPIRED");
      let avgTimeToApprovalMs = 0;
      const approvedWithTime = Array.from(approvals.values()).filter(a => a.userId === userId);
      if (approvedWithTime.length > 0) {
        const totalMs = approvedWithTime.reduce((sum: number, a: any) => {
          const intent = intents.get(a.intentId);
          if (!intent) return sum;
          return sum + (new Date(a.createdAt).getTime() - new Date(intent.createdAt).getTime());
        }, 0);
        avgTimeToApprovalMs = totalMs / approvedWithTime.length;
      }
      const oldestPending = pending.reduce((oldest: number, i: any) => {
        const age = Date.now() - new Date(i.createdAt).getTime();
        return age > oldest ? age : oldest;
      }, 0);
      return {
        queueSize: pending.length, totalApproved: approved.length,
        totalRejected: rejected.length, totalExpired: expired.length,
        avgTimeToApprovalMs, oldestPendingAgeMs: oldestPending,
      };
    }),

    createApproval: vi.fn(async (intentId: string, userId: number, decision: string, signature: string, boundToolName: string, boundArgsHash: string, expiresAt: number, maxExecutions: number) => {
      approvalCounter++;
      const approval = {
        id: approvalCounter, approvalId: `APR-ENT-${approvalCounter}`,
        intentId, userId, decision, signature, boundToolName, boundArgsHash,
        expiresAt, maxExecutions, executionCount: 0, createdAt: new Date(),
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
        id: executionCounter, executionId: `EXE-ENT-${executionCounter}`,
        intentId, approvalId, result: JSON.stringify(result), receiptHash,
        receiptPayload: null, preflightResults: JSON.stringify(preflightResults),
        executedAt: new Date(),
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
      const entryId = `LED-ENT-${ledgerEntries.length + 1}`;
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

    createLearningEvent: vi.fn(async (userId: number, eventId: string, eventType: string, data: any) => {
      learningEvents.push({ userId, eventId, eventType, ...data });
    }),
    getUserLearningEvents: vi.fn(async () => learningEvents),
    getRecentLearningContext: vi.fn(async () => []),
    saveKeyBackup: vi.fn(), getKeyBackup: vi.fn().mockResolvedValue(null), deleteKeyBackup: vi.fn(),
    createConversation: vi.fn(), getConversation: vi.fn().mockResolvedValue(null),
    getUserConversations: vi.fn(async () => []), updateConversationMessages: vi.fn(),
    addIntentToConversation: vi.fn(), closeConversation: vi.fn(),
    getAllNodeConfigs: vi.fn(async () => []), getActiveNodeConfigs: vi.fn(async () => []),
    getNodeConfig: vi.fn().mockResolvedValue(null),

    // Principal management
    getPrincipalByUserId: vi.fn(async (userId: number) => ({
      principalId: `PRI-ENT-${userId}`, userId,
      displayName: userId === 1 ? "Proposer" : "Approver",
      principalType: "human",
      roles: ["proposer", "approver", "executor", "auditor", "meta"],
      status: "active",
    })),
    getOrCreatePrincipal: vi.fn(async (userId: number) => ({
      principalId: `PRI-ENT-${userId}`, userId,
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
  };
});

// Mock connectors
vi.mock("./connectors", async (importOriginal) => {
  const actual = await importOriginal() as Record<string, unknown>;
  return {
    ...actual,
    dispatchExecution: vi.fn(async (toolName: string) => ({
      success: true,
      output: { messageId: "MSG-ENT-001", status: "delivered" },
      metadata: { connector: toolName, transport: "test" },
      executedAt: Date.now(),
    })),
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

describe("Enterprise Features", () => {
  const proposerCtx = createAuthContext(1, "ent-proposer", "Enterprise Proposer");
  const approverCtx = createAuthContext(2, "ent-approver", "Enterprise Approver");

  // Initialize authority layer
  beforeAll(() => {
    _resetAuthorityState();
    registerRootAuthority(MOCK_ROOT_PUBLIC_KEY);
    activatePolicy({
      policyId: "POLICY-ENT-v1.0.0",
      rules: DEFAULT_POLICY_RULES,
      policySignature: MOCK_ROOT_SIGNATURE,
      rootPublicKey: MOCK_ROOT_PUBLIC_KEY,
    });
  });

  // Setup: onboard proposer
  it("Setup: Onboard proposer", async () => {
    const caller = appRouter.createCaller(proposerCtx);
    const result = await caller.proxy.onboard({
      publicKey: "ent-test-public-key",
      policyHash: "ent-test-policy-hash",
    });
    expect(result.success).toBe(true);
    expect(result.proxyUser?.status).toBe("ACTIVE");
  });

  describe("Intent TTL / Expiration", () => {
    it("cannot approve an expired intent", async () => {
      const caller = appRouter.createCaller(proposerCtx);

      const intent = await caller.proxy.createIntent({
        toolName: "send_email",
        toolArgs: { to: "ttl@example.com", subject: "TTL Test", body: "This should expire" },
        breakAnalysis: "Testing TTL enforcement",
      });
      expect(intent).toBeDefined();
      expect(intent!.status).toBe("PENDING_APPROVAL");

      // Manually set expiresAt to the past to simulate expiration
      const { getIntent } = await import("./db");
      const storedIntent = await getIntent(intent!.intentId);
      if (storedIntent) {
        (storedIntent as any).expiresAt = Date.now() - 1000;
      }

      // Approver tries to approve — should fail with TTL error
      const approverCaller = appRouter.createCaller(approverCtx);
      await expect(
        approverCaller.proxy.approve({
          intentId: intent!.intentId,
          decision: "APPROVED",
          signature: "ttl-test-signature",
          expiresInSeconds: 300,
          maxExecutions: 1,
        })
      ).rejects.toThrow("Intent has expired");

      const updatedIntent = await getIntent(intent!.intentId);
      expect(updatedIntent!.status).toBe("EXPIRED");
    });
  });

  describe("Batch Approval", () => {
    it("approves multiple intents in a single call", async () => {
      const caller = appRouter.createCaller(proposerCtx);

      const intent1 = await caller.proxy.createIntent({
        toolName: "send_email",
        toolArgs: { to: "batch1@example.com", subject: "Batch 1", body: "First batch email" },
        breakAnalysis: "Batch test 1",
      });
      const intent2 = await caller.proxy.createIntent({
        toolName: "send_email",
        toolArgs: { to: "batch2@example.com", subject: "Batch 2", body: "Second batch email" },
        breakAnalysis: "Batch test 2",
      });
      const intent3 = await caller.proxy.createIntent({
        toolName: "send_email",
        toolArgs: { to: "batch3@example.com", subject: "Batch 3", body: "Third batch email" },
        breakAnalysis: "Batch test 3",
      });

      expect(intent1!.status).toBe("PENDING_APPROVAL");
      expect(intent2!.status).toBe("PENDING_APPROVAL");
      expect(intent3!.status).toBe("PENDING_APPROVAL");

      const result = await caller.proxy.batchApprove({
        intentIds: [intent1!.intentId, intent2!.intentId, intent3!.intentId],
        decision: "APPROVED",
        signature: "batch-test-signature",
        expiresInSeconds: 300,
        maxExecutions: 1,
      });

      expect(result.success).toBe(true);
      expect(result.processed).toBe(3);
      expect(result.results).toHaveLength(3);

      const { getIntent } = await import("./db");
      const i1 = await getIntent(intent1!.intentId);
      const i2 = await getIntent(intent2!.intentId);
      const i3 = await getIntent(intent3!.intentId);
      expect(i1!.status).toBe("APPROVED");
      expect(i2!.status).toBe("APPROVED");
      expect(i3!.status).toBe("APPROVED");
    });

    it("batch reject skips already-approved intents", async () => {
      const caller = appRouter.createCaller(proposerCtx);
      const approverCaller = appRouter.createCaller(approverCtx);

      const intent1 = await caller.proxy.createIntent({
        toolName: "send_email",
        toolArgs: { to: "skip1@example.com", subject: "Skip Test 1", body: "Already approved" },
        breakAnalysis: "Skip test",
      });
      const intent2 = await caller.proxy.createIntent({
        toolName: "send_email",
        toolArgs: { to: "skip2@example.com", subject: "Skip Test 2", body: "Still pending" },
        breakAnalysis: "Skip test",
      });

      // Approver approves intent1 individually
      await approverCaller.proxy.approve({
        intentId: intent1!.intentId,
        decision: "APPROVED",
        signature: "individual-approve",
        expiresInSeconds: 300,
        maxExecutions: 1,
      });

      // Batch reject both — intent1 should be skipped (already APPROVED)
      const result = await caller.proxy.batchApprove({
        intentIds: [intent1!.intentId, intent2!.intentId],
        decision: "REJECTED",
        signature: "batch-reject",
      });

      expect(result.processed).toBe(1);
    });
  });

  describe("Expire Stale Intents", () => {
    it("expires intents past their TTL", async () => {
      const caller = appRouter.createCaller(proposerCtx);

      const intent = await caller.proxy.createIntent({
        toolName: "send_email",
        toolArgs: { to: "stale@example.com", subject: "Stale", body: "Should expire" },
        breakAnalysis: "Stale test",
      });

      const { getIntent } = await import("./db");
      const storedIntent = await getIntent(intent!.intentId);
      if (storedIntent) {
        (storedIntent as any).expiresAt = Date.now() - 60000;
      }

      const result = await caller.proxy.expireStale();
      expect(result.expired).toBeGreaterThanOrEqual(1);

      const updatedIntent = await getIntent(intent!.intentId);
      expect(updatedIntent!.status).toBe("EXPIRED");
    });
  });

  describe("Approval SLA Metrics", () => {
    it("returns queue size, approval counts, and timing metrics", async () => {
      const caller = appRouter.createCaller(proposerCtx);

      const metrics = await caller.proxy.approvalMetrics();
      expect(metrics).toBeDefined();
      expect(typeof metrics.queueSize).toBe("number");
      expect(typeof metrics.totalApproved).toBe("number");
      expect(typeof metrics.totalRejected).toBe("number");
      expect(typeof metrics.totalExpired).toBe("number");
      expect(typeof metrics.avgTimeToApprovalMs).toBe("number");
      expect(typeof metrics.oldestPendingAgeMs).toBe("number");

      expect(metrics.totalApproved).toBeGreaterThan(0);
    });
  });

  describe("Versioned Receipt Schema", () => {
    it("receipt includes protocolVersion field", async () => {
      const proposerCaller = appRouter.createCaller(proposerCtx);
      const approverCaller = appRouter.createCaller(approverCtx);

      // Proposer creates intent
      const intent = await proposerCaller.proxy.createIntent({
        toolName: "send_email",
        toolArgs: { to: "receipt@example.com", subject: "Receipt Test", body: "Testing versioned receipt" },
        breakAnalysis: "Receipt version test",
      });

      // Approver approves (different user → token issued)
      const approval = await approverCaller.proxy.approve({
        intentId: intent!.intentId,
        decision: "APPROVED",
        signature: "receipt-test-sig",
        expiresInSeconds: 300,
        maxExecutions: 1,
      });
      const tokenId = (approval as any)?.authorizationToken?.token_id;
      expect(tokenId).toBeTruthy();

      // Proposer executes with token
      const execResult = await proposerCaller.proxy.execute({
        intentId: intent!.intentId,
        tokenId,
      });
      expect(execResult.success).toBe(true);

      // Get receipt and verify protocolVersion
      const receipt = await proposerCaller.proxy.getReceipt({ executionId: execResult.execution!.executionId });
      expect(receipt).toBeDefined();
      expect(receipt!.protocolVersion).toBeDefined();
      expect(receipt!.protocolVersion).toMatch(/^\d+\.\d+\.\d+$/);
    });
  });
});
