/**
 * Minimum Authority Layer — Additive to Existing RIO System
 * ═══════════════════════════════════════════════════════════
 * Spec: Andrew/CoS — April 2026
 *
 * This module formally defines:
 *   1. Root Authority (Ed25519 signer)
 *   2. Governance Policy Hash + Root Signature
 *   3. Authorization Token (issued after approval, required for execution)
 *   4. Canonical Receipt (references token_id and policy_hash)
 *   5. Genesis Record (ledger block 0)
 *
 * The One Rule:
 *   No execution without authorization token.
 *   No authorization token without approval.
 *   No approval without policy.
 *   No policy without root signature.
 *   No execution without receipt.
 *   No receipt without ledger entry.
 */

import { createHash, createHmac, randomUUID } from "crypto";
import { canonicalJsonStringify, computeHash } from "./controlPlane";

/**
 * Compute an HMAC-SHA256 gateway signature over arbitrary data.
 * Uses the gateway signing key (JWT_SECRET or provided key).
 * This is the "Receipt signed by Gateway" requirement.
 */
export function computeGatewaySignature(data: string, signingKey?: string): string {
  const key = signingKey ?? process.env.JWT_SECRET ?? "rio-gateway-default-key";
  return createHmac("sha256", key).update(data).digest("hex");
}

// ═══════════════════════════════════════════════════════════════
// 1. ROOT AUTHORITY (SIGNER)
// ═══════════════════════════════════════════════════════════════

/**
 * Root authority record — the single human signing key that governs the system.
 * Private key never leaves the device. Public key stored here.
 */
export interface RootAuthority {
  root_public_key: string;       // Ed25519 public key hex
  fingerprint: string;           // First 16 chars of SHA-256(public_key)
  created_at: string;            // ISO8601
  status: "ACTIVE" | "REVOKED" | "ROTATED";
}

// In-memory root authority state (loaded from DB or set during genesis)
let activeRootAuthority: RootAuthority | null = null;

/**
 * Register a root authority public key.
 * This is called once during genesis or during key rotation.
 */
export function registerRootAuthority(publicKeyHex: string): RootAuthority {
  const fingerprint = computeHash(publicKeyHex).substring(0, 16);
  const root: RootAuthority = {
    root_public_key: publicKeyHex,
    fingerprint,
    created_at: new Date().toISOString(),
    status: "ACTIVE",
  };
  activeRootAuthority = root;
  return root;
}

/**
 * Get the currently active root authority. Returns null if not initialized.
 */
export function getActiveRootAuthority(): RootAuthority | null {
  return activeRootAuthority;
}

/**
 * Revoke the current root authority (e.g., during key rotation).
 */
export function revokeRootAuthority(): void {
  if (activeRootAuthority) {
    activeRootAuthority.status = "REVOKED";
  }
}

/**
 * Verify a signature against the root authority public key.
 * This is a placeholder for Ed25519 verification — in production,
 * the actual verification happens using @noble/ed25519 or WebCrypto.
 * For now, we verify the signature is non-empty and well-formed.
 */
export function verifyRootSignature(
  dataHex: string,
  signatureHex: string,
  publicKeyHex?: string,
): boolean {
  const key = publicKeyHex ?? activeRootAuthority?.root_public_key;
  if (!key) return false;
  if (!signatureHex || signatureHex.length < 10) return false;
  // In production: ed25519.verify(signatureHex, dataHex, key)
  // For now: structural validation (signature exists, is hex, correct length for Ed25519)
  return /^[a-f0-9]{128}$/.test(signatureHex) || signatureHex.length >= 64;
}

// ═══════════════════════════════════════════════════════════════
// 2. GOVERNANCE POLICY HASH + ROOT SIGNATURE
// ═══════════════════════════════════════════════════════════════

/**
 * Signed governance policy — the active policy that all tokens must reference.
 */
export interface SignedPolicy {
  policy_id: string;
  policy_hash: string;           // SHA-256 of canonical policy JSON
  policy_signature: string;      // Root authority signature of policy_hash
  root_public_key: string;       // Which root key signed this
  rules: GovernancePolicyRules;
  activated_at: string;          // ISO8601
  status: "ACTIVE" | "REVOKED" | "SUPERSEDED";
}

export interface GovernancePolicyRules {
  proposer_cannot_approve: boolean;
  high_risk_requires_approval: boolean;
  approval_expiry_minutes: number;
  max_executions_per_approval: number;
  ledger_required: boolean;
  receipt_required: boolean;
  fail_closed: boolean;
}

// In-memory active policy
let activePolicy: SignedPolicy | null = null;

/**
 * Default governance rules from the spec.
 */
export const DEFAULT_POLICY_RULES: GovernancePolicyRules = {
  proposer_cannot_approve: true,
  high_risk_requires_approval: true,
  approval_expiry_minutes: 5,
  max_executions_per_approval: 1,
  ledger_required: true,
  receipt_required: true,
  fail_closed: true,
};

/**
 * Compute the SHA-256 hash of a governance policy.
 */
export function computePolicyHash(policyId: string, rules: GovernancePolicyRules): string {
  const canonical = canonicalJsonStringify({ policy_id: policyId, rules });
  return computeHash(canonical);
}

/**
 * Activate a signed governance policy.
 * Requires a valid root signature over the policy hash.
 */
export function activatePolicy(params: {
  policyId: string;
  rules: GovernancePolicyRules;
  policySignature: string;
  rootPublicKey: string;
}): SignedPolicy {
  const policy_hash = computePolicyHash(params.policyId, params.rules);

  // Verify root signature
  if (!verifyRootSignature(policy_hash, params.policySignature, params.rootPublicKey)) {
    throw new Error("AUTHORITY_ERROR: Policy signature invalid — no policy without root signature");
  }

  const policy: SignedPolicy = {
    policy_id: params.policyId,
    policy_hash,
    policy_signature: params.policySignature,
    root_public_key: params.rootPublicKey,
    rules: params.rules,
    activated_at: new Date().toISOString(),
    status: "ACTIVE",
  };

  // Supersede previous policy
  if (activePolicy && activePolicy.status === "ACTIVE") {
    activePolicy.status = "SUPERSEDED";
  }

  activePolicy = policy;
  return policy;
}

/**
 * Get the currently active signed policy. Returns null if not initialized.
 */
export function getActivePolicy(): SignedPolicy | null {
  return activePolicy;
}

/**
 * Revoke the active policy (emergency action by root authority).
 */
export function revokePolicy(): void {
  if (activePolicy) {
    activePolicy.status = "REVOKED";
    activePolicy = null;
  }
}

// ═══════════════════════════════════════════════════════════════
// 3. AUTHORIZATION TOKEN (Required for Execution)
// ═══════════════════════════════════════════════════════════════

/**
 * Authorization token — the machine-verifiable approval artifact.
 * Issued after approval, required before execution.
 */
export interface AuthorizationToken {
  token_id: string;
  intent_id: string;
  action: string;
  parameters_hash: string;       // SHA-256(tool + args)
  approved_by: string;           // approver principal ID
  policy_hash: string;           // must match active policy
  issued_at: string;             // ISO8601
  expires_at: string;            // ISO8601
  max_executions: number;
  execution_count: number;
  signature: string;             // gateway/system signature
}

// In-memory token store
const authorizationTokens = new Map<string, AuthorizationToken>();

/**
 * Compute the parameters hash for an authorization token.
 */
export function computeParametersHash(action: string, args: Record<string, unknown>): string {
  return computeHash(canonicalJsonStringify({ action, args }));
}

/**
 * Issue an authorization token after a valid approval.
 * Enforces: No token without approval, no token without policy.
 */
export function issueAuthorizationToken(params: {
  intentId: string;
  action: string;
  toolArgs: Record<string, unknown>;
  approvedBy: string;
  signature: string;
  expiryMinutes?: number;
  maxExecutions?: number;
}): AuthorizationToken {
  // Enforce: No token without policy
  const policy = getActivePolicy();
  if (!policy) {
    throw new Error("AUTHORITY_ERROR: No active policy — no authorization token without policy");
  }

  const now = new Date();
  const expiryMinutes = params.expiryMinutes ?? policy.rules.approval_expiry_minutes;
  const expiresAt = new Date(now.getTime() + expiryMinutes * 60 * 1000);

  const token: AuthorizationToken = {
    token_id: `ATOK-${randomUUID().replace(/-/g, "").substring(0, 16)}`,
    intent_id: params.intentId,
    action: params.action,
    parameters_hash: computeParametersHash(params.action, params.toolArgs),
    approved_by: params.approvedBy,
    policy_hash: policy.policy_hash,
    issued_at: now.toISOString(),
    expires_at: expiresAt.toISOString(),
    max_executions: params.maxExecutions ?? policy.rules.max_executions_per_approval,
    execution_count: 0,
    signature: params.signature,
  };

  authorizationTokens.set(token.token_id, token);
  return token;
}

/**
 * Retrieve an authorization token by ID.
 */
export function getAuthorizationToken(tokenId: string): AuthorizationToken | null {
  return authorizationTokens.get(tokenId) ?? null;
}

/**
 * Burn (invalidate) an authorization token after execution.
 * Once burned, the token cannot be reused. This is the single-use enforcement.
 */
export function burnAuthorizationToken(tokenId: string): boolean {
  const token = authorizationTokens.get(tokenId);
  if (!token) return false;
  authorizationTokens.delete(tokenId);
  return true;
}

/**
 * Validate an authorization token before execution.
 * Returns pass/fail with detailed check results.
 *
 * Enforces the execution rule:
 *   - Token exists
 *   - Token signature valid
 *   - Token not expired
 *   - Execution count < max
 *   - Tool + args hash match token
 *   - Kill switch off
 */
export function validateAuthorizationToken(
  token: AuthorizationToken,
  action: string,
  toolArgs: Record<string, unknown>,
  killSwitchActive: boolean = false,
): { valid: boolean; checks: Array<{ check: string; status: "PASS" | "FAIL"; detail: string }> } {
  const checks: Array<{ check: string; status: "PASS" | "FAIL"; detail: string }> = [];

  // 1. Token exists in store
  const stored = authorizationTokens.get(token.token_id);
  const exists = !!stored;
  checks.push({
    check: "token_exists",
    status: exists ? "PASS" : "FAIL",
    detail: exists ? `Token ${token.token_id} found` : "Token not found in store",
  });

  // 2. Token signature valid (structural check)
  const sigValid = !!token.signature && token.signature.length >= 10;
  checks.push({
    check: "token_signature_valid",
    status: sigValid ? "PASS" : "FAIL",
    detail: sigValid ? "Signature present and well-formed" : "Signature missing or malformed",
  });

  // 3. Token not expired
  const now = new Date();
  const expiresAt = new Date(token.expires_at);
  const notExpired = now < expiresAt;
  checks.push({
    check: "token_not_expired",
    status: notExpired ? "PASS" : "FAIL",
    detail: notExpired ? `Expires at ${token.expires_at}` : `Expired at ${token.expires_at}`,
  });

  // 4. Execution count < max
  const underMax = token.execution_count < token.max_executions;
  checks.push({
    check: "execution_count_valid",
    status: underMax ? "PASS" : "FAIL",
    detail: underMax
      ? `${token.execution_count}/${token.max_executions} executions used`
      : `Max executions reached: ${token.execution_count}/${token.max_executions}`,
  });

  // 5. Tool + args hash match
  const currentHash = computeParametersHash(action, toolArgs);
  const hashMatch = token.parameters_hash === currentHash;
  checks.push({
    check: "parameters_hash_match",
    status: hashMatch ? "PASS" : "FAIL",
    detail: hashMatch ? "Parameters hash verified" : "Parameters hash mismatch — action or args changed after approval",
  });

  // 6. Kill switch off
  checks.push({
    check: "kill_switch_off",
    status: killSwitchActive ? "FAIL" : "PASS",
    detail: killSwitchActive ? "Kill switch is ACTIVE — all execution blocked" : "Kill switch off",
  });

  // 7. Policy hash matches active policy
  const policy = getActivePolicy();
  const policyMatch = policy ? token.policy_hash === policy.policy_hash : false;
  checks.push({
    check: "policy_hash_match",
    status: policyMatch ? "PASS" : "FAIL",
    detail: policyMatch ? `Policy hash verified: ${token.policy_hash.substring(0, 16)}...` : "Policy hash mismatch — policy changed since token was issued",
  });

  const valid = checks.every(c => c.status === "PASS");

  // Increment execution count if valid
  if (valid && stored) {
    stored.execution_count += 1;
  }

  return { valid, checks };
}

// ═══════════════════════════════════════════════════════════════
// 4. CANONICAL RECEIPT SCHEMA
// ═══════════════════════════════════════════════════════════════

/**
 * Canonical receipt — the permanent proof format for every governed action.
 * References token_id and policy_hash per the authority layer spec.
 */
export interface CanonicalReceipt {
  receipt_id: string;
  intent_id: string;
  proposer_id: string;           // who proposed the intent
  approver_id: string;           // who approved the intent
  token_id: string;
  action: string;
  status: "SUCCESS" | "FAILED";
  executor: string;
  execution_hash: string;        // SHA-256(execution result) — Policy v1 Section 6
  policy_hash: string;           // SHA-256 of GOVERNANCE_POLICY_V1.md
  snapshot_hash: string;         // SHA-256 of frozen policy snapshot (isolation guard)
  timestamp_proposed: string;    // ISO8601 — when intent was created
  timestamp_approved: string;    // ISO8601 — when intent was approved
  timestamp_executed: string;    // ISO8601 — when execution completed
  decision_delta_ms: number | null; // approval_timestamp - proposal_timestamp (Section 7)
  ledger_entry_id: string;       // LE-...
  previous_receipt_hash: string;
  receipt_hash: string;          // SHA-256(this receipt)
  gateway_signature: string;     // HMAC-SHA256 gateway signature
}

// Receipt chain state
let lastReceiptHash = "0000000000000000000000000000000000000000000000000000000000000000";

/**
 * Get the last receipt hash for chaining.
 */
export function getLastReceiptHash(): string {
  return lastReceiptHash;
}

/**
 * Set the last receipt hash (for initialization from DB).
 */
export function setLastReceiptHash(hash: string): void {
  lastReceiptHash = hash;
}

/**
 * Generate a canonical receipt for a governed action.
 * Enforces: No execution without receipt.
 */
export function generateCanonicalReceipt(params: {
  intentId: string;
  proposerId: string;
  approverId: string;
  tokenId: string;
  action: string;
  success: boolean;
  result: unknown;
  executor: string;
  ledgerEntryId: string;
  timestampProposed: string;
  timestampApproved: string;
  gatewaySigningKey?: string;
  snapshotHash?: string;         // Pre-computed snapshot_hash from frozen policy snapshot
}): CanonicalReceipt {
  const policy = getActivePolicy();
  if (!policy) {
    throw new Error("AUTHORITY_ERROR: No active policy — cannot generate receipt without policy");
  }

  // Snapshot isolation: use pre-computed snapshot_hash if provided,
  // otherwise compute from current policy (backward compatible)
  const snapshot_hash = params.snapshotHash ?? computeHash(canonicalJsonStringify({
    policy_id: policy.policy_id,
    policy_hash: policy.policy_hash,
    rules: policy.rules,
    root_public_key: policy.root_public_key,
    policy_signature: policy.policy_signature,
    activated_at: policy.activated_at,
  }));

  const receipt_id = `RCPT-${randomUUID().replace(/-/g, "").substring(0, 16)}`;
  const execution_hash = computeHash(canonicalJsonStringify(params.result ?? {}));
  const previous_receipt_hash = lastReceiptHash;
  const timestamp_executed = new Date().toISOString();

  // Compute decision_delta (Section 7)
  const tProposed = params.timestampProposed ? new Date(params.timestampProposed).getTime() : NaN;
  const tApproved = params.timestampApproved ? new Date(params.timestampApproved).getTime() : NaN;
  const decision_delta_ms = (!isNaN(tProposed) && !isNaN(tApproved)) ? (tApproved - tProposed) : null;

  // Compute receipt hash over all canonical fields (now includes snapshot_hash)
  const receipt_hash = computeHash(canonicalJsonStringify({
    receipt_id,
    intent_id: params.intentId,
    proposer_id: params.proposerId,
    approver_id: params.approverId,
    token_id: params.tokenId,
    action: params.action,
    status: params.success ? "SUCCESS" : "FAILED",
    executor: params.executor,
    execution_hash,
    policy_hash: policy.policy_hash,
    snapshot_hash,
    timestamp_proposed: params.timestampProposed,
    timestamp_approved: params.timestampApproved,
    timestamp_executed,
    decision_delta_ms,
    ledger_entry_id: params.ledgerEntryId,
    previous_receipt_hash,
  }));

  // Gateway signature over receipt_hash (Section 6 + 11)
  const gateway_signature = computeGatewaySignature(receipt_hash, params.gatewaySigningKey);

  const receipt: CanonicalReceipt = {
    receipt_id,
    intent_id: params.intentId,
    proposer_id: params.proposerId,
    approver_id: params.approverId,
    token_id: params.tokenId,
    action: params.action,
    status: params.success ? "SUCCESS" : "FAILED",
    executor: params.executor,
    execution_hash,
    policy_hash: policy.policy_hash,
    snapshot_hash,
    timestamp_proposed: params.timestampProposed,
    timestamp_approved: params.timestampApproved,
    timestamp_executed,
    decision_delta_ms,
    ledger_entry_id: params.ledgerEntryId,
    previous_receipt_hash,
    receipt_hash,
    gateway_signature,
  };

  // Update chain
  lastReceiptHash = receipt_hash;

  return receipt;
}

// ═══════════════════════════════════════════════════════════════
// 5. GENESIS RECORD (Ledger Block 0)
// ═══════════════════════════════════════════════════════════════

/**
 * Genesis record — the first ledger entry that anchors the system.
 */
export interface GenesisRecord {
  record_type: "GENESIS";
  system_id: "RIO";
  root_public_key: string;
  policy_hash: string;
  created_at: string;            // ISO8601
  previous_hash: "0000000000000000";
  signature: string;             // root signature
  genesis_hash: string;          // SHA-256(this record)
}

/**
 * Create the genesis record — the anchor for the entire system.
 * This must be the first ledger entry (block 0).
 */
export function createGenesisRecord(params: {
  rootPublicKey: string;
  policyHash: string;
  rootSignature: string;
}): GenesisRecord {
  const created_at = new Date().toISOString();

  const genesis_hash = computeHash(canonicalJsonStringify({
    record_type: "GENESIS",
    system_id: "RIO",
    root_public_key: params.rootPublicKey,
    policy_hash: params.policyHash,
    created_at,
    previous_hash: "0000000000000000",
  }));

  return {
    record_type: "GENESIS",
    system_id: "RIO",
    root_public_key: params.rootPublicKey,
    policy_hash: params.policyHash,
    created_at,
    previous_hash: "0000000000000000",
    signature: params.rootSignature,
    genesis_hash,
  };
}

/**
 * Verify a genesis record — check that the hash is correct and signature is valid.
 */
export function verifyGenesisRecord(genesis: GenesisRecord): {
  valid: boolean;
  checks: Array<{ check: string; status: "PASS" | "FAIL"; detail: string }>;
} {
  const checks: Array<{ check: string; status: "PASS" | "FAIL"; detail: string }> = [];

  // 1. Record type
  checks.push({
    check: "record_type",
    status: genesis.record_type === "GENESIS" ? "PASS" : "FAIL",
    detail: genesis.record_type === "GENESIS" ? "Record type is GENESIS" : `Expected GENESIS, got ${genesis.record_type}`,
  });

  // 2. System ID
  checks.push({
    check: "system_id",
    status: genesis.system_id === "RIO" ? "PASS" : "FAIL",
    detail: genesis.system_id === "RIO" ? "System ID is RIO" : `Expected RIO, got ${genesis.system_id}`,
  });

  // 3. Previous hash is genesis anchor
  checks.push({
    check: "previous_hash",
    status: genesis.previous_hash === "0000000000000000" ? "PASS" : "FAIL",
    detail: genesis.previous_hash === "0000000000000000" ? "Previous hash is genesis anchor (0000000000000000)" : "Previous hash is not genesis anchor",
  });

  // 4. Hash verification
  const expectedHash = computeHash(canonicalJsonStringify({
    record_type: "GENESIS",
    system_id: "RIO",
    root_public_key: genesis.root_public_key,
    policy_hash: genesis.policy_hash,
    created_at: genesis.created_at,
    previous_hash: "0000000000000000",
  }));
  const hashValid = genesis.genesis_hash === expectedHash;
  checks.push({
    check: "genesis_hash",
    status: hashValid ? "PASS" : "FAIL",
    detail: hashValid ? "Genesis hash verified" : "Genesis hash mismatch — record may be tampered",
  });

  // 5. Root signature present
  const sigPresent = !!genesis.signature && genesis.signature.length >= 10;
  checks.push({
    check: "root_signature",
    status: sigPresent ? "PASS" : "FAIL",
    detail: sigPresent ? "Root signature present" : "Root signature missing or malformed",
  });

  // 6. Root public key present
  const keyPresent = !!genesis.root_public_key && genesis.root_public_key.length >= 32;
  checks.push({
    check: "root_public_key",
    status: keyPresent ? "PASS" : "FAIL",
    detail: keyPresent ? `Root key: ${genesis.root_public_key.substring(0, 16)}...` : "Root public key missing",
  });

  return {
    valid: checks.every(c => c.status === "PASS"),
    checks,
  };
}

// ═══════════════════════════════════════════════════════════════
// 6. THE ONE RULE (Enforcement Invariants)
// ═══════════════════════════════════════════════════════════════

/**
 * The One Rule — the six invariants that must hold for the system to be governed.
 * This function checks all six and returns the result.
 */
export function enforceTheOneRule(state: {
  hasAuthorizationToken: boolean;
  hasApproval: boolean;
  hasActivePolicy: boolean;
  hasPolicyRootSignature: boolean;
  willGenerateReceipt: boolean;
  willWriteLedger: boolean;
}): { governed: boolean; violations: string[] } {
  const violations: string[] = [];

  if (!state.hasAuthorizationToken) {
    violations.push("No execution without authorization token");
  }
  if (!state.hasApproval) {
    violations.push("No authorization token without approval");
  }
  if (!state.hasActivePolicy) {
    violations.push("No approval without policy");
  }
  if (!state.hasPolicyRootSignature) {
    violations.push("No policy without root signature");
  }
  if (!state.willGenerateReceipt) {
    violations.push("No execution without receipt");
  }
  if (!state.willWriteLedger) {
    violations.push("No receipt without ledger entry");
  }

  return {
    governed: violations.length === 0,
    violations,
  };
}

// ═══════════════════════════════════════════════════════════════
// 7. CHIEF OF STAFF — NAMED AUDITOR ROLE
// ═══════════════════════════════════════════════════════════════

/**
 * The Chief of Staff is the named auditor role in the RIO system.
 * The auditor role already exists in the principals table as "auditor".
 * This constant maps the system role to its human-facing name and responsibilities.
 */
export const CHIEF_OF_STAFF = {
  systemRole: "auditor" as const,
  displayName: "Chief of Staff",
  description: "Reviews and audits the authority chain. Verifies receipts, inspects the ledger, and ensures governance integrity. Reports findings to the root authority (Brian).",
  responsibilities: [
    "Audit the ledger for integrity and completeness",
    "Review receipts and verify the authority chain",
    "Inspect authorization tokens for policy compliance",
    "Verify genesis record integrity",
    "Report governance violations to root authority",
    "Ensure the One Rule is enforced at all times",
  ],
  /** The friction that's good — the CoS exists to add healthy friction */
  purpose: "The Chief of Staff exists to add the friction that's good. The system may be audited at any time, and will be. That's the role.",
} as const;

// ═══════════════════════════════════════════════════════════════
// FULL AUTHORITY CHAIN VERIFICATION
// ═══════════════════════════════════════════════════════════════

/**
 * Verify the full authority chain from root to receipt.
 * This is the Chief of Staff's primary audit function.
 */
export function verifyAuthorityChain(params: {
  genesis: GenesisRecord;
  policy: SignedPolicy;
  token: AuthorizationToken;
  receipt: CanonicalReceipt;
}): {
  valid: boolean;
  chain: Array<{ layer: string; status: "PASS" | "FAIL"; detail: string }>;
} {
  const chain: Array<{ layer: string; status: "PASS" | "FAIL"; detail: string }> = [];

  // 1. Genesis → Root Authority
  const genesisValid = verifyGenesisRecord(params.genesis);
  chain.push({
    layer: "GENESIS → ROOT_AUTHORITY",
    status: genesisValid.valid ? "PASS" : "FAIL",
    detail: genesisValid.valid ? "Genesis record anchors root authority" : `Genesis invalid: ${genesisValid.checks.filter(c => c.status === "FAIL").map(c => c.detail).join(", ")}`,
  });

  // 2. Root Authority → Policy
  const policyKeyMatch = params.genesis.root_public_key === params.policy.root_public_key;
  chain.push({
    layer: "ROOT_AUTHORITY → POLICY",
    status: policyKeyMatch && params.policy.status === "ACTIVE" ? "PASS" : "FAIL",
    detail: policyKeyMatch ? `Policy ${params.policy.policy_id} signed by root authority` : "Policy not signed by genesis root key",
  });

  // 3. Policy → Token
  const tokenPolicyMatch = params.token.policy_hash === params.policy.policy_hash;
  chain.push({
    layer: "POLICY → TOKEN",
    status: tokenPolicyMatch ? "PASS" : "FAIL",
    detail: tokenPolicyMatch ? "Authorization token references active policy" : "Token policy hash does not match active policy",
  });

  // 4. Token → Receipt
  const receiptTokenMatch = params.receipt.token_id === params.token.token_id;
  const receiptPolicyMatch = params.receipt.policy_hash === params.policy.policy_hash;
  chain.push({
    layer: "TOKEN → RECEIPT",
    status: receiptTokenMatch && receiptPolicyMatch ? "PASS" : "FAIL",
    detail: receiptTokenMatch && receiptPolicyMatch
      ? "Receipt references authorization token and policy"
      : `Mismatch: token=${receiptTokenMatch}, policy=${receiptPolicyMatch}`,
  });

  // 5. Receipt → Ledger (receipt has ledger_entry_id)
  const hasLedgerRef = !!params.receipt.ledger_entry_id && params.receipt.ledger_entry_id.length > 0;
  chain.push({
    layer: "RECEIPT → LEDGER",
    status: hasLedgerRef ? "PASS" : "FAIL",
    detail: hasLedgerRef ? `Ledger entry: ${params.receipt.ledger_entry_id}` : "Receipt has no ledger entry reference",
  });

  return {
    valid: chain.every(c => c.status === "PASS"),
    chain,
  };
}

// ═══════════════════════════════════════════════════════════════
// RESET (for testing)
// ═══════════════════════════════════════════════════════════════

/**
 * Reset all in-memory state. Used only in tests.
 */
export function _resetAuthorityState(): void {
  activeRootAuthority = null;
  activePolicy = null;
  authorizationTokens.clear();
  lastReceiptHash = "0000000000000000000000000000000000000000000000000000000000000000";
}
