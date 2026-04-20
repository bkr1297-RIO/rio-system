/**
 * RIO Security — Identity Binding (WS-010)
 *
 * Manages Ed25519 signer identities in PostgreSQL.
 * The private key is NEVER stored on the server.
 * Only the public key is persisted in the authorized_signers table.
 *
 * Flow:
 *   1. Brian calls POST /api/signers/generate-keypair
 *   2. Gateway generates Ed25519 keypair
 *   3. Private key is returned to Brian ONCE (never stored)
 *   4. Public key is stored in authorized_signers table
 *   5. All subsequent approvals require a valid Ed25519 signature
 *      verified against the stored public key
 *
 * Alternatively:
 *   1. Brian generates his own keypair offline
 *   2. Brian calls POST /api/signers/register with his public key
 *   3. Public key is stored in authorized_signers table
 */
import pg from "pg";

const { Pool } = pg;

let pool = null;
const signerCache = new Map(); // signer_id -> { public_key_hex, display_name, role, registered_at }

/**
 * Initialize the identity binding module.
 * Connects to PostgreSQL and loads existing signers into cache.
 */
export async function initIdentityBinding() {
  const databaseUrl = process.env.DATABASE_URL;

  const poolConfig = databaseUrl
    ? {
        connectionString: databaseUrl,
        ssl: databaseUrl.includes("render.com")
          ? { rejectUnauthorized: false }
          : undefined,
      }
    : {
        host: process.env.PG_HOST || "localhost",
        port: parseInt(process.env.PG_PORT || "5432"),
        database: process.env.PG_DATABASE || "rio_ledger",
        user: process.env.PG_USER || "rio",
        password: process.env.PG_PASSWORD || "rio_gateway_2026",
      };

  pool = new Pool(poolConfig);

  // Load existing signers into cache
  const result = await pool.query(
    "SELECT signer_id, public_key_hex, display_name, role, registered_at FROM authorized_signers"
  );

  for (const row of result.rows) {
    signerCache.set(row.signer_id, {
      public_key_hex: row.public_key_hex,
      display_name: row.display_name,
      role: row.role,
      registered_at: row.registered_at,
    });
  }

  console.log(
    `[RIO Identity] Loaded ${signerCache.size} authorized signer(s) from PostgreSQL.`
  );
}

/**
 * Register a new signer with their public key.
 * The public key must be a 64-character hex string (32 bytes).
 *
 * @param {object} params
 * @param {string} params.signer_id - Unique identifier for the signer
 * @param {string} params.public_key_hex - Ed25519 public key (64 hex chars)
 * @param {string} params.display_name - Human-readable name
 * @param {string} params.role - Role (e.g., "owner", "approver", "auditor")
 * @returns {object} The registered signer record
 */
export async function registerSigner({
  signer_id,
  public_key_hex,
  display_name,
  role,
}) {
  // Validate public key format
  if (!public_key_hex || !/^[0-9a-f]{64}$/i.test(public_key_hex)) {
    throw new Error(
      "Invalid public key: must be a 64-character hex string (32 bytes Ed25519 public key)."
    );
  }

  // Check for duplicate
  if (signerCache.has(signer_id)) {
    throw new Error(`Signer already registered: ${signer_id}`);
  }

  const result = await pool.query(
    `INSERT INTO authorized_signers (signer_id, public_key_hex, display_name, role)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (signer_id) DO NOTHING
     RETURNING signer_id, public_key_hex, display_name, role, registered_at`,
    [signer_id, public_key_hex.toLowerCase(), display_name || signer_id, role || "approver"]
  );

  if (result.rows.length === 0) {
    throw new Error(`Signer already registered: ${signer_id}`);
  }

  const signer = result.rows[0];

  // Update cache
  signerCache.set(signer.signer_id, {
    public_key_hex: signer.public_key_hex,
    display_name: signer.display_name,
    role: signer.role,
    registered_at: signer.registered_at,
  });

  console.log(
    `[RIO Identity] Signer registered: ${signer_id} (${display_name || signer_id}, role: ${role || "approver"})`
  );

  return signer;
}

/**
 * Get a signer's public key from the cache.
 * Returns null if the signer is not registered.
 *
 * @param {string} signer_id
 * @returns {object|null} { public_key_hex, display_name, role, registered_at }
 */
export function getSigner(signer_id) {
  return signerCache.get(signer_id) || null;
}

/**
 * Get a signer's public key hex string.
 * This is the primary lookup used by the authorization flow.
 *
 * @param {string} signer_id
 * @returns {string|null} The public key hex, or null if not found
 */
export function getSignerPublicKey(signer_id) {
  const signer = signerCache.get(signer_id);
  return signer ? signer.public_key_hex : null;
}

/**
 * List all registered signers.
 * @returns {Array} Array of signer records (without private keys)
 */
export function listSigners() {
  const signers = [];
  for (const [signer_id, data] of signerCache.entries()) {
    signers.push({ signer_id, ...data });
  }
  return signers;
}

/**
 * Revoke a signer (remove from authorized_signers).
 * This is a destructive operation — the signer can no longer approve intents.
 *
 * @param {string} signer_id
 * @returns {boolean} True if the signer was revoked
 */
export async function revokeSigner(signer_id) {
  const result = await pool.query(
    "DELETE FROM authorized_signers WHERE signer_id = $1",
    [signer_id]
  );

  if (result.rowCount > 0) {
    signerCache.delete(signer_id);
    console.log(`[RIO Identity] Signer revoked: ${signer_id}`);
    return true;
  }

  return false;
}
