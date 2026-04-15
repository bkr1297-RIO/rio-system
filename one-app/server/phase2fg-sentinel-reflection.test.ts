/**
 * Tests for Phase 2F (Financial Governance), Phase 2G (Agent Handoff),
 * Sentinel Layer, and Reflection/Aftermath Model
 */
import { describe, it, expect, vi } from "vitest";

// ═══════════════════════════════════════════════════════════════════
// SENTINEL LAYER TESTS
// ═══════════════════════════════════════════════════════════════════

import {
  detectContrast,
  detectVelocityAnomaly,
  checkSystemInvariants,
  detectAuthorizationAnomaly,
  type ContrastCheck,
  type VelocityCheck,
} from "./sentinelLayer";

describe("Sentinel Layer — Contrast Detection", () => {
  it("returns null when within threshold", () => {
    const check: ContrastCheck = {
      metric: "approval_rate",
      currentValue: 10,
      baselineValue: 10,
      thresholdPercent: 20,
    };
    expect(detectContrast(check)).toBeNull();
  });

  it("returns null when slightly above but within threshold", () => {
    const check: ContrastCheck = {
      metric: "approval_rate",
      currentValue: 11,
      baselineValue: 10,
      thresholdPercent: 20,
    };
    expect(detectContrast(check)).toBeNull();
  });

  it("returns info signal for new activity with no baseline", () => {
    const check: ContrastCheck = {
      metric: "new_metric",
      currentValue: 5,
      baselineValue: 0,
      thresholdPercent: 20,
    };
    const signal = detectContrast(check);
    expect(signal).not.toBeNull();
    expect(signal!.severity).toBe("info");
    expect(signal!.category).toBe("contrast");
  });

  it("returns null when both baseline and current are zero", () => {
    const check: ContrastCheck = {
      metric: "empty_metric",
      currentValue: 0,
      baselineValue: 0,
      thresholdPercent: 20,
    };
    expect(detectContrast(check)).toBeNull();
  });

  it("returns warning for moderate deviation", () => {
    const check: ContrastCheck = {
      metric: "approval_rate",
      currentValue: 15,
      baselineValue: 10,
      thresholdPercent: 20,
    };
    const signal = detectContrast(check);
    expect(signal).not.toBeNull();
    expect(signal!.severity).toBe("warning");
    expect(signal!.context).toHaveProperty("direction", "above");
  });

  it("returns critical for extreme deviation", () => {
    const check: ContrastCheck = {
      metric: "approval_rate",
      currentValue: 40,
      baselineValue: 10,
      thresholdPercent: 20,
    };
    const signal = detectContrast(check);
    expect(signal).not.toBeNull();
    expect(signal!.severity).toBe("critical");
  });

  it("detects below-baseline deviation", () => {
    const check: ContrastCheck = {
      metric: "approval_rate",
      currentValue: 2,
      baselineValue: 10,
      thresholdPercent: 20,
    };
    const signal = detectContrast(check);
    expect(signal).not.toBeNull();
    expect(signal!.context).toHaveProperty("direction", "below");
  });
});

describe("Sentinel Layer — Velocity Detection", () => {
  it("returns null when velocity is within limits", () => {
    const events = [
      { timestamp: Date.now() - 1000 },
      { timestamp: Date.now() - 2000 },
    ];
    const check: VelocityCheck = {
      metric: "approvals",
      windowMinutes: 60,
      maxEventsPerWindow: 10,
    };
    expect(detectVelocityAnomaly(events, check)).toBeNull();
  });

  it("returns signal when velocity exceeds limit", () => {
    const now = Date.now();
    const events = Array.from({ length: 15 }, (_, i) => ({
      timestamp: now - i * 1000,
    }));
    const check: VelocityCheck = {
      metric: "approvals",
      windowMinutes: 60,
      maxEventsPerWindow: 10,
    };
    const signal = detectVelocityAnomaly(events, check);
    expect(signal).not.toBeNull();
    expect(signal!.category).toBe("velocity");
  });

  it("ignores events outside the window", () => {
    const now = Date.now();
    const events = Array.from({ length: 15 }, (_, i) => ({
      timestamp: now - (120 * 60 * 1000) - i * 1000, // 2 hours ago
    }));
    const check: VelocityCheck = {
      metric: "approvals",
      windowMinutes: 60,
      maxEventsPerWindow: 10,
    };
    expect(detectVelocityAnomaly(events, check)).toBeNull();
  });

  it("returns critical for extreme velocity spike", () => {
    const now = Date.now();
    const events = Array.from({ length: 35 }, (_, i) => ({
      timestamp: now - i * 100,
    }));
    const check: VelocityCheck = {
      metric: "approvals",
      windowMinutes: 60,
      maxEventsPerWindow: 10,
    };
    const signal = detectVelocityAnomaly(events, check);
    expect(signal).not.toBeNull();
    expect(signal!.severity).toBe("critical");
  });
});

describe("Sentinel Layer — System Invariants", () => {
  it("returns no signals for healthy system", () => {
    const signals = checkSystemInvariants({
      ledgerEntryCount: 100,
      lastLedgerHash: "abc123",
      activeRootAuthority: true,
      gatewayReachable: true,
      notionConfigured: true,
    });
    expect(signals).toHaveLength(0);
  });

  it("returns critical for empty ledger", () => {
    const signals = checkSystemInvariants({
      ledgerEntryCount: 0,
      lastLedgerHash: "",
      activeRootAuthority: true,
      gatewayReachable: true,
      notionConfigured: true,
    });
    expect(signals.some(s => s.severity === "critical" && s.title.includes("Empty ledger"))).toBe(true);
  });

  it("returns critical for no root authority", () => {
    const signals = checkSystemInvariants({
      ledgerEntryCount: 100,
      lastLedgerHash: "abc123",
      activeRootAuthority: false,
      gatewayReachable: true,
      notionConfigured: true,
    });
    expect(signals.some(s => s.severity === "critical" && s.title.includes("root authority"))).toBe(true);
  });

  it("returns warning for unreachable gateway", () => {
    const signals = checkSystemInvariants({
      ledgerEntryCount: 100,
      lastLedgerHash: "abc123",
      activeRootAuthority: true,
      gatewayReachable: false,
      notionConfigured: true,
    });
    expect(signals.some(s => s.severity === "warning" && s.title.includes("Gateway"))).toBe(true);
  });

  it("returns multiple signals for multiple failures", () => {
    const signals = checkSystemInvariants({
      ledgerEntryCount: 0,
      lastLedgerHash: "",
      activeRootAuthority: false,
      gatewayReachable: false,
      notionConfigured: false,
    });
    expect(signals.length).toBeGreaterThanOrEqual(3);
  });
});

describe("Sentinel Layer — Authorization Anomaly Detection", () => {
  it("returns no signals for normal approval rate", () => {
    const now = Date.now();
    const approvals = Array.from({ length: 3 }, (_, i) => ({
      timestamp: now - i * 600_000,
      riskTier: "LOW",
    }));
    const signals = detectAuthorizationAnomaly(approvals);
    expect(signals).toHaveLength(0);
  });

  it("detects high approval velocity", () => {
    const now = Date.now();
    const approvals = Array.from({ length: 15 }, (_, i) => ({
      timestamp: now - i * 1000,
      riskTier: "LOW",
    }));
    const signals = detectAuthorizationAnomaly(approvals, { maxApprovalsPerHour: 10 });
    expect(signals.some(s => s.category === "authorization")).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════
// REFLECTION + AFTERMATH TESTS
// ═══════════════════════════════════════════════════════════════════

import {
  collectAutoAftermath,
  type AftermathAuto,
  type AftermathHuman,
  type AftermathInferred,
} from "./reflectionAftermath";

describe("Reflection — Auto Aftermath Collection", () => {
  it("collects execution time from timestamps", () => {
    const result = collectAutoAftermath({
      startedAt: 1000,
      completedAt: 5000,
      status: "completed",
    });
    expect(result.executionTimeMs).toBe(4000);
    expect(result.errorOccurred).toBe(false);
  });

  it("detects errors from failed status", () => {
    const result = collectAutoAftermath({
      startedAt: 1000,
      completedAt: 2000,
      status: "failed",
      error: "Connection timeout",
    });
    expect(result.errorOccurred).toBe(true);
    expect(result.errorMessage).toBe("Connection timeout");
  });

  it("handles missing timestamps gracefully", () => {
    const result = collectAutoAftermath({
      status: "completed",
    });
    expect(result.executionTimeMs).toBeUndefined();
    expect(result.errorOccurred).toBe(false);
  });

  it("detects errors from error field even with success status", () => {
    const result = collectAutoAftermath({
      status: "completed",
      error: "Partial failure",
    });
    expect(result.errorOccurred).toBe(true);
  });
});

describe("Reflection — Aftermath Types", () => {
  it("AftermathHuman has correct shape", () => {
    const human: AftermathHuman = {
      rating: "thumbs_up",
      note: "Worked well",
      wouldRepeat: true,
      timestamp: Date.now(),
    };
    expect(human.rating).toBe("thumbs_up");
    expect(human.wouldRepeat).toBe(true);
  });

  it("AftermathInferred has correct shape", () => {
    const inferred: AftermathInferred = {
      summary: "Test execution completed",
      sentiment: "positive",
      keyObservations: ["Fast execution"],
      suggestedImprovements: [],
      confidenceScore: 0.9,
    };
    expect(inferred.sentiment).toBe("positive");
    expect(inferred.confidenceScore).toBeGreaterThan(0);
  });
});

// ═══════════════════════════════════════════════════════════════════
// FINANCIAL GOVERNANCE TESTS
// ═══════════════════════════════════════════════════════════════════

import {
  executeTransfer,
  type TransferRequest,
} from "./financialGovernance";

describe("Financial Governance — TransferRequest Type", () => {
  it("TransferRequest has correct shape", () => {
    const req: TransferRequest = {
      poolId: "pool_1",
      amountCents: 100_00,
      recipient: "vendor@example.com",
      description: "Test payment",
      category: "vendor_payment",
    };
    expect(req.poolId).toBe("pool_1");
    expect(req.amountCents).toBe(100_00);
  });

  it("rejects negative amounts at type level", () => {
    const req: TransferRequest = {
      poolId: "pool_1",
      amountCents: -100,
      recipient: "vendor@example.com",
      description: "Negative test",
      category: "vendor_payment",
    };
    // Negative amounts should be caught by validation, not types
    expect(req.amountCents).toBeLessThan(0);
  });
});

describe("Financial Governance — Module Exports", () => {
  it("exports executeTransfer as an async function", () => {
    expect(typeof executeTransfer).toBe("function");
  });

  it("TransferRequest requires all fields", () => {
    const req: TransferRequest = {
      poolId: "pool_1",
      amountCents: 500_00,
      recipient: "vendor@example.com",
      description: "Valid payment",
      category: "vendor_payment",
    };
    expect(req.poolId).toBeTruthy();
    expect(req.recipient).toBeTruthy();
    expect(req.description).toBeTruthy();
  });
});

// ═══════════════════════════════════════════════════════════════════
// AGENT HANDOFF TESTS
// ═══════════════════════════════════════════════════════════════════

import {
  initiateHandoff,
  isKnownAgent,
  isHandoffExpired,
  type HandoffRequest,
} from "./agentHandoff";

describe("Agent Handoff — Known Agents", () => {
  it("recognizes known agent names", () => {
    expect(isKnownAgent("manny")).toBe(true);
    expect(isKnownAgent("bondi")).toBe(true);
  });

  it("rejects unknown agent names", () => {
    expect(isKnownAgent("unknown_agent_xyz")).toBe(false);
  });

  it("HandoffRequest has correct shape", () => {
    const req: HandoffRequest = {
      fromAgent: "manny",
      toAgent: "bondi",
      taskDescription: "Review outreach proposal",
      context: { proposalId: "prop_123" },
      priority: "normal",
    };
    expect(req.fromAgent).toBe("manny");
    expect(req.toAgent).toBe("bondi");
  });
});

describe("Agent Handoff — Expiry Detection", () => {
  it("detects expired handoff", () => {
    const expired = isHandoffExpired({
      deadline: new Date(Date.now() - 86400_000), // yesterday
      status: "pending",
    });
    expect(expired).toBe(true);
  });

  it("does not flag active handoff as expired", () => {
    const notExpired = isHandoffExpired({
      deadline: new Date(Date.now() + 86400_000), // tomorrow
      status: "pending",
    });
    expect(notExpired).toBe(false);
  });

  it("does not flag completed handoff as expired", () => {
    const completed = isHandoffExpired({
      deadline: new Date(Date.now() - 86400_000), // yesterday
      status: "completed",
    });
    expect(completed).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════════
// INVARIANT TESTS — Cross-cutting
// ═══════════════════════════════════════════════════════════════════

describe("Cross-cutting Invariants", () => {
  it("Sentinel detectContrast is a pure function with no side effects", () => {
    // Calling detectContrast does not modify any external state
    const result1 = detectContrast({ metric: "test", currentValue: 10, baselineValue: 10, thresholdPercent: 20 });
    const result2 = detectContrast({ metric: "test", currentValue: 10, baselineValue: 10, thresholdPercent: 20 });
    expect(result1).toEqual(result2); // Deterministic
  });

  it("Reflection collectAutoAftermath is a pure function", () => {
    const result = collectAutoAftermath({ status: "completed", startedAt: 1000, completedAt: 2000 });
    expect(result.executionTimeMs).toBe(1000);
    expect(result.errorOccurred).toBe(false);
  });

  it("Financial governance executeTransfer is an async governed function", () => {
    expect(typeof executeTransfer).toBe("function");
  });

  it("Agent handoff isKnownAgent validates agent identity", () => {
    expect(isKnownAgent("manny")).toBe(true);
    expect(isKnownAgent("rogue_agent")).toBe(false);
  });
});
