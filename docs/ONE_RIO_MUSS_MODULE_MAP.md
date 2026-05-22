# ONE/RIO/MUSS Module Map

## Status

Draft module map for current and planned ONE/RIO/MUSS components.

This document is a placement aid. It does not create new runtime authority or claim that planned components are currently active.

## Core Layers

| Layer | Role | Runtime Status |
|---|---|---|
| ONE | Operating environment for human-led, machine-operated work | Not deployed in this repo |
| RIO | Consequence and admissibility governance for execution | Partially implemented through gateway runtime |
| MUSS | Sovereignty, consent, scope, memory, and proof boundaries | Partially represented through authorization and receipt flows |
| MUS | Machine/operator layer under human sovereignty | Not a sovereign runtime actor |
| SPG-M | Pattern Governance layer for ambiguous signals | Placement defined; active gateway integration not implemented |

## Current RIO Runtime

The current runtime map remains authoritative for what is running:

```text
Signal → Proposal → Policy → Authorization → Execution Gate → Execute → Receipt → Ledger
```

SPG-M is not a parallel execution path. It is a proposed pre-execution pattern-governance layer that can prepare, contain, or route pattern-derived signals before they affect runtime decisions.

## Module Relationships

| Module | Function | Must Not Do | Proof / Audit Link |
|---|---|---|---|
| Gateway | Receives intents and routes execution flow | Cannot bypass policy or authorization | Runtime logs + receipts |
| Governor / Policy | Classifies risk and approval needs | Cannot execute | Policy result + receipt path |
| Execution Gate | Enforces authorization and dispatches action | Cannot approve | Receipt + ledger |
| Receipt System | Proves governed events | Cannot decide wisdom or authority | Cryptographic receipt |
| Ledger | Stores hash-linked receipt entries | Cannot interpret meaning | Chain verification |
| Pattern Corpus | Provides non-authoritative pattern context | Cannot decide or execute | Pattern validation records |
| SPG-M | Governs ambiguous pattern signals before consequence | Cannot approve, execute, or create authority | Receipt-compatible outcomes through `rio-receipt-protocol` |

## SPG-M Placement

SPG-M sits between raw signal and consequential proposal formation:

```text
Raw signal / human context
  → SPG-M pattern governance
  → possible proposal context or containment
  → RIO policy / authorization / execution boundary
```

SPG-M may produce:

- signal capture,
- fact/interpretation separation,
- consequence class,
- gate status,
- containment/refusal status,
- routing recommendation,
- receipt-compatible metadata.

SPG-M may not produce:

- execution authorization,
- direct action,
- persistent memory without scope/consent governance,
- identity or destiny claims,
- proof that a pattern is true.

## Receipt Boundary

SPG-M receipt-compatible outcomes are implemented in `rio-receipt-protocol` as an additive profile adapter.

Current mapping:

- Proceed may map to `ALLOW` only when existing receipt checks pass.
- Hold, contain, refuse, escalate, and fail map to `BLOCK`.
- SPG-M details are metadata/check context, not authority.

## Development Path

1. Keep receipt proof in `rio-receipt-protocol`.
2. Keep active execution control in the RIO gateway.
3. Treat SPG-M as pre-execution pattern governance.
4. Add SPG-M runtime only after intake, routing, and receipt boundaries are explicit.
5. Preserve one execution boundary and one authority chain.

## Summary

ONE/RIO/MUSS separates environment, consequence governance, sovereignty boundaries, and machine operation. SPG-M adds a pattern-governance layer for ambiguous signals, but it remains non-sovereign and non-executing unless routed through the existing RIO pipeline.
