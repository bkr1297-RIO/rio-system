/**
 * RIO Ledger — PostgreSQL-Backed Append-Only Hash-Chained Record
 *
 * Every action that passes through the gateway is recorded here.
 * Each entry is linked to the previous via SHA-256, forming a
 * tamper-evident chain. The ledger is the source of truth.
 *
 * This module replaces the in-memory/JSON ledger with persistent
 * PostgreSQL storage. The exported interface is identical to ledger.mjs
 * so the route handlers require zero changes.
 */
import { createHash, randomUUID } from "node:crypto";
import pg from "pg";

const { Pool } = pg;

const GENESIS_HASH =
  "0000000000000000000000000000000000000000000000000000000000000000";

let pool = null;
let currentHash = GENESIS_HASH;
let _cache = []; // In-memory mirror for sync route handlers

function sha256(data) {
  return createHash("sha256").update(data).digest("hex");
}

/**
 * Auto-migration: create tables if they don't exist.
 * This runs on every boot but is idempotent (IF NOT EXISTS).
 */
async function autoMigrate(pool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS intents (
      id SERIAL PRIMARY KEY,
      intent_id UUID UNIQUE NOT NULL,
      action VARCHAR(255) NOT NULL,
      agent_id VARCHAR(255) NOT NULL,
      status VARCHAR(50) NOT NULL DEFAULT 'submitted',
      parameters JSONB,
      governance JSONB,
      "authorization" JSONB,
      execution JSONB,
      receipt JSONB,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS ledger_entries (
      id SERIAL PRIMARY KEY,
      entry_id UUID NOT NULL,
      intent_id UUID NOT NULL,
      action VARCHAR(255),
      agent_id VARCHAR(255),
      status VARCHAR(50) NOT NULL,
      detail TEXT,
      intent_hash VARCHAR(64),
      authorization_hash VARCHAR(64),
      execution_hash VARCHAR(64),
      receipt_hash VARCHAR(64),
      ledger_hash VARCHAR(64) NOT NULL,
      prev_hash VARCHAR(64) NOT NULL,
      timestamp TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS receipts (
      id SERIAL PRIMARY KEY,
      receipt_id UUID UNIQUE NOT NULL,
      intent_id UUID NOT NULL,
      action VARCHAR(255) NOT NULL,
      agent_id VARCHAR(255) NOT NULL,
      authorized_by VARCHAR(255),
      hash_chain JSONB NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS authorized_signers (
      id SERIAL PRIMARY KEY,
      signer_id VARCHAR(255) UNIQUE NOT NULL,
      public_key_hex VARCHAR(64) NOT NULL,
      display_name VARCHAR(255),
      role VARCHAR(50) DEFAULT 'approver',
      registered_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS idx_ledger_intent_id ON ledger_entries(intent_id);
    CREATE INDEX IF NOT EXISTS idx_ledger_status ON ledger_entries(status);
    CREATE INDEX IF NOT EXISTS idx_intents_status ON intents(status);
    CREATE INDEX IF NOT EXISTS idx_receipts_intent_id ON receipts(intent_id);
  `);
  console.log("[RIO Ledger-PG] Auto-migration complete — tables verified.");
}

/**
 * Initialize: connect to PostgreSQL, ensure tables exist, load cache.
 */
export async function initLedger() {
  pool = new Pool(
    process.env.DATABASE_URL
      ? {
          connectionString: process.env.DATABASE_URL,
          ssl: process.env.DATABASE_URL.includes("render.com")
            ? { rejectUnauthorized: false }
            : false,
        }
      : {
          host: process.env.PG_HOST || "localhost",
          port: parseInt(process.env.PG_PORT || "5432"),
          database: process.env.PG_DATABASE || "rio_ledger",
          user: process.env.PG_USER || "rio",
          password: process.env.PG_PASSWORD || "rio_gateway_2026",
        }
  );

  const client = await pool.connect();
  client.release();
  console.log("[RIO Ledger-PG] Connected to PostgreSQL.");

  // Ensure tables exist (idempotent)
  await autoMigrate(pool);

  // Load all existing entries into cache
  const result = await pool.query(
    "SELECT * FROM ledger_entries ORDER BY id ASC"
  );
  _cache = result.rows;

  if (_cache.length > 0) {
    currentHash = _cache[_cache.length - 1].ledger_hash;
  } else {
    currentHash = GENESIS_HASH;
  }

  console.log(
    `[RIO Ledger-PG] Loaded ${_cache.length} entries. Chain tip: ${currentHash.substring(0, 16)}...`
  );
}

/**
 * Append an entry to the ledger (synchronous for callers, async persist).
 */
export function appendEntry(data) {
  const prevHash = currentHash;
  const timestamp = new Date().toISOString();
  const entryId = randomUUID();

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

  // Update chain tip and cache synchronously
  currentHash = ledgerHash;
  _cache.push(entry);

  // Persist to PostgreSQL (fire-and-forget with error logging)
  pool
    .query(
      `INSERT INTO ledger_entries 
       (entry_id, prev_hash, ledger_hash, timestamp, intent_id, action, agent_id, status, detail, receipt_hash, authorization_hash, intent_hash)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
      [
        entryId, prevHash, ledgerHash, timestamp,
        data.intent_id, data.action, data.agent_id, data.status,
        data.detail, data.receipt_hash || null,
        data.authorization_hash || null, data.intent_hash || null,
      ]
    )
    .catch((err) => {
      console.error(
        `[RIO Ledger-PG] CRITICAL — Failed to persist entry ${entryId}: ${err.message}`
      );
    });

  return entry;
}

export function getEntries(limit, offset) {
  const s = offset || 0;
  return _cache.slice(s, s + (limit || 100));
}

export function getEntriesByIntent(intentId) {
  return _cache.filter((e) => e.intent_id === intentId);
}

export function getEntryCount() {
  return _cache.length;
}

export function getCurrentHash() {
  return currentHash;
}

/**
 * Get the latest (most recent) ledger entry.
 */
export function getLatestEntry() {
  if (_cache.length === 0) return null;
  return _cache[_cache.length - 1];
}

/**
 * Verify the entire hash chain.
 */
export function verifyChain() {
  if (_cache.length === 0) {
    return { valid: true, entries_checked: 0, first_invalid: null };
  }

  let prev = GENESIS_HASH;

  for (let i = 0; i < _cache.length; i++) {
    const e = _cache[i];

    if (e.prev_hash !== prev) {
      return {
        valid: false,
        entries_checked: i + 1,
        first_invalid: i,
        reason: `Entry ${i} prev_hash mismatch.`,
      };
    }

    const content = JSON.stringify({
      entry_id: e.entry_id,
      prev_hash: e.prev_hash,
      timestamp: e.timestamp,
      intent_id: e.intent_id,
      action: e.action,
      agent_id: e.agent_id,
      status: e.status,
      detail: e.detail,
      receipt_hash: e.receipt_hash || null,
      authorization_hash: e.authorization_hash || null,
      intent_hash: e.intent_hash || null,
    });

    const computed = sha256(content);
    if (computed !== e.ledger_hash) {
      return {
        valid: false,
        entries_checked: i + 1,
        first_invalid: i,
        reason: `Entry ${i} hash mismatch. Computed: ${computed}, Stored: ${e.ledger_hash}`,
      };
    }

    prev = e.ledger_hash;
  }

  return { valid: true, entries_checked: _cache.length, first_invalid: null };
}
