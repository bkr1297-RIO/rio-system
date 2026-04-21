# RIO Enforcement Core — Phase 1

**Execution Boundary Implementation**

This module is the minimal enforcement core that proves the RIO invariant holds:

> An action is authorized only when:
> 1. a valid, single-use token exists
> 2. execution exactly matches the approved intent (payload binding)
> 3. lineage is fully resolved (no pending/failed dependencies)
>
> If any condition fails → DENY (fail-closed)

---

## Components

| File | Purpose |
|------|---------|
| `dtt.mjs` | Delegated Trust Token — issue, validate, consume (single-use, time-bound, trace-bound, payload-bound) |
| `gate.mjs` | Execution Gate — 5-check pipeline, fail-closed. No bypass, no fallback. |
| `ledger.mjs` | Receipt generation + append-only hash-chained ledger |
| `test_harness.mjs` | 7 required tests + ledger integrity verification |

---

## Execution Gate Checks (in order)

1. **TOKEN_PRESENT** → missing → DENY (`MISSING_TOKEN`)
2. **TOKEN_VALID** → expired/used → DENY (`INVALID_TOKEN` / `TOKEN_USED`)
3. **TRACE_MATCH** → wrong session → DENY (`TRACE_MISMATCH`)
4. **INTENT_BINDING** → payload tampered → DENY (`ACT_BINDING_MISMATCH`)
5. **LINEAGE_RESOLVED** → pending/failed deps → BLOCK (`LINEAGE_UNRESOLVED`)

If all pass → **EXECUTE**

---

## Run Tests

```bash
cd enforcement-core
node test_harness.mjs
```

Expected: 18/18 PASS, 0 FAIL, ledger chain valid.

---

## What This Does NOT Include

- UI
- PGL (language layer)
- Context system
- Agent orchestration
- Optimization layers

This is correctness, not completeness.
