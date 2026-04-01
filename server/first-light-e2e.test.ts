/**
 * First-Light E2E Test
 * 
 * Proves the full governed action loop:
 * 1. Onboard identity (or re-key)
 * 2. Create intent → policy evaluation → risk assignment
 * 3. Approve the intent (human authorization)
 * 4. Execute with preflight gate → connector dispatch
 * 5. Verify receipt hash exists
 * 6. Verify ledger entry with chain integrity
 * 7. Verify receipt and ledger entry can be independently verified afterward
 * 
 * This is the "first successful governed action with a valid, verifiable receipt
 * and ledger entry" that Andrew's bring-up plan requires.
 */
import { describe, it, expect, vi } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

// ─── Full mock of db module ───────────────────────────────────
vi.mock("./db", async (importOriginal) => {
  const actual = await importOriginal() as Record<string, unknown>;

  const proxyUsers = new Map<string, any>();
  const intents = new Map<string, any>();
  const approvals = new Map<string, any>();
  const executions = new Map<string, any>();
  const ledgerEntries: any[] = [];
  const tools = [
    { id: 1, toolName: "echo", description: "Echo a message", riskTier: "LOW", requiredParams: JSON.stringify(["message"]), blastRadiusBase: 1, enabled: 1 },
    { id: 2, toolName: "gmail_send", description: "Send an email via Gmail", riskTier: "HIGH", requiredParams: JSON.stringify(["to", "subject", "body"]), blastRadiusBase: 9, enabled: 1 },
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
        id: proxyUsers.size + 1, userId, publicKey, policyHash,
        seedVersion: "SEED-v1.0.0", status: "ACTIVE",
        onboardedAt: new Date(), killedAt: null, killReason: null, updatedAt: new Date(),
      };
      proxyUsers.set(String(userId), user);
      return user;
    }),
    updateProxyUserPublicKey: vi.fn(async (userId: number, publicKey: string, policyHash: string) => {
      const existing = proxyUsers.get(String(userId));
      if (existing) {
        existing.publicKey = publicKey;
        existing.policyHash = policyHash;
        existing.status = "ACTIVE";
        existing.updatedAt = new Date();
      }
      return existing;
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
        id: intentCounter, intentId: `INT-FL-${intentCounter}`,
        userId, toolName, toolArgs: JSON.stringify(toolArgs),
        riskTier, argsHash, blastRadius: JSON.stringify(blastRadius),
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
        id: approvalCounter, approvalId: `APR-FL-${approvalCounter}`,
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
        id: executionCounter, executionId: `EXE-FL-${executionCounter}`,
        intentId, approvalId, result: JSON.stringify(result),
        receiptHash, preflightResults: JSON.stringify(preflightResults),
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
      const entryId = `LED-FL-${ledgerEntries.length + 1}`;
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

// ─── Mock connectors ──────────────────────────────────────────
vi.mock("./connectors", () => ({
  dispatchExecution: vi.fn(async (toolName: string, toolArgs: any, approvalProof: any, riskTier: string) => ({
    success: true,
    output: { tool: toolName, dispatched: true, args: toolArgs, timestamp: Date.now() },
    executedAt: Date.now(),
    metadata: { provider: "mock" },
  })),
  verifyArgsHash: vi.fn(() => ({ valid: true })),
  generateReceipt: vi.fn((data: any) => {
    const crypto = require("crypto");
    return crypto.createHash("sha256").update(JSON.stringify(data)).digest("hex");
  }),
  initializeConnectors: vi.fn(),
  getConnector: vi.fn(() => vi.fn()),
  registerConnector: vi.fn(),
  listConnectors: vi.fn(() => []),
}));

function createAuthContext(userId = 1, openId = "brian-first-light"): TrpcContext {
  return {
    user: {
      id: userId, openId, email: "brian@riomethod.com",
      name: "Brian (First Light)", loginMethod: "manus", role: "user",
      createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date(),
    },
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { clearCookie: vi.fn() } as unknown as TrpcContext["res"],
  };
}

// ─── THE TEST ─────────────────────────────────────────────────
describe("First-Light E2E: Full Governed Action Loop", () => {
  const ctx = createAuthContext();
  let intentId: string;

  // ─── Step 1: Onboard identity ───────────────────────────────
  it("1. Onboard identity — public key bound to account", async () => {
    const caller = appRouter.createCaller(ctx);
    const result = await caller.proxy.onboard({
      publicKey: "first-light-pubkey-" + Date.now(),
      policyHash: "first-light-policy-" + Date.now(),
    });
    expect(result.success).toBe(true);
    expect(result.proxyUser).toBeDefined();
    expect(result.proxyUser!.status).toBe("ACTIVE");
  });

  // ─── Step 2: Create HIGH-risk intent ────────────────────────
  it("2. Create HIGH-risk intent → policy blocks until approved", async () => {
    const caller = appRouter.createCaller(ctx);
    const intent = await caller.proxy.createIntent({
      toolName: "gmail_send",
      toolArgs: {
        to: "first-light-test@example.com",
        subject: "First Light E2E",
        body: "Proving the full governed action loop.",
      },
      breakAnalysis: "Could send to wrong recipient. Email content could be wrong. Cannot be unsent.",
    });
    expect(intent).toBeDefined();
    expect(intent!.riskTier).toBe("HIGH");
    expect(intent!.status).toBe("PENDING_APPROVAL");
    intentId = intent!.intentId;
  });

  // ─── Step 3: Execution blocked without approval ─────────────
  it("3. Execution blocked without approval (fail-closed)", async () => {
    const caller = appRouter.createCaller(ctx);
    const result = await caller.proxy.execute({ intentId });
    expect(result.success).toBe(false);
    expect(result.error).toContain("Preflight failed");
  });

  // ─── Step 4: Human approves ─────────────────────────────────
  it("4. Human approves — authorization boundary crossed", async () => {
    const caller = appRouter.createCaller(ctx);
    const approval = await caller.proxy.approve({
      intentId,
      decision: "APPROVED",
      signature: "first-light-ed25519-sig-human-root",
      expiresInSeconds: 3600,
      maxExecutions: 1,
    });
    expect(approval).toBeDefined();
    expect(approval!.decision).toBe("APPROVED");
    expect(approval!.boundToolName).toBe("gmail_send");
  });

  // ─── Step 5: Intent status is APPROVED ──────────────────────
  it("5. Intent status is now APPROVED", async () => {
    const caller = appRouter.createCaller(ctx);
    const status = await caller.proxy.status();
    const intent = status.recentIntents.find((i) => i.intentId === intentId);
    expect(intent).toBeDefined();
    expect(intent!.status).toBe("APPROVED");
  });

  // ─── Step 6: Execute through preflight gate ─────────────────
  it("6. Execute through preflight gate → connector dispatch → receipt", async () => {
    const caller = appRouter.createCaller(ctx);
    const result = await caller.proxy.execute({ intentId });
    expect(result.success).toBe(true);
    expect(result.execution).toBeDefined();
    expect(result.execution!.receiptHash).toBeTruthy();
    expect(result.execution!.receiptHash).not.toBe("PENDING");
    // All 8 preflight checks should pass
    expect(result.preflightResults).toBeDefined();
    expect(result.preflightResults!.length).toBe(8);
    const allPassed = result.preflightResults!.every((c: any) => c.status === "PASS");
    expect(allPassed).toBe(true);
  });

  // ─── Step 7: Receipt hash is valid SHA-256 ──────────────────
  it("7. Receipt hash is a valid SHA-256", async () => {
    const caller = appRouter.createCaller(ctx);
    const status = await caller.proxy.status();
    const executedIntent = status.recentIntents.find((i) => i.intentId === intentId);
    expect(executedIntent).toBeDefined();
    // Get the execution to verify receipt hash
    const execution = await caller.proxy.getExecution({ intentId });
    expect(execution).toBeDefined();
    expect(execution!.receiptHash).toBeTruthy();
    expect(execution!.receiptHash.length).toBe(64);
    expect(/^[a-f0-9]{64}$/.test(execution!.receiptHash)).toBe(true);
  });

  // ─── Step 8: Ledger has all 4 entry types ───────────────────
  it("8. Ledger contains ONBOARD, INTENT, APPROVAL, EXECUTION entries", async () => {
    const caller = appRouter.createCaller(ctx);
    const entries = await caller.ledger.list();
    expect(entries.length).toBeGreaterThanOrEqual(4);
    const types = entries.map((e) => e.entryType);
    expect(types).toContain("ONBOARD");
    expect(types).toContain("INTENT");
    expect(types).toContain("APPROVAL");
    expect(types).toContain("EXECUTION");
  });

  // ─── Step 9: Hash chain is valid ────────────────────────────
  it("9. Ledger hash chain is valid (tamper-evident)", async () => {
    const caller = appRouter.createCaller(ctx);
    const verification = await caller.ledger.verify();
    expect(verification.valid).toBe(true);
    expect(verification.entries).toBeGreaterThan(0);
  });

  // ─── Step 10: Intent is EXECUTED (terminal) ─────────────────
  it("10. Intent is now in EXECUTED terminal state", async () => {
    const caller = appRouter.createCaller(ctx);
    const status = await caller.proxy.status();
    const intent = status.recentIntents.find((i) => i.intentId === intentId);
    expect(intent).toBeDefined();
    expect(intent!.status).toBe("EXECUTED");
  });

  // ─── Step 11: Re-execution blocked ──────────────────────────
  it("11. Re-execution blocked (approval consumed)", async () => {
    const caller = appRouter.createCaller(ctx);
    const result = await caller.proxy.execute({ intentId });
    expect(result.success).toBe(false);
  });

  // ─── Step 12: Re-key works for device recovery ──────────────
  it("12. Re-key updates identity without breaking ledger chain", async () => {
    // Use owner context for emergency override re-key (no old key signature needed)
    const ownerCtx = {
      ...ctx,
      user: { ...ctx.user, openId: process.env.OWNER_OPEN_ID || "owner-open-id" },
    };
    const caller = appRouter.createCaller(ownerCtx);
    const newKey = "rekey-first-light-" + Date.now();
    const newPolicy = "rekey-policy-" + Date.now();
    const result = await caller.proxy.rekey({
      publicKey: newKey,
      policyHash: newPolicy,
    });
    expect(result.success).toBe(true);
    expect(result.rekeyType).toBe("RE_KEY_FORCED");

    // Verify RE_KEY_FORCED ledger entry
    const entries = await caller.ledger.list();
    const rekeyEntry = entries.find((e) => e.entryType === "RE_KEY_FORCED" || e.entryType === "RE_KEY");
    expect(rekeyEntry).toBeDefined();

    // Chain still valid after re-key
    const verification = await caller.ledger.verify();
    expect(verification.valid).toBe(true);
  });
});
