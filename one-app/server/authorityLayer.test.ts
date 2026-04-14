/**
 * Minimum Authority Layer — Test Suite
 * ═════════════════════════════════════
 * Tests the full authority chain:
 *   Root Authority → Policy → Approval → Token → Execution → Receipt → Ledger
 *
 * The One Rule:
 *   No execution without authorization token.
 *   No authorization token without approval.
 *   No approval without policy.
 *   No policy without root signature.
 *   No execution without receipt.
 *   No receipt without ledger entry.
 */

import { describe, it, expect, beforeEach } from "vitest";
import {
  registerRootAuthority,
  getActiveRootAuthority,
  revokeRootAuthority,
  computePolicyHash,
  activatePolicy,
  getActivePolicy,
  revokePolicy,
  DEFAULT_POLICY_RULES,
  issueAuthorizationToken,
  getAuthorizationToken,
  validateAuthorizationToken,
  computeParametersHash,
  generateCanonicalReceipt,
  getLastReceiptHash,
  setLastReceiptHash,
  createGenesisRecord,
  verifyGenesisRecord,
  enforceTheOneRule,
  verifyAuthorityChain,
  CHIEF_OF_STAFF,
  _resetAuthorityState,
  type AuthorizationToken,
  type SignedPolicy,
  type GenesisRecord,
  type CanonicalReceipt,
} from "./authorityLayer";

// ─── Helpers ──────────────────────────────────────────────────

const MOCK_ROOT_PUBLIC_KEY = "a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2";
const MOCK_ROOT_SIGNATURE = "deadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef";
const MOCK_GATEWAY_SIGNATURE = "cafebabecafebabecafebabecafebabecafebabecafebabecafebabecafebabecafebabecafebabecafebabecafebabecafebabecafebabecafebabecafebabe";

// ─── Tests ────────────────────────────────────────────────────

describe("Minimum Authority Layer", () => {
  beforeEach(() => {
    _resetAuthorityState();
  });

  // ═══════════════════════════════════════════════════════════
  // 1. ROOT AUTHORITY
  // ═══════════════════════════════════════════════════════════

  describe("1. Root Authority (Signer)", () => {
    it("registers a root authority with public key", () => {
      const root = registerRootAuthority(MOCK_ROOT_PUBLIC_KEY);
      expect(root.root_public_key).toBe(MOCK_ROOT_PUBLIC_KEY);
      expect(root.status).toBe("ACTIVE");
      expect(root.fingerprint).toHaveLength(16);
      expect(root.created_at).toBeTruthy();
    });

    it("returns the active root authority", () => {
      expect(getActiveRootAuthority()).toBeNull();
      registerRootAuthority(MOCK_ROOT_PUBLIC_KEY);
      const root = getActiveRootAuthority();
      expect(root).not.toBeNull();
      expect(root!.root_public_key).toBe(MOCK_ROOT_PUBLIC_KEY);
    });

    it("revokes the root authority", () => {
      registerRootAuthority(MOCK_ROOT_PUBLIC_KEY);
      revokeRootAuthority();
      const root = getActiveRootAuthority();
      expect(root!.status).toBe("REVOKED");
    });
  });

  // ═══════════════════════════════════════════════════════════
  // 2. GOVERNANCE POLICY HASH
  // ═══════════════════════════════════════════════════════════

  describe("2. Governance Policy Hash", () => {
    it("computes a deterministic policy hash", () => {
      const hash1 = computePolicyHash("POLICY-v1.0.0", DEFAULT_POLICY_RULES);
      const hash2 = computePolicyHash("POLICY-v1.0.0", DEFAULT_POLICY_RULES);
      expect(hash1).toBe(hash2);
      expect(hash1).toHaveLength(64); // SHA-256 hex
    });

    it("different policies produce different hashes", () => {
      const hash1 = computePolicyHash("POLICY-v1.0.0", DEFAULT_POLICY_RULES);
      const hash2 = computePolicyHash("POLICY-v2.0.0", DEFAULT_POLICY_RULES);
      expect(hash1).not.toBe(hash2);
    });

    it("activates a policy with root signature", () => {
      registerRootAuthority(MOCK_ROOT_PUBLIC_KEY);
      const policy = activatePolicy({
        policyId: "POLICY-v1.0.0",
        rules: DEFAULT_POLICY_RULES,
        policySignature: MOCK_ROOT_SIGNATURE,
        rootPublicKey: MOCK_ROOT_PUBLIC_KEY,
      });
      expect(policy.policy_id).toBe("POLICY-v1.0.0");
      expect(policy.status).toBe("ACTIVE");
      expect(policy.policy_hash).toHaveLength(64);
      expect(policy.root_public_key).toBe(MOCK_ROOT_PUBLIC_KEY);
    });

    it("rejects policy activation without valid signature", () => {
      registerRootAuthority(MOCK_ROOT_PUBLIC_KEY);
      expect(() =>
        activatePolicy({
          policyId: "POLICY-v1.0.0",
          rules: DEFAULT_POLICY_RULES,
          policySignature: "bad", // too short
          rootPublicKey: MOCK_ROOT_PUBLIC_KEY,
        }),
      ).toThrow("AUTHORITY_ERROR");
    });

    it("supersedes previous policy on new activation", () => {
      registerRootAuthority(MOCK_ROOT_PUBLIC_KEY);
      const p1 = activatePolicy({
        policyId: "POLICY-v1.0.0",
        rules: DEFAULT_POLICY_RULES,
        policySignature: MOCK_ROOT_SIGNATURE,
        rootPublicKey: MOCK_ROOT_PUBLIC_KEY,
      });
      expect(p1.status).toBe("ACTIVE");

      const p2 = activatePolicy({
        policyId: "POLICY-v2.0.0",
        rules: { ...DEFAULT_POLICY_RULES, approval_expiry_minutes: 10 },
        policySignature: MOCK_ROOT_SIGNATURE,
        rootPublicKey: MOCK_ROOT_PUBLIC_KEY,
      });
      expect(p2.status).toBe("ACTIVE");
      // p1 should be superseded (but we can only check active policy)
      expect(getActivePolicy()!.policy_id).toBe("POLICY-v2.0.0");
    });

    it("revokes the active policy", () => {
      registerRootAuthority(MOCK_ROOT_PUBLIC_KEY);
      activatePolicy({
        policyId: "POLICY-v1.0.0",
        rules: DEFAULT_POLICY_RULES,
        policySignature: MOCK_ROOT_SIGNATURE,
        rootPublicKey: MOCK_ROOT_PUBLIC_KEY,
      });
      revokePolicy();
      expect(getActivePolicy()).toBeNull();
    });
  });

  // ═══════════════════════════════════════════════════════════
  // 3. AUTHORIZATION TOKEN
  // ═══════════════════════════════════════════════════════════

  describe("3. Authorization Token", () => {
    beforeEach(() => {
      registerRootAuthority(MOCK_ROOT_PUBLIC_KEY);
      activatePolicy({
        policyId: "POLICY-v1.0.0",
        rules: DEFAULT_POLICY_RULES,
        policySignature: MOCK_ROOT_SIGNATURE,
        rootPublicKey: MOCK_ROOT_PUBLIC_KEY,
      });
    });

    it("issues a token with all required fields", () => {
      const token = issueAuthorizationToken({
        intentId: "INTENT-001",
        action: "send_email",
        toolArgs: { to: "brian@example.com", subject: "Test" },
        approvedBy: "approver-1",
        signature: MOCK_GATEWAY_SIGNATURE,
      });

      expect(token.token_id).toMatch(/^ATOK-/);
      expect(token.intent_id).toBe("INTENT-001");
      expect(token.action).toBe("send_email");
      expect(token.parameters_hash).toHaveLength(64);
      expect(token.approved_by).toBe("approver-1");
      expect(token.policy_hash).toBe(getActivePolicy()!.policy_hash);
      expect(token.max_executions).toBe(1);
      expect(token.execution_count).toBe(0);
      expect(token.issued_at).toBeTruthy();
      expect(token.expires_at).toBeTruthy();
      expect(token.signature).toBe(MOCK_GATEWAY_SIGNATURE);
    });

    it("fails to issue token without active policy", () => {
      revokePolicy();
      expect(() =>
        issueAuthorizationToken({
          intentId: "INTENT-001",
          action: "send_email",
          toolArgs: {},
          approvedBy: "approver-1",
          signature: MOCK_GATEWAY_SIGNATURE,
        }),
      ).toThrow("No active policy");
    });

    it("retrieves a token by ID", () => {
      const token = issueAuthorizationToken({
        intentId: "INTENT-001",
        action: "echo",
        toolArgs: {},
        approvedBy: "approver-1",
        signature: MOCK_GATEWAY_SIGNATURE,
      });
      const retrieved = getAuthorizationToken(token.token_id);
      expect(retrieved).not.toBeNull();
      expect(retrieved!.token_id).toBe(token.token_id);
    });

    it("returns null for unknown token ID", () => {
      expect(getAuthorizationToken("ATOK-nonexistent")).toBeNull();
    });
  });

  // ═══════════════════════════════════════════════════════════
  // 3b. TOKEN VALIDATION (Execution Gate)
  // ═══════════════════════════════════════════════════════════

  describe("3b. Token Validation (Execution Gate)", () => {
    let token: AuthorizationToken;

    beforeEach(() => {
      registerRootAuthority(MOCK_ROOT_PUBLIC_KEY);
      activatePolicy({
        policyId: "POLICY-v1.0.0",
        rules: DEFAULT_POLICY_RULES,
        policySignature: MOCK_ROOT_SIGNATURE,
        rootPublicKey: MOCK_ROOT_PUBLIC_KEY,
      });
      token = issueAuthorizationToken({
        intentId: "INTENT-001",
        action: "send_email",
        toolArgs: { to: "brian@example.com" },
        approvedBy: "approver-1",
        signature: MOCK_GATEWAY_SIGNATURE,
      });
    });

    it("passes all checks for a valid token", () => {
      const result = validateAuthorizationToken(
        token,
        "send_email",
        { to: "brian@example.com" },
      );
      expect(result.valid).toBe(true);
      expect(result.checks.every(c => c.status === "PASS")).toBe(true);
    });

    it("fails if kill switch is active", () => {
      const result = validateAuthorizationToken(
        token,
        "send_email",
        { to: "brian@example.com" },
        true, // kill switch ON
      );
      expect(result.valid).toBe(false);
      const killCheck = result.checks.find(c => c.check === "kill_switch_off");
      expect(killCheck!.status).toBe("FAIL");
    });

    it("fails if parameters hash doesn't match", () => {
      const result = validateAuthorizationToken(
        token,
        "send_email",
        { to: "different@example.com" }, // different args
      );
      expect(result.valid).toBe(false);
      const hashCheck = result.checks.find(c => c.check === "parameters_hash_match");
      expect(hashCheck!.status).toBe("FAIL");
    });

    it("fails after max executions reached", () => {
      // First execution — should pass and increment
      const r1 = validateAuthorizationToken(token, "send_email", { to: "brian@example.com" });
      expect(r1.valid).toBe(true);

      // Second execution — should fail (max_executions = 1)
      const r2 = validateAuthorizationToken(token, "send_email", { to: "brian@example.com" });
      expect(r2.valid).toBe(false);
      const countCheck = r2.checks.find(c => c.check === "execution_count_valid");
      expect(countCheck!.status).toBe("FAIL");
    });

    it("fails if policy hash doesn't match active policy", () => {
      // Activate a new policy — token's policy_hash now stale
      activatePolicy({
        policyId: "POLICY-v2.0.0",
        rules: { ...DEFAULT_POLICY_RULES, approval_expiry_minutes: 10 },
        policySignature: MOCK_ROOT_SIGNATURE,
        rootPublicKey: MOCK_ROOT_PUBLIC_KEY,
      });
      const result = validateAuthorizationToken(
        token,
        "send_email",
        { to: "brian@example.com" },
      );
      expect(result.valid).toBe(false);
      const policyCheck = result.checks.find(c => c.check === "policy_hash_match");
      expect(policyCheck!.status).toBe("FAIL");
    });
  });

  // ═══════════════════════════════════════════════════════════
  // 4. CANONICAL RECEIPT
  // ═══════════════════════════════════════════════════════════

  describe("4. Canonical Receipt", () => {
    beforeEach(() => {
      registerRootAuthority(MOCK_ROOT_PUBLIC_KEY);
      activatePolicy({
        policyId: "POLICY-v1.0.0",
        rules: DEFAULT_POLICY_RULES,
        policySignature: MOCK_ROOT_SIGNATURE,
        rootPublicKey: MOCK_ROOT_PUBLIC_KEY,
      });
    });

    it("generates a receipt with all required fields", () => {
      const receipt = generateCanonicalReceipt({
        intentId: "INTENT-001",
        proposerId: "PRI-proposer",
        approverId: "PRI-approver",
        tokenId: "ATOK-abc123",
        action: "send_email",
        success: true,
        result: { sent: true },
        executor: "manus",
        ledgerEntryId: "LE-xyz789",
        timestampProposed: "2026-04-06T00:00:00.000Z",
        timestampApproved: "2026-04-06T00:01:00.000Z",
      });

      expect(receipt.receipt_id).toMatch(/^RCPT-/);
      expect(receipt.intent_id).toBe("INTENT-001");
      expect(receipt.proposer_id).toBe("PRI-proposer");
      expect(receipt.approver_id).toBe("PRI-approver");
      expect(receipt.token_id).toBe("ATOK-abc123");
      expect(receipt.action).toBe("send_email");
      expect(receipt.status).toBe("SUCCESS");
      expect(receipt.executor).toBe("manus");
      expect(receipt.execution_hash).toHaveLength(64);
      expect(receipt.policy_hash).toBe(getActivePolicy()!.policy_hash);
      expect(receipt.ledger_entry_id).toBe("LE-xyz789");
      expect(receipt.receipt_hash).toHaveLength(64);
      expect(receipt.gateway_signature).toHaveLength(64); // HMAC-SHA256
      expect(receipt.timestamp_proposed).toBe("2026-04-06T00:00:00.000Z");
      expect(receipt.timestamp_approved).toBe("2026-04-06T00:01:00.000Z");
      expect(receipt.timestamp_executed).toBeTruthy();
      expect(receipt.decision_delta_ms).toBe(60000); // 1 minute
    });

    it("chains receipts via previous_receipt_hash", () => {
      const r1 = generateCanonicalReceipt({
        intentId: "INTENT-001",
        proposerId: "PRI-proposer",
        approverId: "PRI-approver",
        tokenId: "ATOK-001",
        action: "echo",
        success: true,
        result: {},
        executor: "manus",
        ledgerEntryId: "LE-001",
        timestampProposed: "2026-04-06T00:00:00.000Z",
        timestampApproved: "2026-04-06T00:01:00.000Z",
      });
      // First receipt should reference genesis hash
      expect(r1.previous_receipt_hash).toBe("0000000000000000000000000000000000000000000000000000000000000000");

      const r2 = generateCanonicalReceipt({
        intentId: "INTENT-002",
        proposerId: "PRI-proposer",
        approverId: "PRI-approver",
        tokenId: "ATOK-002",
        action: "web_search",
        success: true,
        result: { query: "test" },
        executor: "manus",
        ledgerEntryId: "LE-002",
        timestampProposed: "2026-04-06T00:00:00.000Z",
        timestampApproved: "2026-04-06T00:01:00.000Z",
      });
      // Second receipt should reference first receipt's hash
      expect(r2.previous_receipt_hash).toBe(r1.receipt_hash);
    });

    it("generates FAILED receipt on execution failure", () => {
      const receipt = generateCanonicalReceipt({
        intentId: "INTENT-001",
        proposerId: "PRI-proposer",
        approverId: "PRI-approver",
        tokenId: "ATOK-001",
        action: "send_email",
        success: false,
        result: { error: "SMTP failure" },
        executor: "manus",
        ledgerEntryId: "LE-001",
        timestampProposed: "2026-04-06T00:00:00.000Z",
        timestampApproved: "2026-04-06T00:01:00.000Z",
      });
      expect(receipt.status).toBe("FAILED");
    });

    it("fails without active policy", () => {
      revokePolicy();
      expect(() =>
        generateCanonicalReceipt({
          intentId: "INTENT-001",
          proposerId: "PRI-proposer",
          approverId: "PRI-approver",
          tokenId: "ATOK-001",
          action: "echo",
          success: true,
          result: {},
          executor: "manus",
          ledgerEntryId: "LE-001",
          timestampProposed: "2026-04-06T00:00:00.000Z",
          timestampApproved: "2026-04-06T00:01:00.000Z",
        }),
      ).toThrow("No active policy");
    });
  });

  // ═══════════════════════════════════════════════════════════
  // 5. GENESIS RECORD
  // ═══════════════════════════════════════════════════════════

  describe("5. Genesis Record (Ledger Block 0)", () => {
    it("creates a genesis record with correct structure", () => {
      const genesis = createGenesisRecord({
        rootPublicKey: MOCK_ROOT_PUBLIC_KEY,
        policyHash: computePolicyHash("POLICY-v1.0.0", DEFAULT_POLICY_RULES),
        rootSignature: MOCK_ROOT_SIGNATURE,
      });

      expect(genesis.record_type).toBe("GENESIS");
      expect(genesis.system_id).toBe("RIO");
      expect(genesis.root_public_key).toBe(MOCK_ROOT_PUBLIC_KEY);
      expect(genesis.previous_hash).toBe("0000000000000000");
      expect(genesis.genesis_hash).toHaveLength(64);
      expect(genesis.signature).toBe(MOCK_ROOT_SIGNATURE);
    });

    it("verifies a valid genesis record", () => {
      const genesis = createGenesisRecord({
        rootPublicKey: MOCK_ROOT_PUBLIC_KEY,
        policyHash: computePolicyHash("POLICY-v1.0.0", DEFAULT_POLICY_RULES),
        rootSignature: MOCK_ROOT_SIGNATURE,
      });
      const result = verifyGenesisRecord(genesis);
      expect(result.valid).toBe(true);
      expect(result.checks.every(c => c.status === "PASS")).toBe(true);
    });

    it("detects tampered genesis record", () => {
      const genesis = createGenesisRecord({
        rootPublicKey: MOCK_ROOT_PUBLIC_KEY,
        policyHash: computePolicyHash("POLICY-v1.0.0", DEFAULT_POLICY_RULES),
        rootSignature: MOCK_ROOT_SIGNATURE,
      });
      // Tamper with the policy hash
      const tampered = { ...genesis, policy_hash: "tampered_hash" };
      const result = verifyGenesisRecord(tampered);
      expect(result.valid).toBe(false);
      const hashCheck = result.checks.find(c => c.check === "genesis_hash");
      expect(hashCheck!.status).toBe("FAIL");
    });
  });

  // ═══════════════════════════════════════════════════════════
  // 6. THE ONE RULE
  // ═══════════════════════════════════════════════════════════

  describe("6. The One Rule", () => {
    it("passes when all invariants hold", () => {
      const result = enforceTheOneRule({
        hasAuthorizationToken: true,
        hasApproval: true,
        hasActivePolicy: true,
        hasPolicyRootSignature: true,
        willGenerateReceipt: true,
        willWriteLedger: true,
      });
      expect(result.governed).toBe(true);
      expect(result.violations).toHaveLength(0);
    });

    it("fails and lists all violations", () => {
      const result = enforceTheOneRule({
        hasAuthorizationToken: false,
        hasApproval: false,
        hasActivePolicy: false,
        hasPolicyRootSignature: false,
        willGenerateReceipt: false,
        willWriteLedger: false,
      });
      expect(result.governed).toBe(false);
      expect(result.violations).toHaveLength(6);
      expect(result.violations).toContain("No execution without authorization token");
      expect(result.violations).toContain("No authorization token without approval");
      expect(result.violations).toContain("No approval without policy");
      expect(result.violations).toContain("No policy without root signature");
      expect(result.violations).toContain("No execution without receipt");
      expect(result.violations).toContain("No receipt without ledger entry");
    });

    it("detects single missing invariant", () => {
      const result = enforceTheOneRule({
        hasAuthorizationToken: true,
        hasApproval: true,
        hasActivePolicy: true,
        hasPolicyRootSignature: true,
        willGenerateReceipt: true,
        willWriteLedger: false, // only this one missing
      });
      expect(result.governed).toBe(false);
      expect(result.violations).toHaveLength(1);
      expect(result.violations[0]).toBe("No receipt without ledger entry");
    });
  });

  // ═══════════════════════════════════════════════════════════
  // 7. CHIEF OF STAFF
  // ═══════════════════════════════════════════════════════════

  describe("7. Chief of Staff — Named Auditor Role", () => {
    it("maps to the auditor system role", () => {
      expect(CHIEF_OF_STAFF.systemRole).toBe("auditor");
    });

    it("has the correct display name", () => {
      expect(CHIEF_OF_STAFF.displayName).toBe("Chief of Staff");
    });

    it("has defined responsibilities", () => {
      expect(CHIEF_OF_STAFF.responsibilities.length).toBeGreaterThan(0);
      expect(CHIEF_OF_STAFF.responsibilities).toContain("Audit the ledger for integrity and completeness");
    });

    it("has the purpose statement about good friction", () => {
      expect(CHIEF_OF_STAFF.purpose).toContain("friction that's good");
    });
  });

  // ═══════════════════════════════════════════════════════════
  // 8. FULL AUTHORITY CHAIN VERIFICATION
  // ═══════════════════════════════════════════════════════════

  describe("8. Full Authority Chain (End-to-End)", () => {
    it("verifies a complete authority chain from genesis to receipt", () => {
      // 1. Register root authority
      registerRootAuthority(MOCK_ROOT_PUBLIC_KEY);

      // 2. Activate policy
      const policy = activatePolicy({
        policyId: "POLICY-v1.0.0",
        rules: DEFAULT_POLICY_RULES,
        policySignature: MOCK_ROOT_SIGNATURE,
        rootPublicKey: MOCK_ROOT_PUBLIC_KEY,
      });

      // 3. Create genesis
      const genesis = createGenesisRecord({
        rootPublicKey: MOCK_ROOT_PUBLIC_KEY,
        policyHash: policy.policy_hash,
        rootSignature: MOCK_ROOT_SIGNATURE,
      });

      // 4. Issue authorization token
      const token = issueAuthorizationToken({
        intentId: "INTENT-E2E",
        action: "send_email",
        toolArgs: { to: "brian@example.com", subject: "Authority test" },
        approvedBy: "approver-1",
        signature: MOCK_GATEWAY_SIGNATURE,
      });

      // 5. Validate token
      const validation = validateAuthorizationToken(
        token,
        "send_email",
        { to: "brian@example.com", subject: "Authority test" },
      );
      expect(validation.valid).toBe(true);

      // 6. Generate canonical receipt
      const receipt = generateCanonicalReceipt({
        intentId: "INTENT-E2E",
        proposerId: "PRI-proposer",
        approverId: "approver-1",
        tokenId: token.token_id,
        action: "send_email",
        success: true,
        result: { sent: true },
        executor: "manus",
        ledgerEntryId: "LE-E2E-001",
        timestampProposed: "2026-04-06T00:00:00.000Z",
        timestampApproved: "2026-04-06T00:01:00.000Z",
      });

      // 7. Verify the full chain
      const chainResult = verifyAuthorityChain({
        genesis,
        policy,
        token,
        receipt,
      });

      expect(chainResult.valid).toBe(true);
      expect(chainResult.chain).toHaveLength(5);
      expect(chainResult.chain.every(c => c.status === "PASS")).toBe(true);

      // 8. Enforce The One Rule
      const ruleResult = enforceTheOneRule({
        hasAuthorizationToken: true,
        hasApproval: true,
        hasActivePolicy: true,
        hasPolicyRootSignature: true,
        willGenerateReceipt: true,
        willWriteLedger: true,
      });
      expect(ruleResult.governed).toBe(true);
    });

    it("detects broken chain when policy key doesn't match genesis", () => {
      registerRootAuthority(MOCK_ROOT_PUBLIC_KEY);

      const policy = activatePolicy({
        policyId: "POLICY-v1.0.0",
        rules: DEFAULT_POLICY_RULES,
        policySignature: MOCK_ROOT_SIGNATURE,
        rootPublicKey: MOCK_ROOT_PUBLIC_KEY,
      });

      const genesis = createGenesisRecord({
        rootPublicKey: MOCK_ROOT_PUBLIC_KEY,
        policyHash: policy.policy_hash,
        rootSignature: MOCK_ROOT_SIGNATURE,
      });

      const token = issueAuthorizationToken({
        intentId: "INTENT-BAD",
        action: "echo",
        toolArgs: {},
        approvedBy: "approver-1",
        signature: MOCK_GATEWAY_SIGNATURE,
      });

      const receipt = generateCanonicalReceipt({
        intentId: "INTENT-BAD",
        proposerId: "PRI-proposer",
        approverId: "approver-1",
        tokenId: token.token_id,
        action: "echo",
        success: true,
        result: {},
        executor: "manus",
        ledgerEntryId: "LE-BAD-001",
        timestampProposed: "2026-04-06T00:00:00.000Z",
        timestampApproved: "2026-04-06T00:01:00.000Z",
      });

      // Tamper: change genesis root key
      const tamperedGenesis = { ...genesis, root_public_key: "ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff" };

      const chainResult = verifyAuthorityChain({
        genesis: tamperedGenesis,
        policy,
        token,
        receipt,
      });

      expect(chainResult.valid).toBe(false);
    });
  });
});
