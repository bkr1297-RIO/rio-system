# RIO Ledger Specification

## 1. Overview

The RIO Ledger is an append-only, tamper-evident audit log that records the lifecycle of every action governed by the RIO Receipt Protocol. It provides the cryptographic proof required for non-repudiation and historical auditing.

## 2. Ledger Properties

### Append-Only
Records can only be added to the ledger. Once written, a record cannot be modified or deleted. If a record is found to be erroneous, a new compensating record must be appended to invalidate or correct the previous state.

### Hash Chaining
The ledger is secured via a cryptographic hash chain. Every `Receipt` appended to the ledger must include a `previous_hash` field.
*   The `previous_hash` must exactly match the `ledger_hash` of the immediately preceding receipt.
*   The first receipt in the ledger (index 0) must have a `previous_hash` value of `"GENESIS"`.
*   If any receipt in the chain is altered, its `ledger_hash` will change, breaking the link to the subsequent receipt and exposing the tampering.

### Event Ordering
Events must be recorded in the exact chronological order they occurred. The `chain_index` must increment by exactly 1 for each new receipt.

## 3. Minimum Event Types

While the final `Receipt` is the primary artifact stored in the hash chain, a compliant implementation should maintain an event log of the entire lifecycle. The minimum required event types are:

*   `request_recorded`: An `ActionRequest` was submitted to the system.
*   `recommendation_recorded`: An `AIRecommendation` was generated for a pending request.
*   `approval_recorded`: A human `ApprovalRecord` was received and verified.
*   `execution_allowed`: The execution gateway verified the approval and permitted the action to proceed.
*   `execution_blocked`: The execution gateway rejected the action (e.g., missing approval, expired token, payload mismatch).
*   `receipt_generated`: The action completed and the final cryptographic `Receipt` was created.
*   `verification_checked`: An external party or internal audit process verified a receipt against the ledger.

## 4. Verification Requirements

To verify the integrity of the ledger, an auditor must:
1.  Start at the most recent receipt.
2.  Recompute the canonical SHA-256 hash of the receipt.
3.  Verify the recomputed hash matches the stored `ledger_hash`.
4.  Verify the `signature` using the issuing system's public key.
5.  Retrieve the preceding receipt using the `previous_hash`.
6.  Repeat steps 2-5 until the `GENESIS` receipt is reached.

If all hashes match and all signatures are valid, the ledger is mathematically proven to be untampered.
