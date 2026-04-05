import { describe, expect, it, vi } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

/**
 * E2E test: approve → execute flow
 *
 * This test covers the full governance pipeline:
 * 1. Onboard a user
 * 2. Create a HIGH-risk intent (PENDING_APPROVAL)
 * 3. Approve the intent with a signature
 * 4. Execute the intent with 8 preflight checks
 * 5. Verify receipt hash is generated
 * 6. Verify ledger entries are created for each step
 * 7. Verify intent status transitions: PENDING_APPROVAL → APPROVED → EXECUTED
 */

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

    sha256: (data: string) => {
      const crypto = require("crypto");
      return crypto.createHash("sha256").update(data).digest("hex");
    },

    getProxyUser: vi.fn(async (userId: number) => proxyUsers.get(String(userId))),
    createProxyUser: vi.fn(async (userId: number, publicKey: string, policyHash: string) => {
      const user = {
        id: proxyUsers.size + 1,
        userId,
        publicKey,
        policyHash,
        seedVersion: "SEED-v1.0.0",
        status: "ACTIVE",
        onboardedAt: new Date(),
        killedAt: null,
        killReason: null,
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
      const argsHash = require("crypto").createHash("sha256").update(JSON.stringify(toolArgs)).digest("hex");
      const intent = {
        id: intentCounter,
        intentId: `INT-E2E-${intentCounter}`,
        userId,
        toolName,
        toolArgs: JSON.stringify(toolArgs),
        riskTier,
        argsHash,
        blastRadius: JSON.stringify(blastRadius),
        reflection: reflection || null,
        sourceConversationId: null,
        status: riskTier === "LOW" ? "APPROVED" : "PENDING_APPROVAL",
        createdAt: new Date(),
      };
      intents.set(intent.intentId, intent);
      return intent;
    }),
    getIntent: vi.fn(async (intentId: string) => intents.get(intentId)),
    getUserIntents: vi.fn(async () => Array.from(intents.values()).slice(-10)),
    updateIntentStatus: vi.fn(async (intentId: string, status: string) => {
      const intent = intents.get(intentId);
      if (intent) intent.status = status;
    }),

    createApproval: vi.fn(async (intentId: string, userId: number, decision: string, signature: string, boundToolName: string, boundArgsHash: string, expiresAt: number, maxExecutions: number) => {
      approvalCounter++;
      const approval = {
        id: approvalCounter,
        approvalId: `APR-E2E-${approvalCounter}`,
        intentId,
        userId,
        decision,
        signature,
        boundToolName,
        boundArgsHash,
        expiresAt,
        maxExecutions,
        executionCount: 0,
        createdAt: new Date(),
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
        id: executionCounter,
        executionId: `EXE-E2E-${executionCounter}`,
        intentId,
        approvalId,
        result: JSON.stringify(result),
        receiptHash,
        receiptPayload: null,
        preflightResults: JSON.stringify(preflightResults),
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
      if (exec) {
        exec.receiptHash = receiptHash;
        if (receiptPayload) exec.receiptPayload = receiptPayload;
      }
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

    // Learning events
    createLearningEvent: vi.fn(async (userId: number, eventId: string, eventType: string, data: any) => {
      learningEvents.push({ userId, eventId, eventType, ...data });
    }),
    getUserLearningEvents: vi.fn(async () => learningEvents),
    getRecentLearningContext: vi.fn(async () => []),

    // Key backup stubs
    saveKeyBackup: vi.fn(),
    getKeyBackup: vi.fn().mockResolvedValue(null),
    deleteKeyBackup: vi.fn(),

    // Conversation stubs
    createConversation: vi.fn(),
    getConversation: vi.fn().mockResolvedValue(null),
    getUserConversations: vi.fn(async () => []),
    updateConversationMessages: vi.fn(),
    addIntentToConversation: vi.fn(),
    closeConversation: vi.fn(),

    // Node config stubs
    getAllNodeConfigs: vi.fn(async () => []),
    getActiveNodeConfigs: vi.fn(async () => []),
    getNodeConfig: vi.fn().mockResolvedValue(null),
  };
});

// Mock connectors — simulate a successful send_email execution
vi.mock("./connectors", async (importOriginal) => {
  const actual = await importOriginal() as Record<string, unknown>;
  return {
    ...actual,
    dispatchExecution: vi.fn(async (toolName: string, toolArgs: Record<string, unknown>, approvalProof: any, riskTier: string, storedArgsHash: string) => {
      // Simulate successful execution for send_email
      if (toolName === "send_email") {
        return {
          success: true,
          output: { messageId: "MSG-E2E-001", status: "delivered" },
          metadata: { connector: "send_email", transport: "test" },
          executedAt: Date.now(),
        };
      }
      // Simulate NO_CONNECTOR for unknown tools
      return {
        success: false,
        error: `NO_CONNECTOR: No connector registered for tool '${toolName}'`,
        output: null,
        metadata: {},
        executedAt: Date.now(),
      };
    }),
  };
});

function createAuthContext(userId = 1, openId = "e2e-test-user"): TrpcContext {
  return {
    user: {
      id: userId,
      openId,
      email: "e2e@example.com",
      name: "E2E Test User",
      loginMethod: "manus",
      role: "user",
      createdAt: new Date(),
      updatedAt: new Date(),
      lastSignedIn: new Date(),
    },
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { clearCookie: vi.fn() } as unknown as TrpcContext["res"],
  };
}

describe("E2E: Approve → Execute Governance Flow", () => {
  const ctx = createAuthContext();

  it("Step 1: Onboard user", async () => {
    const caller = appRouter.createCaller(ctx);
    const result = await caller.proxy.onboard({
      publicKey: "e2e-test-public-key-abc123",
      policyHash: "e2e-test-policy-hash",
    });
    expect(result.success).toBe(true);
    expect(result.proxyUser?.status).toBe("ACTIVE");
  });

  it("Step 2: Create HIGH-risk intent (PENDING_APPROVAL)", async () => {
    const caller = appRouter.createCaller(ctx);
    const intent = await caller.proxy.createIntent({
      toolName: "send_email",
      toolArgs: { to: "test@example.com", subject: "E2E Test", body: "This is a test email" },
      breakAnalysis: "Could send to wrong recipient. Email content could be inappropriate. Cannot be unsent once delivered.",
    });
    expect(intent).toBeDefined();
    expect(intent!.intentId).toContain("INT-E2E-");
    expect(intent!.status).toBe("PENDING_APPROVAL");
    expect(intent!.riskTier).toBe("HIGH");
  });

  it("Step 3: Cannot execute without approval", async () => {
    const caller = appRouter.createCaller(ctx);
    // Get the intent we just created
    const status = await caller.proxy.status();
    const pendingIntent = status.recentIntents.find(i => i.status === "PENDING_APPROVAL");
    expect(pendingIntent).toBeDefined();

    const result = await caller.proxy.execute({ intentId: pendingIntent!.intentId });
    expect(result.success).toBe(false);
    expect(result.error).toContain("Preflight failed");
    const approvalCheck = result.preflightResults!.find((c: any) => c.check === "approval_exists");
    expect(approvalCheck?.status).toBe("FAIL");
  });

  it("Step 4: Approve intent with cryptographic signature", async () => {
    const caller = appRouter.createCaller(ctx);
    const status = await caller.proxy.status();
    const pendingIntent = status.recentIntents.find(i => i.status === "PENDING_APPROVAL");
    expect(pendingIntent).toBeDefined();

    const approval = await caller.proxy.approve({
      intentId: pendingIntent!.intentId,
      decision: "APPROVED",
      signature: "e2e-test-ed25519-signature-abc123def456",
      expiresInSeconds: 300,
      maxExecutions: 1,
    });
    expect(approval).toBeDefined();
    expect(approval!.decision).toBe("APPROVED");
    expect(approval!.boundToolName).toBe("send_email");
    expect(approval!.maxExecutions).toBe(1);
    expect(approval!.executionCount).toBe(0);
  });

  it("Step 5: Intent status is now APPROVED", async () => {
    const caller = appRouter.createCaller(ctx);
    const status = await caller.proxy.status();
    const approvedIntent = status.recentIntents.find(i => i.status === "APPROVED");
    expect(approvedIntent).toBeDefined();
    expect(approvedIntent!.toolName).toBe("send_email");
  });

  it("Step 6: Execute approved intent — 8/8 preflight PASS + receipt", async () => {
    const caller = appRouter.createCaller(ctx);
    const status = await caller.proxy.status();
    const approvedIntent = status.recentIntents.find(i => i.status === "APPROVED");
    expect(approvedIntent).toBeDefined();

    const result = await caller.proxy.execute({ intentId: approvedIntent!.intentId });
    expect(result.success).toBe(true);

    // All 8 preflight checks should pass
    expect(result.preflightResults).toBeDefined();
    expect(result.preflightResults!.length).toBe(8);
    const allPassed = result.preflightResults!.every((c: any) => c.status === "PASS");
    expect(allPassed).toBe(true);

    // Execution record should exist
    expect(result.execution).toBeDefined();
    expect(result.execution!.executionId).toContain("EXE-E2E-");

    // Receipt hash should be generated (not PENDING)
    expect(result.execution!.receiptHash).toBeDefined();
    expect(result.execution!.receiptHash).not.toBe("PENDING");
    expect(result.execution!.receiptHash.length).toBe(64); // SHA-256 hex

    // Connector result should indicate success
    expect(result.connectorResult).toBeDefined();
    expect(result.connectorResult!.success).toBe(true);
  });

  it("Step 7: Intent status is now EXECUTED", async () => {
    const caller = appRouter.createCaller(ctx);
    const status = await caller.proxy.status();
    const executedIntent = status.recentIntents.find(i => i.status === "EXECUTED");
    expect(executedIntent).toBeDefined();
    expect(executedIntent!.toolName).toBe("send_email");
  });

  it("Step 8: Ledger has entries for ONBOARD, INTENT, APPROVAL, EXECUTION", async () => {
    const caller = appRouter.createCaller(ctx);
    const entries = await caller.ledger.list();
    expect(entries.length).toBeGreaterThanOrEqual(4);

    const types = entries.map(e => e.entryType);
    expect(types).toContain("ONBOARD");
    expect(types).toContain("INTENT");
    expect(types).toContain("APPROVAL");
    expect(types).toContain("EXECUTION");
  });

  it("Step 9: Cannot re-execute already executed intent", async () => {
    const caller = appRouter.createCaller(ctx);
    const status = await caller.proxy.status();
    const executedIntent = status.recentIntents.find(i => i.status === "EXECUTED");
    expect(executedIntent).toBeDefined();

    const result = await caller.proxy.execute({ intentId: executedIntent!.intentId });
    expect(result.success).toBe(false);
    // Should fail on not_already_executed or execution_limit check
    expect(result.preflightResults).toBeDefined();
    const failedChecks = result.preflightResults!.filter((c: any) => c.status === "FAIL");
    expect(failedChecks.length).toBeGreaterThan(0);
  });

  it("Step 10: Reject flow — rejected intent cannot be executed", async () => {
    const caller = appRouter.createCaller(ctx);

    // Create another HIGH-risk intent
    const intent = await caller.proxy.createIntent({
      toolName: "send_email",
      toolArgs: { to: "reject@example.com", subject: "Reject Test", body: "This should be rejected" },
      breakAnalysis: "Testing rejection flow",
    });
    expect(intent).toBeDefined();
    expect(intent!.status).toBe("PENDING_APPROVAL");

    // Reject it
    const rejection = await caller.proxy.approve({
      intentId: intent!.intentId,
      decision: "REJECTED",
      signature: "REJECTED-BY-USER",
      expiresInSeconds: 0,
      maxExecutions: 0,
    });
    expect(rejection!.decision).toBe("REJECTED");

    // Try to execute — should fail preflight because approval is REJECTED (not APPROVED)
    const execResult = await caller.proxy.execute({ intentId: intent!.intentId });
    expect(execResult.success).toBe(false);
    expect(execResult.error).toContain("Preflight failed");
    const approvalCheck = execResult.preflightResults!.find((c: any) => c.check === "approval_exists");
    expect(approvalCheck?.status).toBe("FAIL");
  });

  it("Step 11: Kill switch blocks all execution", async () => {
    const caller = appRouter.createCaller(ctx);

    // Create and approve an intent
    const intent = await caller.proxy.createIntent({
      toolName: "send_email",
      toolArgs: { to: "kill@example.com", subject: "Kill Test", body: "Testing kill switch" },
      breakAnalysis: "Testing kill switch blocks execution",
    });
    await caller.proxy.approve({
      intentId: intent!.intentId,
      decision: "APPROVED",
      signature: "kill-test-signature",
      expiresInSeconds: 300,
      maxExecutions: 1,
    });

    // Kill the proxy
    const killResult = await caller.proxy.kill({ reason: "E2E test kill switch" });
    expect(killResult.success).toBe(true);

    // Try to execute — should fail because proxy is killed
    await expect(
      caller.proxy.execute({ intentId: intent!.intentId })
    ).rejects.toThrow("Proxy killed");
  });
});
