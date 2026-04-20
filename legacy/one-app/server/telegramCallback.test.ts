/**
 * telegramCallback.test.ts
 *
 * Tests for the Telegram Approve/Reject callback handler.
 *
 * Verifies:
 *   1. Approval produces a ledger entry with APPROVED decision
 *   2. Rejection produces a ledger entry with REJECTED decision (no silent rejections)
 *   3. Expired intents are caught and logged
 *   4. Already-processed intents are rejected
 *   5. Missing intents throw
 *   6. Self-approval is blocked by constrained delegation
 *   7. Details action does not modify intent status
 *   8. Authority model is correctly labeled in ledger entries
 *   9. Both outcomes carry proposer_identity_id and approver_identity_id
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Mock DB ────────────────────────────────────────────────────
const ledgerEntries: Array<{ eventType: string; payload: Record<string, unknown> }> = [];
const mockAppendLedger = vi.fn(async (eventType: string, payload: Record<string, unknown>) => {
  ledgerEntries.push({ eventType, payload });
  return { id: `LED-${ledgerEntries.length}` };
});

let mockIntentStore: Record<string, any> = {};
const mockGetIntent = vi.fn(async (intentId: string) => mockIntentStore[intentId] ?? null);
const mockUpdateIntentStatus = vi.fn(async (intentId: string, status: string) => {
  if (mockIntentStore[intentId]) mockIntentStore[intentId].status = status;
});
const mockCreateApproval = vi.fn(async (
  intentId: string, userId: number, decision: string, signature: string,
  boundToolName: string, boundArgsHash: string, expiresAt: number,
  maxExecutions: number, principalId?: string,
) => ({
  approvalId: `APR-test-${Date.now()}`,
  intentId,
  userId,
  decision,
  signature,
  boundToolName,
  boundArgsHash,
  expiresAt,
  maxExecutions,
  principalId,
}));

vi.mock("./db", () => ({
  sha256: (data: string) => {
    const crypto = require("crypto");
    return crypto.createHash("sha256").update(data).digest("hex");
  },
  appendLedger: (...args: unknown[]) => mockAppendLedger(args[0] as string, args[1] as Record<string, unknown>),
  getIntent: (id: string) => mockGetIntent(id),
  updateIntentStatus: (id: string, status: string) => mockUpdateIntentStatus(id, status),
  createApproval: (...args: unknown[]) => mockCreateApproval(
    args[0] as string, args[1] as number, args[2] as string, args[3] as string,
    args[4] as string, args[5] as string, args[6] as number, args[7] as number, args[8] as string,
  ),
}));

// ─── Mock Gateway Proxy ─────────────────────────────────────────
let mockGatewayEvalResult = { allowed: true, authority_model: "Separated Authority", role_separation: "separated", reason: "" };
vi.mock("./gatewayProxy", () => ({
  evaluateIdentityAtGatewayBoundary: vi.fn(() => mockGatewayEvalResult),
}));

// ─── Mock Telegram (prevent real API calls) ─────────────────────
vi.mock("./telegram", () => ({
  sendMessage: vi.fn(),
  isTelegramConfigured: vi.fn().mockReturnValue(true),
  handleWebhookUpdate: vi.fn(),
  answerCallbackQuery: vi.fn(),
  editMessageAfterDecision: vi.fn(),
  parseCallbackData: vi.fn(),
  sendIntentNotification: vi.fn(),
  sendReceiptNotification: vi.fn(),
  sendKillNotification: vi.fn(),
  startPolling: vi.fn(),
  stopPolling: vi.fn(),
}));

// ─── Mock continuity ────────────────────────────────────────────
vi.mock("./continuity", () => ({
  writeState: vi.fn(),
  readState: vi.fn().mockReturnValue({}),
}));

// ─── Mock intent pipeline ───────────────────────────────────────
vi.mock("./intentPipeline", () => ({
  processIntent: vi.fn(),
  buildInboundIntent: vi.fn(),
}));

// ─── Import the callback handler ────────────────────────────────
import { telegramApprovalCallback } from "./telegramInput";
import type { TelegramCallbackQuery } from "./telegram";

// ─── Test Fixtures ──────────────────────────────────────────────

function makeCallbackQuery(username: string): TelegramCallbackQuery {
  return {
    id: "cq-test-001",
    from: { id: 12345, first_name: "Brian", username },
    message: { message_id: 100, chat: { id: 67890, type: "private" } },
    data: "approve:INT-test-001",
  };
}

function makePendingIntent(overrides: Record<string, any> = {}) {
  return {
    id: 1,
    intentId: "INT-test-001",
    userId: 1,
    toolName: "send_email",
    toolArgs: { to: "test@example.com", subject: "Test", body: "Hello" },
    argsHash: "abc123",
    riskTier: "MEDIUM",
    status: "PENDING_APPROVAL",
    principalId: "user-proposer",
    expiresAt: Date.now() + 3600_000, // 1 hour from now
    createdAt: new Date(Date.now() - 60_000), // 1 minute ago
    updatedAt: new Date(),
    ...overrides,
  };
}

// ─── Tests ──────────────────────────────────────────────────────

describe("Telegram Approval Callback", () => {
  beforeEach(() => {
    ledgerEntries.length = 0;
    mockIntentStore = {};
    mockAppendLedger.mockClear();
    mockGetIntent.mockClear();
    mockUpdateIntentStatus.mockClear();
    mockCreateApproval.mockClear();
    mockGatewayEvalResult = { allowed: true, authority_model: "Separated Authority", role_separation: "separated", reason: "" };
  });

  // ─── 1. Approval produces ledger entry ────────────────────────

  it("approval writes APPROVAL ledger entry with APPROVED decision", async () => {
    mockIntentStore["INT-test-001"] = makePendingIntent();
    const cq = makeCallbackQuery("brian_approver");

    await telegramApprovalCallback("approve", "INT-test-001", cq);

    // Intent status updated
    expect(mockUpdateIntentStatus).toHaveBeenCalledWith("INT-test-001", "APPROVED");

    // Approval record created
    expect(mockCreateApproval).toHaveBeenCalledTimes(1);
    const approvalArgs = mockCreateApproval.mock.calls[0];
    expect(approvalArgs[0]).toBe("INT-test-001"); // intentId
    expect(approvalArgs[2]).toBe("APPROVED");      // decision

    // Ledger entry written
    const approvalEntries = ledgerEntries.filter(e => e.eventType === "APPROVAL");
    expect(approvalEntries.length).toBe(1);
    expect(approvalEntries[0].payload.decision).toBe("APPROVED");
    expect(approvalEntries[0].payload.channel).toBe("telegram");
    expect(approvalEntries[0].payload.proposer_identity_id).toBe("user-proposer");
    expect(approvalEntries[0].payload.approver_identity_id).toBe("telegram-brian_approver");
  });

  // ─── 2. Rejection produces ledger entry (no silent rejections) ─

  it("rejection writes APPROVAL ledger entry with REJECTED decision", async () => {
    mockIntentStore["INT-test-001"] = makePendingIntent();
    const cq = makeCallbackQuery("brian_approver");

    await telegramApprovalCallback("reject", "INT-test-001", cq);

    // Intent status updated to REJECTED
    expect(mockUpdateIntentStatus).toHaveBeenCalledWith("INT-test-001", "REJECTED");

    // Approval record created with REJECTED
    expect(mockCreateApproval).toHaveBeenCalledTimes(1);
    const approvalArgs = mockCreateApproval.mock.calls[0];
    expect(approvalArgs[2]).toBe("REJECTED");

    // Ledger entry written — rejection is NOT silent
    const approvalEntries = ledgerEntries.filter(e => e.eventType === "APPROVAL");
    expect(approvalEntries.length).toBe(1);
    expect(approvalEntries[0].payload.decision).toBe("REJECTED");
    expect(approvalEntries[0].payload.channel).toBe("telegram");
  });

  // ─── 3. Expired intents are caught and logged ─────────────────

  it("expired intent throws and writes APPROVAL ledger with EXPIRED decision", async () => {
    mockIntentStore["INT-test-001"] = makePendingIntent({
      expiresAt: Date.now() - 1000, // expired 1 second ago
    });
    const cq = makeCallbackQuery("brian_approver");

    await expect(
      telegramApprovalCallback("approve", "INT-test-001", cq)
    ).rejects.toThrow("expired");

    // Intent status updated to EXPIRED
    expect(mockUpdateIntentStatus).toHaveBeenCalledWith("INT-test-001", "EXPIRED");

    // Ledger entry records the expired attempt
    const entries = ledgerEntries.filter(e => e.eventType === "APPROVAL");
    expect(entries.length).toBe(1);
    expect(entries[0].payload.decision).toBe("EXPIRED");
    expect(entries[0].payload.attempted_action).toBe("approve");
    expect(entries[0].payload.attempted_by).toBe("brian_approver");
  });

  // ─── 4. Already-processed intents are rejected ────────────────

  it("throws when intent is already APPROVED", async () => {
    mockIntentStore["INT-test-001"] = makePendingIntent({ status: "APPROVED" });
    const cq = makeCallbackQuery("brian_approver");

    await expect(
      telegramApprovalCallback("approve", "INT-test-001", cq)
    ).rejects.toThrow("APPROVED — cannot approve");

    // No ledger entries written for double-processing
    expect(ledgerEntries.length).toBe(0);
  });

  it("throws when intent is already REJECTED", async () => {
    mockIntentStore["INT-test-001"] = makePendingIntent({ status: "REJECTED" });
    const cq = makeCallbackQuery("brian_approver");

    await expect(
      telegramApprovalCallback("reject", "INT-test-001", cq)
    ).rejects.toThrow("REJECTED — cannot reject");

    expect(ledgerEntries.length).toBe(0);
  });

  it("throws when intent is EXECUTED", async () => {
    mockIntentStore["INT-test-001"] = makePendingIntent({ status: "EXECUTED" });
    const cq = makeCallbackQuery("brian_approver");

    await expect(
      telegramApprovalCallback("approve", "INT-test-001", cq)
    ).rejects.toThrow("EXECUTED — cannot approve");
  });

  // ─── 5. Missing intents throw ─────────────────────────────────

  it("throws when intent does not exist", async () => {
    const cq = makeCallbackQuery("brian_approver");

    await expect(
      telegramApprovalCallback("approve", "INT-nonexistent", cq)
    ).rejects.toThrow("Intent INT-nonexistent not found");
  });

  // ─── 6. Self-approval is blocked by constrained delegation ────

  it("self-approval is blocked when gateway evaluation disallows", async () => {
    mockIntentStore["INT-test-001"] = makePendingIntent();
    mockGatewayEvalResult = {
      allowed: false,
      authority_model: "BLOCKED — Self-Authorization Sub-Policy Not Met",
      role_separation: "self",
      reason: "Same identity, cooldown not elapsed",
      cooldown_remaining_ms: 90_000,
    } as any;

    const cq = makeCallbackQuery("brian_approver");

    await expect(
      telegramApprovalCallback("approve", "INT-test-001", cq)
    ).rejects.toThrow("Self-approval blocked");

    // DELEGATION_BLOCKED ledger entry written
    const blocked = ledgerEntries.filter(e => e.eventType === "DELEGATION_BLOCKED");
    expect(blocked.length).toBe(1);
    expect(blocked[0].payload.authority_model).toBe("BLOCKED — Self-Authorization Sub-Policy Not Met");
    expect(blocked[0].payload.channel).toBe("telegram");
    expect(blocked[0].payload.path).toBe("telegram.callback");

    // Intent status NOT changed (still PENDING_APPROVAL)
    expect(mockUpdateIntentStatus).not.toHaveBeenCalled();
    // No approval created
    expect(mockCreateApproval).not.toHaveBeenCalled();
  });

  it("self-approval block does NOT prevent rejection", async () => {
    // Even if gateway would block approval, rejection should still work
    mockIntentStore["INT-test-001"] = makePendingIntent();
    mockGatewayEvalResult = {
      allowed: false,
      authority_model: "BLOCKED — Self-Authorization Sub-Policy Not Met",
      role_separation: "self",
      reason: "Same identity, cooldown not elapsed",
    } as any;

    const cq = makeCallbackQuery("brian_approver");

    // Rejection bypasses constrained delegation check
    await telegramApprovalCallback("reject", "INT-test-001", cq);

    expect(mockUpdateIntentStatus).toHaveBeenCalledWith("INT-test-001", "REJECTED");
    const entries = ledgerEntries.filter(e => e.eventType === "APPROVAL");
    expect(entries.length).toBe(1);
    expect(entries[0].payload.decision).toBe("REJECTED");
  });

  // ─── 7. Details action does not modify intent status ──────────

  it("details action does not modify intent status or create approval", async () => {
    mockIntentStore["INT-test-001"] = makePendingIntent();
    const cq = makeCallbackQuery("brian_approver");

    await telegramApprovalCallback("details", "INT-test-001", cq);

    expect(mockUpdateIntentStatus).not.toHaveBeenCalled();
    expect(mockCreateApproval).not.toHaveBeenCalled();
    // No APPROVAL ledger entries
    const approvalEntries = ledgerEntries.filter(e => e.eventType === "APPROVAL");
    expect(approvalEntries.length).toBe(0);
  });

  it("details action throws when intent not found", async () => {
    const cq = makeCallbackQuery("brian_approver");

    await expect(
      telegramApprovalCallback("details", "INT-nonexistent", cq)
    ).rejects.toThrow("Intent INT-nonexistent not found");
  });

  // ─── 8. Authority model is correctly labeled ──────────────────

  it("approval with separated identities labels as Separated Authority", async () => {
    mockIntentStore["INT-test-001"] = makePendingIntent({ principalId: "user-proposer" });
    mockGatewayEvalResult = { allowed: true, authority_model: "Separated Authority", role_separation: "separated", reason: "" };
    const cq = makeCallbackQuery("brian_approver"); // telegram-brian_approver ≠ user-proposer

    await telegramApprovalCallback("approve", "INT-test-001", cq);

    const entries = ledgerEntries.filter(e => e.eventType === "APPROVAL");
    expect(entries[0].payload.authority_model).toBe("Separated Authority");
    expect(entries[0].payload.role_separation).toBe("separated");
  });

  // ─── 9. Both outcomes carry identity IDs ──────────────────────

  it("approval ledger entry carries both proposer and approver identity IDs", async () => {
    mockIntentStore["INT-test-001"] = makePendingIntent({ principalId: "agent-gemini" });
    const cq = makeCallbackQuery("governor_brian");

    await telegramApprovalCallback("approve", "INT-test-001", cq);

    const entries = ledgerEntries.filter(e => e.eventType === "APPROVAL");
    expect(entries[0].payload.proposer_identity_id).toBe("agent-gemini");
    expect(entries[0].payload.approver_identity_id).toBe("telegram-governor_brian");
  });

  it("rejection ledger entry carries both proposer and approver identity IDs", async () => {
    mockIntentStore["INT-test-001"] = makePendingIntent({ principalId: "agent-gemini" });
    const cq = makeCallbackQuery("governor_brian");

    await telegramApprovalCallback("reject", "INT-test-001", cq);

    const entries = ledgerEntries.filter(e => e.eventType === "APPROVAL");
    expect(entries[0].payload.proposer_identity_id).toBe("agent-gemini");
    expect(entries[0].payload.approver_identity_id).toBe("telegram-governor_brian");
  });

  // ─── 10. Callback uses username, falls back to first_name ─────

  it("uses first_name when username is not available", async () => {
    mockIntentStore["INT-test-001"] = makePendingIntent();
    const cq: TelegramCallbackQuery = {
      id: "cq-test-002",
      from: { id: 12345, first_name: "Brian" }, // no username
      message: { message_id: 100, chat: { id: 67890, type: "private" } },
      data: "approve:INT-test-001",
    };

    await telegramApprovalCallback("approve", "INT-test-001", cq);

    const entries = ledgerEntries.filter(e => e.eventType === "APPROVAL");
    expect(entries[0].payload.approver_identity_id).toBe("telegram-Brian");
    expect(entries[0].payload.approved_by).toBe("Brian");
  });

  // ─── 11. Approval creates a time-limited approval record ──────

  it("creates approval with 5-minute expiry and single execution", async () => {
    mockIntentStore["INT-test-001"] = makePendingIntent();
    const cq = makeCallbackQuery("brian_approver");
    const before = Date.now();

    await telegramApprovalCallback("approve", "INT-test-001", cq);

    expect(mockCreateApproval).toHaveBeenCalledTimes(1);
    const args = mockCreateApproval.mock.calls[0];
    // expiresAt should be ~5 minutes from now
    const expiresAt = args[6] as number;
    expect(expiresAt).toBeGreaterThanOrEqual(before + 290_000);
    expect(expiresAt).toBeLessThanOrEqual(before + 310_000);
    // maxExecutions = 1
    expect(args[7]).toBe(1);
  });

  // ─── 12. Rejection for expired intent during reject action ────

  it("expired intent during reject action also writes EXPIRED ledger entry", async () => {
    mockIntentStore["INT-test-001"] = makePendingIntent({
      expiresAt: Date.now() - 5000,
    });
    const cq = makeCallbackQuery("brian_approver");

    await expect(
      telegramApprovalCallback("reject", "INT-test-001", cq)
    ).rejects.toThrow("expired");

    const entries = ledgerEntries.filter(e => e.eventType === "APPROVAL");
    expect(entries.length).toBe(1);
    expect(entries[0].payload.decision).toBe("EXPIRED");
    expect(entries[0].payload.attempted_action).toBe("reject");
  });
});
