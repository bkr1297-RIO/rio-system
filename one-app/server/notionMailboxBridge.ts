/**
 * Notion Mailbox Bridge — Builder Contract v1
 *
 * Wires Notion as a VIEW of the mailbox system, not the source of truth.
 * Proposals surface to Notion for display. Approvals flow back as mailbox entries.
 *
 * INVARIANTS:
 * 1. Mailbox is the source of truth — Notion is the display layer
 * 2. Proposals with visible=true in mailbox → appear in Notion Decision Log
 * 3. User approvals in Notion → flow back as approval packets in decision_mailbox
 * 4. Notion page IDs are stored in mailbox payload for bidirectional linking
 * 5. All Notion operations are idempotent (safe to retry)
 *
 * Flow:
 * proposal_mailbox (pending) → write to Notion → update mailbox payload with notionPageId
 * Notion approval → read from Notion → write approval packet to decision_mailbox
 * gateway_enforcement_object → update Notion row with execution result
 */

import {
  type MailboxEntry,
  type GatewayEnforcementPayload,
} from "../drizzle/schema";
import {
  appendToMailbox,
  readMailbox,
  getByTraceId,
} from "./mailbox";
import {
  writeProposalToNotion,
  updateNotionProposalExecuted,
  updateNotionProposalApproved,
  updateNotionProposalFailed,
  updateNotionProposalDelegated,
  type ProposalForNotion,
} from "./notionProposalWriter";

// ─────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────

export interface NotionSyncResult {
  success: boolean;
  notionPageId?: string;
  error?: string;
  mailboxEntryId?: string;
}

export interface NotionApprovalEvent {
  notionPageId: string;
  proposalId: string;
  traceId: string;
  userDecision: "APPROVE" | "REJECT" | "MODIFY";
  signerId: string;
  signatureEd25519: string;
  modifications?: Record<string, unknown>;
}

// ─────────────────────────────────────────────────────────────────
// Proposal → Notion (Mailbox → Display)
// ─────────────────────────────────────────────────────────────────

/**
 * Sync a proposal from the mailbox to Notion.
 * Reads the proposal mailbox entry, writes to Notion Decision Log,
 * and records the Notion page ID back in the mailbox.
 *
 * @param entry - The mailbox entry containing the proposal
 * @returns NotionSyncResult
 */
export async function syncProposalToNotion(
  entry: MailboxEntry
): Promise<NotionSyncResult> {
  try {
    const payload = entry.payload as Record<string, unknown>;

    // Extract proposal data from mailbox payload
    const proposalForNotion: ProposalForNotion = {
      proposalId: (payload.proposal_id as string) || entry.packetId,
      type: (payload.type as string) || "unknown",
      category: (payload.category as string) || "general",
      riskTier: (payload.risk_tier as "LOW" | "MEDIUM" | "HIGH") || "MEDIUM",
      riskFactors: (payload.risk_factors as string[]) || [],
      proposal: {
        title: payload.title as string | undefined,
        subject: payload.subject as string | undefined,
        body: (payload.body as string) || (payload.description as string) || "",
        action_needed: payload.action_needed as string | undefined,
        draft_email: payload.draft_email as string | undefined,
      },
      whyItMatters: (payload.why_it_matters as string) || "",
      reasoning: (payload.reasoning as string) || "",
      baselinePattern: payload.baseline_pattern as ProposalForNotion["baselinePattern"] | undefined,
    };

    // Write to Notion
    const notionPageId = await writeProposalToNotion(proposalForNotion);

    // Record the Notion page ID in a new mailbox entry (append-only)
    const syncEntry = await appendToMailbox({
      mailboxType: "proposal",
      packetType: "notion_sync_record",
      sourceAgent: "notion_bridge",
      targetAgent: null,
      status: "processed",
      payload: {
        notion_page_id: notionPageId,
        original_packet_id: entry.packetId,
        synced_at: new Date().toISOString(),
      },
      traceId: entry.traceId,
      parentPacketId: entry.packetId,
    });

    return {
      success: true,
      notionPageId,
      mailboxEntryId: syncEntry.packetId,
    };
  } catch (err: any) {
    console.error(`[NotionMailboxBridge] Failed to sync proposal to Notion: ${err.message}`);
    return {
      success: false,
      error: err.message,
    };
  }
}

// ─────────────────────────────────────────────────────────────────
// Notion Approval → Mailbox (Display → Mailbox)
// ─────────────────────────────────────────────────────────────────

/**
 * Process an approval event from Notion.
 * Writes an approval packet to the decision_mailbox.
 * This is how human decisions flow back into the mailbox system.
 *
 * @param event - The approval event from Notion
 * @returns The mailbox entry for the approval
 */
export async function processNotionApproval(
  event: NotionApprovalEvent
): Promise<MailboxEntry> {
  const entry = await appendToMailbox({
    mailboxType: "decision",
    packetType: "human_approval_packet",
    sourceAgent: event.signerId,
    targetAgent: "gateway",
    status: "pending",
    payload: {
      notion_page_id: event.notionPageId,
      proposal_id: event.proposalId,
      user_decision: event.userDecision,
      signer_id: event.signerId,
      signature_ed25519: event.signatureEd25519,
      modifications: event.modifications || null,
      approved_at: new Date().toISOString(),
    },
    traceId: event.traceId,
    parentPacketId: null, // Will be linked by trace_id
  });

  // Update Notion row to reflect the approval
  if (event.userDecision === "APPROVE" || event.userDecision === "MODIFY") {
    try {
      await updateNotionProposalApproved(event.notionPageId);
    } catch (err: any) {
      console.error(`[NotionMailboxBridge] Failed to update Notion approval status: ${err.message}`);
    }
  }

  return entry;
}

// ─────────────────────────────────────────────────────────────────
// Gateway Enforcement → Notion (Mailbox → Display Update)
// ─────────────────────────────────────────────────────────────────

/**
 * Sync a gateway enforcement result back to Notion.
 * Updates the Notion Decision Log row with execution status.
 *
 * @param enforcement - The gateway enforcement payload
 * @param notionPageId - The Notion page ID to update
 */
export async function syncEnforcementToNotion(
  enforcement: GatewayEnforcementPayload,
  notionPageId: string
): Promise<NotionSyncResult> {
  try {
    switch (enforcement.enforced_decision) {
      case "EXECUTED":
        if (enforcement.signature_ed25519?.startsWith("sys_")) {
          // Auto-approved (delegated)
          await updateNotionProposalDelegated(
            notionPageId,
            "auto_approve_policy",
            enforcement.receipt_id || ""
          );
        } else {
          // Human-approved execution
          await updateNotionProposalExecuted(
            notionPageId,
            enforcement.receipt_id || ""
          );
        }
        break;

      case "BLOCKED":
        await updateNotionProposalFailed(
          notionPageId,
          enforcement.enforcement_reason
        );
        break;

      case "REQUIRES_SIGNATURE":
        // No Notion update needed — still waiting for human
        break;
    }

    // Record the sync in the mailbox
    await appendToMailbox({
      mailboxType: "decision",
      packetType: "notion_enforcement_sync",
      sourceAgent: "notion_bridge",
      targetAgent: null,
      status: "processed",
      payload: {
        notion_page_id: notionPageId,
        enforced_decision: enforcement.enforced_decision,
        enforcement_reason: enforcement.enforcement_reason,
        synced_at: new Date().toISOString(),
      },
      traceId: enforcement.trace_id,
      parentPacketId: null,
    });

    return { success: true, notionPageId };
  } catch (err: any) {
    console.error(`[NotionMailboxBridge] Failed to sync enforcement to Notion: ${err.message}`);
    return { success: false, error: err.message };
  }
}

// ─────────────────────────────────────────────────────────────────
// Batch Sync: Pending Proposals → Notion
// ─────────────────────────────────────────────────────────────────

/**
 * Find all pending proposals in the mailbox that haven't been synced to Notion yet,
 * and sync them.
 *
 * @returns Array of sync results
 */
export async function syncPendingProposalsToNotion(): Promise<NotionSyncResult[]> {
  const results: NotionSyncResult[] = [];

  // Read all pending proposals from the proposal mailbox
  const proposals = await readMailbox("proposal", {
    status: "pending",
    limit: 50,
  });

  // Find which ones already have a notion_sync_record
  const allProposalEntries = await readMailbox("proposal", { limit: 500 });
  const syncRecords = allProposalEntries.filter(r => r.packetType === "notion_sync_record");

  const syncedPacketIds = new Set(
    syncRecords.map(r => (r.payload as Record<string, unknown>).original_packet_id as string)
  );

  // Sync unsynchronized proposals
  for (const proposal of proposals) {
    if (syncedPacketIds.has(proposal.packetId)) continue;

    // Check if proposal has visible=true (or no visible field = default visible)
    const payload = proposal.payload as Record<string, unknown>;
    if (payload.visible === false) continue;

    const result = await syncProposalToNotion(proposal);
    results.push(result);
  }

  return results;
}

// ─────────────────────────────────────────────────────────────────
// Lookup: Find Notion Page ID for a Trace
// ─────────────────────────────────────────────────────────────────

/**
 * Look up the Notion page ID for a given trace_id.
 * Searches the proposal mailbox for notion_sync_record entries.
 *
 * @param traceId - The trace ID to look up
 * @returns The Notion page ID, or null if not found
 */
export async function findNotionPageIdForTrace(traceId: string): Promise<string | null> {
  const traceEntries = await getByTraceId(traceId);
  const syncRecord = traceEntries.find(e => e.packetType === "notion_sync_record");

  if (!syncRecord) return null;

  const payload = syncRecord.payload as Record<string, unknown>;
  return (payload.notion_page_id as string) || null;
}
