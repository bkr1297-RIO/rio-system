# SPG-M Policy Context Bridge

## Purpose

This gateway-local note explains how `policy_context` from `POST /spgm/intake` may be used by future RIO policy integration.

The current gateway does not yet consume SPG-M policy context in active policy evaluation.

## Current Output

`POST /spgm/intake` may return:

- `spgm_result`,
- `routing`,
- `receipt_event`,
- `receipt_handoff`,
- `policy_context`.

`policy_context` is non-executing review metadata.

## Allowed Future Use

A future RIO policy adapter may use `policy_context` to:

- flag review requirements,
- preserve consequence class,
- record SPG-M gate markers,
- surface RIO/MUSS routing needs,
- surface receipt proof recommendations,
- show that machine assistance was used.

## Prohibited Future Use

A future adapter must not use `policy_context` to:

- approve an intent,
- deny an intent by itself,
- issue an execution token,
- execute an action,
- write ledger entries,
- generate receipts,
- create memory,
- treat symbolic interpretation as fact.

## Required Consumer Checks

Before any RIO policy component consumes SPG-M policy context, it must verify:

```text
mode == non_executing
policy_use.may_create_authorization == false
policy_use.may_create_execution == false
policy_use.may_write_ledger == false
policy_use.may_create_memory == false
```

If any check fails, the consumer must reject the context or treat it as containment-only.

## Summary

SPG-M policy context may inform RIO review.

It cannot create RIO authority.
