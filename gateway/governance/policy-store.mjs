/**
 * RIO Policy Store
 *
 * PostgreSQL-backed policy storage with hash chain versioning.
 * Policies are versioned, hash-chained, and auditable.
 *
 * The active policy is the one with status "active".
 * Old policies are marked "superseded" and retained for audit.
 *
 * Per POLICY_SCHEMA_SPEC.md:
 *   - Every policy has a policy_hash (SHA-256 of canonical content)
 *   - Every policy has a previous_policy_hash (forming a chain)
 *   - The genesis policy has previous_policy_hash = null
 *   - Policy changes require Meta-Governance quorum
 */

import { createHash } from "node:crypto";
import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const __dirname = dirname(fileURLToPath(import.meta.url));

// ─── Module state ───────────────────────────────────────────────────
let pool = null;
let activePolicy = null;
let systemMode = "NORMAL";

// ─── Canonical JSON for hashing ─────────────────────────────────────
/**
 * Produce a canonical JSON string for hashing.
 * Keys are sorted recursively. policy_hash and previous_policy_hash are excluded.
 */
function canonicalJson(obj) {
  return JSON.stringify(obj, (key, value) => {
    if (key === "policy_hash" || key === "previous_policy_hash") return undefined;
    if (value && typeof value === "object" && !Array.isArray(value)) {
      const sorted = {};
      for (const k of Object.keys(value).sort()) {
        sorted[k] = value[k];
      }
      return sorted;
    }
    return value;
  });
}

/**
 * Compute SHA-256 hash of a policy document (excluding hash fields).
 */
export function computePolicyHash(policy) {
  const canonical = canonicalJson(policy);
  return createHash("sha256").update(canonical).digest("hex");
}

// ─── Database operations ────────────────────────────────────────────

/**
 * Initialize the policy store.
 * Creates the policies table and loads the genesis policy if none exists.
 * Creates its own PostgreSQL pool (same pattern as ledger-pg.mjs, principals.mjs).
 */
export async function initPolicyStore() {
  const connStr = process.env.DATABASE_URL;
  const poolConfig = connStr
    ? {
        connectionString: connStr,
        ssl: connStr.includes("render.com")
          ? { rejectUnauthorized: false }
          : false,
      }
    : {
        host: process.env.PG_HOST || "localhost",
        port: parseInt(process.env.PG_PORT || "5432"),
        database: process.env.PG_DATABASE || "rio_ledger",
        user: process.env.PG_USER || "rio",
        password: process.env.PG_PASSWORD || "rio_gateway_2026",
      };

  pool = new pg.Pool(poolConfig);

  // Create policies table
  await pool.query(`
    CREATE TABLE IF NOT EXISTS policies (
      id              SERIAL PRIMARY KEY,
      policy_id       TEXT UNIQUE NOT NULL,
      policy_version  TEXT NOT NULL,
      policy_hash     TEXT NOT NULL,
      previous_policy_hash TEXT,
      status          TEXT NOT NULL DEFAULT 'active',
      created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      created_by      TEXT NOT NULL,
      approved_by     JSONB DEFAULT '[]',
      policy_document JSONB NOT NULL,
      CONSTRAINT valid_status CHECK (status IN ('active', 'draft', 'superseded', 'revoked'))
    )
  `);

  // Create index on status for fast active policy lookup
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_policies_status ON policies(status)
  `);

  // Create system_mode table
  await pool.query(`
    CREATE TABLE IF NOT EXISTS system_mode (
      id    INTEGER PRIMARY KEY DEFAULT 1,
      mode  TEXT NOT NULL DEFAULT 'NORMAL',
      changed_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      changed_by  TEXT NOT NULL DEFAULT 'system',
      reason      TEXT,
      CONSTRAINT single_row CHECK (id = 1),
      CONSTRAINT valid_mode CHECK (mode IN ('NORMAL', 'ELEVATED', 'LOCKDOWN', 'MAINTENANCE'))
    )
  `);

  // Insert default mode if not exists
  await pool.query(`
    INSERT INTO system_mode (id, mode, changed_by, reason)
    VALUES (1, 'NORMAL', 'system', 'Initial system startup')
    ON CONFLICT (id) DO NOTHING
  `);

  // Load the active policy from the database
  const existing = await pool.query(
    `SELECT policy_document FROM policies WHERE status = 'active' LIMIT 1`
  );

  if (existing.rows.length > 0) {
    activePolicy = existing.rows[0].policy_document;
    console.log(`[RIO PolicyStore] Loaded active policy: v${activePolicy.policy_version} (${activePolicy.policy_hash?.substring(0, 12)}...)`);
  } else {
    // Load and install genesis policy from file
    await loadGenesisPolicy();
  }

  // Load system mode
  const modeResult = await pool.query(`SELECT mode FROM system_mode WHERE id = 1`);
  if (modeResult.rows.length > 0) {
    systemMode = modeResult.rows[0].mode;
  }

  console.log(`[RIO PolicyStore] System mode: ${systemMode}`);
  return activePolicy;
}

/**
 * Load the genesis policy from the config file and install it.
 */
async function loadGenesisPolicy() {
  const genesisPath = join(__dirname, "..", "config", "rio", "policy-v2.json");

  if (!existsSync(genesisPath)) {
    throw new Error(
      `[RIO PolicyStore] FATAL: No active policy in database and no genesis policy file at ${genesisPath}. ` +
      `Gateway cannot start without a policy. Fail-closed.`
    );
  }

  const raw = readFileSync(genesisPath, "utf-8");
  const genesis = JSON.parse(raw);

  // Compute the policy hash
  genesis.policy_hash = computePolicyHash(genesis);
  genesis.previous_policy_hash = null;

  // Store in database
  await pool.query(
    `INSERT INTO policies (policy_id, policy_version, policy_hash, previous_policy_hash, status, created_at, created_by, approved_by, policy_document)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
    [
      genesis.policy_id,
      genesis.policy_version,
      genesis.policy_hash,
      null,
      "active",
      genesis.created_at,
      genesis.created_by,
      JSON.stringify(genesis.approved_by || []),
      JSON.stringify(genesis),
    ]
  );

  activePolicy = genesis;
  console.log(`[RIO PolicyStore] Installed genesis policy: v${genesis.policy_version} (${genesis.policy_hash.substring(0, 12)}...)`);
}

// ─── Policy access ──────────────────────────────────────────────────

/**
 * Get the currently active policy.
 * Returns null if no active policy exists (fail-closed — caller must handle).
 */
export function getActivePolicy() {
  return activePolicy;
}

/**
 * Get a policy by its hash.
 */
export async function getPolicyByHash(policyHash) {
  if (!pool) return null;
  const result = await pool.query(
    `SELECT policy_document FROM policies WHERE policy_hash = $1`,
    [policyHash]
  );
  return result.rows.length > 0 ? result.rows[0].policy_document : null;
}

/**
 * Get the full policy version history.
 */
export async function getPolicyHistory() {
  if (!pool) return [];
  const result = await pool.query(
    `SELECT policy_id, policy_version, policy_hash, previous_policy_hash, status, created_at, created_by
     FROM policies
     ORDER BY created_at DESC`
  );
  return result.rows;
}

/**
 * Create a new policy version.
 * The current active policy is marked "superseded".
 * The new policy becomes "active".
 *
 * @param {object} newPolicyDoc - The new policy document (without hash fields)
 * @param {string} createdBy - principal_id of the creator
 * @param {string[]} approvedBy - principal_ids of the approvers
 * @returns {object} The new active policy with computed hashes
 */
export async function createPolicyVersion(newPolicyDoc, createdBy, approvedBy) {
  if (!pool) throw new Error("PolicyStore not initialized");

  const currentPolicy = activePolicy;

  // Set metadata
  newPolicyDoc.created_by = createdBy;
  newPolicyDoc.approved_by = approvedBy;
  newPolicyDoc.created_at = new Date().toISOString();
  newPolicyDoc.previous_policy_hash = currentPolicy ? currentPolicy.policy_hash : null;
  newPolicyDoc.status = "active";

  // Compute hash
  newPolicyDoc.policy_hash = computePolicyHash(newPolicyDoc);

  // Transaction: supersede old, insert new
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // Mark current active policy as superseded
    if (currentPolicy) {
      await client.query(
        `UPDATE policies SET status = 'superseded' WHERE status = 'active'`
      );
    }

    // Insert new policy
    await client.query(
      `INSERT INTO policies (policy_id, policy_version, policy_hash, previous_policy_hash, status, created_at, created_by, approved_by, policy_document)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [
        newPolicyDoc.policy_id,
        newPolicyDoc.policy_version,
        newPolicyDoc.policy_hash,
        newPolicyDoc.previous_policy_hash,
        "active",
        newPolicyDoc.created_at,
        createdBy,
        JSON.stringify(approvedBy),
        JSON.stringify(newPolicyDoc),
      ]
    );

    await client.query("COMMIT");

    activePolicy = newPolicyDoc;
    console.log(`[RIO PolicyStore] New policy version: v${newPolicyDoc.policy_version} (${newPolicyDoc.policy_hash.substring(0, 12)}...)`);
    return newPolicyDoc;
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Verify the policy hash chain integrity.
 * Returns { valid: boolean, chain: [...], error?: string }
 */
export async function verifyPolicyChain() {
  if (!pool) return { valid: false, error: "PolicyStore not initialized" };

  const result = await pool.query(
    `SELECT policy_version, policy_hash, previous_policy_hash, policy_document
     FROM policies
     ORDER BY created_at ASC`
  );

  const chain = [];
  let previousHash = null;

  for (const row of result.rows) {
    const doc = row.policy_document;
    const computedHash = computePolicyHash(doc);

    const entry = {
      version: row.policy_version,
      hash: row.policy_hash,
      previous_hash: row.previous_policy_hash,
      computed_hash: computedHash,
      hash_valid: computedHash === row.policy_hash,
      chain_valid: row.previous_policy_hash === previousHash,
    };

    chain.push(entry);

    if (!entry.hash_valid) {
      return {
        valid: false,
        chain,
        error: `Policy v${row.policy_version}: stored hash does not match computed hash`,
      };
    }

    if (!entry.chain_valid) {
      return {
        valid: false,
        chain,
        error: `Policy v${row.policy_version}: previous_policy_hash does not match chain`,
      };
    }

    previousHash = row.policy_hash;
  }

  return { valid: true, chain, total: chain.length };
}

// ─── System mode ────────────────────────────────────────────────────

/**
 * Get the current system mode.
 */
export function getSystemMode() {
  return systemMode;
}

/**
 * Set the system mode.
 * Mode changes are governance actions — the caller must verify authorization.
 *
 * @param {string} mode - NORMAL | ELEVATED | LOCKDOWN | MAINTENANCE
 * @param {string} changedBy - principal_id
 * @param {string} reason - why the mode is changing
 */
export async function setSystemMode(mode, changedBy, reason) {
  const validModes = ["NORMAL", "ELEVATED", "LOCKDOWN", "MAINTENANCE"];
  if (!validModes.includes(mode)) {
    throw new Error(`Invalid system mode: ${mode}. Must be one of: ${validModes.join(", ")}`);
  }

  if (!pool) throw new Error("PolicyStore not initialized");

  await pool.query(
    `UPDATE system_mode SET mode = $1, changed_at = NOW(), changed_by = $2, reason = $3 WHERE id = 1`,
    [mode, changedBy, reason]
  );

  const previousMode = systemMode;
  systemMode = mode;
  console.log(`[RIO PolicyStore] System mode changed: ${previousMode} → ${mode} (by ${changedBy}: ${reason})`);

  return { previous: previousMode, current: mode };
}
