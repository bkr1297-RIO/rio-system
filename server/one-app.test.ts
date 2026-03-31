import { describe, expect, it, vi, beforeEach } from "vitest";
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

function createUnauthContext(): { ctx: TrpcContext } {
  const ctx: TrpcContext = {
    user: null,
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

describe("ONE App — Auth", () => {
  it("auth.me returns the authenticated user", async () => {
    const { ctx } = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    const user = await caller.auth.me();
    expect(user).toBeDefined();
    expect(user?.email).toBe("brian@rio-protocol.com");
    expect(user?.name).toBe("Brian Rasmussen");
    expect(user?.role).toBe("admin");
  });

  it("auth.me returns null for unauthenticated user", async () => {
    const { ctx } = createUnauthContext();
    const caller = appRouter.createCaller(ctx);
    const user = await caller.auth.me();
    expect(user).toBeNull();
  });
});

describe("ONE App — Approvals (rio.ledgerChain)", () => {
  it("ledgerChain returns entries array and chain validity", async () => {
    const { ctx } = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.rio.ledgerChain({ limit: 10 });
    expect(result).toBeDefined();
    expect(result).toHaveProperty("entries");
    expect(result).toHaveProperty("chainValid");
    expect(Array.isArray(result.entries)).toBe(true);
  });

  it("ledgerChain respects limit parameter", async () => {
    const { ctx } = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.rio.ledgerChain({ limit: 5 });
    expect(result.entries.length).toBeLessThanOrEqual(5);
  });
});

describe("ONE App — History (rio.auditLog)", () => {
  it("auditLog returns audit log data for a given intent", async () => {
    const { ctx } = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    // First create an intent so we have a valid intentId
    const intent = await caller.rio.createIntent({
      action: "send_email",
      description: "Send a test email",
      requestedBy: "brian@rio-protocol.com",
    });
    const result = await caller.rio.auditLog({ intentId: intent.intentId });
    expect(result).toBeDefined();
    expect(result).toHaveProperty("intentId");
    expect(result).toHaveProperty("log");
    expect(Array.isArray(result.log)).toBe(true);
  });
});

describe("ONE App — Policies (rio.activePolicies)", () => {
  it("activePolicies returns array of policies", async () => {
    const { ctx } = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.rio.activePolicies();
    expect(result).toBeDefined();
    expect(Array.isArray(result)).toBe(true);
  });
});

describe("ONE App — Policies (rio.learningAnalytics)", () => {
  it("learningAnalytics returns analytics data", async () => {
    const { ctx } = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.rio.learningAnalytics();
    expect(result).toBeDefined();
    expect(result).toHaveProperty("totalDecisions");
    expect(result).toHaveProperty("overallApprovalRate");
    expect(result).toHaveProperty("actionStats");
    expect(result).toHaveProperty("suggestions");
    expect(typeof result.totalDecisions).toBe("number");
    expect(typeof result.overallApprovalRate).toBe("number");
  });
});

describe("ONE App — Governance Health", () => {
  it("governanceHealth returns mode and gateway info", async () => {
    const { ctx } = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.rio.governanceHealth();
    expect(result).toBeDefined();
    expect(result).toHaveProperty("mode");
    expect(["GATEWAY", "INTERNAL", "uninitialized"]).toContain(result.mode);
  });
});

describe("ONE App — Connections", () => {
  it("myConnections returns array of connected services", async () => {
    const { ctx } = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.connections.myConnections();
    expect(result).toBeDefined();
    expect(Array.isArray(result)).toBe(true);
  });

  it("googleStatus returns connection status", async () => {
    const { ctx } = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.connections.googleStatus();
    expect(result).toBeDefined();
    expect(result).toHaveProperty("connected");
    expect(typeof result.connected).toBe("boolean");
  });

  it("githubStatus returns connection status", async () => {
    const { ctx } = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.connections.githubStatus();
    expect(result).toBeDefined();
    expect(result).toHaveProperty("connected");
    expect(typeof result.connected).toBe("boolean");
  });
});

describe("ONE App — Push Notifications", () => {
  it("push.subscribe stores a subscription", async () => {
    const { ctx } = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.push.subscribe({
      endpoint: "https://fcm.googleapis.com/fcm/send/test-endpoint",
      keys: {
        p256dh: "test-p256dh-key",
        auth: "test-auth-key",
      },
    });
    expect(result).toBeDefined();
    expect(result).toHaveProperty("success");
    expect(result.success).toBe(true);
  });
});

describe("ONE App — Intent Creation", () => {
  it("createIntent creates a governed intent", async () => {
    const { ctx } = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.rio.createIntent({
      action: "send_email",
      description: "Send a test email",
      requestedBy: "brian@rio-protocol.com",
    });
    expect(result).toBeDefined();
    expect(result).toHaveProperty("intentId");
    expect(result).toHaveProperty("intentHash");
    expect(result).toHaveProperty("status");
    expect(result).toHaveProperty("action");
    expect(result.action).toBe("send_email");
  });
});

describe("ONE App — Routing Mode", () => {
  it("routingMode returns current governance mode", async () => {
    const { ctx } = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.rio.routingMode();
    expect(result).toBeDefined();
    expect(result).toHaveProperty("mode");
    expect(["GATEWAY", "INTERNAL", "uninitialized"]).toContain(result.mode);
  });
});
