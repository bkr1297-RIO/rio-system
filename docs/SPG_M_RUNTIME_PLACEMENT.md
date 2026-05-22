# SPG-M Runtime Placement

## Status

Draft placement note for the ONE/RIO/MUSS system.

SPG-M is not added here as an active runtime component. This note defines where SPG-M belongs when implemented and how it relates to the current RIO gateway, pattern corpus, and receipt layer.

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
  → SPG-M Pattern Governance
      → Signal capture
      → Fact / interpretation separation
      → Consequence classification
      → Governance gates
      → Containment / refusal / routing
  → RIO Proposal / Policy / Authorization
  → Execution Gate
  → Receipt + Ledger
```

## Relationship to Existing Components

| Component | SPG-M Relationship |
|---|---|
| Gateway | SPG-M may prepare or block pattern-derived inputs before they become gateway intents. |
| Governor / Policy | SPG-M may provide consequence classification and gate results as context. It does not decide policy outcome. |
| Execution Gate | SPG-M does not execute actions and does not bypass the gate. |
| Receipt System | SPG-M outcomes can be expressed as receipt-compatible events in `rio-receipt-protocol`. |
| Pattern Corpus | SPG-M aligns with non-authoritative pattern handling. Patterns may orient attention but do not decide. |
| Ledger | SPG-M does not write ledger entries directly in this repo. Receipt-compatible events are proved by the receipt layer. |

## Runtime Status

| SPG-M Element | Status in `rio-system` |
|---|---|
| Doctrine | External/conceptual kernel exists |
| Receipt-compatible profile | Implemented in `rio-receipt-protocol` |
| Gateway integration | Not implemented |
| Active policy evaluation | Not implemented |
| Pattern memory integration | Not implemented |
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

## Integration Path

A future implementation should proceed in this order:

1. Add a gateway-side SPG-M intake route or middleware in non-executing mode.
2. Produce SPG-M gate results as structured context.
3. Route consequential outputs into existing RIO policy and authorization flow.
4. Generate receipt-compatible SPG-M events through the receipt layer.
5. Keep pattern storage separate from the ledger unless a receipt event is produced.

## Summary

SPG-M is a pre-execution pattern-governance layer. It may classify and contain ambiguous signals, but it cannot approve, execute, or create authority. Execution remains governed by the existing RIO pipeline and proven through receipts.
