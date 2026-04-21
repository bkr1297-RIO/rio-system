/**
 * RIO Enforcement Core — Receipt + Ledger
 *
 * Ledger is:
 *   - append-only (no updates, no deletes)
 *   - hash-chained (each entry links to previous via prev_hash)
 *   - verifiable (recompute chain from genesis)
 *
 * Every execution attempt produces a receipt written to the ledger,
 * regardless of outcome (DENY, BLOCK, PENDING, EXECUTE, FAILURE).
 */
import { randomUUID, createHash } from "crypto";

// ---------------------------------------------------------------------------
// Genesis
// ---------------------------------------------------------------------------
const GENESIS_HASH = "0000000000000000000000000000000000000000000000000000000000000000";

// ---------------------------------------------------------------------------
// In-memory ledger (ordered array)
// ---------------------------------------------------------------------------
let entries = [];
let currentHash = GENESIS_HASH;

// ---------------------------------------------------------------------------
// Utility
// ---------------------------------------------------------------------------
function sha256(data) {
  return createHash("sha256").update(data).digest("hex");
}

// ---------------------------------------------------------------------------
// Write a receipt to the ledger
// ---------------------------------------------------------------------------
/**
 * @param {object} data
 * @param {string} data.decision      — EXECUTE | DENY | BLOCK | PENDING | FAILURE
 * @param {string|null} data.reason_code — error vocabulary code or null
 * @param {string} data.detail        — human-readable detail
 * @param {string} data.trace_id      — trace/session ID
 * @param {object} [data.intent]      — the intent object
 * @param {string} [data.payload_hash] — sha256 of intent+payload
 * @param {object} [data.execution_result] — result of execution (if any)
 * @param {string} [data.timestamp]   — ISO timestamp
 * @returns {object} the ledger entry (receipt)
 */
export function writeReceipt(data) {
  const entry_id = randomUUID();
  const timestamp = data.timestamp || new Date().toISOString();
  const prev_hash = currentHash;

  const receipt = {
    entry_id,
    prev_hash,
    timestamp,
    trace_id: data.trace_id || null,
    decision: data.decision,
    reason_code: data.reason_code || null,
    detail: data.detail || null,
    intent: data.intent || null,
    payload_hash: data.payload_hash || null,
    execution_result: data.execution_result || null,
  };

  // Compute the receipt_hash over the canonical content
  const hashContent = JSON.stringify({
    entry_id: receipt.entry_id,
    prev_hash: receipt.prev_hash,
    timestamp: receipt.timestamp,
    trace_id: receipt.trace_id,
    decision: receipt.decision,
    reason_code: receipt.reason_code,
    detail: receipt.detail,
    payload_hash: receipt.payload_hash,
  });
  const receipt_hash = sha256(hashContent);

  const entry = {
    ...receipt,
    receipt_hash,
  };

  entries.push(entry);
  currentHash = receipt_hash;

  return entry;
}

// ---------------------------------------------------------------------------
// Read
// ---------------------------------------------------------------------------
export function getEntries() {
  return [...entries];
}

export function getEntryCount() {
  return entries.length;
}

export function getLastEntry() {
  return entries.length > 0 ? entries[entries.length - 1] : null;
}

export function getEntriesByTrace(trace_id) {
  return entries.filter((e) => e.trace_id === trace_id);
}

// ---------------------------------------------------------------------------
// Verify the entire hash chain
// ---------------------------------------------------------------------------
/**
 * @returns {{ valid: boolean, entries_checked: number, first_invalid: number|null, reason: string|null }}
 */
export function verifyChain() {
  if (entries.length === 0) {
    return { valid: true, entries_checked: 0, first_invalid: null, reason: null };
  }

  let prevHash = GENESIS_HASH;

  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i];

    // Check prev_hash linkage
    if (entry.prev_hash !== prevHash) {
      return {
        valid: false,
        entries_checked: i + 1,
        first_invalid: i,
        reason: `Entry ${i} prev_hash mismatch. Expected: ${prevHash}, Got: ${entry.prev_hash}`,
      };
    }

    // Recompute hash
    const hashContent = JSON.stringify({
      entry_id: entry.entry_id,
      prev_hash: entry.prev_hash,
      timestamp: entry.timestamp,
      trace_id: entry.trace_id,
      decision: entry.decision,
      reason_code: entry.reason_code,
      detail: entry.detail,
      payload_hash: entry.payload_hash,
    });
    const computedHash = sha256(hashContent);

    if (computedHash !== entry.receipt_hash) {
      return {
        valid: false,
        entries_checked: i + 1,
        first_invalid: i,
        reason: `Entry ${i} receipt_hash mismatch. Computed: ${computedHash}, Stored: ${entry.receipt_hash}`,
      };
    }

    prevHash = entry.receipt_hash;
  }

  return { valid: true, entries_checked: entries.length, first_invalid: null, reason: null };
}

// ---------------------------------------------------------------------------
// Reset (testing only)
// ---------------------------------------------------------------------------
export function clearLedger() {
  entries = [];
  currentHash = GENESIS_HASH;
}
