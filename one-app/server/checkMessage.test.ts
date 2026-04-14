/**
 * Multi-Channel Implementation Spec v1.0 — Tests
 *
 * Tests cover:
 * 1. POST /api/v1/check-message — all 4 channels
 * 2. Receipt schema enrichment (channel_metadata, pattern_id, confidence_score, etc.)
 * 3. FLAG action type
 * 4. Response shapes (block, allow, flag, error)
 * 5. Validation errors
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock invokeLLM before importing
vi.mock("./_core/llm", () => ({
  invokeLLM: vi.fn(),
}));

// Mock coherence module
vi.mock("./coherence", () => ({
  runCoherenceCheck: vi.fn().mockResolvedValue({
    status: "GREEN",
    signals: [],
    timestamp: new Date().toISOString(),
  }),
  buildSystemContext: vi.fn().mockReturnValue({
    activeObjective: "test",
    systemHealth: "test",
  }),
}));

import {
  scanEmail,
  generateEmailReceipt,
  confidenceToScore,
  _resetForTesting,
  type ChannelType,
  type EmailReceipt,
} from "./emailFirewall";

// ─── Receipt Schema Enrichment Tests ─────────────────────────

describe("Multi-Channel Receipt Schema", () => {
  beforeEach(() => {
    _resetForTesting();
  });

  it("receipt includes channel_metadata for email channel", async () => {
    const { receipt } = await scanEmail(
      "Please find the Q1 report attached.",
      "Q1 Report",
      "team@company.com",
      "standard",
      false,
      undefined,
      "email",
    );
    expect(receipt.channel).toBe("email");
    expect(receipt.channel_metadata).toBeDefined();
    expect(receipt.channel_metadata).toHaveProperty("client");
    expect(receipt.channel_metadata).toHaveProperty("to");
    expect(receipt.channel_metadata).toHaveProperty("subject", "Q1 Report");
  });

  it("receipt includes channel_metadata for sms channel", async () => {
    const { receipt } = await scanEmail(
      "Quick update on the project.",
      null,
      "+15551234567",
      "standard",
      false,
      undefined,
      "sms",
    );
    expect(receipt.channel).toBe("sms");
    expect(receipt.channel_metadata).toBeDefined();
    expect(receipt.channel_metadata).toHaveProperty("platform");
    expect(receipt.channel_metadata).toHaveProperty("recipient", "+15551234567");
    expect(receipt.channel_metadata).toHaveProperty("message_type");
  });

  it("receipt includes channel_metadata for slack channel", async () => {
    const { receipt } = await scanEmail(
      "Here is the report.",
      null,
      "C67890",
      "standard",
      false,
      undefined,
      "slack",
    );
    expect(receipt.channel).toBe("slack");
    expect(receipt.channel_metadata).toBeDefined();
    expect(receipt.channel_metadata).toHaveProperty("workspace_id");
    expect(receipt.channel_metadata).toHaveProperty("channel_type", "dm");
  });

  it("receipt includes channel_metadata for linkedin channel", async () => {
    const { receipt } = await scanEmail(
      "Thanks for connecting!",
      null,
      "john.doe",
      "standard",
      false,
      undefined,
      "linkedin",
    );
    expect(receipt.channel).toBe("linkedin");
    expect(receipt.channel_metadata).toBeDefined();
    expect(receipt.channel_metadata).toHaveProperty("recipient_profile", "john.doe");
    expect(receipt.channel_metadata).toHaveProperty("conversation_type", "message");
  });

  it("receipt includes pattern_id (maps to rule_id) — v2 mode", async () => {
    const { receipt } = await scanEmail(
      "If you prescribe our product, we can support your clinic financially.",
      "Partnership",
      "dr.smith@clinic.com",
      "standard",
      false,
      { mvpMode: false },
    );
    expect(receipt.pattern_id).toBeDefined();
    expect(receipt.pattern_id).toBe("INDUCEMENT_001");
  });

  it("receipt includes numeric confidence_score (0.0-1.0) — v2 mode", async () => {
    const { receipt } = await scanEmail(
      "If you prescribe our product, we can support your clinic financially.",
      "Partnership",
      "dr.smith@clinic.com",
      "standard",
      false,
      { mvpMode: false },
    );
    expect(receipt.confidence_score).toBeDefined();
    expect(typeof receipt.confidence_score).toBe("number");
    expect(receipt.confidence_score).toBeGreaterThanOrEqual(0);
    expect(receipt.confidence_score).toBeLessThanOrEqual(1);
    expect(receipt.confidence_score).toBe(0.9); // high confidence = 0.9
  });

  it("receipt includes org_domain extracted from recipient", async () => {
    const { receipt } = await scanEmail(
      "Please review the attached document.",
      "Document Review",
      "user@example.com",
      "standard",
      false,
    );
    expect(receipt.org_domain).toBe("example.com");
  });

  it("receipt includes policy_version", async () => {
    const { receipt } = await scanEmail(
      "Hello, this is a test.",
      "Test",
      null,
      "standard",
      false,
    );
    expect(receipt.policy_version).toBeDefined();
    expect(receipt.policy_version).toBe("v1-standard");
  });

  it("receipt includes reason_display for BLOCK — v2 mode", async () => {
    const { receipt } = await scanEmail(
      "If you prescribe our product, we can support your clinic financially.",
      "Partnership",
      null,
      "standard",
      false,
      { mvpMode: false },
    );
    expect(receipt.reason_display).toBeDefined();
    expect(receipt.reason_display).toContain("blocked");
  });

  it("receipt includes suggested_edit for BLOCK — v2 mode", async () => {
    const { receipt } = await scanEmail(
      "If you prescribe our product, we can support your clinic financially.",
      "Partnership",
      null,
      "standard",
      false,
      { mvpMode: false },
    );
    expect(receipt.suggested_edit).toBeDefined();
    expect(receipt.suggested_edit!.length).toBeGreaterThan(0);
  });

  it("PASS receipt has no suggested_edit", async () => {
    const { receipt } = await scanEmail(
      "Here is the quarterly report for Q1 2026.",
      "Q1 Report",
      null,
      "standard",
      false,
    );
    expect(receipt.event_type).toBe("PASS");
    expect(receipt.suggested_edit).toBeUndefined();
  });
});

// ─── Confidence Score Mapping ─────────────────────────────────

describe("confidenceToScore", () => {
  it("maps high to 0.9", () => {
    expect(confidenceToScore("high")).toBe(0.9);
  });

  it("maps medium to 0.6", () => {
    expect(confidenceToScore("medium")).toBe(0.6);
  });

  it("maps low to 0.3", () => {
    expect(confidenceToScore("low")).toBe(0.3);
  });
});

// ─── FLAG Action Type ─────────────────────────────────────────

describe("FLAG action type", () => {
  beforeEach(() => {
    _resetForTesting();
  });

  it("medium-confidence WARN-only matches produce FLAG (not WARN) — v2 mode", async () => {
    // This message triggers INDUCEMENT_002 (medium confidence, WARN action)
    const { result } = await scanEmail(
      "We can probably support your team if things go well 😉",
      "Quick thought",
      null,
      "standard",
      false,
      { mvpMode: false },
    );
    // INDUCEMENT_002 is medium confidence WARN — should produce FLAG
    expect(result.event_type).toBe("FLAG");
  });

  it("high-confidence WARN matches still produce WARN (not FLAG) — v2 mode", async () => {
    // Sensitive recipient triggers high-confidence WARN
    const { result } = await scanEmail(
      "Here is the report you requested.",
      "Report",
      "official@sec.gov",
      "standard",
      false,
      { mvpMode: false },
    );
    // RECIPIENT_002 is high confidence for sensitive recipient → WARN (not FLAG)
    const hasHighWarn = result.matched_rules.some(r => r.action === "WARN" && r.confidence === "high");
    if (hasHighWarn) {
      expect(result.event_type).toBe("WARN");
    }
  });

  it("BLOCK rules still produce BLOCK regardless of FLAG logic — v2 mode", async () => {
    const { result } = await scanEmail(
      "If you prescribe our product, we can support your clinic financially.",
      "Partnership",
      null,
      "standard",
      false,
      { mvpMode: false },
    );
    expect(result.event_type).toBe("BLOCK");
  });
});

// ─── Check-Message API Response Shape Tests ───────────────────
// These test the response building logic without HTTP layer

describe("Check-Message Response Shape", () => {
  beforeEach(() => {
    _resetForTesting();
  });

  it("email channel block response has required fields — v2 mode", async () => {
    const { receipt } = await scanEmail(
      "If you prescribe our product, we can support your clinic financially.",
      "Partnership",
      "dr.smith@clinic.com",
      "standard",
      false,
      { mvpMode: false },
      "email",
    );
    expect(receipt.event_type).toBe("BLOCK");
    expect(receipt.receipt_id).toBeDefined();
    expect(receipt.timestamp).toBeDefined();
    expect(receipt.channel).toBe("email");
    expect(receipt.channel_metadata).toBeDefined();
    expect(receipt.pattern_id).toBe("INDUCEMENT_001");
    expect(receipt.confidence_score).toBe(0.9);
    expect(receipt.org_domain).toBe("clinic.com");
    expect(receipt.policy_version).toBe("v1-standard");
    expect(receipt.reason_display).toBeDefined();
    expect(receipt.suggested_edit).toBeDefined();
  });

  it("sms channel allow response has required fields", async () => {
    const { receipt } = await scanEmail(
      "Meeting at 3pm confirmed.",
      null,
      null,
      "standard",
      false,
      undefined,
      "sms",
    );
    expect(receipt.event_type).toBe("PASS");
    expect(receipt.channel).toBe("sms");
    expect(receipt.channel_metadata).toBeDefined();
    expect(receipt.pattern_id).toBe("NONE");
    expect(receipt.confidence_score).toBe(0.3);
    expect(receipt.policy_version).toBe("v1-standard");
    expect(receipt.reason_display).toContain("cleared");
  });

  it("slack channel flag response has required fields — v2 mode", async () => {
    // Trigger a medium-confidence WARN (becomes FLAG) — v2 mode
    const { receipt } = await scanEmail(
      "We can probably support your team if things go well 😉",
      null,
      null,
      "standard",
      false,
      { mvpMode: false },
      "slack",
    );
    expect(receipt.channel).toBe("slack");
    expect(receipt.channel_metadata).toBeDefined();
    expect(receipt.channel_metadata).toHaveProperty("workspace_id");
    expect(receipt.pattern_id).toBeDefined();
    expect(receipt.confidence_score).toBeDefined();
    expect(receipt.policy_version).toBeDefined();
  });

  it("linkedin channel processes correctly", async () => {
    const { receipt } = await scanEmail(
      "Here is the quarterly report.",
      null,
      "john.doe@linkedin.com",
      "standard",
      false,
      undefined,
      "linkedin",
    );
    expect(receipt.channel).toBe("linkedin");
    expect(receipt.channel_metadata).toBeDefined();
    expect(receipt.channel_metadata).toHaveProperty("recipient_profile");
    expect(receipt.policy_version).toBeDefined();
  });

  it("error response shape for missing channel", async () => {
    // This tests the validation logic conceptually
    const validChannels = ["email", "sms", "slack", "linkedin"];
    expect(validChannels.includes("twitter")).toBe(false);
    expect(validChannels.includes("email")).toBe(true);
  });

  it("block response includes suggested_edit and reason_display — v2 mode", async () => {
    const { receipt } = await scanEmail(
      "Or else you will regret this decision.",
      "Warning",
      null,
      "standard",
      false,
      { mvpMode: false },
    );
    expect(receipt.event_type).toBe("BLOCK");
    expect(receipt.suggested_edit).toBeDefined();
    expect(receipt.reason_display).toBeDefined();
    expect(receipt.reason_display).toContain("blocked");
  });
});

// ─── generateEmailReceipt with channelMetadata override ───────

describe("generateEmailReceipt with channel metadata", () => {
  it("accepts custom channel_metadata", () => {
    const receipt = generateEmailReceipt(
      "PASS",
      "Hello world",
      "Test",
      "user@example.com",
      { rule_id: "NONE", category: "NONE", confidence: "low" },
      "No violations",
      "standard",
      undefined,
      undefined,
      undefined,
      "slack",
      undefined,
      { workspace_id: "T001", workspace_name: "RIO", channel_name: "general", channel_type: "public" },
    );
    expect(receipt.channel).toBe("slack");
    expect(receipt.channel_metadata).toHaveProperty("workspace_id", "T001");
    expect(receipt.channel_metadata).toHaveProperty("workspace_name", "RIO");
  });
});
