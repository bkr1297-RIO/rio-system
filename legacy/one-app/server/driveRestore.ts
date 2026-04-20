/**
 * RIO Drive Startup Restore
 * ─────────────────────────
 * On server startup, reads anchor.json + ledger.json from Drive
 * to restore system state:
 *   - Sets lastReceiptHash in authorityLayer (chain continuity)
 *   - Verifies receipt chain integrity
 *   - Logs chain length and last action
 *
 * Constraints:
 *   - Fail-safe: if Drive is unreachable or chain breaks, log and continue
 *   - Does NOT modify Gateway/Postgres — Drive is read-only source
 *   - Does NOT block server startup
 */

import { readAnchor, readLedger, type AnchorState, type LedgerEntry } from "./librarian";
import { setLastReceiptHash, getLastReceiptHash } from "./authorityLayer";

// ─── Chain Integrity Verification ─────────────────────────────

export interface ChainVerificationResult {
  valid: boolean;
  chain_length: number;
  first_receipt_id: string | null;
  last_receipt_id: string | null;
  last_receipt_hash: string | null;
  break_at_index: number | null;     // index where chain breaks, null if valid
  break_details: string | null;       // human-readable description of the break
}

/**
 * Verify the integrity of a ledger chain.
 * Each entry's previous_receipt_hash must match the prior entry's receipt_hash.
 * The first entry's previous_receipt_hash should be the genesis hash (all zeros)
 * or the hash from a prior chain segment.
 */
export function verifyChainIntegrity(entries: LedgerEntry[]): ChainVerificationResult {
  if (entries.length === 0) {
    return {
      valid: true,
      chain_length: 0,
      first_receipt_id: null,
      last_receipt_id: null,
      last_receipt_hash: null,
      break_at_index: null,
      break_details: null,
    };
  }

  // Walk the chain: each entry[i].previous_receipt_hash should match entry[i-1].receipt_hash
  for (let i = 1; i < entries.length; i++) {
    const prev = entries[i - 1];
    const curr = entries[i];

    if (curr.previous_receipt_hash !== prev.receipt_hash) {
      return {
        valid: false,
        chain_length: entries.length,
        first_receipt_id: entries[0].receipt_id,
        last_receipt_id: entries[entries.length - 1].receipt_id,
        last_receipt_hash: entries[entries.length - 1].receipt_hash,
        break_at_index: i,
        break_details: `Entry ${i} (${curr.receipt_id}) has previous_receipt_hash="${curr.previous_receipt_hash}" but entry ${i - 1} (${prev.receipt_id}) has receipt_hash="${prev.receipt_hash}"`,
      };
    }
  }

  return {
    valid: true,
    chain_length: entries.length,
    first_receipt_id: entries[0].receipt_id,
    last_receipt_id: entries[entries.length - 1].receipt_id,
    last_receipt_hash: entries[entries.length - 1].receipt_hash,
    break_at_index: null,
    break_details: null,
  };
}

// ─── Startup Restore ──────────────────────────────────────────

export interface RestoreResult {
  success: boolean;
  anchor_loaded: boolean;
  ledger_loaded: boolean;
  chain_verification: ChainVerificationResult | null;
  last_receipt_hash_restored: string | null;
  error?: string;
}

/**
 * Restore system state from Drive on server startup.
 * Reads anchor.json → sets lastReceiptHash.
 * Reads ledger.json → verifies chain integrity.
 *
 * Fail-safe: logs errors but never throws or blocks startup.
 */
export async function restoreFromDrive(): Promise<RestoreResult> {
  console.log("[DriveRestore] Starting state restoration from Drive...");

  try {
    // 1. Read anchor.json
    let anchor: AnchorState | null = null;
    let anchorLoaded = false;
    try {
      anchor = await readAnchor();
      if (anchor && anchor.last_receipt_hash) {
        anchorLoaded = true;
        console.log(`[DriveRestore] Anchor loaded: last_receipt_hash=${anchor.last_receipt_hash.substring(0, 16)}..., state=${anchor.system_state}`);
      } else {
        console.log("[DriveRestore] Anchor empty or missing — starting fresh");
      }
    } catch (err) {
      console.log(`[DriveRestore] Anchor read failed: ${err instanceof Error ? err.message : String(err)}`);
    }

    // 2. Read ledger.json
    let entries: LedgerEntry[] = [];
    let ledgerLoaded = false;
    try {
      entries = await readLedger();
      ledgerLoaded = entries.length > 0;
      console.log(`[DriveRestore] Ledger loaded: ${entries.length} entries`);
    } catch (err) {
      console.log(`[DriveRestore] Ledger read failed: ${err instanceof Error ? err.message : String(err)}`);
    }

    // 3. Verify chain integrity
    let chainVerification: ChainVerificationResult | null = null;
    if (ledgerLoaded) {
      chainVerification = verifyChainIntegrity(entries);
      if (chainVerification.valid) {
        console.log(`[DriveRestore] Chain integrity: VALID (${chainVerification.chain_length} entries)`);
      } else {
        console.log(`[DriveRestore] ⚠ CHAIN_INTEGRITY_FAILURE at index ${chainVerification.break_at_index}: ${chainVerification.break_details}`);
        // Do NOT block — log and continue
      }
    }

    // 4. Restore lastReceiptHash
    let restoredHash: string | null = null;

    // Prefer anchor (most recent single value) over ledger tail
    if (anchorLoaded && anchor?.last_receipt_hash) {
      restoredHash = anchor.last_receipt_hash;
    } else if (ledgerLoaded && entries.length > 0) {
      // Fall back to last ledger entry
      restoredHash = entries[entries.length - 1].receipt_hash;
    }

    if (restoredHash) {
      const currentHash = getLastReceiptHash();
      const isGenesis = currentHash === "0000000000000000000000000000000000000000000000000000000000000000";

      if (isGenesis) {
        setLastReceiptHash(restoredHash);
        console.log(`[DriveRestore] lastReceiptHash restored: ${restoredHash.substring(0, 16)}... (was genesis)`);
      } else {
        // Already has a non-genesis hash — only update if Drive has newer data
        // (In practice, this means another process set it before us)
        console.log(`[DriveRestore] lastReceiptHash already set: ${currentHash.substring(0, 16)}... — keeping current`);
      }
    } else {
      console.log("[DriveRestore] No receipt hash to restore — starting from genesis");
    }

    const result: RestoreResult = {
      success: anchorLoaded || ledgerLoaded,
      anchor_loaded: anchorLoaded,
      ledger_loaded: ledgerLoaded,
      chain_verification: chainVerification,
      last_receipt_hash_restored: restoredHash,
    };

    console.log(`[DriveRestore] Restore complete: success=${result.success}, anchor=${anchorLoaded}, ledger=${ledgerLoaded}`);
    return result;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.log(`[DriveRestore] Restore FAILED (non-blocking): ${msg}`);
    return {
      success: false,
      anchor_loaded: false,
      ledger_loaded: false,
      chain_verification: null,
      last_receipt_hash_restored: null,
      error: msg,
    };
  }
}
