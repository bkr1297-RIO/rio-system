> Derived from: /specs/canonical/RIO_CANONICAL_SPEC_v1.0.md

# RIO Receipt Specification

**Version:** 2.1.0
**Date:** 2026-04-04
**Authority Level:** Medium — technical specification for receipt format and verification
**Origin:** Brian Kent Rasmussen, Bondi (Scribe / OpenAI ChatGPT), formalized by Manny (Builder / Manus)
**Status:** Canonical
**Machine-Readable Schema:** `spec/Receipt_Specification_v2.1.json`

---

## 1. Purpose

This document defines the receipt format, hash chain structure, verification algorithm, and protocol versioning for the RIO governed execution system. A receipt is the final, immutable record binding all preceding artifacts of a governed action into a single signed document. Receipts form the basis of the tamper-evident ledger.

The constitutional invariant this specification enforces:

> **Every governed action must produce a cryptographic receipt. No receipt means the action did not happen.**

---

## 2. Receipt Types

The RIO system produces four types of receipts, each recording a different category of system event.

| Type | Description | When Produced |
|---|---|---|
| `governed_action` | Standard pipeline receipt for a governed action | After successful execution of an approved action |
| `kill_switch` | Records emergency proxy shutdown | When any authority triggers Full Stop |
| `onboard` | Records new user welcome and identity binding | When a new human authority is registered |
| `system` | Records system-level events (policy changes, mode changes) | When Meta-Governance actions occur |

---

## 3. Receipt Structure

A receipt contains the following fields. All fields are required unless marked optional.

| Field | Type | Description |
|---|---|---|
| `receipt_id` | UUID | Unique identifier for this receipt |
| `receipt_type` | Enum | One of: `governed_action`, `kill_switch`, `onboard`, `system` |
| `request_id` | UUID | The original ActionRequest identifier |
| `recommendation_id` | UUID | The AI recommendation identifier |
| `approval_id` | UUID | The approval record identifier |
| `execution_id` | UUID | The execution record identifier |
| `action_type` | String | The action type from the original request (e.g., `send_email`) |
| `requested_by` | String | The agent that requested the action |
| `approver_id` | String | The human who approved the action |
| `executed_by` | String | The system that executed the action |
| `created_at` | ISO 8601 | UTC timestamp of receipt generation |
| `status` | Enum | One of: `valid`, `tampered`, `unverified` |
| `protocolVersion` | Semver | Protocol version (e.g., `2.2.0`) |
| `ingestion` | Object | Provenance metadata (source, channel, source_message_id) — optional, added in v2.1 |
| `identity_binding` | Object | Ed25519 signer proof — optional, added in v2.1 |
| `hash_chain` | Object | The 5-hash chain binding all pipeline stages |

---

## 4. The 5-Hash Chain

Every receipt contains a hash chain that cryptographically binds all five stages of the governed action pipeline. The hash chain is the core integrity mechanism — it proves that the receipt corresponds to exactly the intent, governance decision, authorization, and execution that occurred.

| Hash | Source | What It Proves |
|---|---|---|
| `intent_hash` | SHA-256 of the ActionRequest | The original request was not modified |
| `governance_hash` | SHA-256 of the governance decision | The risk assessment was not modified |
| `authorization_hash` | SHA-256 of the ApprovalRecord | The approval was not modified |
| `execution_hash` | SHA-256 of the ExecutionRecord | The execution result was not modified |
| `receipt_hash` | SHA-256 of all preceding hashes | The receipt itself was not modified |

The `receipt_hash` is computed over the concatenation of the four preceding hashes, creating a Merkle-like binding. If any upstream artifact is modified after the fact, the `receipt_hash` will not match, and the receipt will be flagged as `tampered`.

---

## 5. Hash Specification

| Property | Value |
|---|---|
| Algorithm | SHA-256 |
| Serialization | Deterministic JSON (keys sorted alphabetically, no whitespace, UTF-8 encoding) |
| Genesis value | `GENESIS` (used for the first entry in the ledger chain) |
| Chain order | `intent_hash` → `governance_hash` → `authorization_hash` → `execution_hash` → `receipt_hash` |

Deterministic serialization is critical. The same input must always produce the same hash. Keys are sorted alphabetically, whitespace is removed, and encoding is UTF-8. Any deviation from this serialization will produce a different hash and break verification.

---

## 6. Identity Binding (v2.1)

Receipts may include an `identity_binding` object that cryptographically links the approval to a registered Ed25519 signer. This provides non-repudiation — proof that a specific human approved the action with a specific key at a specific time.

| Field | Type | Description |
|---|---|---|
| `signer_id` | String | The registered signer ID from the `authorized_signers` table |
| `public_key_hex` | String | The Ed25519 public key (64-char hex) at the time of approval |
| `signature_payload_hash` | String | SHA-256 hash of the canonical JSON payload that was signed |
| `verification_method` | Enum | Always `ed25519` |

---

## 7. Supported Signature Methods

The protocol supports the following signature methods. Ed25519 is the default and recommended method.

| Method | Status | Use Case |
|---|---|---|
| `ed25519` | **Active** | Default for all approvals and identity binding |
| `hmac_sha256` | Supported | Shared-secret environments |
| `ecdsa_secp256k1` | Supported | Blockchain-compatible environments |
| `rsa_pss_sha256` | Supported | Enterprise PKI environments |

---

## 8. Verification Algorithm

To verify a receipt, a verifier performs the following steps:

1. **Deserialize** the receipt JSON using deterministic serialization (sorted keys, no whitespace, UTF-8).
2. **Recompute** each hash in the chain order: `intent_hash`, `governance_hash`, `authorization_hash`, `execution_hash`.
3. **Recompute** the `receipt_hash` from the four preceding hashes.
4. **Compare** the recomputed `receipt_hash` against the stored `receipt_hash`.
5. If the hashes match, the receipt is `valid`. If any hash does not match, the receipt is `tampered`.
6. If `identity_binding` is present, verify the Ed25519 signature against the `public_key_hex` and `signature_payload_hash`.

The verification can be performed by any party with access to the receipt. No access to the system that produced the receipt is required. This satisfies the constitutional invariant of independent verification.

---

## 9. Protocol Versioning

Every receipt includes a `protocolVersion` field using semantic versioning (semver). The current protocol version is `2.2.0`.

| Version | Date | Changes |
|---|---|---|
| 1.0.0 | 2026-03 | Initial 3-hash receipt format |
| 2.0.0 | 2026-03 | 5-hash chain, expanded receipt fields |
| 2.1.0 | 2026-03 | Ingestion provenance, Ed25519 identity binding, kill_switch and onboard receipt types |
| 2.2.0 | 2026-04 | Protocol version field on every receipt |

Version changes follow semver rules: major version changes indicate breaking changes to the receipt format, minor version changes add new optional fields, and patch version changes fix bugs or clarify documentation.

---

## 10. SDK Support

The receipt format is implemented in two SDKs that allow developers to create, sign, and verify receipts programmatically.

| SDK | Package | Version | Language |
|---|---|---|---|
| JavaScript | `@rio-protocol/receipt` | 2.2.0 | Node.js / Browser |
| Python | `rio-receipt` | 2.2.0 | Python 3.8+ |

Both SDKs expose the same core functions: `createReceipt()`, `verifyReceipt()`, `verifyChain()`, and `hashPayload()`. The SDKs handle deterministic serialization, hash computation, and signature verification internally.

---

## 11. Machine-Readable Schema

The complete receipt schema is available as a JSON Schema document at `spec/Receipt_Specification_v2.1.json`. This schema can be used for automated validation of receipts in any language that supports JSON Schema.
