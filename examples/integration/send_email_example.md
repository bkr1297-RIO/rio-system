# Example — Send Email with RIO

## Intent

```json
{
  "action": "send_email",
  "target": "user@example.com",
  "parameters": {
    "subject": "Hello",
    "body": "Test message"
  }
}
```

## Approval

The system presents the intent to the human for explicit approval.

No execution occurs without approval.

## Validation

Before execution, the system verifies:

- the action matches the approved intent
- the parameters have not been modified
- the execution token is valid

## Execution

The system sends the email exactly as approved.

No modification is permitted during execution.

## Receipt

After execution, a cryptographic receipt is generated:

```json
{
  "receipt_id": "abc-123",
  "action": "send_email",
  "target": "user@example.com",
  "status": "executed",
  "timestamp": "2026-04-23T12:00:00Z",
  "hash": "sha256:..."
}
```

## Verification

The receipt can be independently verified:

- hash integrity
- chain continuity
- tamper detection

## Summary

```text
intent → approval → validation → execution → receipt → verification
```

This is the minimal pattern.

Every step is explicit.
Every step is recorded.
Every step is verifiable.
