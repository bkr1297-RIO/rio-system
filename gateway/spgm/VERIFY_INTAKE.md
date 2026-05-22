# SPG-M Intake Verification

## Purpose

This guide verifies the non-executing SPG-M gateway intake route.

The route is:

```text
POST /spgm/intake
```

It classifies and routes ambiguous pattern signals. It does not approve, execute, issue tokens, write ledger entries, dispatch connectors, or create memory.

## Run Unit Tests

From `gateway/`:

```bash
npm run test:spgm
```

## Example Packets

Example request packets live in:

```text
gateway/spgm/examples/
```

Available examples:

- `private-reflection.json` — expected Class 1, non-executing record/private reflection
- `relational-routing.json` — expected Class 3, RIO/MUSS routing required before action
- `invalid-missing-signal.json` — expected validation hold, no action

## Manual Verification

Start the gateway with local configuration as usual, then send a request with an authenticated principal.

Example using curl:

```bash
curl -X POST http://localhost:4400/spgm/intake \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <TOKEN>" \
  --data @gateway/spgm/examples/private-reflection.json
```

Expected properties:

- response mode is `non_executing`
- no connector is dispatched
- no execution token is issued
- no ledger entry is written by this route
- result includes `spgm_result`
- result includes routing markers

## Boundary Checks

The route must preserve these boundaries:

- signal is not command,
- interpretation remains provisional,
- actual or potential impact determines consequence class,
- Class 3+ requires routing before action,
- invalid packets fail closed into hold/containment,
- machine assistance is metadata/context only.

## Summary

SPG-M intake is safe to expose only as a non-executing classification and routing surface. Any consequential output must pass through the existing RIO governance pipeline before action.
