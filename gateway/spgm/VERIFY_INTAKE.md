# SPG-M Intake Verification

## Purpose

This guide verifies the non-executing SPG-M gateway intake route.

The routes are:

```text
GET /spgm/status
POST /spgm/intake
```

SPG-M classifies and routes ambiguous pattern signals. It does not approve, execute, issue tokens, write ledger entries, dispatch connectors, generate receipts, or create memory.

## Run Unit Tests

From `gateway/`:

```bash
npm run test:spgm
```

## Verify Status Endpoint

Start the gateway, then run:

```bash
curl http://localhost:4400/spgm/status
```

Expected properties:

- `module` is `SPG-M`
- `mode` is `non_executing`
- capabilities include intake validation, consequence classification, routing markers, receipt event recommendation, and receipt handoff metadata
- `not_capable_of` includes approval, execution, token issuance, connector dispatch, ledger write, receipt generation, and persistent memory

## Example Packets

Example request packets live in:

```text
gateway/spgm/examples/
```

Available request examples:

- `private-reflection.json` — expected Class 1, non-executing record/private reflection
- `relational-routing.json` — expected Class 3, RIO/MUSS routing required before action
- `invalid-missing-signal.json` — expected validation hold, no action

Available expected response fixtures:

- `private-reflection.response.json` — no receipt handoff by default
- `relational-routing.response.json` — receipt event recommended, `BLOCK` decision hint, RIO/MUSS required
- `invalid-missing-signal.response.json` — validation hold, containment next step

## Manual Intake Verification

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
- consequential/contained/refused/held events may include `receipt_event` and `receipt_handoff`

## Receipt Handoff Boundary

`receipt_handoff` is metadata only.

It may recommend that a later receipt-compatible proof event be created through `rio-receipt-protocol`, but it does not:

- generate a receipt,
- sign a payload,
- write a ledger entry,
- authorize an action,
- dispatch a connector,
- create persistent memory.

Expected handoff behavior:

| Case | `receipt_event.recommended` | `receipt_handoff` |
|---|---:|---|
| Private reflection | `false` | `null` |
| Relational / Class 3+ | `true` | handoff packet with `BLOCK` decision hint |
| Invalid intake | validation hold | no execution; containment next step |

## Boundary Checks

The route must preserve these boundaries:

- signal is not command,
- interpretation remains provisional,
- actual or potential impact determines consequence class,
- Class 3+ requires routing before action,
- invalid packets fail closed into hold/containment,
- machine assistance is metadata/context only,
- receipt handoff is proof metadata, not proof creation.

## Summary

SPG-M intake is safe to expose only as a non-executing classification and routing surface. Any consequential output must pass through the existing RIO governance pipeline before action. Any proof event must be produced by the receipt layer, not by the intake route itself.
