# SPG-M Govern Request Bridge

## Purpose

This bridge allows live governance requests to carry optional SPG-M review metadata into RIO's pure policy engine.

The bridge is conservative. It may increase review requirements, but it may not reduce review requirements or create authority.

## Runtime Placement

The bridge is mounted before standard governance routes.

Covered paths:

```text
POST /govern
POST /api/v1/intents/:id/govern
```

When SPG-M review metadata is present, the bridge handles the request and passes the metadata into `evaluatePolicy` as context.

When SPG-M review metadata is absent, the request passes through to the standard governance route.

## Accepted Request Fields

The bridge can read SPG-M review metadata from any of these fields:

```text
spgmPolicyReview
spgm_policy_review
policy_review
spgm.policy_review
```

## Boundary

The bridge does not approve actions, issue tokens, execute actions, dispatch connectors, generate receipts, write ledger entries beyond the normal governance ledger entry, or create memory.

SPG-M metadata may increase review requirements.

SPG-M metadata may not decrease review requirements or create authority.

## Verification

From `gateway/`:

```bash
npm run test:spgm:govern
```