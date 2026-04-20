/**
 * Learning Engine — MVP Tests
 * 
 * Tests the minimum learning loop:
 * 1. Action signature computation
 * 2. Risk score adjustment (APPROVED lowers, REJECTED raises)
 * 3. Advisory-only constraints (never bypasses approval)
 * 4. Learning summary/trend computation
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  computeActionSignature,
  getAdvisoryRiskScore,
  getLearningSummary,
} from "./learningEngine";

// ─── Mock DB layer ───────────────────────────────────────────────

const mockLearningEvents: Array<{
  eventId: string;
  actionSignature: string;
  riskScore: number | null;
  decision: string | null;
}> = [];

vi.mock("./db", () => ({
  insertLearningEvent: vi.fn(async (event: {
    actionSignature: string;
    riskScore: number;
    decision: string;
  }) => {
    const eventId = `LE-TEST-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    mockLearningEvents.push({
      eventId,
      actionSignature: event.actionSignature,
      riskScore: event.riskScore,
      decision: event.decision,
    });
    return eventId;
  }),
  getLearningStats: vi.fn(async (actionSignature: string) => {
    const events = mockLearningEvents.filter(e => e.actionSignature === actionSignature);
    if (events.length === 0) {
      return { totalEvents: 0, approvedCount: 0, rejectedCount: 0, blockedCount: 0, avgRiskScore: 50 };
    }
    const approvedCount = events.filter(e => e.decision === "APPROVED").length;
    const rejectedCount = events.filter(e => e.decision === "REJECTED").length;
    const blockedCount = events.filter(e => e.decision === "BLOCKED").length;
    const riskScores = events.filter(e => e.riskScore != null).map(e => e.riskScore!);
    const avgRiskScore = riskScores.length > 0
      ? Math.round(riskScores.reduce((a, b) => a + b, 0) / riskScores.length)
      : 50;
    return { totalEvents: events.length, approvedCount, rejectedCount, blockedCount, avgRiskScore };
  }),
}));

beforeEach(() => {
  mockLearningEvents.length = 0;
});

// ─── Action Signature Tests ──────────────────────────────────────

describe("computeActionSignature", () => {
  it("produces a deterministic 32-char hex hash", () => {
    const sig1 = computeActionSignature("send_email", "test@example.com");
    const sig2 = computeActionSignature("send_email", "test@example.com");
    expect(sig1).toBe(sig2);
    expect(sig1).toHaveLength(32);
    expect(sig1).toMatch(/^[0-9a-f]{32}$/);
  });

  it("produces different hashes for different action types", () => {
    const sig1 = computeActionSignature("send_email", "test@example.com");
    const sig2 = computeActionSignature("send_sms", "test@example.com");
    expect(sig1).not.toBe(sig2);
  });

  it("produces different hashes for different targets", () => {
    const sig1 = computeActionSignature("send_email", "alice@example.com");
    const sig2 = computeActionSignature("send_email", "bob@example.com");
    expect(sig1).not.toBe(sig2);
  });

  it("is case-insensitive", () => {
    const sig1 = computeActionSignature("SEND_EMAIL", "Test@Example.com");
    const sig2 = computeActionSignature("send_email", "test@example.com");
    expect(sig1).toBe(sig2);
  });
});

// ─── Risk Score Tests ────────────────────────────────────────────

describe("getAdvisoryRiskScore", () => {
  it("returns 50 (neutral) for unknown action signatures", async () => {
    const score = await getAdvisoryRiskScore("nonexistent-signature");
    expect(score).toBe(50);
  });

  it("lowers risk after approvals", async () => {
    const sig = computeActionSignature("send_email", "trusted@example.com");
    
    // Simulate 5 approvals
    for (let i = 0; i < 5; i++) {
      mockLearningEvents.push({
        eventId: `LE-${i}`,
        actionSignature: sig,
        riskScore: 50,
        decision: "APPROVED",
      });
    }

    const score = await getAdvisoryRiskScore(sig);
    // 50 + (5 * -3) = 35
    expect(score).toBe(35);
  });

  it("raises risk after rejections", async () => {
    const sig = computeActionSignature("send_email", "risky@example.com");
    
    // Simulate 3 rejections
    for (let i = 0; i < 3; i++) {
      mockLearningEvents.push({
        eventId: `LE-${i}`,
        actionSignature: sig,
        riskScore: 50,
        decision: "REJECTED",
      });
    }

    const score = await getAdvisoryRiskScore(sig);
    // 50 + (3 * 5) = 65
    expect(score).toBe(65);
  });

  it("raises risk significantly after blocks", async () => {
    const sig = computeActionSignature("send_email", "blocked@example.com");
    
    // Simulate 2 blocks
    for (let i = 0; i < 2; i++) {
      mockLearningEvents.push({
        eventId: `LE-${i}`,
        actionSignature: sig,
        riskScore: 50,
        decision: "BLOCKED",
      });
    }

    const score = await getAdvisoryRiskScore(sig);
    // 50 + (2 * 10) = 70
    expect(score).toBe(70);
  });

  it("handles mixed decisions correctly", async () => {
    const sig = computeActionSignature("send_email", "mixed@example.com");
    
    // 3 approvals + 1 rejection
    for (let i = 0; i < 3; i++) {
      mockLearningEvents.push({ eventId: `LE-A${i}`, actionSignature: sig, riskScore: 50, decision: "APPROVED" });
    }
    mockLearningEvents.push({ eventId: `LE-R0`, actionSignature: sig, riskScore: 50, decision: "REJECTED" });

    const score = await getAdvisoryRiskScore(sig);
    // 50 + (3 * -3) + (1 * 5) = 50 - 9 + 5 = 46
    expect(score).toBe(46);
  });

  it("never goes below MIN_RISK (10)", async () => {
    const sig = computeActionSignature("send_email", "super-trusted@example.com");
    
    // 20 approvals → 50 + (20 * -3) = -10, clamped to 10
    for (let i = 0; i < 20; i++) {
      mockLearningEvents.push({ eventId: `LE-${i}`, actionSignature: sig, riskScore: 50, decision: "APPROVED" });
    }

    const score = await getAdvisoryRiskScore(sig);
    expect(score).toBe(10);
  });

  it("never goes above MAX_RISK (90)", async () => {
    const sig = computeActionSignature("send_email", "super-risky@example.com");
    
    // 10 rejections → 50 + (10 * 5) = 100, clamped to 90
    for (let i = 0; i < 10; i++) {
      mockLearningEvents.push({ eventId: `LE-${i}`, actionSignature: sig, riskScore: 50, decision: "REJECTED" });
    }

    const score = await getAdvisoryRiskScore(sig);
    expect(score).toBe(90);
  });
});

// ─── Learning Summary Tests ──────────────────────────────────────

describe("getLearningSummary", () => {
  it("returns NEUTRAL trend for unknown actions", async () => {
    const summary = await getLearningSummary("unknown_action", "unknown@example.com");
    expect(summary.trend).toBe("NEUTRAL");
    expect(summary.totalEvents).toBe(0);
    expect(summary.advisoryRiskScore).toBe(50);
  });

  it("returns TRUSTED trend for heavily approved actions", async () => {
    const sig = computeActionSignature("send_email", "trusted@example.com");
    
    // 6 approvals → risk = 50 + (6 * -3) = 32 → TRUSTED (< 35)
    for (let i = 0; i < 6; i++) {
      mockLearningEvents.push({ eventId: `LE-${i}`, actionSignature: sig, riskScore: 50, decision: "APPROVED" });
    }

    const summary = await getLearningSummary("send_email", "trusted@example.com");
    expect(summary.trend).toBe("TRUSTED");
    expect(summary.approvedCount).toBe(6);
    expect(summary.advisoryRiskScore).toBeLessThan(35);
  });

  it("returns RISKY trend for heavily rejected actions", async () => {
    const sig = computeActionSignature("send_email", "risky@example.com");
    
    // 4 rejections → risk = 50 + (4 * 5) = 70 → RISKY (> 65)
    for (let i = 0; i < 4; i++) {
      mockLearningEvents.push({ eventId: `LE-${i}`, actionSignature: sig, riskScore: 50, decision: "REJECTED" });
    }

    const summary = await getLearningSummary("send_email", "risky@example.com");
    expect(summary.trend).toBe("RISKY");
    expect(summary.rejectedCount).toBe(4);
    expect(summary.advisoryRiskScore).toBeGreaterThan(65);
  });
});

// ─── Constraint Tests ────────────────────────────────────────────

describe("learning constraints", () => {
  it("risk score is advisory only — bounded between 10 and 90", async () => {
    // Even with extreme history, score never reaches 0 or 100
    const sigTrusted = computeActionSignature("send_email", "most-trusted@example.com");
    const sigRisky = computeActionSignature("send_email", "most-risky@example.com");
    
    for (let i = 0; i < 100; i++) {
      mockLearningEvents.push({ eventId: `LE-T${i}`, actionSignature: sigTrusted, riskScore: 50, decision: "APPROVED" });
      mockLearningEvents.push({ eventId: `LE-R${i}`, actionSignature: sigRisky, riskScore: 50, decision: "REJECTED" });
    }

    const trustedScore = await getAdvisoryRiskScore(sigTrusted);
    const riskyScore = await getAdvisoryRiskScore(sigRisky);

    // Never fully trusted (min 10) — human always decides
    expect(trustedScore).toBeGreaterThanOrEqual(10);
    // Never fully blocked (max 90) — human always decides
    expect(riskyScore).toBeLessThanOrEqual(90);
  });

  it("learning does not produce auto-approve or auto-reject signals", async () => {
    // The learning engine only produces scores and trends
    // It has no method to approve, reject, or execute actions
    const summary = await getLearningSummary("send_email", "any@example.com");
    
    // Verify the return type only contains advisory fields
    expect(summary).toHaveProperty("advisoryRiskScore");
    expect(summary).toHaveProperty("trend");
    expect(summary).not.toHaveProperty("autoApprove");
    expect(summary).not.toHaveProperty("autoReject");
    expect(summary).not.toHaveProperty("execute");
    expect(summary).not.toHaveProperty("bypass");
  });
});
