/**
 * Sentinel Mailbox Integration Tests — Builder Contract v1
 *
 * Tests:
 * 1. Observation evaluation: severity classification against thresholds
 * 2. Mailbox integration: events written to sentinel_mailbox
 * 3. Notion surfacing: severity >= WARN flagged for Notion
 * 4. Threshold change proposals: routed through normal approval flow
 * 5. Invariants: sentinel never executes, thresholds governed
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Mocks ────────────────────────────────────────────────────────

vi.mock("./db", () => ({
  getDb: vi.fn(() => null), // DB unavailable → uses defaults
}));

const mockAppendToMailbox = vi.fn(async (input: any) => ({
  id: Math.floor(Math.random() * 10000),
  packetId: `pkt_test_${Date.now()}`,
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
}));

vi.mock("./mailbox", () => ({
  appendToMailbox: (...args: any[]) => mockAppendToMailbox(...args),
  generateTraceId: vi.fn(() => `trace_test_${Date.now()}`),
}));

import {
  evaluateObservation,
  recordSentinelEvent,
  proposeThresholdChange,
  getThresholds,
  type SentinelEvaluation,
} from "./sentinelMailbox";
import { DEFAULT_SENTINEL_THRESHOLDS } from "../drizzle/schema";

// ─── Test Suites ──────────────────────────────────────────────────

describe("Sentinel Mailbox — Observation Evaluation", () => {
  const thresholds = DEFAULT_SENTINEL_THRESHOLDS.approval_rate_variance;

  it("classifies INFO when delta is below INFO threshold", () => {
    const result = evaluateObservation(
      { metricType: "approval_rate_variance", baseline: 0.85, observed: 0.84 },
      thresholds
    );
    expect(result.severity).toBe("INFO");
    expect(result.surfaceToNotion).toBe(false);
  });

  it("classifies INFO when delta equals INFO threshold", () => {
    // INFO=0.05, baseline=1.0, observed=0.95 → delta=0.05
    const result = evaluateObservation(
      { metricType: "approval_rate_variance", baseline: 1.0, observed: 0.95 },
      thresholds
    );
    expect(result.severity).toBe("INFO");
    expect(result.surfaceToNotion).toBe(false);
  });

  it("classifies WARN when delta exceeds WARN threshold", () => {
    // WARN=0.10, baseline=1.0, observed=0.85 → delta=0.15
    const result = evaluateObservation(
      { metricType: "approval_rate_variance", baseline: 1.0, observed: 0.85 },
      thresholds
    );
    expect(result.severity).toBe("WARN");
    expect(result.surfaceToNotion).toBe(true);
  });

  it("classifies CRITICAL when delta exceeds CRITICAL threshold", () => {
    // CRITICAL=0.20, baseline=1.0, observed=0.70 → delta=0.30
    const result = evaluateObservation(
      { metricType: "approval_rate_variance", baseline: 1.0, observed: 0.70 },
      thresholds
    );
    expect(result.severity).toBe("CRITICAL");
    expect(result.surfaceToNotion).toBe(true);
  });

  it("handles zero baseline gracefully", () => {
    const result = evaluateObservation(
      { metricType: "approval_rate_variance", baseline: 0, observed: 0.5 },
      thresholds
    );
    expect(result.severity).toBe("CRITICAL");
    expect(result.delta).toBe(1.0);
  });

  it("handles both zero baseline and observed", () => {
    const result = evaluateObservation(
      { metricType: "approval_rate_variance", baseline: 0, observed: 0 },
      thresholds
    );
    expect(result.delta).toBe(0);
    expect(result.severity).toBe("INFO");
  });

  it("includes correct thresholds in evaluation", () => {
    const custom = { INFO: 0.01, WARN: 0.05, CRITICAL: 0.10 };
    const result = evaluateObservation(
      { metricType: "approval_rate_variance", baseline: 1.0, observed: 0.93 },
      custom
    );
    expect(result.thresholds).toEqual(custom);
  });

  it("calculates confidence based on delta vs threshold", () => {
    const result = evaluateObservation(
      { metricType: "approval_rate_variance", baseline: 1.0, observed: 0.70 },
      thresholds
    );
    expect(result.confidence).toBeGreaterThan(0);
    expect(result.confidence).toBeLessThanOrEqual(1.0);
  });
});

describe("Sentinel Mailbox — All Metric Types", () => {
  it("evaluates velocity_variance correctly", () => {
    const thresholds = DEFAULT_SENTINEL_THRESHOLDS.velocity_variance;
    // baseline=300, observed=450 → delta=150/300=0.50 → CRITICAL
    const result = evaluateObservation(
      { metricType: "velocity_variance", baseline: 300, observed: 450 },
      thresholds
    );
    expect(result.severity).toBe("CRITICAL");
    expect(result.surfaceToNotion).toBe(true);
  });

  it("evaluates edit_rate_variance correctly", () => {
    const thresholds = DEFAULT_SENTINEL_THRESHOLDS.edit_rate_variance;
    // baseline=1.0, observed=1.25 → delta=0.25/1.0=0.25 → WARN (>0.20)
    const result = evaluateObservation(
      { metricType: "edit_rate_variance", baseline: 1.0, observed: 1.25 },
      thresholds
    );
    expect(result.severity).toBe("WARN");
  });

  it("evaluates pattern_shift correctly", () => {
    const thresholds = DEFAULT_SENTINEL_THRESHOLDS.pattern_shift;
    // baseline=1.0, observed=0.05 → delta=0.95 → CRITICAL (>0.90)
    const result = evaluateObservation(
      { metricType: "pattern_shift", baseline: 1.0, observed: 0.05 },
      thresholds
    );
    expect(result.severity).toBe("CRITICAL");
  });
});

describe("Sentinel Mailbox — Event Recording", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("writes sentinel event to sentinel_mailbox", async () => {
    const evaluation: SentinelEvaluation = {
      metricType: "approval_rate_variance",
      severity: "WARN",
      baseline: 0.85,
      observed: 0.70,
      delta: 0.176,
      confidence: 0.95,
      thresholds: DEFAULT_SENTINEL_THRESHOLDS.approval_rate_variance,
      surfaceToNotion: true,
    };

    await recordSentinelEvent(evaluation);

    expect(mockAppendToMailbox).toHaveBeenCalledOnce();
    const call = mockAppendToMailbox.mock.calls[0][0];
    expect(call.mailboxType).toBe("sentinel");
    expect(call.packetType).toBe("sentinel_event");
    expect(call.sourceAgent).toBe("sentinel");
    expect(call.payload.severity).toBe("WARN");
    expect(call.payload.surface_to_notion).toBe(true);
  });

  it("CRITICAL events get 'routed' status for immediate attention", async () => {
    const evaluation: SentinelEvaluation = {
      metricType: "approval_rate_variance",
      severity: "CRITICAL",
      baseline: 0.85,
      observed: 0.30,
      delta: 0.647,
      confidence: 0.99,
      thresholds: DEFAULT_SENTINEL_THRESHOLDS.approval_rate_variance,
      surfaceToNotion: true,
    };

    await recordSentinelEvent(evaluation);

    const call = mockAppendToMailbox.mock.calls[0][0];
    expect(call.status).toBe("routed");
  });

  it("INFO events get 'pending' status", async () => {
    const evaluation: SentinelEvaluation = {
      metricType: "approval_rate_variance",
      severity: "INFO",
      baseline: 0.85,
      observed: 0.83,
      delta: 0.023,
      confidence: 0.46,
      thresholds: DEFAULT_SENTINEL_THRESHOLDS.approval_rate_variance,
      surfaceToNotion: false,
    };

    await recordSentinelEvent(evaluation);

    const call = mockAppendToMailbox.mock.calls[0][0];
    expect(call.status).toBe("pending");
  });

  it("event payload includes all required fields", async () => {
    const evaluation: SentinelEvaluation = {
      metricType: "velocity_variance",
      severity: "WARN",
      baseline: 300,
      observed: 450,
      delta: 0.50,
      confidence: 0.95,
      thresholds: DEFAULT_SENTINEL_THRESHOLDS.velocity_variance,
      surfaceToNotion: true,
    };

    await recordSentinelEvent(evaluation);

    const call = mockAppendToMailbox.mock.calls[0][0];
    expect(call.payload).toHaveProperty("event_id");
    expect(call.payload).toHaveProperty("metric_type", "velocity_variance");
    expect(call.payload).toHaveProperty("severity", "WARN");
    expect(call.payload).toHaveProperty("baseline", 300);
    expect(call.payload).toHaveProperty("observed", 450);
    expect(call.payload).toHaveProperty("delta", 0.50);
    expect(call.payload).toHaveProperty("confidence", 0.95);
    expect(call.payload).toHaveProperty("thresholds");
    expect(call.payload).toHaveProperty("surface_to_notion", true);
    expect(call.payload).toHaveProperty("timestamp");
  });

  it("accepts optional trace_id for linking to existing traces", async () => {
    const evaluation: SentinelEvaluation = {
      metricType: "approval_rate_variance",
      severity: "WARN",
      baseline: 0.85,
      observed: 0.70,
      delta: 0.176,
      confidence: 0.95,
      thresholds: DEFAULT_SENTINEL_THRESHOLDS.approval_rate_variance,
      surfaceToNotion: true,
    };

    await recordSentinelEvent(evaluation, "trace_existing_001");

    const call = mockAppendToMailbox.mock.calls[0][0];
    expect(call.traceId).toBe("trace_existing_001");
  });
});

describe("Sentinel Mailbox — Threshold Change Proposals", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("creates a proposal packet in the proposal_mailbox", async () => {
    const traceId = await proposeThresholdChange({
      metricType: "approval_rate_variance",
      currentThresholds: { INFO: 0.05, WARN: 0.10, CRITICAL: 0.20 },
      proposedThresholds: { INFO: 0.03, WARN: 0.08, CRITICAL: 0.15 },
      reason: "Tighter monitoring after anomaly detected",
    });

    expect(traceId).toBeDefined();
    expect(mockAppendToMailbox).toHaveBeenCalledOnce();

    const call = mockAppendToMailbox.mock.calls[0][0];
    expect(call.mailboxType).toBe("proposal");
    expect(call.packetType).toBe("proposal_packet");
    expect(call.sourceAgent).toBe("sentinel");
    expect(call.payload.type).toBe("sentinel_threshold_change");
    expect(call.payload.risk_tier).toBe("MEDIUM");
    expect(call.payload.metric_type).toBe("approval_rate_variance");
  });

  it("threshold change proposals are always MEDIUM risk", async () => {
    await proposeThresholdChange({
      metricType: "velocity_variance",
      currentThresholds: { INFO: 0.10, WARN: 0.25, CRITICAL: 0.50 },
      proposedThresholds: { INFO: 0.05, WARN: 0.15, CRITICAL: 0.30 },
      reason: "Test",
    });

    const call = mockAppendToMailbox.mock.calls[0][0];
    expect(call.payload.risk_tier).toBe("MEDIUM");
  });
});

describe("Sentinel Mailbox — Notion Surfacing Rules", () => {
  const thresholds = DEFAULT_SENTINEL_THRESHOLDS.approval_rate_variance;

  it("INFO events are NOT surfaced to Notion", () => {
    const result = evaluateObservation(
      { metricType: "approval_rate_variance", baseline: 1.0, observed: 0.97 },
      thresholds
    );
    expect(result.surfaceToNotion).toBe(false);
  });

  it("WARN events ARE surfaced to Notion", () => {
    const result = evaluateObservation(
      { metricType: "approval_rate_variance", baseline: 1.0, observed: 0.85 },
      thresholds
    );
    expect(result.severity).toBe("WARN");
    expect(result.surfaceToNotion).toBe(true);
  });

  it("CRITICAL events ARE surfaced to Notion", () => {
    const result = evaluateObservation(
      { metricType: "approval_rate_variance", baseline: 1.0, observed: 0.70 },
      thresholds
    );
    expect(result.severity).toBe("CRITICAL");
    expect(result.surfaceToNotion).toBe(true);
  });
});

describe("Sentinel Mailbox — Invariants", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("sentinel NEVER writes to decision_mailbox (observation only)", async () => {
    const evaluation: SentinelEvaluation = {
      metricType: "approval_rate_variance",
      severity: "CRITICAL",
      baseline: 0.85,
      observed: 0.30,
      delta: 0.647,
      confidence: 0.99,
      thresholds: DEFAULT_SENTINEL_THRESHOLDS.approval_rate_variance,
      surfaceToNotion: true,
    };

    await recordSentinelEvent(evaluation);

    const call = mockAppendToMailbox.mock.calls[0][0];
    expect(call.mailboxType).toBe("sentinel");
    expect(call.mailboxType).not.toBe("decision");
  });

  it("sentinel events are always sourced from 'sentinel' agent", async () => {
    const evaluation: SentinelEvaluation = {
      metricType: "approval_rate_variance",
      severity: "WARN",
      baseline: 0.85,
      observed: 0.70,
      delta: 0.176,
      confidence: 0.95,
      thresholds: DEFAULT_SENTINEL_THRESHOLDS.approval_rate_variance,
      surfaceToNotion: true,
    };

    await recordSentinelEvent(evaluation);

    const call = mockAppendToMailbox.mock.calls[0][0];
    expect(call.sourceAgent).toBe("sentinel");
  });

  it("threshold proposals go through proposal_mailbox (not direct DB write)", async () => {
    await proposeThresholdChange({
      metricType: "approval_rate_variance",
      currentThresholds: { INFO: 0.05, WARN: 0.10, CRITICAL: 0.20 },
      proposedThresholds: { INFO: 0.03, WARN: 0.08, CRITICAL: 0.15 },
      reason: "Test governance",
    });

    const call = mockAppendToMailbox.mock.calls[0][0];
    expect(call.mailboxType).toBe("proposal");
  });

  it("default thresholds match Builder Contract specification", () => {
    expect(DEFAULT_SENTINEL_THRESHOLDS.approval_rate_variance).toEqual({
      INFO: 0.05, WARN: 0.10, CRITICAL: 0.20,
    });
    expect(DEFAULT_SENTINEL_THRESHOLDS.velocity_variance).toEqual({
      INFO: 0.10, WARN: 0.25, CRITICAL: 0.50,
    });
    expect(DEFAULT_SENTINEL_THRESHOLDS.edit_rate_variance).toEqual({
      INFO: 0.10, WARN: 0.20, CRITICAL: 0.40,
    });
    expect(DEFAULT_SENTINEL_THRESHOLDS.pattern_shift).toEqual({
      INFO: 0.50, WARN: 0.70, CRITICAL: 0.90,
    });
  });

  it("getThresholds falls back to defaults when DB unavailable", async () => {
    const thresholds = await getThresholds("approval_rate_variance");
    expect(thresholds).toEqual({ INFO: 0.05, WARN: 0.10, CRITICAL: 0.20 });
  });
});
