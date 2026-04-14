# 13-Point Governed Action Audit

## Current State Analysis

### PASS (already implemented and tested):
1. **Intent created** — PASS. `proxy.createIntent` creates intent with toolName, toolArgs, riskTier, argsHash.
2. **Risk evaluated** — PASS. `createIntent` computes riskTier and blastRadius.
3. **Proposer ≠ Approver** — PASS. Checked at execution time via `proposer_not_approver` preflight check.
4. **Approval recorded** — PASS. `proxy.approve` creates approval record with decision, signature, expiresAt, maxExecutions.
5. **Authorization token issued** — PASS. `issueAuthorizationToken` called after APPROVED decision, AUTHORITY_TOKEN written to ledger.
6. **Token validated before execution** — PASS. `validateAuthorizationToken` runs 7 sub-checks before execution.
8. **Execution performed** — PASS. `dispatchExecution` routes to real connector.
12. **Receipt hash written to ledger** — PASS. `appendLedger("EXECUTION", { receiptHash, ... })` writes hash.
13. **Ledger hash chain verifies** — PASS. `verifyHashChain` recomputes and verifies chain.

### FAIL (gaps found):
7. **Token burned after execution** — FAIL.
   - `validateAuthorizationToken` increments `execution_count` (line 364), which prevents reuse when max_executions=1.
   - BUT the router does NOT call `validateAuthorizationToken` — it only calls it during preflight.
   - After execution succeeds, the token is NOT explicitly burned/invalidated.
   - The token remains in the in-memory store and could theoretically be reused if max_executions > 1.
   - FIX: After successful execution, explicitly remove the token from the store OR mark it burned.

9. **Receipt generated** — PARTIAL FAIL.
   - The router computes a `receiptPayload` JSON string and `receiptHash` (SHA-256).
   - BUT it does NOT use `generateCanonicalReceipt()` from authorityLayer.ts.
   - The receipt is an ad-hoc JSON blob, not the canonical `CanonicalReceipt` format.
   - Missing fields in current receipt: receipt_id, token_id (only as authorization_token_id), 
     previous_receipt_hash, ledger_entry_id, signature (gateway signature), executor, status.

10. **Receipt includes required fields** — FAIL.
    Current receiptPayload contains:
    - executionId ✓
    - intentId ✓ (as intent_id requirement)
    - result ✓ (as execution_result requirement)
    - authorization_token_id ✓ (as token_id requirement)
    - approver_id ✓
    - policy_hash ✓
    MISSING:
    - receipt_hash (computed but not IN the receipt payload itself)
    - previous_receipt_hash ✗ — NOT present
    - ledger_entry_id ✗ — NOT present (ledger entry created AFTER receipt)
    - gateway_signature ✗ — NOT present

11. **Receipt signed by Gateway** — FAIL.
    No gateway signature is computed or attached to the receipt.
    The `generateCanonicalReceipt` function in authorityLayer.ts accepts a `signature` param
    but the router never calls it.

## Required Fixes:
1. Use `generateCanonicalReceipt()` in the execute mutation instead of ad-hoc JSON
2. Create ledger entry FIRST (to get ledger_entry_id), then generate receipt
3. Add gateway signature to receipt
4. Burn token after execution (remove from store)
5. Store canonical receipt with all required fields
