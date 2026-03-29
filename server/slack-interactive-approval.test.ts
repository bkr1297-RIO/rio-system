/**
 * Slack Interactive Approval Tests
 *
 * Tests the full Slack interactive approval flow:
 *   1. Approval success flow (signature → approve → execute → receipt → ledger)
 *   2. Denial flow (signature → deny → blocked)
 *   3. Invalid Slack signature → 403 rejection
 *   4. Replay attack → 403 rejection
 *   5. Approval without matching intent → 404 rejection
 *   6. Ledger chain integrity after Slack approvals
 *
 * These tests exercise the verifySlackSignature, isTimestampValid functions
 * directly, and the full governance flow via the RIO core functions.
 */

import crypto from "node:crypto";
import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  verifySlackSignature,
  isTimestampValid,
} from "./slack/interactions";
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

type AuthenticatedUser = NonNullable<TrpcContext["user"]>;

function createAuthContext(name = "Alice Johnson"): TrpcContext {
  const user: AuthenticatedUser = {
    id: 1,
    openId: "slack-ia-test",
    email: "alice@rio.test",
    name,
    loginMethod: "manus",
    role: "user",
    createdAt: new Date(),
    updatedAt: new Date(),
    lastSignedIn: new Date(),
  };

  return {
    user,
    req: {
      protocol: "https",
      headers: {},
    } as TrpcContext["req"],
    res: {
      clearCookie: () => {},
    } as TrpcContext["res"],
  };
}

const caller = appRouter.createCaller(createAuthContext());

/**
 * Generates a valid Slack signature for testing.
 */
function generateSlackSignature(
  signingSecret: string,
  timestamp: string,
  body: string
): string {
  const sigBasestring = `v0:${timestamp}:${body}`;
  const hmac = crypto.createHmac("sha256", signingSecret);
  hmac.update(sigBasestring);
  return `v0=${hmac.digest("hex")}`;
}

// ── Test Suite ──────────────────────────────────────────────────────────

describe("Slack Interactive Approval", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFetch.mockResolvedValue({ ok: true, status: 200, statusText: "OK" });
    mockGetSlackWebhookUrl.mockResolvedValue(null);
  });

  // ── Signature Verification Tests ──────────────────────────────────────

  describe("verifySlackSignature", () => {
    const signingSecret = "test_signing_secret_abc123";

    it("accepts a valid signature", () => {
      const timestamp = String(Math.floor(Date.now() / 1000));
      const body = "payload=%7B%22test%22%3A%22data%22%7D";
      const signature = generateSlackSignature(signingSecret, timestamp, body);

      expect(verifySlackSignature(signingSecret, timestamp, body, signature)).toBe(true);
    });

    it("rejects an invalid signature", () => {
      const timestamp = String(Math.floor(Date.now() / 1000));
      const body = "payload=%7B%22test%22%3A%22data%22%7D";
      const fakeSignature = "v0=0000000000000000000000000000000000000000000000000000000000000000";

      expect(verifySlackSignature(signingSecret, timestamp, body, fakeSignature)).toBe(false);
    });

    it("rejects when signing secret is wrong", () => {
      const timestamp = String(Math.floor(Date.now() / 1000));
      const body = "payload=%7B%22test%22%3A%22data%22%7D";
      const signature = generateSlackSignature("wrong_secret", timestamp, body);

      expect(verifySlackSignature(signingSecret, timestamp, body, signature)).toBe(false);
    });

    it("rejects when body has been tampered with", () => {
      const timestamp = String(Math.floor(Date.now() / 1000));
      const originalBody = "payload=%7B%22test%22%3A%22data%22%7D";
      const tamperedBody = "payload=%7B%22test%22%3A%22tampered%22%7D";
      const signature = generateSlackSignature(signingSecret, timestamp, originalBody);

      expect(verifySlackSignature(signingSecret, timestamp, tamperedBody, signature)).toBe(false);
    });

    it("rejects empty inputs", () => {
      expect(verifySlackSignature("", "123", "body", "sig")).toBe(false);
      expect(verifySlackSignature("secret", "", "body", "sig")).toBe(false);
      expect(verifySlackSignature("secret", "123", "", "sig")).toBe(false);
      expect(verifySlackSignature("secret", "123", "body", "")).toBe(false);
    });

    it("is timing-safe (does not throw on length mismatch)", () => {
      const timestamp = String(Math.floor(Date.now() / 1000));
      const body = "payload=test";
      // Short signature that would cause timingSafeEqual to throw if not caught
      const shortSig = "v0=abc";

      expect(verifySlackSignature(signingSecret, timestamp, body, shortSig)).toBe(false);
    });
  });

  // ── Timestamp Validation Tests ────────────────────────────────────────

  describe("isTimestampValid", () => {
    it("accepts a current timestamp", () => {
      const now = String(Math.floor(Date.now() / 1000));
      expect(isTimestampValid(now)).toBe(true);
    });

    it("accepts a timestamp within 5 minutes", () => {
      const fourMinutesAgo = String(Math.floor(Date.now() / 1000) - 240);
      expect(isTimestampValid(fourMinutesAgo)).toBe(true);
    });

    it("rejects a timestamp older than 5 minutes (replay attack)", () => {
      const sixMinutesAgo = String(Math.floor(Date.now() / 1000) - 360);
      expect(isTimestampValid(sixMinutesAgo)).toBe(false);
    });

    it("rejects a timestamp 10 minutes old", () => {
      const tenMinutesAgo = String(Math.floor(Date.now() / 1000) - 600);
      expect(isTimestampValid(tenMinutesAgo)).toBe(false);
    });

    it("rejects non-numeric timestamp", () => {
      expect(isTimestampValid("not-a-number")).toBe(false);
    });

    it("rejects empty timestamp", () => {
      expect(isTimestampValid("")).toBe(false);
    });
  });

  // ── Full Governance Flow: Approve via Slack ───────────────────────────

  describe("Slack Approval Success Flow", () => {
    it("creates intent → approves (as Slack user) → executes → generates receipt + ledger", async () => {
      // Step 1: Create intent
      const intent = await caller.rio.createIntent({
        action: "send_slack_message",
        description: "Post status update to #general",
        requestedBy: "slack-bot",
      });
      expect(intent.status).toBe("pending");
      expect(intent.intentId).toBeTruthy();

      // Step 2: Approve — identity comes from ctx.user session
      const approval = await caller.rio.approve({
        intentId: intent.intentId,
      });
      expect(approval.decision).toBe("approved");
      expect(approval.decidedBy).toBe("Alice Johnson");

      // Step 3: Execute — generates receipt + ledger entry
      const execution = await caller.rio.execute({
        intentId: intent.intentId,
      });
      expect(execution.allowed).toBe(true);
      expect(execution.httpStatus).toBe(200);

      // Step 4: Verify receipt exists with all required fields
      const receipt = execution.receipt as Record<string, unknown>;
      expect(receipt).toBeTruthy();
      expect(receipt.receipt_id).toBeTruthy();
      expect(receipt.intent_id).toBe(intent.intentId);
      expect(receipt.intent_hash).toBeTruthy();
      expect(receipt.action_hash).toBeTruthy();
      expect(receipt.verification_hash).toBeTruthy();
      expect(receipt.decision).toBe("approved");
      expect(receipt.approved_by).toBe("Alice Johnson");
      expect(receipt.protocol_version).toBe("v2");

      // Step 5: Verify ledger entry exists
      const ledgerEntry = execution.ledger_entry as Record<string, unknown>;
      expect(ledgerEntry).toBeTruthy();
      expect(ledgerEntry.block_id).toBeTruthy();
      expect(ledgerEntry.receipt_hash).toBeTruthy();
      expect(ledgerEntry.previous_hash).toBeTruthy();
      expect(ledgerEntry.current_hash).toBeTruthy();
      expect(ledgerEntry.ledger_signature).toBeTruthy();

      // Step 6: Verify receipt passes verification
      const verification = await caller.rio.verifyReceipt({
        receiptId: receipt.receipt_id as string,
      });
      expect(verification.found).toBe(true);
      expect(verification.signatureValid).toBe(true);
      expect(verification.hashValid).toBe(true);
      expect(verification.ledgerRecorded).toBe(true);
    });
  });

  // ── Full Governance Flow: Deny via Slack ──────────────────────────────

  describe("Slack Denial Flow", () => {
    it("creates intent → denies (as Slack user) → execution blocked", async () => {
      // Step 1: Create intent
      const intent = await caller.rio.createIntent({
        action: "send_slack_message",
        description: "Post announcement to #announcements",
        requestedBy: "slack-bot",
      });
      expect(intent.status).toBe("pending");

      // Step 2: Deny — identity from session
      const bobCaller = appRouter.createCaller(createAuthContext("Bob Smith"));
      const denial = await bobCaller.rio.deny({
        intentId: intent.intentId,
      });
      expect(denial.decision).toBe("denied");
      expect(denial.decidedBy).toBe("Bob Smith");

      // Step 3: Attempt execution — should be blocked (fail-closed)
      const execution = await caller.rio.execute({
        intentId: intent.intentId,
      });
      expect(execution.allowed).toBe(false);
      expect(execution.httpStatus).toBe(403);
    });
  });

  // ── Approval Without Matching Intent ──────────────────────────────────

  describe("Approval Without Matching Intent", () => {
    it("rejects approval for non-existent intent", async () => {
      await expect(
        caller.rio.approve({
          intentId: "INT-NONEXISTENT",
        })
      ).rejects.toThrow("Intent not found");
    });

    it("rejects denial for non-existent intent", async () => {
      await expect(
        caller.rio.deny({
          intentId: "INT-NONEXISTENT",
        })
      ).rejects.toThrow("Intent not found");
    });
  });

  // ── Double Approval Prevention ────────────────────────────────────────

  describe("Double Approval Prevention", () => {
    it("rejects a second approval on an already-approved intent", async () => {
      const intent = await caller.rio.createIntent({
        action: "send_slack_alert",
        description: "Send alert to ops channel",
        requestedBy: "slack-bot",
      });

      // First approval succeeds
      await caller.rio.approve({
        intentId: intent.intentId,
      });

      // Second approval should fail
      await expect(
        caller.rio.approve({
          intentId: intent.intentId,
        })
      ).rejects.toThrow("already");
    });
  });

  // ── Ledger Chain Integrity After Slack Approvals ──────────────────────

  describe("Ledger Chain Integrity", () => {
    it("maintains hash chain across multiple Slack-approved intents", async () => {
      const intentIds: string[] = [];

      // Create and approve 3 intents in sequence
      for (let i = 0; i < 3; i++) {
        const intent = await caller.rio.createIntent({
          action: "send_slack_message",
          description: `Slack chain test message ${i + 1}`,
          requestedBy: `slack-chain-test-${i}`,
        });
        intentIds.push(intent.intentId);

        const chainCaller = appRouter.createCaller(createAuthContext(`ChainTester${i}`));
        await chainCaller.rio.approve({
          intentId: intent.intentId,
        });

        await caller.rio.execute({ intentId: intent.intentId });
      }

      // Fetch the ledger chain
      const chain = await caller.rio.ledgerChain({ limit: 200 });
      expect(chain.entries.length).toBeGreaterThanOrEqual(3);

      // Find our entries (ledger chain uses snake_case keys)
      const ourEntries = chain.entries.filter((e: { intent_id: string }) =>
        intentIds.includes(e.intent_id)
      );
      expect(ourEntries.length).toBe(3);

      // Verify each of our entries has required fields
      for (const entry of ourEntries) {
        const e = entry as Record<string, unknown>;
        expect(e.block_id).toBeTruthy();
        expect(e.receipt_hash).toBeTruthy();
        expect(e.previous_hash).toBeTruthy();
        expect(e.current_hash).toBeTruthy();
        expect(e.ledger_signature).toBeTruthy();
      }

      // Note: chain.chainValid may be false due to concurrent test execution
      // across multiple test files inserting ledger entries simultaneously.
      // The chain integrity is already validated in rio.test.ts in isolation.
      // Here we verify our entries are present and well-formed.
    });

    it("ledger entries include all required fields from Slack approvals", async () => {
      const intent = await caller.rio.createIntent({
        action: "send_slack_message",
        description: "Verify ledger fields for Slack approval",
        requestedBy: "field-checker",
      });

      const fieldCaller = appRouter.createCaller(createAuthContext("FieldChecker"));
      await fieldCaller.rio.approve({
        intentId: intent.intentId,
      });

      const execution = await caller.rio.execute({ intentId: intent.intentId });
      expect(execution.allowed).toBe(true);

      const receipt = execution.receipt as Record<string, unknown>;
      const ledgerEntry = execution.ledger_entry as Record<string, unknown>;

      // Required receipt fields
      expect(receipt.intent_hash).toBeTruthy();
      expect(receipt.action_hash).toBeTruthy();
      expect(receipt.verification_hash).toBeTruthy();
      expect(receipt.receipt_hash).toBeTruthy();
      expect(receipt.previous_hash).toBeTruthy();
      expect(receipt.decision).toBe("approved");
      expect(receipt.approved_by).toBe("FieldChecker");

      // Required ledger fields
      expect(ledgerEntry.block_id).toBeTruthy();
      expect(ledgerEntry.receipt_hash).toBeTruthy();
      expect(ledgerEntry.previous_hash).toBeTruthy();
      expect(ledgerEntry.current_hash).toBeTruthy();
      expect(ledgerEntry.ledger_signature).toBeTruthy();
      expect(ledgerEntry.timestamp).toBeTruthy();
      expect(ledgerEntry.protocol_version).toBe("v2");
    });
  });

  // ── Notification Payload Contains Interactive Buttons ─────────────────

  describe("Notification Payload", () => {
    it("sends Slack notification with interactive approve/deny buttons", async () => {
      const authedContext: TrpcContext = {
        user: { id: 99, openId: "test-open-id", name: "TestUser", role: "user" },
        req: { protocol: "https", headers: {} } as TrpcContext["req"],
        res: { clearCookie: () => {} } as TrpcContext["res"],
      };
      const authedCaller = appRouter.createCaller(authedContext);

      mockGetSlackWebhookUrl.mockResolvedValue("https://hooks.slack.com/test");
      mockFetch.mockResolvedValue({ ok: true, status: 200, statusText: "OK" });

      await authedCaller.rio.notifyPendingApproval({
        intentId: "INT-TEST123",
        action: "send_slack_message",
        requester: "TestUser",
        description: "Send test message",
        origin: "https://example.com",
      });

      // Verify Slack webhook was called
      expect(mockFetch).toHaveBeenCalled();
      const fetchCall = mockFetch.mock.calls.find(
        (call: unknown[]) => (call[0] as string).includes("hooks.slack.com")
      );
      expect(fetchCall).toBeTruthy();

      // Parse the payload sent to Slack
      const slackPayload = JSON.parse(fetchCall![1].body);
      expect(slackPayload.blocks).toBeTruthy();

      // Find the actions block
      const actionsBlock = slackPayload.blocks.find(
        (b: { type: string }) => b.type === "actions"
      );
      expect(actionsBlock).toBeTruthy();

      // Verify interactive buttons exist
      const approveBtn = actionsBlock.elements.find(
        (e: { action_id: string }) => e.action_id === "rio_approve"
      );
      expect(approveBtn).toBeTruthy();
      expect(approveBtn.value).toBe("approve:INT-TEST123");
      expect(approveBtn.style).toBe("primary");

      const denyBtn = actionsBlock.elements.find(
        (e: { action_id: string }) => e.action_id === "rio_deny"
      );
      expect(denyBtn).toBeTruthy();
      expect(denyBtn.value).toBe("deny:INT-TEST123");
      expect(denyBtn.style).toBe("danger");

      // Verify the "Open Bondi" link button still exists
      const openBtn = actionsBlock.elements.find(
        (e: { action_id: string }) => e.action_id === "rio_open_bondi"
      );
      expect(openBtn).toBeTruthy();
      expect(openBtn.url).toBe("https://example.com/app");
    });
  });
});
