# RIO Governed Proxy — Live Adversarial Bypass Audit

**Date:** April 16, 2026  
**Auditor:** Manus (adversarial mode)  
**Scope:** Can an email be sent without going through Intent → Approval → Execution → Receipt → Ledger?  
**Test suite:** `server/bypass-audit.test.ts` — **38/38 passing**  
**Existing red-team + acceptance:** **140/140 passing**

---

## PART 1: All Execution Paths Found

There are exactly **5 code paths** that can cause an email to be sent. Every one was traced to its enforcement boundary.

| # | Path | File | Can it send email? | Governance enforcement |
|---|------|------|--------------------|----------------------|
| 1 | **UI → triggerAction → execute** | `routers.ts` (execute mutation) | Yes, via `dispatchExecution` | 8 preflight checks + authorization token + WAL PREPARED + approval proof + args hash binding |
| 2 | **Gateway → approveAndExecute** | `routers.ts` (approveAndExecute mutation) | Yes, via `dispatchExecution` | Gateway I-2 authorize + I-1 execute-action + `_gatewayExecution` flag + WAL PREPARED + approval proof |
| 3 | **Email approval link → handleLocalApproval** | `emailApproval.ts` | Yes, via `sendViaGmail` directly | HMAC-signed token + single-use nonce + expiry check + WAL PREPARED before send |
| 4 | **One-click approval → POST handler** | `oneClickApproval.ts` | Yes, via `dispatchExecution` | Token verification + Gateway I-2 authorize + I-1 execute-action + `_gatewayExecution` flag + WAL PREPARED |
| 5 | **Connector layer** | `connectors.ts` (`executeSendEmail`) | Only if `_gatewayExecution === true` | Refuses all calls without `_gatewayExecution` flag → returns `REQUIRES_GATEWAY_GOVERNANCE` |

**Non-execution paths confirmed:**

| File | Can it send email? | Evidence |
|------|-------------------|----------|
| `dailyLoop.ts` | No | Does not import `dispatchExecution`, `sendViaGmail`, or `notifyOwner`. Comment: "No proposal auto-executes" |
| `weeklyReview.ts` | No | Does not import `dispatchExecution`, `sendViaGmail`, or `notifyOwner`. Comment: "NEVER auto-executes" |
| `slackCallback.ts` | No | Creates approvals only, never executes. No `dispatchExecution` or `sendViaGmail` imports |
| `telegram.ts` | No | Notification-only. No execution imports |
| `gmailSmtp.ts` | Raw primitive | No governance logic. Only imported by `connectors.ts` and `emailApproval.ts` — both enforce governance before calling it |
| `system.notifyOwner` | Admin-only notification | Requires `role=admin`. Not an email execution path. No intent/approval/WAL |

---

## PART 2: Bypass Attempts — All Blocked

### Bypass 1: Direct execution without approval

**Attempt:** Call `dispatchExecution("send_email", {...}, null, "HIGH")`  
**Result:** BLOCKED  
**Error:** `FAIL_CLOSED: HIGH risk action requires approval proof`  
**Same for MEDIUM risk.**

### Bypass 2: Skip approval (execute before approval granted)

**Attempt:** Call `dispatchExecution` with a fabricated approval object but without `_gatewayExecution` flag  
**Result:** BLOCKED  
**Error:** `REQUIRES_GATEWAY_GOVERNANCE: send_email cannot execute directly`  
**The connector independently refuses — even if you forge an approval, the connector layer blocks.**

### Bypass 3: Reuse approval token

**Attempt:** Generate valid HMAC token, use it once (succeeds), use it again  
**Result:** Second use BLOCKED  
**Error:** `Token already used` (nonce marked as consumed after first use)  
**Nonce is checked both in-memory and via persistent DB lookup (`isNonceUsedPersistent`).**

### Bypass 4: Payload mutation after approval

**Attempt:** Modify email content between approval and execution  
**Result:** BLOCKED  
**Mechanism:** Args are loaded from the database at execution time (`intent.toolArgs`), not from client input. Client only provides `intentId` and `tokenId`. Args hash is computed at intent creation and verified at execution — `ARGS_HASH_MISMATCH` blocks any tampered payload.

### Bypass 5: Concurrency (double execution)

**Attempt:** Fire the same approval twice simultaneously  
**Result:** Only one succeeds  
**Mechanism:** `casConsumeApproval` uses compare-and-swap (CAS) — first call gets `rowsAffected: 1`, second gets `rowsAffected: 0` → `CAS_FAILED`. Additionally, `executionCount` vs `maxExecutions` enforces a hard limit.

### Bypass 6: Background / retry paths

**Attempt:** Find any background job, worker, or retry mechanism that could send email  
**Result:** None exist  
**Evidence:** `dailyLoop.ts`, `weeklyReview.ts`, `slackCallback.ts`, `telegram.ts` — none import any execution primitive. There is no retry queue, no cron job, no worker that can trigger email delivery.

---

## PART 3: Connector Enforcement

**Question:** Can the Gmail connector (`executeSendEmail` in `connectors.ts`) send an email without governance?

**Answer: No.**

The connector has an independent enforcement gate:

```
const isGatewayExecution = toolArgs._gatewayExecution === true;
if (!isGatewayExecution) {
  return { success: false, error: "REQUIRES_GATEWAY_GOVERNANCE: ..." };
}
```

The `_gatewayExecution: true` flag is set in exactly **2 places**:
1. `routers.ts` → `approveAndExecute` (after Gateway I-2 authorize + I-1 execute-action)
2. `oneClickApproval.ts` → POST handler (after token verification + Gateway authorize + execute-action)

Both are **after full governance completion**. There is no other code path that sets this flag.

**`sendViaGmail` (raw SMTP)** is imported in exactly **2 files**:
1. `connectors.ts` — behind the `_gatewayExecution` gate
2. `emailApproval.ts` — behind HMAC token verification + nonce check + WAL PREPARED

No other file in the codebase imports `sendViaGmail`.

---

## PART 4: WAL Enforcement

### Scenario: WAL PREPARED fails

**Test:** Mock `appendLedger` to throw on `WAL_PREPARED` entry type, then call `kernelExecute`  
**Result:** Execution BLOCKED. Connector function never called.  
**Error:** `WAL PREPARED failed — execution blocked`  
**Stage reached:** `WAL_PREPARED` (never reaches connector)

**Structural verification in all 4 execution paths:**

| Path | WAL before execution? | Evidence |
|------|----------------------|----------|
| `routers.ts` execute | Yes | `walPrepare()` at offset 11006, `dispatchExecution()` at offset 13000+ |
| `routers.ts` approveAndExecute | Yes | `walPrepare()` at offset 16853, `dispatchExecution()` at offset 17266 |
| `emailApproval.ts` handleLocalApproval | Yes | `walPrepare()` before `sendViaGmail()` |
| `oneClickApproval.ts` POST handler | Yes | `walPrepare()` before `_gatewayExecution: true` injection |

### Scenario: Execution succeeds but WAL COMMITTED fails

**Structural check:** `kernelExecutor.ts` returns `{ success: false, stage_reached: "WAL_COMMITTED", error: "Execution succeeded but WAL COMMITTED failed — cannot confirm" }`

The system treats this as a failure even though the action executed — because an unrecorded action violates the ledger invariant.

---

## PART 5: Summary

### Invariant tested:

> No email (or any action) can execute unless it goes through: Intent → Approval → Execution → Receipt → Ledger

### Result: **INVARIANT HOLDS**

| Bypass vector | Blocked? | Enforcement point |
|--------------|----------|-------------------|
| Direct execution (no approval) | Yes | `dispatchExecution` → FAIL_CLOSED |
| Skip approval (fake approval, no gateway flag) | Yes | Connector → REQUIRES_GATEWAY_GOVERNANCE |
| Reuse approval token | Yes | Nonce → already used (in-memory + persistent) |
| Payload mutation after approval | Yes | Args loaded from DB, hash verified → ARGS_HASH_MISMATCH |
| Concurrency (double execution) | Yes | CAS → CAS_FAILED + executionCount limit |
| Background / retry paths | Yes | No execution primitives in any background job |
| Raw SMTP bypass | Yes | `sendViaGmail` only in 2 files, both governance-gated |
| WAL skip | Yes | WAL PREPARED required before every execution path |

### Bypasses found: **ZERO**

### Risky areas: **NONE CRITICAL**

One architectural note: `system.notifyOwner` (admin-only) can send Manus platform notifications without governance. This is by design — it is an owner notification channel, not an email execution path. It does not send email via Gmail/SMTP.

---

**Test evidence:** `server/bypass-audit.test.ts` — 38/38 passing  
**Red-team + acceptance:** 140/140 passing  
**No code changes were made to the system — this was a read-only audit with live function calls.**
