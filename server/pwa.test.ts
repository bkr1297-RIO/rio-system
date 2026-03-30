/**
 * PWA Feature Tests
 *
 * Tests for:
 *   1. Push router scaffolding (subscribe, unsubscribe, status)
 *   2. Manifest.json structure validation
 *   3. Service worker file existence
 */

import { describe, expect, it } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";
import * as fs from "fs";
import * as path from "path";

// ── Auth helpers (from auth.logout.test.ts pattern) ──────────────────

type AuthenticatedUser = NonNullable<TrpcContext["user"]>;

function createAuthContext(): { ctx: TrpcContext } {
  const user: AuthenticatedUser = {
    id: 1,
    openId: "test-user-pwa",
    email: "brian@rio.dev",
    name: "Brian K. Rasmussen",
    loginMethod: "manus",
    role: "user",
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
      clearCookie: () => {},
    } as TrpcContext["res"],
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
      clearCookie: () => {},
    } as TrpcContext["res"],
  };

  return { ctx };
}

// ── Push Router Tests ────────────────────────────────────────────────

describe("push.subscribe", () => {
  it("accepts a valid push subscription and returns success", async () => {
    const { ctx } = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.push.subscribe({
      endpoint: "https://fcm.googleapis.com/fcm/send/test-endpoint-123",
      keys: {
        p256dh: "BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQtUbVlUls0VJXg7A8u-Ts1XbjhazAkj7I99e8p8REfWHk",
        auth: "tBHItJI5svbpC7KI_hL_5A",
      },
    });

    expect(result).toEqual({
      success: true,
      message: expect.stringContaining("scaffolding"),
    });
  });

  it("rejects unauthenticated subscription attempts", async () => {
    const { ctx } = createUnauthContext();
    const caller = appRouter.createCaller(ctx);

    await expect(
      caller.push.subscribe({
        endpoint: "https://fcm.googleapis.com/fcm/send/test-endpoint-123",
        keys: {
          p256dh: "BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQtUbVlUls0VJXg7A8u-Ts1XbjhazAkj7I99e8p8REfWHk",
          auth: "tBHItJI5svbpC7KI_hL_5A",
        },
      })
    ).rejects.toThrow();
  });
});

describe("push.unsubscribe", () => {
  it("accepts a valid unsubscribe request", async () => {
    const { ctx } = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.push.unsubscribe({
      endpoint: "https://fcm.googleapis.com/fcm/send/test-endpoint-123",
    });

    expect(result).toEqual({
      success: true,
      message: expect.stringContaining("scaffolding"),
    });
  });
});

describe("push.status", () => {
  it("returns subscription status for authenticated user", async () => {
    const { ctx } = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.push.status();

    expect(result).toHaveProperty("subscribed");
    expect(result.subscribed).toBe(false); // scaffolding always returns false
    expect(result).toHaveProperty("message");
  });

  it("rejects unauthenticated status check", async () => {
    const { ctx } = createUnauthContext();
    const caller = appRouter.createCaller(ctx);

    await expect(caller.push.status()).rejects.toThrow();
  });
});

// ── Manifest Validation Tests ────────────────────────────────────────

describe("manifest.json", () => {
  const manifestPath = path.resolve(__dirname, "../client/public/manifest.json");

  it("exists in client/public", () => {
    expect(fs.existsSync(manifestPath)).toBe(true);
  });

  it("is valid JSON with required PWA fields", () => {
    const raw = fs.readFileSync(manifestPath, "utf-8");
    const manifest = JSON.parse(raw);

    expect(manifest.name).toBeTruthy();
    expect(manifest.short_name).toBe("RIO");
    expect(manifest.display).toBe("standalone");
    expect(manifest.start_url).toBe("/m/approvals");
    expect(manifest.background_color).toBeTruthy();
    expect(manifest.theme_color).toBeTruthy();
  });

  it("has icons with required sizes for PWA installability", () => {
    const raw = fs.readFileSync(manifestPath, "utf-8");
    const manifest = JSON.parse(raw);

    expect(manifest.icons).toBeDefined();
    expect(Array.isArray(manifest.icons)).toBe(true);

    const sizes = manifest.icons.map((i: { sizes: string }) => i.sizes);
    // Chrome requires at least 192x192 and 512x512
    expect(sizes).toContain("192x192");
    expect(sizes).toContain("512x512");
  });

  it("has a maskable icon for adaptive icon support", () => {
    const raw = fs.readFileSync(manifestPath, "utf-8");
    const manifest = JSON.parse(raw);

    const maskable = manifest.icons.find(
      (i: { purpose?: string }) => i.purpose === "maskable"
    );
    expect(maskable).toBeDefined();
  });

  it("has shortcuts for mobile app quick actions", () => {
    const raw = fs.readFileSync(manifestPath, "utf-8");
    const manifest = JSON.parse(raw);

    expect(manifest.shortcuts).toBeDefined();
    expect(manifest.shortcuts.length).toBeGreaterThanOrEqual(4);

    const urls = manifest.shortcuts.map((s: { url: string }) => s.url);
    expect(urls).toContain("/m/approvals");
    expect(urls).toContain("/m/receipts");
    expect(urls).toContain("/m/ledger");
    expect(urls).toContain("/m/settings");
  });
});

// ── Service Worker Validation Tests ──────────────────────────────────

describe("sw.js", () => {
  const swPath = path.resolve(__dirname, "../client/public/sw.js");

  it("exists in client/public", () => {
    expect(fs.existsSync(swPath)).toBe(true);
  });

  it("contains push event handler", () => {
    const content = fs.readFileSync(swPath, "utf-8");
    expect(content).toContain('addEventListener("push"');
  });

  it("contains notificationclick handler", () => {
    const content = fs.readFileSync(swPath, "utf-8");
    expect(content).toContain('addEventListener("notificationclick"');
  });

  it("contains install and activate handlers", () => {
    const content = fs.readFileSync(swPath, "utf-8");
    expect(content).toContain('addEventListener("install"');
    expect(content).toContain('addEventListener("activate"');
  });

  it("contains fetch handler with API bypass", () => {
    const content = fs.readFileSync(swPath, "utf-8");
    expect(content).toContain('addEventListener("fetch"');
    expect(content).toContain("/api/");
  });

  it("pre-caches mobile app routes", () => {
    const content = fs.readFileSync(swPath, "utf-8");
    expect(content).toContain("/m/approvals");
    expect(content).toContain("/m/receipts");
    expect(content).toContain("/m/ledger");
    expect(content).toContain("/m/settings");
  });
});
