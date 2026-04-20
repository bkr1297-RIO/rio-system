/**
 * RIO Gateway — Principal Registry (Area 1: Role Enforcement)
 *
 * The unified identity model for the RIO governed execution system.
 * Every entity that interacts with the system — human, AI agent, service,
 * executor, auditor, or meta-governor — must have a registered principal
 * with explicit roles and capabilities.
 *
 * This module implements:
 *   - principals table (single source of truth for identity)
 *   - key_history table (for key rotation / receipt verification)
 *   - resolvePrincipal() middleware (resolves auth credential → principal)
 *   - requireRole() middleware (enforces role-based access control)
 *   - Initial principal seeding (I-1, bondi, manny, gateway-exec, mantis, ledger-writer)
 *
 * Security note (identity-cleanup, 2026-04-11):
 *   - X-Principal-ID header fallback REMOVED. All clients must authenticate
 *     via JWT, API key, Ed25519 signature, or X-Authenticated-Email.
 *   - I-1 auth binding now uses email (bkr1297@gmail.com) as primary JWT sub.
 *
 * Enforcement invariants:
 *   - Fail-closed: unknown principal → 403
 *   - Fail-closed: suspended/revoked principal → 403
 *   - Fail-closed: missing required role → 403
 *   - No fallback to anonymous access
 *   - Every request that passes middleware has req.principal set
 *
 * References:
 *   - spec/IDENTITY_AND_ROLES_SPEC.md (Andrew, 2026-04-04)
 *   - docs/DECISIONS.md (Decision 1: Gateway is enforcement boundary)
 *   - spec/CONSTITUTION.md (Invariant 7: Separation of Roles)
 */
import pg from "pg";

const { Pool } = pg;

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const VALID_ACTOR_TYPES = [
  "human",
  "ai_agent",
  "service",
  "executor",
  "auditor",
  "meta_governor",
];

const VALID_ROLES = [
  "proposer",
  "approver",
  "executor",
  "auditor",
  "meta_governor",
  "root_authority",
];

const VALID_STATUSES = ["active", "suspended", "revoked"];
const VALID_KEY_STATUSES = ["active", "rotated", "revoked", "none"];

/**
 * Role combination rules (from IDENTITY_AND_ROLES_SPEC.md Section 3.2).
 * Prohibited combinations — no single principal may hold both.
 */
const PROHIBITED_ROLE_COMBINATIONS = [
  ["proposer", "executor"],  // Can bypass governance entirely
  ["approver", "executor"],  // Collapses governance-execution boundary
];

/**
 * Initial principal set (from IDENTITY_AND_ROLES_SPEC.md Section 5.3).
 * These are seeded on first boot.
 */
const INITIAL_PRINCIPALS = [
  {
    principal_id: "I-1",
    actor_type: "human",
    display_name: "Brian Kent Rasmussen",
    email: "bkr1297@gmail.com",
    primary_role: "root_authority",
    secondary_roles: ["approver", "meta_governor"],
    registered_by: "system_bootstrap",
  },
  {
    principal_id: "I-2",
    actor_type: "human",
    display_name: "Brian (Approver)",
    email: "riomethod5@gmail.com",
    primary_role: "approver",
    secondary_roles: [],
    registered_by: "system_bootstrap",
  },
  {
    principal_id: "bondi",
    actor_type: "ai_agent",
    display_name: "Bondi (AI Chief of Staff)",
    primary_role: "proposer",
    secondary_roles: [],
    registered_by: "I-1",
  },
  {
    principal_id: "manny",
    actor_type: "ai_agent",
    display_name: "Manny (Builder)",
    primary_role: "proposer",
    secondary_roles: [],
    registered_by: "I-1",
  },
  {
    principal_id: "gateway-exec",
    actor_type: "executor",
    display_name: "Gateway Execution Engine",
    primary_role: "executor",
    secondary_roles: [],
    registered_by: "system_bootstrap",
  },
  {
    principal_id: "mantis",
    actor_type: "auditor",
    display_name: "Mantis (Witness)",
    primary_role: "auditor",
    secondary_roles: [],
    registered_by: "system_bootstrap",
  },
  {
    principal_id: "ledger-writer",
    actor_type: "service",
    display_name: "Ledger Writer Service",
    primary_role: "auditor",
    secondary_roles: [],
    registered_by: "system_bootstrap",
  },
];

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

let pool = null;
const principalCache = new Map(); // principal_id -> principal record

// Mapping from auth credentials to principal_id
const authBindings = {
  jwt: new Map(),      // jwt_sub -> principal_id
  api_key: new Map(),  // api_key_owner_id -> principal_id
  signer: new Map(),   // signer_id -> principal_id
};

// ---------------------------------------------------------------------------
// Initialization
// ---------------------------------------------------------------------------

/**
 * Initialize the principal registry.
 * Creates tables, seeds initial principals, and loads cache.
 */
export async function initPrincipals() {
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

  pool = new Pool(poolConfig);

  // Create tables
  await pool.query(`
    CREATE TABLE IF NOT EXISTS principals (
      id              SERIAL PRIMARY KEY,
      principal_id    VARCHAR(255) UNIQUE NOT NULL,
      actor_type      VARCHAR(50) NOT NULL,
      display_name    VARCHAR(255) NOT NULL,
      email           VARCHAR(320),
      primary_role    VARCHAR(50) NOT NULL,
      secondary_roles TEXT[] DEFAULT '{}',
      public_key_hex  VARCHAR(64),
      key_status      VARCHAR(20) DEFAULT 'none',
      scopes          JSONB DEFAULT '[]',
      metadata        JSONB DEFAULT '{}',
      registered_at   TIMESTAMPTZ DEFAULT NOW(),
      registered_by   VARCHAR(255) NOT NULL,
      last_active_at  TIMESTAMPTZ,
      status          VARCHAR(20) DEFAULT 'active',

      CONSTRAINT valid_actor_type CHECK (
        actor_type IN ('human', 'ai_agent', 'service', 'executor', 'auditor', 'meta_governor')
      ),
      CONSTRAINT valid_primary_role CHECK (
        primary_role IN ('proposer', 'approver', 'executor', 'auditor', 'meta_governor', 'root_authority')
      ),
      CONSTRAINT valid_key_status CHECK (
        key_status IN ('active', 'rotated', 'revoked', 'none')
      ),
      CONSTRAINT valid_status CHECK (
        status IN ('active', 'suspended', 'revoked')
      )
    );

    CREATE INDEX IF NOT EXISTS idx_principals_actor_type ON principals(actor_type);
    CREATE INDEX IF NOT EXISTS idx_principals_role ON principals(primary_role);
    CREATE INDEX IF NOT EXISTS idx_principals_status ON principals(status);

    CREATE TABLE IF NOT EXISTS key_history (
      id                    SERIAL PRIMARY KEY,
      principal_id          VARCHAR(255) NOT NULL REFERENCES principals(principal_id),
      public_key_hex        VARCHAR(64) NOT NULL,
      status                VARCHAR(20) NOT NULL,
      activated_at          TIMESTAMPTZ NOT NULL,
      deactivated_at        TIMESTAMPTZ,
      deactivation_reason   VARCHAR(255),

      CONSTRAINT valid_key_history_status CHECK (
        status IN ('active', 'rotated', 'revoked')
      )
    );

    CREATE INDEX IF NOT EXISTS idx_key_history_principal ON key_history(principal_id);
    CREATE INDEX IF NOT EXISTS idx_key_history_pubkey ON key_history(public_key_hex);
  `);

  console.log("[RIO Principals] Tables created/verified.");

  // Always seed initial principals — ON CONFLICT DO NOTHING makes this idempotent.
  // This ensures new principals added to INITIAL_PRINCIPALS are picked up on redeploy.
  await seedInitialPrincipals();

  // Load all principals into cache
  await reloadCache();

  console.log(
    `[RIO Principals] Initialized — ${principalCache.size} principal(s) loaded.`
  );
}

/**
 * Seed the initial principal set from IDENTITY_AND_ROLES_SPEC.md Section 5.3.
 */
async function seedInitialPrincipals() {
  console.log("[RIO Principals] Seeding initial principals...");

  for (const p of INITIAL_PRINCIPALS) {
    await pool.query(
      `INSERT INTO principals (principal_id, actor_type, display_name, email, primary_role, secondary_roles, registered_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (principal_id) DO NOTHING`,
      [
        p.principal_id,
        p.actor_type,
        p.display_name,
        p.email || null,
        p.primary_role,
        p.secondary_roles,
        p.registered_by,
      ]
    );
    console.log(
      `[RIO Principals] Seeded: ${p.principal_id} (${p.actor_type}, ${p.primary_role})`
    );
  }
}

/**
 * Reload the in-memory cache from the database.
 */
async function reloadCache() {
  const result = await pool.query("SELECT * FROM principals ORDER BY id ASC");

  principalCache.clear();
  authBindings.jwt.clear();
  authBindings.api_key.clear();
  authBindings.signer.clear();

  for (const row of result.rows) {
    const principal = {
      principal_id: row.principal_id,
      actor_type: row.actor_type,
      display_name: row.display_name,
      email: row.email,
      primary_role: row.primary_role,
      secondary_roles: row.secondary_roles || [],
      public_key_hex: row.public_key_hex,
      key_status: row.key_status,
      scopes: row.scopes || [],
      metadata: row.metadata || {},
      registered_at: row.registered_at,
      registered_by: row.registered_by,
      last_active_at: row.last_active_at,
      status: row.status,
    };

    principalCache.set(row.principal_id, principal);

    // Build auth binding lookups from metadata
    const meta = row.metadata || {};
    if (meta.jwt_sub) {
      authBindings.jwt.set(meta.jwt_sub, row.principal_id);
    }
    if (meta.api_key_owner_id) {
      authBindings.api_key.set(meta.api_key_owner_id, row.principal_id);
    }
    if (meta.signer_id) {
      authBindings.signer.set(meta.signer_id, row.principal_id);
    }

    // Also bind by principal_id itself for direct lookups
    // (e.g., JWT sub "brian.k.rasmussen" → principal "I-1")
    // These are set up via the auth_bindings in metadata
  }

  // Set up known auth bindings for initial principals
  // I-1 (Brian) authenticates via JWT with email as sub
  if (principalCache.has("I-1")) {
    authBindings.jwt.set("bkr1297@gmail.com", "I-1");
    // Legacy alias — tokens issued before this change used brian.k.rasmussen
    authBindings.jwt.set("brian.k.rasmussen", "I-1");
  }
  // Agents authenticate via their agent_id in intents
  if (principalCache.has("bondi")) {
    authBindings.jwt.set("bondi", "bondi");
  }
  if (principalCache.has("manny")) {
    authBindings.jwt.set("manny", "manny");
    authBindings.jwt.set("MANUS", "manny");
    authBindings.jwt.set("manus", "manny");
  }
}

// ---------------------------------------------------------------------------
// Principal Resolution
// ---------------------------------------------------------------------------

/**
 * Resolve a principal from authentication credentials.
 *
 * Resolution order:
 *   1. JWT subject → principal (via jwt auth binding)
 *   2. API key owner_id → principal (via api_key auth binding)
 *   3. X-Authenticated-Email header → principal (via email resolution)
 *
 * Removed:
 *   - X-Principal-ID header (identity-cleanup, 2026-04-11)
 *
 * Returns null if no principal can be resolved.
 *
 * @param {object} req - Express request object
 * @returns {object|null} The resolved principal or null
 */
export function resolvePrincipalFromRequest(req) {
  // 1. Try JWT subject
  if (req.user?.sub) {
    const principalId = authBindings.jwt.get(req.user.sub);
    if (principalId) {
      const principal = principalCache.get(principalId);
      if (principal && principal.status === "active") {
        return principal;
      }
    }
    // Also try direct principal_id match
    const directMatch = principalCache.get(req.user.sub);
    if (directMatch && directMatch.status === "active") {
      return directMatch;
    }
  }

  // 2. Try API key owner_id
  if (req.apiKey?.owner_id) {
    const principalId = authBindings.api_key.get(req.apiKey.owner_id);
    if (principalId) {
      const principal = principalCache.get(principalId);
      if (principal && principal.status === "active") {
        return principal;
      }
    }
    // Also try direct principal_id match
    const directMatch = principalCache.get(req.apiKey.owner_id);
    if (directMatch && directMatch.status === "active") {
      return directMatch;
    }
  }

   // 3. Try X-Authenticated-Email header (for untrusted client identity bridging)
  //    ONE and other untrusted clients send the authenticated user's email.
  //    The Gateway resolves the email to a principal — the client never sends
  //    a raw principal ID (Decision 2: all interfaces are untrusted clients).
  const authenticatedEmail = req.headers["x-authenticated-email"];
  if (authenticatedEmail) {
    const principal = resolvePrincipalByEmail(authenticatedEmail);
    if (principal && principal.status === "active") {
      return principal;
    }
  }
  // X-Principal-ID header removed (PR #91 / identity-cleanup).
  // All clients must authenticate via JWT, API key, Ed25519, or
  // X-Authenticated-Email. Direct principal-ID injection from
  // untrusted clients is no longer accepted.

  return null;
}

/**
 * Get all roles for a principal (primary + secondary).
 *
 * @param {object} principal - The principal record
 * @returns {string[]} Array of all roles
 */
export function getAllRoles(principal) {
  if (!principal) return [];
  const roles = [principal.primary_role];
  if (principal.secondary_roles && Array.isArray(principal.secondary_roles)) {
    roles.push(...principal.secondary_roles);
  }
  // root_authority implicitly has all governance roles
  if (principal.primary_role === "root_authority") {
    for (const role of ["proposer", "approver", "auditor", "meta_governor"]) {
      if (!roles.includes(role)) {
        roles.push(role);
      }
    }
  }
  return [...new Set(roles)];
}

/**
 * Check if a principal has a specific role.
 *
 * @param {object} principal - The principal record
 * @param {string} role - The role to check
 * @returns {boolean}
 */
export function hasRole(principal, role) {
  return getAllRoles(principal).includes(role);
}

// ---------------------------------------------------------------------------
// Express Middleware
// ---------------------------------------------------------------------------

/**
 * Middleware: resolve the principal from the request.
 *
 * Sets req.principal if a valid, active principal is found.
 * Does NOT block — downstream middleware decides if a principal is required.
 *
 * This should be applied globally (like optionalAuth).
 */
export function resolvePrincipal(req, res, next) {
  req.principal = resolvePrincipalFromRequest(req);
  next();
}

/**
 * Middleware factory: require a specific role.
 *
 * Fail-closed:
 *   - No principal resolved → 403
 *   - Principal suspended/revoked → 403
 *   - Principal lacks required role → 403
 *
 * @param {...string} roles - One or more roles, any of which satisfies the check
 * @returns {Function} Express middleware
 */
export function requireRole(...roles) {
  return (req, res, next) => {
    // Fail-closed: no principal
    if (!req.principal) {
      return res.status(403).json({
        error: "PRINCIPAL_REQUIRED",
        message: "No recognized principal. Access denied.",
        hint: "Authenticate with a registered principal (JWT, API key, or Ed25519 signature).",
        fail_mode: "closed",
      });
    }

    // Fail-closed: suspended or revoked
    if (req.principal.status !== "active") {
      return res.status(403).json({
        error: "PRINCIPAL_INACTIVE",
        message: `Principal "${req.principal.principal_id}" is ${req.principal.status}. Access denied.`,
        principal_id: req.principal.principal_id,
        status: req.principal.status,
        fail_mode: "closed",
      });
    }

    // Check if principal has any of the required roles
    const principalRoles = getAllRoles(req.principal);
    const hasRequiredRole = roles.some((role) => principalRoles.includes(role));

    if (!hasRequiredRole) {
      return res.status(403).json({
        error: "ROLE_VIOLATION",
        message: `Principal "${req.principal.principal_id}" (roles: [${principalRoles.join(", ")}]) does not have required role: [${roles.join(" | ")}]. Access denied.`,
        principal_id: req.principal.principal_id,
        principal_roles: principalRoles,
        required_roles: roles,
        fail_mode: "closed",
      });
    }

    next();
  };
}

/**
 * Middleware: require any authenticated principal (no specific role).
 * Fail-closed: no principal → 403.
 */
export function requirePrincipal(req, res, next) {
  if (!req.principal) {
    return res.status(403).json({
      error: "PRINCIPAL_REQUIRED",
      message: "No recognized principal. Access denied.",
      hint: "Authenticate with a registered principal.",
      fail_mode: "closed",
    });
  }

  if (req.principal.status !== "active") {
    return res.status(403).json({
      error: "PRINCIPAL_INACTIVE",
      message: `Principal "${req.principal.principal_id}" is ${req.principal.status}. Access denied.`,
      fail_mode: "closed",
    });
  }

  next();
}

// ---------------------------------------------------------------------------
// Email Resolution (for Google OAuth)
// ---------------------------------------------------------------------------

/**
 * Resolve a principal by email address.
 * Checks both the principal's email field and known email aliases.
 *
 * This is the bridge between Google OAuth (which gives us an email)
 * and the principal registry (which gives us a principal_id + role).
 *
 * @param {string} email - The email address from Google OAuth
 * @returns {object|null} The matching principal or null
 */
export function resolvePrincipalByEmail(email) {
  if (!email) return null;
  const normalizedEmail = email.toLowerCase().trim();

  // 1. Direct email match on principal record
  for (const principal of principalCache.values()) {
    if (principal.email && principal.email.toLowerCase() === normalizedEmail) {
      return principal;
    }
  }

  // 2. Check metadata.emails array (for principals with multiple emails)
  for (const principal of principalCache.values()) {
    const meta = principal.metadata || {};
    if (Array.isArray(meta.emails)) {
      for (const e of meta.emails) {
        if (e.toLowerCase() === normalizedEmail) {
          return principal;
        }
      }
    }
  }

  // 3. Check the known email aliases from REGISTERED_USERS in oauth.mjs
  //    Brian's emails: bkr1297@gmail.com, riomethod5@gmail.com, RasmussenBR@hotmail.com
  const KNOWN_EMAIL_ALIASES = {
    "bkr1297@gmail.com": "I-1",
    "riomethod5@gmail.com": "I-2",
    "rasmussenbr@hotmail.com": "I-1",
  };

  const aliasMatch = KNOWN_EMAIL_ALIASES[normalizedEmail];
  if (aliasMatch && principalCache.has(aliasMatch)) {
    return principalCache.get(aliasMatch);
  }

  return null;
}

// ---------------------------------------------------------------------------
// CRUD Operations
// ---------------------------------------------------------------------------

/**
 * Get a principal by ID.
 * @param {string} principalId
 * @returns {object|null}
 */
export function getPrincipal(principalId) {
  return principalCache.get(principalId) || null;
}

/**
 * List all principals.
 * @returns {object[]}
 */
export function listPrincipals() {
  return Array.from(principalCache.values());
}

/**
 * Register a new principal.
 * Validates actor type, role, and role combination rules.
 *
 * @param {object} params
 * @returns {object} The registered principal
 */
export async function registerPrincipal({
  principal_id,
  actor_type,
  display_name,
  email,
  primary_role,
  secondary_roles = [],
  public_key_hex,
  registered_by,
  metadata = {},
}) {
  // Validate actor type
  if (!VALID_ACTOR_TYPES.includes(actor_type)) {
    throw new Error(`Invalid actor_type: "${actor_type}". Must be one of: ${VALID_ACTOR_TYPES.join(", ")}`);
  }

  // Validate primary role
  if (!VALID_ROLES.includes(primary_role)) {
    throw new Error(`Invalid primary_role: "${primary_role}". Must be one of: ${VALID_ROLES.join(", ")}`);
  }

  // Validate secondary roles
  for (const role of secondary_roles) {
    if (!VALID_ROLES.includes(role)) {
      throw new Error(`Invalid secondary_role: "${role}". Must be one of: ${VALID_ROLES.join(", ")}`);
    }
  }

  // Validate role combinations
  const allRoles = [primary_role, ...secondary_roles];
  for (const [roleA, roleB] of PROHIBITED_ROLE_COMBINATIONS) {
    if (allRoles.includes(roleA) && allRoles.includes(roleB)) {
      throw new Error(
        `Prohibited role combination: "${roleA}" + "${roleB}". ` +
        `This would collapse the governance-execution boundary.`
      );
    }
  }

  // Validate public key format if provided
  if (public_key_hex && !/^[0-9a-f]{64}$/i.test(public_key_hex)) {
    throw new Error("Invalid public_key_hex: must be a 64-character hex string (32 bytes Ed25519).");
  }

  // Check for duplicate
  if (principalCache.has(principal_id)) {
    throw new Error(`Principal already registered: ${principal_id}`);
  }

  const key_status = public_key_hex ? "active" : "none";

  const result = await pool.query(
    `INSERT INTO principals (principal_id, actor_type, display_name, email, primary_role, secondary_roles, public_key_hex, key_status, metadata, registered_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
     RETURNING *`,
    [
      principal_id,
      actor_type,
      display_name,
      email || null,
      primary_role,
      secondary_roles,
      public_key_hex ? public_key_hex.toLowerCase() : null,
      key_status,
      JSON.stringify(metadata),
      registered_by,
    ]
  );

  const row = result.rows[0];
  const principal = {
    principal_id: row.principal_id,
    actor_type: row.actor_type,
    display_name: row.display_name,
    email: row.email,
    primary_role: row.primary_role,
    secondary_roles: row.secondary_roles || [],
    public_key_hex: row.public_key_hex,
    key_status: row.key_status,
    scopes: row.scopes || [],
    metadata: row.metadata || {},
    registered_at: row.registered_at,
    registered_by: row.registered_by,
    last_active_at: row.last_active_at,
    status: row.status,
  };

  principalCache.set(principal_id, principal);

  console.log(
    `[RIO Principals] Registered: ${principal_id} (${actor_type}, ${primary_role})`
  );

  return principal;
}

/**
 * Update a principal's status (active, suspended, revoked).
 *
 * @param {string} principalId
 * @param {string} newStatus
 * @returns {object} Updated principal
 */
export async function updatePrincipalStatus(principalId, newStatus) {
  if (!VALID_STATUSES.includes(newStatus)) {
    throw new Error(`Invalid status: "${newStatus}". Must be one of: ${VALID_STATUSES.join(", ")}`);
  }

  const result = await pool.query(
    "UPDATE principals SET status = $1 WHERE principal_id = $2 RETURNING *",
    [newStatus, principalId]
  );

  if (result.rows.length === 0) {
    throw new Error(`Principal not found: ${principalId}`);
  }

  const row = result.rows[0];
  const principal = {
    principal_id: row.principal_id,
    actor_type: row.actor_type,
    display_name: row.display_name,
    email: row.email,
    primary_role: row.primary_role,
    secondary_roles: row.secondary_roles || [],
    public_key_hex: row.public_key_hex,
    key_status: row.key_status,
    scopes: row.scopes || [],
    metadata: row.metadata || {},
    registered_at: row.registered_at,
    registered_by: row.registered_by,
    last_active_at: row.last_active_at,
    status: row.status,
  };

  principalCache.set(principalId, principal);

  console.log(
    `[RIO Principals] Status updated: ${principalId} → ${newStatus}`
  );

  return principal;
}

/**
 * Update a principal's roles.
 *
 * @param {string} principalId
 * @param {string} primaryRole
 * @param {string[]} secondaryRoles
 * @returns {object} Updated principal
 */
export async function updatePrincipalRoles(principalId, primaryRole, secondaryRoles = []) {
  // Validate
  if (!VALID_ROLES.includes(primaryRole)) {
    throw new Error(`Invalid primary_role: "${primaryRole}".`);
  }
  for (const role of secondaryRoles) {
    if (!VALID_ROLES.includes(role)) {
      throw new Error(`Invalid secondary_role: "${role}".`);
    }
  }

  // Check prohibited combinations
  const allRoles = [primaryRole, ...secondaryRoles];
  for (const [roleA, roleB] of PROHIBITED_ROLE_COMBINATIONS) {
    if (allRoles.includes(roleA) && allRoles.includes(roleB)) {
      throw new Error(
        `Prohibited role combination: "${roleA}" + "${roleB}".`
      );
    }
  }

  const result = await pool.query(
    "UPDATE principals SET primary_role = $1, secondary_roles = $2 WHERE principal_id = $3 RETURNING *",
    [primaryRole, secondaryRoles, principalId]
  );

  if (result.rows.length === 0) {
    throw new Error(`Principal not found: ${principalId}`);
  }

  const row = result.rows[0];
  const principal = {
    principal_id: row.principal_id,
    actor_type: row.actor_type,
    display_name: row.display_name,
    email: row.email,
    primary_role: row.primary_role,
    secondary_roles: row.secondary_roles || [],
    public_key_hex: row.public_key_hex,
    key_status: row.key_status,
    scopes: row.scopes || [],
    metadata: row.metadata || {},
    registered_at: row.registered_at,
    registered_by: row.registered_by,
    last_active_at: row.last_active_at,
    status: row.status,
  };

  principalCache.set(principalId, principal);

  console.log(
    `[RIO Principals] Roles updated: ${principalId} → ${primaryRole} + [${secondaryRoles.join(", ")}]`
  );

  return principal;
}

/**
 * Bind an auth credential to a principal.
 * This creates a mapping from an auth method to a principal_id.
 *
 * @param {string} principalId
 * @param {string} authType - "jwt", "api_key", or "signer"
 * @param {string} authIdentifier - The auth credential identifier
 */
export async function bindAuth(principalId, authType, authIdentifier) {
  if (!["jwt", "api_key", "signer"].includes(authType)) {
    throw new Error(`Invalid auth type: "${authType}".`);
  }

  const principal = principalCache.get(principalId);
  if (!principal) {
    throw new Error(`Principal not found: ${principalId}`);
  }

  // Update metadata with auth binding
  const metadata = { ...principal.metadata };
  if (authType === "jwt") {
    metadata.jwt_sub = authIdentifier;
    authBindings.jwt.set(authIdentifier, principalId);
  } else if (authType === "api_key") {
    metadata.api_key_owner_id = authIdentifier;
    authBindings.api_key.set(authIdentifier, principalId);
  } else if (authType === "signer") {
    metadata.signer_id = authIdentifier;
    authBindings.signer.set(authIdentifier, principalId);
  }

  await pool.query(
    "UPDATE principals SET metadata = $1 WHERE principal_id = $2",
    [JSON.stringify(metadata), principalId]
  );

  principal.metadata = metadata;

  console.log(
    `[RIO Principals] Auth bound: ${principalId} ← ${authType}:${authIdentifier}`
  );
}

// ---------------------------------------------------------------------------
// Exports for testing / inspection
// ---------------------------------------------------------------------------

export { VALID_ACTOR_TYPES, VALID_ROLES, VALID_STATUSES, PROHIBITED_ROLE_COMBINATIONS, INITIAL_PRINCIPALS };
