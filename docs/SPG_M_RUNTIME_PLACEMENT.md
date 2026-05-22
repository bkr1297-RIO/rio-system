# SPG-M Runtime Placement

## Status

Runtime placement note for the ONE/RIO/MUSS system.

SPG-M now has a non-executing gateway intake stub in `rio-system`.

The implemented gateway surface is:

```text
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
  → RIO Proposal / Policy / Authorization
  → Execution Gate
  → Receipt + Ledger
```

## Relationship to Existing Components

| Component | SPG-M Relationship |
|---|---|
| Gateway | SPG-M has a non-executing intake route at `POST /spgm/intake`. |
| Governor / Policy | SPG-M may provide consequence classification and gate results as context. It does not decide policy outcome. |
| Execution Gate | SPG-M does not execute actions and does not bypass the gate. |
| Receipt System | SPG-M intake may recommend receipt-compatible proof through `receipt_event` and `receipt_handoff` metadata. It does not create receipts. |
| Pattern Corpus | SPG-M aligns with non-authoritative pattern handling. Patterns may orient attention but do not decide. |
| Ledger | SPG-M does not write ledger entries directly in this repo. Receipt-compatible events are proved by the receipt layer. |

## Runtime Status

| SPG-M Element | Status in `rio-system` |
|---|---|
| Doctrine | External/conceptual kernel exists |
| Receipt-compatible profile | Implemented in `rio-receipt-protocol` |
| Gateway intake | Implemented, non-executing |
| Intake schema validation | Implemented, fail-closed |
| Consequence classification | Implemented, lightweight |
| Gate status markers | Implemented |
| Receipt-event recommendation | Implemented as metadata only |
| Receipt handoff packet | Implemented as metadata only |
| Active policy evaluation | Not implemented |
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
- Receipt handoff is metadata only until the receipt layer produces proof.

## Integration Path

Implementation should proceed in this order:

1. ~~Add a gateway-side SPG-M intake route or middleware in non-executing mode.~~ Complete.
2. ~~Produce SPG-M gate results as structured context.~~ Complete.
3. Route consequential outputs into existing RIO policy and authorization flow.
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

SPG-M is now present as a non-executing pre-policy pattern-governance intake surface. It may classify and contain ambiguous signals, but it cannot approve, execute, create receipts, write ledger entries, or create authority. Execution remains governed by the existing RIO pipeline and proven through receipts.
