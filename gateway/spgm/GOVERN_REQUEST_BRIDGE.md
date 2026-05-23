# SPG-M Govern Request Bridge

## Purpose

This bridge prepares `/govern` requests to carry optional SPG-M review metadata into RIO's pure policy engine.

The helper is non-executing. It does not create intents, approve actions, issue tokens, write ledger entries, generate receipts, or create memory.

## Accepted Request Fields

The helper can read SPG-M review metadata from any of these fields:

```text
spgmPolicyReview
spgm_policy_review
policy_review
spgm.policy_review
```

## Intended Use

A future `/govern` route update may pass the extracted metadata into:

```text
evaluatePolicy(intent, activePolicy, context)
```

RIO may then use SPG-M metadata only as conservative review context.

## Boundary

SPG-M metadata may increase review requirements.

SPG-M metadata may not decrease review requirements or create authority.

## Verification

From `gateway/`:

```bash
npm run test:spgm:govern
```
