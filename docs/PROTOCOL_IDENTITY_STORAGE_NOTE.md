# Protocol Identity & Storage Compatibility Note

**Author:** Romney (Protocol / Packaging)
**Date:** 2026-04-04
**Protocol Version:** v2.3.0
**Status:** CONFIRMED COMPATIBLE — No adjustments required

---

## Purpose

This document confirms whether the receipt protocol (v2.3) is compatible with the Identity and Roles model and the CAS/Ledger storage architecture. Both were verified through code-level testing against the reference implementation.

---

## 1. Identity Representation — COMPATIBLE

The identity model defines six fields for principals:

| Identity Model Field | Receipt Protocol Field | Location | Status |
|---|---|---|---|
| `principal_id` | `signer_id` | `identity_binding.signer_id` | Supported since v2.0 |
| `actor_type` | `actor_type` | `identity_binding.actor_type` | Added in v2.3 |
| `role` | `role_exercised` | `identity_binding.role_exercised` | Added in v2.3 |
| `public_key` | `public_key_hex` | `identity_binding.public_key_hex` | Supported since v2.0 |
| `key_version` | `key_version` | `identity_binding.key_version` | Added in v2.3 |
| `delegation` | `delegation` | `identity_binding.delegation` | Added in v2.3 |

All six identity fields are present in the receipt protocol. The mapping is direct and complete.

### Verification Details

**Signer identity:** The `signer_id` field accepts any string identifier. It is format-agnostic — it works with UUIDs, DID URIs (`did:rio:...`), email-based identifiers, or any principal_id format the identity system produces. No format constraint exists in the schema or implementation.

**Role exercised:** The `role_exercised` field records which role the signer was acting under at the time of signing. It is a free-form string, not an enum. This means the receipt protocol does not constrain what roles exist — it records whatever role the identity system provides. Roles are resolved externally (by the identity/RBAC system), not embedded in the receipt format.

**Key version:** The `key_version` field is an integer that tracks which version of the signer's key was used. This supports key rotation: a verifier can look up the correct public key for the version indicated. The key version is a lookup hint — it is intentionally excluded from the hash chain computation so that key rotation does not invalidate existing receipt hashes.

**Delegation chain:** The `delegation` sub-object records the full delegation context when an action is performed on behalf of another principal. It includes:
- `delegation_id` — unique grant identifier
- `delegate_id` — who performed the action
- `delegate_actor_type` — human, ai_agent, service, system, or external
- `scope` — array of authorized action types
- `risk_ceiling` — maximum risk level the delegate can handle
- `delegated_at` / `expires_at` — temporal bounds

The `signer_id` remains the delegator (the authority), not the delegate. This preserves the cryptographic chain: the receipt is signed by the key of the principal who holds authority, and the delegation object records who actually acted.

### Sufficiency for Independent Verification

An independent verifier holding only a receipt can determine:

1. **Who authorized it** — `signer_id` + `public_key_hex`
2. **What role they claimed** — `role_exercised`
3. **Whether it was delegated** — `delegation` object (present or null)
4. **Who actually acted** — `delegation.delegate_id` + `delegation.delegate_actor_type`
5. **Whether the delegation was in scope** — `delegation.scope` + `delegation.risk_ceiling`
6. **Whether the signature is valid** — Ed25519 verification of `signature_hex` against `public_key_hex`

The verifier does not need access to the identity system to verify the cryptographic signature. It does need access to a key registry to confirm that `public_key_hex` at `key_version` belongs to `signer_id` — but this is a trust anchor lookup, not a protocol limitation.

**Conclusion:** The five fields (`signer_id`, `actor_type`, `role_exercised`, `key_version`, `delegation`) are sufficient for independent verification. No additional receipt fields are needed.

---

## 2. CAS vs Ledger Boundary — COMPATIBLE

The storage architecture defines three layers:

| Layer | Stores | Receipt Protocol Behavior |
|---|---|---|
| Content-Addressable Storage (CAS) | Full artifacts (intent payloads, execution results, policy documents) | Not referenced directly — CAS is external to the protocol |
| Receipts | Hashes of artifacts | `intent_hash`, `execution_hash`, `governance_hash`, `authorization_hash` — all SHA-256 hashes, never full content |
| Ledger | Receipt references + chain links | `ledger_hash` (hash of the entry), `prev_hash` (chain link) — never full receipts |

### Verified Behaviors

**Receipts store hashes, not artifacts.** Tested: a 63-byte artifact (email payload) produces a 64-character hex hash stored in `intent_hash`. The full artifact is never present in the receipt. The receipt is 100% hash-based — it contains zero raw content.

**Ledger stores references, not receipts.** Tested: appending a signed receipt to the ledger produces an entry with `ledger_hash` and `prev_hash`. The full receipt object is not stored in the ledger entry. The ledger is a chain of hashes, not a chain of receipts.

**Receipt hashes can reference CAS artifacts.** The `intent_hash` in a receipt is `SHA-256(artifact)`. If the same artifact is stored in CAS under its content hash, then `intent_hash` is the CAS key. A verifier can:
1. Retrieve the artifact from CAS using `intent_hash` as the key
2. Recompute `SHA-256(artifact)` and confirm it matches `intent_hash`
3. Verify the receipt signature
4. Verify the ledger chain

This means the artifact → receipt → ledger chain is fully reconstructable and verifiable without any protocol changes.

### Hash Algorithm Prefix

The CAS architecture may use prefixed hashes (e.g., `sha256:671d2a49...`) for algorithm agility. The receipt protocol currently stores bare hex hashes (e.g., `671d2a49...`). These are compatible — the CAS layer strips or adds the prefix at its boundary. The receipt protocol does not need to change its hash format. If algorithm agility is needed in the future (e.g., SHA-3), the receipt schema can add an optional `hash_algorithm` field, but this is not required for SHA-256.

### Canonical Serialization

The one critical contract between the receipt protocol and CAS is canonical serialization. When a receipt hash references an artifact, the hash must be computed over the same byte sequence that CAS stores. The receipt protocol already defines canonical JSON serialization (sorted keys, no whitespace, UTF-8). As long as CAS stores artifacts in the same canonical form, hashes will match. This is a deployment convention, not a protocol change.

---

## 3. Artifact → Receipt → Ledger Verification Chain

The full chain was tested end-to-end:

| Step | Operation | Result |
|---|---|---|
| 1 | Compute `SHA-256(artifact)` | Produces artifact hash |
| 2 | Compare artifact hash to `receipt.hash_chain.intent_hash` | **MATCHES** |
| 3 | Verify receipt Ed25519 signature | **VALID** |
| 4 | Confirm ledger entry references receipt | **YES** — `ledger_hash` is non-null |
| 5 | Verify ledger hash chain integrity | **VALID** — `prev_hash` links are correct |

An independent verifier can reconstruct and verify the entire chain given:
- The artifact (from CAS)
- The receipt (from receipt storage or CAS)
- The ledger (from ledger storage)
- The signer's public key (from key registry)

No additional data or system access is required.

---

## Summary

| Area | Compatible? | Changes Required |
|---|---|---|
| Signer identity (`signer_id`) | Yes | None |
| Role exercised (`role_exercised`) | Yes | None — added in v2.3 |
| Actor type (`actor_type`) | Yes | None — added in v2.3 |
| Key version (`key_version`) | Yes | None — added in v2.3 |
| Delegation chain (`delegation`) | Yes | None — added in v2.3 |
| Full artifacts in CAS | Yes | None — receipts already hash-only |
| Receipts store hashes | Yes | Already the design |
| Ledger stores references | Yes | Already the design |
| CAS key = receipt hash | Yes | Natural compatibility |
| Verifier can reconstruct chain | Yes | Tested end-to-end |

**The receipt protocol v2.3 is fully compatible with both the Identity and Roles model and the CAS/Ledger storage architecture. No protocol adjustments are required.**
