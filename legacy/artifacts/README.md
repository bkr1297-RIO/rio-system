# Evidence Artifacts

> These are not examples. They are system outputs.

These files are **real execution records** from the RIO system.  
They demonstrate enforcement of:  
`/specs/canonical/RIO_CANONICAL_SPEC_v1.0.md`

---

## Files

| File | What It Shows |
|---|---|
| `success_chain.json` | Authorized execution — PENDING → SUCCESS, full receipt chain |
| `failure_chain.json` | Authorized but failed — PENDING → FAILURE, truth resolved |
| `blocked_attempt.json` | Unauthorized attempt — no execution, no lineage entry |

---

## What This Proves

**Claim:** An action executes only if token is valid, lineage is resolved, and execution matches authorized intent.

**Evidence:**

1. `success_chain.json` — all three invariant conditions satisfied → EXECUTED
2. `failure_chain.json` — execution authorized but resolved as FAILURE → truth recorded
3. `blocked_attempt.json` — invariant condition failed → no execution, DENIED receipt only

**Result:**
- Authorized actions succeed and produce verifiable receipts
- Failed actions resolve truth — no ambiguity, no silent state
- Unauthorized attempts never enter the execution path

---

## How to Verify

Every receipt in these files contains:
- `trace_id` — links back to the originating PGL signal
- `binding_hash` — proves execution matched authorization
- `prev_hash` — proves ledger chain integrity
- `reason_code` — explains every decision deterministically

Run `GET /ledger/verify` against any chain to confirm integrity.

---

## The Invariant These Prove

```
An action is AUTHORIZED only when:
1. A valid single-use token exists
2. Lineage is fully resolved (no PENDING, no FAILURE)
3. Execution payload exactly matches authorized intent
```

These artifacts are the proof that the system enforces this invariant under real conditions — not in theory.

---

*Derived from: /specs/canonical/RIO_CANONICAL_SPEC_v1.0.md*  
*Confidential — Brian K. Rasmussen — April 2026*
