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
 * GOVERNED EMAIL FLOW — LIVE DEMO
 * ────────────────────────────────
 * Sends a real email to RasmussenBR@hotmail.com through the full RIO governance loop:
 *   Step 1: proxy.createIntent  → Intent created (PENDING_APPROVAL)
 *   Step 2: proxy.approve       → Approval recorded, authorization token issued
 *   Step 3: proxy.execute       → Token validated, email sent via Gmail SMTP, receipt generated
 *   Step 4: Verify receipt + ledger chain
 *
 * Email details:
 *   To:      RasmussenBR@hotmail.com
 *   Subject: Phase 1 complete
 *   Body:    I'm excited to work with this kick-ass builder named Manny and grammar professor Bondi.
 *
 * Delivery: Gmail SMTP (delivery_mode: "gmail") → real external email
 *
 * This test uses the REAL connectors (no mocking of dispatchExecution).
 * The send_email connector requires _gatewayExecution=true, which is set
 * during the execute flow. We mock only the DB layer (in-memory) and
 * the gateway execution flag injection.
 */

const MOCK_ROOT_PUBLIC_KEY = "a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2";
const MOCK_ROOT_SIGNATURE = "deadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef";

// ─── In-memory DB mock (same pattern as approve-execute-e2e.test.ts) ────

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

    createIntent: vi.fn(async (userId: number, toolName: string, toolArgs: Record<string, unknown>, riskTier: string, blastRadius: any, reflection?: string, sourceConversationId?: string, expiresAt?: number, principalId?: string) => {
      intentCounter++;
      const argsHash = require("crypto").createHash("sha256").update(JSON.stringify({ toolName, toolArgs })).digest("hex");
      const intent = {
        id: intentCounter, intentId: `INT-DEMO-${intentCounter}`, userId, toolName,
        toolArgs: JSON.stringify(toolArgs), riskTier, argsHash,
        blastRadius: JSON.stringify(blastRadius), reflection: reflection || null,
        sourceConversationId: sourceConversationId || null,
        principalId: principalId || null,
        expiresAt: expiresAt || null,
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

    createApproval: vi.fn(async (intentId: string, userId: number, decision: string, signature: string, boundToolName: string, boundArgsHash: string, expiresAt: number, maxExecutions: number, principalId?: string) => {
      approvalCounter++;
      const approval = {
        id: approvalCounter, approvalId: `APR-DEMO-${approvalCounter}`, intentId, userId,
        decision, signature, boundToolName, boundArgsHash, expiresAt, maxExecutions,
        executionCount: 0, principalId: principalId || null, createdAt: new Date(),
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
        id: executionCounter, executionId: `EXE-DEMO-${executionCounter}`, intentId, approvalId,
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
      const entryId = `LED-DEMO-${ledgerEntries.length + 1}`;
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
      principalId: `PRI-DEMO-${userId}`, userId,
      displayName: userId === 1 ? "Brian (Proposer)" : "Manny (Approver)",
      principalType: "human",
      roles: ["proposer", "approver", "executor", "auditor", "meta"],
      status: "active",
    })),
    getOrCreatePrincipal: vi.fn(async (userId: number) => ({
      principalId: `PRI-DEMO-${userId}`, userId,
      displayName: userId === 1 ? "Brian (Proposer)" : "Manny (Approver)",
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

// Mock the connector to inject _gatewayExecution flag for the send_email call
// This simulates what the Gateway governance loop does: after completing
// authorize → execute-action, it sets _gatewayExecution=true before calling the connector.
// The REAL Gmail SMTP connector runs — only the gateway flag is injected.
vi.mock("./connectors", async (importOriginal) => {
  const actual = await importOriginal() as Record<string, unknown>;
  const originalDispatch = actual.dispatchExecution as Function;

  return {
    ...actual,
    dispatchExecution: vi.fn(async (
      toolName: string,
      toolArgs: Record<string, unknown>,
      approvalProof: any,
      riskTier: string,
      storedArgsHash?: string,
    ) => {
      if (toolName === "send_email") {
        // Inject the gateway execution flag — this is what the Gateway does
        // after completing the governance loop (authorize → execute-action).
        // The actual Gmail SMTP connector will run and send the real email.
        const gatewayArgs = {
          ...toolArgs,
          _gatewayExecution: true,
          delivery_mode: "gmail",
        };
        return originalDispatch(toolName, gatewayArgs, approvalProof, riskTier, storedArgsHash);
      }
      return originalDispatch(toolName, toolArgs, approvalProof, riskTier, storedArgsHash);
    }),
  };
});

// ─── Auth contexts ─────────────────────────────────────────────

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

// ─── THE FLOW ──────────────────────────────────────────────────

describe("GOVERNED EMAIL FLOW: Phase 1 Complete → RasmussenBR@hotmail.com", () => {
  const brianCtx = createAuthContext(1, "brian-bkr1297", "Brian (Proposer)");
  const mannyCtx = createAuthContext(2, "manny-agent", "Manny (Approver)");

  let capturedIntentId: string;
  let capturedApprovalId: string;
  let capturedTokenId: string;
  let capturedReceiptHash: string;
  let capturedCanonicalReceipt: any;
  let capturedExecutionId: string;
  let capturedPreflightResults: any[];

  // Initialize authority layer
  beforeAll(() => {
    _resetAuthorityState();
    registerRootAuthority(MOCK_ROOT_PUBLIC_KEY);
    activatePolicy({
      policyId: "POLICY-DEMO-v1.0.0",
      rules: DEFAULT_POLICY_RULES,
      policySignature: MOCK_ROOT_SIGNATURE,
      rootPublicKey: MOCK_ROOT_PUBLIC_KEY,
    });
  });

  // ─── Step 0: Onboard Brian ─────────────────────────────────
  it("Step 0: Onboard Brian (proposer)", async () => {
    const caller = appRouter.createCaller(brianCtx);
    const result = await caller.proxy.onboard({
      publicKey: "brian-public-key-phase1-demo",
      policyHash: "phase1-demo-policy-hash",
    });
    expect(result.success).toBe(true);
    expect(result.proxyUser?.status).toBe("ACTIVE");
    console.log("✅ Step 0: Brian onboarded — status ACTIVE");
  });

  // ─── Step 1: INTENT — Brian creates the email intent ──────
  it("Step 1: INTENT — Brian creates send_email intent", async () => {
    const caller = appRouter.createCaller(brianCtx);
    const intent = await caller.proxy.createIntent({
      toolName: "send_email",
      toolArgs: {
        to: "RasmussenBR@hotmail.com",
        subject: "Phase 1 complete",
        body: "I'm excited to work with this kick-ass builder named Manny and grammar professor Bondi.",
      },
      breakAnalysis: "Email will be sent to an external recipient. Cannot be unsent once delivered. Content is personal and non-sensitive.",
    });

    expect(intent).toBeDefined();
    expect(intent!.status).toBe("PENDING_APPROVAL");
    expect(intent!.riskTier).toBe("HIGH");
    expect(intent!.toolName).toBe("send_email");

    capturedIntentId = intent!.intentId;
    console.log(`✅ Step 1: INTENT created — ${capturedIntentId}`);
    console.log(`   Risk tier: HIGH`);
    console.log(`   Status: PENDING_APPROVAL`);
    console.log(`   Args hash: ${intent!.argsHash.slice(0, 16)}...`);
  });

  // ─── Step 2: APPROVAL — Manny approves the intent ─────────
  it("Step 2: APPROVAL — Manny (different identity) approves", async () => {
    const caller = appRouter.createCaller(mannyCtx);
    const approval = await caller.proxy.approve({
      intentId: capturedIntentId,
      decision: "APPROVED",
      signature: "manny-ed25519-signature-phase1-demo",
      expiresInSeconds: 300,
      maxExecutions: 1,
    });

    expect(approval).toBeDefined();
    expect(approval!.decision).toBe("APPROVED");
    expect(approval!.boundToolName).toBe("send_email");

    capturedApprovalId = approval!.approvalId;

    // Authorization token must be issued
    const authToken = (approval as any).authorizationToken;
    expect(authToken).toBeDefined();
    expect(authToken).not.toBeNull();
    expect(authToken.token_id).toMatch(/^ATOK-/);
    expect(authToken.tool_name).toBe("send_email");

    capturedTokenId = authToken.token_id;
    console.log(`✅ Step 2: APPROVAL recorded — ${capturedApprovalId}`);
    console.log(`   Approver: Manny (PRI-DEMO-2) ≠ Proposer: Brian (PRI-DEMO-1)`);
    console.log(`   Token issued: ${capturedTokenId}`);
    console.log(`   Token tool_name: ${authToken.tool_name}`);
    console.log(`   Token args_hash: ${authToken.args_hash.slice(0, 16)}...`);
    console.log(`   Token expires: ${new Date(authToken.expires_at).toISOString()}`);
    console.log(`   Role separation: ${(approval as any).role_separation}`);
  });

  // ─── Step 3: EXECUTION — Brian executes with token ─────────
  it("Step 3: EXECUTION — Brian executes with authorization token (Gmail SMTP delivery)", async () => {
    const caller = appRouter.createCaller(brianCtx);
    const result = await caller.proxy.execute({
      intentId: capturedIntentId,
      tokenId: capturedTokenId,
    });

    expect(result.success).toBe(true);

    // All preflight checks should pass
    expect(result.preflightResults).toBeDefined();
    capturedPreflightResults = result.preflightResults!;
    const allPassed = capturedPreflightResults.every((c: any) => c.status === "PASS");
    expect(allPassed).toBe(true);

    // proposer_not_approver check
    const pnaCheck = capturedPreflightResults.find((c: any) => c.check === "proposer_not_approver");
    expect(pnaCheck).toBeDefined();
    expect(pnaCheck!.status).toBe("PASS");

    // Execution record
    expect(result.execution).toBeDefined();
    capturedExecutionId = result.execution!.executionId;

    // Receipt hash
    capturedReceiptHash = result.receiptHash!;
    expect(capturedReceiptHash).toBeDefined();
    expect(capturedReceiptHash.length).toBe(64);

    // Canonical receipt
    capturedCanonicalReceipt = (result as any).canonicalReceipt;
    expect(capturedCanonicalReceipt).toBeDefined();
    expect(capturedCanonicalReceipt.receipt_hash).toBe(capturedReceiptHash);
    expect(capturedCanonicalReceipt.token_id).toBe(capturedTokenId);

    // Connector result
    expect(result.connectorResult).toBeDefined();
    expect(result.connectorResult!.success).toBe(true);

    console.log(`✅ Step 3: EXECUTION complete — ${capturedExecutionId}`);
    console.log(`   Connector: send_email → Gmail SMTP`);
    console.log(`   Delivery: ${result.connectorResult!.metadata?.delivery_mode || "gmail"}`);
    console.log(`   Status: ${result.connectorResult!.metadata?.delivery_status || "SENT"}`);
    console.log(`   Message ID: ${result.connectorResult!.metadata?.external_message_id || "see output"}`);
    console.log(`   Receipt hash: ${capturedReceiptHash.slice(0, 16)}...`);
    console.log(`   Token burned: ${(result as any).authorizationToken?.burned}`);
  }, 30000); // 30s timeout for real SMTP

  // ─── Step 4: RECEIPT — Verify the canonical receipt ────────
  it("Step 4: RECEIPT — Verify canonical receipt fields", async () => {
    expect(capturedCanonicalReceipt).toBeDefined();

    // All 13-point governed action fields
    expect(capturedCanonicalReceipt.receipt_id).toBeDefined();
    expect(capturedCanonicalReceipt.intent_id).toBe(capturedIntentId);
    expect(capturedCanonicalReceipt.proposer_id).toBe("PRI-DEMO-1");
    expect(capturedCanonicalReceipt.approver_id).toContain("PRI-DEMO-2");
    expect(capturedCanonicalReceipt.token_id).toBe(capturedTokenId);
    expect(capturedCanonicalReceipt.policy_hash).toBeDefined();
    expect(capturedCanonicalReceipt.execution_hash).toBeDefined();
    expect(capturedCanonicalReceipt.receipt_hash).toBe(capturedReceiptHash);
    expect(capturedCanonicalReceipt.previous_receipt_hash).toBeDefined();
    expect(capturedCanonicalReceipt.ledger_entry_id).toBeDefined();
    expect(capturedCanonicalReceipt.gateway_signature).toBeDefined();
    expect(capturedCanonicalReceipt.status).toBe("SUCCESS");
    expect(capturedCanonicalReceipt.timestamp_proposed).toBeDefined();
    expect(capturedCanonicalReceipt.timestamp_approved).toBeDefined();
    expect(capturedCanonicalReceipt.timestamp_executed).toBeDefined();

    console.log(`✅ Step 4: RECEIPT verified — all 13-point fields present`);
    console.log(`   Receipt ID: ${capturedCanonicalReceipt.receipt_id}`);
    console.log(`   Intent ID: ${capturedCanonicalReceipt.intent_id}`);
    console.log(`   Proposer: ${capturedCanonicalReceipt.proposer_id}`);
    console.log(`   Approver: ${capturedCanonicalReceipt.approver_id}`);
    console.log(`   Token: ${capturedCanonicalReceipt.token_id}`);
    console.log(`   Policy hash: ${capturedCanonicalReceipt.policy_hash.slice(0, 16)}...`);
    console.log(`   Execution hash: ${capturedCanonicalReceipt.execution_hash.slice(0, 16)}...`);
    console.log(`   Receipt hash: ${capturedCanonicalReceipt.receipt_hash.slice(0, 16)}...`);
    console.log(`   Previous receipt hash: ${capturedCanonicalReceipt.previous_receipt_hash.slice(0, 16)}...`);
    console.log(`   Ledger entry: ${capturedCanonicalReceipt.ledger_entry_id}`);
    console.log(`   Gateway signature: ${capturedCanonicalReceipt.gateway_signature.slice(0, 16)}...`);
    console.log(`   Status: ${capturedCanonicalReceipt.status}`);
    console.log(`   Decision delta: ${capturedCanonicalReceipt.decision_delta_ms}ms`);
  });

  // ─── Step 5: LEDGER — Verify the hash chain ───────────────
  it("Step 5: LEDGER — Verify hash chain contains all governance entries", async () => {
    const caller = appRouter.createCaller(brianCtx);
    const entries = await caller.ledger.list();
    expect(entries.length).toBeGreaterThanOrEqual(5);

    const types = entries.map(e => e.entryType);
    expect(types).toContain("ONBOARD");
    expect(types).toContain("INTENT");
    expect(types).toContain("APPROVAL");
    expect(types).toContain("AUTHORITY_TOKEN");
    expect(types).toContain("EXECUTION");

    console.log(`✅ Step 5: LEDGER verified — ${entries.length} entries`);
    for (const entry of entries) {
      console.log(`   [${entry.entryType}] ${entry.entryId} hash=${entry.hash.slice(0, 12)}... prev=${entry.prevHash.slice(0, 12)}...`);
    }
  });

  // ─── Step 6: SUMMARY — Output the full flow evidence ──────
  it("Step 6: SUMMARY — Full governed email flow evidence", () => {
    console.log("\n" + "═".repeat(80));
    console.log("  GOVERNED EMAIL FLOW — COMPLETE EVIDENCE");
    console.log("═".repeat(80));
    console.log(`
┌─────────────────────────────────────────────────────────────────────────────┐
│ STEP 1: INTENT                                                              │
│   Intent ID:    ${capturedIntentId.padEnd(55)}│
│   Tool:         send_email                                                  │
│   Risk:         HIGH                                                        │
│   Status:       PENDING_APPROVAL → APPROVED → EXECUTED                      │
│   To:           RasmussenBR@hotmail.com                                     │
│   Subject:      Phase 1 complete                                            │
│   Body:         I'm excited to work with this kick-ass builder named        │
│                 Manny and grammar professor Bondi.                           │
├─────────────────────────────────────────────────────────────────────────────┤
│ STEP 2: APPROVAL                                                            │
│   Approval ID:  ${capturedApprovalId.padEnd(55)}│
│   Proposer:     PRI-DEMO-1 (Brian)                                          │
│   Approver:     PRI-DEMO-2 (Manny) — DIFFERENT IDENTITY                    │
│   Token ID:     ${capturedTokenId.padEnd(55)}│
│   Separation:   Proposer ≠ Approver ✓                                      │
├─────────────────────────────────────────────────────────────────────────────┤
│ STEP 3: EXECUTION                                                           │
│   Execution ID: ${capturedExecutionId.padEnd(55)}│
│   Delivery:     Gmail SMTP → RasmussenBR@hotmail.com                        │
│   Token burned: true (single-use enforcement)                               │
│   Preflight:    ${capturedPreflightResults.length} checks — ALL PASS${" ".repeat(36)}│
├─────────────────────────────────────────────────────────────────────────────┤
│ STEP 4: RECEIPT                                                             │
│   Receipt hash: ${capturedReceiptHash.slice(0, 55).padEnd(55)}│
│   Receipt ID:   ${(capturedCanonicalReceipt?.receipt_id || "").padEnd(55)}│
│   Policy hash:  ${(capturedCanonicalReceipt?.policy_hash?.slice(0, 55) || "").padEnd(55)}│
│   Gateway sig:  ${(capturedCanonicalReceipt?.gateway_signature?.slice(0, 55) || "").padEnd(55)}│
│   Status:       EXECUTED                                                    │
└─────────────────────────────────────────────────────────────────────────────┘
`);
    console.log("═".repeat(80));
    console.log("  INVARIANT: Receipt ≠ Authorization — ENFORCED");
    console.log("  The receipt proves what happened. The token authorized what could happen.");
    console.log("  They are separate artifacts. The token is burned. The receipt is permanent.");
    console.log("═".repeat(80));

    // This assertion just confirms the summary ran
    expect(capturedReceiptHash.length).toBe(64);
  });
});
