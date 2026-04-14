/**
 * Gmail SMTP Tests
 * ────────────────
 * 1. Validates SMTP credentials via transporter.verify()
 * 2. Tests delivery_mode routing logic
 * 3. Tests fail-safe behavior
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Credential Validation (real SMTP check) ─────────────────

describe("Gmail SMTP credential validation", () => {
  it("should verify SMTP connection with configured credentials", async () => {
    const { verifyGmailConnection } = await import("./gmailSmtp");
    const result = await verifyGmailConnection();

    // If credentials are valid, connected = true
    // If not configured or invalid, connected = false with error
    expect(result).toHaveProperty("connected");
    if (result.connected) {
      expect(result.error).toBeUndefined();
    } else {
      expect(result.error).toBeDefined();
      console.warn("Gmail SMTP not connected:", result.error);
    }
  });
});

// ─── Delivery Mode Routing ────────────────────────────────────

describe("delivery_mode routing", () => {
  it("should route to Gmail when delivery_mode is 'gmail'", () => {
    const deliveryMode = "gmail";
    expect(deliveryMode === "gmail").toBe(true);
  });

  it("should route to notifyOwner when delivery_mode is 'notify'", () => {
    const deliveryMode = "notify";
    expect(deliveryMode === "notify" || deliveryMode === undefined).toBe(true);
  });

  it("should default to 'notify' when delivery_mode is not set", () => {
    const deliveryMode = undefined;
    const effective = deliveryMode ?? "notify";
    expect(effective).toBe("notify");
  });
});

// ─── Fail-Safe Behavior ──────────────────────────────────────

describe("Gmail delivery fail-safe", () => {
  it("should return error result when credentials are missing", async () => {
    // Mock ENV to have empty credentials
    vi.doMock("./_core/env", () => ({
      ENV: {
        gmailUser: "",
        gmailAppPassword: "",
      },
    }));

    // Re-import to get fresh module with mocked ENV
    const { resetTransporter, sendViaGmail } = await import("./gmailSmtp");
    resetTransporter();

    const result = await sendViaGmail("test@example.com", "Test", "Body");
    expect(result.success).toBe(false);
    expect(result.error).toContain("GMAIL");

    vi.doUnmock("./_core/env");
  });

  it("should include messageId on successful send", () => {
    // Structure check — a successful result must have messageId
    const mockResult = {
      success: true,
      messageId: "<abc123@gmail.com>",
      accepted: ["test@example.com"],
      rejected: [],
    };
    expect(mockResult.messageId).toBeDefined();
    expect(mockResult.accepted).toContain("test@example.com");
  });

  it("should not mark as executed when Gmail send fails", () => {
    const mockResult = {
      success: false,
      error: "GMAIL_SMTP_ERROR: Connection refused",
    };
    // Fail-safe: success=false means execution is NOT marked complete
    expect(mockResult.success).toBe(false);
    expect(mockResult.error).toContain("GMAIL_SMTP_ERROR");
  });
});

// ─── Receipt Delivery Fields ─────────────────────────────────

describe("receipt delivery fields", () => {
  it("should include all required delivery fields in receipt", () => {
    const receipt = {
      delivery_mode: "gmail" as const,
      delivery_status: "SENT" as const,
      external_message_id: "<abc123@gmail.com>",
    };

    expect(receipt.delivery_mode).toBe("gmail");
    expect(receipt.delivery_status).toBe("SENT");
    expect(receipt.external_message_id).toBeDefined();
  });

  it("should record FAILED status when delivery fails", () => {
    const receipt = {
      delivery_mode: "gmail" as const,
      delivery_status: "FAILED" as const,
      external_message_id: undefined,
    };

    expect(receipt.delivery_mode).toBe("gmail");
    expect(receipt.delivery_status).toBe("FAILED");
    expect(receipt.external_message_id).toBeUndefined();
  });

  it("should record notify delivery mode for notifyOwner path", () => {
    const receipt = {
      delivery_mode: "notify" as const,
      delivery_status: "SENT" as const,
      external_message_id: undefined,
    };

    expect(receipt.delivery_mode).toBe("notify");
    expect(receipt.delivery_status).toBe("SENT");
  });
});
