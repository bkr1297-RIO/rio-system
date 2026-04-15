/**
 * Notion Mailbox Bridge Tests — Builder Contract v1
 *
 * Tests that Notion is wired as a VIEW of the mailbox system:
 * 1. Proposals sync from mailbox → Notion
 * 2. Approvals flow from Notion → mailbox
 * 3. Enforcement results sync from mailbox → Notion
 * 4. Notion page IDs are tracked via mailbox entries
 * 5. Batch sync finds unsynchronized proposals
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock mailbox module
const mockAppendToMailbox = vi.fn(async (input: any) => ({
  id: Math.floor(Math.random() * 1000),
  packetId: `pkt_${Math.random().toString(36).slice(2, 10)}`,
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

const mockReadMailbox = vi.fn(async () => []);
const mockGetByTraceId = vi.fn(async () => []);

vi.mock("./mailbox", () => ({
  appendToMailbox: (...args: any[]) => mockAppendToMailbox(...args),
  readMailbox: (...args: any[]) => mockReadMailbox(...args),
  getByTraceId: (...args: any[]) => mockGetByTraceId(...args),
}));

// Mock Notion writer
const mockWriteProposalToNotion = vi.fn(async () => "notion-page-id-123");
const mockUpdateNotionProposalExecuted = vi.fn(async () => {});
const mockUpdateNotionProposalApproved = vi.fn(async () => {});
const mockUpdateNotionProposalFailed = vi.fn(async () => {});
const mockUpdateNotionProposalDelegated = vi.fn(async () => {});

vi.mock("./notionProposalWriter", () => ({
  writeProposalToNotion: (...args: any[]) => mockWriteProposalToNotion(...args),
  updateNotionProposalExecuted: (...args: any[]) => mockUpdateNotionProposalExecuted(...args),
  updateNotionProposalApproved: (...args: any[]) => mockUpdateNotionProposalApproved(...args),
  updateNotionProposalFailed: (...args: any[]) => mockUpdateNotionProposalFailed(...args),
  updateNotionProposalDelegated: (...args: any[]) => mockUpdateNotionProposalDelegated(...args),
}));

vi.mock("./db", () => ({
  getDb: vi.fn(() => null),
}));

import {
  syncProposalToNotion,
  processNotionApproval,
  syncEnforcementToNotion,
  syncPendingProposalsToNotion,
  findNotionPageIdForTrace,
  type NotionApprovalEvent,
} from "./notionMailboxBridge";
import type { MailboxEntry, GatewayEnforcementPayload } from "../drizzle/schema";

// ─────────────────────────────────────────────────────────────────
// Test Fixtures
// ─────────────────────────────────────────────────────────────────

function makeProposalEntry(overrides?: Partial<MailboxEntry>): MailboxEntry {
  return {
    id: 1,
    packetId: "pkt_proposal_001",
    mailboxType: "proposal",
    packetType: "proposal_packet",
    sourceAgent: "manny",
    targetAgent: null,
    status: "pending",
    payload: {
      proposal_id: "prop_001",
      type: "outreach",
      category: "email",
      risk_tier: "LOW",
      risk_factors: ["new_contact"],
      title: "Follow up with investor",
      body: "Draft email to follow up on the meeting",
      why_it_matters: "Maintains relationship momentum",
      reasoning: "14-day pattern shows consistent follow-up behavior",
    } as Record<string, unknown>,
    traceId: "trace_001",
    parentPacketId: null,
    createdAt: new Date(),
    processedAt: null,
    ...overrides,
  } as MailboxEntry;
}

// ─────────────────────────────────────────────────────────────────
// Proposal → Notion Sync
// ─────────────────────────────────────────────────────────────────

describe("Notion Mailbox Bridge — Proposal Sync", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("syncs a proposal from mailbox to Notion", async () => {
    const entry = makeProposalEntry();
    const result = await syncProposalToNotion(entry);

    expect(result.success).toBe(true);
    expect(result.notionPageId).toBe("notion-page-id-123");

    // Should have written to Notion
    expect(mockWriteProposalToNotion).toHaveBeenCalledOnce();

    // Should have created a notion_sync_record in the mailbox
    expect(mockAppendToMailbox).toHaveBeenCalledWith(
      expect.objectContaining({
        mailboxType: "proposal",
        packetType: "notion_sync_record",
        sourceAgent: "notion_bridge",
        status: "processed",
        traceId: "trace_001",
        parentPacketId: "pkt_proposal_001",
      })
    );

    // The sync record payload should contain the Notion page ID
    const syncPayload = mockAppendToMailbox.mock.calls[0][0].payload;
    expect(syncPayload.notion_page_id).toBe("notion-page-id-123");
    expect(syncPayload.original_packet_id).toBe("pkt_proposal_001");
  });

  it("handles Notion write failure gracefully", async () => {
    mockWriteProposalToNotion.mockRejectedValueOnce(new Error("Notion API 429"));

    const entry = makeProposalEntry();
    const result = await syncProposalToNotion(entry);

    expect(result.success).toBe(false);
    expect(result.error).toContain("Notion API 429");
    // Should NOT have created a sync record
    expect(mockAppendToMailbox).not.toHaveBeenCalled();
  });

  it("extracts proposal fields correctly from mailbox payload", async () => {
    const entry = makeProposalEntry({
      payload: {
        proposal_id: "prop_xyz",
        type: "financial",
        category: "budget",
        risk_tier: "HIGH",
        risk_factors: ["large_amount", "new_vendor"],
        title: "Budget Transfer",
        body: "Transfer $5000 to vendor account",
        why_it_matters: "Critical vendor payment",
        reasoning: "Matches approved budget line",
        baseline_pattern: {
          approval_rate_14d: 0.95,
          avg_velocity_seconds: 300,
          edit_rate: 0.05,
        },
      } as Record<string, unknown>,
    });

    await syncProposalToNotion(entry);

    const notionCall = mockWriteProposalToNotion.mock.calls[0][0];
    expect(notionCall.proposalId).toBe("prop_xyz");
    expect(notionCall.type).toBe("financial");
    expect(notionCall.riskTier).toBe("HIGH");
    expect(notionCall.riskFactors).toEqual(["large_amount", "new_vendor"]);
    expect(notionCall.baselinePattern).toBeDefined();
    expect(notionCall.baselinePattern.approval_rate_14d).toBe(0.95);
  });
});

// ─────────────────────────────────────────────────────────────────
// Notion Approval → Mailbox
// ─────────────────────────────────────────────────────────────────

describe("Notion Mailbox Bridge — Approval Flow", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("processes an APPROVE event from Notion into the mailbox", async () => {
    const event: NotionApprovalEvent = {
      notionPageId: "notion-page-123",
      proposalId: "prop_001",
      traceId: "trace_001",
      userDecision: "APPROVE",
      signerId: "user_brian",
      signatureEd25519: "sig_valid_test_123",
    };

    const entry = await processNotionApproval(event);

    // Should write to decision mailbox
    expect(mockAppendToMailbox).toHaveBeenCalledWith(
      expect.objectContaining({
        mailboxType: "decision",
        packetType: "human_approval_packet",
        sourceAgent: "user_brian",
        targetAgent: "gateway",
        status: "pending",
        traceId: "trace_001",
      })
    );

    // Payload should contain approval details
    const payload = mockAppendToMailbox.mock.calls[0][0].payload;
    expect(payload.user_decision).toBe("APPROVE");
    expect(payload.signer_id).toBe("user_brian");
    expect(payload.signature_ed25519).toBe("sig_valid_test_123");
    expect(payload.notion_page_id).toBe("notion-page-123");

    // Should update Notion to show approved
    expect(mockUpdateNotionProposalApproved).toHaveBeenCalledWith("notion-page-123");
  });

  it("processes a REJECT event from Notion", async () => {
    const event: NotionApprovalEvent = {
      notionPageId: "notion-page-123",
      proposalId: "prop_001",
      traceId: "trace_001",
      userDecision: "REJECT",
      signerId: "user_brian",
      signatureEd25519: "sig_valid_test_456",
    };

    await processNotionApproval(event);

    const payload = mockAppendToMailbox.mock.calls[0][0].payload;
    expect(payload.user_decision).toBe("REJECT");

    // Should NOT update Notion to approved
    expect(mockUpdateNotionProposalApproved).not.toHaveBeenCalled();
  });

  it("processes a MODIFY event from Notion with modifications", async () => {
    const event: NotionApprovalEvent = {
      notionPageId: "notion-page-123",
      proposalId: "prop_001",
      traceId: "trace_001",
      userDecision: "MODIFY",
      signerId: "user_brian",
      signatureEd25519: "sig_valid_test_789",
      modifications: { subject: "Updated subject line" },
    };

    await processNotionApproval(event);

    const payload = mockAppendToMailbox.mock.calls[0][0].payload;
    expect(payload.user_decision).toBe("MODIFY");
    expect(payload.modifications).toEqual({ subject: "Updated subject line" });

    // MODIFY is treated as approval
    expect(mockUpdateNotionProposalApproved).toHaveBeenCalledWith("notion-page-123");
  });
});

// ─────────────────────────────────────────────────────────────────
// Enforcement → Notion Sync
// ─────────────────────────────────────────────────────────────────

describe("Notion Mailbox Bridge — Enforcement Sync", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("syncs EXECUTED (human-approved) to Notion", async () => {
    const enforcement: GatewayEnforcementPayload = {
      decision_id: "dec_001",
      proposed_decision: "REQUIRE_HUMAN",
      enforced_decision: "EXECUTED",
      enforcement_reason: "Human approved with valid signature",
      execution_id: "exec_001",
      receipt_id: "rcpt_001",
      signature_valid: true,
      signature_ed25519: "sig_valid_test",
      timestamp: new Date().toISOString(),
      trace_id: "trace_001",
    };

    const result = await syncEnforcementToNotion(enforcement, "notion-page-123");

    expect(result.success).toBe(true);
    expect(mockUpdateNotionProposalExecuted).toHaveBeenCalledWith("notion-page-123", "rcpt_001");
  });

  it("syncs EXECUTED (auto-approved/delegated) to Notion", async () => {
    const enforcement: GatewayEnforcementPayload = {
      decision_id: "dec_001",
      proposed_decision: "AUTO_APPROVE",
      enforced_decision: "EXECUTED",
      enforcement_reason: "Kernel auto-approved",
      execution_id: "exec_001",
      receipt_id: "rcpt_001",
      signature_valid: true,
      signature_ed25519: "sys_auto_123",
      timestamp: new Date().toISOString(),
      trace_id: "trace_001",
    };

    await syncEnforcementToNotion(enforcement, "notion-page-123");

    expect(mockUpdateNotionProposalDelegated).toHaveBeenCalledWith(
      "notion-page-123",
      "auto_approve_policy",
      "rcpt_001"
    );
    expect(mockUpdateNotionProposalExecuted).not.toHaveBeenCalled();
  });

  it("syncs BLOCKED to Notion", async () => {
    const enforcement: GatewayEnforcementPayload = {
      decision_id: "dec_001",
      proposed_decision: "DENY",
      enforced_decision: "BLOCKED",
      enforcement_reason: "Kernel denied: critical anomaly",
      execution_id: null,
      receipt_id: null,
      signature_valid: false,
      signature_ed25519: null,
      timestamp: new Date().toISOString(),
      trace_id: "trace_001",
    };

    await syncEnforcementToNotion(enforcement, "notion-page-123");

    expect(mockUpdateNotionProposalFailed).toHaveBeenCalledWith(
      "notion-page-123",
      "Kernel denied: critical anomaly"
    );
  });

  it("does not update Notion for REQUIRES_SIGNATURE", async () => {
    const enforcement: GatewayEnforcementPayload = {
      decision_id: "dec_001",
      proposed_decision: "REQUIRE_HUMAN",
      enforced_decision: "REQUIRES_SIGNATURE",
      enforcement_reason: "Awaiting signature",
      execution_id: null,
      receipt_id: null,
      signature_valid: false,
      signature_ed25519: null,
      timestamp: new Date().toISOString(),
      trace_id: "trace_001",
    };

    await syncEnforcementToNotion(enforcement, "notion-page-123");

    expect(mockUpdateNotionProposalExecuted).not.toHaveBeenCalled();
    expect(mockUpdateNotionProposalFailed).not.toHaveBeenCalled();
    expect(mockUpdateNotionProposalDelegated).not.toHaveBeenCalled();
  });

  it("records enforcement sync in the mailbox", async () => {
    const enforcement: GatewayEnforcementPayload = {
      decision_id: "dec_001",
      proposed_decision: "AUTO_APPROVE",
      enforced_decision: "EXECUTED",
      enforcement_reason: "Auto-approved",
      execution_id: "exec_001",
      receipt_id: "rcpt_001",
      signature_valid: true,
      signature_ed25519: "sys_auto",
      timestamp: new Date().toISOString(),
      trace_id: "trace_001",
    };

    await syncEnforcementToNotion(enforcement, "notion-page-123");

    expect(mockAppendToMailbox).toHaveBeenCalledWith(
      expect.objectContaining({
        mailboxType: "decision",
        packetType: "notion_enforcement_sync",
        sourceAgent: "notion_bridge",
        traceId: "trace_001",
      })
    );
  });
});

// ─────────────────────────────────────────────────────────────────
// Batch Sync
// ─────────────────────────────────────────────────────────────────

describe("Notion Mailbox Bridge — Batch Sync", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("syncs pending proposals that haven't been synced yet", async () => {
    const proposal1 = makeProposalEntry({ packetId: "pkt_1", traceId: "trace_1" });
    const proposal2 = makeProposalEntry({ packetId: "pkt_2", traceId: "trace_2" });

    // First call: pending proposals; second call: all entries (including sync records)
    mockReadMailbox
      .mockResolvedValueOnce([proposal1, proposal2]) // pending proposals
      .mockResolvedValueOnce([
        // Already synced pkt_1
        { packetType: "notion_sync_record", payload: { original_packet_id: "pkt_1" } },
      ]);

    const results = await syncPendingProposalsToNotion();

    // Should only sync pkt_2 (pkt_1 already synced)
    expect(mockWriteProposalToNotion).toHaveBeenCalledOnce();
    expect(results).toHaveLength(1);
    expect(results[0].success).toBe(true);
  });

  it("skips proposals with visible=false", async () => {
    const hiddenProposal = makeProposalEntry({
      packetId: "pkt_hidden",
      payload: { ...makeProposalEntry().payload as Record<string, unknown>, visible: false },
    });

    mockReadMailbox
      .mockResolvedValueOnce([hiddenProposal])
      .mockResolvedValueOnce([]);

    const results = await syncPendingProposalsToNotion();

    expect(results).toHaveLength(0);
    expect(mockWriteProposalToNotion).not.toHaveBeenCalled();
  });
});

// ─────────────────────────────────────────────────────────────────
// Notion Page ID Lookup
// ─────────────────────────────────────────────────────────────────

describe("Notion Mailbox Bridge — Page ID Lookup", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("finds Notion page ID for a trace", async () => {
    mockGetByTraceId.mockResolvedValueOnce([
      { packetType: "proposal_packet", payload: {} },
      {
        packetType: "notion_sync_record",
        payload: { notion_page_id: "notion-page-xyz" },
      },
    ]);

    const pageId = await findNotionPageIdForTrace("trace_001");
    expect(pageId).toBe("notion-page-xyz");
  });

  it("returns null when no sync record exists", async () => {
    mockGetByTraceId.mockResolvedValueOnce([
      { packetType: "proposal_packet", payload: {} },
    ]);

    const pageId = await findNotionPageIdForTrace("trace_no_sync");
    expect(pageId).toBeNull();
  });

  it("returns null for empty trace", async () => {
    mockGetByTraceId.mockResolvedValueOnce([]);

    const pageId = await findNotionPageIdForTrace("trace_empty");
    expect(pageId).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────
// Invariants
// ─────────────────────────────────────────────────────────────────

describe("Notion Mailbox Bridge — Invariants", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("mailbox is the source of truth, not Notion", async () => {
    // Verify: all state changes go through appendToMailbox first
    const event: NotionApprovalEvent = {
      notionPageId: "notion-page-123",
      proposalId: "prop_001",
      traceId: "trace_001",
      userDecision: "APPROVE",
      signerId: "user_brian",
      signatureEd25519: "sig_valid_test_123",
    };

    await processNotionApproval(event);

    // Mailbox write happens BEFORE Notion update
    const mailboxCallOrder = mockAppendToMailbox.mock.invocationCallOrder[0];
    const notionCallOrder = mockUpdateNotionProposalApproved.mock.invocationCallOrder[0];
    expect(mailboxCallOrder).toBeLessThan(notionCallOrder);
  });

  it("all sync operations create mailbox entries for auditability", async () => {
    // Proposal sync creates a notion_sync_record
    const entry = makeProposalEntry();
    await syncProposalToNotion(entry);
    expect(mockAppendToMailbox).toHaveBeenCalledWith(
      expect.objectContaining({ packetType: "notion_sync_record" })
    );

    vi.clearAllMocks();

    // Enforcement sync creates a notion_enforcement_sync
    const enforcement: GatewayEnforcementPayload = {
      decision_id: "dec_001",
      proposed_decision: "AUTO_APPROVE",
      enforced_decision: "EXECUTED",
      enforcement_reason: "Auto-approved",
      execution_id: "exec_001",
      receipt_id: "rcpt_001",
      signature_valid: true,
      signature_ed25519: "sys_auto",
      timestamp: new Date().toISOString(),
      trace_id: "trace_001",
    };
    await syncEnforcementToNotion(enforcement, "notion-page-123");
    expect(mockAppendToMailbox).toHaveBeenCalledWith(
      expect.objectContaining({ packetType: "notion_enforcement_sync" })
    );
  });
});
