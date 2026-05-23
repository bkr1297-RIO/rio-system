# SPG-M API v1 Govern Bridge

## Purpose

The public API v1 govern path can carry optional SPG-M review metadata into RIO policy review.

```text
POST /api/v1/intents/:id/govern
```

This route uses the same conservative bridge as the internal `/govern` path.

## Optional Request Metadata

Clients may include SPG-M review metadata using one of these fields:

```text
spgmPolicyReview
spgm_policy_review
policy_review
spgm.policy_review
```

## Runtime Behavior

When SPG-M review metadata is present, the bridge passes it into RIO's pure policy engine as context.

When SPG-M review metadata is absent, the standard API v1 govern route handles the request normally.

## Boundary

SPG-M metadata may increase review requirements.

SPG-M metadata may not reduce review requirements, authorize action, execute action, issue tokens, generate receipts, or create memory.

## Verification

From `gateway/`:

```bash
npm run test:spgm:govern
```
