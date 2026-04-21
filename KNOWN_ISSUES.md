# Known Issues

## Ledger Chain Breaks (59 linkage breaks, 60 epochs)

**Status:** Documented. Root cause addressed. Existing breaks preserved as development history.

### Description

The gateway ledger contains 59 linkage breaks across 788 entries, resulting in 60 epochs. A linkage break occurs when a ledger entry's `prev_hash` does not match the `ledger_hash` of the preceding entry. The current epoch is valid — all entries within it are correctly chained.

### Cause

During development, the gateway's intent store was backed by an in-memory JavaScript `Map()`. Every time the gateway redeployed on Render (free tier, which restarts on each push), the in-memory state was lost. On the next boot, the ledger loaded its chain tip from PostgreSQL, but the intent store started empty. The first new ledger entry after a redeploy could not reference the correct previous hash because the in-memory chain tip was reset to the genesis hash.

Each redeploy created a new epoch — a fresh chain segment starting from genesis.

### Current State

| Metric | Value |
|--------|-------|
| Total entries | 788 |
| Hash mismatches | 0 |
| Linkage breaks | 59 |
| Epochs | 60 |
| Current epoch valid | Yes |

Zero hash mismatches means no entry has been tampered with. Every individual entry's content hash is correct. The breaks are structural (lost chain tip on restart), not integrity failures.

### Remediation

**Commit `99ac2b4`** replaced the in-memory intent store with PostgreSQL persistence (`governance/intents.mjs`). The intent store now shares the same PostgreSQL connection pool used by the ledger. On redeploy, the gateway loads all intents and the ledger chain tip from the database. New entries correctly reference the previous hash.

This prevents future chain breaks from gateway restarts.

### Policy on Existing Breaks

The 59 existing breaks are preserved as development history. They are not erased, backfilled, or hidden. The ledger's epoch system handles them cleanly — each epoch is independently verifiable, and the current epoch's chain is intact.

Any external audit should treat the break count as expected for a system that was developed iteratively on infrastructure that restarts on every deploy. The break count should stabilize at 59 going forward.
