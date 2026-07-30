# Prime Authenticated Sandbox Runtime v0.2

This slice adds the first reversible Prime tool consequence.

## HTTP surface

When mounted under `/api/v1`, the router exposes:

```text
POST /api/v1/prime/execute
POST /api/v1/prime/rollback
```

The production router uses the gateway's existing `requireScope("write")` middleware. Tests inject equivalent pass/deny middleware to prove both authenticated and unauthenticated behavior without requiring PostgreSQL startup.

## Set action

```json
{
  "ir": { "source_expression": "7 -> 8 -> 7", "symbols": ["7", "8", "7"], "transitions": [{}, {}] },
  "authorization": {
    "decision": "approved",
    "action": "prime.sandbox.set",
    "authorized_by": "human-authority-id",
    "expires_at": "future ISO timestamp"
  },
  "key": "demo.signal",
  "value": "7 -> 8 -> 7"
}
```

The response includes a native RIO receipt and a single-use rollback token.

## Rollback action

Rollback requires a second, action-specific approval for `prime.sandbox.rollback`. It verifies that the current state still matches the receipted mutation before restoring the prior state. Replayed rollback tokens and intervening unreceipted state changes fail closed.

## Boundary

The sandbox is process-local and has no external side effects. The router is implemented and independently exercised as an Express HTTP surface. A separate reviewed wiring change is required to mount it in `gateway/server.mjs` after the runtime's startup and database integration path is selected.
