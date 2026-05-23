# SPG-M Policy Review Preview

## Purpose

This note verifies the non-executing SPG-M policy-review preview route.

```text
POST /spgm/policy-review
```

The route previews how SPG-M review metadata may affect RIO policy review.

It does not create intents, approve actions, execute actions, write ledger entries, generate receipts, or create memory.

## Test Commands

From `gateway/`:

```bash
npm run test:spgm
npm run test:spgm:policy-review
```

## Manual Preview

```bash
curl -X POST http://localhost:4400/spgm/policy-review \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <TOKEN>" \
  --data @gateway/spgm/examples/policy-review.request.json
```

Expected result:

- response mode is `non_executing`
- review type is `spgm_policy_review_preview`
- RIO may escalate review requirements
- no action is approved
- no execution path is opened
- no proof artifact is created by this route

## Boundary

SPG-M policy review preview may increase governance weight.

It may not reduce governance weight or create authority.
