/**
 * Pause Placement Model — Comprehensive Tests
 * ═══════════════════════════════════════════════════════════════
 * Tests all 3 pause paths + invariant enforcement + intake rules
 *
 * Mocks: processIntent, approvalSystem, driveSubFiles, standardReceipt
 * Does NOT mock: pausePlacement itself (unit under test)
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Mock processIntent ─────────────────────────────────────────
vi.mock("./intentPipeline", () => ({
  processIntent: vi.fn().mockResolvedValue({
    decision: "allow",
    executed: true,
    receipt_id: "RCPT-TEST-001",
    receipt_hash: "abc123",
    events: [],
    message: "Allowed by policy",
  }),
  buildOutboundIntent: vi.fn().mockReturnValue({
    direction: "outbound",
    channel: "email",
    action: "send_email",
    source: "human",
    data: {},
    timestamp: Date.now(),
  }),
}));

// ─── Mock approvalSystem ────────────────────────────────────────
vi.mock("./approvalSystem", () => {
  const baseMock = {
    approval_id: "APPR-TEST-001",
    action_id: "ACT-TEST-001",
    proposer_id: "owner",
    approver_id: null,
    envelope: { pause_type: "PRE_EXEC" },
    decision: { result: "REQUIRE_CONFIRMATION" },
    status: "PENDING" as const,
    requested_at: Date.now(),
    expires_at: Date.now() + 900_000,
    receipt_id: null,
  };
  return {
    createPendingApproval: vi.fn().mockResolvedValue({ ...baseMock }),
    resolveApproval: vi.fn().mockResolvedValue({ approval: { ...baseMock, status: "APPROVED", approver_id: "admin" } }),
    getApproval: vi.fn().mockReturnValue(null),
    getPendingApprovals: vi.fn().mockReturnValue([]),
    getAllApprovals: vi.fn().mockReturnValue([]),
    _resetApprovals: vi.fn(),
  };
});

// ─── Mock driveSubFiles ─────────────────────────────────────────
vi.mock("./driveSubFiles", () => ({
  logEnvelope: vi.fn().mockResolvedValue(undefined),
  logDecision: vi.fn().mockResolvedValue(undefined),
  logError: vi.fn().mockResolvedValue(undefined),
  logApproval: vi.fn().mockResolvedValue(undefined),
}));

// ─── Mock standardReceipt ───────────────────────────────────────
vi.mock("./standardReceipt", () => ({
  wrapInEnvelope: vi.fn().mockReturnValue({
    action_id: "ACT-TEST-001",
    actor: { id: "owner", type: "human", source: "one-ui" },
    intent: { type: "SEND_EMAIL", target: "test@example.com", parameters: {} },
    resource: { type: "email", id: "test@example.com" },
    payload: { content: {}, metadata: {} },
    constraints: { policies: [], risk_level: "low" },
    state_ref: { state_hash: "test" },
    policy_ref: { version: "v1" },
    timestamp: new Date().toISOString(),
    source: "one-ui",
  }),
  validateEnvelope: vi.fn().mockReturnValue({ valid: true, errors: [] }),
}));

// ─── Mock authorityLayer ───────────────────────────────────────
vi.mock("./authorityLayer", () => ({
  generateCanonicalReceipt: vi.fn().mockReturnValue({
    receipt_id: "RCPT-REJECT-001",
    receipt_hash: "reject-hash-abc",
    previous_receipt_hash: "prev-hash-xyz",
    snapshot_hash: "snap-hash-123",
    proposer_id: "owner",
    approver_id: "admin",
    token_id: "PAUSE-REJECT-001",
    action: "SEND_EMAIL_REJECTED",
    success: false,
    result: { status: "REJECTED" },
    executor: "pause-placement-system",
    ledger_entry_id: "LE-REJECT-001",
    timestamp_proposed: new Date().toISOString(),
    timestamp_approved: new Date().toISOString(),
    timestamp_executed: new Date().toISOString(),
    policy_hash: "policy-hash",
  }),
}));

// ─── Mock db (appendLedger) ────────────────────────────────────
vi.mock("./db", () => ({
  appendLedger: vi.fn().mockResolvedValue(undefined),
}));

// ─── Mock librarian (syncToLibrarian) ──────────────────────────
vi.mock("./librarian", () => ({
  syncToLibrarian: vi.fn().mockResolvedValue(undefined),
}));

// ─── Mock rioConfig ─────────────────────────────────────────────
vi.mock("./rioConfig", () => ({
  loadConfig: vi.fn().mockReturnValue({
    cooldown_default: 120_000,
    policy_version: "v1",
    rate_limit: 10,
    dedup_window_size: 100,
    approval_expiry_ms: 300_000,
  }),
}));

// ─── Import under test ──────────────────────────────────────────
import {
  routeAction,
  addIntakeRule,
  removeIntakeRule,
  getActiveRules,
  getAllRules,
  getRule,
  findMatchingIntakeRule,
  getPauseStats,
  hasPause,
  sentinelEmailHook,
  executeAfterApproval,
  _resetPausePlacement,
  type Action,
  type PauseType,
} from "./pausePlacement";
import { getApproval } from "./approvalSystem";
import { logEnvelope, logDecision, logError } from "./driveSubFiles";
import { generateCanonicalReceipt } from "./authorityLayer";
import { appendLedger } from "./db";
import { syncToLibrarian } from "./librarian";

// ═══════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════

function makeAction(overrides: Partial<Action> = {}): Action {
  return {
    id: "",
    type: "SEND_EMAIL",
    recipient: "test@example.com",
    subject: "Test Subject",
    body: "Test body",
    data: {},
    timestamp: new Date().toISOString(),
    ...overrides,
  };
}

// ═══════════════════════════════════════════════════════════════
// TESTS
// ═══════════════════════════════════════════════════════════════

describe("Pause Placement Model", () => {
  beforeEach(() => {
    _resetPausePlacement();
    vi.clearAllMocks();
  });

  // ─── INTAKE RULE MANAGEMENT ─────────────────────────────────
  describe("Intake Rule Management", () => {
    it("adds an intake rule with generated ID", () => {
      const rule = addIntakeRule({
        name: "Auto-send to team",
        action_type: "SEND_EMAIL",
        conditions: { recipient: "team@example.com" },
        constraints: {},
        approved_by: "owner",
        approved_at: new Date().toISOString(),
        active: true,
      });

      expect(rule.id).toMatch(/^RULE-/);
      expect(rule.name).toBe("Auto-send to team");
      expect(rule.action_type).toBe("SEND_EMAIL");
      expect(rule.use_count).toBe(0);
      expect(rule.last_used).toBeNull();
      expect(rule.active).toBe(true);
    });

    it("removes an intake rule", () => {
      const rule = addIntakeRule({
        name: "Test Rule",
        action_type: "SEND_EMAIL",
        conditions: {},
        constraints: {},
        approved_by: "owner",
        approved_at: new Date().toISOString(),
        active: true,
      });

      expect(removeIntakeRule(rule.id)).toBe(true);
      expect(getRule(rule.id)).toBeNull();
    });

    it("returns false when removing non-existent rule", () => {
      expect(removeIntakeRule("RULE-nonexistent")).toBe(false);
    });

    it("getActiveRules filters inactive rules", () => {
      addIntakeRule({
        name: "Active",
        action_type: "SEND_EMAIL",
        conditions: {},
        constraints: {},
        approved_by: "owner",
        approved_at: new Date().toISOString(),
        active: true,
      });
      addIntakeRule({
        name: "Inactive",
        action_type: "API_CALL",
        conditions: {},
        constraints: {},
        approved_by: "owner",
        approved_at: new Date().toISOString(),
        active: false,
      });

      const active = getActiveRules();
      expect(active.length).toBe(1);
      expect(active[0].name).toBe("Active");

      const all = getAllRules();
      expect(all.length).toBe(2);
    });

    it("findMatchingIntakeRule matches by action_type", () => {
      addIntakeRule({
        name: "Email Rule",
        action_type: "SEND_EMAIL",
        conditions: {},
        constraints: {},
        approved_by: "owner",
        approved_at: new Date().toISOString(),
        active: true,
      });

      const action = makeAction({ type: "SEND_EMAIL" });
      const match = findMatchingIntakeRule(action);
      expect(match).not.toBeNull();
      expect(match!.name).toBe("Email Rule");

      const noMatch = findMatchingIntakeRule(makeAction({ type: "API_CALL" }));
      expect(noMatch).toBeNull();
    });

    it("findMatchingIntakeRule checks conditions against action data", () => {
      addIntakeRule({
        name: "Only team emails",
        action_type: "SEND_EMAIL",
        conditions: { recipient: "team@example.com" },
        constraints: {},
        approved_by: "owner",
        approved_at: new Date().toISOString(),
        active: true,
      });

      // Matching recipient
      const match = findMatchingIntakeRule(makeAction({ recipient: "team@example.com" }));
      expect(match).not.toBeNull();

      // Non-matching recipient
      const noMatch = findMatchingIntakeRule(makeAction({ recipient: "other@example.com" }));
      expect(noMatch).toBeNull();
    });
  });

  // ─── PATH A: INTAKE PAUSE ──────────────────────────────────
  describe("Path A: Intake Pause", () => {
    it("auto-executes when matching intake rule exists (RIO_UI source)", async () => {
      addIntakeRule({
        name: "Auto-send",
        action_type: "SEND_EMAIL",
        conditions: {},
        constraints: {},
        approved_by: "owner",
        approved_at: new Date().toISOString(),
        active: true,
      });

      const result = await routeAction(makeAction(), "RIO_UI", "owner");

      expect(result.pause_type).toBe("INTAKE");
      expect(result.status).toBe("ACTION_EXECUTED");
      expect(result.receipt).not.toBeNull();
      expect(result.approval_id).toBeNull();
      expect(result.intake_rule_id).toMatch(/^RULE-/);
      expect(result.message).toContain("auto-executed via rule");
    });

    it("auto-executes when matching intake rule exists (RIO_API source)", async () => {
      addIntakeRule({
        name: "API Auto-send",
        action_type: "SEND_EMAIL",
        conditions: {},
        constraints: {},
        approved_by: "owner",
        approved_at: new Date().toISOString(),
        active: true,
      });

      const result = await routeAction(makeAction(), "RIO_API", "owner");
      expect(result.pause_type).toBe("INTAKE");
      expect(result.status).toBe("ACTION_EXECUTED");
    });

    it("increments rule use_count after execution", async () => {
      const rule = addIntakeRule({
        name: "Counter test",
        action_type: "SEND_EMAIL",
        conditions: {},
        constraints: {},
        approved_by: "owner",
        approved_at: new Date().toISOString(),
        active: true,
      });

      expect(rule.use_count).toBe(0);

      await routeAction(makeAction(), "RIO_UI", "owner");

      const updated = getRule(rule.id);
      expect(updated!.use_count).toBe(1);
      expect(updated!.last_used).not.toBeNull();
    });

    it("logs envelope to Drive on intake execution", async () => {
      addIntakeRule({
        name: "Drive log test",
        action_type: "SEND_EMAIL",
        conditions: {},
        constraints: {},
        approved_by: "owner",
        approved_at: new Date().toISOString(),
        active: true,
      });

      await routeAction(makeAction(), "RIO_UI", "owner");

      expect(logEnvelope).toHaveBeenCalled();
    });
  });

  // ─── PATH B: PRE-EXECUTION PAUSE ──────────────────────────
  describe("Path B: Pre-Execution Pause", () => {
    it("pauses when no matching intake rule (RIO_UI source)", async () => {
      // No rules added → falls to PRE_EXEC
      const result = await routeAction(makeAction(), "RIO_UI", "owner");

      expect(result.pause_type).toBe("PRE_EXEC");
      expect(result.status).toBe("AWAITING_APPROVAL");
      expect(result.approval_id).toBe("APPR-TEST-001");
      expect(result.receipt).toBeNull();
      expect(result.message).toContain("Pre-Execution Pause");
      expect(result.message).toContain("15 minutes");
    });

    it("pauses when no matching intake rule (RIO_API source)", async () => {
      const result = await routeAction(makeAction(), "RIO_API", "owner");
      expect(result.pause_type).toBe("PRE_EXEC");
      expect(result.status).toBe("AWAITING_APPROVAL");
    });

    it("creates pending approval with REQUIRE_CONFIRMATION decision", async () => {
      const { createPendingApproval } = await import("./approvalSystem");

      await routeAction(makeAction(), "RIO_UI", "owner");

      expect(createPendingApproval).toHaveBeenCalledWith(
        expect.any(Object), // envelope
        expect.objectContaining({
          result: "REQUIRE_CONFIRMATION",
          requires_confirmation: true,
        }),
      );
    });

    it("logs envelope and decision to Drive", async () => {
      await routeAction(makeAction(), "RIO_UI", "owner");

      expect(logEnvelope).toHaveBeenCalled();
      expect(logDecision).toHaveBeenCalled();
    });
  });

  // ─── PATH C: SENTINEL PAUSE ───────────────────────────────
  describe("Path C: Sentinel Pause", () => {
    it("blocks external SMTP source immediately", async () => {
      const result = await routeAction(makeAction(), "SMTP", "owner");

      expect(result.pause_type).toBe("SENTINEL");
      expect(result.status).toBe("AWAITING_APPROVAL");
      expect(result.approval_id).toBe("APPR-TEST-001");
      expect(result.message).toContain("SENTINEL");
      expect(result.message).toContain("1 hour");
    });

    it("blocks external API source immediately", async () => {
      const result = await routeAction(makeAction(), "API", "owner");
      expect(result.pause_type).toBe("SENTINEL");
      expect(result.status).toBe("AWAITING_APPROVAL");
    });

    it("blocks external WEBHOOK source immediately", async () => {
      const result = await routeAction(makeAction(), "WEBHOOK", "owner");
      expect(result.pause_type).toBe("SENTINEL");
    });

    it("blocks unknown external source", async () => {
      const result = await routeAction(makeAction(), "UNKNOWN", "owner");
      expect(result.pause_type).toBe("SENTINEL");
    });

    it("logs envelope, decision, and error to Drive", async () => {
      await routeAction(makeAction(), "SMTP", "owner");

      expect(logEnvelope).toHaveBeenCalled();
      expect(logDecision).toHaveBeenCalled();
      expect(logError).toHaveBeenCalled();
    });
  });

  // ─── SENTINEL EMAIL HOOK ──────────────────────────────────
  describe("Sentinel Email Hook", () => {
    it("passes through RIO_UI source (not intercepted)", async () => {
      const result = await sentinelEmailHook(
        "test@example.com", "Subject", "Body", "RIO_UI", "owner",
      );
      expect(result.intercepted).toBe(false);
      expect(result.result).toBeUndefined();
    });

    it("passes through RIO_API source (not intercepted)", async () => {
      const result = await sentinelEmailHook(
        "test@example.com", "Subject", "Body", "RIO_API", "owner",
      );
      expect(result.intercepted).toBe(false);
    });

    it("intercepts external SMTP source", async () => {
      const result = await sentinelEmailHook(
        "test@example.com", "Subject", "Body", "SMTP", "owner",
      );
      expect(result.intercepted).toBe(true);
      expect(result.result).toBeDefined();
      expect(result.result!.pause_type).toBe("SENTINEL");
      expect(result.result!.status).toBe("AWAITING_APPROVAL");
    });
  });

  // ─── DECISION TREE ROUTING ────────────────────────────────
  describe("Decision Tree Routing", () => {
    it("routes RIO_UI + matching rule → INTAKE", async () => {
      addIntakeRule({
        name: "Rule",
        action_type: "SEND_EMAIL",
        conditions: {},
        constraints: {},
        approved_by: "owner",
        approved_at: new Date().toISOString(),
        active: true,
      });

      const result = await routeAction(makeAction(), "RIO_UI", "owner");
      expect(result.pause_type).toBe("INTAKE");
    });

    it("routes RIO_UI + no rule → PRE_EXEC", async () => {
      const result = await routeAction(makeAction(), "RIO_UI", "owner");
      expect(result.pause_type).toBe("PRE_EXEC");
    });

    it("routes external source → SENTINEL (even if rule exists)", async () => {
      addIntakeRule({
        name: "Rule",
        action_type: "SEND_EMAIL",
        conditions: {},
        constraints: {},
        approved_by: "owner",
        approved_at: new Date().toISOString(),
        active: true,
      });

      // External source should NOT use intake rules
      const result = await routeAction(makeAction(), "SMTP", "owner");
      expect(result.pause_type).toBe("SENTINEL");
    });

    it("assigns action_id when not provided", async () => {
      const result = await routeAction(makeAction({ id: "" }), "RIO_UI", "owner");
      expect(result.action_id).toMatch(/^ACT-/);
    });
  });

  // ─── INVARIANT: EXACTLY ONE PAUSE PER ACTION ─────────────
  describe("Invariant: Exactly One Pause Per Action", () => {
    it("rejects second pause on same action_id", async () => {
      const action = makeAction({ id: "ACT-UNIQUE-001" });

      // First route → succeeds
      const first = await routeAction(action, "RIO_UI", "owner");
      expect(first.pause_type).toBe("PRE_EXEC");

      // Second route with same ID → rejected
      const second = await routeAction(action, "RIO_UI", "owner");
      expect(second.status).toBe("ACTION_REJECTED");
      expect(second.message).toContain("INVARIANT VIOLATION");
    });

    it("hasPause returns correct type after routing", async () => {
      const action = makeAction({ id: "ACT-CHECK-001" });
      expect(hasPause("ACT-CHECK-001")).toBeNull();

      await routeAction(action, "RIO_UI", "owner");
      expect(hasPause("ACT-CHECK-001")).toBe("PRE_EXEC");
    });
  });

  // ─── PAUSE STATS ──────────────────────────────────────────
  describe("Pause Stats", () => {
    it("tracks pause counts by type", async () => {
      // PRE_EXEC
      await routeAction(makeAction(), "RIO_UI", "owner");
      // SENTINEL
      await routeAction(makeAction(), "SMTP", "owner");

      // INTAKE
      addIntakeRule({
        name: "Rule",
        action_type: "SEND_EMAIL",
        conditions: {},
        constraints: {},
        approved_by: "owner",
        approved_at: new Date().toISOString(),
        active: true,
      });
      await routeAction(makeAction(), "RIO_UI", "owner");

      const stats = getPauseStats();
      expect(stats.total).toBe(3);
      expect(stats.byType.PRE_EXEC).toBe(1);
      expect(stats.byType.SENTINEL).toBe(1);
      expect(stats.byType.INTAKE).toBe(1);
    });
  });

  // ─── EXECUTE AFTER APPROVAL ───────────────────────────────
  describe("Execute After Approval", () => {
    it("returns rejection when approval not found", async () => {
      const result = await executeAfterApproval("APPR-NONEXISTENT", makeAction());
      expect(result.status).toBe("ACTION_REJECTED");
      expect(result.message).toBe("Approval not found");
    });

    it("executes when approval is APPROVED", async () => {
      const { getApproval: mockGetApproval } = await import("./approvalSystem");
      (mockGetApproval as ReturnType<typeof vi.fn>).mockReturnValueOnce({
        approval_id: "APPR-TEST-001",
        action_id: "ACT-TEST-001",
        proposer_id: "owner",
        approver_id: "admin",
        envelope: { pause_type: "PRE_EXEC" },
        decision: { result: "REQUIRE_CONFIRMATION" },
        status: "APPROVED",
        requested_at: Date.now(),
        expires_at: Date.now() + 900_000,
        receipt_id: null,
      });

      const result = await executeAfterApproval("APPR-TEST-001", makeAction());
      expect(result.status).toBe("ACTION_EXECUTED");
      expect(result.message).toContain("Approved and executed");
    });

    it("returns rejection when approval is REJECTED — with receipt + ledger + Drive", async () => {
      const { getApproval: mockGetApproval } = await import("./approvalSystem");
      (mockGetApproval as ReturnType<typeof vi.fn>).mockReturnValueOnce({
        approval_id: "APPR-TEST-001",
        action_id: "ACT-TEST-001",
        proposer_id: "owner",
        approver_id: "admin",
        envelope: { pause_type: "PRE_EXEC" },
        decision: { result: "REQUIRE_CONFIRMATION" },
        status: "REJECTED",
        requested_at: Date.now(),
        expires_at: Date.now() + 900_000,
        receipt_id: null,
      });

      // Clear mocks to isolate this test
      (generateCanonicalReceipt as ReturnType<typeof vi.fn>).mockClear();
      (appendLedger as ReturnType<typeof vi.fn>).mockClear();
      (syncToLibrarian as ReturnType<typeof vi.fn>).mockClear();

      const result = await executeAfterApproval("APPR-TEST-001", makeAction());
      expect(result.status).toBe("ACTION_REJECTED");

      // Receipt generated
      expect(result.receipt).not.toBeNull();
      expect(generateCanonicalReceipt).toHaveBeenCalledOnce();
      const receiptArgs = (generateCanonicalReceipt as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(receiptArgs.success).toBe(false);
      expect(receiptArgs.action).toContain("REJECTED");

      // Ledger written
      expect(appendLedger).toHaveBeenCalledOnce();
      const ledgerArgs = (appendLedger as ReturnType<typeof vi.fn>).mock.calls[0];
      expect(ledgerArgs[0]).toBe("EXECUTION");
      expect(ledgerArgs[1].decision).toBe("REJECTED");
      expect(ledgerArgs[1].type).toBe("PAUSE_REJECTED");
      expect(ledgerArgs[1].receipt_id).toBe("RCPT-REJECT-001");

      // Drive synced
      expect(syncToLibrarian).toHaveBeenCalledOnce();
      const driveArgs = (syncToLibrarian as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(driveArgs.receipt_id).toBe("RCPT-REJECT-001");
      expect(driveArgs.decision).toBe("REJECTED");
    });

    it("returns timeout when approval is EXPIRED — with receipt + ledger + Drive", async () => {
      const { getApproval: mockGetApproval } = await import("./approvalSystem");
      (mockGetApproval as ReturnType<typeof vi.fn>).mockReturnValueOnce({
        approval_id: "APPR-TEST-001",
        action_id: "ACT-TEST-001",
        proposer_id: "owner",
        approver_id: null,
        envelope: { pause_type: "PRE_EXEC" },
        decision: { result: "REQUIRE_CONFIRMATION" },
        status: "EXPIRED",
        requested_at: Date.now(),
        expires_at: Date.now() - 1000,
        receipt_id: null,
      });

      // Clear mocks to isolate this test
      (generateCanonicalReceipt as ReturnType<typeof vi.fn>).mockClear();
      (appendLedger as ReturnType<typeof vi.fn>).mockClear();
      (syncToLibrarian as ReturnType<typeof vi.fn>).mockClear();

      const result = await executeAfterApproval("APPR-TEST-001", makeAction());
      expect(result.status).toBe("TIMEOUT");

      // Receipt generated for EXPIRED too
      expect(result.receipt).not.toBeNull();
      expect(generateCanonicalReceipt).toHaveBeenCalledOnce();

      // Ledger written with EXPIRED type
      expect(appendLedger).toHaveBeenCalledOnce();
      const ledgerArgs = (appendLedger as ReturnType<typeof vi.fn>).mock.calls[0];
      expect(ledgerArgs[1].decision).toBe("EXPIRED");
      expect(ledgerArgs[1].type).toBe("PAUSE_EXPIRED");

      // Drive synced with EXPIRED decision
      expect(syncToLibrarian).toHaveBeenCalledOnce();
      const driveArgs = (syncToLibrarian as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(driveArgs.decision).toBe("EXPIRED");
    });

    it("REJECTED receipt matches APPROVED receipt structure", async () => {
      const { getApproval: mockGetApproval } = await import("./approvalSystem");
      (mockGetApproval as ReturnType<typeof vi.fn>).mockReturnValueOnce({
        approval_id: "APPR-TEST-001",
        action_id: "ACT-TEST-001",
        proposer_id: "owner",
        approver_id: "admin",
        envelope: { pause_type: "SENTINEL" },
        decision: { result: "REQUIRE_CONFIRMATION" },
        status: "REJECTED",
        requested_at: Date.now(),
        expires_at: Date.now() + 900_000,
        receipt_id: null,
      });

      const result = await executeAfterApproval("APPR-TEST-001", makeAction());

      // Receipt has same shape as approved flow
      expect(result.receipt).toBeTruthy();
      const receipt = result.receipt as unknown as Record<string, unknown>;
      expect(receipt.receipt_id).toBeDefined();
      expect(receipt.receipt_hash).toBeDefined();

      // Message includes Drive sync confirmation
      expect(result.message).toContain("synced to Drive");
      expect(result.message).toContain("SENTINEL");
    });
  });

  // ─── INVARIANT: NO BYPASS ─────────────────────────────────
  describe("Invariant: No Bypass", () => {
    it("every action produces a receipt or approval_id (never neither)", async () => {
      // PRE_EXEC → approval_id
      const preExec = await routeAction(makeAction(), "RIO_UI", "owner");
      expect(preExec.approval_id || preExec.receipt).toBeTruthy();

      // SENTINEL → approval_id
      const sentinel = await routeAction(makeAction(), "SMTP", "owner");
      expect(sentinel.approval_id || sentinel.receipt).toBeTruthy();

      // INTAKE → receipt
      addIntakeRule({
        name: "Rule",
        action_type: "SEND_EMAIL",
        conditions: {},
        constraints: {},
        approved_by: "owner",
        approved_at: new Date().toISOString(),
        active: true,
      });
      const intake = await routeAction(makeAction(), "RIO_UI", "owner");
      expect(intake.receipt || intake.approval_id).toBeTruthy();
    });

    it("every action has exactly one pause_type", async () => {
      const results: string[] = [];

      // Route 3 different actions
      const r1 = await routeAction(makeAction(), "RIO_UI", "owner");
      results.push(r1.pause_type);

      const r2 = await routeAction(makeAction(), "SMTP", "owner");
      results.push(r2.pause_type);

      addIntakeRule({
        name: "Rule",
        action_type: "SEND_EMAIL",
        conditions: {},
        constraints: {},
        approved_by: "owner",
        approved_at: new Date().toISOString(),
        active: true,
      });
      const r3 = await routeAction(makeAction(), "RIO_UI", "owner");
      results.push(r3.pause_type);

      // Each must be one of the 3 valid types
      const validTypes: PauseType[] = ["INTAKE", "PRE_EXEC", "SENTINEL"];
      for (const type of results) {
        expect(validTypes).toContain(type);
      }
    });

    it("every route produces a timestamp", async () => {
      const result = await routeAction(makeAction(), "RIO_UI", "owner");
      expect(result.timestamp).toBeDefined();
      expect(new Date(result.timestamp).getTime()).not.toBeNaN();
    });
  });
});
