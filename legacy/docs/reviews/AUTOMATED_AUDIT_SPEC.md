# Automated Audit Verification Spec

**Author:** Romney (Protocol / Packaging)
**Date:** 2026-04-04
**Status:** Draft — defines what an automated audit service must verify
**Scope:** Receipt + Ledger verification checks using the existing protocol

---

## 1. Purpose

This document defines the complete set of checks that an automated audit service must perform to verify the integrity of the RIO governed execution system. The audit service operates at the Witness layer — it can read everything but cannot execute or approve.

The audit service answers one question:

> **For every governed action in the ledger, can we prove that the action was requested, governed, authorized, executed, and recorded correctly — and that nothing was modified after the fact?**

---

## 2. Audit Scope

The audit service verifies five categories of integrity:

| Category | What It Proves |
|---|---|
| **Approval Integrity** | An approval exists and is cryptographically valid |
| **Execution Integrity** | The execution matches the approved plan |
| **Receipt Integrity** | The receipt hash chain is internally consistent |
| **Signature Integrity** | The Ed25519 signature is valid and bound to a registered signer |
| **Ledger Integrity** | The ledger chain is unbroken and entries match receipts |

---

## 3. The Audit Checks

### Check 1: Approval Exists and Is Valid

**What it verifies:** Every governed action has a corresponding approval record, and the approval was not modified after it was recorded.

**Procedure:**

1. For each receipt with `receipt_type: "governed_action"`, verify that `hash_chain.authorization_hash` is present and is a valid 64-character hex string.
2. If the full authorization record is available (from CAS or database), recompute its hash using canonical serialization:
   ```
   canonical = JSON.stringify({
     intent_id, decision, authorized_by, timestamp, conditions
   })
   authorization_hash = SHA-256(canonical)
   ```
3. Compare the recomputed hash to `hash_chain.authorization_hash` in the receipt.
4. Verify that `decision` is `"approved"` (not `"denied"` or `"expired"`).

**Pass condition:** Authorization hash is present, recomputed hash matches, and decision is `"approved"`.

**Fail condition:** Missing authorization hash on a governed receipt, hash mismatch (artifact was modified), or decision is not `"approved"`.

---

### Check 2: Execution Hash Matches Approved Plan Hash

**What it verifies:** The action that was executed is the same action that was approved. The execution was not substituted or modified.

**Procedure:**

1. For each receipt, verify that `hash_chain.execution_hash` is present and is a valid 64-character hex string.
2. If the full execution record is available, recompute its hash using canonical serialization:
   ```
   canonical = JSON.stringify({
     intent_id, action, result, connector, timestamp
   })
   execution_hash = SHA-256(canonical)
   ```
3. Compare the recomputed hash to `hash_chain.execution_hash` in the receipt.
4. Verify that the `intent_id` in the execution record matches the `intent_id` in the receipt.
5. Verify that the `action` in the execution record matches the `action` in the receipt.

**Pass condition:** Execution hash matches, and intent_id and action are consistent between execution record and receipt.

**Fail condition:** Hash mismatch (execution was modified), or intent_id/action mismatch (wrong execution was linked to this receipt).

**Note:** "Matches approved plan" means the execution's `intent_id` traces back to the same intent that was approved. The approval binds to an intent_id, and the execution binds to the same intent_id. The receipt binds both hashes together. If any link is broken, the chain fails.

---

### Check 3: Receipt Signature Valid

**What it verifies:** The Ed25519 signature on the receipt is mathematically valid, was produced by the claimed public key, and the signed payload matches the receipt hash.

**Procedure:**

1. Check if `identity_binding` is present and `ed25519_signed` is `true`. If not signed, this check is skipped (not failed).
2. Verify that `identity_binding.public_key_hex` is a valid 64-character hex string (32-byte Ed25519 public key).
3. Verify that `identity_binding.signature_payload_hash` equals `hash_chain.receipt_hash`. This proves the signature covers the receipt, not some other payload.
4. Reconstruct the Ed25519 public key from `public_key_hex`:
   ```
   SPKI DER = [12-byte ASN.1 header: 302a300506032b6570032100] + [32-byte public key]
   ```
5. Verify the Ed25519 signature:
   ```
   payload = UTF-8 bytes of hash_chain.receipt_hash (the 64-char hex string)
   valid = Ed25519.verify(payload, signature_hex, public_key)
   ```

**Pass condition:** Signature is mathematically valid, and `signature_payload_hash` equals `receipt_hash`.

**Fail condition:** Signature verification fails, `signature_payload_hash` does not match `receipt_hash`, or public key is malformed.

**Enhanced check (requires signer registry access):**

6. Look up `identity_binding.signer_id` in the `authorized_signers` registry.
7. Verify that the `public_key_hex` in the receipt matches the `public_key_hex` in the registry for that `signer_id`.
8. Verify that the signer's `registered_at` timestamp is before the receipt's `timestamp` (the signer was registered before they signed).

This enhanced check requires Gateway database access and is not part of independent verification. It is an additional trust check for the audit service.

---

### Check 4: Ledger Chain Valid

**What it verifies:** The append-only ledger has not been tampered with. Every entry's hash is correct, and the chain links are unbroken from genesis.

**Procedure:**

1. Retrieve all ledger entries ordered by `id` ascending.
2. For the first entry, verify that `prev_hash` equals the genesis value: `0000000000000000000000000000000000000000000000000000000000000000`.
3. For each entry, recompute `ledger_hash` using canonical serialization:
   ```
   canonical = JSON.stringify({
     entry_id, prev_hash, timestamp, intent_id, action, agent_id,
     status, detail, receipt_hash, authorization_hash, intent_hash
   })
   ledger_hash = SHA-256(canonical)
   ```
4. Compare the recomputed `ledger_hash` to the stored `ledger_hash`.
5. For each subsequent entry, verify that its `prev_hash` equals the preceding entry's `ledger_hash`.

**Pass condition:** All hashes match and all chain links are valid from genesis to tip.

**Fail condition:** Any hash mismatch (entry was modified) or any chain link break (entry was inserted, deleted, or reordered).

**Scope note:** This check verifies the entire ledger, not just entries related to a specific receipt. A single tampered entry breaks the chain for all subsequent entries.

---

### Check 5: Policy Hash Matches Policy Version at Time of Execution

**What it verifies:** The governance decision was made using the policy rules that were active at the time, not a later or earlier version.

**Procedure:**

1. For each governed receipt, verify that `hash_chain.governance_hash` is present.
2. If the full governance decision record is available, recompute its hash using canonical serialization:
   ```
   canonical = JSON.stringify({
     intent_id, status, risk_level, requires_approval, checks
   })
   governance_hash = SHA-256(canonical)
   ```
3. Compare the recomputed hash to `hash_chain.governance_hash` in the receipt.
4. If policy versioning is implemented (future — see note below), verify that the `checks` field in the governance decision references the policy version that was active at the receipt's `timestamp`.

**Pass condition:** Governance hash matches, and policy version is consistent with the timestamp.

**Fail condition:** Hash mismatch (governance decision was modified), or policy version does not match the active policy at execution time.

**Note on policy versioning:** The current receipt protocol does not include a `policy_version` field. The governance hash covers the `checks` array, which implicitly encodes which policy rules were applied. Full policy version tracking requires the Policy Schema Spec (Andrew's deliverable). Until then, Check 5 is limited to verifying that the governance hash is consistent — it cannot independently verify which policy version was used.

**Recommendation:** When the Policy Schema Spec is finalized, add an optional `policy_version` field to the governance decision record. This field would be included in the canonical serialization for `governance_hash`, enabling the audit service to verify policy version consistency.

---

## 4. Audit Levels

Not all checks require the same level of access. The audit service can operate at three levels depending on what data is available:

### Level 1: Receipt-Only Audit (Independent Verification)

**Access required:** Receipt JSON only (no system access).

| Check | Available? | What It Verifies |
|---|---|---|
| Receipt hash chain | Yes | Internal consistency of the receipt |
| Ed25519 signature | Yes | Signature validity against embedded public key |
| Chain length consistency | Yes | `chain_length` matches `chain_order` |
| Structural validation | Yes | All required fields present and correctly formatted |

This is the level that satisfies Constitution Invariant 6 (independent verification). Any third party with the receipt can perform these checks.

### Level 2: Receipt + Ledger Audit

**Access required:** Receipt JSON + ledger entries.

| Check | Available? | What It Verifies |
|---|---|---|
| All Level 1 checks | Yes | — |
| Ledger chain integrity | Yes | Unbroken hash chain from genesis |
| Receipt-to-ledger cross-reference | Yes | Receipt hash matches ledger entry |
| Intent hash cross-reference | Yes | Intent hash consistent between receipt and ledger |
| Authorization hash cross-reference | Yes | Authorization hash consistent between receipt and ledger |

### Level 3: Full Audit (Requires Artifact Access)

**Access required:** Receipt JSON + ledger entries + full artifacts (from CAS or database).

| Check | Available? | What It Verifies |
|---|---|---|
| All Level 1 + Level 2 checks | Yes | — |
| Artifact hash re-derivation | Yes | Recompute each artifact hash from source data |
| Approval existence and validity | Yes | Authorization record exists and decision is "approved" |
| Execution-to-intent binding | Yes | Execution intent_id matches receipt intent_id |
| Signer registry verification | Yes | Signer was registered before signing |
| Policy version consistency | Partial | Governance hash matches; full policy version check pending |

---

## 5. Audit Output Format

The audit service should produce a structured report for each receipt audited:

```json
{
  "audit_id": "uuid",
  "receipt_id": "uuid",
  "audit_level": 1 | 2 | 3,
  "timestamp": "ISO 8601",
  "checks": {
    "receipt_hash_valid": true | false,
    "signature_valid": true | false | null,
    "signature_signer_registered": true | false | null,
    "ledger_chain_valid": true | false | null,
    "receipt_ledger_match": true | false | null,
    "approval_exists": true | false | null,
    "approval_hash_valid": true | false | null,
    "execution_hash_valid": true | false | null,
    "execution_intent_match": true | false | null,
    "governance_hash_valid": true | false | null,
    "policy_version_consistent": true | false | null
  },
  "overall": "pass" | "fail" | "partial",
  "errors": [],
  "warnings": []
}
```

Where `null` means the check was not applicable at the audit level performed (e.g., `signature_valid` is `null` if the receipt is unsigned, `ledger_chain_valid` is `null` for a Level 1 audit).

---

## 6. Audit Frequency

| Trigger | Scope | Level |
|---|---|---|
| Every receipt generated | Single receipt | Level 1 (inline, real-time) |
| Periodic scheduled audit | Full ledger + all receipts | Level 2 (hourly or daily) |
| On-demand full audit | Full ledger + all receipts + all artifacts | Level 3 (manual or triggered) |
| Anomaly detected by Mantis | Specific receipts flagged | Level 3 (targeted) |

Level 1 audits should be performed inline during receipt generation — the Gateway already does this (it verifies the receipt hash before writing to the ledger). Level 2 and Level 3 audits are periodic or on-demand.

---

## 7. Relationship to Existing Verifier

The reference verifier (`verifier.mjs` / `verifier.py`) in the public protocol repo already implements:

| Function | Audit Check Covered |
|---|---|
| `verifyReceipt()` | Check 3 (receipt hash + signature), partial Check 1 and 2 (structural only) |
| `verifyChain()` | Check 4 (ledger chain) |
| `verifyReceiptAgainstLedger()` | Cross-reference (receipt ↔ ledger) |
| `verifyReceiptBatch()` | Batch wrapper for `verifyReceipt()` |

**What the reference verifier does NOT do:**

- Re-derive artifact hashes from source data (Checks 1, 2, 5 at Level 3)
- Look up signer in the authorized signers registry (Check 3 enhanced)
- Verify policy version consistency (Check 5)
- Produce structured audit reports

These are the gaps that the automated audit service must fill. The reference verifier is the foundation — the audit service extends it with artifact access and policy awareness.

---

## 8. Implementation Notes for Manny

1. **Level 1 is already built.** The reference verifier handles receipt hash verification and Ed25519 signature verification. Wrap it in an audit report format.

2. **Level 2 requires ledger access.** The `verifyChain()` and `verifyReceiptAgainstLedger()` functions exist. Connect them to the PostgreSQL ledger and produce batch reports.

3. **Level 3 requires artifact retrieval.** This is the new work. The audit service needs to fetch full artifacts (from CAS or database), recompute their hashes using the canonical serialization defined in the receipt protocol, and compare to the receipt's stage hashes.

4. **Canonical serialization is the contract.** The audit service must use the exact same field order as `hashIntent()`, `hashExecution()`, `hashGovernance()`, and `hashAuthorization()` in the reference implementation. Any deviation will produce different hashes.

5. **Policy version checking is blocked on the Policy Schema Spec.** Until Andrew delivers `POLICY_SCHEMA_SPEC.md`, Check 5 is limited to governance hash verification (which proves the governance decision wasn't modified, but not which policy version was used).

---

## 9. Summary

The automated audit service verifies five categories: approval integrity, execution integrity, receipt integrity, signature integrity, and ledger integrity. It operates at three levels depending on data access. The reference verifier in the public protocol repo provides the foundation for Levels 1 and 2. Level 3 (full artifact re-derivation) is new work that requires CAS or database access.

The five mandatory checks are:

1. Approval exists and authorization hash is valid
2. Execution hash matches and intent binding is consistent
3. Receipt signature is valid (Ed25519) and signer is registered
4. Ledger chain is unbroken from genesis
5. Governance hash is valid (policy version check pending Policy Schema Spec)

**No receipt protocol changes are needed to support automated audit.** The protocol already produces all the hashes the audit service needs. The audit service is a consumer of the protocol, not an extension of it.
