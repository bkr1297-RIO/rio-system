/**
 * End-to-End Trace Replay Tests — Builder Contract v1
 *
 * Proves the full Mailbox → Kernel → Gateway chain works end-to-end.
 * Every test follows a single trace_id through the entire decision pipeline.
 *
 * Scenarios:
 * 1. Happy path: Proposal → Kernel AUTO_APPROVE → Gateway EXECUTED
 * 2. Human approval: Proposal → Kernel REQUIRE_HUMAN → Gateway REQUIRES_SIGNATURE → Approval → Gateway EXECUTED
 * 3. Denial: Proposal → Kernel DENY → Gateway BLOCKED
 * 4. Trace replay: Full chain can be reconstructed from mailbox entries
 * 5. Trace validation: Complete vs incomplete traces
 * 6. Decision matrix coverage: All trust/risk/anomaly combos
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Mocks ────────────────────────────────────────────────────────

let mailboxStore: any[] = [];
let idCounter = 0;

vi.mock("./db", () => ({
  getDb: vi.fn(() => null),
}));

vi.mock("./mailbox", () => ({
  appendToMailbox: vi.fn(async (input: any) => {
    idCounter++;
    const entry = {
      id: idCounter,
      packetId: input.packetId || `pkt_${idCounter}_${Math.random().toString(36).slice(2, 8)}`,
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
    };
    mailboxStore.push(entry);
    return entry;
  }),
  readMailbox: vi.fn(async (type: string, opts?: any) => {
    return mailboxStore
      .filter(e => e.mailboxType === type)
      .filter(e => !opts?.status || e.status === opts.status)
      .slice(0, opts?.limit || 100);
  }),
  getByTraceId: vi.fn(async (traceId: string) => {
    return mailboxStore
      .filter(e => e.traceId === traceId)
      .sort((a, b) => a.id - b.id);
  }),
  transitionStatus: vi.fn(async () => ({})),
  generatePacketId: vi.fn(() => `pkt_gen_${++idCounter}`),
}));

import {
  evaluateProposal,
  type KernelEvaluationContext,
  type ProposalPayload,
  type TrustPolicyRecord,
  type SentinelAnomalyRecord,
  type BaselinePattern,
} from "./kernelEvaluator";
import {
  enforceDecision,
  validateTrace,
  type GatewayEnforcementContext,
} from "./gatewayEnforcer";
import { appendToMailbox, getByTraceId } from "./mailbox";
import type { KernelDecisionPayload, MailboxEntry } from "../drizzle/schema";

// ─── Helpers ──────────────────────────────────────────────────────

function makeProposal(overrides?: Partial<ProposalPayload>): ProposalPayload {
  return {
    id: "prop_e2e_001",
    type: "outreach",
    category: "email",
    risk_tier: "LOW",
    proposal: {
      destination: "email_system",
      resource: "investor_followup",
      scope: "investor_relations",
      action_type: "send_email",
      deadline: "2026-04-30",
      context: "14-day pattern shows consistent follow-up behavior",
      title: "Follow up with investor",
      body: "Draft email",
    },
    why_it_matters: "Maintains relationship momentum",
    reasoning: "14-day pattern shows consistent follow-up behavior",
    timestamp: new Date().toISOString(),
    source: "human",
    human_initiated: true,
    grounding: true,
    ...overrides,
  };
}

function makePolicy(overrides?: Partial<TrustPolicyRecord>): TrustPolicyRecord {
  return {
    category: "email",
    riskTier: "LOW",
    trustLevel: 1,
    active: true,
    ...overrides,
  };
}

function makeBaseline(overrides?: Partial<BaselinePattern>): BaselinePattern {
  return {
    approval_rate_14d: 0.85,
    recent_velocity_seconds: 300,
    edit_rate: 0.10,
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

// ─── Test Suites ──────────────────────────────────────────────────

describe("End-to-End Trace Replay — Happy Path (AUTO_APPROVE)", () => {
  beforeEach(() => {
    mailboxStore = [];
    idCounter = 0;
    vi.clearAllMocks();
  });

  it("full chain: Proposal → Kernel → Gateway → EXECUTED", async () => {
    const traceId = "trace_happy_001";

    // Step 1: Write proposal to mailbox
    const proposalEntry = await appendToMailbox({
      mailboxType: "proposal" as any,
      packetType: "proposal_packet",
      sourceAgent: "manny",
      targetAgent: null,
      status: "pending" as any,
      payload: {
        proposal_id: "prop_001",
        type: "outreach",
        category: "email",
        risk_tier: "LOW",
        title: "Follow up with investor",
        body: "Draft follow-up email",
      },
      traceId,
      parentPacketId: null,
    });

    expect(proposalEntry.traceId).toBe(traceId);
    expect(proposalEntry.mailboxType).toBe("proposal");

    // Step 2: Kernel evaluates the proposal
    const context = makeContext({
      proposal: makeProposal({ id: "prop_001", risk_tier: "LOW" }),
      trustPolicy: makePolicy({ trustLevel: 1, riskTier: "LOW", active: true }),
      activeAnomalies: [],
    });

    const kernelResult = evaluateProposal(context);

    expect(kernelResult.proposed_decision).toBe("AUTO_APPROVE");
    // Override trace_id to match the actual trace
    kernelResult.trace_id = traceId;

    // Step 3: Write kernel decision to mailbox
    const kernelEntry = await appendToMailbox({
      mailboxType: "decision" as any,
      packetType: "kernel_decision_object",
      sourceAgent: "kernel",
      targetAgent: "gateway",
      status: "pending" as any,
      payload: kernelResult as unknown as Record<string, unknown>,
      traceId,
      parentPacketId: proposalEntry.packetId,
    });

    // Step 4: Gateway enforces the decision
    const gatewayContext: GatewayEnforcementContext = {
      kernelDecision: kernelResult,
      kernelEntry: kernelEntry as MailboxEntry,
    };

    const enforcement = enforceDecision(gatewayContext);

    expect(enforcement.enforced_decision).toBe("EXECUTED");
    expect(enforcement.execution_id).toBeDefined();
    expect(enforcement.receipt_id).toBeDefined();
    expect(enforcement.trace_id).toBe(traceId);

    // Step 5: Write enforcement to mailbox
    await appendToMailbox({
      mailboxType: "decision" as any,
      packetType: "gateway_enforcement_object",
      sourceAgent: "gateway",
      targetAgent: null,
      status: "executed" as any,
      payload: enforcement as unknown as Record<string, unknown>,
      traceId,
      parentPacketId: kernelEntry.packetId,
    });

    // Step 6: Replay the trace
    const traceEntries = await getByTraceId(traceId);
    expect(traceEntries.length).toBe(3);

    // Verify the chain
    expect(traceEntries[0].packetType).toBe("proposal_packet");
    expect(traceEntries[1].packetType).toBe("kernel_decision_object");
    expect(traceEntries[2].packetType).toBe("gateway_enforcement_object");

    // Validate the trace
    const validation = validateTrace(traceEntries as MailboxEntry[]);
    expect(validation.valid).toBe(true);
    expect(validation.hasProposal).toBe(true);
    expect(validation.hasKernelDecision).toBe(true);
    expect(validation.hasGatewayEnforcement).toBe(true);
    expect(validation.finalStatus).toBe("executed");
  });
});

describe("End-to-End Trace Replay — Human Approval Path", () => {
  beforeEach(() => {
    mailboxStore = [];
    idCounter = 0;
    vi.clearAllMocks();
  });

  it("full chain: Proposal → Kernel REQUIRE_HUMAN → Gateway REQUIRES_SIGNATURE → Approval → EXECUTED", async () => {
    const traceId = "trace_human_001";

    // Step 1: Proposal
    const proposalEntry = await appendToMailbox({
      mailboxType: "proposal" as any,
      packetType: "proposal_packet",
      sourceAgent: "manny",
      targetAgent: null,
      status: "pending" as any,
      payload: { proposal_id: "prop_002", type: "financial", risk_tier: "MEDIUM" },
      traceId,
      parentPacketId: null,
    });

    // Step 2: Kernel evaluates → REQUIRE_HUMAN (trust=0)
    const context = makeContext({
      proposal: makeProposal({ id: "prop_002", type: "financial", category: "budget", risk_tier: "MEDIUM" }),
      trustPolicy: makePolicy({ trustLevel: 0, riskTier: "MEDIUM", category: "budget", active: true }),
      activeAnomalies: [],
    });

    const kernelResult = evaluateProposal(context);
    expect(kernelResult.proposed_decision).toBe("REQUIRE_HUMAN");
    kernelResult.trace_id = traceId;

    // Step 3: Write kernel decision
    const kernelEntry = await appendToMailbox({
      mailboxType: "decision" as any,
      packetType: "kernel_decision_object",
      sourceAgent: "kernel",
      targetAgent: "gateway",
      status: "pending" as any,
      payload: kernelResult as unknown as Record<string, unknown>,
      traceId,
      parentPacketId: proposalEntry.packetId,
    });

    // Step 4: Gateway enforces → REQUIRES_SIGNATURE (no approval yet)
    const gatewayContext1: GatewayEnforcementContext = {
      kernelDecision: kernelResult,
      kernelEntry: kernelEntry as MailboxEntry,
      humanApproval: null,
    };

    const enforcement1 = enforceDecision(gatewayContext1);
    expect(enforcement1.enforced_decision).toBe("REQUIRES_SIGNATURE");

    // Write REQUIRES_SIGNATURE to mailbox
    await appendToMailbox({
      mailboxType: "decision" as any,
      packetType: "gateway_enforcement_object",
      sourceAgent: "gateway",
      targetAgent: null,
      status: "routed" as any,
      payload: enforcement1 as unknown as Record<string, unknown>,
      traceId,
      parentPacketId: kernelEntry.packetId,
    });

    // Step 5: Human approves (via Notion or direct)
    // Status must be >= 'routed' to avoid regression in the decision mailbox
    await appendToMailbox({
      mailboxType: "decision" as any,
      packetType: "human_approval_packet",
      sourceAgent: "user_brian",
      targetAgent: "gateway",
      status: "routed" as any,
      payload: {
        user_decision: "APPROVE",
        signer_id: "user_brian",
        signature_ed25519: "sig_valid_brian_123",
      },
      traceId,
      parentPacketId: kernelEntry.packetId,
    });

    // Step 6: Gateway re-evaluates with approval → EXECUTED
    const gatewayContext2: GatewayEnforcementContext = {
      kernelDecision: kernelResult,
      kernelEntry: kernelEntry as MailboxEntry,
      humanApproval: {
        user_decision: "APPROVE",
        signature_ed25519: "sig_valid_brian_123",
        signer_id: "user_brian",
        timestamp: new Date().toISOString(),
      },
    };

    const enforcement2 = enforceDecision(gatewayContext2);
    expect(enforcement2.enforced_decision).toBe("EXECUTED");
    expect(enforcement2.signature_ed25519).toBe("sig_valid_brian_123");

    // Write final enforcement
    await appendToMailbox({
      mailboxType: "decision" as any,
      packetType: "gateway_enforcement_object",
      sourceAgent: "gateway",
      targetAgent: null,
      status: "executed" as any,
      payload: enforcement2 as unknown as Record<string, unknown>,
      traceId,
      parentPacketId: kernelEntry.packetId,
    });

    // Step 7: Replay and validate
    const traceEntries = await getByTraceId(traceId);
    // 6 entries: proposal, kernel, gateway(routed), approval, gateway(executed)
    // Wait — that's 5 entries. Let's count:
    // 1. proposal_packet (proposal mailbox)
    // 2. kernel_decision_object (decision mailbox)
    // 3. gateway_enforcement_object (decision mailbox, routed)
    // 4. human_approval_packet (decision mailbox)
    // 5. gateway_enforcement_object (decision mailbox, executed)
    expect(traceEntries.length).toBe(5);

    // Full chain
    expect(traceEntries[0].packetType).toBe("proposal_packet");
    expect(traceEntries[1].packetType).toBe("kernel_decision_object");
    expect(traceEntries[2].packetType).toBe("gateway_enforcement_object");
    expect(traceEntries[3].packetType).toBe("human_approval_packet");
    expect(traceEntries[4].packetType).toBe("gateway_enforcement_object");

    // Validate the trace
    const validation = validateTrace(traceEntries as MailboxEntry[]);
    expect(validation.valid).toBe(true);
    expect(validation.hasProposal).toBe(true);
    expect(validation.hasKernelDecision).toBe(true);
    expect(validation.hasGatewayEnforcement).toBe(true);
    expect(validation.finalStatus).toBe("executed");
  });
});

describe("End-to-End Trace Replay — Denial Path", () => {
  beforeEach(() => {
    mailboxStore = [];
    idCounter = 0;
    vi.clearAllMocks();
  });

  it("full chain: Proposal → Kernel DENY (critical anomaly) → Gateway BLOCKED", async () => {
    const traceId = "trace_deny_001";

    // Step 1: Proposal
    const proposalEntry = await appendToMailbox({
      mailboxType: "proposal" as any,
      packetType: "proposal_packet",
      sourceAgent: "manny",
      targetAgent: null,
      status: "pending" as any,
      payload: { proposal_id: "prop_003", type: "financial", risk_tier: "HIGH" },
      traceId,
      parentPacketId: null,
    });

    // Step 2: Kernel evaluates → DENY (critical anomaly)
    const context = makeContext({
      proposal: makeProposal({ id: "prop_003", type: "financial", category: "budget", risk_tier: "HIGH" }),
      trustPolicy: makePolicy({ trustLevel: 1, riskTier: "HIGH", category: "budget", active: true }),
      activeAnomalies: [
        { severity: "CRITICAL", metric_type: "approval_rate_variance", baseline: 0.85, observed: 0.30, delta: -0.55, confidence: 0.99 },
      ],
    });

    const kernelResult = evaluateProposal(context);
    expect(kernelResult.proposed_decision).toBe("DENY");
    kernelResult.trace_id = traceId;

    // Step 3: Write kernel decision
    const kernelEntry = await appendToMailbox({
      mailboxType: "decision" as any,
      packetType: "kernel_decision_object",
      sourceAgent: "kernel",
      targetAgent: "gateway",
      status: "pending" as any,
      payload: kernelResult as unknown as Record<string, unknown>,
      traceId,
      parentPacketId: proposalEntry.packetId,
    });

    // Step 4: Gateway enforces → BLOCKED
    const enforcement = enforceDecision({
      kernelDecision: kernelResult,
      kernelEntry: kernelEntry as MailboxEntry,
    });

    expect(enforcement.enforced_decision).toBe("BLOCKED");
    expect(enforcement.execution_id).toBeNull();
    expect(enforcement.receipt_id).toBeNull();

    // Write enforcement
    await appendToMailbox({
      mailboxType: "decision" as any,
      packetType: "gateway_enforcement_object",
      sourceAgent: "gateway",
      targetAgent: null,
      status: "archived" as any,
      payload: enforcement as unknown as Record<string, unknown>,
      traceId,
      parentPacketId: kernelEntry.packetId,
    });

    // Step 5: Replay and validate
    const traceEntries = await getByTraceId(traceId);
    expect(traceEntries.length).toBe(3);

    const validation = validateTrace(traceEntries as MailboxEntry[]);
    expect(validation.valid).toBe(true);
    expect(validation.finalStatus).toBe("archived");
  });
});

describe("End-to-End Trace Replay — Trace Integrity", () => {
  beforeEach(() => {
    mailboxStore = [];
    idCounter = 0;
    vi.clearAllMocks();
  });

  it("all entries in a trace share the same trace_id", async () => {
    const traceId = "trace_integrity_001";

    await appendToMailbox({
      mailboxType: "proposal" as any, packetType: "proposal_packet",
      sourceAgent: "manny", targetAgent: null, status: "pending" as any,
      payload: {}, traceId, parentPacketId: null,
    });
    await appendToMailbox({
      mailboxType: "decision" as any, packetType: "kernel_decision_object",
      sourceAgent: "kernel", targetAgent: "gateway", status: "pending" as any,
      payload: {}, traceId, parentPacketId: null,
    });
    await appendToMailbox({
      mailboxType: "decision" as any, packetType: "gateway_enforcement_object",
      sourceAgent: "gateway", targetAgent: null, status: "executed" as any,
      payload: {}, traceId, parentPacketId: null,
    });

    const entries = await getByTraceId(traceId);
    const uniqueTraceIds = new Set(entries.map((e: any) => e.traceId));
    expect(uniqueTraceIds.size).toBe(1);
    expect(Array.from(uniqueTraceIds)[0]).toBe(traceId);
  });

  it("entries from different traces do not mix", async () => {
    await appendToMailbox({
      mailboxType: "proposal" as any, packetType: "proposal_packet",
      sourceAgent: "manny", targetAgent: null, status: "pending" as any,
      payload: {}, traceId: "trace_A", parentPacketId: null,
    });
    await appendToMailbox({
      mailboxType: "proposal" as any, packetType: "proposal_packet",
      sourceAgent: "manny", targetAgent: null, status: "pending" as any,
      payload: {}, traceId: "trace_B", parentPacketId: null,
    });

    const entriesA = await getByTraceId("trace_A");
    const entriesB = await getByTraceId("trace_B");

    expect(entriesA.length).toBe(1);
    expect(entriesB.length).toBe(1);
    expect(entriesA[0].traceId).toBe("trace_A");
    expect(entriesB[0].traceId).toBe("trace_B");
  });

  it("parent_packet_id links entries within a trace", async () => {
    const traceId = "trace_parent_001";

    const entry1 = await appendToMailbox({
      mailboxType: "proposal" as any, packetType: "proposal_packet",
      sourceAgent: "manny", targetAgent: null, status: "pending" as any,
      payload: {}, traceId, parentPacketId: null,
    });

    const entry2 = await appendToMailbox({
      mailboxType: "decision" as any, packetType: "kernel_decision_object",
      sourceAgent: "kernel", targetAgent: "gateway", status: "pending" as any,
      payload: {}, traceId, parentPacketId: entry1.packetId,
    });

    const entry3 = await appendToMailbox({
      mailboxType: "decision" as any, packetType: "gateway_enforcement_object",
      sourceAgent: "gateway", targetAgent: null, status: "executed" as any,
      payload: {}, traceId, parentPacketId: entry2.packetId,
    });

    expect(entry1.parentPacketId).toBeNull();
    expect(entry2.parentPacketId).toBe(entry1.packetId);
    expect(entry3.parentPacketId).toBe(entry2.packetId);
  });

  it("kernel never produces EXECUTED (only Gateway can)", () => {
    const context = makeContext({
      proposal: makeProposal({ risk_tier: "LOW" }),
      trustPolicy: makePolicy({ trustLevel: 2, riskTier: "LOW", active: true }),
    });
    const result = evaluateProposal(context);

    expect(["AUTO_APPROVE", "REQUIRE_HUMAN", "DENY"]).toContain(result.proposed_decision);
    expect(result.proposed_decision).not.toBe("EXECUTED");
    expect(result.proposed_decision).not.toBe("BLOCKED");
    expect(result.proposed_decision).not.toBe("REQUIRES_SIGNATURE");
  });

  it("Gateway is the only component that produces EXECUTED", () => {
    const context = makeContext({
      proposal: makeProposal({ id: "prop_gw", risk_tier: "LOW" }),
      trustPolicy: makePolicy({ trustLevel: 1, riskTier: "LOW", active: true }),
    });
    const kernelResult = evaluateProposal(context);
    expect(kernelResult.proposed_decision).toBe("AUTO_APPROVE");

    const enforcement = enforceDecision({
      kernelDecision: kernelResult,
      kernelEntry: {
        id: 1, packetId: "pkt_1", mailboxType: "decision",
        packetType: "kernel_decision_object", sourceAgent: "kernel",
        targetAgent: "gateway", status: "pending",
        payload: kernelResult as unknown as Record<string, unknown>,
        traceId: "trace_gw", parentPacketId: null,
        createdAt: new Date(), processedAt: null,
      } as MailboxEntry,
    });

    expect(enforcement.enforced_decision).toBe("EXECUTED");
  });
});

describe("End-to-End Trace Replay — Decision Matrix Coverage", () => {
  beforeEach(() => {
    mailboxStore = [];
    idCounter = 0;
    vi.clearAllMocks();
  });

  it("trust=0 → REQUIRE_HUMAN regardless of risk", () => {
    for (const risk of ["LOW", "MEDIUM", "HIGH"] as const) {
      const result = evaluateProposal(makeContext({
        proposal: makeProposal({ risk_tier: risk, category: "general" }),
        trustPolicy: makePolicy({ trustLevel: 0, riskTier: risk, category: "general", active: true }),
      }));
      expect(result.proposed_decision).toBe("REQUIRE_HUMAN");
    }
  });

  it("trust=1 + LOW risk → AUTO_APPROVE", () => {
    const result = evaluateProposal(makeContext({
      proposal: makeProposal({ risk_tier: "LOW" }),
      trustPolicy: makePolicy({ trustLevel: 1, riskTier: "LOW", active: true }),
    }));
    expect(result.proposed_decision).toBe("AUTO_APPROVE");
  });

  it("trust=1 + MEDIUM risk → REQUIRE_HUMAN", () => {
    const result = evaluateProposal(makeContext({
      proposal: makeProposal({ risk_tier: "MEDIUM", category: "budget" }),
      trustPolicy: makePolicy({ trustLevel: 1, riskTier: "MEDIUM", category: "budget", active: true }),
    }));
    expect(result.proposed_decision).toBe("REQUIRE_HUMAN");
  });

  it("trust=2 + MEDIUM risk → AUTO_APPROVE", () => {
    const result = evaluateProposal(makeContext({
      proposal: makeProposal({ risk_tier: "MEDIUM", category: "budget" }),
      trustPolicy: makePolicy({ trustLevel: 2, riskTier: "MEDIUM", category: "budget", active: true }),
    }));
    expect(result.proposed_decision).toBe("AUTO_APPROVE");
  });

  it("HIGH risk → always REQUIRE_HUMAN", () => {
    for (const trust of [0, 1, 2]) {
      const result = evaluateProposal(makeContext({
        proposal: makeProposal({ risk_tier: "HIGH", category: "budget" }),
        trustPolicy: makePolicy({ trustLevel: trust, riskTier: "HIGH", category: "budget", active: true }),
      }));
      expect(result.proposed_decision).toBe("REQUIRE_HUMAN");
    }
  });

  it("critical anomaly → always DENY", () => {
    for (const trust of [0, 1, 2]) {
      const result = evaluateProposal(makeContext({
        proposal: makeProposal({ risk_tier: "LOW" }),
        trustPolicy: makePolicy({ trustLevel: trust, riskTier: "LOW", active: true }),
        activeAnomalies: [
          { severity: "CRITICAL", metric_type: "approval_rate_variance", baseline: 0.85, observed: 0.30, delta: -0.55, confidence: 0.99 },
        ],
      }));
      expect(result.proposed_decision).toBe("DENY");
    }
  });

  it("warn anomaly → REQUIRE_HUMAN (overrides AUTO_APPROVE)", () => {
    const result = evaluateProposal(makeContext({
      proposal: makeProposal({ risk_tier: "LOW" }),
      trustPolicy: makePolicy({ trustLevel: 2, riskTier: "LOW", active: true }),
      activeAnomalies: [
        { severity: "WARN", metric_type: "velocity_variance", baseline: 300, observed: 600, delta: 300, confidence: 0.95 },
      ],
    }));
    expect(result.proposed_decision).toBe("REQUIRE_HUMAN");
  });

  it("no policy match → REQUIRE_HUMAN", () => {
    const result = evaluateProposal(makeContext({
      proposal: makeProposal({ risk_tier: "LOW" }),
      trustPolicy: null,
    }));
    expect(result.proposed_decision).toBe("REQUIRE_HUMAN");
  });

  it("inactive policy → REQUIRE_HUMAN (treated as no policy)", () => {
    const result = evaluateProposal(makeContext({
      proposal: makeProposal({ risk_tier: "LOW" }),
      trustPolicy: makePolicy({ trustLevel: 2, riskTier: "LOW", active: false }),
    }));
    expect(result.proposed_decision).toBe("REQUIRE_HUMAN");
  });
});
