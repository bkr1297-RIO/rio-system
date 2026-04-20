/**
 * Permanent Tests: Token Denial Reasons + File-Write Denial Paths
 * ═══════════════════════════════════════════════════════════════════
 *
 * Part 1 (6 tests): Token enforcement with exact machine-readable denial reasons
 *   1. valid token succeeds
 *   2. expired token denied → TOKEN_EXPIRED
 *   3. replay of same token denied → TOKEN_ALREADY_CONSUMED
 *   4. tampered signature denied → TOKEN_BAD_SIGNATURE
 *   5. wrong proposal_id denied → TOKEN_PROPOSAL_MISMATCH
 *   6. wrong argsHash denied → TOKEN_HASH_MISMATCH
 *
 * Part 2 (5 tests): File-write denial paths through FakeFileAdapter
 *   1. file write success with valid token
 *   2. file write denied with expired token
 *   3. file write denied on replay
 *   4. file write denied on path mutation
 *   5. file write denied on content mutation
 *
 * All tests use real authority layer functions — no mocks.
 */

import { describe, it, expect, beforeEach } from "vitest";

const {
  issueAuthorizationToken,
  validateAuthorizationToken,
  getAuthorizationToken,
  burnAuthorizationToken,
  registerRootAuthority,
  activatePolicy,
  DEFAULT_POLICY_RULES,
  _resetAuthorityState,
  DENIAL_REASONS,
  extractDenialReasons,
  checkToDenialReason,
} = await import("./rio/authorityLayer.ts");

const { FakeFileAdapter, resetVirtualFs, getVirtualFsSnapshot } = await import("./adapters/FakeFileAdapter.ts");

// ─── Setup ────────────────────────────────────────────────────

const ROOT_KEY = "a".repeat(64);
const POLICY_SIG = "b".repeat(128);

function setupAuthority() {
  _resetAuthorityState();
  registerRootAuthority(ROOT_KEY);
  activatePolicy({
    policyId: "test-policy",
    rules: { ...DEFAULT_POLICY_RULES, max_executions_per_approval: 1 },
    policySignature: POLICY_SIG,
    rootPublicKey: ROOT_KEY,
  });
}

function mintToken(overrides: Partial<Parameters<typeof issueAuthorizationToken>[0]> = {}) {
  return issueAuthorizationToken({
    intentId: overrides.intentId ?? "INT-test-001",
    action: overrides.action ?? "send_email",
    toolArgs: overrides.toolArgs ?? { to: "brian@example.com", subject: "Test", body: "Hello" },
    approvedBy: overrides.approvedBy ?? "approver-001",
    expiryMinutes: overrides.expiryMinutes ?? 5,
    maxExecutions: overrides.maxExecutions ?? 1,
    ...overrides,
  });
}

// ═══════════════════════════════════════════════════════════════
// PART 1: TOKEN DENIAL REASONS
// ═══════════════════════════════════════════════════════════════

describe("Part 1: Token Denial Reasons (6 permanent tests)", () => {
  beforeEach(() => {
    setupAuthority();
    resetVirtualFs();
  });

  it("1. valid token succeeds", () => {
    const token = mintToken();
    const result = validateAuthorizationToken(
      token, "send_email", { to: "brian@example.com", subject: "Test", body: "Hello" },
    );
    expect(result.valid).toBe(true);
    expect(result.checks.every(c => c.status === "PASS")).toBe(true);
    const reasons = extractDenialReasons(result);
    expect(reasons).toEqual([]);
  });

  it("2. expired token denied → TOKEN_EXPIRED", () => {
    // Issue a token that already expired (expiryMinutes = 0 won't work, use manual override)
    const token = mintToken({ expiryMinutes: 0.0001 }); // ~6ms

    // Wait for expiry
    const start = Date.now();
    while (Date.now() - start < 20) { /* spin */ }

    const result = validateAuthorizationToken(
      token, "send_email", { to: "brian@example.com", subject: "Test", body: "Hello" },
    );
    expect(result.valid).toBe(false);

    const reasons = extractDenialReasons(result);
    expect(reasons).toContain(DENIAL_REASONS.TOKEN_EXPIRED);

    // Verify the check name maps correctly
    const expiredCheck = result.checks.find(c => c.check === "token_not_expired");
    expect(expiredCheck?.status).toBe("FAIL");
    expect(checkToDenialReason("token_not_expired")).toBe("TOKEN_EXPIRED");
  });

  it("3. replay of same token denied → TOKEN_ALREADY_CONSUMED", () => {
    const token = mintToken();

    // First validation succeeds and increments execution_count
    const first = validateAuthorizationToken(
      token, "send_email", { to: "brian@example.com", subject: "Test", body: "Hello" },
    );
    expect(first.valid).toBe(true);

    // Burn the token (simulating post-execution burn)
    burnAuthorizationToken(token.token_id);

    // Second attempt: token no longer exists in store
    const replay = validateAuthorizationToken(
      token, "send_email", { to: "brian@example.com", subject: "Test", body: "Hello" },
    );
    expect(replay.valid).toBe(false);

    const reasons = extractDenialReasons(replay);
    expect(reasons).toContain(DENIAL_REASONS.TOKEN_ALREADY_CONSUMED);

    // Verify the check name maps correctly
    expect(checkToDenialReason("token_exists")).toBe("TOKEN_ALREADY_CONSUMED");
    expect(checkToDenialReason("execution_count_valid")).toBe("TOKEN_ALREADY_CONSUMED");
  });

  it("4. tampered signature denied → TOKEN_BAD_SIGNATURE", () => {
    const token = mintToken();

    // Tamper with the signature
    const tampered = { ...token, signature: "0".repeat(64) };

    const result = validateAuthorizationToken(
      tampered, "send_email", { to: "brian@example.com", subject: "Test", body: "Hello" },
    );
    expect(result.valid).toBe(false);

    const reasons = extractDenialReasons(result);
    expect(reasons).toContain(DENIAL_REASONS.TOKEN_BAD_SIGNATURE);

    // Verify the check name maps correctly
    const sigCheck = result.checks.find(c => c.check === "token_signature_valid");
    expect(sigCheck?.status).toBe("FAIL");
    expect(checkToDenialReason("token_signature_valid")).toBe("TOKEN_BAD_SIGNATURE");
  });

  it("5. wrong proposal_id denied → TOKEN_PROPOSAL_MISMATCH (via tool_name)", () => {
    // Token is for "send_email" but we validate against "delete_file"
    const token = mintToken({ action: "send_email" });

    const result = validateAuthorizationToken(
      token, "delete_file", { to: "brian@example.com", subject: "Test", body: "Hello" },
    );
    expect(result.valid).toBe(false);

    const reasons = extractDenialReasons(result);
    expect(reasons).toContain(DENIAL_REASONS.TOKEN_PROPOSAL_MISMATCH);

    // Verify the check name maps correctly
    const toolCheck = result.checks.find(c => c.check === "token_tool_name_match");
    expect(toolCheck?.status).toBe("FAIL");
    expect(checkToDenialReason("token_tool_name_match")).toBe("TOKEN_PROPOSAL_MISMATCH");
  });

  it("6. wrong argsHash denied → TOKEN_HASH_MISMATCH", () => {
    const token = mintToken({
      action: "send_email",
      toolArgs: { to: "brian@example.com", subject: "Test", body: "Hello" },
    });

    // Validate with different args (mutated body)
    const result = validateAuthorizationToken(
      token, "send_email", { to: "brian@example.com", subject: "Test", body: "MUTATED BODY" },
    );
    expect(result.valid).toBe(false);

    const reasons = extractDenialReasons(result);
    expect(reasons).toContain(DENIAL_REASONS.TOKEN_HASH_MISMATCH);

    // Verify the check name maps correctly
    const hashCheck = result.checks.find(c => c.check === "token_parameters_hash_match");
    expect(hashCheck?.status).toBe("FAIL");
    expect(checkToDenialReason("token_parameters_hash_match")).toBe("TOKEN_HASH_MISMATCH");
  });
});

// ═══════════════════════════════════════════════════════════════
// PART 2: FILE-WRITE DENIAL PATHS (FakeFileAdapter)
// ═══════════════════════════════════════════════════════════════

describe("Part 2: File-Write Denial Paths (5 permanent tests)", () => {
  const adapter = new FakeFileAdapter();

  beforeEach(() => {
    setupAuthority();
    resetVirtualFs();
  });

  it("1. file write success with valid token", async () => {
    const token = mintToken({
      intentId: "INT-file-001",
      action: "create_file",
      toolArgs: { path: "/governed/test.txt", content: "Hello World" },
    });

    const receipt = await adapter.executeFileOp(
      {
        intentId: "INT-file-001",
        action: "create_file",
        args: { path: "/governed/test.txt", content: "Hello World" },
      },
      token,
    );

    expect(receipt.status).toBe("SUCCESS");
    expect(receipt.receiptHash).toBeTruthy();
    expect(receipt.receiptId).toMatch(/^RCPT-/);

    // File was actually written
    const fs = getVirtualFsSnapshot();
    expect(fs.get("/governed/test.txt")).toBe("Hello World");
  });

  it("2. file write denied with expired token", async () => {
    const token = mintToken({
      intentId: "INT-file-002",
      action: "create_file",
      toolArgs: { path: "/governed/expired.txt", content: "Should not exist" },
      expiryMinutes: 0.0001, // ~6ms
    });

    // Wait for expiry
    const start = Date.now();
    while (Date.now() - start < 20) { /* spin */ }

    await expect(
      adapter.executeFileOp(
        {
          intentId: "INT-file-002",
          action: "create_file",
          args: { path: "/governed/expired.txt", content: "Should not exist" },
        },
        token,
      ),
    ).rejects.toThrow("GATE_FAILED");

    // File was NOT written
    const fs = getVirtualFsSnapshot();
    expect(fs.has("/governed/expired.txt")).toBe(false);
  });

  it("3. file write denied on replay", async () => {
    const token = mintToken({
      intentId: "INT-file-003",
      action: "create_file",
      toolArgs: { path: "/governed/replay.txt", content: "First write" },
    });

    // First execution succeeds
    const receipt = await adapter.executeFileOp(
      {
        intentId: "INT-file-003",
        action: "create_file",
        args: { path: "/governed/replay.txt", content: "First write" },
      },
      token,
    );
    expect(receipt.status).toBe("SUCCESS");

    // Token is burned after execution — replay must fail
    await expect(
      adapter.executeFileOp(
        {
          intentId: "INT-file-003",
          action: "create_file",
          args: { path: "/governed/replay.txt", content: "First write" },
        },
        token,
      ),
    ).rejects.toThrow("GATE_FAILED");
  });

  it("4. file write denied on path mutation", async () => {
    // Token approved for path A
    const token = mintToken({
      intentId: "INT-file-004",
      action: "create_file",
      toolArgs: { path: "/governed/approved.txt", content: "Approved content" },
    });

    // Attempt with path B (mutated)
    await expect(
      adapter.executeFileOp(
        {
          intentId: "INT-file-004",
          action: "create_file",
          args: { path: "/governed/EVIL.txt", content: "Approved content" },
        },
        token,
      ),
    ).rejects.toThrow("GATE_FAILED");

    // Neither file was written
    const fs = getVirtualFsSnapshot();
    expect(fs.has("/governed/approved.txt")).toBe(false);
    expect(fs.has("/governed/EVIL.txt")).toBe(false);
  });

  it("5. file write denied on content mutation", async () => {
    // Token approved for specific content
    const token = mintToken({
      intentId: "INT-file-005",
      action: "create_file",
      toolArgs: { path: "/governed/content.txt", content: "Original content" },
    });

    // Attempt with different content (mutated)
    await expect(
      adapter.executeFileOp(
        {
          intentId: "INT-file-005",
          action: "create_file",
          args: { path: "/governed/content.txt", content: "EVIL CONTENT INJECTED" },
        },
        token,
      ),
    ).rejects.toThrow("GATE_FAILED");

    // File was NOT written
    const fs = getVirtualFsSnapshot();
    expect(fs.has("/governed/content.txt")).toBe(false);
  });
});
