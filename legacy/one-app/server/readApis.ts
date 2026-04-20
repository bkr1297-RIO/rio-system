/**
 * RIO Read APIs
 * ─────────────
 * Exposes read-only views of system state from Drive:
 *   - getLastAction()    → most recent governed action
 *   - getActionHistory() → paginated ledger entries
 *   - getSystemState()   → combined anchor + chain integrity + server status
 *
 * All reads come from Drive (anchor.json + ledger.json).
 * These are pure reads — no mutations, no Gateway calls, no receipts.
 */

import { readAnchor, readLedger, type AnchorState, type LedgerEntry } from "./librarian";
import { verifyChainIntegrity, type ChainVerificationResult } from "./driveRestore";
import { getLastReceiptHash } from "./authorityLayer";

// ─── Types ─────────────────────────────────────────────────────

export interface LastAction {
  receipt_id: string;
  receipt_hash: string;
  previous_receipt_hash: string;
  proposer_id: string;
  approver_id: string;
  decision: string;
  timestamp: string;
  // Enriched fields (if present in newer entries)
  action_type?: string;
  action_target?: string;
  execution_status?: string;
}

export interface ActionHistoryResult {
  entries: LedgerEntry[];
  total: number;
  offset: number;
  limit: number;
  chain_valid: boolean;
}

export interface SystemState {
  // Anchor state (from Drive)
  anchor: AnchorState | null;
  anchor_available: boolean;

  // Chain state
  chain: ChainVerificationResult | null;
  chain_available: boolean;

  // Server state
  server: {
    last_receipt_hash: string;
    uptime_ms: number;
    timestamp: string;
  };
}

// ─── Server start time ─────────────────────────────────────────

const SERVER_START_TIME = Date.now();

// ─── Read APIs ─────────────────────────────────────────────────

/**
 * Get the most recent governed action from Drive ledger.
 * Returns null if no actions exist.
 */
export async function getLastAction(): Promise<LastAction | null> {
  try {
    const entries = await readLedger();
    if (entries.length === 0) return null;

    const last = entries[entries.length - 1];
    return {
      receipt_id: last.receipt_id,
      receipt_hash: last.receipt_hash,
      previous_receipt_hash: last.previous_receipt_hash,
      proposer_id: last.proposer_id,
      approver_id: last.approver_id,
      decision: last.decision,
      timestamp: last.timestamp,
      // Include enriched fields if they exist on newer entries
      ...((last as unknown as Record<string, unknown>).action_type ? {
        action_type: String((last as unknown as Record<string, unknown>).action_type),
      } : {}),
      ...((last as unknown as Record<string, unknown>).action_target ? {
        action_target: String((last as unknown as Record<string, unknown>).action_target),
      } : {}),
      ...((last as unknown as Record<string, unknown>).execution_status ? {
        execution_status: String((last as unknown as Record<string, unknown>).execution_status),
      } : {}),
    };
  } catch (err) {
    console.log(`[ReadAPI] getLastAction failed: ${err instanceof Error ? err.message : String(err)}`);
    return null;
  }
}

/**
 * Get paginated action history from Drive ledger.
 * Returns entries in reverse chronological order (newest first).
 */
export async function getActionHistory(
  limit: number = 20,
  offset: number = 0,
): Promise<ActionHistoryResult> {
  try {
    const allEntries = await readLedger();
    const total = allEntries.length;

    // Reverse for newest-first, then paginate
    const reversed = [...allEntries].reverse();
    const entries = reversed.slice(offset, offset + limit);

    // Verify chain integrity on the full set
    const chainResult = verifyChainIntegrity(allEntries);

    return {
      entries,
      total,
      offset,
      limit,
      chain_valid: chainResult.valid,
    };
  } catch (err) {
    console.log(`[ReadAPI] getActionHistory failed: ${err instanceof Error ? err.message : String(err)}`);
    return {
      entries: [],
      total: 0,
      offset,
      limit,
      chain_valid: false,
    };
  }
}

/**
 * Get combined system state: anchor + chain integrity + server status.
 */
export async function getSystemState(): Promise<SystemState> {
  let anchor: AnchorState | null = null;
  let anchorAvailable = false;
  let chain: ChainVerificationResult | null = null;
  let chainAvailable = false;

  try {
    anchor = await readAnchor();
    anchorAvailable = anchor !== null && !!anchor.last_receipt_hash;
  } catch {
    // fail-silent
  }

  try {
    const entries = await readLedger();
    if (entries.length > 0) {
      chain = verifyChainIntegrity(entries);
      chainAvailable = true;
    }
  } catch {
    // fail-silent
  }

  return {
    anchor,
    anchor_available: anchorAvailable,
    chain,
    chain_available: chainAvailable,
    server: {
      last_receipt_hash: getLastReceiptHash(),
      uptime_ms: Date.now() - SERVER_START_TIME,
      timestamp: new Date().toISOString(),
    },
  };
}
