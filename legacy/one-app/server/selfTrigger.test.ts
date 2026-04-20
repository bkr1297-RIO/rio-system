/**
 * Self-Trigger Tests
 * ──────────────────
 * Tests for rio.triggerAction tRPC mutation.
 * Verifies: input validation, approval email dispatch, source tagging.
 */
import { describe, expect, it, vi, beforeEach } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

// Mock sendApprovalEmail to avoid real email sends
vi.mock("./emailApproval", () => ({
  sendApprovalEmail: vi.fn().mockResolvedValue({
    success: true,
    token_payload: { expires_at: Date.now() + 900_000 },
    email_result: { messageId: "mock-msg-id" },
  }),
}));

function createAuthContext(email = "brian@example.com"): TrpcContext {
  return {
    user: {
      id: 1,
      openId: "owner-001",
      email,
      name: "Brian",
      loginMethod: "manus",
      role: "admin",
      createdAt: new Date(),
      updatedAt: new Date(),
      lastSignedIn: new Date(),
    },
    req: {
      protocol: "https",
      headers: {
        origin: "https://rio-one.manus.space",
      },
    } as TrpcContext["req"],
    res: {
      clearCookie: () => {},
    } as TrpcContext["res"],
  };
}

function createUnauthContext(): TrpcContext {
  return {
    user: null,
    req: {
      protocol: "https",
      headers: {},
    } as TrpcContext["req"],
    res: {
      clearCookie: () => {},
    } as TrpcContext["res"],
  };
}

describe("rio.triggerAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("sends approval email for send_email action", async () => {
    const ctx = createAuthContext("bkr1297@gmail.com");
    const caller = appRouter.createCaller(ctx);

    const result = await caller.rio.triggerAction({
      action_type: "send_email",
      recipient: "jordanrasmussen12@gmail.com",
      subject: "RIO Test",
      body: "Hello from RIO!",
      source: "RIO_UI",
    });

    expect(result.success).toBe(true);
    expect(result.intent_id).toMatch(/^INT-RIO_UI-/);
    expect(result.approver_email).toBe("bkr1297@gmail.com"); // defaults to self
    expect(result.action_type).toBe("send_email");
    expect(result.source).toBe("RIO_UI");
    expect(result.expires_at).toBeTruthy();
  });

  it("uses custom approver when provided", async () => {
    const ctx = createAuthContext("bkr1297@gmail.com");
    const caller = appRouter.createCaller(ctx);

    const result = await caller.rio.triggerAction({
      action_type: "send_email",
      recipient: "todd@example.com",
      subject: "Test",
      approver_email: "riomethod5@gmail.com",
      source: "RIO_UI",
    });

    expect(result.approver_email).toBe("riomethod5@gmail.com");
  });

  it("defaults source to RIO_UI", async () => {
    const ctx = createAuthContext("bkr1297@gmail.com");
    const caller = appRouter.createCaller(ctx);

    const result = await caller.rio.triggerAction({
      action_type: "send_email",
      recipient: "test@example.com",
      subject: "Test",
    });

    expect(result.source).toBe("RIO_UI");
    expect(result.intent_id).toMatch(/^INT-RIO_UI-/);
  });

  it("supports TELEGRAM source", async () => {
    const ctx = createAuthContext("bkr1297@gmail.com");
    const caller = appRouter.createCaller(ctx);

    const result = await caller.rio.triggerAction({
      action_type: "send_email",
      recipient: "test@example.com",
      subject: "From Telegram",
      source: "TELEGRAM",
    });

    expect(result.source).toBe("TELEGRAM");
    expect(result.intent_id).toMatch(/^INT-TELEGRAM-/);
  });

  it("supports send_sms action type", async () => {
    const ctx = createAuthContext("bkr1297@gmail.com");
    const caller = appRouter.createCaller(ctx);

    const result = await caller.rio.triggerAction({
      action_type: "send_sms",
      recipient: "+15551234567",
      body: "Hello via SMS",
      source: "RIO_UI",
    });

    expect(result.success).toBe(true);
    expect(result.action_type).toBe("send_sms");
    expect(result.action_summary).toContain("+15551234567");
  });

  it("rejects unauthenticated users", async () => {
    const ctx = createUnauthContext();
    const caller = appRouter.createCaller(ctx);

    await expect(
      caller.rio.triggerAction({
        action_type: "send_email",
        recipient: "test@example.com",
        subject: "Should fail",
      })
    ).rejects.toThrow();
  });

  it("rejects empty recipient", async () => {
    const ctx = createAuthContext("bkr1297@gmail.com");
    const caller = appRouter.createCaller(ctx);

    await expect(
      caller.rio.triggerAction({
        action_type: "send_email",
        recipient: "",
        subject: "Test",
      })
    ).rejects.toThrow();
  });

  it("rejects invalid action_type", async () => {
    const ctx = createAuthContext("bkr1297@gmail.com");
    const caller = appRouter.createCaller(ctx);

    await expect(
      caller.rio.triggerAction({
        action_type: "delete_everything" as any,
        recipient: "test@example.com",
      })
    ).rejects.toThrow();
  });

  it("generates unique intent IDs", async () => {
    const ctx = createAuthContext("bkr1297@gmail.com");
    const caller = appRouter.createCaller(ctx);

    const r1 = await caller.rio.triggerAction({
      action_type: "send_email",
      recipient: "a@example.com",
      subject: "Test 1",
    });
    // Small delay to ensure Date.now() differs
    await new Promise(resolve => setTimeout(resolve, 2));
    const r2 = await caller.rio.triggerAction({
      action_type: "send_email",
      recipient: "b@example.com",
      subject: "Test 2",
    });

    expect(r1.intent_id).not.toBe(r2.intent_id);
  });

  it("builds correct action summary for email", async () => {
    const ctx = createAuthContext("bkr1297@gmail.com");
    const caller = appRouter.createCaller(ctx);

    const result = await caller.rio.triggerAction({
      action_type: "send_email",
      recipient: "jordan@example.com",
      subject: "Hello",
    });

    expect(result.action_summary).toBe("Send governed email to jordan@example.com");
  });

  it("builds correct action summary for SMS", async () => {
    const ctx = createAuthContext("bkr1297@gmail.com");
    const caller = appRouter.createCaller(ctx);

    const result = await caller.rio.triggerAction({
      action_type: "send_sms",
      recipient: "+15551234567",
      body: "Test SMS",
    });

    expect(result.action_summary).toBe("Send governed SMS to +15551234567");
  });
});
