import { describe, expect, it } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

type AuthenticatedUser = NonNullable<TrpcContext["user"]>;

/**
 * Tests for the RIO Governance MVP:
 * 1. Full governance loop: create intent → approve → execute → verify receipt
 * 2. Deny flow: create intent → deny → block execution
 * 3. Learning analytics endpoint returns structured data
 * 4. Ledger chain endpoint returns entries
 * 5. Audit log returns events
 *
 * approve/deny are protectedProcedure — identity comes from ctx.user.
 */

function createAuthContext(name = "Governance Tester"): TrpcContext {
  const user: AuthenticatedUser = {
    id: 1,
    openId: "gov-test-user",
    email: "gov@rio.test",
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

describe("RIO Governance MVP", () => {
  const caller = appRouter.createCaller(createAuthContext());

  describe("Full approval flow (intent → approve → execute → verify)", () => {
    let intentId: string;
    let receiptId: string;

    it("creates an intent and returns pending status with hash", async () => {
      const result = await caller.rio.createIntent({
        action: "send_email",
        description: "Governance MVP test email",
        requestedBy: "vitest_runner",
      });

      expect(result).toBeDefined();
      expect(result.intentId).toMatch(/^INT-/);
      expect(result.intentHash).toBeTruthy();
      expect(result.status).toBe("pending");
      expect(result.action).toBe("send_email");

      intentId = result.intentId;
    });

    it("approves the intent — identity from session", async () => {
      const result = await caller.rio.approve({
        intentId,
      });

      expect(result).toBeDefined();
      expect(result.decision).toBe("approved");
      expect(result.decidedBy).toBe("Governance Tester");
      expect(result.signature).toBeTruthy();
    });

    it("executes the approved intent and returns v2 receipt + ledger entry", async () => {
      const result = await caller.rio.execute({ intentId });

      expect(result.allowed).toBe(true);
      expect(result.httpStatus).toBe(200);

      // Receipt
      const receipt = result.receipt as Record<string, unknown>;
      expect(receipt).toBeDefined();
      expect(receipt.receipt_id).toBeDefined();
      expect(receipt.decision).toBe("approved");
      expect(receipt.intent_hash).toBeDefined();
      expect(receipt.action_hash).toBeDefined();
      expect(receipt.verification_hash).toBeDefined();
      expect(receipt.protocol_version).toBe("v2");
      expect(receipt.receipt_hash).toBeDefined();

      // Ledger entry
      const ledgerEntry = result.ledger_entry as Record<string, unknown>;
      expect(ledgerEntry).toBeDefined();
      expect(ledgerEntry.block_id).toBeDefined();
      expect(ledgerEntry.current_hash).toBeDefined();

      receiptId = receipt.receipt_id as string;
    });

    it("verifies the receipt — all checks pass", async () => {
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

  describe("Deny flow (intent → deny → blocked execution)", () => {
    let intentId: string;

    it("creates an intent for a dangerous action", async () => {
      const result = await caller.rio.createIntent({
        action: "delete_database",
        description: "Dangerous action for deny test",
        requestedBy: "vitest_runner",
      });

      expect(result.intentId).toMatch(/^INT-/);
      expect(result.status).toBe("pending");
      intentId = result.intentId;
    });

    it("denies the intent — identity from session", async () => {
      const result = await caller.rio.deny({
        intentId,
      });

      expect(result.decision).toBe("denied");
      expect(result.decidedBy).toBe("Governance Tester");
    });

    it("blocks execution of the denied intent (fail-closed)", async () => {
      const result = await caller.rio.execute({ intentId });

      expect(result.allowed).toBe(false);
      expect(result.httpStatus).toBe(403);
      expect(result.message).toContain("Blocked");
    });
  });

  describe("Ledger chain integrity", () => {
    it("returns ledger entries with chain validation", async () => {
      const result = await caller.rio.ledgerChain({ limit: 10 });

      expect(result).toBeDefined();
      expect(Array.isArray(result.entries)).toBe(true);
      expect(typeof result.chainValid).toBe("boolean");

      if (result.entries.length > 0) {
        const entry = result.entries[0] as Record<string, unknown>;
        expect(entry.block_id).toBeDefined();
        expect(entry.intent_id).toBeDefined();
        expect(entry.action).toBeDefined();
        expect(entry.decision).toBeDefined();
        expect(entry.current_hash).toBeDefined();
      }
    });
  });

  describe("Learning analytics", () => {
    it("returns structured analytics with decision counts", async () => {
      const result = await caller.rio.learningAnalytics();

      expect(result).toBeDefined();
      expect(typeof result.totalDecisions).toBe("number");
      expect(typeof result.totalApproved).toBe("number");
      expect(typeof result.totalDenied).toBe("number");
      expect(typeof result.overallApprovalRate).toBe("number");
      expect(result.totalDecisions).toBeGreaterThanOrEqual(0);
      expect(result.overallApprovalRate).toBeGreaterThanOrEqual(0);
      expect(result.overallApprovalRate).toBeLessThanOrEqual(100);
    });

    it("returns action stats as an array with required fields", async () => {
      const result = await caller.rio.learningAnalytics();

      expect(Array.isArray(result.actionStats)).toBe(true);

      if (result.actionStats.length > 0) {
        const stat = result.actionStats[0];
        expect(typeof stat.action).toBe("string");
        expect(typeof stat.total).toBe("number");
        expect(typeof stat.approved).toBe("number");
        expect(typeof stat.denied).toBe("number");
        expect(typeof stat.approvalRate).toBe("number");
        expect(typeof stat.avgDecisionTimeMs).toBe("number");
      }
    });

    it("returns suggestions as an array with valid types", async () => {
      const result = await caller.rio.learningAnalytics();

      expect(Array.isArray(result.suggestions)).toBe(true);

      if (result.suggestions.length > 0) {
        const suggestion = result.suggestions[0];
        expect(suggestion.id).toBeDefined();
        expect(suggestion.action).toBeDefined();
        expect(suggestion.type).toBeDefined();
        expect(suggestion.title).toBeDefined();
        expect(suggestion.description).toBeDefined();
        expect(typeof suggestion.confidence).toBe("number");
        expect(typeof suggestion.basedOn).toBe("number");
        expect(typeof suggestion.approvalRate).toBe("number");
        expect(typeof suggestion.avgDecisionTimeSec).toBe("number");
        expect(["auto_approve", "auto_deny", "reduce_pause", "increase_scrutiny"]).toContain(suggestion.type);
      }
    });

    it("returns recent decisions as an array", async () => {
      const result = await caller.rio.learningAnalytics();

      expect(Array.isArray(result.decisions)).toBe(true);

      if (result.decisions.length > 0) {
        const decision = result.decisions[0];
        expect(decision.intentId).toBeDefined();
        expect(decision.action).toBeDefined();
        expect(decision.decision).toBeDefined();
        expect(decision.decidedBy).toBeDefined();
        expect(typeof decision.decisionTimeMs).toBe("number");
      }
    });
  });

  describe("Audit log", () => {
    it("returns full audit trail for a governed intent", async () => {
      const intent = await caller.rio.createIntent({
        action: "send_email",
        description: "Audit trail test",
        requestedBy: "vitest_auditor",
      });

      await caller.rio.approve({
        intentId: intent.intentId,
      });

      await caller.rio.execute({ intentId: intent.intentId });

      const audit = await caller.rio.auditLog({ intentId: intent.intentId });

      expect(audit.intentId).toBe(intent.intentId);
      expect(audit.intent).not.toBeNull();
      expect(audit.approvals.length).toBeGreaterThan(0);
      expect(audit.executions.length).toBeGreaterThan(0);
      expect(audit.receipts.length).toBeGreaterThan(0);
      expect(audit.ledger_entries.length).toBeGreaterThan(0);
      expect(audit.log.length).toBeGreaterThan(0);
    });
  });
});
