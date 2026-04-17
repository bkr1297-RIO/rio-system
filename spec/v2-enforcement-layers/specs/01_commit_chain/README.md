# 01 — Commit Chain

**Source files:** `controlPlane.ts` (A7: FormalLedgerEntry, buildFormalLedgerEntry), `kernelExecutor.ts` (WAL discipline, rebuildNonceCache, startupLedgerVerification), `integritySubstrate.ts` (validateAtSubstrate, 4-check gate), `db.ts` (appendLedger, verifyHashChain, getAllLedgerEntries), `authorityLayer.ts` (GenesisRecord)

---

## Purpose

The commit chain is the append-only, hash-linked ledger that records every state change in the system. No change to the world or system state can occur unless it is recorded here. The chain provides tamper evidence, replay protection, and startup integrity verification.

---

## Schemas

All schemas are defined in [`schema.json`](./schema.json). The canonical types are:

| Schema | Source | Description |
|---|---|---|
| `FormalLedgerEntry` | controlPlane.ts A7 | The ledger block. Hash-linked to previous entry. |
| `WALEntry` | kernelExecutor.ts | Write-Ahead Ledger entry (PREPARED, COMMITTED, FAILED). |
| `WALPreparedPayload` | kernelExecutor.ts | Payload written before execution starts. |
| `WALCommittedPayload` | kernelExecutor.ts | Payload written after successful execution. |
| `WALFailedPayload` | kernelExecutor.ts | Payload written after failed execution. |
| `SubstrateCheck` | integritySubstrate.ts | Individual substrate check result. |
| `SubstrateResult` | integritySubstrate.ts | Aggregate of all 4 substrate checks. |
| `SubstrateLogEntry` | integritySubstrate.ts | Substrate event log entry. |
| `SubstrateInput` | integritySubstrate.ts | Input to validateAtSubstrate(). |
| `GenesisRecord` | authorityLayer.ts | Ledger block 0. Anchors the entire system. |

---

## Ledger Entry Types

Every ledger entry has an `entry_type` discriminator. The canonical set:

| entry_type | When written | Source |
|---|---|---|
| `INTENT` | Intent created | routers.ts |
| `APPROVAL` | Human approves | routers.ts |
| `REJECTION` | Human rejects | routers.ts |
| `EXECUTION` | Connector executes | routers.ts, kernelExecutor.ts |
| `DELEGATION_BLOCKED` | Same-identity approval blocked | routers.ts |
| `DELEGATION_APPROVED` | Same-identity approval allowed (cooldown met) | routers.ts |
| `WAL_PREPARED` | Before execution starts | kernelExecutor.ts |
| `WAL_COMMITTED` | After successful execution | kernelExecutor.ts |
| `WAL_FAILED` | After failed execution | kernelExecutor.ts |
| `NONCE_CONSUMED` | Nonce consumed by execution | kernelExecutor.ts |
| `SUBSTRATE_BLOCK` | Message blocked at substrate level | integritySubstrate.ts |
| `KILL_SWITCH` | Kill switch activated/deactivated | authorityLayer.ts |
| `SYSTEM` | System events | various |

---

## Hash Chain Invariant

For every entry `entry[i]` where `i > 0`:

```
entry[i].previous_ledger_hash === entry[i-1].current_hash
```

`current_hash` is computed as:

```
SHA-256(canonical_json({block_index, receipt_hash, previous_ledger_hash, timestamp, payload}))
```

Violation of this invariant is **SYSTEM CORRUPTION**. Startup verification halts.

---

## WAL Discipline

The Write-Ahead Ledger enforces ordering across all execution paths. The invariant:

1. `WAL_PREPARED` MUST be written **before** the connector call.
2. `WAL_COMMITTED` or `WAL_FAILED` MUST be written **after** the connector call.
3. If `WAL_PREPARED` write fails, execution MUST NOT proceed.
4. If the connector succeeds but `WAL_COMMITTED` write fails, the caller MUST NOT return success.

This is enforced in all 5 execution paths:

| Path | Source |
|---|---|
| `kernelExecute()` | kernelExecutor.ts |
| `execute` mutation | routers.ts |
| `approveAndExecute` mutation | routers.ts |
| `handleLocalApproval` | emailApproval.ts |
| `oneClickApproval` handler | oneClickApproval.ts |

---

## Integrity Substrate

`validateAtSubstrate()` is the **first gate** before any governance surface sees a message. It runs 4 checks in order:

| Check | Type | What it catches |
|---|---|---|
| Nonce uniqueness | `nonce` | Duplicate nonce reuse |
| Content dedup | `dedup` | Same content hash within DEDUP_TTL_MS (300,000ms = 5 min) |
| Replay detection | `replay` | Token bound to different content hash |
| Receipt linkage | `receipt_linkage` | Missing source or action fields |

If any check fails, the message is **BLOCKED** and a `SUBSTRATE_BLOCK` entry is written to the ledger. Governance never sees it.

---

## Nonce Persistence

Nonces are persisted to the ledger as `NONCE_CONSUMED` entries. On restart, `rebuildNonceCache()` reads all `NONCE_CONSUMED` entries from the ledger and repopulates the in-memory cache. Nonces survive restart.

---

## Genesis Record

The genesis record is ledger block 0. It anchors the entire system.

| Field | Value |
|---|---|
| `record_type` | `"GENESIS"` |
| `system_id` | `"RIO"` |
| `previous_hash` | `"0000000000000000"` |
| `genesis_hash` | SHA-256 of the record (minus genesis_hash field) |

---

## Constants

| Constant | Value | Source |
|---|---|---|
| `DEDUP_TTL_MS` | 300,000 (5 minutes) | integritySubstrate.ts |
| `NONCE_TTL_MS` | 600,000 (10 minutes) | integritySubstrate.ts |
| Hash algorithm | SHA-256 | controlPlane.ts |
| Canonical JSON | Keys sorted recursively | controlPlane.ts |

---

## Failure Conditions

| Condition | Result |
|---|---|
| Hash chain break | SYSTEM CORRUPTION. Startup verification halts. |
| WAL PREPARED write fails | Execution MUST NOT proceed. |
| WAL COMMITTED write fails | Caller MUST NOT return success. |
| Substrate check fails | Message BLOCKED. Governance never sees it. |
| Nonce replay | BLOCKED_NONCE at substrate level. |
| Content dedup | BLOCKED_DEDUP at substrate level. |
| Token replay | BLOCKED_REPLAY at substrate level. |
| Receipt linkage missing | receipt_linkage check fails. Message blocked. |
