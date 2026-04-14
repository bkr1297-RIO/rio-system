import { describe, expect, it, vi, beforeEach } from "vitest";
import crypto from "crypto";

// ─── Mock invokeLLM for web_search connector ──────────────────
const mockInvokeLLM = vi.fn();
vi.mock("./_core/llm", () => ({
  invokeLLM: (...args: unknown[]) => mockInvokeLLM(...args),
}));

// ─── Mock notifyOwner for send_email connector ────────────────
const mockNotifyOwner = vi.fn();
vi.mock("./_core/notification", () => ({
  notifyOwner: (...args: unknown[]) => mockNotifyOwner(...args),
}));

// ─── Mock db.sha256 ───────────────────────────────────────────
vi.mock("./db", () => ({
  sha256: (data: string) => crypto.createHash("sha256").update(data).digest("hex"),
}));

// ─── Mock coherence module (used by emailFirewall) ───────────────
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

import { _clearSubstrate } from "./integritySubstrate";
import { _resetForTesting } from "./emailFirewall";
import {
  dispatchExecution,
  verifyArgsHash,
  generateReceipt,
  getConnector,
  listConnectors,
  initializeConnectors,
  type ApprovalProof,
} from "./connectors";

function sha256(data: string): string {
  return crypto.createHash("sha256").update(data).digest("hex");
}

function makeApprovalProof(
  toolName: string,
  toolArgs: Record<string, unknown>,
  overrides: Partial<ApprovalProof> = {},
): ApprovalProof {
  return {
    approvalId: "APR-test-1",
    intentId: "INT-test-1",
    boundToolName: toolName,
    boundArgsHash: sha256(JSON.stringify({ toolName, toolArgs })),
    signature: "test-signature",
    expiresAt: Date.now() + 3600000,
    ...overrides,
  };
}

describe("Connector Abstraction Layer", () => {
  beforeEach(() => {
    mockInvokeLLM.mockReset();
    mockNotifyOwner.mockReset();
    _clearSubstrate();
    _resetForTesting();
    initializeConnectors();
  });

  describe("Connector Registry", () => {
    it("registers all 8 connectors on initialization", () => {
      const connectors = listConnectors();
      expect(connectors).toContain("web_search");
      expect(connectors).toContain("read_email");
      expect(connectors).toContain("draft_email");
      expect(connectors).toContain("send_email");
      expect(connectors).toContain("send_sms");
      expect(connectors).toContain("drive_read");
      expect(connectors).toContain("drive_search");
      expect(connectors).toContain("drive_write");
      expect(connectors).toHaveLength(8);
    });

    it("returns undefined for unregistered connector", () => {
      expect(getConnector("nonexistent_tool")).toBeUndefined();
    });
  });

  describe("ARGS_HASH_MISMATCH Enforcement", () => {
    it("passes when stored args hash matches approval", () => {
      const toolArgs = { query: "test search" };
      const storedHash = sha256(JSON.stringify({ toolName: "web_search", toolArgs }));
      const proof = makeApprovalProof("web_search", toolArgs);
      const result = verifyArgsHash(storedHash, proof);
      expect(result.valid).toBe(true);
      expect(result.storedHash).toBe(result.boundHash);
    });

    it("fails when stored args hash differs from approval", () => {
      const originalArgs = { query: "original search" };
      const tamperedArgs = { query: "tampered search" };
      const storedHash = sha256(JSON.stringify({ toolName: "web_search", toolArgs: tamperedArgs }));
      const proof = makeApprovalProof("web_search", originalArgs);
      const result = verifyArgsHash(storedHash, proof);
      expect(result.valid).toBe(false);
      expect(result.storedHash).not.toBe(result.boundHash);
    });

    it("fails when tool name differs in stored hash from approval", () => {
      const toolArgs = { query: "test" };
      const storedHash = sha256(JSON.stringify({ toolName: "drive_search", toolArgs }));
      const proof = makeApprovalProof("web_search", toolArgs);
      const result = verifyArgsHash(storedHash, proof);
      expect(result.valid).toBe(false);
    });

    it("blocks execution via dispatchExecution when args hash mismatches", async () => {
      const originalArgs = { to: "a@b.com", subject: "Test", body: "Hello" };
      const tamperedArgs = { to: "a@b.com", subject: "Test", body: "TAMPERED" };
      const proof = makeApprovalProof("send_email", originalArgs);
      const tamperedHash = sha256(JSON.stringify({ toolName: "send_email", toolArgs: tamperedArgs }));

      const result = await dispatchExecution("send_email", tamperedArgs, proof, "HIGH", tamperedHash);
      expect(result.success).toBe(false);
      expect(result.error).toContain("ARGS_HASH_MISMATCH");
      expect(result.output).toBeNull();
    });
  });

  describe("Risk Tier Enforcement", () => {
    it("blocks HIGH risk execution without approval proof", async () => {
      const result = await dispatchExecution(
        "send_email",
        { to: "a@b.com", subject: "Test", body: "Hello" },
        null,
        "HIGH",
      );
      expect(result.success).toBe(false);
      expect(result.error).toContain("FAIL_CLOSED");
      expect(result.error).toContain("HIGH risk");
    });

    it("blocks MEDIUM risk execution without approval proof", async () => {
      const result = await dispatchExecution(
        "read_email",
        { query: "is:unread" },
        null,
        "MEDIUM",
      );
      expect(result.success).toBe(false);
      expect(result.error).toContain("FAIL_CLOSED");
      expect(result.error).toContain("MEDIUM risk");
    });

    it("allows LOW risk execution without approval proof", async () => {
      mockInvokeLLM.mockResolvedValueOnce({
        choices: [{
          message: {
            content: JSON.stringify({
              summary: "Test results",
              results: [{ title: "Result 1", snippet: "Details", relevance: "HIGH" }],
              sources_note: "AI-synthesized",
            }),
          },
        }],
      });

      const result = await dispatchExecution(
        "web_search",
        { query: "test" },
        null,
        "LOW",
      );
      expect(result.success).toBe(true);
      expect(mockInvokeLLM).toHaveBeenCalledTimes(1);
    });
  });

  describe("Fail-Closed Behavior", () => {
    it("returns success:false when web_search LLM throws", async () => {
      mockInvokeLLM.mockRejectedValueOnce(new Error("Network timeout"));
      const result = await dispatchExecution(
        "web_search",
        { query: "test" },
        null,
        "LOW",
      );
      expect(result.success).toBe(false);
      expect(result.error).toContain("FAIL_CLOSED");
      expect(result.error).toContain("web_search failed");
    });

    it("returns DEFERRED for read_email (requires Google OAuth)", async () => {
      const toolArgs = { query: "is:unread" };
      const proof = makeApprovalProof("read_email", toolArgs);
      const result = await dispatchExecution("read_email", toolArgs, proof, "MEDIUM");
      expect(result.success).toBe(false);
      expect(result.error).toContain("DEFERRED");
      expect(result.error).toContain("Gmail");
    });

    it("returns DEFERRED for Drive connectors (requires Google OAuth)", async () => {
      const toolArgs = { fileId: "abc123" };
      const proof = makeApprovalProof("drive_read", toolArgs);
      const result = await dispatchExecution("drive_read", toolArgs, proof, "MEDIUM");
      expect(result.success).toBe(false);
      expect(result.error).toContain("DEFERRED");
      expect(result.error).toContain("Google Drive");
    });

    it("returns NO_CONNECTOR for unregistered tool", async () => {
      const result = await dispatchExecution(
        "delete_everything",
        {},
        null,
        "LOW",
      );
      expect(result.success).toBe(false);
      expect(result.error).toContain("NO_CONNECTOR");
    });

    it("send_email fails-closed when notifyOwner returns false (gateway path)", async () => {
      mockNotifyOwner.mockResolvedValueOnce(false);
      const toolArgs = { to: "a@b.com", subject: "Test", body: `Hello ${Date.now()}-${Math.random()}`, _gatewayExecution: true };
      const proof = makeApprovalProof("send_email", toolArgs);
      const result = await dispatchExecution("send_email", toolArgs, proof, "HIGH");
      expect(result.success).toBe(false);
      expect(result.error).toContain("FAIL_CLOSED");
      expect(result.error).toContain("notifyOwner returned false");
    });

    it("send_email fails-closed when notifyOwner throws (gateway path)", async () => {
      mockNotifyOwner.mockRejectedValueOnce(new Error("Service down"));
      const toolArgs = { to: "a@b.com", subject: "Test", body: `Hello throw ${Date.now()}-${Math.random()}`, _gatewayExecution: true };
      const proof = makeApprovalProof("send_email", toolArgs);
      const result = await dispatchExecution("send_email", toolArgs, proof, "HIGH");
      expect(result.success).toBe(false);
      expect(result.error).toContain("FAIL_CLOSED");
    });

    it("send_email REFUSES direct execution without _gatewayExecution flag", async () => {
      const toolArgs = { to: "a@b.com", subject: "Test", body: "Hello" };
      const proof = makeApprovalProof("send_email", toolArgs);
      const result = await dispatchExecution("send_email", toolArgs, proof, "HIGH");
      expect(result.success).toBe(false);
      expect(result.error).toContain("REQUIRES_GATEWAY_GOVERNANCE");
    });
  });

  describe("Send Email Connector (LIVE via notifyOwner)", () => {
    it("sends email successfully through notifyOwner (gateway path)", async () => {
      mockNotifyOwner.mockResolvedValueOnce(true);
      const toolArgs = { to: "a@b.com", subject: "Test Subject", body: `Hello World ${Date.now()}`, _gatewayExecution: true };
      const proof = makeApprovalProof("send_email", toolArgs);
      const result = await dispatchExecution("send_email", toolArgs, proof, "HIGH");
      expect(result.success).toBe(true);
      expect(result.output).toHaveProperty("delivered", true);
      expect(result.output).toHaveProperty("method", "notifyOwner");
      expect(result.output).toHaveProperty("governance", "gateway");
      expect(mockNotifyOwner).toHaveBeenCalledTimes(1);
    });

    it("send_email rejects empty subject and body (gateway path)", async () => {
      const toolArgs = { to: "a@b.com", subject: "", body: "", _gatewayExecution: true };
      const proof = makeApprovalProof("send_email", toolArgs);
      const result = await dispatchExecution("send_email", toolArgs, proof, "HIGH");
      expect(result.success).toBe(false);
      expect(result.error).toContain("FAIL_CLOSED");
      expect(result.error).toContain("requires at least a subject or body");
    });
  });

  describe("Draft Email Connector (LIVE — returns draft, never sends)", () => {
    it("returns draft content without sending", async () => {
      const toolArgs = { to: "a@b.com", subject: "Draft Subject", body: "Draft body" };
      const proof = makeApprovalProof("draft_email", toolArgs);
      const result = await dispatchExecution("draft_email", toolArgs, proof, "MEDIUM");
      expect(result.success).toBe(true);
      expect(result.output).toHaveProperty("draft", true);
      expect(result.output).toHaveProperty("status");
      expect((result.output as Record<string, unknown>).status).toContain("not sent");
      expect(result.output).toHaveProperty("subject", "Draft Subject");
      expect(result.output).toHaveProperty("body", "Draft body");
      // Verify notifyOwner was NOT called (draft never sends)
      expect(mockNotifyOwner).not.toHaveBeenCalled();
    });

    it("draft_email rejects empty subject and body", async () => {
      const toolArgs = { to: "", subject: "", body: "" };
      const proof = makeApprovalProof("draft_email", toolArgs);
      const result = await dispatchExecution("draft_email", toolArgs, proof, "MEDIUM");
      expect(result.success).toBe(false);
      expect(result.error).toContain("FAIL_CLOSED");
      expect(result.error).toContain("requires at least a subject or body");
    });
  });

  describe("Send SMS Connector (LIVE via Twilio)", () => {
    it("send_sms rejects missing 'to' phone number", async () => {
      const toolArgs = { to: "", body: "Hello" };
      const proof = makeApprovalProof("send_sms", toolArgs);
      const result = await dispatchExecution("send_sms", toolArgs, proof, "HIGH");
      expect(result.success).toBe(false);
      expect(result.error).toContain("FAIL_CLOSED");
      expect(result.error).toContain("requires 'to' phone number");
    });

    it("send_sms rejects missing 'body' message", async () => {
      const toolArgs = { to: "+18014052174", body: "" };
      const proof = makeApprovalProof("send_sms", toolArgs);
      const result = await dispatchExecution("send_sms", toolArgs, proof, "HIGH");
      expect(result.success).toBe(false);
      expect(result.error).toContain("FAIL_CLOSED");
      expect(result.error).toContain("requires 'body' message content");
    });

    it("send_sms requires HIGH risk approval proof", async () => {
      const result = await dispatchExecution(
        "send_sms",
        { to: "+18014052174", body: "Hello" },
        null,
        "HIGH",
      );
      expect(result.success).toBe(false);
      expect(result.error).toContain("FAIL_CLOSED");
      expect(result.error).toContain("HIGH risk");
    });

    it("send_sms REFUSES direct execution without _gatewayExecution flag", async () => {
      const toolArgs = { to: "+18014052174", body: "Test message from RIO" };
      const proof = makeApprovalProof("send_sms", toolArgs);
      const result = await dispatchExecution("send_sms", toolArgs, proof, "HIGH");

      expect(result.success).toBe(false);
      expect(result.error).toContain("REQUIRES_GATEWAY_GOVERNANCE");
    });

    it("send_sms succeeds when Twilio API returns 201 (gateway path)", async () => {
      const originalFetch = globalThis.fetch;
      globalThis.fetch = vi.fn().mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          sid: "SM1234567890abcdef",
          status: "queued",
          from: "+18014570972",
          to: "+18014052174",
        }),
      }) as unknown as typeof fetch;

      const toolArgs = { to: "+18014052174", body: "Test message from RIO", _gatewayExecution: true };
      const proof = makeApprovalProof("send_sms", toolArgs);
      const result = await dispatchExecution("send_sms", toolArgs, proof, "HIGH");

      expect(result.success).toBe(true);
      expect(result.output).toHaveProperty("delivered", true);
      expect(result.output).toHaveProperty("method", "twilio_sms");
      expect(result.output).toHaveProperty("governance", "gateway");
      expect(result.output).toHaveProperty("messageSid", "SM1234567890abcdef");
      expect(result.metadata?.method).toBe("twilio_sms");
      expect(result.metadata?.governance).toBe("gateway");

      globalThis.fetch = originalFetch;
    });

    it("send_sms fails-closed when Twilio API returns error (gateway path)", async () => {
      const originalFetch = globalThis.fetch;
      globalThis.fetch = vi.fn().mockResolvedValueOnce({
        ok: false,
        json: async () => ({
          status: 400,
          message: "The 'To' number +1invalid is not a valid phone number.",
          error_code: 21211,
        }),
      }) as unknown as typeof fetch;

      const toolArgs = { to: "+1invalid", body: "Test", _gatewayExecution: true };
      const proof = makeApprovalProof("send_sms", toolArgs);
      const result = await dispatchExecution("send_sms", toolArgs, proof, "HIGH");

      expect(result.success).toBe(false);
      expect(result.error).toContain("FAIL_CLOSED");
      expect(result.error).toContain("Twilio API error");
      expect(result.metadata?.twilioErrorCode).toBe(21211);

      globalThis.fetch = originalFetch;
    });

    it("send_sms fails-closed when fetch throws (gateway path)", async () => {
      const originalFetch = globalThis.fetch;
      globalThis.fetch = vi.fn().mockRejectedValueOnce(new Error("Network unreachable")) as unknown as typeof fetch;

      const toolArgs = { to: "+18014052174", body: "Test", _gatewayExecution: true };
      const proof = makeApprovalProof("send_sms", toolArgs);
      const result = await dispatchExecution("send_sms", toolArgs, proof, "HIGH");

      expect(result.success).toBe(false);
      expect(result.error).toContain("FAIL_CLOSED");
      expect(result.error).toContain("Network unreachable");

      globalThis.fetch = originalFetch;
    });

    it("send_sms includes approval proof in receipt generation", () => {
      const toolArgs = { to: "+18014052174", body: "Test" };
      const proof = makeApprovalProof("send_sms", toolArgs);
      const connectorResult = {
        success: true,
        output: { delivered: true, method: "twilio_sms", messageSid: "SM123" },
        executedAt: 1700000000000,
      };
      const receipt = generateReceipt("EXE-sms-1", "INT-sms-1", "send_sms", connectorResult, proof);
      expect(receipt.receiptHash).toHaveLength(64);
      expect(receipt.toolName).toBe("send_sms");
      expect(receipt.approvalProof).toBe(proof);
      expect(receipt.intentId).toBe("INT-sms-1");
    });
  });

  describe("Send Email — Firewall Send-Time Gate", () => {
    // ── MVP Mode: Only the three-condition AND rule fires ──────────
    // Under MVP mode (default ON), inducement/PII/threat alone don't block.
    // Only unknown-sender + urgency + consequential-action triggers BLOCK.
    // V2 rule behavior is preserved in emailFirewall.test.ts with mvpMode: false.

    it("PASSES inducement email under MVP mode (gateway path)", async () => {
      mockNotifyOwner.mockResolvedValueOnce(true);
      const toolArgs = { to: "dr@clinic.com", subject: "Partnership", body: `If you prescribe our product ${Date.now()}`, _gatewayExecution: true };
      const proof = makeApprovalProof("send_email", toolArgs);
      const result = await dispatchExecution("send_email", toolArgs, proof, "HIGH");
      expect(result.success).toBe(true);
      expect(result.output).toHaveProperty("delivered", true);
      expect(mockNotifyOwner).toHaveBeenCalledTimes(1);
    });

    it("PASSES clean email through firewall (gateway path)", async () => {
      mockNotifyOwner.mockResolvedValueOnce(true);
      const toolArgs = { to: "team@company.com", subject: "Q1 Report", body: `Quarterly report ${Date.now()}`, _gatewayExecution: true };
      const proof = makeApprovalProof("send_email", toolArgs);
      const result = await dispatchExecution("send_email", toolArgs, proof, "HIGH");
      expect(result.success).toBe(true);
      expect(result.output).toHaveProperty("delivered", true);
      expect(mockNotifyOwner).toHaveBeenCalledTimes(1);
    });

    it("PASSES implied inducement under MVP mode (gateway path)", async () => {
      mockNotifyOwner.mockResolvedValueOnce(true);
      const toolArgs = { to: "partner@co.com", subject: "Collaboration", body: `Support your team ${Date.now()}`, _gatewayExecution: true };
      const proof = makeApprovalProof("send_email", toolArgs);
      const result = await dispatchExecution("send_email", toolArgs, proof, "HIGH");
      expect(result.success).toBe(true);
      expect(result.output).toHaveProperty("delivered", true);
      expect(mockNotifyOwner).toHaveBeenCalledTimes(1);
    });

    it("PASSES PII email under MVP mode (gateway path)", async () => {
      mockNotifyOwner.mockResolvedValueOnce(true);
      const toolArgs = { to: "hr@company.com", subject: "Records", body: `Employee SSN: 123-45-6789 ${Date.now()}`, _gatewayExecution: true };
      const proof = makeApprovalProof("send_email", toolArgs);
      const result = await dispatchExecution("send_email", toolArgs, proof, "HIGH");
      expect(result.success).toBe(true);
      expect(result.output).toHaveProperty("delivered", true);
      expect(mockNotifyOwner).toHaveBeenCalledTimes(1);
    });

    it("PASSES threat email under MVP mode (gateway path)", async () => {
      mockNotifyOwner.mockResolvedValueOnce(true);
      const toolArgs = { to: "vendor@co.com", subject: "Final Notice", body: `We will expose ${Date.now()}`, _gatewayExecution: true };
      const proof = makeApprovalProof("send_email", toolArgs);
      const result = await dispatchExecution("send_email", toolArgs, proof, "HIGH");
      expect(result.success).toBe(true);
      expect(result.output).toHaveProperty("delivered", true);
      expect(mockNotifyOwner).toHaveBeenCalledTimes(1);
    });

    it("BLOCKS phishing email with urgency+consequential (MVP rule fires)", async () => {
      // This message has all three MVP conditions: unknown sender + urgency + consequential
      const toolArgs = {
        to: "victim@target.com",
        subject: "URGENT: Account Locked",
        body: "URGENT: Your account has been compromised. Click here immediately to verify your identity and reset your password.",
      };
      const proof = makeApprovalProof("send_email", toolArgs);
      const result = await dispatchExecution("send_email", toolArgs, proof, "HIGH");

      expect(result.success).toBe(false);
      expect(result.error).toContain("FIREWALL_BLOCKED");
      expect(result.output).toHaveProperty("blocked", true);
      expect(result.output).toHaveProperty("firewallDecision", "BLOCK");
      expect(mockNotifyOwner).not.toHaveBeenCalled();
    });
  });

  describe("Web Search Connector (LIVE via LLM)", () => {
    it("web_search returns synthesized results on success", async () => {
      const llmResponse = {
        choices: [{
          message: {
            content: JSON.stringify({
              summary: "Digital governance overview",
              results: [
                { title: "Result 1", snippet: "Details about governance", relevance: "HIGH" },
                { title: "Result 2", snippet: "More details", relevance: "MEDIUM" },
              ],
              sources_note: "AI-synthesized",
            }),
          },
        }],
      };
      mockInvokeLLM.mockResolvedValueOnce(llmResponse);

      const result = await dispatchExecution(
        "web_search",
        { query: "RIO governance system" },
        null,
        "LOW",
      );
      expect(result.success).toBe(true);
      expect(result.output).toHaveProperty("summary");
      expect(result.output).toHaveProperty("results");
      expect(result.metadata?.query).toBe("RIO governance system");
    });

    it("web_search rejects empty query", async () => {
      const result = await dispatchExecution("web_search", { query: "" }, null, "LOW");
      expect(result.success).toBe(false);
      expect(result.error).toContain("Missing required param: query");
    });
  });

  describe("Receipt Generation", () => {
    it("generates a deterministic receipt hash from executionId + intentId + result", () => {
      const result = {
        success: true,
        output: { data: "test" },
        executedAt: 1700000000000,
      };
      const receipt1 = generateReceipt("EXE-1", "INT-1", "web_search", result, null);
      const receipt2 = generateReceipt("EXE-1", "INT-1", "web_search", result, null);
      expect(receipt1.receiptHash).toBe(receipt2.receiptHash);
      expect(receipt1.receiptHash).toHaveLength(64); // SHA-256 hex
      expect(receipt1.protocolVersion).toBeDefined();
      expect(receipt1.protocolVersion).toMatch(/^\d+\.\d+\.\d+$/);
    });

    it("produces different hashes for different executionIds", () => {
      const result = {
        success: true,
        output: { data: "test" },
        executedAt: 1700000000000,
      };
      const receipt1 = generateReceipt("EXE-1", "INT-1", "web_search", result, null);
      const receipt2 = generateReceipt("EXE-2", "INT-1", "web_search", result, null);
      expect(receipt1.receiptHash).not.toBe(receipt2.receiptHash);
    });

    it("includes approval proof in receipt when provided", () => {
      const proof = makeApprovalProof("send_email", { to: "a@b.com", subject: "Test", body: "Hello" });
      const result = {
        success: true,
        output: { delivered: true },
        executedAt: 1700000000000,
      };
      const receipt = generateReceipt("EXE-1", "INT-1", "send_email", result, proof);
      expect(receipt.approvalProof).toBe(proof);
      expect(receipt.toolName).toBe("send_email");
      expect(receipt.protocolVersion).toBeDefined();
    });
  });
});
