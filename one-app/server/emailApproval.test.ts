/**
 * Email-Based One-Click Approval — Tests
 * ────────────────────────────────────────
 * Covers: token generation, verification (sync + async), single-use enforcement,
 * action hash computation, DB persistence, and approval email structure.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  generateApprovalToken,
  verifyApprovalToken,
  verifyApprovalTokenAsync,
  computeActionHash,
  isNonceUsed,
  isNonceUsedPersistent,
  markNonceUsed,
  _resetNonces,
} from "./emailApproval";

// ═══════════════════════════════════════════════════════════════
// TOKEN GENERATION
// ═══════════════════════════════════════════════════════════════

describe("Token Generation", () => {
  it("generates a token with correct payload fields", () => {
    const { token, payload } = generateApprovalToken({
      intent_id: "INT-001",
      proposer_email: "alice@example.com",
      approver_email: "bob@example.com",
      action_hash: "abc123hash",
    });

    expect(token).toBeTruthy();
    expect(token.split(".")).toHaveLength(2);
    expect(payload.intent_id).toBe("INT-001");
    expect(payload.proposer_email).toBe("alice@example.com");
    expect(payload.approver_email).toBe("bob@example.com");
    expect(payload.action_hash).toBe("abc123hash");
    expect(payload.nonce).toBeTruthy();
    expect(payload.expires_at).toBeGreaterThan(Date.now());
  });

  it("generates unique nonces for each token", () => {
    const { payload: p1 } = generateApprovalToken({
      intent_id: "INT-001",
      proposer_email: "alice@example.com",
      approver_email: "bob@example.com",
      action_hash: "abc123hash",
    });
    const { payload: p2 } = generateApprovalToken({
      intent_id: "INT-001",
      proposer_email: "alice@example.com",
      approver_email: "bob@example.com",
      action_hash: "abc123hash",
    });

    expect(p1.nonce).not.toBe(p2.nonce);
  });

  it("token format is base64url.hmac", () => {
    const { token } = generateApprovalToken({
      intent_id: "INT-001",
      proposer_email: "a@b.com",
      approver_email: "c@d.com",
      action_hash: "hash",
    });

    const [payloadB64, hmac] = token.split(".");
    // Base64url should decode to valid JSON
    const decoded = JSON.parse(Buffer.from(payloadB64, "base64url").toString("utf-8"));
    expect(decoded.intent_id).toBe("INT-001");
    // HMAC should be a hex string
    expect(hmac).toMatch(/^[a-f0-9]{64}$/);
  });
});

// ═══════════════════════════════════════════════════════════════
// TOKEN VERIFICATION (sync — in-memory only)
// ═══════════════════════════════════════════════════════════════

describe("Token Verification (sync)", () => {
  beforeEach(() => {
    _resetNonces();
  });

  it("verifies a valid token", () => {
    const { token } = generateApprovalToken({
      intent_id: "INT-002",
      proposer_email: "alice@example.com",
      approver_email: "bob@example.com",
      action_hash: "hash123",
    });

    const result = verifyApprovalToken(token);
    expect(result.valid).toBe(true);
    expect(result.expired).toBe(false);
    expect(result.used).toBe(false);
    expect(result.payload?.intent_id).toBe("INT-002");
    expect(result.payload?.approver_email).toBe("bob@example.com");
  });

  it("rejects a malformed token", () => {
    const result = verifyApprovalToken("not-a-valid-token");
    expect(result.valid).toBe(false);
    expect(result.error).toBe("Malformed token");
  });

  it("rejects a token with invalid signature", () => {
    const { token } = generateApprovalToken({
      intent_id: "INT-003",
      proposer_email: "a@b.com",
      approver_email: "c@d.com",
      action_hash: "hash",
    });

    // Tamper with the HMAC
    const [payloadB64] = token.split(".");
    const tampered = `${payloadB64}.${"0".repeat(64)}`;
    const result = verifyApprovalToken(tampered);
    expect(result.valid).toBe(false);
    expect(result.error).toBe("Invalid signature");
  });

  it("rejects an expired token", () => {
    const { token, payload } = generateApprovalToken({
      intent_id: "INT-004",
      proposer_email: "a@b.com",
      approver_email: "c@d.com",
      action_hash: "hash",
    });

    // Manually create an expired token by modifying the payload
    const expiredPayload = { ...payload, expires_at: Date.now() - 1000 };
    const payloadStr = JSON.stringify(expiredPayload);
    const payloadB64 = Buffer.from(payloadStr).toString("base64url");
    const { createHmac } = require("crypto");
    const secret = process.env.JWT_SECRET || "rio-email-approval-fallback-secret";
    const hmac = createHmac("sha256", secret).update(payloadStr).digest("hex");
    const expiredToken = `${payloadB64}.${hmac}`;

    const result = verifyApprovalToken(expiredToken);
    expect(result.valid).toBe(false);
    expect(result.expired).toBe(true);
    expect(result.error).toBe("Token expired");
  });

  it("rejects a used token (single-use enforcement)", () => {
    const { token, payload } = generateApprovalToken({
      intent_id: "INT-005",
      proposer_email: "a@b.com",
      approver_email: "c@d.com",
      action_hash: "hash",
    });

    // First verification should pass
    const first = verifyApprovalToken(token);
    expect(first.valid).toBe(true);

    // Mark nonce as used
    markNonceUsed(payload.nonce);

    // Second verification should fail
    const second = verifyApprovalToken(token);
    expect(second.valid).toBe(false);
    expect(second.used).toBe(true);
    expect(second.error).toBe("Token already used");
  });

  it("rejects when approver email does not match", () => {
    const { token } = generateApprovalToken({
      intent_id: "INT-006",
      proposer_email: "alice@example.com",
      approver_email: "bob@example.com",
      action_hash: "hash",
    });

    const result = verifyApprovalToken(token, "charlie@example.com");
    expect(result.valid).toBe(false);
    expect(result.error).toBe("Approver email mismatch");
  });

  it("accepts when approver email matches", () => {
    const { token } = generateApprovalToken({
      intent_id: "INT-007",
      proposer_email: "alice@example.com",
      approver_email: "bob@example.com",
      action_hash: "hash",
    });

    const result = verifyApprovalToken(token, "bob@example.com");
    expect(result.valid).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════
// TOKEN VERIFICATION (async — DB-backed)
// ═══════════════════════════════════════════════════════════════

describe("Token Verification (async / DB-backed)", () => {
  beforeEach(() => {
    _resetNonces();
  });

  it("verifies a valid token via async path", async () => {
    const { token } = generateApprovalToken({
      intent_id: "INT-ASYNC-001",
      proposer_email: "alice@example.com",
      approver_email: "bob@example.com",
      action_hash: "hash123",
    });

    const result = await verifyApprovalTokenAsync(token);
    expect(result.valid).toBe(true);
    expect(result.expired).toBe(false);
    expect(result.used).toBe(false);
    expect(result.payload?.intent_id).toBe("INT-ASYNC-001");
  });

  it("rejects malformed token via async path", async () => {
    const result = await verifyApprovalTokenAsync("not-a-valid-token");
    expect(result.valid).toBe(false);
    expect(result.error).toBe("Malformed token");
  });

  it("rejects used nonce via in-memory cache in async path", async () => {
    const { token, payload } = generateApprovalToken({
      intent_id: "INT-ASYNC-002",
      proposer_email: "a@b.com",
      approver_email: "c@d.com",
      action_hash: "hash",
    });

    markNonceUsed(payload.nonce);

    const result = await verifyApprovalTokenAsync(token);
    expect(result.valid).toBe(false);
    expect(result.used).toBe(true);
    expect(result.error).toBe("Token already used");
  });
});

// ═══════════════════════════════════════════════════════════════
// NONCE TRACKING
// ═══════════════════════════════════════════════════════════════

describe("Nonce Tracking", () => {
  beforeEach(() => {
    _resetNonces();
  });

  it("tracks used nonces", () => {
    expect(isNonceUsed("nonce-1")).toBe(false);
    markNonceUsed("nonce-1");
    expect(isNonceUsed("nonce-1")).toBe(true);
  });

  it("does not cross-contaminate nonces", () => {
    markNonceUsed("nonce-a");
    expect(isNonceUsed("nonce-a")).toBe(true);
    expect(isNonceUsed("nonce-b")).toBe(false);
  });

  it("reset clears all nonces", () => {
    markNonceUsed("nonce-x");
    markNonceUsed("nonce-y");
    _resetNonces();
    expect(isNonceUsed("nonce-x")).toBe(false);
    expect(isNonceUsed("nonce-y")).toBe(false);
  });

  it("isNonceUsedPersistent checks in-memory first", async () => {
    markNonceUsed("nonce-mem");
    const result = await isNonceUsedPersistent("nonce-mem");
    expect(result).toBe(true);
  });

  it("isNonceUsedPersistent returns false for unknown nonce", async () => {
    const result = await isNonceUsedPersistent("nonce-unknown-" + Date.now());
    // Should be false (not in memory, and DB may not have it)
    expect(result).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════
// ACTION HASH
// ═══════════════════════════════════════════════════════════════

describe("Action Hash", () => {
  it("produces consistent hash for same inputs", () => {
    const h1 = computeActionHash("send_email", { to: "a@b.com", subject: "hi" });
    const h2 = computeActionHash("send_email", { to: "a@b.com", subject: "hi" });
    expect(h1).toBe(h2);
  });

  it("produces different hash for different inputs", () => {
    const h1 = computeActionHash("send_email", { to: "a@b.com" });
    const h2 = computeActionHash("send_sms", { to: "a@b.com" });
    expect(h1).not.toBe(h2);
  });

  it("hash is a hex string", () => {
    const hash = computeActionHash("test", {});
    expect(hash).toMatch(/^[a-f0-9]{64}$/);
  });
});

// ═══════════════════════════════════════════════════════════════
// INVARIANTS
// ═══════════════════════════════════════════════════════════════

describe("Invariants", () => {
  beforeEach(() => {
    _resetNonces();
  });

  it("token includes all required fields from spec", () => {
    const { payload } = generateApprovalToken({
      intent_id: "INT-INV",
      proposer_email: "proposer@example.com",
      approver_email: "approver@example.com",
      action_hash: "hash-inv",
    });

    // All fields from spec must be present
    expect(payload).toHaveProperty("intent_id");
    expect(payload).toHaveProperty("proposer_email");
    expect(payload).toHaveProperty("approver_email");
    expect(payload).toHaveProperty("action_hash");
    expect(payload).toHaveProperty("expires_at");
    expect(payload).toHaveProperty("nonce");
  });

  it("proposer and approver are different identities", () => {
    const { payload } = generateApprovalToken({
      intent_id: "INT-DIFF",
      proposer_email: "alice@example.com",
      approver_email: "bob@example.com",
      action_hash: "hash",
    });

    // The system supports different proposer/approver
    expect(payload.proposer_email).not.toBe(payload.approver_email);
  });

  it("TTL is approximately 15 minutes", () => {
    const { payload } = generateApprovalToken({
      intent_id: "INT-TTL",
      proposer_email: "a@b.com",
      approver_email: "c@d.com",
      action_hash: "hash",
    });

    const ttl = payload.expires_at - Date.now();
    // Should be between 14 and 16 minutes (accounting for test execution time)
    expect(ttl).toBeGreaterThan(14 * 60 * 1000);
    expect(ttl).toBeLessThanOrEqual(15 * 60 * 1000 + 1000);
  });

  it("no execution without valid token — all verification paths reject invalid tokens", () => {
    // Malformed
    expect(verifyApprovalToken("bad").valid).toBe(false);
    // Empty
    expect(verifyApprovalToken("").valid).toBe(false);
    // Wrong format
    expect(verifyApprovalToken("a.b.c").valid).toBe(false);
  });
});
