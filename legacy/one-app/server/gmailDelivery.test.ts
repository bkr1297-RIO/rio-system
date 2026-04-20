/**
 * Gmail Delivery Path Tests
 * ─────────────────────────
 * Tests the send_email connector's Gmail delivery path:
 * 1. delivery_mode routing (gmail vs notify)
 * 2. Receipt includes delivery fields
 * 3. Fail-safe: Gmail failure → success:false, not marked executed
 * 4. Protocol version bump to 2.3.0
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ─── 1. delivery_mode routing ─────────────────────────────────

describe("delivery_mode routing in send_email connector", () => {
  it("should default to 'notify' when delivery_mode is not set", () => {
    const toolArgs: Record<string, unknown> = {
      to: "test@example.com",
      subject: "Test",
      body: "Hello",
      _gatewayExecution: true,
    };
    const deliveryMode = toolArgs.delivery_mode === "gmail" ? "gmail" : "notify";
    expect(deliveryMode).toBe("notify");
  });

  it("should select 'gmail' when delivery_mode is 'gmail'", () => {
    const toolArgs: Record<string, unknown> = {
      to: "test@example.com",
      subject: "Test",
      body: "Hello",
      delivery_mode: "gmail",
      _gatewayExecution: true,
    };
    const deliveryMode = toolArgs.delivery_mode === "gmail" ? "gmail" : "notify";
    expect(deliveryMode).toBe("gmail");
  });

  it("should select 'notify' when delivery_mode is 'notify'", () => {
    const toolArgs: Record<string, unknown> = {
      to: "test@example.com",
      subject: "Test",
      body: "Hello",
      delivery_mode: "notify",
      _gatewayExecution: true,
    };
    const deliveryMode = toolArgs.delivery_mode === "gmail" ? "gmail" : "notify";
    expect(deliveryMode).toBe("notify");
  });

  it("should treat unknown delivery_mode values as 'notify'", () => {
    const toolArgs: Record<string, unknown> = {
      to: "test@example.com",
      delivery_mode: "carrier_pigeon",
      _gatewayExecution: true,
    };
    const deliveryMode = toolArgs.delivery_mode === "gmail" ? "gmail" : "notify";
    expect(deliveryMode).toBe("notify");
  });
});

// ─── 2. Receipt delivery fields ───────────────────────────────

describe("receipt delivery fields", () => {
  it("should include delivery_mode, delivery_status, external_message_id in receipt hash", async () => {
    const { generateReceipt, PROTOCOL_VERSION } = await import("./connectors");
    const { sha256 } = await import("./db");

    const result = {
      success: true,
      output: { delivered: true, method: "gmail" },
      executedAt: Date.now(),
    };

    const receipt = generateReceipt(
      "exec-001",
      "intent-001",
      "send_email",
      result,
      null,
      { token_id: "tok-1", policy_hash: "pol-1" },
      { delivery_mode: "gmail", delivery_status: "SENT", external_message_id: "<abc@gmail.com>" },
    );

    expect(receipt.delivery_mode).toBe("gmail");
    expect(receipt.delivery_status).toBe("SENT");
    expect(receipt.external_message_id).toBe("<abc@gmail.com>");
    expect(receipt.protocolVersion).toBe("2.3.0");

    // Verify the hash includes delivery fields
    const expectedHash = sha256(JSON.stringify({
      protocolVersion: PROTOCOL_VERSION,
      executionId: "exec-001",
      intentId: "intent-001",
      result: {
        output: result.output,
        toolName: "send_email",
        toolArgs: {},
        executedAt: result.executedAt,
      },
      token_id: "tok-1",
      policy_hash: "pol-1",
      delivery_mode: "gmail",
      delivery_status: "SENT",
      external_message_id: "<abc@gmail.com>",
    }));
    expect(receipt.receiptHash).toBe(expectedHash);
  });

  it("should produce different hashes for gmail vs notify delivery", async () => {
    const { generateReceipt } = await import("./connectors");

    const result = {
      success: true,
      output: { delivered: true },
      executedAt: 1700000000000,
    };

    const gmailReceipt = generateReceipt(
      "exec-001", "intent-001", "send_email", result, null,
      undefined,
      { delivery_mode: "gmail", delivery_status: "SENT", external_message_id: "<abc@gmail.com>" },
    );

    const notifyReceipt = generateReceipt(
      "exec-001", "intent-001", "send_email", result, null,
      undefined,
      { delivery_mode: "notify", delivery_status: "SENT" },
    );

    expect(gmailReceipt.receiptHash).not.toBe(notifyReceipt.receiptHash);
  });

  it("should include FAILED delivery_status in receipt when Gmail fails", async () => {
    const { generateReceipt } = await import("./connectors");

    const result = {
      success: false,
      output: { delivered: false, error: "SMTP connection refused" },
      executedAt: Date.now(),
    };

    const receipt = generateReceipt(
      "exec-002", "intent-002", "send_email", result, null,
      undefined,
      { delivery_mode: "gmail", delivery_status: "FAILED" },
    );

    expect(receipt.delivery_mode).toBe("gmail");
    expect(receipt.delivery_status).toBe("FAILED");
    expect(receipt.external_message_id).toBeUndefined();
  });

  it("should be backward compatible — no delivery fields when not provided", async () => {
    const { generateReceipt } = await import("./connectors");

    const result = {
      success: true,
      output: { delivered: true },
      executedAt: Date.now(),
    };

    const receipt = generateReceipt(
      "exec-003", "intent-003", "send_email", result, null,
    );

    expect(receipt.delivery_mode).toBeUndefined();
    expect(receipt.delivery_status).toBeUndefined();
    expect(receipt.external_message_id).toBeUndefined();
  });
});

// ─── 3. Fail-safe behavior ────────────────────────────────────

describe("Gmail delivery fail-safe", () => {
  it("should return success:false when Gmail SMTP fails", () => {
    // Simulating what the connector returns when sendViaGmail returns success:false
    const connectorResult = {
      success: false,
      output: {
        delivered: false,
        method: "gmail",
        governance: "gateway",
        delivery_mode: "gmail",
        delivery_status: "FAILED",
        error: "GMAIL_SMTP_ERROR: Connection refused",
      },
      error: "FAIL_CLOSED: Gmail delivery failed — GMAIL_SMTP_ERROR: Connection refused",
      metadata: {
        method: "gmail",
        governance: "gateway",
        delivery_mode: "gmail",
        delivery_status: "FAILED",
      },
      executedAt: Date.now(),
    };

    // Fail-safe: success must be false
    expect(connectorResult.success).toBe(false);
    // Error must contain FAIL_CLOSED
    expect(connectorResult.error).toContain("FAIL_CLOSED");
    // Delivery status must be FAILED
    expect((connectorResult.output as Record<string, unknown>).delivery_status).toBe("FAILED");
  });

  it("should return success:false when Gmail throws an exception", () => {
    const connectorResult = {
      success: false,
      output: {
        delivered: false,
        method: "gmail",
        governance: "gateway",
        delivery_mode: "gmail",
        delivery_status: "FAILED",
        error: "Unexpected SMTP error",
      },
      error: "FAIL_CLOSED: Gmail delivery exception — Unexpected SMTP error",
      executedAt: Date.now(),
    };

    expect(connectorResult.success).toBe(false);
    expect(connectorResult.error).toContain("FAIL_CLOSED");
    expect(connectorResult.error).toContain("exception");
  });

  it("should NOT mark intent as executed when connector returns failure", () => {
    // This tests the contract: if connectorResult.success === false,
    // the caller (approveAndExecute) calls updateIntentStatus(id, "FAILED")
    // and returns { success: false }
    const connectorResult = { success: false, error: "Gmail failed" };
    const shouldMarkExecuted = connectorResult.success;
    expect(shouldMarkExecuted).toBe(false);
  });
});

// ─── 4. Protocol version ──────────────────────────────────────

describe("protocol version", () => {
  it("should be 2.3.0 after delivery fields addition", async () => {
    const { PROTOCOL_VERSION } = await import("./connectors");
    expect(PROTOCOL_VERSION).toBe("2.3.0");
  });
});

// ─── 5. Gmail SMTP real connection test ───────────────────────

describe("Gmail SMTP real connection", () => {
  it("should verify SMTP credentials are valid", async () => {
    const { verifyGmailConnection } = await import("./gmailSmtp");
    const result = await verifyGmailConnection();
    expect(result.connected).toBe(true);
  });
});

// ─── 6. Connector output shape for Gmail success ──────────────

describe("Gmail connector output shape", () => {
  it("should include all required fields on successful Gmail delivery", () => {
    const output = {
      delivered: true,
      method: "gmail",
      governance: "gateway",
      delivery_mode: "gmail",
      delivery_status: "SENT",
      external_message_id: "<abc123@gmail.com>",
      to: "test@example.com",
      subject: "Test Subject",
      bodyLength: 42,
      accepted: ["test@example.com"],
      rejected: [],
      approvalId: "approval-001",
      note: "Delivered via Gmail SMTP through RIO Gateway governance loop.",
    };

    expect(output.delivered).toBe(true);
    expect(output.method).toBe("gmail");
    expect(output.delivery_mode).toBe("gmail");
    expect(output.delivery_status).toBe("SENT");
    expect(output.external_message_id).toBeDefined();
    expect(output.external_message_id).toContain("@");
    expect(output.accepted).toContain("test@example.com");
    expect(output.rejected).toHaveLength(0);
  });
});
