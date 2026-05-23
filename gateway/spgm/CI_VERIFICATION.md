# SPG-M CI Verification

## Purpose

SPG-M gateway tests are covered by GitHub Actions.

Workflow:

```text
.github/workflows/spgm-gateway-tests.yml
```

## Commands

The workflow runs from `gateway/`:

```bash
npm run test:spgm
npm run test:spgm:policy-review
npm run test:spgm:govern
```

## Boundary

The CI job verifies the non-executing SPG-M intake, review, and govern bridge surfaces.

It does not require production credentials and does not execute actions, issue tokens, generate receipts, or write production ledger entries.
