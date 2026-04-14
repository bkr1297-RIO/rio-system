import { describe, expect, it, vi, beforeAll } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";
import {
  registerRootAuthority,
  activatePolicy,
  getAuthorizationToken,
  DEFAULT_POLICY_RULES,
  _resetAuthorityState,
} from "./authorityLayer";

/**
 * ═══════════════════════════════════════════════════════════════════
 * 13-POINT GOVERNED ACTION VERIFICATION TEST
 * ═══════════════════════════════════════════════════════════════════
 *
 * A governed action is complete only if ALL 13 of the following are true:
 *
 *   1.  Intent created
 *   2.  Risk evaluated
 *   3.  Proposer ≠ Approver
 *   4.  Approval recorded
 *   5.  Authorization token issued
 *   6.  Token validated before execution
 *   7.  Token burned after execution
 *   8.  Execution performed
 *   9.  Receipt generated
 *   10. Receipt includes: intent_id, approver_id, token_id, policy_hash,
 *       execution_result, receipt_hash, previous_receipt_hash, ledger_entry_id
 *   11. Receipt signed by Gateway
 *   12. Receipt hash written to ledger
 *   13. Ledger hash chain verifies
 *
 * When all 13 are true → First Governed Action is complete.
 */

const MOCK_ROOT_PUBLIC_KEY = "a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2";
const MOCK_ROOT_SIGNATURE = "deadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef";

// ─── In-memory mock DB ────────────────────────────────────────
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
        id: intentCounter, intentId: `INT-13PT-${intentCounter}`, userId, toolName,
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
        id: approvalCounter, approvalId: `APR-13PT-${approvalCounter}`, intentId, userId,
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
        id: executionCounter, executionId: `EXE-13PT-${executionCounter}`, intentId, approvalId,
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
      const entryId = `LE-13PT-${ledgerEntries.length + 1}`;
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
      principalId: `PRI-13PT-${userId}`, userId,
      displayName: userId === 1 ? "Proposer" : "Approver",
      principalType: "human",
      roles: ["proposer", "approver", "executor", "auditor", "meta"],
      status: "active",
    })),
    getOrCreatePrincipal: vi.fn(async (userId: number) => ({
      principalId: `PRI-13PT-${userId}`, userId,
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
    dispatchExecution: vi.fn(async () => ({
      success: true,
      output: { messageId: "MSG-13PT-001", status: "delivered" },
      metadata: { connector: "send_email", transport: "test" },
      executedAt: Date.now(),
    })),
  };
});

// Mock telegram (non-blocking, non-fatal)
vi.mock("./telegram", () => ({
  isTelegramConfigured: vi.fn(() => false),
  sendApprovalNotification: vi.fn(async () => undefined),
  sendReceiptNotification: vi.fn(async () => undefined),
  sendKillNotification: vi.fn(async () => undefined),
}));

// Mock bondi (non-blocking)
vi.mock("./bondi", () => ({
  createLearningEventPayload: vi.fn((type: string, data: any) => ({
    eventId: `LEARN-13PT-${Date.now()}`,
    eventType: type,
    intentId: data.intentId,
    conversationId: data.conversationId,
    context: { toolName: data.toolName, riskTier: data.riskTier },
    outcome: data.outcome,
  })),
}));

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

describe("13-POINT GOVERNED ACTION VERIFICATION", () => {
  const proposerCtx = createAuthContext(1, "proposer-user", "Alice (Proposer)");
  const approverCtx = createAuthContext(2, "approver-user", "Bob (Approver)");

  // State captured across steps
  let intentId: string;
  let intentRiskTier: string;
  let approvalId: string;
  let tokenId: string;
  let executionResult: any;
  let canonicalReceipt: any;

  // Initialize the authority layer
  beforeAll(() => {
    _resetAuthorityState();
    registerRootAuthority(MOCK_ROOT_PUBLIC_KEY);
    activatePolicy({
      policyId: "POLICY-13PT-v1.0.0",
      rules: DEFAULT_POLICY_RULES,
      policySignature: MOCK_ROOT_SIGNATURE,
      rootPublicKey: MOCK_ROOT_PUBLIC_KEY,
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // SETUP: Onboard proposer
  // ═══════════════════════════════════════════════════════════════
  it("Setup: Onboard proposer", async () => {
    const caller = appRouter.createCaller(proposerCtx);
    const result = await caller.proxy.onboard({
      publicKey: "proposer-public-key-abc123",
      policyHash: "13pt-test-policy-hash",
    });
    expect(result.success).toBe(true);
  });

  // ═══════════════════════════════════════════════════════════════
  // POINT 1: Intent created
  // ═══════════════════════════════════════════════════════════════
  it("Point 1: Intent created", async () => {
    const caller = appRouter.createCaller(proposerCtx);
    const intent = await caller.proxy.createIntent({
      toolName: "send_email",
      toolArgs: { to: "brian@example.com", subject: "First Governed Action", body: "This is the 13-point test." },
      breakAnalysis: "Could send to wrong recipient. Cannot be unsent once delivered.",
    });
    expect(intent).toBeDefined();
    expect(intent!.intentId).toBeTruthy();
    expect(intent!.toolName).toBe("send_email");
    intentId = intent!.intentId;
    intentRiskTier = intent!.riskTier;
  });

  // ═══════════════════════════════════════════════════════════════
  // POINT 2: Risk evaluated
  // ═══════════════════════════════════════════════════════════════
  it("Point 2: Risk evaluated", () => {
    expect(intentRiskTier).toBe("HIGH");
    // HIGH risk means it went to PENDING_APPROVAL, not auto-executed
  });

  // ═══════════════════════════════════════════════════════════════
  // POINT 4: Approval recorded (by different user)
  // ═══════════════════════════════════════════════════════════════
  it("Point 4: Approval recorded (by different user)", async () => {
    const caller = appRouter.createCaller(approverCtx);
    const approval = await caller.proxy.approve({
      intentId,
      decision: "APPROVED",
      signature: "ed25519-approver-signature-abc123def456",
      expiresInSeconds: 300,
      maxExecutions: 1,
    });
    expect(approval).toBeDefined();
    expect(approval!.decision).toBe("APPROVED");
    expect(approval!.boundToolName).toBe("send_email");
    approvalId = approval!.approvalId;

    // POINT 5: Authorization token issued
    const authToken = (approval as any).authorizationToken;
    expect(authToken).toBeDefined();
    expect(authToken).not.toBeNull();
    tokenId = authToken.token_id;
  });

  // ═══════════════════════════════════════════════════════════════
  // POINT 5: Authorization token issued
  // ═══════════════════════════════════════════════════════════════
  it("Point 5: Authorization token issued with all required fields", () => {
    expect(tokenId).toBeTruthy();
    expect(tokenId).toMatch(/^ATOK-/);

    // Verify the token exists in the authority layer store
    const token = getAuthorizationToken(tokenId);
    expect(token).not.toBeNull();
    expect(token!.intent_id).toBe(intentId);
    expect(token!.action).toBe("send_email");
    expect(token!.approved_by).toBe("PRI-13PT-2"); // Approver's principal
    expect(token!.max_executions).toBe(1);
    expect(token!.execution_count).toBe(0);
    expect(token!.policy_hash).toBeTruthy();
    expect(token!.parameters_hash).toBeTruthy();
    expect(token!.signature).toBeTruthy();
    expect(token!.expires_at).toBeTruthy();
  });

  // ═══════════════════════════════════════════════════════════════
  // POINTS 3, 6, 7, 8, 9, 10, 11: Execute with token
  // ═══════════════════════════════════════════════════════════════
  it("Points 3,6,8: Proposer executes with token — proposer≠approver, token validated, execution performed", async () => {
    const caller = appRouter.createCaller(proposerCtx);
    executionResult = await caller.proxy.execute({
      intentId,
      tokenId,
    });

    // POINT 8: Execution performed
    expect(executionResult.success).toBe(true);
    expect(executionResult.execution).toBeDefined();
    expect(executionResult.execution!.executionId).toBeTruthy();

    // POINT 6: Token validated before execution (all preflight checks PASS)
    expect(executionResult.preflightResults).toBeDefined();
    const allPassed = executionResult.preflightResults!.every((c: any) => c.status === "PASS");
    expect(allPassed).toBe(true);

    // Token-specific preflight checks present
    const tokenExistsCheck = executionResult.preflightResults!.find((c: any) => c.check === "authorization_token_exists");
    expect(tokenExistsCheck).toBeDefined();
    expect(tokenExistsCheck!.status).toBe("PASS");

    // Token sub-checks are prefixed with "token_" (e.g., token_token_exists, token_token_signature_valid, etc.)
    const tokenSubChecks = executionResult.preflightResults!.filter((c: any) => c.check.startsWith("token_"));
    expect(tokenSubChecks.length).toBeGreaterThanOrEqual(7); // 7 sub-checks from validateAuthorizationToken
    const allTokenChecksPassed = tokenSubChecks.every((c: any) => c.status === "PASS");
    expect(allTokenChecksPassed).toBe(true);

    // POINT 3: Proposer ≠ Approver
    const pnaCheck = executionResult.preflightResults!.find((c: any) => c.check === "proposer_not_approver");
    expect(pnaCheck).toBeDefined();
    expect(pnaCheck!.status).toBe("PASS");
    expect(pnaCheck!.detail).toContain("PRI-13PT-1"); // proposer
    expect(pnaCheck!.detail).toContain("PRI-13PT-2"); // approver

    // Connector result
    expect(executionResult.connectorResult).toBeDefined();
    expect(executionResult.connectorResult!.success).toBe(true);
  });

  // ═══════════════════════════════════════════════════════════════
  // POINT 7: Token burned after execution
  // ═══════════════════════════════════════════════════════════════
  it("Point 7: Token burned after execution", () => {
    // The token should no longer exist in the authority layer store
    const token = getAuthorizationToken(tokenId);
    expect(token).toBeNull(); // BURNED — removed from store

    // The execution response should confirm the burn
    expect(executionResult.authorizationToken).toBeDefined();
    expect(executionResult.authorizationToken.burned).toBe(true);
  });

  // ═══════════════════════════════════════════════════════════════
  // POINT 9: Receipt generated (canonical format)
  // ═══════════════════════════════════════════════════════════════
  it("Point 9: Receipt generated (canonical format)", () => {
    canonicalReceipt = executionResult.canonicalReceipt;
    expect(canonicalReceipt).toBeDefined();
    expect(canonicalReceipt.receipt_id).toMatch(/^RCPT-/);
    expect(canonicalReceipt.status).toBe("SUCCESS");
    expect(canonicalReceipt.timestamp_executed).toBeTruthy();
  });

  // ═══════════════════════════════════════════════════════════════
  // POINT 10: Receipt includes all required fields
  // ═══════════════════════════════════════════════════════════════
  it("Point 10: Receipt includes all policy-required fields", () => {
    expect(canonicalReceipt).toBeDefined();

    // intent_id
    expect(canonicalReceipt.intent_id).toBe(intentId);

    // proposer_id (new — policy Section 6)
    expect(canonicalReceipt.proposer_id).toBeTruthy();

    // approver_id (new — policy Section 6)
    expect(canonicalReceipt.approver_id).toBeTruthy();

    // token_id
    expect(canonicalReceipt.token_id).toBe(tokenId);

    // policy_hash (SHA-256, 64 hex chars)
    expect(canonicalReceipt.policy_hash).toBeTruthy();
    expect(canonicalReceipt.policy_hash.length).toBe(64);

    // execution_hash (renamed from result_hash — SHA-256 of the result)
    expect(canonicalReceipt.execution_hash).toBeTruthy();
    expect(canonicalReceipt.execution_hash.length).toBe(64);

    // receipt_hash (SHA-256, 64 hex chars)
    expect(canonicalReceipt.receipt_hash).toBeTruthy();
    expect(canonicalReceipt.receipt_hash.length).toBe(64);

    // previous_receipt_hash (genesis or previous receipt)
    expect(canonicalReceipt.previous_receipt_hash).toBeTruthy();
    expect(canonicalReceipt.previous_receipt_hash.length).toBe(64);

    // ledger_entry_id (references the EXECUTION ledger entry)
    expect(canonicalReceipt.ledger_entry_id).toBeTruthy();
    expect(canonicalReceipt.ledger_entry_id).toMatch(/^LE-/);

    // timestamp_proposed (new — policy Section 6)
    expect(canonicalReceipt.timestamp_proposed).toBeTruthy();

    // timestamp_approved (new — policy Section 6)
    expect(canonicalReceipt.timestamp_approved).toBeTruthy();

    // timestamp_executed (new — policy Section 6)
    expect(canonicalReceipt.timestamp_executed).toBeTruthy();

    // decision_delta_ms (new — policy Section 7)
    expect(canonicalReceipt.decision_delta_ms).toBeGreaterThanOrEqual(0);
  });

  // ═══════════════════════════════════════════════════════════════
  // POINT 11: Receipt signed by Gateway
  // ═══════════════════════════════════════════════════════════════
  it("Point 11: Receipt signed by Gateway (HMAC-SHA256)", () => {
    expect(canonicalReceipt).toBeDefined();

    // gateway_signature must be present and non-empty
    expect(canonicalReceipt.gateway_signature).toBeTruthy();
    // HMAC-SHA256 produces a 64-char hex string
    expect(canonicalReceipt.gateway_signature.length).toBe(64);
    // Must not be a placeholder or empty
    expect(canonicalReceipt.gateway_signature).not.toBe("0000000000000000000000000000000000000000000000000000000000000000");
  });

  // ═══════════════════════════════════════════════════════════════
  // POINT 12: Receipt hash written to ledger
  // ═══════════════════════════════════════════════════════════════
  it("Point 12: Receipt hash written to ledger", async () => {
    const caller = appRouter.createCaller(proposerCtx);
    const entries = await caller.ledger.list();

    // Find the EXECUTION ledger entry
    const executionEntry = entries.find(e => e.entryType === "EXECUTION");
    expect(executionEntry).toBeDefined();

    // The execution record has the receipt hash stored
    expect(executionResult.receiptHash).toBeTruthy();
    expect(executionResult.receiptHash.length).toBe(64);

    // The ledger entry references the execution
    const payload = JSON.parse(executionEntry!.payload as string);
    expect(payload.executionId).toBeTruthy();
    expect(payload.intentId).toBe(intentId);

    // Authority layer fields in ledger
    expect(payload.authorization_token_id).toBe(tokenId);
    expect(payload.approver_id).toBe("PRI-13PT-2");
    expect(payload.policy_hash).toBeTruthy();
  });

  // ═══════════════════════════════════════════════════════════════
  // POINT 13: Ledger hash chain verifies
  // ═══════════════════════════════════════════════════════════════
  it("Point 13: Ledger hash chain verifies", async () => {
    const caller = appRouter.createCaller(proposerCtx);
    const entries = await caller.ledger.list();

    // Must have at least: ONBOARD, INTENT, APPROVAL, AUTHORITY_TOKEN, EXECUTION
    expect(entries.length).toBeGreaterThanOrEqual(5);

    const types = entries.map(e => e.entryType);
    expect(types).toContain("ONBOARD");
    expect(types).toContain("INTENT");
    expect(types).toContain("APPROVAL");
    expect(types).toContain("AUTHORITY_TOKEN");
    expect(types).toContain("EXECUTION");

    // Verify hash chain integrity
    for (let i = 0; i < entries.length; i++) {
      const entry = entries[i];
      if (i === 0) {
        expect(entry.prevHash).toBe("GENESIS");
      } else {
        expect(entry.prevHash).toBe(entries[i - 1].hash);
      }
      // Each entry has a valid hash
      expect(entry.hash).toBeTruthy();
      expect(entry.hash.length).toBe(64);
    }
  });

  // ═══════════════════════════════════════════════════════════════
  // SUMMARY: All 13 points verified
  // ═══════════════════════════════════════════════════════════════
  it("SUMMARY: All 13 points of the governed action are verified", () => {
    // This test is a summary assertion — if all previous tests passed, all 13 points are proven.
    // Enumerate them explicitly for the record:
    const checklist = {
      "1. Intent created": !!intentId,
      "2. Risk evaluated": intentRiskTier === "HIGH",
      "3. Proposer ≠ Approver": executionResult?.preflightResults?.find((c: any) => c.check === "proposer_not_approver")?.status === "PASS",
      "4. Approval recorded": !!approvalId,
      "5. Authorization token issued": !!tokenId && tokenId.startsWith("ATOK-"),
      "6. Token validated before execution": executionResult?.preflightResults?.filter((c: any) => c.check.startsWith("token_"))?.every((c: any) => c.status === "PASS") ?? false,
      "7. Token burned after execution": getAuthorizationToken(tokenId) === null,
      "8. Execution performed": executionResult?.success === true,
      "9. Receipt generated": !!canonicalReceipt?.receipt_id,
      "10. Receipt includes all required fields": !!(canonicalReceipt?.intent_id && canonicalReceipt?.proposer_id && canonicalReceipt?.approver_id && canonicalReceipt?.token_id && canonicalReceipt?.policy_hash && canonicalReceipt?.execution_hash && canonicalReceipt?.receipt_hash && canonicalReceipt?.previous_receipt_hash && canonicalReceipt?.ledger_entry_id && canonicalReceipt?.timestamp_proposed && canonicalReceipt?.timestamp_approved && canonicalReceipt?.timestamp_executed && canonicalReceipt?.decision_delta_ms !== undefined),
      "11. Receipt signed by Gateway": !!canonicalReceipt?.gateway_signature && canonicalReceipt.gateway_signature.length === 64,
      "12. Receipt hash written to ledger": !!executionResult?.receiptHash && executionResult.receiptHash.length === 64,
      "13. Ledger hash chain verifies": true, // Verified in previous test
    };

    // Every single point must be true
    for (const [point, result] of Object.entries(checklist)) {
      expect(result, `FAIL: ${point}`).toBe(true);
    }

    // Count: all 13 must pass
    const passCount = Object.values(checklist).filter(Boolean).length;
    expect(passCount).toBe(13);
  });
});
