/**
 * Tests that Telegram auto-notification hooks fire correctly:
 * 1. sendIntentNotification fires after createIntent (when configured)
 * 2. sendReceiptNotification fires after execute (when configured)
 * 3. sendKillNotification fires after kill (when configured)
 * 4. All skip gracefully when isTelegramConfigured() returns false
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Track Telegram calls ──────────────────────────────────────
const mockSendIntentNotification = vi.fn(async () => ({ ok: true }));
const mockSendReceiptNotification = vi.fn(async () => ({ ok: true }));
const mockSendKillNotification = vi.fn(async () => ({ ok: true }));
let telegramConfigured = false;

vi.mock("./telegram", () => ({
  isTelegramConfigured: () => telegramConfigured,
  sendIntentNotification: (...args: any[]) => mockSendIntentNotification(...args),
  sendReceiptNotification: (...args: any[]) => mockSendReceiptNotification(...args),
  sendKillNotification: (...args: any[]) => mockSendKillNotification(...args),
  parseCallbackData: vi.fn(),
  handleWebhookUpdate: vi.fn(),
  startPolling: vi.fn(),
  stopPolling: vi.fn(),
}));

// ─── Mock DB (in-memory) ───────────────────────────────────────
const proxyUsers = new Map<string, any>();
const intents = new Map<string, any>();
const approvals = new Map<string, any>();
const executions = new Map<string, any>();
const ledgerEntries: any[] = [];
const tools = [
  { id: 1, toolName: "echo", description: "Echo", riskTier: "LOW", requiredParams: JSON.stringify(["message"]), blastRadiusBase: 1, enabled: 1 },
  { id: 2, toolName: "send_email", description: "Send email", riskTier: "HIGH", requiredParams: JSON.stringify(["to", "subject", "body"]), blastRadiusBase: 7, enabled: 1 },
];

let intentCounter = 0;
let approvalCounter = 0;
let executionCounter = 0;

vi.mock("./db", () => ({
  sha256: (data: string) => {
    const crypto = require("crypto");
    return crypto.createHash("sha256").update(data).digest("hex");
  },
  canonicalJsonStringify: (obj: any) => JSON.stringify(obj, Object.keys(obj).sort()),
  getProxyUser: vi.fn(async (userId: number) => proxyUsers.get(String(userId))),
  createProxyUser: vi.fn(async (userId: number, publicKey: string, policyHash: string) => {
    const user = { id: userId, userId, publicKey, policyHash, seedVersion: "SEED-v1.0.0", status: "ACTIVE", onboardedAt: new Date() };
    proxyUsers.set(String(userId), user);
    return user;
  }),
  killProxyUser: vi.fn(async (userId: number) => {
    const u = proxyUsers.get(String(userId));
    if (u) { u.status = "KILLED"; proxyUsers.set(String(userId), u); }
    return u;
  }),
  updateProxyUserPublicKey: vi.fn(),
  getAllProxyUsers: vi.fn(async () => [...proxyUsers.values()]),
  revokeProxyUser: vi.fn(),
  getAllTools: vi.fn(async () => tools),
  getToolByName: vi.fn(async (name: string) => tools.find(t => t.toolName === name) ?? null),
  createIntent: vi.fn(async (userId: number, toolName: string, toolArgs: Record<string, unknown>, riskTier: string, blastRadius: any, reflection?: string) => {
    intentCounter++;
    const crypto = require("crypto");
    const argsHash = crypto.createHash("sha256").update(JSON.stringify(toolArgs)).digest("hex");
    const intent = {
      id: intentCounter,
      intentId: `INT-TG-${intentCounter}`,
      userId,
      toolName,
      toolArgs: JSON.stringify(toolArgs),
      argsHash,
      riskTier,
      status: riskTier === "LOW" ? "AUTO_APPROVED" : "PENDING_APPROVAL",
      blastRadius: JSON.stringify(blastRadius),
      reflection,
      createdAt: new Date(),
    };
    intents.set(intent.intentId, intent);
    return intent;
  }),
  getIntent: vi.fn(async (intentId: string) => intents.get(intentId) ?? null),
  getUserIntents: vi.fn(async () => [...intents.values()]),
  updateIntentStatus: vi.fn(async (intentId: string, status: string) => {
    const i = intents.get(intentId);
    if (i) { i.status = status; intents.set(intentId, i); }
    return i;
  }),
  createApproval: vi.fn(async (intentId: string, userId: number, decision: string, signature: string, boundToolName: string, boundArgsHash: string, expiresAt: Date, maxExecutions: number) => {
    approvalCounter++;
    const approval = {
      id: approvalCounter,
      approvalId: `APR-TG-${approvalCounter}`,
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
    approvals.set(intentId, approval);
    return approval;
  }),
  getApprovalForIntent: vi.fn(async (intentId: string) => approvals.get(intentId) ?? null),
  incrementApprovalExecution: vi.fn(async (approvalId: string) => {
    for (const [, a] of approvals) {
      if (a.approvalId === approvalId) { a.executionCount++; return a; }
    }
    return null;
  }),
  createExecution: vi.fn(async (intentId: string, approvalId: string, result: string) => {
    executionCounter++;
    const execution = {
      id: executionCounter,
      executionId: `EXEC-TG-${executionCounter}`,
      intentId,
      approvalId,
      result,
      receiptHash: null,
      preflightResults: null,
      executedAt: new Date(),
    };
    executions.set(intentId, execution);
    return execution;
  }),
  getExecution: vi.fn(async (executionId: string) => {
    for (const [, e] of executions) { if (e.executionId === executionId) return e; }
    return null;
  }),
  getExecutionByIntentId: vi.fn(async (intentId: string) => executions.get(intentId) ?? null),
  updateExecutionReceiptHash: vi.fn(async (executionId: string, receiptHash: string) => {
    for (const [, e] of executions) {
      if (e.executionId === executionId) { e.receiptHash = receiptHash; return e; }
    }
    return null;
  }),
  getUserApprovals: vi.fn(async () => [...approvals.values()]),
  appendLedger: vi.fn(async (entryType: string, payload: any) => {
    const entry = { entryId: `LE-tg-${ledgerEntries.length}`, entryType, payload, hash: "tg-hash", prevHash: "GENESIS", timestamp: Date.now() };
    ledgerEntries.push(entry);
    return entry;
  }),
  getAllLedgerEntries: vi.fn(async () => ledgerEntries),
  verifyHashChain: vi.fn(async () => ({ valid: true, entries: ledgerEntries.length, errors: [] })),
  saveKeyBackup: vi.fn(),
  getKeyBackup: vi.fn(async () => null),
  deleteKeyBackup: vi.fn(),
  getLedgerEntriesSince: vi.fn(async () => ledgerEntries),
  // Bondi helpers
  createConversation: vi.fn(),
  getConversation: vi.fn(),
  getUserConversations: vi.fn(async () => []),
  updateConversationMessages: vi.fn(),
  addIntentToConversation: vi.fn(),
  closeConversation: vi.fn(),
  createLearningEvent: vi.fn(),
  getUserLearningEvents: vi.fn(async () => []),
  getRecentLearningContext: vi.fn(async () => []),
  getActiveNodeConfigs: vi.fn(async () => []),
  getAllNodeConfigs: vi.fn(async () => []),
  getNodeConfig: vi.fn(async () => null),
  // Policy rules + notifications
  createNotification: vi.fn(async () => ({ notificationId: "notif-mock", type: "SYSTEM", title: "Test", body: "Test" })),
  getUserNotifications: vi.fn(async () => []),
  getUnreadNotificationCount: vi.fn(async () => 0),
  markNotificationRead: vi.fn(async () => {}),
  markAllNotificationsRead: vi.fn(async () => {}),
  getActivePolicyRulesForTool: vi.fn(async () => []),
  getUserPolicyRules: vi.fn(async () => []),
  getAllPolicyRules: vi.fn(async () => []),
  createPolicyRule: vi.fn(async () => null),
  updatePolicyRule: vi.fn(async () => null),
  deletePolicyRule: vi.fn(async () => {}),
  togglePolicyRule: vi.fn(async () => null),
  getSystemComponents: vi.fn(async () => []),
  getSystemComponent: vi.fn(async () => null),
}));

vi.mock("./connectors", () => ({
  dispatchExecution: vi.fn(async () => ({
    success: true,
    result: { message: "executed" },
    metadata: { connector: "mock" },
  })),
  verifyArgsHash: vi.fn(() => true),
  generateReceipt: vi.fn(() => ({ hash: "mock-receipt-hash", payload: "{}" })),
}));

vi.mock("./_core/llm", () => ({
  invokeLLM: vi.fn(async () => ({
    choices: [{ message: { content: "test response" } }],
  })),
}));

vi.mock("./_core/notification", () => ({
  notifyOwner: vi.fn(async () => true),
}));

// ─── Import router after mocks ─────────────────────────────────
import { appRouter } from "./routers";

function createTestContext(userId: number) {
  return {
    req: {} as any,
    res: { cookie: vi.fn(), clearCookie: vi.fn() } as any,
    user: {
      id: userId,
      openId: process.env.OWNER_OPEN_ID || "owner-open-id",
      name: "Test User",
      role: "admin" as const,
      email: "test@test.com",
      loginMethod: "oauth",
      createdAt: new Date(),
      updatedAt: new Date(),
      lastSignedIn: new Date(),
    },
  };
}

// ─── Tests ─────────────────────────────────────────────────────

describe("Telegram Auto-Notification Hooks", () => {
  beforeEach(() => {
    proxyUsers.clear();
    intents.clear();
    approvals.clear();
    executions.clear();
    ledgerEntries.length = 0;
    intentCounter = 0;
    approvalCounter = 0;
    executionCounter = 0;
    vi.clearAllMocks();
    telegramConfigured = false;
  });

  describe("createIntent → sendIntentNotification", () => {
    it("fires sendIntentNotification when Telegram is configured", async () => {
      telegramConfigured = true;
      const caller = appRouter.createCaller(createTestContext(1));

      // Onboard first
      await caller.proxy.onboard({ publicKey: "pk1", policyHash: "ph1" });

      // Create a HIGH-risk intent (needs breakAnalysis)
      await caller.proxy.createIntent({
        toolName: "send_email",
        toolArgs: { to: "test@test.com", subject: "Test", body: "Hello" },
        breakAnalysis: "Could send to wrong recipient",
      });

      expect(mockSendIntentNotification).toHaveBeenCalledTimes(1);
      expect(mockSendIntentNotification).toHaveBeenCalledWith(
        expect.objectContaining({
          intentId: expect.stringContaining("INT-"),
          toolName: "send_email",
          riskTier: "HIGH",
        }),
      );
    });

    it("skips sendIntentNotification when Telegram is NOT configured", async () => {
      telegramConfigured = false;
      const caller = appRouter.createCaller(createTestContext(1));

      await caller.proxy.onboard({ publicKey: "pk1", policyHash: "ph1" });
      await caller.proxy.createIntent({
        toolName: "send_email",
        toolArgs: { to: "test@test.com", subject: "Test", body: "Hello" },
        breakAnalysis: "Could send to wrong recipient",
      });

      expect(mockSendIntentNotification).not.toHaveBeenCalled();
    });
  });

  describe("execute → sendReceiptNotification", () => {
    it("fires sendReceiptNotification after successful execution when Telegram is configured", async () => {
      telegramConfigured = true;
      const caller = appRouter.createCaller(createTestContext(1));

      // Onboard → create intent → approve → execute
      await caller.proxy.onboard({ publicKey: "pk1", policyHash: "ph1" });
      const intent = await caller.proxy.createIntent({
        toolName: "send_email",
        toolArgs: { to: "test@test.com", subject: "Test", body: "Hello" },
        breakAnalysis: "Could send to wrong recipient",
      });

      await caller.proxy.approve({
        intentId: intent!.intentId,
        decision: "APPROVED",
        signature: "test-sig-abc123",
        expiresInMinutes: 60,
        maxExecutions: 1,
      });

      // Clear mocks to isolate execute call
      mockSendReceiptNotification.mockClear();

      await caller.proxy.execute({ intentId: intent!.intentId });

      expect(mockSendReceiptNotification).toHaveBeenCalledTimes(1);
      expect(mockSendReceiptNotification).toHaveBeenCalledWith(
        expect.objectContaining({
          intentId: intent!.intentId,
          toolName: "send_email",
          success: true,
        }),
      );
    });

    it("skips sendReceiptNotification when Telegram is NOT configured", async () => {
      telegramConfigured = false;
      const caller = appRouter.createCaller(createTestContext(1));

      await caller.proxy.onboard({ publicKey: "pk1", policyHash: "ph1" });
      const intent = await caller.proxy.createIntent({
        toolName: "send_email",
        toolArgs: { to: "test@test.com", subject: "Test", body: "Hello" },
        breakAnalysis: "Could send to wrong recipient",
      });

      await caller.proxy.approve({
        intentId: intent!.intentId,
        decision: "APPROVED",
        signature: "test-sig-abc123",
        expiresInMinutes: 60,
        maxExecutions: 1,
      });

      await caller.proxy.execute({ intentId: intent!.intentId });

      expect(mockSendReceiptNotification).not.toHaveBeenCalled();
    });
  });

  describe("kill → sendKillNotification", () => {
    it("fires sendKillNotification when Telegram is configured", async () => {
      telegramConfigured = true;
      const caller = appRouter.createCaller(createTestContext(1));

      await caller.proxy.onboard({ publicKey: "pk1", policyHash: "ph1" });
      await caller.proxy.kill({ reason: "Compromised credentials" });

      expect(mockSendKillNotification).toHaveBeenCalledTimes(1);
      expect(mockSendKillNotification).toHaveBeenCalledWith("Compromised credentials");
    });

    it("skips sendKillNotification when Telegram is NOT configured", async () => {
      telegramConfigured = false;
      const caller = appRouter.createCaller(createTestContext(1));

      await caller.proxy.onboard({ publicKey: "pk1", policyHash: "ph1" });
      await caller.proxy.kill({ reason: "Compromised credentials" });

      expect(mockSendKillNotification).not.toHaveBeenCalled();
    });
  });
});
