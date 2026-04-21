# RIO Enforcement Core

This repository demonstrates the execution boundary and receipt protocol — the core enforcement layer of the RIO system.

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
| `gate.mjs` | Execution Gate — 6-check pipeline, fail-closed. No bypass, no fallback. |
| `ledger.mjs` | Receipt generation + append-only hash-chained ledger |
| `email_adapter.mjs` | Email adapter — executes only what the gate passes (simulated) |
| `funds_adapter.mjs` | Funds transfer adapter — executes only what the gate passes (simulated) |
| `test_harness.mjs` | Phase 1 invariant tests + email/funds integration tests |

---

## Execution Gate Checks (in order)

1. **TOKEN_PRESENT** → missing → DENY (`MISSING_TOKEN`)
2. **TOKEN_VALID** → expired/used → DENY (`INVALID_TOKEN` / `TOKEN_USED`)
3. **TRACE_MATCH** → wrong session → DENY (`TRACE_MISMATCH`)
4. **INTENT_BINDING** → payload tampered → DENY (`ACT_BINDING_MISMATCH`)
5. **LINEAGE_RESOLVED** → pending/failed deps → BLOCK (`LINEAGE_UNRESOLVED`)
6. **SCOPE_CHECK** → constraint violation → DENY (`SCOPE_VIOLATION`)

If all pass → **EXECUTE**

---

## Run Tests

```bash
cd enforcement-core
node test_harness.mjs              # Phase 1 invariant suite (21 assertions)
node test_harness.mjs --case=email  # Email adapter integration (15 assertions)
node test_harness.mjs --case=funds  # Funds transfer integration (14 assertions)
```

All adapters are simulated. No real emails are sent, no real funds are moved.

---

## What This Does NOT Include

- UI
- PGL (language layer)
- Context system
- Agent orchestration
- Optimization layers

This is correctness, not completeness.
