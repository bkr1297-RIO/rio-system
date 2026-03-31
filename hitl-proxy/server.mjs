/**
 * RIO HITL Proxy — Production Server
 *
 * Implements the exact API surface from the RIO HITL API Playbook:
 *   POST /api/hitl/onboard       — Onboard a proxy user
 *   POST /api/hitl/intent        — Create an intent (risk-scored)
 *   POST /api/hitl/execute       — Execute an intent (with preflight checks)
 *   POST /api/hitl/approval      — Approve or reject an intent
 *   GET  /api/hitl/status/:userId — User status + recent intents/approvals
 *   GET  /api/hitl/ledger        — View audit ledger (last 100)
 *   POST /api/hitl/kill          — Emergency kill switch
 *   GET  /api/hitl/health        — Health check
 *
 * Storage: PostgreSQL (production) or SQLite (local dev)
 * Signing: Ed25519 via Node.js crypto
 * Ledger: SHA-256 hash chain (append-only, tamper-evident)
 */

import express from "express";
import crypto from "node:crypto";

// ─── Database Abstraction ──────────────────────────────────────────────────
// Uses PostgreSQL if DATABASE_URL is set, otherwise falls back to SQLite

let db;
let DB_TYPE;

async function initDb() {
  if (process.env.DATABASE_URL) {
    DB_TYPE = "pg";
    const pg = await import("pg");
    const pool = new pg.default.Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
    db = pool;
    await pool.query(`
      CREATE TABLE IF NOT EXISTS hitl_proxy_users (
        user_id TEXT PRIMARY KEY,
        status TEXT NOT NULL DEFAULT 'ACTIVE',
        seed_id TEXT NOT NULL,
        policy_id TEXT NOT NULL,
        public_key_hex TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        killed_at TIMESTAMPTZ,
        kill_reason TEXT
      );
      CREATE TABLE IF NOT EXISTS hitl_intents (
        intent_id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        tool_name TEXT NOT NULL,
        tool_args JSONB NOT NULL,
        tool_args_hash TEXT NOT NULL,
        risk_tier TEXT NOT NULL,
        approval_required BOOLEAN NOT NULL,
        status TEXT NOT NULL DEFAULT 'PENDING_APPROVAL',
        computed_blast_radius JSONB,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS hitl_approvals (
        approval_id TEXT PRIMARY KEY,
        intent_id TEXT NOT NULL,
        decision TEXT NOT NULL,
        reason TEXT,
        approving_user_id TEXT NOT NULL,
        bound_tool_name TEXT,
        bound_tool_args_hash TEXT,
        signature TEXT,
        public_key_hex TEXT,
        risk_tier TEXT,
        max_executions INTEGER DEFAULT 1,
        executions_used INTEGER DEFAULT 0,
        expiry_seconds INTEGER DEFAULT 300,
        expires_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS hitl_executions (
        execution_id TEXT PRIMARY KEY,
        intent_id TEXT NOT NULL,
        approval_id TEXT,
        status TEXT NOT NULL,
        preflight_result JSONB,
        result JSONB,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS hitl_ledger (
        id SERIAL PRIMARY KEY,
        entry_type TEXT NOT NULL,
        reference_id TEXT NOT NULL,
        user_id TEXT,
        action TEXT NOT NULL,
        detail JSONB,
        hash TEXT NOT NULL,
        prev_hash TEXT NOT NULL,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);
    console.log("[DB] PostgreSQL initialized");
  } else {
    DB_TYPE = "sqlite";
    const sqlite = await import("better-sqlite3");
    db = new sqlite.default(":memory:");
    db.exec(`
      CREATE TABLE IF NOT EXISTS hitl_proxy_users (
        user_id TEXT PRIMARY KEY,
        status TEXT NOT NULL DEFAULT 'ACTIVE',
        seed_id TEXT NOT NULL,
        policy_id TEXT NOT NULL,
        public_key_hex TEXT,
        created_at TEXT DEFAULT (datetime('now')),
        killed_at TEXT,
        kill_reason TEXT
      );
      CREATE TABLE IF NOT EXISTS hitl_intents (
        intent_id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        tool_name TEXT NOT NULL,
        tool_args TEXT NOT NULL,
        tool_args_hash TEXT NOT NULL,
        risk_tier TEXT NOT NULL,
        approval_required INTEGER NOT NULL,
        status TEXT NOT NULL DEFAULT 'PENDING_APPROVAL',
        computed_blast_radius TEXT,
        created_at TEXT DEFAULT (datetime('now'))
      );
      CREATE TABLE IF NOT EXISTS hitl_approvals (
        approval_id TEXT PRIMARY KEY,
        intent_id TEXT NOT NULL,
        decision TEXT NOT NULL,
        reason TEXT,
        approving_user_id TEXT NOT NULL,
        bound_tool_name TEXT,
        bound_tool_args_hash TEXT,
        signature TEXT,
        public_key_hex TEXT,
        risk_tier TEXT,
        max_executions INTEGER DEFAULT 1,
        executions_used INTEGER DEFAULT 0,
        expiry_seconds INTEGER DEFAULT 300,
        expires_at TEXT,
        created_at TEXT DEFAULT (datetime('now'))
      );
      CREATE TABLE IF NOT EXISTS hitl_executions (
        execution_id TEXT PRIMARY KEY,
        intent_id TEXT NOT NULL,
        approval_id TEXT,
        status TEXT NOT NULL,
        preflight_result TEXT,
        result TEXT,
        created_at TEXT DEFAULT (datetime('now'))
      );
      CREATE TABLE IF NOT EXISTS hitl_ledger (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        entry_type TEXT NOT NULL,
        reference_id TEXT NOT NULL,
        user_id TEXT,
        action TEXT NOT NULL,
        detail TEXT,
        hash TEXT NOT NULL,
        prev_hash TEXT NOT NULL,
        created_at TEXT DEFAULT (datetime('now'))
      );
    `);
    console.log("[DB] SQLite (in-memory) initialized");
  }
}

// ─── DB Query Helpers ──────────────────────────────────────────────────────

async function query(sql, params = []) {
  if (DB_TYPE === "pg") {
    const result = await db.query(sql, params);
    return result.rows;
  } else {
    // Convert $1, $2 style to ? style for SQLite
    let idx = 0;
    const sqliteSql = sql.replace(/\$\d+/g, () => "?");
    return db.prepare(sqliteSql).all(...params);
  }
}

async function run(sql, params = []) {
  if (DB_TYPE === "pg") {
    return db.query(sql, params);
  } else {
    let idx = 0;
    const sqliteSql = sql.replace(/\$\d+/g, () => "?");
    return db.prepare(sqliteSql).run(...params);
  }
}

async function getOne(sql, params = []) {
  if (DB_TYPE === "pg") {
    const result = await db.query(sql, params);
    return result.rows[0] || null;
  } else {
    const sqliteSql = sql.replace(/\$\d+/g, () => "?");
    return db.prepare(sqliteSql).get(...params) || null;
  }
}

// ─── Ed25519 Key Management ───────────────────────────────────────────────

function deriveEd25519KeyPair() {
  const secret = process.env.JWT_SECRET || process.env.ED25519_SECRET || "rio-hitl-dev-secret";
  const seed = crypto.createHash("sha256").update(secret).digest();
  const privateKey = crypto.createPrivateKey({
    key: Buffer.concat([
      Buffer.from("302e020100300506032b657004220420", "hex"),
      seed,
    ]),
    format: "der",
    type: "pkcs8",
  });
  const publicKey = crypto.createPublicKey(privateKey);
  return { publicKey, privateKey };
}

const { publicKey, privateKey } = deriveEd25519KeyPair();

function getPublicKeyHex() {
  return publicKey.export({ type: "spki", format: "der" }).toString("hex");
}

function signData(data) {
  return crypto.sign(null, Buffer.from(data), privateKey).toString("hex");
}

function verifySignature(data, sig) {
  try {
    return crypto.verify(null, Buffer.from(data), publicKey, Buffer.from(sig, "hex"));
  } catch {
    return false;
  }
}

// ─── Crypto Helpers ────────────────────────────────────────────────────────

function sha256(data) {
  return crypto.createHash("sha256").update(data).digest("hex");
}

function generateId(prefix) {
  return `${prefix}-${crypto.randomBytes(6).toString("hex").toUpperCase()}`;
}

function canonicalize(obj) {
  return JSON.stringify(obj, Object.keys(obj).sort());
}

// ─── Tool Registry ─────────────────────────────────────────────────────────

const TOOL_REGISTRY = {
  send_email:  { riskTier: "HIGH",   approvalRequired: true,  maxExecutions: 1, expirySeconds: 300 },
  read_email:  { riskTier: "LOW",    approvalRequired: false },
  list_labels: { riskTier: "LOW",    approvalRequired: false },
  echo:        { riskTier: "LOW",    approvalRequired: false },
  write_file:  { riskTier: "MEDIUM", approvalRequired: true,  maxExecutions: 3, expirySeconds: 600 },
  delete_file: { riskTier: "HIGH",   approvalRequired: true,  maxExecutions: 1, expirySeconds: 300 },
  transfer_funds: { riskTier: "CRITICAL", approvalRequired: true, maxExecutions: 1, expirySeconds: 120 },
};

function getToolPolicy(toolName) {
  return TOOL_REGISTRY[toolName] || { riskTier: "HIGH", approvalRequired: true, maxExecutions: 1, expirySeconds: 300 };
}

// ─── Blast Radius Computation ──────────────────────────────────────────────

function computeBlastRadius(toolName, toolArgs) {
  const domainMap = {
    send_email: { reversibility: "HIGH", dataDomains: ["email", "communications"] },
    read_email: { reversibility: "NONE", dataDomains: ["email"] },
    write_file: { reversibility: "MEDIUM", dataDomains: ["filesystem"] },
    delete_file: { reversibility: "HIGH", dataDomains: ["filesystem"] },
    transfer_funds: { reversibility: "CRITICAL", dataDomains: ["financial", "banking"] },
    echo: { reversibility: "NONE", dataDomains: ["system"] },
    list_labels: { reversibility: "NONE", dataDomains: ["email"] },
  };
  return domainMap[toolName] || { reversibility: "UNKNOWN", dataDomains: ["unknown"] };
}

// ─── Ledger (Hash Chain) ───────────────────────────────────────────────────

let lastHash = sha256("GENESIS");

async function appendLedger(entryType, referenceId, userId, action, detail) {
  // Get the last hash from the DB
  const lastEntry = await getOne("SELECT hash FROM hitl_ledger ORDER BY id DESC LIMIT 1");
  const prevHash = lastEntry ? (lastEntry.hash) : sha256("GENESIS");
  const entryData = canonicalize({ entryType, referenceId, userId, action, detail, prevHash, ts: new Date().toISOString() });
  const hash = sha256(entryData);
  const detailStr = typeof detail === "string" ? detail : JSON.stringify(detail);
  await run(
    "INSERT INTO hitl_ledger (entry_type, reference_id, user_id, action, detail, hash, prev_hash) VALUES ($1, $2, $3, $4, $5, $6, $7)",
    [entryType, referenceId, userId, action, detailStr, hash, prevHash]
  );
  return { hash, prevHash };
}

// ─── Tool Executor (Simulated) ─────────────────────────────────────────────

async function executeTool(toolName, toolArgs) {
  // In production, this dispatches to real connectors.
  // For MVP, we simulate execution and return a result.
  switch (toolName) {
    case "echo":
      return { status: "SUCCESS", output: toolArgs.message || "echo" };
    case "send_email":
      return { status: "SUCCESS", output: `Email sent to ${toolArgs.to} with subject "${toolArgs.subject}"` };
    case "read_email":
      return { status: "SUCCESS", output: "Simulated email content" };
    case "list_labels":
      return { status: "SUCCESS", output: ["INBOX", "SENT", "DRAFTS", "SPAM"] };
    default:
      return { status: "SUCCESS", output: `Executed ${toolName} with args: ${JSON.stringify(toolArgs)}` };
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// EXPRESS APP
// ═══════════════════════════════════════════════════════════════════════════

const app = express();
app.use(express.json());

// CORS
app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.header("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  if (req.method === "OPTIONS") return res.sendStatus(200);
  next();
});

// ─── Health ────────────────────────────────────────────────────────────────

app.get("/health", (req, res) => {
  res.json({ status: "ok", service: "rio-hitl-proxy", dbType: DB_TYPE, timestamp: new Date().toISOString() });
});

app.get("/api/hitl/health", (req, res) => {
  res.json({ status: "ok", service: "rio-hitl-proxy", dbType: DB_TYPE, timestamp: new Date().toISOString() });
});

// ─── Step 1: Onboard ──────────────────────────────────────────────────────

app.post("/api/hitl/onboard", async (req, res) => {
  try {
    const { userId } = req.body;
    if (!userId) return res.status(400).json({ error: "userId is required" });

    // Check if already onboarded
    const existing = await getOne("SELECT * FROM hitl_proxy_users WHERE user_id = $1", [userId]);
    if (existing) {
      if (existing.status === "KILLED") {
        return res.status(403).json({ error: "PROXY_KILLED", message: "This proxy user has been killed and cannot be re-onboarded." });
      }
      return res.json({ proxyUser: existing, message: "Already onboarded" });
    }

    const seedId = "SEED-v1.0.0-system";
    const policyId = "POLICY-v1.0.0-system";
    const pubKeyHex = getPublicKeyHex();

    await run(
      "INSERT INTO hitl_proxy_users (user_id, status, seed_id, policy_id, public_key_hex) VALUES ($1, $2, $3, $4, $5)",
      [userId, "ACTIVE", seedId, policyId, pubKeyHex]
    );

    const proxyUser = { userId, status: "ACTIVE", seedId, policyId, publicKeyHex: pubKeyHex };
    await appendLedger("ONBOARD", userId, userId, "proxy_onboard", { seedId, policyId });

    res.status(201).json({ proxyUser });
  } catch (err) {
    console.error("[ONBOARD]", err);
    res.status(500).json({ error: err.message });
  }
});

// ─── Step 2/4: Create Intent ──────────────────────────────────────────────

app.post("/api/hitl/intent", async (req, res) => {
  try {
    const { userId, toolName, toolArgs } = req.body;
    if (!userId || !toolName) return res.status(400).json({ error: "userId and toolName are required" });

    // Check proxy user is active
    const user = await getOne("SELECT * FROM hitl_proxy_users WHERE user_id = $1", [userId]);
    if (!user) return res.status(404).json({ error: "User not onboarded. Call /onboard first." });
    if (user.status === "KILLED") return res.status(403).json({ error: "PROXY_KILLED" });

    const policy = getToolPolicy(toolName);
    const argsHash = sha256(canonicalize(toolArgs || {}));
    const intentId = generateId("INTENT");
    const blastRadius = computeBlastRadius(toolName, toolArgs);
    const argsStr = typeof toolArgs === "string" ? toolArgs : JSON.stringify(toolArgs || {});
    const blastStr = JSON.stringify(blastRadius);

    await run(
      "INSERT INTO hitl_intents (intent_id, user_id, tool_name, tool_args, tool_args_hash, risk_tier, approval_required, status, computed_blast_radius) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)",
      [intentId, userId, toolName, argsStr, argsHash, policy.riskTier, policy.approvalRequired ? 1 : 0, "PENDING_APPROVAL", blastStr]
    );

    await appendLedger("INTENT", intentId, userId, "intent_created", { toolName, riskTier: policy.riskTier, argsHash });

    res.status(201).json({
      intentId,
      approvalRequired: policy.approvalRequired,
      intent: {
        intentId,
        userId,
        toolName,
        toolArgs: toolArgs || {},
        riskTier: policy.riskTier,
        status: "PENDING_APPROVAL",
        computedBlastRadius: blastRadius,
      },
    });
  } catch (err) {
    console.error("[INTENT]", err);
    res.status(500).json({ error: err.message });
  }
});

// ─── Step 5/7: Approval ───────────────────────────────────────────────────

app.post("/api/hitl/approval", async (req, res) => {
  try {
    const { intentId, decision, approvingUserId } = req.body;
    if (!intentId || !decision || !approvingUserId) {
      return res.status(400).json({ error: "intentId, decision, and approvingUserId are required" });
    }

    const intent = await getOne("SELECT * FROM hitl_intents WHERE intent_id = $1", [intentId]);
    if (!intent) return res.status(404).json({ error: "Intent not found" });

    // Check proxy user
    const user = await getOne("SELECT * FROM hitl_proxy_users WHERE user_id = $1", [intent.user_id]);
    if (user && user.status === "KILLED") return res.status(403).json({ error: "PROXY_KILLED" });

    if (intent.status !== "PENDING_APPROVAL") {
      return res.status(409).json({ error: `Intent is already ${intent.status}` });
    }

    const decisionValue = decision.value || decision;
    const reason = decision.reason || "";

    if (decisionValue === "no" || decisionValue === "reject" || decisionValue === "denied") {
      // Rejection
      await run("UPDATE hitl_intents SET status = $1 WHERE intent_id = $2", ["REJECTED", intentId]);
      await appendLedger("APPROVAL", intentId, approvingUserId, "intent_rejected", { reason });
      return res.json({ approval: { intentId, decision: "REJECTED", reason } });
    }

    // Approval
    const policy = getToolPolicy(intent.tool_name);
    const approvalId = generateId("APPR");
    const expirySeconds = policy.expirySeconds || 300;
    const maxExecutions = policy.maxExecutions || 1;
    const expiresAt = new Date(Date.now() + expirySeconds * 1000).toISOString();

    // Sign the approval payload
    const approvalPayload = canonicalize({
      approvalId,
      intentId,
      toolName: intent.tool_name,
      toolArgsHash: intent.tool_args_hash,
      decision: "APPROVED",
      approvingUserId,
      expiresAt,
      maxExecutions,
    });
    const signature = signData(approvalPayload);

    await run(
      `INSERT INTO hitl_approvals (approval_id, intent_id, decision, reason, approving_user_id, bound_tool_name, bound_tool_args_hash, signature, public_key_hex, risk_tier, max_executions, executions_used, expiry_seconds, expires_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)`,
      [approvalId, intentId, "APPROVED", reason, approvingUserId, intent.tool_name, intent.tool_args_hash, signature, getPublicKeyHex(), policy.riskTier, maxExecutions, 0, expirySeconds, expiresAt]
    );

    await run("UPDATE hitl_intents SET status = $1 WHERE intent_id = $2", ["APPROVED", intentId]);
    await appendLedger("APPROVAL", approvalId, approvingUserId, "intent_approved", {
      intentId,
      toolName: intent.tool_name,
      riskTier: policy.riskTier,
      expiresAt,
      maxExecutions,
    });

    res.status(201).json({
      approvalId,
      approval: {
        approvalId,
        intentId,
        status: "APPROVED",
        riskTier: policy.riskTier,
        maxExecutions,
        executionsUsed: 0,
        expiresAt,
        signature: signature.substring(0, 32) + "...",
      },
    });
  } catch (err) {
    console.error("[APPROVAL]", err);
    res.status(500).json({ error: err.message });
  }
});

// ─── Step 3/6: Execute ────────────────────────────────────────────────────

app.post("/api/hitl/execute", async (req, res) => {
  try {
    const { intentId, approvalId } = req.body;
    if (!intentId) return res.status(400).json({ error: "intentId is required" });

    const intent = await getOne("SELECT * FROM hitl_intents WHERE intent_id = $1", [intentId]);
    if (!intent) return res.status(404).json({ error: "Intent not found" });

    // Check proxy user
    const user = await getOne("SELECT * FROM hitl_proxy_users WHERE user_id = $1", [intent.user_id]);
    if (user && user.status === "KILLED") {
      return res.status(403).json({ error: "PROXY_KILLED", preflightFailed: "PROXY_KILLED" });
    }

    // If intent already executed, block re-execution
    if (intent.status === "EXECUTED") {
      return res.status(403).json({ error: "APPROVAL_EXHAUSTED", message: "This intent has already been executed." });
    }

    const policy = getToolPolicy(intent.tool_name);
    const toolArgs = typeof intent.tool_args === "string" ? JSON.parse(intent.tool_args) : intent.tool_args;

    // LOW risk: no approval needed
    if (!policy.approvalRequired) {
      const result = await executeTool(intent.tool_name, toolArgs);
      const executionId = generateId("EXEC");
      await run(
        "INSERT INTO hitl_executions (execution_id, intent_id, status, result) VALUES ($1, $2, $3, $4)",
        [executionId, intentId, "SUCCESS", JSON.stringify(result)]
      );
      await run("UPDATE hitl_intents SET status = $1 WHERE intent_id = $2", ["EXECUTED", intentId]);
      await appendLedger("EXECUTION", executionId, intent.user_id, "intent_executed", {
        intentId,
        toolName: intent.tool_name,
        riskTier: policy.riskTier,
        result: result.status,
      });
      return res.json({ executionId, result });
    }

    // HIGH/MEDIUM/CRITICAL risk: run preflight checks
    const preflightChecks = [];

    // Check 1: approvalId provided
    if (!approvalId) {
      preflightChecks.push({ check: "MISSING_APPROVAL_ID", passed: false });
      await appendLedger("PREFLIGHT_FAIL", intentId, intent.user_id, "preflight_failed", { check: "MISSING_APPROVAL_ID" });
      return res.status(400).json({ error: "MISSING_APPROVAL_ID", preflightChecks });
    }
    preflightChecks.push({ check: "MISSING_APPROVAL_ID", passed: true });

    // Check 2: intent is approved
    if (intent.status !== "APPROVED") {
      preflightChecks.push({ check: "INTENT_NOT_APPROVED", passed: false, actual: intent.status });
      return res.status(403).json({ error: "INTENT_NOT_APPROVED", preflightChecks });
    }
    preflightChecks.push({ check: "INTENT_NOT_APPROVED", passed: true });

    // Check 3: approval exists
    const approval = await getOne("SELECT * FROM hitl_approvals WHERE approval_id = $1", [approvalId]);
    if (!approval) {
      preflightChecks.push({ check: "APPROVAL_NOT_FOUND", passed: false });
      return res.status(404).json({ error: "APPROVAL_NOT_FOUND", preflightChecks });
    }
    preflightChecks.push({ check: "APPROVAL_NOT_FOUND", passed: true });

    // Check 4: not expired
    const expiresAt = new Date(approval.expires_at);
    if (Date.now() > expiresAt.getTime()) {
      preflightChecks.push({ check: "APPROVAL_EXPIRED", passed: false, expiresAt: approval.expires_at });
      return res.status(403).json({ error: "APPROVAL_EXPIRED", preflightChecks });
    }
    preflightChecks.push({ check: "APPROVAL_EXPIRED", passed: true });

    // Check 5: not exhausted
    if (approval.executions_used >= approval.max_executions) {
      preflightChecks.push({ check: "APPROVAL_EXHAUSTED", passed: false });
      return res.status(403).json({ error: "APPROVAL_EXHAUSTED", preflightChecks });
    }
    preflightChecks.push({ check: "APPROVAL_EXHAUSTED", passed: true });

    // Check 6: tool name matches
    if (approval.bound_tool_name !== intent.tool_name) {
      preflightChecks.push({ check: "TOOL_NAME_MISMATCH", passed: false });
      return res.status(403).json({ error: "TOOL_NAME_MISMATCH", preflightChecks });
    }
    preflightChecks.push({ check: "TOOL_NAME_MISMATCH", passed: true });

    // Check 7: args hash matches
    if (approval.bound_tool_args_hash !== intent.tool_args_hash) {
      preflightChecks.push({ check: "ARGS_HASH_MISMATCH", passed: false });
      return res.status(403).json({ error: "ARGS_HASH_MISMATCH", preflightChecks });
    }
    preflightChecks.push({ check: "ARGS_HASH_MISMATCH", passed: true });

    // Check 8: Ed25519 signature valid
    const approvalPayload = canonicalize({
      approvalId: approval.approval_id,
      intentId: approval.intent_id,
      toolName: approval.bound_tool_name,
      toolArgsHash: approval.bound_tool_args_hash,
      decision: "APPROVED",
      approvingUserId: approval.approving_user_id,
      expiresAt: approval.expires_at,
      maxExecutions: approval.max_executions,
    });
    const sigValid = verifySignature(approvalPayload, approval.signature);
    if (!sigValid) {
      preflightChecks.push({ check: "INVALID_SIGNATURE", passed: false });
      return res.status(403).json({ error: "INVALID_SIGNATURE", preflightChecks });
    }
    preflightChecks.push({ check: "INVALID_SIGNATURE", passed: true });

    // All checks passed — execute
    const result = await executeTool(intent.tool_name, toolArgs);
    const executionId = generateId("EXEC");

    // Increment executions_used
    await run("UPDATE hitl_approvals SET executions_used = executions_used + 1 WHERE approval_id = $1", [approvalId]);
    await run(
      "INSERT INTO hitl_executions (execution_id, intent_id, approval_id, status, preflight_result, result) VALUES ($1, $2, $3, $4, $5, $6)",
      [executionId, intentId, approvalId, "SUCCESS", JSON.stringify(preflightChecks), JSON.stringify(result)]
    );
    await run("UPDATE hitl_intents SET status = $1 WHERE intent_id = $2", ["EXECUTED", intentId]);

    await appendLedger("EXECUTION", executionId, intent.user_id, "intent_executed", {
      intentId,
      approvalId,
      toolName: intent.tool_name,
      riskTier: policy.riskTier,
      preflightChecks: preflightChecks.length,
      allPassed: true,
      result: result.status,
    });

    res.json({ executionId, preflightChecks, result });
  } catch (err) {
    console.error("[EXECUTE]", err);
    res.status(500).json({ error: err.message });
  }
});

// ─── Step 8: Status ───────────────────────────────────────────────────────

app.get("/api/hitl/status/:userId", async (req, res) => {
  try {
    const { userId } = req.params;
    const user = await getOne("SELECT * FROM hitl_proxy_users WHERE user_id = $1", [userId]);
    if (!user) return res.status(404).json({ error: "User not found" });

    const recentIntents = await query(
      "SELECT * FROM hitl_intents WHERE user_id = $1 ORDER BY created_at DESC LIMIT 10",
      [userId]
    );
    const recentApprovals = await query(
      "SELECT * FROM hitl_approvals WHERE approving_user_id = $1 ORDER BY created_at DESC LIMIT 10",
      [userId]
    );

    res.json({ proxyUser: user, recentIntents, recentApprovals });
  } catch (err) {
    console.error("[STATUS]", err);
    res.status(500).json({ error: err.message });
  }
});

// ─── Step 9: Ledger ───────────────────────────────────────────────────────

app.get("/api/hitl/ledger", async (req, res) => {
  try {
    const entries = await query("SELECT * FROM hitl_ledger ORDER BY id DESC LIMIT 100");
    res.json({ entries, count: entries.length });
  } catch (err) {
    console.error("[LEDGER]", err);
    res.status(500).json({ error: err.message });
  }
});

// ─── Step 10: Kill Switch ─────────────────────────────────────────────────

app.post("/api/hitl/kill", async (req, res) => {
  try {
    const { userId, reason } = req.body;
    if (!userId) return res.status(400).json({ error: "userId is required" });

    const user = await getOne("SELECT * FROM hitl_proxy_users WHERE user_id = $1", [userId]);
    if (!user) return res.status(404).json({ error: "User not found" });
    if (user.status === "KILLED") return res.json({ message: "Already killed", proxyUser: user });

    // Kill the user
    await run(
      "UPDATE hitl_proxy_users SET status = $1, killed_at = $2, kill_reason = $3 WHERE user_id = $4",
      ["KILLED", new Date().toISOString(), reason || "Emergency kill switch activated", userId]
    );

    // Revoke all active approvals for this user's intents
    const userIntents = await query("SELECT intent_id FROM hitl_intents WHERE user_id = $1", [userId]);
    for (const intent of userIntents) {
      const iid = intent.intent_id;
      await run("UPDATE hitl_intents SET status = $1 WHERE intent_id = $2 AND status != $3", ["KILLED", iid, "EXECUTED"]);
    }

    await appendLedger("KILL", userId, userId, "proxy_killed", { reason: reason || "Emergency kill switch activated" });

    res.json({
      message: "PROXY_KILLED",
      userId,
      reason: reason || "Emergency kill switch activated",
      allApprovalsRevoked: true,
    });
  } catch (err) {
    console.error("[KILL]", err);
    res.status(500).json({ error: err.message });
  }
});

// ─── Ledger Verification ──────────────────────────────────────────────────

app.get("/api/hitl/verify", async (req, res) => {
  try {
    const entries = await query("SELECT * FROM hitl_ledger ORDER BY id ASC");
    if (entries.length === 0) return res.json({ valid: true, message: "Ledger is empty", entries: 0 });

    let valid = true;
    let brokenAt = null;
    for (let i = 1; i < entries.length; i++) {
      if (entries[i].prev_hash !== entries[i - 1].hash) {
        valid = false;
        brokenAt = i;
        break;
      }
    }

    res.json({ valid, entries: entries.length, brokenAt });
  } catch (err) {
    console.error("[VERIFY]", err);
    res.status(500).json({ error: err.message });
  }
});

// ─── Start Server ──────────────────────────────────────────────────────────

const PORT = process.env.PORT || process.env.RIO_HITL_PORT || 8080;

async function start() {
  await initDb();
  app.listen(PORT, "0.0.0.0", () => {
    console.log(`[RIO HITL Proxy] Running on port ${PORT}`);
    console.log(`[RIO HITL Proxy] DB: ${DB_TYPE}`);
    console.log(`[RIO HITL Proxy] Ed25519 public key: ${getPublicKeyHex().substring(0, 32)}...`);
    console.log(`[RIO HITL Proxy] Endpoints: /api/hitl/{onboard,intent,approval,execute,status/:userId,ledger,kill,verify,health}`);
  });
}

start().catch((err) => {
  console.error("[FATAL]", err);
  process.exit(1);
});
