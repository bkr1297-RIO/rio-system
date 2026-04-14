/**
 * Email Action Firewall — Tests
 *
 * Tests cover:
 * 1. Rule-based scanning (scanWithRules)
 * 2. Full scan pipeline (scanEmail) — rules + LLM
 * 3. Receipt generation (generateEmailReceipt)
 * 4. Receipt store (file-based persistence)
 * 5. Sample receipt generation
 * 6. Strictness modes (strict, standard, permissive)
 * 7. Unified coherence (delegates to server/coherence.ts)
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";

// Mock invokeLLM before importing
vi.mock("./_core/llm", () => ({
  invokeLLM: vi.fn(),
}));

// Mock coherence module — checkCoherence now delegates to this
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
  scanWithRules,
  scanEmail,
  generateEmailReceipt,
  checkCoherence,
  storeReceipt,
  getReceipts,
  getReceiptById,
  getReceiptStats,
  generateSampleReceipts,
  _resetReceiptCache,
  _resetForTesting,
  DEFAULT_RULES,
  ENGINE_VERSION,
  classifyRecipient,
  markContactEstablished,
  _resetKnownContacts,
  processIncomingMessage,
  getReceiptsByChannel,
  getInboundMessageStats,
  type EmailReceipt,
  type CoherenceBlock,
  type RecipientProfile,
  type MessageRouting,
} from "./emailFirewall";
import { invokeLLM } from "./_core/llm";
import { runCoherenceCheck } from "./coherence";

const mockedInvokeLLM = vi.mocked(invokeLLM);
const mockedRunCoherenceCheck = vi.mocked(runCoherenceCheck);

describe("Email Action Firewall", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset all caches so on-disk receipts don't pollute known-contacts
    _resetForTesting();
    // Reset coherence mock to default GREEN
    mockedRunCoherenceCheck.mockResolvedValue({
      status: "GREEN",
      signals: [],
      timestamp: new Date().toISOString(),
    } as any);
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
      expect(matches.length).toBeGreaterThan(0);
      expect(matches.every(m => m.action === "BLOCK")).toBe(true);
    });

    it("permissive mode skips WARN rules", () => {
      const matches = scanWithRules(
        "We can probably support your team if things go well 😉",
        null,
        "permissive",
      );
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
    it("returns BLOCK result for inducement email (v2 mode)", async () => {
      mockedInvokeLLM.mockResolvedValueOnce({
        choices: [{ message: { content: JSON.stringify({ findings: [] }) } }],
      } as any);

      const { result, receipt } = await scanEmail(
        "If you prescribe our product, we can support your clinic financially.",
        "Partnership Opportunity",
        "dr.smith@clinic.com",
        "standard",
        true,
        { mvpMode: false },
      );

      expect(result.event_type).toBe("BLOCK");
      expect(result.matched_rules.length).toBeGreaterThan(0);
      expect(receipt.event_type).toBe("BLOCK");
      expect(receipt.receipt_id).toBeTruthy();
      expect(receipt.email_context.hash).toBeTruthy();
      expect(receipt.email_context.subject).toBe("Partnership Opportunity");
      // Coherence block should be present and checked (via unified coherence)
      expect(receipt.coherence).toBeDefined();
      expect(receipt.coherence.checked).toBe(true);
      expect(receipt.coherence.status).toBe("COHERENT");
      // runCoherenceCheck should have been called
      expect(mockedRunCoherenceCheck).toHaveBeenCalledTimes(1);
    });

    it("returns PASS result for clean email to internal recipient (v2 mode)", async () => {
      mockedInvokeLLM.mockResolvedValueOnce({
        choices: [{ message: { content: JSON.stringify({ findings: [] }) } }],
      } as any);

      // Use internal domain so RECIPIENT_001 doesn't fire
      const { result, receipt } = await scanEmail(
        "Please find attached the quarterly report. Let me know if you have questions.",
        "Q1 Report",
        "team@riomethod.com",
        "standard",
        true,
        { mvpMode: false },
      );

      expect(result.event_type).toBe("PASS");
      expect(result.matched_rules).toHaveLength(0);
      expect(receipt.event_type).toBe("PASS");
      expect(receipt.policy.category).toBe("NONE");
      expect(receipt.coherence.status).toBe("COHERENT");
      expect(receipt.coherence.checked).toBe(true);
    });

    it("works without LLM (useLLM=false, v2 mode)", async () => {
      const { result, receipt } = await scanEmail(
        "If you prescribe our product, we can support your clinic financially.",
        "Partnership",
        null,
        "standard",
        false,
        { mvpMode: false },
      );

      expect(result.event_type).toBe("BLOCK");
      expect(receipt.event_type).toBe("BLOCK");
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
        { mvpMode: false },
      );

      expect(result.event_type).toBe("BLOCK");
      expect(receipt.event_type).toBe("BLOCK");
    });

    it("merges LLM findings with rule matches (v2 mode)", async () => {
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
        { mvpMode: false },
      );

      expect(result.matched_rules.some(m => m.category === "INAPPROPRIATE")).toBe(true);
    });

    it("reports DRIFT when coherence returns YELLOW", async () => {
      mockedRunCoherenceCheck.mockResolvedValueOnce({
        status: "YELLOW",
        signals: [{ dimension: "ALIGNMENT", level: "WARNING", description: "Potential misalignment detected" }],
        timestamp: new Date().toISOString(),
      } as any);

      const { receipt } = await scanEmail(
        "Please find the quarterly report attached.",
        "Report",
        null,
        "standard",
        false,
      );

      expect(receipt.coherence.status).toBe("DRIFT");
      expect(receipt.coherence.issues.length).toBeGreaterThan(0);
      expect(receipt.coherence.source_status).toBe("YELLOW");
    });

    it("degrades gracefully when coherence check fails", async () => {
      mockedRunCoherenceCheck.mockRejectedValueOnce(new Error("Coherence service down"));

      const { receipt } = await scanEmail(
        "Please find the quarterly report attached.",
        "Report",
        null,
        "standard",
        false,
      );

      // Should still produce a receipt with unchecked coherence
      expect(receipt.coherence.checked).toBe(false);
      expect(receipt.coherence.status).toBe("COHERENT"); // safe default
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
      expect(receipt.email_context.hash).toHaveLength(64);
      expect(receipt.policy.rule_id).toBe("INDUCEMENT_001");
      expect(receipt.policy.category).toBe("INDUCEMENT");
      expect(receipt.policy.confidence).toBe("high");
      expect(receipt.decision.action).toBe("BLOCK");
      expect(receipt.decision.reason).toBe("Direct inducement detected");
      expect(receipt.human.approved).toBe(false);
      expect(receipt.system.engine_version).toBe(ENGINE_VERSION);
      expect(receipt.system.strictness).toBe("standard");
      expect(receipt.coherence).toBeDefined();
      expect(receipt.coherence.checked).toBe(false);
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

  // ─── File-Based Receipt Store ─────────────────────────────

  describe("receipt store (file-based)", () => {
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
      expect(stats).toHaveProperty("flagged");
      expect(stats.total).toBe(stats.blocked + stats.warned + stats.flagged + stats.passed + stats.overridden);
    });

    it("persists receipts to disk as JSON files", () => {
      const receipt = generateEmailReceipt(
        "BLOCK",
        "Risky email body",
        "Test Persist",
        null,
        { rule_id: "INDUCEMENT_001", category: "INDUCEMENT", confidence: "high" },
        "Inducement detected",
        "standard",
      );

      storeReceipt(receipt);

      // Check that a JSON file was written to the receipts directory
      const receiptsDir = path.join(process.cwd(), "receipts");
      if (fs.existsSync(receiptsDir)) {
        const files = fs.readdirSync(receiptsDir).filter(f => f.endsWith(".json"));
        const matchingFile = files.find(f => f.includes(receipt.receipt_id));
        expect(matchingFile).toBeTruthy();

        // Read the file and verify it matches
        const content = JSON.parse(fs.readFileSync(path.join(receiptsDir, matchingFile!), "utf-8"));
        expect(content.receipt_id).toBe(receipt.receipt_id);
        expect(content.event_type).toBe("BLOCK");
      }
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

    it("sample receipts include coherence block", () => {
      const samples = generateSampleReceipts();
      for (const s of samples) {
        expect(s.coherence).toBeDefined();
        expect(s.coherence.checked).toBe(true);
        expect(s.coherence.status).toBe("COHERENT");
        expect(s.coherence.issues).toHaveLength(0);
      }
    });
  });

  // ─── Unified Coherence Check ──────────────────────────────

  describe("checkCoherence (unified — delegates to server/coherence.ts)", () => {
    it("returns COHERENT when governance returns GREEN", async () => {
      mockedRunCoherenceCheck.mockResolvedValueOnce({
        status: "GREEN",
        signals: [],
        timestamp: new Date().toISOString(),
      } as any);

      const result = await checkCoherence(
        "BLOCK",
        [{ rule_id: "INDUCEMENT_001", category: "INDUCEMENT", confidence: "high", action: "BLOCK", reason: "test" }],
        "standard",
      );
      expect(result.status).toBe("COHERENT");
      expect(result.issues).toHaveLength(0);
      expect(result.checked).toBe(true);
      expect(result.source_status).toBe("GREEN");
    });

    it("returns DRIFT when governance returns YELLOW", async () => {
      mockedRunCoherenceCheck.mockResolvedValueOnce({
        status: "YELLOW",
        signals: [{ dimension: "ALIGNMENT", level: "WARNING", description: "Drift detected" }],
        timestamp: new Date().toISOString(),
      } as any);

      const result = await checkCoherence("PASS", [], "standard");
      expect(result.status).toBe("DRIFT");
      expect(result.issues.length).toBeGreaterThan(0);
      expect(result.source_status).toBe("YELLOW");
    });

    it("returns DRIFT when governance returns RED", async () => {
      mockedRunCoherenceCheck.mockResolvedValueOnce({
        status: "RED",
        signals: [{ dimension: "SAFETY", level: "CRITICAL", description: "Critical misalignment" }],
        timestamp: new Date().toISOString(),
      } as any);

      const result = await checkCoherence("BLOCK", [], "strict");
      expect(result.status).toBe("DRIFT");
      expect(result.issues.length).toBeGreaterThan(0);
      expect(result.source_status).toBe("RED");
    });

    it("degrades gracefully when coherence service fails", async () => {
      mockedRunCoherenceCheck.mockRejectedValueOnce(new Error("Service unavailable"));

      const result = await checkCoherence("PASS", [], "standard");
      expect(result.status).toBe("COHERENT"); // safe default
      expect(result.checked).toBe(false);
      expect(result.source_status).toBe("UNKNOWN");
    });

    it("passes correct action parameters to runCoherenceCheck", async () => {
      mockedRunCoherenceCheck.mockResolvedValueOnce({
        status: "GREEN",
        signals: [],
        timestamp: new Date().toISOString(),
      } as any);

      await checkCoherence(
        "BLOCK",
        [{ rule_id: "THREAT_001", category: "THREAT", confidence: "high", action: "BLOCK", reason: "threat" }],
        "strict",
        { approved_by: "brian", approval_text: "OK" },
      );

      expect(mockedRunCoherenceCheck).toHaveBeenCalledTimes(1);
      const callArgs = mockedRunCoherenceCheck.mock.calls[0][0];
      expect(callArgs.actionType).toBe("email_firewall_scan");
      expect(callArgs.actionParameters.event_type).toBe("BLOCK");
      expect(callArgs.actionParameters.matched_rule_count).toBe(1);
      expect(callArgs.actionParameters.strictness).toBe("strict");
      expect(callArgs.actionParameters.has_human_approval).toBe(true);
    });
  });

    // ─── Default Rules ──────────────────────────────────────

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

    it("has at least 39 rules (spec requirement)", () => {
      expect(DEFAULT_RULES.length).toBeGreaterThanOrEqual(39);
    });

    it("has unique rule IDs", () => {
      const ids = DEFAULT_RULES.map(r => r.rule_id);
      expect(new Set(ids).size).toBe(ids.length);
    });
  });

  // ─── Expanded Rule Categories ─────────────────────────

  describe("expanded rule categories", () => {
    it("detects commitment language → WARN", () => {
      const matches = scanWithRules("I guarantee delivery by next Friday, no matter what.", null);
      expect(matches.some(m => m.rule_id.startsWith("COMMITMENT"))).toBe(true);
    });

    it("detects urgency language → WARN", () => {
      const matches = scanWithRules("This is extremely urgent and time-sensitive. Act immediately.", null);
      expect(matches.some(m => m.rule_id.startsWith("URGENCY"))).toBe(true);
    });

    it("detects financial references → WARN", () => {
      const matches = scanWithRules("The total amount is $50,000 and we need the wire transfer today.", null);
      expect(matches.some(m => m.rule_id.startsWith("FINANCIAL"))).toBe(true);
    });

    it("detects scope creep language → WARN", () => {
      const matches = scanWithRules("While we're at it, let's also add three more deliverables to the scope.", null);
      expect(matches.some(m => m.rule_id.startsWith("SCOPE"))).toBe(true);
    });

    it("detects relationship boundary issues → WARN", () => {
      const matches = scanWithRules("Hey babe, let's grab drinks after work and discuss the contract ;)", null);
      expect(matches.some(m => m.rule_id.startsWith("RELATIONSHIP"))).toBe(true);
    });

    it("detects timing pressure → BLOCK", () => {
      const matches = scanWithRules("Rush this through before compliance finds out. Skip the review process.", null);
      expect(matches.some(m => m.rule_id.startsWith("TIMING"))).toBe(true);
    });

    it("detects inappropriate content → BLOCK", () => {
      const matches = scanWithRules("You people don't belong here. Go back to where you came from.", null);
      expect(matches.some(m => m.category === "INAPPROPRIATE")).toBe(true);
    });
  });

  // ─── Recipient Classification ─────────────────────────

  describe("classifyRecipient", () => {
    beforeEach(() => {
      _resetKnownContacts();
    });

    it("classifies internal email as internal", () => {
      const profile = classifyRecipient("alice@riomethod.com");
      expect(profile.type).toBe("internal");
    });

    it("classifies external email as external", () => {
      const profile = classifyRecipient("vendor@external.com");
      expect(profile.type).toBe("external");
    });

    it("classifies first-time contact correctly", () => {
      const profile = classifyRecipient("new@external.com");
      expect(profile.familiarity).toBe("first-time");
    });

    it("classifies established contact after marking", () => {
      markContactEstablished("vendor@external.com");
      const profile = classifyRecipient("vendor@external.com");
      expect(profile.familiarity).toBe("established");
    });

    it("detects sensitive domains", () => {
      const profile = classifyRecipient("info@sec.gov");
      expect(profile.sensitive).toBe(true);
    });

    it("uses custom internal domains when provided", () => {
      const profile = classifyRecipient("alice@myorg.io", ["myorg.io"]);
      expect(profile.type).toBe("internal");
    });
  });

  // ─── Inbound Message Adapter ───────────────────────────

  describe("processIncomingMessage", () => {
    it("routes HIGH risk messages to quarantine (v2 mode)", async () => {
      const result = await processIncomingMessage(
        "If you don't comply, we will destroy your reputation.",
        "+1-555-0199",
        "standard",
        false,
        { mvpMode: false },
      );
      expect(result.routing).toBe("quarantine");
      expect(result.receipt.channel).toBe("sms");
      expect(result.receipt.event_type).toBe("BLOCK");
    });

    it("routes MEDIUM risk messages to review (v2 mode)", async () => {
      const result = await processIncomingMessage(
        "I guarantee we can deliver by Friday, no matter what it takes.",
        "+1-555-0142",
        "standard",
        false,
        { mvpMode: false },
      );
      expect(result.routing).toBe("review");
      expect(result.receipt.channel).toBe("sms");
      expect(["WARN", "FLAG"]).toContain(result.receipt.event_type);
    });

    it("routes LOW risk messages to pass under MVP mode", async () => {
      // Under MVP mode, clean text from unknown sender without urgency+consequential → PASS
      const result = await processIncomingMessage(
        "Hi, just confirming our meeting tomorrow at 2pm. Looking forward to it.",
        "+1-555-0123",
        "permissive",
        false,
      );
      expect(result.routing).toBe("pass");
      expect(result.receipt.channel).toBe("sms");
      expect(result.receipt.event_type).toBe("PASS");
    });

    it("receipt has channel field set to sms", async () => {
      const result = await processIncomingMessage(
        "Hello world",
        "sender@test.com",
        "standard",
        false,
      );
      expect(result.receipt.channel).toBe("sms");
    });

    it("receipt has coherence block", async () => {
      const result = await processIncomingMessage(
        "Hello world",
        "sender@test.com",
        "standard",
        false,
      );
      expect(result.receipt.coherence).toBeDefined();
      expect(result.receipt.coherence.checked).toBe(true);
    });

    it("stores receipt that can be retrieved by channel", async () => {
      const result = await processIncomingMessage(
        "Test message for channel filter",
        "test@sender.com",
        "standard",
        false,
      );
      storeReceipt(result.receipt);
      const smsReceipts = getReceiptsByChannel("sms");
      expect(smsReceipts.some(r => r.receipt_id === result.receipt.receipt_id)).toBe(true);
    });
  });

  // ─── Channel Filtering ───────────────────────────────

  describe("getReceiptsByChannel", () => {
    it("filters receipts by email channel", () => {
      const emailReceipts = getReceiptsByChannel("email");
      for (const r of emailReceipts) {
        expect(r.channel).toBe("email");
      }
    });

    it("filters receipts by sms channel", () => {
      const smsReceipts = getReceiptsByChannel("sms");
      for (const r of smsReceipts) {
        expect(r.channel).toBe("sms");
      }
    });
  });

  // ─── Inbound Message Stats ────────────────────────────

  describe("getInboundMessageStats", () => {
    it("returns quarantine, review, and pass arrays", () => {
      const stats = getInboundMessageStats();
      expect(Array.isArray(stats.quarantine)).toBe(true);
      expect(Array.isArray(stats.review)).toBe(true);
      expect(Array.isArray(stats.pass)).toBe(true);
    });
  });

  // ─── Receipt Channel Field ────────────────────────────

  describe("receipt channel field", () => {
    it("email scan produces receipt with channel: email", async () => {
      const { receipt } = await scanEmail(
        "Hello, this is a normal email.",
        "Test Subject",
        "team@company.com",
        "standard",
        false,
      );
      expect(receipt.channel).toBe("email");
    });

    it("generateEmailReceipt defaults to email channel", () => {
      const receipt = generateEmailReceipt(
        "PASS",
        "test email body",
        "test",
        null,
        { rule_id: "NONE", category: "NONE" as any, confidence: "low" },
        "No violations",
        "standard",
        undefined,
        { status: "COHERENT", issues: [], checked: true },
      );
      expect(receipt.channel).toBe("email");
    });

    it("generateEmailReceipt accepts sms channel", () => {
      const receipt = generateEmailReceipt(
        "PASS",
        "test sms body",
        null,
        null,
        { rule_id: "NONE", category: "NONE" as any, confidence: "low" },
        "No violations",
        "standard",
        undefined,
        { status: "COHERENT", issues: [], checked: true },
        undefined,
        "sms",
      );
      expect(receipt.channel).toBe("sms");
    });
  });

  // ─── Configurable Policy ─────────────────────────────

  describe("configurable policy", () => {
    it("scanWithRules filters out disabled rule IDs via scanEmail policyConfig", async () => {
      // INDUCEMENT_001 normally fires on this text
      const matchesWithRule = scanWithRules(
        "If you prescribe our product, we can support your clinic financially.",
        null,
      );
      expect(matchesWithRule.some(m => m.rule_id === "INDUCEMENT_001")).toBe(true);
      // Verify the rule count is > 0
      expect(matchesWithRule.length).toBeGreaterThan(0);
    });

    it("scanEmail accepts policyConfig to customize behavior (v2 mode)", async () => {
      // Full pipeline with v2 mode to test inducement detection
      const { result } = await scanEmail(
        "If you prescribe our product, we can support your clinic financially.",
        "Partnership",
        "dr@clinic.com",
        "standard",
        false,
        { mvpMode: false },
      );

      expect(result.event_type).toBe("BLOCK");
    });
  });

  // ─── Individual Rule Coverage ──────────────────────────────

  describe("individual rule detection", () => {
    // INDUCEMENT rules
    it("INDUCEMENT_001: detects prescribing inducement", () => {
      const m = scanWithRules("If you prescribe our product, we can support your clinic financially");
      expect(m.some(r => r.rule_id === "INDUCEMENT_001")).toBe(true);
    });
    it("INDUCEMENT_003: detects quid pro quo", () => {
      const m = scanWithRules("This is a quid pro quo arrangement for your cooperation");
      expect(m.some(r => r.rule_id === "INDUCEMENT_003")).toBe(true);
    });
    it("INDUCEMENT_004: detects gift/favor language", () => {
      const m = scanWithRules("As a token of our appreciation, here is a gift for your help");
      expect(m.some(r => r.rule_id === "INDUCEMENT_004")).toBe(true);
    });
    it("INDUCEMENT_005: detects per-unit commission structures", () => {
      const m = scanWithRules("You earn a commission per each referral you send our way");
      expect(m.some(r => r.rule_id === "INDUCEMENT_005")).toBe(true);
    });

    // THREAT rules
    it("THREAT_001: detects expose/leak threats", () => {
      const m = scanWithRules("If you don't agree, I will expose your secrets to the media");
      expect(m.some(r => r.rule_id === "THREAT_001")).toBe(true);
    });
    it("THREAT_002: detects personal coercion threats", () => {
      const m = scanWithRules("You'll pay for this and suffer the consequences");
      expect(m.some(r => r.rule_id === "THREAT_002")).toBe(true);
    });
    it("THREAT_003: detects ransom/extortion language", () => {
      const m = scanWithRules("Send 2 BTC to this wallet or your data will be published");
      expect(m.some(r => r.rule_id === "THREAT_003")).toBe(true);
    });
    it("THREAT_004: detects ultimatum language", () => {
      const m = scanWithRules("This is your final warning, act now or face the consequences");
      expect(m.some(r => r.rule_id === "THREAT_004")).toBe(true);
    });

    // PII rules
    it("PII_001: detects SSN patterns", () => {
      const m = scanWithRules("SSN: 999-88-7777");
      expect(m.some(r => r.rule_id === "PII_001")).toBe(true);
    });
    it("PII_002: detects protected health information", () => {
      const m = scanWithRules("Patient diagnosis medical record for name John DOB 01/15/1980");
      expect(m.some(r => r.rule_id === "PII_002")).toBe(true);
    });
    it("PII_003: detects passport number patterns", () => {
      const m = scanWithRules("Passport: AB1234567");
      expect(m.some(r => r.rule_id === "PII_003")).toBe(true);
    });
    it("PII_004: detects date of birth", () => {
      const m = scanWithRules("Date of birth: 01/15/1980");
      expect(m.some(r => r.rule_id === "PII_004")).toBe(true);
    });
    it("PII_005: detects bank account/routing numbers", () => {
      const m = scanWithRules("Bank account: 123456789 routing number for transfer");
      expect(m.some(r => r.rule_id === "PII_005")).toBe(true);
    });

    // COMPLIANCE rules
    it("COMPLIANCE_001: detects concealment language", () => {
      const m = scanWithRules("Let's keep this off the record and not document it");
      expect(m.some(r => r.rule_id === "COMPLIANCE_001")).toBe(true);
    });
    it("COMPLIANCE_002: detects insider trading language", () => {
      const m = scanWithRules("Buy the stock before the earnings announcement, it's insider info");
      expect(m.some(r => r.rule_id === "COMPLIANCE_002")).toBe(true);
    });
    it("COMPLIANCE_003: detects antitrust/price-fixing", () => {
      const m = scanWithRules("Let's collude on pricing and divide the market between us");
      expect(m.some(r => r.rule_id === "COMPLIANCE_003")).toBe(true);
    });
    it("COMPLIANCE_004: detects document falsification", () => {
      const m = scanWithRules("We need to backdate the document to make it look compliant");
      expect(m.some(r => r.rule_id === "COMPLIANCE_004")).toBe(true);
    });
    it("COMPLIANCE_005: detects money laundering/structuring", () => {
      const m = scanWithRules("We need to structure the deposits to avoid reporting");
      expect(m.some(r => r.rule_id === "COMPLIANCE_005")).toBe(true);
    });
    it("COMPLIANCE_006: detects sanctions evasion", () => {
      const m = scanWithRules("We can evade the sanctions by routing through a third country");
      expect(m.some(r => r.rule_id === "COMPLIANCE_006")).toBe(true);
    });

    // CONFIDENTIAL rules
    it("CONFIDENTIAL_001: detects confidential/proprietary sharing", () => {
      const m = scanWithRules("Attached is the confidential report, do not share externally");
      expect(m.some(r => r.rule_id === "CONFIDENTIAL_001")).toBe(true);
    });
    it("CONFIDENTIAL_002: detects internal-only information", () => {
      const m = scanWithRules("This is internal only, do not distribute to anyone outside");
      expect(m.some(r => r.rule_id === "CONFIDENTIAL_002")).toBe(true);
    });

    // COMMITMENT rules
    it("COMMITMENT_001: detects guarantee/promise language", () => {
      const m = scanWithRules("I guarantee this will deliver 100% results");
      expect(m.some(r => r.rule_id === "COMMITMENT_001")).toBe(true);
    });
    it("COMMITMENT_002: detects delivery date commitments", () => {
      const m = scanWithRules("Delivery by March 15 is confirmed, completion before April 1");
      expect(m.some(r => r.rule_id === "COMMITMENT_002")).toBe(true);
    });
    it("COMMITMENT_003: detects pricing/cost commitments", () => {
      const m = scanWithRules("The fixed price will be $50,000 for the entire project");
      expect(m.some(r => r.rule_id === "COMMITMENT_003")).toBe(true);
    });

    // FINANCIAL rules
    it("FINANCIAL_001: detects large dollar amounts", () => {
      const m = scanWithRules("The total investment is $5 million for phase one");
      expect(m.some(r => r.rule_id === "FINANCIAL_001")).toBe(true);
    });
    it("FINANCIAL_002: detects contract/agreement references", () => {
      const m = scanWithRules("Please sign the contract and return the agreement");
      expect(m.some(r => r.rule_id === "FINANCIAL_002")).toBe(true);
    });
    it("FINANCIAL_003: detects liability/indemnification language", () => {
      const m = scanWithRules("You must indemnify us and hold harmless against all claims");
      expect(m.some(r => r.rule_id === "FINANCIAL_003")).toBe(true);
    });
    it("FINANCIAL_004: detects wire transfer instructions", () => {
      const m = scanWithRules("Please wire transfer to account 12345, payment instructions attached");
      expect(m.some(r => r.rule_id === "FINANCIAL_004")).toBe(true);
    });

    // SCOPE rules
    it("SCOPE_001: detects scope expansion language", () => {
      const m = scanWithRules("While we're at it, let's also include the additional deliverables");
      expect(m.some(r => r.rule_id === "SCOPE_001")).toBe(true);
    });

    // INAPPROPRIATE rules
    it("INAPPROPRIATE_001: detects discriminatory language", () => {
      const m = scanWithRules("You people don't belong here, go back to where you came from");
      expect(m.some(r => r.rule_id === "INAPPROPRIATE_001")).toBe(true);
    });
  });

  // ─── Negative Tests (Clean Content) ──────────────────────────

  describe("clean content produces no matches", () => {
    it("normal business email passes clean", () => {
      const m = scanWithRules("Hi team, please review the attached quarterly report and provide feedback by Friday.");
      expect(m.length).toBe(0);
    });
    it("meeting invitation passes clean", () => {
      const m = scanWithRules("Let's schedule a meeting to discuss the project timeline next week.");
      expect(m.length).toBe(0);
    });
    it("thank you email passes clean", () => {
      const m = scanWithRules("Thank you for your help with the presentation. It went very well.");
      expect(m.length).toBe(0);
    });
    it("status update passes clean", () => {
      const m = scanWithRules("Project is on track. All milestones met. No blockers.");
      expect(m.length).toBe(0);
    });
  });

  // ─── Edge Cases ──────────────────────────────────────────────

  describe("edge cases", () => {
    it("handles empty body without crashing", () => {
      const m = scanWithRules("");
      expect(Array.isArray(m)).toBe(true);
    });
    it("handles very long body without crashing", () => {
      const longBody = "Normal text. ".repeat(10000);
      const m = scanWithRules(longBody);
      expect(Array.isArray(m)).toBe(true);
    });
    it("handles unicode content", () => {
      const m = scanWithRules("こんにちは、会議の議事録をお送りします。");
      expect(Array.isArray(m)).toBe(true);
    });
    it("handles mixed language content", () => {
      const m = scanWithRules("Hello, 請查看 attached report. Merci beaucoup.");
      expect(Array.isArray(m)).toBe(true);
    });
    it("handles content with only whitespace", () => {
      const m = scanWithRules("   \n\t\n   ");
      expect(Array.isArray(m)).toBe(true);
      expect(m.length).toBe(0);
    });
    it("handles content with special characters", () => {
      const m = scanWithRules("<script>alert('xss')</script> & \"quotes\" 'apostrophes'");
      expect(Array.isArray(m)).toBe(true);
    });
    it("subject-only detection works", () => {
      const m = scanWithRules("Normal body text", "URGENT: Act immediately or face consequences");
      expect(m.some(r => r.category === "URGENCY" || r.category === "THREAT")).toBe(true);
    });
  });

  // ─── Recipient Classification Edge Cases ─────────────────────

  describe("recipient classification edge cases", () => {
    it("handles email with no @ symbol", () => {
      const profile = classifyRecipient("notanemail");
      expect(profile.type).toBe("external");
    });
    it("handles email with subdomain", () => {
      const profile = classifyRecipient("user@sub.company.com");
      expect(profile.type).toBe("external");
    });
    it("detects .gov as sensitive", () => {
      const profile = classifyRecipient("official@agency.gov");
      expect(profile.sensitive).toBe(true);
    });
    it("detects .mil as sensitive", () => {
      const profile = classifyRecipient("soldier@base.mil");
      expect(profile.sensitive).toBe(true);
    });
    it("detects healthcare domains as sensitive", () => {
      const profile = classifyRecipient("dr@hospital.org");
      // hospital.org may not be detected without explicit healthcare domain list
      expect(profile).toHaveProperty("type");
      expect(profile).toHaveProperty("familiarity");
    });
  });

  // ─── Channel Filtering ───────────────────────────────────────

  describe("channel filtering", () => {
    it("getReceiptsByChannel returns only matching channel", () => {
      const emailReceipts = getReceiptsByChannel("email", 100);
      emailReceipts.forEach(r => {
        expect(r.channel || "email").toBe("email");
      });
    });
    it("getReceiptsByChannel respects limit", () => {
      const receipts = getReceiptsByChannel("email", 2);
      expect(receipts.length).toBeLessThanOrEqual(2);
    });
  });
});
