# Storage Compatibility Review — Receipt Protocol

**Author:** Romney (Protocol / Packaging)
**Date:** 2026-04-04
**Status:** Pre-review — awaiting Andrew's STORAGE_ARCHITECTURE_SPEC.md
**Scope:** Does the receipt/ledger model support CAS integration, and can the verifier reconstruct the full artifact → receipt → ledger chain?

---

## 1. Purpose

This review examines the boundary between Content-Addressable Storage (CAS) and the append-only ledger, as it relates to the receipt protocol. The goal is to verify three things:

1. Receipts hash artifacts — they do not store full artifacts.
2. The ledger stores receipt references — it does not store full receipts inline.
3. The verifier can reconstruct and verify the complete artifact → receipt → ledger chain.

---

## 2. Current Storage Model

The receipt protocol and the Gateway implementation use a three-tier storage model today. Understanding this model is the baseline for evaluating CAS compatibility.

### Tier 1: Full Artifacts (Gateway PostgreSQL)

Full artifacts are stored in dedicated tables in the Gateway database:

| Table | Contains | Example Fields |
|---|---|---|
| `intents` | Full intent objects | `intent_id`, `action`, `agent_id`, `parameters`, `status`, `risk_level` |
| `approvals` | Full approval records | `approval_id`, `intent_id`, `decision`, `authorized_by`, `conditions` |
| `execution_results` | Full execution records | `execution_id`, `intent_id`, `result`, `connector`, `status` |
| `receipts` | Full receipt JSON | `receipt_id`, `intent_id`, `hash_chain` (JSONB), `created_at` |

These are mutable operational tables (except `receipts`, which is write-once).

### Tier 2: Hash References (Receipt Hash Chain)

The receipt contains only hashes of the artifacts, not the artifacts themselves:

| Receipt Field | What It Hashes | Full Artifact Location |
|---|---|---|
| `intent_hash` | Canonical JSON of intent (intent_id, action, agent_id, parameters, timestamp) | `intents` table |
| `governance_hash` | Canonical JSON of governance decision (intent_id, status, risk_level, requires_approval, checks) | Computed at runtime, not stored separately |
| `authorization_hash` | Canonical JSON of authorization (intent_id, decision, authorized_by, timestamp, conditions) | `approvals` table |
| `execution_hash` | Canonical JSON of execution (intent_id, action, result, connector, timestamp) | `execution_results` table |
| `receipt_hash` | Computed from receipt_id + all present stage hashes + timestamp | Self-referential |

### Tier 3: Ledger References (Hash-Chained Entries)

The ledger stores references to receipts, not full receipts:

| Ledger Field | What It Contains |
|---|---|
| `receipt_hash` | Copy of the receipt's `receipt_hash` — a reference, not the full receipt |
| `intent_hash` | Copy of the receipt's `intent_hash` |
| `authorization_hash` | Copy of the receipt's `authorization_hash` |
| `execution_hash` | Not currently in ledger entries (see Finding 1 below) |

---

## 3. CAS Compatibility Analysis

Content-Addressable Storage stores objects by their hash. You retrieve an object by providing its hash. This model is naturally compatible with the receipt protocol because the receipt already stores hashes of every artifact.

### 3.1 Receipts Hash Artifacts — Confirmed

The receipt protocol stores SHA-256 hashes of canonical JSON representations of each artifact. It never stores the full artifact inside the receipt. This is by design and is enforced by the `hashIntent()`, `hashExecution()`, `hashGovernance()`, and `hashAuthorization()` functions in the reference implementation.

**If CAS is adopted:** Each full artifact (intent, governance decision, authorization, execution result) would be stored in CAS by its hash. The receipt already contains the hash needed to retrieve each artifact from CAS. No protocol change is needed.

### 3.2 Ledger Stores Receipt References — Confirmed with Caveat

The ledger entry schema stores `receipt_hash`, `intent_hash`, and `authorization_hash` as references. It does not store the full receipt JSON inline. The full receipt is stored in a separate `receipts` table.

**Caveat:** The current `receipts` table stores the complete receipt JSON in PostgreSQL. If CAS is adopted, the full receipt could be stored in CAS (keyed by `receipt_hash`), and the `receipts` table could be replaced by a CAS lookup. The ledger entry's `receipt_hash` field would serve as the CAS key.

### 3.3 Verifier Can Reconstruct the Chain — Confirmed with Gaps

The current verifier can perform three types of verification:

| Verification Type | What It Checks | Requires Access To |
|---|---|---|
| Receipt verification | Recomputes `receipt_hash` from stage hashes | Only the receipt JSON |
| Ledger chain verification | Recomputes each `ledger_hash` and checks `prev_hash` linkage | Only the ledger entries |
| Cross-verification | Checks that receipt hashes match ledger entry hashes | Receipt JSON + ledger entry |

**The full artifact → receipt → ledger chain can be verified if:**

1. The verifier has the full artifact (from CAS or any source)
2. The verifier recomputes the artifact's hash using the same canonical serialization
3. The verifier compares the recomputed hash to the hash stored in the receipt
4. The verifier verifies the receipt's `receipt_hash` from its stage hashes
5. The verifier verifies the ledger entry's `ledger_hash` and `prev_hash` chain
6. The verifier cross-checks `receipt_hash` between receipt and ledger entry

Steps 1-3 are **not currently implemented** in the reference verifier. The verifier trusts the hashes in the receipt — it does not re-derive them from source artifacts. This is by design for the open protocol (the verifier may not have access to the original artifacts). But for a full audit service with CAS access, this gap should be closed.

---

## 4. Findings

### Finding 1: Ledger Entry Missing `execution_hash`

The ledger entry schema in LEDGER_SPEC.md includes `intent_hash`, `authorization_hash`, and `receipt_hash`, but does **not** include `execution_hash`. The reference implementation's ledger canonical JSON confirms this — `execution_hash` is not part of the ledger entry.

This means the ledger cannot independently prove what execution result was recorded without retrieving the full receipt. If CAS is adopted and the full receipt is stored in CAS (not in a local `receipts` table), the ledger entry alone cannot cross-reference the execution result.

**Recommendation:** Add `execution_hash` to the ledger entry schema. This is a non-breaking change to the ledger (additive field). It completes the set: the ledger would then carry all four stage hashes (intent, authorization, execution, receipt), enabling full cross-referencing without retrieving the receipt from CAS.

**Impact on protocol:** The reference ledger implementation (`ledger.mjs`, `ledger.py`) would need to include `execution_hash` in the canonical JSON for `ledger_hash` computation. This is a ledger format change, not a receipt format change. Existing ledger entries without `execution_hash` would need a migration path or version flag.

### Finding 2: Governance Hash Not in Ledger Entries

Similarly, `governance_hash` is not in the ledger entry schema. For governed receipts, the governance decision hash exists in the receipt but not in the ledger entry. The same recommendation applies: add it for completeness.

However, this is lower priority than `execution_hash` because governance is optional (proof-layer receipts don't have it), and the governance decision is an intermediate artifact, not a final outcome.

### Finding 3: No CAS Reference Field in Receipt or Ledger

Neither the receipt schema nor the ledger entry schema has a field for CAS artifact references (e.g., a `cas_uri` or `artifact_refs` object). The hashes themselves serve as implicit CAS keys, but there is no explicit pointer to a CAS location.

**Recommendation:** Do not add CAS-specific fields to the receipt protocol. The receipt is a proof document — it should be storage-agnostic. The hash is the reference. How and where the artifact is stored (CAS, S3, PostgreSQL, IPFS) is an infrastructure decision, not a protocol decision. The Storage Architecture Spec should define the CAS retrieval interface; the receipt protocol should not encode it.

### Finding 4: Canonical Serialization is the Critical Contract

The entire CAS compatibility model depends on deterministic canonical serialization. If the same artifact is serialized differently by two systems, they will produce different hashes, and CAS lookups will fail.

The receipt protocol defines canonical serialization for each artifact type:

| Artifact | Canonical Fields (in order) |
|---|---|
| Intent | `intent_id`, `action`, `agent_id`, `parameters`, `timestamp` |
| Execution | `intent_id`, `action`, `result`, `connector`, `timestamp` |
| Governance | `intent_id`, `status`, `risk_level`, `requires_approval`, `checks` |
| Authorization | `intent_id`, `decision`, `authorized_by`, `timestamp`, `conditions` |

**This canonical field order is the contract.** Any CAS implementation must use the same serialization to compute artifact hashes. The Storage Architecture Spec should reference this contract explicitly.

---

## 5. Verification Chain: Full Path

With CAS, the complete verification path from artifact to ledger would be:

```
Step 1: Retrieve artifact from CAS by hash
         ↓
Step 2: Recompute hash using canonical serialization
         ↓
Step 3: Compare recomputed hash to receipt's stage hash
         ↓
Step 4: Verify receipt_hash from all stage hashes
         ↓
Step 5: Verify Ed25519 signature (if present)
         ↓
Step 6: Retrieve ledger entry by receipt_hash
         ↓
Step 7: Cross-check receipt_hash, intent_hash, authorization_hash between receipt and ledger
         ↓
Step 8: Verify ledger_hash from entry fields
         ↓
Step 9: Verify prev_hash chain from genesis
```

Steps 1-3 are new (artifact-level verification). Steps 4-9 are already implemented in the reference verifier. The audit service spec (separate document) defines what checks are mandatory.

---

## 6. Compatibility Matrix

| Storage Decision | Protocol Change? | Ledger Change? | Verifier Change? |
|---|---|---|---|
| Store artifacts in CAS by hash | No | No | Optional (add artifact re-derivation) |
| Store receipts in CAS by receipt_hash | No | No | No (verifier already works from receipt JSON) |
| Add execution_hash to ledger entries | No | **Yes** (additive) | **Yes** (update canonical JSON) |
| Add governance_hash to ledger entries | No | **Yes** (additive) | **Yes** (update canonical JSON) |
| Add CAS URI fields to receipts | **No — not recommended** | No | No |
| Replace receipts table with CAS lookup | No | No | No (verifier is storage-agnostic) |

---

## 7. Recommendations for Andrew's Storage Spec

1. **Use receipt hashes as CAS keys.** The receipt protocol already produces SHA-256 hashes for every artifact. These are natural CAS addresses. Do not introduce a separate CAS key scheme.

2. **Reference the canonical serialization contract.** The Storage Spec must state that CAS implementations use the same canonical field order defined in the receipt protocol for hash computation. If serialization diverges, hashes diverge, and the chain breaks.

3. **Add `execution_hash` to the ledger entry schema.** This completes the cross-reference set and enables the ledger to independently point to all four pipeline artifacts without retrieving the full receipt.

4. **Do not add CAS-specific fields to the receipt schema.** The receipt is a proof document. It should not encode storage infrastructure details. The hash is the reference. The Storage Spec defines how to resolve hashes to artifacts.

5. **Define a migration path for existing ledger entries.** If `execution_hash` is added to the ledger schema, existing entries (which don't have it) need either a backfill or a version flag so the verifier knows which canonical JSON format to use.

---

## 8. Summary

The receipt protocol is storage-model-agnostic by design. Receipts store hashes, not artifacts. The ledger stores receipt references, not full receipts. CAS integration is naturally compatible because the protocol already produces the hashes that CAS uses as keys.

Two ledger-level changes are recommended (adding `execution_hash` and optionally `governance_hash` to ledger entries), but neither requires a receipt protocol change. The critical contract is canonical serialization — the Storage Spec must reference it.

**Protocol status: Compatible with CAS. No receipt schema changes needed. Ledger schema should be extended for completeness.**
