/**
 * Governance Router Tests — Phase B Dual-Mode Dispatch
 *
 * Tests the routing layer that decides whether governance operations
 * go to the external gateway or the internal engine.
 *
 * Three modes tested:
 *   1. Internal mode (no GATEWAY_URL) — all ops use internal engine
 *   2. Gateway mode (GATEWAY_URL set) — write ops use gateway, reads merge
 *   3. Gateway unreachable — write ops fail-closed, reads fall back
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ── Mock the gateway client module ──────────────────────────────────────

const mockSubmitIntent = vi.fn();
const mockSubmitAndGovern = vi.fn();
const mockAuthorize = vi.fn();
const mockExecute = vi.fn();
const mockExecuteConfirm = vi.fn();
const mockGenerateReceipt = vi.fn();
const mockVerify = vi.fn();
const mockGetLedger = vi.fn();
const mockHealth = vi.fn();

const mockGatewayClient = {
  submitIntent: mockSubmitIntent,
  submitAndGovern: mockSubmitAndGovern,
  authorize: mockAuthorize,
  execute: mockExecute,
  executeConfirm: mockExecuteConfirm,
  generateReceipt: mockGenerateReceipt,
  verify: mockVerify,
  getLedger: mockGetLedger,
  health: mockHealth,
  login: vi.fn(),
  whoami: vi.fn(),
  setAuthToken: vi.fn(),
  listIntents: vi.fn(),
  getIntent: vi.fn(),
};

vi.mock("./gateway-client", () => ({
  createGatewayClient: vi.fn(() => null), // Default: no gateway
  isGatewayHealthy: vi.fn(async () => false),
  RioGatewayClient: vi.fn(),
  GatewayUnreachableError: class GatewayUnreachableError extends Error {
    constructor(url: string) {
      super(`RIO Gateway unreachable at ${url}. Fail-closed: all governance operations blocked.`);
      this.name = "GatewayUnreachableError";
    }
  },
  GatewayApiError: class GatewayApiError extends Error {
    public status: number;
    public body: { error: string };
    constructor(status: number, body: { error: string }) {
      super(`RIO Gateway error (${status}): ${body.error}`);
      this.name = "GatewayApiError";
      this.status = status;
      this.body = body;
    }
  },
}));

// ── Mock the internal engine ────────────────────────────────────────────

const mockInternalCreateIntent = vi.fn();
const mockInternalApproveIntent = vi.fn();
const mockInternalDenyIntent = vi.fn();
const mockInternalExecuteIntent = vi.fn();
const mockInternalGetAuditLog = vi.fn();
const mockInternalVerifyReceiptById = vi.fn();
const mockInternalGetLedgerChain = vi.fn();
const mockInternalGetLearningAnalytics = vi.fn();

vi.mock("./rio", () => ({
  createIntent: (...args: unknown[]) => mockInternalCreateIntent(...args),
  approveIntent: (...args: unknown[]) => mockInternalApproveIntent(...args),
  denyIntent: (...args: unknown[]) => mockInternalDenyIntent(...args),
  executeIntent: (...args: unknown[]) => mockInternalExecuteIntent(...args),
  getAuditLog: (...args: unknown[]) => mockInternalGetAuditLog(...args),
  verifyReceiptById: (...args: unknown[]) => mockInternalVerifyReceiptById(...args),
  getLedgerChain: (...args: unknown[]) => mockInternalGetLedgerChain(...args),
  getLearningAnalytics: (...args: unknown[]) => mockInternalGetLearningAnalytics(...args),
}));

// ── Import after mocks ──────────────────────────────────────────────────

import { createGatewayClient } from "./gateway-client";
import {
  initGovernanceRouter,
  getRoutingMode,
  createIntent,
  createAndGovern,
  approveIntent,
  denyIntent,
  executeIntent,
  confirmExecution,
  generateReceipt,
  verifyReceipt,
  getAuditLog,
  getLedgerChain,
  getLearningAnalytics,
  getGovernanceHealth,
} from "./governance-router";

// ═══════════════════════════════════════════════════════════════════════
// TEST SUITE
// ═══════════════════════════════════════════════════════════════════════

describe("Governance Router — Internal Mode (Phase A)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (createGatewayClient as ReturnType<typeof vi.fn>).mockReturnValue(null);
  });

  it("initializes in internal mode when GATEWAY_URL is not set", () => {
    const result = initGovernanceRouter();
    expect(result.mode).toBe("internal");
    expect(getRoutingMode()).toBe("internal");
  });

  it("routes createIntent to internal engine", async () => {
    initGovernanceRouter();
    mockInternalCreateIntent.mockResolvedValue({
      id: "int-001",
      action: "send_email",
      description: "Test email",
      requestedBy: "agent",
      status: "pending_approval",
    });

    const result = await createIntent("send_email", "Test email", "agent");
    expect(result.source).toBe("internal");
    expect(result.id).toBe("int-001");
    expect(mockInternalCreateIntent).toHaveBeenCalledWith("send_email", "Test email", "agent");
    expect(mockSubmitIntent).not.toHaveBeenCalled();
  });

  it("routes approveIntent to internal engine", async () => {
    initGovernanceRouter();
    mockInternalApproveIntent.mockResolvedValue({
      intentId: "int-001",
      decision: "approved",
      decidedBy: "Brian",
    });

    const result = await approveIntent("int-001", "Brian");
    expect(result.source).toBe("internal");
    expect(result.decision).toBe("approved");
    expect(mockInternalApproveIntent).toHaveBeenCalledWith("int-001", "Brian");
  });

  it("routes denyIntent to internal engine", async () => {
    initGovernanceRouter();
    mockInternalDenyIntent.mockResolvedValue({
      intentId: "int-001",
      decision: "denied",
      decidedBy: "Brian",
    });

    const result = await denyIntent("int-001", "Brian");
    expect(result.source).toBe("internal");
    expect(result.decision).toBe("denied");
  });

  it("routes executeIntent to internal engine", async () => {
    initGovernanceRouter();
    mockInternalExecuteIntent.mockResolvedValue({
      intentId: "int-001",
      allowed: true,
      receipt: { receipt_id: "rcpt-001" },
    });

    const result = await executeIntent("int-001");
    expect(result.source).toBe("internal");
    expect(mockInternalExecuteIntent).toHaveBeenCalledWith("int-001");
  });

  it("routes verifyReceipt to internal engine", async () => {
    initGovernanceRouter();
    mockInternalVerifyReceiptById.mockResolvedValue({
      found: true,
      signatureValid: true,
      hashValid: true,
    });

    const result = await verifyReceipt("rcpt-001");
    expect(result.source).toBe("internal");
    expect(result.found).toBe(true);
  });

  it("routes getLedgerChain to internal engine only", async () => {
    initGovernanceRouter();
    mockInternalGetLedgerChain.mockResolvedValue([
      { id: "entry-1", intentId: "int-001", source: "internal" },
    ]);

    const result = await getLedgerChain(50);
    expect(result.sources).toEqual(["internal"]);
    expect(result.entries.length).toBe(1);
  });

  it("throws when confirmExecution called in internal mode", async () => {
    initGovernanceRouter();
    await expect(confirmExecution("int-001", { success: true }))
      .rejects.toThrow("confirmExecution is only available in gateway mode");
  });

  it("throws when generateReceipt called in internal mode", async () => {
    initGovernanceRouter();
    await expect(generateReceipt("int-001"))
      .rejects.toThrow("generateReceipt is only available in gateway mode");
  });
});

describe("Governance Router — Gateway Mode (Phase B)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (createGatewayClient as ReturnType<typeof vi.fn>).mockReturnValue(mockGatewayClient);
  });

  it("initializes in gateway mode when GATEWAY_URL is set", () => {
    const result = initGovernanceRouter();
    expect(result.mode).toBe("gateway");
    expect(getRoutingMode()).toBe("gateway");
  });

  it("routes createIntent to gateway", async () => {
    initGovernanceRouter();
    mockSubmitIntent.mockResolvedValue({
      intent_id: "gw-int-001",
      status: "submitted",
      action: "send_email",
      agent_id: "agent",
      intent_hash: "abc123",
      timestamp: "2026-03-30T00:00:00Z",
    });

    const result = await createIntent("send_email", "Test email", "agent");
    expect(result.source).toBe("gateway");
    expect(result.id).toBe("gw-int-001");
    expect(result.intentHash).toBe("abc123");
    expect(mockSubmitIntent).toHaveBeenCalled();
    expect(mockInternalCreateIntent).not.toHaveBeenCalled();
  });

  it("routes createAndGovern to gateway", async () => {
    initGovernanceRouter();
    mockSubmitAndGovern.mockResolvedValue({
      intent: {
        intent_id: "gw-int-002",
        status: "submitted",
        action: "create_issue",
        agent_id: "agent",
        intent_hash: "def456",
        timestamp: "2026-03-30T00:00:00Z",
      },
      governance: {
        intent_id: "gw-int-002",
        governance_status: "requires_approval",
        risk_level: "medium",
        requires_approval: true,
        reason: "Action requires human approval",
        checks: [],
        governance_hash: "gov789",
      },
    });

    const result = await createAndGovern("create_issue", "Test issue", "agent");
    expect(result.source).toBe("gateway");
    expect(result.intent.id).toBe("gw-int-002");
    expect(result.governance.requiresApproval).toBe(true);
    expect(result.governance.governanceHash).toBe("gov789");
  });

  it("routes approveIntent to gateway with Ed25519 signature", async () => {
    initGovernanceRouter();
    mockAuthorize.mockResolvedValue({
      intent_id: "gw-int-001",
      status: "authorized",
      authorization_hash: "auth123",
      authorized_by: "Brian",
      decision: "approved",
      ed25519_signed: true,
      timestamp: "2026-03-30T00:01:00Z",
    });

    const result = await approveIntent("gw-int-001", "Brian", {
      signature: "sig_hex_here",
      signatureTimestamp: "2026-03-30T00:01:00Z",
    });

    expect(result.source).toBe("gateway");
    expect(result.decision).toBe("approved");
    expect(result.ed25519Signed).toBe(true);
    expect(result.authorizationHash).toBe("auth123");
    expect(mockAuthorize).toHaveBeenCalledWith(expect.objectContaining({
      intent_id: "gw-int-001",
      decision: "approved",
      authorized_by: "Brian",
      signature: "sig_hex_here",
    }));
  });

  it("routes denyIntent to gateway", async () => {
    initGovernanceRouter();
    mockAuthorize.mockResolvedValue({
      intent_id: "gw-int-001",
      status: "denied",
      authorized_by: "Brian",
      decision: "denied",
      timestamp: "2026-03-30T00:01:00Z",
    });

    const result = await denyIntent("gw-int-001", "Brian");
    expect(result.source).toBe("gateway");
    expect(result.decision).toBe("denied");
    expect(mockAuthorize).toHaveBeenCalledWith(expect.objectContaining({
      decision: "denied",
    }));
  });

  it("routes executeIntent to gateway and returns execution token", async () => {
    initGovernanceRouter();
    mockExecute.mockResolvedValue({
      intent_id: "gw-int-001",
      status: "execution_authorized",
      execution_token: {
        intent_id: "gw-int-001",
        action: "send_email",
        agent_id: "agent",
        authorized_by: "Brian",
        authorization_hash: "auth123",
        parameters: {},
        cc_recipients: [],
        issued_at: "2026-03-30T00:02:00Z",
        status: "active",
      },
      instruction: "Execute the action and call /execute-confirm",
      timestamp: "2026-03-30T00:02:00Z",
    });

    const result = await executeIntent("gw-int-001");
    expect(result.source).toBe("gateway");
    expect(result.executionToken).toBeDefined();
    expect(result.executionToken.action).toBe("send_email");
    expect(result.instruction).toContain("execute-confirm");
  });

  it("confirms execution via gateway", async () => {
    initGovernanceRouter();
    mockExecuteConfirm.mockResolvedValue({
      intent_id: "gw-int-001",
      status: "executed",
      execution_hash: "exec456",
      connector: "gmail",
      result: { sent: true },
      timestamp: "2026-03-30T00:03:00Z",
    });

    const result = await confirmExecution("gw-int-001", { sent: true }, "gmail");
    expect(result.source).toBe("gateway");
    expect(result.executionHash).toBe("exec456");
    expect(result.connector).toBe("gmail");
  });

  it("generates receipt via gateway", async () => {
    initGovernanceRouter();
    mockGenerateReceipt.mockResolvedValue({
      receipt_id: "rcpt-gw-001",
      intent_id: "gw-int-001",
      action: "send_email",
      hash_chain: {
        intent_hash: "h1",
        governance_hash: "h2",
        authorization_hash: "h3",
        execution_hash: "h4",
        receipt_hash: "h5",
      },
      authorized_by: "Brian",
      timestamp: "2026-03-30T00:04:00Z",
    });

    const result = await generateReceipt("gw-int-001");
    expect(result.source).toBe("gateway");
    expect(result.receiptId).toBe("rcpt-gw-001");
    expect(result.hashChain.intent_hash).toBe("h1");
    expect(result.hashChain.receipt_hash).toBe("h5");
  });

  it("verifies receipt via gateway first", async () => {
    initGovernanceRouter();
    mockVerify.mockResolvedValue({
      receipt_verification: {
        valid: true,
        receipt_id: "rcpt-gw-001",
        checks: { hash_chain: true, signature: true },
      },
      ledger_chain_verification: {
        valid: true,
        total_entries: 10,
        chain_tip: "abc",
      },
    });

    const result = await verifyReceipt("rcpt-gw-001");
    expect(result.source).toBe("gateway");
    expect(result.found).toBe(true);
    expect(result.signatureValid).toBe(true);
    expect(result.hashValid).toBe(true);
    expect(result.verificationStatus).toBe("verified");
    expect(mockInternalVerifyReceiptById).not.toHaveBeenCalled();
  });

  it("merges ledger entries from both gateway and internal", async () => {
    initGovernanceRouter();
    mockGetLedger.mockResolvedValue({
      entries: [
        { intent_id: "gw-001", action: "send_email", status: "completed", hash: "h1", previous_hash: "h0", timestamp: "2026-03-30T00:00:00Z" },
      ],
      total: 1,
      chain_tip: "h1",
    });
    mockInternalGetLedgerChain.mockResolvedValue([
      { intentId: "int-001", action: "create_issue", status: "completed" },
    ]);

    const result = await getLedgerChain(50);
    expect(result.sources).toEqual(["gateway", "internal"]);
    expect(result.entries.length).toBe(2);
  });
});

describe("Governance Router — Gateway Unreachable (Fail-Closed)", () => {
  // Use the mock class from the vi.mock factory above
  class MockGatewayUnreachableError extends Error {
    constructor(url: string) {
      super(`RIO Gateway unreachable at ${url}. Fail-closed: all governance operations blocked.`);
      this.name = "GatewayUnreachableError";
    }
  }

  beforeEach(() => {
    vi.clearAllMocks();
    (createGatewayClient as ReturnType<typeof vi.fn>).mockReturnValue(mockGatewayClient);
    initGovernanceRouter();
  });

  it("blocks createIntent when gateway is unreachable (fail-closed)", async () => {
    mockSubmitIntent.mockRejectedValue(
      new MockGatewayUnreachableError("https://gateway.example.com")
    );

    await expect(createIntent("send_email", "Test", "agent"))
      .rejects.toThrow("unreachable");
    expect(mockInternalCreateIntent).not.toHaveBeenCalled();
  });

  it("blocks approveIntent when gateway is unreachable (fail-closed)", async () => {
    mockAuthorize.mockRejectedValue(
      new MockGatewayUnreachableError("https://gateway.example.com")
    );

    await expect(approveIntent("int-001", "Brian"))
      .rejects.toThrow("unreachable");
    expect(mockInternalApproveIntent).not.toHaveBeenCalled();
  });

  it("blocks executeIntent when gateway is unreachable (fail-closed)", async () => {
    mockExecute.mockRejectedValue(
      new MockGatewayUnreachableError("https://gateway.example.com")
    );

    await expect(executeIntent("int-001"))
      .rejects.toThrow("unreachable");
    expect(mockInternalExecuteIntent).not.toHaveBeenCalled();
  });

  it("falls back to internal for verifyReceipt when gateway unreachable (read-only)", async () => {
    mockVerify.mockRejectedValue(
      new MockGatewayUnreachableError("https://gateway.example.com")
    );
    mockInternalVerifyReceiptById.mockResolvedValue({
      found: true,
      signatureValid: true,
      hashValid: true,
    });

    const result = await verifyReceipt("rcpt-001");
    expect(result.source).toBe("internal");
    expect(result.found).toBe(true);
  });

  it("falls back to internal for getLedgerChain when gateway unreachable", async () => {
    mockGetLedger.mockRejectedValue(
      new MockGatewayUnreachableError("https://gateway.example.com")
    );
    mockInternalGetLedgerChain.mockResolvedValue([
      { intentId: "int-001", action: "test" },
    ]);

    const result = await getLedgerChain(50);
    expect(result.sources).toEqual(["internal"]);
    expect(result.entries.length).toBe(1);
  });

  it("reports gateway as unreachable in health check", async () => {
    mockHealth.mockRejectedValue(
      new MockGatewayUnreachableError("https://gateway.example.com")
    );

    const health = await getGovernanceHealth();
    expect(health.mode).toBe("gateway");
    expect(health.gateway?.reachable).toBe(false);
    expect(health.gateway?.healthy).toBe(false);
    expect(health.internal.active).toBe(true);
  });
});
