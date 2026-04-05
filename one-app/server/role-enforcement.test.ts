import { describe, it, expect, vi, beforeEach } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

/**
 * Role Enforcement Test Suite
 *
 * Tests for:
 * 1. Principal auto-creation on first access
 * 2. Owner gets all 5 roles automatically
 * 3. Non-owner gets no roles (fail-closed)
 * 4. Meta-gated procedures reject non-meta principals
 * 5. Suspended/revoked principals are blocked
 * 6. Role assignment and removal
 * 7. Principal status changes
 * 8. Role changes are logged to ledger
 */

// ─── In-memory state ────────────────────────────────────────────
const principalsMap = new Map<string, any>();
const principalsByUserId = new Map<number, any>();
let principalCounter = 0;
const ledgerEntries: any[] = [];
const proxyUsers = new Map<string, any>();
const intents = new Map<string, any>();
const approvals = new Map<string, any>();
const executions = new Map<string, any>();
const tools = [
  { id: 1, toolName: "echo", description: "Echo", riskTier: "LOW", requiredParams: JSON.stringify(["message"]), blastRadiusBase: 1, enabled: 1 },
  { id: 2, toolName: "send_email", description: "Send email", riskTier: "HIGH", requiredParams: JSON.stringify(["to", "subject", "body"]), blastRadiusBase: 7, enabled: 1 },
];
let intentCounter = 0;
let approvalCounter = 0;
let executionCounter = 0;

// ─── Mock db module ─────────────────────────────────────────────
vi.mock("./db", async (importOriginal) => {
  const actual = await importOriginal() as Record<string, unknown>;
  const crypto = require("crypto");

  return {
    ...actual,
    getDb: vi.fn().mockResolvedValue({}),
    upsertUser: vi.fn().mockResolvedValue(undefined),
    getUserByOpenId: vi.fn().mockResolvedValue(undefined),

    sha256: (data: string) => crypto.createHash("sha256").update(data).digest("hex"),

    // ─── Principal helpers ───────────────────────────────────
    getPrincipalByUserId: vi.fn(async (userId: number) => {
      return principalsByUserId.get(userId) ?? null;
    }),

    getPrincipalById: vi.fn(async (principalId: string) => {
      return principalsMap.get(principalId) ?? null;
    }),

    getOrCreatePrincipal: vi.fn(async (userId: number, displayName: string | null, isOwner: boolean) => {
      // Check if already exists
      const existing = principalsByUserId.get(userId);
      if (existing) return existing;

      principalCounter++;
      const principalId = `PRI-TEST-${principalCounter}`;
      const roles = isOwner
        ? ["proposer", "approver", "executor", "auditor", "meta"]
        : [];
      const principal = {
        id: principalCounter,
        principalId,
        userId,
        displayName,
        principalType: "human",
        roles,
        status: "active",
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      principalsMap.set(principalId, principal);
      principalsByUserId.set(userId, principal);
      return principal;
    }),

    listPrincipals: vi.fn(async () => {
      return Array.from(principalsMap.values());
    }),

    principalHasRole: vi.fn((principal: any, role: string) => {
      if (!principal || !Array.isArray(principal.roles)) return false;
      return principal.roles.includes(role);
    }),

    assignRole: vi.fn(async (principalId: string, role: string) => {
      const p = principalsMap.get(principalId);
      if (!p) throw new Error(`Principal ${principalId} not found`);
      if (!p.roles.includes(role)) p.roles.push(role);
      return p;
    }),

    removeRole: vi.fn(async (principalId: string, role: string) => {
      const p = principalsMap.get(principalId);
      if (!p) throw new Error(`Principal ${principalId} not found`);
      p.roles = p.roles.filter((r: string) => r !== role);
      return p;
    }),

    updatePrincipalStatus: vi.fn(async (principalId: string, status: string) => {
      const p = principalsMap.get(principalId);
      if (!p) return null;
      p.status = status;
      return p;
    }),

    // ─── Proxy user helpers ──────────────────────────────────
    getProxyUser: vi.fn(async (userId: number) => proxyUsers.get(String(userId))),
    createProxyUser: vi.fn(async (userId: number, publicKey: string, policyHash: string) => {
      const user = {
        id: proxyUsers.size + 1, userId, publicKey, policyHash,
        seedVersion: "SEED-v1.0.0", status: "ACTIVE", onboardedAt: new Date(),
        killedAt: null, killReason: null,
      };
      proxyUsers.set(String(userId), user);
      return user;
    }),
    killProxyUser: vi.fn(async (userId: number, reason: string) => {
      const user = proxyUsers.get(String(userId));
      if (user) { user.status = "KILLED"; user.killReason = reason; user.killedAt = new Date(); }
    }),

    // ─── Tool helpers ────────────────────────────────────────
    getToolByName: vi.fn(async (name: string) => tools.find(t => t.toolName === name)),
    getAllTools: vi.fn(async () => tools),

    // ─── Intent helpers ──────────────────────────────────────
    createIntent: vi.fn(async (userId: number, toolName: string, toolArgs: Record<string, unknown>, riskTier: string, blastRadius: any, reflection?: string, expiresAt?: number | null) => {
      intentCounter++;
      const argsHash = crypto.createHash("sha256").update(JSON.stringify(toolArgs)).digest("hex");
      const intent = {
        id: intentCounter, intentId: `INT-ROLE-${intentCounter}`, userId, toolName,
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
    getUserIntents: vi.fn(async () => Array.from(intents.values()).slice(-20)),
    updateIntentStatus: vi.fn(async (intentId: string, status: string) => {
      const intent = intents.get(intentId);
      if (intent) intent.status = status;
    }),

    // ─── Approval helpers ────────────────────────────────────
    createApproval: vi.fn(async (intentId: string, userId: number, decision: string, signature: string, boundToolName: string, boundArgsHash: string, expiresAt: number, maxExecutions: number) => {
      approvalCounter++;
      const approval = {
        id: approvalCounter, approvalId: `APR-ROLE-${approvalCounter}`,
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

    // ─── Execution helpers ───────────────────────────────────
    createExecution: vi.fn(async (intentId: string, approvalId: string | null, result: any, receiptHash: string, preflightResults: any) => {
      executionCounter++;
      const exec = {
        id: executionCounter, executionId: `EXE-ROLE-${executionCounter}`,
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

    // ─── Ledger helpers ──────────────────────────────────────
    appendLedger: vi.fn(async (entryType: string, payload: any) => {
      const prevHash = ledgerEntries.length > 0 ? ledgerEntries[ledgerEntries.length - 1].hash : "GENESIS";
      const entryId = `LED-ROLE-${ledgerEntries.length + 1}`;
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

    // ─── Other helpers ───────────────────────────────────────
    expireStaleIntents: vi.fn(async () => 0),
    batchApproveIntents: vi.fn(async () => []),
    getApprovalMetrics: vi.fn(async () => ({ queueSize: 0, totalApproved: 0, totalRejected: 0, totalExpired: 0, avgTimeToApprovalMs: 0, oldestPendingAgeMs: 0 })),
    createLearningEvent: vi.fn(async () => {}),
    getUserLearningEvents: vi.fn(async () => []),
    getRecentLearningContext: vi.fn(async () => []),
    saveKeyBackup: vi.fn(),
    getKeyBackup: vi.fn().mockResolvedValue(null),
    deleteKeyBackup: vi.fn(),
    createConversation: vi.fn(),
    getConversation: vi.fn().mockResolvedValue(null),
    getUserConversations: vi.fn(async () => []),
    closeConversation: vi.fn(),
    getAllNodeConfigs: vi.fn(async () => []),
    getActiveNodeConfigs: vi.fn(async () => []),
    getNodeConfig: vi.fn().mockResolvedValue(null),
    getPolicyRules: vi.fn(async () => []),
    getPolicyRule: vi.fn().mockResolvedValue(null),
    createPolicyRule: vi.fn(),
    updatePolicyRule: vi.fn(),
    deletePolicyRule: vi.fn(),
    getNotifications: vi.fn(async () => []),
    markNotificationRead: vi.fn(),
    markAllNotificationsRead: vi.fn(),
    getUnreadNotificationCount: vi.fn(async () => 0),
    createNotification: vi.fn(),
    getAuthorizedSigners: vi.fn(async () => []),
    getSignerById: vi.fn().mockResolvedValue(null),
    createAuthorizedSigner: vi.fn(),
    revokeAuthorizedSigner: vi.fn(),
  };
});

// Mock connectors
vi.mock("./connectors", async (importOriginal) => {
  const actual = await importOriginal() as Record<string, unknown>;
  return {
    ...actual,
    dispatchExecution: vi.fn(async (toolName: string) => ({
      success: true,
      output: { messageId: "MSG-ROLE-001", status: "delivered" },
      metadata: { connector: toolName, transport: "test" },
      executedAt: Date.now(),
    })),
  };
});

// ─── Context helpers ────────────────────────────────────────────

const OWNER_OPEN_ID = process.env.OWNER_OPEN_ID ?? "test-owner";

function createOwnerContext(): TrpcContext {
  return {
    user: {
      id: 100,
      openId: OWNER_OPEN_ID,
      email: "owner@rio.dev",
      name: "Brian (Owner)",
      loginMethod: "manus",
      role: "admin",
      createdAt: new Date(),
      updatedAt: new Date(),
      lastSignedIn: new Date(),
    },
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { clearCookie: vi.fn() } as unknown as TrpcContext["res"],
  };
}

function createNonOwnerContext(userId = 200, name = "Regular User"): TrpcContext {
  return {
    user: {
      id: userId,
      openId: `non-owner-${userId}`,
      email: `user${userId}@example.com`,
      name,
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

function createUnauthContext(): TrpcContext {
  return {
    user: null,
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { clearCookie: vi.fn() } as unknown as TrpcContext["res"],
  };
}

// ─── Tests ──────────────────────────────────────────────────────

describe("Role Enforcement — Area 1", () => {

  describe("Principal Auto-Creation", () => {
    it("owner gets all 5 roles on first principal resolution", async () => {
      const caller = appRouter.createCaller(createOwnerContext());
      const principal = await caller.proxy.myPrincipal();

      expect(principal).toBeDefined();
      expect(principal!.principalId).toMatch(/^PRI-/);
      expect(principal!.status).toBe("active");

      const roles = principal!.roles;
      expect(roles).toContain("proposer");
      expect(roles).toContain("approver");
      expect(roles).toContain("executor");
      expect(roles).toContain("auditor");
      expect(roles).toContain("meta");
    });

    it("non-owner gets empty roles on first principal resolution (fail-closed)", async () => {
      const caller = appRouter.createCaller(createNonOwnerContext());
      const principal = await caller.proxy.myPrincipal();

      expect(principal).toBeDefined();
      expect(principal!.principalId).toMatch(/^PRI-/);
      expect(principal!.roles).toEqual([]);
    });

    it("unauthenticated user cannot resolve principal", async () => {
      const caller = appRouter.createCaller(createUnauthContext());
      await expect(caller.proxy.myPrincipal()).rejects.toThrow();
    });
  });

  describe("Meta-Gated Procedures", () => {
    it("owner (meta role) can list principals", async () => {
      const caller = appRouter.createCaller(createOwnerContext());
      const principals = await caller.principals.list();
      expect(Array.isArray(principals)).toBe(true);
    });

    it("non-owner (no meta role) is rejected from listing principals", async () => {
      const caller = appRouter.createCaller(createNonOwnerContext(201, "No Meta User"));
      await expect(caller.principals.list()).rejects.toThrow(/meta.*required|Role.*meta/i);
    });

    it("owner can assign a role to a non-owner principal", async () => {
      const ownerCaller = appRouter.createCaller(createOwnerContext());
      const nonOwnerCtx = createNonOwnerContext(202, "Needs Proposer");
      const nonOwnerCaller = appRouter.createCaller(nonOwnerCtx);

      // Resolve the non-owner's principal first
      const nonOwnerPrincipal = await nonOwnerCaller.proxy.myPrincipal();
      expect(nonOwnerPrincipal!.roles).toEqual([]);

      // Owner assigns proposer role
      const result = await ownerCaller.principals.assignRole({
        principalId: nonOwnerPrincipal!.principalId,
        role: "proposer",
      });
      // Router returns the updated principal object
      expect(result).toBeDefined();
      expect(result.roles).toContain("proposer");

      // Verify the role was assigned
      const updated = await nonOwnerCaller.proxy.myPrincipal();
      expect(updated!.roles).toContain("proposer");
    });

    it("non-meta user cannot assign roles", async () => {
      const nonOwnerCaller = appRouter.createCaller(createNonOwnerContext(203, "Cannot Assign"));
      // First resolve their principal (no roles)
      await nonOwnerCaller.proxy.myPrincipal();

      await expect(
        nonOwnerCaller.principals.assignRole({
          principalId: "PRI-TEST-1",
          role: "approver",
        })
      ).rejects.toThrow(/meta.*required|Role.*meta/i);
    });

    it("non-meta user cannot remove roles", async () => {
      const nonOwnerCaller = appRouter.createCaller(createNonOwnerContext(204, "Cannot Remove"));
      await nonOwnerCaller.proxy.myPrincipal();

      await expect(
        nonOwnerCaller.principals.removeRole({
          principalId: "PRI-TEST-1",
          role: "proposer",
        })
      ).rejects.toThrow(/meta.*required|Role.*meta/i);
    });

    it("non-meta user cannot update principal status", async () => {
      const nonOwnerCaller = appRouter.createCaller(createNonOwnerContext(205, "Cannot Suspend"));
      await nonOwnerCaller.proxy.myPrincipal();

      await expect(
        nonOwnerCaller.principals.updateStatus({
          principalId: "PRI-TEST-1",
          status: "suspended",
        })
      ).rejects.toThrow(/meta.*required|Role.*meta/i);
    });
  });

  describe("Principal Status Enforcement", () => {
    it("myPrincipal still returns info for suspended principal (read-only self-check)", async () => {
      const suspendCtx = createNonOwnerContext(206, "Will Be Suspended");
      const suspendCaller = appRouter.createCaller(suspendCtx);

      // Create the principal
      const principal = await suspendCaller.proxy.myPrincipal();
      expect(principal!.status).toBe("active");

      // Directly mutate the in-memory principal to simulate suspension
      const p = principalsMap.get(principal!.principalId);
      p.status = "suspended";

      // myPrincipal is a read-only self-check — it should still return the principal
      // so the user can see their own status. Status enforcement happens on action procedures.
      const result = await suspendCaller.proxy.myPrincipal();
      expect(result!.status).toBe("suspended");
    });

    it("suspended principal is blocked from role-gated actions", async () => {
      // Give user 210 the meta role, then suspend them
      const ownerCaller = appRouter.createCaller(createOwnerContext());
      const targetCtx = createNonOwnerContext(210, "Suspended Meta");
      const targetCaller = appRouter.createCaller(targetCtx);

      // Create principal and give them meta role
      const principal = await targetCaller.proxy.myPrincipal();
      await ownerCaller.principals.assignRole({
        principalId: principal!.principalId,
        role: "meta",
      });

      // Verify they can list principals
      await expect(targetCaller.principals.list()).resolves.toBeDefined();

      // Now suspend them
      const p = principalsMap.get(principal!.principalId);
      p.status = "suspended";

      // Suspended principal should be blocked from role-gated procedures
      await expect(targetCaller.principals.list()).rejects.toThrow(/suspended/i);
    });

    it("revoked principal is blocked from role-gated actions", async () => {
      const targetCtx = createNonOwnerContext(211, "Revoked Meta");
      const targetCaller = appRouter.createCaller(targetCtx);
      const ownerCaller = appRouter.createCaller(createOwnerContext());

      // Create principal and give them meta role
      const principal = await targetCaller.proxy.myPrincipal();
      await ownerCaller.principals.assignRole({
        principalId: principal!.principalId,
        role: "meta",
      });

      // Revoke them
      const p = principalsMap.get(principal!.principalId);
      p.status = "revoked";

      // Revoked principal should be blocked
      await expect(targetCaller.principals.list()).rejects.toThrow(/revoked/i);
    });
  });

  describe("Role Changes Logged to Ledger", () => {
    it("role assignment creates a ledger entry", async () => {
      const initialLedgerCount = ledgerEntries.length;
      const ownerCaller = appRouter.createCaller(createOwnerContext());
      const targetCtx = createNonOwnerContext(208, "Ledger Test User");
      const targetCaller = appRouter.createCaller(targetCtx);

      // Create principal
      const principal = await targetCaller.proxy.myPrincipal();

      // Assign role
      await ownerCaller.principals.assignRole({
        principalId: principal!.principalId,
        role: "auditor",
      });

      // Check that a ledger entry was created
      const newEntries = ledgerEntries.slice(initialLedgerCount);
      const roleEntry = newEntries.find(e => e.entryType === "POLICY_UPDATE");
      expect(roleEntry).toBeDefined();

      const payload = JSON.parse(roleEntry.payload);
      expect(payload.action).toBe("ASSIGN_ROLE");
      expect(payload.role).toBe("auditor");
    });

    it("status change creates a ledger entry", async () => {
      const initialLedgerCount = ledgerEntries.length;
      const ownerCaller = appRouter.createCaller(createOwnerContext());
      const targetCtx = createNonOwnerContext(209, "Status Ledger User");
      const targetCaller = appRouter.createCaller(targetCtx);

      // Create principal
      const principal = await targetCaller.proxy.myPrincipal();

      // Change status
      await ownerCaller.principals.updateStatus({
        principalId: principal!.principalId,
        status: "suspended",
      });

      // Check ledger
      const newEntries = ledgerEntries.slice(initialLedgerCount);
      const statusEntry = newEntries.find(e => e.entryType === "POLICY_UPDATE");
      expect(statusEntry).toBeDefined();

      const payload = JSON.parse(statusEntry.payload);
      expect(payload.action).toBe("UPDATE_PRINCIPAL_STATUS");
      expect(payload.targetPrincipalId).toBeDefined();
      expect(payload.newStatus).toBe("suspended");
    });
  });

  describe("Principal in Status Response", () => {
    it("proxy.status includes principal info for authenticated owner", async () => {
      const ownerCaller = appRouter.createCaller(createOwnerContext());

      // Onboard first
      await ownerCaller.proxy.onboard({
        publicKey: "role-test-pk",
        policyHash: "role-test-ph",
      });

      const status = await ownerCaller.proxy.status();
      expect(status.principal).toBeDefined();
      expect(status.principal!.principalId).toMatch(/^PRI-/);
      expect(status.principal!.roles).toContain("meta");
    });
  });
});
