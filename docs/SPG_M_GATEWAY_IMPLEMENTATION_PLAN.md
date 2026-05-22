# SPG-M Gateway Implementation Plan

## Status

Draft implementation plan. No runtime code is introduced by this document.

## Goal

Introduce SPG-M into the gateway as a non-executing pre-policy intake layer for ambiguous pattern signals.

The implementation must preserve the current runtime boundary:

```text
Signal → Proposal → Policy → Authorization → Execution Gate → Execute → Receipt → Ledger
```

SPG-M must not become a parallel execution path.

## Phase 1 — Non-Executing Intake

Add a route or middleware that accepts SPG-M intake packets and returns a structured non-executing result.

Requirements:

- no connector dispatch,
- no authorization token issuance,
- no direct ledger write,
- no execution path,
- no persistent memory by default.

Expected output:

- consequence class,
- gate status,
- containment/refusal/routing status,
- next-step marker.

## Phase 2 — Schema Validation

Add validation for:

- signal packet,
- proposed use packet,
- machine-assistance packet,
- output packet.

Validation should fail closed. Invalid SPG-M packets should return a non-executing hold/refusal response.

## Phase 3 — Classifier Stub

Add a simple consequence classifier:

- Class 0–1: private/non-executing,
- Class 2: low-impact proposal context only,
- Class 3+: route to RIO/MUSS markers,
- Class 5: full governance marker.

Symbolic intensity must not determine consequence class. Actual or potential impact determines consequence class.

## Phase 4 — Routing Markers

SPG-M may mark:

- `rio_required`,
- `muss_required`,
- `receipt_event_recommended`,
- `containment_required`,
- `refusal_required`.

SPG-M may not perform the routed action itself.

## Phase 5 — Receipt Event Handoff

Only after Phases 1–4 are explicit, add a handoff to the receipt layer for SPG-M events that need proof.

The receipt-compatible profile already exists in `rio-receipt-protocol`.

## Non-Goals

The initial gateway integration must not:

- execute actions,
- approve actions,
- issue tokens,
- update memory,
- write ledger entries directly,
- treat SPG-M output as policy authority,
- change existing gateway execution behavior.

## Acceptance Criteria

A future implementation is acceptable only if:

1. existing gateway tests still pass,
2. SPG-M intake is non-executing,
3. Class 3+ outputs cannot execute without existing RIO flow,
4. SPG-M output is context/routing metadata only,
5. receipt integration uses the existing proof layer.

## Summary

SPG-M gateway implementation should start as a constrained intake and routing layer. It should become useful before it becomes powerful, and it must never become an alternate authority path.
