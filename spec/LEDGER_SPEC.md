> Derived from: /specs/canonical/RIO_CANONICAL_SPEC_v1.0.md

# RIO Ledger Specification

**Version:** 1.0
**Date:** 2026-04-04
**Authority Level:** Medium — technical specification for ledger format and integrity
**Origin:** Brian Kent Rasmussen, Bondi (Scribe / OpenAI ChatGPT), formalized by Manny (Builder / Manus)
**Status:** Canonical

---

## 1. Purpose

This document defines the ledger architecture — the append-only, hash-chained, tamper-evident record of every governed action in the RIO system. The ledger is the source of truth. It is the final proof that an action was authorized, executed, and recorded. The constitutional invariant this specification enforces:

> **Every receipt must be written to an append-only, hash-chained ledger. If the ledger write fails, the action is not considered complete.**

---

## 2. Core Properties

The RIO ledger has four non-negotiable properties:

| Property | Description | Enforcement |
|---|---|---|
| **Append-only** | Entries can only be added, never deleted or modified | Database triggers prevent DELETE and UPDATE operations |
| **Hash-chained** | Each entry contains the hash of the previous entry | `prev_hash` field links to the preceding `ledger_hash` |
| **Tamper-evident** | Any modification to any entry breaks the chain | Chain verification detects tampering at any point |
| **Independently verifiable** | Any party can verify the chain without system access | SHA-256 hashes can be recomputed from the data |

---

## 3. Ledger Entry Schema

Each ledger entry contains the following fields:

| Field | Type | Description |
|---|---|---|
| `id` | Serial | Auto-incrementing primary key |
| `entry_id` | UUID | Unique identifier for this ledger entry |
| `intent_id` | UUID | The intent this entry relates to |
| `action` | String | The action type (e.g., `send_email`) |
| `agent_id` | String | The agent that requested the action |
| `status` | String | The pipeline stage (e.g., `submitted`, `approved`, `executed`, `receipt_generated`) |
| `detail` | Text | Human-readable description of the event |
| `intent_hash` | String | SHA-256 hash of the intent |
| `authorization_hash` | String | SHA-256 hash of the authorization |
| `execution_hash` | String | SHA-256 hash of the execution result |
| `receipt_hash` | String | SHA-256 hash of the receipt |
| `ledger_hash` | String | SHA-256 hash of this entry (computed from all fields + `prev_hash`) |
| `prev_hash` | String | The `ledger_hash` of the immediately preceding entry |
| `timestamp` | Timestamptz | UTC timestamp of when this entry was created |

---

## 4. Hash Chain Algorithm

The ledger hash for each entry is computed as follows:

```
ledger_hash = SHA-256(
  entry_id + intent_id + action + agent_id + status + detail +
  intent_hash + authorization_hash + execution_hash + receipt_hash +
  prev_hash + timestamp
)
```

The `prev_hash` of the first entry in the chain is the genesis value: `0000000000000000000000000000000000000000000000000000000000000000` (64 zeros).

This creates a linked chain where modifying any entry invalidates all subsequent entries. The chain can be verified by recomputing each `ledger_hash` from its fields and comparing it to the stored value, then verifying that each entry's `prev_hash` matches the preceding entry's `ledger_hash`.

---

## 5. Chain Verification Algorithm

To verify the integrity of the entire ledger:

1. Retrieve all ledger entries ordered by `id` ascending.
2. For the first entry, verify that `prev_hash` equals the genesis value.
3. For each entry, recompute `ledger_hash` from its fields and `prev_hash`.
4. Compare the recomputed `ledger_hash` to the stored `ledger_hash`.
5. For each subsequent entry, verify that its `prev_hash` equals the preceding entry's `ledger_hash`.
6. If all checks pass, the chain is intact. If any check fails, the chain is broken at that entry.

The ONE PWA implements this verification in the Ledger page with a "Verify Chain" button that runs the full algorithm and reports the result.

---

## 6. Append-Only Enforcement

The ledger enforces append-only behavior at the database level using PostgreSQL triggers:

**Delete prevention:** A `BEFORE DELETE` trigger on the `ledger_entries` table raises an exception for any DELETE operation. The exception message states: "DELETE operations are not permitted on the ledger. The ledger is append-only."

**Update prevention:** A `BEFORE UPDATE` trigger on the `ledger_entries` table raises an exception for any UPDATE operation. The exception message states: "UPDATE operations are not permitted on the ledger. Ledger entries are immutable."

These triggers are created during database initialization and cannot be bypassed through normal SQL operations. They provide a database-level guarantee that the ledger cannot be modified after entries are written.

---

## 7. Receipt Storage

In addition to the ledger entries table, the system maintains a separate `receipts` table that stores the complete receipt JSON for each governed action. This table provides fast lookup of individual receipts by `receipt_id` or `intent_id`.

| Field | Type | Description |
|---|---|---|
| `receipt_id` | UUID | Unique receipt identifier (matches the receipt's `receipt_id`) |
| `intent_id` | UUID | The intent this receipt covers |
| `action` | String | The action type |
| `agent_id` | String | The agent that requested the action |
| `authorized_by` | String | The human who approved the action |
| `hash_chain` | JSONB | The complete 5-hash chain from the receipt |
| `created_at` | Timestamptz | UTC timestamp |

---

## 8. Authorized Signers Registry

The ledger system maintains a registry of authorized Ed25519 signers. Only registered signers can produce valid approvals that are accepted by the system.

| Field | Type | Description |
|---|---|---|
| `signer_id` | String | Unique identifier for the signer |
| `public_key_hex` | String | Ed25519 public key (64-char hex) |
| `display_name` | String | Human-readable name |
| `role` | String | The signer's role (default: `approver`) |
| `registered_at` | Timestamptz | When the signer was registered |

---

## 9. Ledger Entry Lifecycle

A single governed action produces multiple ledger entries as it moves through the pipeline. Each stage transition is recorded as a separate entry, creating a complete audit trail.

| Stage | Status | Detail |
|---|---|---|
| Intent submitted | `submitted` | "Intent submitted: {action_type}" |
| Governance assessed | `governed` | "Risk assessment: {risk_level}" |
| Approval granted | `approved` | "Approved by {approver_id}" |
| Execution completed | `executed` | "Executed successfully" or "Execution failed: {reason}" |
| Receipt generated | `receipt_generated` | "Receipt {receipt_id} generated with hash chain" |

Each entry in this sequence links to the previous via `prev_hash`, and each carries the cumulative hash chain fields as they become available (e.g., `intent_hash` is present from the first entry, `authorization_hash` appears after approval).

---

## 10. Integrity Monitoring

The system provides two levels of ledger integrity monitoring:

**On-demand verification:** The ONE PWA Ledger page provides a "Verify Chain" button that runs the full chain verification algorithm and reports whether the chain is intact or broken.

**Approval SLA metrics:** The ONE Dashboard displays queue size, average time to approval, oldest pending intent, and counts of approved, rejected, and expired intents. These metrics provide operational visibility into the health of the governance pipeline.

Future enhancements (documented in `docs/ENTERPRISE_ROADMAP.md`) include automated periodic chain verification, alerting on chain breaks, and Mantis integration for continuous ledger monitoring.

---

## 11. Database Indexes

The following indexes are maintained for query performance:

| Index | Table | Column | Purpose |
|---|---|---|---|
| `idx_ledger_intent_id` | `ledger_entries` | `intent_id` | Fast lookup of all entries for an intent |
| `idx_ledger_status` | `ledger_entries` | `status` | Fast filtering by pipeline stage |
| `idx_receipts_intent_id` | `receipts` | `intent_id` | Fast receipt lookup by intent |
| `idx_intents_status` | `intents` | `status` | Fast filtering of pending/active intents |
