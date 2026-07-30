# Prime → RIO Runtime Bridge v0.1

This bridge accepts compiled Prime Relational IR and executes one deliberately bounded runtime operation:

```text
prime.echo
```

The operation has no external side effects. It proves the first end-to-end crossing between the executable Prime language and the active RIO receipt runtime.

## Flow

```text
Prime expression
→ Relational IR
→ explicit authorization envelope
→ RIO bounded echo execution
→ native RIO five-hash receipt
→ receipt verification
→ Prime-readable return
```

## Run the verification

From `gateway/`:

```bash
npm run test:prime
```

## Accepted authorization

```json
{
  "decision": "approved",
  "action": "prime.echo",
  "authorized_by": "human-authority-id",
  "expires_at": "future ISO-8601 timestamp"
}
```

The bridge rejects denied, missing, expired, or differently scoped authorization.

## Successful return

The result contains:

- the returned Prime expression;
- the RIO intent, governance record, authorization record, and execution record;
- a native RIO receipt covering all four artifact hashes;
- independent receipt verification.

## Current boundary

`prime.echo` preserves and returns the compiled path. It does not call an external connector or create an external-world side effect. The next bridge version may replace the echo connector with one explicitly bounded tool operation while retaining the same authorization and receipt contract.
