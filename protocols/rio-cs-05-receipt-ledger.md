# RIO-CS-05: Receipt and Ledger Protocol

**Version:** 1.0
**Status:** Normative
**Date:** April 2026
**Scope:** Receipt generation, hash binding, ledger structure, chain integrity, independent verification

---

## 1. Purpose

This protocol defines how every governed action produces a cryptographic receipt and how receipts are recorded in a tamper-evident, hash-chained ledger. The receipt is the system's answer to the question: "Prove it happened exactly this way." The ledger is the system's answer to: "Prove nothing was changed after the fact."

---

## 2. Definitions

| Term | Meaning |
|------|---------|
| **Receipt** | A cryptographically signed record proving that a specific action was proposed, approved, executed, and verified. |
| **Ledger** | An append-only, hash-chained sequence of entries. Each entry references the hash of the previous entry. |
| **Chain of Custody** | The complete set of artifacts (intent, verification, governance decision, approval, execution token, execution result) that produced a receipt. |
| **Receipt Hash** | SHA-256 hash computed over the receipt's chain-of-custody hashes. |
| **Gateway Signature** | HMAC-SHA256 signature applied by the execution gateway over the receipt. |

---

## 3. Receipt Structure

Every receipt MUST contain the following fields:

| Field | Type | Description |
|-------|------|-------------|
| `receipt_id` | string | Unique receipt identifier. |
| `intent_id` | string | The intent this receipt covers. |
| `proposer_id` | string | Identity that proposed the action. |
| `approver_id` | string | Identity that approved the action. |
| `token_id` | string | The authorization token consumed. |
| `action` | string | The action that was executed. |
| `status` | string | `EXECUTED`, `FAILED`, or `REJECTED`. |
| `executor` | string | The system component that executed the action. |
| `execution_hash` | string | SHA-256 hash of the execution result. |
| `policy_hash` | string | Hash of the policy in effect. |
| `ledger_entry_id` | string | The ledger entry this receipt is recorded in. |
| `receipt_hash` | string | SHA-256 hash of this receipt (see Section 4). |
| `previous_receipt_hash` | string | Hash of the previous receipt in the chain. |
| `gateway_signature` | string | Gateway's HMAC-SHA256 signature on this receipt. |
| `timestamp_proposed` | string | ISO 8601 — when the intent was proposed. |
| `timestamp_approved` | string | ISO 8601 — when the intent was approved. |
| `timestamp_executed` | string | ISO 8601 — when the action was executed. |
| `decision_delta_ms` | number | `timestamp_approved - timestamp_proposed` in milliseconds. |
| `authority_model` | string | `Separated Authority` or `Constrained Single-Actor Execution`. |

---

## 4. Receipt Hash Computation

The `receipt_hash` MUST be computed as:

```
receipt_hash = SHA-256(canonical_json({
  receipt_id,
  intent_hash,
  verification_hash,
  decision_hash,
  approval_hash,
  execution_hash
}))
```

Each component hash MUST be computed from its respective artifact using canonical JSON serialization:

| Hash Field | Computed From |
|------------|--------------|
| `intent_hash` | `SHA-256(canonical_json(intent_envelope))` |
| `verification_hash` | `SHA-256(canonical_json(verification_result))` |
| `decision_hash` | `SHA-256(canonical_json(governance_decision))` |
| `approval_hash` | `SHA-256(canonical_json(approval_record))` or `null` if auto-approved |
| `execution_hash` | `SHA-256(canonical_json({token_id, result}))` |

---

## 5. Chain of Custody

Every receipt MUST embed or reference the full chain of custody:

1. **Intent Envelope** — The original proposed action with identity, parameters, nonce, and timestamp.
2. **Verification Result** — The outcome of the six-check verification gate.
3. **Governance Decision** — The risk assessment and policy evaluation result.
4. **Approval Record** — The human authorization artifact (or null if auto-approved for LOW risk).
5. **Execution Token** — The authorization token that was consumed.
6. **Execution Result** — The outcome of the connector/adapter execution.

---

## 6. Receipt Chaining

6.1. The first receipt in the system MUST set `previous_receipt_hash` to 64 hexadecimal zeros:
```
0000000000000000000000000000000000000000000000000000000000000000
```

6.2. Every subsequent receipt MUST set `previous_receipt_hash` to the `receipt_hash` of the immediately preceding receipt.

6.3. This creates an independent, append-only receipt chain. Any modification to a historical receipt breaks the chain and is immediately detectable.

---

## 7. Ledger Structure

7.1. The ledger is an ordered, append-only sequence of entries. There is no update operation. There is no delete operation.

7.2. Every ledger entry MUST contain:

| Field | Type | Description |
|-------|------|-------------|
| `ledger_entry_id` | string | Unique entry identifier. |
| `entry_type` | string | `WAL_PREPARED`, `WAL_COMMITTED`, `WAL_FAILED`, `DELEGATION_BLOCKED`, `EXECUTION`. |
| `receipt_hash` | string | Hash of the associated receipt (if applicable). |
| `previous_hash` | string | Hash of the previous ledger entry. |
| `entry_hash` | string | SHA-256 hash of this entry. |
| `timestamp` | string | ISO 8601 timestamp. |
| `proposer_identity_id` | string | Who proposed the action. |
| `approver_identity_id` | string | Who approved the action. |
| `authority_model` | string | The delegation model label. |

7.3. The first ledger entry (genesis) MUST set `previous_hash` to 64 hexadecimal zeros.

7.4. Every subsequent entry MUST set `previous_hash` to the `entry_hash` of the immediately preceding entry.

---

## 8. Hash Chain Integrity

8.1. The ledger hash chain MUST be independently verifiable. Given the full ledger, any party MUST be able to:
- Recompute each `entry_hash` from the entry's contents.
- Verify that each `previous_hash` matches the preceding entry's `entry_hash`.
- Detect any modification, insertion, or deletion.

8.2. If recomputed `entry_hash` does not match stored `entry_hash`, the entry has been tampered with.

8.3. If `entry[i].previous_hash` does not match `entry[i-1].entry_hash`, the chain has been broken.

---

## 9. Gateway Signature

9.1. Every receipt MUST be signed by the execution gateway using HMAC-SHA256.

9.2. The signature MUST be computed over the canonical JSON representation of the receipt.

9.3. The signing key MUST be server-side only and MUST NOT be exposed to clients.

---

## 10. Approval Hash Nullability

10.1. `approval_hash` is `null` when the intent was auto-approved (LOW risk, governance decision = APPROVE).

10.2. `approval_hash` is non-null when human approval was provided (MEDIUM or HIGH risk).

10.3. The null/non-null distinction MUST be preserved in the receipt. It indicates whether a human explicitly authorized the action.

---

## 11. Verification Rules

For independent verification, the following checks MUST all pass:

| Check | Rule |
|-------|------|
| Receipt hash | Recomputed `receipt_hash` from chain-of-custody hashes MUST match stored `receipt_hash`. |
| Receipt chain | `receipt[i].previous_receipt_hash` MUST equal `receipt[i-1].receipt_hash`. |
| Ledger chain | `entry[i].previous_hash` MUST equal `entry[i-1].entry_hash`. |
| Execution hash | Recomputed `execution_hash` from execution result MUST match stored `execution_hash`. |
| Gateway signature | Recomputed HMAC-SHA256 MUST match stored `gateway_signature`. |
| Completeness | Every executed action MUST have a corresponding receipt. Every receipt MUST have a corresponding ledger entry. |

---

## 12. Failure Conditions

| Condition | Result |
|-----------|--------|
| Recomputed receipt hash does not match stored | Tamper detected. |
| Receipt chain broken | Integrity violation — receipt modified or deleted. |
| Ledger chain broken | Integrity violation — entry modified or deleted. |
| Missing chain-of-custody field | Receipt is invalid. |
| Execution hash mismatch | Execution result was modified after recording. |
| No receipt for executed action | Governance violation — action occurred outside governed path. |

---

## 13. Failure Mode

The receipt and ledger system is append-only and tamper-evident. If a receipt cannot be generated, the action MUST be recorded as failed. If a ledger entry cannot be written, the system MUST NOT report the action as successful. The system fails closed: no proof means no claim of execution.
