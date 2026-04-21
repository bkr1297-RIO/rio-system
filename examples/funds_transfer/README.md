# Funds Transfer — End-to-End Example

This example demonstrates the execution boundary. It shows what executes and what is blocked.

> **Note:** This example simulates a funds transfer. No real money is moved. This demonstrates the execution boundary only.

> Nothing moves unless it is explicitly authorized and within limits.

---

## Scenario

A system attempts to transfer funds.

The system ensures:

- execution stays within approved limits
- no unauthorized amount changes
- no replay of transactions
- all actions are recorded and provable

---

## Run

```bash
node enforcement-core/test_harness.mjs --case=funds
```

---

## What Happens

### Valid Case

Input:

```json
{
  "operation": "transfer_funds",
  "amount": 500,
  "to": "vendor_001"
}
```

Result:

- Decision: EXECUTED
- Adapter called: YES
- Receipt generated
- Ledger updated

---

### Invalid Cases

**Exceeds Limit**

Result:
DENIED — SCOPE_VIOLATION
Adapter called: NO

---

**Missing Token**

Result:
DENIED — MISSING_TOKEN
Adapter called: NO

---

**Replay Attempt**

Result:
DENIED — TOKEN_USED
Adapter called: NO

---

## What This Proves

- Execution stays within authorized limits
- No unauthorized financial actions occur
- Replay is prevented
- All outcomes are recorded

---

## One Line

Nothing moves unless it is explicitly authorized and within limits.
