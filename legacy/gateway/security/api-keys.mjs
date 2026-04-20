/**
 * RIO Gateway — API Key Management (WS-012: Public API)
 *
 * PostgreSQL-backed API key store with in-memory cache.
 * Follows the same cache-then-persist pattern as identity-binding.mjs.
 *
 * API keys are SHA-256 hashed before storage — the raw key is returned
 * ONCE on creation and never stored or recoverable.
 *
 * Each key has:
 *   - key_id: unique identifier (e.g., "rio_pk_abc123")
 *   - key_hash: SHA-256 hash of the raw key (stored in DB)
 *   - owner_id: the user who owns this key
 *   - display_name: human-readable label
 *   - scopes: array of allowed scopes (e.g., ["read", "write", "admin"])
 *   - rate_limit: requests per minute
 *   - status: "active" | "revoked"
 *   - created_at, last_used_at
 */
import pg from "pg";
import { createHash, randomBytes } from "node:crypto";

const { Pool } = pg;

let pool = null;
const keyCache = new Map(); // key_hash -> key record

// ---------------------------------------------------------------------------
// Initialization
// ---------------------------------------------------------------------------
export async function initApiKeys() {
  const connStr = process.env.DATABASE_URL;
  const poolConfig = connStr
    ? { connectionString: connStr }
    : {
        host: process.env.PG_HOST || "localhost",
        port: parseInt(process.env.PG_PORT || "5432"),
        database: process.env.PG_DATABASE || "rio_ledger",
        user: process.env.PG_USER || "rio",
        password: process.env.PG_PASSWORD || "rio_gateway_2026",
      };

  // Render.com requires SSL
  if (connStr && connStr.includes("render.com")) {
    poolConfig.ssl = { rejectUnauthorized: false };
  }

  pool = new Pool(poolConfig);

  // Create table if not exists
  await pool.query(`
    CREATE TABLE IF NOT EXISTS api_keys (
      id SERIAL PRIMARY KEY,
      key_id VARCHAR(64) UNIQUE NOT NULL,
      key_hash VARCHAR(64) NOT NULL,
      key_prefix VARCHAR(32) NOT NULL,
      owner_id VARCHAR(255) NOT NULL,
      display_name VARCHAR(255),
      scopes JSONB DEFAULT '["read"]'::jsonb,
      rate_limit INTEGER DEFAULT 100,
      status VARCHAR(20) DEFAULT 'active',
      created_at TIMESTAMPTZ DEFAULT NOW(),
      last_used_at TIMESTAMPTZ,
      UNIQUE(key_hash)
    );
    CREATE INDEX IF NOT EXISTS idx_api_keys_hash ON api_keys(key_hash);
    CREATE INDEX IF NOT EXISTS idx_api_keys_owner ON api_keys(owner_id);
    CREATE INDEX IF NOT EXISTS idx_api_keys_status ON api_keys(status);
  `);

  // Load active keys into cache
  const result = await pool.query(
    "SELECT * FROM api_keys WHERE status = 'active'"
  );
  for (const row of result.rows) {
    keyCache.set(row.key_hash, {
      key_id: row.key_id,
      key_hash: row.key_hash,
      key_prefix: row.key_prefix,
      owner_id: row.owner_id,
      display_name: row.display_name,
      scopes: row.scopes || ["read"],
      rate_limit: row.rate_limit || 100,
      status: row.status,
      created_at: row.created_at,
      last_used_at: row.last_used_at,
    });
  }

  console.log(
    `[RIO API Keys] Initialized — ${keyCache.size} active key(s) loaded from PostgreSQL.`
  );
}

// ---------------------------------------------------------------------------
// Key Generation
// ---------------------------------------------------------------------------
function generateKeyId() {
  return "rio_key_" + randomBytes(8).toString("hex");
}

function generateRawKey() {
  // Format: rio_pk_<32 random hex chars>
  return "rio_pk_" + randomBytes(24).toString("hex");
}

function hashKey(rawKey) {
  return createHash("sha256").update(rawKey).digest("hex");
}

// ---------------------------------------------------------------------------
// CRUD Operations
// ---------------------------------------------------------------------------

/**
 * Create a new API key. Returns the raw key ONCE.
 */
export async function createApiKey({
  owner_id,
  display_name,
  scopes = ["read"],
  rate_limit = 100,
}) {
  if (!owner_id) throw new Error("owner_id is required");

  const key_id = generateKeyId();
  const rawKey = generateRawKey();
  const key_hash = hashKey(rawKey);
  const key_prefix = rawKey.substring(0, 10) + "...";

  await pool.query(
    `INSERT INTO api_keys (key_id, key_hash, key_prefix, owner_id, display_name, scopes, rate_limit, status)
     VALUES ($1, $2, $3, $4, $5, $6, $7, 'active')`,
    [key_id, key_hash, key_prefix, owner_id, display_name, JSON.stringify(scopes), rate_limit]
  );

  const record = {
    key_id,
    key_hash,
    key_prefix,
    owner_id,
    display_name,
    scopes,
    rate_limit,
    status: "active",
    created_at: new Date().toISOString(),
    last_used_at: null,
  };

  keyCache.set(key_hash, record);

  return {
    key_id,
    raw_key: rawKey,
    key_prefix,
    owner_id,
    display_name,
    scopes,
    rate_limit,
    warning: "Store this key securely. It will NOT be shown again.",
  };
}

/**
 * Validate an API key from a request. Returns the key record or null.
 */
export function validateApiKey(rawKey) {
  if (!rawKey) return null;

  const key_hash = hashKey(rawKey);
  const record = keyCache.get(key_hash);

  if (!record) return null;
  if (record.status !== "active") return null;

  // Update last_used_at asynchronously (fire-and-forget)
  record.last_used_at = new Date().toISOString();
  if (pool) {
    pool
      .query("UPDATE api_keys SET last_used_at = NOW() WHERE key_hash = $1", [
        key_hash,
      ])
      .catch(() => {}); // Non-critical — don't block request
  }

  return record;
}

/**
 * List all API keys for an owner (without exposing hashes).
 */
export function listApiKeys(owner_id) {
  const keys = [];
  for (const record of keyCache.values()) {
    if (!owner_id || record.owner_id === owner_id) {
      keys.push({
        key_id: record.key_id,
        key_prefix: record.key_prefix,
        owner_id: record.owner_id,
        display_name: record.display_name,
        scopes: record.scopes,
        rate_limit: record.rate_limit,
        status: record.status,
        created_at: record.created_at,
        last_used_at: record.last_used_at,
      });
    }
  }
  return keys;
}

/**
 * Get a specific API key by key_id.
 */
export function getApiKey(key_id) {
  for (const record of keyCache.values()) {
    if (record.key_id === key_id) {
      return {
        key_id: record.key_id,
        key_prefix: record.key_prefix,
        owner_id: record.owner_id,
        display_name: record.display_name,
        scopes: record.scopes,
        rate_limit: record.rate_limit,
        status: record.status,
        created_at: record.created_at,
        last_used_at: record.last_used_at,
      };
    }
  }
  return null;
}

/**
 * Revoke an API key.
 */
export async function revokeApiKey(key_id) {
  for (const [hash, record] of keyCache.entries()) {
    if (record.key_id === key_id) {
      record.status = "revoked";
      await pool.query(
        "UPDATE api_keys SET status = 'revoked' WHERE key_id = $1",
        [key_id]
      );
      keyCache.delete(hash);
      return { revoked: true, key_id };
    }
  }
  return { revoked: false, key_id, reason: "Key not found" };
}

/**
 * Check if a raw API key has a specific scope.
 */
export function hasScope(record, scope) {
  if (!record || !record.scopes) return false;
  return record.scopes.includes(scope) || record.scopes.includes("admin");
}
