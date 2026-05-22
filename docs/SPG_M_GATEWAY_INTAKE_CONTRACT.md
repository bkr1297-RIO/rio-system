# SPG-M Gateway Intake Contract

## Status

Draft contract for future gateway integration.

This document does not implement an endpoint. It defines the shape and boundaries for a future SPG-M intake path in the RIO gateway.

## Purpose

SPG-M intake receives ambiguous, high-context human signals before they become gateway intents, memory updates, routing requests, or execution proposals.

The contract preserves the current RIO execution pipeline:

```text
Signal → Proposal → Policy → Authorization → Execution Gate → Execute → Receipt → Ledger
```

SPG-M is a pre-execution governance layer. It may prepare or contain signal-derived material, but it may not approve or execute actions.

## Proposed Endpoint

A future gateway implementation may expose:

```text
POST /spgm/intake
```

This endpoint should be non-executing. It should not dispatch connectors, issue authorization tokens, or write ledger entries directly.

## Input Packet

```json
{
  "signal": {
    "literal_description": "Human-provided signal or pattern description",
    "signal_type": "symbolic|pattern|relational|contextual|other",
    "source_context": "Human-provided context"
  },
  "proposed_use": {
    "use_type": "reflect|classify|route|propose|memory|unknown",
    "proposed_action": null,
    "affected_parties": []
  },
  "machine_assistance": {
    "used": false,
    "role": null
  }
}
```

## Output Packet

```json
{
  "spgm_result": {
    "status": "record|hold|contain|route|refuse",
    "consequence_class": 0,
    "fact_symbol_separated": true,
    "interpretation_provisional": true,
    "signal_not_command": true,
    "machine_boundary_preserved": true
  },
  "routing": {
    "rio_required": false,
    "muss_required": false,
    "reason": null
  },
  "next_step": "private_reflection|policy_review|authorization_flow|containment|receipt_event"
}
```

## Consequence Classes

| Class | Meaning | Gateway handling |
|---|---|---|
| 0 | Private observation | Record or return context only |
| 1 | Private integration | Non-executing response only |
| 2 | Low-impact personal action | May prepare proposal context, no execution |
| 3 | Relational action | Route to RIO/MUSS before any action |
| 4 | Material action | Route to RIO before any action |
| 5 | System/institutional/automated action | Full RIO/MUSS governance required |

## Required Boundaries

The gateway must treat SPG-M output as context, not authority.

SPG-M intake must not:

- issue authorization tokens,
- execute connectors,
- write ledger entries directly,
- treat interpretation as fact,
- treat recurrence as proof,
- treat machine output as authority,
- bypass RIO/MUSS routing.

## Receipt Path

If an SPG-M event needs proof, the gateway should route to the receipt layer through existing receipt mechanisms. SPG-M receipt-compatible profile support lives in `rio-receipt-protocol`.

## Integration Path

Recommended implementation order:

1. Add non-executing intake handler.
2. Add schema validation for input and output packets.
3. Add consequence classifier stub.
4. Add containment/refusal response shape.
5. Add RIO/MUSS routing markers.
6. Add receipt event handoff only after routing boundaries are explicit.

## Summary

SPG-M gateway intake should receive and classify ambiguous signal data without granting authority. It prepares or contains context before the existing RIO pipeline handles consequence, authorization, execution, and proof.
