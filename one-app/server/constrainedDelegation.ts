/**
 * constrainedDelegation.ts — Authority Separation for RIO
 *
 * Prevents trivial self-approval by enforcing structural friction
 * when the same human identity operates as both proposer and approver.
 *
 * Rules:
 *   1. No immediate self-approval — same identity requires cooldown
 *   2. Cooldown period (default 120s) must elapse between proposal and approval
 *   3. Role enforcement — proposer role cannot directly authorize; approver role must be explicitly invoked
 *   4. Receipt field — role_separation indicates the authority model used
 *
 * This module is the single source of truth for delegation policy.
 * No modifications without explicit authorization.
 */

// ─── Configuration ───────────────────────────────────────────

/** Minimum cooldown in milliseconds before same-identity approval is allowed */
export const DELEGATION_COOLDOWN_MS = 120_000; // 2 minutes

/** Role definitions for constrained delegation */
export type DelegationRole = "proposer" | "approver";

/** Authority separation classification for receipts */
export type RoleSeparation = "separated" | "constrained" | "self";

// ─── Types ───────────────────────────────────────────────────

export interface DelegationCheck {
  allowed: boolean;
  role_separation: RoleSeparation;
  reason: string;
  cooldown_remaining_ms: number;
  cooldown_required_ms: number;
  proposer_identity: string;
  approver_identity: string;
  intent_created_at: number;
  approval_attempted_at: number;
}

export interface DelegationContext {
  /** The identity (principalId or userId) that proposed the intent */
  proposerIdentity: string;
  /** The identity (principalId or userId) attempting to approve */
  approverIdentity: string;
  /** Timestamp when the intent was created (ms since epoch) */
  intentCreatedAt: number;
  /** Timestamp when approval is being attempted (ms since epoch, defaults to Date.now()) */
  approvalAttemptedAt?: number;
  /** Override cooldown for testing (ms) */
  cooldownOverrideMs?: number;
}

// ─── Core Logic ──────────────────────────────────────────────

/**
 * Check whether an approval attempt satisfies constrained delegation rules.
 *
 * Decision matrix:
 *   - Different identities → ALLOWED immediately (role_separation: "separated")
 *   - Same identity + cooldown elapsed → ALLOWED with friction (role_separation: "constrained")
 *   - Same identity + cooldown NOT elapsed → BLOCKED (role_separation: "self")
 */
export function checkDelegation(ctx: DelegationContext): DelegationCheck {
  const now = ctx.approvalAttemptedAt ?? Date.now();
  const cooldownMs = ctx.cooldownOverrideMs ?? DELEGATION_COOLDOWN_MS;
  const sameIdentity = ctx.proposerIdentity === ctx.approverIdentity;

  // ─── Case 1: Different identities → true separation ────────
  if (!sameIdentity) {
    return {
      allowed: true,
      role_separation: "separated",
      reason: `Proposer (${ctx.proposerIdentity}) ≠ Approver (${ctx.approverIdentity}) — true authority separation`,
      cooldown_remaining_ms: 0,
      cooldown_required_ms: 0,
      proposer_identity: ctx.proposerIdentity,
      approver_identity: ctx.approverIdentity,
      intent_created_at: ctx.intentCreatedAt,
      approval_attempted_at: now,
    };
  }

  // ─── Same identity: check cooldown ─────────────────────────
  const elapsed = now - ctx.intentCreatedAt;
  const remaining = Math.max(0, cooldownMs - elapsed);

  // ─── Case 2: Same identity + cooldown elapsed → constrained delegation ──
  if (remaining === 0) {
    return {
      allowed: true,
      role_separation: "constrained",
      reason: `Same identity (${ctx.proposerIdentity}) — cooldown elapsed (${Math.round(elapsed / 1000)}s ≥ ${Math.round(cooldownMs / 1000)}s). Constrained delegation approved.`,
      cooldown_remaining_ms: 0,
      cooldown_required_ms: cooldownMs,
      proposer_identity: ctx.proposerIdentity,
      approver_identity: ctx.approverIdentity,
      intent_created_at: ctx.intentCreatedAt,
      approval_attempted_at: now,
    };
  }

  // ─── Case 3: Same identity + cooldown NOT elapsed → BLOCKED ──
  return {
    allowed: false,
    role_separation: "self",
    reason: `BLOCKED: Same identity (${ctx.proposerIdentity}) — cooldown not elapsed (${Math.round(remaining / 1000)}s remaining of ${Math.round(cooldownMs / 1000)}s required). No immediate self-approval allowed.`,
    cooldown_remaining_ms: remaining,
    cooldown_required_ms: cooldownMs,
    proposer_identity: ctx.proposerIdentity,
    approver_identity: ctx.approverIdentity,
    intent_created_at: ctx.intentCreatedAt,
    approval_attempted_at: now,
  };
}

/**
 * Determine the role separation classification for a receipt.
 * This is the field that goes into every receipt and ledger entry.
 */
export function classifyRoleSeparation(
  proposerIdentity: string,
  approverIdentity: string,
  cooldownElapsed: boolean
): RoleSeparation {
  if (proposerIdentity !== approverIdentity) return "separated";
  if (cooldownElapsed) return "constrained";
  return "self";
}

/**
 * Format a human-readable cooldown message for the UI.
 */
export function formatCooldownMessage(check: DelegationCheck): string {
  if (check.allowed && check.role_separation === "separated") {
    return "Different authority — approved immediately.";
  }
  if (check.allowed && check.role_separation === "constrained") {
    return "Same authority — cooldown satisfied. Constrained delegation approved.";
  }
  const remainingSec = Math.ceil(check.cooldown_remaining_ms / 1000);
  return `Same authority — wait ${remainingSec}s before approving. No immediate self-approval.`;
}

/**
 * Validate that a role transition is permitted.
 * Proposer role cannot directly invoke approver actions without explicit role switch.
 */
export function validateRoleTransition(
  currentRole: DelegationRole,
  targetAction: "create_intent" | "authorize_action"
): { allowed: boolean; reason: string } {
  const rolePermissions: Record<DelegationRole, string[]> = {
    proposer: ["create_intent"],
    approver: ["authorize_action"],
  };

  const allowed = rolePermissions[currentRole]?.includes(targetAction) ?? false;
  if (allowed) {
    return { allowed: true, reason: `Role ${currentRole} is authorized for ${targetAction}` };
  }
  return {
    allowed: false,
    reason: `Role ${currentRole} cannot perform ${targetAction} — must explicitly switch to ${targetAction === "authorize_action" ? "approver" : "proposer"} role`,
  };
}
