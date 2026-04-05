import { describe, expect, it, vi } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

// Mock the db module with all functions used by routers.ts
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
        intentId: `INT-${intentCounter}`,
        userId,
        toolName,
        toolArgs: JSON.stringify(toolArgs),
        riskTier,
        argsHash,
        blastRadius: JSON.stringify(blastRadius),
        reflection: reflection || null,
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
        approvalId: `APR-${approvalCounter}`,
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
        executionId: `EXE-${executionCounter}`,
        intentId,
        approvalId,
        result: JSON.stringify(result),
        receiptHash,
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
    updateExecutionReceiptHash: vi.fn(async (executionId: string, receiptHash: string) => {
      const exec = executions.get(executionId);
      if (exec) exec.receiptHash = receiptHash;
    }),

    appendLedger: vi.fn(async (entryType: string, payload: any) => {
      const crypto = require("crypto");
      const prevHash = ledgerEntries.length > 0 ? ledgerEntries[ledgerEntries.length - 1].hash : "GENESIS";
      const entryId = `LED-${ledgerEntries.length + 1}`;
      const timestamp = Date.now();
      const hash = crypto.createHash("sha256").update(JSON.stringify({ entryId, entryType, payload, prevHash, timestamp })).digest("hex");
      const entry = { id: ledgerEntries.length + 1, entryId, entryType, payload: JSON.stringify(payload), hash, prevHash, timestamp: String(timestamp), createdAt: new Date() };
      ledgerEntries.push(entry);
      return entry;
    }),
    getLastLedgerEntry: vi.fn(async () => ledgerEntries.length > 0 ? ledgerEntries[ledgerEntries.length - 1] : null),
    getAllLedgerEntries: vi.fn(async () => [...ledgerEntries]),
    verifyHashChain: vi.fn(async () => ({ valid: true, entries: ledgerEntries.length, errors: [] })),
  };
});

function createAuthContext(userId = 1, openId = "test-user"): TrpcContext {
  return {
    user: {
      id: userId,
      openId,
      email: "test@example.com",
      name: "Test User",
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

function createPublicContext(): TrpcContext {
  return {
    user: null,
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { clearCookie: vi.fn() } as unknown as TrpcContext["res"],
  };
}

describe("HITL Proxy API", () => {
  describe("tools.list", () => {
    it("returns the tool registry", async () => {
      const caller = appRouter.createCaller(createAuthContext());
      const tools = await caller.tools.list();
      expect(tools).toHaveLength(2);
      expect(tools[0].toolName).toBe("echo");
      expect(tools[1].toolName).toBe("send_email");
      expect(tools[1].riskTier).toBe("HIGH");
    });
  });

  describe("proxy.onboard", () => {
    it("creates a proxy user and ledger entry on onboard", async () => {
      const caller = appRouter.createCaller(createAuthContext());
      const result = await caller.proxy.onboard({
        publicKey: "abc123def456",
        policyHash: "hash-of-policy",
      });
      expect(result.success).toBe(true);
      expect(result.proxyUser).toBeDefined();
      expect(result.proxyUser?.status).toBe("ACTIVE");
    });

    it("returns already onboarded if user exists", async () => {
      const caller = appRouter.createCaller(createAuthContext());
      const result = await caller.proxy.onboard({
        publicKey: "abc123def456",
        policyHash: "hash-of-policy",
      });
      expect(result.success).toBe(false);
      expect(result.error).toContain("Already onboarded");
    });
  });

  describe("proxy.createIntent", () => {
    it("creates an intent for a LOW risk tool (auto-approved)", async () => {
      const caller = appRouter.createCaller(createAuthContext());
      const result = await caller.proxy.createIntent({
        toolName: "echo",
        toolArgs: { message: "hello" },
      });
      expect(result).toBeDefined();
      expect(result?.intentId).toContain("INT-");
    });

    it("creates a PENDING intent for a HIGH risk tool with breakAnalysis", async () => {
      const caller = appRouter.createCaller(createAuthContext());
      const result = await caller.proxy.createIntent({
        toolName: "send_email",
        toolArgs: { to: "test@test.com", subject: "Test", body: "Hello" },
        breakAnalysis: "Could send to wrong recipient if email is mistyped. Content could be inappropriate.",
      });
      expect(result).toBeDefined();
      expect(result?.intentId).toContain("INT-");
    });

    it("rejects HIGH risk intent without breakAnalysis", async () => {
      const caller = appRouter.createCaller(createAuthContext());
      await expect(
        caller.proxy.createIntent({
          toolName: "send_email",
          toolArgs: { to: "test@test.com", subject: "Test", body: "Hello" },
        })
      ).rejects.toThrow("Break analysis is required for HIGH risk intents");
    });
  });

  describe("proxy.status", () => {
    it("returns proxy status for authenticated user", async () => {
      const caller = appRouter.createCaller(createAuthContext());
      const status = await caller.proxy.status();
      expect(status.proxyUser).toBeDefined();
      expect(status.systemHealth).toBeDefined();
      expect(status.systemHealth.ledgerEntries).toBeGreaterThanOrEqual(0);
    });
  });

  describe("ledger.list", () => {
    it("returns ledger entries for authenticated user", async () => {
      const caller = appRouter.createCaller(createAuthContext());
      const entries = await caller.ledger.list();
      expect(Array.isArray(entries)).toBe(true);
    });
  });

  describe("ledger.verify", () => {
    it("returns verification result for authenticated user", async () => {
      const caller = appRouter.createCaller(createAuthContext());
      const result = await caller.ledger.verify();
      expect(result).toHaveProperty("valid");
      expect(result).toHaveProperty("entries");
      expect(result).toHaveProperty("errors");
    });
  });

  describe("sync.pull", () => {
    it("returns sync data for authenticated user", async () => {
      const caller = appRouter.createCaller(createAuthContext());
      const result = await caller.sync.pull({});
      expect(result).toHaveProperty("entries");
      expect(result).toHaveProperty("totalEntries");
      expect(result).toHaveProperty("chainValid");
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // PHASE 2: Execution Loop Tests
  // ═══════════════════════════════════════════════════════════════

  describe("proxy.execute — core loop", () => {
    it("executes a LOW risk intent (auto-approved, no approval needed)", async () => {
      const caller = appRouter.createCaller(createAuthContext());
      // Onboard first
      await caller.proxy.onboard({ publicKey: "exec-test-key", policyHash: "exec-test-hash" }).catch(() => {});

      // Create LOW risk intent (auto-approved)
      const intent = await caller.proxy.createIntent({
        toolName: "echo",
        toolArgs: { message: "hello world" },
      });
      expect(intent).toBeDefined();

      // Execute it — should dispatch to connector
      const result = await caller.proxy.execute({ intentId: intent!.intentId });
      // echo has no registered connector, so it should fail with NO_CONNECTOR
      // This proves the dispatch path is working
      expect(result.success).toBe(false);
      expect(result.error).toContain("NO_CONNECTOR");
    });

    it("blocks execution of HIGH risk intent without approval", async () => {
      const caller = appRouter.createCaller(createAuthContext());
      await caller.proxy.onboard({ publicKey: "exec-test-key2", policyHash: "exec-test-hash2" }).catch(() => {});

      const intent = await caller.proxy.createIntent({
        toolName: "send_email",
        toolArgs: { to: "test@test.com", subject: "Test", body: "Hello" },
        breakAnalysis: "Could send to wrong recipient",
      });
      expect(intent).toBeDefined();
      expect(intent!.status).toBe("PENDING_APPROVAL");

      // Try to execute without approval — should fail preflight
      const result = await caller.proxy.execute({ intentId: intent!.intentId });
      expect(result.success).toBe(false);
      expect(result.error).toContain("Preflight failed");
      expect(result.preflightResults).toBeDefined();
      const approvalCheck = result.preflightResults!.find((c: any) => c.check === "approval_exists");
      expect(approvalCheck?.status).toBe("FAIL");
    });
  });
});
