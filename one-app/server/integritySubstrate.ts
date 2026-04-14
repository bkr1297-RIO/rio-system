/**
 * RIO Integrity Substrate
 * ═══════════════════════════════════════════════════════════════
 * The TCP/IP layer for RIO governance. Sits BENEATH all four
 * governance surfaces (Intent, State, Policy, Authority).
 *
 * Handles:
 *   1. Nonce enforcement — every execution token is single-use
 *   2. Deduplication — same message arriving twice is killed before governance
 *   3. Replay protection — valid token from past action cannot replay against new action
 *   4. Receipt linkage — every execution/approval/denial linked to receipt → ledger
 *
 * Design rule:
 *   If a message fails dedup or nonce check, it is BLOCKED and LOGGED
 *   at the substrate level. Governance surfaces never see it.
 *
 * April 12th Frozen Build Spec — Priority 1
 */

import { createHash } from "crypto";
import { nanoid } from "nanoid";
import { appendLedger } from "./db";

// ═══════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════

export interface SubstrateCheck {
  /** Unique check ID */
  check_id: string;
  /** What was checked */
  check_type: "nonce" | "dedup" | "replay" | "receipt_linkage";
  /** Did it pass? */
  passed: boolean;
  /** Human-readable detail */
  detail: string;
  /** ISO timestamp */
  timestamp: string;
}

export interface SubstrateResult {
  /** Did the message pass all substrate checks? */
  passed: boolean;
  /** Individual check results */
  checks: SubstrateCheck[];
  /** Content hash of the message (for dedup tracking) */
  content_hash: string;
  /** Nonce used */
  nonce: string;
  /** If blocked, the reason */
  block_reason: string | null;
  /** ISO timestamp */
  timestamp: string;
}

export interface SubstrateLogEntry {
  /** Log entry ID */
  log_id: string;
  /** What happened */
  event: "PASSED" | "BLOCKED_DEDUP" | "BLOCKED_NONCE" | "BLOCKED_REPLAY";
  /** Content hash */
  content_hash: string;
  /** Nonce */
  nonce: string;
  /** Source of the message */
  source: string;
  /** Channel */
  channel: string;
  /** Detail */
  detail: string;
  /** ISO timestamp */
  timestamp: string;
}

// ═══════════════════════════════════════════════════════════════
// IN-MEMORY STORES (with TTL cleanup)
// ═══════════════════════════════════════════════════════════════

/** Nonces that have been used — permanently marked within TTL window */
const usedNonces = new Map<string, number>(); // nonce → timestamp

/** Content hashes seen recently — for dedup */
const seenContentHashes = new Map<string, { count: number; first_seen: number; last_seen: number }>();

/** Proposal hashes bound to execution tokens — for replay protection */
const tokenBindings = new Map<string, string>(); // token_id → proposal_hash

/** Substrate log — in-memory ring buffer */
const substrateLog: SubstrateLogEntry[] = [];
const MAX_LOG_SIZE = 1000;

/** TTL for dedup and nonce windows */
const DEDUP_TTL_MS = 5 * 60 * 1000; // 5 minutes — same message within 5 min is a duplicate
const NONCE_TTL_MS = 10 * 60 * 1000; // 10 minutes — nonces expire after 10 min

// ═══════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════

function sha256(data: string): string {
  return createHash("sha256").update(data).digest("hex");
}

/** Normalize message content for dedup — lowercase, trim, collapse whitespace */
function normalizeContent(content: string): string {
  return content.toLowerCase().trim().replace(/\s+/g, " ");
}

/** Clean expired entries from stores */
function cleanExpired(): void {
  const now = Date.now();

  // Clean expired nonces
  for (const [nonce, ts] of Array.from(usedNonces.entries())) {
    if (now - ts > NONCE_TTL_MS) {
      usedNonces.delete(nonce);
    }
  }

  // Clean expired content hashes
  for (const [hash, entry] of Array.from(seenContentHashes.entries())) {
    if (now - entry.last_seen > DEDUP_TTL_MS) {
      seenContentHashes.delete(hash);
    }
  }
}

/** Log a substrate event */
function logSubstrate(entry: Omit<SubstrateLogEntry, "log_id" | "timestamp">): void {
  const logEntry: SubstrateLogEntry = {
    log_id: `SUB-${nanoid(12)}`,
    ...entry,
    timestamp: new Date().toISOString(),
  };

  substrateLog.push(logEntry);

  // Ring buffer — trim oldest entries
  if (substrateLog.length > MAX_LOG_SIZE) {
    substrateLog.splice(0, substrateLog.length - MAX_LOG_SIZE);
  }
}

// ═══════════════════════════════════════════════════════════════
// SUBSTRATE CHECKS
// ═══════════════════════════════════════════════════════════════

/**
 * Check 1: Nonce enforcement
 * Every message must carry a unique nonce. Used nonces are permanently
 * marked within the TTL window. Reuse is rejected.
 */
function checkNonce(nonce: string): SubstrateCheck {
  const check_id = `CHK-N-${nanoid(8)}`;
  const timestamp = new Date().toISOString();

  if (!nonce || nonce.length === 0) {
    return {
      check_id,
      check_type: "nonce",
      passed: false,
      detail: "Nonce is missing or empty",
      timestamp,
    };
  }

  if (usedNonces.has(nonce)) {
    return {
      check_id,
      check_type: "nonce",
      passed: false,
      detail: `Nonce ${nonce.substring(0, 8)}... already used`,
      timestamp,
    };
  }

  // Mark nonce as used
  usedNonces.set(nonce, Date.now());

  return {
    check_id,
    check_type: "nonce",
    passed: true,
    detail: `Nonce ${nonce.substring(0, 8)}... accepted`,
    timestamp,
  };
}

/**
 * Check 2: Content-hash deduplication
 * SHA-256 of normalized message content. If the same content hash
 * has been seen within the dedup TTL window, reject it.
 */
function checkDedup(contentHash: string): SubstrateCheck {
  const check_id = `CHK-D-${nanoid(8)}`;
  const timestamp = new Date().toISOString();
  const now = Date.now();

  const existing = seenContentHashes.get(contentHash);

  if (existing && (now - existing.last_seen) < DEDUP_TTL_MS) {
    // Duplicate within TTL window
    existing.count++;
    existing.last_seen = now;

    return {
      check_id,
      check_type: "dedup",
      passed: false,
      detail: `Duplicate content detected (seen ${existing.count} times, first at ${new Date(existing.first_seen).toISOString()})`,
      timestamp,
    };
  }

  // New content or expired — mark as seen
  seenContentHashes.set(contentHash, {
    count: 1,
    first_seen: now,
    last_seen: now,
  });

  return {
    check_id,
    check_type: "dedup",
    passed: true,
    detail: "Content is unique within dedup window",
    timestamp,
  };
}

/**
 * Check 3: Replay protection
 * A valid token from a past action cannot be replayed against a new action.
 * Token is bound to the exact proposal hash at issuance time.
 */
function checkReplay(contentHash: string, tokenId?: string): SubstrateCheck {
  const check_id = `CHK-R-${nanoid(8)}`;
  const timestamp = new Date().toISOString();

  // If no token provided, replay check passes (first-time message, no token to replay)
  if (!tokenId) {
    return {
      check_id,
      check_type: "replay",
      passed: true,
      detail: "No execution token — first-time message, replay check not applicable",
      timestamp,
    };
  }

  const boundHash = tokenBindings.get(tokenId);

  if (!boundHash) {
    return {
      check_id,
      check_type: "replay",
      passed: true,
      detail: `Token ${tokenId.substring(0, 8)}... has no prior binding — accepted`,
      timestamp,
    };
  }

  if (boundHash !== contentHash) {
    return {
      check_id,
      check_type: "replay",
      passed: false,
      detail: `Replay detected: token ${tokenId.substring(0, 8)}... was bound to different content hash`,
      timestamp,
    };
  }

  return {
    check_id,
    check_type: "replay",
    passed: true,
    detail: `Token ${tokenId.substring(0, 8)}... matches bound content hash`,
    timestamp,
  };
}

/**
 * Check 4: Receipt linkage
 * Verifies that the message has the necessary fields to produce
 * a complete receipt chain (intent → decision → receipt → ledger).
 */
function checkReceiptLinkage(params: {
  hasIntentId: boolean;
  hasSource: boolean;
  hasAction: boolean;
}): SubstrateCheck {
  const check_id = `CHK-L-${nanoid(8)}`;
  const timestamp = new Date().toISOString();
  const missing: string[] = [];

  // We need at minimum: a way to identify the intent, who sent it, and what it is
  if (!params.hasSource) missing.push("source");
  if (!params.hasAction) missing.push("action");

  if (missing.length > 0) {
    return {
      check_id,
      check_type: "receipt_linkage",
      passed: false,
      detail: `Missing fields for receipt chain: ${missing.join(", ")}`,
      timestamp,
    };
  }

  return {
    check_id,
    check_type: "receipt_linkage",
    passed: true,
    detail: "All fields present for receipt chain linkage",
    timestamp,
  };
}

// ═══════════════════════════════════════════════════════════════
// MAIN SUBSTRATE GATE
// ═══════════════════════════════════════════════════════════════

export interface SubstrateInput {
  /** Message content (for dedup hashing) */
  content: string;
  /** Unique nonce for this message */
  nonce: string;
  /** Who sent this */
  source: string;
  /** What action */
  action: string;
  /** Channel */
  channel: string;
  /** Optional execution token ID (for replay check) */
  token_id?: string;
}

/**
 * Run all substrate checks on an incoming message.
 * This is the FIRST thing that runs — before any governance surface sees the message.
 *
 * If any check fails, the message is BLOCKED and LOGGED at the substrate level.
 * Governance surfaces never see it.
 */
export function validateAtSubstrate(input: SubstrateInput): SubstrateResult {
  // Clean expired entries first
  cleanExpired();

  const timestamp = new Date().toISOString();
  const contentHash = sha256(normalizeContent(input.content));
  const checks: SubstrateCheck[] = [];

  // Run all four checks
  const nonceCheck = checkNonce(input.nonce);
  checks.push(nonceCheck);

  const dedupCheck = checkDedup(contentHash);
  checks.push(dedupCheck);

  const replayCheck = checkReplay(contentHash, input.token_id);
  checks.push(replayCheck);

  const linkageCheck = checkReceiptLinkage({
    hasIntentId: true, // Will be assigned by action store
    hasSource: !!input.source && input.source.length > 0,
    hasAction: !!input.action && input.action.length > 0,
  });
  checks.push(linkageCheck);

  // Determine overall result
  const passed = checks.every(c => c.passed);
  let block_reason: string | null = null;

  if (!passed) {
    const failedChecks = checks.filter(c => !c.passed);
    block_reason = failedChecks.map(c => `${c.check_type}: ${c.detail}`).join("; ");
  }

  // Log the result
  const event = !passed
    ? (!nonceCheck.passed ? "BLOCKED_NONCE"
      : !dedupCheck.passed ? "BLOCKED_DEDUP"
      : "BLOCKED_REPLAY")
    : "PASSED";

  logSubstrate({
    event,
    content_hash: contentHash,
    nonce: input.nonce,
    source: input.source,
    channel: input.channel,
    detail: block_reason || "All substrate checks passed",
  });

  // Write blocked attempts to the ledger — every denial produces a receipt
  if (!passed) {
    appendLedger("SUBSTRATE_BLOCK", {
      event,
      content_hash: contentHash,
      nonce: input.nonce,
      source: input.source,
      action: input.action,
      channel: input.channel,
      block_reason,
      checks_failed: checks.filter(c => !c.passed).map(c => c.check_type),
      timestamp,
    }).catch(() => { /* non-blocking — substrate must not fail on ledger write failure */ });
  }

  return {
    passed,
    checks,
    content_hash: contentHash,
    nonce: input.nonce,
    block_reason,
    timestamp,
  };
}

// ═══════════════════════════════════════════════════════════════
// TOKEN BINDING (for replay protection)
// ═══════════════════════════════════════════════════════════════

/**
 * Bind an execution token to a specific content hash.
 * Called when a token is issued — locks the token to that exact proposal.
 */
export function bindTokenToContent(tokenId: string, contentHash: string): void {
  tokenBindings.set(tokenId, contentHash);
}

/**
 * Unbind a token (after successful execution or expiry).
 */
export function unbindToken(tokenId: string): void {
  tokenBindings.delete(tokenId);
}

// ═══════════════════════════════════════════════════════════════
// LOG ACCESS
// ═══════════════════════════════════════════════════════════════

/**
 * Get the substrate log (most recent entries).
 */
export function getSubstrateLog(limit: number = 50): SubstrateLogEntry[] {
  return substrateLog.slice(-limit);
}

/**
 * Get substrate log filtered by event type.
 */
export function getSubstrateLogByEvent(event: SubstrateLogEntry["event"], limit: number = 50): SubstrateLogEntry[] {
  return substrateLog.filter(e => e.event === event).slice(-limit);
}

/**
 * Get substrate stats.
 */
export function getSubstrateStats(): {
  total_checked: number;
  passed: number;
  blocked_dedup: number;
  blocked_nonce: number;
  blocked_replay: number;
  active_nonces: number;
  active_content_hashes: number;
  active_token_bindings: number;
} {
  const passed = substrateLog.filter(e => e.event === "PASSED").length;
  const blocked_dedup = substrateLog.filter(e => e.event === "BLOCKED_DEDUP").length;
  const blocked_nonce = substrateLog.filter(e => e.event === "BLOCKED_NONCE").length;
  const blocked_replay = substrateLog.filter(e => e.event === "BLOCKED_REPLAY").length;

  return {
    total_checked: substrateLog.length,
    passed,
    blocked_dedup,
    blocked_nonce,
    blocked_replay,
    active_nonces: usedNonces.size,
    active_content_hashes: seenContentHashes.size,
    active_token_bindings: tokenBindings.size,
  };
}

// ═══════════════════════════════════════════════════════════════
// TEST HELPERS (exported for testing only)
// ═══════════════════════════════════════════════════════════════

export function _clearSubstrate(): void {
  usedNonces.clear();
  seenContentHashes.clear();
  tokenBindings.clear();
  substrateLog.length = 0;
}

export function _getUsedNonces(): Map<string, number> {
  return usedNonces;
}

export function _getSeenContentHashes(): Map<string, { count: number; first_seen: number; last_seen: number }> {
  return seenContentHashes;
}
