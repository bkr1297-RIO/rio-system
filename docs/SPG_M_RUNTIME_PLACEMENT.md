# SPG-M Runtime Placement

## Status

Runtime placement note for the ONE/RIO/MUSS system.

SPG-M has a non-executing gateway intake surface in `rio-system` and a conservative bridge into the pure RIO policy engine.

The implemented gateway surface is:

```text
GET /spgm/status
POST /spgm/intake
```

This route classifies and routes ambiguous pattern signals. It does not approve, execute, issue tokens, dispatch connectors, write ledger entries, create receipts, or create persistent memory.

## Purpose

SPG-M — Symbolic Pattern Governance Module — is a Pattern Governance layer for ambiguous, high-context, human-supplied signals before those signals influence machine action, memory, routing, escalation, or execution.

In enterprise language, SPG-M governs pattern input before it becomes consequential system behavior.

## Current Runtime Boundary

The current RIO runtime pipeline remains:

```text
Signal → Proposal → Policy → Authorization → Execution Gate → Execute → Receipt → Ledger
```

SPG-M does not replace this pipeline.

SPG-M belongs before execution authority is granted. Its role is to prepare, classify, contain, or route ambiguous pattern signals before they can influence an intent, policy decision, authorization path, memory update, or receipt event.

## Placement

```text
Human / System Signal
  → SPG-M Intake / Pattern Governance
      → Signal capture
      → Packet validation
      → Fact / interpretation separation marker
      → Consequence classification
      → Governance gate markers
      → Containment / refusal / routing markers
      → Optional receipt handoff metadata
      → Policy context and review metadata
  → RIO Policy Review
      → Conservative review escalation only
  → Authorization
  → Execution Gate
  → Receipt + Ledger
```

## Relationship to Existing Components

| Component | SPG-M Relationship |
|---|---|
| Gateway | SPG-M has a non-executing intake route at `POST /spgm/intake`. |
| Governor / Policy | SPG-M review metadata may conservatively escalate `AUTO_APPROVE` to `REQUIRE_HUMAN`. It cannot approve. |
| Execution Gate | SPG-M does not execute actions and does not bypass the gate. |
| Receipt System | SPG-M intake may recommend receipt-compatible proof through `receipt_event` and `receipt_handoff` metadata. It does not create receipts. |
| Pattern Corpus | SPG-M aligns with non-authoritative pattern handling. Patterns may orient attention but do not decide. |
| Ledger | SPG-M does not write ledger entries directly in this repo. Receipt-compatible events are proved by the receipt layer. |

## Runtime Status

| SPG-M Element | Status in `rio-system` |
|---|---|
| Doctrine | External/conceptual kernel exists |
| Receipt-compatible profile | Implemented in `rio-receipt-protocol` |
| Gateway status endpoint | Implemented |
| Gateway intake | Implemented, non-executing |
| Intake schema validation | Implemented, fail-closed |
| Consequence classification | Implemented, lightweight |
| Gate status markers | Implemented |
| Receipt-event recommendation | Implemented as metadata only |
| Receipt handoff packet | Implemented as metadata only |
| Policy context | Implemented as metadata only |
| Policy review metadata | Implemented as metadata only |
| Pure policy-engine bridge | Implemented as conservative escalation only |
| Pattern memory integration | Not implemented |
| Receipt generation / ledger write | Not implemented in SPG-M intake |
| Execution authority | Not allowed |

## Non-Authority Rules

SPG-M must preserve these boundaries:

- Pattern signals do not create authority.
- Interpretation is provisional.
- Recurrence is not proof.
- Machine interpretation is not authorization.
- Pattern promotion does not authorize action.
- Consequence class determines routing weight.
- Class 3+ action must route to the appropriate RIO/MUSS governance path.
- Policy review metadata may increase governance weight only.
- Receipt handoff is metadata only until the receipt layer produces proof.

## Integration Path

Implementation should proceed in this order:

1. ~~Add a gateway-side SPG-M intake route or middleware in non-executing mode.~~ Complete.
2. ~~Produce SPG-M gate results as structured context.~~ Complete.
3. ~~Route consequential outputs into existing RIO policy review as conservative context.~~ Initial pure bridge complete.
4. Generate receipt-compatible SPG-M events through the receipt layer.
5. Keep pattern storage separate from the ledger unless a receipt event is produced.

## Verification

From `gateway/`:

```bash
npm run test:spgm
```

Manual examples and expected responses are documented in:

```text
gateway/spgm/VERIFY_INTAKE.md
```

## Summary

SPG-M is present as a non-executing pre-policy pattern-governance intake surface, with a conservative RIO policy-engine bridge. It may classify and contain ambiguous signals, and it may increase review requirements. It cannot approve, execute, create receipts, write ledger entries, create memory, or create authority. Execution remains governed by the existing RIO pipeline and proven through receipts.
