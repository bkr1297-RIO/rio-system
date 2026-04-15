/**
 * Weekly Review Loop Tests — Builder Contract v1 (Phase 2I)
 *
 * Tests:
 * 1. Night batch generates correct packet structure
 * 2. Reflection prompts follow Pattern → Contrast → Open Interpretation
 * 3. Human response options: keep, adjust, watch, ignore
 * 4. "Adjust" responses create proposal packets
 * 5. Weekly review NEVER auto-executes
 * 6. Suggested adjustments based on data patterns
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Mocks ────────────────────────────────────────────────────────

vi.mock("./db", () => ({
  getDb: vi.fn(() => null), // DB unavailable → uses defaults
}));

const mockAppendToMailbox = vi.fn(async (input: any) => ({
  id: Math.floor(Math.random() * 10000),
  packetId: `pkt_test_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
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
  generateTraceId: vi.fn(() => `trace_review_${Date.now()}`),
}));

import {
  generateWeeklyReviewPacket,
  publishWeeklyReview,
  processReviewResponse,
  generateReflectionPrompts,
  generateSuggestedAdjustments,
  type WeeklyReviewPacket,
  type ReviewResponse,
} from "./weeklyReview";

// ─── Test Data ────────────────────────────────────────────────────

const sampleTotals: WeeklyReviewPacket["totals"] = {
  proposals_submitted: 25,
  auto_approved: 15,
  human_approved: 5,
  denied: 3,
  blocked: 2,
  expired: 0,
};

const sampleHighlights: WeeklyReviewPacket["highlights"] = [
  { type: "anomaly", description: "CRITICAL anomaly: approval rate variance", trace_id: "trace_1", significance: "high" },
  { type: "sentinel", description: "WARN sentinel: velocity spike", trace_id: "trace_2", significance: "medium" },
];

const sampleMismatches: WeeklyReviewPacket["mismatches"] = [
  { type: "enforcement_mismatch", expected: "EXECUTED", observed: "BLOCKED", trace_id: "trace_3" },
];

const sampleTrustExceptions: WeeklyReviewPacket["trust_exceptions"] = [
  { policy_id: "outreach_low", exception_type: "human_override_required", count: 3 },
];

// ─── Tests ────────────────────────────────────────────────────────

describe("Weekly Review — Packet Generation", () => {
  it("generates a packet with correct structure", async () => {
    const packet = await generateWeeklyReviewPacket();

    expect(packet).toHaveProperty("review_id");
    expect(packet).toHaveProperty("period");
    expect(packet.period).toHaveProperty("start");
    expect(packet.period).toHaveProperty("end");
    expect(packet).toHaveProperty("totals");
    expect(packet).toHaveProperty("highlights");
    expect(packet).toHaveProperty("mismatches");
    expect(packet).toHaveProperty("trust_exceptions");
    expect(packet).toHaveProperty("reflection_prompts");
    expect(packet).toHaveProperty("suggested_adjustments");
  });

  it("review_id is unique per generation", async () => {
    const p1 = await generateWeeklyReviewPacket();
    const p2 = await generateWeeklyReviewPacket();
    expect(p1.review_id).not.toBe(p2.review_id);
  });

  it("period defaults to last 7 days", async () => {
    const packet = await generateWeeklyReviewPacket();
    const start = new Date(packet.period.start);
    const end = new Date(packet.period.end);
    const diffMs = end.getTime() - start.getTime();
    const diffDays = diffMs / (1000 * 60 * 60 * 24);
    expect(diffDays).toBeCloseTo(7, 0);
  });

  it("accepts custom period", async () => {
    const start = new Date("2026-04-01T00:00:00Z");
    const end = new Date("2026-04-08T00:00:00Z");
    const packet = await generateWeeklyReviewPacket(start, end);
    expect(packet.period.start).toBe(start.toISOString());
    expect(packet.period.end).toBe(end.toISOString());
  });

  it("totals structure has all required fields", async () => {
    const packet = await generateWeeklyReviewPacket();
    const t = packet.totals;
    expect(t).toHaveProperty("proposals_submitted");
    expect(t).toHaveProperty("auto_approved");
    expect(t).toHaveProperty("human_approved");
    expect(t).toHaveProperty("denied");
    expect(t).toHaveProperty("blocked");
    expect(t).toHaveProperty("expired");
  });
});

describe("Weekly Review — Reflection Prompts", () => {
  it("follows Pattern → Contrast → Open Interpretation categories", () => {
    const prompts = generateReflectionPrompts(
      "review_test",
      sampleTotals,
      sampleHighlights,
      sampleMismatches,
      sampleTrustExceptions
    );

    const categories = prompts.map((p) => p.category);
    expect(categories).toContain("pattern");
    expect(categories).toContain("contrast");
    expect(categories).toContain("open_interpretation");
  });

  it("generates pattern prompt from totals", () => {
    const prompts = generateReflectionPrompts(
      "review_test",
      sampleTotals,
      [],
      [],
      []
    );

    const patternPrompt = prompts.find((p) => p.category === "pattern");
    expect(patternPrompt).toBeDefined();
    expect(patternPrompt!.question).toContain("%");
    expect(patternPrompt!.context).toContain("Total decisions");
  });

  it("generates contrast prompt from mismatches", () => {
    const prompts = generateReflectionPrompts(
      "review_test",
      sampleTotals,
      sampleHighlights,
      sampleMismatches,
      sampleTrustExceptions
    );

    const contrastPrompt = prompts.find((p) => p.category === "contrast");
    expect(contrastPrompt).toBeDefined();
    expect(contrastPrompt!.question).toContain("mismatch");
  });

  it("generates open interpretation prompt from highlights", () => {
    const prompts = generateReflectionPrompts(
      "review_test",
      sampleTotals,
      sampleHighlights,
      sampleMismatches,
      sampleTrustExceptions
    );

    const openPrompt = prompts.find((p) => p.category === "open_interpretation");
    expect(openPrompt).toBeDefined();
  });

  it("always includes at least one open interpretation prompt", () => {
    const prompts = generateReflectionPrompts(
      "review_test",
      { proposals_submitted: 0, auto_approved: 0, human_approved: 0, denied: 0, blocked: 0, expired: 0 },
      [],
      [],
      []
    );

    const openPrompts = prompts.filter((p) => p.category === "open_interpretation");
    expect(openPrompts.length).toBeGreaterThanOrEqual(1);
  });

  it("prompt_ids are unique within a review", () => {
    const prompts = generateReflectionPrompts(
      "review_test",
      sampleTotals,
      sampleHighlights,
      sampleMismatches,
      sampleTrustExceptions
    );

    const ids = prompts.map((p) => p.prompt_id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("each prompt has required fields", () => {
    const prompts = generateReflectionPrompts(
      "review_test",
      sampleTotals,
      sampleHighlights,
      sampleMismatches,
      sampleTrustExceptions
    );

    for (const p of prompts) {
      expect(p).toHaveProperty("prompt_id");
      expect(p).toHaveProperty("category");
      expect(p).toHaveProperty("question");
      expect(p).toHaveProperty("context");
      expect(["pattern", "contrast", "open_interpretation"]).toContain(p.category);
    }
  });
});

describe("Weekly Review — Publishing", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("writes review packet to proposal_mailbox", async () => {
    const packet = await generateWeeklyReviewPacket();
    const result = await publishWeeklyReview(packet);

    expect(result.traceId).toBeDefined();
    expect(result.packetId).toBeDefined();

    // First call should be the review packet itself
    const firstCall = mockAppendToMailbox.mock.calls[0][0];
    expect(firstCall.mailboxType).toBe("proposal");
    expect(firstCall.packetType).toBe("weekly_review_packet");
    expect(firstCall.sourceAgent).toBe("night_batch");
    expect(firstCall.targetAgent).toBe("human");
  });

  it("writes individual reflection prompts as separate entries", async () => {
    const packet = await generateWeeklyReviewPacket();
    await publishWeeklyReview(packet);

    // Should have 1 review packet + N reflection prompts
    const totalCalls = mockAppendToMailbox.mock.calls.length;
    expect(totalCalls).toBe(1 + packet.reflection_prompts.length);

    // Check that reflection prompts have parentPacketId
    for (let i = 1; i < totalCalls; i++) {
      const call = mockAppendToMailbox.mock.calls[i][0];
      expect(call.packetType).toBe("reflection_prompt");
      expect(call.parentPacketId).toBeDefined();
    }
  });
});

describe("Weekly Review — Human Response Processing", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("'keep' response records acknowledgment", async () => {
    const response: ReviewResponse = {
      prompt_id: "review_test_prompt_1",
      response: "keep",
    };

    const result = await processReviewResponse(response, "trace_review_1");
    expect(result.action).toBe("acknowledged");

    const call = mockAppendToMailbox.mock.calls[0][0];
    expect(call.packetType).toBe("review_response");
    expect(call.payload.response).toBe("keep");
  });

  it("'watch' response creates sentinel watch entry", async () => {
    const response: ReviewResponse = {
      prompt_id: "review_test_prompt_2",
      response: "watch",
      comment: "Monitor this for another week",
    };

    const result = await processReviewResponse(response, "trace_review_2");
    expect(result.action).toBe("watch_created");

    // Should have 2 calls: response record + watch request
    expect(mockAppendToMailbox.mock.calls.length).toBe(2);

    const watchCall = mockAppendToMailbox.mock.calls[1][0];
    expect(watchCall.mailboxType).toBe("sentinel");
    expect(watchCall.packetType).toBe("watch_request");
  });

  it("'adjust' response creates proposal packet through normal flow", async () => {
    const response: ReviewResponse = {
      prompt_id: "review_test_prompt_3",
      response: "adjust",
      comment: "Relax the threshold for outreach emails",
    };

    const result = await processReviewResponse(response, "trace_review_3");
    expect(result.action).toBe("proposal_created");
    expect(result.proposalTraceId).toBeDefined();

    // Should have 2 calls: response record + proposal packet
    expect(mockAppendToMailbox.mock.calls.length).toBe(2);

    const proposalCall = mockAppendToMailbox.mock.calls[1][0];
    expect(proposalCall.mailboxType).toBe("proposal");
    expect(proposalCall.packetType).toBe("proposal_packet");
    expect(proposalCall.payload.type).toBe("review_adjustment");
    expect(proposalCall.payload.risk_tier).toBe("MEDIUM");
    expect(proposalCall.payload.requires_approval).toBe(true);
  });

  it("'ignore' response records and returns ignored", async () => {
    const response: ReviewResponse = {
      prompt_id: "review_test_prompt_4",
      response: "ignore",
    };

    const result = await processReviewResponse(response, "trace_review_4");
    expect(result.action).toBe("ignored");
  });
});

describe("Weekly Review — Suggested Adjustments", () => {
  it("suggests policy review when denial rate > 30%", () => {
    const highDenialTotals = {
      proposals_submitted: 10,
      auto_approved: 3,
      human_approved: 2,
      denied: 4,
      blocked: 1,
      expired: 0,
    };

    const adjustments = generateSuggestedAdjustments(
      "review_test",
      highDenialTotals,
      [],
      []
    );

    const policyAdj = adjustments.find((a) => a.category === "policy");
    expect(policyAdj).toBeDefined();
    expect(policyAdj!.description).toContain("denial rate");
  });

  it("suggests trust adjustment when many exceptions", () => {
    const manyExceptions = [
      { policy_id: "p1", exception_type: "human_override_required", count: 4 },
      { policy_id: "p2", exception_type: "human_override_required", count: 3 },
    ];

    const adjustments = generateSuggestedAdjustments(
      "review_test",
      sampleTotals,
      [],
      manyExceptions
    );

    const trustAdj = adjustments.find((a) => a.category === "trust");
    expect(trustAdj).toBeDefined();
    expect(trustAdj!.description).toContain("trust");
  });

  it("suggests sentinel review when many critical events", () => {
    const manyHighlights = Array.from({ length: 5 }, (_, i) => ({
      type: "anomaly",
      description: `CRITICAL anomaly ${i}`,
      trace_id: `trace_${i}`,
      significance: "high" as const,
    }));

    const adjustments = generateSuggestedAdjustments(
      "review_test",
      sampleTotals,
      manyHighlights,
      []
    );

    const sentinelAdj = adjustments.find((a) => a.category === "sentinel");
    expect(sentinelAdj).toBeDefined();
  });

  it("returns no adjustments when everything is normal", () => {
    const normalTotals = {
      proposals_submitted: 10,
      auto_approved: 7,
      human_approved: 2,
      denied: 1,
      blocked: 0,
      expired: 0,
    };

    const adjustments = generateSuggestedAdjustments(
      "review_test",
      normalTotals,
      [],
      []
    );

    expect(adjustments.length).toBe(0);
  });
});

describe("Weekly Review — Invariants", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("weekly review NEVER writes to decision_mailbox", async () => {
    const packet = await generateWeeklyReviewPacket();
    await publishWeeklyReview(packet);

    for (const call of mockAppendToMailbox.mock.calls) {
      expect(call[0].mailboxType).not.toBe("decision");
    }
  });

  it("weekly review NEVER writes gateway_enforcement_object", async () => {
    const packet = await generateWeeklyReviewPacket();
    await publishWeeklyReview(packet);

    for (const call of mockAppendToMailbox.mock.calls) {
      expect(call[0].packetType).not.toBe("gateway_enforcement_object");
    }
  });

  it("'adjust' response goes through proposal flow, not direct execution", async () => {
    const response: ReviewResponse = {
      prompt_id: "test_prompt",
      response: "adjust",
      comment: "Change threshold",
    };

    await processReviewResponse(response, "trace_test");

    // The proposal should be in proposal_mailbox with status pending
    const proposalCall = mockAppendToMailbox.mock.calls.find(
      (c: any) => c[0].packetType === "proposal_packet"
    );
    expect(proposalCall).toBeDefined();
    expect(proposalCall![0].mailboxType).toBe("proposal");
    expect(proposalCall![0].status).toBe("pending");
    expect(proposalCall![0].payload.requires_approval).toBe(true);
  });

  it("no auto-execution from weekly review", async () => {
    // Process all response types and verify none execute directly
    const responses: ReviewResponse[] = [
      { prompt_id: "p1", response: "keep" },
      { prompt_id: "p2", response: "adjust", comment: "test" },
      { prompt_id: "p3", response: "watch" },
      { prompt_id: "p4", response: "ignore" },
    ];

    for (const resp of responses) {
      vi.clearAllMocks();
      await processReviewResponse(resp, `trace_${resp.prompt_id}`);

      for (const call of mockAppendToMailbox.mock.calls) {
        // No call should have status "executed"
        expect(call[0].status).not.toBe("executed");
        // No call should be a gateway enforcement
        expect(call[0].packetType).not.toBe("gateway_enforcement_object");
      }
    }
  });

  it("source agent for review packets is 'night_batch'", async () => {
    const packet = await generateWeeklyReviewPacket();
    await publishWeeklyReview(packet);

    const reviewCall = mockAppendToMailbox.mock.calls[0][0];
    expect(reviewCall.sourceAgent).toBe("night_batch");
  });
});
