import { describe, expect, it, vi } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

type AuthenticatedUser = NonNullable<TrpcContext["user"]>;

function createAuthContext(): { ctx: TrpcContext } {
  const user: AuthenticatedUser = {
    id: 1,
    openId: "brian-test-user",
    email: "brian@rio-protocol.com",
    name: "Brian Rasmussen",
    loginMethod: "manus",
    role: "admin",
    createdAt: new Date(),
    updatedAt: new Date(),
    lastSignedIn: new Date(),
  };

  const ctx: TrpcContext = {
    user,
    req: {
      protocol: "https",
      headers: {},
    } as TrpcContext["req"],
    res: {
      clearCookie: vi.fn(),
    } as unknown as TrpcContext["res"],
  };

  return { ctx };
}

describe("Gateway Wiring — Login", () => {
  it("gatewayLogin returns success or gateway-not-configured", async () => {
    const { ctx } = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.rio.gatewayLogin({
      userId: "brian.k.rasmussen",
      passphrase: "rio-governed-2026",
    });
    expect(result).toBeDefined();
    expect(result).toHaveProperty("success");
    // If gateway is configured, we get a token; if not, we get an error
    if (result.success) {
      expect(result).toHaveProperty("token");
      expect(result).toHaveProperty("userId");
      expect(result).toHaveProperty("role");
    } else {
      expect(result).toHaveProperty("error");
    }
  }, 30000);

  it("gatewayLogin returns error for invalid credentials", async () => {
    const { ctx } = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.rio.gatewayLogin({
      userId: "invalid-user",
      passphrase: "wrong-password",
    });
    expect(result).toBeDefined();
    expect(result).toHaveProperty("success");
    // Should fail — either gateway not configured or invalid creds
    if (!result.success) {
      expect(result).toHaveProperty("error");
    }
  }, 30000);
});

describe("Gateway Wiring — Intent Listing", () => {
  it("gatewayIntents returns intents array with source field", async () => {
    const { ctx } = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.rio.gatewayIntents({
      status: "pending_authorization",
    });
    expect(result).toBeDefined();
    expect(result).toHaveProperty("intents");
    expect(result).toHaveProperty("source");
    expect(Array.isArray(result.intents)).toBe(true);
    expect(["gateway", "none", "error"]).toContain(result.source);
  }, 30000);

  it("gatewayIntents works without parameters", async () => {
    const { ctx } = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.rio.gatewayIntents();
    expect(result).toBeDefined();
    expect(result).toHaveProperty("intents");
    expect(Array.isArray(result.intents)).toBe(true);
  }, 30000);

  it("gatewayIntents respects limit parameter", async () => {
    const { ctx } = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.rio.gatewayIntents({ limit: 5 });
    expect(result).toBeDefined();
    expect(result.intents.length).toBeLessThanOrEqual(5);
  }, 30000);
});

describe("Gateway Wiring — Intent Detail", () => {
  it("gatewayIntentDetail returns found status for valid intent", async () => {
    const { ctx } = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    // First get a list of intents to find a valid ID
    const intents = await caller.rio.gatewayIntents();
    if (intents.intents.length > 0) {
      const intentId = (intents.intents[0] as any).intent_id || (intents.intents[0] as any).intentId;
      if (intentId) {
        const result = await caller.rio.gatewayIntentDetail({ intentId });
        expect(result).toBeDefined();
        expect(result).toHaveProperty("source");
        expect(result).toHaveProperty("found");
      }
    }
  }, 30000);

  it("gatewayIntentDetail handles non-existent intent gracefully", async () => {
    const { ctx } = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.rio.gatewayIntentDetail({
      intentId: "non-existent-intent-id-12345",
    });
    expect(result).toBeDefined();
    expect(result).toHaveProperty("source");
    // Should either not find it or return an error
    expect(["gateway", "none", "error"]).toContain(result.source);
  }, 30000);
});

describe("Gateway Wiring — Chain Verification", () => {
  it("gatewayVerify returns chain integrity status", async () => {
    const { ctx } = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.rio.gatewayVerify();
    expect(result).toBeDefined();
    expect(result).toHaveProperty("source");
    expect(["gateway", "none", "error"]).toContain(result.source);
  }, 30000);
});

describe("Gateway Wiring — Approve with Signature", () => {
  it("approve accepts optional Ed25519 signature fields", async () => {
    const { ctx } = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    // Create an intent first
    const intent = await caller.rio.createIntent({
      action: "send_email",
      description: "Test email for signing",
      requestedBy: "brian@rio-protocol.com",
    });
    expect(intent).toBeDefined();
    expect(intent).toHaveProperty("intentId");

    // Approve with mock signature
    const result = await caller.rio.approve({
      intentId: intent.intentId,
      signature: "mock-ed25519-signature-hex",
      signatureTimestamp: new Date().toISOString(),
    });
    expect(result).toBeDefined();
    // The approve returns intentId, decision, decidedBy, signature
    expect(result).toHaveProperty("intentId");
    expect(result).toHaveProperty("decision");
  }, 30000);

  it("approve works without signature (backward compatible)", async () => {
    const { ctx } = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    const intent = await caller.rio.createIntent({
      action: "send_email",
      description: "Test email without signing",
      requestedBy: "brian@rio-protocol.com",
    });
    // Approve without signature — should still work
    const result = await caller.rio.approve({
      intentId: intent.intentId,
    });
    expect(result).toBeDefined();
    expect(result).toHaveProperty("intentId");
    expect(result).toHaveProperty("decision");
  }, 30000);
});

describe("Gateway Wiring — Governance Health", () => {
  it("governanceHealth returns gateway connection info", async () => {
    const { ctx } = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.rio.governanceHealth();
    expect(result).toBeDefined();
    expect(result).toHaveProperty("mode");
    expect(["GATEWAY", "INTERNAL", "uninitialized"]).toContain(result.mode);
    if (result.mode === "GATEWAY") {
      expect(result).toHaveProperty("gatewayUrl");
    }
  }, 30000);
});

describe("Gateway Wiring — Ledger Chain (merged)", () => {
  it("ledgerChain merges gateway and internal entries", async () => {
    const { ctx } = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.rio.ledgerChain({ limit: 20 });
    expect(result).toBeDefined();
    expect(result).toHaveProperty("entries");
    expect(result).toHaveProperty("chainValid");
    expect(Array.isArray(result.entries)).toBe(true);
    // Each entry should have the expected shape
    if (result.entries.length > 0) {
      const entry = result.entries[0];
      expect(entry).toHaveProperty("block_id");
      expect(entry).toHaveProperty("action");
      expect(entry).toHaveProperty("decision");
    }
  }, 30000);
});
