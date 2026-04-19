# Appendix: RIO Orchestrator Compliance Profile v0.1

**Version:** 0.1
**Status:** Active

---

## Overview

This profile defines the compliance requirements for any orchestrator operating within the RIO governed execution framework. An orchestrator is compliant if and only if it satisfies all requirements below.

---

## Requirements

### R1: No Execution Without Authorization Token

The orchestrator MUST NOT dispatch any side-effecting action without a valid authorization token issued by the authority layer.

**Verification:** Attempt execution without token → must receive `NO_TOKEN` denial.

### R2: No Token Without Approval

The authority layer MUST NOT issue a token without a prior approval record from a different principal than the proposer.

**Verification:** Attempt token issuance without approval → must throw `AUTHORITY_ERROR`.

### R3: No Approval Without Policy

The authority layer MUST NOT issue a token if no active governance policy exists.

**Verification:** Attempt token issuance with no active policy → must throw `AUTHORITY_ERROR`.

### R4: Single-Use Tokens

Each authorization token MUST be burned after execution. Replay attempts MUST be rejected.

**Verification:** Execute with token → burn → replay → must receive `TOKEN_ALREADY_CONSUMED`.

### R5: Args Hash Binding

The token's `args_hash` MUST be verified against the current request arguments at execution time. Any mutation MUST be rejected.

**Verification:** Approve with args A → mutate to args B → execute → must receive `TOKEN_HASH_MISMATCH`.

### R6: TTL Enforcement

Tokens MUST have a finite TTL. Expired tokens MUST be rejected.

**Verification:** Issue token with 0-minute TTL → execute → must receive `TOKEN_EXPIRED`.

### R7: Separation of Duties

The proposer MUST NOT be able to approve their own intent.

**Verification:** Propose as user A → approve as user A → must be blocked.

### R8: Fail-Closed

If any Gate check fails, execution MUST NOT proceed. The system defaults to denial.

**Verification:** Any single check failure → execution blocked.

### R9: Receipt Required

Every execution MUST produce a canonical receipt with a valid hash and gateway signature.

**Verification:** Execute → receipt exists with 64-char SHA-256 hash and non-empty signature.

### R10: Ledger Required

Every execution MUST produce a ledger entry. The ledger forms a hash chain.

**Verification:** Execute → ledger entry exists with hash linking to previous entry.

---

## Compliance Verification

Run the compliance runner (`runner/run_tests.py`) to verify all requirements. The runner maps to requirements as follows:

| Scenario | Requirements Verified |
|----------|----------------------|
| S1 | R1, R2, R3, R9, R10 |
| S2 | R1, R8 |
| S3 | R4 |
| S4 | R5, R8 |
| S5 | R7 |
| S6 | R6, R8 |
| S7 | R8 |
