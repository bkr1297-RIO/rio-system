import { describe, expect, it, vi, beforeEach } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

// Mock the db module
vi.mock("./db", () => {
  let keyBackupStore: Record<number, any> = {};
  let proxyUsers: Record<number, any> = {};
  let ledgerEntries: any[] = [];
  let intents: any[] = [];
  let approvals: any[] = [];

  return {
    // Key backup functions
    saveKeyBackup: vi.fn(async (userId: number, encryptedKey: string, iv: string, salt: string, fingerprint: string) => {
      const backup = { id: 1, userId, encryptedKey, iv, salt, publicKeyFingerprint: fingerprint, createdAt: new Date() };
      keyBackupStore[userId] = backup;
      return backup;
    }),
    getKeyBackup: vi.fn(async (userId: number) => keyBackupStore[userId] || null),
    deleteKeyBackup: vi.fn(async (userId: number) => { delete keyBackupStore[userId]; }),

    // Proxy user functions
    createProxyUser: vi.fn(async (userId: number, publicKey: string, policyHash: string) => {
      const user = { id: 1, userId, publicKey, policyHash, seedVersion: "SEED-v1.0.0", status: "ACTIVE", onboardedAt: new Date(), killReason: null };
      proxyUsers[userId] = user;
      return user;
    }),
    getProxyUser: vi.fn(async (userId: number) => proxyUsers[userId] || null),
    killProxyUser: vi.fn(),

    // Tool functions
    getAllTools: vi.fn(async () => [
      { id: 1, toolName: "echo", riskTier: "LOW", description: "Echo test", argsSchema: "{}" },
      { id: 2, toolName: "send_email", riskTier: "HIGH", description: "Send email", argsSchema: "{}" },
    ]),
    getToolByName: vi.fn(async (name: string) => {
      const tools: Record<string, any> = {
        echo: { id: 1, toolName: "echo", riskTier: "LOW", description: "Echo test", argsSchema: "{}" },
        send_email: { id: 2, toolName: "send_email", riskTier: "HIGH", description: "Send email", argsSchema: "{}" },
      };
      return tools[name] || null;
    }),

    // Intent functions
    createIntent: vi.fn(),
    getIntent: vi.fn(),
    getUserIntents: vi.fn(async () => intents),
    updateIntentStatus: vi.fn(),

    // Approval functions
    createApproval: vi.fn(),
    getApprovalForIntent: vi.fn(),
    incrementApprovalExecution: vi.fn(),
    getUserApprovals: vi.fn(async () => approvals),

    // Execution functions
    createExecution: vi.fn(),
    getExecution: vi.fn(),
    getExecutionByIntentId: vi.fn(),

    // Ledger functions
    appendLedger: vi.fn(),
    getAllLedgerEntries: vi.fn(async () => ledgerEntries),
    verifyHashChain: vi.fn(async () => ({ valid: true, errors: [], total: ledgerEntries.length })),
    getLedgerEntriesSince: vi.fn(async () => []),

    // Utility
    sha256: vi.fn(async (data: string) => {
      const encoder = new TextEncoder();
      const hashBuffer = await crypto.subtle.digest("SHA-256", encoder.encode(data));
      return Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2, "0")).join("");
    }),

    // Reset for tests
    __reset: () => {
      keyBackupStore = {};
      proxyUsers = {};
      ledgerEntries = [];
      intents = [];
      approvals = [];
    },
    __setProxyUser: (userId: number, user: any) => { proxyUsers[userId] = user; },
    __setLedgerEntries: (entries: any[]) => { ledgerEntries = entries; },
  };
});

function createTestContext(userId = 1): TrpcContext {
  return {
    user: {
      id: userId,
      openId: "test-user",
      email: "test@example.com",
      name: "Test User",
      loginMethod: "manus",
      role: "user",
      createdAt: new Date(),
      updatedAt: new Date(),
      lastSignedIn: new Date(),
    },
    req: { protocol: "https", headers: {} } as any,
    res: { clearCookie: vi.fn() } as any,
  };
}

describe("Key Backup & Recovery", () => {
  beforeEach(async () => {
    const db = await import("./db") as any;
    db.__reset();
  });

  it("saves an encrypted key backup", async () => {
    const ctx = createTestContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.keyBackup.save({
      encryptedKey: "encrypted-data-base64",
      iv: "iv-base64",
      salt: "salt-base64",
      publicKeyFingerprint: "abcdef1234567890",
    });

    expect(result.success).toBe(true);
    expect(result.backup.publicKeyFingerprint).toBe("abcdef1234567890");
  });

  it("checks if backup exists", async () => {
    const ctx = createTestContext();
    const caller = appRouter.createCaller(ctx);

    // Before backup
    let check = await caller.keyBackup.check();
    expect(check.exists).toBe(false);

    // After backup
    await caller.keyBackup.save({
      encryptedKey: "encrypted-data",
      iv: "iv-data",
      salt: "salt-data",
      publicKeyFingerprint: "fingerprint123",
    });

    check = await caller.keyBackup.check();
    expect(check.exists).toBe(true);
    expect(check.publicKeyFingerprint).toBe("fingerprint123");
  });

  it("retrieves encrypted backup data", async () => {
    const ctx = createTestContext();
    const caller = appRouter.createCaller(ctx);

    await caller.keyBackup.save({
      encryptedKey: "my-encrypted-key",
      iv: "my-iv",
      salt: "my-salt",
      publicKeyFingerprint: "fp-12345",
    });

    const result = await caller.keyBackup.retrieve();
    expect(result.exists).toBe(true);
    expect(result.backup?.encryptedKey).toBe("my-encrypted-key");
    expect(result.backup?.iv).toBe("my-iv");
    expect(result.backup?.salt).toBe("my-salt");
  });

  it("deletes a backup", async () => {
    const ctx = createTestContext();
    const caller = appRouter.createCaller(ctx);

    await caller.keyBackup.save({
      encryptedKey: "data",
      iv: "iv",
      salt: "salt",
      publicKeyFingerprint: "fp",
    });

    let check = await caller.keyBackup.check();
    expect(check.exists).toBe(true);

    await caller.keyBackup.delete();

    check = await caller.keyBackup.check();
    expect(check.exists).toBe(false);
  });

  it("returns empty when no backup exists", async () => {
    const ctx = createTestContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.keyBackup.retrieve();
    expect(result.exists).toBe(false);
    expect(result.backup).toBeNull();
  });
});

describe("Sync & Recovery", () => {
  beforeEach(async () => {
    const db = await import("./db") as any;
    db.__reset();
  });

  it("fullRecover returns identity, backup, ledger, intents, and approvals", async () => {
    const db = await import("./db") as any;
    const ctx = createTestContext();

    // Set up proxy user
    db.__setProxyUser(1, {
      publicKey: "pub-key-hex",
      policyHash: "policy-hash",
      seedVersion: "SEED-v1.0.0",
      status: "ACTIVE",
      onboardedAt: new Date(),
    });

    // Set up key backup
    await appRouter.createCaller(ctx).keyBackup.save({
      encryptedKey: "enc-key",
      iv: "iv",
      salt: "salt",
      publicKeyFingerprint: "fp",
    });

    const caller = appRouter.createCaller(ctx);
    const result = await caller.sync.fullRecover();

    expect(result.identity).not.toBeNull();
    expect(result.identity?.publicKey).toBe("pub-key-hex");
    expect(result.identity?.status).toBe("ACTIVE");
    expect(result.keyBackup).not.toBeNull();
    expect(result.keyBackup?.encryptedKey).toBe("enc-key");
    expect(result.ledger.chainValid).toBe(true);
    expect(result.recoveredAt).toBeGreaterThan(0);
  });

  it("resyncLedger returns full chain with verification", async () => {
    const db = await import("./db") as any;
    db.__setLedgerEntries([
      { entryId: "e1", entryType: "ONBOARD", hash: "hash1", prevHash: "GENESIS", timestamp: Date.now(), payload: "{}" },
      { entryId: "e2", entryType: "INTENT", hash: "hash2", prevHash: "hash1", timestamp: Date.now(), payload: "{}" },
    ]);

    const ctx = createTestContext();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.sync.resyncLedger();

    expect(result.entries.length).toBe(2);
    expect(result.chainValid).toBe(true);
    expect(result.totalEntries).toBe(2);
    expect(result.resyncedAt).toBeGreaterThan(0);
  });

  it("sync.pull includes hasKeyBackup status", async () => {
    const db = await import("./db") as any;
    db.__setProxyUser(1, { status: "ACTIVE", publicKey: "pk", policyHash: "ph", seedVersion: "v1" });

    const ctx = createTestContext();
    const caller = appRouter.createCaller(ctx);

    // Before backup
    let result = await caller.sync.pull({ lastKnownEntryId: undefined });
    expect(result.hasKeyBackup).toBe(false);

    // After backup
    await caller.keyBackup.save({
      encryptedKey: "data",
      iv: "iv",
      salt: "salt",
      publicKeyFingerprint: "fp",
    });

    result = await caller.sync.pull({ lastKnownEntryId: undefined });
    expect(result.hasKeyBackup).toBe(true);
  });
});
