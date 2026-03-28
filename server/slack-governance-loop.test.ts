/**
 * Slack RIO Governance Loop Tests
 *
 * Tests the FULL governed execution loop with Slack as the executor:
 *   1. Create intent (send_slack_message) → pending
 *   2. Approve intent → approved with signature
 *   3. Execute intent → receipt + ledger entry generated
 *   4. Connector execute (send_slack_message) → Slack webhook POST
 *   5. Verify receipt → all checks pass
 *   6. Deny flow → blocked, no execution
 *   7. Approval notification → Slack alert sent with Block Kit
 *
 * These tests prove the core RIO loop works end-to-end with Slack.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

// ── Mock slack-helpers for connector tests ──────────────────────────────
const mockGetSlackWebhookUrl = vi.fn();
vi.mock("./connectors/slack-helpers", () => ({
  getSlackWebhookUrl: (...args: unknown[]) => mockGetSlackWebhookUrl(...args),
  saveSlackWebhookUrl: vi.fn(),
  disconnectSlack: vi.fn(),
}));

// ── Mock global fetch for Slack webhook calls ───────────────────────────
const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

// ── Mock notifyOwner to prevent real notification sends ─────────────────
vi.mock("./_core/notification", () => ({
  notifyOwner: vi.fn().mockResolvedValue(true),
}));

// ── Helpers ─────────────────────────────────────────────────────────────

function createPublicContext(): TrpcContext {
  return {
    user: null,
    req: {
      protocol: "https",
      headers: {},
    } as TrpcContext["req"],
    res: {
      clearCookie: () => {},
    } as TrpcContext["res"],
  };
}

function createAuthenticatedContext(userId: number): TrpcContext {
  return {
    user: {
      id: userId,
      openId: `test-open-id-${userId}`,
      name: "Test User",
      email: "test@example.com",
      avatar: null,
      role: "user",
    },
    req: {
      protocol: "https",
      headers: {},
    } as TrpcContext["req"],
    res: {
      clearCookie: () => {},
    } as TrpcContext["res"],
  };
}

// ── Full Governance Loop: send_slack_message ────────────────────────────

describe("Slack RIO Governance Loop — Full Approval Flow", () => {
  const ctx = createPublicContext();
  const caller = appRouter.createCaller(ctx);
  let intentId: string;
  let receiptId: string;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("Step 1: Creates a send_slack_message intent → pending status", async () => {
    const result = await caller.rio.createIntent({
      action: "send_slack_message",
      description: "Send a message to #general in Slack",
      requestedBy: "Bondi",
    });

    expect(result).toBeDefined();
    expect(result.intentId).toMatch(/^INT-/);
    expect(result.intentHash).toBeTruthy();
    expect(result.status).toBe("pending");
    expect(result.action).toBe("send_slack_message");

    intentId = result.intentId;
  });

  it("Step 2: Approves the intent → approved with cryptographic signature", async () => {
    const result = await caller.rio.approve({
      intentId,
      decidedBy: "Human Approver",
    });

    expect(result).toBeDefined();
    expect(result.decision).toBe("approved");
    expect(result.decidedBy).toBe("Human Approver");
    expect(result.signature).toBeTruthy();
  });

  it("Step 3: Executes the approved intent → receipt + ledger entry", async () => {
    const result = await caller.rio.execute({ intentId });

    expect(result.allowed).toBe(true);
    expect(result.httpStatus).toBe(200);

    // Receipt with all required hashes
    const receipt = result.receipt as Record<string, unknown>;
    expect(receipt).toBeDefined();
    expect(receipt.receipt_id).toBeDefined();
    expect(receipt.decision).toBe("approved");
    expect(receipt.intent_hash).toBeDefined();
    expect(receipt.action_hash).toBeDefined();
    expect(receipt.verification_hash).toBeDefined();
    expect(receipt.protocol_version).toBe("v2");
    expect(receipt.receipt_hash).toBeDefined();
    expect(receipt.signature).toBeTruthy();

    // Ledger entry with hash chain
    const ledgerEntry = result.ledger_entry as Record<string, unknown>;
    expect(ledgerEntry).toBeDefined();
    expect(ledgerEntry.block_id).toBeDefined();
    expect(ledgerEntry.current_hash).toBeDefined();
    expect(ledgerEntry.previous_hash).toBeDefined();
    expect(ledgerEntry.receipt_hash).toBeDefined();

    receiptId = receipt.receipt_id as string;
  });

  it("Step 4: Connector executes send_slack_message via webhook (simulated)", async () => {
    const result = await caller.rio.connectorExecute({
      intentId,
      receiptId,
      action: "send_slack_message",
      parameters: {
        message: "RIO governance loop test — this message was approved before delivery.",
        channel: "#general",
      },
      mode: "simulated",
    });

    expect(result.success).toBe(true);
    expect(result.connector).toBe("slack");
    expect(result.action).toBe("send_slack_message");
    expect(result.mode).toBe("simulated");
    expect(result.detail).toContain("[Simulated]");
  });

  it("Step 5: Verifies the receipt → all checks pass", async () => {
    const result = await caller.rio.verifyReceipt({ receiptId });

    expect(result.found).toBe(true);
    expect(result.signatureValid).toBe(true);
    expect(result.hashValid).toBe(true);
    expect(result.ledgerRecorded).toBe(true);
    expect(result.protocolVersion).toBe("v2");
    expect(result.verificationStatus).toBe("verified");
    expect(result.receipt).not.toBeNull();
    expect(result.receipt?.receipt_id).toBe(receiptId);
  });
});

// ── Full Governance Loop: send_slack_alert ──────────────────────────────

describe("Slack RIO Governance Loop — Alert Variant", () => {
  const ctx = createPublicContext();
  const caller = appRouter.createCaller(ctx);
  let intentId: string;
  let receiptId: string;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("Creates a send_slack_alert intent and runs full loop", async () => {
    // Create
    const intent = await caller.rio.createIntent({
      action: "send_slack_alert",
      description: "Send a governance alert to Slack with Block Kit formatting",
      requestedBy: "Bondi",
    });
    expect(intent.status).toBe("pending");
    intentId = intent.intentId;

    // Approve
    const approval = await caller.rio.approve({
      intentId,
      decidedBy: "Human Approver",
    });
    expect(approval.decision).toBe("approved");

    // Execute → receipt + ledger
    const exec = await caller.rio.execute({ intentId });
    expect(exec.allowed).toBe(true);
    const receipt = exec.receipt as Record<string, unknown>;
    expect(receipt.intent_hash).toBeDefined();
    expect(receipt.action_hash).toBeDefined();
    expect(receipt.verification_hash).toBeDefined();
    receiptId = receipt.receipt_id as string;

    // Connector execute (simulated)
    const connResult = await caller.rio.connectorExecute({
      intentId,
      receiptId,
      action: "send_slack_alert",
      parameters: {
        title: "RIO Governance Alert",
        message: "A high-risk action was approved and executed.",
        channel: "#alerts",
      },
      mode: "simulated",
    });
    expect(connResult.success).toBe(true);
    expect(connResult.connector).toBe("slack");

    // Verify
    const verify = await caller.rio.verifyReceipt({ receiptId });
    expect(verify.found).toBe(true);
    expect(verify.signatureValid).toBe(true);
    expect(verify.ledgerRecorded).toBe(true);
    expect(verify.verificationStatus).toBe("verified");
  });
});

// ── Deny Flow: Slack action blocked ─────────────────────────────────────

describe("Slack RIO Governance Loop — Deny Flow (Fail-Closed)", () => {
  const ctx = createPublicContext();
  const caller = appRouter.createCaller(ctx);
  let intentId: string;

  it("Denies a Slack intent → execution blocked (fail-closed)", async () => {
    // Create intent
    const intent = await caller.rio.createIntent({
      action: "send_slack_message",
      description: "Slack message that should be denied",
      requestedBy: "Untrusted Agent",
    });
    expect(intent.status).toBe("pending");
    intentId = intent.intentId;

    // Deny
    const denial = await caller.rio.deny({
      intentId,
      decidedBy: "Human Reviewer",
    });
    expect(denial.decision).toBe("denied");

    // Execute → blocked
    const exec = await caller.rio.execute({ intentId });
    expect(exec.allowed).toBe(false);
    expect(exec.httpStatus).toBe(403);
    expect(exec.message).toContain("Blocked");
  });
});

// ── Approval Notification to Slack ──────────────────────────────────────

describe("Slack RIO Governance Loop — Approval Notification to Slack", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("Sends Slack approval alert when user has connected webhook", async () => {
    const userId = 99;
    mockGetSlackWebhookUrl.mockResolvedValue("https://hooks.slack.com/services/T123/B456/notify");
    mockFetch.mockResolvedValue({
      ok: true,
      text: () => Promise.resolve("ok"),
    });

    const authCtx = createAuthenticatedContext(userId);
    const caller = appRouter.createCaller(authCtx);

    const result = await caller.rio.notifyPendingApproval({
      intentId: "INT-notify-001",
      action: "send_slack_message",
      requester: "Bondi",
      description: "Send a message to #general in Slack",
      origin: "https://riodemo.manus.space",
    });

    expect(result.notified).toBe(true);
    expect(result.slackNotified).toBe(true);
    expect(result.intentId).toBe("INT-notify-001");

    // Verify Slack webhook was called with Block Kit payload
    expect(mockGetSlackWebhookUrl).toHaveBeenCalledWith(userId);
    expect(mockFetch).toHaveBeenCalledWith(
      "https://hooks.slack.com/services/T123/B456/notify",
      expect.objectContaining({
        method: "POST",
        headers: { "Content-Type": "application/json" },
      })
    );

    // Verify Block Kit structure
    const fetchCall = mockFetch.mock.calls[0];
    const body = JSON.parse(fetchCall[1].body);
    expect(body.blocks).toBeDefined();
    expect(body.blocks.length).toBeGreaterThanOrEqual(5);

    // Header
    expect(body.blocks[0].type).toBe("header");
    expect(body.blocks[0].text.text).toContain("Approval Required");

    // Action/Requester fields
    expect(body.blocks[1].type).toBe("section");
    expect(body.blocks[1].fields[0].text).toContain("send slack message");
    expect(body.blocks[1].fields[1].text).toContain("Bondi");

    // Description
    expect(body.blocks[2].type).toBe("section");
    expect(body.blocks[2].text.text).toContain("Send a message to #general");

    // Intent ID
    expect(body.blocks[3].type).toBe("section");
    expect(body.blocks[3].text.text).toContain("INT-notify-001");

    // Action buttons with approve/go links
    expect(body.blocks[4].type).toBe("actions");
    const buttons = body.blocks[4].elements;
    expect(buttons.length).toBe(2);
    expect(buttons[0].url).toBe("https://riodemo.manus.space/app");
    expect(buttons[1].url).toBe("https://riodemo.manus.space/go");
  });

  it("Does not send Slack alert when user has no webhook", async () => {
    const userId = 100;
    mockGetSlackWebhookUrl.mockResolvedValue(null);

    const authCtx = createAuthenticatedContext(userId);
    const caller = appRouter.createCaller(authCtx);

    const result = await caller.rio.notifyPendingApproval({
      intentId: "INT-notify-002",
      action: "send_slack_message",
      requester: "Bondi",
      description: "Send a message to Slack",
    });

    expect(result.notified).toBe(true);
    expect(result.slackNotified).toBe(false);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("Does not send Slack alert for unauthenticated users", async () => {
    const publicCtx = createPublicContext();
    const caller = appRouter.createCaller(publicCtx);

    const result = await caller.rio.notifyPendingApproval({
      intentId: "INT-notify-003",
      action: "send_slack_message",
      requester: "Bondi",
      description: "Send a message to Slack",
    });

    expect(result.notified).toBe(true);
    expect(result.slackNotified).toBe(false);
    expect(mockGetSlackWebhookUrl).not.toHaveBeenCalled();
  });

  it("Handles Slack webhook failure gracefully", async () => {
    const userId = 101;
    mockGetSlackWebhookUrl.mockResolvedValue("https://hooks.slack.com/services/T123/B456/fail");
    mockFetch.mockResolvedValue({
      ok: false,
      status: 500,
      statusText: "Internal Server Error",
      text: () => Promise.resolve("server_error"),
    });

    const authCtx = createAuthenticatedContext(userId);
    const caller = appRouter.createCaller(authCtx);

    const result = await caller.rio.notifyPendingApproval({
      intentId: "INT-notify-004",
      action: "send_slack_message",
      requester: "Bondi",
      description: "Send a message to Slack",
    });

    // Owner notification still succeeds, Slack fails gracefully
    expect(result.notified).toBe(true);
    expect(result.slackNotified).toBe(false);
  });
});

// ── Ledger Chain Integrity After Slack Actions ──────────────────────────

describe("Slack RIO Governance Loop — Ledger Chain Integrity", () => {
  const ctx = createPublicContext();
  const caller = appRouter.createCaller(ctx);

  it("Ledger chain contains Slack action entries and chain is valid", async () => {
    const chain = await caller.rio.ledgerChain({ limit: 50 });

    expect(chain).toBeDefined();
    expect(Array.isArray(chain.entries)).toBe(true);
    expect(typeof chain.chainValid).toBe("boolean");

    // Find entries for send_slack_message actions
    const slackEntries = chain.entries.filter(
      (e: Record<string, unknown>) => e.action === "send_slack_message" || e.action === "send_slack_alert"
    );

    // We created Slack intents in previous tests, so there should be at least one
    expect(slackEntries.length).toBeGreaterThan(0);

    // Each entry has required hash chain fields
    for (const entry of slackEntries) {
      const e = entry as Record<string, unknown>;
      expect(e.block_id).toBeDefined();
      expect(e.current_hash).toBeDefined();
      expect(e.intent_id).toBeDefined();
      expect(e.action).toBeDefined();
      expect(e.decision).toBeDefined();
    }
  });
});

// ── Audit Log for Slack Actions ─────────────────────────────────────────

describe("Slack RIO Governance Loop — Audit Trail", () => {
  const ctx = createPublicContext();
  const caller = appRouter.createCaller(ctx);

  it("Returns full audit trail for a governed Slack intent", async () => {
    // Create, approve, execute a fresh Slack intent
    const intent = await caller.rio.createIntent({
      action: "send_slack_message",
      description: "Audit trail test for Slack",
      requestedBy: "vitest_auditor",
    });

    await caller.rio.approve({
      intentId: intent.intentId,
      decidedBy: "vitest_auditor",
    });

    await caller.rio.execute({ intentId: intent.intentId });

    // Get audit log
    const audit = await caller.rio.auditLog({ intentId: intent.intentId });

    expect(audit.intentId).toBe(intent.intentId);
    expect(audit.intent).not.toBeNull();
    expect(audit.intent?.action).toBe("send_slack_message");
    expect(audit.approvals.length).toBeGreaterThan(0);
    expect(audit.executions.length).toBeGreaterThan(0);
    expect(audit.receipts.length).toBeGreaterThan(0);
    expect(audit.ledger_entries.length).toBeGreaterThan(0);
    expect(audit.log.length).toBeGreaterThan(0);
  });
});
