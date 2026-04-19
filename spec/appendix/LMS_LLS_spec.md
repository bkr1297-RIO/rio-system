# Appendix: Ledger Management System / Ledger Logging Specification (LMS/LLS)

**Version:** 0.1
**Status:** Active

---

## Overview

The Ledger Management System (LMS) and Ledger Logging Specification (LLS) define how the RIO system maintains its append-only hash-chained ledger of all governed actions.

---

## Ledger Structure

Each ledger entry contains:

| Field | Type | Description |
|-------|------|-------------|
| `id` | integer | Auto-incrementing entry number |
| `intent_id` | UUID | Reference to the governed intent |
| `entry_type` | enum | `GENESIS`, `POLICY_ACTIVATED`, `INTENT_PROPOSED`, `INTENT_APPROVED`, `INTENT_EXECUTED`, `INTENT_DENIED`, `TOKEN_BURNED`, `AUDIT` |
| `data` | JSON | Entry-specific payload |
| `hash` | string | SHA-256 of `canonical_json(entry fields)` |
| `prev_hash` | string | Hash of the previous entry (chain link) |
| `timestamp` | ISO8601 | When the entry was created |

---

## Hash Chain

The ledger forms a hash chain:

```
Entry 0 (GENESIS):  hash = SHA-256(canonical_json(genesis_data))
                     prev_hash = "0" (sentinel)

Entry 1:            hash = SHA-256(canonical_json(entry_1_data + prev_hash))
                     prev_hash = Entry 0's hash

Entry N:            hash = SHA-256(canonical_json(entry_N_data + prev_hash))
                     prev_hash = Entry (N-1)'s hash
```

---

## Integrity Verification

To verify the chain:
1. Start at the genesis entry (prev_hash = "0")
2. For each subsequent entry, verify that `prev_hash` matches the previous entry's `hash`
3. For each entry, recompute `hash` from `canonical_json(entry_data)` and verify it matches

If any link breaks, the chain is invalid from that point forward.

---

## Append-Only Invariant

The ledger is append-only. No entry can be modified or deleted after creation. This is enforced by:
1. Database constraints (no UPDATE/DELETE on ledger table)
2. Hash chain — modifying any entry invalidates all subsequent hashes
3. Audit trail — the witness can verify the chain at any time

---

## Entry Types

| Type | When Created | Data Contains |
|------|-------------|---------------|
| `GENESIS` | System initialization | Root authority public key |
| `POLICY_ACTIVATED` | Policy activation | Policy ID, rules, signature |
| `INTENT_PROPOSED` | Intent creation | Intent fields |
| `INTENT_APPROVED` | Approval + token issuance | Approval ID, token ID |
| `INTENT_EXECUTED` | Successful execution | Receipt ID, receipt hash |
| `INTENT_DENIED` | Gate rejection | Denial reasons, failed checks |
| `TOKEN_BURNED` | Token consumed | Token ID, burn timestamp |
| `AUDIT` | Witness verification | Audit report summary |
