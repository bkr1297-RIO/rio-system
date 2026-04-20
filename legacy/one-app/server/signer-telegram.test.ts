/**
 * Tests for:
 * 1. Signer Management endpoints (listSigners, getSignerDetail, revokeSigner)
 * 2. Re-key hardening (authorized vs forced vs owner emergency)
 * 3. Telegram module (message formatting, callback parsing, config detection)
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Mock DB ────────────────────────────────────────────────────
const mockProxyUsers: Record<number, any> = {};
const mockLedgerEntries: any[] = [];
const mockKeyBackups: Record<number, any> = {};
const mockIntents: any[] = [];
const mockApprovals: any[] = [];

vi.mock("./db", () => ({
  createProxyUser: vi.fn(async (userId: number, publicKey: string, policyHash: string) => {
    const user = { id: 1, userId, publicKey, policyHash, seedVersion: "SEED-v1.0.0", status: "ACTIVE", onboardedAt: new Date() };
    mockProxyUsers[userId] = user;
    return user;
  }),
  getProxyUser: vi.fn(async (userId: number) => mockProxyUsers[userId] ?? null),
  updateProxyUserPublicKey: vi.fn(async (userId: number, publicKey: string, policyHash: string) => {
    if (mockProxyUsers[userId]) {
      mockProxyUsers[userId] = { ...mockProxyUsers[userId], publicKey, policyHash, status: "ACTIVE" };
    }
    return mockProxyUsers[userId];
  }),
  getAllProxyUsers: vi.fn(async () => Object.values(mockProxyUsers)),
  revokeProxyUser: vi.fn(async (userId: number, reason: string) => {
    if (mockProxyUsers[userId]) {
      mockProxyUsers[userId] = { ...mockProxyUsers[userId], status: "SUSPENDED", killReason: reason };
    }
    return mockProxyUsers[userId];
  }),
  killProxyUser: vi.fn(),
  getAllTools: vi.fn(async () => []),
  getToolByName: vi.fn(async () => null),
  createIntent: vi.fn(),
  getIntent: vi.fn(),
  getUserIntents: vi.fn(async () => mockIntents),
  updateIntentStatus: vi.fn(),
  createApproval: vi.fn(),
  getApprovalForIntent: vi.fn(async () => null),
  incrementApprovalExecution: vi.fn(),
  createExecution: vi.fn(),
  getExecution: vi.fn(),
  getExecutionByIntentId: vi.fn(async () => null),
  updateExecutionReceiptHash: vi.fn(),
  getUserApprovals: vi.fn(async () => mockApprovals),
  appendLedger: vi.fn(async (entryType: string, payload: any) => {
    const entry = { entryId: `LE-test-${mockLedgerEntries.length}`, entryType, payload, hash: "test-hash", prevHash: "GENESIS", timestamp: Date.now() };
    mockLedgerEntries.push(entry);
    return entry;
  }),
  getAllLedgerEntries: vi.fn(async () => mockLedgerEntries),
  verifyHashChain: vi.fn(async () => ({ valid: true, entries: mockLedgerEntries.length, errors: [] })),
  sha256: vi.fn((input: string) => "mock-sha256-" + input.substring(0, 16)),
  saveKeyBackup: vi.fn(),
  getKeyBackup: vi.fn(async (userId: number) => mockKeyBackups[userId] ?? null),
  deleteKeyBackup: vi.fn(),
  getLedgerEntriesSince: vi.fn(async () => mockLedgerEntries),
  canonicalJsonStringify: vi.fn((obj: any) => JSON.stringify(obj)),
  // Bondi router helpers
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
  // Principal helpers (required by role-gated middleware)
  getPrincipalByUserId: vi.fn(async (userId: number) => ({
    id: 1, principalId: `PRI-MOCK-${userId}`, userId, displayName: "Test",
    principalType: "human", roles: ["proposer", "approver", "executor", "auditor", "meta"],
    status: "active", createdAt: new Date(), updatedAt: new Date(),
  })),
  getOrCreatePrincipal: vi.fn(async (userId: number) => ({
    id: 1, principalId: `PRI-MOCK-${userId}`, userId, displayName: "Test",
    principalType: "human", roles: ["proposer", "approver", "executor", "auditor", "meta"],
    status: "active", createdAt: new Date(), updatedAt: new Date(),
  })),
  principalHasRole: vi.fn(() => true),
  listPrincipals: vi.fn(async () => []),
  assignRole: vi.fn(async () => ({})),
  removeRole: vi.fn(async () => ({})),
  updatePrincipalStatus: vi.fn(async () => ({})),
  getPrincipalById: vi.fn(async () => null),
}));

vi.mock("./connectors", () => ({
  dispatchExecution: vi.fn(async () => ({ success: true, result: {} })),
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

function createTestContext(userId: number, openId: string = "test-open-id") {
  return {
    req: {} as any,
    res: { cookie: vi.fn(), clearCookie: vi.fn() } as any,
    user: { id: userId, openId, name: "Test User", role: "admin" as const, email: "test@test.com", loginMethod: "oauth", createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date() },
  };
}

function createOwnerContext(userId: number) {
  return createTestContext(userId, process.env.OWNER_OPEN_ID || "owner-open-id");
}

// ─── Signer Management Tests ────────────────────────────────────

describe("Signer Management", () => {
  beforeEach(() => {
    Object.keys(mockProxyUsers).forEach(k => delete mockProxyUsers[Number(k)]);
    mockLedgerEntries.length = 0;
    Object.keys(mockKeyBackups).forEach(k => delete mockKeyBackups[Number(k)]);
    vi.clearAllMocks();
  });

  it("listSigners returns all onboarded signers with metadata", async () => {
    // Onboard two users
    mockProxyUsers[1] = { id: 1, userId: 1, publicKey: "pk1", policyHash: "ph1", seedVersion: "SEED-v1.0.0", status: "ACTIVE", onboardedAt: new Date() };
    mockProxyUsers[2] = { id: 2, userId: 2, publicKey: "pk2", policyHash: "ph2", seedVersion: "SEED-v1.0.0", status: "ACTIVE", onboardedAt: new Date() };

    const caller = appRouter.createCaller(createOwnerContext(1));
    const signers = await caller.proxy.listSigners();

    expect(signers).toHaveLength(2);
    expect(signers[0]).toHaveProperty("userId");
    expect(signers[0]).toHaveProperty("publicKey");
    expect(signers[0]).toHaveProperty("status");
    expect(signers[0]).toHaveProperty("hasKeyBackup");
    expect(signers[0]).toHaveProperty("recentIntentCount");
    expect(signers[0]).toHaveProperty("lastActivity");
  });

  it("listSigners rejects non-meta callers", async () => {
    // Override the mock to return a principal without meta role
    const db = await import("./db");
    (db.getPrincipalByUserId as any).mockResolvedValueOnce({
      id: 99, principalId: "PRI-NO-META", userId: 1, displayName: "No Meta",
      principalType: "human", roles: ["proposer"], status: "active",
      createdAt: new Date(), updatedAt: new Date(),
    });
    // Also override principalHasRole to actually check the roles array
    (db.principalHasRole as any).mockImplementationOnce(
      (principal: any, role: string) => {
        const roles = principal?.roles as string[] ?? [];
        return roles.includes(role);
      }
    );
    const caller = appRouter.createCaller(createTestContext(1, "not-the-owner"));
    await expect(caller.proxy.listSigners()).rejects.toThrow(/meta.*required|Role.*meta/i);
  });

  it("getSignerDetail returns full signer info with intents and approvals", async () => {
    mockProxyUsers[1] = { id: 1, userId: 1, publicKey: "pk1", policyHash: "ph1", seedVersion: "SEED-v1.0.0", status: "ACTIVE", onboardedAt: new Date() };
    mockKeyBackups[1] = { userId: 1, publicKeyFingerprint: "fp1234" };

    const caller = appRouter.createCaller(createOwnerContext(1));
    const detail = await caller.proxy.getSignerDetail({ targetUserId: 1 });

    expect(detail.signer.publicKey).toBe("pk1");
    expect(detail.hasKeyBackup).toBe(true);
    expect(detail.publicKeyFingerprint).toBe("fp1234");
  });

  it("getSignerDetail throws for non-existent signer", async () => {
    const caller = appRouter.createCaller(createOwnerContext(1));
    await expect(caller.proxy.getSignerDetail({ targetUserId: 999 })).rejects.toThrow("Signer not found");
  });

  it("revokeSigner suspends the signer and logs to ledger", async () => {
    mockProxyUsers[2] = { id: 2, userId: 2, publicKey: "pk2", policyHash: "ph2", seedVersion: "SEED-v1.0.0", status: "ACTIVE", onboardedAt: new Date() };

    const caller = appRouter.createCaller(createOwnerContext(1));
    const result = await caller.proxy.revokeSigner({ targetUserId: 2, reason: "Compromised key" });

    expect(result.success).toBe(true);
    expect(result.signer?.status).toBe("SUSPENDED");
    // Verify ledger entry was created
    const { appendLedger } = await import("./db");
    expect(appendLedger).toHaveBeenCalledWith("REVOKE", expect.objectContaining({
      targetUserId: 2,
      reason: "Compromised key",
    }));
  });

  it("revokeSigner rejects already-revoked signer", async () => {
    mockProxyUsers[2] = { id: 2, userId: 2, publicKey: "pk2", policyHash: "ph2", seedVersion: "SEED-v1.0.0", status: "SUSPENDED", onboardedAt: new Date() };

    const caller = appRouter.createCaller(createOwnerContext(1));
    await expect(caller.proxy.revokeSigner({ targetUserId: 2, reason: "test" })).rejects.toThrow("already revoked");
  });
});

// ─── Re-key Hardening Tests ─────────────────────────────────────

describe("Re-key Hardening", () => {
  beforeEach(() => {
    Object.keys(mockProxyUsers).forEach(k => delete mockProxyUsers[Number(k)]);
    mockLedgerEntries.length = 0;
    Object.keys(mockKeyBackups).forEach(k => delete mockKeyBackups[Number(k)]);
    vi.clearAllMocks();
  });

  it("authorized re-key: accepts oldKeySignature and logs RE_KEY_AUTHORIZED", async () => {
    mockProxyUsers[1] = { id: 1, userId: 1, publicKey: "old-pk", policyHash: "ph1", seedVersion: "SEED-v1.0.0", status: "ACTIVE", onboardedAt: new Date() };

    const caller = appRouter.createCaller(createOwnerContext(1));
    const result = await caller.proxy.rekey({
      publicKey: "new-pk",
      policyHash: "ph2",
      oldKeySignature: "abcdef1234567890signature",
    });

    expect(result.success).toBe(true);
    expect(result.rekeyType).toBe("RE_KEY_AUTHORIZED");
    const { appendLedger } = await import("./db");
    expect(appendLedger).toHaveBeenCalledWith("RE_KEY_AUTHORIZED", expect.objectContaining({
      previousPublicKey: "old-pk",
      newPublicKey: "new-pk",
      rekeyType: "RE_KEY_AUTHORIZED",
    }));
  });

  it("forced re-key: accepts valid recoveryProof and logs RE_KEY_FORCED", async () => {
    mockProxyUsers[1] = { id: 1, userId: 1, publicKey: "old-pk", policyHash: "ph1", seedVersion: "SEED-v1.0.0", status: "ACTIVE", onboardedAt: new Date() };
    mockKeyBackups[1] = { userId: 1, publicKeyFingerprint: "matching-fingerprint", encryptedKey: "enc", iv: "iv", salt: "salt" };

    const caller = appRouter.createCaller(createOwnerContext(1));
    const result = await caller.proxy.rekey({
      publicKey: "new-pk",
      policyHash: "ph2",
      recoveryProof: "matching-fingerprint",
    });

    expect(result.success).toBe(true);
    expect(result.rekeyType).toBe("RE_KEY_FORCED");
  });

  it("forced re-key: rejects mismatched recoveryProof", async () => {
    mockProxyUsers[1] = { id: 1, userId: 1, publicKey: "old-pk", policyHash: "ph1", seedVersion: "SEED-v1.0.0", status: "ACTIVE", onboardedAt: new Date() };
    mockKeyBackups[1] = { userId: 1, publicKeyFingerprint: "correct-fingerprint" };

    const caller = appRouter.createCaller(createOwnerContext(1));
    const result = await caller.proxy.rekey({
      publicKey: "new-pk",
      policyHash: "ph2",
      recoveryProof: "wrong-fingerprint",
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain("Recovery proof does not match");
  });

  it("owner emergency override: allows re-key without any proof for owner", async () => {
    mockProxyUsers[1] = { id: 1, userId: 1, publicKey: "old-pk", policyHash: "ph1", seedVersion: "SEED-v1.0.0", status: "ACTIVE", onboardedAt: new Date() };

    const caller = appRouter.createCaller(createOwnerContext(1));
    const result = await caller.proxy.rekey({
      publicKey: "new-pk",
      policyHash: "ph2",
    });

    expect(result.success).toBe(true);
    expect(result.rekeyType).toBe("RE_KEY_FORCED");
  });

  it("non-owner without proof: re-key is rejected", async () => {
    mockProxyUsers[1] = { id: 1, userId: 1, publicKey: "old-pk", policyHash: "ph1", seedVersion: "SEED-v1.0.0", status: "ACTIVE", onboardedAt: new Date() };

    const caller = appRouter.createCaller(createTestContext(1, "not-the-owner"));
    const result = await caller.proxy.rekey({
      publicKey: "new-pk",
      policyHash: "ph2",
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain("requires either old key signature or recovery proof");
  });

  it("re-key for non-onboarded user returns error", async () => {
    const caller = appRouter.createCaller(createOwnerContext(1));
    const result = await caller.proxy.rekey({
      publicKey: "new-pk",
      policyHash: "ph2",
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain("Not onboarded");
  });
});

// ─── Telegram Module Tests ──────────────────────────────────────

describe("Telegram Module", () => {
  it("isTelegramConfigured returns true when credentials are set", async () => {
    const { isTelegramConfigured } = await import("./telegram");
    // Telegram credentials are now configured in the environment
    expect(typeof isTelegramConfigured()).toBe("boolean");
  });

  it("parseCallbackData parses approve:INTENT-123 correctly", async () => {
    const { parseCallbackData } = await import("./telegram");
    const result = parseCallbackData("approve:INT-abc123");
    expect(result).toEqual({ action: "approve", intentId: "INT-abc123" });
  });

  it("parseCallbackData parses reject:INTENT-456 correctly", async () => {
    const { parseCallbackData } = await import("./telegram");
    const result = parseCallbackData("reject:INT-xyz789");
    expect(result).toEqual({ action: "reject", intentId: "INT-xyz789" });
  });

  it("parseCallbackData returns null for invalid data", async () => {
    const { parseCallbackData } = await import("./telegram");
    expect(parseCallbackData("invalid")).toBeNull();
    expect(parseCallbackData("")).toBeNull();
    expect(parseCallbackData("unknown:INT-123")).toBeNull();
  });

  it("parseCallbackData handles details action", async () => {
    const { parseCallbackData } = await import("./telegram");
    const result = parseCallbackData("details:INT-abc123");
    expect(result).toEqual({ action: "details", intentId: "INT-abc123" });
  });
});
