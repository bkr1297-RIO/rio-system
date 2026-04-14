/**
 * constrainedDelegation.test.ts — Tests for Authority Separation
 *
 * Proves:
 *   1. Same-identity immediate approval is BLOCKED
 *   2. Same-identity approval is ALLOWED after cooldown
 *   3. Different-identity approval works immediately
 *   4. Receipt contains role_separation field
 *   5. Role transitions are enforced
 *   6. Edge cases: exact boundary, zero cooldown, large cooldown
 */
import { describe, it, expect } from "vitest";
import {
  checkDelegation,
  classifyRoleSeparation,
  formatCooldownMessage,
  validateRoleTransition,
  DELEGATION_COOLDOWN_MS,
  type DelegationContext,
  type DelegationCheck,
} from "./constrainedDelegation";

describe("Constrained Delegation — Authority Separation", () => {

  // ─── Rule 1: No immediate self-approval ──────────────────────

  describe("Rule 1: Block immediate self-approval", () => {
    it("blocks same-identity approval when intent was just created", () => {
      const now = Date.now();
      const check = checkDelegation({
        proposerIdentity: "principal-user-1",
        approverIdentity: "principal-user-1",
        intentCreatedAt: now,
        approvalAttemptedAt: now,
      });

      expect(check.allowed).toBe(false);
      expect(check.role_separation).toBe("self");
      expect(check.cooldown_remaining_ms).toBeGreaterThan(0);
      expect(check.reason).toContain("BLOCKED");
      expect(check.reason).toContain("cooldown not elapsed");
    });

    it("blocks same-identity approval 1 second after creation", () => {
      const now = Date.now();
      const check = checkDelegation({
        proposerIdentity: "user-42",
        approverIdentity: "user-42",
        intentCreatedAt: now - 1000, // 1 second ago
        approvalAttemptedAt: now,
      });

      expect(check.allowed).toBe(false);
      expect(check.role_separation).toBe("self");
      expect(check.cooldown_remaining_ms).toBe(DELEGATION_COOLDOWN_MS - 1000);
    });

    it("blocks same-identity approval 60 seconds after creation (half cooldown)", () => {
      const now = Date.now();
      const check = checkDelegation({
        proposerIdentity: "user-42",
        approverIdentity: "user-42",
        intentCreatedAt: now - 60_000, // 60 seconds ago
        approvalAttemptedAt: now,
      });

      expect(check.allowed).toBe(false);
      expect(check.role_separation).toBe("self");
      expect(check.cooldown_remaining_ms).toBe(60_000); // 60s remaining
    });
  });

  // ─── Rule 2: Cooldown allows constrained delegation ──────────

  describe("Rule 2: Cooldown enables constrained delegation", () => {
    it("allows same-identity approval after full cooldown (120s)", () => {
      const now = Date.now();
      const check = checkDelegation({
        proposerIdentity: "user-42",
        approverIdentity: "user-42",
        intentCreatedAt: now - DELEGATION_COOLDOWN_MS, // exactly at cooldown
        approvalAttemptedAt: now,
      });

      expect(check.allowed).toBe(true);
      expect(check.role_separation).toBe("constrained");
      expect(check.cooldown_remaining_ms).toBe(0);
      expect(check.reason).toContain("Constrained delegation approved");
    });

    it("allows same-identity approval well after cooldown (5 minutes)", () => {
      const now = Date.now();
      const check = checkDelegation({
        proposerIdentity: "user-42",
        approverIdentity: "user-42",
        intentCreatedAt: now - 300_000, // 5 minutes ago
        approvalAttemptedAt: now,
      });

      expect(check.allowed).toBe(true);
      expect(check.role_separation).toBe("constrained");
      expect(check.cooldown_remaining_ms).toBe(0);
    });

    it("respects custom cooldown override", () => {
      const now = Date.now();
      const check = checkDelegation({
        proposerIdentity: "user-42",
        approverIdentity: "user-42",
        intentCreatedAt: now - 5000, // 5 seconds ago
        approvalAttemptedAt: now,
        cooldownOverrideMs: 3000, // 3 second cooldown
      });

      expect(check.allowed).toBe(true);
      expect(check.role_separation).toBe("constrained");
    });

    it("blocks with custom cooldown when not elapsed", () => {
      const now = Date.now();
      const check = checkDelegation({
        proposerIdentity: "user-42",
        approverIdentity: "user-42",
        intentCreatedAt: now - 1000, // 1 second ago
        approvalAttemptedAt: now,
        cooldownOverrideMs: 3000, // 3 second cooldown
      });

      expect(check.allowed).toBe(false);
      expect(check.cooldown_remaining_ms).toBe(2000);
    });
  });

  // ─── Rule 3: Different identity = immediate approval ─────────

  describe("Rule 3: Different identities — true separation", () => {
    it("allows different-identity approval immediately", () => {
      const now = Date.now();
      const check = checkDelegation({
        proposerIdentity: "principal-user-1",
        approverIdentity: "principal-user-2",
        intentCreatedAt: now, // just created
        approvalAttemptedAt: now,
      });

      expect(check.allowed).toBe(true);
      expect(check.role_separation).toBe("separated");
      expect(check.cooldown_remaining_ms).toBe(0);
      expect(check.cooldown_required_ms).toBe(0);
      expect(check.reason).toContain("true authority separation");
    });

    it("allows different-identity even with similar names", () => {
      const now = Date.now();
      const check = checkDelegation({
        proposerIdentity: "user-1",
        approverIdentity: "user-10",
        intentCreatedAt: now,
        approvalAttemptedAt: now,
      });

      expect(check.allowed).toBe(true);
      expect(check.role_separation).toBe("separated");
    });
  });

  // ─── Rule 4: Receipt role_separation field ───────────────────

  describe("Rule 4: Receipt role_separation classification", () => {
    it("classifies different identities as 'separated'", () => {
      expect(classifyRoleSeparation("user-1", "user-2", true)).toBe("separated");
      expect(classifyRoleSeparation("user-1", "user-2", false)).toBe("separated");
    });

    it("classifies same identity with cooldown as 'constrained'", () => {
      expect(classifyRoleSeparation("user-1", "user-1", true)).toBe("constrained");
    });

    it("classifies same identity without cooldown as 'self'", () => {
      expect(classifyRoleSeparation("user-1", "user-1", false)).toBe("self");
    });
  });

  // ─── Role transition enforcement ─────────────────────────────

  describe("Role transition enforcement", () => {
    it("allows proposer to create_intent", () => {
      const result = validateRoleTransition("proposer", "create_intent");
      expect(result.allowed).toBe(true);
    });

    it("blocks proposer from authorize_action", () => {
      const result = validateRoleTransition("proposer", "authorize_action");
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain("must explicitly switch to approver");
    });

    it("allows approver to authorize_action", () => {
      const result = validateRoleTransition("approver", "authorize_action");
      expect(result.allowed).toBe(true);
    });

    it("blocks approver from create_intent", () => {
      const result = validateRoleTransition("approver", "create_intent");
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain("must explicitly switch to proposer");
    });
  });

  // ─── Cooldown message formatting ─────────────────────────────

  describe("Cooldown message formatting", () => {
    it("formats separated message", () => {
      const check: DelegationCheck = {
        allowed: true,
        role_separation: "separated",
        reason: "test",
        cooldown_remaining_ms: 0,
        cooldown_required_ms: 0,
        proposer_identity: "user-1",
        approver_identity: "user-2",
        intent_created_at: Date.now(),
        approval_attempted_at: Date.now(),
      };
      expect(formatCooldownMessage(check)).toBe("Different authority — approved immediately.");
    });

    it("formats constrained message", () => {
      const check: DelegationCheck = {
        allowed: true,
        role_separation: "constrained",
        reason: "test",
        cooldown_remaining_ms: 0,
        cooldown_required_ms: 120_000,
        proposer_identity: "user-1",
        approver_identity: "user-1",
        intent_created_at: Date.now() - 120_000,
        approval_attempted_at: Date.now(),
      };
      expect(formatCooldownMessage(check)).toBe("Same authority — cooldown satisfied. Constrained delegation approved.");
    });

    it("formats blocked message with remaining time", () => {
      const check: DelegationCheck = {
        allowed: false,
        role_separation: "self",
        reason: "test",
        cooldown_remaining_ms: 45_000,
        cooldown_required_ms: 120_000,
        proposer_identity: "user-1",
        approver_identity: "user-1",
        intent_created_at: Date.now() - 75_000,
        approval_attempted_at: Date.now(),
      };
      expect(formatCooldownMessage(check)).toContain("wait 45s");
      expect(formatCooldownMessage(check)).toContain("No immediate self-approval");
    });
  });

  // ─── Edge cases ──────────────────────────────────────────────

  describe("Edge cases", () => {
    it("exact cooldown boundary — 1ms before", () => {
      const now = Date.now();
      const check = checkDelegation({
        proposerIdentity: "user-42",
        approverIdentity: "user-42",
        intentCreatedAt: now - (DELEGATION_COOLDOWN_MS - 1),
        approvalAttemptedAt: now,
      });
      expect(check.allowed).toBe(false);
      expect(check.cooldown_remaining_ms).toBe(1);
    });

    it("exact cooldown boundary — exactly at cooldown", () => {
      const now = Date.now();
      const check = checkDelegation({
        proposerIdentity: "user-42",
        approverIdentity: "user-42",
        intentCreatedAt: now - DELEGATION_COOLDOWN_MS,
        approvalAttemptedAt: now,
      });
      expect(check.allowed).toBe(true);
      expect(check.role_separation).toBe("constrained");
    });

    it("exact cooldown boundary — 1ms after", () => {
      const now = Date.now();
      const check = checkDelegation({
        proposerIdentity: "user-42",
        approverIdentity: "user-42",
        intentCreatedAt: now - (DELEGATION_COOLDOWN_MS + 1),
        approvalAttemptedAt: now,
      });
      expect(check.allowed).toBe(true);
      expect(check.role_separation).toBe("constrained");
    });

    it("handles empty string identities as same identity", () => {
      const now = Date.now();
      const check = checkDelegation({
        proposerIdentity: "",
        approverIdentity: "",
        intentCreatedAt: now,
        approvalAttemptedAt: now,
      });
      expect(check.allowed).toBe(false);
      expect(check.role_separation).toBe("self");
    });

    it("check result includes all required fields", () => {
      const now = Date.now();
      const check = checkDelegation({
        proposerIdentity: "user-1",
        approverIdentity: "user-2",
        intentCreatedAt: now,
        approvalAttemptedAt: now,
      });

      // Verify all fields are present (these go into receipts)
      expect(check).toHaveProperty("allowed");
      expect(check).toHaveProperty("role_separation");
      expect(check).toHaveProperty("reason");
      expect(check).toHaveProperty("cooldown_remaining_ms");
      expect(check).toHaveProperty("cooldown_required_ms");
      expect(check).toHaveProperty("proposer_identity");
      expect(check).toHaveProperty("approver_identity");
      expect(check).toHaveProperty("intent_created_at");
      expect(check).toHaveProperty("approval_attempted_at");
    });

    it("defaults approvalAttemptedAt to Date.now() when not provided", () => {
      const intentCreatedAt = Date.now() - DELEGATION_COOLDOWN_MS - 1000;
      const check = checkDelegation({
        proposerIdentity: "user-42",
        approverIdentity: "user-42",
        intentCreatedAt,
        // no approvalAttemptedAt
      });
      expect(check.allowed).toBe(true);
      expect(check.role_separation).toBe("constrained");
    });
  });

  // ─── Invariant: DELEGATION_COOLDOWN_MS is 120 seconds ────────

  describe("System invariant", () => {
    it("default cooldown is 120 seconds (2 minutes)", () => {
      expect(DELEGATION_COOLDOWN_MS).toBe(120_000);
    });
  });
});
