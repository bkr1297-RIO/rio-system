import { describe, expect, it } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

/**
 * Tests for RIO Priority features:
 * 1. Policy persistence: accept policy → stored in DB → retrievable
 * 2. Policy check: governance engine checks active policies before approval
 * 3. Auto-approve by policy: intent auto-approved, receipt still generated
 * 4. Auto-deny by policy: intent auto-denied
 * 5. Policy deactivation
 * 6. Gmail endpoint (simulated)
 * 7. Notification endpoint
 */

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

describe("RIO Policy Persistence & Governance Engine", () => {
  const ctx = createPublicContext();
  const caller = appRouter.createCaller(ctx);

  let createdPolicyId: string;

  describe("Accept and persist a policy", () => {
    it("accepts a policy suggestion and stores it in the database", async () => {
      const result = await caller.rio.acceptPolicySuggestion({
        action: "send_email",
        type: "auto_approve",
        title: "Auto-approve low-risk emails",
        description: "Emails are approved 95% of the time in under 2 seconds",
        confidence: 0.95,
        basedOn: 20,
        approvalRate: 95,
        avgDecisionTimeSec: 1.8,
      });

      expect(result).toBeDefined();
      expect(result.policyId).toBeDefined();
      expect(result.status).toBe("active");

      createdPolicyId = result.policyId;
    });

    it("retrieves active policies including the one just created", async () => {
      const policies = await caller.rio.activePolicies();

      expect(Array.isArray(policies)).toBe(true);
      expect(policies.length).toBeGreaterThan(0);

      const found = policies.find((p: { policyId: string }) => p.policyId === createdPolicyId);
      expect(found).toBeDefined();
      expect(found.action).toBe("send_email");
      expect(found.type).toBe("auto_approve");
      expect(found.title).toBe("Auto-approve low-risk emails");
      expect(found.status).toBe("active");
    });
  });

  describe("Policy check (governance engine pre-check)", () => {
    it("returns a policy match for send_email (auto_approve)", async () => {
      const result = await caller.rio.checkPolicy({ action: "send_email" });

      expect(result).toBeDefined();
      expect(result.policyMatch).toBe(true);
      expect(result.decision).toBe("auto_approve");
      expect(result.policyId).toBeDefined();
      expect(result.policyTitle).toBeDefined();
    });

    it("returns no policy match for an action without a policy", async () => {
      const result = await caller.rio.checkPolicy({ action: "launch_missiles" });

      expect(result).toBeDefined();
      expect(result.policyMatch).toBe(false);
    });
  });

  describe("Auto-approve by policy", () => {
    it("auto-approves an intent and generates receipt + ledger entry", async () => {
      // Create intent
      const intent = await caller.rio.createIntent({
        action: "send_email",
        description: "Auto-approve test email",
        requestedBy: "vitest_policy_engine",
      });

      expect(intent.intentId).toMatch(/^INT-/);

      // Auto-approve by policy
      const result = await caller.rio.autoApprove({
        intentId: intent.intentId,
        policyId: createdPolicyId,
      });

      expect(result).toBeDefined();
      expect(result.receipt).toBeDefined();
      expect(result.ledger_entry).toBeDefined();

      const receipt = result.receipt as Record<string, unknown>;
      expect(receipt.receipt_id).toBeDefined();
      expect(receipt.decision).toBe("approved");
      expect(receipt.intent_hash).toBeDefined();
      expect(receipt.action_hash).toBeDefined();
      expect(receipt.verification_hash).toBeDefined();
      expect(receipt.protocol_version).toBe("v2");

      const ledger = result.ledger_entry as Record<string, unknown>;
      expect(ledger.block_id).toBeDefined();
      expect(ledger.current_hash).toBeDefined();
    });
  });

  describe("Auto-deny by policy", () => {
    it("accepts an auto_deny policy", async () => {
      const result = await caller.rio.acceptPolicySuggestion({
        action: "delete_database",
        type: "auto_deny",
        title: "Block all database deletions",
        description: "Database deletions are always denied",
        confidence: 0.99,
        basedOn: 15,
        approvalRate: 0,
        avgDecisionTimeSec: 0.5,
      });

      expect(result.policyId).toBeDefined();
      expect(result.status).toBe("active");
    });

    it("auto-denies an intent blocked by policy", async () => {
      const intent = await caller.rio.createIntent({
        action: "delete_database",
        description: "Auto-deny test",
        requestedBy: "vitest_policy_engine",
      });

      // Check policy
      const check = await caller.rio.checkPolicy({ action: "delete_database" });
      expect(check.policyMatch).toBe(true);
      expect(check.decision).toBe("auto_deny");

      // Auto-deny
      const result = await caller.rio.autoDeny({
        intentId: intent.intentId,
        policyId: check.policyId!,
      });

      expect(result).toBeDefined();
      expect(result.autoDenied).toBe(true);
      expect(result.decision).toBe("denied");
      expect(result.decision_source).toBe("policy_auto");
    });
  });

  describe("Policy deactivation", () => {
    it("deactivates a policy and it no longer matches", async () => {
      // Deactivate the send_email auto_approve policy
      const deactivateResult = await caller.rio.deactivatePolicy({
        policyId: createdPolicyId,
      });

      expect(deactivateResult).toBeDefined();
      expect(deactivateResult.status).toBe("dismissed");

      // Check — should no longer match (unless another send_email policy exists)
      const policies = await caller.rio.activePolicies();
      const found = policies.find((p: { policyId: string }) => p.policyId === createdPolicyId);
      expect(found).toBeUndefined();
    });
  });

  describe("Gmail endpoint (simulated)", () => {
    it("accepts a send request and returns success", async () => {
      const result = await caller.rio.sendGmail({
        to: "test@example.com",
        subject: "Test from vitest",
        body: "This is a test email from the governance test suite.",
        intentId: "INT-test-gmail",
      });

      expect(result).toBeDefined();
      expect(result.sent).toBe(true);
      expect(result.to).toBe("test@example.com");
      expect(result.subject).toBe("Test from vitest");
      expect(result.intentId).toBe("INT-test-gmail");
      expect(result.executedAt).toBeDefined();
    });
  });

  describe("Notification endpoint", () => {
    it("sends a pending approval notification", async () => {
      const result = await caller.rio.notifyPendingApproval({
        intentId: "INT-test-notify",
        action: "send_email",
        requester: "vitest_notifier",
        description: "Send a test email",
      });

      expect(result).toBeDefined();
      expect(typeof result.notified).toBe("boolean");
      expect(result.intentId).toBe("INT-test-notify");
    });
  });
});
