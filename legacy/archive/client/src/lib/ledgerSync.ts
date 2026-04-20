/**
 * RIO Ledger Sync — Client-Side Ledger Verification & Resync
 *
 * This module provides:
 *   1. Local ledger state tracking (last known hash, entry count)
 *   2. Server ledger comparison (detect drift / broken chain)
 *   3. Full resync: download the canonical ledger chain from the server
 *   4. Hash chain verification on the client side
 *
 * The local ledger state is stored in localStorage for persistence across
 * page reloads. The actual ledger entries are read from the server on demand.
 */

// ── Types ───────────────────────────────────────────────────────────────────

export interface LedgerEntry {
  block_id: string;
  intent_id: string;
  action: string;
  decision: string;
  receipt_hash?: string;
  previous_hash: string | null;
  current_hash: string;
  ledger_signature?: string;
  protocol_version?: string;
  timestamp: string;
  recorded_by?: string;
}

export interface LedgerSyncState {
  /** Number of entries the client has verified */
  verifiedCount: number;
  /** Hash of the last verified entry (chain tip) */
  lastVerifiedHash: string | null;
  /** Timestamp of last successful sync */
  lastSyncAt: string | null;
  /** Whether the local state matches the server */
  inSync: boolean;
  /** Any errors from the last sync attempt */
  lastError: string | null;
}

export interface LedgerSyncResult {
  success: boolean;
  entriesVerified: number;
  chainValid: boolean;
  errors: string[];
  serverTipHash: string | null;
  serverEntryCount: number;
}

// ── Local State Management ──────────────────────────────────────────────────

const STORAGE_KEY = "rio-ledger-sync-state";

export function getSyncState(): LedgerSyncState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch {
    // Corrupted state — reset
  }
  return {
    verifiedCount: 0,
    lastVerifiedHash: null,
    lastSyncAt: null,
    inSync: false,
    lastError: null,
  };
}

export function saveSyncState(state: LedgerSyncState): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

export function clearSyncState(): void {
  localStorage.removeItem(STORAGE_KEY);
}

// ── Hash Chain Verification ─────────────────────────────────────────────────

/**
 * Verify the hash chain of a set of ledger entries.
 * Returns { valid, errors, tipHash }.
 */
export function verifyHashChain(entries: LedgerEntry[]): {
  valid: boolean;
  errors: string[];
  tipHash: string | null;
} {
  const errors: string[] = [];

  if (entries.length === 0) {
    return { valid: true, errors: [], tipHash: null };
  }

  // Verify chain links
  for (let i = 1; i < entries.length; i++) {
    const prev = entries[i - 1];
    const curr = entries[i];

    if (curr.previous_hash !== prev.current_hash) {
      errors.push(
        `Chain break at entry ${i}: expected previous_hash=${prev.current_hash?.slice(0, 16)}... ` +
          `got ${curr.previous_hash?.slice(0, 16)}...`
      );
    }
  }

  const tipHash = entries[entries.length - 1].current_hash;
  return { valid: errors.length === 0, errors, tipHash };
}

// ── Sync Operations ─────────────────────────────────────────────────────────

/**
 * Perform a full ledger resync.
 *
 * @param fetchLedger - A function that fetches the ledger chain from the server.
 *                      This is injected so the module is not coupled to tRPC directly.
 * @returns LedgerSyncResult
 */
export async function resyncLedger(
  fetchLedger: () => Promise<{
    entries: LedgerEntry[];
    chain_valid: boolean;
    entry_count: number;
    errors?: string[];
  }>
): Promise<LedgerSyncResult> {
  try {
    // Fetch the full chain from the server
    const serverData = await fetchLedger();

    // Verify the chain locally
    const verification = verifyHashChain(serverData.entries);

    // Combine server and local verification errors
    const allErrors = [
      ...(serverData.errors || []),
      ...verification.errors,
    ];

    const chainValid = serverData.chain_valid && verification.valid;

    // Update local sync state
    const newState: LedgerSyncState = {
      verifiedCount: serverData.entry_count,
      lastVerifiedHash: verification.tipHash,
      lastSyncAt: new Date().toISOString(),
      inSync: chainValid,
      lastError: allErrors.length > 0 ? allErrors.join("; ") : null,
    };
    saveSyncState(newState);

    return {
      success: chainValid,
      entriesVerified: serverData.entry_count,
      chainValid,
      errors: allErrors,
      serverTipHash: verification.tipHash,
      serverEntryCount: serverData.entry_count,
    };
  } catch (err) {
    const errorMsg =
      err instanceof Error ? err.message : "Unknown sync error";

    const failState: LedgerSyncState = {
      ...getSyncState(),
      inSync: false,
      lastError: errorMsg,
    };
    saveSyncState(failState);

    return {
      success: false,
      entriesVerified: 0,
      chainValid: false,
      errors: [errorMsg],
      serverTipHash: null,
      serverEntryCount: 0,
    };
  }
}

/**
 * Quick health check: compare local state with server state.
 * Does NOT download the full chain — just checks entry count and tip hash.
 *
 * @param fetchHealth - A function that returns server ledger summary.
 */
export async function checkLedgerHealth(
  fetchHealth: () => Promise<{
    entry_count: number;
    tip_hash: string | null;
    chain_valid: boolean;
  }>
): Promise<{
  localState: LedgerSyncState;
  serverEntryCount: number;
  serverTipHash: string | null;
  serverChainValid: boolean;
  driftDetected: boolean;
}> {
  const localState = getSyncState();
  const serverHealth = await fetchHealth();

  const driftDetected =
    !localState.inSync ||
    localState.verifiedCount !== serverHealth.entry_count ||
    localState.lastVerifiedHash !== serverHealth.tip_hash ||
    !serverHealth.chain_valid;

  return {
    localState,
    serverEntryCount: serverHealth.entry_count,
    serverTipHash: serverHealth.tip_hash,
    serverChainValid: serverHealth.chain_valid,
    driftDetected,
  };
}
