# RIO Intent Template Specification

**Version:** 0.1
**Status:** Active
**Extracted from:** Master Seed v1.1, live system (rio-proxy)

---

## Overview

An **intent** is the atomic unit of governed action in the RIO system. Every side effect — sending an email, writing a file, calling an API — begins as an intent that must be proposed, approved, and executed through the governed pipeline.

---

## Intent Fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `intent_id` | UUID | Yes | Unique identifier for this intent |
| `tool_name` | string | Yes | The action to be performed (e.g., `send_email`, `drive_operation`) |
| `tool_args` | object | Yes | Arguments for the action — frozen at proposal time |
| `proposer_id` | string | Yes | Principal who proposed the intent |
| `risk_level` | enum | Yes | `low`, `medium`, `high`, `critical` |
| `justification` | string | No | Human-readable reason for the action |
| `status` | enum | Yes | Current lifecycle state (see below) |
| `created_at` | ISO8601 | Yes | Timestamp of proposal |
| `approved_at` | ISO8601 | No | Timestamp of approval |
| `executed_at` | ISO8601 | No | Timestamp of execution |
| `approval_id` | string | No | Reference to the approval record |
| `authorization_token_id` | string | No | Token issued upon approval |
| `receipt_id` | string | No | Receipt generated after execution |

---

## Intent Lifecycle

```
pending_approval → approved → executed
                 → denied
                 → expired
```

1. **pending_approval** — Intent has been proposed, awaiting human approval
2. **approved** — Intent approved, authorization token issued
3. **executed** — Intent executed through Gate → Adapter, receipt generated
4. **denied** — Gate rejected execution (token invalid, expired, mutated, etc.)
5. **expired** — Authorization token TTL exceeded before execution

---

## Invariants

1. `tool_args` are frozen at proposal time. Any mutation after approval causes `TOKEN_HASH_MISMATCH` at the Gate.
2. The `args_hash` in the authorization token is computed from `canonical_json({"action": tool_name, "args": tool_args})`.
3. The proposer cannot approve their own intent (separation of duties).
4. Each intent produces at most one receipt (single-use token enforcement).

---

## Example

```json
{
  "intent_id": "dd579d82-fdd2-4da7-b3e1-a1b2c3d4e5f6",
  "tool_name": "send_email",
  "tool_args": {
    "to": "rasmussenbr@hotmail.com",
    "subject": "Test",
    "body": "The Master RIO Spec is complete"
  },
  "proposer_id": "manus-agent-001",
  "risk_level": "medium",
  "justification": "Notify owner of spec completion",
  "status": "executed",
  "created_at": "2026-04-19T08:27:00.000Z",
  "approved_at": "2026-04-19T08:27:30.000Z",
  "executed_at": "2026-04-19T08:28:01.000Z",
  "receipt_id": "RCPT-a1b2c3d4e5f6g7h8"
}
```
