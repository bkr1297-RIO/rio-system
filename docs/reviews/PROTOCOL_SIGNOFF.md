# Protocol Sign-Off: Phase 1 Foundational Specs

**Date:** 2026-04-04
**Reviewer:** Romney (Protocol / Packaging)
**Specs Reviewed:**
- `spec/IDENTITY_AND_ROLES_SPEC.md` v1.0 (Andrew)
- `spec/POLICY_SCHEMA_SPEC.md` v1.0 (Andrew)
- `spec/STORAGE_ARCHITECTURE_SPEC.md` v1.0 (Andrew)

**Cross-Referenced Against:**
- `docs/reviews/IDENTITY_COMPATIBILITY_REVIEW.md` (Romney, pre-review)
- `docs/reviews/STORAGE_COMPATIBILITY_REVIEW.md` (Romney, pre-review)
- `docs/reviews/AUTOMATED_AUDIT_SPEC.md` (Romney, pre-review)
- Receipt Specification v2.1 (`spec/RECEIPT_SPEC.md`)
- Ledger Specification (`spec/LEDGER_SPEC.md`)
- Constitution (`spec/CONSTITUTION.md`)
- Public protocol repo: `rio-receipt-protocol` (npm v2.2.0, PyPI v2.2.0)

**Verdict:** APPROVED with conditions. All three specs are compatible with the receipt protocol. No breaking changes required. Minor version bump to receipt spec recommended. Details below.

---

## Overall Assessment

Andrew's three specs are well-structured, internally consistent, and architecturally sound. They formalize patterns that were implicit in the existing Gateway code without introducing incompatibilities with the public receipt protocol. The separation of concerns is clean: Identity defines who acts, Policy defines what is permitted, Storage defines where artifacts live. None of them attempt to redefine what a receipt is or how verification works — they build around the existing proof layer.

The receipt protocol remains the stable foundation. These specs extend the platform above and around it without breaking the contract that external developers and verifiers depend on.

---

## Responses to the 8 Open Questions

### Identity Spec — Question 1: Receipt Field Additions

> Do the new `identity_binding` fields (`role_exercised`, `actor_type`, `key_version`) require a receipt protocol version bump? If so, should it be a minor bump (v2.3) or a major bump (v3.0)?

**Answer: Minor bump to v2.3. Not a major bump.**

The three new fields are additive. They do not change the meaning of existing fields, do not alter the hash chain computation, and do not break any existing verifier. A receipt generated under v2.1 remains valid and verifiable. A receipt generated under v2.3 simply carries additional identity metadata.

The public protocol repo's `receipt-schema.json` already defines `identity_binding` as an object with `additionalProperties: true`, which means adding `role_exercised`, `actor_type`, and `key_version` does not violate the existing schema. Verifiers that do not understand these fields will ignore them. Verifiers that do understand them gain additional assurance.

Specifically:
- `role_exercised` is informational metadata. It tells the verifier what role the signer was exercising, but the cryptographic proof (signature + public key) is what actually proves the approval. The role is a governance-layer assertion, not a proof-layer assertion.
- `actor_type` is informational metadata. Same reasoning — it enriches the receipt without changing the proof.
- `key_version` is the most significant addition. It enables verifiers to look up the correct public key after key rotation. However, it does not change the signature algorithm or the hash chain. It is a lookup hint, not a proof element.

**Recommendation:** Bump the receipt spec to v2.3. Add the three fields as OPTIONAL in the schema. Update the public protocol repo's `receipt-schema.json` to include them with `"required": false`. No changes to the hash chain computation. No changes to the verifier — it already works with or without these fields.

**Action for Manny:** When generating receipts in the Gateway, include these three fields. When verifying receipts, do not require them (backward compatibility with v2.1 receipts).

---

### Identity Spec — Question 2: Key Version in Hash Chain

> Should `key_version` be included in the `authorization_hash` computation? Including it would make the hash chain aware of key rotation, but it would also mean that the same approval signed with different key versions would produce different hashes.

**Answer: No. Do not include `key_version` in the `authorization_hash` computation.**

The `authorization_hash` proves that a specific approval was given for a specific intent. It hashes the approval decision, the signer identity, and the signature. The key version is a property of the key used to sign, not a property of the authorization decision itself.

If `key_version` were included in the hash, then two identical approvals signed with different key versions (e.g., before and after key rotation) would produce different `authorization_hash` values. This creates a false distinction — the authorization is the same, only the signing key changed. Worse, it would mean that if a key is rotated between approval and receipt generation, the `authorization_hash` recorded in the receipt would not match a recomputed hash using the new key version.

The correct approach is:
1. The `authorization_hash` includes: `intent_hash`, `decision` (approve/deny), `signer_id`, `signature`, `timestamp`.
2. The `key_version` is stored in `identity_binding` as a lookup hint.
3. The verifier uses `key_version` to find the correct public key in `key_history`, then verifies the signature against that key.
4. The `authorization_hash` remains stable regardless of key rotation.

This preserves the principle that the hash chain records what happened (an authorization was given), not the infrastructure details of how it was signed.

---

### Identity Spec — Question 3: Delegation in Receipts

> How should delegated actions appear in the receipt? The current proposal is to include both `delegator_id` and `delegate_id` in the `identity_binding`, with the `delegator_id` as the authoritative signer. Does this require a new receipt type or can it be handled within the existing `governed_action` type?

**Answer: Handle within the existing `governed_action` type. No new receipt type needed.**

A delegated action is still a governed action — it goes through the same pipeline (intent → governance → authorization → execution → receipt). The only difference is that the authorization comes from a delegation grant rather than a direct approval. The receipt should reflect this by extending `identity_binding`, not by creating a new receipt type.

Proposed `identity_binding` for delegated actions:

```json
{
  "identity_binding": {
    "signer_id": "I-1",
    "principal_id": "I-1",
    "actor_type": "human",
    "role_exercised": "approver",
    "public_key_hex": "...",
    "signature_payload_hash": "...",
    "verification_method": "ed25519",
    "key_version": 1,
    "delegation": {
      "delegation_id": "uuid",
      "delegate_id": "bondi",
      "delegate_actor_type": "ai_agent",
      "scope": ["draft_email", "summarize_receipts"],
      "risk_ceiling": "LOW",
      "delegated_at": "ISO 8601",
      "expires_at": "ISO 8601"
    }
  }
}
```

The `signer_id` remains the delegator (the human who granted the delegation), because they are the ultimate authority. The `delegation` sub-object records the delegation context. This is additive — receipts without delegation simply omit the `delegation` field.

The `authorization_hash` for a delegated action should include the `delegation_id` so the hash chain proves which delegation grant authorized the action. This is a minor addition to the hash computation, not a structural change.

**Why not a new receipt type:** Receipt types (proof-layer 3-hash vs. governed 5-hash) distinguish fundamentally different proof structures. Delegation does not change the proof structure — it still has all 5 hashes. It only changes who authorized the action. Creating a new type would fragment the verification logic unnecessarily.

---

### Identity Spec — Question 4: Ledger Backward Compatibility

> Is it acceptable to add `principal_id` and `role_exercised` columns to the `ledger_entries` table, or should these be stored in a separate identity-enriched view?

**Answer: Add the columns directly to `ledger_entries`. Do not use a separate view.**

The ledger is the single source of truth for what happened. If identity information is in a separate view, then the view becomes a dependency for verification — and views can be modified, dropped, or become inconsistent with the underlying table. The ledger's append-only guarantee should cover all proof-relevant data, including identity.

Andrew's Storage Architecture Spec already includes `principal_id` and `role_exercised` in the `ledger_entries` schema (Section 4.1). This is the correct approach. The columns should be:

- `principal_id VARCHAR(255) NOT NULL` — the principal who triggered this entry
- `role_exercised VARCHAR(50)` — the role the principal exercised (nullable for backward compatibility with old entries)

For existing entries that predate the migration, `principal_id` should be backfilled from `agent_id` where possible. `role_exercised` can be left NULL for old entries — this is honest (we don't know what role was exercised under the old model) and does not break the chain.

The `ledger_hash` computation for new entries should include `principal_id` and `role_exercised`. Old entries retain their original `ledger_hash` (they were computed without these fields). This means the hash computation is version-aware: entries before the migration use the old formula, entries after use the new formula. The verifier must know the cutover sequence number.

**Recommendation for Manny:** Add a `schema_version` field to ledger entries (integer, starting at 1 for old entries, 2 for new entries). The verifier uses `schema_version` to determine which hash computation formula to apply. This is cleaner than a hardcoded cutover sequence number.

---

### Storage Spec — Question 5: Receipt Self-Containment

> The current Receipt Specification v2.1 defines receipts as self-contained proof artifacts. With CAS, the receipt content is stored separately from the ledger entry. Does this change the receipt's self-containment property?

**Answer: No. The receipt remains self-contained. CAS is a storage location, not a structural change.**

A receipt is self-contained because it includes all the information needed to verify it: the 5-hash chain, the identity binding (signer ID, public key, signature), and the verification method. This self-containment is a property of the receipt's content, not its storage location.

Whether the receipt lives inline in a PostgreSQL JSONB column, in an S3 object, in a flat file on disk, or printed on paper, it is still self-contained. The verifier needs only the receipt content and the signer's public key to verify it. The verifier does not need to know where the receipt was stored.

What CAS changes is the retrieval path: instead of reading the receipt from a JSONB column, the verifier fetches it from CAS by `receipt_hash`. But once fetched, the verification is identical.

The one nuance is that the ledger entry now stores `receipt_hash` (a reference) instead of the full receipt. This means the ledger alone is not sufficient to verify a receipt — you also need CAS to retrieve the receipt content. But this is by design: the ledger proves the receipt exists (via `receipt_hash`), and CAS provides the receipt content for full verification. The receipt itself remains self-contained; the storage architecture separates proof-of-existence (ledger) from proof-content (CAS).

**No changes to the receipt spec needed for this.**

---

### Storage Spec — Question 6: Hash Algorithm Future-Proofing

> Should the CAS addressing scheme include an algorithm prefix (e.g., `sha256:a1b2c3...`) to allow future migration to SHA-3 or BLAKE3 without breaking existing references?

**Answer: Yes. Add an algorithm prefix to CAS keys. Do not add it to the receipt hash chain.**

This is a storage-layer concern, not a protocol-layer concern. The receipt protocol defines `receipt_hash` as a SHA-256 hex string. That is the protocol contract. How the storage layer addresses artifacts internally is an implementation detail.

Adding `sha256:` as a prefix to CAS keys is good practice because:
1. It makes the addressing scheme self-describing.
2. It allows future migration to SHA-3 or BLAKE3 without ambiguity.
3. It follows the convention used by Docker image digests, IPFS CIDs, and other content-addressable systems.

The CAS key format should be:

```
{artifact_type}/{algorithm}:{hash}
```

Example:
```
intent/sha256:a1b2c3d4e5f6...64chars
receipt/sha256:1a2b3c4d5e6f...64chars
```

However, the receipt protocol's hash fields (`intent_hash`, `receipt_hash`, etc.) should remain bare hex strings without a prefix. The protocol is algorithm-specific (SHA-256) and a future algorithm change would be a major version bump (v3.0) to the receipt protocol, not a CAS configuration change.

**Recommendation for Manny:** Implement the prefix in CAS keys. Strip the prefix when comparing CAS hashes to receipt hashes. The mapping is: `receipt.intent_hash` → CAS key `intent/sha256:{receipt.intent_hash}`.

---

### Storage Spec — Question 7: Ledger Export Format

> With the new schema (which includes `principal_id`, `role_exercised`, `policy_hash`), should the export format be updated?

**Answer: Yes. Create export format v2. Keep v1 exports available for backward compatibility.**

The current ledger export format (JSON files to Google Drive) includes `agent_id`, `action`, `status`, `intent_hash`, `receipt_hash`, `ledger_hash`, `prev_hash`, and `timestamp`. The new fields (`principal_id`, `role_exercised`, `policy_hash`, `governance_hash`, `authorization_hash`, `execution_hash`) are significant additions that improve the export's usefulness for auditing.

The export format should be versioned:

```json
{
  "export_version": "2.0",
  "export_timestamp": "ISO 8601",
  "schema_version": 2,
  "entries": [...]
}
```

Entries from before the migration (schema_version 1) should be exported with their original fields plus `principal_id` (backfilled from `agent_id`) and NULL for `role_exercised`. This is honest and does not fabricate data.

The v1 export format should remain available as a compatibility option for any downstream consumers that depend on the old format.

**This is not a protocol-layer concern.** The export format is a platform feature, not part of the receipt protocol. The public protocol repo does not need to change for this.

---

### Storage Spec — Question 8: CAS Garbage Collection

> If an intent is submitted but never approved (abandoned), should the intent artifact in CAS be subject to garbage collection after a defined period? Or should all artifacts be retained permanently regardless of pipeline completion?

**Answer: Garbage collection is acceptable for abandoned intents, with constraints.**

An intent that is submitted but never approved, denied, or executed is an incomplete pipeline run. It has a ledger entry (status: `submitted` or `evaluated`) but no receipt. Retaining the full intent artifact in CAS permanently serves no proof purpose — there is nothing to prove about an action that never happened.

However, garbage collection must respect the following constraints:

1. **The ledger entry is never deleted.** The ledger records that the intent was submitted. This is permanent.
2. **The `intent_hash` in the ledger is never deleted.** This proves the intent existed and what its content hash was.
3. **The CAS artifact can be deleted after a retention period.** The hash in the ledger is sufficient proof of existence. If the full content is needed later, the hash proves whether any recovered content is authentic.
4. **Minimum retention: 90 days.** This gives enough time for audits, investigations, and late approvals.
5. **A `GC_ARTIFACT_REMOVED` ledger entry should be created** when an artifact is garbage collected, recording the artifact hash, type, and reason. This maintains the audit trail.
6. **Artifacts with any downstream activity are never garbage collected.** If an intent was evaluated (governance_hash exists), approved, denied, or executed, all related artifacts are retained for the full 7-year compliance period.

The garbage collection rule is: **only `submitted` intents with no governance evaluation and no approval/denial after 90 days are eligible for CAS artifact removal.**

**This is a platform-layer decision, not a protocol-layer decision.** The receipt protocol does not define CAS retention policies. The protocol only requires that receipts and their referenced hashes are verifiable. Abandoned intents have no receipts, so the protocol has no opinion on their retention.

---

## Receipt Protocol Version Bump Plan

Based on the above answers, the receipt protocol should be bumped from v2.2 to v2.3 with the following changes:

| Change | Type | Breaking? |
|--------|------|-----------|
| Add `identity_binding.role_exercised` (optional) | Additive field | No |
| Add `identity_binding.actor_type` (optional) | Additive field | No |
| Add `identity_binding.key_version` (optional) | Additive field | No |
| Add `identity_binding.delegation` (optional object) | Additive field | No |
| Add `delegation_id` to `authorization_hash` inputs (when delegation exists) | Hash computation change (conditional) | No — only applies to new delegated receipts |

All changes are backward-compatible. A v2.1 verifier will still verify v2.3 receipts (it ignores unknown fields). A v2.3 verifier will still verify v2.1 receipts (the new fields are optional).

**I will implement this version bump in the public protocol repo (`rio-receipt-protocol`) as a separate PR after this sign-off is accepted.**

---

## Compatibility Confirmation

| Spec | Compatible with Receipt Protocol? | Compatible with Ledger Spec? | Compatible with Public Verifier? | Notes |
|------|----------------------------------|-----------------------------|---------------------------------|-------|
| Identity and Roles | Yes | Yes (with column additions) | Yes (new fields are optional) | `key_version` enables post-rotation verification |
| Policy Schema | Yes | Yes (`policy_hash` already in ledger) | Yes (governance_hash is already verified) | Policy evaluation algorithm produces `governance_hash` that matches existing receipt field |
| Storage Architecture | Yes | Yes (CAS is a storage layer, not a protocol change) | Yes (verifier fetches from CAS instead of JSONB) | Receipt self-containment preserved |

---

## Items for Other Agents

**For Manny (Builder):**
1. When implementing ledger schema changes, add a `schema_version` integer field to `ledger_entries`. Use version 1 for existing entries, version 2 for new entries. The verifier uses this to select the correct hash computation formula.
2. When implementing CAS, use the prefixed key format: `{artifact_type}/sha256:{hash}`. Strip the prefix when comparing to receipt hash fields.
3. When generating receipts, include `role_exercised`, `actor_type`, and `key_version` in `identity_binding`. For delegated actions, include the `delegation` sub-object.
4. Do not include `key_version` in the `authorization_hash` computation.

**For Andrew (Solutions Architect):**
1. Update the Identity Spec Section 11 (Compatibility with Receipt Specification) to note that the version bump is v2.3 (minor), not v3.0.
2. Update the Storage Spec Section 3.2 (CAS Addressing) to use the prefixed key format: `{artifact_type}/sha256:{hash}`.
3. Consider adding a `schema_version` field to the ledger schema in Section 4.2.

**For Romney (self — next steps):**
1. Implement receipt spec v2.3 in the public protocol repo.
2. Update `receipt-schema.json` with the three new optional fields.
3. Update the reference implementation to support the new fields.
4. Publish as npm v2.3.0 and PyPI v2.3.0.

---

## Sign-Off

I approve all three specs for implementation. The receipt protocol is compatible. No breaking changes are required. The minor version bump (v2.3) is additive and backward-compatible.

Manny is cleared to begin enforcement implementation using these specs as the contract.

**Signed:** Romney (Protocol / Packaging)
**Date:** 2026-04-04
