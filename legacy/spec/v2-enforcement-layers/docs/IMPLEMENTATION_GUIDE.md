> Derived from: /specs/canonical/RIO_CANONICAL_SPEC_v1.0.md

# Implementation Guide

**Extracted from:** `controlPlane.ts`, `kernelExecutor.ts`, `constrainedDelegation.ts`, `gatewayProxy.ts`, `integritySubstrate.ts`, `authorityLayer.ts`, `kernelV2.acceptance.test.ts`, `redteam.break.test.ts`, `gateway-identity-eval.test.ts`, `authorityLayer.test.ts`

---

## Implementation Order

This is the order in which the system was built and verified. Each step depends on the previous.

### Phase 1: Commit Chain (specs/01_commit_chain)

1. Implement `canonicalJsonStringify()` — recursive key-sorted JSON serialization.
2. Implement `computeHash()` — SHA-256 via `crypto.createHash('sha256')`.
3. Implement `FormalLedgerEntry` with hash chain: `current_hash = SHA-256(canonical_json({block_index, receipt_hash, previous_ledger_hash, timestamp, payload}))`.
4. Implement `appendLedger()` — append-only. Each entry links to previous via `previous_ledger_hash === previous.current_hash`.
5. Implement `verifyHashChain()` — walk the chain, verify every link. Break = SYSTEM CORRUPTION.
6. Implement WAL discipline: `walPrepare()`, `walCommit()`, `walFail()`. PREPARED before execution, COMMITTED/FAILED after.
7. Implement `validateAtSubstrate()` — 4 checks (nonce, dedup, replay, receipt_linkage) before governance.
8. Implement `rebuildNonceCache()` — read NONCE_CONSUMED entries from ledger on startup.
9. Implement `startupLedgerVerification()` — verify hash chain + rebuild nonce cache on startup.
10. Implement `GenesisRecord` — block 0 with `record_type="GENESIS"`, `system_id="RIO"`, `previous_hash="0000000000000000"`.

### Phase 2: Governance Decision (specs/02_governance_decision)

1. Implement `IntentEnvelope` — 15 fields, 10 required for schema validation.
2. Implement `verifyIntentEnvelope()` — 6 checks in order: schema, auth, signature, TTL, nonce, replay. `verified = ALL pass`.
3. Implement nonce store with TTL (NONCE_TTL_MS = 600,000ms). Clean expired nonces before each check.
4. Implement `evaluateGovernance()` — ONLY runs after verification passes. Throws if `verification.verified === false`.
5. Implement risk decision matrix: LOW → APPROVE, MEDIUM → REQUIRE_HUMAN_APPROVAL (1), HIGH → REQUIRE_HUMAN_APPROVAL (1).
6. Implement `ApprovalRecord` and `validateApproval()` — 4 conditions: intent_hash match, decision_id match, status APPROVED, artifact >= 10 chars.
7. Implement `ExpressionOutput` with `__expression_output: true` discriminator.
8. Implement `isExpressionOutput()` type guard.
9. Implement `expressionToIntent()` — requires `approvedByHuman === true`. Throws on false.
10. Implement `LearningAnalysis` — `mutates_live_policy` ALWAYS false. Recommendations ALWAYS `PENDING_REVIEW`.

### Phase 3: Execution Token (specs/03_execution_token)

1. Implement `ExecutionToken` — bound to intent_hash, action_hash, policy_version, TTL, nonce, target.
2. Implement `issueExecutionToken()` — action_hash = SHA-256(canonical_json({action_type, target, parameters})).
3. Set `KERNEL_TOKEN_TTL_MS = 5000` (5 seconds).
4. Implement `executeGatePreflight()` — 6 checks: token_valid, token_not_expired, intent_hash_match, action_hash_match, policy_version_match, target_match. ALL must pass.
5. Implement single-use enforcement: `storedToken.used = true` after gate passes.
6. Implement `consumeNonce()` — DB-backed atomic nonce consumption.
7. Implement `enforceToolSandbox()` — TOOL_DENYLIST + TOOL_ALLOWLIST.
8. Implement `kernelExecute()` — the ONLY function that may produce side effects. 10-step strict order.
9. Add expression isolation guard as Step 0 of `kernelExecute()`.

### Phase 4: Witness Receipt (specs/04_witness_receipt)

1. Implement `WitnessReceipt` — links all chain-of-custody artifacts.
2. Implement `generateWitnessReceipt()` — compute verification_hash, decision_hash, approval_hash, execution_hash, receipt_hash.
3. receipt_hash = SHA-256(canonical_json({receipt_id, intent_hash, verification_hash, decision_hash, approval_hash, execution_hash})).
4. Implement `CanonicalReceipt` with hash chaining — first receipt uses 64 hex zeros for previous_receipt_hash.
5. Implement `generateCanonicalReceipt()` — includes proposer_id, approver_id, decision_delta_ms, gateway_signature.

### Phase 5: Delegation Boundary (specs/05_delegation_boundary)

1. Implement `checkDelegation()` — 3 cases: separated (different identities), constrained (same + cooldown elapsed), self (same + cooldown not elapsed).
2. Set `DELEGATION_COOLDOWN_MS = 120000` (2 minutes).
3. Implement `classifyRoleSeparation()` — maps to "separated", "constrained", "self".
4. Implement `resolveAuthorityModel()` — maps to canonical audit trail labels.
5. Implement `evaluateIdentityAtGatewayBoundary()` — MUST be called before any Gateway /authorize call.
6. Implement `validateRoleTransition()` — proposer can only create_intent, approver can only authorize_action.
7. Ensure DELEGATION_BLOCKED, DELEGATION_APPROVED, and EXECUTION ledger entries include proposer_identity_id, approver_identity_id, authority_model.
8. Implement `RootAuthority` — Ed25519 key pair, active/revoked status.
9. Implement `SignedPolicy` — deterministic hash, active/superseded/revoked lifecycle.
10. Implement `AuthorizationToken` with 7 gate checks: token_exists, token_signature_valid, token_not_expired, execution_count_valid, parameters_hash_match, kill_switch_off, policy_hash_match.

---

## Acceptance Criteria

These are the exact guarantees verified by the test suites. An implementation is correct if and only if all of these hold.

### Kernel Guarantees (from kernelV2.acceptance.test.ts)

1. Every execution path calls `kernelExecute()` or goes through the governed pipeline.
2. `kernelExecute()` rejects `ExpressionOutput` at entry.
3. Verification runs before governance. Governance throws on unverified input.
4. LOW risk auto-approves. MEDIUM/HIGH require human approval.
5. Missing approval = "Silence equals refusal."
6. Tool sandbox blocks denylist matches.
7. WAL PREPARED written before connector call.
8. Execution token TTL <= 5,000ms.
9. All 6 preflight gate checks must pass.
10. Nonce consumed atomically. Replay returns NONCE_REPLAY.
11. WAL COMMITTED/FAILED written after connector call.
12. Receipt generated with correct hash chain.
13. Ledger entry hash-linked to previous.
14. Startup verification detects chain breaks.
15. Nonces rebuilt from ledger on startup.

### Delegation Guarantees (from gateway-identity-eval.test.ts)

1. Different identities → allowed immediately, "Separated Authority".
2. Same identity before cooldown → BLOCKED, "BLOCKED — Self-Authorization Sub-Policy Not Met".
3. Same identity after cooldown → allowed, "Constrained Single-Actor Execution".
4. At cooldown - 1ms → BLOCKED. At exactly elapsed → ALLOWED.
5. GatewayIdentityEvaluation has exactly these fields: allowed, proposer_identity_id, approver_identity_id, authority_model, role_separation, reason, cooldown_remaining_ms, delegation_check.
6. Ledger entries include proposer_identity_id, approver_identity_id, authority_model.

### Authority Layer Guarantees (from authorityLayer.test.ts)

1. Root authority can be registered and revoked.
2. Policy hash is deterministic — same rules = same hash.
3. Only one policy active at a time. New activation supersedes previous.
4. Authorization token requires active policy.
5. Token has all required fields: token_id, intent_id, action, parameters_hash, approved_by, policy_hash, issued_at, expires_at, max_executions, execution_count, signature.
6. All 7 gate checks enforced: token_exists, token_signature_valid, token_not_expired, execution_count_valid, parameters_hash_match, kill_switch_off, policy_hash_match.
7. CanonicalReceipt has all required fields including previous_receipt_hash.
8. First receipt previous_receipt_hash = 64 hex zeros.
9. Second receipt chains to first.
10. Genesis record: record_type="GENESIS", system_id="RIO", previous_hash="0000000000000000".

### Break Test Guarantees (from redteam.break.test.ts)

1. Cannot execute without valid approval (FAIL_CLOSED).
2. CAS success only on rowsAffected === 1. Zero rows = CAS_FAILED.
3. Nonce replay detected and blocked.
4. Token TTL <= 5,000ms.
5. Payload tampering detected via ARGS_HASH_MISMATCH.
6. Duplicate content blocked via BLOCKED_DEDUP.
7. Only routers.ts, oneClickApproval.ts, and emailApproval.ts may call dispatchExecution.
8. WAL discipline (walPrepare, walCommit, walFail) enforced in all approval handlers.
9. ExpressionOutput blocked at kernel boundary via __expression_output discriminator.

---

## Source File Map

| File | Role |
|---|---|
| `controlPlane.ts` | Canonical schemas (A1-A8), verification, governance, approval, execution token, receipt, ledger entry, expression isolation, learning loop. |
| `kernelExecutor.ts` | Kernel execution membrane. WAL discipline. Tool sandbox. Nonce consumption. Startup verification. The ONLY function that may produce side effects. |
| `constrainedDelegation.ts` | Authority separation. Cooldown enforcement. Role permissions. Single source of truth for delegation policy. |
| `gatewayProxy.ts` | Gateway identity evaluation. Authority model labels. ONE as untrusted client. Email-based identity bridging. |
| `integritySubstrate.ts` | First gate before governance. 4-check substrate (nonce, dedup, replay, receipt_linkage). |
| `authorityLayer.ts` | Root authority. Signed policy. Authorization token. Canonical receipt with chaining. Genesis record. |
| `db.ts` | Database helpers. appendLedger, verifyHashChain, getAllLedgerEntries, CAS operations. |
| `routers.ts` | tRPC procedures. Intent creation, approval, execution. Governed entry points. |
| `connectors.ts` | Tool connectors. All go through _gatewayExecution. |
| `emailApproval.ts` | Email-based approval handler. WAL discipline enforced. |
| `oneClickApproval.ts` | One-click approval handler. WAL discipline enforced. |
