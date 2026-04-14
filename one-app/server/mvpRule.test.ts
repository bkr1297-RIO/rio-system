/**
 * MVP Rule — April 12th Frozen Build Spec Tests
 * ──────────────────────────────────────────────
 * Tests the three-condition AND rule:
 *   1. Sender is unknown
 *   2. Urgency language present
 *   3. Consequential action requested
 *
 * All three → BLOCK. Otherwise → PASS.
 *
 * Also tests that scanEmail defaults to MVP mode and that
 * the v2 rule engine is preserved when mvpMode = false.
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
  mvpRule,
  scanEmail,
  processIncomingMessage,
  _resetForTesting,
  markContactEstablished,
  type FirewallPolicyConfig,
} from "./emailFirewall";

describe("mvpRule — unit tests", () => {
  // ─── Condition 1: Sender Known → PASS ──────────────────────

  it("returns null when sender is known (even with urgency + consequential action)", () => {
    const result = mvpRule(
      "URGENT: You must verify your account immediately or it will be suspended!",
      true, // sender known
    );
    expect(result).toBeNull();
  });

  // ─── Condition 2: No Urgency → PASS ────────────────────────

  it("returns null when no urgency language (unknown sender + consequential action)", () => {
    const result = mvpRule(
      "Please verify your account details when you have a chance.",
      false,
    );
    expect(result).toBeNull();
  });

  // ─── Condition 3: No Consequential Action → PASS ───────────

  it("returns null when no consequential action (unknown sender + urgency)", () => {
    const result = mvpRule(
      "URGENT: Please review the quarterly report immediately.",
      false,
    );
    expect(result).toBeNull();
  });

  // ─── All Three Conditions → BLOCK ─────────────────────────

  it("returns BLOCK when all three conditions met: unknown + urgency + consequential", () => {
    const result = mvpRule(
      "URGENT: Your account is locked. Click here to verify your identity immediately!",
      false,
    );
    expect(result).not.toBeNull();
    expect(result!.rule_id).toBe("MVP_001");
    expect(result!.action).toBe("BLOCK");
    expect(result!.category).toBe("THREAT");
    expect(result!.confidence).toBe("high");
  });

  // ─── Urgency Variants ─────────────────────────────────────

  it("detects 'act now' urgency + wire transfer consequential", () => {
    const result = mvpRule("Act now — send money to this account before it's too late.", false);
    expect(result).not.toBeNull();
    expect(result!.action).toBe("BLOCK");
  });

  it("detects 'ASAP' urgency + credential request", () => {
    const result = mvpRule("ASAP — confirm your login credentials to avoid suspension.", false);
    expect(result).not.toBeNull();
    expect(result!.action).toBe("BLOCK");
  });

  it("detects 'last chance' urgency + payment request", () => {
    const result = mvpRule("Last chance! Pay now or your service will be terminated.", false);
    expect(result).not.toBeNull();
    expect(result!.action).toBe("BLOCK");
  });

  it("detects 'immediately' urgency + click link", () => {
    const result = mvpRule("You must respond immediately. Click here to update your information.", false);
    expect(result).not.toBeNull();
    expect(result!.action).toBe("BLOCK");
  });

  it("detects 'within 24 hours' urgency + account locked", () => {
    const result = mvpRule("Your account is suspended. Respond within 24 hours to restore access.", false);
    expect(result).not.toBeNull();
    expect(result!.action).toBe("BLOCK");
  });

  it("detects 'time is running out' urgency + gift card", () => {
    const result = mvpRule("Time is running out! Buy a gift card and send the code.", false);
    expect(result).not.toBeNull();
    expect(result!.action).toBe("BLOCK");
  });

  it("detects 'final warning' urgency + security alert", () => {
    const result = mvpRule("Final warning: security alert on your account. Reset your password now.", false);
    expect(result).not.toBeNull();
    expect(result!.action).toBe("BLOCK");
  });

  // ─── Consequential Action Variants ─────────────────────────

  it("detects bitcoin/crypto consequential action", () => {
    const result = mvpRule("URGENT: Send bitcoin to this wallet address immediately.", false);
    expect(result).not.toBeNull();
    expect(result!.action).toBe("BLOCK");
  });

  it("detects SSN request", () => {
    const result = mvpRule("Act now — enter your SSN to verify your identity.", false);
    expect(result).not.toBeNull();
    expect(result!.action).toBe("BLOCK");
  });

  it("detects grant access request", () => {
    const result = mvpRule("URGENT: Grant access to the shared drive immediately.", false);
    expect(result).not.toBeNull();
    expect(result!.action).toBe("BLOCK");
  });

  it("detects unauthorized activity alert", () => {
    const result = mvpRule("Immediately respond — unauthorized activity detected on your account. Verify your credentials.", false);
    expect(result).not.toBeNull();
    expect(result!.action).toBe("BLOCK");
  });

  it("detects download attachment request", () => {
    const result = mvpRule("URGENT: Download this file immediately to avoid data loss.", false);
    expect(result).not.toBeNull();
    expect(result!.action).toBe("BLOCK");
  });

  // ─── Clean Messages → PASS ─────────────────────────────────

  it("passes normal business email (no urgency, no consequential)", () => {
    const result = mvpRule(
      "Hi team, please review the attached quarterly report and provide feedback by Friday.",
      false,
    );
    expect(result).toBeNull();
  });

  it("passes meeting invitation", () => {
    const result = mvpRule(
      "Let's schedule a meeting to discuss the project timeline next week.",
      false,
    );
    expect(result).toBeNull();
  });

  it("passes thank-you email", () => {
    const result = mvpRule(
      "Thank you for your help with the presentation. It went very well.",
      false,
    );
    expect(result).toBeNull();
  });

  it("passes status update", () => {
    const result = mvpRule(
      "Project is on track. All milestones met. No blockers.",
      false,
    );
    expect(result).toBeNull();
  });

  it("passes empty string", () => {
    const result = mvpRule("", false);
    expect(result).toBeNull();
  });
});

// ─── scanEmail MVP Mode Integration ──────────────────────────

describe("scanEmail — MVP mode (default ON)", () => {
  beforeEach(() => {
    _resetForTesting();
  });

  it("defaults to MVP mode — clean email passes even if v2 rules would match", async () => {
    // This text triggers INDUCEMENT_001 in v2 mode, but MVP mode doesn't care about inducement
    const { result, receipt } = await scanEmail(
      "If you prescribe our product, we can support your clinic financially.",
      "Partnership Opportunity",
      "dr.smith@clinic.com", // external first-time → unknown sender
      "standard",
      false,
    );
    // In MVP mode: no urgency language → PASS (even though v2 would BLOCK for inducement)
    expect(result.event_type).toBe("PASS");
    expect(receipt.event_type).toBe("PASS");
  });

  it("MVP mode blocks phishing: unknown sender + urgency + credential request", async () => {
    const { result, receipt } = await scanEmail(
      "URGENT: Your account has been compromised. Verify your credentials immediately!",
      "Security Alert",
      "unknown@phisher.com", // external first-time → unknown
      "standard",
      false,
    );
    expect(result.event_type).toBe("BLOCK");
    expect(result.matched_rules[0].rule_id).toBe("MVP_001");
    expect(receipt.event_type).toBe("BLOCK");
  });

  it("MVP mode passes when sender is known (internal domain)", async () => {
    const { result } = await scanEmail(
      "URGENT: Verify your account immediately! Click here now!",
      "Security Alert",
      "alice@riomethod.com", // internal → known
      "standard",
      false,
    );
    expect(result.event_type).toBe("PASS");
  });

  it("MVP mode passes when sender is established external contact", async () => {
    markContactEstablished("vendor@external.com");
    const { result } = await scanEmail(
      "URGENT: Please confirm your login credentials right away!",
      "Important",
      "vendor@external.com", // established → known
      "standard",
      false,
    );
    expect(result.event_type).toBe("PASS");
  });

  it("MVP mode passes urgency-only message (no consequential action)", async () => {
    const { result } = await scanEmail(
      "URGENT: Please review the quarterly report immediately.",
      "Urgent Review",
      "new@external.com",
      "standard",
      false,
    );
    expect(result.event_type).toBe("PASS");
  });

  it("MVP mode passes consequential-only message (no urgency)", async () => {
    const { result } = await scanEmail(
      "Please verify your account details at your convenience.",
      "Account Verification",
      "new@external.com",
      "standard",
      false,
    );
    expect(result.event_type).toBe("PASS");
  });

  it("MVP mode treats inbound (no recipient) as unknown sender", async () => {
    const { result } = await scanEmail(
      "URGENT: Your account is locked! Click here to verify your identity!",
      null,
      null, // no recipient → unknown sender
      "standard",
      false,
    );
    expect(result.event_type).toBe("BLOCK");
    expect(result.matched_rules[0].rule_id).toBe("MVP_001");
  });

  it("MVP mode receipt has correct structure", async () => {
    const { receipt } = await scanEmail(
      "Act now! Your account is suspended. Verify your credentials immediately.",
      "Account Alert",
      "scammer@evil.com",
      "standard",
      false,
    );
    expect(receipt.event_type).toBe("BLOCK");
    expect(receipt.receipt_id).toBeTruthy();
    expect(receipt.timestamp).toBeTruthy();
    expect(receipt.email_context.hash).toHaveLength(64);
    expect(receipt.coherence).toBeDefined();
    expect(receipt.coherence.checked).toBe(true);
    expect(receipt.pattern_id).toBe("MVP_001");
    expect(receipt.confidence_score).toBe(0.9);
  });

  it("MVP mode generates receipt with summary for PASS", async () => {
    const { receipt } = await scanEmail(
      "Hi, just checking in on the project status.",
      "Status",
      "new@external.com",
      "standard",
      false,
    );
    expect(receipt.event_type).toBe("PASS");
    expect(receipt.decision.reason).toContain("cleared");
  });
});

// ─── scanEmail v2 mode (mvpMode: false) ──────────────────────

describe("scanEmail — v2 mode (mvpMode: false)", () => {
  beforeEach(() => {
    _resetForTesting();
  });

  const v2Config: FirewallPolicyConfig = { mvpMode: false };

  it("v2 mode detects inducement → BLOCK (rules engine active)", async () => {
    const { result } = await scanEmail(
      "If you prescribe our product, we can support your clinic financially.",
      "Partnership",
      "dr.smith@clinic.com",
      "standard",
      false,
      v2Config,
    );
    expect(result.event_type).toBe("BLOCK");
    expect(result.matched_rules.some(m => m.rule_id === "INDUCEMENT_001")).toBe(true);
  });

  it("v2 mode detects PII → BLOCK", async () => {
    const { result } = await scanEmail(
      "Employee SSN: 123-45-6789",
      "Records",
      null,
      "standard",
      false,
      v2Config,
    );
    expect(result.event_type).toBe("BLOCK");
    expect(result.matched_rules.some(m => m.category === "PII")).toBe(true);
  });

  it("v2 mode detects threat → BLOCK", async () => {
    const { result } = await scanEmail(
      "If you don't comply, we will expose your communications to the press.",
      "Final Notice",
      null,
      "standard",
      false,
      v2Config,
    );
    expect(result.event_type).toBe("BLOCK");
    expect(result.matched_rules.some(m => m.category === "THREAT")).toBe(true);
  });

  it("v2 mode adds recipient-based rules for first-time external", async () => {
    const { result } = await scanEmail(
      "Here is the report.",
      "Report",
      "new@external.com",
      "standard",
      false,
      v2Config,
    );
    expect(result.matched_rules.some(m => m.rule_id === "RECIPIENT_001")).toBe(true);
  });

  it("v2 mode adds sensitive recipient rules", async () => {
    const { result } = await scanEmail(
      "Here is the report.",
      "Report",
      "official@sec.gov",
      "standard",
      false,
      v2Config,
    );
    expect(result.matched_rules.some(m => m.rule_id === "RECIPIENT_002")).toBe(true);
  });

  it("v2 mode passes clean email", async () => {
    const { result } = await scanEmail(
      "Please find attached the quarterly report. Let me know if you have questions.",
      "Q1 Report",
      "team@riomethod.com",
      "standard",
      false,
      v2Config,
    );
    expect(result.event_type).toBe("PASS");
  });
});

// ─── processIncomingMessage under MVP mode ───────────────────

describe("processIncomingMessage — MVP mode", () => {
  beforeEach(() => {
    _resetForTesting();
  });

  it("quarantines phishing SMS (unknown + urgency + consequential)", async () => {
    const result = await processIncomingMessage(
      "URGENT: Your account is locked! Click here to restore access immediately!",
      "+1-555-0199",
      "standard",
      false,
    );
    expect(result.routing).toBe("quarantine");
    expect(result.receipt.event_type).toBe("BLOCK");
    expect(result.receipt.channel).toBe("sms");
  });

  it("passes clean SMS through (no urgency, no consequential)", async () => {
    const result = await processIncomingMessage(
      "Hi, just confirming our meeting tomorrow at 2pm. Looking forward to it.",
      "+1-555-0123",
      "standard",
      false,
    );
    expect(result.routing).toBe("pass");
    expect(result.receipt.event_type).toBe("PASS");
  });

  it("passes urgency-only SMS (no consequential action)", async () => {
    const result = await processIncomingMessage(
      "URGENT: Please call me back as soon as possible.",
      "+1-555-0142",
      "standard",
      false,
    );
    expect(result.routing).toBe("pass");
    expect(result.receipt.event_type).toBe("PASS");
  });

  it("blocks SMS with all three conditions", async () => {
    const result = await processIncomingMessage(
      "Act now! Your bank account has unauthorized activity. Send money to this secure account immediately.",
      "+1-555-0199",
      "standard",
      false,
    );
    expect(result.routing).toBe("quarantine");
    expect(result.receipt.event_type).toBe("BLOCK");
  });
});

// ─── Original 5 Behavior Validation Cases Under MVP Mode ─────

describe("original behavior validation — MVP mode alignment", () => {
  beforeEach(() => {
    _resetForTesting();
  });

  // Case 1: Credential phishing (unknown + urgency + credential request) → BLOCK
  it("Case 1: credential phishing email → BLOCK", async () => {
    const { result } = await scanEmail(
      "Your account is locked. Please confirm your login immediately to restore access.",
      "Security Alert",
      "security@unknown-bank.com",
      "standard",
      false,
    );
    expect(result.event_type).toBe("BLOCK");
  });

  // Case 2: Clean business email → PASS
  it("Case 2: clean business email → PASS", async () => {
    const { result } = await scanEmail(
      "Please find attached the quarterly report. Let me know if you have questions.",
      "Q1 Report",
      "team@company.com",
      "standard",
      false,
    );
    expect(result.event_type).toBe("PASS");
  });

  // Case 3: Urgency without consequential action → PASS in MVP
  it("Case 3: urgency-only email → PASS (no consequential action)", async () => {
    const { result } = await scanEmail(
      "This is extremely urgent and time-sensitive. Please review immediately.",
      "Urgent Review",
      "sender@external.com",
      "standard",
      false,
    );
    expect(result.event_type).toBe("PASS");
  });

  // Case 4: Consequential action without urgency → PASS in MVP
  it("Case 4: consequential action without urgency → PASS", async () => {
    const { result } = await scanEmail(
      "Please verify your account details and update your payment information.",
      "Account Update",
      "service@company.com",
      "standard",
      false,
    );
    expect(result.event_type).toBe("PASS");
  });

  // Case 5: Known sender with all triggers → PASS (sender known overrides)
  it("Case 5: known sender with urgency + consequential → PASS", async () => {
    const { result } = await scanEmail(
      "URGENT: Verify your account immediately! Click here now!",
      "Security Alert",
      "alice@riomethod.com", // internal domain → known
      "standard",
      false,
    );
    expect(result.event_type).toBe("PASS");
  });
});
