/**
 * RIO Ledger — Append-Only Hash-Chained Record
 *
 * Every action that passes through the gateway is recorded here.
 * Each entry is linked to the previous via SHA-256, forming a
 * tamper-evident chain. The ledger is the source of truth.
 *
 * In production, this would be backed by a database or distributed
 * ledger. For the MVP, it uses an in-memory array with file persistence.
 */
import { createHash, randomUUID } from "node:crypto";
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, "..", "data");
const LEDGER_FILE = join(DATA_DIR, "ledger.json");

// Genesis hash — the anchor of the chain
const GENESIS_HASH = "0000000000000000000000000000000000000000000000000000000000000000";

let entries = [];
let currentHash = GENESIS_HASH;

/**
 * Initialize the ledger. Load from disk if exists.
 */
export function initLedger() {
  mkdirSync(DATA_DIR, { recursive: true });
  if (existsSync(LEDGER_FILE)) {
    try {
      const raw = readFileSync(LEDGER_FILE, "utf-8");
      entries = JSON.parse(raw);
      if (entries.length > 0) {
        currentHash = entries[entries.length - 1].ledger_hash;
      }
      console.log(`[RIO Ledger] Loaded ${entries.length} entries from disk.`);
    } catch (err) {
      console.error(`[RIO Ledger] Failed to load ledger: ${err.message}. Starting fresh.`);
      entries = [];
      currentHash = GENESIS_HASH;
    }
  } else {
    console.log("[RIO Ledger] No existing ledger found. Starting fresh.");
  }
}

/**
 * Compute SHA-256 hash of a string.
 */
function sha256(data) {
  return createHash("sha256").update(data).digest("hex");
}

/**
 * Append an entry to the ledger.
 *
 * @param {object} data - Entry data
 * @param {string} data.intent_id - The intent this entry relates to
 * @param {string} data.action - The action performed
 * @param {string} data.agent_id - The agent that requested the action
 * @param {string} data.status - Entry status (submitted, governed, authorized, executed, denied, blocked)
 * @param {string} data.detail - Human-readable detail
 * @param {string} [data.receipt_hash] - Hash of the associated receipt
 * @param {string} [data.authorization_hash] - Hash of the authorization record
 * @param {string} [data.intent_hash] - Hash of the original intent
 * @returns {object} The new ledger entry
 */
export function appendEntry(data) {
  const prevHash = currentHash;
  const timestamp = new Date().toISOString();
  const entryId = randomUUID();

  // Build the entry content for hashing
  const entryContent = JSON.stringify({
    entry_id: entryId,
    prev_hash: prevHash,
    timestamp,
    intent_id: data.intent_id,
    action: data.action,
    agent_id: data.agent_id,
    status: data.status,
    detail: data.detail,
    receipt_hash: data.receipt_hash || null,
    authorization_hash: data.authorization_hash || null,
    intent_hash: data.intent_hash || null,
  });

  const ledgerHash = sha256(entryContent);

  const entry = {
    entry_id: entryId,
    prev_hash: prevHash,
    ledger_hash: ledgerHash,
    timestamp,
    intent_id: data.intent_id,
    action: data.action,
    agent_id: data.agent_id,
    status: data.status,
    detail: data.detail,
    receipt_hash: data.receipt_hash || null,
    authorization_hash: data.authorization_hash || null,
    intent_hash: data.intent_hash || null,
  };

  entries.push(entry);
  currentHash = ledgerHash;

  // Persist to disk
  persist();

  return entry;
}

/**
 * Get all ledger entries.
 */
export function getEntries(limit, offset) {
  const start = offset || 0;
  const end = limit ? start + limit : entries.length;
  return entries.slice(start, end);
}

/**
 * Get entries for a specific intent.
 */
export function getEntriesByIntent(intentId) {
  return entries.filter((e) => e.intent_id === intentId);
}

/**
 * Get the total number of entries.
 */
export function getEntryCount() {
  return entries.length;
}

/**
 * Verify the entire hash chain.
 * Returns { valid: boolean, entries_checked: number, first_invalid: number|null }
 */
export function verifyChain() {
  if (entries.length === 0) {
    return { valid: true, entries_checked: 0, first_invalid: null };
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

    // Recompute the hash
    const entryContent = JSON.stringify({
      entry_id: entry.entry_id,
      prev_hash: entry.prev_hash,
      timestamp: entry.timestamp,
      intent_id: entry.intent_id,
      action: entry.action,
      agent_id: entry.agent_id,
      status: entry.status,
      detail: entry.detail,
      receipt_hash: entry.receipt_hash || null,
      authorization_hash: entry.authorization_hash || null,
      intent_hash: entry.intent_hash || null,
    });

    const computedHash = sha256(entryContent);
    if (computedHash !== entry.ledger_hash) {
      return {
        valid: false,
        entries_checked: i + 1,
        first_invalid: i,
        reason: `Entry ${i} ledger_hash mismatch. Computed: ${computedHash}, Stored: ${entry.ledger_hash}`,
      };
    }

    prevHash = entry.ledger_hash;
  }

  return { valid: true, entries_checked: entries.length, first_invalid: null };
}

/**
 * Persist ledger to disk.
 */
function persist() {
  try {
    writeFileSync(LEDGER_FILE, JSON.stringify(entries, null, 2));
  } catch (err) {
    console.error(`[RIO Ledger] Failed to persist: ${err.message}`);
  }
}

/**
 * Get the current chain tip hash.
 */
export function getCurrentHash() {
  return currentHash;
}
