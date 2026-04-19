/**
 * Email Action Firewall — Tests
 *
 * Tests cover:
 * 1. Rule-based scanning (scanWithRules)
 * 2. Full scan pipeline (scanEmail) — rules + LLM
 * 3. Receipt generation (generateEmailReceipt)
 * 4. Receipt store (storeReceipt, getReceipts, getReceiptById, getReceiptStats)
 * 5. Sample receipt generation
 * 6. Strictness modes (strict, standard, permissive)
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock invokeLLM before importing
vi.mock("./_core/llm", () => ({
  invokeLLM: vi.fn(),
}));

import {
  scanWithRules,
  scanEmail,
  generateEmailReceipt,
  storeReceipt,
  getReceipts,
  getReceiptById,
  getReceiptStats,
  generateSampleReceipts,
  DEFAULT_RULES,
  ENGINE_VERSION,
  type EmailReceipt,
} from "./emailFirewall";
import { invokeLLM } from "./_core/llm";

const mockedInvokeLLM = vi.mocked(invokeLLM);

describe("Email Action Firewall", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ─── Rule-Based Scanning ──────────────────────────────────

  describe("scanWithRules", () => {
    it("detects direct inducement language → BLOCK", () => {
      const matches = scanWithRules(
        "If you prescribe our product, we can support your clinic financially.",
        "Partnership Opportunity",
      );
      expect(matches.length).toBeGreaterThan(0);
      expect(matches[0].category).toBe("INDUCEMENT");
      expect(matches[0].action).toBe("BLOCK");
      expect(matches[0].rule_id).toBe("INDUCEMENT_001");
    });

    it("detects implied inducement → WARN", () => {
      const matches = scanWithRules(
        "We can probably support your team if things go well 😉",
        null,
      );
      expect(matches.length).toBeGreaterThan(0);
      expect(matches.some(m => m.category === "INDUCEMENT" && m.action === "WARN")).toBe(true);
    });

    it("detects threatening language → BLOCK", () => {
      const matches = scanWithRules(
        "If you don't comply, we will expose your communications to the press.",
        "Final Notice",
      );
      expect(matches.length).toBeGreaterThan(0);
      expect(matches.some(m => m.category === "THREAT")).toBe(true);
    });

    it("detects SSN (PII) → BLOCK", () => {
      const matches = scanWithRules(
        "Employee SSN: 123-45-6789",
        "Records",
      );
      expect(matches.length).toBeGreaterThan(0);
      expect(matches.some(m => m.category === "PII" && m.action === "BLOCK")).toBe(true);
    });

    it("detects credit card numbers (PII) → BLOCK", () => {
      const matches = scanWithRules(
        "Card number: 4111 1111 1111 1111",
        null,
      );
      expect(matches.length).toBeGreaterThan(0);
      expect(matches.some(m => m.category === "PII")).toBe(true);
    });

    it("detects compliance violation (concealment) → BLOCK", () => {
      const matches = scanWithRules(
        "Between you and me, we should keep this quiet. Delete this email after reading.",
        null,
      );
      expect(matches.length).toBeGreaterThan(0);
      expect(matches.some(m => m.category === "COMPLIANCE")).toBe(true);
    });

    it("detects insider trading language → BLOCK", () => {
      const matches = scanWithRules(
        "I have non-public material information about the stock. Buy before the announcement.",
        null,
      );
      expect(matches.length).toBeGreaterThan(0);
      expect(matches.some(m => m.category === "COMPLIANCE" && m.rule_id === "COMPLIANCE_002")).toBe(true);
    });

    it("returns empty matches for clean email → PASS", () => {
      const matches = scanWithRules(
        "Please find attached the quarterly report for Q1 2026. Let me know if you have questions.",
        "Q1 Report",
      );
      expect(matches).toHaveLength(0);
    });

    it("detects confidential sharing → WARN", () => {
      const matches = scanWithRules(
        "I need to forward the confidential merger documents to the external counsel.",
        null,
      );
      expect(matches.length).toBeGreaterThan(0);
      expect(matches.some(m => m.category === "CONFIDENTIAL")).toBe(true);
    });
  });

  // ─── Strictness Modes ─────────────────────────────────────

  describe("strictness modes", () => {
    it("strict mode upgrades WARNs to BLOCKs", () => {
      const matches = scanWithRules(
        "We can probably support your team if things go well 😉",
        null,
        "strict",
      );
      // In strict mode, the WARN for implied inducement becomes BLOCK
      expect(matches.length).toBeGreaterThan(0);
      expect(matches.every(m => m.action === "BLOCK")).toBe(true);
    });

    it("permissive mode skips WARN rules", () => {
      const matches = scanWithRules(
        "We can probably support your team if things go well 😉",
        null,
        "permissive",
      );
      // Permissive skips WARN-level rules, so implied inducement is not flagged
      expect(matches).toHaveLength(0);
    });

    it("permissive mode still catches BLOCK rules", () => {
      const matches = scanWithRules(
        "If you prescribe our product, we can support your clinic financially.",
        null,
        "permissive",
      );
      expect(matches.length).toBeGreaterThan(0);
      expect(matches[0].action).toBe("BLOCK");
    });
  });

  // ─── Full Scan Pipeline ───────────────────────────────────

  describe("scanEmail", () => {
    it("returns BLOCK result for inducement email", async () => {
      // Mock LLM to return empty findings (rules are enough)
      mockedInvokeLLM.mockResolvedValueOnce({
        choices: [{ message: { content: JSON.stringify({ findings: [] }) } }],
      } as any);

      const { result, receipt } = await scanEmail(
        "If you prescribe our product, we can support your clinic financially.",
        "Partnership Opportunity",
        "dr.smith@clinic.com",
        "standard",
        true,
      );

      expect(result.event_type).toBe("BLOCK");
      expect(result.matched_rules.length).toBeGreaterThan(0);
      expect(receipt.event_type).toBe("BLOCK");
      expect(receipt.receipt_id).toBeTruthy();
      expect(receipt.email_context.hash).toBeTruthy();
      expect(receipt.email_context.subject).toBe("Partnership Opportunity");
    });

    it("returns PASS result for clean email", async () => {
      mockedInvokeLLM.mockResolvedValueOnce({
        choices: [{ message: { content: JSON.stringify({ findings: [] }) } }],
      } as any);

      const { result, receipt } = await scanEmail(
        "Please find attached the quarterly report. Let me know if you have questions.",
        "Q1 Report",
        "team@company.com",
        "standard",
        true,
      );

      expect(result.event_type).toBe("PASS");
      expect(result.matched_rules).toHaveLength(0);
      expect(receipt.event_type).toBe("PASS");
      expect(receipt.policy.category).toBe("NONE");
    });

    it("works without LLM (useLLM=false)", async () => {
      const { result, receipt } = await scanEmail(
        "If you prescribe our product, we can support your clinic financially.",
        "Partnership",
        null,
        "standard",
        false,
      );

      expect(result.event_type).toBe("BLOCK");
      expect(receipt.event_type).toBe("BLOCK");
      // LLM should NOT have been called
      expect(mockedInvokeLLM).not.toHaveBeenCalled();
    });

    it("falls back to rules when LLM fails", async () => {
      mockedInvokeLLM.mockRejectedValueOnce(new Error("LLM unavailable"));

      const { result, receipt } = await scanEmail(
        "If you prescribe our product, we can support your clinic financially.",
        "Partnership",
        null,
        "standard",
        true,
      );

      // Should still detect via rules
      expect(result.event_type).toBe("BLOCK");
      expect(receipt.event_type).toBe("BLOCK");
    });

    it("merges LLM findings with rule matches", async () => {
      mockedInvokeLLM.mockResolvedValueOnce({
        choices: [{
          message: {
            content: JSON.stringify({
              findings: [{
                category: "INAPPROPRIATE",
                confidence: "medium",
                action: "WARN",
                reason: "LLM detected subtle inappropriate tone",
              }],
            }),
          },
        }],
      } as any);

      const { result } = await scanEmail(
        "This is a normal email with no rule-based matches.",
        null,
        null,
        "standard",
        true,
      );

      // LLM should have added the INAPPROPRIATE finding
      expect(result.matched_rules.some(m => m.category === "INAPPROPRIATE")).toBe(true);
    });
  });

  // ─── Receipt Generation ───────────────────────────────────

  describe("generateEmailReceipt", () => {
    it("generates a valid receipt with all fields", () => {
      const receipt = generateEmailReceipt(
        "BLOCK",
        "Test email body",
        "Test Subject",
        "test@example.com",
        { rule_id: "INDUCEMENT_001", category: "INDUCEMENT", confidence: "high" },
        "Direct inducement detected",
        "standard",
      );

      expect(receipt.receipt_id).toBeTruthy();
      expect(receipt.timestamp).toBeTruthy();
      expect(receipt.event_type).toBe("BLOCK");
      expect(receipt.email_context.subject).toBe("Test Subject");
      expect(receipt.email_context.to).toBe("test@example.com");
      expect(receipt.email_context.hash).toHaveLength(64); // SHA-256 hex
      expect(receipt.policy.rule_id).toBe("INDUCEMENT_001");
      expect(receipt.policy.category).toBe("INDUCEMENT");
      expect(receipt.policy.confidence).toBe("high");
      expect(receipt.decision.action).toBe("BLOCK");
      expect(receipt.decision.reason).toBe("Direct inducement detected");
      expect(receipt.human.approved).toBe(false);
      expect(receipt.system.engine_version).toBe(ENGINE_VERSION);
      expect(receipt.system.strictness).toBe("standard");
    });

    it("does NOT store the email body — only SHA-256 hash", () => {
      const sensitiveBody = "Super secret email content with SSN 123-45-6789";
      const receipt = generateEmailReceipt(
        "BLOCK",
        sensitiveBody,
        null,
        null,
        { rule_id: "PII_001", category: "PII", confidence: "high" },
        "PII detected",
        "standard",
      );

      const receiptJson = JSON.stringify(receipt);
      expect(receiptJson).not.toContain(sensitiveBody);
      expect(receiptJson).not.toContain("123-45-6789");
      expect(receipt.email_context.hash).toHaveLength(64);
    });

    it("includes human approval when provided", () => {
      const receipt = generateEmailReceipt(
        "OVERRIDE",
        "Some email",
        null,
        null,
        { rule_id: "COMPLIANCE_001", category: "COMPLIANCE", confidence: "high" },
        "Override reason",
        "standard",
        { approved_by: "brian.rasmussen", approval_text: "Approved — context is informal" },
      );

      expect(receipt.human.approved).toBe(true);
      expect(receipt.human.approved_by).toBe("brian.rasmussen");
      expect(receipt.human.approval_text).toBe("Approved — context is informal");
    });
  });

  // ─── Receipt Store ────────────────────────────────────────

  describe("receipt store", () => {
    it("stores and retrieves receipts", () => {
      const receipt = generateEmailReceipt(
        "PASS",
        "Clean email",
        "Test",
        null,
        { rule_id: "NONE", category: "NONE", confidence: "low" },
        "No violations",
        "standard",
      );

      storeReceipt(receipt);
      const found = getReceiptById(receipt.receipt_id);
      expect(found).toBeTruthy();
      expect(found!.receipt_id).toBe(receipt.receipt_id);
    });

    it("returns null for unknown receipt ID", () => {
      const found = getReceiptById("nonexistent-id");
      expect(found).toBeNull();
    });

    it("getReceipts returns receipts in reverse chronological order", () => {
      // Store a few receipts
      for (let i = 0; i < 3; i++) {
        storeReceipt(generateEmailReceipt(
          "PASS",
          `Email ${i}`,
          `Subject ${i}`,
          null,
          { rule_id: "NONE", category: "NONE", confidence: "low" },
          "No violations",
          "standard",
        ));
      }

      const receipts = getReceipts(3);
      expect(receipts.length).toBeGreaterThanOrEqual(3);
      // Most recent first
      const t0 = new Date(receipts[0].timestamp).getTime();
      const t1 = new Date(receipts[1].timestamp).getTime();
      expect(t0).toBeGreaterThanOrEqual(t1);
    });

    it("getReceiptStats counts by event type", () => {
      const stats = getReceiptStats();
      expect(stats).toHaveProperty("total");
      expect(stats).toHaveProperty("blocked");
      expect(stats).toHaveProperty("warned");
      expect(stats).toHaveProperty("passed");
      expect(stats).toHaveProperty("overridden");
      expect(stats.total).toBe(stats.blocked + stats.warned + stats.passed + stats.overridden);
    });
  });

  // ─── Sample Receipts ──────────────────────────────────────

  describe("generateSampleReceipts", () => {
    it("generates 4 sample receipts covering all event types", () => {
      const samples = generateSampleReceipts();
      expect(samples).toHaveLength(4);

      const types = samples.map(s => s.event_type);
      expect(types).toContain("BLOCK");
      expect(types).toContain("WARN");
      expect(types).toContain("PASS");
      expect(types).toContain("OVERRIDE");
    });

    it("sample receipts have valid structure", () => {
      const samples = generateSampleReceipts();
      for (const s of samples) {
        expect(s.receipt_id).toBeTruthy();
        expect(s.timestamp).toBeTruthy();
        expect(s.email_context.hash).toHaveLength(64);
        expect(s.system.engine_version).toBe(ENGINE_VERSION);
      }
    });
  });

  // ─── Default Rules ────────────────────────────────────────

  describe("DEFAULT_RULES", () => {
    it("has rules for all major categories", () => {
      const categories = new Set(DEFAULT_RULES.map(r => r.category));
      expect(categories.has("INDUCEMENT")).toBe(true);
      expect(categories.has("THREAT")).toBe(true);
      expect(categories.has("PII")).toBe(true);
      expect(categories.has("COMPLIANCE")).toBe(true);
      expect(categories.has("CONFIDENTIAL")).toBe(true);
    });

    it("every rule has required fields", () => {
      for (const rule of DEFAULT_RULES) {
        expect(rule.rule_id).toBeTruthy();
        expect(rule.category).toBeTruthy();
        expect(rule.patterns.length).toBeGreaterThan(0);
        expect(rule.description).toBeTruthy();
        expect(["BLOCK", "WARN"]).toContain(rule.action);
        expect(["high", "medium", "low"]).toContain(rule.minConfidence);
      }
    });
  });
});
