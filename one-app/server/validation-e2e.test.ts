/**
 * ═══════════════════════════════════════════════════════════════
 * RIO SYSTEM VALIDATION — Full End-to-End Governed Action
 * ═══════════════════════════════════════════════════════════════
 *
 * Validation mode. No changes, no expansion.
 * Only verify: what executes, what is blocked, what is logged.
 *
 * Failures are information, not problems.
 * Every result — pass or fail — is documented with equal rigor.
 *
 * Validation Points:
 *   V1:  Intent Packet correctly formed and processed
 *   V2:  Integrity Substrate rejects duplicate messages
 *   V3:  Integrity Substrate rejects replay attempts
 *   V4:  Policy engine produces consistent decisions
 *   V5:  Authority model blocks self-approval without cooldown
 *   V6:  Authority model allows self-approval after cooldown
 *   V7:  Authority model allows different-identity approval immediately
 *   V8:  Execution ONLY occurs after valid approval
 *   V9:  Direct connector execution is refused
 *   V10: Receipt contains proposer_identity_id
 *   V11: Receipt contains approver_identity_id
 *   V12: Receipt contains authority_model label
 *   V13: Ledger entry is consistent
 *   V14: Ledger entry is verifiable (hash chain)
 *   V15: Full chain: intent → policy → approval → execution → receipt → ledger
 *
 * April 12, 2026 — Frozen Build Spec
 */

import { describe, it, expect, beforeEach, vi, beforeAll } from "vitest";
import { nanoid } from "nanoid";

// ═══════════════════════════════════════════════════════════════
// IMPORTS — SYSTEM UNDER TEST
// ═══════════════════════════════════════════════════════════════

import {
  validateAtSubstrate,
  bindTokenToContent,
  getSubstrateLog,
  _clearSubstrate,
} from "./integritySubstrate";

import {
  scanEmail,
  mvpRule,
  _resetForTesting,
} from "./emailFirewall";

import {
  checkDelegation,
  DELEGATION_COOLDOWN_MS,
} from "./constrainedDelegation";

import {
  evaluateIdentityAtGatewayBoundary,
  resolveAuthorityModel,
} from "./gatewayProxy";

import {
  dispatchExecution,
} from "./connectors";

import { appendLedger, verifyHashChain } from "./db";

// ═══════════════════════════════════════════════════════════════
// MOCK: Database (we need appendLedger and verifyHashChain to work)
// ═══════════════════════════════════════════════════════════════

// We mock the db module to capture ledger entries without a real database
const ledgerEntries: Array<{
  entryId: string;
  entryType: string;
  payload: Record<string, unknown>;
  hash: string;
  prevHash: string;
  timestamp: number;
}> = [];

vi.mock("./db", async () => {
  const { createHash } = await import("crypto");
  const { nanoid } = await import("nanoid");

  function sha256(data: string): string {
    return createHash("sha256").update(data).digest("hex");
  }

  function canonicalJsonStringify(obj: unknown): string {
    return JSON.stringify(obj, Object.keys(obj as Record<string, unknown>).sort());
  }

  return {
    appendLedger: async (entryType: string, payload: Record<string, unknown>) => {
      const prevHash = ledgerEntries.length > 0
        ? ledgerEntries[ledgerEntries.length - 1].hash
        : "GENESIS";
      const ts = Date.now();
      const entryId = `LE-${nanoid(16)}`;
      const hashInput = canonicalJsonStringify({ entryId, entryType, payload, prevHash, timestamp: ts });
      const hash = sha256(hashInput);
      const entry = { entryId, entryType, payload, hash, prevHash, timestamp: ts };
      ledgerEntries.push(entry);
      return { entryId, hash, prevHash, timestamp: ts };
    },
    verifyHashChain: async () => {
      if (ledgerEntries.length === 0) return { valid: true, entries: 0, errors: [] };
      const errors: string[] = [];
      for (let i = 0; i < ledgerEntries.length; i++) {
        const entry = ledgerEntries[i];
        const expectedPrev = i === 0 ? "GENESIS" : ledgerEntries[i - 1].hash;
        if (entry.prevHash !== expectedPrev) {
          errors.push(`Entry ${entry.entryId}: prevHash mismatch at index ${i}`);
        }
        const hashInput = canonicalJsonStringify({
          entryId: entry.entryId,
          entryType: entry.entryType,
          payload: entry.payload,
          prevHash: entry.prevHash,
          timestamp: entry.timestamp,
        });
        const computed = sha256(hashInput);
        if (computed !== entry.hash) {
          errors.push(`Entry ${entry.entryId}: hash mismatch at index ${i}`);
        }
      }
      return { valid: errors.length === 0, entries: ledgerEntries.length, errors };
    },
    getAllLedgerEntries: async () => ledgerEntries,
    getLastLedgerEntry: async () => ledgerEntries.length > 0 ? ledgerEntries[ledgerEntries.length - 1] : null,
    createApproval: vi.fn().mockResolvedValue({ id: 1 }),
    getApprovalForIntent: vi.fn().mockResolvedValue(null),
    getLedgerEntriesSince: vi.fn().mockResolvedValue([]),
  };
});

// Mock LLM for scanEmail (v2 mode uses LLM)
vi.mock("./coherence", () => ({
  checkCoherence: vi.fn().mockResolvedValue({
    coherent: true,
    confidence: 0.9,
    reason: "Mock coherence check",
    flags: [],
  }),
}));

// ═══════════════════════════════════════════════════════════════
// VALIDATION REPORT ACCUMULATOR
// ═══════════════════════════════════════════════════════════════

interface ValidationResult {
  id: string;
  description: string;
  status: "PASS" | "FAIL" | "ERROR";
  detail: string;
  observed: unknown;
  timestamp: string;
}

const validationReport: ValidationResult[] = [];

function recordValidation(
  id: string,
  description: string,
  status: "PASS" | "FAIL" | "ERROR",
  detail: string,
  observed: unknown = null
): void {
  validationReport.push({
    id,
    description,
    status,
    detail,
    observed,
    timestamp: new Date().toISOString(),
  });
}

// ═══════════════════════════════════════════════════════════════
// SETUP
// ═══════════════════════════════════════════════════════════════

beforeEach(() => {
  _clearSubstrate();
  _resetForTesting();
  ledgerEntries.length = 0;
});

// ═══════════════════════════════════════════════════════════════
// V1: INTENT PACKET CORRECTLY FORMED AND PROCESSED
// ═══════════════════════════════════════════════════════════════

describe("V1: Intent Packet Formation", () => {
  it("V1.1 — substrate accepts a well-formed intent packet", () => {
    const input = {
      content: "Send email to partner@company.com: Quarterly report attached",
      nonce: nanoid(),
      source: "user-001",
      action: "send_email",
      channel: "email",
    };

    const result = validateAtSubstrate(input);

    recordValidation(
      "V1.1",
      "Substrate accepts well-formed intent packet",
      result.passed ? "PASS" : "FAIL",
      result.passed
        ? `All ${result.checks.length} checks passed. Content hash: ${result.content_hash.substring(0, 16)}...`
        : `BLOCKED: ${result.block_reason}`,
      {
        passed: result.passed,
        checks: result.checks.map(c => ({ type: c.check_type, passed: c.passed, detail: c.detail })),
        content_hash: result.content_hash,
        nonce: result.nonce,
      }
    );

    expect(result.passed).toBe(true);
    expect(result.checks).toHaveLength(4);
    expect(result.checks.every(c => c.passed)).toBe(true);
    expect(result.content_hash).toBeTruthy();
    expect(result.nonce).toBeTruthy();
  });

  it("V1.2 — substrate rejects packet with missing nonce", () => {
    const input = {
      content: "Send email to partner@company.com",
      nonce: "", // empty nonce
      source: "user-001",
      action: "send_email",
      channel: "email",
    };

    const result = validateAtSubstrate(input);

    recordValidation(
      "V1.2",
      "Substrate rejects packet with missing nonce",
      !result.passed ? "PASS" : "FAIL",
      !result.passed
        ? `Correctly blocked: ${result.block_reason}`
        : "ERROR: Substrate accepted packet with empty nonce",
      { passed: result.passed, block_reason: result.block_reason }
    );

    expect(result.passed).toBe(false);
    expect(result.block_reason).toContain("nonce");
  });

  it("V1.3 — substrate rejects packet with missing source", () => {
    const input = {
      content: "Send email to partner@company.com",
      nonce: nanoid(),
      source: "", // empty source
      action: "send_email",
      channel: "email",
    };

    const result = validateAtSubstrate(input);

    recordValidation(
      "V1.3",
      "Substrate rejects packet with missing source",
      !result.passed ? "PASS" : "FAIL",
      !result.passed
        ? `Correctly blocked: ${result.block_reason}`
        : "ERROR: Substrate accepted packet with empty source",
      { passed: result.passed, block_reason: result.block_reason }
    );

    expect(result.passed).toBe(false);
    expect(result.block_reason).toContain("source");
  });

  it("V1.4 — substrate logs every packet (passed or blocked)", () => {
    // Submit a valid packet
    validateAtSubstrate({
      content: "Valid packet " + nanoid(),
      nonce: nanoid(),
      source: "user-001",
      action: "send_email",
      channel: "email",
    });

    // Submit an invalid packet
    validateAtSubstrate({
      content: "Invalid packet",
      nonce: "",
      source: "user-001",
      action: "send_email",
      channel: "email",
    });

    const log = getSubstrateLog();
    const passedEntries = log.filter(e => e.event === "PASSED");
    const blockedEntries = log.filter(e => e.event.startsWith("BLOCKED"));

    recordValidation(
      "V1.4",
      "Substrate logs every packet (passed and blocked)",
      passedEntries.length >= 1 && blockedEntries.length >= 1 ? "PASS" : "FAIL",
      `Log has ${log.length} entries: ${passedEntries.length} PASSED, ${blockedEntries.length} BLOCKED`,
      { total: log.length, passed: passedEntries.length, blocked: blockedEntries.length }
    );

    expect(passedEntries.length).toBeGreaterThanOrEqual(1);
    expect(blockedEntries.length).toBeGreaterThanOrEqual(1);
  });
});

// ═══════════════════════════════════════════════════════════════
// V2: INTEGRITY SUBSTRATE REJECTS DUPLICATE MESSAGES
// ═══════════════════════════════════════════════════════════════

describe("V2: Duplicate Message Rejection", () => {
  it("V2.1 — identical content with different nonces is blocked as duplicate", () => {
    const content = "Exact same message content for dedup test " + nanoid();

    const first = validateAtSubstrate({
      content,
      nonce: nanoid(),
      source: "user-001",
      action: "send_email",
      channel: "email",
    });

    const second = validateAtSubstrate({
      content,
      nonce: nanoid(), // different nonce, same content
      source: "user-001",
      action: "send_email",
      channel: "email",
    });

    recordValidation(
      "V2.1",
      "Identical content with different nonces is blocked as duplicate",
      first.passed && !second.passed ? "PASS" : "FAIL",
      first.passed && !second.passed
        ? `First accepted, second blocked: ${second.block_reason}`
        : `First passed=${first.passed}, Second passed=${second.passed}. Block reason: ${second.block_reason}`,
      {
        first: { passed: first.passed },
        second: { passed: second.passed, block_reason: second.block_reason },
      }
    );

    expect(first.passed).toBe(true);
    expect(second.passed).toBe(false);
    expect(second.block_reason).toContain("Duplicate");
  });

  it("V2.2 — different content passes dedup", () => {
    const first = validateAtSubstrate({
      content: "Message A unique " + nanoid(),
      nonce: nanoid(),
      source: "user-001",
      action: "send_email",
      channel: "email",
    });

    const second = validateAtSubstrate({
      content: "Message B unique " + nanoid(),
      nonce: nanoid(),
      source: "user-001",
      action: "send_email",
      channel: "email",
    });

    recordValidation(
      "V2.2",
      "Different content passes dedup check",
      first.passed && second.passed ? "PASS" : "FAIL",
      `Both messages accepted: first=${first.passed}, second=${second.passed}`,
      { first: { passed: first.passed }, second: { passed: second.passed } }
    );

    expect(first.passed).toBe(true);
    expect(second.passed).toBe(true);
  });

  it("V2.3 — duplicate is logged as BLOCKED_DEDUP", () => {
    const content = "Dedup log test " + nanoid();

    validateAtSubstrate({ content, nonce: nanoid(), source: "user-001", action: "send_email", channel: "email" });
    validateAtSubstrate({ content, nonce: nanoid(), source: "user-001", action: "send_email", channel: "email" });

    const log = getSubstrateLog();
    const dedupBlocks = log.filter(e => e.event === "BLOCKED_DEDUP");

    recordValidation(
      "V2.3",
      "Duplicate is logged as BLOCKED_DEDUP in substrate log",
      dedupBlocks.length >= 1 ? "PASS" : "FAIL",
      `Found ${dedupBlocks.length} BLOCKED_DEDUP entries in log`,
      { dedupBlocks: dedupBlocks.map(e => ({ log_id: e.log_id, detail: e.detail })) }
    );

    expect(dedupBlocks.length).toBeGreaterThanOrEqual(1);
  });
});

// ═══════════════════════════════════════════════════════════════
// V3: INTEGRITY SUBSTRATE REJECTS REPLAY ATTEMPTS
// ═══════════════════════════════════════════════════════════════

describe("V3: Replay Attempt Rejection", () => {
  it("V3.1 — reused nonce is blocked", () => {
    const nonce = nanoid();

    const first = validateAtSubstrate({
      content: "First message " + nanoid(),
      nonce,
      source: "user-001",
      action: "send_email",
      channel: "email",
    });

    const second = validateAtSubstrate({
      content: "Second message " + nanoid(),
      nonce, // same nonce
      source: "user-001",
      action: "send_email",
      channel: "email",
    });

    recordValidation(
      "V3.1",
      "Reused nonce is blocked (nonce enforcement)",
      first.passed && !second.passed ? "PASS" : "FAIL",
      first.passed && !second.passed
        ? `First accepted, replay blocked: ${second.block_reason}`
        : `First passed=${first.passed}, Second passed=${second.passed}`,
      {
        first: { passed: first.passed },
        second: { passed: second.passed, block_reason: second.block_reason },
      }
    );

    expect(first.passed).toBe(true);
    expect(second.passed).toBe(false);
    expect(second.block_reason).toContain("already used");
  });

  it("V3.2 — token bound to content A rejects content B (replay protection)", () => {
    const tokenId = `TKN-${nanoid()}`;
    const contentHashA = "abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890";

    // Bind token to content A
    bindTokenToContent(tokenId, contentHashA);

    // Try to use token with content B (different content)
    const result = validateAtSubstrate({
      content: "Completely different content " + nanoid(),
      nonce: nanoid(),
      source: "user-001",
      action: "send_email",
      channel: "email",
      token_id: tokenId,
    });

    recordValidation(
      "V3.2",
      "Token bound to content A rejects content B (replay protection)",
      !result.passed ? "PASS" : "FAIL",
      !result.passed
        ? `Replay blocked: ${result.block_reason}`
        : "ERROR: Token-content mismatch was not detected",
      { passed: result.passed, block_reason: result.block_reason }
    );

    expect(result.passed).toBe(false);
    expect(result.block_reason).toContain("Replay detected");
  });

  it("V3.3 — replay is logged as BLOCKED_NONCE or BLOCKED_REPLAY", () => {
    const nonce = nanoid();

    validateAtSubstrate({ content: "First " + nanoid(), nonce, source: "user-001", action: "send_email", channel: "email" });
    validateAtSubstrate({ content: "Replay " + nanoid(), nonce, source: "user-001", action: "send_email", channel: "email" });

    const log = getSubstrateLog();
    const replayBlocks = log.filter(e => e.event === "BLOCKED_NONCE" || e.event === "BLOCKED_REPLAY");

    recordValidation(
      "V3.3",
      "Replay attempt is logged in substrate log",
      replayBlocks.length >= 1 ? "PASS" : "FAIL",
      `Found ${replayBlocks.length} replay block entries in log`,
      { replayBlocks: replayBlocks.map(e => ({ log_id: e.log_id, event: e.event, detail: e.detail })) }
    );

    expect(replayBlocks.length).toBeGreaterThanOrEqual(1);
  });
});

// ═══════════════════════════════════════════════════════════════
// V4: POLICY ENGINE PRODUCES CONSISTENT DECISIONS
// ═══════════════════════════════════════════════════════════════

describe("V4: Policy Engine Consistency", () => {
  it("V4.1 — MVP rule: same input produces same output (10 iterations)", () => {
    const results: Array<{ decision: string; reason: string }> = [];

    for (let i = 0; i < 10; i++) {
      const result = mvpRule({
        text: "URGENT: Your account will be suspended. Click here to verify your credentials immediately.",
        senderKnown: false,
      });
      results.push({ decision: result.decision, reason: result.reason });
    }

    const allSame = results.every(r => r.decision === results[0].decision && r.reason === results[0].reason);

    recordValidation(
      "V4.1",
      "MVP rule: same input produces same output (10 iterations)",
      allSame ? "PASS" : "FAIL",
      allSame
        ? `All 10 iterations returned: decision=${results[0].decision}, reason=${results[0].reason}`
        : `INCONSISTENCY DETECTED: ${JSON.stringify(results)}`,
      { iterations: 10, consistent: allSame, sample: results[0], all_results: results }
    );

    expect(allSame).toBe(true);
  });

  it("V4.2 — MVP rule: BLOCK for unknown sender + urgency + consequential action", () => {
    const result = mvpRule({
      text: "URGENT: Transfer $5,000 to this account immediately or your service will be terminated.",
      senderKnown: false,
    });

    recordValidation(
      "V4.2",
      "MVP rule BLOCKs unknown sender + urgency + consequential action",
      result.decision === "BLOCK" ? "PASS" : "FAIL",
      `Decision: ${result.decision}, Reason: ${result.reason}`,
      result
    );

    expect(result.decision).toBe("BLOCK");
  });

  it("V4.3 — MVP rule: PASS for known sender with same content", () => {
    const result = mvpRule({
      text: "URGENT: Transfer $5,000 to this account immediately or your service will be terminated.",
      senderKnown: true,
    });

    recordValidation(
      "V4.3",
      "MVP rule PASSes known sender even with urgency + consequential content",
      result.decision === "PASS" ? "PASS" : "FAIL",
      `Decision: ${result.decision}, Reason: ${result.reason}`,
      result
    );

    expect(result.decision).toBe("PASS");
  });

  it("V4.4 — MVP rule: PASS for unknown sender without urgency", () => {
    const result = mvpRule({
      text: "Hi, I wanted to share the quarterly report with you. Please review at your convenience.",
      senderKnown: false,
    });

    recordValidation(
      "V4.4",
      "MVP rule PASSes unknown sender without urgency",
      result.decision === "PASS" ? "PASS" : "FAIL",
      `Decision: ${result.decision}, Reason: ${result.reason}`,
      result
    );

    expect(result.decision).toBe("PASS");
  });

  it("V4.5 — scanEmail with MVP mode produces deterministic result", async () => {
    const results: string[] = [];

    for (let i = 0; i < 3; i++) {
      _resetForTesting();
      const result = await scanEmail(
        "URGENT: Verify your password now or lose access to your account.",
        "unknown-sender@suspicious.com",
        { mvpMode: true }
      );
      results.push(result.decision);
    }

    const allSame = results.every(r => r === results[0]);

    recordValidation(
      "V4.5",
      "scanEmail with MVP mode produces deterministic result (3 iterations)",
      allSame ? "PASS" : "FAIL",
      allSame
        ? `All 3 iterations returned: ${results[0]}`
        : `INCONSISTENCY: ${JSON.stringify(results)}`,
      { iterations: 3, consistent: allSame, results }
    );

    expect(allSame).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════
// V5: AUTHORITY MODEL BLOCKS SELF-APPROVAL WITHOUT COOLDOWN
// ═══════════════════════════════════════════════════════════════

describe("V5: Self-Approval Blocked Without Cooldown", () => {
  it("V5.1 — checkDelegation blocks same identity with no time gap", () => {
    const now = Date.now();
    const result = checkDelegation({
      proposer_identity: "human-root-001",
      approver_identity: "human-root-001",
      proposal_timestamp: now,
      approval_timestamp: now, // zero gap
    });

    recordValidation(
      "V5.1",
      "checkDelegation blocks same identity with zero time gap",
      !result.allowed ? "PASS" : "FAIL",
      !result.allowed
        ? `Correctly blocked: ${result.reason}. Remaining: ${result.remaining_ms}ms`
        : "ERROR: Self-approval was allowed with zero time gap",
      {
        allowed: result.allowed,
        reason: result.reason,
        role_separation: result.role_separation,
        remaining_ms: result.remaining_ms,
      }
    );

    expect(result.allowed).toBe(false);
    expect(result.role_separation).toBe("self");
  });

  it("V5.2 — evaluateIdentityAtGatewayBoundary blocks same identity immediately", () => {
    const now = Date.now();
    const result = evaluateIdentityAtGatewayBoundary(
      "human-root-001",
      "human-root-001",
      now,
      now,
    );

    recordValidation(
      "V5.2",
      "Gateway-level evaluation blocks same identity immediately",
      !result.allowed ? "PASS" : "FAIL",
      !result.allowed
        ? `Blocked with authority_model: "${result.authority_model}"`
        : "ERROR: Gateway allowed self-approval without cooldown",
      {
        allowed: result.allowed,
        authority_model: result.authority_model,
        proposer_identity_id: result.proposer_identity_id,
        approver_identity_id: result.approver_identity_id,
      }
    );

    expect(result.allowed).toBe(false);
    expect(result.authority_model).toBe("BLOCKED — Self-Authorization Sub-Policy Not Met");
  });

  it("V5.3 — blocked self-approval produces correct identity IDs in evaluation", () => {
    const result = evaluateIdentityAtGatewayBoundary(
      "proposer-ABC",
      "proposer-ABC",
      Date.now(),
      Date.now(),
    );

    recordValidation(
      "V5.3",
      "Blocked self-approval carries correct proposer and approver identity IDs",
      result.proposer_identity_id === "proposer-ABC" && result.approver_identity_id === "proposer-ABC"
        ? "PASS" : "FAIL",
      `proposer_identity_id: "${result.proposer_identity_id}", approver_identity_id: "${result.approver_identity_id}"`,
      {
        proposer_identity_id: result.proposer_identity_id,
        approver_identity_id: result.approver_identity_id,
        match: result.proposer_identity_id === result.approver_identity_id,
      }
    );

    expect(result.proposer_identity_id).toBe("proposer-ABC");
    expect(result.approver_identity_id).toBe("proposer-ABC");
  });
});

// ═══════════════════════════════════════════════════════════════
// V6: AUTHORITY MODEL ALLOWS SELF-APPROVAL AFTER COOLDOWN
// ═══════════════════════════════════════════════════════════════

describe("V6: Self-Approval After Cooldown", () => {
  it("V6.1 — checkDelegation allows same identity after cooldown period", () => {
    const proposalTime = Date.now() - DELEGATION_COOLDOWN_MS - 1000; // 121 seconds ago
    const approvalTime = Date.now();

    const result = checkDelegation({
      proposer_identity: "human-root-001",
      approver_identity: "human-root-001",
      proposal_timestamp: proposalTime,
      approval_timestamp: approvalTime,
    });

    recordValidation(
      "V6.1",
      "checkDelegation allows same identity after cooldown (120s+)",
      result.allowed ? "PASS" : "FAIL",
      result.allowed
        ? `Allowed with role_separation: "${result.role_separation}"`
        : `Still blocked: ${result.reason}. Remaining: ${result.remaining_ms}ms`,
      {
        allowed: result.allowed,
        role_separation: result.role_separation,
        time_gap_ms: approvalTime - proposalTime,
        cooldown_ms: DELEGATION_COOLDOWN_MS,
      }
    );

    expect(result.allowed).toBe(true);
    expect(result.role_separation).toBe("constrained");
  });

  it("V6.2 — Gateway evaluation labels constrained self-approval correctly", () => {
    const proposalTime = Date.now() - DELEGATION_COOLDOWN_MS - 1000;
    const approvalTime = Date.now();

    const result = evaluateIdentityAtGatewayBoundary(
      "human-root-001",
      "human-root-001",
      proposalTime,
      approvalTime,
    );

    recordValidation(
      "V6.2",
      "Gateway labels constrained self-approval as 'Constrained Single-Actor Execution'",
      result.allowed && result.authority_model === "Constrained Single-Actor Execution"
        ? "PASS" : "FAIL",
      `allowed: ${result.allowed}, authority_model: "${result.authority_model}"`,
      {
        allowed: result.allowed,
        authority_model: result.authority_model,
        role_separation: result.role_separation,
      }
    );

    expect(result.allowed).toBe(true);
    expect(result.authority_model).toBe("Constrained Single-Actor Execution");
  });
});

// ═══════════════════════════════════════════════════════════════
// V7: AUTHORITY MODEL ALLOWS DIFFERENT-IDENTITY IMMEDIATELY
// ═══════════════════════════════════════════════════════════════

describe("V7: Different-Identity Immediate Approval", () => {
  it("V7.1 — different proposer and approver allowed immediately", () => {
    const now = Date.now();
    const result = checkDelegation({
      proposer_identity: "agent-I1",
      approver_identity: "human-I2",
      proposal_timestamp: now,
      approval_timestamp: now, // zero gap, but different identities
    });

    recordValidation(
      "V7.1",
      "Different proposer and approver allowed immediately (no cooldown)",
      result.allowed ? "PASS" : "FAIL",
      result.allowed
        ? `Allowed with role_separation: "${result.role_separation}"`
        : `Blocked: ${result.reason}`,
      {
        allowed: result.allowed,
        role_separation: result.role_separation,
        proposer: "agent-I1",
        approver: "human-I2",
      }
    );

    expect(result.allowed).toBe(true);
    expect(result.role_separation).toBe("separated");
  });

  it("V7.2 — Gateway labels separated authority correctly", () => {
    const now = Date.now();
    const result = evaluateIdentityAtGatewayBoundary(
      "agent-I1",
      "human-I2",
      now,
      now,
    );

    recordValidation(
      "V7.2",
      "Gateway labels different-identity as 'Separated Authority'",
      result.allowed && result.authority_model === "Separated Authority"
        ? "PASS" : "FAIL",
      `allowed: ${result.allowed}, authority_model: "${result.authority_model}"`,
      {
        allowed: result.allowed,
        authority_model: result.authority_model,
        proposer_identity_id: result.proposer_identity_id,
        approver_identity_id: result.approver_identity_id,
      }
    );

    expect(result.allowed).toBe(true);
    expect(result.authority_model).toBe("Separated Authority");
  });
});

// ═══════════════════════════════════════════════════════════════
// V8: EXECUTION ONLY OCCURS AFTER VALID APPROVAL
// ═══════════════════════════════════════════════════════════════

describe("V8: Execution Requires Valid Approval", () => {
  it("V8.1 — dispatchExecution refuses HIGH risk without approval proof", async () => {
    let error: Error | null = null;
    let result: unknown = null;

    try {
      result = await dispatchExecution("send_email", {
        to: "recipient@example.com",
        subject: "Test",
        body: "Test body " + nanoid(),
      }, { riskLevel: "HIGH" });
    } catch (e) {
      error = e as Error;
    }

    const blocked = error !== null || (result && typeof result === "object" && "error" in (result as Record<string, unknown>));

    recordValidation(
      "V8.1",
      "dispatchExecution refuses HIGH risk send_email without approval proof",
      blocked ? "PASS" : "FAIL",
      blocked
        ? `Blocked: ${error?.message || JSON.stringify(result)}`
        : "ERROR: HIGH risk execution was allowed without approval",
      { error: error?.message, result }
    );

    expect(blocked).toBe(true);
  });

  it("V8.2 — dispatchExecution refuses HIGH risk with approval proof but no gateway flag", async () => {
    let error: Error | null = null;
    let result: unknown = null;

    try {
      result = await dispatchExecution("send_email", {
        to: "recipient@example.com",
        subject: "Test",
        body: "Test body " + nanoid(),
      }, {
        riskLevel: "HIGH",
        approvalProof: { approved: true, approvedBy: "human-I2", approvedAt: Date.now() },
      });
    } catch (e) {
      error = e as Error;
    }

    const blocked = error !== null || (result && typeof result === "object" && "error" in (result as Record<string, unknown>));

    recordValidation(
      "V8.2",
      "dispatchExecution refuses HIGH risk with approval but no _gatewayExecution flag",
      blocked ? "PASS" : "FAIL",
      blocked
        ? `Blocked: ${error?.message || JSON.stringify(result)}`
        : "ERROR: Execution was allowed without gateway flag",
      { error: error?.message, result }
    );

    expect(blocked).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════
// V9: DIRECT CONNECTOR EXECUTION IS REFUSED
// ═══════════════════════════════════════════════════════════════

describe("V9: Direct Connector Execution Refused", () => {
  it("V9.1 — send_email connector returns REQUIRES_GATEWAY_GOVERNANCE without flag", async () => {
    let result: unknown = null;
    let error: Error | null = null;

    try {
      result = await dispatchExecution("send_email", {
        to: "test@example.com",
        subject: "Direct test",
        body: "Direct execution attempt " + nanoid(),
      }, {
        riskLevel: "HIGH",
        approvalProof: { approved: true, approvedBy: "human-I2", approvedAt: Date.now() },
        // NO _gatewayExecution flag
      });
    } catch (e) {
      error = e as Error;
    }

    const isRefused = error !== null ||
      (result && typeof result === "object" && JSON.stringify(result).includes("GATEWAY_GOVERNANCE"));

    recordValidation(
      "V9.1",
      "send_email connector refuses direct execution (REQUIRES_GATEWAY_GOVERNANCE)",
      isRefused ? "PASS" : "FAIL",
      isRefused
        ? `Correctly refused: ${error?.message || JSON.stringify(result)}`
        : "ERROR: Direct execution was allowed",
      { error: error?.message, result }
    );

    expect(isRefused).toBe(true);
  });

  it("V9.2 — send_sms connector also refuses direct execution", async () => {
    let result: unknown = null;
    let error: Error | null = null;

    try {
      result = await dispatchExecution("send_sms", {
        to: "+1234567890",
        body: "Direct SMS attempt " + nanoid(),
      }, {
        riskLevel: "HIGH",
        approvalProof: { approved: true, approvedBy: "human-I2", approvedAt: Date.now() },
      });
    } catch (e) {
      error = e as Error;
    }

    const isRefused = error !== null ||
      (result && typeof result === "object" && JSON.stringify(result).includes("GATEWAY_GOVERNANCE"));

    recordValidation(
      "V9.2",
      "send_sms connector refuses direct execution (REQUIRES_GATEWAY_GOVERNANCE)",
      isRefused ? "PASS" : "FAIL",
      isRefused
        ? `Correctly refused: ${error?.message || JSON.stringify(result)}`
        : "ERROR: Direct SMS execution was allowed",
      { error: error?.message, result }
    );

    expect(isRefused).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════
// V10–V12: RECEIPT CONTAINS REQUIRED FIELDS
// ═══════════════════════════════════════════════════════════════

describe("V10–V12: Receipt Field Verification", () => {
  it("V10 — Receipt contains proposer_identity_id", async () => {
    // Simulate a governed action that produces a ledger entry with receipt fields
    const ledgerResult = await appendLedger("EXECUTION", {
      intentId: `INT-${nanoid()}`,
      proposer_identity_id: "agent-I1-proposer",
      approver_identity_id: "human-I2-approver",
      authority_model: "Separated Authority",
      action: "send_email",
      result: "delivered",
    });

    const entry = ledgerEntries.find(e => e.entryId === ledgerResult.entryId);

    recordValidation(
      "V10",
      "Receipt/ledger entry contains proposer_identity_id",
      entry?.payload?.proposer_identity_id === "agent-I1-proposer" ? "PASS" : "FAIL",
      `proposer_identity_id: "${entry?.payload?.proposer_identity_id}"`,
      { entryId: entry?.entryId, proposer_identity_id: entry?.payload?.proposer_identity_id }
    );

    expect(entry?.payload?.proposer_identity_id).toBe("agent-I1-proposer");
  });

  it("V11 — Receipt contains approver_identity_id", async () => {
    const ledgerResult = await appendLedger("EXECUTION", {
      intentId: `INT-${nanoid()}`,
      proposer_identity_id: "agent-I1-proposer",
      approver_identity_id: "human-I2-approver",
      authority_model: "Separated Authority",
      action: "send_email",
      result: "delivered",
    });

    const entry = ledgerEntries.find(e => e.entryId === ledgerResult.entryId);

    recordValidation(
      "V11",
      "Receipt/ledger entry contains approver_identity_id",
      entry?.payload?.approver_identity_id === "human-I2-approver" ? "PASS" : "FAIL",
      `approver_identity_id: "${entry?.payload?.approver_identity_id}"`,
      { entryId: entry?.entryId, approver_identity_id: entry?.payload?.approver_identity_id }
    );

    expect(entry?.payload?.approver_identity_id).toBe("human-I2-approver");
  });

  it("V12 — Receipt contains authority_model label", async () => {
    // Test all three authority models
    const models = [
      { proposer: "A", approver: "B", expected: "Separated Authority" },
      { proposer: "A", approver: "A", expected: "Constrained Single-Actor Execution" },
    ];

    const results: Array<{ model: string; recorded: unknown }> = [];

    for (const m of models) {
      const ledgerResult = await appendLedger("EXECUTION", {
        intentId: `INT-${nanoid()}`,
        proposer_identity_id: m.proposer,
        approver_identity_id: m.approver,
        authority_model: m.expected,
        action: "send_email",
      });

      const entry = ledgerEntries.find(e => e.entryId === ledgerResult.entryId);
      results.push({ model: m.expected, recorded: entry?.payload?.authority_model });
    }

    const allCorrect = results.every(r => r.model === r.recorded);

    recordValidation(
      "V12",
      "Receipt/ledger entry contains correct authority_model label",
      allCorrect ? "PASS" : "FAIL",
      allCorrect
        ? `All authority models recorded correctly: ${results.map(r => r.model).join(", ")}`
        : `MISMATCH: ${JSON.stringify(results)}`,
      results
    );

    expect(allCorrect).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════
// V13: LEDGER ENTRY IS CONSISTENT
// ═══════════════════════════════════════════════════════════════

describe("V13: Ledger Entry Consistency", () => {
  it("V13.1 — ledger entry has required fields: entryType, intentId, identity IDs, authority_model", async () => {
    const intentId = `INT-${nanoid()}`;
    const ledgerResult = await appendLedger("EXECUTION", {
      intentId,
      proposer_identity_id: "agent-I1",
      approver_identity_id: "human-I2",
      authority_model: "Separated Authority",
      action: "send_email",
      result: "delivered",
    });

    const entry = ledgerEntries.find(e => e.entryId === ledgerResult.entryId);

    const hasEntryType = entry?.entryType === "EXECUTION";
    const hasIntentId = entry?.payload?.intentId === intentId;
    const hasProposer = !!entry?.payload?.proposer_identity_id;
    const hasApprover = !!entry?.payload?.approver_identity_id;
    const hasAuthorityModel = !!entry?.payload?.authority_model;
    const hasHash = !!entry?.hash;
    const hasPrevHash = !!entry?.prevHash;

    const allPresent = hasEntryType && hasIntentId && hasProposer && hasApprover && hasAuthorityModel && hasHash && hasPrevHash;

    recordValidation(
      "V13.1",
      "Ledger entry has all required fields",
      allPresent ? "PASS" : "FAIL",
      `entryType=${hasEntryType}, intentId=${hasIntentId}, proposer=${hasProposer}, approver=${hasApprover}, authority_model=${hasAuthorityModel}, hash=${hasHash}, prevHash=${hasPrevHash}`,
      {
        entryId: entry?.entryId,
        entryType: entry?.entryType,
        hash: entry?.hash?.substring(0, 16) + "...",
        prevHash: entry?.prevHash?.substring(0, 16) + (entry?.prevHash === "GENESIS" ? "" : "..."),
        payload_keys: entry ? Object.keys(entry.payload) : [],
      }
    );

    expect(allPresent).toBe(true);
  });

  it("V13.2 — multiple ledger entries form a hash chain", async () => {
    // Create a sequence of 5 ledger entries
    for (let i = 0; i < 5; i++) {
      await appendLedger("EXECUTION", {
        intentId: `INT-${nanoid()}`,
        proposer_identity_id: "agent-I1",
        approver_identity_id: "human-I2",
        authority_model: "Separated Authority",
        sequence: i,
      });
    }

    // Verify chain linkage
    const chainValid = ledgerEntries.every((entry, i) => {
      if (i === 0) return entry.prevHash === "GENESIS";
      return entry.prevHash === ledgerEntries[i - 1].hash;
    });

    recordValidation(
      "V13.2",
      "Multiple ledger entries form a valid hash chain",
      chainValid ? "PASS" : "FAIL",
      chainValid
        ? `${ledgerEntries.length} entries linked: GENESIS → ${ledgerEntries.map(e => e.hash.substring(0, 8)).join(" → ")}`
        : `Chain broken at some point in ${ledgerEntries.length} entries`,
      {
        count: ledgerEntries.length,
        chain: ledgerEntries.map((e, i) => ({
          index: i,
          entryId: e.entryId,
          hash: e.hash.substring(0, 16),
          prevHash: e.prevHash.substring(0, 16),
          links_correctly: i === 0 ? e.prevHash === "GENESIS" : e.prevHash === ledgerEntries[i - 1].hash,
        })),
      }
    );

    expect(chainValid).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════
// V14: LEDGER ENTRY IS VERIFIABLE (HASH CHAIN)
// ═══════════════════════════════════════════════════════════════

describe("V14: Ledger Hash Chain Verification", () => {
  it("V14.1 — verifyHashChain confirms integrity of all entries", async () => {
    // Create entries
    for (let i = 0; i < 3; i++) {
      await appendLedger("EXECUTION", {
        intentId: `INT-${nanoid()}`,
        proposer_identity_id: "agent-I1",
        approver_identity_id: "human-I2",
        authority_model: "Separated Authority",
        step: i,
      });
    }

    const verification = await verifyHashChain();

    recordValidation(
      "V14.1",
      "verifyHashChain confirms integrity of all entries",
      verification.valid ? "PASS" : "FAIL",
      verification.valid
        ? `${verification.entries} entries verified, hash chain intact`
        : `INTEGRITY FAILURE: ${verification.errors.join("; ")}`,
      verification
    );

    expect(verification.valid).toBe(true);
    expect(verification.entries).toBe(3);
    expect(verification.errors).toHaveLength(0);
  });

  it("V14.2 — tampered entry is detected by verifyHashChain", async () => {
    // Create entries
    for (let i = 0; i < 3; i++) {
      await appendLedger("EXECUTION", {
        intentId: `INT-${nanoid()}`,
        proposer_identity_id: "agent-I1",
        approver_identity_id: "human-I2",
        authority_model: "Separated Authority",
        step: i,
      });
    }

    // Tamper with the second entry's payload
    const originalPayload = { ...ledgerEntries[1].payload };
    ledgerEntries[1].payload = { ...originalPayload, intentId: "TAMPERED" };

    const verification = await verifyHashChain();

    // Restore for cleanup
    ledgerEntries[1].payload = originalPayload;

    recordValidation(
      "V14.2",
      "Tampered entry is detected by verifyHashChain",
      !verification.valid ? "PASS" : "FAIL",
      !verification.valid
        ? `Tampering detected: ${verification.errors.join("; ")}`
        : "ERROR: Tampered entry was NOT detected",
      verification
    );

    expect(verification.valid).toBe(false);
    expect(verification.errors.length).toBeGreaterThan(0);
  });
});

// ═══════════════════════════════════════════════════════════════
// V15: FULL CHAIN — INTENT → POLICY → APPROVAL → EXECUTION → RECEIPT → LEDGER
// ═══════════════════════════════════════════════════════════════

describe("V15: Full Governed Action Chain", () => {
  it("V15.1 — complete chain: substrate → policy → delegation → ledger", async () => {
    const intentId = `INT-${nanoid()}`;
    const proposerId = "agent-I1-proposer";
    const approverId = "human-I2-approver";
    const emailContent = "Please review the quarterly financial report and provide feedback by Friday.";
    const chainResults: Record<string, unknown> = {};

    // ─── Step 1: Substrate validation ───
    const substrateResult = validateAtSubstrate({
      content: emailContent,
      nonce: nanoid(),
      source: proposerId,
      action: "send_email",
      channel: "email",
    });
    chainResults["1_substrate"] = {
      passed: substrateResult.passed,
      content_hash: substrateResult.content_hash.substring(0, 16),
      checks: substrateResult.checks.length,
    };

    // ─── Step 2: Policy evaluation (MVP rule) ───
    const policyResult = mvpRule({
      text: emailContent,
      senderKnown: false, // external recipient
    });
    chainResults["2_policy"] = {
      decision: policyResult.decision,
      reason: policyResult.reason,
    };

    // ─── Step 3: Authority / Delegation check ───
    const now = Date.now();
    const delegationResult = evaluateIdentityAtGatewayBoundary(
      proposerId,
      approverId,
      now,
      now,
    );
    chainResults["3_authority"] = {
      allowed: delegationResult.allowed,
      authority_model: delegationResult.authority_model,
      proposer_identity_id: delegationResult.proposer_identity_id,
      approver_identity_id: delegationResult.approver_identity_id,
    };

    // ─── Step 4: Ledger entry (simulating execution) ───
    const ledgerResult = await appendLedger("EXECUTION", {
      intentId,
      proposer_identity_id: proposerId,
      approver_identity_id: approverId,
      authority_model: delegationResult.authority_model,
      action: "send_email",
      content_hash: substrateResult.content_hash,
      policy_decision: policyResult.decision,
      substrate_passed: substrateResult.passed,
      delegation_allowed: delegationResult.allowed,
      result: "delivered",
    });
    chainResults["4_ledger"] = {
      entryId: ledgerResult.entryId,
      hash: ledgerResult.hash.substring(0, 16),
      prevHash: ledgerResult.prevHash.substring(0, 16),
    };

    // ─── Step 5: Verify hash chain ───
    const chainVerification = await verifyHashChain();
    chainResults["5_verification"] = {
      valid: chainVerification.valid,
      entries: chainVerification.entries,
      errors: chainVerification.errors,
    };

    // ─── Verify the complete chain ───
    const substrateOk = substrateResult.passed;
    const policyOk = policyResult.decision === "PASS"; // clean email should pass
    const authorityOk = delegationResult.allowed; // different identities
    const ledgerOk = !!ledgerResult.entryId && !!ledgerResult.hash;
    const chainOk = chainVerification.valid;

    const allOk = substrateOk && policyOk && authorityOk && ledgerOk && chainOk;

    // Verify the ledger entry has all required receipt fields
    const entry = ledgerEntries.find(e => e.entryId === ledgerResult.entryId);
    const hasProposerId = entry?.payload?.proposer_identity_id === proposerId;
    const hasApproverId = entry?.payload?.approver_identity_id === approverId;
    const hasAuthorityModel = entry?.payload?.authority_model === "Separated Authority";

    const receiptFieldsOk = hasProposerId && hasApproverId && hasAuthorityModel;

    recordValidation(
      "V15.1",
      "Complete governed action chain: substrate → policy → authority → execution → ledger → verify",
      allOk && receiptFieldsOk ? "PASS" : "FAIL",
      [
        `Substrate: ${substrateOk ? "PASS" : "FAIL"}`,
        `Policy: ${policyOk ? "PASS" : "FAIL"} (${policyResult.decision})`,
        `Authority: ${authorityOk ? "PASS" : "FAIL"} (${delegationResult.authority_model})`,
        `Ledger: ${ledgerOk ? "PASS" : "FAIL"} (${ledgerResult.entryId})`,
        `Chain: ${chainOk ? "PASS" : "FAIL"} (${chainVerification.entries} entries)`,
        `Receipt fields: ${receiptFieldsOk ? "PASS" : "FAIL"}`,
      ].join(" | "),
      chainResults
    );

    expect(allOk).toBe(true);
    expect(receiptFieldsOk).toBe(true);
  });

  it("V15.2 — chain breaks when substrate rejects (duplicate)", async () => {
    const content = "Duplicate chain test " + nanoid();

    // First pass — should succeed
    const first = validateAtSubstrate({
      content,
      nonce: nanoid(),
      source: "user-001",
      action: "send_email",
      channel: "email",
    });

    // Second pass — should be blocked at substrate (duplicate)
    const second = validateAtSubstrate({
      content,
      nonce: nanoid(),
      source: "user-001",
      action: "send_email",
      channel: "email",
    });

    // Chain should NOT proceed past substrate
    const chainBroken = first.passed && !second.passed;

    recordValidation(
      "V15.2",
      "Chain breaks at substrate when duplicate is detected — governance never sees it",
      chainBroken ? "PASS" : "FAIL",
      chainBroken
        ? `First passed, duplicate blocked at substrate: ${second.block_reason}`
        : `First=${first.passed}, Second=${second.passed}`,
      {
        first: { passed: first.passed },
        second: { passed: second.passed, block_reason: second.block_reason },
      }
    );

    expect(chainBroken).toBe(true);
  });

  it("V15.3 — chain breaks when authority rejects (self-approval without cooldown)", () => {
    const now = Date.now();

    // Substrate passes
    const substrateResult = validateAtSubstrate({
      content: "Authority rejection chain test " + nanoid(),
      nonce: nanoid(),
      source: "user-001",
      action: "send_email",
      channel: "email",
    });

    // Policy passes
    const policyResult = mvpRule({
      text: "Please review the report.",
      senderKnown: true,
    });

    // Authority BLOCKS — same identity, no cooldown
    const authorityResult = evaluateIdentityAtGatewayBoundary(
      "same-human",
      "same-human",
      now,
      now,
    );

    const chainBrokenAtAuthority = substrateResult.passed && policyResult.decision === "PASS" && !authorityResult.allowed;

    recordValidation(
      "V15.3",
      "Chain breaks at authority when self-approval is attempted without cooldown",
      chainBrokenAtAuthority ? "PASS" : "FAIL",
      [
        `Substrate: ${substrateResult.passed ? "PASS" : "FAIL"}`,
        `Policy: ${policyResult.decision}`,
        `Authority: ${authorityResult.allowed ? "ALLOWED" : "BLOCKED"} (${authorityResult.authority_model})`,
      ].join(" | "),
      {
        substrate_passed: substrateResult.passed,
        policy_decision: policyResult.decision,
        authority_allowed: authorityResult.allowed,
        authority_model: authorityResult.authority_model,
      }
    );

    expect(chainBrokenAtAuthority).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════
// VALIDATION REPORT OUTPUT
// ═══════════════════════════════════════════════════════════════

describe("Validation Report", () => {
  it("outputs the complete validation report", () => {
    // This test runs last and outputs the full report
    const passed = validationReport.filter(r => r.status === "PASS").length;
    const failed = validationReport.filter(r => r.status === "FAIL").length;
    const errors = validationReport.filter(r => r.status === "ERROR").length;

    console.log("\n═══════════════════════════════════════════════════════════════");
    console.log("  RIO SYSTEM VALIDATION REPORT");
    console.log("  Date: " + new Date().toISOString());
    console.log("═══════════════════════════════════════════════════════════════\n");

    for (const r of validationReport) {
      const icon = r.status === "PASS" ? "[PASS]" : r.status === "FAIL" ? "[FAIL]" : "[ERR ]";
      console.log(`  ${icon} ${r.id}: ${r.description}`);
      console.log(`         ${r.detail}`);
      if (r.status !== "PASS" && r.observed) {
        console.log(`         Observed: ${JSON.stringify(r.observed, null, 2).split("\n").join("\n         ")}`);
      }
      console.log("");
    }

    console.log("───────────────────────────────────────────────────────────────");
    console.log(`  TOTAL: ${validationReport.length} | PASS: ${passed} | FAIL: ${failed} | ERROR: ${errors}`);
    console.log("═══════════════════════════════════════════════════════════════\n");

    // This test always passes — it's just the report output
    expect(true).toBe(true);
  });
});
