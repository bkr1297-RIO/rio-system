# SPG-M Runtime Placement

## Status

SPG-M now has five implemented surfaces in `rio-system`:

```text
GET /spgm/status
POST /spgm/intake
POST /spgm/policy-review
POST /govern
POST /api/v1/intents/:id/govern
```

The first three are SPG-M-specific non-executing surfaces. The two governance paths accept optional SPG-M review metadata as conservative context.

SPG-M may increase review requirements. It may not grant permission, dispatch tools, write execution ledger entries, generate receipts, or create memory.

## Purpose

SPG-M — Symbolic Pattern Governance Module — is a Pattern Governance layer for ambiguous, high-context, human-supplied signals before those signals influence machine action, memory, routing, escalation, or execution.

In enterprise language, SPG-M governs pattern input before it becomes consequential system behavior.

## Runtime Boundary

The RIO runtime pipeline remains:

```text
Signal → Proposal → Policy → Authorization → Execution Gate → Execute → Receipt → Ledger
```

SPG-M does not replace this pipeline.

## Placement

```text
Human / System Signal
  → SPG-M Intake
  → SPG-M Policy Review Preview
  → RIO Policy Review / Govern Bridge
  → Authorization
  → Execution Gate
  → Receipt + Ledger
```

SPG-M prepares context before and during RIO review. It does not become a parallel action path.

## Runtime Status

| SPG-M Element | Status |
|---|---|
| Receipt-compatible profile | Implemented in `rio-receipt-protocol` |
| Gateway status endpoint | Implemented |
| Gateway intake | Implemented, non-executing |
| Gateway policy review preview | Implemented, non-executing |
| `/govern` bridge | Implemented |
| API v1 govern bridge | Implemented |
| Intake schema validation | Implemented |
| Consequence classification | Implemented |
| Gate markers | Implemented |
| Receipt-event recommendation | Metadata only |
| Receipt handoff packet | Metadata only |
| Policy context | Metadata only |
| Policy review metadata | Metadata only |
| Pure policy-engine bridge | Conservative escalation only |
| Pattern memory integration | Not implemented |
| Receipt generation / ledger write | Not implemented in SPG-M intake |
| Action authority | Not allowed |

## Non-Authority Rules

SPG-M must preserve these boundaries:

- Pattern signals do not create authority.
- Interpretation is provisional.
- Recurrence is not proof.
- Machine interpretation is not permission.
- Pattern promotion does not allow action.
- Consequence class determines routing weight.
- Policy review metadata may increase review weight only.
- Policy review preview does not create an intent or grant permission.
- Govern bridge metadata does not bypass authorization.
- Receipt handoff is metadata only until the receipt layer produces proof.

## Verification

From `gateway/`:

```bash
npm run test:spgm
npm run test:spgm:policy-review
npm run test:spgm:govern
```

Manual checks:

```text
gateway/spgm/VERIFY_INTAKE.md
gateway/spgm/VERIFY_POLICY_REVIEW.md
gateway/spgm/GOVERN_REQUEST_BRIDGE.md
```

## Summary

SPG-M is present as a non-executing pre-policy intake and review-preview surface, with live conservative bridges into both internal and API v1 governance paths. It may classify ambiguous signals, preview RIO review, and increase review requirements. It cannot grant permission, run tools, create receipts, create memory, or create authority.
