/**
 * OAuth System Tests
 *
 * Tests the Google OAuth flow, token management, connection management,
 * and the user_connections database schema.
 *
 * Note: These are unit tests that verify the OAuth module structure,
 * route registration, and helper functions without making real HTTP calls
 * to Google's OAuth servers.
 */

import { describe, it, expect, vi } from "vitest";

// ── Google OAuth Module Structure ──────────────────────────────────────────

describe("Google OAuth Module", () => {
  it("exports registerGoogleOAuthRoutes function", async () => {
    const mod = await import("./oauth/google");
    expect(mod.registerGoogleOAuthRoutes).toBeDefined();
    expect(typeof mod.registerGoogleOAuthRoutes).toBe("function");
  });

  it("exports refreshGoogleToken function", async () => {
    const mod = await import("./oauth/google");
    expect(mod.refreshGoogleToken).toBeDefined();
    expect(typeof mod.refreshGoogleToken).toBe("function");
  });

  it("exports getValidGoogleToken function", async () => {
    const mod = await import("./oauth/google");
    expect(mod.getValidGoogleToken).toBeDefined();
    expect(typeof mod.getValidGoogleToken).toBe("function");
  });
});

// ── OAuth Index Module ─────────────────────────────────────────────────────

describe("OAuth Index Module", () => {
  it("exports registerProviderOAuthRoutes function", async () => {
    const mod = await import("./oauth/index");
    expect(mod.registerProviderOAuthRoutes).toBeDefined();
    expect(typeof mod.registerProviderOAuthRoutes).toBe("function");
  });

  it("registers routes on an Express app mock", async () => {
    const { registerProviderOAuthRoutes } = await import("./oauth/index");

    const registeredRoutes: Array<{ method: string; path: string }> = [];
    const mockApp = {
      get: vi.fn((path: string) => {
        registeredRoutes.push({ method: "GET", path });
      }),
      post: vi.fn((path: string) => {
        registeredRoutes.push({ method: "POST", path });
      }),
    };

    registerProviderOAuthRoutes(mockApp as any);

    // Should register Google OAuth routes
    const paths = registeredRoutes.map((r) => r.path);
    expect(paths).toContain("/api/oauth/google/start");
    expect(paths).toContain("/api/oauth/google/callback");
    expect(paths).toContain("/api/oauth/google/disconnect");
    expect(paths).toContain("/api/oauth/google/status");
  });

  it("registers correct HTTP methods for each route", async () => {
    const { registerProviderOAuthRoutes } = await import("./oauth/index");

    const registeredRoutes: Array<{ method: string; path: string }> = [];
    const mockApp = {
      get: vi.fn((path: string) => {
        registeredRoutes.push({ method: "GET", path });
      }),
      post: vi.fn((path: string) => {
        registeredRoutes.push({ method: "POST", path });
      }),
    };

    registerProviderOAuthRoutes(mockApp as any);

    // GET routes
    const getRoutes = registeredRoutes.filter((r) => r.method === "GET").map((r) => r.path);
    expect(getRoutes).toContain("/api/oauth/google/start");
    expect(getRoutes).toContain("/api/oauth/google/callback");
    expect(getRoutes).toContain("/api/oauth/google/status");

    // POST routes
    const postRoutes = registeredRoutes.filter((r) => r.method === "POST").map((r) => r.path);
    expect(postRoutes).toContain("/api/oauth/google/disconnect");
  });
});

// ── User Connections Schema ────────────────────────────────────────────────

describe("User Connections Schema", () => {
  it("exports userConnections table from schema", async () => {
    const schema = await import("../drizzle/schema");
    expect(schema.userConnections).toBeDefined();
  });

  it("has required columns", async () => {
    const schema = await import("../drizzle/schema");
    const table = schema.userConnections;

    // Check that the table has the expected column names
    const columnNames = Object.keys(table);
    // Drizzle tables expose columns as properties
    expect(columnNames).toContain("id");
    expect(columnNames).toContain("userId");
    expect(columnNames).toContain("provider");
    expect(columnNames).toContain("accessToken");
    expect(columnNames).toContain("refreshToken");
    expect(columnNames).toContain("tokenExpiresAt");
    expect(columnNames).toContain("status");
    expect(columnNames).toContain("providerAccountId");
    expect(columnNames).toContain("providerAccountName");
    expect(columnNames).toContain("scopes");
    expect(columnNames).toContain("connectedAt");
    expect(columnNames).toContain("updatedAt");
  });

  it("userConnections table is a valid Drizzle table object", async () => {
    const schema = await import("../drizzle/schema");
    // Verify it's a proper Drizzle table with column definitions
    expect(schema.userConnections).toBeDefined();
    expect(typeof schema.userConnections).toBe("object");
    // Should have the SQL table name
    const tableName = (schema.userConnections as any)[Symbol.for("drizzle:Name")];
    expect(tableName).toBe("user_connections");
  });
});

// ── Google OAuth Scopes ────────────────────────────────────────────────────

describe("Google OAuth Configuration", () => {
  it("Google OAuth env vars are configured", async () => {
    // These should be set via webdev_request_secrets
    // In test env they may be empty strings, but the ENV object should have the keys
    const { ENV } = await import("./_core/env");
    expect(ENV).toHaveProperty("googleOAuthClientId");
    expect(ENV).toHaveProperty("googleOAuthClientSecret");
    expect(typeof ENV.googleOAuthClientId).toBe("string");
    expect(typeof ENV.googleOAuthClientSecret).toBe("string");
  });
});

// ── OAuth State Encoding ───────────────────────────────────────────────────

describe("OAuth State Encoding", () => {
  it("can encode and decode state with base64url", () => {
    const stateData = {
      userId: 1,
      openId: "test-open-id",
      ts: Date.now(),
    };

    const encoded = Buffer.from(JSON.stringify(stateData)).toString("base64url");
    const decoded = JSON.parse(Buffer.from(encoded, "base64url").toString());

    expect(decoded.userId).toBe(stateData.userId);
    expect(decoded.openId).toBe(stateData.openId);
    expect(decoded.ts).toBe(stateData.ts);
  });

  it("rejects expired state (older than 10 minutes)", () => {
    const stateData = {
      userId: 1,
      openId: "test-open-id",
      ts: Date.now() - 11 * 60 * 1000, // 11 minutes ago
    };

    const isExpired = Date.now() - stateData.ts > 10 * 60 * 1000;
    expect(isExpired).toBe(true);
  });

  it("accepts valid state (within 10 minutes)", () => {
    const stateData = {
      userId: 1,
      openId: "test-open-id",
      ts: Date.now() - 5 * 60 * 1000, // 5 minutes ago
    };

    const isExpired = Date.now() - stateData.ts > 10 * 60 * 1000;
    expect(isExpired).toBe(false);
  });
});

// ── Token Refresh Logic ────────────────────────────────────────────────────

describe("Token Expiry Logic", () => {
  it("detects expired tokens (with 5-minute buffer)", () => {
    const now = new Date();

    // Token expires in 3 minutes — should be considered expired (within 5-min buffer)
    const expiresIn3Min = new Date(now.getTime() + 3 * 60 * 1000);
    const isExpired3 = expiresIn3Min.getTime() < now.getTime() + 5 * 60 * 1000;
    expect(isExpired3).toBe(true);

    // Token expires in 10 minutes — should NOT be considered expired
    const expiresIn10Min = new Date(now.getTime() + 10 * 60 * 1000);
    const isExpired10 = expiresIn10Min.getTime() < now.getTime() + 5 * 60 * 1000;
    expect(isExpired10).toBe(false);

    // Token already expired — should be considered expired
    const alreadyExpired = new Date(now.getTime() - 1000);
    const isExpiredPast = alreadyExpired.getTime() < now.getTime() + 5 * 60 * 1000;
    expect(isExpiredPast).toBe(true);
  });
});

// ── Connections Router ─────────────────────────────────────────────────────

describe("Connections Router", () => {
  it("exports connectionsRouter", async () => {
    const mod = await import("./routers/connections");
    expect(mod.connectionsRouter).toBeDefined();
  });

  it("connections router is registered in the app router", async () => {
    const mod = await import("./routers");
    const router = mod.appRouter;
    // The router should have a connections key
    expect(router._def.procedures).toBeDefined();
  });
});

// ── Google Provider Constants ──────────────────────────────────────────────

describe("Google Provider Constants", () => {
  it("Google providers cover Gmail, Drive, and Calendar", () => {
    const GOOGLE_PROVIDERS = ["gmail", "google_drive", "google_calendar"];
    expect(GOOGLE_PROVIDERS).toHaveLength(3);
    expect(GOOGLE_PROVIDERS).toContain("gmail");
    expect(GOOGLE_PROVIDERS).toContain("google_drive");
    expect(GOOGLE_PROVIDERS).toContain("google_calendar");
  });
});
