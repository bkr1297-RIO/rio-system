# INVARIANT-002: No Modification Without a Governance Receipt

**Status:** ACTIVE
**Created:** 2026-03-30
**Author:** Brian Kent Rasmussen (system owner), codified by Manus (The Proof)
**Scope:** Universal — applies to all ledger entries, policy artifacts, and system configuration
**Depends On:** INVARIANT-001 (No Action Without a Receipt)
**Hash:** (computed at ledger insertion)

---

## Statement

> No receipt, ledger entry, policy artifact, invariant, or system configuration may be modified or deleted after creation. Every change to the system's state MUST be expressed as a new append-only entry with its own governance receipt. The past is immutable. The future is governed.

---

## Formal Definition

Let **L** be the append-only ledger. Let **E(n)** be the entry at position **n** in **L**. Let **H(n)** be the hash of **E(n)**. Let **P** be any policy artifact, invariant, or system configuration document.

**The invariant holds if and only if:**

1. **No Mutation:** For all entries **E(n)** in **L**, the content of **E(n)** is identical at time **t** and all subsequent times **t+k**. No UPDATE or DELETE operation is permitted on any ledger row.
2. **No Deletion:** No entry **E(n)** may be removed from **L**. The ledger is strictly append-only. The count of entries in **L** is monotonically increasing.
3. **Chain Preservation:** For all entries **E(n)** where **n > 0**, the field `previous_hash` in **E(n)** equals **H(n-1)**. Breaking this chain is a system integrity violation.
4. **Amendment by Append:** If a policy **P** must be changed, the change is expressed as a new entry **E(m)** where **m > n**, with a receipt that references the original **P** and describes the amendment. The original **P** remains unchanged in the ledger.
5. **Signature Continuity:** Every entry **E(n)** carries an Ed25519 signature that covers the full content hash. Altering any byte of **E(n)** invalidates the signature, making tampering detectable.
6. **Schema Enforcement:** The database schema for the ledger table has no UPDATE or DELETE grants. This is enforced at the database permission level, not just application logic.
