# SPG-M Policy Context Bridge

## Status

Bridge specification for using SPG-M intake output as non-authoritative context in RIO policy review.

This document defines allowed and prohibited uses. It does not implement a policy integration and does not change runtime execution behavior.

## Purpose

SPG-M produces `policy_context` metadata from pattern-governance intake.

RIO may use this metadata to understand consequence, routing, containment, and proof needs.

RIO must not treat SPG-M metadata as approval, denial, proof of truth, or execution authority.

## Runtime Position

```text
Signal
  → SPG-M Intake
  → SPG-M policy_context
  → RIO Policy Review
  → Authorization
  → Execution Gate
  → Receipt
  → Ledger
```

SPG-M sits before RIO policy review.

It prepares context but does not decide policy outcome.

## Allowed RIO Uses

RIO may read SPG-M policy context to identify:

- consequence class,
- whether another person may be affected,
- whether consent or scope may be implicated,
- whether RIO review is required,
- whether MUSS review is required,
- whether receipt-compatible proof may be needed,
- whether containment, refusal, or routing occurred,
- whether machine assistance was used,
- whether fact/symbol separation passed.

## Prohibited RIO Uses

RIO must not treat SPG-M policy context as:

- human approval,
- human denial,
- execution permission,
- proof of symbolic truth,
- proof about another person,
- memory permission,
- ledger event,
- receipt generation,
- policy override,
- replacement for RIO governance,
- replacement for MUSS governance.

## Admissible Fields

| Field | Use |
|---|---|
| `context_type` | Identify context packet |
| `mode` | Confirm non-executing status |
| `spgm.consequence_class` | Inform risk/routing review |
| `routing.rio_required` | Flag RIO review need |
| `routing.muss_required` | Flag MUSS review need |
| `boundary_flags` | Confirm constraints |
| `policy_use` | Enforce non-authority |
| `receipt_handoff_present` | Flag proof need |

## Required Boundary Checks

Any future RIO consumer of SPG-M context must verify:

- `mode` is `non_executing`,
- `policy_use.may_create_authorization` is `false`,
- `policy_use.may_create_execution` is `false`,
- `policy_use.may_write_ledger` is `false`,
- `policy_use.may_create_memory` is `false`,
- `boundary_flags.signal_not_command` is true,
- `boundary_flags.interpretation_provisional` is true.

If these checks fail, the SPG-M context must be rejected or treated as containment-only.

## Bridge Rule

SPG-M may increase governance attention.

SPG-M may not decrease governance requirements.

Example:

- SPG-M Class 3 may trigger RIO/MUSS review.
- SPG-M may not downgrade a Class 4 material decision.
- SPG-M may not convert symbolic meaning into authorization.

## Summary

SPG-M policy context is admissible as RIO review input only.

It may influence routing.

It may not create authority.
