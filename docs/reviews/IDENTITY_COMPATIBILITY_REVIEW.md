# Identity Compatibility Review — Receipt Protocol

**Author:** Romney (Protocol / Packaging)
**Date:** 2026-04-04
**Status:** Pre-review — awaiting Andrew's IDENTITY_AND_ROLES_SPEC.md
**Scope:** Does the receipt protocol need to change to support role-based identities or DID-style identifiers?

---

## 1. Purpose

This review examines how identity is currently represented in the receipt protocol and identifies what would need to change — if anything — when the Identity and Roles Spec introduces a unified identity model for humans, agents, services, and approvers. The goal is to ensure that identity decisions do not break verification.

---

## 2. Current Identity Representation

Identity appears in four places across the receipt and ledger:

### 2.1 Receipt Top-Level Fields

| Field | Type | Current Usage | Example |
|---|---|---|---|
| `agent_id` | String | Opaque identifier of the AI agent or system that initiated the action | `"bondi"`, `"agent-47"` |
| `authorized_by` | String or null | Opaque identifier of who authorized the action | `"HUMAN:jane@example.com"`, `"POLICY:auto_approve_low_risk"` |

These fields are defined in the JSON Schema (`receipt-schema.json`) as plain strings with no format constraint. The protocol does not interpret them — it hashes them as part of the intent and authorization records, then stores the resulting hash in the chain.

### 2.2 Identity Binding (Ed25519 Signer Proof)

| Field | Type | Current Usage |
|---|---|---|
| `signer_id` | String or null | Opaque identifier of the signing authority |
| `public_key_hex` | String or null | 64-char hex Ed25519 public key |
| `signature_hex` | String or null | Ed25519 signature of the receipt_hash |
| `signature_payload_hash` | String or null | Must equal `hash_chain.receipt_hash` |
| `verification_method` | String or null | Currently `"ed25519-nacl"` |
| `ed25519_signed` | Boolean | Whether the receipt was signed |

The `signer_id` is an opaque string. The protocol does not define its format, resolve it against a registry, or embed role information. The verifier checks the signature against `public_key_hex` — it does not look up `signer_id` in any external system.

### 2.3 Ledger Entry Fields

| Field | Current Usage |
|---|---|
| `agent_id` | Copied from the receipt — opaque string |
| `authorization_hash` | SHA-256 of the authorization record (which contains `authorized_by`) |

### 2.4 Authorized Signers Registry (Gateway-side, not in protocol)

| Field | Type | Notes |
|---|---|---|
| `signer_id` | String | Matches `identity_binding.signer_id` in receipts |
| `public_key_hex` | String | Ed25519 public key |
| `display_name` | String | Human-readable name |
| `role` | String | Default: `"approver"` |

This registry lives in the Gateway's PostgreSQL database, not in the receipt protocol. The protocol only references `signer_id` and `public_key_hex` — it does not know about `role` or `display_name`.

---

## 3. Analysis: What Happens Under Different Identity Models

### 3.1 Role-Based Identifiers

If the Identity Spec introduces role-based identifiers (e.g., `agent_id` becomes `"agent:bondi:cognition"` or `authorized_by` becomes `"human:jane@example.com:approver"`), the receipt protocol is **unaffected**. Both fields are opaque strings. The protocol hashes them — it does not parse them. The verifier recomputes hashes from the same canonical JSON and compares. As long as the same string goes in at generation time and verification time, the hash matches.

**Verdict: No protocol change needed.**

### 3.2 DID-Style Identifiers

If the Identity Spec adopts DID-style identifiers (e.g., `"did:rio:human:jane"` or `"did:rio:agent:bondi"`), the same analysis applies. The receipt protocol treats `agent_id`, `authorized_by`, and `signer_id` as opaque strings. A DID is just a longer string.

However, there is one consideration: if the Identity Spec requires that `signer_id` in `identity_binding` must be a DID, and the verifier should resolve that DID to a public key (instead of trusting the embedded `public_key_hex`), then the verification path changes. Currently the verifier uses the `public_key_hex` embedded in the receipt. If DID resolution is required, the verifier would need to resolve `signer_id` → public key externally, which breaks the "independently verifiable without system access" invariant (Constitution, Invariant 6).

**Verdict: No protocol change needed for DID-style strings. But if DID resolution replaces embedded public keys, this breaks independent verification. The protocol must continue to embed the public key at signing time.**

### 3.3 Roles Embedded in Receipts

If the Identity Spec requires that the signer's role be embedded in the receipt (e.g., adding a `signer_role` field to `identity_binding`), this would require a schema change. The current `identity_binding` object has `additionalProperties: false`, so adding a field requires a spec update.

**Verdict: Minor schema extension needed. Add optional `signer_role` field to `identity_binding`. This is a non-breaking change (minor version bump).**

### 3.4 Roles Resolved Externally

If roles are resolved externally (the receipt contains `signer_id`, and the consuming system looks up the role from a registry), the protocol is **unaffected**. This is how it works today — the Gateway's `authorized_signers` table has a `role` field, but the receipt doesn't carry it.

**Verdict: No protocol change needed. This is the current design.**

---

## 4. Compatibility Matrix

| Identity Model Decision | Protocol Change? | Schema Change? | Verifier Change? | Breaks Independent Verification? |
|---|---|---|---|---|
| Role-based identifier strings | No | No | No | No |
| DID-style identifier strings | No | No | No | No |
| DID resolution replaces embedded public key | **Yes — blocked** | Yes | Yes | **Yes — violates Invariant 6** |
| Role embedded in receipt | No | Minor (add optional field) | No | No |
| Role resolved externally | No | No | No | No |
| Multiple signers per receipt | **Yes** | Yes | Yes | No (if all keys embedded) |

---

## 5. Recommendations for Andrew's Identity Spec

1. **Keep `signer_id` as an opaque string.** The protocol should not parse or validate its format. Whether it's a UUID, a DID, an email, or a role-prefixed string is an application-level decision. The protocol hashes it.

2. **Always embed `public_key_hex` at signing time.** Do not rely on external resolution for verification. The receipt must be self-contained for independent verification (Constitution, Invariant 6). The signer registry is a Gateway concern, not a protocol concern.

3. **If roles need to appear in receipts, add an optional `signer_role` field.** This is a non-breaking extension. I will update the schema when the Identity Spec is finalized.

4. **If multi-signer receipts are needed** (e.g., quorum approvals where multiple humans sign), the `identity_binding` field would need to become an array. This is a breaking change (major version bump). Flag this early if it's on the table.

5. **The `authorized_by` field in the receipt already supports role-prefixed strings** (e.g., `"HUMAN:jane@example.com"`, `"POLICY:auto_approve_low_risk"`). This convention can be formalized in the Identity Spec without any protocol change.

---

## 6. Open Question

**Q: Will quorum approvals (Meta-Governance requiring 2-of-3 or 3-of-3) produce multi-signed receipts?**

If yes, the current single-signer `identity_binding` model needs to be extended to support multiple signatures. This is the only identity-related change that would require a major protocol version bump.

If no (i.e., quorum is enforced at the Gateway level and the receipt records only the final composite approval), then the current model is sufficient.

This question should be answered in the Identity Spec before I finalize the protocol review.

---

## 7. Summary

The receipt protocol is identity-model-agnostic by design. All identity fields are opaque strings that get hashed. The only constraint is that the public key must be embedded in the receipt at signing time — external resolution breaks independent verification. Role embedding is a minor optional extension. Multi-signer support is the only scenario that requires a breaking change, and it should be decided early.

**Protocol status: Compatible with all likely identity models. No changes needed until the Identity Spec is finalized.**
