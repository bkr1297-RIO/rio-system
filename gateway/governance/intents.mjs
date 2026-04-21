/**
 * RIO Intent Store — PostgreSQL-Backed
 *
 * Tracks intents as they move through the governance pipeline:
 *   submitted → governed → authorized/denied → executed → receipted
 *
 * Backed by the same PostgreSQL instance used by the ledger.
 * Shares the connection pool via getPool().
 *
 * The exported interface is identical to the previous in-memory version
 * so all route handlers require zero changes.
 */
import { randomUUID } from "node:crypto";
import { getPool } from "../ledger/ledger-pg.mjs";

// ─── In-memory cache for synchronous reads ───────────────────────
// Routes call getIntent/listIntents synchronously. We maintain a
// write-through cache so reads are instant while writes persist to PG.
const cache = new Map();
let _initialized = false;

/**
 * Initialize: load all intents from PostgreSQL into cache.
 * Must be called after initLedger() (which creates the pool and tables).
 */
export async function initIntentStore() {
  const pool = getPool();
  if (!pool) {
    throw new Error("[Intent Store] PostgreSQL pool not available. Call initLedger() first.");
  }

  // Add columns that the in-memory store tracked but the original table lacked.
  // These are idempotent (IF NOT EXISTS).
  await pool.query(`
    ALTER TABLE intents ADD COLUMN IF NOT EXISTS description TEXT DEFAULT '';
    ALTER TABLE intents ADD COLUMN IF NOT EXISTS confidence REAL DEFAULT 0;
    ALTER TABLE intents ADD COLUMN IF NOT EXISTS target_environment VARCHAR(100) DEFAULT 'local';
    ALTER TABLE intents ADD COLUMN IF NOT EXISTS principal_id VARCHAR(255);
    ALTER TABLE intents ADD COLUMN IF NOT EXISTS principal_role VARCHAR(100);
    ALTER TABLE intents ADD COLUMN IF NOT EXISTS _intake JSONB;
    ALTER TABLE intents ADD COLUMN IF NOT EXISTS _auth_method VARCHAR(100);
    ALTER TABLE intents ADD COLUMN IF NOT EXISTS _api_key_id VARCHAR(255);
    ALTER TABLE intents ADD COLUMN IF NOT EXISTS timestamp TIMESTAMPTZ DEFAULT NOW();
  `);

  // Load existing intents into cache
  const result = await pool.query("SELECT * FROM intents ORDER BY id ASC");
  for (const row of result.rows) {
    const intent = rowToIntent(row);
    cache.set(intent.intent_id, intent);
  }

  _initialized = true;
  console.log(`[RIO Intent Store] PostgreSQL-backed — loaded ${cache.size} intents from database.`);
}

/**
 * Convert a PostgreSQL row to the intent object shape expected by routes.
 */
function rowToIntent(row) {
  return {
    intent_id: row.intent_id,
    action: row.action,
    agent_id: row.agent_id,
    target_environment: row.target_environment || "local",
    parameters: row.parameters || {},
    confidence: row.confidence ?? 0,
    description: row.description || "",
    timestamp: row.timestamp instanceof Date
      ? row.timestamp.toISOString()
      : row.timestamp || row.created_at?.toISOString() || new Date().toISOString(),
    status: row.status,
    governance: row.governance || null,
    authorization: row.authorization || null,
    execution: row.execution || null,
    receipt: row.receipt || null,
    principal_id: row.principal_id || null,
    principal_role: row.principal_role || null,
    _intake: row._intake || null,
    _auth_method: row._auth_method || null,
    _api_key_id: row._api_key_id || null,
  };
}

/**
 * Create a new intent.
 */
export function createIntent(data) {
  const intentId = randomUUID();
  const timestamp = new Date().toISOString();

  const intent = {
    intent_id: intentId,
    action: data.action,
    agent_id: data.agent_id,
    target_environment: data.target_environment || "local",
    parameters: data.parameters || {},
    confidence: data.confidence ?? 0,
    description: data.description || "",
    timestamp,
    status: "submitted",
    governance: null,
    authorization: null,
    execution: null,
    receipt: null,
    principal_id: data.principal_id || null,
    principal_role: data.principal_role || null,
    _intake: data._intake || null,
    _auth_method: data._auth_method || null,
    _api_key_id: data._api_key_id || null,
  };

  // Write-through: cache first (synchronous), then persist (async, fire-and-forget with error logging)
  cache.set(intentId, intent);
  persistCreate(intent).catch((err) =>
    console.error(`[Intent Store] PG write failed for ${intentId}:`, err.message)
  );

  return intent;
}

/**
 * Get an intent by ID.
 */
export function getIntent(intentId) {
  return cache.get(intentId) || null;
}

/**
 * Update an intent's status and attach pipeline artifacts.
 */
export function updateIntent(intentId, updates) {
  const intent = cache.get(intentId);
  if (!intent) return null;

  Object.assign(intent, updates);
  cache.set(intentId, intent);

  // Persist update async
  persistUpdate(intentId, intent).catch((err) =>
    console.error(`[Intent Store] PG update failed for ${intentId}:`, err.message)
  );

  return intent;
}

/**
 * List all intents, optionally filtered by status.
 */
export function listIntents(status, limit = 50) {
  let results = Array.from(cache.values());
  if (status) {
    results = results.filter((i) => i.status === status);
  }
  // Most recent first
  results.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
  return results.slice(0, limit);
}

/**
 * Get pipeline status counts.
 */
export function getStats() {
  const stats = {
    total: cache.size,
    submitted: 0,
    governed: 0,
    authorized: 0,
    denied: 0,
    executed: 0,
    receipted: 0,
    blocked: 0,
  };
  for (const intent of cache.values()) {
    if (stats[intent.status] !== undefined) {
      stats[intent.status]++;
    }
  }
  return stats;
}

// ─── PostgreSQL persistence (async, non-blocking) ────────────────

async function persistCreate(intent) {
  const pool = getPool();
  if (!pool) return;

  await pool.query(
    `INSERT INTO intents (
      intent_id, action, agent_id, status, parameters, governance,
      "authorization", execution, receipt, description, confidence,
      target_environment, principal_id, principal_role,
      _intake, _auth_method, _api_key_id, timestamp
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)
    ON CONFLICT (intent_id) DO NOTHING`,
    [
      intent.intent_id,
      intent.action,
      intent.agent_id,
      intent.status,
      JSON.stringify(intent.parameters),
      intent.governance ? JSON.stringify(intent.governance) : null,
      intent.authorization ? JSON.stringify(intent.authorization) : null,
      intent.execution ? JSON.stringify(intent.execution) : null,
      intent.receipt ? JSON.stringify(intent.receipt) : null,
      intent.description,
      intent.confidence,
      intent.target_environment,
      intent.principal_id,
      intent.principal_role,
      intent._intake ? JSON.stringify(intent._intake) : null,
      intent._auth_method,
      intent._api_key_id,
      intent.timestamp,
    ]
  );
}

async function persistUpdate(intentId, intent) {
  const pool = getPool();
  if (!pool) return;

  await pool.query(
    `UPDATE intents SET
      status = $2,
      governance = $3,
      "authorization" = $4,
      execution = $5,
      receipt = $6,
      updated_at = NOW()
    WHERE intent_id = $1`,
    [
      intentId,
      intent.status,
      intent.governance ? JSON.stringify(intent.governance) : null,
      intent.authorization ? JSON.stringify(intent.authorization) : null,
      intent.execution ? JSON.stringify(intent.execution) : null,
      intent.receipt ? JSON.stringify(intent.receipt) : null,
    ]
  );
}
