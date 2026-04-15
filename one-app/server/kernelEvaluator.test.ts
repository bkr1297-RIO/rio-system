/**
 * Kernel Evaluator Tests — Builder Contract v1
 *
 * Tests the 10 required scenarios:
 * 1. trust=0 → REQUIRE_HUMAN
 * 2. trust=1, LOW risk → AUTO_APPROVE
 * 3. trust=1, MEDIUM risk → REQUIRE_HUMAN
 * 4. trust=2, MEDIUM risk → AUTO_APPROVE
 * 5. HIGH risk (any trust) → REQUIRE_HUMAN
 * 6. anomaly=WARN → REQUIRE_HUMAN
 * 7. anomaly=CRITICAL → DENY
 * 8. no policy match → REQUIRE_HUMAN
 * 9. constraints violated → REQUIRE_HUMAN
 * 10. LOW risk, trust=2, no anomalies → AUTO_APPROVE
 *
 * Plus: variance calculation, kernel never executes, decision object structure
 */

import { describe, it, expect, vi } from "vitest";

// Mock the mailbox module (we test kernel logic, not DB writes)
vi.mock("./mailbox", () => ({
  appendToMailbox: vi.fn(async (input: any) => ({
    id: 1,
    packetId: input.packetId || "pkt_test",
    mailboxType: input.mailboxType,
    packetType: input.packetType,
    sourceAgent: input.sourceAgent,
    targetAgent: input.targetAgent || null,
    status: input.status || "pending",
    payload: input.payload,
    traceId: input.traceId,
    parentPacketId: input.parentPacketId || null,
    createdAt: new Date(),
    processedAt: null,
  })),
  readMailbox: vi.fn(async () => []),
  getByTraceId: vi.fn(async () => []),
  generatePacketId: vi.fn(() => "pkt_test_123"),
}));

vi.mock("./db", () => ({
  getDb: vi.fn(() => null),
}));

import {
  evaluateProposal,
  calculateVariance,
  calculateMetricVariance,
  type ProposalPayload,
  type TrustPolicyRecord,
  type SentinelAnomalyRecord,
  type BaselinePattern,
  type KernelEvaluationContext,
} from "./kernelEvaluator";

// ─────────────────────────────────────────────────────────────────
// Test Fixtures
// ─────────────────────────────────────────────────────────────────

function makeProposal(overrides?: Partial<ProposalPayload>): ProposalPayload {
  return {
    id: "proposal_test_001",
    type: "outreach",
    category: "partnership_inquiry",
    risk_tier: "LOW",
    baseline_pattern: {
      approval_rate_14d: 0.82,
      avg_velocity_seconds: 420,
      edit_rate: 0.12,
    },
    proposal: {
      subject: "Partnership opportunity",
      body: "Hi, we'd like to explore...",
      draft_email: "[full draft]",
    },
    why_it_matters: "Target is in our market",
    reasoning: "Pattern match with similar outreach",
    timestamp: new Date().toISOString(),
    ...overrides,
  };
}

function makePolicy(overrides?: Partial<TrustPolicyRecord>): TrustPolicyRecord {
  return {
    category: "partnership_inquiry",
    riskTier: "LOW",
    trustLevel: 0,
    active: true,
    ...overrides,
  };
}

function makeAnomaly(overrides?: Partial<SentinelAnomalyRecord>): SentinelAnomalyRecord {
  return {
    severity: "WARN",
    metric_type: "velocity_variance",
    baseline: 420,
    observed: 28700,
    delta: 28280,
    confidence: 0.95,
    ...overrides,
  };
}

function makeBaseline(overrides?: Partial<BaselinePattern>): BaselinePattern {
  return {
    approval_rate_14d: 0.82,
    recent_velocity_seconds: 420,
    edit_rate: 0.12,
    ...overrides,
  };
}

function makeContext(overrides?: Partial<KernelEvaluationContext>): KernelEvaluationContext {
  return {
    proposal: makeProposal(),
    trustPolicy: makePolicy(),
    activeAnomalies: [],
    baseline: makeBaseline(),
    ...overrides,
  };
}

// ─────────────────────────────────────────────────────────────────
// 10 Required Scenarios
// ─────────────────────────────────────────────────────────────────

describe("Kernel Evaluator — 10 Required Scenarios", () => {
  it("Scenario 1: trust=0 → REQUIRE_HUMAN (propose only)", () => {
    const result = evaluateProposal(makeContext({
      trustPolicy: makePolicy({ trustLevel: 0 }),
    }));
    expect(result.proposed_decision).toBe("REQUIRE_HUMAN");
    expect(result.reasoning.trust_level_applied).toBe(0);
  });

  it("Scenario 2: trust=1, LOW risk → AUTO_APPROVE", () => {
    const result = evaluateProposal(makeContext({
      proposal: makeProposal({ risk_tier: "LOW" }),
      trustPolicy: makePolicy({ trustLevel: 1, riskTier: "LOW" }),
    }));
    expect(result.proposed_decision).toBe("AUTO_APPROVE");
    expect(result.reasoning.trust_level_applied).toBe(1);
  });

  it("Scenario 3: trust=1, MEDIUM risk → REQUIRE_HUMAN", () => {
    const result = evaluateProposal(makeContext({
      proposal: makeProposal({ risk_tier: "MEDIUM" }),
      trustPolicy: makePolicy({ trustLevel: 1, riskTier: "MEDIUM" }),
    }));
    expect(result.proposed_decision).toBe("REQUIRE_HUMAN");
    expect(result.reasoning.trust_level_applied).toBe(1);
  });

  it("Scenario 4: trust=2, MEDIUM risk → AUTO_APPROVE", () => {
    const result = evaluateProposal(makeContext({
      proposal: makeProposal({ risk_tier: "MEDIUM" }),
      trustPolicy: makePolicy({ trustLevel: 2, riskTier: "MEDIUM" }),
    }));
    expect(result.proposed_decision).toBe("AUTO_APPROVE");
    expect(result.reasoning.trust_level_applied).toBe(2);
  });

  it("Scenario 5: HIGH risk (any trust) → REQUIRE_HUMAN", () => {
    // Even trust=2 should require human for HIGH risk
    const result = evaluateProposal(makeContext({
      proposal: makeProposal({ risk_tier: "HIGH" }),
      trustPolicy: makePolicy({ trustLevel: 2, riskTier: "HIGH" }),
    }));
    expect(result.proposed_decision).toBe("REQUIRE_HUMAN");
  });

  it("Scenario 6: anomaly=WARN → REQUIRE_HUMAN", () => {
    const result = evaluateProposal(makeContext({
      proposal: makeProposal({ risk_tier: "LOW" }),
      trustPolicy: makePolicy({ trustLevel: 2, riskTier: "LOW" }),
      activeAnomalies: [makeAnomaly({ severity: "WARN" })],
    }));
    expect(result.proposed_decision).toBe("REQUIRE_HUMAN");
    expect(result.reasoning.anomaly_flag).toBe(true);
    expect(result.reasoning.anomaly_type).toBe("contrast");
  });

  it("Scenario 7: anomaly=CRITICAL → DENY", () => {
    const result = evaluateProposal(makeContext({
      proposal: makeProposal({ risk_tier: "LOW" }),
      trustPolicy: makePolicy({ trustLevel: 2, riskTier: "LOW" }),
      activeAnomalies: [makeAnomaly({ severity: "CRITICAL" })],
    }));
    expect(result.proposed_decision).toBe("DENY");
    expect(result.reasoning.anomaly_flag).toBe(true);
    expect(result.reasoning.anomaly_type).toBe("critical");
  });

  it("Scenario 8: no policy match → REQUIRE_HUMAN", () => {
    const result = evaluateProposal(makeContext({
      trustPolicy: null,
    }));
    expect(result.proposed_decision).toBe("REQUIRE_HUMAN");
    expect(result.reasoning.policy_match).toBe(false);
    expect(result.reasoning.policy_name).toBeNull();
  });

  it("Scenario 9: constraints violated → REQUIRE_HUMAN", () => {
    const result = evaluateProposal(makeContext({
      proposal: makeProposal({
        risk_tier: "LOW",
        proposal: { amount: 10000, subject: "Big purchase" },
      }),
      trustPolicy: makePolicy({
        trustLevel: 2,
        riskTier: "LOW",
        conditions: { max_amount: 5000 },
      }),
    }));
    expect(result.proposed_decision).toBe("REQUIRE_HUMAN");
    expect(result.reasoning.constraints_ok).toBe(false);
  });

  it("Scenario 10: LOW risk, trust=2, no anomalies → AUTO_APPROVE", () => {
    const result = evaluateProposal(makeContext({
      proposal: makeProposal({ risk_tier: "LOW" }),
      trustPolicy: makePolicy({ trustLevel: 2, riskTier: "LOW" }),
      activeAnomalies: [],
    }));
    expect(result.proposed_decision).toBe("AUTO_APPROVE");
    expect(result.reasoning.policy_match).toBe(true);
    expect(result.reasoning.anomaly_flag).toBe(false);
    expect(result.reasoning.constraints_ok).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────
// Decision Object Structure
// ─────────────────────────────────────────────────────────────────

describe("Kernel Evaluator — Decision Object Structure", () => {
  it("produces a complete kernel_decision_object", () => {
    const result = evaluateProposal(makeContext());

    // Required fields from Builder Contract
    expect(result.decision_id).toBeDefined();
    expect(result.decision_id).toMatch(/^decision_/);
    expect(result.packet_id).toBe("proposal_test_001");
    expect(result.proposed_decision).toBeDefined();
    expect(["AUTO_APPROVE", "REQUIRE_HUMAN", "DENY"]).toContain(result.proposed_decision);

    // Reasoning object
    expect(result.reasoning).toBeDefined();
    expect(typeof result.reasoning.policy_match).toBe("boolean");
    expect(typeof result.reasoning.trust_level_ok).toBe("boolean");
    expect(typeof result.reasoning.trust_level_applied).toBe("number");
    expect(typeof result.reasoning.constraints_ok).toBe("boolean");
    expect(typeof result.reasoning.anomaly_flag).toBe("boolean");

    // Baseline pattern
    expect(result.baseline_pattern).toBeDefined();
    expect(result.baseline_pattern?.approval_rate_14d).toBe(0.82);
    expect(result.baseline_pattern?.recent_velocity_seconds).toBe(420);
    expect(result.baseline_pattern?.edit_rate).toBe(0.12);

    // Confidence
    expect(result.confidence).toBeGreaterThanOrEqual(0);
    expect(result.confidence).toBeLessThanOrEqual(1);

    // Timestamp
    expect(result.timestamp).toBeDefined();
    expect(new Date(result.timestamp).getTime()).toBeGreaterThan(0);

    // Trace ID
    expect(result.trace_id).toBeDefined();
  });

  it("includes observed_state when provided", () => {
    const result = evaluateProposal(makeContext({
      observedState: {
        approval_rate_delta: 0,
        velocity_delta_seconds: 28280,
        edit_rate_delta: 0,
      },
    }));

    expect(result.observed_state).toBeDefined();
    expect(result.observed_state?.velocity_delta_seconds).toBe(28280);
  });

  it("observed_state is null when not provided", () => {
    const result = evaluateProposal(makeContext());
    expect(result.observed_state).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────
// Confidence Scoring
// ─────────────────────────────────────────────────────────────────

describe("Kernel Evaluator — Confidence Scoring", () => {
  it("confidence = 1.0 when no anomalies", () => {
    const result = evaluateProposal(makeContext({ activeAnomalies: [] }));
    expect(result.confidence).toBe(1.0);
  });

  it("confidence = 0.95 when WARN anomaly present", () => {
    const result = evaluateProposal(makeContext({
      activeAnomalies: [makeAnomaly({ severity: "WARN" })],
    }));
    expect(result.confidence).toBe(0.95);
  });

  it("confidence = 0.99 when CRITICAL anomaly present", () => {
    const result = evaluateProposal(makeContext({
      activeAnomalies: [makeAnomaly({ severity: "CRITICAL" })],
    }));
    expect(result.confidence).toBe(0.99);
  });

  it("confidence = 0.90 when INFO anomaly present", () => {
    const result = evaluateProposal(makeContext({
      activeAnomalies: [makeAnomaly({ severity: "INFO" })],
    }));
    expect(result.confidence).toBe(0.90);
  });
});

// ─────────────────────────────────────────────────────────────────
// Kernel Invariants
// ─────────────────────────────────────────────────────────────────

describe("Kernel Evaluator — Invariants", () => {
  it("kernel NEVER returns EXECUTED (only proposes, never executes)", () => {
    // Test all possible contexts — none should produce "EXECUTED"
    const contexts = [
      makeContext({ trustPolicy: makePolicy({ trustLevel: 0 }) }),
      makeContext({ trustPolicy: makePolicy({ trustLevel: 1 }) }),
      makeContext({ trustPolicy: makePolicy({ trustLevel: 2 }) }),
      makeContext({ trustPolicy: null }),
      makeContext({ activeAnomalies: [makeAnomaly({ severity: "CRITICAL" })] }),
      makeContext({ proposal: makeProposal({ risk_tier: "HIGH" }) }),
    ];

    for (const ctx of contexts) {
      const result = evaluateProposal(ctx);
      expect(result.proposed_decision).not.toBe("EXECUTED");
      expect(result.proposed_decision).not.toBe("BLOCKED");
      expect(["AUTO_APPROVE", "REQUIRE_HUMAN", "DENY"]).toContain(result.proposed_decision);
    }
  });

  it("kernel always produces a decision_id", () => {
    const result = evaluateProposal(makeContext());
    expect(result.decision_id).toBeDefined();
    expect(result.decision_id.length).toBeGreaterThan(0);
  });

  it("kernel always includes reasoning", () => {
    const result = evaluateProposal(makeContext());
    expect(result.reasoning).toBeDefined();
    expect(Object.keys(result.reasoning).length).toBeGreaterThan(0);
  });

  it("inactive policy is treated as no policy", () => {
    const result = evaluateProposal(makeContext({
      trustPolicy: makePolicy({ active: false, trustLevel: 2 }),
    }));
    expect(result.proposed_decision).toBe("REQUIRE_HUMAN");
    expect(result.reasoning.policy_match).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────
// Variance Calculation
// ─────────────────────────────────────────────────────────────────

describe("Kernel Evaluator — Variance Calculation", () => {
  it("calculates correct variance for velocity", () => {
    const result = calculateVariance(420, 28700);
    expect(result.delta).toBe(28280);
    expect(result.ratio).toBeCloseTo(67.33, 1);
    expect(result.severity).toBe("CRITICAL");
  });

  it("calculates correct variance for small change", () => {
    const result = calculateVariance(420, 430);
    expect(result.delta).toBe(10);
    expect(result.ratio).toBeCloseTo(0.0238, 3);
    expect(result.severity).toBeNull(); // Below INFO threshold
  });

  it("handles zero baseline", () => {
    const result = calculateVariance(0, 100);
    expect(result.delta).toBe(100);
    expect(result.ratio).toBe(Infinity);
    expect(result.severity).toBeNull();
  });

  it("handles zero observed", () => {
    const result = calculateVariance(0, 0);
    expect(result.delta).toBe(0);
    expect(result.ratio).toBe(0);
    expect(result.severity).toBeNull();
  });

  it("uses metric-specific thresholds", () => {
    // approval_rate_variance has lower thresholds (0.05/0.10/0.20)
    const result = calculateMetricVariance("approval_rate_variance", 0.82, 0.72);
    expect(result.delta).toBeCloseTo(0.10, 2);
    expect(result.ratio).toBeCloseTo(0.122, 2);
    expect(result.severity).toBe("WARN"); // 0.122 > 0.10 (WARN threshold)
  });

  it("pattern_shift uses higher thresholds", () => {
    // pattern_shift thresholds are 0.50/0.70/0.90
    const result = calculateMetricVariance("pattern_shift", 1.0, 1.6);
    expect(result.ratio).toBeCloseTo(0.6, 1);
    expect(result.severity).toBe("INFO"); // 0.6 > 0.50 (INFO) but < 0.70 (WARN)
  });
});

// ─────────────────────────────────────────────────────────────────
// Edge Cases
// ─────────────────────────────────────────────────────────────────

describe("Kernel Evaluator — Edge Cases", () => {
  it("handles proposal with no baseline_pattern", () => {
    const result = evaluateProposal(makeContext({
      proposal: makeProposal({ baseline_pattern: undefined }),
      baseline: null,
    }));
    expect(result.proposed_decision).toBeDefined();
    expect(result.baseline_pattern).toBeNull();
  });

  it("handles multiple anomalies (worst severity wins)", () => {
    const result = evaluateProposal(makeContext({
      activeAnomalies: [
        makeAnomaly({ severity: "INFO" }),
        makeAnomaly({ severity: "WARN" }),
        makeAnomaly({ severity: "CRITICAL" }),
      ],
    }));
    expect(result.proposed_decision).toBe("DENY"); // CRITICAL wins
    expect(result.reasoning.anomaly_type).toBe("critical");
  });

  it("handles allowed_targets constraint check", () => {
    const result = evaluateProposal(makeContext({
      proposal: makeProposal({
        risk_tier: "LOW",
        proposal: { target: "sarah@acme.com", subject: "Test" },
      }),
      trustPolicy: makePolicy({
        trustLevel: 2,
        riskTier: "LOW",
        conditions: { allowed_targets: ["@acme.com", "@partner.io"] },
      }),
    }));
    expect(result.proposed_decision).toBe("AUTO_APPROVE");
    expect(result.reasoning.constraints_ok).toBe(true);
  });

  it("blocks when target not in allowed list", () => {
    const result = evaluateProposal(makeContext({
      proposal: makeProposal({
        risk_tier: "LOW",
        proposal: { target: "hacker@evil.com", subject: "Test" },
      }),
      trustPolicy: makePolicy({
        trustLevel: 2,
        riskTier: "LOW",
        conditions: { allowed_targets: ["@acme.com", "@partner.io"] },
      }),
    }));
    expect(result.proposed_decision).toBe("REQUIRE_HUMAN");
    expect(result.reasoning.constraints_ok).toBe(false);
  });
});
