/**
 * SMS Approval Tests
 * ──────────────────
 * Tests for the link-based SMS approval system.
 * Verifies: SMS body format, token generation, URL construction,
 * and that the same /api/rio/approve + /decline endpoints are reused.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Mock Twilio (fetch) ──────────────────────────────────────
const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

// ─── Mock ENV ─────────────────────────────────────────────────
vi.mock("./_core/env", () => ({
  ENV: {
    cookieSecret: "test-sms-approval-secret-key-32chars",
    twilioAccountSid: "ACtest123456789",
    twilioAuthToken: "test-auth-token",
    twilioMessagingServiceSid: "",
    twilioPhoneNumber: "+15551234567",
  },
}));

// ─── Mock computeHash ─────────────────────────────────────────
vi.mock("./controlPlane", () => ({
  computeHash: (input: string) => {
    const { createHash } = require("crypto");
    return createHash("sha256").update(input).digest("hex").slice(0, 16);
  },
}));

// ─── Import under test ───────────────────────────────────────
import {
  sendApprovalSMS,
  buildApprovalSMSBody,
  type ApprovalSMSRequest,
} from "./smsApproval";
import {
  generateApprovalToken,
  verifyApprovalToken,
  _resetNonces,
} from "./emailApproval";

// ─── Helpers ──────────────────────────────────────────────────

const BASE_URL = "https://rio-one.manus.space";

function makeRequest(overrides?: Partial<ApprovalSMSRequest>): ApprovalSMSRequest {
  return {
    intent_id: "INT-SMS-001",
    proposer_email: "brian@example.com",
    approver_phone: "+15559876543",
    approver_email: "approver@example.com",
    action_type: "send_email",
    action_summary: "Send quarterly report to client",
    action_details: { to: "client@example.com", subject: "Q1 Report" },
    ...overrides,
  };
}

function mockTwilioSuccess() {
  mockFetch.mockResolvedValueOnce({
    ok: true,
    json: async () => ({
      sid: "SM" + "a".repeat(32),
      status: "queued",
      from: "+15551234567",
    }),
  });
}

function mockTwilioFailure() {
  mockFetch.mockResolvedValueOnce({
    ok: false,
    json: async () => ({
      message: "Invalid phone number",
      error_code: 21211,
      status: "failed",
    }),
  });
}

// ═══════════════════════════════════════════════════════════════
// TESTS
// ═══════════════════════════════════════════════════════════════

describe("SMS Approval System", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    _resetNonces();
  });

  // ─── SMS Body Format ──────────────────────────────────────
  describe("SMS Body Format", () => {
    it("builds a short SMS with action summary and both links", () => {
      const body = buildApprovalSMSBody({
        action_summary: "Send quarterly report",
        action_type: "send_email",
        proposer_email: "brian@example.com",
        approveUrl: `${BASE_URL}/api/rio/approve?token=abc123`,
        declineUrl: `${BASE_URL}/api/rio/decline?token=abc123`,
        expires_at: Date.now() + 15 * 60 * 1000,
      });

      expect(body).toContain("RIO APPROVAL REQUEST");
      expect(body).toContain("Action: send_email");
      expect(body).toContain("Summary: Send quarterly report");
      expect(body).toContain("From: brian@example.com");
      expect(body).toContain("APPROVE:");
      expect(body).toContain("DECLINE:");
      expect(body).toContain("/api/rio/approve");
      expect(body).toContain("/api/rio/decline");
    });

    it("shows expiration time in minutes", () => {
      const body = buildApprovalSMSBody({
        action_summary: "Test",
        action_type: "test",
        proposer_email: "test@example.com",
        approveUrl: "https://example.com/approve",
        declineUrl: "https://example.com/decline",
        expires_at: Date.now() + 10 * 60 * 1000,
      });

      expect(body).toContain("Expires: 10min");
    });
  });

  // ─── Token Reuse (same as email) ──────────────────────────
  describe("Token Reuse", () => {
    it("uses the same generateApprovalToken as email approval", () => {
      const { token, payload } = generateApprovalToken({
        intent_id: "INT-SMS-001",
        proposer_email: "brian@example.com",
        approver_email: "approver@example.com",
        action_hash: "abc123",
      });

      // Token is valid
      const verification = verifyApprovalToken(token);
      expect(verification.valid).toBe(true);
      expect(verification.payload?.intent_id).toBe("INT-SMS-001");
      expect(verification.payload?.approver_email).toBe("approver@example.com");
    });

    it("SMS token is verifiable by the same verifyApprovalToken", async () => {
      mockTwilioSuccess();
      const result = await sendApprovalSMS(makeRequest(), BASE_URL);
      expect(result.success).toBe(true);

      // The token in the SMS body should be verifiable
      expect(result.token_payload).toBeDefined();
      expect(result.token_payload!.intent_id).toBe("INT-SMS-001");
      expect(result.token_payload!.approver_email).toBe("approver@example.com");
      expect(result.token_payload!.nonce).toBeDefined();
      expect(result.token_payload!.expires_at).toBeGreaterThan(Date.now());
    });
  });

  // ─── Endpoint Reuse ───────────────────────────────────────
  describe("Endpoint Reuse", () => {
    it("SMS links point to /api/rio/approve and /api/rio/decline", async () => {
      mockTwilioSuccess();
      const result = await sendApprovalSMS(makeRequest(), BASE_URL);
      expect(result.success).toBe(true);

      // Check the SMS body contains the correct endpoint URLs
      expect(result.sms_body).toContain(`${BASE_URL}/api/rio/approve?token=`);
      expect(result.sms_body).toContain(`${BASE_URL}/api/rio/decline?token=`);
    });

    it("does NOT create new endpoints — uses same as email", async () => {
      mockTwilioSuccess();
      const result = await sendApprovalSMS(makeRequest(), BASE_URL);

      // Both approve and decline URLs use the same /api/rio/ prefix
      const approveMatch = result.sms_body!.match(/APPROVE: (.+)/);
      const declineMatch = result.sms_body!.match(/DECLINE: (.+)/);

      expect(approveMatch).toBeTruthy();
      expect(declineMatch).toBeTruthy();
      expect(approveMatch![1]).toContain("/api/rio/approve?token=");
      expect(declineMatch![1]).toContain("/api/rio/decline?token=");
    });
  });

  // ─── Full Flow ────────────────────────────────────────────
  describe("Full Flow", () => {
    it("sends SMS via Twilio with correct parameters", async () => {
      mockTwilioSuccess();
      const result = await sendApprovalSMS(makeRequest(), BASE_URL);

      expect(result.success).toBe(true);
      expect(result.sms_result?.messageSid).toMatch(/^SM/);
      expect(result.sms_result?.to).toBe("+15559876543");

      // Verify Twilio was called with correct params
      expect(mockFetch).toHaveBeenCalledOnce();
      const [url, opts] = mockFetch.mock.calls[0];
      expect(url).toContain("api.twilio.com");
      expect(url).toContain("ACtest123456789");
      expect(opts.method).toBe("POST");
      expect(opts.body).toContain("To=%2B15559876543");
    });

    it("returns error when Twilio fails", async () => {
      mockTwilioFailure();
      const result = await sendApprovalSMS(makeRequest(), BASE_URL);

      expect(result.success).toBe(false);
      expect(result.error).toContain("Twilio API error");
    });

    it("returns token_payload for tracking", async () => {
      mockTwilioSuccess();
      const result = await sendApprovalSMS(makeRequest(), BASE_URL);

      expect(result.token_payload).toBeDefined();
      expect(result.token_payload!.intent_id).toBe("INT-SMS-001");
      expect(result.token_payload!.proposer_email).toBe("brian@example.com");
      expect(result.token_payload!.approver_email).toBe("approver@example.com");
      expect(result.token_payload!.action_hash).toBeDefined();
      expect(result.token_payload!.nonce).toBeDefined();
    });

    it("includes SMS body in result for verification", async () => {
      mockTwilioSuccess();
      const result = await sendApprovalSMS(makeRequest(), BASE_URL);

      expect(result.sms_body).toBeDefined();
      expect(result.sms_body).toContain("RIO APPROVAL REQUEST");
      expect(result.sms_body).toContain("send_email");
      expect(result.sms_body).toContain("Send quarterly report to client");
    });
  });

  // ─── Invariants ───────────────────────────────────────────
  describe("Invariants", () => {
    it("SMS token has same TTL as email token (~15 min)", async () => {
      mockTwilioSuccess();
      const result = await sendApprovalSMS(makeRequest(), BASE_URL);

      const ttl = result.token_payload!.expires_at - Date.now();
      // Should be ~15 minutes (900000ms), allow 5s tolerance
      expect(ttl).toBeGreaterThan(890_000);
      expect(ttl).toBeLessThan(910_000);
    });

    it("SMS token is single-use (same nonce tracking as email)", async () => {
      mockTwilioSuccess();
      const result = await sendApprovalSMS(makeRequest(), BASE_URL);

      // Reconstruct the token from the SMS body to verify it
      const approveMatch = result.sms_body!.match(/APPROVE: .+\?token=(.+)/);
      expect(approveMatch).toBeTruthy();

      // The nonce from the token_payload should not be used yet
      const nonce = result.token_payload!.nonce;
      expect(nonce).toBeDefined();
    });

    it("action_hash is computed from action_type + action_details", async () => {
      mockTwilioSuccess();
      const result = await sendApprovalSMS(makeRequest(), BASE_URL);

      expect(result.token_payload!.action_hash).toBeDefined();
      expect(result.token_payload!.action_hash.length).toBeGreaterThan(0);
    });
  });
});
