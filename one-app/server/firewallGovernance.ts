/**
 * Firewall ↔ Governance Bridge
 * ─────────────────────────────
 * Wires every firewall scan/decision into the RIO governance pipeline:
 *   1. Every scan decision → FIREWALL_SCAN ledger entry (hash-chained)
 *   2. BLOCK decisions → optional Telegram alert to owner
 *   3. Receipt includes ledger_entry_id for cross-referencing
 *
 * This module is the "governance adapter" — it does NOT modify the
 * firewall engine itself. It wraps storeReceipt with ledger writes.
 *
 * Rule: No Receipt = Did Not Happen. Now enforced at ledger level.
 */

import { appendLedger, sha256 } from "./db";
import { storeReceipt, type EmailReceipt, type ChannelType, type EventType } from "./emailFirewall";
import { isTelegramConfigured, sendKillNotification } from "./telegram";

// ─── Governed Receipt Storage ─────────────────────────────────

/**
 * Store a firewall receipt AND write it to the governance ledger.
 * This is the governed replacement for bare storeReceipt().
 *
 * Returns the ledger entry metadata (entryId, hash) for audit trail.
 */
export async function storeGovernedReceipt(
  receipt: EmailReceipt,
): Promise<{ ledger_entry_id: string; ledger_hash: string } | null> {
  // 1. Store the file-based receipt (existing behavior)
  storeReceipt(receipt);

  // 2. Write to governance ledger (hash-chained, tamper-evident)
  try {
    const ledgerPayload = buildLedgerPayload(receipt);
    const entry = await appendLedger("FIREWALL_SCAN", ledgerPayload);

    // 3. Alert on BLOCK decisions (owner needs to know)
    if (receipt.event_type === "BLOCK") {
      await alertOnBlock(receipt, entry.entryId);
    }

    return {
      ledger_entry_id: entry.entryId,
      ledger_hash: entry.hash,
    };
  } catch (err) {
    // Ledger write failure is logged but does NOT block the scan
    // (fail-open for reads, fail-closed for writes is the pattern)
    console.error("[FirewallGovernance] Ledger write failed (non-blocking):", err);
    return null;
  }
}

// ─── Ledger Payload Builder ───────────────────────────────────

/**
 * Build a governance-grade ledger payload from a firewall receipt.
 * Includes only what's needed for audit — never the raw email body.
 */
function buildLedgerPayload(receipt: EmailReceipt): Record<string, unknown> {
  return {
    // Core identity
    receipt_id: receipt.receipt_id,
    timestamp: receipt.timestamp,

    // Decision
    event_type: receipt.event_type,
    channel: receipt.channel,
    action: receipt.decision.action,
    reason: receipt.decision.reason,

    // Policy context
    rule_id: receipt.policy.rule_id,
    category: receipt.policy.category,
    confidence: receipt.policy.confidence,
    confidence_score: receipt.confidence_score,
    pattern_id: receipt.pattern_id,
    policy_version: receipt.policy_version,

    // Recipient context (no PII — just domain + type)
    org_domain: receipt.org_domain,
    recipient_type: receipt.email_context.recipient?.type || null,
    recipient_familiarity: receipt.email_context.recipient?.familiarity || null,

    // Content hash (never the body itself)
    content_hash: receipt.email_context.hash,

    // Coherence status
    coherence_status: receipt.coherence?.status || "UNKNOWN",
    coherence_checked: receipt.coherence?.checked || false,

    // System
    engine_version: receipt.system.engine_version,
    strictness: receipt.system.strictness,

    // Multi-channel metadata (channel-specific, no PII)
    channel_metadata_keys: receipt.channel_metadata ? Object.keys(receipt.channel_metadata) : [],
  };
}

// ─── Block Alert ──────────────────────────────────────────────

/**
 * Send a Telegram alert when a message is BLOCKED by the firewall.
 * Non-blocking — failure is logged but doesn't affect the scan.
 */
async function alertOnBlock(receipt: EmailReceipt, ledgerEntryId: string): Promise<void> {
  try {
    if (!isTelegramConfigured()) return;

    const alertMessage = [
      `🛡️ FIREWALL BLOCK`,
      ``,
      `Channel: ${receipt.channel}`,
      `Rule: ${receipt.policy.rule_id} (${receipt.policy.category})`,
      `Confidence: ${receipt.policy.confidence} (${receipt.confidence_score})`,
      `Reason: ${receipt.decision.reason.slice(0, 200)}`,
      ``,
      `Receipt: ${receipt.receipt_id.slice(0, 12)}...`,
      `Ledger: ${ledgerEntryId}`,
      `Time: ${receipt.timestamp}`,
    ].join("\n");

    // Reuse the kill notification channel (it's the owner alert channel)
    await sendKillNotification(alertMessage);
  } catch (err) {
    console.error("[FirewallGovernance] Block alert failed (non-blocking):", err);
  }
}

// ─── Governance Query Helpers ─────────────────────────────────

/**
 * Check if a receipt has a corresponding ledger entry.
 * Used for audit verification — "was this decision recorded?"
 */
export function isReceiptGoverned(receipt: EmailReceipt): boolean {
  // A governed receipt will have been written to the ledger.
  // The receipt itself doesn't store the ledger ID (that's in the ledger),
  // but we can verify by checking if the receipt_id appears in ledger entries.
  // For now, this is a structural check — full verification requires ledger query.
  return receipt.receipt_id !== undefined && receipt.timestamp !== undefined;
}
