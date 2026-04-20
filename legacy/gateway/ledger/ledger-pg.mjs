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
      protocol_receipt JSONB,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    -- Add protocol_receipt column if table already exists without it
    ALTER TABLE receipts ADD COLUMN IF NOT EXISTS protocol_receipt JSONB;

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

    -- Approvals table: separate record of each approval decision
    CREATE TABLE IF NOT EXISTS approvals (
      id              SERIAL PRIMARY KEY,
      approval_id     UUID UNIQUE NOT NULL,
      intent_id       UUID NOT NULL,
      approver_id     VARCHAR(255) NOT NULL,
      decision        VARCHAR(20) NOT NULL,
      reason          TEXT,
      signature       TEXT,
      signature_payload_hash VARCHAR(64),
      ed25519_signed  BOOLEAN DEFAULT FALSE,
      principal_id    VARCHAR(255),
      principal_role  VARCHAR(50),
      created_at      TIMESTAMPTZ DEFAULT NOW(),
      CONSTRAINT valid_approval_decision CHECK (
        decision IN ('approved', 'denied')
      )
    );
    CREATE INDEX IF NOT EXISTS idx_approvals_intent_id ON approvals(intent_id);
    CREATE INDEX IF NOT EXISTS idx_approvals_approver_id ON approvals(approver_id);

    -- Authorization tokens: DB-backed single-use execution tokens
    -- Lifecycle: ACTIVE → USED → EXPIRED
    CREATE TABLE IF NOT EXISTS authorization_tokens (
      id              SERIAL PRIMARY KEY,
      token_id        UUID UNIQUE NOT NULL,
      intent_id       UUID NOT NULL,
      approval_id     UUID,
      tool_name       VARCHAR(255) NOT NULL,
      args_hash       VARCHAR(64) NOT NULL,
      environment     VARCHAR(100) NOT NULL DEFAULT 'production',
      nonce           VARCHAR(64) NOT NULL,
      max_executions  INTEGER NOT NULL DEFAULT 1,
      execution_count INTEGER NOT NULL DEFAULT 0,
      status          VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
      signature       TEXT,
      issued_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      expires_at      TIMESTAMPTZ NOT NULL,
      burned_at       TIMESTAMPTZ,
      created_at      TIMESTAMPTZ DEFAULT NOW(),
      CONSTRAINT valid_token_status CHECK (
        status IN ('ACTIVE', 'USED', 'EXPIRED')
      )
    );
    CREATE INDEX IF NOT EXISTS idx_auth_tokens_intent_id ON authorization_tokens(intent_id);
    CREATE INDEX IF NOT EXISTS idx_auth_tokens_status ON authorization_tokens(status);
  `);
  console.log("[RIO Ledger-PG] Auto-migration complete — tables verified (incl. authorization_tokens).");
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
  // CRITICAL: PostgreSQL returns TIMESTAMPTZ columns as JavaScript Date objects.
  // The ledger hashes were computed using ISO string timestamps (new Date().toISOString()).
  // We must normalize timestamps back to ISO strings for chain verification to work.
  _cache = result.rows.map((row) => ({
    ...row,
    timestamp:
      row.timestamp instanceof Date
        ? row.timestamp.toISOString()
        : typeof row.timestamp === "string"
          ? row.timestamp
          : new Date(row.timestamp).toISOString(),
  }));

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

// =========================================================================
// Approvals — PostgreSQL-backed approval records
// =========================================================================

/**
 * Create an approval record in the approvals table.
 * Returns the created approval object.
 */
export async function createApproval(data) {
  const approvalId = randomUUID();
  const timestamp = new Date().toISOString();
  
  const approval = {
    approval_id: approvalId,
    intent_id: data.intent_id,
    approver_id: data.approver_id,
    decision: data.decision,
    reason: data.reason || null,
    signature: data.signature || null,
    signature_payload_hash: data.signature_payload_hash || null,
    ed25519_signed: data.ed25519_signed || false,
    principal_id: data.principal_id || null,
    principal_role: data.principal_role || null,
    created_at: timestamp,
  };

  await pool.query(
    `INSERT INTO approvals 
     (approval_id, intent_id, approver_id, decision, reason, signature, signature_payload_hash, ed25519_signed, principal_id, principal_role, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
    [
      approvalId, data.intent_id, data.approver_id, data.decision,
      data.reason || null, data.signature || null,
      data.signature_payload_hash || null, data.ed25519_signed || false,
      data.principal_id || null, data.principal_role || null, timestamp,
    ]
  );

  return approval;
}

/**
 * Get all approvals for an intent.
 */
export async function getApprovalsByIntent(intentId) {
  const result = await pool.query(
    "SELECT * FROM approvals WHERE intent_id = $1 ORDER BY created_at ASC",
    [intentId]
  );
  return result.rows;
}

/**
 * Check if a specific approver has already approved/denied an intent.
 */
export async function getApprovalByApprover(intentId, approverId) {
  const result = await pool.query(
    "SELECT * FROM approvals WHERE intent_id = $1 AND approver_id = $2 LIMIT 1",
    [intentId, approverId]
  );
  return result.rows[0] || null;
}

/**
 * Get all pending intents that need approval (status = 'governed' with REQUIRE_HUMAN or REQUIRE_QUORUM).
 */
export async function getPendingApprovals() {
  const result = await pool.query(
    `SELECT * FROM intents 
     WHERE status = 'governed' 
     AND (governance->>'governance_decision' = 'REQUIRE_HUMAN' 
          OR governance->>'governance_decision' = 'REQUIRE_QUORUM')
     ORDER BY created_at DESC`
  );
  return result.rows;
}

// =========================================================================
// Receipts — PostgreSQL-backed protocol-format receipt storage
// =========================================================================

/**
 * Store a full protocol-format receipt in the receipts table.
 * The protocol_receipt column holds the entire receipt JSON.
 */
export async function storeReceipt(receipt) {
  if (!pool) {
    console.error("[RIO Ledger-PG] Cannot store receipt — pool not initialized");
    return;
  }
  try {
    await pool.query(
      `INSERT INTO receipts (receipt_id, intent_id, action, agent_id, authorized_by, hash_chain, protocol_receipt)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (receipt_id) DO NOTHING`,
      [
        receipt.receipt_id,
        receipt.intent_id || receipt.hash_chain?.intent_id || null,
        receipt.action || null,
        receipt.agent_id || null,
        receipt.authorized_by || receipt.approver_id || null,
        JSON.stringify(receipt.hash_chain || {}),
        JSON.stringify(receipt),
      ]
    );
    console.log(`[RIO Ledger-PG] Receipt stored: ${receipt.receipt_id}`);
  } catch (err) {
    console.error(`[RIO Ledger-PG] Failed to store receipt ${receipt.receipt_id}: ${err.message}`);
  }
}

/**
 * Get recent protocol-format receipts from PostgreSQL.
 * Returns full receipt JSON objects that survive redeploys.
 */
export async function getRecentReceipts(limit = 20) {
  if (!pool) return [];
  try {
    const result = await pool.query(
      `SELECT protocol_receipt FROM receipts ORDER BY created_at DESC LIMIT $1`,
      [limit]
    );
    return result.rows.map((r) => r.protocol_receipt);
  } catch (err) {
    console.error(`[RIO Ledger-PG] Failed to fetch recent receipts: ${err.message}`);
    return [];
  }
}

export function verifyChain() {
  if (_cache.length === 0) {
    return { valid: true, entries_checked: 0, first_invalid: null, epochs: 1 };
  }

  let prev = GENESIS_HASH;
  let linkageBreaks = [];
  let hashMismatches = [];
  let currentEpochStart = 0;

  for (let i = 0; i < _cache.length; i++) {
    const e = _cache[i];

    // Check prev_hash linkage
    if (e.prev_hash !== prev) {
      linkageBreaks.push(i);
      currentEpochStart = i; // New epoch starts here
    }

    // Recompute hash to verify integrity
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
      hashMismatches.push({ index: i, computed, stored: e.ledger_hash });
    }

    prev = e.ledger_hash;
  }

  // Chain is valid if ALL hashes verify and ALL linkages are correct
  const fullChainValid = hashMismatches.length === 0 && linkageBreaks.length === 0;
  // Current epoch is valid if no hash mismatches exist in the current epoch
  const currentEpochEntries = _cache.length - currentEpochStart;
  const currentEpochHashOk = hashMismatches.every((m) => m.index < currentEpochStart);

  return {
    valid: fullChainValid,
    entries_checked: _cache.length,
    first_invalid: linkageBreaks.length > 0 ? linkageBreaks[0] : (hashMismatches.length > 0 ? hashMismatches[0].index : null),
    hashes_verified: _cache.length - hashMismatches.length,
    hash_mismatches: hashMismatches.length,
    linkage_breaks: linkageBreaks.length,
    epochs: linkageBreaks.length + 1,
    current_epoch: {
      start_index: currentEpochStart,
      entries: currentEpochEntries,
      valid: currentEpochHashOk,
    },
    reason: fullChainValid
      ? null
      : linkageBreaks.length > 0
        ? `${linkageBreaks.length} linkage break(s) from Gateway redeploys. ${hashMismatches.length} hash mismatch(es). Current epoch (${currentEpochEntries} entries) is ${currentEpochHashOk ? "valid" : "invalid"}.`
        : `${hashMismatches.length} hash mismatch(es).`,
  };
}
