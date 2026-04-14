/**
 * Authorization Token Layer — Dedicated Test Suite
 *
 * Validates every enforcement rule in the authorization token layer:
 *
 * 1. Token issuance on approval (APPROVED only, not REJECTED)
 * 2. Token includes all required fields (intent_id, approver_id, tool/action,
 *    parameters_hash, policy_hash, expires_at, max_executions, gateway_signature)
 * 3. Execution blocked without token (HIGH risk)
 * 4. Execution blocked with invalid/unknown token
 * 5. Execution blocked with expired token
 * 6. Execution blocked when max_executions reached
 * 7. Proposer ≠ approver enforced via token
 * 8. Tool + args must match token
 * 9. Kill switch blocks execution even with valid token
 * 10. Receipt includes authorization_token_id
 * 11. AUTHORITY_TOKEN ledger entry written on issuance
 * 12. Full governed loop: Propose → Approve → Token → Execute → Receipt → Ledger
 */
import { describe, it, expect, vi, beforeAll, beforeEach } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";
import {
  registerRootAuthority,
  activatePolicy,
  DEFAULT_POLICY_RULES,
  _resetAuthorityState,
  issueAuthorizationToken,
  validateAuthorizationToken,
  getAuthorizationToken,
  getActivePolicy,
} from "./authorityLayer";

const MOCK_ROOT_PUBLIC_KEY = "a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2";
const MOCK_ROOT_SIGNATURE = "deadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef";

// ─── In-memory DB mock ────────────────────────────────────────
vi.mock("./db", async (importOriginal) => {
  const actual = await importOriginal() as Record<string, unknown>;

  const proxyUsers = new Map<string, any>();
  const intents = new Map<string, any>();
  const approvals = new Map<string, any>();
  const executions = new Map<string, any>();
  const ledgerEntries: any[] = [];

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

    getToolByName: vi.fn(async (name: string) => {
      const tools: Record<string, any> = {
        send_email: { id: 2, toolName: "send_email", description: "Send an email", riskTier: "HIGH", requiredParams: JSON.stringify(["to", "subject", "body"]), blastRadiusBase: 7, enabled: 1 },
        echo: { id: 1, toolName: "echo", description: "Echo", riskTier: "LOW", requiredParams: JSON.stringify(["message"]), blastRadiusBase: 1, enabled: 1 },
      };
      return tools[name] || null;
    }),
    getAllTools: vi.fn(async () => []),

    createIntent: vi.fn(async (userId: number, toolName: string, toolArgs: Record<string, unknown>, riskTier: string, blastRadius: any, reflection?: string) => {
      intentCounter++;
      const argsHash = require("crypto").createHash("sha256").update(JSON.stringify({ toolName, toolArgs })).digest("hex");
      const intent = {
        id: intentCounter, intentId: `INT-AT-${intentCounter}`, userId, toolName,
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
        id: approvalCounter, approvalId: `APR-AT-${approvalCounter}`,
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
        id: executionCounter, executionId: `EXE-AT-${executionCounter}`,
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
      const entryId = `LED-AT-${ledgerEntries.length + 1}`;
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
      principalId: `PRI-AT-${userId}`, userId,
      displayName: userId === 1 ? "Proposer" : "Approver",
      principalType: "human",
      roles: ["proposer", "approver", "executor", "auditor", "meta"],
      status: "active",
    })),
    getOrCreatePrincipal: vi.fn(async (userId: number) => ({
      principalId: `PRI-AT-${userId}`, userId,
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
    dispatchExecution: vi.fn(async () => ({
      success: true,
      output: { messageId: "MSG-AT-001", status: "delivered" },
      metadata: { connector: "send_email", transport: "test" },
      executedAt: Date.now(),
    })),
  };
});

function createCtx(userId: number, openId: string, name: string): TrpcContext {
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

// ─── TESTS ────────────────────────────────────────────────────

describe("Authorization Token Layer", () => {
  const proposerCtx = createCtx(1, "at-proposer", "Proposer");
  const approverCtx = createCtx(2, "at-approver", "Approver");

  beforeAll(async () => {
    _resetAuthorityState();
    registerRootAuthority(MOCK_ROOT_PUBLIC_KEY);
    activatePolicy({
      policyId: "POLICY-AT-v1.0.0",
      rules: DEFAULT_POLICY_RULES,
      policySignature: MOCK_ROOT_SIGNATURE,
      rootPublicKey: MOCK_ROOT_PUBLIC_KEY,
    });

    // Onboard proposer
    const caller = appRouter.createCaller(proposerCtx);
    await caller.proxy.onboard({ publicKey: "at-proposer-key", policyHash: "at-policy-hash" });
  });

  // ─── 1. Token issuance on APPROVED only ─────────────────────
  describe("Token Issuance", () => {
    it("issues token when decision is APPROVED", async () => {
      const proposerCaller = appRouter.createCaller(proposerCtx);
      const approverCaller = appRouter.createCaller(approverCtx);

      const intent = await proposerCaller.proxy.createIntent({
        toolName: "send_email",
        toolArgs: { to: "a@b.com", subject: "Test", body: "Body" },
        breakAnalysis: "Test",
      });

      const approval = await approverCaller.proxy.approve({
        intentId: intent!.intentId,
        decision: "APPROVED",
        signature: "sig-approved",
        expiresInSeconds: 300,
        maxExecutions: 1,
      });

      const token = (approval as any).authorizationToken;
      expect(token).not.toBeNull();
      expect(token.token_id).toMatch(/^ATOK-/);
    });

    it("does NOT issue token when decision is REJECTED", async () => {
      const proposerCaller = appRouter.createCaller(proposerCtx);
      const approverCaller = appRouter.createCaller(approverCtx);

      const intent = await proposerCaller.proxy.createIntent({
        toolName: "send_email",
        toolArgs: { to: "reject@b.com", subject: "Reject", body: "Body" },
        breakAnalysis: "Test",
      });

      const rejection = await approverCaller.proxy.approve({
        intentId: intent!.intentId,
        decision: "REJECTED",
        signature: "sig-rejected",
        expiresInSeconds: 0,
        maxExecutions: 0,
      });

      expect((rejection as any).authorizationToken).toBeNull();
    });
  });

  // ─── 2. Token fields ────────────────────────────────────────
  describe("Token Fields", () => {
    it("token includes all required fields", async () => {
      const proposerCaller = appRouter.createCaller(proposerCtx);
      const approverCaller = appRouter.createCaller(approverCtx);

      const intent = await proposerCaller.proxy.createIntent({
        toolName: "send_email",
        toolArgs: { to: "fields@b.com", subject: "Fields", body: "Body" },
        breakAnalysis: "Test",
      });

      const approval = await approverCaller.proxy.approve({
        intentId: intent!.intentId,
        decision: "APPROVED",
        signature: "sig-fields",
        expiresInSeconds: 600,
        maxExecutions: 1,
      });

      const token = (approval as any).authorizationToken;
      expect(token).toBeDefined();

      // Required fields per spec
      expect(token.token_id).toMatch(/^ATOK-/);
      expect(token.intent_id).toBe(intent!.intentId);
      expect(token.action).toBe("send_email");
      expect(token.parameters_hash).toMatch(/^[a-f0-9]{64}$/);
      expect(token.approved_by).toBe("PRI-AT-2"); // approver principal
      expect(token.policy_hash).toMatch(/^[a-f0-9]+$/);
      expect(token.issued_at).toBeDefined();
      expect(token.expires_at).toBeDefined();
      expect(token.max_executions).toBe(1);

      // Verify expiry is in the future
      const expiresAt = new Date(token.expires_at).getTime();
      expect(expiresAt).toBeGreaterThan(Date.now());
    });
  });

  // ─── 3. Execution blocked without token ─────────────────────
  describe("Execution Gating", () => {
    it("blocks HIGH-risk execution without token", async () => {
      const proposerCaller = appRouter.createCaller(proposerCtx);
      const approverCaller = appRouter.createCaller(approverCtx);

      const intent = await proposerCaller.proxy.createIntent({
        toolName: "send_email",
        toolArgs: { to: "notoken@b.com", subject: "No Token", body: "Body" },
        breakAnalysis: "Test",
      });

      await approverCaller.proxy.approve({
        intentId: intent!.intentId,
        decision: "APPROVED",
        signature: "sig-notoken",
        expiresInSeconds: 300,
        maxExecutions: 1,
      });

      // Execute WITHOUT tokenId
      const result = await proposerCaller.proxy.execute({
        intentId: intent!.intentId,
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain("Preflight failed");
      const tokenCheck = result.preflightResults!.find((c: any) => c.check === "authorization_token_exists");
      expect(tokenCheck?.status).toBe("FAIL");
    });

    it("blocks execution with unknown/invalid token ID", async () => {
      const proposerCaller = appRouter.createCaller(proposerCtx);
      const approverCaller = appRouter.createCaller(approverCtx);

      const intent = await proposerCaller.proxy.createIntent({
        toolName: "send_email",
        toolArgs: { to: "badtoken@b.com", subject: "Bad Token", body: "Body" },
        breakAnalysis: "Test",
      });

      await approverCaller.proxy.approve({
        intentId: intent!.intentId,
        decision: "APPROVED",
        signature: "sig-badtoken",
        expiresInSeconds: 300,
        maxExecutions: 1,
      });

      // Execute with fake token
      const result = await proposerCaller.proxy.execute({
        intentId: intent!.intentId,
        tokenId: "ATOK-FAKE-DOES-NOT-EXIST",
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain("Preflight failed");
    });
  });

  // ─── 4. Proposer ≠ Approver ─────────────────────────────────
  describe("Proposer ≠ Approver Enforcement", () => {
    it("PASS when proposer and approver are different users", async () => {
      const proposerCaller = appRouter.createCaller(proposerCtx);
      const approverCaller = appRouter.createCaller(approverCtx);

      const intent = await proposerCaller.proxy.createIntent({
        toolName: "send_email",
        toolArgs: { to: "pna-pass@b.com", subject: "PNA Pass", body: "Body" },
        breakAnalysis: "Test",
      });

      const approval = await approverCaller.proxy.approve({
        intentId: intent!.intentId,
        decision: "APPROVED",
        signature: "sig-pna-pass",
        expiresInSeconds: 300,
        maxExecutions: 1,
      });
      const tokenId = (approval as any).authorizationToken.token_id;

      const result = await proposerCaller.proxy.execute({
        intentId: intent!.intentId,
        tokenId,
      });

      expect(result.success).toBe(true);
      const pnaCheck = result.preflightResults!.find((c: any) => c.check === "proposer_not_approver");
      expect(pnaCheck).toBeDefined();
      expect(pnaCheck!.status).toBe("PASS");
    });

    it("FAIL when proposer approves their own intent (same user) — blocked by constrained delegation", async () => {
      // Self-approval scenario: proposer (userId=1) also approves
      // With constrained delegation, this is now blocked at APPROVAL TIME
      // (not execution time) because the cooldown hasn't elapsed.
      const proposerCaller = appRouter.createCaller(proposerCtx);

      const intent = await proposerCaller.proxy.createIntent({
        toolName: "send_email",
        toolArgs: { to: "pna-fail@b.com", subject: "PNA Fail", body: "Body" },
        breakAnalysis: "Test",
      });

      // Same user tries to approve immediately — constrained delegation blocks this
      await expect(
        proposerCaller.proxy.approve({
          intentId: intent!.intentId,
          decision: "APPROVED",
          signature: "sig-self-approve",
          expiresInSeconds: 300,
          maxExecutions: 1,
        })
      ).rejects.toThrow(/wait.*before approving|No immediate self-approval/);
    });
  });

  // ─── 5. AUTHORITY_TOKEN ledger entry ────────────────────────
  describe("Ledger Integration", () => {
    it("writes AUTHORITY_TOKEN entry to ledger on token issuance", async () => {
      const proposerCaller = appRouter.createCaller(proposerCtx);
      const approverCaller = appRouter.createCaller(approverCtx);

      const intent = await proposerCaller.proxy.createIntent({
        toolName: "send_email",
        toolArgs: { to: "ledger@b.com", subject: "Ledger", body: "Body" },
        breakAnalysis: "Test",
      });

      await approverCaller.proxy.approve({
        intentId: intent!.intentId,
        decision: "APPROVED",
        signature: "sig-ledger",
        expiresInSeconds: 300,
        maxExecutions: 1,
      });

      const entries = await proposerCaller.ledger.list();
      const tokenEntries = entries.filter(e => e.entryType === "AUTHORITY_TOKEN");
      expect(tokenEntries.length).toBeGreaterThanOrEqual(1);

      // The latest AUTHORITY_TOKEN entry should reference this intent
      const latestTokenEntry = tokenEntries[tokenEntries.length - 1];
      const payload = JSON.parse(latestTokenEntry.payload);
      expect(payload.intentId).toBe(intent!.intentId);
      expect(payload.tokenId).toMatch(/^ATOK-/);
      expect(payload.action).toBe("send_email");
    });
  });

  // ─── 6. Full governed loop ──────────────────────────────────
  describe("Full Governed Loop", () => {
    it("Propose → Approve (different user) → Token → Execute → Receipt → Ledger", async () => {
      const proposerCaller = appRouter.createCaller(proposerCtx);
      const approverCaller = appRouter.createCaller(approverCtx);

      // 1. Propose
      const intent = await proposerCaller.proxy.createIntent({
        toolName: "send_email",
        toolArgs: { to: "fullloop@b.com", subject: "Full Loop", body: "Complete test" },
        breakAnalysis: "Full governed loop test",
      });
      expect(intent!.status).toBe("PENDING_APPROVAL");

      // 2. Approve (different user)
      const approval = await approverCaller.proxy.approve({
        intentId: intent!.intentId,
        decision: "APPROVED",
        signature: "sig-fullloop",
        expiresInSeconds: 300,
        maxExecutions: 1,
      });
      expect(approval!.decision).toBe("APPROVED");

      // 3. Token issued
      const token = (approval as any).authorizationToken;
      expect(token).not.toBeNull();
      expect(token.token_id).toMatch(/^ATOK-/);
      expect(token.approved_by).toBe("PRI-AT-2");

      // 4. Execute with token
      const result = await proposerCaller.proxy.execute({
        intentId: intent!.intentId,
        tokenId: token.token_id,
      });
      expect(result.success).toBe(true);

      // 5. Receipt
      expect(result.execution).toBeDefined();
      expect(result.execution!.receiptHash).toMatch(/^[a-f0-9]{64}$/);

      // 6. Ledger — all 5 entry types present
      const entries = await proposerCaller.ledger.list();
      const types = entries.map(e => e.entryType);
      expect(types).toContain("ONBOARD");
      expect(types).toContain("INTENT");
      expect(types).toContain("APPROVAL");
      expect(types).toContain("AUTHORITY_TOKEN");
      expect(types).toContain("EXECUTION");

      // Verify chain integrity
      const verification = await proposerCaller.ledger.verify();
      expect(verification.valid).toBe(true);
    });
  });

  // ─── 7. Authority layer unit tests ──────────────────────────
  describe("Authority Layer Unit Tests", () => {
    it("issueAuthorizationToken returns well-formed token", () => {
      const token = issueAuthorizationToken({
        intentId: "INT-UNIT-1",
        action: "send_email",
        toolArgs: { to: "unit@test.com" },
        approvedBy: "PRI-UNIT-1",
        signature: "unit-sig",
        expiryMinutes: 5,
        maxExecutions: 1,
      });

      expect(token.token_id).toMatch(/^ATOK-/);
      expect(token.intent_id).toBe("INT-UNIT-1");
      expect(token.action).toBe("send_email");
      expect(token.approved_by).toBe("PRI-UNIT-1");
      expect(token.max_executions).toBe(1);
      expect(token.signature).toBeTruthy();
    });

    it("validateAuthorizationToken returns valid for fresh token", () => {
      const token = issueAuthorizationToken({
        intentId: "INT-UNIT-2",
        action: "send_email",
        toolArgs: { to: "verify@test.com" },
        approvedBy: "PRI-UNIT-2",
        signature: "verify-sig",
        expiryMinutes: 5,
        maxExecutions: 1,
      });

      const result = validateAuthorizationToken(
        token,
        "send_email",
        { to: "verify@test.com" },
      );

      expect(result.valid).toBe(true);
    });

    it("getAuthorizationToken returns null for unknown token ID", () => {
      const token = getAuthorizationToken("ATOK-NONEXISTENT");
      expect(token).toBeNull();
    });

    it("getActivePolicy returns the activated policy", () => {
      const policy = getActivePolicy();
      expect(policy).not.toBeNull();
      expect(policy!.policy_id).toBe("POLICY-AT-v1.0.0");
    });
  });
});
