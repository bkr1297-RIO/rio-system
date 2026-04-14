import { describe, expect, it, vi, beforeAll } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";
import {
  registerRootAuthority,
  activatePolicy,
  DEFAULT_POLICY_RULES,
  _resetAuthorityState,
} from "./authorityLayer";

/**
 * E2E test: approve → execute flow (with Authorization Token Layer)
 *
 * Governance model:
 *   User A (proposer) creates intent → User B (approver) approves → Token issued
 *   → User A executes with token → Receipt → Ledger
 *
 * Key rule: proposer ≠ approver (enforced at execution via token)
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
  const tools = [
    { id: 1, toolName: "echo", description: "Echo a message", riskTier: "LOW", requiredParams: JSON.stringify(["message"]), blastRadiusBase: 1, enabled: 1 },
    { id: 2, toolName: "send_email", description: "Send an email", riskTier: "HIGH", requiredParams: JSON.stringify(["to", "subject", "body"]), blastRadiusBase: 7, enabled: 1 },
    { id: 3, toolName: "web_search", description: "Search the web", riskTier: "LOW", requiredParams: JSON.stringify(["query"]), blastRadiusBase: 1, enabled: 1 },
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
        id: intentCounter, intentId: `INT-E2E-${intentCounter}`, userId, toolName,
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
    getUserIntents: vi.fn(async (userId: number) => Array.from(intents.values()).filter(i => i.userId === userId).slice(-10)),
    updateIntentStatus: vi.fn(async (intentId: string, status: string) => {
      const intent = intents.get(intentId);
      if (intent) intent.status = status;
    }),

    createApproval: vi.fn(async (intentId: string, userId: number, decision: string, signature: string, boundToolName: string, boundArgsHash: string, expiresAt: number, maxExecutions: number) => {
      approvalCounter++;
      const approval = {
        id: approvalCounter, approvalId: `APR-E2E-${approvalCounter}`, intentId, userId,
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
        id: executionCounter, executionId: `EXE-E2E-${executionCounter}`, intentId, approvalId,
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
      const entryId = `LED-E2E-${ledgerEntries.length + 1}`;
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

    // Principal management — returns different principalIds per userId
    getPrincipalByUserId: vi.fn(async (userId: number) => ({
      principalId: `PRI-E2E-${userId}`, userId,
      displayName: userId === 1 ? "Proposer" : "Approver",
      principalType: "human",
      roles: ["proposer", "approver", "executor", "auditor", "meta"],
      status: "active",
    })),
    getOrCreatePrincipal: vi.fn(async (userId: number) => ({
      principalId: `PRI-E2E-${userId}`, userId,
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

// Mock connectors
vi.mock("./connectors", async (importOriginal) => {
  const actual = await importOriginal() as Record<string, unknown>;
  return {
    ...actual,
    dispatchExecution: vi.fn(async (toolName: string) => {
      if (toolName === "send_email") {
        return {
          success: true,
          output: { messageId: "MSG-E2E-001", status: "delivered" },
          metadata: { connector: "send_email", transport: "test" },
          executedAt: Date.now(),
        };
      }
      return { success: false, error: `NO_CONNECTOR: ${toolName}`, output: null, metadata: {}, executedAt: Date.now() };
    }),
  };
});

// Two users: proposer (userId=1) and approver (userId=2)
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

describe("E2E: Approve → Token → Execute Governance Flow", () => {
  const proposerCtx = createAuthContext(1, "proposer-user", "Alice (Proposer)");
  const approverCtx = createAuthContext(2, "approver-user", "Bob (Approver)");
  let capturedTokenId: string | null = null;

  // Initialize the authority layer
  beforeAll(() => {
    _resetAuthorityState();
    registerRootAuthority(MOCK_ROOT_PUBLIC_KEY);
    activatePolicy({
      policyId: "POLICY-E2E-v1.0.0",
      rules: DEFAULT_POLICY_RULES,
      policySignature: MOCK_ROOT_SIGNATURE,
      rootPublicKey: MOCK_ROOT_PUBLIC_KEY,
    });
  });

  it("Step 1: Onboard proposer", async () => {
    const caller = appRouter.createCaller(proposerCtx);
    const result = await caller.proxy.onboard({
      publicKey: "proposer-public-key-abc123",
      policyHash: "e2e-test-policy-hash",
    });
    expect(result.success).toBe(true);
    expect(result.proxyUser?.status).toBe("ACTIVE");
  });

  it("Step 2: Proposer creates HIGH-risk intent (PENDING_APPROVAL)", async () => {
    const caller = appRouter.createCaller(proposerCtx);
    const intent = await caller.proxy.createIntent({
      toolName: "send_email",
      toolArgs: { to: "test@example.com", subject: "E2E Test", body: "This is a test email" },
      breakAnalysis: "Could send to wrong recipient. Cannot be unsent once delivered.",
    });
    expect(intent).toBeDefined();
    expect(intent!.intentId).toContain("INT-E2E-");
    expect(intent!.status).toBe("PENDING_APPROVAL");
    expect(intent!.riskTier).toBe("HIGH");
  });

  it("Step 3: Cannot execute without approval (and without token)", async () => {
    const caller = appRouter.createCaller(proposerCtx);
    const status = await caller.proxy.status();
    const pendingIntent = status.recentIntents.find(i => i.status === "PENDING_APPROVAL");
    expect(pendingIntent).toBeDefined();

    const result = await caller.proxy.execute({ intentId: pendingIntent!.intentId });
    expect(result.success).toBe(false);
    expect(result.error).toContain("Preflight failed");
    const approvalCheck = result.preflightResults!.find((c: any) => c.check === "approval_exists");
    expect(approvalCheck?.status).toBe("FAIL");
  });

  it("Step 4: Approver (different user) approves → authorization token issued", async () => {
    // Use approver context (userId=2, different from proposer userId=1)
    const caller = appRouter.createCaller(approverCtx);
    const proposerCaller = appRouter.createCaller(proposerCtx);
    const status = await proposerCaller.proxy.status();
    const pendingIntent = status.recentIntents.find(i => i.status === "PENDING_APPROVAL");
    expect(pendingIntent).toBeDefined();

    const approval = await caller.proxy.approve({
      intentId: pendingIntent!.intentId,
      decision: "APPROVED",
      signature: "e2e-approver-ed25519-signature-abc123def456",
      expiresInSeconds: 300,
      maxExecutions: 1,
    });
    expect(approval).toBeDefined();
    expect(approval!.decision).toBe("APPROVED");
    expect(approval!.boundToolName).toBe("send_email");

    // Authorization token must be issued
    const authToken = (approval as any).authorizationToken;
    expect(authToken).toBeDefined();
    expect(authToken).not.toBeNull();
    expect(authToken.token_id).toMatch(/^ATOK-/);
    expect(authToken.intent_id).toBe(pendingIntent!.intentId);
    expect(authToken.action).toBe("send_email");
    expect(authToken.approved_by).toBe("PRI-E2E-2"); // Approver's principal
    expect(authToken.max_executions).toBe(1);

    capturedTokenId = authToken.token_id;
  });

  it("Step 5: Intent status is now APPROVED", async () => {
    const caller = appRouter.createCaller(proposerCtx);
    const status = await caller.proxy.status();
    const approvedIntent = status.recentIntents.find(i => i.status === "APPROVED");
    expect(approvedIntent).toBeDefined();
    expect(approvedIntent!.toolName).toBe("send_email");
  });

  it("Step 6: Proposer executes with token — all preflight PASS + receipt", async () => {
    expect(capturedTokenId).toBeTruthy();
    const caller = appRouter.createCaller(proposerCtx);
    const status = await caller.proxy.status();
    const approvedIntent = status.recentIntents.find(i => i.status === "APPROVED");
    expect(approvedIntent).toBeDefined();

    const result = await caller.proxy.execute({
      intentId: approvedIntent!.intentId,
      tokenId: capturedTokenId!,
    });
    expect(result.success).toBe(true);

    // All preflight checks should pass
    expect(result.preflightResults).toBeDefined();
    const allPassed = result.preflightResults!.every((c: any) => c.status === "PASS");
    expect(allPassed).toBe(true);

    // proposer_not_approver check must be present and PASS
    const pnaCheck = result.preflightResults!.find((c: any) => c.check === "proposer_not_approver");
    expect(pnaCheck).toBeDefined();
    expect(pnaCheck!.status).toBe("PASS");
    expect(pnaCheck!.detail).toContain("PRI-E2E-1"); // proposer
    expect(pnaCheck!.detail).toContain("PRI-E2E-2"); // approver

    // Execution record
    expect(result.execution).toBeDefined();
    expect(result.execution!.executionId).toContain("EXE-E2E-");

    // Receipt hash (SHA-256)
    expect(result.execution!.receiptHash).toBeDefined();
    expect(result.execution!.receiptHash).not.toBe("PENDING");
    expect(result.execution!.receiptHash.length).toBe(64);

    // Connector result
    expect(result.connectorResult).toBeDefined();
    expect(result.connectorResult!.success).toBe(true);
  });

  it("Step 7: Intent status is now EXECUTED", async () => {
    const caller = appRouter.createCaller(proposerCtx);
    const status = await caller.proxy.status();
    const executedIntent = status.recentIntents.find(i => i.status === "EXECUTED");
    expect(executedIntent).toBeDefined();
    expect(executedIntent!.toolName).toBe("send_email");
  });

  it("Step 8: Ledger has ONBOARD, INTENT, APPROVAL, AUTHORITY_TOKEN, EXECUTION", async () => {
    const caller = appRouter.createCaller(proposerCtx);
    const entries = await caller.ledger.list();
    expect(entries.length).toBeGreaterThanOrEqual(5);

    const types = entries.map(e => e.entryType);
    expect(types).toContain("ONBOARD");
    expect(types).toContain("INTENT");
    expect(types).toContain("APPROVAL");
    expect(types).toContain("AUTHORITY_TOKEN");
    expect(types).toContain("EXECUTION");
  });

  it("Step 9: Cannot re-execute already executed intent", async () => {
    const caller = appRouter.createCaller(proposerCtx);
    const status = await caller.proxy.status();
    const executedIntent = status.recentIntents.find(i => i.status === "EXECUTED");
    expect(executedIntent).toBeDefined();

    const result = await caller.proxy.execute({
      intentId: executedIntent!.intentId,
      tokenId: capturedTokenId!,
    });
    expect(result.success).toBe(false);
    const failedChecks = result.preflightResults!.filter((c: any) => c.status === "FAIL");
    expect(failedChecks.length).toBeGreaterThan(0);
  });

  it("Step 10: Reject flow — rejected intent cannot be executed", async () => {
    const proposerCaller = appRouter.createCaller(proposerCtx);
    const approverCaller = appRouter.createCaller(approverCtx);

    const intent = await proposerCaller.proxy.createIntent({
      toolName: "send_email",
      toolArgs: { to: "reject@example.com", subject: "Reject Test", body: "This should be rejected" },
      breakAnalysis: "Testing rejection flow",
    });
    expect(intent!.status).toBe("PENDING_APPROVAL");

    const rejection = await approverCaller.proxy.approve({
      intentId: intent!.intentId,
      decision: "REJECTED",
      signature: "REJECTED-BY-APPROVER",
      expiresInSeconds: 0,
      maxExecutions: 0,
    });
    expect(rejection!.decision).toBe("REJECTED");
    expect((rejection as any).authorizationToken).toBeNull();

    const execResult = await proposerCaller.proxy.execute({ intentId: intent!.intentId });
    expect(execResult.success).toBe(false);
    expect(execResult.error).toContain("Preflight failed");
  });

  it("Step 11: Kill switch blocks all execution", async () => {
    const proposerCaller = appRouter.createCaller(proposerCtx);
    const approverCaller = appRouter.createCaller(approverCtx);

    const intent = await proposerCaller.proxy.createIntent({
      toolName: "send_email",
      toolArgs: { to: "kill@example.com", subject: "Kill Test", body: "Testing kill switch" },
      breakAnalysis: "Testing kill switch blocks execution",
    });
    const approval = await approverCaller.proxy.approve({
      intentId: intent!.intentId,
      decision: "APPROVED",
      signature: "kill-test-signature",
      expiresInSeconds: 300,
      maxExecutions: 1,
    });
    const killTokenId = (approval as any)?.authorizationToken?.token_id;

    const killResult = await proposerCaller.proxy.kill({ reason: "E2E test kill switch" });
    expect(killResult.success).toBe(true);

    await expect(
      proposerCaller.proxy.execute({ intentId: intent!.intentId, tokenId: killTokenId })
    ).rejects.toThrow("Proxy killed");
  });
});
