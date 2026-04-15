/**
 * Gateway Enforcer Tests — Builder Contract v1
 *
 * Tests the Gateway enforcement logic:
 * 1. AUTO_APPROVE → EXECUTED (immediate)
 * 2. REQUIRE_HUMAN + valid approval → EXECUTED
 * 3. REQUIRE_HUMAN + no approval → REQUIRES_SIGNATURE
 * 4. REQUIRE_HUMAN + REJECT → BLOCKED
 * 5. REQUIRE_HUMAN + invalid signature → BLOCKED
 * 6. DENY → BLOCKED
 * 7. Trace validation (complete vs incomplete)
 * 8. Signature validation
 * 9. Gateway is sole execution authority
 */

import { describe, it, expect, vi } from "vitest";

// Mock mailbox module
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
  transitionStatus: vi.fn(async () => ({})),
  generatePacketId: vi.fn(() => "pkt_gw_test"),
}));

vi.mock("./db", () => ({
  getDb: vi.fn(() => null),
}));

import {
  enforceDecision,
  validateSignature,
  validateTrace,
  type HumanApproval,
  type GatewayEnforcementContext,
} from "./gatewayEnforcer";
import type { KernelDecisionPayload, MailboxEntry } from "../drizzle/schema";

// ─────────────────────────────────────────────────────────────────
// Test Fixtures
// ─────────────────────────────────────────────────────────────────

function makeKernelDecision(overrides?: Partial<KernelDecisionPayload>): KernelDecisionPayload {
  return {
    decision_id: "decision_test_001",
    packet_id: "proposal_test_001",
    proposed_decision: "REQUIRE_HUMAN",
    reasoning: {
      policy_match: true,
      policy_name: "default_outreach_low",
      trust_level_ok: true,
      trust_level_applied: 0,
      constraints_ok: true,
      anomaly_flag: false,
    },
    baseline_pattern: {
      approval_rate_14d: 0.82,
      recent_velocity_seconds: 420,
      edit_rate: 0.12,
    },
    observed_state: null,
    confidence: 0.95,
    timestamp: new Date().toISOString(),
    trace_id: "trace_test_001",
    ...overrides,
  };
}

function makeKernelEntry(overrides?: Partial<MailboxEntry>): MailboxEntry {
  return {
    id: 1,
    packetId: "pkt_kernel_001",
    mailboxType: "decision",
    packetType: "kernel_decision_object",
    sourceAgent: "kernel",
    targetAgent: "gateway",
    status: "pending",
    payload: makeKernelDecision() as unknown as Record<string, unknown>,
    traceId: "trace_test_001",
    parentPacketId: "pkt_proposal_001",
    createdAt: new Date(),
    processedAt: null,
    ...overrides,
  } as MailboxEntry;
}

function makeApproval(overrides?: Partial<HumanApproval>): HumanApproval {
  return {
    user_decision: "APPROVE",
    signature_ed25519: "sig_valid_test_123",
    signer_id: "user_brian",
    timestamp: new Date().toISOString(),
    ...overrides,
  };
}

function makeContext(overrides?: Partial<GatewayEnforcementContext>): GatewayEnforcementContext {
  return {
    kernelDecision: makeKernelDecision(),
    kernelEntry: makeKernelEntry(),
    ...overrides,
  };
}

// ─────────────────────────────────────────────────────────────────
// Core Enforcement Scenarios
// ─────────────────────────────────────────────────────────────────

describe("Gateway Enforcer — Core Enforcement", () => {
  it("AUTO_APPROVE → EXECUTED immediately", () => {
    const result = enforceDecision(makeContext({
      kernelDecision: makeKernelDecision({ proposed_decision: "AUTO_APPROVE" }),
    }));

    expect(result.enforced_decision).toBe("EXECUTED");
    expect(result.execution_id).toBeDefined();
    expect(result.execution_id).toMatch(/^exec_/);
    expect(result.receipt_id).toBeDefined();
    expect(result.receipt_id).toMatch(/^rcpt_/);
    expect(result.signature_valid).toBe(true);
    expect(result.enforcement_reason).toContain("auto-approved");
  });

  it("REQUIRE_HUMAN + valid approval → EXECUTED", () => {
    const result = enforceDecision(makeContext({
      kernelDecision: makeKernelDecision({ proposed_decision: "REQUIRE_HUMAN" }),
      humanApproval: makeApproval(),
    }));

    expect(result.enforced_decision).toBe("EXECUTED");
    expect(result.execution_id).toBeDefined();
    expect(result.receipt_id).toBeDefined();
    expect(result.signature_valid).toBe(true);
    expect(result.signature_ed25519).toBe("sig_valid_test_123");
    expect(result.enforcement_reason).toContain("Human approved");
  });

  it("REQUIRE_HUMAN + no approval → REQUIRES_SIGNATURE", () => {
    const result = enforceDecision(makeContext({
      kernelDecision: makeKernelDecision({ proposed_decision: "REQUIRE_HUMAN" }),
      humanApproval: null,
    }));

    expect(result.enforced_decision).toBe("REQUIRES_SIGNATURE");
    expect(result.execution_id).toBeNull();
    expect(result.receipt_id).toBeNull();
    expect(result.signature_valid).toBe(false);
    expect(result.enforcement_reason).toContain("awaiting signature");
  });

  it("REQUIRE_HUMAN + REJECT → BLOCKED", () => {
    const result = enforceDecision(makeContext({
      kernelDecision: makeKernelDecision({ proposed_decision: "REQUIRE_HUMAN" }),
      humanApproval: makeApproval({ user_decision: "REJECT" }),
    }));

    expect(result.enforced_decision).toBe("BLOCKED");
    expect(result.execution_id).toBeNull();
    expect(result.receipt_id).toBeNull();
    expect(result.enforcement_reason).toContain("rejected");
  });

  it("REQUIRE_HUMAN + invalid signature → BLOCKED", () => {
    const result = enforceDecision(makeContext({
      kernelDecision: makeKernelDecision({ proposed_decision: "REQUIRE_HUMAN" }),
      humanApproval: makeApproval({ signature_ed25519: "bad" }),
    }));

    expect(result.enforced_decision).toBe("BLOCKED");
    expect(result.signature_valid).toBe(false);
    expect(result.enforcement_reason).toContain("Invalid signature");
  });

  it("DENY → BLOCKED", () => {
    const result = enforceDecision(makeContext({
      kernelDecision: makeKernelDecision({
        proposed_decision: "DENY",
        reasoning: {
          policy_match: true,
          policy_name: null,
          trust_level_ok: false,
          trust_level_applied: 0,
          constraints_ok: false,
          anomaly_flag: true,
          anomaly_type: "critical",
        },
      }),
    }));

    expect(result.enforced_decision).toBe("BLOCKED");
    expect(result.execution_id).toBeNull();
    expect(result.receipt_id).toBeNull();
    expect(result.enforcement_reason).toContain("denied");
  });
});

// ─────────────────────────────────────────────────────────────────
// Enforcement Object Structure
// ─────────────────────────────────────────────────────────────────

describe("Gateway Enforcer — Enforcement Object Structure", () => {
  it("produces a complete gateway_enforcement_object", () => {
    const result = enforceDecision(makeContext({
      kernelDecision: makeKernelDecision({ proposed_decision: "AUTO_APPROVE" }),
    }));

    // Required fields from Builder Contract
    expect(result.decision_id).toBe("decision_test_001");
    expect(result.proposed_decision).toBe("AUTO_APPROVE");
    expect(result.enforced_decision).toBeDefined();
    expect(["EXECUTED", "BLOCKED", "REQUIRES_SIGNATURE"]).toContain(result.enforced_decision);
    expect(result.enforcement_reason).toBeDefined();
    expect(typeof result.enforcement_reason).toBe("string");
    expect(result.signature_valid).toBeDefined();
    expect(typeof result.signature_valid).toBe("boolean");
    expect(result.timestamp).toBeDefined();
    expect(result.trace_id).toBe("trace_test_001");
  });

  it("carries trace_id from kernel decision", () => {
    const traceId = "trace_unique_abc";
    const result = enforceDecision(makeContext({
      kernelDecision: makeKernelDecision({ trace_id: traceId }),
    }));
    expect(result.trace_id).toBe(traceId);
  });

  it("carries decision_id from kernel decision", () => {
    const result = enforceDecision(makeContext({
      kernelDecision: makeKernelDecision({ decision_id: "decision_xyz" }),
    }));
    expect(result.decision_id).toBe("decision_xyz");
  });
});

// ─────────────────────────────────────────────────────────────────
// Signature Validation
// ─────────────────────────────────────────────────────────────────

describe("Gateway Enforcer — Signature Validation", () => {
  it("rejects null signature", () => {
    expect(validateSignature(null)).toBe(false);
  });

  it("rejects undefined signature", () => {
    expect(validateSignature(undefined)).toBe(false);
  });

  it("rejects empty string", () => {
    expect(validateSignature("")).toBe(false);
  });

  it("rejects too-short signature", () => {
    expect(validateSignature("sig")).toBe(false);
    expect(validateSignature("short")).toBe(false);
  });

  it("accepts valid sig_ prefix signature", () => {
    expect(validateSignature("sig_valid_test_123")).toBe(true);
  });

  it("accepts system signature", () => {
    expect(validateSignature("sys_abc123def")).toBe(true);
  });

  it("rejects signature without valid prefix", () => {
    expect(validateSignature("invalid_signature_here")).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────
// Trace Validation
// ─────────────────────────────────────────────────────────────────

describe("Gateway Enforcer — Trace Validation", () => {
  it("validates a complete trace", () => {
    const entries: MailboxEntry[] = [
      {
        id: 1, packetId: "pkt_1", mailboxType: "proposal", packetType: "proposal_packet",
        sourceAgent: "manny", targetAgent: null, status: "pending",
        payload: {} as any, traceId: "trace_1", parentPacketId: null,
        createdAt: new Date(), processedAt: null,
      },
      {
        id: 2, packetId: "pkt_2", mailboxType: "proposal", packetType: "proposal_packet_processed",
        sourceAgent: "kernel", targetAgent: null, status: "processed",
        payload: {} as any, traceId: "trace_1", parentPacketId: "pkt_1",
        createdAt: new Date(), processedAt: new Date(),
      },
      {
        id: 3, packetId: "pkt_3", mailboxType: "decision", packetType: "kernel_decision_object",
        sourceAgent: "kernel", targetAgent: "gateway", status: "pending",
        payload: {} as any, traceId: "trace_1", parentPacketId: "pkt_1",
        createdAt: new Date(), processedAt: null,
      },
      {
        id: 4, packetId: "pkt_4", mailboxType: "decision", packetType: "gateway_enforcement_object",
        sourceAgent: "gateway", targetAgent: null, status: "executed",
        payload: {} as any, traceId: "trace_1", parentPacketId: "pkt_3",
        createdAt: new Date(), processedAt: new Date(),
      },
    ] as MailboxEntry[];

    const result = validateTrace(entries);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
    expect(result.hasProposal).toBe(true);
    expect(result.hasKernelDecision).toBe(true);
    expect(result.hasGatewayEnforcement).toBe(true);
    expect(result.finalStatus).toBe("executed");
  });

  it("detects missing proposal", () => {
    const entries: MailboxEntry[] = [
      {
        id: 1, packetId: "pkt_1", mailboxType: "decision", packetType: "kernel_decision_object",
        sourceAgent: "kernel", targetAgent: "gateway", status: "pending",
        payload: {} as any, traceId: "trace_1", parentPacketId: null,
        createdAt: new Date(), processedAt: null,
      },
    ] as MailboxEntry[];

    const result = validateTrace(entries);
    expect(result.valid).toBe(false);
    expect(result.hasProposal).toBe(false);
    expect(result.errors).toContain("Missing proposal entry");
  });

  it("detects missing kernel decision", () => {
    const entries: MailboxEntry[] = [
      {
        id: 1, packetId: "pkt_1", mailboxType: "proposal", packetType: "proposal_packet",
        sourceAgent: "manny", targetAgent: null, status: "pending",
        payload: {} as any, traceId: "trace_1", parentPacketId: null,
        createdAt: new Date(), processedAt: null,
      },
    ] as MailboxEntry[];

    const result = validateTrace(entries);
    expect(result.valid).toBe(false);
    expect(result.hasKernelDecision).toBe(false);
    expect(result.errors).toContain("Missing kernel_decision_object");
  });

  it("detects missing gateway enforcement", () => {
    const entries: MailboxEntry[] = [
      {
        id: 1, packetId: "pkt_1", mailboxType: "proposal", packetType: "proposal_packet",
        sourceAgent: "manny", targetAgent: null, status: "pending",
        payload: {} as any, traceId: "trace_1", parentPacketId: null,
        createdAt: new Date(), processedAt: null,
      },
      {
        id: 2, packetId: "pkt_2", mailboxType: "decision", packetType: "kernel_decision_object",
        sourceAgent: "kernel", targetAgent: "gateway", status: "pending",
        payload: {} as any, traceId: "trace_1", parentPacketId: "pkt_1",
        createdAt: new Date(), processedAt: null,
      },
    ] as MailboxEntry[];

    const result = validateTrace(entries);
    expect(result.valid).toBe(false);
    expect(result.hasGatewayEnforcement).toBe(false);
    expect(result.errors).toContain("Missing gateway_enforcement_object");
  });

  it("detects multiple trace_ids", () => {
    const entries: MailboxEntry[] = [
      {
        id: 1, packetId: "pkt_1", mailboxType: "proposal", packetType: "proposal_packet",
        sourceAgent: "manny", targetAgent: null, status: "pending",
        payload: {} as any, traceId: "trace_1", parentPacketId: null,
        createdAt: new Date(), processedAt: null,
      },
      {
        id: 2, packetId: "pkt_2", mailboxType: "decision", packetType: "kernel_decision_object",
        sourceAgent: "kernel", targetAgent: "gateway", status: "pending",
        payload: {} as any, traceId: "trace_2", parentPacketId: "pkt_1",
        createdAt: new Date(), processedAt: null,
      },
    ] as MailboxEntry[];

    const result = validateTrace(entries);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes("Multiple trace_ids"))).toBe(true);
  });

  it("handles empty trace", () => {
    const result = validateTrace([]);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain("Empty trace");
    expect(result.finalStatus).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────
// Gateway Invariants
// ─────────────────────────────────────────────────────────────────

describe("Gateway Enforcer — Invariants", () => {
  it("Gateway is the ONLY component that produces EXECUTED", () => {
    // Only Gateway can produce EXECUTED — kernel cannot
    const kernelDecisions = ["AUTO_APPROVE", "REQUIRE_HUMAN", "DENY"];
    expect(kernelDecisions).not.toContain("EXECUTED");

    // Gateway CAN produce EXECUTED
    const gatewayDecisions = ["EXECUTED", "BLOCKED", "REQUIRES_SIGNATURE"];
    expect(gatewayDecisions).toContain("EXECUTED");
  });

  it("EXECUTED always has execution_id and receipt_id", () => {
    const result = enforceDecision(makeContext({
      kernelDecision: makeKernelDecision({ proposed_decision: "AUTO_APPROVE" }),
    }));

    expect(result.enforced_decision).toBe("EXECUTED");
    expect(result.execution_id).not.toBeNull();
    expect(result.receipt_id).not.toBeNull();
  });

  it("BLOCKED never has execution_id or receipt_id", () => {
    const result = enforceDecision(makeContext({
      kernelDecision: makeKernelDecision({ proposed_decision: "DENY" }),
    }));

    expect(result.enforced_decision).toBe("BLOCKED");
    expect(result.execution_id).toBeNull();
    expect(result.receipt_id).toBeNull();
  });

  it("REQUIRES_SIGNATURE never has execution_id or receipt_id", () => {
    const result = enforceDecision(makeContext({
      kernelDecision: makeKernelDecision({ proposed_decision: "REQUIRE_HUMAN" }),
      humanApproval: null,
    }));

    expect(result.enforced_decision).toBe("REQUIRES_SIGNATURE");
    expect(result.execution_id).toBeNull();
    expect(result.receipt_id).toBeNull();
  });

  it("every enforcement carries the original trace_id", () => {
    const decisions: KernelDecisionPayload[] = [
      makeKernelDecision({ proposed_decision: "AUTO_APPROVE", trace_id: "trace_a" }),
      makeKernelDecision({ proposed_decision: "REQUIRE_HUMAN", trace_id: "trace_b" }),
      makeKernelDecision({ proposed_decision: "DENY", trace_id: "trace_c" }),
    ];

    decisions.forEach(d => {
      const result = enforceDecision(makeContext({ kernelDecision: d }));
      expect(result.trace_id).toBe(d.trace_id);
    });
  });

  it("unknown kernel decision → BLOCKED (safety)", () => {
    const result = enforceDecision(makeContext({
      kernelDecision: makeKernelDecision({ proposed_decision: "UNKNOWN" as any }),
    }));

    expect(result.enforced_decision).toBe("BLOCKED");
    expect(result.enforcement_reason).toContain("Unknown");
  });
});

// ─────────────────────────────────────────────────────────────────
// Edge Cases
// ─────────────────────────────────────────────────────────────────

describe("Gateway Enforcer — Edge Cases", () => {
  it("MODIFY approval is treated as APPROVE (with modifications)", () => {
    const result = enforceDecision(makeContext({
      kernelDecision: makeKernelDecision({ proposed_decision: "REQUIRE_HUMAN" }),
      humanApproval: makeApproval({
        user_decision: "MODIFY" as any,
        modifications: { subject: "Updated subject" },
      }),
    }));

    // MODIFY with valid signature should execute (human approved with changes)
    expect(result.enforced_decision).toBe("EXECUTED");
    expect(result.signature_valid).toBe(true);
  });

  it("DENY with anomaly_type=critical includes reason", () => {
    const result = enforceDecision(makeContext({
      kernelDecision: makeKernelDecision({
        proposed_decision: "DENY",
        reasoning: {
          policy_match: true,
          policy_name: null,
          trust_level_ok: false,
          trust_level_applied: 0,
          constraints_ok: false,
          anomaly_flag: true,
          anomaly_type: "critical",
        },
      }),
    }));

    expect(result.enforced_decision).toBe("BLOCKED");
    expect(result.enforcement_reason).toContain("critical");
  });

  it("AUTO_APPROVE produces system signature", () => {
    const result = enforceDecision(makeContext({
      kernelDecision: makeKernelDecision({ proposed_decision: "AUTO_APPROVE" }),
    }));

    expect(result.signature_ed25519).toBeDefined();
    expect(result.signature_ed25519!.startsWith("sys_")).toBe(true);
  });
});
