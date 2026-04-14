/**
 * Firewall ↔ Governance Bridge Tests
 * ────────────────────────────────────
 * Verifies that every firewall scan decision writes to the governance ledger.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Mock appendLedger ────────────────────────────────────────
const mockAppendLedger = vi.fn().mockResolvedValue({
  entryId: "LE-test-entry-001",
  hash: "abc123hash",
  prevHash: "GENESIS",
  timestamp: Date.now(),
});

vi.mock("./db", () => ({
  appendLedger: (...args: unknown[]) => mockAppendLedger(...args),
  sha256: (s: string) => `sha256(${s.slice(0, 20)})`,
}));

// ─── Mock storeReceipt (file-based) ──────────────────────────
const mockStoreReceipt = vi.fn();
vi.mock("./emailFirewall", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./emailFirewall")>();
  return {
    ...actual,
    storeReceipt: (...args: unknown[]) => mockStoreReceipt(...args),
  };
});

// ─── Mock Telegram ───────────────────────────────────────────
const mockIsTelegramConfigured = vi.fn().mockReturnValue(false);
const mockSendKillNotification = vi.fn().mockResolvedValue(true);
vi.mock("./telegram", () => ({
  isTelegramConfigured: () => mockIsTelegramConfigured(),
  sendKillNotification: (...args: unknown[]) => mockSendKillNotification(...args),
}));

// ─── Import after mocks ─────────────────────────────────────
import { storeGovernedReceipt } from "./firewallGovernance";
import type { EmailReceipt } from "./emailFirewall";

// ─── Test Fixtures ──────────────────────────────────────────

function makeReceipt(overrides: Partial<EmailReceipt> = {}): EmailReceipt {
  return {
    receipt_id: "test-receipt-001",
    timestamp: new Date().toISOString(),
    event_type: "PASS",
    channel: "email",
    email_context: {
      subject: "Test",
      hash: "sha256-test",
      to: "test@example.com",
      recipient: {
        email: "test@example.com",
        type: "external",
        familiarity: "established",
        sensitive: false,
        sensitiveReason: null,
        domain: "example.com",
      },
    },
    policy: {
      rule_id: "NONE",
      category: "NONE" as any,
      confidence: "low",
    },
    decision: {
      action: "PASS",
      reason: "No policy violations detected.",
    },
    human: {
      approved: false,
      approved_by: null,
      approval_text: null,
    },
    system: {
      engine_version: "v1",
      policy_mode: "standard",
      strictness: "standard",
    },
    coherence: {
      status: "COHERENT",
      issues: [],
      checked: false,
    },
    channel_metadata: { client: "rio-firewall" },
    pattern_id: "NONE",
    confidence_score: 0.3,
    org_domain: "example.com",
    policy_version: "v1-standard",
    reason_display: "Message cleared — no policy violations detected.",
    ...overrides,
  };
}

// ─── Tests ──────────────────────────────────────────────────

describe("Firewall Governance Bridge", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("storeGovernedReceipt", () => {
    it("stores receipt to file AND writes FIREWALL_SCAN to ledger", async () => {
      const receipt = makeReceipt();
      const result = await storeGovernedReceipt(receipt);

      // File-based receipt stored
      expect(mockStoreReceipt).toHaveBeenCalledWith(receipt);

      // Ledger entry written
      expect(mockAppendLedger).toHaveBeenCalledTimes(1);
      expect(mockAppendLedger).toHaveBeenCalledWith("FIREWALL_SCAN", expect.objectContaining({
        receipt_id: "test-receipt-001",
        event_type: "PASS",
        channel: "email",
      }));

      // Returns ledger metadata
      expect(result).toEqual({
        ledger_entry_id: "LE-test-entry-001",
        ledger_hash: "abc123hash",
      });
    });

    it("includes governance-grade fields in ledger payload", async () => {
      const receipt = makeReceipt({
        event_type: "BLOCK",
        channel: "sms",
        policy: { rule_id: "INDUCEMENT_001", category: "INDUCEMENT" as any, confidence: "high" },
        confidence_score: 0.9,
        pattern_id: "INDUCEMENT_001",
        org_domain: "bigfund.com",
        policy_version: "v1-strict",
      });

      await storeGovernedReceipt(receipt);

      const payload = mockAppendLedger.mock.calls[0][1];
      expect(payload.receipt_id).toBe("test-receipt-001");
      expect(payload.event_type).toBe("BLOCK");
      expect(payload.channel).toBe("sms");
      expect(payload.rule_id).toBe("INDUCEMENT_001");
      expect(payload.category).toBe("INDUCEMENT");
      expect(payload.confidence).toBe("high");
      expect(payload.confidence_score).toBe(0.9);
      expect(payload.pattern_id).toBe("INDUCEMENT_001");
      expect(payload.org_domain).toBe("bigfund.com");
      expect(payload.policy_version).toBe("v1-strict");
      expect(payload.engine_version).toBe("v1");
      expect(payload.strictness).toBe("standard");
    });

    it("includes content hash but NEVER raw email body", async () => {
      const receipt = makeReceipt({
        email_context: {
          subject: "Secret plans",
          hash: "sha256-of-body",
          to: "spy@evil.com",
          recipient: undefined,
        },
      });

      await storeGovernedReceipt(receipt);

      const payload = mockAppendLedger.mock.calls[0][1];
      expect(payload.content_hash).toBe("sha256-of-body");
      // Ensure no raw body leaked
      expect(JSON.stringify(payload)).not.toContain("Secret plans");
    });

    it("includes recipient classification without PII", async () => {
      const receipt = makeReceipt({
        email_context: {
          subject: "Test",
          hash: "sha256-test",
          to: "investor@bigfund.com",
          recipient: {
            email: "investor@bigfund.com",
            type: "external",
            familiarity: "first-time",
            sensitive: true,
            sensitiveReason: "Investor/financial entity",
            domain: "bigfund.com",
          },
        },
      });

      await storeGovernedReceipt(receipt);

      const payload = mockAppendLedger.mock.calls[0][1];
      expect(payload.recipient_type).toBe("external");
      expect(payload.recipient_familiarity).toBe("first-time");
      // No email address in payload
      expect(JSON.stringify(payload)).not.toContain("investor@bigfund.com");
    });

    it("includes coherence status in ledger payload", async () => {
      const receipt = makeReceipt({
        coherence: {
          status: "DRIFT",
          issues: ["[ALIGNMENT] Decision may not match stated objective"],
          checked: true,
          source_status: "YELLOW",
        },
      });

      await storeGovernedReceipt(receipt);

      const payload = mockAppendLedger.mock.calls[0][1];
      expect(payload.coherence_status).toBe("DRIFT");
      expect(payload.coherence_checked).toBe(true);
    });

    it("handles all 4 channel types", async () => {
      const channels = ["email", "sms", "slack", "linkedin"] as const;

      for (const channel of channels) {
        vi.clearAllMocks();
        const receipt = makeReceipt({ channel });
        await storeGovernedReceipt(receipt);

        expect(mockAppendLedger).toHaveBeenCalledWith("FIREWALL_SCAN", expect.objectContaining({
          channel,
        }));
      }
    });

    it("handles all event types", async () => {
      const eventTypes = ["BLOCK", "WARN", "FLAG", "PASS", "OVERRIDE"] as const;

      for (const event_type of eventTypes) {
        vi.clearAllMocks();
        const receipt = makeReceipt({ event_type });
        await storeGovernedReceipt(receipt);

        expect(mockAppendLedger).toHaveBeenCalledWith("FIREWALL_SCAN", expect.objectContaining({
          event_type,
        }));
      }
    });
  });

  describe("Telegram alerts on BLOCK", () => {
    it("sends Telegram alert when BLOCK and Telegram is configured", async () => {
      mockIsTelegramConfigured.mockReturnValue(true);
      const receipt = makeReceipt({ event_type: "BLOCK" });

      await storeGovernedReceipt(receipt);

      expect(mockSendKillNotification).toHaveBeenCalledTimes(1);
      const alertMsg = mockSendKillNotification.mock.calls[0][0];
      expect(alertMsg).toContain("FIREWALL BLOCK");
      expect(alertMsg).toContain("email");
    });

    it("does NOT send Telegram alert for non-BLOCK decisions", async () => {
      mockIsTelegramConfigured.mockReturnValue(true);

      for (const event_type of ["WARN", "FLAG", "PASS", "OVERRIDE"] as const) {
        vi.clearAllMocks();
        mockIsTelegramConfigured.mockReturnValue(true);
        const receipt = makeReceipt({ event_type });
        await storeGovernedReceipt(receipt);

        expect(mockSendKillNotification).not.toHaveBeenCalled();
      }
    });

    it("does NOT send Telegram alert when Telegram is not configured", async () => {
      mockIsTelegramConfigured.mockReturnValue(false);
      const receipt = makeReceipt({ event_type: "BLOCK" });

      await storeGovernedReceipt(receipt);

      expect(mockSendKillNotification).not.toHaveBeenCalled();
    });
  });

  describe("Graceful degradation", () => {
    it("returns null when ledger write fails (non-blocking)", async () => {
      mockAppendLedger.mockRejectedValueOnce(new Error("Database not available"));
      const receipt = makeReceipt();

      const result = await storeGovernedReceipt(receipt);

      // File-based receipt still stored
      expect(mockStoreReceipt).toHaveBeenCalledWith(receipt);
      // Ledger entry returns null (degraded)
      expect(result).toBeNull();
    });

    it("still stores file receipt even when ledger fails", async () => {
      mockAppendLedger.mockRejectedValueOnce(new Error("Connection timeout"));
      const receipt = makeReceipt({ event_type: "BLOCK" });

      await storeGovernedReceipt(receipt);

      // File receipt stored
      expect(mockStoreReceipt).toHaveBeenCalledWith(receipt);
      // Telegram NOT called (ledger failed before alert)
      expect(mockSendKillNotification).not.toHaveBeenCalled();
    });

    it("Telegram alert failure does not affect receipt storage", async () => {
      mockIsTelegramConfigured.mockReturnValue(true);
      mockSendKillNotification.mockRejectedValueOnce(new Error("Telegram API error"));
      const receipt = makeReceipt({ event_type: "BLOCK" });

      const result = await storeGovernedReceipt(receipt);

      // Receipt stored and ledger written despite Telegram failure
      expect(mockStoreReceipt).toHaveBeenCalledWith(receipt);
      expect(result).not.toBeNull();
      expect(result?.ledger_entry_id).toBe("LE-test-entry-001");
    });
  });
});
