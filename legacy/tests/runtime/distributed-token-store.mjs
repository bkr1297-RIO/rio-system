// All tests validate: /specs/canonical/RIO_CANONICAL_SPEC_v1.0.md

/**
 * Distributed Token Store — File-Backed (Simulates Shared Database)
 * ═══════════════════════════════════════════════════════════════════
 *
 * This module replaces the in-memory Map<string, AuthorizationToken>
 * with a file-backed store that multiple processes can access concurrently.
 *
 * Two modes:
 *   1. UNSAFE — read-modify-write without locking (demonstrates the race)
 *   2. CAS    — atomic compare-and-swap with file locking (demonstrates the fix)
 *
 * The file acts as a shared database row. Each process:
 *   - Reads the current token state
 *   - Checks execution_count < max_executions
 *   - Increments execution_count
 *   - Writes back
 *
 * In UNSAFE mode, multiple processes can read the same state before any writes,
 * causing double-execution. In CAS mode, only one process wins the swap.
 */

import { readFileSync, writeFileSync, existsSync, unlinkSync, mkdirSync } from "fs";
import { createHash, randomUUID } from "crypto";
import { join, dirname } from "path";

const STORE_DIR = join(dirname(new URL(import.meta.url).pathname), ".distributed-test");
const TOKEN_FILE = join(STORE_DIR, "token.json");
const LOCK_FILE = join(STORE_DIR, "token.lock");
const RESULTS_FILE = join(STORE_DIR, "results.json");

// ─── Helpers ───

function ensureDir() {
  if (!existsSync(STORE_DIR)) mkdirSync(STORE_DIR, { recursive: true });
}

function sleep(ms) {
  const end = Date.now() + ms;
  while (Date.now() < end) { /* busy wait — simulates real I/O latency */ }
}

// ─── UNSAFE read-modify-write (no locking) ───

function unsafeRead() {
  return JSON.parse(readFileSync(TOKEN_FILE, "utf-8"));
}

function unsafeWrite(token) {
  writeFileSync(TOKEN_FILE, JSON.stringify(token, null, 2));
}

/**
 * UNSAFE validate-and-increment.
 * Reads token, checks count, sleeps (simulates network latency),
 * then writes back. Multiple processes can interleave here.
 */
function unsafeValidateAndIncrement(workerId) {
  const token = unsafeRead();

  // Check: execution_count < max_executions
  if (token.execution_count >= token.max_executions) {
    return { workerId, success: false, reason: "execution_count >= max_executions", count_seen: token.execution_count };
  }

  // Check: not burned
  if (token.status === "BURNED") {
    return { workerId, success: false, reason: "token_burned", count_seen: token.execution_count };
  }

  // ═══ THE RACE WINDOW ═══
  // Multiple processes can reach this point with execution_count === 0.
  // The sleep simulates real-world I/O latency (DB round-trip, network, etc.)
  sleep(Math.floor(Math.random() * 5) + 1); // 1-5ms jitter

  // Increment and write back
  token.execution_count += 1;
  token.last_executor = `worker-${workerId}`;
  token.last_executed_at = new Date().toISOString();
  unsafeWrite(token);

  return { workerId, success: true, reason: "executed", count_seen: token.execution_count - 1, count_after: token.execution_count };
}

// ─── CAS (Compare-And-Swap) with file locking ───

function acquireLock(timeoutMs = 2000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      // O_EXCL — atomic create-if-not-exists
      writeFileSync(LOCK_FILE, String(process.pid), { flag: "wx" });
      return true;
    } catch {
      // Lock exists — spin
      sleep(1);
    }
  }
  return false; // Timeout
}

function releaseLock() {
  try { unlinkSync(LOCK_FILE); } catch { /* already released */ }
}

/**
 * CAS validate-and-increment.
 * Acquires exclusive lock, reads token, checks count, increments, writes, releases.
 * Only one process can hold the lock at a time.
 */
function casValidateAndIncrement(workerId) {
  // Acquire lock (simulates SELECT ... FOR UPDATE or Redis SETNX)
  const locked = acquireLock();
  if (!locked) {
    return { workerId, success: false, reason: "lock_timeout", count_seen: -1 };
  }

  try {
    const token = unsafeRead();

    // Check: execution_count < max_executions
    if (token.execution_count >= token.max_executions) {
      return { workerId, success: false, reason: "execution_count >= max_executions", count_seen: token.execution_count };
    }

    // Check: not burned
    if (token.status === "BURNED") {
      return { workerId, success: false, reason: "token_burned", count_seen: token.execution_count };
    }

    // Increment and write (under lock — no interleaving possible)
    token.execution_count += 1;
    token.last_executor = `worker-${workerId}`;
    token.last_executed_at = new Date().toISOString();

    // Burn if max reached
    if (token.execution_count >= token.max_executions) {
      token.status = "BURNED";
      token.burned_at = new Date().toISOString();
      token.burned_by = `worker-${workerId}`;
    }

    unsafeWrite(token);
    return { workerId, success: true, reason: "executed_under_cas", count_seen: token.execution_count - 1, count_after: token.execution_count };
  } finally {
    releaseLock();
  }
}

// ─── Token initialization ───

export function initToken(maxExecutions = 1) {
  ensureDir();
  // Clean up any stale lock
  try { unlinkSync(LOCK_FILE); } catch { /* ok */ }
  // Clean up stale results
  try { unlinkSync(RESULTS_FILE); } catch { /* ok */ }

  const token = {
    token_id: `ATOK-DIST-${randomUUID().replace(/-/g, "").substring(0, 16)}`,
    intent_id: `INT-DIST-${randomUUID().replace(/-/g, "").substring(0, 8)}`,
    action: "send_email",
    parameters_hash: createHash("sha256").update(JSON.stringify({ action: "send_email", args: { to: "brian@example.com", subject: "Distributed Test", body: "Race condition test." } })).digest("hex"),
    approved_by: "approver-dist-001",
    policy_hash: createHash("sha256").update("DIST-TEST-POLICY-v1").digest("hex"),
    issued_at: new Date().toISOString(),
    expires_at: new Date(Date.now() + 300000).toISOString(), // 5 min
    max_executions: maxExecutions,
    execution_count: 0,
    status: "ACTIVE",
    signature: "dist-test-signature-" + randomUUID(),
    last_executor: null,
    last_executed_at: null,
    burned_at: null,
    burned_by: null,
  };

  writeFileSync(TOKEN_FILE, JSON.stringify(token, null, 2));
  return token;
}

// ─── Worker entry point ───

export function runWorker(workerId, mode) {
  if (mode === "unsafe") {
    return unsafeValidateAndIncrement(workerId);
  } else if (mode === "cas") {
    return casValidateAndIncrement(workerId);
  } else {
    throw new Error(`Unknown mode: ${mode}`);
  }
}

// ─── Results aggregation ───

export function appendResult(result) {
  ensureDir();
  let results = [];
  try { results = JSON.parse(readFileSync(RESULTS_FILE, "utf-8")); } catch { /* empty */ }
  results.push(result);
  writeFileSync(RESULTS_FILE, JSON.stringify(results, null, 2));
}

export function readResults() {
  try { return JSON.parse(readFileSync(RESULTS_FILE, "utf-8")); } catch { return []; }
}

export function readFinalToken() {
  try { return JSON.parse(readFileSync(TOKEN_FILE, "utf-8")); } catch { return null; }
}

export function cleanup() {
  try { unlinkSync(TOKEN_FILE); } catch { /* ok */ }
  try { unlinkSync(LOCK_FILE); } catch { /* ok */ }
  try { unlinkSync(RESULTS_FILE); } catch { /* ok */ }
}

export { STORE_DIR, TOKEN_FILE, LOCK_FILE, RESULTS_FILE };
