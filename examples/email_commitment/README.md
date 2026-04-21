# Email Commitment — End-to-End Example

This example demonstrates the execution boundary. It shows what executes and what is blocked.

> **Note:** This example simulates sending an email. No real email is sent. This demonstrates the execution boundary only.

> What you approve is exactly what happens—and nothing else.

---

## Scenario

A system attempts to send an email that creates a commitment.

The system ensures:

- explicit approval is required
- execution matches exactly what was approved
- no mutation or bypass is possible
- every outcome is recorded

---

## Run

```bash
node enforcement-core/test_harness.mjs --case=email
```

---

## What Happens

### Valid Case

Input:

```json
{
  "operation": "send_email",
  "to": "user@example.com",
  "body": "We guarantee delivery by Friday"
}
```

Result:

- Decision: EXECUTED
- Adapter called: YES
- Receipt generated
- Ledger updated

---

### Invalid Cases

**No Token**

Result:
DENIED — MISSING_TOKEN
Adapter called: NO

---

**Payload Drift**

If payload changes after approval:

Result:
DENIED — ACT_BINDING_MISMATCH
Adapter called: NO

---

**Replay Attempt**

Result:
DENIED — TOKEN_USED
Adapter called: NO

---

## What This Proves

- No execution without authorization
- No drift after approval
- No replay
- No hidden execution paths
- All outcomes are recorded and verifiable

---

## One Line

What you approve is exactly what happens—and nothing else.
