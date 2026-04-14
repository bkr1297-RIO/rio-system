/**
 * Policy Matrix + Evaluate Endpoint Tests
 * ═══════════════════════════════════════════════════════════════
 */

import { describe, it, expect, beforeEach } from "vitest";
import {
  loadDefaultMatrix,
  loadCustomMatrix,
  getActiveMatrix,
  findRule,
  getRiskTierForScore,
  evaluateAction,
  isFailure,
  requiresApproval,
  verifyMatrixIntegrity,
  _resetMatrix,
} from "./policyMatrix";

describe("Policy Matrix", () => {
  beforeEach(() => {
    _resetMatrix();
  });

  // ─── Matrix Loading ───────────────────────────────────────────

  it("loads default matrix with all required fields", () => {
    const matrix = loadDefaultMatrix();
    expect(matrix.version).toBe("v1.0.0");
    expect(matrix.rules.length).toBeGreaterThan(0);
    expect(matrix.risk_tiers.length).toBe(4);
    expect(matrix.defaults.fail_closed).toBe(true);
    expect(matrix.matrix_hash).toBeTruthy();
  });

  it("default matrix has integrity", () => {
    const matrix = loadDefaultMatrix();
    expect(verifyMatrixIntegrity(matrix)).toBe(true);
  });

  it("getActiveMatrix auto-loads default if none set", () => {
    const matrix = getActiveMatrix();
    expect(matrix.version).toBe("v1.0.0");
  });

  it("loadCustomMatrix validates required fields", () => {
    expect(() => loadCustomMatrix({
      version: "",
      updated_at: "",
      rules: [],
      risk_tiers: [],
      defaults: { unknown_action_decision: "require_approval", approval_expiry_ms: 900000, default_channels: ["email"], fail_closed: true },
    })).toThrow("version is required");
  });

  it("loadCustomMatrix rejects invalid unknown_action_decision", () => {
    expect(() => loadCustomMatrix({
      version: "v2",
      updated_at: new Date().toISOString(),
      rules: [],
      risk_tiers: [],
      defaults: { unknown_action_decision: "allow" as any, approval_expiry_ms: 900000, default_channels: ["email"], fail_closed: true },
    })).toThrow("unknown_action_decision must be");
  });

  // ─── Rule Lookup ──────────────────────────────────────────────

  it("finds send_email rule", () => {
    loadDefaultMatrix();
    const rule = findRule("send_email");
    expect(rule).not.toBeNull();
    expect(rule!.action_type).toBe("send_email");
    expect(rule!.category).toBe("communication");
    expect(rule!.risk_tier).toBe("medium");
    expect(rule!.default_decision).toBe("require_approval");
  });

  it("finds send_payment rule with critical risk", () => {
    loadDefaultMatrix();
    const rule = findRule("send_payment");
    expect(rule).not.toBeNull();
    expect(rule!.risk_tier).toBe("critical");
    expect(rule!.require_different_approver).toBe(true);
    expect(rule!.learning_eligible).toBe(false);
  });

  it("returns null for unknown action", () => {
    loadDefaultMatrix();
    const rule = findRule("totally_unknown_action");
    expect(rule).toBeNull();
  });

  // ─── Risk Tier Lookup ─────────────────────────────────────────

  it("maps low score to low tier", () => {
    loadDefaultMatrix();
    const tier = getRiskTierForScore(15);
    expect(tier.tier).toBe("low");
    expect(tier.always_require_approval).toBe(false);
  });

  it("maps medium score to medium tier", () => {
    loadDefaultMatrix();
    const tier = getRiskTierForScore(40);
    expect(tier.tier).toBe("medium");
    expect(tier.always_require_approval).toBe(true);
  });

  it("maps high score to high tier", () => {
    loadDefaultMatrix();
    const tier = getRiskTierForScore(65);
    expect(tier.tier).toBe("high");
  });

  it("maps critical score to critical tier", () => {
    loadDefaultMatrix();
    const tier = getRiskTierForScore(85);
    expect(tier.tier).toBe("critical");
    expect(tier.always_require_approval).toBe(true);
  });

  it("clamps out-of-range scores", () => {
    loadDefaultMatrix();
    const low = getRiskTierForScore(-10);
    expect(low.tier).toBe("low");
    const high = getRiskTierForScore(150);
    expect(high.tier).toBe("critical");
  });

  // ─── Policy Evaluation ────────────────────────────────────────

  it("evaluates send_email as require_approval", () => {
    loadDefaultMatrix();
    const result = evaluateAction({ action_type: "send_email" });
    expect(isFailure(result)).toBe(false);
    if (!isFailure(result)) {
      expect(result.decision).toBe("require_approval");
      expect(result.risk_tier).toBe("medium");
      expect(result.matched_rule).toBe("send_email");
      expect(result.approval_channels).toContain("email");
      expect(result.matrix_version).toBe("v1.0.0");
    }
  });

  it("evaluates read_data as allow", () => {
    loadDefaultMatrix();
    const result = evaluateAction({ action_type: "read_data" });
    expect(isFailure(result)).toBe(false);
    if (!isFailure(result)) {
      expect(result.decision).toBe("allow");
      expect(result.risk_tier).toBe("low");
    }
  });

  it("evaluates send_payment as require_approval with different approver", () => {
    loadDefaultMatrix();
    const result = evaluateAction({ action_type: "send_payment" });
    expect(isFailure(result)).toBe(false);
    if (!isFailure(result)) {
      expect(result.decision).toBe("require_approval");
      expect(result.risk_tier).toBe("critical");
      expect(result.require_different_approver).toBe(true);
      expect(result.approval_expiry_ms).toBe(300000); // 5 min
    }
  });

  it("unknown action fails closed to require_approval", () => {
    loadDefaultMatrix();
    const result = evaluateAction({ action_type: "launch_missiles" });
    expect(isFailure(result)).toBe(false);
    if (!isFailure(result)) {
      expect(result.decision).toBe("require_approval");
      expect(result.risk_score).toBe(70); // high default
      expect(result.matched_rule).toBeNull();
      expect(result.reason).toContain("fail closed");
    }
  });

  it("returns failure for empty action_type", () => {
    loadDefaultMatrix();
    const result = evaluateAction({ action_type: "" });
    expect(isFailure(result)).toBe(true);
    if (isFailure(result)) {
      expect(result.code).toBe("INVALID_INPUT");
      expect(result.fallback_decision).toBe("block");
    }
  });

  it("risk_score_override changes the risk score", () => {
    loadDefaultMatrix();
    const result = evaluateAction({ action_type: "send_email", risk_score_override: 90 });
    expect(isFailure(result)).toBe(false);
    if (!isFailure(result)) {
      expect(result.risk_score).toBe(90);
    }
  });

  it("learning advisory is included but does not override decision", () => {
    loadDefaultMatrix();
    const result = evaluateAction({
      action_type: "send_email",
      learning_data: {
        trend: "TRUSTED",
        approval_rate: 0.95,
        total_decisions: 20,
        advisory_risk_score: 25,
      },
    });
    expect(isFailure(result)).toBe(false);
    if (!isFailure(result)) {
      // Decision is still require_approval even though learning says TRUSTED
      expect(result.decision).toBe("require_approval");
      expect(result.learning_advisory.available).toBe(true);
      expect(result.learning_advisory.trend).toBe("TRUSTED");
      expect(result.learning_advisory.advisory_risk_score).toBe(25);
    }
  });

  // ─── Type Guards ──────────────────────────────────────────────

  it("requiresApproval returns true for require_approval", () => {
    loadDefaultMatrix();
    const result = evaluateAction({ action_type: "send_email" });
    if (!isFailure(result)) {
      expect(requiresApproval(result)).toBe(true);
    }
  });

  it("requiresApproval returns false for allow", () => {
    loadDefaultMatrix();
    const result = evaluateAction({ action_type: "read_data" });
    if (!isFailure(result)) {
      expect(requiresApproval(result)).toBe(false);
    }
  });

  // ─── Invariants ───────────────────────────────────────────────

  it("INVARIANT: fail_closed is always true in defaults", () => {
    const matrix = loadDefaultMatrix();
    expect(matrix.defaults.fail_closed).toBe(true);
  });

  it("INVARIANT: financial actions always require different approver", () => {
    loadDefaultMatrix();
    const payment = findRule("send_payment");
    const transfer = findRule("transfer_funds");
    expect(payment!.require_different_approver).toBe(true);
    expect(transfer!.require_different_approver).toBe(true);
  });

  it("INVARIANT: financial actions are not learning eligible", () => {
    loadDefaultMatrix();
    const payment = findRule("send_payment");
    const transfer = findRule("transfer_funds");
    expect(payment!.learning_eligible).toBe(false);
    expect(transfer!.learning_eligible).toBe(false);
  });

  it("INVARIANT: every evaluation includes matrix_version and matrix_hash", () => {
    loadDefaultMatrix();
    const result = evaluateAction({ action_type: "send_email" });
    if (!isFailure(result)) {
      expect(result.matrix_version).toBeTruthy();
      expect(result.matrix_hash).toBeTruthy();
    }
  });

  it("INVARIANT: every failure includes fallback_decision = block", () => {
    loadDefaultMatrix();
    const result = evaluateAction({ action_type: "" });
    if (isFailure(result)) {
      expect(result.fallback_decision).toBe("block");
    }
  });
});
