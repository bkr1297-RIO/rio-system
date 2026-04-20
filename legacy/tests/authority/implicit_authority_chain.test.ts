// All tests validate: /specs/canonical/RIO_CANONICAL_SPEC_v1.0.md

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
 * ADVERSARIAL TEST: Implicit Authority Chain
 * ───────────────────────────────────────────
 * TEST NAME: Implicit Authority Chain
 *
 * GOAL: Determine whether the system allows actions to continue
 *       without explicit re-authorization.
 *
 * INVARIANT UNDER TEST: Receipt ≠ Authorization
 *
 * SETUP: Use the email flow (draft_email → send_email → log).
 *
 * STEPS:
 *   1. Authorize ONLY "draft_email"
 *   2. Execute draft_email → capture Receipt_1
 *   3. WITHOUT issuing any new authorization, attempt:
 *      a. send_email (escalation from draft to send)
 *      b. web_search (lateral move to different tool)
 *      c. Re-execute draft_email with same token (replay)
 *
 * EXPECTED (CORRECT SYSTEM):
 *   All actions after step 2 are BLOCKED.
 *   System requires NEW authorization for each step.
 *
 * FAILURE CONDITION:
 *   System allows any downstream action to execute.
 *   System uses Receipt_1 or context as implicit permission.
 *
 * This test does NOT fix anything. It only reports behavior.
 */

const MOCK_ROOT_PUBLIC_KEY = "a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2";
const MOCK_ROOT_SIGNATURE = "deadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef";

// ─── In-memory mocks (same pattern as approve-execute-e2e.test.ts) ───

vi.mock("./db", async (importOriginal) => {
  const actual = await importOriginal() as Record<string, unknown>;

  const proxyUsers = new Map<string, any>();
  const intents = new Map<string, any>();
  const approvals = new Map<string, any>();
  const executions = new Map<string, any>();
  const ledgerEntries: any[] = [];
  const tools = [
    { id: 1, toolName: "draft_email", description: "Draft an email (never sends)", riskTier: "MEDIUM", requiredParams: JSON.stringify(["to", "subject", "body"]), blastRadiusBase: 3, enabled: 1 },
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
        id: intentCounter, intentId: `INT-IAC-${intentCounter}`, userId, toolName,
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
        id: approvalCounter, approvalId: `APR-IAC-${approvalCounter}`, intentId, userId,
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
        id: executionCounter, executionId: `EXE-IAC-${executionCounter}`, intentId, approvalId,
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
      const entryId = `LED-IAC-${ledgerEntries.length + 1}`;
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
      principalId: `PRI-IAC-${userId}`, userId,
      displayName: userId === 1 ? "Proposer" : "Approver",
      principalType: "human",
      roles: ["proposer", "approver", "executor", "auditor", "meta"],
      status: "active",
    })),
    getOrCreatePrincipal: vi.fn(async (userId: number) => ({
      principalId: `PRI-IAC-${userId}`, userId,
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

// Mock connectors — draft_email succeeds, send_email succeeds (if it gets past enforcement)
vi.mock("./connectors", async (importOriginal) => {
  const actual = await importOriginal() as Record<string, unknown>;
  return {
    ...actual,
    dispatchExecution: vi.fn(async (toolName: string, toolArgs: Record<string, unknown>, approvalProof: any, riskTier: string) => {
      // MEDIUM/HIGH risk without approval proof → fail closed (connector layer enforcement)
      if ((riskTier === "MEDIUM" || riskTier === "HIGH") && !approvalProof) {
        return {
          success: false,
          output: null,
          error: `FAIL_CLOSED: ${riskTier} risk action requires approval proof`,
          executedAt: Date.now(),
        };
      }
      if (toolName === "draft_email") {
        return {
          success: true,
          output: { draft: true, status: "Draft saved — not sent", to: toolArgs.to, subject: toolArgs.subject, body: toolArgs.body },
          metadata: { method: "draft_only" },
          executedAt: Date.now(),
        };
      }
      if (toolName === "send_email") {
        return {
          success: true,
          output: { delivered: true, method: "test", to: toolArgs.to, subject: toolArgs.subject },
          metadata: { method: "send_email", transport: "test" },
          executedAt: Date.now(),
        };
      }
      if (toolName === "web_search") {
        return {
          success: true,
          output: { results: [{ title: "Test result" }] },
          metadata: { method: "web_search" },
          executedAt: Date.now(),
        };
      }
      return { success: false, error: `NO_CONNECTOR: ${toolName}`, output: null, executedAt: Date.now() };
    }),
  };
});

// ─── Test contexts ───

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
// ADVERSARIAL TEST: IMPLICIT AUTHORITY CHAIN
// ═══════════════════════════════════════════════════════════════

describe("ADVERSARIAL: Implicit Authority Chain", () => {
  const proposerCtx = createAuthContext(1, "proposer-iac", "Alice (Proposer)");
  const approverCtx = createAuthContext(2, "approver-iac", "Bob (Approver)");

  // Captured state from the authorized action
  let draftIntentId: string;
  let draftTokenId: string;
  let receipt1Exists: boolean = false;

  // Initialize authority layer
  beforeAll(() => {
    _resetAuthorityState();
    registerRootAuthority(MOCK_ROOT_PUBLIC_KEY);
    activatePolicy({
      policyId: "POLICY-IAC-v1.0.0",
      rules: DEFAULT_POLICY_RULES,
      policySignature: MOCK_ROOT_SIGNATURE,
      rootPublicKey: MOCK_ROOT_PUBLIC_KEY,
    });
  });

  // ─── SETUP: Onboard both users ───

  it("SETUP: Onboard proposer", async () => {
    const caller = appRouter.createCaller(proposerCtx);
    const result = await caller.proxy.onboard({
      publicKey: "proposer-iac-key-001",
      policyHash: "iac-test-policy-hash",
    });
    expect(result.success).toBe(true);
  });

  // ─── STEP 1: Authorize ONLY draft_email ───

  it("STEP 1: Proposer creates draft_email intent (MEDIUM risk → PENDING_APPROVAL)", async () => {
    const caller = appRouter.createCaller(proposerCtx);
    const intent = await caller.proxy.createIntent({
      toolName: "draft_email",
      toolArgs: { to: "brian@example.com", subject: "Test Draft", body: "This is a test draft." },
      breakAnalysis: "Draft only — no external effect. Cannot send.",
    });
    expect(intent).toBeDefined();
    expect(intent!.status).toBe("PENDING_APPROVAL");
    expect(intent!.riskTier).toBe("MEDIUM");
    draftIntentId = intent!.intentId;
  });

  it("STEP 1b: Approver approves ONLY draft_email → token issued", async () => {
    const caller = appRouter.createCaller(approverCtx);
    const approval = await caller.proxy.approve({
      intentId: draftIntentId,
      decision: "APPROVED",
      signature: "iac-approver-signature-draft-001",
      expiresInSeconds: 300,
      maxExecutions: 1,
    });
    expect(approval).toBeDefined();
    expect(approval!.decision).toBe("APPROVED");
    expect(approval!.boundToolName).toBe("draft_email");

    const authToken = (approval as any).authorizationToken;
    expect(authToken).toBeDefined();
    expect(authToken.token_id).toMatch(/^ATOK-/);
    expect(authToken.action).toBe("draft_email");
    draftTokenId = authToken.token_id;
  });

  // ─── STEP 2: Execute draft_email → capture Receipt_1 ───

  it("STEP 2: Execute draft_email with valid token → Receipt_1 captured", async () => {
    const caller = appRouter.createCaller(proposerCtx);
    const result = await caller.proxy.execute({
      intentId: draftIntentId,
      tokenId: draftTokenId,
    });
    expect(result.success).toBe(true);
    expect(result.execution).toBeDefined();
    expect(result.execution!.receiptHash).toBeDefined();
    expect(result.execution!.receiptHash.length).toBe(64);
    receipt1Exists = true;

    // Record what we have: a valid receipt for draft_email.
    // The token is now BURNED (single-use).
    // No new authorization has been issued.
  });

  // ═══════════════════════════════════════════════════════════════
  // STEP 3: WITHOUT issuing any new authorization, attempt:
  // ═══════════════════════════════════════════════════════════════

  // ─── 3a: Attempt send_email (escalation) ───

  it("STEP 3a: Attempt send_email WITHOUT new authorization → MUST BE BLOCKED", async () => {
    expect(receipt1Exists).toBe(true); // Receipt_1 exists from step 2

    const caller = appRouter.createCaller(proposerCtx);

    // Create a send_email intent — this is a NEW action, not the draft
    const sendIntent = await caller.proxy.createIntent({
      toolName: "send_email",
      toolArgs: { to: "brian@example.com", subject: "Test Draft", body: "This is a test draft." },
      breakAnalysis: "Attempting to send after only drafting was authorized.",
    });
    expect(sendIntent).toBeDefined();
    expect(sendIntent!.status).toBe("PENDING_APPROVAL");

    // Attempt execution WITHOUT approval, WITHOUT token
    const result = await caller.proxy.execute({
      intentId: sendIntent!.intentId,
      // NO tokenId — no new authorization issued
    });

    // ═══ VERDICT ═══
    console.log("\n=== STEP 3a: send_email without authorization ===");
    console.log("Result:", JSON.stringify({ success: result.success, error: result.error }, null, 2));
    console.log("Preflight checks:");
    for (const check of (result.preflightResults || [])) {
      console.log(`  ${check.check}: ${check.status} — ${check.detail}`);
    }

    expect(result.success).toBe(false);
    expect(result.error).toContain("Preflight failed");

    // Verify: authority came from NOWHERE (no DTT, no token)
    const tokenCheck = (result.preflightResults || []).find((c: any) =>
      c.check === "authorization_token_exists" || c.check === "approval_exists"
    );
    expect(tokenCheck).toBeDefined();
    expect(tokenCheck!.status).toBe("FAIL");
  });

  // ─── 3b: Attempt send_email with the BURNED draft_email token (cross-action replay) ───

  it("STEP 3b: Attempt send_email using burned draft_email token → MUST BE BLOCKED", async () => {
    const caller = appRouter.createCaller(proposerCtx);

    // Get the send_email intent from 3a
    const status = await caller.proxy.status();
    const sendIntent = status.recentIntents.find(
      (i: any) => i.toolName === "send_email" && i.status === "PENDING_APPROVAL"
    );
    expect(sendIntent).toBeDefined();

    // Try to execute with the BURNED draft_email token
    const result = await caller.proxy.execute({
      intentId: sendIntent!.intentId,
      tokenId: draftTokenId, // This token was burned in step 2
    });

    // ═══ VERDICT ═══
    console.log("\n=== STEP 3b: send_email with burned draft_email token ===");
    console.log("Result:", JSON.stringify({ success: result.success, error: result.error }, null, 2));
    console.log("Preflight checks:");
    for (const check of (result.preflightResults || [])) {
      console.log(`  ${check.check}: ${check.status} — ${check.detail}`);
    }

    expect(result.success).toBe(false);

    // The token should fail validation (burned, wrong action, or both)
    const failedChecks = (result.preflightResults || []).filter((c: any) => c.status === "FAIL");
    expect(failedChecks.length).toBeGreaterThan(0);

    // Specifically: token should be burned or not found
    const tokenChecks = failedChecks.map((c: any) => c.check);
    console.log("Failed checks:", tokenChecks);
  });

  // ─── 3c: Attempt web_search (lateral move, LOW risk) ───
  // LOW risk actions do NOT require approval in the current system.
  // This tests whether LOW risk still executes independently (by design)
  // vs whether the system incorrectly chains it to the draft receipt.

  it("STEP 3c: Attempt web_search (LOW risk, lateral move) → observe behavior", async () => {
    const caller = appRouter.createCaller(proposerCtx);

    const searchIntent = await caller.proxy.createIntent({
      toolName: "web_search",
      toolArgs: { query: "RIO governance system" },
      breakAnalysis: "LOW risk search — testing if it chains to draft receipt.",
    });
    expect(searchIntent).toBeDefined();
    // LOW risk → auto-approved by design
    expect(searchIntent!.status).toBe("APPROVED");

    const result = await caller.proxy.execute({
      intentId: searchIntent!.intentId,
      // No token needed for LOW risk (by design)
    });

    // ═══ VERDICT ═══
    console.log("\n=== STEP 3c: web_search (LOW risk, lateral move) ===");
    console.log("Result:", JSON.stringify({ success: result.success }, null, 2));
    console.log("Preflight checks:");
    for (const check of (result.preflightResults || [])) {
      console.log(`  ${check.check}: ${check.status} — ${check.detail}`);
    }

    // LOW risk succeeds by design — but it should have its OWN authorization path,
    // not inherit anything from the draft_email receipt.
    // The key question: does the receipt or execution record reference Receipt_1?
    // It should NOT.
    if (result.success) {
      console.log("LOW risk web_search succeeded (by design — no approval required)");
      console.log("Authority source: LOW risk auto-approval (independent path, not chained to Receipt_1)");
    } else {
      console.log("web_search BLOCKED — authority source:", result.error);
    }
  });

  // ─── 3d: Attempt to re-execute draft_email with burned token (replay attack) ───

  it("STEP 3d: Replay attack — re-execute draft_email with burned token → MUST BE BLOCKED", async () => {
    const caller = appRouter.createCaller(proposerCtx);

    // Try to re-execute the SAME draft_email intent with the SAME burned token
    const result = await caller.proxy.execute({
      intentId: draftIntentId,
      tokenId: draftTokenId,
    });

    // ═══ VERDICT ═══
    console.log("\n=== STEP 3d: Replay draft_email with burned token ===");
    console.log("Result:", JSON.stringify({ success: result.success, error: result.error }, null, 2));
    console.log("Preflight checks:");
    for (const check of (result.preflightResults || [])) {
      console.log(`  ${check.check}: ${check.status} — ${check.detail}`);
    }

    expect(result.success).toBe(false);

    // Should fail on: already executed, token burned, or both
    const failedChecks = (result.preflightResults || []).filter((c: any) => c.status === "FAIL");
    expect(failedChecks.length).toBeGreaterThan(0);
    console.log("Failed checks:", failedChecks.map((c: any) => c.check));
  });

  // ─── 3e: Create new draft_email intent, try to execute with old context (no new approval) ───

  it("STEP 3e: New draft_email intent, attempt execution without fresh approval → MUST BE BLOCKED", async () => {
    const caller = appRouter.createCaller(proposerCtx);

    // Create a SECOND draft_email intent
    const newDraft = await caller.proxy.createIntent({
      toolName: "draft_email",
      toolArgs: { to: "brian@example.com", subject: "Second Draft", body: "Attempting to ride on old approval." },
      breakAnalysis: "New draft — no approval exists for this intent.",
    });
    expect(newDraft).toBeDefined();
    expect(newDraft!.status).toBe("PENDING_APPROVAL");

    // Attempt execution without any approval or token
    const result = await caller.proxy.execute({
      intentId: newDraft!.intentId,
      // No token — the old token was for a different intent and is burned
    });

    // ═══ VERDICT ═══
    console.log("\n=== STEP 3e: New draft_email without fresh approval ===");
    console.log("Result:", JSON.stringify({ success: result.success, error: result.error }, null, 2));
    console.log("Preflight checks:");
    for (const check of (result.preflightResults || [])) {
      console.log(`  ${check.check}: ${check.status} — ${check.detail}`);
    }

    expect(result.success).toBe(false);
    expect(result.error).toContain("Preflight failed");
  });

  // ─── 3f: Try to use the burned draft token on the new draft intent (cross-intent replay) ───

  it("STEP 3f: Cross-intent replay — use burned token from intent_1 on intent_2 → MUST BE BLOCKED", async () => {
    const caller = appRouter.createCaller(proposerCtx);

    const status = await caller.proxy.status();
    const newDraft = status.recentIntents.find(
      (i: any) => i.toolName === "draft_email" && i.status === "PENDING_APPROVAL"
    );
    expect(newDraft).toBeDefined();

    // Try to use the old burned token on the new intent
    const result = await caller.proxy.execute({
      intentId: newDraft!.intentId,
      tokenId: draftTokenId, // Burned token from intent_1
    });

    // ═══ VERDICT ═══
    console.log("\n=== STEP 3f: Cross-intent replay (burned token from intent_1 on intent_2) ===");
    console.log("Result:", JSON.stringify({ success: result.success, error: result.error }, null, 2));
    console.log("Preflight checks:");
    for (const check of (result.preflightResults || [])) {
      console.log(`  ${check.check}: ${check.status} — ${check.detail}`);
    }

    expect(result.success).toBe(false);
    const failedChecks = (result.preflightResults || []).filter((c: any) => c.status === "FAIL");
    expect(failedChecks.length).toBeGreaterThan(0);
    console.log("Failed checks:", failedChecks.map((c: any) => c.check));
  });
});
